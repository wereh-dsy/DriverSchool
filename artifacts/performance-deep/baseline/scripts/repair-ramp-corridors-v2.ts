import fs from 'node:fs';
import {roadPoints,roadEdges} from '../src/world/city/geometry';
import {roadFunction} from '../src/world/city/RoadClassification';
import type {CityMapData} from '../src/world/city/CityMapData';
import {rampOverlaps,rampProfile,type RampOverlap} from '../src/editor/RampProfileAudit';
import {fitCorridorRoad,corridorLocalMap} from '../src/editor/RampCorridorRepair';
import {bounds,overlaps,project} from '../src/editor/EditorGeometry';
import {objectBounds,objectSize} from '../src/editor/MapObjectGeometry';

const root='artifacts/ramp-profile-audit/',dir=root+'round2/',baseline:CityMapData=JSON.parse(fs.readFileSync(dir+'before-map.json','utf8')),refine=process.argv.includes('--refine'),retain=process.argv.includes('--retain-clearance'),nominal=process.argv.includes('--nominal-structure'),map:CityMapData=refine?JSON.parse(fs.readFileSync(dir+'candidate-map.json','utf8')):structuredClone(baseline);
const deferred:any[]=JSON.parse(fs.readFileSync(dir+'baseline-deferred.json','utf8')).rows,cached=JSON.parse(fs.readFileSync(root+'after-final-diagnosis.json','utf8')),regions:any[]=JSON.parse(fs.readFileSync(dir+'baseline-crossing-clearance-audit.json','utf8')).regions;
const bySource=new Map(baseline.roads.map(r=>[r.id,r])),cachedProfiles=new Map<string,any>(cached.inventory.map((r:any)=>[r.roadId,r.profile])),attempts:any[]=refine?JSON.parse(fs.readFileSync(dir+'attempts.json','utf8')):[],plans:any[]=refine?JSON.parse(fs.readFileSync(dir+'plans.json','utf8')):[],visited:any[]=refine?JSON.parse(fs.readFileSync(dir+'reviewed.json','utf8')):[],changedIds=new Set<string>();
const scope=new Set(deferred.map(r=>r.roadId)),category=new Map(deferred.map(r=>[r.roadId,r.category]));
const key=(r:RampOverlap)=>[...r.roadIds].sort().join('|');
function localGate(before:CityMapData,after:CityMapData,id:string){
  const prior=rampOverlaps(corridorLocalMap(before,before.roads.find(r=>r.id===id)!)),fresh=rampOverlaps(corridorLocalMap(after,after.roads.find(r=>r.id===id)!)),bad:string[]=[],related=fresh.filter(r=>r.roadIds.includes(id)&&r.roadIds[0]!==r.roadIds[1]);
  for(const r of related){const old=prior.filter(p=>key(p)===key(r)&&p.stationRanges.every((s,i)=>s[0]<=r.stationRanges[i]![1]+20&&s[1]>=r.stationRanges[i]![0]-20));
    if(r.minGap>=2.5){const separated=old.filter(p=>p.minGap>=2.5),wasIntersecting=old.some(p=>p.minGap<2.5&&p.stationRanges.every((s,i)=>s[0]<=r.stationRanges[i]![1]&&s[1]>=r.stationRanges[i]![0]));if(!wasIntersecting&&separated.length&&r.minGap<Math.min(...separated.map(p=>p.minGap))-.005)bad.push('clearance decreased '+r.roadIds.join('/')+' '+r.minGap.toFixed(3));}
    else if(r.maxGap>.05&&r.maxGap>Math.max(.05,...old.filter(p=>p.minGap<2.5).map(p=>p.maxGap))+.015)bad.push('new/worse shared pavement '+r.roadIds.join('/')+' '+r.maxGap.toFixed(3));
  }
  const own=related.filter(r=>r.minGap<2.5&&r.maxGap>.05),clear=related.filter(r=>r.minGap>=2.5&&r.minClearance<5.5&&r.maxGap-r.minGap>=.03);
  return {bad,remainingShared:own.length,remainingClearance:clear.length,sharedPeak:Math.max(0,...own.map(r=>r.maxGap)),crossingFloor:Math.min(Infinity,...related.filter(r=>r.minGap>=2.5).map(r=>r.minClearance)),nominalDeficit:related.filter(r=>r.minGap>=2.5).reduce((n,r)=>n+Math.max(0,6-r.minGap),0),priorShared:prior.filter(r=>r.roadIds.includes(id)&&r.roadIds[0]!==r.roadIds[1]&&r.minGap<2.5&&r.maxGap>.05).length};
}
function newObjectIntrusions(id:string,after:CityMapData){const road=after.roads.find(r=>r.id===id)!,old=bySource.get(id)!,path=roadPoints(road),oldPath=roadPoints(old),box=bounds(path,8),half=Math.max(-roadEdges(road).left,roadEdges(road).right),hits:string[]=[];for(const o of baseline.objects){if(!overlaps(box,objectBounds(o)))continue;const size=objectSize(o);if(size.height<.5)continue;const point=project(path,o.position),oldPoint=project(oldPath,o.position),radius=Math.hypot(size.width,size.depth)/2,oy=o.position.y??0,y=point.point.y??0;if(y>oy+size.height+.5||y+2<oy)continue;if(point.distance<half+radius+.5&&oldPoint.distance>=half+radius+.5)hits.push(o.id);}return hits;}

