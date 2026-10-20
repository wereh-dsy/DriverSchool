import type { VehicleChassisConfig } from '../config';
import { wheelLocalPosition } from '../VehicleDimensions';
import { WHEEL_IDS, type GroundNormal, type WheelContactSet, type WheelId } from './WheelContact';
import type { ChassisPhysicsState } from './WheelPhysicsState';
import { clamp } from './math';

export interface SuspensionWheelState {
  readonly camberAngle: number;
  readonly toeAngle: number;
  readonly normalLoad: number;
  readonly staticLoad: number;
  readonly compression: number;
  readonly compressionVelocity: number;
  readonly restCompression: number;
  readonly springForce: number;
  readonly damperForce: number;
  readonly bumpStopForce: number;
  readonly antiRollForce: number;
}

/** One wheel's geometric contact and real spring support. */
export interface SuspensionVerticalCorner {
  readonly grounded: boolean;
  readonly surfaceHeight: number;
  readonly compression: number;
  readonly compressionVelocity: number;
  readonly springForce: number;
  readonly damperForce: number;
  readonly bumpStopForce: number;
  readonly supportForce: number;
  readonly suspensionLength: number;
  /** Wheel-centre offset from the chassis datum; includes static geometry. */
  readonly wheelLocalY: number;
}

export interface SuspensionVerticalSnapshot {
  /** True once this frame was produced from real road contact geometry. */
  readonly active: boolean;
  readonly groundedWheels: number;
  readonly supportForce: number;
  readonly wheels: Readonly<Record<WheelId, SuspensionVerticalCorner>>;
}

export interface SuspensionSnapshot {
  readonly rideHeightTarget: number;
  readonly adaptiveDampingMode: import('../config').VehicleDriveMode;
  readonly dampingMultiplier: number;
  readonly rideHeightOffset: number;
  readonly restLength: number;
  readonly wheels: Readonly<Record<WheelId, SuspensionWheelState>>;
  readonly chassis: ChassisPhysicsState;
}

export interface SuspensionStep {
  readonly frontAeroVerticalForce?: number;
  readonly rearAeroVerticalForce?: number;
  readonly speed?: number;
  readonly contacts?: WheelContactSet;
  readonly normal?: GroundNormal;
  /** Real per-wheel contact state from updateVertical; gates the load model. */
  readonly vertical?: SuspensionVerticalSnapshot;
  readonly longitudinalAcceleration: number;
  readonly lateralAcceleration: number;
}

export interface SuspensionVerticalStep {
  readonly chassisY: number;
  readonly verticalVelocity: number;
  readonly contacts?: WheelContactSet;
}

interface CornerState {
  geometryForce: number;
  compression: number;
  velocity: number;
  load: number;
  spring: number;
  damper: number;
  bumpStop: number;
  antiRoll: number;
}

interface MutableVerticalCorner {
  grounded: boolean;
  surfaceHeight: number;
  compression: number;
  compressionVelocity: number;
  springForce: number;
  damperForce: number;
  bumpStopForce: number;
  supportForce: number;
  suspensionLength: number;
  wheelLocalY: number;
}

interface MutableVerticalFrame {
  active: boolean;
  groundedWheels: number;
  supportForce: number;
  wheels: Record<WheelId, MutableVerticalCorner>;
}

/**
 * Four supported corner masses, not a 6-DOF chassis. Spring and damper motion
 * responds to load transfer and the non-planar part of sampled wheel heights.
 * The load normalization conserves the current supported vehicle weight.
 */
