import { readFileSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { CityEditingKernel, type RoadQuery } from '../src/editor/CityEditingKernel';
import { EDITOR_ROAD_PRESETS, type EditorCommand, type EditorArea } from '../src/editor/EditorCommands';
import { loadCityMap } from '../src/world/city/CityMapLoader';
import { snapCandidates } from '../src/editor/EditorSnap';

const [command, mapArg, ...args] = process.argv.slice(2), flags = new Map<string,string>();
const json = (value:string) => JSON.parse(value.startsWith('@') ? readFileSync(resolve(value.slice(1)),'utf8').replace(/^\uFEFF/,'') : value);
const output = (value:unknown) => console.log(JSON.stringify(value??null,null,2));
try {
  for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||args[i+1]===undefined)throw new Error('Expected --flag value');flags.set(args[i]!.slice(2),args[i+1]!);}
  if(command==='presets'){output(EDITOR_ROAD_PRESETS);}
  else {
    if(!mapArg)throw new Error('Usage: pnpm mapctl inspect|query|snap|preview|apply|validate <map.json|city-alpha|regional-main> --request @request.json [--out output.json]');
    const aliases:Record<string,string>={'city-alpha':'src/world/city/maps/city-alpha.json','city-main-city':'src/world/city/maps/city-main.json','regional-main':'src/world/regional/regional-main.json','editor-test':'src/editor/maps/editor-test.json'};
    if(mapArg==='city-main')throw new Error('Choose regional-main (playable map) or city-main-city (city-only source) explicitly');
    const source=resolve(aliases[mapArg]??mapArg),raw=readFileSync(source,'utf8'),digest=createHash('sha256').update(raw).digest('hex');
    const kernel=new CityEditingKernel(loadCityMap(JSON.parse(raw.replace(/^\uFEFF/,'')))) ;
    const request=flags.has('request')?json(flags.get('request')!):undefined;
    if(command==='inspect'){output(kernel.inspectArea(request??{center:{x:0,z:0},radius:200}));}
    else if(command==='query'){
      if(request?.kind==='road')output(kernel.getRoad(request.id));else if(request?.kind==='corridor')output(kernel.getCorridor(request.id));else if(request?.kind==='corridors')output(kernel.listCorridors(request.name));else if(request?.kind==='group')output(kernel.getGroup(request.id));else if(request?.kind==='sign')output(kernel.getSign(request.id));else if(request?.kind==='signs')output(kernel.findSigns(request));else if(request?.kind==='intersection')output(kernel.getIntersection(request.id));else if(request?.kind==='connected')output(kernel.getConnectedRoads(request.id));else output(kernel.findRoads(request as RoadQuery));
    }else if(command==='snap')output(snapCandidates(kernel,request.point,request.options));
    else if(command==='validate'){
      if(!request)throw new Error('Local validation requires {roadId}, {corridorId}, {intersectionId}, or {bbox}');
      const issues=request.roadId?kernel.validateRoad(request.roadId):request.corridorId?kernel.validateCorridor(request.corridorId):request.intersectionId?kernel.validateIntersection(request.intersectionId):kernel.validateArea(request.bbox as EditorArea);
      output({valid:!issues.some(i=>i.severity==='error'),issues});if(issues.some(i=>i.severity==='error'))process.exitCode=1;
    }else if(command==='preview'||command==='apply'){
      if(!request)throw new Error('--request @operations.json required');
      if(request.mapDigest&&request.mapDigest!==digest)throw new Error('Map changed since preview; inspect and preview again');
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
    }else throw new Error(`Unknown command: ${command}`);
  }
}catch(error){output({valid:false,error:String(error)});process.exitCode=1;}
