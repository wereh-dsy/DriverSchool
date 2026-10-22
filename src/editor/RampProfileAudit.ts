import type { CityMapData, CityRoad } from '../world/city/CityMapData';
import { roadFunction } from '../world/city/RoadClassification';
import { roadPoints, sampleAt } from '../world/city/geometry';
import { EditorSpatialIndex, distance, bounds } from './EditorGeometry';
import { stations, angleDelta } from './MapAnalysis';
import { makePavementSegments, clipPavementFootprints } from './ElevationSeams';

export function rampProfile(road:CityRoad) {
  const path=roadPoints(road),s=stations(path),length=s.at(-1)??0;
  const segments=path.slice(1).map((p,i)=>({station:s[i]!,length:s[i+1]!-s[i]!,grade:((p.y??0)-(path[i]!.y??0))/Math.max(1e-8,s[i+1]!-s[i]!),heading:Math.atan2(p.x-path[i]!.x,p.z-path[i]!.z)}));
  const breaks=segments.slice(1).map((p,i)=>({station:p.station,gradeBreak:Math.abs(p.grade-segments[i]!.grade),gradeRate:Math.abs(p.grade-segments[i]!.grade)/Math.max(.001,(p.length+segments[i]!.length)/2),radius:Math.abs(angleDelta(p.heading,segments[i]!.heading))<1e-8?null:(p.length+segments[i]!.length)/2/Math.abs(angleDelta(p.heading,segments[i]!.heading)),crestSag:p.grade*segments[i]!.grade<0}));
  // A fixed distance stencil keeps the curvature cue invariant when a Y-only
  // repair adds collinear XZ samples. Per-node heading deltas alone do not.
  const ys=path.map(p=>p.y??0),radii:number[]=[];
  for(let station=5;station<length-5;station+=5){const u=sampleAt(path,station-5).point,v=sampleAt(path,station).point,w=sampleAt(path,station+5).point,area=Math.abs((v.x-u.x)*(w.z-u.z)-(v.z-u.z)*(w.x-u.x));if(area>1e-6)radii.push(distance(u,v)*distance(v,w)*distance(u,w)/(2*area));}
  return {roadId:road.id,length,start:path[0]!,end:path.at(-1)!,deltaY:ys.at(-1)!-ys[0]!,heightRange:Math.max(...ys)-Math.min(...ys),averageGrade:length?(ys.at(-1)!-ys[0]!)/length:0,maxGrade:Math.max(0,...segments.map(p=>Math.abs(p.grade))),maxGradeBreak:Math.max(0,...breaks.map(p=>p.gradeBreak)),maxGradeRate:Math.max(0,...breaks.map(p=>p.gradeRate)),minRadius:radii.length?Math.min(...radii):null,shortSegments:segments.filter(p=>p.length<1).length,extrema:breaks.filter(p=>p.crestSag).map(p=>p.station),segments,breaks,authoredNodes:road.centerline.length,pavementSurface:road.pavementSurface??'segment-plane',curve:road.curve??'polyline'};
}
export type RampOverlap={roadIds:[string,string];stationRanges:[[number,number],[number,number]];minGap:number;maxGap:number;signedMin:number;signedMax:number;area:number;alignment:number;point:{x:number;z:number};relation:string;minClearance:number;segmentPairs:number};
/** Banded variational fit: retain long grades, penalize curvature over a local
 * length scale, and eliminate reviewed hard height constraints exactly. O(n). */
