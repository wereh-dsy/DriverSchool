import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { CityEditingKernel, type RoadQuery } from '../src/editor/CityEditingKernel';
import { EDITOR_ROAD_PRESETS, type EditorCommand, type EditorArea } from '../src/editor/EditorCommands';
import { loadCityMap } from '../src/world/city/CityMapLoader';
import { snapCandidates } from '../src/editor/EditorSnap';
import { pageDiagnosticReport, repairCommandsFromDiagnosis, type DiagnosticReport, type DiagnosticScope } from '../src/editor/RoadDiagnostics';

const [command, mapArg, ...args] = process.argv.slice(2), flags = new Map<string,string>();
const json = (value:string) => JSON.parse(value.startsWith('@') ? readFileSync(resolve(value.slice(1)),'utf8').replace(/^\uFEFF/,'') : value);
const output = (value:unknown) => console.log(JSON.stringify(value??null,null,2));
const assertCurrentSource = (request: any, digest: string): void => {
  for (const receipt of [request, request?.diagnosis]) {
    if (receipt?.mapDigest && receipt.mapDigest !== digest) throw new Error('Map changed since inspect/diagnose/preview; inspect, diagnose or preview again');
  }
};
const usage = 'Usage: pnpm mapctl inspect|query|snap|diagnose|preview|repair|apply|validate <map.json|city-alpha|regional-main> --request @request.json [--out output.json] [--full] [--apply]; page saved diagnostics: query <diagnosis.json> --request {kind:"diagnosis",offset:0,limit:100}';
try {
  for(let i=0;i<args.length;i++){
    const arg=args[i]!;
    if(!arg.startsWith('--'))throw new Error('Expected --flag value');
    const key=arg.slice(2),next=args[i+1];
    if(next===undefined||next.startsWith('--'))flags.set(key,'true');
    else{flags.set(key,next);i++;}
  }
  const request=flags.has('request')?json(flags.get('request')!):undefined;
  if(command==='presets'){output(EDITOR_ROAD_PRESETS);}
  else if(command==='query'&&request?.kind==='diagnosis'){
    if(!mapArg)throw new Error('Diagnosis query requires a saved diagnose --out receipt');
    output(pageDiagnosticReport(json('@'+mapArg) as DiagnosticReport,request));
  }
  else {
    if(!mapArg)throw new Error(usage);
    const aliases:Record<string,string>={'city-alpha':'src/world/city/maps/city-alpha.json','city-main-city':'src/world/city/maps/city-main.json','regional-main':'src/world/regional/regional-main.json','editor-test':'src/editor/maps/editor-test.json'};
    if(mapArg==='city-main')throw new Error('Choose regional-main (playable map) or city-main-city (city-only source) explicitly');
    const source=resolve(aliases[mapArg]??mapArg),raw=readFileSync(source,'utf8'),digest=createHash('sha256').update(raw).digest('hex');
    const kernel=new CityEditingKernel(loadCityMap(JSON.parse(raw.replace(/^\uFEFF/,''))));
    if(command==='preview'||command==='apply'||command==='repair')assertCurrentSource(request,digest);
    if(command==='inspect'){output(kernel.inspectArea(request??{center:{x:0,z:0},radius:200}));}
    else if(command==='query'){
      if(request?.kind==='road')output(kernel.getRoad(request.id));else if(request?.kind==='corridor')output(kernel.getCorridor(request.id));else if(request?.kind==='corridors')output(kernel.listCorridors(request.name));else if(request?.kind==='group')output(kernel.getGroup(request.id));else if(request?.kind==='sign')output(kernel.getSign(request.id));else if(request?.kind==='signs')output(kernel.findSigns(request));else if(request?.kind==='intersection')output(kernel.getIntersection(request.id));else if(request?.kind==='connected')output(kernel.getConnectedRoads(request.id));else output(kernel.findRoads(request as RoadQuery));
    }else if(command==='snap')output(snapCandidates(kernel,request.point,request.options));
    else if(command==='diagnose'){
      if(!request)throw new Error('diagnose requires {roadId}, {corridorId}, {intersectionId}, {bbox}, {center,radius} or {full:true}');
      const scope: DiagnosticScope = flags.get('full')==='true' ? { ...request, full: true } : request;
      if(scope.full&&!flags.has('out'))throw new Error('Full diagnose requires --out to preserve every computed issue; stdout contains only a compact page');
      const report = { ...kernel.diagnose(scope,{retainAllIssues:true}), mapDigest: digest };
      if(flags.has('out'))writeFileSync(resolve(flags.get('out')!),JSON.stringify(report,null,2)+'\n','utf8');
      output({...pageDiagnosticReport(report,{limit:scope.limit}),...(flags.has('out')?{detailsFile:resolve(flags.get('out')!)}:{})});
    }else if(command==='validate'){
      if(flags.get('full')==='true'||request?.full){
        const issues=kernel.validateFull();
        output({valid:!issues.some(i=>i.severity==='error'),full:true,errorCount:issues.filter(i=>i.severity==='error').length,warningCount:issues.filter(i=>i.severity==='warning').length,issues});
        if(issues.some(i=>i.severity==='error'))process.exitCode=1;
      }else{
        if(!request)throw new Error('Local validation requires {roadId}, {corridorId}, {intersectionId}, or {bbox}; use --full only for an explicit whole-map check');
        const issues=request.roadId?kernel.validateRoad(request.roadId):request.corridorId?kernel.validateCorridor(request.corridorId):request.intersectionId?kernel.validateIntersection(request.intersectionId):kernel.validateArea(request.bbox as EditorArea);
        output({valid:!issues.some(i=>i.severity==='error'),issues});if(issues.some(i=>i.severity==='error'))process.exitCode=1;
      }
    }else if(command==='preview'||command==='apply'){
      if(!request)throw new Error('--request @operations.json required');
      const operations:EditorCommand|EditorCommand[]=request.operations??request;
      const summary=kernel.preview(operations,request.label??'Agent edit');
      const receipt={mapDigest:digest,operations,summary};
      if(command==='preview'){
        if(flags.has('out'))writeFileSync(resolve(flags.get('out')!),JSON.stringify(receipt,null,2)+'\n','utf8');
        output(receipt);if(!summary.valid)process.exitCode=1;
      }else{
        kernel.commit(summary.id);
        const destination=resolve(flags.get('out')??source),temporary=destination+'.tmp-'+process.pid;
        try{writeFileSync(temporary,JSON.stringify(kernel.data,null,2)+'\n','utf8');renameSync(temporary,destination);}finally{if(existsSync(temporary))unlinkSync(temporary);}
        output({saved:destination,...summary});
      }
    }else if(command==='repair'){
      if(!request)throw new Error('repair requires {operations}, a diagnose receipt {issues}, or {scope} / {diagnosis} to derive repairs');
      let operations:EditorCommand[];
      if(request.operations)operations=request.operations as EditorCommand[];
      else {
        const report:DiagnosticReport=request.issues?request:request.diagnosis?request.diagnosis:kernel.diagnose(request.scope??request);
        const only:string[]|undefined=request.only;
        const commands=repairCommandsFromDiagnosis(report,{codes:request.codes,minSeverity:request.minSeverity??'warning',limit:request.limit??20});
        operations=(only?.length?commands.filter(command=>only.includes(String(command.op))):commands) as EditorCommand[];
      }
      if(!operations.length){
        output({valid:true,operations:[],message:'No repair suggestions for this scope; inspect or select a narrower corridor/road.'});
      }else{
        const label=request.label??'Repair roads';
        const summary=kernel.preview(operations,label);
        const receipt={mapDigest:digest,operations,summary};
        if(flags.get('apply')==='true'){
          if(!summary.valid)throw new Error(summary.warnings.filter(w=>w.severity==='error').map(w=>w.message).join('\n')||'Repair preview is invalid');
          kernel.commit(summary.id);
          const destination=resolve(flags.get('out')??source),temporary=destination+'.tmp-'+process.pid;
          try{writeFileSync(temporary,JSON.stringify(kernel.data,null,2)+'\n','utf8');renameSync(temporary,destination);}finally{if(existsSync(temporary))unlinkSync(temporary);}
          output({saved:destination,...summary});
        }else{
          if(flags.has('out'))writeFileSync(resolve(flags.get('out')!),JSON.stringify(receipt,null,2)+'\n','utf8');
          output(receipt);if(!summary.valid)process.exitCode=1;
        }
      }
    }else throw new Error(`Unknown command: ${command}. ${usage}`);
  }
}catch(error){output({valid:false,error:String(error)});process.exitCode=1;}
