import type { RoadNetworkData, RoadSegmentData } from '../navigation/RoadNetwork';
import type { CityMapData, CityPoint, TravelDirection } from './CityMapData';
import { junctionExtent, polylineLength, portDirection, roadPoints, rotatePoint } from './geometry';
import { armControlKind } from '../subject3/trafficSignals';
export interface CityLaneData { id: string; roadId: string; index: number; direction: 'forward' | 'reverse'; width: number }
export interface CityNetworkSegment extends RoadSegmentData {
  centerline: CityPoint[];
  travelDirection: TravelDirection; speedLimit: number; laneCount: number; lanes: CityLaneData[];
  startIntersectionId?: string; endIntersectionId?: string;
}
export interface CityRoadNetwork extends RoadNetworkData {
  segments: CityNetworkSegment[];
  connectivity: { intersectionId: string; incomingRoadIds: string[]; outgoingRoadIds: string[] }[];
  endpointNodes: { id: string; position: CityPoint; ends: { roadId: string; end: 'start' | 'end' }[] }[];
  laneConnections: { intersectionId: string; fromLaneId: string; toLaneId: string }[];
}
export function buildCityRoadNetwork(map: CityMapData): CityRoadNetwork {
  const segments = map.roads.map(r => {
    const centerline = roadPoints(r);
    const endpoint = (end: 'start' | 'end') => map.intersections.find(j => j.connections.some(c => c.roadId === r.id && c.end === end))?.id;
    return { id: r.id, centerline, width: r.laneCount * r.laneWidth, length: polylineLength(centerline),
      laneCountPerDirection: r.travelDirection === 'two-way' ? r.laneCount / 2 : r.laneCount, laneWidth: r.laneWidth,
      laneCount: r.laneCount, travelDirection: r.travelDirection, speedLimit: r.speedLimit,
      startIntersectionId: endpoint('start'), endIntersectionId: endpoint('end'),
      lanes: Array.from({ length: r.laneCount }, (_, index): CityLaneData => ({ id: `${r.id}:lane:${index}`, roadId: r.id, index,
        direction: r.travelDirection === 'two-way' ? (index < r.laneCount / 2 ? 'reverse' : 'forward') : r.travelDirection, width: r.laneWidth })) };
  });
  const connectivity = map.intersections.map(j => {
    const incomingRoadIds: string[] = [], outgoingRoadIds: string[] = [];
    for (const c of j.connections) {
      const r = map.roads.find(r => r.id === c.roadId)!;
      if (r.travelDirection === 'two-way' || (r.travelDirection === 'forward') === (c.end === 'end')) incomingRoadIds.push(r.id);
      if (r.travelDirection === 'two-way' || (r.travelDirection === 'forward') === (c.end === 'start')) outgoingRoadIds.push(r.id);
    }
    return { intersectionId: j.id, incomingRoadIds, outgoingRoadIds };
  });
  const endpointNodes: CityRoadNetwork['endpointNodes'] = [];
  for (const road of segments) for (const end of ['start', 'end'] as const) {
    if ((end === 'start' ? road.startIntersectionId : road.endIntersectionId) !== undefined) continue;
    const position = end === 'start' ? road.centerline[0]! : road.centerline.at(-1)!;
    endpointNodes.push({ id: `endpoint:${road.id}:${end}`, position, ends: [{ roadId: road.id, end }] });
  }
  for (const link of map.roadLinks ?? []) {
    const a = endpointNodes.find(n => n.ends.some(e => e.roadId === link.from.roadId && e.end === link.from.end));
    const b = endpointNodes.find(n => n.ends.some(e => e.roadId === link.to.roadId && e.end === link.to.end));
    if (a && b && a !== b) { a.ends.push(...b.ends); endpointNodes.splice(endpointNodes.indexOf(b), 1); }
  }
  const laneConnections: CityRoadNetwork['laneConnections'] = [];
  for (const node of endpointNodes.filter(n => n.ends.length > 1)) {
    const incomingRoadIds: string[] = [], outgoingRoadIds: string[] = [];
    for (const end of node.ends) {
      const road = segments.find(r => r.id === end.roadId)!;
      if (road.lanes.some(l => (l.direction === 'forward') === (end.end === 'end'))) incomingRoadIds.push(road.id);
      if (road.lanes.some(l => (l.direction === 'forward') === (end.end === 'start'))) outgoingRoadIds.push(road.id);
    }
    connectivity.push({ intersectionId: node.id, incomingRoadIds, outgoingRoadIds });
    for (const fromId of incomingRoadIds) for (const toId of outgoingRoadIds) if (fromId !== toId) {
      const from = segments.find(r => r.id === fromId)!, to = segments.find(r => r.id === toId)!;
      const fromEnd = node.ends.find(e => e.roadId === fromId)!, toEnd = node.ends.find(e => e.roadId === toId)!;
      for (const fromLane of from.lanes) for (const toLane of to.lanes) if ((fromLane.direction === 'forward') === (fromEnd.end === 'end') && (toLane.direction === 'forward') === (toEnd.end === 'start')) laneConnections.push({ intersectionId: node.id, fromLaneId: fromLane.id, toLaneId: toLane.id });
    }
  }
  for (const j of map.intersections) for (const incoming of j.connections) for (const outgoing of j.connections) {
    if (incoming.roadId === outgoing.roadId) continue;
    const from = segments.find(r => r.id === incoming.roadId)!, to = segments.find(r => r.id === outgoing.roadId)!;
    for (const fromLane of from.lanes) {
      if ((fromLane.direction === 'forward') !== (incoming.end === 'end')) continue;
      for (const toLane of to.lanes) if ((toLane.direction === 'forward') === (outgoing.end === 'start')) {
        laneConnections.push({ intersectionId: j.id, fromLaneId: fromLane.id, toLaneId: toLane.id });
      }
    }
  }
  return { mapId: map.id, bounds: { minimumX: map.bounds.minX, maximumX: map.bounds.maxX, minimumZ: map.bounds.minZ, maximumZ: map.bounds.maxZ }, segments, connectivity, endpointNodes, laneConnections,
    intersections: map.intersections.map(j => {
      const h = junctionExtent(j, map), box = h * (Math.abs(Math.cos(j.rotation)) + Math.abs(Math.sin(j.rotation)));
      return { id: j.id, center: j.position, halfExtentX: box, halfExtentZ: box, arms: j.connections.map(c => {
        const r = map.roads.find(r => r.id === c.roadId)!, outward = rotatePoint(portDirection(j,c.port), j.rotation);
        return { segmentId: r.id, outward, approachYawRadians: Math.atan2(outward.x, outward.z), approachLaneCount: r.travelDirection === 'two-way' ? r.laneCount / 2 : r.laneCount,
          trafficSignal: j.signalized ? { junctionId: j.id, controlKind: armControlKind(portDirection(j,c.port)) } : undefined };
      }) };
    }) };
}
