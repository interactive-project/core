import {copyGeneratedJson} from '@interactive-project/protocol/generation/json';
import {canonicalJson} from '@interactive-project/protocol/interoperability';
export class EffectError extends Error{constructor(code){super('Effect operation rejected.');this.name='EffectError';this.code=code;}}
const error=code=>new EffectError(code);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,namespaced=/^[a-z0-9][a-z0-9.-]*\/[a-z0-9][a-z0-9._-]*$/;
const permissions=['network','execution','media'];
function isolated(value,maxBytes=1048576){const copy=copyGeneratedJson(value,{maxBytes,maxDepth:32,maxCollectionSize:2000,maxStringLength:100000,maxNodes:20000});if(!copy.valid)throw error('effect.nonJson');return copy.value;}
function requestOf(value){
 const r=isolated(value);
 if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!['effectVersion','id','activityId','sessionId','attemptId','generation','revision','type','lane','input'].includes(k))||r.effectVersion!=='1.0.0'||!['id','activityId','sessionId','generation'].every(k=>typeof r[k]==='string'&&uuid.test(r[k]))||(r.attemptId!==undefined&&!uuid.test(r.attemptId))||!Number.isSafeInteger(r.revision)||r.revision<0||typeof r.type!=='string'||r.type.length>128||!namespaced.test(r.type)||typeof r.lane!=='string'||r.lane.length>128||!namespaced.test(r.lane)||!Object.hasOwn(r,'input'))throw error('effect.request');
 return r;
}
export function createEffectCoordinator(options){
 if(!options||!['getCurrent','applyAction','nextActionId','nextActionSequence'].every(k=>typeof options[k]==='function'))throw error('effect.options');
 const timeoutMs=options.timeoutMs??30000,maxRetries=options.maxRetries??0,maxActive=options.maxActive??16,maxRecords=options.maxRecords??32;
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000||!Number.isSafeInteger(maxRetries)||maxRetries<0||maxRetries>3||!Number.isSafeInteger(maxActive)||maxActive<1||maxActive>16||!Number.isSafeInteger(maxRecords)||maxRecords<1||maxRecords>32)throw error('effect.options');
 const policy=isolated(options.policy??{}),services=new Map();
 if(!policy||typeof policy!=='object'||Array.isArray(policy)||Object.entries(policy).some(([k,v])=>!permissions.includes(k)||typeof v!=='boolean'))throw error('effect.options');
 for(const [type,service]of Object.entries(options.services??{})){if(!namespaced.test(type)||!service||typeof service.execute!=='function'||!Array.isArray(service.permissions)||service.permissions.some(p=>!permissions.includes(p)))throw error('effect.options');services.set(type,{execute:service.execute,permissions:[...service.permissions]});}
 const getCurrent=options.getCurrent,applyAction=options.applyAction,nextId=options.nextActionId,nextSequence=options.nextActionSequence,onRecord=options.onRecord;
 const jobs=new Map(),history=[],retained=new Map(),lanes=new Map(),idleWaiters=new Set();let disposed=false;
 function context(){let c;try{c=getCurrent();}catch{throw error('effect.context');}if(!c||!['activityId','sessionId','generation'].every(k=>uuid.test(c[k]))||!Number.isSafeInteger(c.revision)||c.revision<0)throw error('effect.context');return{activityId:c.activityId,sessionId:c.sessionId,attemptId:c.attemptId,generation:c.generation,revision:c.revision};}
 function matches(r){if(disposed)return false;const c=context();return['activityId','sessionId','attemptId','generation','revision'].every(k=>c[k]===r[k]);}
 function report(record){try{const r=onRecord?.(record);if(r&&typeof r.then==='function')Promise.resolve(r).catch(()=>{});}catch{}}
 function notifyIdle(){if(!jobs.size&&history.every(item=>!item.ready))for(const listener of [...idleWaiters])listener();}
 function apply(item){
  if(item.applied||item.ignored)return;
  if(!matches(item.record.request)||lanes.get(item.record.request.lane)!==item.record.request.id){item.ignored=true;item.ready=false;return;}
  try{const result=applyAction(item.record.action);if(result&&typeof result.then==='function'){Promise.resolve(result).catch(()=>{});item.ready=true;return;}item.applied=result?.status==='accepted';item.ready=!item.applied;}catch{item.ready=true;}
 }
 function retain(record){
  const item={record,applied:false,ignored:false,ready:false};history.push(item);retained.set(record.request.id,item);apply(item);report(record);notifyIdle();return{record,applied:item.applied,ignored:item.ignored};
 }
 function reserve(){
  while(history.length+jobs.size>=maxRecords){const index=history.findIndex(item=>!item.ready);if(index<0)throw error('effect.limit');const [old]=history.splice(index,1);retained.delete(old.record.request.id);if(lanes.get(old.record.request.lane)===old.record.request.id)lanes.delete(old.record.request.lane);}
 }
 function submit(input){
  let request;try{if(disposed)throw error('effect.disposed');request=requestOf(input);if(!matches(request))throw error('effect.stale');
   if(jobs.has(request.id)){const job=jobs.get(request.id);if(canonicalJson(job.request)!==canonicalJson(request))throw error('effect.conflict');return job.promise;}
   if(retained.has(request.id)){const item=retained.get(request.id);if(canonicalJson(item.record.request)!==canonicalJson(request))throw error('effect.conflict');return Promise.resolve({record:item.record,applied:item.applied,ignored:item.ignored,duplicate:true});}
   if(jobs.size>=maxActive)throw error('effect.limit');reserve();
  }catch(failure){return Promise.reject(failure instanceof EffectError?failure:error('effect.request'));}
  const controller=new AbortController(),job={request,controller,reason:null};jobs.set(request.id,job);
  const prior=lanes.get(request.lane);lanes.set(request.lane,request.id);if(prior&&jobs.has(prior)){const old=jobs.get(prior);old.reason='effect.superseded';old.controller.abort();}
  let timer,abortListener;
  const cancellation=new Promise((_,reject)=>{abortListener=()=>reject(error(job.reason??'effect.cancelled'));controller.signal.addEventListener('abort',abortListener,{once:true});});
  timer=setTimeout(()=>{job.reason='effect.timeout';controller.abort();},timeoutMs);
  const work=Promise.resolve().then(async()=>{
   const service=services.get(request.type);if(!service)throw error('effect.driverMissing');
   if(service.permissions.some(p=>policy[p]!==true))throw error('effect.permission');
   for(let attempt=0;attempt<=maxRetries;attempt++){if(controller.signal.aborted)throw error(job.reason??'effect.cancelled');let output;try{output=await service.execute(request.input,{signal:controller.signal,request,attempt});}catch{if(controller.signal.aborted)throw error(job.reason??'effect.cancelled');if(attempt===maxRetries)throw error('effect.failure');continue;}return isolated(output);}
  });
  job.promise=Promise.race([work,cancellation]).then(output=>finish('completed',output),failure=>finish(failure?.code==='effect.timeout'?'timed-out':['effect.cancelled','effect.superseded','effect.disposed'].includes(failure?.code)?'cancelled':'failed',undefined,failure?.code??'effect.failure'));
  function finish(status,output,code){
   clearTimeout(timer);controller.signal.removeEventListener('abort',abortListener);jobs.delete(request.id);
   if(disposed){notifyIdle();return{disposed:true,applied:false};}
   let actionId,sequence;try{actionId=nextId();sequence=nextSequence();}catch{notifyIdle();throw error('effect.action');}if(!uuid.test(actionId)||!Number.isSafeInteger(sequence)||sequence<0){notifyIdle();throw error('effect.action');}
   const action=isolated({protocolVersion:'1.0.0',actionVersion:'1.0.0',id:actionId,activityId:request.activityId,sessionId:request.sessionId,...(request.attemptId!==undefined?{attemptId:request.attemptId}:{}),sequence,type:'interactive-project/effect.'+(status==='timed-out'?'timeout':status),payload:{effectVersion:'1.0.0',requestId:request.id,effectType:request.type,baseRevision:request.revision,generation:request.generation,status,...(status==='completed'?{output}:{failure:{code}})}},2097152);
   const record=isolated({effectVersion:'1.0.0',request,action},2097152);try{return retain(record);}finally{notifyIdle();}
  }
  return job.promise;
 }
 function flush(){if(disposed)return;for(const item of history)if(item.ready)apply(item);notifyIdle();}
 function cancel(requestId){const job=jobs.get(requestId);if(job){job.reason='effect.cancelled';job.controller.abort();}}
 function pending(){return jobs.size+history.filter(item=>item.ready).length;}
 function waitForIdle({signal,timeoutMs:waitMs=30000}={}){
  if(disposed)return Promise.reject(error('effect.disposed'));
  if(signal?.aborted)return Promise.reject(error('effect.evaluationCancelled'));
  if(!Number.isSafeInteger(waitMs)||waitMs<1||waitMs>60000)return Promise.reject(error('effect.options'));
  if(!pending())return Promise.resolve();
  return new Promise((resolve,reject)=>{
   const cleanup=()=>{clearTimeout(timer);idleWaiters.delete(done);signal?.removeEventListener('abort',abort);};
   const done=()=>{cleanup();disposed?reject(error('effect.disposed')):resolve();};
   const abort=()=>{cleanup();reject(error('effect.evaluationCancelled'));};
   const timer=setTimeout(()=>{cleanup();reject(error('effect.evaluationTimeout'));},waitMs);idleWaiters.add(done);signal?.addEventListener('abort',abort,{once:true});
   if(signal?.aborted)abort();else if(!pending())done();
  });
 }
 function replay(input){
  if(disposed)throw error('effect.disposed');const record=isolated(input,2097152),request=requestOf(record.request),action=record.action;
  if(Object.keys(record).sort().join(',')!=='action,effectVersion,request'||record.effectVersion!=='1.0.0'||!action||action.protocolVersion!=='1.0.0'||action.actionVersion!=='1.0.0'||!uuid.test(action.id)||!Number.isSafeInteger(action.sequence)||action.sequence<0||!['activityId','sessionId','attemptId'].every(k=>action[k]===request[k])||action.payload?.requestId!==request.id||action.payload?.effectType!==request.type||action.payload?.baseRevision!==request.revision||action.payload?.generation!==request.generation||!['completed','failed','cancelled','timed-out'].includes(action.payload.status)||action.type!=='interactive-project/effect.'+(action.payload.status==='timed-out'?'timeout':action.payload.status))throw error('effect.record');
  const payload=action.payload;if(payload.effectVersion!=='1.0.0'||Object.keys(payload).some(k=>!['effectVersion','requestId','effectType','baseRevision','generation','status','output','failure'].includes(k))||(payload.status==='completed'?(!Object.hasOwn(payload,'output')||Object.hasOwn(payload,'failure')):(!payload.failure||Object.keys(payload.failure).join(',')!=='code'||!['effect.driverMissing','effect.permission','effect.failure','effect.timeout','effect.cancelled','effect.superseded','effect.nonJson','effect.disposed'].includes(payload.failure.code)||Object.hasOwn(payload,'output'))))throw error('effect.record');
  if(jobs.has(request.id))throw error('effect.conflict');
  if(retained.has(request.id)){if(canonicalJson(retained.get(request.id).record)!==canonicalJson(record))throw error('effect.conflict');return{applied:false,duplicate:true};}
  if(!matches(request))return{applied:false,ignored:true};
  reserve();lanes.set(request.lane,request.id);return retain(record);
 }
 function dispose(){if(disposed)return;disposed=true;for(const job of jobs.values()){job.reason='effect.disposed';job.controller.abort();}for(const item of history)item.ready=false;history.length=0;retained.clear();lanes.clear();for(const listener of [...idleWaiters])listener();}
 return Object.freeze({submit,cancel,flush,pending,waitForIdle,replay,dispose,getReplayRecords:()=>Object.freeze(history.filter(item=>item.applied).map(item=>item.record))});
}

