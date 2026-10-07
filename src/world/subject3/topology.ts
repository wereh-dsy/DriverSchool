import type {
  Subject3GroundConfig, Subject3JunctionKind, Subject3Point2,
  Subject3RoadClass, Subject3RoadSegmentConfig,
} from './Subject3GroundConfig';
import { armControlKind, type Subject3SignalArmMetadata } from './trafficSignals';
import { normalize2, polylineLength, yawFacing } from './math';

export interface Subject3SegmentTopology {
  readonly id: string;
  readonly name: string;
  readonly roadClass: Subject3RoadClass;
  readonly width: number;
  readonly speedLimitKmh: number;
  readonly centerline: readonly Subject3Point2[];
  readonly length: number;
  readonly start: Subject3Point2;
  readonly end: Subject3Point2;
}
export interface Subject3JunctionArm {
  readonly segmentId: string;
  readonly roadWidth: number;
  readonly outward: Subject3Point2;
  readonly junctionCentre: Subject3Point2;
  readonly approachYawRadians: number;
  readonly right: Subject3Point2;
  readonly approachLaneCount: number;
  readonly approachLaneWidth: number;
  readonly controlKind: 'north-south' | 'east-west';
  /** Distance along this arm to the intersection pavement boundary. */
  readonly axialDistance: number;
}
export interface Subject3JunctionTopology {
  readonly id: string;
  readonly kind: Subject3JunctionKind;
  readonly center: Subject3Point2;
  readonly halfExtentX: number;
  readonly halfExtentZ: number;
  readonly arms: readonly Subject3JunctionArm[];
  readonly hasTrafficSignals: boolean;
  readonly signalQuadrant: 'north-south' | 'east-west';
  readonly signalOffsetSeconds: number;
}
export interface Subject3SegmentGap {
  readonly startDistance: number;
  readonly endDistance: number;
}
export interface Subject3Topology {
  readonly segments: readonly Subject3SegmentTopology[];
  readonly junctions: readonly Subject3JunctionTopology[];
  readonly gapRangesBySegment: ReadonlyMap<string, readonly Subject3SegmentGap[]>;
}
export const segmentCenterline = (road: Subject3RoadSegmentConfig): readonly Subject3Point2[] =>
  [road.start, ...(road.via ?? []), road.end];
export const laneWidthFor = (roadClass: Subject3RoadClass, config: Subject3GroundConfig): number =>
  roadClass === 'arterial' ? config.lanes.arterialLaneWidth
    : roadClass === 'standard' ? config.lanes.standardLaneWidth : config.lanes.narrowLaneWidth;
/** All shared-city streets have two lanes in each direction, regardless of class. */
export const laneCountPerDirection = (_roadClass: Subject3RoadClass): number => 2;
export const defaultSpeedLimit = (roadClass: Subject3RoadClass): number =>
  roadClass === 'arterial' ? 50 : roadClass === 'standard' ? 40 : 30;

/** A through street contributes TWO approaches; endpoints contribute one.
 * Use the local tangent at the contact, not a remote polyline endpoint. */
const directionsAt = (points: readonly Subject3Point2[], center: Subject3Point2): Subject3Point2[] => {
  const directions: Subject3Point2[] = [];
  const add = (point: Subject3Point2): void => {
    if (Math.hypot(point.x - center.x, point.z - center.z) < 0.05) return;
    const direction = normalize2({ x: point.x - center.x, z: point.z - center.z });
    if (!directions.some((d) => d.x * direction.x + d.z * direction.z > 0.999)) directions.push(direction);
  };
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!, b = points[i]!;
    const dx = b.x - a.x, dz = b.z - a.z, squared = dx * dx + dz * dz;
    if (squared < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((center.x - a.x) * dx + (center.z - a.z) * dz) / squared));
    if (Math.hypot(a.x + dx * t - center.x, a.z + dz * t - center.z) > 0.02) continue;
    add(a);
    add(b);
  }
  return directions;
};

