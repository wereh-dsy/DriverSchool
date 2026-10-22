import type {CityMapData,CityPoint,CityRoad} from './CityMapData';
import {roadEdges,roadPoints} from './geometry';
import {roadFunction} from './RoadClassification';
import {roadEdgeChains} from './RoadEdgeChain';
import {roadPavementTriangle} from './RoadPavementSurface';
import {compileJunctionSurface} from './JunctionSurface';

export const innerRoadSide=(road:CityRoad):number=>road.travelDirection==='reverse'?1:-1;
export const hasCentralBarrier=(road:CityRoad):boolean=>road.travelDirection==='two-way'&&road.structure?.medianBarrierStyle==='concrete'&&road.structure.barrierEnabled!==false;
export interface OpposingCarriageway {
  road:CityRoad; laneGap:number; pavementGap:number; distance:number;
  midpoint:CityPoint; sharedPavement:boolean;
}
interface Segment {road:CityRoad;a:CityPoint;b:CityPoint;length:number;tx:number;tz:number}
const cache=new WeakMap<CityMapData,RoadCarriageways>();
export function roadCarriageways(map:CityMapData):RoadCarriageways {
  let index=cache.get(map);if(!index){index=new RoadCarriageways(map);cache.set(map,index);}return index;
}
/** Geometry/direction index used by paint, physical barriers and authoring audits.
 * It does not infer a shared carriageway from a road name or identifier. */
export class RoadCarriageways {
  private readonly buckets=new Map<string,Segment[]>();
  private readonly paving=new Map<string,ReturnType<typeof roadPavementTriangle>[]>();
  constructor(private readonly map:CityMapData){
    for(const road of map.roads){
      if(road.travelDirection==='two-way'||road.laneCount<2||road.highwayTransition)continue;
      const kind=roadFunction(road);if(kind!=='expressway'&&kind!=='arterial'&&road.designProfile!=='motorway')continue;
      const points=roadPoints(road),margin=road.laneCount*road.laneWidth/2+36;
      for(let i=1;i<points.length;i++){
        const a=points[i-1]!,b=points[i]!,length=Math.hypot(b.x-a.x,b.z-a.z);if(length<1e-6)continue;
        const entry={road,a,b,length,tx:(b.x-a.x)/length,tz:(b.z-a.z)/length};
        for(let x=Math.floor((Math.min(a.x,b.x)-margin)/64);x<=Math.floor((Math.max(a.x,b.x)+margin)/64);x++)for(let z=Math.floor((Math.min(a.z,b.z)-margin)/64);z<=Math.floor((Math.max(a.z,b.z)+margin)/64);z++){
          const key=x+','+z,list=this.buckets.get(key)??[];list.push(entry);this.buckets.set(key,list);
        }
      }
    }
  }
  /** Exact load-time footing plane. Nominal shoulder overlap alone is not
   * sufficient at a mitered road-ID seam or a masked junction mouth. */
  pavedHeight(roadId:string,p:CityPoint):number|undefined {
    let planes=this.paving.get(roadId);
    if(!planes){
      const road=this.map.roads.find(r=>r.id===roadId)!;const edges=roadEdges(road),chains=roadEdgeChains(this.map),left=chains.edge(road,edges.left),right=chains.edge(road,edges.right),masks=this.map.intersections.filter(j=>j.pavementFootprint&&j.connections.some(c=>c.roadId===roadId)).map(compileJunctionSurface);
      planes=[];for(let i=1;i<left.length;i++)for(const [a,b,c]of [[left[i-1]!,right[i-1]!,left[i]!],[right[i-1]!,right[i]!,left[i]!]])if(Math.abs((b!.x-a!.x)*(c!.z-a!.z)-(b!.z-a!.z)*(c!.x-a!.x))>1e-8)planes.push(roadPavementTriangle(a!,b!,c!,1,masks));this.paving.set(roadId,planes);
    }
    let height:number|undefined,error=Infinity;for(const plane of planes)if(plane.contains(0)(p.x,p.z)){const y=plane.heightAt(p.x,p.z),e=Math.abs(y-(p.y??0));if(e<error){height=y;error=e;}}
    return error<=.2?height:undefined;
  }
  opposing(road:CityRoad,p:CityPoint,tangent:CityPoint):OpposingCarriageway|undefined {
    if(road.travelDirection==='two-way'||road.laneCount<2||road.highwayTransition)return undefined;
    const sign=road.travelDirection==='reverse'?-1:1,side=innerRoadSide(road),half=road.laneCount*road.laneWidth/2,ownEdges=roadEdges(road),ownPaved=side<0?-ownEdges.left:ownEdges.right;
    let result:OpposingCarriageway|undefined,best=Infinity;
    for(const s of this.buckets.get(Math.floor(p.x/64)+','+Math.floor(p.z/64))??[]){
      if(s.road.id===road.id)continue;
      const otherSign=s.road.travelDirection==='reverse'?-1:1,dot=tangent.x*s.tx+tangent.z*s.tz;
      if(dot*sign*otherSign>-.97)continue;
      const t=((p.x-s.a.x)*s.tx+(p.z-s.a.z)*s.tz)/s.length;if(t<0||t>1)continue;
      const q={x:s.a.x+(s.b.x-s.a.x)*t,y:(s.a.y??0)+((s.b.y??0)-(s.a.y??0))*t,z:s.a.z+(s.b.z-s.a.z)*t};
      if(Math.abs((p.y??0)-(q.y??0))>.2)continue;
      const lateral=(-(q.x-p.x)*tangent.z+(q.z-p.z)*tangent.x)*side,otherHalf=s.road.laneCount*s.road.laneWidth/2;
      if(lateral<Math.max(half,otherHalf)+.2||lateral>half+otherHalf+16||lateral>=best)continue;
      // The opposite road must also face this road across its traffic-left edge.
      const facing=(-(p.x-q.x)*s.tz+(p.z-q.z)*s.tx)*innerRoadSide(s.road);if(facing<otherHalf)continue;
      const edges=roadEdges(s.road),otherPaved=innerRoadSide(s.road)<0?-edges.left:edges.right;
      const axis=(half+lateral-otherHalf)/2,midpoint={x:p.x-tangent.z*side*axis,y:Math.min(p.y??0,q.y??0),z:p.z+tangent.x*side*axis};
      const pavementGap=lateral-ownPaved-otherPaved;
      result={road:s.road,laneGap:lateral-half-otherHalf,pavementGap,distance:lateral,midpoint,sharedPavement:pavementGap<=.05};best=lateral;
    }return result;
  }
}
