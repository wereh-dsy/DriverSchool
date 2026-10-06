/** Static, planar contact geometry. It deliberately has no visual-mesh dependency. */
export interface CollisionPoint2 {
  readonly x: number;
  readonly z: number;
}

export interface CollisionPose extends CollisionPoint2 {
  /** Three.js Y rotation: local -Z is forward. */
  readonly yaw: number;
  readonly y?: number;
}

export interface CollisionDimensions {
  readonly length: number;
  readonly width: number;
  readonly height?: number;
}

export type StaticColliderType = 'guardrail' | 'wall' | 'building' | 'obstacle';

export interface CollisionOBB {
  readonly center: CollisionPoint2;
  readonly halfWidth: number;
  readonly halfLength: number;
  readonly yaw: number;
  readonly corners: readonly CollisionPoint2[];
}

export interface StaticCollider extends CollisionOBB {
  readonly id: string;
  readonly type: StaticColliderType;
  readonly minHeight: number;
  readonly maxHeight: number;
  /** Exact authored endpoints allow adjacent rail boxes to share a contact face. */
  readonly barrierSegment?: {
    readonly start: CollisionPoint2;
    readonly end: CollisionPoint2;
  };
}

export interface StaticOBBColliderOptions {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly length: number;
  readonly width: number;
  readonly yaw?: number;
  readonly minHeight?: number;
  readonly maxHeight?: number;
  readonly type?: StaticColliderType;
}

export interface BarrierColliderOptions {
  readonly id: string;
  readonly start: CollisionPoint2;
  readonly end: CollisionPoint2;
  readonly thickness: number;
  readonly minHeight?: number;
  readonly maxHeight?: number;
  readonly type?: StaticColliderType;
}

export interface CollisionContact {
  readonly colliderId: string;
  readonly point: CollisionPoint2;
  /** Unit vector from the obstacle toward the safe vehicle position. */
  readonly normal: CollisionPoint2;
  readonly penetration: number;
  readonly inwardSpeed: number;
}

export interface CollisionStep {
  readonly previousPose: CollisionPose;
  readonly pose: CollisionPose;
  readonly velocity: CollisionPoint2;
  readonly dimensions: CollisionDimensions;
  readonly dt: number;
}

export interface CollisionResolution {
  readonly pose: CollisionPose;
  readonly velocity: CollisionPoint2;
  readonly vehicleOBB: CollisionOBB;
  readonly nearbyColliders: readonly StaticCollider[];
  readonly contacts: readonly CollisionContact[];
  readonly collided: boolean;
}

const dot = (a: CollisionPoint2, b: CollisionPoint2): number => a.x * b.x + a.z * b.z;
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));
const rightAxis = (yaw: number): CollisionPoint2 => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });
const lengthAxis = (yaw: number): CollisionPoint2 => ({ x: Math.sin(yaw), z: Math.cos(yaw) });

const makeOBB = (
  center: CollisionPoint2,
  halfWidth: number,
  halfLength: number,
  yaw: number,
): CollisionOBB => {
  const right = rightAxis(yaw);
  const length = lengthAxis(yaw);
  const corners: CollisionPoint2[] = [];
  for (const [side, end] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    corners.push({
      x: center.x + right.x * halfWidth * side! + length.x * halfLength * end!,
      z: center.z + right.z * halfWidth * side! + length.z * halfLength * end!,
    });
  }
  return { center: { ...center }, halfWidth, halfLength, yaw, corners };
};

/** Match the parameterized visual footprint with only a small bumper/body allowance. */
export const createVehicleOBB = (
  pose: CollisionPose,
  dimensions: CollisionDimensions,
): CollisionOBB => makeOBB(
  pose,
  Math.max(0.2, dimensions.width - 0.06) * 0.5,
  Math.max(0.4, dimensions.length - 0.12) * 0.5,
  pose.yaw,
);

export const getOBBCorners = (box: CollisionOBB): readonly CollisionPoint2[] => box.corners;

