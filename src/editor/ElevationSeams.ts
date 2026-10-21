import type { CityMapData, CityPoint, CityRoad } from '../world/city/CityMapData';
import { roadEdges, roadPoints,sampleAt,polylineLength } from '../world/city/geometry';
import { compileJunctionSurface } from '../world/city/JunctionSurface';
import { roadPavementSurface,roadPavementTriangle } from '../world/city/RoadPavementSurface';
import {roadEdgeChains} from '../world/city/RoadEdgeChain';
import { bounds, distance, EditorSpatialIndex, overlaps, project } from './EditorGeometry';
import { stations } from './MapAnalysis';
import type { EditorArea, EditorCommand } from './EditorCommands';

export type SeamCategory='SAFE_AUTO_FIX'|'LIKELY_FIX'|'MANUAL_REVIEW'|'IGNORE_GRADE_SEPARATED';
export interface SeamScope { bbox?:EditorArea; roadId?:string; minHeightDelta?:number }
export const SEAM_LIMITS={height:.04,normalDot:.995,gradeBreak:.04,sampleStep:1,safeHeight:.25,safeLength:80};
export interface ElevationSeam {
  id:string; category:SeamCategory; roadIds:[string,string]; segmentIds:string[]; bbox:EditorArea;
  location:CityPoint; maxHeightDelta:number; minHeightDelta:number; normalDot:number;
  localGrade:[number,number]; gradeDiscontinuity:number; overlapLength:number; overlapArea:number;
  topologyRelation:string; reasons:string[]; repair?:EditorCommand;
  footprintOverlap:boolean; horizontalGap:number;
  overlappingRoadIds?:string[]; layerCount?:number;
  stationRanges:[[number,number],[number,number]];
}
export type PavementSegment={road:CityRoad; index:number; a:CityPoint; b:CityPoint; start:number; length:number;
  tx:number;tz:number;box:EditorArea; polygon:CityPoint[];surface:ReturnType<typeof roadPavementSurface>};
type Segment=PavementSegment;
function nearPolygon(s:Segment){
  const edges=roadEdges(s.road),point=(p:CityPoint,o:number,t:number)=>({x:p.x-s.tz*o+s.tx*t,z:p.z+s.tx*o+s.tz*t});
  return [point(s.a,edges.left-.1,-.1),point(s.b,edges.left-.1,.1),point(s.b,edges.right+.1,.1),point(s.a,edges.right+.1,-.1)];
}
const dot=(a:Segment,b:Segment)=>(1+a.surface.gx*b.surface.gx+a.surface.gz*b.surface.gz)/
  Math.hypot(1,a.surface.gx,a.surface.gz)/Math.hypot(1,b.surface.gx,b.surface.gz);
