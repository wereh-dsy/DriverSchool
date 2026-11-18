import fs from 'node:fs';
import type {CityMapData} from '../src/world/city/CityMapData';
import {roadPoints,sampleAt,roadEdges} from '../src/world/city/geometry';
import {rampProfile,rampOverlaps} from '../src/editor/RampProfileAudit';
import {roadEdgeChains} from '../src/world/city/RoadEdgeChain';
import {bounds,overlaps,distance,project} from '../src/editor/EditorGeometry';
import {stations} from '../src/editor/MapAnalysis';
import {localMap,profileSummary} from './InterchangeDesign';
const dir='artifacts/interchange-integrated-audit/',original:CityMapData=JSON.parse(fs.readFileSync(dir+'road-surface-baseline-map.json','utf8')),map:CityMapData=JSON.parse(fs.readFileSync(dir+'surface-candidate-map.json','utf8')),initial=JSON.parse(fs.readFileSync(dir+'surface-repair-attempts.json','utf8')),rows:any[]=[];
function validate(candidate:CityMapData,id:string){
 const road=candidate.roads.find(r=>r.id===id)!,base=map.roads.find(r=>r.id===id)!,context=map.roads.filter(r=>overlaps(bounds(roadPoints(r),25),bounds([...roadPoints(road),...roadPoints(base)],25))).map(r=>r.id),before=rampOverlaps(localMap(map,context)),after=rampOverlaps(localMap(candidate,context)),conflicts:any[]=[];
 for(const o of after.filter(o=>o.roadIds.includes(id))){const old=before.filter(p=>p.roadIds.slice().sort().join('|')===o.roadIds.slice().sort().join('|')).sort((a,b)=>distance(a.point,o.point)-distance(b.point,o.point))[0];
  if(!old?o.maxGap>.04&&o.minGap<6.15:old.maxGap<=.04?o.maxGap>.04:old.minGap>=5.65?o.minGap<old.minGap-.001:o.minGap<old.minGap-.001||o.maxGap>old.maxGap+.001)conflicts.push({before:old??null,after:o});
 }
 const chain=roadEdgeChains(candidate),e=roadEdges(road),left=chain.edge(road,e.left),right=chain.edge(road,e.right);let folds=0;
 for(let i=1;i<left.length;i++)for(const [a,b,c]of [[left[i-1]!,right[i-1]!,left[i]!],[right[i-1]!,right[i]!,left[i]!]])if((b!.x-a!.x)*(c!.z-a!.z)-(b!.z-a!.z)*(c!.x-a!.x)>1e-8)folds++;
 const p=rampProfile(road),q=rampProfile(base);return {valid:!conflicts.length&&!folds&&p.maxGrade<=Math.max(.12,q.maxGrade)+.001&&p.maxGradeBreak<=Math.max(.04,q.maxGradeBreak)+.0001,conflicts,folds,before:profileSummary(base),after:profileSummary(road)};
}
for(const bias of [2,4,6]){
 const id='intercity-eb-split-split',proposal=initial.find((r:any)=>r.roadId===id),candidate=structuredClone(map),r=candidate.roads.find(r=>r.id===id)!,old=original.roads.find(r=>r.id===id)!,s=stations(roadPoints(old)),interval=proposal.intervals[0];
 r.centerline=proposal.proposedCenterline.map((p:any,i:number,points:any[])=>{const path=roadPoints(old),station=project(path,p).along;const t=Math.max(0,Math.min(1,(station-interval.start)/(interval.end-interval.start))),a=points[Math.max(0,i-1)]!,b=points[Math.min(points.length-1,i+1)]!,l=Math.hypot(b.x-a.x,b.z-a.z)||1,v=bias*Math.sin(Math.PI*t)**2;return {...p,x:p.x-(b.z-a.z)/l*v,z:p.z+(b.x-a.x)/l*v};});
 const result=validate(candidate,id);rows.push({roadId:id,plan:'Preserve the C1 turn while shifting its middle away from the neighbouring upper deck',bias,interval,...result,proposedCenterline:r.centerline});
 if(result.valid){map.roads[map.roads.findIndex(q=>q.id===id)]=r;break;}
}
for(const id of ['ring-cw-2-split-3','ring-ccw-1-split-split-split']){
 const base=map.roads.find(r=>r.id===id)!,path=roadPoints(base),s=stations(path),L=s.at(-1)!,breaks=rampProfile(base).breaks.filter(b=>b.gradeBreak>.04);
 for(const span of [20,35]){const candidate=structuredClone(map),r=candidate.roads.find(r=>r.id===id)!;r.centerline=path.map((p,i)=>{const b=breaks.find(b=>Math.abs(s[i]!-b.station)<span);if(!b)return p;const start=Math.max(0,b.station-span),end=Math.min(L,b.station+span),a=sampleAt(path,start),z=sampleAt(path,end),t=(s[i]!-start)/(end-start),h=end-start,ga=a.tangent.y??0,gz=z.tangent.y??0;return {...p,y:(2*t*t*t-3*t*t+1)*(a.point.y??0)+(t*t*t-2*t*t+t)*h*ga+(-2*t*t*t+3*t*t)*(z.point.y??0)+(t*t*t-t*t)*h*gz};});r.curve='polyline';r.elevationMode='custom';delete r.elevation;
  const result=validate(candidate,id);rows.push({roadId:id,plan:'Local C1 grade transition retaining external heights, intentional five-percent ramps and original structure envelope',span,...result,proposedCenterline:r.centerline});if(result.valid){map.roads[map.roads.findIndex(q=>q.id===id)]=r;break;}
 }
}
fs.writeFileSync(dir+'surface-residual-attempts.json',JSON.stringify(rows,null,2));
const accepted=rows.filter(r=>r.valid);if(accepted.length){const changes=JSON.parse(fs.readFileSync(dir+'surface-geometry-changes.json','utf8'));for(const row of accepted){const road=map.roads.find(r=>r.id===row.roadId)!;changes.rows.push({roadId:row.roadId,kind:'RESIDUAL_LOCAL_C1_REPAIR',plan:row.plan,bias:row.bias,span:row.span,beforeCenterline:original.roads.find(r=>r.id===row.roadId)!.centerline,afterCenterline:road.centerline});}fs.writeFileSync(dir+'surface-geometry-changes.json',JSON.stringify(changes,null,2));fs.writeFileSync(dir+'surface-candidate-map.json',JSON.stringify(map,null,2)+'\n');}
console.log(JSON.stringify(rows.map(r=>({id:r.roadId,bias:r.bias,span:r.span,valid:r.valid,folds:r.folds,conflicts:r.conflicts.length,gradeBreak:r.after.maxGradeBreak}))));
