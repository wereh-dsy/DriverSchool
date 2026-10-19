import type { RoadSurfaceSample, SurfaceMaterial, SurfaceType } from '../../world/SurfaceMaterial';
import { VEHICLE_WHEEL_IDS } from '../VehicleDimensions';
import { wetGripScale } from '../../world/environment/WeatherSystem';

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

/** Four independent samples; local forward is -Z and local right is +X.
 * `roadGripMultiplier` is the shared weather friction scale. It layers on the
 * existing surface-wetness response and per-tyre wet retention; it does not
 * alter the tyre curve or add hydroplaning.
 */
export function sampleWheelContacts(
  ground: WheelSurfaceQuery,
  pose: WheelContactPose,
  dimensions: WheelContactDimensions,
  wetness = 0,
  roadGripMultiplier = 1,
  target?: WheelContactSet,
): WheelContactSet {
  const sine = Math.sin(pose.yaw);
  const cosine = Math.cos(pose.yaw);
  const result = target ?? createWheelContactBuffer();
  const weatherGrip = Number.isFinite(roadGripMultiplier) ? Math.max(0, roadGripMultiplier) : 1;
  for (const id of WHEEL_IDS) {
    const front = id === 'frontLeft' || id === 'frontRight';
    const left = id === 'frontLeft' || id === 'rearLeft';
    const localX = (front ? dimensions.frontTrackWidth : dimensions.rearTrackWidth) * (left ? -.5 : .5);
    const localZ = dimensions.wheelBase * (front ? -.5 : .5);
    const x = pose.x + localX * cosine + localZ * sine;
    const z = pose.z - localX * sine + localZ * cosine;
    const surface = ground.sampleRoadSurface(x, z);
    const wetGrip = wetGripScale(surface, wetness) * weatherGrip;
    const wheel = result[id] as MutableContact;
    wheel.x = x; wheel.z = z; wheel.height = surface.height;
    wheel.wetness = Math.max(wetness, surface.wetness ?? 0);
    wheel.normal.x = surface.normal.x; wheel.normal.y = surface.normal.y; wheel.normal.z = surface.normal.z;
    wheel.surfaceType = surface.surfaceType;
    wheel.profile = surface.profile; wheel.depth = surface.depth;
    wheel.longitudinalGrip = surface.longitudinalGrip * wetGrip;
    wheel.lateralGrip = surface.lateralGrip * wetGrip;
    wheel.rollingResistance = surface.rollingResistance;
    wheel.roughness = surface.roughness;
  }
  return result;
}

type MutableContact = { -readonly [K in keyof WheelContact]: WheelContact[K] } & {
  normal: { x: number; y: number; z: number };
};

/** Owned by the caller; reuse only after the previous sample has been consumed. */
export function createWheelContactBuffer(): WheelContactSet {
  const make = (id: WheelId): WheelContact => ({ id, x: 0, z: 0, height: 0,
    normal: { x: 0, y: 1, z: 0 }, surfaceType: 'asphalt',
    longitudinalGrip: 1, lateralGrip: 1, rollingResistance: 1, roughness: .025 });
  return { frontLeft: make('frontLeft'), frontRight: make('frontRight'),
    rearLeft: make('rearLeft'), rearRight: make('rearRight') };
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
  for (const id of WHEEL_IDS) {
    const wheel = contacts[id];
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
