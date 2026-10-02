import type {ActivitySpec,JsonValue} from '@interactive-project/protocol/types';
import type {Action,Result,DispatchResult,CancellationSignal,Snapshot,MaybePromise} from '@interactive-project/protocol/interoperability';
import type {ActivityEvent} from '@interactive-project/events';
export type Frozen<T>=T extends object?{readonly [P in keyof T]:Frozen<T[P]>}:T;
export type ReadonlyJsonValue=null|boolean|number|string|readonly ReadonlyJsonValue[]|{readonly [key:string]:ReadonlyJsonValue};
export interface ReadonlyRuntimeState{readonly lifecycle:Lifecycle;readonly revision:number;readonly state:ReadonlyJsonValue;readonly result?:Frozen<Result>}
export type Lifecycle='created'|'active'|'paused'|'completed'|'failed'|'disposed';
export interface RuntimeState{lifecycle:Lifecycle;revision:number;state:JsonValue;result?:Result}
export interface RuntimeContext{
 identity:Readonly<{activityId:string;sessionId:string;attemptId?:string}>;
 services:Readonly<Record<string,unknown>>;clock():number;random():number;
}
export interface StatePorts{
 initialState(activity:Frozen<ActivitySpec>,context:RuntimeContext):JsonValue;
 reduce(state:ReadonlyJsonValue,action:Frozen<Action>,context:RuntimeContext):{accepted:true;state:JsonValue}|{accepted:false};
 evaluate(state:ReadonlyJsonValue,context:RuntimeContext,revision:number):Result;
 dispose?():MaybePromise<void>;
}
export interface RuntimeOptions{
 activity:ActivitySpec;sessionId:string;attemptId?:string;sourceId:string;engineId:string;engineStateVersion:string;
 clock():number;random():number;nextEventId():string;services?:Record<string,unknown>;ports:StatePorts;
 validators:{activity(input:unknown):{valid:boolean};action(input:unknown,expected?:RuntimeContext['identity']):{valid:boolean};result(input:unknown,expected?:RuntimeContext['identity']):{valid:boolean};event(input:unknown):{valid:boolean}};
 onDiagnostic?(diagnostic:Readonly<{code:string}>):unknown;
}
export interface RuntimeSession{
 start(options?:{signal?:CancellationSignal}):void;pause(options?:{signal?:CancellationSignal}):void;resume(options?:{signal?:CancellationSignal}):void;
 dispatch(action:Action,options?:{signal?:CancellationSignal}):DispatchResult;
 evaluate(options?:{signal?:CancellationSignal}):Result;
 complete(options?:{signal?:CancellationSignal}):void;fail(options?:{code?:string;phase?:'initialization'|'dispatch'|'evaluation'|'restore'}):void;
 subscribe(listener:(state:ReadonlyRuntimeState)=>unknown):()=>void;
 subscribeEvents(listener:(event:Frozen<ActivityEvent>)=>unknown,options?:{replay?:boolean}):()=>void;
 getState():ReadonlyRuntimeState;flushEvents():void;dispose():void;serialize():Snapshot;restore(snapshot:Snapshot):void;
}
export declare class RuntimeError extends Error{readonly code:string;readonly path:string}
export declare function createRuntime(options:RuntimeOptions):RuntimeSession;
export declare function stateMachinePorts(options:{initial:StatePorts['initialState'];transition(state:ReadonlyJsonValue,action:Frozen<Action>,context:RuntimeContext):JsonValue;evaluate:StatePorts['evaluate'];dispose?:StatePorts['dispose']}):StatePorts;
