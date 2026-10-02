import {copyGeneratedJson} from '@interactive-project/protocol/generation/json';
import {activityDigest,canonicalJson} from '@interactive-project/protocol/interoperability';
import {createRuntime} from '../index.js';
export class PersistenceError extends Error{constructor(code){super('Snapshot operation rejected.');this.name='PersistenceError';this.code=code;}}
const fail=code=>new PersistenceError(code);
function copy(v){const r=copyGeneratedJson(v,{maxBytes:2097152,maxDepth:32,maxCollectionSize:2000,maxStringLength:100000,maxNodes:50000});if(!r.valid)throw fail('snapshot.nonJson');return r.value;}
function sync(fn,...args){try{const r=fn(...args);if(r&&typeof r.then==='function'){Promise.resolve(r).catch(()=>{});throw fail('snapshot.async');}return r;}catch(e){if(e instanceof PersistenceError)throw e;throw fail('snapshot.callback');}}
export async function createPersistentRuntime(options,cryptoProvider){
 const activity=copy(options.activity),captured={...options,activity,persistence:{...options.persistence}};
 let digest;try{digest=await activityDigest(activity,cryptoProvider);}catch{throw fail('snapshot.digest');}
 return createRuntime({...captured,persistence:{...captured.persistence,contentDigest:digest}});
}
export function snapshotSignature(input){
 const s=copy(input);if(!s?.activity||!s.engine||!s.session)throw fail('snapshot.envelope');
 return copy({protocolVersion:s.protocolVersion,snapshotVersion:s.snapshotVersion,activitySchemaVersion:s.activity.activitySchemaVersion,contentDigest:s.activity.contentDigest,engineId:s.engine.id,engineStateVersion:s.engine.stateVersion,drivers:Object.fromEntries(Object.entries(s.drivers??{}).map(([id,d])=>[id,{driverVersion:d.driverVersion,stateVersion:d.stateVersion,encoding:d.encoding}]))});
}
/** Explicit bounded pure migrations; no running runtime or live driver is exposed. */
export function migrateSnapshot(input,{migrationIds=[],migrations=[],validateSnapshot,target}){
 if(typeof validateSnapshot!=='function'||!Array.isArray(migrationIds)||migrationIds.length>8||!Array.isArray(migrations)||migrations.length>64)throw fail('snapshot.options');
 const wanted=copy(target),defs=new Map();for(const m of migrations){if(!m||typeof m.id!=='string'||!m.id||defs.has(m.id)||typeof m.migrate!=='function')throw fail('snapshot.options');defs.set(m.id,{from:copy(m.from),to:copy(m.to),migrate:m.migrate});}
 let snapshot=copy(input);if(sync(validateSnapshot,snapshot)?.valid!==true)throw fail('snapshot.envelope');
 const original={activityId:snapshot.activity.id,activityType:snapshot.activity.type,sessionId:snapshot.session.id,attemptId:snapshot.session.attemptId};const seen=new Set();
 for(const id of [...migrationIds]){
  if(seen.has(id))throw fail('snapshot.migration');seen.add(id);const m=defs.get(id);
  if(!m||canonicalJson(snapshotSignature(snapshot))!==canonicalJson(m.from))throw fail('snapshot.migration');
  const candidate=copy(sync(m.migrate,snapshot));
  if(sync(validateSnapshot,candidate,original)?.valid!==true||canonicalJson(snapshotSignature(candidate))!==canonicalJson(m.to)||candidate.session.revision!==snapshot.session.revision)throw fail('snapshot.migration');
  snapshot=candidate;
 }
 if(canonicalJson(snapshotSignature(snapshot))!==canonicalJson(wanted))throw fail('snapshot.incompatible');return snapshot;
}
