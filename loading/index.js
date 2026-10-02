import {copyGeneratedJson,parseGeneratedJson} from '@interactive-project/protocol/generation/json';
import {validateGenerationCatalog} from '@interactive-project/protocol/generation';
import {validateActivitySpec} from '@interactive-project/protocol/validation';
import {canonicalJson} from '@interactive-project/protocol/interoperability';
import {resolveEngine} from '@interactive-project/registry/resolution';
const permissions=['network','execution','media'],capabilities=['interactive','evaluable','collaborative','offline','deterministic','resumable','aiGeneratable'];
class Failure extends Error{constructor(code,path=''){super(code);this.code=code;this.path=path;}}
const messages={'load.options':'The trusted loading options are invalid.','load.validator':'A trusted synchronous domain validator failed.','load.domainSchema':'The config violates its registered domain schema.','load.semantic':'The activity violates its domain semantic contract.','load.envelope':'The activity violates the shared envelope schema.','load.unknownType':'The activity type is not approved in the catalog.','load.version':'The exact activity schema version is unsupported.','load.permission':'The host denies a required permission.','load.capability':'A required capability or driver is unavailable.','load.catalog':'The approved catalog is invalid or mismatches the registered engine.','load.renderer':'A compatible renderer is unavailable.','load.engine':'The trusted engine factory failed or returned an invalid session.','load.rendererFactory':'The trusted renderer factory failed or returned invalid lifecycle hooks.','load.cancelled':'Loading was cancelled.','load.timeout':'Loading exceeded its deadline.'};
const diagnostic=(code,path='')=>({code,path,severity:'error',message:messages[code]});
function synchronous(fn,...args){try{const v=fn(...args);if(v&&typeof v.then==='function'){Promise.resolve(v).catch(()=>{});throw new Failure('load.validator');}return v;}catch{throw new Failure('load.validator');}}
export async function loadActivity(input,options){
 let stage='structural',abandoned=false,finished=false;
 const callerSignal=options?.signal;
 const controller=new AbortController(),resources=[],cleaned=new Set();
 let timer,abortListener,callerListener;
 const report=code=>{try{const r=options?.onDiagnostic?.(Object.freeze({code}));if(r&&typeof r.then==='function')Promise.resolve(r).catch(()=>{});}catch{}};
 function clean(resource){if(!resource||cleaned.has(resource))return;cleaned.add(resource);try{const r=resource.dispose?.();if(r&&typeof r.then==='function')Promise.resolve(r).catch(()=>report('load.cleanup'));}catch{report('load.cleanup');}}
 function cleanAll(){for(const resource of [...resources].reverse())clean(resource);resources.length=0;}
 let cancelled;
 function check(){if(controller.signal.aborted)throw new Failure(controller.signal.reason==='timeout'?'load.timeout':'load.cancelled');}
 async function construct(factory,code){
  check();const created=Promise.resolve().then(()=>{check();return factory();});
  created.then(value=>{if(abandoned||controller.signal.aborted)clean(value);},()=>{});
  let value;try{value=await Promise.race([created,cancelled]);}catch(failure){if(failure instanceof Failure)throw failure;throw new Failure(code);}
  if(abandoned||controller.signal.aborted){clean(value);check();}
  resources.push(value);return value;
 }
 try{
  if(!options||!options.registry||typeof options.validateDomainSchema!=='function'||typeof options.validateDomainSemantics!=='function')throw new Failure('load.options');
  const timeoutMs=options.timeoutMs??30000;if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw new Failure('load.options');
  cancelled=new Promise((_,reject)=>{abortListener=()=>reject(new Failure(controller.signal.reason==='timeout'?'load.timeout':'load.cancelled'));controller.signal.addEventListener('abort',abortListener,{once:true});});
  // Synchronous validation can reject before anyone awaits this promise.
  cancelled.catch(()=>{});
  callerListener=()=>controller.abort('caller');callerSignal?.addEventListener('abort',callerListener,{once:true});if(callerSignal?.aborted)callerListener();
  timer=setTimeout(()=>controller.abort('timeout'),timeoutMs);check();
  const generated=options.generated===true,host=options.host,engineContext=Object.freeze({...options.engineContext}),mount=options.mount,rendererServices=options.rendererServices;
  const policyCopy=copyGeneratedJson(options.policy??{}),driversCopy=copyGeneratedJson(options.availableDrivers??[]);
  if(!policyCopy.valid||!driversCopy.valid||!Array.isArray(driversCopy.value)||driversCopy.value.some(d=>typeof d!=='string'))throw new Failure('load.options');
  const policy=policyCopy.value;if(!policy||typeof policy!=='object'||Array.isArray(policy)||Object.entries(policy).some(([k,v])=>!permissions.includes(k)||typeof v!=='boolean'))throw new Failure('load.options');
  const catalog=validateGenerationCatalog(options.catalog);if(!catalog.valid)throw new Failure('load.catalog');
  const prepared=typeof input==='string'?parseGeneratedJson(input):copyGeneratedJson(input);
  if(!prepared.valid)return{loaded:false,stage,diagnostics:prepared.diagnostics};
  const activity=prepared.value;
  if(!validateActivitySpec(activity).valid)throw new Failure('load.envelope');
  const entries=catalog.catalog.entries.filter(e=>e.type===activity.type);if(!entries.length)throw new Failure('load.unknownType','/type');
  const entry=entries.find(e=>e.activitySchemaVersion===activity.activitySchemaVersion);if(!entry)throw new Failure('load.version','/activitySchemaVersion');
  if(synchronous(options.validateDomainSchema,activity.config,entry)?.valid!==true)throw new Failure('load.domainSchema','/config');check();
  stage='semantic';const semantics=synchronous(options.validateDomainSemantics,activity,entry);
  if(semantics?.valid!==true)throw new Failure('load.semantic','/config');
  const requirements=copyGeneratedJson(semantics.requirements);
  if(!requirements.valid||!requirements.value||Object.keys(requirements.value).sort().join(',')!=='capabilities,permissions'||!Array.isArray(requirements.value.permissions)||!Array.isArray(requirements.value.capabilities)||requirements.value.permissions.some(p=>!permissions.includes(p))||requirements.value.capabilities.some(c=>!capabilities.includes(c)))throw new Failure('load.validator','/config');
  check();stage='permission';
  for(const permission of new Set([...entry.requiredPermissions,...requirements.value.permissions]))if(policy[permission]!==true)throw new Failure('load.permission','/config');
  stage='capability';
  const requested=[...new Set([...entry.requiredCapabilities,...requirements.value.capabilities,...(generated?['aiGeneratable']:[])])];
  if(requested.includes('offline')&&requirements.value.permissions.includes('network'))throw new Failure('load.capability','/config');
  const resolved=resolveEngine(options.registry,{type:activity.type,protocolVersion:activity.protocolVersion,activityVersion:{exact:activity.activitySchemaVersion},requiredCapabilities:requested,availableDrivers:driversCopy.value,policy,...(host!==undefined?{host}:{})});
  if(!resolved.resolved)throw new Failure(resolved.rejections.some(r=>r.code==='resolution.renderer')?'load.renderer':'load.capability','/config');
  if(canonicalJson(resolved.entry)!==canonicalJson(entry))throw new Failure('load.catalog','/config');
  check();stage='engine';
  const engine=await construct(()=>resolved.registration.createEngine(activity,{...engineContext,signal:controller.signal}),'load.engine');
  if(!engine||!['dispatch','evaluate','serialize','restore','dispose'].every(k=>typeof engine[k]==='function'))throw new Failure('load.engine');
  let renderer;
  if(resolved.renderer){stage='renderer';renderer=await construct(()=>resolved.renderer.createRenderer({session:engine,mount,services:rendererServices}),'load.rendererFactory');if(!renderer||!['update','dispose'].every(k=>typeof renderer[k]==='function'))throw new Failure('load.rendererFactory');}
  check();finished=true;
  let disposed=false;
  return{loaded:true,activity,engine,...(renderer?{renderer}:{}),dispose(){if(disposed)return;disposed=true;controller.abort('disposed');cleanAll();}};
 }catch(failure){
  abandoned=true;controller.abort('failed');cleanAll();
  const code=failure instanceof Failure?failure.code:stage==='renderer'?'load.rendererFactory':stage==='engine'?'load.engine':'load.options';
  return{loaded:false,stage,diagnostics:[diagnostic(code,failure instanceof Failure?failure.path:'')]};
 }finally{
  clearTimeout(timer);if(abortListener)controller.signal.removeEventListener('abort',abortListener);if(callerListener)callerSignal?.removeEventListener('abort',callerListener);
  if(!finished){abandoned=true;cleanAll();}
 }
}
