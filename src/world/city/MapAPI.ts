import { ROAD_LANES, newCityMap, type CityIntersection, type CityMapData, type CityObject, type CityPoint, type CityRoad, type RoadEndpoint } from './CityMapData';
import { connectionPoint, portsFor, refreshPortPoses, roadPoints, syncConnections } from './geometry';
import { loadCityMap } from './CityMapLoader';
import { validateMap } from './CityMapValidation';
import { applyRoadStyle } from './RoadStyles';
import { CityMapIds } from './CityMapIds';
import { checkedEndpoint, connectRoads, roadEndpoint } from './RoadConnections';
import { expandPreset, type PresetParameters, type PresetStamp } from './presets/InfrastructurePresets';
export { validateMap, newCityMap, connectRoads, roadEndpoint };
export { point3 } from './coordinates';
export const newMapId = (prefix: string): string => prefix + '-' + crypto.randomUUID();

function assertValid(map: CityMapData): void {
  refreshPortPoses(map);
  const report = validateMap(map);
  if (!report.valid) throw new Error(report.errors.map(e => e.code + ' ' + e.path + ': ' + e.message).join('\n'));
}
function idFor(map: CityMapData, id: string | undefined, base: string): string {
  const ids = new CityMapIds(map); return id === undefined ? ids.allocate(base) : ids.explicit(id);
}
/** Preserve live references held by editor/script callers. */
function commit(map: CityMapData, next: CityMapData): void {
  const merge = <T extends { id: string }>(old: T[], fresh: T[]): T[] => fresh.map(item => {
    const live = old.find(o => o.id === item.id); if (!live) return item;
    Object.assign(live, item); return live;
  });
  map.roads = merge(map.roads, next.roads); map.intersections = merge(map.intersections, next.intersections);
  map.objects = merge(map.objects, next.objects); map.roadLinks = next.roadLinks; map.connectionPorts = next.connectionPorts;
}
export interface RoadInput extends Partial<Omit<CityRoad, 'centerline'>> { centerline: CityPoint[]; baseName?: string }
export function createRoad(map: CityMapData, input: RoadInput): CityRoad {
  if (!Array.isArray(input.centerline)) throw new Error('road.nodes: centerline array required');
  const road: CityRoad = { id: idFor(map, input.id, input.baseName ?? 'road'), type: 'urban_4lane', centerline: [], laneCount: 4, laneWidth: 3.5, speedLimit: 40, travelDirection: 'two-way' };
  applyRoadStyle(road, input.styleId ?? 'urban_street_4');
  const { centerline, baseName: _base, id: _id, ...overrides } = input; Object.assign(road, overrides);
  road.centerline = centerline.map(p => ({ ...p, y: p?.y ?? (road.elevationMode === 'elevated' ? road.elevation ?? 6 : 0) }));
  if (centerline.some(p => p?.y !== undefined && p.y !== (road.elevation ?? 0)) && input.elevationMode === undefined) road.elevationMode = 'custom';
  if (input.type && input.laneCount === undefined) road.laneCount = ROAD_LANES[input.type];
  if (road.type === 'ramp_1' && input.travelDirection === undefined) road.travelDirection = 'forward';
  const fragment = newCityMap(); fragment.roads.push(road); assertValid(fragment);
  map.roads.push(road); return road;
}
export function detachRoadEndpoint(map: CityMapData, value: RoadEndpoint): void {
  const endpoint = checkedEndpoint(value);
  for (const j of map.intersections) j.connections = j.connections.filter(c => c.roadId !== endpoint.roadId || c.end !== endpoint.end);
  map.roadLinks = (map.roadLinks ?? []).filter(l => !(l.from.roadId === endpoint.roadId && l.from.end === endpoint.end) && !(l.to.roadId === endpoint.roadId && l.to.end === endpoint.end));
}
export function moveRoadNode(map: CityMapData, roadId: string, index: number, point: CityPoint): void {
  const next = structuredClone(map), road = next.roads.find(r => r.id === roadId);
  if (!road || !Number.isInteger(index) || !road.centerline[index]) throw new Error('road.node: ' + roadId + '[' + index + '] not found');
  if (index === 0 || index === road.centerline.length - 1) detachRoadEndpoint(next, { roadId, end: index === 0 ? 'start' : 'end' });
  if (point.y !== undefined && road.elevationMode !== 'custom') { road.centerline = roadPoints({ ...road, curve: 'polyline' }); road.elevationMode = 'custom'; }
  road.centerline[index] = { ...point, y: point.y ?? road.centerline[index]!.y ?? 0 };
  assertValid(next); commit(map, next);
}
export function createIntersection(map: CityMapData, input: Omit<CityIntersection, 'id' | 'connections'> & { id?: string; baseName?: string; connections?: CityIntersection['connections'] }): CityIntersection {
  const { baseName, ...properties } = input;
  const j: CityIntersection = { ...properties, markingFootprint:properties.markingFootprint??{kind:'junction',margin:0.4}, id: idFor(map, input.id, baseName ?? 'junction'), position: { ...input.position, y: input.position.y ?? 0 }, connections: structuredClone(input.connections ?? []) };
  const next = structuredClone(map); next.intersections.push(j); syncConnections(next); assertValid(next);
  commit(map, next); return map.intersections.find(item => item.id === j.id)!;
}
export function placePrefab(map: CityMapData, input: Omit<CityObject, 'id'> & { id?: string; baseName?: string }): CityObject {
  const { baseName, ...properties } = input;
  const object: CityObject = { ...properties, id: idFor(map, input.id, baseName ?? input.prefabId), position: { ...input.position, y: input.position.y ?? 0 } };
  const fragment = newCityMap(); fragment.objects.push(object); assertValid(fragment);
  map.objects.push(object); return object;
}
export type ConnectionTarget = { junctionId: string; port: CityIntersection['connections'][number]['port'] } | { endpoint: RoadEndpoint };
export function connectRoad(map: CityMapData, value: RoadEndpoint, target: ConnectionTarget): void {
  const from = checkedEndpoint(value), next = structuredClone(map); roadEndpoint(next, from);
  const road = next.roads.find(r => r.id === from.roadId)!;
  let position: CityPoint;
  if ('junctionId' in target) {
    const j = next.intersections.find(j => j.id === target.junctionId); if (!j) throw new Error('connection.broken: ' + target.junctionId);
    if (!portsFor(j).includes(target.port)) throw new Error('port.invalid: ' + j.id + ':' + target.port);
    if (j.connections.some(c => c.port === target.port && (c.roadId !== from.roadId || c.end !== from.end))) throw new Error('port.conflict: ' + j.id + ':' + target.port);
    position = connectionPoint(j, target.port, next);
  } else {
    checkedEndpoint(target.endpoint);
    if (target.endpoint.roadId === from.roadId && target.endpoint.end === from.end) throw new Error('connection.self: cannot connect endpoint to itself');
    position = roadEndpoint(next, target.endpoint);
  }
  detachRoadEndpoint(next, from); road.centerline = roadPoints({ ...road, curve: 'polyline' });
  const index = from.end === 'start' ? 0 : road.centerline.length - 1;
  if (Math.abs((road.centerline[index]!.y ?? 0) - (position.y ?? 0)) > 0.01) road.elevationMode = 'custom';
  road.centerline[index] = position;
  if ('junctionId' in target) next.intersections.find(j => j.id === target.junctionId)!.connections.push({ ...from, port: target.port });
  else connectRoads(next, from, target.endpoint);
  syncConnections(next); assertValid(next); commit(map, next);
}