const cross=(a:CityPoint,b:CityPoint,p:CityPoint)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
/** Convex clipping of the core footprints; capsule end caps are score-penalized in runtime. */
export function clipPavementFootprints(subject:CityPoint[],polygon:CityPoint[]):CityPoint[]{
  let result=subject;
  for(let i=0;i<polygon.length&&result.length;i++){
    const a=polygon[i]!,b=polygon[(i+1)%polygon.length]!,input=result;result=[];
    for(let j=0;j<input.length;j++){
      const p=input[j]!,q=input[(j+1)%input.length]!,u=cross(a,b,p),v=cross(a,b,q);
      if(u>=-1e-7)result.push(p);
      if((u>=0)!==(v>=0)){const t=u/(u-v);result.push({x:p.x+(q.x-p.x)*t,z:p.z+(q.z-p.z)*t});}
    }
  }
  return result;
}
export function makePavementSegments(map:CityMapData){
  const junctions=new Map<string,CityMapData['intersections'][number][]>();
  for(const j of map.intersections)for(const c of j.connections){const list=junctions.get(c.roadId)??[];list.push(j);junctions.set(c.roadId,list);}
  const masks=new Map(map.intersections.filter(j=>j.pavementFootprint).map(j=>[j.id,compileJunctionSurface(j)]));
  const result:Segment[]=[];
  for(const road of map.roads){
    const points=roadPoints(road),table=stations(points),edges=roadEdges(road),js=junctions.get(road.id)??[];
    const ribbon=road.pavementSurface==='ribbon'?{left:roadEdgeChains(map).edge(road,edges.left),right:roadEdgeChains(map).edge(road,edges.right)}:undefined;
    for(let index=0;index<points.length-1;index++){
      const a=points[index]!,b=points[index+1]!,length=distance(a,b);if(length<1e-6)continue;
      const tx=(b.x-a.x)/length,tz=(b.z-a.z)/length;
      const edge=(p:CityPoint,o:number)=>({x:p.x-tz*o,z:p.z+tx*o});
      const polygon=[edge(a,edges.left),edge(b,edges.left),edge(b,edges.right),edge(a,edges.right)];
      if(road.pavementSurface==='ribbon'){
        const {left,right}=ribbon!,triangles=[[left[index]!,right[index]!,left[index+1]!],[right[index]!,right[index+1]!,left[index+1]!]];
        for(const [k,triangle]of triangles.entries()){
          const [u,v,w]=triangle as [CityPoint,CityPoint,CityPoint],den=(v.x-u.x)*(w.z-u.z)-(v.z-u.z)*(w.x-u.x);if(Math.abs(den)<1e-8)continue;
          const poly=den>=0?triangle:[...triangle].reverse();result.push({road,index:index*2+k,a,b,start:table[index]!,length,tx,tz,polygon:poly,box:bounds(poly,.1),surface:roadPavementTriangle(u,v,w,length,js.flatMap(j=>masks.has(j.id)?[masks.get(j.id)!]:[]))});
        }continue;
      }
      result.push({road,index,a,b,start:table[index]!,length,tx,tz,polygon,box:bounds(polygon,.1),
        surface:roadPavementSurface(a,b,edges,index===0&&js.some(j=>j.connections.some(c=>c.roadId===road.id&&c.end==='start')),
          index===points.length-2&&js.some(j=>j.connections.some(c=>c.roadId===road.id&&c.end==='end')),js.flatMap(j=>masks.has(j.id)?[masks.get(j.id)!]:[]))});
    }
  }
  return result;
}
function separated(a:CityRoad,b:CityRoad,min:number,max:number,relation:string){
  const structure=(r:CityRoad)=>r.structure?.enclosure?.kind==='tunnel'||r.structure?.enclosure?.kind==='underpass'||r.structure?.piersEnabled||r.corridorSection==='BRIDGE'||r.corridorSection==='elevated-mainline'||r.elevationMode==='elevated';
  // Height alone is never structural evidence. Varying clearances stay reviewable,
  // especially on ramps approaching another pavement near a merge.
  return ['unlinked-overlap','linked-away-from-endpoint','same-road-overlap'].includes(relation)&&min>=2&&max-min<=Math.max(.5,min*.15)&&(structure(a)||structure(b));
}
/** Strict isolated interior wrinkle. No other road, endpoint, structure or junction may be touched. */
function safePlan(map:CityMapData,road:CityRoad,indices:number[]):EditorCommand|undefined {
  if(road.pavementSurface==='ribbon'||road.curve==='smooth'||road.elevationMode!=='custom'||road.structure?.enclosure||road.structure?.piersEnabled||road.corridorSection==='BRIDGE'||road.corridorSection==='elevated-mainline')return;
  const p=road.centerline,s=stations(p),lo=Math.min(...indices)-2,hi=Math.max(...indices)+3;
  if(lo<1||hi>=p.length-1)return;
  const length=s[hi]!-s[lo]!;if(length<8||length>SEAM_LIMITS.safeLength)return;
  const area=bounds(p.slice(lo,hi+1),Math.max(-roadEdges(road).left,roadEdges(road).right)+1);
  // Spatial shortlist, never all road pairs. The scanner passes a local map here.
  if(map.roads.some(r=>r.id!==road.id&&overlaps(bounds(roadPoints(r),Math.max(-roadEdges(r).left,roadEdges(r).right)),area)))return;
  const grade=((p[hi]!.y??0)-(p[lo]!.y??0))/length;
  const outer=[((p[lo]!.y??0)-(p[lo-1]!.y??0))/(s[lo]!-s[lo-1]!),((p[hi+1]!.y??0)-(p[hi]!.y??0))/(s[hi+1]!-s[hi]!)];
  if(Math.abs(grade)>.08||outer.some(g=>Math.abs(g-grade)>.003))return;
  const residual=p.slice(lo+1,hi).map((v,k)=>(v.y??0)-(p[lo]!.y??0)-grade*(s[lo+1+k]!-s[lo]!));
  if(Math.max(...residual.map(Math.abs))<SEAM_LIMITS.height||Math.min(...residual)<-.005&&Math.max(...residual)>.005)return;
  // Least-squares fit of a compact C1 bump against the common endpoint profile.
  // Its value and derivative vanish at both boundaries; never correct one node alone.
  const basis=(station:number)=>{const t=(station-s[lo]!)/length;return 16*t*t*(1-t)*(1-t);};
  const weights=residual.map((_,k)=>basis(s[lo+1+k]!)),amplitude=residual.reduce((v,r,k)=>v+r*weights[k]!,0)/weights.reduce((v,w)=>v+w*w,0);
  const elevations=[];
  for(let index=lo+1;index<hi;index++){
    const before=p[index]!.y??0,after=(p[lo]!.y??0)+grade*(s[index]!-s[lo]!)+amplitude*basis(s[index]!);
    if(Math.abs(after-before)>SEAM_LIMITS.safeHeight)return;
    if(Math.abs(after-before)>1e-7)elevations.push({index,before,after});
  }
  if(elevations.length<3)return;
  try{applySeamElevations(structuredClone(road),elevations);}catch{return;}
  return {op:'adjustElevationSeam',id:road.id,elevations};
}

