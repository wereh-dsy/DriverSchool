import type { CityMapData, CityPoint, CityRoad } from '../src/world/city/CityMapData';
import type { RoadGeometryTrialSelection } from '../src/world/city/RoadGeometryTrial';
import { ROAD_TRIAL_CASES, type RoadTrialCase } from './road-geometry-trial-data';
import { polylineLength, roadPoints, sampleAt } from '../src/world/city/geometry';
import { sampleRibbonPolyline } from '../src/world/subject3/geometry';

export const ROUND2_CASES: readonly RoadTrialCase[] = [
  ...ROAD_TRIAL_CASES.filter(c => c.id !== 'skew'),
  { id: 'curve-grade', label: '长弯与连续纵坡', roadIds: ['direction-mingyuan-main-section-2'], intersectionIds: [], distance: 110 },
];
export const ROUND2_BOUNDARIES: readonly RoadTrialCase[] = [
  ROAD_TRIAL_CASES.find(c => c.id === 'skew')!,
  { id: 'island', label: '交通岛多臂路口', roadIds: [], intersectionIds: ['urban-junction-80'], distance: 90 },
  { id: 'tunnel', label: '区域真实山体隧道', roadIds: ['regional:G38:out:split274'], intersectionIds: [], distance: 90 },
  { id: 'width-merge', label: '异宽道路与减速渐变', roadIds: ['regional:qingling:S-to-E-right:deceleration'], intersectionIds: [], distance: 90 },
];
export function round2Selection(map: CityMapData): RoadGeometryTrialSelection {
  const roads = new Set([...ROUND2_CASES, ...ROUND2_BOUNDARIES].flatMap(c => c.roadIds));
  const intersections = new Set([...ROUND2_CASES, ...ROUND2_BOUNDARIES].flatMap(c => c.intersectionIds));
  for (const j of map.intersections) if (intersections.has(j.id)) for (const c of j.connections) roads.add(c.roadId);
  return { roadIds: [...roads], intersectionIds: [...intersections] };
}
export interface Round2Route { points: CityPoint[]; start: number; length: number; roadIds: string[]; focus: CityPoint; focusStation:number;laneOffset: number; boundaryStation?: number }
export function round2Route(map: CityMapData, test: RoadTrialCase): Round2Route {
  const junction = map.intersections.find(j => test.intersectionIds.includes(j.id));
  const connection = junction?.connections[0];
  const road = map.roads.find(r => r.id === (test.roadIds[0] ?? connection?.roadId));
  if (!road) throw new Error('Missing real route ' + test.id);
  const roads = new Map(map.roads.map(r => [r.id, r])), ids = [road.id];
  let current = road, reverse = connection ? connection.end === 'start' : road.travelDirection === 'reverse';
  let path = roadPoints(road); if (reverse) path.reverse();
  const focus = junction ? { ...junction.position } : test.id === 'underground' ? { ...path.at(-1)! } : sampleAt(path, polylineLength(path) * .5).point;
  const offset = road.travelDirection === 'two-way' || road.laneCount % 2 === 0 ? road.laneWidth / 2 : 0;
  const seen = new Set(ids);
  for (let part = 0; part < 5; part++) {
    const end = reverse ? 'start' : 'end', tail = path.at(-1)!, previous = path.at(-2)!, len = Math.hypot(tail.x - previous.x, tail.z - previous.z) || 1;
    const tx = (tail.x - previous.x) / len, tz = (tail.z - previous.z) / len;
    const candidates: { road: CityRoad; reverse: boolean; path: CityPoint[]; score: number; hub?: CityPoint }[] = [];
    const add = (id: string, start: 'start' | 'end', hub?: CityPoint) => {
      const road = roads.get(id); if (!road || seen.has(id)) return;
      const reverse = start === 'end'; if (road.travelDirection === (reverse ? 'forward' : 'reverse')) return;
      let next = roadPoints(road); if (reverse) next = next.reverse();
      const a = next[0]!, b = next[1]!, length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      candidates.push({ road, reverse, path: next, score: tx * (b.x - a.x) / length + tz * (b.z - a.z) / length, hub });
    };
    for (const link of map.roadLinks ?? []) {
      if (link.from.roadId === current.id && link.from.end === end) add(link.to.roadId, link.to.end);
      if (link.to.roadId === current.id && link.to.end === end) add(link.from.roadId, link.from.end);
    }
    for (const j of map.intersections) if (j.connections.some(c => c.roadId === current.id && c.end === end)) for (const c of j.connections) add(c.roadId, c.end, j.position);
    candidates.sort((a, b) => b.score - a.score);
    const next = candidates[0]; if (!next || next.score < .7) break;
    if (next.hub) path.push({ ...next.hub });
    path.push(...next.path.slice(next.hub ? 0 : 1)); ids.push(next.road.id); seen.add(next.road.id); current = next.road; reverse = next.reverse;
    if (polylineLength(path) > 1800) break;
  }
  const centre = path;
  path = sampleRibbonPolyline(centre, 3).map(s => ({ x: s.point.x - s.tangent.z * offset, y: s.point.y ?? 0, z: s.point.z + s.tangent.x * offset }));
  let distance = 0, closest = Infinity, focusStation = 0;
  const crossings: { station: number; distance: number }[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!, length = Math.hypot(b.x - a.x, b.z - a.z);
    const gap = Math.hypot(a.x - focus.x, a.z - focus.z);
    if (gap < closest) { closest = gap; focusStation = distance; }
    for (const axis of ['x', 'z'] as const) if (Math.floor(a[axis] / map.sectorSize) !== Math.floor(b[axis] / map.sectorSize)) {
      const boundary = (Math.floor(Math.min(a[axis], b[axis]) / map.sectorSize) + 1) * map.sectorSize, t = (boundary - a[axis]) / (b[axis] - a[axis]);
      if (t >= 0 && t <= 1) crossings.push({ station: distance + length * t, distance: Math.hypot(a.x + (b.x - a.x) * t - focus.x, a.z + (b.z - a.z) * t - focus.z) });
    }
    distance += length;
  }
  crossings.sort((a, b) => a.distance - b.distance);
  const boundaryStation = crossings[0]?.station;
  return { points: path, start: Math.max(5, Math.min(distance - 50, (boundaryStation ?? focusStation) - 28)), length: distance, roadIds: ids, focus, focusStation,laneOffset: offset, boundaryStation };
}
