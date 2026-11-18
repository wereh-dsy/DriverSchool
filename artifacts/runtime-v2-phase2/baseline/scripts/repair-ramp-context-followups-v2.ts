import fs from 'node:fs';
import type {CityMapData} from '../src/world/city/CityMapData';
import {roadPoints} from '../src/world/city/geometry';
import {stations} from '../src/editor/MapAnalysis';
import {rampProfile,rampOverlaps} from '../src/editor/RampProfileAudit';
import {fitCorridorRoad,corridorLocalMap} from '../src/editor/RampCorridorRepair';
const dir='artifacts/ramp-profile-audit/round2/',map:CityMapData=JSON.parse(fs.readFileSync(dir+'candidate-map.json','utf8')),plans:any[]=JSON.parse(fs.readFileSync(dir+'plans.json','utf8')),attempts:any[]=JSON.parse(fs.readFileSync(dir+'attempts.json','utf8')),reviews:any[]=JSON.parse(fs.readFileSync(dir+'reviewed.json','utf8'));
// The flat frontage turn was omitted from the first-round owner inventory.
// Keep its already sampled horizontal curve exactly; adjust the lower road,
// rather than the established mainline bridge above it.
const id='v91-ew-east-turn',source=map.roads.find(r=>r.id===id)!,baked={...source,curve:'polyline' as const,centerline:roadPoints(source)},working={...map,roads:map.roads.map(r=>r.id===id?baked:r)},overlaps=rampOverlaps(corridorLocalMap(working,baked));let best:any;
for(const scale of [18,32,56]){const index=attempts.length,record:any={roadId:id,kind:'complete corridor follow-up: lower frontage underpass, baked existing XZ curve',scale,accepted:false};attempts.push(record);for(const roadId of ['ew-wb-split-4','ew-eb-split-split-2-split-split-split'])reviews.find(r=>r.roadId===roadId)!.attemptIndices.push(index);
  try{const fit=fitCorridorRoad(working,id,overlaps,{scale,clearanceTarget:6.15,clearanceMargin:.012});record.metrics={maxY:fit.maxY,maxGrade:fit.after.maxGrade,maxGradeBreak:fit.after.maxGradeBreak};if(!best||fit.after.maxGradeBreak<best.after.maxGradeBreak)best={...fit,index};}catch(e){record.error=(e as Error).message;}
}
if(best){map.roads[map.roads.findIndex(r=>r.id===id)]=best.road;plans.push({roadId:id,category:'C',corridor:source.groupId,road:best.road,before:best.before,after:best.after,maxY:best.maxY,maxXZ:0,shared:best.shared,constraints:best.constraints,attempt:best.index});attempts[best.index].accepted=true;console.log(JSON.stringify({roadId:id,maxY:best.maxY,grade:best.after.maxGrade,gradeBreak:best.after.maxGradeBreak}));}
// The 0.35mm nominal-layer undershoot is within footprint comparison tolerance,
// but must not turn a previously verified 6m crossing into an unresolved one.
const lingang=map.roads.find(r=>r.id==='regional:lingang:E-to-S-star')!,s=stations(roadPoints(lingang)),ease=(x:number)=>{x=Math.max(0,Math.min(1,x));return x*x*x*(10+x*(-15+6*x));};
lingang.centerline=lingang.centerline.map((p,i)=>{const station=s[i]!,w=station<544?ease((station-524)/20):station>574?ease((594-station)/20):1;return {...p,y:(p.y??0)+.002*w};});
const lplan=plans.find(p=>p.roadId===lingang.id)!;lplan.road=lingang;lplan.nominalLayerCorrection={range:[524,594],plateau:[544,574],delta:.002,reason:'Eliminate 0.35mm sub-nominal 6m footprint undershoot without altering thresholds'};attempts.push({roadId:lingang.id,kind:'2mm nominal-layer restoration',accepted:true,range:[524,594],delta:.002});reviews.find(r=>r.roadId===lingang.id)!.attemptIndices.push(attempts.length-1);
fs.writeFileSync(dir+'candidate-map.json',JSON.stringify(map)+'\n');fs.writeFileSync(dir+'plans.json',JSON.stringify(plans));fs.writeFileSync(dir+'attempts.json',JSON.stringify(attempts));fs.writeFileSync(dir+'reviewed.json',JSON.stringify(reviews));