export function diagnoseElevationSeams(map:CityMapData,scope:SeamScope={}){
  if(scope.bbox&&(!Object.values(scope.bbox).every(Number.isFinite)||scope.bbox.minX>=scope.bbox.maxX||scope.bbox.minZ>=scope.bbox.maxZ))throw new Error('Seam scan requires a finite ordered bbox with positive area');
  if(scope.roadId&&!map.roads.some(r=>r.id===scope.roadId))throw new Error('Unknown seam road '+scope.roadId);
  const threshold=scope.minHeightDelta??SEAM_LIMITS.height;
  if(!Number.isFinite(threshold)||threshold<.001||threshold>.5)throw new Error('Seam height threshold must be 0.001..0.5m');
  const started=performance.now(),segments=makePavementSegments(map),index=new EditorSpatialIndex(64),roads=new Map(map.roads.map(r=>[r.id,r]));
  segments.forEach((s,i)=>index.set(String(i),s.box));
  const relations=new Map<string,string>(),key=(a:string,b:string)=>[a,b].sort().join('|');
  const linkLocations=new Map<string,CityPoint[]>();
  for(const link of map.roadLinks??[]){const r=roads.get(link.from.roadId);if(!r)continue;const path=roadPoints(r),p=link.from.end==='start'?path[0]!:path.at(-1)!;const k=key(link.from.roadId,link.to.roadId),points=linkLocations.get(k)??[];points.push(p);linkLocations.set(k,points);}
  const degrees=new Map<string,number>();for(const l of map.roadLinks??[])for(const e of [l.from,l.to])degrees.set(e.roadId,(degrees.get(e.roadId)??0)+1);
  for(const l of map.roadLinks??[])relations.set(key(l.from.roadId,l.to.roadId),(degrees.get(l.from.roadId)??0)>2||(degrees.get(l.to.roadId)??0)>2?'split/merge-link':'endpoint-link');
  for(const j of map.intersections)for(const a of j.connections)for(const b of j.connections)if(a.roadId!==b.roadId)relations.set(key(a.roadId,b.roadId),'junction:'+j.id);
  const hits:{a:Segment;b:Segment;seam:ElevationSeam}[]=[];let pairs=0,samples=0;
  for(let i=0;i<segments.length;i++){
    const a=segments[i]!;if(scope.bbox&&!overlaps(a.box,scope.bbox)||scope.roadId&&a.road.id!==scope.roadId)continue;
    for(const id of index.query(a.box)){
      const n=Number(id);if(n<=i&&(!scope.roadId||segments[n]!.road.id===scope.roadId))continue;
      const b=segments[n]!;if(n===i)continue;pairs++;
      let polygon=clipPavementFootprints(a.polygon,b.polygon),near=false;
      if(!polygon.length){polygon=clipPavementFootprints(nearPolygon(a),nearPolygon(b));near=true;}if(!polygon.length)continue;
      const center={x:polygon.reduce((s,p)=>s+p.x,0)/polygon.length,z:polygon.reduce((s,p)=>s+p.z,0)/polygon.length};
      const probes=[center];let area=0;
      for(let k=0;k<polygon.length;k++){
        const p=polygon[k]!,q=polygon[(k+1)%polygon.length]!;area+=p.x*q.z-p.z*q.x;
        const count=Math.max(1,Math.ceil(distance(p,q)/SEAM_LIMITS.sampleStep));
        for(let t=0;t<count;t++)probes.push({x:p.x+(q.x-p.x)*t/count,z:p.z+(q.z-p.z)*t/count});
      }
      const accepted=probes.filter(p=>(!scope.bbox||p.x>=scope.bbox.minX&&p.x<=scope.bbox.maxX&&p.z>=scope.bbox.minZ&&p.z<=scope.bbox.maxZ)&&a.surface.contains(near?.1:0)(p.x,p.z)&&b.surface.contains(near?.1:0)(p.x,p.z));samples+=accepted.length;if(!accepted.length)continue;
      const deltas=accepted.map(p=>Math.abs(a.surface.heightAt(p.x,p.z)-b.surface.heightAt(p.x,p.z))),max=Math.max(...deltas),min=Math.min(...deltas),normal=dot(a,b);
      const ga=((a.b.y??0)-(a.a.y??0))/a.length,gb=((b.b.y??0)-(b.a.y??0))/b.length,alignment=a.tx*b.tx+a.tz*b.tz,gradeBreak=Math.abs(ga-gb*Math.sign(alignment||1));
      const adjacent=a.road.id===b.road.id&&Math.abs(a.index-b.index)===1;
      if(max<threshold&&!(adjacent&&gradeBreak>=SEAM_LIMITS.gradeBreak))continue;
      let relation=a.road.id===b.road.id?(adjacent?'same-road-adjacent':'same-road-overlap'):relations.get(key(a.road.id,b.road.id))??'unlinked-overlap';
      const linkPoints=linkLocations.get(key(a.road.id,b.road.id));
      if(linkPoints&&accepted.every(p=>linkPoints.every(q=>distance(p,q)>20)))relation='linked-away-from-endpoint';
      const ignore=separated(a.road,b.road,min,max,relation),likely=max>=threshold&&max<=.5&&normal>=SEAM_LIMITS.normalDot;
      const ranges=([a,b] as const).map(s=>{const values=accepted.map(p=>s.start+Math.max(0,Math.min(s.length,(p.x-s.a.x)*s.tx+(p.z-s.a.z)*s.tz)));return [Math.min(...values),Math.max(...values)] as [number,number];}) as ElevationSeam['stationRanges'];
      const worst=accepted[deltas.indexOf(max)]!;
      const horizontalGap=near?Math.min(...a.polygon.map(p=>project([...b.polygon,b.polygon[0]!],p).distance),...b.polygon.map(p=>project([...a.polygon,a.polygon[0]!],p).distance)):0;
      hits.push({a,b,seam:{id:'',category:ignore?'IGNORE_GRADE_SEPARATED':likely?'LIKELY_FIX':'MANUAL_REVIEW',roadIds:[a.road.id,b.road.id],segmentIds:[a.road.id+':'+a.index,b.road.id+':'+b.index],bbox:bounds(accepted),location:{...worst,y:a.surface.heightAt(worst.x,worst.z)},maxHeightDelta:max,minHeightDelta:min,normalDot:normal,localGrade:[ga,gb],gradeDiscontinuity:gradeBreak,overlapLength:Math.max(...ranges.map(r=>r[1]-r[0])),overlapArea:near?0:Math.abs(area)/2,footprintOverlap:!near&&Math.abs(area)>1e-8,horizontalGap,topologyRelation:relation,stationRanges:ranges,reasons:[ignore?'Stable separated profiles, explicit structure, and no local connection':max<threshold?'Adjacent profile grade break; crest/sag intent needs review':relation==='unlinked-overlap'?'Shared pavement has no direct topology; reference profile requires review':'Connected pavement height mismatch; preserve endpoint constraints']}});
    }
  }
  // Merge only neighbouring runs of the same road pair/category, not a whole interchange.
  hits.sort((a,b)=>key(...a.seam.roadIds).localeCompare(key(...b.seam.roadIds))||a.seam.stationRanges[0][0]-b.seam.stationRanges[0][0]);
  const issues:ElevationSeam[]=[];let current:ElevationSeam|undefined;
  for(const {seam:s} of hits){
    if(current&&JSON.stringify(current.roadIds)===JSON.stringify(s.roadIds)&&current.category===s.category&&current.topologyRelation===s.topologyRelation&&s.stationRanges[0][0]<=current.stationRanges[0][1]+8&&s.stationRanges[1][0]<=current.stationRanges[1][1]+8&&s.stationRanges[1][1]>=current.stationRanges[1][0]-8){
      current.segmentIds=[...new Set([...current.segmentIds,...s.segmentIds])];current.bbox=bounds([{x:current.bbox.minX,z:current.bbox.minZ},{x:current.bbox.maxX,z:current.bbox.maxZ},{x:s.bbox.minX,z:s.bbox.minZ},{x:s.bbox.maxX,z:s.bbox.maxZ}]);
      if(s.maxHeightDelta>current.maxHeightDelta){current.maxHeightDelta=s.maxHeightDelta;current.location=s.location;current.localGrade=s.localGrade;}
      current.minHeightDelta=Math.min(current.minHeightDelta,s.minHeightDelta);current.normalDot=Math.min(current.normalDot,s.normalDot);current.gradeDiscontinuity=Math.max(current.gradeDiscontinuity,s.gradeDiscontinuity);current.overlapArea+=s.overlapArea;
      current.footprintOverlap ||= s.footprintOverlap;current.horizontalGap=Math.min(current.horizontalGap,s.horizontalGap);
      for(const k of [0,1] as const){current.stationRanges[k][0]=Math.min(current.stationRanges[k][0],s.stationRanges[k][0]);current.stationRanges[k][1]=Math.max(current.stationRanges[k][1],s.stationRanges[k][1]);}
      current.overlapLength=Math.max(...current.stationRanges.map(r=>r[1]-r[0]));
    }else{current=structuredClone(s);issues.push(current);}
  }
  const roadIndex=new EditorSpatialIndex();for(const r of map.roads)roadIndex.set(r.id,bounds(roadPoints(r),Math.max(-roadEdges(r).left,roadEdges(r).right)));
  for(const s of issues){
    const local=index.query(bounds([s.location],.01)).map(id=>segments[Number(id)]!).filter(v=>v.surface.contains(0)(s.location.x,s.location.z));
    s.overlappingRoadIds=[...new Set(local.map(v=>v.road.id))];
    const heights=local.map(v=>v.surface.heightAt(s.location.x,s.location.z)).sort((a,b)=>a-b),layers:number[]=[];
    for(const h of heights)if(!layers.length||h-layers.at(-1)!>1.75)layers.push(h);
    s.layerCount=layers.length;
    if(s.category==='LIKELY_FIX'&&(layers.length>1||s.overlappingRoadIds.length>2)){
      s.category='MANUAL_REVIEW';s.reasons.push('Multiple roads or vertical layers at the worst overlap; reference is ambiguous');
    }
    if(s.roadIds[0]===s.roadIds[1]&&s.category!=='IGNORE_GRADE_SEPARATED'&&s.maxHeightDelta<=SEAM_LIMITS.safeHeight&&s.normalDot>=SEAM_LIMITS.normalDot){
      const r=roads.get(s.roadIds[0])!,ids=roadIndex.query(bounds([s.location],SEAM_LIMITS.safeLength+30));
      const repair=safePlan({...map,roads:ids.map(id=>roads.get(id)!)},r,s.segmentIds.map(id=>Number(id.slice(id.lastIndexOf(':')+1))));
      if(repair){s.category='SAFE_AUTO_FIX';s.repair=repair;s.reasons=['Isolated short interior wrinkle; endpoint grades agree; least-squares C1 local profile changes multiple interior Y values'];}
    }
    s.id=`seam:${s.roadIds.join('|')}:${s.stationRanges[0][0].toFixed(1)}:${s.stationRanges[1][0].toFixed(1)}`;
  }
  const counts=Object.fromEntries((['SAFE_AUTO_FIX','LIKELY_FIX','MANUAL_REVIEW','IGNORE_GRADE_SEPARATED'] as const).map(c=>[c,issues.filter(s=>s.category===c).length]));
  return {schemaVersion:1,mapId:map.id,mapVersion:map.version,scope,limits:{...SEAM_LIMITS,height:threshold},coverage:{roads:map.roads.length,segments:segments.length,broadPhasePairs:pairs,samples},elapsedMs:performance.now()-started,
    counts:{total:issues.length,...counts},maxHeightDelta:Math.max(0,...issues.filter(s=>s.category!=='IGNORE_GRADE_SEPARATED').map(s=>s.maxHeightDelta)),issues};
}

