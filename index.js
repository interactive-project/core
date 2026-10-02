import {copyGeneratedJson} from '@interactive-project/protocol/generation/json';
import {createEventBus} from '@interactive-project/events/bus';
export class RuntimeError extends Error{constructor(code,path=''){super('Runtime operation rejected.');this.name='RuntimeError';this.code=code;this.path=path;}}
const error=(code,path='')=>new RuntimeError(code,path);
function sync(fn,...args){const value=fn(...args);if(value&&typeof value.then==='function'){Promise.resolve(value).catch(()=>{});throw error('runtime.async');}return value;}
function json(value){const copied=copyGeneratedJson(value,{maxBytes:2097152,maxDepth:32,maxCollectionSize:2000,maxStringLength:100000,maxNodes:50000});if(!copied.valid)throw error('runtime.nonJson');return copied.value;}
const fallbackId='00000000-0000-4000-8000-000000000000';
export function createRuntime(options){
 if(!options||!options.ports||!options.validators||!['clock','random','nextEventId'].every(k=>typeof options[k]==='function')||!['activity','action','result','event'].every(k=>typeof options.validators[k]==='function')||!['initialState','reduce','evaluate'].every(k=>typeof options.ports[k]==='function'))throw error('runtime.options');
 const validators={...options.validators},ports={...options.ports},activity=json(options.activity);
 if(sync(validators.activity,activity)?.valid!==true)throw error('runtime.activity');
 const identity=Object.freeze({activityId:activity.id,sessionId:options.sessionId,attemptId:options.attemptId});
 const clock=options.clock,random=options.random,nextEventId=options.nextEventId,diagnostic=options.onDiagnostic;
 const context=Object.freeze({identity,services:Object.freeze({...options.services}),clock:()=>{const v=clock();if(!Number.isSafeInteger(v)||v<0)throw error('runtime.clock');return v;},random:()=>{const v=random();if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>=1)throw error('runtime.random');return v;}});
 let view=json({lifecycle:'created',revision:0,state:sync(ports.initialState,activity,context)}),busy=false,disposed=false,disposeRequested=false,actionSequence=0,eventSequence=0,reporting=false;
 const listeners=new Set(),outbox=[];
 function report(code){if(reporting||typeof diagnostic!=='function')return;reporting=true;try{const r=diagnostic(Object.freeze({code}));if(r&&typeof r.then==='function')Promise.resolve(r).catch(()=>{});}catch{}finally{reporting=false;}}
 const bus=createEventBus({activityId:activity.id,sessionId:options.sessionId,sourceId:options.sourceId,validate:validators.event,onDiagnostic:d=>report(d.code)});
 function makeEvent(type,payload){
  const event=json({protocolVersion:'1.0.0',eventVersion:'1.0.0',id:nextEventId(),type:'interactive-project/'+type,activityId:activity.id,activityType:activity.type,sessionId:options.sessionId,...(options.attemptId!==undefined?{attemptId:options.attemptId}:{}),sourceId:options.sourceId,sequence:eventSequence,timestamp:context.clock(),payload});
  if(sync(validators.event,event)?.valid!==true)throw error('runtime.event');
  return event;
 }
 function flushEvents(){if(disposed)return;bus.flush();while(outbox.length){const result=bus.publish(outbox[0]);if(!result.accepted){report(result.code);break;}outbox.shift();}bus.flush();}
 function notify(){const snapshot=view;for(const record of [...listeners]){if(!record.active)continue;try{const r=record.listener(snapshot);if(r&&typeof r.then==='function')Promise.resolve(r).catch(()=>report('runtime.observer'));}catch{report('runtime.observer');}}}
 function commit(next,event){
  if(disposed||disposeRequested)throw error('runtime.disposed');
  flushEvents();if(outbox.length)throw error('runtime.eventsBlocked');
  const stats=bus.stats(),bytes=new TextEncoder().encode(JSON.stringify(event)).byteLength;
  if(stats.pending>=128||stats.pendingBytes+bytes>4194304)throw error('runtime.backpressure');
  view=json(next);eventSequence++;outbox.push(event);notify();flushEvents();
 }
 function operation(allowed,signal,fn){
  if(disposed)throw error('runtime.disposed');
  if(busy)throw error('runtime.busy');
  if(!allowed.includes(view.lifecycle))throw error('runtime.lifecycle');
  if(signal?.aborted)throw error('runtime.cancelled');
  busy=true;try{return fn();}finally{busy=false;if(disposeRequested)dispose();}
 }
 function currentResult(signal){
  if(signal?.aborted)throw error('runtime.cancelled');
  const result=json(sync(ports.evaluate,view.state,context,view.revision));
  if(signal?.aborted)throw error('runtime.cancelled');
  if(sync(validators.result,result,identity)?.valid!==true||result.revision!==view.revision)throw error('runtime.result');
  return result;
 }
 function start({signal}={}){return operation(['created'],signal,()=>{const event=makeEvent('activity.started',{revision:view.revision});commit({...view,lifecycle:'active'},event);});}
 function pause({signal}={}){return operation(['active'],signal,()=>{const event=makeEvent('activity.interacted',{actionId:nextEventId(),actionType:'interactive-project/pause',revision:view.revision});commit({...view,lifecycle:'paused'},event);});}
 function resume({signal}={}){return operation(['paused'],signal,()=>{const event=makeEvent('activity.interacted',{actionId:nextEventId(),actionType:'interactive-project/resume',revision:view.revision});commit({...view,lifecycle:'active'},event);});}
 function dispatch(input,{signal}={}){
  const copied=copyGeneratedJson(input,{maxBytes:1048576,maxDepth:32,maxCollectionSize:1000,maxStringLength:4000,maxNodes:10000});
  const action=copied.valid?copied.value:null;
  const reject=(code,path='',message='The action cannot be applied.')=>({status:'rejected',actionId:typeof action?.id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(action.id)?action.id:fallbackId,code,path,message});
  if(disposed)return reject('action.disposed');
  if(busy)return reject('action.busy');
  if(view.lifecycle!=='active')return reject('action.invalid');
  if(!action)return reject('action.invalid');
  if(sync(validators.action,action,identity)?.valid!==true)return reject('action.identity');
  if(action.sequence!==actionSequence)return reject('action.stale','/sequence');
  return operation(['active'],signal,()=>{
   const reduced=sync(ports.reduce,view.state,action,context);
   if(signal?.aborted)throw error('runtime.cancelled');
   if(!reduced||reduced.accepted!==true)return reject('action.invalid');
   const next=json({...view,state:reduced.state,revision:view.revision+1});
   const event=makeEvent('activity.interacted',{actionId:action.id,actionType:action.type,revision:next.revision});
   commit(next,event);actionSequence++;return{status:'accepted',actionId:action.id,revision:next.revision};
  });
 }
 function evaluate({signal}={}){return operation(['active','paused'],signal,()=>currentResult(signal));}
 function complete({signal}={}){return operation(['active'],signal,()=>{
  const result=currentResult(signal);
  if(result.status==='pending')throw error('runtime.pending');
  if(result.status==='failed'){const event=makeEvent('activity.failed',{code:'interactive-project/evaluation-failure',phase:'evaluation',message:'The evaluation failed.'});commit({...view,lifecycle:'failed',result},event);return;}
  const event=makeEvent('activity.completed',{result});commit({...view,lifecycle:'completed',result},event);
 });}
 function fail({code='interactive-project/runtime-failure',phase='dispatch'}={}){return operation(['created','active','paused'],undefined,()=>{const event=makeEvent('activity.failed',{code,phase,message:'The operation failed.'});commit({...view,lifecycle:'failed'},event);});}
 function subscribe(listener){if(disposed)throw error('runtime.disposed');if(typeof listener!=='function'||listeners.size>=128)throw error('runtime.subscription');const record={listener,active:true};listeners.add(record);return()=>{record.active=false;record.listener=null;listeners.delete(record);};}
 function dispose(){
  if(disposed)return;if(busy){disposeRequested=true;return;}disposed=true;disposeRequested=false;view=json({...view,lifecycle:'disposed'});bus.dispose();outbox.length=0;notify();for(const record of listeners){record.active=false;record.listener=null;}listeners.clear();
  try{const r=ports.dispose?.();if(r&&typeof r.then==='function')Promise.resolve(r).catch(()=>report('runtime.cleanup'));}catch{report('runtime.cleanup');}
 }
 const created=makeEvent('activity.created',{engineId:options.engineId,engineStateVersion:options.engineStateVersion});outbox.push(created);eventSequence++;flushEvents();
 return Object.freeze({start,pause,resume,dispatch,evaluate,complete,fail,subscribe,subscribeEvents:bus.subscribe,flushEvents,dispose,getState:()=>view,serialize:()=>{throw error('runtime.snapshotUnavailable');},restore:()=>{throw error('runtime.snapshotUnavailable');}});
}
export function stateMachinePorts({initial,transition,evaluate,dispose}){
 if(typeof initial!=='function'||typeof transition!=='function'||typeof evaluate!=='function')throw error('runtime.options');
 return Object.freeze({initialState:initial,reduce:(state,action,context)=>({accepted:true,state:sync(transition,state,action,context)}),evaluate,dispose});
}
