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

import {loadActivity,type LoadOptions} from '@interactive-project/core/loading';
declare const loadOptions:LoadOptions;
const loaded=await loadActivity({},loadOptions);if(loaded.loaded){loaded.dispose();}else{const stage:string=loaded.stage;void stage;}

import {createEffectCoordinator,type EffectOptions} from '@interactive-project/core/effects';
declare const effectOptions:EffectOptions;
const effects=createEffectCoordinator(effectOptions);const pending:number=effects.pending();void pending;
