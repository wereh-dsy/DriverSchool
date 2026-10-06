import type { VehiclePhysicsConfig } from '../config';
import { wheelLocalPosition } from '../VehicleDimensions';
import { WHEEL_IDS, type GroundNormal, type WheelContactSet, type WheelId } from './WheelContact';
import type { ChassisPhysicsState } from './WheelPhysicsState';
import { clamp } from './math';

export interface SuspensionWheelState {
  readonly normalLoad: number;
  readonly staticLoad: number;
  readonly compression: number;
  readonly compressionVelocity: number;
  readonly restCompression: number;
  readonly springForce: number;
  readonly damperForce: number;
}

export interface SuspensionSnapshot {
  readonly wheels: Readonly<Record<WheelId, SuspensionWheelState>>;
  readonly chassis: ChassisPhysicsState;
}

export interface SuspensionStep {
  readonly contacts?: WheelContactSet;
  readonly normal?: GroundNormal;
  readonly longitudinalAcceleration: number;
  readonly lateralAcceleration: number;
}

interface CornerState {
  compression: number;
  velocity: number;
  load: number;
  spring: number;
  damper: number;
}

/**
 * Four supported corner masses, not a 6-DOF chassis. Spring and damper motion
 * responds to load transfer and the non-planar part of sampled wheel heights.
 * The load normalization conserves the current supported vehicle weight.
 */
export class SuspensionSystem {
  private corners = {} as Record<WheelId, CornerState>;
  private longitudinalAcceleration = 0;
  private lateralAcceleration = 0;
  private previousRideOffset = 0;
  private chassis: ChassisPhysicsState = { groundHeight: 0, terrainPitch: 0, terrainRoll: 0, rideOffset: 0, pitch: 0, roll: 0, verticalVelocity: 0 };

  public constructor(private readonly config: VehiclePhysicsConfig) {
    this.reset();
  }

  public reset(): void {
    this.longitudinalAcceleration = 0;
    this.lateralAcceleration = 0;
    this.previousRideOffset = 0;
    this.chassis = { groundHeight: 0, terrainPitch: 0, terrainRoll: 0, rideOffset: 0, pitch: 0, roll: 0, verticalVelocity: 0 };
    for (const id of WHEEL_IDS) {
      const load = this.staticLoad(id);
      this.corners[id] = { compression: load / this.springRate(id), velocity: 0, load, spring: load, damper: 0 };
    }
  }

  public update(dt: number, step: SuspensionStep): SuspensionSnapshot {
    const duration = clamp(Number.isFinite(dt) ? dt : 0, 0, this.config.safety.maxFrameTime);
    const count = Math.max(1, Math.ceil(duration / Math.max(0.0001, this.config.safety.maxSubstep)));
    for (let i = 0; i < count; i++) this.integrate(duration / count, step);
    return this.getSnapshot();
  }