/** Kernel primitive: exact-index, stale-value guarded, reversible Y patch. No geometry resampling. */
export function applySeamElevations(road:CityRoad,elevations:{index:number;before:number;after:number}[]):void {
  if(road.curve==='smooth'||road.elevationMode!=='custom')throw new Error('Seam Y patch requires an explicit polyline custom profile');
  const indices=new Set<number>();
  for(const e of elevations){
    if(!Number.isInteger(e.index)||e.index<=0||e.index>=road.centerline.length-1||indices.has(e.index)||![e.before,e.after].every(Number.isFinite)||Math.abs(e.after-e.before)>.5||Math.abs((road.centerline[e.index]!.y??0)-e.before)>1e-8)throw new Error('Invalid/stale seam patch or endpoint/large elevation edit');
    indices.add(e.index);
  }
  const next=road.centerline.map((p,index)=>({...p,y:elevations.find(e=>e.index===index)?.after??p.y}));
  const grades=(p:CityPoint[])=>p.slice(1).map((v,i)=>((v.y??0)-(p[i]!.y??0))/distance(v,p[i]!));
  const old=grades(road.centerline),fresh=grades(next);
  for(let i=0;i<fresh.length;i++){
    if(Math.abs(fresh[i]!)>Math.max(.12,Math.abs(old[i]!))+.002)throw new Error('Seam patch increases excessive longitudinal grade');
    if(i&&Math.abs(fresh[i]!-fresh[i-1]!)>Math.max(.02,Math.abs(old[i]!-old[i-1]!))+.002)throw new Error('Seam patch creates a grade spike');
  }
  road.centerline=next;
}