export class SuspensionSystem {
  private mode: import('../config').VehicleDriveMode = 'NORMAL';
  private dampingMultiplier = 1;
  private rideHeightOffset = 0;
  private highSpeedTimer = 0;
  private lowered = false;
  public get rideHeightTarget(): number {
    const air = this.config.suspension.airSuspension;
    if (!air) return this.config.suspension.rideHeight;
    return air.nominalRideHeight + clamp(Math.min(air.modeOffsets[this.mode] ?? 0,
      this.lowered && air.highSpeedLowering ? air.highSpeedLowering.offset : air.maximumOffset), air.minimumOffset, air.maximumOffset);
  }
  public setDriveMode(mode: import('../config').VehicleDriveMode): void { this.mode = mode; }
  private corners = {} as Record<WheelId, CornerState>;
  private longitudinalAcceleration = 0;
  private lateralAcceleration = 0;
  private previousRideOffset = 0;
  private chassis: ChassisPhysicsState = { groundHeight: 0, chassisY: 0, terrainPitch: 0, terrainRoll: 0,
    rideOffset: 0, pitch: 0, roll: 0, verticalVelocity: 0, verticalAcceleration: 0, groundedWheels: 4 };
  private readonly verticalFrame: MutableVerticalFrame = { active: false, groundedWheels: 0, supportForce: 0,
    wheels: {} as Record<WheelId, MutableVerticalCorner> };
  private readonly groundedWheels: Record<WheelId, boolean> = {
    frontLeft: true, frontRight: true, rearLeft: true, rearRight: true };
  private readonly previousSurfaceHeights: Record<WheelId, number> = {
    frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 };
  private hasPreviousSurface = false;
  private previousVerticalRideOffset = 0;

  public constructor(private readonly config: VehicleChassisConfig) {
    this.reset();
  }

  public reset(): void {
    this.mode = 'NORMAL'; this.dampingMultiplier = 1; this.rideHeightOffset = 0;
    this.highSpeedTimer = 0; this.lowered = false;
    this.longitudinalAcceleration = 0;
    this.lateralAcceleration = 0;
    this.previousRideOffset = 0;
    this.chassis = { groundHeight: 0, chassisY: 0, terrainPitch: 0, terrainRoll: 0, rideOffset: 0,
      pitch: 0, roll: 0, verticalVelocity: 0, verticalAcceleration: 0, groundedWheels: 4 };
    this.verticalFrame.active = false; this.verticalFrame.groundedWheels = 0; this.verticalFrame.supportForce = 0;
    this.hasPreviousSurface = false;
    this.previousVerticalRideOffset = 0;
    for (const id of WHEEL_IDS) {
      const load = this.staticLoad(id);
      this.corners[id] = { geometryForce: 0, compression: load / this.springRate(id), velocity: 0, load, spring: load, damper: 0, bumpStop: 0, antiRoll: 0 };
      const corner: MutableVerticalCorner = { grounded: false, surfaceHeight: 0,
        compression: load / this.springRate(id), compressionVelocity: 0, springForce: load,
        damperForce: 0, bumpStopForce: 0, supportForce: 0,
        suspensionLength: this.config.suspension.restLength - load / this.springRate(id),
        wheelLocalY: this.config.wheelRadius };
      this.verticalFrame.wheels[id] = corner;
      this.groundedWheels[id] = true;
      this.previousSurfaceHeights[id] = 0;
    }
  }

  public update(dt: number, step: SuspensionStep): SuspensionSnapshot {
    const duration = clamp(Number.isFinite(dt) ? dt : 0, 0, this.config.safety.maxFrameTime);
    const count = Math.max(1, Math.ceil(duration / Math.max(0.0001, this.config.safety.maxSubstep)));
    for (let i = 0; i < count; i++) this.integrate(duration / count, step);
    return this.getSnapshot();
  }

