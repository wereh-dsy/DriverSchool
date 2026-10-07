import { createStaticOBBCollider, type StaticCollider } from '../../vehicle/physics/CollisionSystem';
import type { CityMapData, CityPoint, CityRoad } from './CityMapData';
import { junctionExtent, polylineLength, roadPoints, sampleAt } from './geometry';
export interface RoadPier { position: CityPoint; height: number }
/** Open barriers at explicit joins so merge lanes remain physically accessible. */
export function barrierPoints(road: CityRoad, map?: CityMapData): CityPoint[] {
  const points = roadPoints(road), length = polylineLength(points);
  const joined = (end: 'start' | 'end') => map?.intersections.some(j => j.connections.some(c => c.roadId === road.id && c.end === end)) || map?.roadLinks?.some(l => [l.from, l.to].some(e => e.roadId === road.id && e.end === end));
  const start = joined('start') ? Math.min(12, length / 3) : 0, end = length - (joined('end') ? Math.min(12, length / 3) : 0);
  const result: CityPoint[] = [];
  for (let d = start; d < end; d += 3) result.push(sampleAt(points, d).point);
  result.push(sampleAt(points, end).point); return result;
}
export function roadPiers(road: CityRoad, map?: CityMapData): RoadPier[] {
  if (road.structure?.piersEnabled === false) return [];
  const points = roadPoints(road), length = polylineLength(points), spacing = road.structure?.pierSpacing ?? 30, piers: RoadPier[] = [];
  const others = map?.roads.filter(r => r.id !== road.id).map(r => ({ width: r.laneCount * r.laneWidth, points: roadPoints(r) })) ?? [];
  for (let d = spacing / 2; d < length - 8; d += spacing) {
    const { point: p } = sampleAt(points, d), height = (p.y ?? 0) - 0.65;
    if (height < 2) continue;
    if (map?.intersections.some(j => (j.position.y ?? 0) < height && Math.hypot(j.position.x - p.x, j.position.z - p.z) < junctionExtent(j, map) * 1.5 + 2)) continue;
    let blocked = false;
    for (const other of others) {
      for (let i = 1; i < other.points.length; i++) {
        const a = other.points[i - 1]!, b = other.points[i]!, dx = b.x - a.x, dz = b.z - a.z, squared = dx * dx + dz * dz;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (squared || 1)));
        const y = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t;
        if (y < height && Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t) < other.width / 2 + 2) { blocked = true; break; }
      }
      if (blocked) break;
    }
    if (!blocked) piers.push({ position: p, height });
  }
  return piers;
}
export function roadStructureColliders(road: CityRoad, map: CityMapData): StaticCollider[] {
  const colliders: StaticCollider[] = [];
  roadPiers(road, map).forEach((p, i) => colliders.push(createStaticOBBCollider({ id: `${road.id}:pier:${i}`, x: p.position.x, z: p.position.z, width: 1.2, length: 1.2, minHeight: 0, maxHeight: p.height, type: 'obstacle' })));
  const points = barrierPoints(road, map), half = road.laneCount * road.laneWidth / 2;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 0.01 || road.structure?.barrierEnabled === false || road.structure?.barrierEnabled !== true && Math.max(a.y ?? 0, b.y ?? 0) < 2) continue;
    for (const side of [-1, 1]) colliders.push(createStaticOBBCollider({ id: `${road.id}:barrier:${i}:${side}`,
      x: (a.x + b.x) / 2 - (b.z - a.z) / length * half * side,
      z: (a.z + b.z) / 2 + (b.x - a.x) / length * half * side,
      width: 0.28, length, yaw: Math.atan2(b.x - a.x, b.z - a.z),
      minHeight: Math.min(a.y ?? 0, b.y ?? 0) + 0.05, maxHeight: Math.max(a.y ?? 0, b.y ?? 0) + 1.1, type: 'guardrail' }));
  }
  return colliders;
}