  private integrate(safeDt: number, step: SuspensionStep): void {
    const accelerationBlend = 1 - Math.exp(-10 * safeDt);
    this.longitudinalAcceleration += (clamp(this.finite(step.longitudinalAcceleration), -12, 12) - this.longitudinalAcceleration) * accelerationBlend;
    this.lateralAcceleration += (clamp(this.finite(step.lateralAcceleration), -12, 12) - this.lateralAcceleration) * accelerationBlend;
    let normalY = step.normal?.y ?? 1;
    if (step.contacts !== undefined) normalY = WHEEL_IDS.reduce((sum, id) => sum + step.contacts![id].normal.y * 0.25, 0);
    const supportedWeight = this.config.mass * this.config.gravity * clamp(this.finite(normalY, 1), 0.3, 1);
    const frontShare = clamp(this.config.frontWeightBias, 0.05, 0.95);
    const longitudinalTransfer = this.config.mass * this.longitudinalAcceleration * this.config.centerOfMassHeight / Math.max(0.5, this.config.wheelBase);
    const frontLateralTransfer = this.config.mass * frontShare * this.lateralAcceleration * this.config.centerOfMassHeight / Math.max(0.5, this.config.frontTrackWidth);
    const rearLateralTransfer = this.config.mass * (1 - frontShare) * this.lateralAcceleration * this.config.centerOfMassHeight / Math.max(0.5, this.config.rearTrackWidth);
    const targetLoads: Record<WheelId, number> = {
      frontLeft: supportedWeight * frontShare * 0.5 - longitudinalTransfer * 0.5 + frontLateralTransfer,
      frontRight: supportedWeight * frontShare * 0.5 - longitudinalTransfer * 0.5 - frontLateralTransfer,
      rearLeft: supportedWeight * (1 - frontShare) * 0.5 + longitudinalTransfer * 0.5 + rearLateralTransfer,
      rearRight: supportedWeight * (1 - frontShare) * 0.5 + longitudinalTransfer * 0.5 - rearLateralTransfer,
    };
    for (const id of WHEEL_IDS) targetLoads[id] = Math.max(this.staticLoad(id) * 0.08, targetLoads[id]);
    const targetTotal = WHEEL_IDS.reduce((sum, id) => sum + targetLoads[id], 0);
    const { heights, groundHeight, forwardSlope, rightSlope } = this.groundGeometry(step.contacts);
    for (const id of WHEEL_IDS) {
      const corner = this.corners[id];
      const front = id.startsWith('front');
      const springRate = this.springRate(id);
      const restCompression = this.staticLoad(id) / springRate;
      const wheel = wheelLocalPosition(this.config, id);
      const groundResidual = clamp(heights[id] - groundHeight + wheel.z * forwardSlope - wheel.x * rightSlope, -0.05, 0.05);
      const targetLoad = targetLoads[id] * supportedWeight / Math.max(1, targetTotal);
      const damping = corner.velocity >= 0
        ? (front ? this.config.suspension.damperCompressionFront : this.config.suspension.damperCompressionRear)
        : (front ? this.config.suspension.damperReboundFront : this.config.suspension.damperReboundRear);
      const cornerMass = this.staticLoad(id) / this.config.gravity;
      const acceleration = (targetLoad + springRate * groundResidual - springRate * corner.compression - damping * corner.velocity) / Math.max(20, cornerMass);
      corner.velocity += acceleration * safeDt;
      corner.compression += corner.velocity * safeDt;
      const halfTravel = this.config.suspension.suspensionTravel * 0.5;
      const minimumCompression = Math.max(0, restCompression - halfTravel);
      const maximumCompression = Math.min(this.config.suspension.restLength * 0.94, restCompression + halfTravel);
      const limited = clamp(corner.compression, minimumCompression, maximumCompression);
      if (limited !== corner.compression) corner.velocity = 0;
      corner.compression = limited;
      corner.spring = springRate * corner.compression;
      corner.damper = damping * corner.velocity;
      corner.load = Math.max(this.staticLoad(id) * 0.08, corner.spring + corner.damper);
    }
    const actualTotal = WHEEL_IDS.reduce((sum, id) => sum + this.corners[id].load, 0);
    for (const id of WHEEL_IDS) this.corners[id].load *= supportedWeight / Math.max(1, actualTotal);
    const displacement = (id: WheelId): number => this.corners[id].compression - this.staticLoad(id) / this.springRate(id);
    const frontDisplacement = (displacement('frontLeft') + displacement('frontRight')) * 0.5;
    const rearDisplacement = (displacement('rearLeft') + displacement('rearRight')) * 0.5;
    const leftDisplacement = (displacement('frontLeft') + displacement('rearLeft')) * 0.5;
    const rightDisplacement = (displacement('frontRight') + displacement('rearRight')) * 0.5;
    const rideOffset = -(frontDisplacement + rearDisplacement) * 0.5;
    // The existing anti-roll stiffness restrains body attitude without changing
    // total load or inventing a grip multiplier.
    const rollRestraint = 1 / (1 + this.config.suspension.antiRollStiffness /
      Math.max(1, this.config.suspension.springRateFront + this.config.suspension.springRateRear));
    this.chassis = {
      groundHeight,
      terrainPitch: Math.atan(forwardSlope),
      terrainRoll: Math.atan(rightSlope),
      rideOffset,
      pitch: clamp(Math.atan2(rearDisplacement - frontDisplacement, this.config.wheelBase), -0.065, 0.065),
      roll: clamp(Math.atan2(leftDisplacement - rightDisplacement,
        (this.config.frontTrackWidth + this.config.rearTrackWidth) * 0.5) * rollRestraint, -0.075, 0.075),
      verticalVelocity: safeDt > 0 ? (rideOffset - this.previousRideOffset) / safeDt : 0,
    };
    this.previousRideOffset = rideOffset;
  }

  /** Final contact metadata may move after an OBB collision correction. */
  public synchronizeGroundGeometry(contacts: WheelContactSet): void {
    const { groundHeight, forwardSlope, rightSlope } = this.groundGeometry(contacts);
    this.chassis = { ...this.chassis, groundHeight,
      terrainPitch: Math.atan(forwardSlope), terrainRoll: Math.atan(rightSlope) };
  }

  private groundGeometry(contacts?: WheelContactSet) {
    const heights = Object.fromEntries(WHEEL_IDS.map(id => [id, this.finite(contacts?.[id].height)])) as Record<WheelId, number>;
    const groundHeight = WHEEL_IDS.reduce((sum, id) => sum + heights[id] * .25, 0);
    const forwardSlope = ((heights.frontLeft + heights.frontRight) - (heights.rearLeft + heights.rearRight)) * .5 /
      Math.max(.5, this.config.wheelBase);
    const rightSlope = ((heights.frontRight + heights.rearRight) - (heights.frontLeft + heights.rearLeft)) * .5 /
      Math.max(.5, (this.config.frontTrackWidth + this.config.rearTrackWidth) * .5);
    return { heights, groundHeight, forwardSlope, rightSlope };
  }

  public getSnapshot(): SuspensionSnapshot {
    const wheels = Object.fromEntries(WHEEL_IDS.map((id) => [id, {
      normalLoad: this.corners[id].load,
      staticLoad: this.staticLoad(id),
      compression: this.corners[id].compression,
      compressionVelocity: this.corners[id].velocity,
      restCompression: this.staticLoad(id) / this.springRate(id),
      springForce: this.corners[id].spring,
      damperForce: this.corners[id].damper,
    }])) as Record<WheelId, SuspensionWheelState>;
    return { wheels, chassis: { ...this.chassis } };
  }

  private staticLoad(id: WheelId): number {
    const frontShare = clamp(this.config.frontWeightBias, 0.05, 0.95);
    return this.config.mass * this.config.gravity * (id.startsWith('front') ? frontShare : 1 - frontShare) * 0.5;
  }

  private springRate(id: WheelId): number {
    return Math.max(1_000, id.startsWith('front') ? this.config.suspension.springRateFront : this.config.suspension.springRateRear);
  }

  private finite(value: number | undefined, fallback = 0): number {
    return value !== undefined && Number.isFinite(value) ? value : fallback;
  }
}
