import { createStaticOBBCollider, type StaticCollider } from '../../vehicle/physics/CollisionSystem';
import type { CityMapData, CityPoint, CityRoad } from './CityMapData';
import { polylineLength, roadEdges, roadPoints, sampleAt } from './geometry';
import { barrierOffset, RoadClearance } from './RoadClearance';
import {roadEdgeChains} from './RoadEdgeChain';
import { regionalTerrainSampler } from '../regional/RegionalTerrain';
export interface RoadPier { position: CityPoint; height: number; baseY:number }
export function retainingWallHeight(road:CityRoad,p:CityPoint,clearance?:RoadClearance):number {
  const y=p.y??0,top=Math.max(0.3,y+(road.designProfile==='motorway'&&road.structure?.enclosure?.kind==='cutting'?road.structure.enclosure.clearance:1.1)),deck=clearance?.lowestDeckHeight(p,y+4.5,top+0.65,road.id);
  return (deck===undefined?top:Math.min(top,deck-0.65))-y;
}
/** Open barriers at explicit joins so merge lanes remain physically accessible. */
export function barrierPoints(road: CityRoad, _map?: CityMapData): CityPoint[] {
  const points = roadPoints(road), length = polylineLength(points);
  const start=0,end=length;
  const result: CityPoint[] = [];
  for (let d = start; d < end; d += 3) result.push(sampleAt(points, d).point);
  result.push(sampleAt(points, end).point); return result;
}
export function roadPiers(road: CityRoad, map?: CityMapData, clearance = map ? new RoadClearance(map) : undefined): RoadPier[] {
  if (road.structure?.piersEnabled === false) return [];
  const points = roadPoints(road), length = polylineLength(points), spacing = road.structure?.pierSpacing ?? 30, piers: RoadPier[] = [];
  for (let d = spacing / 2; d < length - 8; d += spacing) {
    const { point: p } = sampleAt(points, d), baseY=map?.regional&&road.id.startsWith('regional:')?regionalTerrainSampler(map).heightAt(p.x,p.z):0, height = (p.y ?? 0) - 0.65-baseY;
    if (height < 2) continue;
    if (clearance?.junctionAt(p, 10, baseY, (p.y??0)-.65) || clearance?.roadAt(p, 2, baseY, (p.y??0)-.65, road.id)) continue;
    piers.push({ position: p, height, baseY });
  }
  return piers;
}
/** Split each edge wherever same-height pavement joins it, including long merge throats. */
export function barrierSections(road: CityRoad, map?: CityMapData, clearance = map ? new RoadClearance(map) : undefined,retainingWall=false): { side: number; points: CityPoint[] }[] {
  const sections: { side: number; points: CityPoint[] }[] = [];
  const continuation=map?roadEdgeChains(map).continuations(road.id):new Set([road.id]);
  const blocked=(p:CityPoint)=>{const y=p.y??0,top=retainingWall?y+retainingWallHeight(road,p,clearance)+.3:y+1.3;return !!(clearance?.roadAt(p,retainingWall?.9:.5,y-2.1,top,road.id,id=>!continuation.has(id))||clearance?.junctionAt(p,retainingWall?.9:.5,y-2.1,top));};
  const boundary=(a:CityPoint,b:CityPoint)=>{let lo=0,hi=1;const state=blocked(a);for(let n=0;n<15;n++){const t=(lo+hi)/2,p={x:a.x+(b.x-a.x)*t,y:(a.y??0)+((b.y??0)-(a.y??0))*t,z:a.z+(b.z-a.z)*t};if(blocked(p)===state)lo=t;else hi=t;}const t=state?hi:lo;return{x:a.x+(b.x-a.x)*t,y:(a.y??0)+((b.y??0)-(a.y??0))*t,z:a.z+(b.z-a.z)*t};};
  for (const side of [-1, 1]) {
    const edge=map?roadEdgeChains(map).barrierEdge(road,side):barrierPoints(road).map((p,i,a)=>{const b=a[Math.min(i+1,a.length-1)]!,c=a[Math.max(0,i-1)]!,l=Math.hypot(b.x-c.x,b.z-c.z)||1,offset=barrierOffset(road,side);return{x:p.x-(b.z-c.z)/l*offset,y:p.y,z:p.z+(b.x-c.x)/l*offset};});
    // A long straight edge can cross a short ramp between both endpoints and
    // its midpoint. Sample the physical edge before clipping its openings.
    const path:CityPoint[]=[];
    for(let i=1;i<edge.length;i++) {
      const a=edge[i-1]!,b=edge[i]!,steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/3));
      if(!path.length)path.push(a);
      for(let n=1;n<=steps;n++){const t=n/steps;path.push(n===steps?b:{x:a.x+(b.x-a.x)*t,y:(a.y??0)+((b.y??0)-(a.y??0))*t,z:a.z+(b.z-a.z)*t});}
    }
    let current: CityPoint[] = [];
    const flush = () => { if (current.length > 1) sections.push({ side, points: current }); current = []; };
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!, b = path[i]!, length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 0.01) continue;
      const p = { x: (a.x + b.x) / 2,
        y: ((a.y ?? 0) + (b.y ?? 0)) / 2, z: (a.z + b.z) / 2 };
      // A descending branch barrier must also clear the roof envelope of traffic
      // on the lower receiving road, before both pavement heights coincide.
      const ba=blocked(a),bb=blocked(b),bm=blocked(p);
      if(ba&&bb){flush();continue;}
      if(!ba&&!bb&&!bm){if(!current.length)current.push(a);current.push(b);continue;}
      if(!ba){if(!current.length)current.push(a);current.push(boundary(a,bm?p:b));flush();}
      else flush();
      if(!bb){current.push(boundary(bm?p:a,b),b);}
    }
    flush();
  }
  return sections;
}
export function roadStructureColliders(road: CityRoad, map: CityMapData, clearance = new RoadClearance(map)): StaticCollider[] {
  const colliders: StaticCollider[] = [];
  roadPiers(road, map, clearance).forEach((p, i) => colliders.push(createStaticOBBCollider({ id: `${road.id}:pier:${i}`, x: p.position.x, z: p.position.z, width: 1.2, length: 1.2, minHeight: p.baseY, maxHeight: p.baseY+p.height, type: 'obstacle' })));
  for (const { side, points: originalPoints } of barrierSections(road, map, clearance)) {
    // Flat collinear rural guardrail boxes have exactly the same union when
    // joined. Curves, height changes and every opening retain their samples.
    const points=road.id.startsWith('regional:')?originalPoints.filter((b,i,p)=>{
      if(!i||i===p.length-1)return true;const a=p[i-1]!,c=p[i+1]!,dx=b.x-a.x,dz=b.z-a.z,ex=c.x-b.x,ez=c.z-b.z;
      return Math.abs(dx*ez-dz*ex)>1e-7||dx*ex+dz*ez<=0||Math.abs((a.y??0)-(b.y??0))>1e-7||Math.abs((b.y??0)-(c.y??0))>1e-7;
    }):originalPoints;
  const offset = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 0.01 || road.structure?.barrierEnabled === false || road.structure?.barrierEnabled !== true && Math.max(a.y ?? 0, b.y ?? 0) < 2) continue;
    colliders.push(createStaticOBBCollider({ id: `${road.id}:barrier:${colliders.length}:${side}`,
      x: (a.x + b.x) / 2 - (b.z - a.z) / length * offset,
      z: (a.z + b.z) / 2 + (b.x - a.x) / length * offset,
      width: 0.28, length, yaw: Math.atan2(b.x - a.x, b.z - a.z),
      minHeight: Math.min(a.y ?? 0, b.y ?? 0) + 0.05, maxHeight: Math.max(a.y ?? 0, b.y ?? 0) + 1.1, type: 'guardrail' }));
  }
  }
  const enclosure=road.structure?.enclosure;
  if(enclosure) {
    const points=roadPoints(road);
    const walls=enclosure.kind==='cutting'?barrierSections(road,map,clearance,true):[-1,1].map(side=>({side,points:roadEdgeChains(map).barrierEdge(road,side)}));
    for(const {side,points:wallPoints} of walls)for(let i=1;i<wallPoints.length;i++) {
      const a=wallPoints[i-1]!,b=wallPoints[i]!,length=Math.hypot(b.x-a.x,b.z-a.z);
        const offset=side*0.15;
        const p={x:(a.x+b.x)/2-(b.z-a.z)/length*offset,y:Math.max(a.y??0,b.y??0),z:(a.z+b.z)/2+(b.x-a.x)/length*offset};
        colliders.push(createStaticOBBCollider({id:`${road.id}:wall:${colliders.length}:${side}`,x:p.x,z:p.z,width:0.3,length:length+0.04,
          yaw:Math.atan2(b.x-a.x,b.z-a.z),minHeight:Math.min(a.y??0,b.y??0),maxHeight:p.y+(enclosure.kind==='cutting'?retainingWallHeight(road,p,clearance):enclosure.clearance),type:'obstacle'}));
    }
    if(enclosure.kind!=='cutting')for(let i=1;i<points.length;i++) {
      const a=points[i-1]!,b=points[i]!,length=Math.hypot(b.x-a.x,b.z-a.z);
      const edges=roadEdges(road),offset=(edges.left+edges.right)/2;
      colliders.push(createStaticOBBCollider({id:`${road.id}:ceiling:${i}`,x:(a.x+b.x)/2-(b.z-a.z)/length*offset,z:(a.z+b.z)/2+(b.x-a.x)/length*offset,width:edges.right-edges.left+0.6,length:length+0.04,
        yaw:Math.atan2(b.x-a.x,b.z-a.z),minHeight:Math.min(a.y??0,b.y??0)+enclosure.clearance,maxHeight:Math.max(a.y??0,b.y??0)+enclosure.clearance+0.65,type:'obstacle'}));
    }
  }
  return colliders;
}
