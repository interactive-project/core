import type {ActivitySpec} from '@interactive-project/protocol/types';
import type {GenerationCatalog,GenerationEntry,Capability,Permission} from '@interactive-project/protocol/generation';
import type {EngineContext,EngineSession,CancellationSignal} from '@interactive-project/protocol/interoperability';
import type {Registry,HostKind,RendererSession,Frozen} from '@interactive-project/registry';
export interface LoadOptions{
 registry:Registry;catalog:GenerationCatalog;generated?:boolean;
 policy?:Partial<Record<Permission,boolean>>;availableDrivers?:string[];host?:HostKind;mount?:unknown;rendererServices?:Readonly<Record<string,unknown>>;
 engineContext:EngineContext;signal?:CancellationSignal;timeoutMs?:number;
 validateDomainSchema(config:unknown,entry:Frozen<GenerationEntry>):{valid:boolean};
 validateDomainSemantics(activity:Frozen<ActivitySpec>,entry:Frozen<GenerationEntry>):{valid:boolean;requirements?:{permissions:Permission[];capabilities:Capability[]}};
 onDiagnostic?(diagnostic:Readonly<{code:string}>):unknown;
}
export type LoadStage='structural'|'semantic'|'permission'|'capability'|'engine'|'renderer';
export type LoadResult={loaded:true;activity:Frozen<ActivitySpec>;engine:EngineSession;renderer?:RendererSession;dispose():void}|{loaded:false;stage:LoadStage;diagnostics:{code:string;path:string;severity:'error';message:string}[]};
export declare function loadActivity(input:unknown,options:LoadOptions):Promise<LoadResult>;