export function fitRampProfile(s:readonly number[],original:readonly number[],fixed:ReadonlyMap<number,number>,scale=18,bounds?:{lower:readonly number[];upper:readonly number[]}):number[]{
  const n=s.length;if(n!==original.length||n<2||!Number.isFinite(scale)||scale<=0||original.some(y=>!Number.isFinite(y))||s.some((v,i)=>!Number.isFinite(v)||i>0&&v<=s[i-1]!))throw new Error('Invalid profile stations');
  const a=Array.from({length:n},()=>[0,0,0]),b=Array(n).fill(0) as number[];
  const add=(indices:number[],coefficients:number[],target:number,weight:number)=>{
    let t=target;indices.forEach((i,k)=>{if(fixed.has(i))t-=coefficients[k]!*fixed.get(i)!;});
    indices.forEach((i,k)=>{if(fixed.has(i))return;b[i]!+=weight*coefficients[k]!*t;indices.forEach((j,l)=>{if(j<=i&&!fixed.has(j))a[i]![i-j]!+=weight*coefficients[k]!*coefficients[l]!;});});
  };
  for(let i=0;i<n;i++)add([i],[1],original[i]!,Math.max(.1,((s[Math.min(n-1,i+1)]??0)-(s[Math.max(0,i-1)]??0))/2));
  for(let i=1;i<n-1;i++){const l=s[i]!-s[i-1]!,r=s[i+1]!-s[i]!,span=(l+r)/2;add([i-1,i,i+1],[1/l,-1/l-1/r,1/r],0,scale**4/span);}
  for(const [i,y]of fixed){if(!Number.isInteger(i)||i<0||i>=n||!Number.isFinite(y))throw new Error('Invalid fixed height');a[i]=[1,0,0];b[i]=y;}
  const rho=200;
  if(bounds){if(bounds.lower.length!==n||bounds.upper.length!==n||bounds.lower.some((v,i)=>Number.isNaN(v)||Number.isNaN(bounds.upper[i])||v>bounds.upper[i]!))throw new Error('Invalid profile bounds');for(const [i,y]of fixed)if(y<bounds.lower[i]!-1e-8||y>bounds.upper[i]!+1e-8)throw new Error('Height anchor conflicts with clearance bounds');for(let i=0;i<n;i++)if(!fixed.has(i))a[i]![0]!+=rho;}
  const l=Array.from({length:n},()=>[0,0,0]);
  for(let i=0;i<n;i++)for(let j=Math.max(0,i-2);j<=i;j++){
    let v=a[i]![i-j]!;for(let k=Math.max(0,i-2,j-2);k<j;k++)if(i-k<=2&&j-k<=2)v-=l[i]![i-k]!*l[j]![j-k]!;
    if(!Number.isFinite(v)||i===j&&v<=0)throw new Error('Profile fit is numerically singular');
    l[i]![i-j]=i===j?Math.sqrt(v):v/l[j]![0]!;
  }
  const y=Array(n).fill(0) as number[],x=Array(n).fill(0) as number[],z=original.slice(),dual=Array(n).fill(0) as number[];
  if(bounds)for(let i=0;i<n;i++)z[i]=fixed.get(i)??Math.max(bounds.lower[i]!,Math.min(bounds.upper[i]!,z[i]!));
  const maxIterations=bounds?2400:1;
  for(let iteration=0;iteration<maxIterations;iteration++){
    for(let i=0;i<n;i++){let v=b[i]!+(bounds&&!fixed.has(i)?rho*(z[i]!-dual[i]!):0);for(let j=Math.max(0,i-2);j<i;j++)v-=l[i]![i-j]!*y[j]!;y[i]=v/l[i]![0]!;}
    for(let i=n-1;i>=0;i--){let v=y[i]!;for(let j=i+1;j<=Math.min(n-1,i+2);j++)v-=l[j]![j-i]!*x[j]!;x[i]=v/l[i]![0]!;}
    if(!bounds)return x;
    let residual=0,change=0;
    for(let i=0;i<n;i++){const prior=z[i]!;z[i]=fixed.get(i)??Math.max(bounds.lower[i]!,Math.min(bounds.upper[i]!,x[i]!+dual[i]!));dual[i]!+=x[i]!-z[i]!;residual=Math.max(residual,Math.abs(x[i]!-z[i]!));change=Math.max(change,Math.abs(z[i]!-prior));}
    if(residual<1e-5&&change<1e-5)return z;
    if(iteration===maxIterations-1&&residual>.001)throw new Error('Bounded profile did not converge: '+residual);
  }
  return z;
}
/** Preserve every authored XZ corner; retain extra Y samples only where their
 * linear interpolation error exceeds the explicit sub-millimetre tolerance. */
