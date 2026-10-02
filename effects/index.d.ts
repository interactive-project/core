import type {JsonValue} from '@interactive-project/protocol/types';
import type {Action,DispatchResult,Result,CancellationSignal,MaybePromise} from '@interactive-project/protocol/interoperability';
import type {Permission} from '@interactive-project/protocol/generation';
import type {ReadonlyJsonValue} from '../types/runtime.js';
export interface EffectContext{activityId:string;sessionId:string;attemptId?:string;generation:string;revision:number}
export interface EffectRequest extends EffectContext{effectVersion:'1.0.0';id:string;type:string;lane:string;input:JsonValue}
export interface RecordedEffect{effectVersion:'1.0.0';request:EffectRequest;action:Action}
export interface EffectOutcome{record?:RecordedEffect;applied:boolean;ignored?:boolean;disposed?:boolean;duplicate?:boolean}
export interface EffectService{permissions:Permission[];execute(input:ReadonlyJsonValue,context:{signal:CancellationSignal;request:Readonly<EffectRequest>;attempt:number}):MaybePromise<JsonValue>}
export interface EffectOptions{
 getCurrent():EffectContext;applyAction(action:Action):DispatchResult;nextActionId():string;nextActionSequence():number;
 services?:Record<string,EffectService>;policy?:Partial<Record<Permission,boolean>>;
 timeoutMs?:number;maxRetries?:number;maxActive?:number;maxRecords?:number;
 onRecord?(record:Readonly<RecordedEffect>):unknown;
}
export interface EffectCoordinator{
 submit(request:EffectRequest):Promise<EffectOutcome>;cancel(requestId:string):void;flush():void;pending():number;
 waitForIdle(options?:{signal?:CancellationSignal;timeoutMs?:number}):Promise<void>;
 replay(record:RecordedEffect):EffectOutcome;dispose():void;getReplayRecords():readonly RecordedEffect[];
}
export declare class EffectError extends Error{readonly code:string}
export declare function createEffectCoordinator(options:EffectOptions):EffectCoordinator;
export declare function evaluateAfterEffects(options:{coordinator:EffectCoordinator;getCurrent():EffectContext;evaluate(options:{signal:CancellationSignal}):MaybePromise<Result>;validateResult(input:unknown,expected?:{activityId:string;sessionId:string;attemptId?:string}):{valid:boolean}},waitOptions?:{signal?:CancellationSignal;timeoutMs?:number}):Promise<Result>;
