import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {webcrypto} from 'node:crypto';
import {createRegistry} from '@interactive-project/registry';
import {createGenerationCatalog,getGenerationSchema} from '@interactive-project/registry/catalog';
import {validateEngineManifest,validateRendererManifest} from '@interactive-project/registry/validation';
import {validateGeneratedActivity} from '@interactive-project/protocol/generation';
import {validateActivitySpec} from '@interactive-project/protocol/validation';
import {validateAction,validateResult,validateSnapshot} from '@interactive-project/protocol/validation/interoperability';
import {validateEvent} from '@interactive-project/events/validation';
import {toLearnerQuiz} from '@interactive-project/quiz';
import {validateAuthorQuiz,validateLearnerQuiz,validateQuizResponse} from '@interactive-project/quiz/validation';
import {createLocalEvaluator} from '@interactive-project/quiz/evaluation';
import {createQuizEngine} from '@interactive-project/quiz/engine';
import {loadActivity} from '../loading/index.js';

const require=createRequire(import.meta.url);
const quizRoot=dirname(require.resolve('@interactive-project/quiz'));
const readQuizJson=path=>JSON.parse(readFileSync(join(quizRoot,path),'utf8'));
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const validators={activity:validateActivitySpec,learner:validateLearnerQuiz,response:validateQuizResponse,action:validateAction,result:validateResult,snapshot:validateSnapshot,event:validateEvent};
const author=readQuizJson('fixtures/single-choice.valid.json');
const response=readQuizJson('fixtures/single-choice.response.json');
const manifest=readQuizJson('manifests/quiz-practice.v1.json');
const activity={protocolVersion:'1.0.0',id:uuid(1),type:'interactive-project/quiz',activitySchemaVersion:'1.0.0',metadata:{title:'Generated quiz conformance'},config:toLearnerQuiz(author,validateAuthorQuiz)};
const semantics=()=>({valid:true,requirements:{permissions:[],capabilities:['interactive','evaluable']}});
const catalogSchemaId=manifest.entries[0].schemaId;
const localSchema=readQuizJson('schemas/quiz.v1.schema.json');
const registry=createRegistry({validateEngineManifest,validateRendererManifest});
const evaluator=createLocalEvaluator({author,validateAuthor:validateAuthorQuiz,validateResponse:validateQuizResponse});
let factoryCalls=0,rendererDisposals=0,engineNumber=0;
const rendererManifest={manifestVersion:'1.0.0',id:'fixtures/core-headless-dom-host',pluginVersion:'0.1.0',type:activity.type,protocolVersions:['1.0.0'],host:'dom',activitySchemaVersions:['1.0.0'],rendererContractVersion:'1.0.0'};

assert(registry.registerEngine(manifest,{
 createEngine:(spec,context)=>{
  factoryCalls++;
  const instance=++engineNumber,firstId=10000+instance*1000;
  return createQuizEngine({activity:spec,sessionId:context.sessionId,attemptId:context.attemptId,sourceId:uuid(40+instance),validators,clock:()=>1700000000000,nextId:(()=>{let id=firstId;return()=>uuid(id++);})(),evaluate:frame=>evaluator.evaluate(frame)},webcrypto);
 },
 evaluate:session=>session.evaluate()
}).registered);
assert(registry.registerRenderer(rendererManifest,{
 createRenderer:({session,mount})=>({
  update(){mount.textContent=session.getState().phase;},
  dispose(){rendererDisposals++;mount.textContent='disposed';}
 })
}).registered);

const catalogResult=createGenerationCatalog(registry);
assert(catalogResult.valid);
const catalog=catalogResult.catalog;
assert.equal(catalog.entries.length,1);
const rejectedExternalSchema=getGenerationSchema(catalog,catalogSchemaId,id=>{
 assert.equal(id,catalogSchemaId);
 return localSchema;
});
assert(!rejectedExternalSchema.valid,'Registry must not accept a schema containing external references');
assert.equal(rejectedExternalSchema.code,'registry.schemaReference');
assert.equal(localSchema.$id+'#/$defs/learner',catalogSchemaId);

const generationContext={catalog,validateDomainSchema:validateLearnerQuiz,validateDomainSemantics:semantics};
const generated=validateGeneratedActivity(JSON.stringify(activity),generationContext);
assert(generated.valid,JSON.stringify(generated));
assert.equal(generated.entry.schemaId,catalogSchemaId);
assert(!JSON.stringify(generated.activity).includes(JSON.stringify(author.solutions)),'generated learner activity must not expose evaluator solutions');

function options(sessionId,mount){
 return{registry,catalog,generated:true,policy:{},availableDrivers:[],host:'dom',mount,engineContext:{sessionId,attemptId:uuid(3)},validateDomainSchema:validateLearnerQuiz,validateDomainSemantics:semantics};
}
const mount={textContent:''};
let loaded=await loadActivity(generated.activity,options(uuid(2),mount));
assert(loaded.loaded,JSON.stringify(loaded));
assert(loaded.renderer);
assert.equal(factoryCalls,1);
loaded.renderer.update();
assert.equal(mount.textContent,'ready');