/** Wait/evaluate is read-only and separately cancellable; it never completes an activity. */
export async function evaluateAfterEffects(options,{signal,timeoutMs=30000}={}){
 if(!options||!options.coordinator||typeof options.getCurrent!=='function'||typeof options.evaluate!=='function'||typeof options.validateResult!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw error('effect.options');
 const capture=()=>{try{const c=options.getCurrent();if(!c||!['activityId','sessionId','generation'].every(k=>uuid.test(c[k]))||!Number.isSafeInteger(c.revision)||c.revision<0)throw error('effect.context');return{activityId:c.activityId,sessionId:c.sessionId,attemptId:c.attemptId,generation:c.generation,revision:c.revision};}catch{throw error('effect.context');}};
 const controller=new AbortController(),target=capture();
 let abortListener;
 const interrupted=new Promise((_,reject)=>{abortListener=()=>reject(error(controller.signal.reason==='timeout'?'effect.evaluationTimeout':'effect.evaluationCancelled'));controller.signal.addEventListener('abort',abortListener,{once:true});});interrupted.catch(()=>{});
 const abort=()=>controller.abort('caller');signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const timer=setTimeout(()=>controller.abort('timeout'),timeoutMs);
 try{
  await Promise.race([options.coordinator.waitForIdle({signal:controller.signal,timeoutMs}),interrupted]);
  const current=capture();if(!['activityId','sessionId','attemptId','generation'].every(k=>current[k]===target[k]))throw error('effect.stale');
  const result=isolated(await Promise.race([Promise.resolve().then(()=>options.evaluate({signal:controller.signal})),interrupted]));
  const latest=capture();if(!['activityId','sessionId','attemptId','generation','revision'].every(k=>latest[k]===current[k]))throw error('effect.stale');
  const validated=options.validateResult(result,{activityId:current.activityId,sessionId:current.sessionId,attemptId:current.attemptId});
  if(validated&&typeof validated.then==='function'){Promise.resolve(validated).catch(()=>{});throw error('effect.evaluationInvalid');}
  if(validated?.valid!==true||result.revision!==current.revision)throw error('effect.evaluationInvalid');
  return result;
 }catch(failure){if(controller.signal.aborted)throw error(controller.signal.reason==='timeout'?'effect.evaluationTimeout':'effect.evaluationCancelled');if(failure instanceof EffectError)throw failure;throw error('effect.evaluationFailure');}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);controller.signal.removeEventListener('abort',abortListener);}
}