  private integrate(safeDt: number, step: SuspensionStep): void {
    const adaptive = this.config.suspension.adaptiveDamping;
    if (adaptive) this.dampingMultiplier += ((adaptive.modeMultipliers[this.mode] ?? 1) - this.dampingMultiplier) *
      (1 - Math.exp(-adaptive.responseRate * safeDt));
    const air = this.config.suspension.airSuspension;
    if (air) {
      const high = air.highSpeedLowering, speed = Math.abs(step.speed ?? 0);
      if (high) {
        this.highSpeedTimer = speed >= high.activateSpeed ? this.highSpeedTimer + safeDt : 0;
        if (this.highSpeedTimer >= high.delay) this.lowered = true;
        if (speed <= high.restoreSpeed) this.lowered = false;
      }
      const target = clamp(Math.min(air.modeOffsets[this.mode] ?? 0, this.lowered && high ? high.offset : air.maximumOffset),
        air.minimumOffset, air.maximumOffset);
      const previous = this.rideHeightOffset;
      this.rideHeightOffset += clamp(target - previous, -air.adjustmentRate * safeDt, air.adjustmentRate * safeDt);
      // A longer rest strut first loads the spring; the supported corner then
      // extends. This keeps body/wheel geometry continuous during adjustment.
      for (const id of WHEEL_IDS) this.corners[id].compression += this.rideHeightOffset - previous;
    }
    const accelerationBlend = 1 - Math.exp(-10 * safeDt);
    this.longitudinalAcceleration += (clamp(this.finite(step.longitudinalAcceleration), -12, 12) - this.longitudinalAcceleration) * accelerationBlend;
    this.lateralAcceleration += (clamp(this.finite(step.lateralAcceleration), -12, 12) - this.lateralAcceleration) * accelerationBlend;
    let normalY = step.normal?.y ?? 1;
    if (step.contacts !== undefined) normalY = WHEEL_IDS.reduce((sum, id) => sum + step.contacts![id].normal.y * 0.25, 0);
    const weight = this.config.mass * this.config.gravity * clamp(this.finite(normalY, 1), 0.3, 1);
    const frontShare = clamp(this.config.frontWeightBias, 0.05, 0.95);
    const frontLoad = Math.max(weight * frontShare * .08, weight * frontShare - this.finite(step.frontAeroVerticalForce));
    const rearLoad = Math.max(weight * (1 - frontShare) * .08, weight * (1 - frontShare) - this.finite(step.rearAeroVerticalForce));
    const supportedWeight = frontLoad + rearLoad;
    const longitudinalTransfer = this.config.mass * this.longitudinalAcceleration * this.config.centerOfMassHeight / Math.max(0.5, this.config.wheelBase);
    const frontLateralTransfer = this.config.mass * frontShare * this.lateralAcceleration * this.config.centerOfMassHeight / Math.max(0.5, this.config.frontTrackWidth);
    const rearLateralTransfer = this.config.mass * (1 - frontShare) * this.lateralAcceleration * this.config.centerOfMassHeight / Math.max(0.5, this.config.rearTrackWidth);
    const targetLoads: Record<WheelId, number> = {
      frontLeft: frontLoad * 0.5 - longitudinalTransfer * 0.5 + frontLateralTransfer,
      frontRight: frontLoad * 0.5 - longitudinalTransfer * 0.5 - frontLateralTransfer,
      rearLeft: rearLoad * 0.5 + longitudinalTransfer * 0.5 + rearLateralTransfer,
      rearRight: rearLoad * 0.5 + longitudinalTransfer * 0.5 - rearLateralTransfer,
    };
    for (const id of WHEEL_IDS) targetLoads[id] = Math.max(this.staticLoad(id) * 0.08, targetLoads[id]);
    const targetTotal = WHEEL_IDS.reduce((sum, id) => sum + targetLoads[id], 0);
    const { heights, groundHeight, forwardSlope, rightSlope } = this.groundGeometry(step.contacts, step.vertical);
    const antiRoll = this.antiRollForces();
    for (const id of WHEEL_IDS) {
      const corner = this.corners[id];
      const front = id.startsWith('front');
      const springRate = this.springRate(id);
      const wheel = wheelLocalPosition(this.config, id);
      const grounded = step.vertical === undefined || step.vertical.wheels[id].grounded;
      const groundResidual = grounded
        ? clamp(heights[id] - groundHeight + wheel.z * forwardSlope - wheel.x * rightSlope, -0.05, 0.05)
        : 0;
      const targetLoad = grounded ? targetLoads[id] * supportedWeight / Math.max(1, targetTotal) : 0;
      const kinematics = front ? this.config.suspension.kinematics?.front : this.config.suspension.kinematics?.rear;
      const driven = this.config.drivetrainType === 'AWD' || (front ? this.config.drivetrainType === 'FWD' : this.config.drivetrainType === 'RWD');
      // Geometry routes longitudinal support around the spring, not around the tyre.
      const antiRatio = this.longitudinalAcceleration < 0 && front ? kinematics?.antiDiveRatio ?? 0
        : this.longitudinalAcceleration > 0 && driven ? kinematics?.antiSquatRatio ?? 0 : 0;
      corner.geometryForce = grounded ? (front ? -1 : 1) * longitudinalTransfer * .5 * clamp(antiRatio, 0, 1) : 0;
      const baselineDamping = corner.velocity >= 0
        ? (front ? this.config.suspension.damperCompressionFront : this.config.suspension.damperCompressionRear)
        : (front ? this.config.suspension.damperReboundFront : this.config.suspension.damperReboundRear);
      const damping = baselineDamping * this.dampingMultiplier;
      const cornerMass = this.staticLoad(id) / this.config.gravity;
      const bumpStop = this.bumpStopForce(id, corner.compression);
      const acceleration = (targetLoad - corner.geometryForce + springRate * groundResidual - springRate * corner.compression -
        damping * corner.velocity - bumpStop - antiRoll[id]) / Math.max(20, cornerMass);
      corner.velocity += acceleration * safeDt;
      corner.compression += corner.velocity * safeDt;
      const { minimumCompression, maximumCompression } = this.travelLimits(id);
      const limited = clamp(corner.compression, minimumCompression, maximumCompression);
      if (limited !== corner.compression) corner.velocity = 0;
      corner.compression = limited;
      corner.spring = springRate * corner.compression;
      corner.damper = damping * corner.velocity;
      corner.bumpStop = this.bumpStopForce(id, corner.compression);
    }
    // Equal and opposite axle forces conserve weight. They also resist spring
    // displacement in the integrator above: this is not a visual roll scale.
    const updatedAntiRoll = this.antiRollForces();
    for (const id of WHEEL_IDS) {
      const corner = this.corners[id];
      corner.antiRoll = updatedAntiRoll[id];
      corner.load = Math.max(this.staticLoad(id) * 0.08,
        corner.spring + corner.damper + corner.bumpStop + corner.antiRoll + corner.geometryForce);
    }
    const actualTotal = WHEEL_IDS.reduce((sum, id) => sum + this.corners[id].load, 0);
    const hasAero = this.finite(step.frontAeroVerticalForce) !== 0 || this.finite(step.rearAeroVerticalForce) !== 0;
    if (hasAero) {
      // Preserve the separate axle aerodynamic loads instead of distributing
      // total downforce according to the static weight bias.
      const frontTarget = (targetLoads.frontLeft + targetLoads.frontRight) * supportedWeight / Math.max(1, targetTotal);
      const rearTarget = (targetLoads.rearLeft + targetLoads.rearRight) * supportedWeight / Math.max(1, targetTotal);
      const frontActual = this.corners.frontLeft.load + this.corners.frontRight.load;
      const rearActual = this.corners.rearLeft.load + this.corners.rearRight.load;
      for (const id of WHEEL_IDS) this.corners[id].load *= id.startsWith('front')
        ? frontTarget / Math.max(1, frontActual) : rearTarget / Math.max(1, rearActual);
    } else for (const id of WHEEL_IDS) this.corners[id].load *= supportedWeight / Math.max(1, actualTotal);
    // Contact state outranks both the 8% stability floor and normalization.
    // An airborne wheel keeps no stored tyre load for a later frame.
    if (step.vertical !== undefined) for (const id of WHEEL_IDS) {
      if (!step.vertical.wheels[id].grounded) this.corners[id].load = 0;
    }
    const displacement = (id: WheelId): number => this.corners[id].compression - this.staticLoad(id) / this.springRate(id);
    const frontDisplacement = (displacement('frontLeft') + displacement('frontRight')) * 0.5;
    const rearDisplacement = (displacement('rearLeft') + displacement('rearRight')) * 0.5;
    const leftDisplacement = (displacement('frontLeft') + displacement('rearLeft')) * 0.5;
    const rightDisplacement = (displacement('frontRight') + displacement('rearRight')) * 0.5;
    const rideOffset = this.rideHeightOffset - (frontDisplacement + rearDisplacement) * 0.5;
    this.chassis = {
      groundHeight,
      // Direct SuspensionSystem users do not own a heave state; the support
      // plane is a compatible datum for them. VehicleDynamics overrides it.
      chassisY: groundHeight,
      terrainPitch: Math.atan(forwardSlope),
      terrainRoll: Math.atan(rightSlope),
      rideOffset,
      pitch: clamp(Math.atan2(rearDisplacement - frontDisplacement, this.config.wheelBase), -0.065, 0.065),
      roll: clamp(Math.atan2(leftDisplacement - rightDisplacement,
        (this.config.frontTrackWidth + this.config.rearTrackWidth) * 0.5), -0.075, 0.075),
      verticalVelocity: safeDt > 0 ? (rideOffset - this.previousRideOffset) / safeDt : 0,
      verticalAcceleration: 0,
      groundedWheels: step.vertical?.groundedWheels ?? 4,
    };
    this.previousRideOffset = rideOffset;
  }