const events=[];
loaded.engine.subscribeEvents(event=>{
 assert(validateEvent(event).valid,JSON.stringify(event));
 events.push(event.type);
},{replay:true});
let actionId=50000;
const act=(kind,payload={})=>({protocolVersion:'1.0.0',actionVersion:'1.0.0',id:uuid(actionId++),activityId:activity.id,sessionId:uuid(2),attemptId:loaded.engine.getContext().attemptId,sequence:loaded.engine.getState().actionSequence,type:'interactive-project/quiz.'+kind,payload});
const dispatch=(kind,payload={})=>{
 const result=loaded.engine.dispatch(act(kind,payload));
 assert.equal(result.status,'accepted',JSON.stringify(result));
 loaded.renderer.update();
 return result;
};

dispatch('start');
dispatch('answer',{response});
dispatch('submit');
await loaded.engine.whenEvaluationSettled();
const result=loaded.engine.evaluate();
assert(validateResult(result,{activityId:activity.id,sessionId:uuid(2),attemptId:uuid(3)}).valid);
assert.equal(result.status,'completed');
assert.equal(result.score.value,1);
dispatch('complete');
assert.equal(mount.textContent,'completed');
for(const type of ['interactive-project/activity.created','interactive-project/activity.started','interactive-project/activity.interacted','interactive-project/attempt.started','interactive-project/answer.changed','interactive-project/attempt.submitted','interactive-project/answer.submitted','interactive-project/activity.completed'])assert(events.includes(type),type);
const snapshot=loaded.engine.serialize();
assert(validateSnapshot(snapshot,{activityId:activity.id,activityType:activity.type,activitySchemaVersion:activity.activitySchemaVersion,sessionId:uuid(2),attemptId:uuid(3)}).valid);
const snapshotText=JSON.stringify(snapshot);
assert(!snapshotText.includes(JSON.stringify(author.solutions)));
loaded.dispose();
assert.equal(mount.textContent,'disposed');
assert.equal(rendererDisposals,1);

const restoredMount={textContent:''};
const restored=await loadActivity(generated.activity,options(uuid(2),restoredMount));
assert(restored.loaded,JSON.stringify(restored));
const restoredEvents=[];
restored.engine.subscribeEvents(event=>{
 assert(validateEvent(event).valid,JSON.stringify(event));
 restoredEvents.push(event.type);
},{replay:true});
restored.engine.restore(JSON.parse(snapshotText));
assert.deepEqual(restored.engine.getState(),snapshot.state);
assert.equal(restored.engine.getContext().revision,snapshot.session.revision);
assert(restoredEvents.includes('interactive-project/activity.created'));
assert(restoredEvents.includes('interactive-project/activity.resumed'));
restored.renderer.update();
assert.equal(restoredMount.textContent,'completed');
restored.dispose();
assert.equal(rendererDisposals,2);

const invalid={...generated.activity,config:{...generated.activity.config,questions:[]}};
const invalidGeneration=validateGeneratedActivity(invalid,generationContext);
assert(!invalidGeneration.valid);
const callsBeforeReject=factoryCalls;
const denied=await loadActivity(invalid,options(uuid(2),{textContent:''}));
assert(!denied.loaded);
assert.equal(denied.stage,'structural');
assert.equal(factoryCalls,callsBeforeReject,'invalid learner data must not execute the engine factory');

const blocked=createGenerationCatalog(registry,{allowedCapabilities:['interactive','evaluable','offline','deterministic','resumable']});
assert(blocked.valid);
const blockedActivity=validateGeneratedActivity(generated.activity,{...generationContext,catalog:blocked.catalog});
assert(!blockedActivity.valid);
assert.equal(blockedActivity.diagnostics?.[0]?.code,'generation.capability');
const blockedLoad=await loadActivity(generated.activity,{...options(uuid(2),{textContent:''}),catalog:blocked.catalog});
assert(!blockedLoad.loaded);
assert.equal(blockedLoad.stage,'capability');
assert.equal(factoryCalls,callsBeforeReject,'an unapproved generated capability must not execute the engine factory');

assert.equal(typeof globalThis.window,'undefined');
assert.equal(typeof globalThis.document,'undefined');
const packageJson=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
assert(!Object.keys(packageJson.devDependencies).some(name=>/^(react|vue|svelte|xstate|jsdom|happy-dom)$/.test(name)));
registry.dispose();
console.log('Core vertical slice: Registry catalog → Protocol-generated Quiz using Quiz trusted validation → exact Registry load → DOM host-port update → answer/evaluate/events → snapshot/restore; external schema refs are rejected, and invalid generation/denied capability fail before factory execution. Node remained headless.');