export const createStaticOBBCollider = (options: StaticOBBColliderOptions): StaticCollider => ({
  ...makeOBB(
    { x: options.x, z: options.z },
    Math.max(0.01, options.width) * 0.5,
    Math.max(0.01, options.length) * 0.5,
    options.yaw ?? 0,
  ),
  id: options.id,
  type: options.type ?? 'obstacle',
  minHeight: options.minHeight ?? Number.NEGATIVE_INFINITY,
  maxHeight: options.maxHeight ?? Number.POSITIVE_INFINITY,
});

/** Author rails from the same endpoints as their visual beams, then use short OBBs. */
export const createBarrierColliders = (
  options: BarrierColliderOptions,
  maximumSegmentLength = 4,
): StaticCollider[] => {
  const dx = options.end.x - options.start.x;
  const dz = options.end.z - options.start.z;
  const totalLength = Math.hypot(dx, dz);
  if (totalLength < 1e-6) return [];
  const count = Math.max(1, Math.ceil(totalLength / Math.max(0.5, maximumSegmentLength)));
  const result: StaticCollider[] = [];
  for (let index = 0; index < count; index += 1) {
    const t = (index + 0.5) / count;
    const box = createStaticOBBCollider({
      id: `${options.id}:${index}`,
      x: options.start.x + dx * t,
      z: options.start.z + dz * t,
      // A 2 mm overlap removes precision gaps at neighboring end caps.
      length: totalLength / count + 0.002,
      width: options.thickness,
      yaw: Math.atan2(dx, dz),
      type: options.type ?? 'guardrail',
      minHeight: options.minHeight,
      maxHeight: options.maxHeight,
    });
    result.push({
      ...box,
      barrierSegment: {
        start: { x: options.start.x + dx * index / count, z: options.start.z + dz * index / count },
        end: { x: options.start.x + dx * (index + 1) / count, z: options.start.z + dz * (index + 1) / count },
      },
    });
  }
  return result;
};

const projectedRadius = (box: CollisionOBB, axis: CollisionPoint2): number =>
  Math.abs(dot(rightAxis(box.yaw), axis)) * box.halfWidth +
  Math.abs(dot(lengthAxis(box.yaw), axis)) * box.halfLength;

interface Overlap {
  readonly normal: CollisionPoint2;
  readonly penetration: number;
}

interface RailContinuation {
  start: boolean;
  end: boolean;
}

/** Four separating axes retain the exact rotated footprint; AABBs are only broad phase. */
const intersectOBB = (
  vehicle: CollisionOBB,
  obstacle: StaticCollider,
  velocity: CollisionPoint2,
  contactSkin: number,
  continuation?: RailContinuation,
): Overlap | undefined => {
  const delta = {
    x: vehicle.center.x - obstacle.center.x,
    z: vehicle.center.z - obstacle.center.z,
  };
  let minimumPenetration = Number.POSITIVE_INFINITY;
  let normal: CollisionPoint2 = { x: 0, z: 1 };
  for (const axis of [rightAxis(vehicle.yaw), lengthAxis(vehicle.yaw), rightAxis(obstacle.yaw), lengthAxis(obstacle.yaw)]) {
    const separation = dot(delta, axis);
    const penetration = projectedRadius(vehicle, axis) + projectedRadius(obstacle, axis) - Math.abs(separation);
    if (penetration < -contactSkin) return undefined;
    if (penetration < minimumPenetration) {
      minimumPenetration = penetration;
      // For coincident centers, choose the side opposing incoming motion.
      const side = Math.abs(separation) > 1e-7 ? Math.sign(separation) : (dot(velocity, axis) > 0 ? -1 : 1);
      normal = { x: axis.x * side, z: axis.z * side };
    }
  }
  if (continuation) {
    const railLength = lengthAxis(obstacle.yaw);
    const alongRail = dot(delta, railLength);
    const connectedEnd = alongRail >= 0 ? continuation.end : continuation.start;
    if (connectedEnd) {
      // End caps inside a connected rail are not exposed physical faces.
      // Resolving them individually can stop/reverse a grazing rotated car at
      // every segment seam, so use the continuous guardrail's side instead.
      const sideAxis = rightAxis(obstacle.yaw);
      const sideDistance = dot(delta, sideAxis);
      minimumPenetration = projectedRadius(vehicle, sideAxis) + obstacle.halfWidth - Math.abs(sideDistance);
      const side = Math.abs(sideDistance) > 1e-7 ? Math.sign(sideDistance) : (dot(velocity, sideAxis) > 0 ? -1 : 1);
      normal = { x: sideAxis.x * side, z: sideAxis.z * side };
    }
  }
  return { normal, penetration: minimumPenetration };
};