const ordered=[...deferred].sort((a,b)=>a.category.localeCompare(b.category));
for(const [index,row]of ordered.entries()){
  const original=map.roads.find(r=>r.id===row.roadId)!,profile=refine?rampProfile(original):cachedProfiles.get(row.roadId)??rampProfile(original),ownRegions=regions.filter(r=>r.roadIds.includes(row.roadId)&&r.review==='DEFER_COMPLEX'),isOwner=roadFunction(original)==='ramp'||roadFunction(original)!=='expressway'||profile.maxGradeBreak>.04;
  const contextIds=new Set([row.roadId,...ownRegions.flatMap(r=>r.roadIds)]),review={roadId:row.roadId,category:row.category,corridor:original.groupId??original.roadNameId??original.id,contextRoadIds:[...contextIds],sourceIssues:row.remaining,profile:profile,attemptIndices:[] as number[],role:isOwner?'repair-owner':'reference-mainline'};
  const priorReview=visited.findIndex(r=>r.roadId===row.roadId);if(priorReview>=0){review.attemptIndices.push(...visited[priorReview].attemptIndices);visited[priorReview]=review;}else visited.push(review);if(!isOwner)continue;if(refine){const remaining=localGate(map,map,row.roadId);if(!remaining.remainingShared&&!remaining.remainingClearance&&profile.maxGradeBreak<=.04)continue;}
  const currentOverlaps=refine||changedIds.size?undefined:cached.overlaps;
  let best:any=null;
  const offsets=retain||nominal?[0]:roadFunction(original)==='ramp'&&profile.length<600?[0,-3,3,-6,6,-10,10]:[0];
  for(const offset of offsets){
    for(const scale of [18,32,56]){
      const record:any={roadId:row.roadId,offset,scale,retainClearance:retain,nominalStructure:nominal,accepted:false};review.attemptIndices.push(attempts.length);attempts.push(record);
      try{
        const localOld=corridorLocalMap(map,original),own=currentOverlaps??rampOverlaps(localOld);
        const fit=fitCorridorRoad(map,row.roadId,own,{scale,lateralOffset:offset,templateDatums:refine&&!retain&&!nominal,...(retain?{clearanceTarget:0,clearanceMargin:0}:nominal?{clearanceTarget:6,clearanceMargin:.004}:{})}),next={...map,roads:map.roads.map(r=>r.id===row.roadId?fit.road:r)};
        const gate=localGate(map,next,row.roadId);record.metrics={maxGrade:fit.after.maxGrade,maxGradeBreak:fit.after.maxGradeBreak,maxY:fit.maxY,maxXZ:fit.maxXZ,...gate};
        if(gate.bad.length)throw new Error(gate.bad.join('; '));if(offset){const intrusions=newObjectIntrusions(row.roadId,next);if(intrusions.length)throw new Error('New roadside object intrusion: '+intrusions.slice(0,5).join(','));if((fit.after.minRadius??999)<Math.min(15,profile.minRadius??999)-.5)throw new Error('Horizontal correction creates a tighter curve');}
        const maxStep=Math.max(...fit.road.centerline.map((p,i)=>i?Math.hypot(p.x-fit.road.centerline[i-1]!.x,p.z-fit.road.centerline[i-1]!.z):0));record.maxSegment=maxStep;
        const datumCovered=fit.datumEvidence.length;const score=gate.remainingShared*20+(nominal?gate.nominalDeficit*30:Math.max(0,gate.remainingClearance-datumCovered)*15)+fit.after.maxGradeBreak*100+Math.abs(offset)*.02;
        if(!best||score<best.score)best={...fit,gate,score,attempt:attempts.length-1};
        if(!gate.remainingShared&&!gate.remainingClearance&&fit.after.maxGradeBreak<=.04)break;
      }catch(e){record.error=String(e);}
    }
    if(best&&!best.gate.remainingShared&&!best.gate.remainingClearance&&best.after.maxGradeBreak<=.04)break;
  }
  if(best){const priorErrors=ownRegions.filter(r=>r.review==='DEFER_COMPLEX').length,improved=best.gate.remainingShared+best.gate.remainingClearance<priorErrors||best.after.maxGradeBreak<profile.maxGradeBreak*.8||nominal&&best.gate.nominalDeficit<localGate(map,map,row.roadId).nominalDeficit-.01;
    if(improved&&best.maxY>.001||improved&&best.maxXZ>0||refine&&best.datumEvidence.length&&best.maxY>.001){map.roads[map.roads.findIndex(r=>r.id===row.roadId)]=best.road;changedIds.add(row.roadId);attempts[best.attempt].accepted=true;const priorPlan=plans.findIndex(p=>p.roadId===row.roadId);if(priorPlan>=0)plans.splice(priorPlan,1);plans.push({roadId:row.roadId,category:row.category,corridor:review.corridor,profile:best.profile,before:best.before,after:best.after,maxY:best.maxY,maxXZ:best.maxXZ,road:best.road,shared:best.shared,constraints:best.constraints,datumEvidence:best.datumEvidence,gate:best.gate,attempt:best.attempt});}}
  if(index%20===0)console.log(JSON.stringify({reviewed:index+1,total:ordered.length,changed:plans.length,attempts:attempts.length}));
}
map.version=baseline.version+1;fs.writeFileSync(dir+'candidate-map.json',JSON.stringify(map)+'\n');fs.writeFileSync(dir+'plans.json',JSON.stringify(plans));fs.writeFileSync(dir+'attempts.json',JSON.stringify(attempts,null,2));fs.writeFileSync(dir+'reviewed.json',JSON.stringify(visited));
console.log(JSON.stringify({reviewed:visited.length,changed:plans.length,attempts:attempts.length,offsetChanges:plans.filter(p=>p.maxXZ>0).map(p=>({id:p.roadId,xz:p.maxXZ})),errors:attempts.filter(p=>p.error).slice(0,4).map(p=>({id:p.roadId,error:p.error}))},null,2));
