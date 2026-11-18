import type { CityMapData, CityPoint, RoadEndpoint } from './CityMapData';
import { roadPoints } from './geometry';
import { CityMapIds } from './CityMapIds';

export function checkedEndpoint(endpoint: RoadEndpoint): RoadEndpoint {
  if (!endpoint || typeof endpoint !== 'object' || typeof endpoint.roadId !== 'string' ||
    !['start', 'end'].includes(endpoint.end) || Object.keys(endpoint).some(k => k !== 'roadId' && k !== 'end')) {
    throw new Error('connection.shape: expected exactly {roadId,end:"start"|"end"}; do not pass a node or port');
  }
  return { roadId: endpoint.roadId, end: endpoint.end };
}
export function roadEndpoint(map: CityMapData, value: RoadEndpoint): CityPoint {
  const endpoint = checkedEndpoint(value), road = map.roads.find(r => r.id === endpoint.roadId);
  if (!road || road.centerline.length < 2) throw new Error(`connection.broken: ${endpoint.roadId}`);
  const points = roadPoints({ ...road, curve: 'polyline' });
  return { ...(endpoint.end === 'start' ? points[0]! : points.at(-1)!) };
}
export const endpointKey = (e: RoadEndpoint): string => `${e.roadId}:${e.end}`;
export const linkKey = (a: RoadEndpoint, b: RoadEndpoint): string => [endpointKey(a), endpointKey(b)].sort().join('|');

/** Coincident endpoints only; snapping/moving is a separate operation. */
export function connectRoads(map: CityMapData, fromValue: RoadEndpoint, toValue: RoadEndpoint, options: { id?: string; baseName?: string } = {}) {
  const from = checkedEndpoint(fromValue), to = checkedEndpoint(toValue);
  const a = roadEndpoint(map, from), b = roadEndpoint(map, to);
  if (endpointKey(from) === endpointKey(to)) throw new Error('connection.self: cannot connect an endpoint to itself');
  if (Math.hypot(a.x - b.x, a.z - b.z) > 0.2 || Math.abs((a.y ?? 0) - (b.y ?? 0)) > 0.2) {
    throw new Error(`connection.gap: ${endpointKey(from)} / ${endpointKey(to)} must coincide in XYZ within 0.2m`);
  }
  if (map.intersections.some(j => j.connections.some(c => endpointKey(c) === endpointKey(from) || endpointKey(c) === endpointKey(to)))) {
    throw new Error('port.conflict: junction endpoints cannot also have road links');
  }
  const existing = (map.roadLinks ?? []).find(l => linkKey(l.from, l.to) === linkKey(from, to));
  if (existing) throw new Error(`connection.duplicate: ${existing.id}`);
  const ids = new CityMapIds(map), id = options.id ? ids.explicit(options.id) : ids.allocate(options.baseName ?? 'link');
  const link = { id, from, to }; (map.roadLinks ??= []).push(link); return link;
}