  /**
   * Production vertical contact pass. Compression comes from the real chassis
   * height and the sampled surface, so a wheel can fail to reach the ground.
   * Spring, damper and bump stop then push the chassis; they never pull it down.
   */
  public updateVertical(dt: number, step: SuspensionVerticalStep): SuspensionVerticalSnapshot {
    const duration = clamp(Number.isFinite(dt) ? dt : 0, 0, this.config.safety.maxFrameTime);
    const frame = this.verticalFrame;
    const chassisY = this.finite(step.chassisY);
    const verticalVelocity = clamp(this.finite(step.verticalVelocity), -50, 50);
    const rideRate = duration > 0
      ? clamp((this.rideHeightOffset - this.previousVerticalRideOffset) / duration, -2, 2) : 0;
    let supportTotal = 0;
    let groundedCount = 0;
    for (const id of WHEEL_IDS) {
      const corner = frame.wheels[id];
      const front = id.startsWith('front');
      const surfaceHeight = this.finite(step.contacts?.[id]?.height, this.chassis.groundHeight);
      const surfaceRate = duration > 0 && this.hasPreviousSurface
        ? clamp((surfaceHeight - this.previousSurfaceHeights[id]) / duration, -8, 8) : 0;
      this.previousSurfaceHeights[id] = surfaceHeight;
      const requirement = this.contactRequirement(id, chassisY, surfaceHeight);
      const { minimumCompression, maximumCompression } = this.travelLimits(id);
      const grounded = requirement >= minimumCompression - 1e-6;
      const compression = clamp(requirement, minimumCompression, maximumCompression);
      const compressionVelocity = clamp(rideRate + surfaceRate - verticalVelocity, -4, 4);
      const springRate = this.springRate(id);
      const springForce = springRate * compression;
      const baselineDamping = compressionVelocity >= 0
        ? (front ? this.config.suspension.damperCompressionFront : this.config.suspension.damperCompressionRear)
        : (front ? this.config.suspension.damperReboundFront : this.config.suspension.damperReboundRear);
      const damperForce = baselineDamping * this.dampingMultiplier * compressionVelocity;
      const bumpStopForce = this.bumpStopForce(id, compression);
      const supportForce = grounded ? Math.max(0, springForce + damperForce + bumpStopForce) : 0;
      corner.grounded = grounded;
      corner.surfaceHeight = surfaceHeight;
      corner.compression = compression;
      corner.compressionVelocity = compressionVelocity;
      corner.springForce = springForce;
      corner.damperForce = damperForce;
      corner.bumpStopForce = bumpStopForce;
      corner.supportForce = supportForce;
      corner.suspensionLength = this.config.suspension.restLength + this.rideHeightOffset - compression;
      corner.wheelLocalY = this.contactWheelOffsetY(id, compression);
      this.groundedWheels[id] = grounded;
      supportTotal += supportForce;
      if (grounded) groundedCount++;
    }
    this.hasPreviousSurface = true;
    this.previousVerticalRideOffset = this.rideHeightOffset;
    frame.active = true;
    frame.groundedWheels = groundedCount;
    frame.supportForce = supportTotal;
    return frame;
  }

