import { CatmullRomCurve3, Vector3 } from 'three';
import type { CityIntersection, CityMapData, CityPoint, CityRoad, IntersectionPort } from './CityMapData';
import { INTERSECTION_LANES } from './CityMapData';
export const portDirections: Record<IntersectionPort, CityPoint> = {
  north: { x: 0, z: -1 }, east: { x: 1, z: 0 }, south: { x: 0, z: 1 }, west: { x: -1, z: 0 },
  extra: { x: Math.SQRT1_2, z: -Math.SQRT1_2 },
};
export function portDirection(j: CityIntersection, port: IntersectionPort): CityPoint {
  const angle=j.portAngles?.[port];return angle===undefined?portDirections[port]:{x:Math.sin(angle),z:-Math.cos(angle)};
}
export function portsFor(j: CityIntersection): IntersectionPort[] {
  return j.type==='irregular'?['north','east','south','west','extra']:j.type.startsWith('t_') ? ['north', 'east', 'west'] : ['north', 'east', 'south', 'west'];
}
export function rotatePoint(p: CityPoint, radians: number): CityPoint {
  const c = Math.cos(radians), s = Math.sin(radians);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}
export function junctionExtent(j: CityIntersection, map: CityMapData): number {
  let width = INTERSECTION_LANES[j.type] * 3.5;
  for (const connection of j.connections) {
    const road = map.roads.find(r => r.id === connection.roadId);
    if (road) width = Math.max(width, road.laneCount * road.laneWidth);
  }
  return width / 2 + 7;
}
/** Signed paved edges; lanes keep their original centerline and direction. */
export function roadEdges(road: CityRoad): { left: number; right: number; width: number } {
  const half = road.laneCount * road.laneWidth / 2;
  const left = -half - (road.shoulders?.left ?? 0), right = half + (road.shoulders?.right ?? 0);
  return { left, right, width: right - left };
}
export function connectionPoint(j: CityIntersection, port: IntersectionPort, map: CityMapData): CityPoint {
  const d = rotatePoint(portDirection(j,port), j.rotation), extent = junctionExtent(j, map);
  return { x: j.position.x + d.x * extent, y: j.pavementHeights?.[port]??j.position.y??0, z: j.position.z + d.z * extent };
}
/** A connection owns its endpoint, including after moving/rotating a junction. */
export function syncConnections(map: CityMapData): void {
  for (const j of map.intersections) for (const c of j.connections) {
    const r = map.roads.find(r => r.id === c.roadId);
    if (r) {
      const target = connectionPoint(j, c.port, map);
      const currentY = r.elevationMode === 'ground' ? 0 : r.elevationMode === 'elevated' ? r.elevation ?? 6 : r.centerline[c.end === 'start' ? 0 : r.centerline.length - 1]!.y ?? 0;
      if (Math.abs(currentY - (target.y ?? 0)) > 0.01 && r.elevationMode !== 'custom') {
        r.centerline = roadPoints({ ...r, curve: 'polyline' }); r.elevationMode = 'custom';
      }
      r.centerline[c.end === 'start' ? 0 : r.centerline.length - 1] = target;
    }
  }
  refreshPortPoses(map);
}
/** Optional stamped pose metadata follows ordinary road edits and splits. */
export function refreshPortPoses(map: CityMapData): void {
  for (const port of map.connectionPorts ?? []) {
    if (!port.position && port.heading === undefined) continue;
    const road = map.roads.find(r=>r.id===port.endpoint.roadId);
    if (!road || road.centerline.length<2) continue;
    const pts=roadPoints(road),start=port.endpoint.end==='start',a=start?pts[0]!:pts.at(-1)!,b=start?pts[1]!:pts.at(-2)!;
    port.position={...a};port.heading=Math.atan2(a.x-b.x,-(a.z-b.z));
    port.label=directionalPortLabel(port.label,port.heading);
  }
}
export function directionalPortLabel(label: string, heading: number): string {
  const directions=['North','Northeast','East','Southeast','South','Southwest','West','Northwest'];
  return label.replace(/^(North|Northeast|East|Southeast|South|Southwest|West|Northwest)\b/,
    directions[(Math.round(heading/(Math.PI/4))+8)%8]!);
}
export function roadPoints(road: CityRoad): CityPoint[] {
  const points = road.centerline.map(p => ({ ...p, y: road.elevationMode === 'ground' ? 0 : road.elevationMode === 'elevated' ? road.elevation ?? 6 : p.y ?? 0 }));
  if (road.curve !== 'smooth' || points.length < 3) return points;
  // Smooth the horizontal layout; interpolate elevation monotonically along control intervals.
  // This avoids Catmull-Rom Y overshoot near ground/ramp/deck transitions.
  const curve = new CatmullRomCurve3(points.map(p => new Vector3(p.x, 0, p.z)), false, 'centripetal');
  const count = Math.max(8, Math.ceil(polylineLength(points) / 3));
  return curve.getPoints(count).map((p, index) => {
    const node = index / count * (points.length - 1), a = Math.min(points.length - 2, Math.floor(node)), t = node - a;
    return { x: p.x, y: points[a]!.y + (points[a + 1]!.y - points[a]!.y) * t, z: p.z };
  });
}
export function polylineLength(points: readonly CityPoint[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z);
  return sum;
}
export function sampleAt(points: readonly CityPoint[], distance: number): { point: CityPoint; tangent: CityPoint } {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 1e-8) continue;
    if (distance <= length || i === points.length - 1) {
      const t = Math.min(1, distance / length);
      return { point: { x: a.x + (b.x - a.x) * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, z: a.z + (b.z - a.z) * t }, tangent: { x: (b.x - a.x) / length, y: ((b.y ?? 0) - (a.y ?? 0)) / length, z: (b.z - a.z) / length } };
    }
    distance -= length;
  }
  return { point: points[0]!, tangent: { x: 0, z: -1 } };
}