const closestOnOBB = (point: CollisionPoint2, box: CollisionOBB): CollisionPoint2 => {
  const right = rightAxis(box.yaw);
  const length = lengthAxis(box.yaw);
  const delta = { x: point.x - box.center.x, z: point.z - box.center.z };
  const x = clamp(dot(delta, right), -box.halfWidth, box.halfWidth);
  const z = clamp(dot(delta, length), -box.halfLength, box.halfLength);
  return {
    x: box.center.x + right.x * x + length.x * z,
    z: box.center.z + right.z * x + length.z * z,
  };
};

interface Bounds2 {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

const boundsOf = (box: CollisionOBB): Bounds2 => {
  const extentX = projectedRadius(box, { x: 1, z: 0 });
  const extentZ = projectedRadius(box, { x: 0, z: 1 });
  return {
    minX: box.center.x - extentX,
    maxX: box.center.x + extentX,
    minZ: box.center.z - extentZ,
    maxZ: box.center.z + extentZ,
  };
};

/**
 * Stable simcade static contacts, not a rigid-body impulse solver. The bounded
 * planar sweep prevents thin-rail tunneling, while repeated low-speed contacts
 * only remove inward motion. No restitution, height impulse or yaw kick exists.
 */
export class VehicleCollisionSystem {
  private staticColliders: readonly StaticCollider[] = [];
  private readonly cells = new Map<string, StaticCollider[]>();
  private readonly railContinuations = new Map<string, RailContinuation>();
  private readonly cellSize = 16;
  private readonly separationSkin = 0.003;
  private contactClock = 0;
  private lastContactTime = Number.NEGATIVE_INFINITY;
  /** Bridge single-frame gaps and adjacent rail segments during one scrape. */
  private readonly contactReleaseTime = 0.16;

  public constructor(colliders: readonly StaticCollider[] = []) {
    this.setColliders(colliders);
  }

  public get colliders(): readonly StaticCollider[] {
    return this.staticColliders;
  }

  public setColliders(colliders: readonly StaticCollider[]): void {
    this.staticColliders = colliders;
    this.cells.clear();
    this.railContinuations.clear();
    this.reset();
    for (const collider of colliders) {
      const bounds = boundsOf(collider);
      for (let x = Math.floor(bounds.minX / this.cellSize); x <= Math.floor(bounds.maxX / this.cellSize); x += 1) {
        for (let z = Math.floor(bounds.minZ / this.cellSize); z <= Math.floor(bounds.maxZ / this.cellSize); z += 1) {
          const key = `${x},${z}`;
          const list = this.cells.get(key) ?? [];
          list.push(collider);
          this.cells.set(key, list);
        }
      }
    }
    this.buildRailContinuations(colliders);
  }

  /** Respawn and map/vehicle changes must not inherit an earlier impact. */
  public reset(): void {
    this.contactClock = 0;
    this.lastContactTime = Number.NEGATIVE_INFINITY;
  }

  public getNearbyColliders(pose: CollisionPoint2, radius = 12): StaticCollider[] {
    return this.query({ minX: pose.x - radius, maxX: pose.x + radius, minZ: pose.z - radius, maxZ: pose.z + radius });
  }