  public getVerticalSnapshot(): SuspensionVerticalSnapshot { return this.verticalFrame; }
  public getGroundedWheels(): Readonly<Record<WheelId, boolean>> { return this.groundedWheels; }

  /** Explicit teleport/respawn: do not differentiate the previous surface sample. */
  public resetVerticalContact(): void {
    this.hasPreviousSurface = false;
    this.previousVerticalRideOffset = this.rideHeightOffset;
  }

  /** Compression required to keep this wheel on the supplied surface. */
  public contactRequirement(id: WheelId, chassisY: number, surfaceHeight: number): number {
    return this.staticLoad(id) / this.springRate(id) + this.rideHeightOffset +
      this.finite(surfaceHeight) - this.finite(chassisY) + this.attitudeOffset(id);
  }

  public contactIsGrounded(id: WheelId, requirement: number): boolean {
    return requirement >= this.travelLimits(id).minimumCompression - 1e-6;
  }

  public clampContactCompression(id: WheelId, requirement: number): number {
    const { minimumCompression, maximumCompression } = this.travelLimits(id);
    return clamp(requirement, minimumCompression, maximumCompression);
  }

  /** Body-local wheel-centre height including the current authored attitude. */
  public contactWheelOffsetY(id: WheelId, compression: number): number {
    return this.config.wheelRadius + compression - this.staticLoad(id) / this.springRate(id) -
      this.rideHeightOffset - this.attitudeOffset(id);
  }

