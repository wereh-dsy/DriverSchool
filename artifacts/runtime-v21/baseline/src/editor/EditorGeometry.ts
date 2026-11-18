import type { CityPoint, CityRoad } from '../world/city/CityMapData';
import { polylineLength, roadPoints, sampleAt } from '../world/city/geometry';
import type { EditorArea } from './EditorCommands';

export const distance = (a: CityPoint, b: CityPoint): number => Math.hypot(a.x - b.x, a.z - b.z);
export function bounds(points: readonly CityPoint[], margin = 0): EditorArea {
  return { minX: Math.min(...points.map(p => p.x)) - margin, maxX: Math.max(...points.map(p => p.x)) + margin,
    minZ: Math.min(...points.map(p => p.z)) - margin, maxZ: Math.max(...points.map(p => p.z)) + margin };
}
export const overlaps = (a: EditorArea, b: EditorArea): boolean => a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
export function union(areas: EditorArea[]): EditorArea | null {
  return areas.length ? { minX: Math.min(...areas.map(a => a.minX)), maxX: Math.max(...areas.map(a => a.maxX)), minZ: Math.min(...areas.map(a => a.minZ)), maxZ: Math.max(...areas.map(a => a.maxZ)) } : null;
}
export function project(points: readonly CityPoint[], p: CityPoint): { point: CityPoint; distance: number; along: number; tangent: CityPoint } {
  let best = { point: points[0]!, distance: Infinity, along: 0, tangent: { x: 1, z: 0 } as CityPoint }, along = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
    if (!length) continue;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (length * length)));
    const point = { x: a.x + dx * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, z: a.z + dz * t }, gap = distance(point, p);
    if (gap < best.distance) best = { point, distance: gap, along: along + t * length, tangent: { x: dx / length, z: dz / length } };
    along += length;
  }
  return best;
}
export function slicePath(points: readonly CityPoint[], start: number, end: number): CityPoint[] {
  const result = [sampleAt(points, start).point]; let d = 0;
  for (let i = 1; i < points.length; i++) { d += distance(points[i - 1]!, points[i]!); if (d > start + 0.05 && d < end - 0.05) result.push({ ...points[i]! }); }
  const last = sampleAt(points, end).point;
  if (distance(result.at(-1)!, last) > 0.05) result.push(last);
  return result;
}
/** Offset every sampled segment; miter adjacent normals instead of translating the whole path. */
export function parallelPath(road: CityRoad, offset: number): CityPoint[] {
  const points = roadPoints(road);
  return points.map((p, i) => {
    const a = points[Math.max(0, i - 1)]!, b = points[Math.min(points.length - 1, i + 1)]!;
    const before = distance(a, p), after = distance(p, b);
    const n1 = before ? { x: -(p.z - a.z) / before, z: (p.x - a.x) / before } : { x: -(b.z - p.z) / after, z: (b.x - p.x) / after };
    const n2 = after ? { x: -(b.z - p.z) / after, z: (b.x - p.x) / after } : n1;
    const scale = offset / Math.max(0.25, 1 + n1.x * n2.x + n1.z * n2.z);
    return { x: p.x + (n1.x + n2.x) * scale, y: p.y, z: p.z + (n1.z + n2.z) * scale };
  });
}
export function crossings(a: readonly CityPoint[], b: readonly CityPoint[]): { point: CityPoint; otherY: number }[] {
  const result: { point: CityPoint; otherY: number }[] = [];
  for (let i = 1; i < a.length; i++) for (let k = 1; k < b.length; k++) {
    const p = a[i - 1]!, q = b[k - 1]!, u = { x: a[i]!.x - p.x, z: a[i]!.z - p.z }, v = { x: b[k]!.x - q.x, z: b[k]!.z - q.z };
    const cross = u.x * v.z - u.z * v.x; if (Math.abs(cross) < 1e-8) continue;
    const t = ((q.x - p.x) * v.z - (q.z - p.z) * v.x) / cross, s = ((q.x - p.x) * u.z - (q.z - p.z) * u.x) / cross;
    if (t < -1e-6 || t > 1.000001 || s < -1e-6 || s > 1.000001) continue;
    const point = { x: p.x + t * u.x, y: (p.y ?? 0) + ((a[i]!.y ?? 0) - (p.y ?? 0)) * t, z: p.z + t * u.z };
    if (!result.some(r => distance(r.point, point) < 0.2)) result.push({ point, otherY: (q.y ?? 0) + ((b[k]!.y ?? 0) - (q.y ?? 0)) * s });
  }
  return result;
}
export function maxGrade(road: CityRoad): number {
  const p = roadPoints(road); let grade = 0;
  for (let i = 1; i < p.length; i++) grade = Math.max(grade, Math.abs((p[i]!.y ?? 0) - (p[i - 1]!.y ?? 0)) / Math.max(0.001, distance(p[i]!, p[i - 1]!)));
  return grade;
}
export function cubicPath(controls:CityPoint[]):CityPoint[] {
  if(controls.length!==4)throw new Error('Cubic path requires four handles');
  const [a,b,c,d]=controls as [CityPoint,CityPoint,CityPoint,CityPoint];
  const count=Math.max(24,Math.ceil((distance(a,b)+distance(b,c)+distance(c,d))/4));
  return Array.from({length:count+1},(_,i)=>{const t=i/count,s=1-t;return{x:s*s*s*a.x+3*s*s*t*b.x+3*s*t*t*c.x+t*t*t*d.x,y:s*s*s*(a.y??0)+3*s*s*t*(b.y??0)+3*s*t*t*(c.y??0)+t*t*t*(d.y??0),z:s*s*s*a.z+3*s*s*t*b.z+3*s*t*t*c.z+t*t*t*d.z};});
}
export { polylineLength, roadPoints, sampleAt };

/** Authoring-only XZ index. Rebuilt on open/undo; normal commits replace affected entries. */
export class EditorSpatialIndex {
  private cells = new Map<string, Set<string>>();
  private entries = new Map<string, EditorArea>();
  constructor(private readonly cellSize = 200) {}
  private keys(a: EditorArea): string[] {
    const keys: string[] = [];
    for (let x = Math.floor(a.minX / this.cellSize); x <= Math.floor(a.maxX / this.cellSize); x++) for (let z = Math.floor(a.minZ / this.cellSize); z <= Math.floor(a.maxZ / this.cellSize); z++) keys.push(`${x},${z}`);
    return keys;
  }
  set(id: string, area: EditorArea): void { this.delete(id); this.entries.set(id, area); for (const key of this.keys(area)) { let cell = this.cells.get(key); if (!cell) this.cells.set(key, cell = new Set()); cell.add(id); } }
  delete(id: string): void { const area = this.entries.get(id); if (area) for (const key of this.keys(area)) { const cell = this.cells.get(key); cell?.delete(id); if (!cell?.size) this.cells.delete(key); } this.entries.delete(id); }
  query(area: EditorArea): string[] { const ids = new Set<string>(); for (const key of this.keys(area)) for (const id of this.cells.get(key) ?? []) if (overlaps(this.entries.get(id)!, area)) ids.add(id); return [...ids]; }
}
