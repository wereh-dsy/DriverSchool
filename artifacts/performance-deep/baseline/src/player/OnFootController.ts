import { MathUtils, Vector3 } from 'three';

import {
  createVehicleOBB,
  type CollisionDimensions,
  type StaticCollider,
} from '../vehicle/physics/CollisionSystem';
import { clampToWorldBounds, type PlanarVehiclePose } from './DriverEntryZone';

export interface OnFootWalkWorld {
  readonly groundHeightAt: (x: number, z: number) => number;
  readonly worldBounds?: {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
  };
  readonly nearbyColliders: (x: number, z: number, radius: number) => readonly StaticCollider[];
  /** The current vehicle remains a solid at walking speed. */
  readonly vehicle?: PlanarVehiclePose & { readonly dimensions: CollisionDimensions };
}

export interface OnFootConfig {
  readonly eyeHeight: number;
  readonly radius: number;
  readonly walkSpeed: number;
  readonly backwardScale: number;
  readonly acceleration: number;
  readonly lookPitchLimit: number;
}

export const DEFAULT_ON_FOOT_CONFIG: Readonly<OnFootConfig> = Object.freeze({
  eyeHeight: 1.66,
  radius: 0.32,
  walkSpeed: 2.45,
  backwardScale: 0.62,
  acceleration: 12,
  lookPitchLimit: 1.15,
});

const clamp = (value: number, minimum: number, maximum: number): number => {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
};

interface CircleOBBResolution {
  readonly x: number;
  readonly z: number;
  readonly collided: boolean;
}

/**
 * Circle-vs-OBB push-out. The walker never uses the vehicle's tyre/force
 * model; it only borrows the same authored collider planes so it cannot walk
 * through the active vehicle or world solids.
 */
function resolveCircleOBB(
  x: number,
  z: number,
  radius: number,
  obb: { readonly center: { x: number; z: number }; readonly halfWidth: number;
    readonly halfLength: number; readonly yaw: number },
): CircleOBBResolution {
  const cosine = Math.cos(obb.yaw);
  const sine = Math.sin(obb.yaw);
  const dx = x - obb.center.x;
  const dz = z - obb.center.z;
  // Local axes: right = (cos, -sin), length = (sin, cos).
  const localX = dx * cosine - dz * sine;
  const localZ = dx * sine + dz * cosine;
  const closestX = clamp(localX, -obb.halfWidth, obb.halfWidth);
  const closestZ = clamp(localZ, -obb.halfLength, obb.halfLength);
  let normalX = localX - closestX;
  let normalZ = localZ - closestZ;
  let distance = Math.hypot(normalX, normalZ);
  if (distance >= radius) return { x, z, collided: false };

  let push: number;
  if (distance < 1e-6) {
    // Centre is inside: leave along the closest face.
    const toSide = obb.halfWidth - Math.abs(localX);
    const toEnd = obb.halfLength - Math.abs(localZ);
    if (toSide <= toEnd) {
      normalX = localX >= 0 ? 1 : -1;
      normalZ = 0;
      push = toSide + radius;
    } else {
      normalX = 0;
      normalZ = localZ >= 0 ? 1 : -1;
      push = toEnd + radius;
    }
    distance = 0;
  } else {
    normalX /= distance;
    normalZ /= distance;
    push = radius - distance;
  }
  const worldNormalX = normalX * cosine + normalZ * sine;
  const worldNormalZ = -normalX * sine + normalZ * cosine;
  return {
    x: x + worldNormalX * push,
    z: z + worldNormalZ * push,
    collided: true,
  };
}

/**
 * Minimal first-person walker: WASD comes from the already normalized vehicle
 * input axes, mouse look is applied by the game, and the map height field plus
 * the shared static colliders keep the player grounded and solid.
 */
export class OnFootController {
  public readonly position = new Vector3();
  public yaw = 0;
  public pitch = 0;
  private velocityX = 0;
  private velocityZ = 0;
  private readonly config: OnFootConfig;

