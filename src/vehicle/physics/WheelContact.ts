import type { RoadSurfaceSample, SurfaceMaterial, SurfaceType } from '../../world/SurfaceMaterial';
import { VEHICLE_WHEEL_IDS, wheelLocalPosition } from '../VehicleDimensions';
import { wetGripScale } from '../../world/environment/EnvironmentState';

export const WHEEL_IDS = VEHICLE_WHEEL_IDS;
export type WheelId = typeof WHEEL_IDS[number];

export interface GroundNormal {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface WheelContact extends SurfaceMaterial {
  readonly wetness?: number;
  readonly id: WheelId;
  readonly x: number;
  readonly z: number;
  readonly height: number;
  readonly normal: GroundNormal;
  readonly surfaceType: SurfaceType;
}

export type WheelContactSet = Readonly<Record<WheelId, WheelContact>>;

export interface WheelContactDimensions {
  readonly wheelBase: number;
  readonly frontTrackWidth: number;
  readonly rearTrackWidth: number;
}

export interface WheelContactPose {
  /** World body origin at the axle midpoint, matching wheelLocalPosition geometry. */
  readonly x: number;
  readonly z: number;
  /** Rotation around +Y: zero faces world -Z. */
  readonly yaw: number;
}

export interface WheelSurfaceQuery {
  sampleRoadSurface(x: number, z: number): RoadSurfaceSample;
}

/** Four independent samples; local forward is -Z and local right is +X. */
export function sampleWheelContacts(
  ground: WheelSurfaceQuery,
  pose: WheelContactPose,
  dimensions: WheelContactDimensions,
  wetness = 0,
): WheelContactSet {
  const sine = Math.sin(pose.yaw);
  const cosine = Math.cos(pose.yaw);
  const sample = (id: WheelId): WheelContact => {
    const { x: localX, z: localZ } = wheelLocalPosition(dimensions, id);
    const x = pose.x + localX * cosine + localZ * sine;
    const z = pose.z - localX * sine + localZ * cosine;
    const surface = ground.sampleRoadSurface(x, z);
    const weatherGrip = wetGripScale(surface, wetness);
    return {
      id, x, z, height: surface.height, wetness,
      normal: { x: surface.normal.x, y: surface.normal.y, z: surface.normal.z },
      surfaceType: surface.surfaceType,
      longitudinalGrip: surface.longitudinalGrip * weatherGrip,
      lateralGrip: surface.lateralGrip * weatherGrip,
      rollingResistance: surface.rollingResistance,
      roughness: surface.roughness,
    };
  };
  return {
    frontLeft: sample('frontLeft'),
    frontRight: sample('frontRight'),
    rearLeft: sample('rearLeft'),
    rearRight: sample('rearRight'),
  };
}

export function wheelContactsAsArray(contacts: WheelContactSet): readonly WheelContact[] {
  return WHEEL_IDS.map((id) => contacts[id]);
}

/** Geometry only; per-wheel/axle physics must retain individual material values. */
export function averageWheelGroundGeometry(contacts: WheelContactSet): {
  readonly height: number;
  readonly normal: GroundNormal;
} {
  let height = 0;
  let normalX = 0;
  let normalY = 0;
  let normalZ = 0;
  for (const wheel of wheelContactsAsArray(contacts)) {
    height += wheel.height * 0.25;
    normalX += wheel.normal.x;
    normalY += wheel.normal.y;
    normalZ += wheel.normal.z;
  }
  const length = Math.hypot(normalX, normalY, normalZ);
  return {
    height,
    normal: length > 1e-7
      ? { x: normalX / length, y: normalY / length, z: normalZ / length }
      : { x: 0, y: 1, z: 0 },
  };
}