  public resolve(step: CollisionStep): CollisionResolution {
    this.contactClock += Math.max(0, step.dt);
    const { dimensions } = step;
    let x = step.previousPose.x;
    let z = step.previousPose.z;
    let yawDelta = step.pose.yaw - step.previousPose.yaw;
    yawDelta = Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta));
    const distance = Math.hypot(step.pose.x - x, step.pose.z - z);
    // At the normal 120 Hz step this is usually 1–3 iterations. Long frames
    // remain swept instead of passing through a 55 mm fence.
    const count = clamp(Math.ceil(Math.max(distance / 0.28, Math.abs(yawDelta) / 0.04)), 1, 512);
    let motionX = (step.pose.x - x) / count;
    let motionZ = (step.pose.z - z) / count;
    let velocityX = step.velocity.x;
    let velocityZ = step.velocity.z;
    // Tire force/slip recovery can add a fresh inward component on every fixed
    // step. Remove it each time, but do not multiply tangent speed repeatedly
    // while the same ongoing scrape crosses neighboring collider segments.
    let impactDampingApplied = this.contactClock - this.lastContactTime <= this.contactReleaseTime;
    const contacts = new Map<string, CollisionContact>();
    const y = step.pose.y ?? step.previousPose.y ?? 0;
    const top = y + (dimensions.height ?? 1.5);

