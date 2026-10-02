import type {Snapshot} from '@interactive-project/protocol/interoperability';
import type {JsonValue} from '@interactive-project/protocol/types';
import type {RuntimeOptions,RuntimeSession,PersistenceOptions} from '../types/runtime.js';
export declare class PersistenceError extends Error{readonly code:string}
export declare function createPersistentRuntime(options:Omit<RuntimeOptions,'persistence'>&{persistence:Omit<PersistenceOptions,'contentDigest'>},cryptoProvider?:{subtle:{digest(algorithm:string,data:Uint8Array):Promise<ArrayBuffer>}}):Promise<RuntimeSession>;
export interface SnapshotSignature{protocolVersion:string;snapshotVersion:string;activitySchemaVersion:string;contentDigest:string;engineId:string;engineStateVersion:string;drivers:Record<string,{driverVersion:string;stateVersion:string;encoding:string}>}
export interface SnapshotMigration{id:string;from:SnapshotSignature;to:SnapshotSignature;migrate(snapshot:Snapshot):Snapshot}
export declare function snapshotSignature(input:Snapshot):SnapshotSignature;
export declare function migrateSnapshot(input:unknown,options:{migrationIds?:string[];migrations?:SnapshotMigration[];validateSnapshot(input:unknown,expected?:Record<string,string|undefined>):{valid:boolean};target:SnapshotSignature}):Snapshot;