  /** Lowest legal chassis datum before the bump stop is physically overrun. */
  public minimumChassisY(id: WheelId, surfaceHeight: number): number {
    return this.finite(surfaceHeight) + this.staticLoad(id) / this.springRate(id) +
      this.rideHeightOffset + this.attitudeOffset(id) - this.travelLimits(id).maximumCompression;
  }

  /** Rotation-induced vertical offset of this wheel anchor, metres. */
  private attitudeOffset(id: WheelId): number {
    const wheel = wheelLocalPosition(this.config, id);
    const pitch = this.chassis.terrainPitch + this.chassis.pitch;
    const roll = this.chassis.terrainRoll + this.chassis.roll;
    return wheel.z * pitch - wheel.x * roll;
  }

  public synchronizeGroundGeometry(contacts: WheelContactSet, vertical?: SuspensionVerticalSnapshot): void {
    const { groundHeight, forwardSlope, rightSlope } = this.groundGeometry(contacts, vertical);
    this.chassis = { ...this.chassis, groundHeight,
      terrainPitch: Math.atan(forwardSlope), terrainRoll: Math.atan(rightSlope) };
  }

  private groundGeometry(contacts?: WheelContactSet, vertical?: SuspensionVerticalSnapshot) {
    const heights = Object.fromEntries(WHEEL_IDS.map(id => [id, this.finite(contacts?.[id].height)])) as Record<WheelId, number>;
    const active = WHEEL_IDS.filter(id => vertical === undefined || vertical.wheels[id].grounded);
    const previousForwardSlope = Math.tan(this.chassis.terrainPitch);
    const previousRightSlope = Math.tan(this.chassis.terrainRoll);
    if (active.length === 0) {
      // Fully airborne: keep the last supported attitude instead of fitting a
      // plane through a surface the car can no longer reach.
      return { heights, groundHeight: this.chassis.groundHeight,
        forwardSlope: previousForwardSlope, rightSlope: previousRightSlope };
    }
    const mean = (ids: readonly WheelId[]): number =>
      ids.reduce((sum, id) => sum + heights[id], 0) / Math.max(1, ids.length);
    const front = active.filter(id => id.startsWith('front'));
    const rear = active.filter(id => id.startsWith('rear'));
    const left = active.filter(id => id.endsWith('Left'));
    const right = active.filter(id => id.endsWith('Right'));
    const groundHeight = mean(active);
    const forwardSlope = front.length > 0 && rear.length > 0
      ? (mean(front) - mean(rear)) / Math.max(.5, this.config.wheelBase) : previousForwardSlope;
    const rightSlope = left.length > 0 && right.length > 0
      ? (mean(right) - mean(left)) / Math.max(.5, (this.config.frontTrackWidth + this.config.rearTrackWidth) * .5)
      : previousRightSlope;
    return { heights, groundHeight, forwardSlope, rightSlope };
  }