export function compactRampProfile<T extends {station:number;before:number;after:number}>(profile:readonly T[],authoredStations:readonly number[],tolerance=.0005):T[]{
  if(!Number.isFinite(tolerance)||tolerance<=0||profile.length<2||profile.some((p,i)=>![p.station,p.before,p.after].every(Number.isFinite)||i>0&&p.station<=profile[i-1]!.station))throw new Error('Invalid profile tolerance/stations');
  const keep=new Set<number>([0,profile.length-1]);for(const s of authoredStations){const i=profile.findIndex(p=>Math.abs(p.station-s)<1e-7);if(i<0)throw new Error('Missing authored profile anchor');keep.add(i);}
  const split=(a:number,b:number)=>{if(b<=a+1)return;const u=profile[a]!,v=profile[b]!;let worst=tolerance,index=-1;for(let i=a+1;i<b;i++){const p=profile[i]!,t=(p.station-u.station)/(v.station-u.station),error=Math.abs(p.after-u.after-(v.after-u.after)*t);if(error>worst){worst=error;index=i;}}if(index>=0){keep.add(index);split(a,index);split(index,b);}};
  const anchors=[...keep].sort((a,b)=>a-b);for(let i=1;i<anchors.length;i++)split(anchors[i-1]!,anchors[i]!);return [...keep].sort((a,b)=>a-b).map(i=>profile[i]!);
}
/** Exact paved footprint intersections, including edge vertices: affine height
 * extrema occur at these vertices. No centre-line-only clearance inference. */
export function rampOverlaps(map:CityMapData):RampOverlap[] {
  const segments=makePavementSegments(map),index=new EditorSpatialIndex(64),groups=new Map<string,RampOverlap[]>();
  const linked=new Set((map.roadLinks??[]).map(l=>[l.from.roadId,l.to.roadId].sort().join('|')));
  const junction=new Set(map.intersections.flatMap(j=>j.connections.flatMap(a=>j.connections.filter(b=>a.roadId!==b.roadId).map(b=>[a.roadId,b.roadId].sort().join('|')))));
  segments.forEach((p,i)=>index.set(String(i),p.box));
  for(let i=0;i<segments.length;i++){
    const a=segments[i]!;
    for(const key of index.query(a.box)){
      const n=Number(key);if(n<=i)continue;const b=segments[n]!;
      if(a.road.id===b.road.id&&a.road.pavementSurface==='ribbon'&&Math.abs(a.index-b.index)<=1)continue;
      const poly=clipPavementFootprints(a.polygon,b.polygon);if(poly.length<3)continue;
      const area=Math.abs(poly.reduce((v,p,k)=>{const q=poly[(k+1)%poly.length]!;return v+p.x*q.z-q.x*p.z;},0))/2;if(area<1e-5)continue;
      const center={x:poly.reduce((v,p)=>v+p.x,0)/poly.length,z:poly.reduce((v,p)=>v+p.z,0)/poly.length};
      // Junction-owned pavement is checked separately; do not compare masked roads.
      const probes=[center,...poly].filter(p=>a.surface.contains(.00001)(p.x,p.z)&&b.surface.contains(.00001)(p.x,p.z));if(!probes.length)continue;
      const values=probes.map(p=>a.surface.heightAt(p.x,p.z)-b.surface.heightAt(p.x,p.z)),lo=Math.min(...values),hi=Math.max(...values);
      const ranges=[a,b].map(p=>{const v=probes.map(q=>p.start+Math.max(0,Math.min(p.length,(q.x-p.a.x)*p.tx+(q.z-p.a.z)*p.tz)));return [Math.min(...v),Math.max(...v)];}) as RampOverlap['stationRanges'];
      const pair=[a.road.id,b.road.id] as [string,string],k=pair.join('|'),relation=a.road.id===b.road.id?'self-overlap':linked.has([...pair].sort().join('|'))?'endpoint-linked':junction.has([...pair].sort().join('|'))?'junction-related':'unlinked';
      const row:RampOverlap={roadIds:pair,stationRanges:ranges,minGap:lo<=0&&hi>=0?0:Math.min(Math.abs(lo),Math.abs(hi)),maxGap:Math.max(Math.abs(lo),Math.abs(hi)),signedMin:lo,signedMax:hi,area,alignment:Math.abs(a.tx*b.tx+a.tz*b.tz),point:center,relation,minClearance:0,segmentPairs:1};
      const runs=groups.get(k)??[],prior=runs.find(p=>ranges.every((r,j)=>r[0]<=p.stationRanges[j]![1]+12&&r[1]>=p.stationRanges[j]![0]-12));
      if(prior){prior.minGap=Math.min(prior.minGap,row.minGap);prior.maxGap=Math.max(prior.maxGap,row.maxGap);prior.signedMin=Math.min(prior.signedMin,lo);prior.signedMax=Math.max(prior.signedMax,hi);prior.area+=area;prior.alignment=Math.min(prior.alignment,row.alignment);prior.segmentPairs++;ranges.forEach((r,j)=>{prior.stationRanges[j]![0]=Math.min(prior.stationRanges[j]![0],r[0]);prior.stationRanges[j]![1]=Math.max(prior.stationRanges[j]![1],r[1]);});}
      else runs.push(row);groups.set(k,runs);
    }
  }
  return [...groups.values()].flat().map(p=>({...p,minClearance:p.minGap-.65}));
}

