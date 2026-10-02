import assert from 'node:assert/strict';
import {createEffectCoordinator,evaluateAfterEffects} from '../effects/index.js';
import {validateAction,validateResult} from '@interactive-project/protocol/validation/interoperability';
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(extra={}){
 const context={activityId:uuid(1),sessionId:uuid(2),attemptId:uuid(3),generation:uuid(4),revision:0},actions=[];let id=100,sequence=0;
 const options={getCurrent:()=>context,nextActionId:()=>uuid(id++),nextActionSequence:()=>sequence,applyAction:a=>{assert(validateAction(a,{activityId:context.activityId,sessionId:context.sessionId,attemptId:context.attemptId}).valid);actions.push(a);context.revision++;sequence++;return{status:'accepted',revision:context.revision}},...extra};
 const coordinator=createEffectCoordinator(options);
 const request=(n=10,more={})=>({effectVersion:'1.0.0',id:uuid(n),...context,type:'fixtures/run',lane:'fixtures/code',input:{code:'fixture'},...more});
 return{context,actions,coordinator,request,options};
}
const code=expected=>e=>e.code===expected;
{
 const old=defer(),newer=defer();let calls=0;
 const f=fixture({services:{'fixtures/run':{permissions:[],execute:()=>++calls===1?old.promise:newer.promise}}});
 const a=f.coordinator.submit(f.request());await tick();assert.equal(f.coordinator.submit(f.request()),a);
 const b=f.coordinator.submit(f.request(11));await tick();newer.resolve({stdout:'new'});const rb=await b;old.resolve({stdout:'old'});const ra=await a;
 assert(rb.applied);assert(ra.ignored);assert.equal(f.actions.length,1);assert.equal(f.actions[0].payload.output.stdout,'new');
 assert.equal(f.coordinator.getReplayRecords().length,1);
 await assert.rejects(f.coordinator.submit({...f.request(10),revision:0}),code('effect.stale'));f.coordinator.dispose();
}
{
 const d=defer(),f=fixture({services:{'fixtures/run':{permissions:[],execute:()=>d.promise}}});
 const p=f.coordinator.submit(f.request());await tick();f.context.attemptId=uuid(9);d.resolve(1);assert((await p).ignored);assert.equal(f.actions.length,0);f.coordinator.dispose();
 const e=defer(),g=fixture({services:{'fixtures/run':{permissions:[],execute:()=>e.promise}}});
 const q=g.coordinator.submit(g.request());await tick();g.coordinator.dispose();e.resolve(2);assert((await q).disposed);assert.equal(g.actions.length,0);
}
{
 const f=fixture();const r=await f.coordinator.submit(f.request());assert.equal(r.record.action.payload.status,'failed');assert.equal(r.record.action.payload.failure.code,'effect.driverMissing');f.coordinator.dispose();
 const policy={execution:false};let executed=0;
 const g=fixture({policy,services:{'fixtures/run':{permissions:['execution'],execute:()=>{executed++;return 1}}}});policy.execution=true;
 const denied=await g.coordinator.submit(g.request());assert.equal(denied.record.action.payload.failure.code,'effect.permission');assert.equal(executed,0);g.coordinator.dispose();
}
{
 let attempts=0;const f=fixture({maxRetries:1,services:{'fixtures/run':{permissions:[],execute:()=>{if(++attempts===1)throw Error('private error');return {answer:42}}}}});
 const done=await f.coordinator.submit(f.request());assert(done.applied);assert.equal(attempts,2);assert(!JSON.stringify(done).includes('private'));f.coordinator.dispose();
 const g=fixture({services:{'fixtures/run':{permissions:[],execute:()=>()=>{}}}});assert.equal((await g.coordinator.submit(g.request())).record.action.payload.failure.code,'effect.nonJson');g.coordinator.dispose();
}
{
 const f=fixture({timeoutMs:10,services:{'fixtures/run':{permissions:[],execute:()=>new Promise(()=>{})}}});
 assert.equal((await f.coordinator.submit(f.request())).record.action.payload.status,'timed-out');f.coordinator.dispose();
 const g=fixture({services:{'fixtures/run':{permissions:[],execute:()=>new Promise(()=>{})}}});
 const p=g.coordinator.submit(g.request());g.coordinator.cancel(uuid(10));assert.equal((await p).record.action.payload.status,'cancelled');g.coordinator.dispose();
}
{
 const f=fixture({services:{'fixtures/run':{permissions:[],execute:()=>({answer:4})}}});await f.coordinator.submit(f.request());const records=f.coordinator.getReplayRecords();
 let invoked=0;const g=fixture({services:{'fixtures/run':{permissions:[],execute:()=>{invoked++;return 5}}}});
 assert(g.coordinator.replay(records[0]).applied);assert(g.coordinator.replay(records[0]).duplicate);assert.equal(invoked,0);assert.deepEqual(g.actions,f.actions);
 assert.throws(()=>g.coordinator.replay({...records[0],action:{...records[0].action,payload:{...records[0].action.payload,failure:{code:'secret'}}}}),code('effect.record'));
 f.coordinator.dispose();g.coordinator.dispose();
}
{
 let busy=true;const f=fixture({maxRecords:1,applyAction:()=>busy?{status:'rejected'}:{status:'accepted'}});
 await f.coordinator.submit(f.request());assert.equal(f.coordinator.pending(),1);
 await assert.rejects(f.coordinator.submit(f.request(11)),code('effect.limit'));busy=false;f.coordinator.flush();assert.equal(f.coordinator.pending(),0);f.coordinator.dispose();
}
const result=c=>({protocolVersion:'1.0.0',resultVersion:'1.0.0',activityId:c.activityId,sessionId:c.sessionId,attemptId:c.attemptId,revision:c.revision,status:'completed',evidence:[],score:{value:0,scale:'normalized'}});
{
 const d=defer(),f=fixture({services:{'fixtures/run':{permissions:[],execute:()=>d.promise}}});
 const p=f.coordinator.submit(f.request()),abort=new AbortController();
 const evaluation=evaluateAfterEffects({coordinator:f.coordinator,getCurrent:()=>f.context,evaluate:()=>result(f.context),validateResult},{signal:abort.signal});
 abort.abort();await assert.rejects(evaluation,code('effect.evaluationCancelled'));assert.equal(f.coordinator.pending(),1);
 d.resolve(2);await p;const r=await evaluateAfterEffects({coordinator:f.coordinator,getCurrent:()=>f.context,evaluate:()=>result(f.context),validateResult});assert.equal(r.score.value,0);
 const late=defer();const q=evaluateAfterEffects({coordinator:f.coordinator,getCurrent:()=>f.context,evaluate:()=>late.promise,validateResult});await tick();f.context.revision++;late.resolve(result(f.context));await assert.rejects(q,code('effect.stale'));
 await assert.rejects(evaluateAfterEffects({coordinator:f.coordinator,getCurrent:()=>f.context,evaluate:()=>new Promise(()=>{}),validateResult},{timeoutMs:10}),code('effect.evaluationTimeout'));f.coordinator.dispose();
}
console.log('Effects: correlation, supersession, disposal, permissions, retry, timeout, cancellation, bounded replay and evaluation passed.');
