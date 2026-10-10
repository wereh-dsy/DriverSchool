import { createStaticOBBCollider, type StaticCollider } from '../../vehicle/physics/CollisionSystem';
import type { CityMapData, CityPoint, CityRoad } from './CityMapData';
import { polylineLength, roadEdges, roadPoints, sampleAt } from './geometry';
import { barrierOffset, RoadClearance } from './RoadClearance';
export interface RoadPier { position: CityPoint; height: number }
export function retainingWallHeight(road:CityRoad,p:CityPoint,clearance?:RoadClearance):number {
  const y=p.y??0,top=Math.max(0.3,y+1.1),deck=clearance?.lowestDeckHeight(p,y+4.5,top+0.65,road.id);
  return (deck===undefined?top:Math.min(top,deck-0.65))-y;
}
/** Open barriers at explicit joins so merge lanes remain physically accessible. */
export function barrierPoints(road: CityRoad, map?: CityMapData): CityPoint[] {
  const points = roadPoints(road), length = polylineLength(points);
  const joined = (end: 'start' | 'end') => map?.intersections.some(j => j.connections.some(c => c.roadId === road.id && c.end === end)) || map?.roadLinks?.some(l => [l.from, l.to].some(e => e.roadId === road.id && e.end === end));
  const start = joined('start') ? Math.min(12, length / 3) : 0, end = length - (joined('end') ? Math.min(12, length / 3) : 0);
  const result: CityPoint[] = [];
  for (let d = start; d < end; d += 3) result.push(sampleAt(points, d).point);
  result.push(sampleAt(points, end).point); return result;
}
export function roadPiers(road: CityRoad, map?: CityMapData, clearance = map ? new RoadClearance(map) : undefined): RoadPier[] {
  if (road.structure?.piersEnabled === false) return [];
  const points = roadPoints(road), length = polylineLength(points), spacing = road.structure?.pierSpacing ?? 30, piers: RoadPier[] = [];
  for (let d = spacing / 2; d < length - 8; d += spacing) {
    const { point: p } = sampleAt(points, d), height = (p.y ?? 0) - 0.65;
    if (height < 2) continue;
    if (clearance?.junctionAt(p, 10, -Infinity, height) || clearance?.roadAt(p, 2, -Infinity, height, road.id)) continue;
    piers.push({ position: p, height });
  }
  return piers;
}
/** Split each edge wherever same-height pavement joins it, including long merge throats. */
export function barrierSections(road: CityRoad, map?: CityMapData, clearance = map ? new RoadClearance(map) : undefined,retainingWall=false): { side: number; points: CityPoint[] }[] {
  const sections: { side: number; points: CityPoint[] }[] = [];
  const path = barrierPoints(road, map);
  for (const side of [-1, 1]) {
    let current: CityPoint[] = [];
    const flush = () => { if (current.length > 1) sections.push({ side, points: current }); current = []; };
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!, b = path[i]!, length = Math.hypot(b.x - a.x, b.z - a.z), offset = barrierOffset(road, side);
      if (length < 0.01) continue;
      const p = { x: (a.x + b.x) / 2 - (b.z - a.z) / length * offset,
        y: ((a.y ?? 0) + (b.y ?? 0)) / 2, z: (a.z + b.z) / 2 + (b.x - a.x) / length * offset };
      // A descending branch barrier must also clear the roof envelope of traffic
      // on the lower receiving road, before both pavement heights coincide.
      const top=retainingWall?p.y+retainingWallHeight(road,p,clearance)+0.3:p.y+1.3;
      if (clearance?.roadAt(p, retainingWall?0.9:0.5, p.y - 2.1, top, road.id) || clearance?.junctionAt(p, retainingWall?0.9:0.5, p.y - 2.1, top)) { flush(); continue; }
      if (!current.length) current.push(a);
      current.push(b);
    }
    flush();
  }
  return sections;
}
export function roadStructureColliders(road: CityRoad, map: CityMapData, clearance = new RoadClearance(map)): StaticCollider[] {
  const colliders: StaticCollider[] = [];
  roadPiers(road, map, clearance).forEach((p, i) => colliders.push(createStaticOBBCollider({ id: `${road.id}:pier:${i}`, x: p.position.x, z: p.position.z, width: 1.2, length: 1.2, minHeight: 0, maxHeight: p.height, type: 'obstacle' })));
  for (const { side, points } of barrierSections(road, map, clearance)) {
  const offset = barrierOffset(road, side);
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
    const walls=enclosure.kind==='cutting'?barrierSections(road,map,clearance,true):[-1,1].map(side=>({side,points}));
    for(const {side,points:wallPoints} of walls)for(let i=1;i<wallPoints.length;i++) {
      const a=wallPoints[i-1]!,b=wallPoints[i]!,length=Math.hypot(b.x-a.x,b.z-a.z);
        const offset=barrierOffset(road,side)+side*0.15;
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
