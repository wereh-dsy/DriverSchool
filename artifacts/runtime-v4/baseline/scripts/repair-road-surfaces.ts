import fs from 'node:fs';
import type {CityMapData,CityPoint} from '../src/world/city/CityMapData';
import {roadPoints,roadEdges,sampleAt,polylineLength} from '../src/world/city/geometry';
import {roadEdgeChains} from '../src/world/city/RoadEdgeChain';
import {stations} from '../src/editor/MapAnalysis';
import {rampProfile,rampOverlaps} from '../src/editor/RampProfileAudit';
import {bounds,overlaps,distance,project} from '../src/editor/EditorGeometry';
import {localMap,profileSummary} from './InterchangeDesign';
const dir='artifacts/interchange-integrated-audit/',before:CityMapData=JSON.parse(fs.readFileSync(dir+'road-surface-baseline-map.json','utf8')),audit=JSON.parse(fs.readFileSync(dir+'road-surface-baseline-sampling.json','utf8')),diagnostic=JSON.parse(fs.readFileSync(dir+'surface-root-cause-diagnostics.json','utf8')),after=structuredClone(before),rows:any[]=[],attempts:any[]=[];
after.version=488;
// Use the existing exact ribbon contact model only on demonstrated mismatches
// and their recorded competing surfaces. Road geometry and support policy stay intact.
const ribbonIds=new Set<string>();
for(const row of audit.rows)if(row.maxMeshContactError>.003){ribbonIds.add(row.roadId);for(const w of row.worst)if(w.chosenRoad)ribbonIds.add(w.chosenRoad);}
for(const row of diagnostic.folds)ribbonIds.add(row.roadId);
for(const road of after.roads)if(ribbonIds.has(road.id)&&road.pavementSurface!=='ribbon'){rows.push({roadId:road.id,kind:'MATCH_EXISTING_RENDERED_RIBBON',before:road.pavementSurface??'segment-plane',after:'ribbon',geometryUnchanged:true});road.pavementSurface='ribbon';}
const folds=(map:CityMapData,id:string)=>{
 const r=map.roads.find(r=>r.id===id)!,e=roadEdges(r),c=roadEdgeChains(map),a=c.edge(r,e.left),b=c.edge(r,e.right);let count=0;
 for(let i=1;i<a.length;i++)for(const [p,q,s]of [[a[i-1]!,b[i-1]!,a[i]!],[b[i-1]!,b[i]!,a[i]!]])if((q!.x-p!.x)*(s!.z-p!.z)-(q!.z-p!.z)*(s!.x-p!.x)>1e-8)count++;
 return count;
};
// A physical-distance C1 patch replaces only the tiny corner containing an
// inverted strip. Endpoints and all external connections remain fixed.
for(const id of [...new Set<string>(diagnostic.folds.map((r:any)=>r.roadId))]){
 const original=after.roads.find(r=>r.id===id)!,path=roadPoints(original),s=stations(path),L=s.at(-1)!,events=diagnostic.folds.filter((f:any)=>f.roadId===id),intervals:{start:number;end:number}[]=[];
 for(const e of events){const span=Math.max(18,roadEdges(original).width*1.7),start=Math.max(0,e.station-span),end=Math.min(L,e.station+e.centreSegmentLength+span),prior=intervals.at(-1);if(prior&&start<prior.end)prior.end=Math.max(prior.end,end);else intervals.push({start,end});}
 const patched:CityPoint[]=[];let cursor=0;
 for(const interval of intervals){
  while(cursor<path.length&&s[cursor]!<interval.start){patched.push(path[cursor]!);cursor++;}
  const a=sampleAt(path,interval.start),b=sampleAt(path,interval.end),span=interval.end-interval.start,chord=Math.hypot(b.point.x-a.point.x,b.point.z-a.point.z),handle=Math.min(span,chord*1.1),n=Math.ceil(span/2);
  for(let i=0;i<=n;i++){const t=i/n,u=1-t,h00=2*t*t*t-3*t*t+1,h10=t*t*t-2*t*t+t,h01=-2*t*t*t+3*t*t,h11=t*t*t-t*t,old=sampleAt(path,interval.start+span*t).point;
   patched.push({x:h00*a.point.x+h10*a.tangent.x*handle+h01*b.point.x+h11*b.tangent.x*handle,y:old.y,z:h00*a.point.z+h10*a.tangent.z*handle+h01*b.point.z+h11*b.tangent.z*handle});
  }while(cursor<path.length&&s[cursor]!<=interval.end)cursor++;
 }patched.push(...path.slice(cursor));
 const proposal=structuredClone(after),r=proposal.roads.find(r=>r.id===id)!;r.centerline=patched.filter((p,i,a)=>!i||distance(p,a[i-1]!)>.05);r.curve='polyline';r.elevationMode='custom';delete r.elevation;
 const count=folds(proposal,id),p=rampProfile(r),prior=rampProfile(original),neighbours=before.roads.filter(q=>overlaps(bounds(roadPoints(q),25),bounds(path,25))).map(q=>q.id),oldCross=rampOverlaps(localMap(after,neighbours)),fresh=rampOverlaps(localMap(proposal,neighbours)),conflicts=fresh.filter(o=>o.roadIds.includes(id)).filter(o=>{
  const old=oldCross.filter(v=>v.roadIds.slice().sort().join('|')===o.roadIds.slice().sort().join('|')).sort((a,b)=>distance(a.point,o.point)-distance(b.point,o.point))[0];
  return old?old.minGap>5.65&&o.minGap<old.minGap-.001||old.maxGap<=.04&&o.maxGap>.04:o.maxGap>.04&&o.minGap<6.15;
 });
 const valid=!count&&p.maxGrade<=Math.max(prior.maxGrade,.12)+.001&&p.maxGradeBreak<=Math.max(prior.maxGradeBreak,.04)+.001&&!conflicts.length;
 attempts.push({roadId:id,kind:'LOCAL_C1_STRIP_REPAIR',intervals,beforeFolds:events.length,afterFolds:count,before:profileSummary(original),after:profileSummary(r),crossings:conflicts,valid,beforeCenterline:original.centerline,proposedCenterline:r.centerline});
 if(valid){after.roads[after.roads.findIndex(r=>r.id===id)]=r;rows.push({roadId:id,kind:'LOCAL_C1_STRIP_REPAIR',intervals,beforeFolds:events.length,afterFolds:count,beforeCenterline:original.centerline,afterCenterline:r.centerline,maxXZ:path.reduce((v,p)=>Math.max(v,project(patched,p).distance),0)});}
}
fs.writeFileSync(dir+'surface-repair-attempts.json',JSON.stringify(attempts,null,2));
fs.writeFileSync(dir+'surface-geometry-changes.json',JSON.stringify({baselineVersion:before.version,candidateVersion:after.version,rows},null,2));
fs.writeFileSync(dir+'surface-candidate-map.json',JSON.stringify(after,null,2)+'\n');
console.log(JSON.stringify({ribbonChanges:rows.filter(r=>r.geometryUnchanged).length,foldRepairs:attempts.filter(r=>r.valid).length,foldDeferred:attempts.filter(r=>!r.valid).map(r=>({id:r.roadId,folds:r.afterFolds,crossings:r.crossings.length})),roads:new Set(rows.map(r=>r.roadId)).size}));