export function diagnoseRampProfiles(map:CityMapData) {
  const profiles=new Map(map.roads.map(r=>[r.id,rampProfile(r)])),roads=new Map(map.roads.map(r=>[r.id,r])),links=map.roadLinks??[],adj=new Map<string,Set<string>>();
  for(const l of links)for(const [a,b] of [[l.from.roadId,l.to.roadId],[l.to.roadId,l.from.roadId]]){const set=adj.get(a!)??new Set<string>();set.add(b!);adj.set(a!,set);}
  const overlaps=rampOverlaps(map),byRoad=new Map<string,number[]>();overlaps.forEach((p,i)=>{for(const id of new Set(p.roadIds)){const list=byRoad.get(id)??[];list.push(i);byRoad.set(id,list);}});
  const highway=(r:CityRoad)=>r.designProfile==='motorway'||map.roadNames?.[r.roadNameId??'']?.primaryText.includes('高速');
  const expressway=(r:CityRoad)=>roadFunction(r)==='expressway';
  const ramps=new Set(map.roads.filter(r=>roadFunction(r)==='ramp'||map.editing?.ramps.some(m=>m.roadId===r.id)||r.highwayTransition).map(r=>r.id));
  const inventory=map.roads.flatMap(r=>{
    const p=profiles.get(r.id)!,neighbors=[...adj.get(r.id)??[]].flatMap(id=>roads.has(id)?[roads.get(id)!]:[]),isRamp=ramps.has(r.id),structural=p.heightRange>.1||r.structure?.enclosure||r.corridorSection==='BRIDGE';
    const touchingExpressway=neighbors.some(n=>expressway(n)||highway(n)),elevatedBranch=structural||neighbors.some(n=>Math.abs((profiles.get(n.id)!.start.y??0)-(p.end.y??0))>.5);
    if(!isRamp&&!expressway(r)&&!highway(r)&&!elevatedBranch&&!touchingExpressway)return [];
    const category=highway(r)||isRamp&&neighbors.some(highway)?'A':expressway(r)||isRamp&&neighbors.filter(expressway).length>=2?'B':isRamp||touchingExpressway?'C':'D';
    const attachments=links.filter(l=>l.from.roadId===r.id||l.to.roadId===r.id).map(l=>{const own=l.from.roadId===r.id?l.from:l.to,other=l.from.roadId===r.id?l.to:l.from,q=profiles.get(other.roadId)!;const a=own.end==='start'?p.start:p.end,b=other.end==='start'?q.start:q.end;const ownGrade=p.segments[own.end==='start'?0:p.segments.length-1]?.grade??0,otherGrade=q.segments[other.end==='start'?0:q.segments.length-1]?.grade??0;return {end:own.end,roadId:other.roadId,otherEnd:other.end,horizontalGap:distance(a,b),heightGap:Math.abs((a.y??0)-(b.y??0)),gradeBreak:Math.abs(ownGrade-(own.end===other.end?-otherGrade:otherGrade))};});
    const reviewCues=[...(p.maxGrade>.08?['steep-profile']:[]),...(p.maxGradeBreak>.025?['grade-break']:[]),...(p.extrema.length>2?['waves']:[]),...(p.minRadius!==null&&p.minRadius<30?['tight-curve']:[]),...(p.shortSegments?['short-segments']:[]),...(attachments.some(a=>a.heightGap>.02)?['endpoint-height']:[])];
    return [{roadId:r.id,category,isRamp,roadName:r.roadNameId??null,roadFunction:roadFunction(r),parentMainlines:neighbors.filter(n=>roadFunction(n)!=='ramp'&&(expressway(n)||highway(n))).map(n=>n.id),attachments,profile:p,overlapIndices:byRoad.get(r.id)??[],reviewCues,bbox:bounds(roadPoints(r),10)}];
  });
  return {schemaVersion:1,mapVersion:map.version,coverage:{roads:map.roads.length,profiled:profiles.size,inventory:inventory.length,ramps:ramps.size,pavementOverlapRuns:overlaps.length},inventory,overlaps};
}