/** Reject endpoint/off-road cuts; remap the original end in every reference collection. */
export function splitRoadAtPoint(map: CityMapData, roadId: string, point: CityPoint, options: { baseName?: string; tolerance?: number } = {}): { before: CityRoad; after: CityRoad; from: RoadEndpoint; to: RoadEndpoint } {
  if (![point.x, point.y ?? 0, point.z].every(Number.isFinite)) throw new Error('split.point: finite {x,y,z} required');
  const next = structuredClone(map), road = next.roads.find(r => r.id === roadId);
  if (!road) throw new Error('connection.broken: ' + roadId);
  const points = roadPoints(road), tolerance = options.tolerance ?? 0.05;
  let best: { index: number; point: CityPoint; distance: number } | undefined;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, dx = b.x - a.x, dz = b.z - a.z, length2 = dx * dx + dz * dz;
    if (length2 < 0.0025) continue;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / length2));
    const q = { x: a.x + dx * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, z: a.z + dz * t };
    const distance = Math.hypot(q.x - point.x, q.z - point.z, (q.y ?? 0) - (point.y ?? 0));
    if (!best || distance < best.distance) best = { index: i, point: q, distance };
  }
  if (!best || best.distance > tolerance) throw new Error('split.off-road: ' + roadId + '; point must lie on the road in XYZ');
  const distanceXZ = (a: CityPoint, b: CityPoint) => Math.hypot(a.x - b.x, a.z - b.z);
  // Snap a near-control cut to that existing vertex so both halves meet exactly.
  for (const p of [points[best.index - 1]!, points[best.index]!]) if (distanceXZ(best.point, p) < 0.05) { best.point = { ...p }; break; }
  if (distanceXZ(best.point, points[0]!) < 0.05 || distanceXZ(best.point, points.at(-1)!) < 0.05) throw new Error('split.endpoint: ' + roadId + '; use existing endpoint');
  const left = points.slice(0, best.index), right = points.slice(best.index);
  if (distanceXZ(left.at(-1)!, best.point) >= 0.05) left.push(best.point);
  if (distanceXZ(right[0]!, best.point) >= 0.05) right.unshift(best.point);
  const after: CityRoad = { ...structuredClone(road), id: idFor(next, undefined, options.baseName ?? (roadId + '-split')), curve: 'polyline', elevationMode: 'custom', centerline: right };
  road.centerline = left; road.curve = 'polyline'; road.elevationMode = 'custom'; next.roads.push(after);
  const remap = (e: RoadEndpoint): void => { if (e.roadId === roadId && e.end === 'end') e.roadId = after.id; };
  for (const link of next.roadLinks ?? []) { remap(link.from); remap(link.to); }
  for (const j of next.intersections) for (const c of j.connections) remap(c);
  for (const port of next.connectionPorts ?? []) remap(port.endpoint);
  const from: RoadEndpoint = { roadId, end: 'end' }, to: RoadEndpoint = { roadId: after.id, end: 'start' };
  connectRoads(next, from, to); assertValid(next); commit(map, next);
  return { before: map.roads.find(r => r.id === roadId)!, after: map.roads.find(r => r.id === after.id)!, from, to };
}
export function deleteObject(map: CityMapData, id: string): void {
  map.roads = map.roads.filter(r => r.id !== id); map.objects = map.objects.filter(o => o.id !== id); map.intersections = map.intersections.filter(j => j.id !== id);
  for (const j of map.intersections) j.connections = j.connections.filter(c => c.roadId !== id);
  map.roadLinks = (map.roadLinks ?? []).filter(l => l.from.roadId !== id && l.to.roadId !== id);
  map.connectionPorts = (map.connectionPorts ?? []).filter(p => p.endpoint.roadId !== id);
  if(map.signs)map.signs=map.signs.filter(sign=>sign.roadId!==id);
}
export function placePreset(map: CityMapData, id: string, parameters: PresetParameters = {}): PresetStamp {
  const ids = new CityMapIds(map);
  const stamp = expandPreset(id, { ...parameters, groupId: ids.allocate(parameters.groupId ?? id) });
  const names = new Map<string, string>();
  for (const item of [...stamp.roads, ...stamp.intersections, ...stamp.objects, ...stamp.roadLinks, ...stamp.connectionPorts]) {
    const previous = item.id; item.id = ids.allocate(previous); names.set(previous, item.id);
  }
  const remap = (endpoint: RoadEndpoint): void => { endpoint.roadId = names.get(endpoint.roadId) ?? endpoint.roadId; };
  for (const j of stamp.intersections) for (const c of j.connections) remap(c);
  for (const l of stamp.roadLinks) { remap(l.from); remap(l.to); }
  for (const p of stamp.connectionPorts) remap(p.endpoint);
  const fragment = { ...newCityMap(), ...stamp }; assertValid(fragment);
  const candidate = { ...map, roads: [...map.roads, ...stamp.roads], intersections: [...map.intersections, ...stamp.intersections], objects: [...map.objects, ...stamp.objects], roadLinks: [...map.roadLinks ?? [], ...stamp.roadLinks], connectionPorts: [...map.connectionPorts ?? [], ...stamp.connectionPorts] };
  assertValid(candidate);
  map.roads.push(...stamp.roads); map.intersections.push(...stamp.intersections); map.objects.push(...stamp.objects);
  (map.roadLinks ??= []).push(...stamp.roadLinks); (map.connectionPorts ??= []).push(...stamp.connectionPorts);
  return stamp;
}
export function saveMap(map: CityMapData): string { return JSON.stringify(loadCityMap(map), null, 2) + '\n'; }
