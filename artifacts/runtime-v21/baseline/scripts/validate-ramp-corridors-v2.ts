import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CityEditingKernel} from '../src/editor/CityEditingKernel';
import {loadCityMap} from '../src/world/city/CityMapLoader';
import type {CityMapData} from '../src/world/city/CityMapData';
import {roadPoints,sampleAt} from '../src/world/city/geometry';
import {stations} from '../src/editor/MapAnalysis';
import {project,distance} from '../src/editor/EditorGeometry';
import {compactRampProfile,rampProfile} from '../src/editor/RampProfileAudit';
const dir='artifacts/ramp-profile-audit/round2/',before:CityMapData=JSON.parse(fs.readFileSync(dir+'before-map.json','utf8')),after:CityMapData=JSON.parse(fs.readFileSync(dir+'candidate-map.json','utf8')),plans:any[]=JSON.parse(fs.readFileSync(dir+'plans.json','utf8'));
if(process.argv.includes('--compact')){
  let removed=0,maxError=0;const changes:any[]=[];
  for(const plan of plans){const r=after.roads.find(r=>r.id===plan.roadId)!,path=roadPoints(r),s=stations(path),keep=s.filter((_,i)=>{if(!i||i===s.length-1)return true;const a=path[i-1]!,b=path[i]!,c=path[i+1]!,area=Math.abs((b.x-a.x)*(c.z-b.z)-(b.z-a.z)*(c.x-b.x));return area>1e-7*Math.max(1,distance(a,b)+distance(b,c));}),p=compactRampProfile(s.map((station,i)=>({station,before:path[i]!.y??0,after:path[i]!.y??0})),keep),next=p.map(v=>sampleAt(path,v.station).point);let error=0;for(let i=0;i<s.length;i++)error=Math.max(error,Math.abs((sampleAt(next,s[i]!).point.y??0)-(path[i]!.y??0)));assert(error<=.00050001);removed+=path.length-next.length;maxError=Math.max(maxError,error);r.centerline=next;plan.road=r;changes.push({roadId:r.id,removed:path.length-next.length,maxYError:error});}
  fs.writeFileSync(dir+'candidate-map.json',JSON.stringify(after)+'\n');fs.writeFileSync(dir+'plans.json',JSON.stringify(plans));fs.writeFileSync(dir+'profile-compaction.json',JSON.stringify({removed,maxError,tolerance:.0005,horizontalCornersPreserved:true,rows:changes},null,2));console.log(JSON.stringify({removed,maxError}));process.exit(0);
}
const ids=new Set(plans.map(p=>p.roadId)),structural=(map:CityMapData)=>JSON.stringify({...map,version:0,roads:map.roads.map(r=>({...r,centerline:[],pavementSurface:undefined,elevationMode:undefined,curve:undefined}))});
assert.equal(structural(before),structural(after),'road metadata, objects, signals, links and navigation topology must remain unchanged');assert.equal(before.roads.length,after.roads.length);
for(const r of before.roads)if(!ids.has(r.id))assert.deepEqual(r,after.roads.find(a=>a.id===r.id),'Unreviewed road changed: '+r.id);
const frozen=JSON.parse(fs.readFileSync(dir+'frozen.json','utf8'));for(const [path,hash]of Object.entries(frozen))assert.equal(createHash('sha256').update(fs.readFileSync(path)).digest('hex'),hash,'Frozen runtime/physics changed: '+path);
const kernel=new CityEditingKernel(loadCityMap(structuredClone(after))),oldKernel=new CityEditingKernel(loadCityMap(structuredClone(before))),rows:any[]=[],newErrors:any[]=[];
for(const [i,p]of plans.entries()){
  const b=before.roads.find(r=>r.id===p.roadId)!,a=after.roads.find(r=>r.id===p.roadId)!,bp=roadPoints(b),ap=roadPoints(a),bprof=rampProfile(b),aprof=rampProfile(a),table=stations(ap);
  for(const end of [0,-1]){const u=bp.at(end)!,v=ap.at(end)!;assert(distance(u,v)<1e-8&&Math.abs((u.y??0)-(v.y??0))<1e-8,'Endpoint changed: '+p.roadId);}
  const maxXZ=Math.max(...ap.map(v=>project(bp,v).distance),...bp.map(v=>project(ap,v).distance)),maxY=Math.max(...ap.map(v=>Math.abs((v.y??0)-(project(bp,v).point.y??0))));
  assert(aprof.maxGrade<=Math.max(.12,bprof.maxGrade)+.0021,'New excessive grade: '+p.roadId);assert(aprof.maxGradeBreak<=Math.max(.04,bprof.maxGradeBreak)+.0021,'New grade discontinuity: '+p.roadId);
  const warnings=kernel.validateRoad(p.roadId),oldWarnings=oldKernel.validateRoad(p.roadId),key=(w:any)=>[w.code,...w.ids.slice().sort(),w.message].join('|'),oldKeys=new Set(oldWarnings.filter(w=>w.severity==='error').map(key)),errors=warnings.filter(w=>w.severity==='error'&&!oldKeys.has(key(w)));newErrors.push(...errors.map(e=>({...e,reviewedRoad:p.roadId})));
  let focus=table[Math.floor(table.length/2)]!,change=-1;for(let j=0;j<ap.length;j++){const hit=project(bp,ap[j]!),delta=Math.abs((ap[j]!.y??0)-(hit.point.y??0))+hit.distance*.1;if(delta>change){change=delta;focus=table[j]!;}}
  p.before=bprof;p.after=aprof;p.maxY=maxY;p.maxXZ=maxXZ;p.focusFraction=focus/aprof.length;p.profile=undefined;
  rows.push({roadId:p.roadId,corridor:p.corridor,category:p.category,maxY,maxXZ,endpointXYZPreserved:true,metadataAndTopologyPreserved:true,before:bprof,after:aprof,newErrors:errors,warnings,priorWarnings:oldWarnings});
  if(i%30===0)console.log(JSON.stringify({validated:i+1,total:plans.length,newErrors:newErrors.length}));
}
const result={valid:newErrors.length===0,mapBefore:before.version,mapAfter:after.version,changedRoads:plans.length,physicsAndSupportAlgorithmsFrozen:true,metadataAndTopologyPreserved:true,method:'Changed roads only: authoring kernel per-road validation plus complete longitudinal profiles, fixed-distance horizontal curvature and endpoint/metadata checks. Cross-road footprint clearance is independently checked in crossing-clearance-audit.json.',newErrors,rows};
fs.writeFileSync(dir+'changed-region-validation.json',JSON.stringify(result));fs.writeFileSync(dir+'plans.json',JSON.stringify(plans));console.log(JSON.stringify({valid:result.valid,changedRoads:rows.length,newErrors:newErrors.length,maxY:Math.max(...rows.map(r=>r.maxY)),maxXZ:Math.max(...rows.map(r=>r.maxXZ))}));if(!result.valid)process.exitCode=1;