/** Liang–Barsky slab clipping, including junctions in the MIDDLE of long roads. */
const clippedInterval = (
  a: Subject3Point2, b: Subject3Point2, center: Subject3Point2, halfX: number, halfZ: number,
): readonly [number, number] | null => {
  let enter = 0, exit = 1;
  for (const [origin, delta, minimum, maximum] of [
    [a.x, b.x - a.x, center.x - halfX, center.x + halfX],
    [a.z, b.z - a.z, center.z - halfZ, center.z + halfZ],
  ] as const) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < minimum || origin > maximum) return null;
      continue;
    }
    const t0 = (minimum - origin) / delta, t1 = (maximum - origin) / delta;
    enter = Math.max(enter, Math.min(t0, t1));
    exit = Math.min(exit, Math.max(t0, t1));
    if (exit <= enter) return null;
  }
  return [enter, exit];
};

export const buildSubject3Topology = (config: Subject3GroundConfig): Subject3Topology => {
  const segments: Subject3SegmentTopology[] = config.roads.map((road) => {
    const centerline = segmentCenterline(road);
    return { ...road, centerline, length: polylineLength(centerline),
      speedLimitKmh: road.speedLimitKmh ?? defaultSpeedLimit(road.roadClass) };
  });
  const gapRangesBySegment = new Map<string, Subject3SegmentGap[]>();
  const junctions: Subject3JunctionTopology[] = config.junctions.map((definition) => {
    const contacts = segments.flatMap((segment) => directionsAt(segment.centerline, definition.center)
      .map((outward) => ({ segment, outward })));
    const halfExtentX = Math.max(5.4, ...contacts.map(({ segment, outward }) =>
      segment.width * 0.5 * Math.abs(outward.z) + 1.8));
    const halfExtentZ = Math.max(5.4, ...contacts.map(({ segment, outward }) =>
      segment.width * 0.5 * Math.abs(outward.x) + 1.8));
    const arms: Subject3JunctionArm[] = contacts.map(({ segment, outward }) => {
      const approach = { x: -outward.x, z: -outward.z };
      return {
        segmentId: segment.id, outward, roadWidth: segment.width,
        junctionCentre: definition.center, approachYawRadians: yawFacing(approach.x, approach.z),
        right: { x: -approach.z, z: approach.x },
        approachLaneCount: laneCountPerDirection(segment.roadClass),
        approachLaneWidth: segment.width / (laneCountPerDirection(segment.roadClass) * 2),
        controlKind: armControlKind(outward),
        axialDistance: Math.min(
          Math.abs(outward.x) > 1e-9 ? halfExtentX / Math.abs(outward.x) : Infinity,
          Math.abs(outward.z) > 1e-9 ? halfExtentZ / Math.abs(outward.z) : Infinity,
        ),
      };
    });
    const junction: Subject3JunctionTopology = {
      ...definition, halfExtentX, halfExtentZ, arms,
      hasTrafficSignals: definition.kind === 'signalised',
      signalQuadrant: definition.signalQuadrant ?? 'north-south',
      signalOffsetSeconds: definition.signalOffsetSeconds ?? 0,
    };
    // Paint and raised kerbs must not cross another carriageway. Separate
    // intervals are retained for polylines rather than swallowing unrelated bends.
    for (const segment of segments) {
      if (!arms.some((arm) => arm.segmentId === segment.id)) continue;
      let distance = 0;
      for (let i = 1; i < segment.centerline.length; i += 1) {
        const a = segment.centerline[i - 1]!, b = segment.centerline[i]!;
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        const clip = clippedInterval(a, b, junction.center,
          halfExtentX + config.markings.junctionMargin,
          halfExtentZ + config.markings.junctionMargin);
        if (clip) {
          const gaps = gapRangesBySegment.get(segment.id) ?? [];
          gaps.push({ startDistance: distance + length * clip[0], endDistance: distance + length * clip[1] });
          gapRangesBySegment.set(segment.id, gaps);
        }
        distance += length;
      }
    }
    return junction;
  });
  return { segments, junctions, gapRangesBySegment };
};
export const signalArmMetadata = (arm: Subject3JunctionArm): Subject3SignalArmMetadata => ({ ...arm });
export const isAxisAligned = (a: Subject3Point2, b: Subject3Point2): boolean =>
  Math.abs(a.x - b.x) < 0.05 || Math.abs(a.z - b.z) < 0.05;
export const findSegment = (topology: Subject3Topology, id: string): Subject3SegmentTopology | undefined =>
  topology.segments.find((segment) => segment.id === id);
export const findJunction = (topology: Subject3Topology, id: string): Subject3JunctionTopology | undefined =>
  topology.junctions.find((junction) => junction.id === id);
