import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createPersistentRuntime,migrateSnapshot,snapshotSignature} from '../persistence/index.js';
import {validateActivitySpec} from '@interactive-project/protocol/validation';
import {validateAction,validateResult,validateSnapshot} from '@interactive-project/protocol/validation/interoperability';
import {validateEvent} from '@interactive-project/events/validation';
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const clone=v=>JSON.parse(JSON.stringify(v));
const rejected=(fn)=>assert.throws(fn,e=>e.name==='RuntimeError'||e.name==='PersistenceError');
async function fixture(type='quiz',more={}){
 let event=100,generation=1000,canceled=0;
 const activity={protocolVersion:'1.0.0',id:uuid(1),type:'interactive-project/'+type,activitySchemaVersion:'0.0.1',metadata:{title:'Persistence fixture'},config:{}};
 const options={activity,sessionId:uuid(2),attemptId:uuid(3),sourceId:uuid(4),engineId:'fixtures/'+type,engineStateVersion:'1.0.0',clock:()=>0,random:()=>0.5,nextEventId:()=>uuid(event++),validators:{activity:validateActivitySpec,action:validateAction,result:validateResult,event:validateEvent},ports:{initialState:()=>({answer:null,position:0}),reduce:(_s,a)=>({accepted:true,state:{answer:a.payload.answer,position:a.payload.position}}),evaluate:(_s,c,r)=>({protocolVersion:'1.0.0',resultVersion:'1.0.0',...c.identity,revision:r,status:'completed',evidence:[],score:{value:1,scale:'normalized'}})},persistence:{validateSnapshot,validateState:s=>({valid:s!==null&&typeof s==='object'&&!Array.isArray(s)&&Object.keys(s).sort().join(',')==='answer,position'&&(s.answer===null||typeof s.answer==='string')&&Number.isSafeInteger(s.position)&&s.position>=0}),validateDrivers:d=>({valid:Object.keys(d).length===0}),nextGenerationId:()=>uuid(generation++),cancelEffects:()=>{canceled++}},...more};
 const runtime=await createPersistentRuntime(options,webcrypto);
 return{runtime,options,activity,canceled:()=>canceled,action:sequence=>({protocolVersion:'1.0.0',actionVersion:'1.0.0',id:uuid(300+sequence),activityId:uuid(1),sessionId:uuid(2),attemptId:uuid(3),sequence,type:'fixtures/select',payload:{answer:'A',position:sequence+1}})};
}
for(const type of ['quiz','flashcards']){
 const a=await fixture(type);a.runtime.start();assert.equal(a.runtime.dispatch(a.action(0)).status,'accepted');a.runtime.pause();const s=a.runtime.serialize();assert(validateSnapshot(s).valid);assert(Object.isFrozen(s.state.domain));
 const b=await fixture(type,{sourceId:uuid(9)}),old=b.runtime.getEffectContext().generation;b.runtime.restore(JSON.parse(JSON.stringify(s)));assert.deepEqual(b.runtime.getState(),a.runtime.getState());assert.deepEqual(b.runtime.serialize(),s);assert.notEqual(b.runtime.getEffectContext().generation,old);assert.equal(b.canceled(),1);
 b.runtime.resume();assert.equal(b.runtime.dispatch(b.action(0)).status,'rejected');assert.equal(b.runtime.dispatch(b.action(1)).status,'accepted');b.runtime.complete();const terminal=b.runtime.serialize();const d=await fixture(type);d.runtime.restore(terminal);assert.equal(d.runtime.getState().lifecycle,'completed');assert.deepEqual(d.runtime.evaluate?d.runtime.getState().result:null,b.runtime.getState().result);
 const unchanged=b.runtime.getState(),generation=b.runtime.getEffectContext().generation;
 for(const alter of [s=>s.activity.id=uuid(7),s=>s.activity.contentDigest='0'.repeat(64),s=>s.activity.activitySchemaVersion='2.0.0',s=>s.engine.stateVersion='2.0.0',s=>s.snapshotVersion='2.0.0',s=>s.session.attemptId=uuid(7),s=>s.state.actionSequence=500,s=>s.state.domain.password='secret',s=>s.state.domain.position=-1,s=>s.state.domain.node=()=>{}]){
  const bad=clone(s);alter(bad);rejected(()=>b.runtime.restore(bad));assert.equal(b.runtime.getState(),unchanged);assert.equal(b.runtime.getEffectContext().generation,generation);
 }
 const signal=new AbortController();signal.abort();rejected(()=>b.runtime.restore(s,{signal:signal.signal}));assert.equal(b.runtime.getState(),unchanged);
 a.runtime.dispose();b.runtime.dispose();d.runtime.dispose();rejected(()=>d.runtime.restore(s));
}
{
 const f=await fixture('simulation'),s=f.runtime.serialize(),bad=clone(s);
 bad.drivers={'fixtures.simulation/matter':{driverVersion:'1.0.0',stateVersion:'99.0.0',encoding:'json',data:{bodies:[]}}};rejected(()=>f.runtime.restore(bad));assert.equal(f.runtime.getState().revision,0);f.runtime.dispose();
}
{
 const f=await fixture(),s=f.runtime.serialize(),legacy=clone(s);legacy.engine.stateVersion='0.0.1';legacy.state.domain={selected:null,index:0};
 const from=snapshotSignature(legacy),to=snapshotSignature(s),migration={id:'fixtures/quiz-state-1',from,to,migrate:x=>({...x,engine:{...x.engine,stateVersion:'1.0.0'},state:{...x.state,domain:{answer:x.state.domain.selected,position:x.state.domain.index}}})};
 rejected(()=>migrateSnapshot(legacy,{validateSnapshot,target:to}));
 const migrated=migrateSnapshot(legacy,{validateSnapshot,target:to,migrations:[migration],migrationIds:[migration.id]});f.runtime.restore(migrated);assert.deepEqual(f.runtime.getState().state,s.state.domain);
 rejected(()=>migrateSnapshot(legacy,{validateSnapshot,target:to,migrations:[migration],migrationIds:['unknown']}));
 rejected(()=>migrateSnapshot(legacy,{validateSnapshot,target:to,migrations:[{...migration,migrate:x=>({...migration.migrate(x),session:{...x.session,id:uuid(8)}})}],migrationIds:[migration.id]}));
 rejected(()=>migrateSnapshot(legacy,{validateSnapshot,target:to,migrations:[{...migration,migrate:()=>{throw Error('private credentials')}}],migrationIds:[migration.id]}));f.runtime.dispose();
}
{
 const {createEffectCoordinator}=await import('../effects/index.js');const f=await fixture();f.runtime.start();const saved=f.runtime.serialize();
 let resolve;const output=new Promise(r=>resolve=r);
 const effects=createEffectCoordinator({getCurrent:f.runtime.getEffectContext,applyAction:f.runtime.dispatch,nextActionId:()=>uuid(800),nextActionSequence:()=>f.runtime.getState().revision,services:{'fixtures/run':{permissions:[],execute:()=>output}}});
 const request={effectVersion:'1.0.0',id:uuid(20),...f.runtime.getEffectContext(),type:'fixtures/run',lane:'fixtures/code',input:null};const p=effects.submit(request);await new Promise(r=>setImmediate(r));
 f.runtime.restore(saved);resolve({answer:'late',position:999});assert((await p).ignored);assert.deepEqual(f.runtime.getState().state,saved.state.domain);effects.dispose();f.runtime.dispose();
}
console.log('Persistence: quiz/flashcards, cross-host, atomic rejection, identity/version/digest, explicit migrations, driver rejection and stale effects passed.');
