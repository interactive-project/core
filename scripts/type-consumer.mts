import {createRuntime,type RuntimeOptions,stateMachinePorts} from '@interactive-project/core';
import type {EngineSession} from '@interactive-project/protocol/interoperability';
declare const options:RuntimeOptions;
const runtime=createRuntime(options);const engine:EngineSession=runtime;void engine;
runtime.subscribe(view=>{
 const phase:string=view.lifecycle;void phase;
 // @ts-expect-error State is readonly at every level.
 view.lifecycle='active';
});
const ports=stateMachinePorts({initial:()=>({value:'ready'}),transition:()=>({value:'done'}),evaluate:options.ports.evaluate});void ports;
