import type { CityIntersection, CityMapData, CityPoint, CityRoad, LaneMovement } from './CityMapData';
import { junctionExtent, polylineLength, portsFor, roadEdges, roadPoints, rotatePoint, sampleAt } from './geometry';

/** Data migration/authoring only. Renderers consume approach data, never infer arrows. */
export function populateIntersectionMarkingMetadata(map:CityMapData):void {
  for(const j of map.intersections) {
    j.markingFootprint??={kind:'junction',margin:0.4};
    if(j.approaches!==undefined)continue;
    j.approaches={};
    for(const port of portsFor(j)) {
      const c=j.connections.find(c=>c.port===port),r=map.roads.find(r=>r.id===c?.roadId);
      if(!r||r.type==='highway'||r.type==='ramp_1'||r.travelDirection!=='two-way'&&(r.travelDirection==='forward')!==(c?.end==='end'))continue;
      const count=r.travelDirection==='two-way'?r.laneCount/2:r.laneCount;
      const lanes:LaneMovement[]=Array.from({length:count},(_,lane)=>j.type.startsWith('t_')&&port==='north'?'left-right':count===1?'straight':lane===0?'straight-left':lane===count-1?'straight-right':'straight');
      j.approaches[port]={lanes,arrowDistance:30};
    }
  }
}
export function insideIntersectionMarkingFootprint(j:CityIntersection,map:CityMapData,p:CityPoint,margin=0,compiledExtent?:number):boolean {
  if(Math.abs((j.position.y??0)-(p.y??0))>0.2)return false;
  const q=rotatePoint({x:p.x-j.position.x,z:p.z-j.position.z},-j.rotation),f=j.markingFootprint;
  if(f?.kind==='polygon') {
    let inside=false;
    for(let i=0,k=f.points.length-1;i<f.points.length;k=i++) {
      const a=f.points[i]!,b=f.points[k]!;
      if((a.z>q.z)!==(b.z>q.z)&&q.x<(b.x-a.x)*(q.z-a.z)/(b.z-a.z)+a.x)inside=!inside;
      const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((q.x-a.x)*dx+(q.z-a.z)*dz)/(dx*dx+dz*dz)));
      if(Math.hypot(q.x-a.x-t*dx,q.z-a.z-t*dz)<=margin)return true;
    }
    return inside;
  }
  const h=compiledExtent??junctionExtent(j,map),w=f?.kind==='rectangle'?f.halfWidth:h+(f?.margin??0.4),d=f?.kind==='rectangle'?f.halfDepth:w;
  return Math.abs(q.x)<=w+margin&&Math.abs(q.z)<=d+margin;
}
interface MergeSegment {roadId:string;a:CityPoint;b:CityPoint;left:number;right:number}
/** Compiled paint-only masks. Pavement and physical contacts remain unchanged. */
export class MarkingOwnership {
  private readonly mergeBuckets=new Map<string,MergeSegment[]>();
  private readonly intersectionBuckets=new Map<string,{junction:CityIntersection;extent:number}[]>();
  constructor(private readonly map:CityMapData) {
    for(const junction of map.intersections) {
      const extent=junctionExtent(junction,map),f=junction.markingFootprint;
      const radius=f?.kind==='polygon'?Math.max(...f.points.map(p=>Math.hypot(p.x,p.z))):f?.kind==='rectangle'?Math.hypot(f.halfWidth,f.halfDepth):Math.SQRT2*(extent+(f?.margin??0.4));
      const p=junction.position,entry={junction,extent};
      for(let x=Math.floor((p.x-radius-1)/50);x<=Math.floor((p.x+radius+1)/50);x++)for(let z=Math.floor((p.z-radius-1)/50);z<=Math.floor((p.z+radius+1)/50);z++){const key=`${x},${z}`,bucket=this.intersectionBuckets.get(key)??[];bucket.push(entry);this.intersectionBuckets.set(key,bucket);}
    }
    for(const r of map.roads.filter(r=>r.gore).sort((a,b)=>a.id.localeCompare(b.id))) {
      const pts=roadPoints(r),len=polylineLength(pts),span=Math.min(r.gore!.length,len/2),edges=roadEdges(r);
      for(const start of [true,false]) {
        if(!(start?r.gore!.start:r.gore!.end))continue;
        for(let d=0;d<span;d+=3) {
          const a=sampleAt(pts,start?d:len-d).point,b=sampleAt(pts,start?Math.min(d+3,span):len-Math.min(d+3,span)).point;
          // Preserve the original order so signed pavement offsets remain correct.
          const s={roadId:r.id,a:start?a:b,b:start?b:a,...edges},margin=Math.max(-edges.left,edges.right)+1;
          for(let x=Math.floor((Math.min(a.x,b.x)-margin)/50);x<=Math.floor((Math.max(a.x,b.x)+margin)/50);x++)for(let z=Math.floor((Math.min(a.z,b.z)-margin)/50);z<=Math.floor((Math.max(a.z,b.z)+margin)/50);z++) {
            const key=`${x},${z}`,bucket=this.mergeBuckets.get(key)??[];bucket.push(s);this.mergeBuckets.set(key,bucket);
          }
        }
      }
    }
  }
  ownerAt(p:CityPoint,margin=0.15):{kind:'intersection'|'merge';id:string}|undefined {
    const j=this.intersectionBuckets.get(`${Math.floor(p.x/50)},${Math.floor(p.z/50)}`)?.find(e=>insideIntersectionMarkingFootprint(e.junction,this.map,p,margin,e.extent))?.junction;
    if(j)return {kind:'intersection',id:j.id};
    for(const s of this.mergeBuckets.get(`${Math.floor(p.x/50)},${Math.floor(p.z/50)}`)??[]) {
      const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,l=Math.hypot(dx,dz),t=((p.x-s.a.x)*dx+(p.z-s.a.z)*dz)/(l*l);
      if(t<-margin/l||t>1+margin/l)continue;
      const clamped=Math.max(0,Math.min(1,t)),y=(s.a.y??0)+clamped*((s.b.y??0)-(s.a.y??0)),offset=(-(p.x-s.a.x)*dz+(p.z-s.a.z)*dx)/l;
      if(Math.abs((p.y??0)-y)<0.2&&offset>=s.left-margin&&offset<=s.right+margin)return {kind:'merge',id:s.roadId};
    }
    return undefined;
  }
  sections(path:CityPoint[],offset:number,road:CityRoad,owner:'road'|'merge'):CityPoint[][] {
    const len=polylineLength(path),count=Math.max(1,Math.ceil(len/0.75)),sections:CityPoint[][]=[];let section:CityPoint[]=[];
    const flush=()=>{if(section.length>1)sections.push(section);section=[];};
    const permitted=(d:number)=>{
      const s=sampleAt(path,d),p={x:s.point.x-s.tangent.z*offset,y:s.point.y??0,z:s.point.z+s.tangent.x*offset},mask=this.ownerAt(p,0.4);
      return owner==='road'?!mask:mask?.kind==='merge'&&mask.id===road.id;
    };
    for(let i=0;i<count;i++) {
      const a=len*i/count,b=len*(i+1)/count;
      if(!permitted(a)||!permitted((a+b)/2)||!permitted(b)){flush();continue;}
      if(!section.length)section.push(sampleAt(path,a).point);section.push(sampleAt(path,b).point);
    }
    flush();return sections;
  }
}