    for (let substep = 1; substep <= count; substep += 1) {
      x += motionX;
      z += motionZ;
      const yaw = step.previousPose.yaw + yawDelta * substep / count;
      // A handful of passes resolves adjoining rails and building corners.
      for (let pass = 0; pass < 6; pass += 1) {
        let corrected = false;
        const vehicle = createVehicleOBB({ x, z, yaw }, dimensions);
        const bounds = boundsOf(vehicle);
        const candidates = this.query({
          minX: bounds.minX - this.separationSkin, maxX: bounds.maxX + this.separationSkin,
          minZ: bounds.minZ - this.separationSkin, maxZ: bounds.maxZ + this.separationSkin,
        });
        for (const collider of candidates) {
          if (top < collider.minHeight || y + 0.12 > collider.maxHeight) continue;
          const currentBox = createVehicleOBB({ x, z, yaw }, dimensions);
          const hit = intersectOBB(
            currentBox, collider, { x: velocityX, z: velocityZ }, this.separationSkin,
            this.railContinuations.get(collider.id),
          );
          if (!hit) continue;
          const { normal, penetration } = hit;
          const inwardSpeed = Math.max(0, -(velocityX * normal.x + velocityZ * normal.z));
          const inwardMotion = Math.min(0, motionX * normal.x + motionZ * normal.z);
          // Maintain the same 3 mm resting gap while being pushed into a wall,
          // rather than repeatedly crossing it and jumping back out each frame.
          // Separating/tangent movement is free to leave a merely nearby wall.
          if (penetration <= 0 && inwardSpeed <= 0 && inwardMotion >= 0) continue;
          corrected = true;
          const point = closestOnOBB(currentBox.center, collider);
          const previous = contacts.get(collider.id);
          if (!previous || inwardSpeed > previous.inwardSpeed) {
            contacts.set(collider.id, { colliderId: collider.id, point, normal, penetration: Math.max(0, penetration), inwardSpeed });
          }
          x += normal.x * (penetration + this.separationSkin);
          z += normal.z * (penetration + this.separationSkin);
          // No spring or bounce: remove only the velocity aimed into the wall.
          velocityX += normal.x * inwardSpeed;
          velocityZ += normal.z * inwardSpeed;
          motionX -= normal.x * inwardMotion;
          motionZ -= normal.z * inwardMotion;
          if (!impactDampingApplied && inwardSpeed > 0.45) {
            const incomingSpeed = Math.hypot(velocityX, velocityZ, inwardSpeed);
            const incidence = inwardSpeed / Math.max(0.01, incomingSpeed);
            // Glancing contact slides; a frontal hit essentially parks the car.
            const retained = incidence > 0.78 ? 0.03 : incidence > 0.25 ? 0.22 : 0.68;
            velocityX *= retained;
            velocityZ *= retained;
            motionX *= retained;
            motionZ *= retained;
            impactDampingApplied = true;
          }
          // Tiny rubbing velocities should settle rather than buzz indefinitely.
          if (Math.hypot(velocityX, velocityZ) < 0.025) {
            velocityX = 0;
            velocityZ = 0;
          }
        }
        if (!corrected) break;
      }
    }
    const pose: CollisionPose = { ...step.pose, x, z };
    if (contacts.size > 0) this.lastContactTime = this.contactClock;
    return {
      pose,
      velocity: { x: velocityX, z: velocityZ },
      vehicleOBB: createVehicleOBB(pose, dimensions),
      nearbyColliders: this.getNearbyColliders(pose),
      contacts: [...contacts.values()],
      collided: contacts.size > 0,
    };
  }

  private query(bounds: Bounds2): StaticCollider[] {
    const result = new Set<StaticCollider>();
    for (let x = Math.floor(bounds.minX / this.cellSize); x <= Math.floor(bounds.maxX / this.cellSize); x += 1) {
      for (let z = Math.floor(bounds.minZ / this.cellSize); z <= Math.floor(bounds.maxZ / this.cellSize); z += 1) {
        for (const collider of this.cells.get(`${x},${z}`) ?? []) {
          const obstacle = boundsOf(collider);
          if (obstacle.minX <= bounds.maxX && obstacle.maxX >= bounds.minX && obstacle.minZ <= bounds.maxZ && obstacle.maxZ >= bounds.minZ) {
            result.add(collider);
          }
        }
      }
    }
    return [...result];
  }

  private buildRailContinuations(colliders: readonly StaticCollider[]): void {
    interface RailEnd {
      readonly collider: StaticCollider;
      readonly point: CollisionPoint2;
      readonly end: 'start' | 'end';
    }
    const endpointCells = new Map<string, RailEnd[]>();
    const endpointCellSize = 0.2;
    const railEnds: RailEnd[] = [];
    for (const collider of colliders) {
      if (!collider.barrierSegment) continue;
      this.railContinuations.set(collider.id, { start: false, end: false });
      for (const end of ['start', 'end'] as const) {
        const entry: RailEnd = { collider, point: collider.barrierSegment[end], end };
        railEnds.push(entry);
        const key = `${Math.floor(entry.point.x / endpointCellSize)},${Math.floor(entry.point.z / endpointCellSize)}`;
        const list = endpointCells.get(key) ?? [];
        list.push(entry);
        endpointCells.set(key, list);
      }
    }
    for (const entry of railEnds) {
      const cellX = Math.floor(entry.point.x / endpointCellSize);
      const cellZ = Math.floor(entry.point.z / endpointCellSize);
      let connected = false;
      for (let offsetX = -1; offsetX <= 1 && !connected; offsetX += 1) {
        for (let offsetZ = -1; offsetZ <= 1 && !connected; offsetZ += 1) {
          for (const other of endpointCells.get(`${cellX + offsetX},${cellZ + offsetZ}`) ?? []) {
            if (entry.collider === other.collider) continue;
            if (Math.hypot(entry.point.x - other.point.x, entry.point.z - other.point.z) > 0.16) continue;
            if (Math.abs(dot(lengthAxis(entry.collider.yaw), lengthAxis(other.collider.yaw))) < 0.9) continue;
            if (entry.collider.minHeight > other.collider.maxHeight || entry.collider.maxHeight < other.collider.minHeight) continue;
            connected = true;
            break;
          }
        }
      }
      this.railContinuations.get(entry.collider.id)![entry.end] = connected;
    }
  }
}