/** Reviewed profile resampling: generated XZ always lies on the original polyline.
 * Every original node survives. This is separate from safe-only repair. */
export function applyReviewedPavementProfile(road:CityRoad,profile:{station:number;before:number;after:number}[],maxYChange=.5,allowEndpoint=false){
  if(road.curve==='smooth')throw new Error('Reviewed pavement profile requires a polyline');
  if(!Number.isFinite(maxYChange)||maxYChange<=0||maxYChange>8)throw new Error('Reviewed Y delta must be <=8m');
  const path=roadPoints(road),table=stations(path),length=polylineLength(path);
  if(profile.length<2||profile.some((p,i)=>![p.station,p.before,p.after].every(Number.isFinite)||p.station<0||p.station>length+1e-6||i>0&&p.station-profile[i-1]!.station<.049||Math.abs((sampleAt(path,p.station).point.y??0)-p.before)>1e-6||Math.abs(p.after-p.before)>maxYChange+1e-6))throw new Error('Invalid/stale reviewed profile');
  if(Math.abs(profile[0]!.station)>1e-6||Math.abs(profile.at(-1)!.station-length)>1e-6)throw new Error('Profile must cover both endpoints');
  if(!allowEndpoint&&[profile[0]!,profile.at(-1)!].some(p=>Math.abs(p.after-p.before)>1e-8))throw new Error('Reviewed profile endpoint requires an explicit junction datum');
  const targets=profile.map(p=>({x:p.station,z:0,y:p.after-p.before}));
  const all=[...table,...profile.map(p=>p.station)].sort((a,b)=>a-b).filter((s,i,a)=>!i||s-a[i-1]!>.049);
  // Keep original nodes exactly, even when a requested station is within 5cm.
  const stationSet=[...new Set([...table,...all.filter(s=>!table.some(t=>Math.abs(s-t)<.05))])].sort((a,b)=>a-b);
  const next=stationSet.map(s=>{const i=table.findIndex(t=>Math.abs(t-s)<1e-8),p=i>=0?{...path[i]!}:sampleAt(path,s).point;return {...p,y:(p.y??0)+(sampleAt(targets,s).point.y??0)};});
  const oldGrades=path.slice(1).map((p,i)=>((p.y??0)-(path[i]!.y??0))/distance(path[i]!,p)),newGrades=next.slice(1).map((p,i)=>((p.y??0)-(next[i]!.y??0))/distance(next[i]!,p));
  if(Math.max(...newGrades.map(Math.abs))>Math.max(.12,...oldGrades.map(Math.abs))+.002)throw new Error('Reviewed profile increases excessive grade');
  const beforeBreak=Math.max(0,...oldGrades.slice(1).map((g,i)=>Math.abs(g-oldGrades[i]!))),afterBreak=Math.max(0,...newGrades.slice(1).map((g,i)=>Math.abs(g-newGrades[i]!)));
  if(afterBreak>Math.max(.02,beforeBreak)+.002)throw new Error('Reviewed profile creates a grade spike');
  road.centerline=next;road.elevationMode='custom';road.curve='polyline';
}