  public getChassisSnapshot(): ChassisPhysicsState { return { ...this.chassis }; }

  public getSnapshot(): SuspensionSnapshot {
    const wheels = Object.fromEntries(WHEEL_IDS.map((id) => [id, {
      camberAngle: this.kinematicAngle(id, false),
      toeAngle: this.kinematicAngle(id, true),
      normalLoad: this.corners[id].load,
      staticLoad: this.staticLoad(id),
      compression: this.corners[id].compression,
      compressionVelocity: this.corners[id].velocity,
      restCompression: this.staticLoad(id) / this.springRate(id),
      springForce: this.corners[id].spring,
      damperForce: this.corners[id].damper,
      bumpStopForce: this.corners[id].bumpStop,
      antiRollForce: this.corners[id].antiRoll,
    }])) as Record<WheelId, SuspensionWheelState>;
    return { wheels, chassis: { ...this.chassis }, dampingMultiplier: this.dampingMultiplier,
      rideHeightTarget: this.rideHeightTarget, adaptiveDampingMode: this.mode,
      rideHeightOffset: this.rideHeightOffset, restLength: this.config.suspension.restLength + this.rideHeightOffset };
  }

  private staticLoad(id: WheelId): number {
    const frontShare = clamp(this.config.frontWeightBias, 0.05, 0.95);
    return this.config.mass * this.config.gravity * (id.startsWith('front') ? frontShare : 1 - frontShare) * 0.5;
  }

  /** Zero travel relative to loaded rest geometry gives the authored static alignment. */
  private kinematicAngle(id: WheelId, toe: boolean): number {
    const axle = id.startsWith('front') ? this.config.suspension.kinematics?.front : this.config.suspension.kinematics?.rear;
    if (!axle) return 0;
    const delta = this.corners[id].compression - this.staticLoad(id) / this.springRate(id);
    return toe ? axle.staticToe + delta * axle.bumpToeGainPerMeter : axle.staticCamber + delta * axle.camberGainPerMeter;
  }

  private travelLimits(id: WheelId) {
    const restCompression = this.staticLoad(id) / this.springRate(id);
    const halfTravel = Math.max(0.001, this.config.suspension.suspensionTravel) * 0.5;
    return {
      minimumCompression: Math.max(0, restCompression - halfTravel),
      maximumCompression: Math.min((this.config.suspension.restLength + this.rideHeightOffset) * 0.94, restCompression + halfTravel),
    };
  }

  private bumpStopForce(id: WheelId, compression: number): number {
    const { minimumCompression, maximumCompression } = this.travelLimits(id);
    const span = Math.max(0.001, maximumCompression - minimumCompression);
    const start = minimumCompression + span * clamp(this.config.suspension.bumpStopStartRatio, 0.5, 0.98);
    const depth = Math.max(0, compression - start);
    return Math.max(0, this.config.suspension.bumpStopStiffness) * depth * depth /
      Math.max(0.001, maximumCompression - start);
  }

  private antiRollForces(): Record<WheelId, number> {
    const front = (this.corners.frontLeft.compression - this.corners.frontRight.compression) *
      Math.max(0, this.config.suspension.antiRollStiffnessFront);
    const rear = (this.corners.rearLeft.compression - this.corners.rearRight.compression) *
      Math.max(0, this.config.suspension.antiRollStiffnessRear);
    return { frontLeft: front, frontRight: -front, rearLeft: rear, rearRight: -rear };
  }

  private springRate(id: WheelId): number {
    return Math.max(1_000, id.startsWith('front') ? this.config.suspension.springRateFront : this.config.suspension.springRateRear);
  }

  private finite(value: number | undefined, fallback = 0): number {
    return value !== undefined && Number.isFinite(value) ? value : fallback;
  }
}
