import type { CityMapData, CityPoint } from '../src/world/city/CityMapData';
import type { RoadGeometryTrialSelection } from '../src/world/city/RoadGeometryTrial';
import { polylineLength, roadPoints, sampleAt } from '../src/world/city/geometry';

export interface RoadTrialCase { id: string; label: string; roadIds: string[]; intersectionIds: string[]; distance: number }
export const ROAD_TRIAL_CASES: readonly RoadTrialCase[] = [
  { id: 'arterial', label: '城市主干道 · 连续路缘', roadIds: ['v4-south-logistics-west'], intersectionIds: [], distance: 110 },
  { id: 'median', label: '快速路 · 中央隔离带', roadIds: ['direction-mingyuan-main-section-section'], intersectionIds: [], distance: 115 },
  { id: 'junction', label: '普通平交 · 铺面与标线', roadIds: [], intersectionIds: ['urban-junction-83'], distance: 110 },
  { id: 'divided', label: '分离式六臂路口', roadIds: [], intersectionIds: ['urban-junction'], distance: 165 },
  { id: 'bridge', label: '高架 · 护栏与桥墩', roadIds: ['ew-wb-split'], intersectionIds: [], distance: 110 },
  { id: 'underground', label: '地下通道与下沉挡墙', roadIds: ['urban-rail-underpass:underpass', 'urban-underpass-end-approach'], intersectionIds: [], distance: 150 },
  { id: 'skew', label: '附加验证 · 斜交五臂', roadIds: [], intersectionIds: ['urban-junction-97'], distance: 140 },
];

/** A read-only development fragment of real authored objects. No map writing,
 * normalization, centreline truncation or invented test roads. One-hop explicit
 * neighbours and all connected junction arms preserve local seam/clearance context.
 */
export function roadTrialRegion(source: CityMapData, test: RoadTrialCase): {
  map: CityMapData; selection: RoadGeometryTrialSelection; focus: CityPoint; direction: CityPoint;
} {
  const roadIds = new Set(test.roadIds), junctionIds = new Set(test.intersectionIds);
  for (const j of source.intersections) if (junctionIds.has(j.id)) for (const c of j.connections) roadIds.add(c.roadId);
  const selected = source.roads.filter(r => roadIds.has(r.id));
  if (selected.length !== roadIds.size) throw new Error('Missing real road in trial ' + test.id);
  const junction = source.intersections.find(j => junctionIds.has(j.id));
  const primary = selected[0]!, path = roadPoints(primary), middle = sampleAt(path, polylineLength(path) * .5);
  const focus = junction ? { ...junction.position } : test.id === 'underground' ? { ...roadPoints(primary).at(-1)! } : middle.point;
  const direction = middle.tangent;
  const context = new Set(roadIds), radius = test.distance + 45;
  for (const road of source.roads) {
    const points = roadPoints(road);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!, b = points[i]!, dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((focus.x - a.x) * dx + (focus.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(a.x + dx * t - focus.x, a.z + dz * t - focus.z) < radius) { context.add(road.id); break; }
    }
  }
  for (const link of source.roadLinks ?? []) if (roadIds.has(link.from.roadId) || roadIds.has(link.to.roadId)) { context.add(link.from.roadId); context.add(link.to.roadId); }
  const intersections = source.intersections.filter(j => junctionIds.has(j.id) || Math.hypot(j.position.x - focus.x, j.position.z - focus.z) < radius);
  for (const j of intersections) for (const c of j.connections) context.add(c.roadId);
  // Only the originally chosen roads/approaches opt in; context stays legacy.
  const roads = source.roads.filter(r => context.has(r.id));
  const map: CityMapData = {
    schemaVersion: source.schemaVersion, id: source.id, name: source.name, version: source.version, sectorSize: source.sectorSize,
    bounds: { minX: focus.x - radius - 50, maxX: focus.x + radius + 50, minZ: focus.z - radius - 50, maxZ: focus.z + radius + 50 },
    roads, intersections, objects: [], signs: [], roadNames: source.roadNames,
    roadLinks: source.roadLinks?.filter(l => context.has(l.from.roadId) && context.has(l.to.roadId)),
    environment: { ...source.environment, spawnPoints: [{ id: 'trial-view', position: { ...focus }, rotation: 0 }] },
  };
  return { map, selection: { roadIds: [...roadIds], intersectionIds: [...junctionIds] }, focus, direction };
}
