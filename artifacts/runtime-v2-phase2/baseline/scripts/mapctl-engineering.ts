import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CityEditingKernel } from '../src/editor/CityEditingKernel';
import type { EditorCommand } from '../src/editor/EditorCommands';
import { loadCityMap } from '../src/world/city/CityMapLoader';
import { reviewMaps, semanticDiff } from '../src/editor/MapReview';
import { makeReceipt, writeReviewPackage } from './mapctl-support';

export function requestFlags(request:any,flags:Map<string,string>){
  const overrides:Record<string,unknown>={};
  for(const [flag,key] of [['road','roadId'],['intersection','intersectionId'],['object','objectId'],['corridor','corridorId'],['type','type'],['kind','kind'],['domain','domain'],['district','district'],['structure','structure']] as const)if(flags.has(flag))overrides[key]=flags.get(flag);
  for(const key of ['radius','limit','offset','step'])if(flags.has(key))overrides[key]=Number(flags.get(key));
  if(flags.has('bbox'))overrides.bbox=JSON.parse(flags.get('bbox')!);
  if(flags.has('near')){const value=flags.get('near')!;if(value.startsWith('{'))overrides.center=JSON.parse(value);else{const [x,z]=value.split(',').map(Number);if(!Number.isFinite(x)||!Number.isFinite(z))throw new Error('--near requires x,z or JSON point');overrides.center={x,z};}}
  if(flags.has('code'))overrides.codes=flags.get('code')!.split(',');if(flags.has('severity'))overrides.minSeverity=flags.get('severity');
  if(flags.has('full'))overrides.full=flags.get('full')==='true';
  return Object.keys(overrides).length?{...request,...overrides}:request;
}
interface Invocation {command:string;kernel:CityEditingKernel;request:any;flags:Map<string,string>;source:string;raw:string;digest:string;output:(value:unknown)=>void}
export async function runEngineeringCommand({command,kernel,request,flags,source,raw,digest,output}:Invocation):Promise<boolean>{
  const report=(value:unknown)=>{if(flags.has('out')){const destination=resolve(flags.get('out')!);if(destination===source)throw new Error('Read-only output cannot overwrite source');writeFileSync(destination,JSON.stringify(value,null,2)+'\n','utf8');}output(value);};
  const id=request?.roadId??request?.objectId??request?.id;
  if(command==='inspect'){
    switch(request?.kind){
      case 'profile':report(kernel.inspectProfile(id,request.step));return true;
      case 'geometry':report(kernel.inspectGeometry(id));return true;
      case 'ramp':report(kernel.inspectRamp(id));return true;
      case 'object':report(kernel.inspectObject(id));return true;
      case 'structure':report(kernel.inspectStructure(id));return true;
      case 'region':report(kernel.inspectRegion(request));return true;
      case 'issue':report(kernel.inspectIssue(request.issueId??request.id,request.scope??request));return true;
    }
  }
  if(command==='query'&&request?.kind==='objects'){report(kernel.queryObjects(request));return true;}
  if(command==='query'&&request?.kind==='accessWindows'){report(kernel.accessWindows(request));return true;}
  if(command==='diagnose'&&request?.domain&&request.domain!=='legacy'){
    const scope=request.scope??request;if(scope.full&&!flags.has('out'))throw new Error('Full diagnose requires --out');
    const all={...kernel.diagnoseEngineering({...scope,limit:1000000,offset:0},request.domain),mapDigest:digest};
    if(flags.has('out')){if(resolve(flags.get('out')!)===source)throw new Error('Diagnosis cannot overwrite source');writeFileSync(resolve(flags.get('out')!),JSON.stringify(all,null,2)+'\n','utf8');}
    const offset=scope.offset??0,limit=scope.limit??200;output({...all,issues:all.issues.slice(offset,offset+limit),pagination:{offset,limit,total:all.issues.length,nextOffset:offset+limit<all.issues.length?offset+limit:null}});return true;
  }
  if(command==='diff'){
    const target=flags.get('after')??request?.after;if(!target)throw new Error('diff requires --after after-map.json');
    const after=loadCityMap(JSON.parse(readFileSync(resolve(target),'utf8').replace(/^\uFEFF/,'')));
    report(flags.has('diagnostics')?reviewMaps(kernel.data,after,{full:flags.get('full')==='true',routes:request?.routes}):semanticDiff(kernel.data,after,{full:flags.get('full')==='true',routes:request?.routes}));return true;
  }
  if(command==='validate'&&request?.objectId){kernel.inspectObject(request.objectId);const issues=kernel.validateSelection(request.objectId);report({valid:!issues.some(i=>i.severity==='error'),issues});if(issues.some(i=>i.severity==='error'))process.exitCode=1;return true;}
  if(command!=='brush'&&command!=='review'&&!(command==='repair'&&(request?.domain&&request.domain!=='legacy'||request?.issues?.some((i:any)=>i.objectId)||request?.diagnosis?.issues?.some((i:any)=>i.objectId))))return false;
  let operations:EditorCommand|EditorCommand[];
  if(command==='brush'){
    const brush:any={mode:'LINE',...request};
    for(const [flag,key] of [['station-start','stationStart'],['station-end','stationEnd'],['spacing','spacing'],['density','density'],['lateral-offset','lateralOffset'],['height-offset','heightOffset'],['height','height'],['scale','scale'],['seed','seed'],['jitter','randomPositionJitter'],['max-auto-move','maxAutoMove']] as const)if(flags.has(flag))brush[key]=Number(flags.get(flag));
    for(const [flag,key] of [['height-mode','heightMode'],['orientation','orientation'],['arrangement','arrangement'],['mode','mode']] as const)if(flags.has(flag))brush[key]=flags.get(flag)!.replace(/-/g,'_').toUpperCase();
    if(flags.has('side'))brush.side=flags.get('side');if(flags.has('snap-mode'))brush.snapMode=flags.get('snap-mode');
    if(flags.has('auto-adjust'))brush.autoAdjust=flags.get('auto-adjust')==='true'?'ADJUST':flags.get('auto-adjust')!.toUpperCase();
    operations={op:'brushObjects',brush};
  }else if(command==='repair'&&!request.operations){const diagnosis=request.issues?request:request.diagnosis??kernel.diagnoseEngineering(request.scope??request,request.domain);operations=diagnosis.issues.filter((i:any)=>i.repair).map((i:any)=>i.repair).slice(0,request.limit??20);}
  else {if(!request?.operations)throw new Error('review requires preview receipt or {operations}');operations=request.operations;}
  if(Array.isArray(operations)&&!operations.length){report({valid:true,operations:[],message:'No repair suggestions for this scope'});return true;}
  const summary=kernel.preview(operations,request?.label??'Engineering edit'),receipt=makeReceipt(kernel,summary,operations,digest);
  if(request?.affectedIds&&JSON.stringify([...request.affectedIds].sort())!==JSON.stringify(receipt.affectedIds))throw new Error('Affected entities changed; preview again');
  if(flags.get('apply')==='true'){
    if(readFileSync(source,'utf8')!==raw)throw new Error('Map changed during preview; inspect again');kernel.commit(summary.id);
    const destination=resolve(flags.get('out')??source),temporary=destination+'.tmp-'+process.pid;
    try{writeFileSync(temporary,JSON.stringify(kernel.data,null,2)+'\n');renameSync(temporary,destination);}finally{if(existsSync(temporary))unlinkSync(temporary);}
    output({saved:destination,...summary});
  }else if(command==='review'||flags.has('package')){
    const review=kernel.reviewPreview(summary.id,flags.get('full')==='true'),artifact=flags.has('package')?writeReviewPackage(flags.get('package')!,request,receipt,review,{valid:summary.valid,issues:summary.warnings},source):undefined;
    report({receipt,...review,...(artifact?{artifact}:{})});
  }else report(receipt);
  if(!summary.valid)process.exitCode=1;return true;
}
