import fs from 'node:fs';
import {roadPoints,sampleAt} from '../src/world/city/geometry';
import {roadFunction} from '../src/world/city/RoadClassification';
import {stations} from '../src/editor/MapAnalysis';
import {project} from '../src/editor/EditorGeometry';
import {diagnoseRampProfiles,fitRampProfile,rampProfile,compactRampProfile} from '../src/editor/RampProfileAudit';
import {applyReviewedPavementProfile} from '../src/editor/ElevationSeams';
import type {CityMapData,CityRoad} from '../src/world/city/CityMapData';

const dir='artifacts/ramp-profile-audit',before:CityMapData=JSON.parse(fs.readFileSync(dir+'/before-map.json','utf8')),map=structuredClone(before),d:ReturnType<typeof diagnoseRampProfiles>=JSON.parse(fs.readFileSync(dir+'/before-diagnosis.json','utf8'));
const roads=new Map(before.roads.map(r=>[r.id,r])),activeRoads=new Map(map.roads.map(r=>[r.id,r])),rows=new Map(d.inventory.map(r=>[r.roadId,r])),plans:any[]=[],deferred:any[]=[];
const corrections:{roadId:string;start:number;end:number;delta:number}[]=fs.existsSync(dir+'/clearance-corrections.json')?JSON.parse(fs.readFileSync(dir+'/clearance-corrections.json','utf8')):[];
const neighbors=new Map<string,Set<string>>();for(const l of before.roadLinks??[])for(const [a,b]of [[l.from.roadId,l.to.roadId],[l.to.roadId,l.from.roadId]]){const set=neighbors.get(a!)??new Set<string>();set.add(b!);neighbors.set(a!,set);}
for(const row of [...d.inventory].sort((a,b)=>a.category.localeCompare(b.category))){
  const road=roads.get(row.roadId)!,path=roadPoints(road),table=stations(path),length=table.at(-1)!;
  if(road.curve==='smooth'){if(row.reviewCues.length)deferred.push({roadId:road.id,reason:'Authored smooth XZ needs an explicit geometry review before resampling.'});continue;}
  const ownOverlaps=row.overlapIndices.map(i=>d.overlaps[i]!);
  const parents=new Set<string>();for(const seed of row.attachments.map(a=>roads.get(a.roadId)!)){if(roadFunction(seed)==='ramp')continue;let frontier=[seed.id];parents.add(seed.id);for(let depth=0;depth<4;depth++){const next:string[]=[];for(const id of frontier)for(const n of neighbors.get(id)??[]){const r=roads.get(n)!;if(!parents.has(n)&&roadFunction(r)===roadFunction(seed)&&r.roadNameId===seed.roadNameId){parents.add(n);next.push(n);}}frontier=next;}}
  const possibleShared=ownOverlaps.filter(o=>{const k=o.roadIds[0]===road.id?0:1,other=roads.get(o.roadIds[1-k]!)!;return row.isRamp&&parents.has(other.id)&&o.alignment>.75&&o.area>.1&&(o.stationRanges[k][0]<Math.min(180,length*.35)||o.stationRanges[k][1]>length-Math.min(180,length*.35));});
  const shared:typeof possibleShared=[];let first=0,last=length,changed=true;
  while(changed){changed=false;for(const o of possibleShared){if(shared.includes(o))continue;const k=o.roadIds[0]===road.id?0:1,r=o.stationRanges[k];if(r[0]<=first+12){shared.push(o);first=Math.max(first,r[1]);changed=true;}else if(r[1]>=last-12){shared.push(o);last=Math.min(last,r[0]);changed=true;}}}
  const ownCorrections=corrections.filter(c=>c.roadId===road.id);
  const needsShared=shared.some(o=>o.maxGap>.035),needsProfile=row.profile.maxGradeBreak>.025||row.profile.extrema.length>2||ownCorrections.length>0;
  const needsRibbon=road.pavementSurface!=='ribbon'&&ownOverlaps.some(o=>o.relation==='self-overlap'&&o.maxGap>.02);
  if(!needsShared&&!needsProfile&&!needsRibbon)continue;
  const positions=[...table];for(let s=3;s<length;s+=3)if(!positions.some(t=>Math.abs(t-s)<.05))positions.push(s);positions.sort((a,b)=>a-b);
  const samples=positions.map(s=>sampleAt(path,s).point),ys=samples.map(p=>p.y??0),fixed=new Map<number,number>([[0,ys[0]!],[ys.length-1,ys.at(-1)!]]),reasons:string[]=[],conflicts:any[]=[];
  const set=(i:number,y:number,reason:string)=>{if(fixed.has(i)&&Math.abs(fixed.get(i)!-y)>.04){conflicts.push({station:positions[i],existing:fixed.get(i),target:y,reason});return;}fixed.set(i,y);};
  if(shared.length){
    for(let i=1;i<samples.length-1;i++){
      const options=shared.filter(o=>{const k=o.roadIds[0]===road.id?0:1;return positions[i]!>=o.stationRanges[k][0]-3&&positions[i]!<=o.stationRanges[k][1]+3;}).map(o=>{const k=o.roadIds[0]===road.id?0:1,other=activeRoads.get(o.roadIds[1-k]!)!,hit=project(roadPoints(other),samples[i]!);return {id:other.id,hit};}).sort((a,b)=>a.hit.distance-b.hit.distance);
      if(options.length)set(i,options[0]!.hit.point.y??0,'shared:'+options[0]!.id);
    }
    if(needsShared)reasons.push('shared pavement follows receiving/mainline height through physical overlap');
  }
  // Freeze every separate crossing region (not only its centre), with a margin.
  for(const o of ownOverlaps)if(o.minGap>=2.5&&!shared.includes(o)){const k=o.roadIds[0]===road.id?0:1;for(let i=1;i<positions.length-1;i++)if(positions[i]!>=o.stationRanges[k][0]-6&&positions[i]!<=o.stationRanges[k][1]+6)set(i,ys[i]!,'crossing');}
  if(!row.isRamp)for(const o of ownOverlaps)if(o.roadIds[0]!==o.roadIds[1]&&o.minGap<.05){const k=o.roadIds[0]===road.id?0:1;for(let i=1;i<positions.length-1;i++)if(positions[i]!>=o.stationRanges[k][0]-8&&positions[i]!<=o.stationRanges[k][1]+8)set(i,ys[i]!,'existing shared/junction landing');}
  for(const o of ownOverlaps)if(o.roadIds[0]!==o.roadIds[1]&&o.maxGap<.1){const k=o.roadIds[0]===road.id?0:1;for(let i=1;i<positions.length-1;i++)if(positions[i]!>=o.stationRanges[k][0]-4&&positions[i]!<=o.stationRanges[k][1]+4)set(i,ys[i]!,'preserve continuous shared pavement');}
  for(const j of before.intersections)for(const c of j.connections)if(c.roadId===road.id){const end=c.end==='start';for(let i=1;i<positions.length-1;i++)if(end?positions[i]!<20:length-positions[i]!<20)set(i,ys[i]!,'junction landing');}
  for(const c of ownCorrections)for(let i=1;i<positions.length-1;i++)if(positions[i]!>=c.start-6&&positions[i]!<=c.end+6){if(shared.some(o=>{const k=o.roadIds[0]===road.id?0:1;return positions[i]!>=o.stationRanges[k][0]-3&&positions[i]!<=o.stationRanges[k][1]+3;}))conflicts.push({station:positions[i],reason:'Clearance correction intersects shared pavement'});else fixed.set(i,ys[i]!+c.delta);}
  // Match a unique same-class continuation at each endpoint. Split/merge ramps
  // already inherit the parent throughout the overlap above.
  for(const end of ['start','end'] as const){const a=row.attachments.filter(a=>a.end===end&&roadFunction(roads.get(a.roadId)!)===roadFunction(road));if(a.length!==1)continue;const other=rows.get(a[0]!.roadId)?.profile??rampProfile(roads.get(a[0]!.roadId)!);const g=other.segments[a[0]!.otherEnd==='start'?0:other.segments.length-1]?.grade??0,grade=end===a[0]!.otherEnd?-g:g,i=end==='start'?1:ys.length-2,y=end==='start'?ys[0]!+grade*positions[i]!:ys.at(-1)!-grade*(length-positions[i]!);if(!fixed.has(i))set(i,y,'endpoint-tangent');}
  if(conflicts.length){deferred.push({roadId:road.id,reason:'Shared pavement constraints conflict with fixed structure/endpoint heights',conflicts});continue;}
  let target=structuredClone(road),profile=positions.map((station,i)=>({station,before:ys[i]!,after:ys[i]!}));
  try{
    if(needsProfile||needsShared){let failure:unknown;for(const scale of [18,32,56,100]){try{const result=fitRampProfile(positions,ys,fixed,scale);profile=compactRampProfile(positions.map((station,i)=>({station,before:ys[i]!,after:Math.abs(result[i]!-ys[i]!)<1e-5?ys[i]!:result[i]!})),table);target=structuredClone(road);applyReviewedPavementProfile(target,profile,8);failure=undefined;break;}catch(e){failure=e;}}if(failure)throw failure;}
    if(needsRibbon)target.pavementSurface='ribbon';
    if(target.centerline.some(p=>(p.y??0)<-50||(p.y??0)>100))throw new Error('Profile exceeds authored elevation bounds');
    const fresh=rampProfile(target),delta=Math.max(...profile.map(p=>Math.abs(p.after-p.before)));
    if(fresh.maxGrade>Math.max(.12,row.profile.maxGrade)+.001)throw new Error('Insufficient run between preserved shared/structural anchors');
    if(needsProfile)reasons.push('local curvature fit preserves full crossing regions and endpoint heights');
    if(needsRibbon)reasons.push('ribbon removes competing segment end-cap planes on graded bends');
    if(delta<.001&&!needsRibbon)continue;
    map.roads[map.roads.findIndex(r=>r.id===road.id)]=target;
    activeRoads.set(road.id,target);
    plans.push({roadId:road.id,category:row.category,reasons,classification:ownCorrections.length?'FIXED_CLEARANCE':needsShared?'FIXED_SHARED_PAVEMENT':delta>=.001?'FIXED_PROFILE':'FIXED_SUPPORT_OWNERSHIP',before:row.profile,after:fresh,maxY:delta,profile:(needsProfile||needsShared)?profile:undefined,ribbon:needsRibbon,fixedStations:fixed.size});
  }catch(e){deferred.push({roadId:road.id,reason:String(e),shared:shared.map(o=>({ids:o.roadIds,ranges:o.stationRanges,gap:o.maxGap}))});}
}
map.version=before.version+1;
fs.writeFileSync(dir+'/candidate-map.json',JSON.stringify(map)+'\n');fs.writeFileSync(dir+'/repair-plans.json',JSON.stringify(plans,null,2));fs.writeFileSync(dir+'/candidate-deferred.json',JSON.stringify(deferred,null,2));
console.log(JSON.stringify({plans:plans.length,byCategory:Object.fromEntries(['A','B','C','D'].map(c=>[c,plans.filter(p=>p.category===c).length])),deferred:deferred.length,maxY:Math.max(...plans.map(p=>p.maxY)),deferredRows:deferred.map(d=>({id:d.roadId,reason:d.reason}))},null,2));
