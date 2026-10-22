import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CityEditingKernel} from '../src/editor/CityEditingKernel';
import {loadCityMap} from '../src/world/city/CityMapLoader';
import type {CityMapData} from '../src/world/city/CityMapData';
import type {EditorCommand} from '../src/editor/EditorCommands';
import {project} from '../src/editor/EditorGeometry';
import {roadPoints,sampleAt} from '../src/world/city/geometry';
import {stations} from '../src/editor/MapAnalysis';
import {compactRampProfile,rampProfile} from '../src/editor/RampProfileAudit';
import {applyReviewedPavementProfile} from '../src/editor/ElevationSeams';
const dir='artifacts/ramp-profile-audit',raw=fs.readFileSync(dir+'/before-map.json','utf8'),before:CityMapData=JSON.parse(raw),candidate:CityMapData=JSON.parse(fs.readFileSync(dir+'/candidate-map.json','utf8')),plans:any[]=JSON.parse(fs.readFileSync(dir+'/repair-plans.json','utf8'));
if(process.argv.includes('--compact')){
  let removed=0,maxError=0;
  for(const p of plans){if(!p.profile)continue;const original=before.roads.find(r=>r.id===p.roadId)!,old=candidate.roads.find(r=>r.id===p.roadId)!,compact=compactRampProfile(p.profile,stations(roadPoints(original))),road=structuredClone(original);applyReviewedPavementProfile(road,compact,8);if(p.ribbon)road.pavementSurface='ribbon';for(const node of p.profile)maxError=Math.max(maxError,Math.abs((sampleAt(roadPoints(road),node.station).point.y??0)-node.after));removed+=old.centerline.length-road.centerline.length;candidate.roads[candidate.roads.findIndex(r=>r.id===p.roadId)]=road;p.profile=compact;p.after=rampProfile(road);}
  assert(maxError<=.000500001);fs.writeFileSync(dir+'/candidate-map.json',JSON.stringify(candidate)+'\n');fs.writeFileSync(dir+'/repair-plans.json',JSON.stringify(plans,null,2));fs.writeFileSync(dir+'/profile-compaction.json',JSON.stringify({valid:true,removedExtraNodes:removed,maxYError:maxError,tolerance:.0005,authoredXZNodesPreserved:true},null,2));console.log(JSON.stringify({removed,maxError}));process.exit(0);
}
const kernel=new CityEditingKernel(loadCityMap(JSON.parse(raw))),commands:EditorCommand[]=plans.flatMap(p=>[...(p.profile?[{op:'repairPavementProfile' as const,id:p.roadId,profile:p.profile,maxYChange:8}]:[]),...(p.ribbon?[{op:'setPavementSurface' as const,id:p.roadId,surface:'ribbon' as const}]:[])]);
const preview=kernel.preview(commands,'City Main ramp/profile audit'),after=kernel.previewSnapshot(preview.id),ids=new Set(plans.map(p=>p.roadId)),structural=(map:CityMapData)=>JSON.stringify({...map,version:0,roads:map.roads.map(r=>({...r,centerline:[],pavementSurface:undefined,elevationMode:undefined,curve:undefined}))});
assert.equal(structural(before),structural(candidate),'unrelated authored map fields unchanged');
let maxHorizontal=0,changedNodes=0,insertedNodes=0;
const rows=plans.map(p=>{const b=before.roads.find(r=>r.id===p.roadId)!,a=candidate.roads.find(r=>r.id===p.roadId)!,k=after.roads.find(r=>r.id===p.roadId)!,path=roadPoints(b);assert(k.centerline.length===a.centerline.length&&k.centerline.every((v,i)=>v.x===a.centerline[i]!.x&&v.z===a.centerline[i]!.z&&Math.abs((v.y??0)-(a.centerline[i]!.y??0))<1e-9),'candidate must equal Editing Kernel preview within loader numeric normalization: '+p.roadId);assert.equal(k.pavementSurface,a.pavementSurface);
  assert.deepEqual(b.centerline[0],a.centerline[0]);assert.deepEqual(b.centerline.at(-1),a.centerline.at(-1));
  for(const node of b.centerline)assert(a.centerline.some(v=>v.x===node.x&&v.z===node.z),'every original horizontal node survives');
  let moved=0;for(const node of a.centerline){const hit=project(path,node);maxHorizontal=Math.max(maxHorizontal,hit.distance);if(Math.abs((node.y??0)-(hit.point.y??0))>1e-5)moved++;}changedNodes+=moved;insertedNodes+=a.centerline.length-b.centerline.length;
  return {roadId:p.roadId,changedNodes:moved,insertedNodes:a.centerline.length-b.centerline.length,maxY:p.maxY,endpointXYZPreserved:true,horizontalAlignmentPreserved:true,pavementSurface:a.pavementSurface??'segment-plane'};
});
assert(maxHorizontal<1e-6,'all inserted XZ points remain on original path');
for(let i=0;i<before.roads.length;i++)if(!ids.has(before.roads[i]!.id))assert.deepEqual(before.roads[i],candidate.roads[i]);
const frozen=JSON.parse(fs.readFileSync(dir+'/frozen-physics.json','utf8'));for(const [file,hash]of Object.entries(frozen))assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash,'physics baseline frozen: '+file);
const result={valid:preview.valid,mapBefore:before.version,mapAfter:candidate.version,changedRoads:plans.length,changedNodes,insertedNodes,maxHorizontalDisplacement:maxHorizontal,physicsFrozen:true,topologyAndUnrelatedDataPreserved:true,editingKernel:{valid:preview.valid,warnings:preview.warnings},rows};
fs.writeFileSync(dir+'/changed-region-validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,rows:undefined,editingKernel:{valid:preview.valid,issues:preview.warnings.length,errors:preview.warnings.filter(w=>w.severity==='error').slice(0,8)}}));
if(!preview.valid)process.exitCode=1;
