import type { Subject3GroundConfig, Subject3Point2 } from './Subject3GroundConfig';
import type { Subject3Topology } from './topology';
import type {
  Subject3Bounds,
  Subject3JunctionArmMetadata,
  Subject3JunctionMetadata,
  Subject3MapMetadata,
  Subject3RoadMetadata,
  Subject3ZoneMetadata,
} from './types';
import { yawFacing } from './math';

const boundsAround = (
  centre: Subject3Point2,
  lengthX: number,
  lengthZ: number,
): Subject3Bounds => ({
  minimumX: centre.x - lengthX * 0.5,
  maximumX: centre.x + lengthX * 0.5,
  minimumZ: centre.z - lengthZ * 0.5,
  maximumZ: centre.z + lengthZ * 0.5,
});

/**
 * Stable map metadata for the shared Subject 3 map. Junction arms carry their
 * own approach heading and lane layout so later examination-route authoring can
 * describe manoeuvres without re-deriving geometry.
 */
export const createSubject3MapMetadata = (
  config: Subject3GroundConfig,
  topology: Subject3Topology,
): Subject3MapMetadata => {
  const roads: Subject3RoadMetadata[] = topology.segments.map((segment) => {
    const first = segment.centerline[0] ?? segment.start;
    const second = segment.centerline[1] ?? segment.end;
    return {
      id: segment.id,
      name: segment.name,
      roadClass: segment.roadClass,
      width: segment.width,
      speedLimitKmh: segment.speedLimitKmh,
      headingRadians: yawFacing(second.x - first.x, second.z - first.z),
      centerline: segment.centerline.map((point) => ({ ...point })),
      length: segment.length,
    };
  });

  const junctions: Subject3JunctionMetadata[] = topology.junctions.map((junction) => {
    const arms: Subject3JunctionArmMetadata[] = junction.arms.map((arm) => ({
      segmentId: arm.segmentId,
      outward: { ...arm.outward },
      approachYawRadians: arm.approachYawRadians,
      approachLaneCount: arm.approachLaneCount,
      roadWidth: arm.roadWidth,
    }));
    return {
      id: junction.id,
      kind: junction.kind,
      center: { ...junction.center },
      halfExtentX: junction.halfExtentX,
      halfExtentZ: junction.halfExtentZ,
      arms,
      hasTrafficSignals: junction.hasTrafficSignals,
    };
  });

  const zones: Subject3ZoneMetadata[] = config.zones.map((zone) => ({
    id: zone.id,
    kind: zone.kind,
    label: zone.label,
    bounds: { ...zone.bounds },
    headingRadians: zone.headingRadians,
  }));

  const totalRoadLength = topology.segments.reduce((sum, segment) => sum + segment.length, 0);

  return {
    id: 'subject-3-shared-city-map',
    version: 1,
    displayName: '科目三共享城市地图',
    description: '共享城市街区路网：两条长直主路、多处十字与丁字路口、信号灯路口、学校、公交站、商业区与北侧地标。',
    mapId: 'cn-subject-3-shared-city-map',
    schemaVersion: '1.0.0',
    coordinateUnits: 'metres',
    bounds: boundsAround({ x: 0, z: 0 }, config.site.length, config.site.width),
    spawn: {
      position: { ...config.spawn.position },
      yawRadians: config.spawn.yawRadians,
    },
    totalRoadLength,
    junctions,
    roads,
    zones,
  };
};
