import fs from 'node:fs';
import {roadPoints,roadEdges} from '../src/world/city/geometry';
import {roadFunction} from '../src/world/city/RoadClassification';
import type {CityMapData} from '../src/world/city/CityMapData';
import {rampOverlaps,rampProfile,type RampOverlap} from '../src/editor/RampProfileAudit';
import {fitCorridorRoad,corridorLocalMap} from '../src/editor/RampCorridorRepair';
import {bounds,overlaps,project} from '../src/editor/EditorGeometry';
import {objectBounds,objectSize} from '../src/editor/MapObjectGeometry';
const dir='artifacts/ramp-profile-audit/round2/',map:CityMapData=JSON.parse(fs.readFileSync(dir+'candidate-map.json','utf8')),baseline:CityMapData=JSON.parse(fs.readFileSync(dir+'before-map.json','utf8')),scan=JSON.parse(fs.readFileSync(dir+'current-scan.json','utf8')),plans:any[]=JSON.parse(fs.readFileSync(dir+'plans.json','utf8')),attempts:any[]=JSON.parse(fs.readFileSync(dir+'attempts.json','utf8')),reviews:any[]=JSON.parse(fs.readFileSync(dir+'reviewed.json','utf8'));
const key=(o:RampOverlap)=>o.roadIds.join('|');
function metrics(regions:RampOverlap[],id:string){const own=regions.filter(o=>o.roadIds.includes(id)&&o.roadIds[0]!==o.roadIds[1]),shared=own.filter(o=>o.minGap<2.5&&o.maxGap>.05),clear=own.filter(o=>o.minGap>=2.5&&o.minClearance<5.5&&o.maxGap-o.minGap>=.03);return {shared:shared.length,clearance:clear.length,sharedPeak:Math.max(0,...shared.map(o=>o.maxGap)),score:shared.reduce((a,o)=>a+20+Math.min(10,o.maxGap)*2,0)+clear.length*15};}
const roadArg=process.argv.indexOf('--road'),plateauMode=process.argv.includes('--plateau');
for(const row of scan.rows.sort((a:any,b:any)=>a.category.localeCompare(b.category))){
  if(roadArg>=0&&row.roadId!==process.argv[roadArg+1])continue;
  const original=map.roads.find(r=>r.id===row.roadId)!;if(roadFunction(original)!=='ramp'||!row.issues.length)continue;
  const profile=rampProfile(original),local=corridorLocalMap(map,original),prior=rampOverlaps(local),old=metrics(prior,original.id),review=reviews.find(r=>r.roadId===original.id),ranges:[number,number][]=[],plateaus=new Map<string,[number,number]>();
  // A local bow ends outside the overlap and retains both mouths; try each
  // physical conflict in the complete corridor, rather than moving its nodes.
  for(const issue of row.issues){const k=issue.roadIds[0]===original.id?0:1,r=issue.stationRanges[k],center=(r[0]+r[1])/2,half=Math.max(90,(r[1]-r[0])/2+65),range:[number,number]=[Math.max(7,center-half),Math.min(profile.length-7,center+half)];if(range[1]-range[0]>=40&&!ranges.some(t=>Math.abs(t[0]-range[0])+Math.abs(t[1]-range[1])<25)){ranges.push(range);plateaus.set(range.join(','),r);}}
  if(profile.length<600)ranges.push([7,profile.length-7]);let best:any;
  for(const range of ranges)for(const offset of [-6,6,-10,10,-14,14,-18,18]){
    const plateau=plateauMode?plateaus.get(range.join(',')):undefined,attempt:any={roadId:original.id,kind:plateau?'flat-top local horizontal separation':'local horizontal separation',range,plateau,offset,accepted:false};attempts.push(attempt);review.attemptIndices.push(attempts.length-1);
    try{
      const fit=fitCorridorRoad(map,original.id,prior,{lateralOffset:offset,offsetRange:range,offsetPlateau:plateau,geometryOnly:true}),next={...local,roads:local.roads.map(r=>r.id===original.id?fit.road:r)},fresh=rampOverlaps(next),now=metrics(fresh,original.id);
      const radiusFloor=Math.min(profile.minRadius??1e6,(original.speedLimit/3.6)**2/(.35*9.81))*.8;
      if((fit.after.minRadius??1e6)<radiusFloor)throw new Error('Curve radius below retained-speed envelope '+radiusFloor.toFixed(2));
      if(fit.after.maxGrade>Math.max(.12,profile.maxGrade)+.001||fit.after.maxGradeBreak>Math.max(.04,profile.maxGradeBreak)+.001)throw new Error('Worse longitudinal grade/break');
      const bad=fresh.filter(o=>o.roadIds.includes(original.id)&&o.roadIds[0]!==o.roadIds[1]).flatMap(o=>{const old=prior.filter(p=>key(p)===key(o)&&p.stationRanges.every((s,i)=>s[0]<=o.stationRanges[i]![1]+20&&s[1]>=o.stationRanges[i]![0]-20)),wasIntersecting=old.some(p=>p.minGap<2.5&&p.stationRanges.every((s,i)=>s[0]<=o.stationRanges[i]![1]&&s[1]>=o.stationRanges[i]![0]));return o.minGap>=2.5?(!wasIntersecting&&old.some(p=>p.minGap>=2.5)&&o.minGap<Math.min(...old.filter(p=>p.minGap>=2.5).map(p=>p.minGap))-.005?['compressed crossing '+o.roadIds.join('/')]:[]):o.maxGap>Math.max(.05,...old.filter(p=>p.minGap<2.5).map(p=>p.maxGap))+.015?['new/worse shared pavement '+o.roadIds.join('/')]:[];});if(bad.length)throw new Error(bad.join('; '));
      const path=roadPoints(fit.road),oldPath=roadPoints(baseline.roads.find(r=>r.id===original.id)!),half=Math.max(-roadEdges(original).left,roadEdges(original).right),box=bounds(path,8);
      const intrusions=map.objects.filter(o=>{if(!overlaps(box,objectBounds(o)))return false;const size=objectSize(o);if(size.height<.5)return false;const p=project(path,o.position),b=project(oldPath,o.position),radius=Math.hypot(size.width,size.depth)/2,y=p.point.y??0,oy=o.position.y??0;return y<=oy+size.height+.5&&y+2>=oy&&p.distance<half+radius+.5&&b.distance>=half+radius+.5;});if(intrusions.length)throw new Error('New object intrusion '+intrusions.slice(0,4).map(o=>o.id).join(','));
      attempt.metrics={...now,radius:fit.after.minRadius,maxGrade:fit.after.maxGrade,maxGradeBreak:fit.after.maxGradeBreak};if(now.score>=old.score-.1)throw new Error('No physical conflict improvement');
      const score=now.score+Math.abs(offset)*.02;if(!best||score<best.score)best={...fit,score,metrics:now,attempt:attempts.length-1,range,offset};
    }catch(e){attempt.error=(e as Error).message;}
  }
  if(best){map.roads[map.roads.findIndex(r=>r.id===original.id)]=best.road;attempts[best.attempt].accepted=true;const previous=plans.find(p=>p.roadId===original.id);if(previous)Object.assign(previous,{road:best.road,after:best.after,geometryRepair:{range:best.range,offset:best.offset,before:old,after:best.metrics},attempt:best.attempt});else plans.push({roadId:original.id,category:row.category,corridor:review.corridor,road:best.road,before:best.before,after:best.after,profile:best.profile,maxY:0,maxXZ:best.maxXZ,geometryRepair:{range:best.range,offset:best.offset,before:old,after:best.metrics},attempt:best.attempt});console.log(JSON.stringify({id:original.id,before:old,after:best.metrics,offset:best.offset,range:best.range}));}
}
fs.writeFileSync(dir+'candidate-map.json',JSON.stringify(map)+'\n');fs.writeFileSync(dir+'plans.json',JSON.stringify(plans));fs.writeFileSync(dir+'attempts.json',JSON.stringify(attempts));fs.writeFileSync(dir+'reviewed.json',JSON.stringify(reviews));console.log(JSON.stringify({modified:plans.length,attempts:attempts.length}));
