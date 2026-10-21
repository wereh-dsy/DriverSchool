import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CityEditingKernel} from '../../src/editor/CityEditingKernel';
import {diagnoseElevationSeams} from '../../src/editor/ElevationSeams';
import {newCityMap} from '../../src/world/city/CityMapData';
import {makeReceipt} from '../../scripts/mapctl-support';
import type {CityRoad} from '../../src/world/city/CityMapData';
import type {EditorCommand} from '../../src/editor/EditorCommands';

const dir='artifacts/map-elevation-seam-audit',path='src/world/regional/regional-main.json',raw=fs.readFileSync(path,'utf8'),map=JSON.parse(raw),scope={bbox:{minX:2181,maxX:2251,minZ:2105,maxZ:2175}};
const savedOriginal=fs.existsSync(dir+'/original-local-map.json')?JSON.parse(fs.readFileSync(dir+'/original-local-map.json','utf8')):undefined;
const diagnosis=diagnoseElevationSeams(savedOriginal??map,scope),incident=diagnosis.issues.find(s=>s.bbox.minZ<2140&&s.bbox.maxZ>2140&&s.bbox.minX<2216&&s.bbox.maxX>2216)!;
assert(incident&&incident.category==='LIKELY_FIX'&&incident.maxHeightDelta>.12&&incident.normalDot>.9999);
const roads:CityRoad[]=incident.roadIds.map(id=>(savedOriginal??map).roads.find((r:CityRoad)=>r.id===id));
assert(roads.every(r=>r.curve==='polyline'&&r.elevationMode==='custom'));
const yAtZ=(r:CityRoad,z:number)=>{for(let i=1;i<r.centerline.length;i++){const a=r.centerline[i-1]!,b=r.centerline[i]!;if(z>=Math.min(a.z,b.z)&&z<=Math.max(a.z,b.z)&&Math.abs(b.z-a.z)>1e-5)return (a.y??0)+((b.y??0)-(a.y??0))*(z-a.z)/(b.z-a.z);}throw new Error('Outside monotone local Z interval');};
const xAtZ=(r:CityRoad,z:number)=>{for(let i=1;i<r.centerline.length;i++){const a=r.centerline[i-1]!,b=r.centerline[i]!;if(z>=Math.min(a.z,b.z)&&z<=Math.max(a.z,b.z)&&Math.abs(b.z-a.z)>1e-5)return a.x+(b.x-a.x)*(z-a.z)/(b.z-a.z);}throw new Error('Outside monotone local Z interval');};
const midY=(z:number)=>(yAtZ(roads[0]!,z)+yAtZ(roads[1]!,z))/2,midX=(z:number)=>(xAtZ(roads[0]!,z)+xAtZ(roads[1]!,z))/2;
const smoother=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*t*(t*(t*6-15)+10);};
const operations:EditorCommand[]=roads.map(r=>({op:'adjustElevationSeam',id:r.id,elevations:r.centerline.flatMap((p,index)=>{
  if(index===0||index===r.centerline.length-1||p.z<=2040||p.z>=2240)return [];
  const weight=smoother((p.z-2040)/60)*smoother((2240-p.z)/60),dx=midX(p.z+.5)-midX(p.z-.5),dy=midY(p.z+.5)-midY(p.z-.5);
  // Common longitudinal plane on the midpoint spine, projected normally onto
  // both carriageways. Equal Y at equal Z would leave a cross-slope offset.
  const reference=midY(p.z)+dy*dx/(1+dx*dx)*(p.x-midX(p.z));
  const live=map.roads.find((road:CityRoad)=>road.id===r.id).centerline[index];
  return [{index,before:live.y??0,after:(p.y??0)+(reference-(p.y??0))*weight}];
})}));
const original={...newCityMap(),id:map.id,name:map.name,version:map.version,roads,roadNames:map.roadNames,bounds:{minX:1900,maxX:2600,minZ:400,maxZ:2600},environment:{districts:[],spawnPoints:[{id:'seam',position:{x:2203,y:yAtZ(roads[0]!,2140),z:2140},rotation:-Math.PI/2}]}};
if(!savedOriginal)fs.writeFileSync(dir+'/original-local-map.json',JSON.stringify(original,null,2));
const kernel=new CityEditingKernel(map),summary=kernel.preview(operations,'Align Inner Ring shared pavement around black-box seam'),receipt=makeReceipt(kernel,summary,operations,createHash('sha256').update(raw).digest('hex')),next=kernel.previewSnapshot(summary.id),diff=kernel.diffPreview(summary.id);
assert(summary.valid);assert(!diff.topology.changed&&diff.maxRoadDisplacement===0&&diff.roads.modified.every(r=>!r.endpointsChanged));
const followup=diagnoseElevationSeams(next,scope);assert(followup.maxHeightDelta<.01);
const issues=roads.flatMap(r=>new CityEditingKernel(next).validateRoad(r.id));assert(!issues.some(i=>i.severity==='error'));
const unchanged=(m:typeof map)=>JSON.stringify({...m,version:0,roads:m.roads.map((r:CityRoad)=>({...r,centerline:r.centerline.map(p=>({x:p.x,z:p.z}))}))});
assert.equal(unchanged(kernel.data),unchanged(next));
const files={'fixture-before.json':diagnosis,'fixture-operations.json':{operations},'fixture-preview.json':receipt,'fixture-diff.json':diff,'fixture-local-validate.json':{valid:true,issues},'fixture-after.json':followup};
for(const [name,value]of Object.entries(files))fs.writeFileSync(dir+'/'+(savedOriginal?name.replace('fixture-','fixture-refine-'):name),JSON.stringify(value,null,2));
if(process.argv.includes('--apply')){
  assert.equal(fs.readFileSync(path,'utf8'),raw);kernel.commit(summary.id);
  for(const op of operations)if(op.op==='adjustElevationSeam'){const r=map.roads.find((r:CityRoad)=>r.id===op.id);for(const e of op.elevations)r.centerline[e.index].y=e.after;}
  map.version=kernel.data.version;const temporary=path+'.seam-tmp';fs.writeFileSync(temporary,JSON.stringify(map)+'\n');fs.renameSync(temporary,path);
}
console.log(JSON.stringify({valid:true,applied:process.argv.includes('--apply'),roads:incident.roadIds,points:operations.map(op=>op.op==='adjustElevationSeam'?op.elevations.length:0),before:diagnosis.maxHeightDelta,after:followup.maxHeightDelta,topologyChanged:diff.topology.changed},null,2));