  public constructor(config: Partial<OnFootConfig> = {}) {
    this.config = { ...DEFAULT_ON_FOOT_CONFIG, ...config };
  }

  public get eyeHeight(): number {
    return this.config.eyeHeight;
  }

  public reset(): void {
    this.position.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.velocityX = 0;
    this.velocityZ = 0;
  }

  public placeAt(x: number, z: number, groundHeight: number, yaw: number): void {
    this.position.set(x, Number.isFinite(groundHeight) ? groundHeight : 0, z);
    this.yaw = Number.isFinite(yaw) ? Math.atan2(Math.sin(yaw), Math.cos(yaw)) : 0;
    this.pitch = 0;
    this.velocityX = 0;
    this.velocityZ = 0;
  }

  public addLook(deltaYaw: number, deltaPitch: number): void {
    if (Number.isFinite(deltaYaw)) this.yaw = Math.atan2(Math.sin(this.yaw + deltaYaw),
      Math.cos(this.yaw + deltaYaw));
    if (Number.isFinite(deltaPitch)) {
      this.pitch = clamp(this.pitch + deltaPitch, -this.config.lookPitchLimit, this.config.lookPitchLimit);
    }
  }

  public resetLook(): void {
    this.pitch = 0;
  }

  public getEyePosition(target = new Vector3()): Vector3 {
    return target.set(this.position.x, this.position.y + this.config.eyeHeight, this.position.z);
  }

  /** forward/strafe are normalized game inputs in [-1, 1]. */
  public update(
    deltaSeconds: number,
    forward: number,
    strafe: number,
    world: OnFootWalkWorld,
  ): void {
    const dt = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
    if (dt <= 0) return;
    let inputForward = clamp(forward, -1, 1);
    let inputStrafe = clamp(strafe, -1, 1);
    const inputLength = Math.hypot(inputForward, inputStrafe);
    if (inputLength > 1) {
      inputForward /= inputLength;
      inputStrafe /= inputLength;
    }
    const speed = this.config.walkSpeed * (inputForward < 0 ? this.config.backwardScale : 1);
    const cosine = Math.cos(this.yaw);
    const sine = Math.sin(this.yaw);
    // Right = (cos, -sin); forward = (-sin, -cos).
    const targetVelocityX = (inputStrafe * cosine - inputForward * sine) * speed;
    const targetVelocityZ = (-inputStrafe * sine - inputForward * cosine) * speed;
    const blend = 1 - Math.exp(-this.config.acceleration * dt);
    this.velocityX = MathUtils.lerp(this.velocityX, targetVelocityX, blend);
    this.velocityZ = MathUtils.lerp(this.velocityZ, targetVelocityZ, blend);

    let x = this.position.x + this.velocityX * dt;
    let z = this.position.z + this.velocityZ * dt;
    if (world.vehicle !== undefined) {
      const vehicleOBB = createVehicleOBB({
        x: world.vehicle.x, z: world.vehicle.z, yaw: world.vehicle.yaw,
      }, world.vehicle.dimensions);
      for (let pass = 0; pass < 3; pass++) {
        const resolved = resolveCircleOBB(x, z, this.config.radius, vehicleOBB);
        x = resolved.x; z = resolved.z;
        if (!resolved.collided) break;
      }
    }
    const nearby = world.nearbyColliders(x, z, this.config.radius + 2);
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const collider of nearby) {
        const resolved = resolveCircleOBB(x, z, this.config.radius, collider);
        x = resolved.x; z = resolved.z;
        moved ||= resolved.collided;
      }
      if (!moved) break;
    }
    const bounded = clampToWorldBounds({ x, z }, world.worldBounds);
    this.position.x = bounded.x;
    this.position.z = bounded.z;
    this.position.y = world.groundHeightAt(bounded.x, bounded.z);
  }
}
