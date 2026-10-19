import type {
  DriverInteractionZone,
  VehicleInteractionDefinition,
} from '../vehicle/interaction/VehicleInteractionDefinition';

export interface PlanarVehiclePose {
  readonly x: number;
  readonly z: number;
  /** Three.js Y rotation; local -Z is forward. */
  readonly yaw: number;
}

export interface PlanarPoint {
  readonly x: number;
  readonly z: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : minimum;

/** World point -> vehicle-local X/Z for a Y-rotation-only vehicle pose. */
export function worldToVehicleLocal(
  point: PlanarPoint,
  pose: PlanarVehiclePose,
): PlanarPoint {
  const dx = point.x - pose.x;
  const dz = point.z - pose.z;
  const cosine = Math.cos(pose.yaw);
  const sine = Math.sin(pose.yaw);
  return {
    x: dx * cosine - dz * sine,
    z: dx * sine + dz * cosine,
  };
}

/** Vehicle-local X/Z -> world for a Y-rotation-only vehicle pose. */
export function vehicleLocalToWorld(
  point: PlanarPoint,
  pose: PlanarVehiclePose,
): PlanarPoint {
  const cosine = Math.cos(pose.yaw);
  const sine = Math.sin(pose.yaw);
  return {
    x: pose.x + point.x * cosine + point.z * sine,
    z: pose.z - point.x * sine + point.z * cosine,
  };
}

/** The driver door's authored ground zone, independent of vehicle identity. */
export function isInsideDriverInteractionZone(
  player: PlanarPoint,
  pose: PlanarVehiclePose,
  zone: DriverInteractionZone,
): boolean {
  const local = worldToVehicleLocal(player, pose);
  const driverSide = zone.sideLimitLocalX < 0
    ? local.x <= zone.sideLimitLocalX
    : local.x >= zone.sideLimitLocalX;
  if (!driverSide) return false;
  if (local.z < zone.minLocalZ || local.z > zone.maxLocalZ) return false;
  const dx = local.x - zone.centerLocal[0];
  const dz = local.z - zone.centerLocal[1];
  return Math.hypot(dx, dz) <= zone.radius;
}

/** Player stands just outside the driver door, never inside the body shell. */
export function driverExitWorldPoint(
  pose: PlanarVehiclePose,
  definition: VehicleInteractionDefinition,
): PlanarPoint {
  return vehicleLocalToWorld({
    x: definition.driverExitPoint[0],
    z: definition.driverExitPoint[2],
  }, pose);
}

/** Authored entry-side ground anchor (the camera still targets the eye point). */
export function driverEntryWorldPoint(
  pose: PlanarVehiclePose,
  definition: VehicleInteractionDefinition,
): PlanarPoint {
  return vehicleLocalToWorld({
    x: definition.driverEntryPoint[0],
    z: definition.driverEntryPoint[2],
  }, pose);
}

/** Keeps the walker inside a map's authored envelope. */
export function clampToWorldBounds(
  point: PlanarPoint,
  bounds: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number } | undefined,
  margin = 0.3,
): PlanarPoint {
  if (bounds === undefined) return point;
  return {
    x: clamp(point.x, bounds.minX + margin, bounds.maxX - margin),
    z: clamp(point.z, bounds.minZ + margin, bounds.maxZ - margin),
  };
}
