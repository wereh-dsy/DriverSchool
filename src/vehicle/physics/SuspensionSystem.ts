import type { VehicleChassisConfig } from '../config';
import { wheelLocalPosition } from '../VehicleDimensions';
import { WHEEL_IDS, type GroundNormal, type WheelContactSet, type WheelId } from './WheelContact';
import { chassisBodyPose, type ChassisPhysicsState, type WheelGeometryState } from './WheelPhysicsState';
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
export interface SuspensionVerticalCorner extends WheelGeometryState {
  readonly unsprungMass: number;
  readonly unsprungPosition: number;
  readonly unsprungVelocity: number;
  readonly unsprungAcceleration: number;
  readonly tyreNormalForce: number;
  readonly springStiffness: number;
  readonly suspensionDamping: number;
  readonly unloadedLength: number;
  readonly mountNormalVelocity: number;
  readonly freeTyreRadius: number;
  readonly supportValid?: boolean;
  readonly requiredLength: number;
  readonly grounded: boolean;
  readonly surfaceHeight: number;
  readonly compression: number;
  readonly compressionVelocity: number;
  readonly springForce: number;
  readonly damperForce: number;
  readonly bumpStopForce: number;
  readonly supportForce: number;
  readonly normalLoad: number;
  readonly antiRollForce: number;
  readonly contactForce: number;
  readonly suspensionLength: number;
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
  readonly x?: number;
  readonly z?: number;
  readonly yaw?: number;
  readonly chassisY: number;
  readonly verticalVelocity: number;
  readonly velocityX?: number;
  readonly velocityZ?: number;
  readonly yawRate?: number;
  readonly pitchAngularVelocity?: number;
  readonly rollAngularVelocity?: number;
  readonly contacts?: WheelContactSet;
}

interface CornerState {
  compression: number;
  velocity: number;
  load: number;
  spring: number;
  damper: number;
  bumpStop: number;
  antiRoll: number;
}

interface MutableVerticalCorner {
  unsprungMass: number;
  unsprungPosition: number;
  unsprungVelocity: number;
  unsprungAcceleration: number;
  tyreNormalForce: number;
  springStiffness: number;
  suspensionDamping: number;
  unloadedLength: number;
  mountNormalVelocity: number;
  freeTyreRadius: number;
  tyreCompression: number;
  tyreCompressionVelocity: number;
  effectiveRadius: number;
  supportValid?: boolean;
  requiredLength: number;
  grounded: boolean;
  surfaceHeight: number;
  compression: number;
  compressionVelocity: number;
  springForce: number;
  damperForce: number;
  bumpStopForce: number;
  supportForce: number;
  normalLoad: number;
  antiRollForce: number;
  contactForce: number;
  suspensionLength: number;
  attachmentWorldPosition: { x: number; y: number; z: number };
  suspensionAxis: { x: number; y: number; z: number };
  minSuspensionLength: number;
  restSuspensionLength: number;
  maxSuspensionLength: number;
  wheelCenterWorld: { x: number; y: number; z: number };
  surfacePoint: { x: number; y: number; z: number };
  surfaceNormal: { x: number; y: number; z: number };
  penetration: number;
}

interface MutableVerticalFrame {
  active: boolean;
  groundedWheels: number;
  supportForce: number;
  wheels: Record<WheelId, MutableVerticalCorner>;
}

/**
 * Sprung-body suspension geometry and reactions. Compression follows the
 * authoritative chassis pose; no corner load floor or weight normalization.
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
  private chassis: ChassisPhysicsState = { groundHeight: 0, chassisY: 0, terrainPitch: 0, terrainRoll: 0,
    rideOffset: 0, pitch: 0, roll: 0, verticalVelocity: 0, verticalAcceleration: 0, groundedWheels: 4 };
  private readonly verticalFrame: MutableVerticalFrame = { active: false, groundedWheels: 0, supportForce: 0,
    wheels: {} as Record<WheelId, MutableVerticalCorner> };
  private readonly groundedWheels: Record<WheelId, boolean> = {
    frontLeft: true, frontRight: true, rearLeft: true, rearRight: true };

  public constructor(private readonly config: VehicleChassisConfig, private readonly geometryMass = config.mass) {
    this.reset();
  }

  public reset(): void {
    this.mode = 'NORMAL'; this.dampingMultiplier = 1; this.rideHeightOffset = 0;
    this.highSpeedTimer = 0; this.lowered = false;
    this.chassis = { dynamicAttitude: true, centerOfMassHeight: this.config.centerOfMassHeight,
      centerOfMassOffsetZ: this.config.wheelBase * (.5 - this.config.frontWeightBias),
      groundHeight: 0, chassisY: 0, terrainPitch: 0, terrainRoll: 0, rideOffset: 0,
      pitch: 0, roll: 0, verticalVelocity: 0, verticalAcceleration: 0, groundedWheels: 4 };
    this.verticalFrame.active = false; this.verticalFrame.groundedWheels = 0; this.verticalFrame.supportForce = 0;
    for (const id of WHEEL_IDS) {
      const load = this.staticLoad(id);
      const sprungLoad = this.sprungStaticLoad(id);
      this.corners[id] = { compression: sprungLoad / this.springRate(id), velocity: 0, load, spring: sprungLoad, damper: 0, bumpStop: 0, antiRoll: 0 };
      const radial = this.config.tires.verticalCompliance;
      const tyreCompression = radial ? load / radial.stiffness : 0;
      const corner: MutableVerticalCorner = { grounded: false, surfaceHeight: 0,
        unsprungMass: this.unsprungMass(id),
        unsprungPosition: this.config.suspension.restLength - sprungLoad / this.springRate(id),
        unsprungVelocity: 0, unsprungAcceleration: 0, tyreNormalForce: load,
        springStiffness: this.springRate(id), suspensionDamping: 0,
        unloadedLength: this.config.suspension.restLength, mountNormalVelocity: 0,
        freeTyreRadius: this.config.wheelRadius + tyreCompression,
        tyreCompression, tyreCompressionVelocity: 0, effectiveRadius: this.config.wheelRadius,
        compression: sprungLoad / this.springRate(id), compressionVelocity: 0, springForce: sprungLoad,
        damperForce: 0, bumpStopForce: 0, supportForce: 0, normalLoad: load, antiRollForce: 0, contactForce: 0,
        suspensionLength: this.config.suspension.restLength - sprungLoad / this.springRate(id),
        attachmentWorldPosition: { x: 0, y: 0, z: 0 }, suspensionAxis: { x: 0, y: -1, z: 0 },
        minSuspensionLength: 0, restSuspensionLength: 0, maxSuspensionLength: 0,
        wheelCenterWorld: { x: 0, y: 0, z: 0 }, surfacePoint: { x: 0, y: 0, z: 0 },
        surfaceNormal: { x: 0, y: 1, z: 0 }, penetration: 0, requiredLength: 0 };
      this.verticalFrame.wheels[id] = corner;
      this.groundedWheels[id] = true;
    }
    this.refreshVerticalGeometry({ chassisY: 0, verticalVelocity: 0 });
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
    // Chassis motion and physical contact own compression and loads. This
    // pass only advances adaptive hardware; no acceleration-to-Fz shortcut.
    this.publishCorners();
  }

  public setDynamicPose(pitch: number, roll: number): void {
    this.chassis = { ...this.chassis, pitch, roll, dynamicAttitude: true, rideOffset: this.rideHeightOffset,
      centerOfMassHeight: this.config.centerOfMassHeight,
      centerOfMassOffsetZ: this.config.wheelBase * (.5 - this.config.frontWeightBias) };
  }

  private publishCorners(): void {
    for (const id of WHEEL_IDS) {
      const source = this.verticalFrame.wheels[id], corner = this.corners[id];
      corner.compression = source.compression;
      corner.velocity = source.compressionVelocity;
      corner.spring = source.springForce;
      corner.damper = source.damperForce;
      corner.bumpStop = source.bumpStopForce;
      corner.antiRoll = source.antiRollForce;
      corner.load = source.grounded ? source.normalLoad : 0;
    }
  }

  /**
   * Production vertical contact pass. Compression comes from the real chassis
   * height and the sampled surface, so a wheel can fail to reach the ground.
   * Legacy massless contacts publish unilateral support. With a hub DOF the
   * suspension is an internal force pair; only the tyre/road force is unilateral.
   */
  public updateVertical(dt: number, step: SuspensionVerticalStep): SuspensionVerticalSnapshot {
    this.refreshVerticalGeometry(step);
    const frame = this.verticalFrame;
    const verticalVelocity = this.finite(step.verticalVelocity);
    const yaw = step.yaw ?? 0, sy = Math.sin(yaw), cy = Math.cos(yaw);
    const pitch = this.chassis.pitch, sp = Math.sin(pitch), cp = Math.cos(pitch);
    const pitchRate = step.pitchAngularVelocity ?? 0, rollRate = step.rollAngularVelocity ?? 0;
    const wx = cy * pitchRate + sy * cp * rollRate;
    const wy = (step.yawRate ?? 0) - sp * rollRate;
    const wz = -sy * pitchRate + cy * cp * rollRate;
    const cgZ = this.config.wheelBase * (.5 - this.config.frontWeightBias);
    const bars = this.antiRollForces();
    let supportTotal = 0;
    let groundedCount = 0;
    for (const id of WHEEL_IDS) {
      const corner = frame.wheels[id];
      const front = id.startsWith('front');
      let { grounded, compression } = corner;
      const point = corner.wheelCenterWorld, n = corner.surfaceNormal;
      const rx = point.x - ((step.x ?? 0) + sy * cgZ);
      const ry = point.y - (step.chassisY + this.config.centerOfMassHeight);
      const rz = point.z - ((step.z ?? 0) + cy * cgZ);
      const vx = (step.velocityX ?? 0) + wy * rz - wz * ry;
      const vy = verticalVelocity + wz * rx - wx * rz;
      const vz = (step.velocityZ ?? 0) + wx * ry - wy * rx;
      const projection = Math.max(.1, -(corner.suspensionAxis.x * n.x + corner.suspensionAxis.y * n.y + corner.suspensionAxis.z * n.z));
      // Static road, moving sprung point: no frame-history / microDt aliasing.
      let compressionVelocity = grounded ? -(vx * n.x + vy * n.y + vz * n.z) / projection : 0;
      const springRate = this.springRate(id);
      const baselineDamping = compressionVelocity >= 0
        ? (front ? this.config.suspension.damperCompressionFront : this.config.suspension.damperCompressionRear)
        : (front ? this.config.suspension.damperReboundFront : this.config.suspension.damperReboundRear);
      const damping = baselineDamping * this.dampingMultiplier;
      const antiRollForce = bars[id];
      const radial = this.config.tires.verticalCompliance;
      if (corner.unsprungMass > 0 && radial) {
        // The coupled hub/body advance occurs once in ChassisDynamics, after
        // tangential/aerodynamic loads are known. Refreshes never advance it.
        corner.springStiffness = springRate;
        corner.suspensionDamping = (corner.unsprungVelocity <= 0
          ? (front ? this.config.suspension.damperCompressionFront : this.config.suspension.damperCompressionRear)
          : (front ? this.config.suspension.damperReboundFront : this.config.suspension.damperReboundRear)) * this.dampingMultiplier;
        corner.unloadedLength = this.config.suspension.restLength + this.rideHeightOffset;
        corner.mountNormalVelocity = vx * n.x + vy * n.y + vz * n.z;
        corner.antiRollForce = antiRollForce;
        corner.bumpStopForce = this.bumpStopForce(id, compression);
        supportTotal += corner.supportForce;
        if (corner.grounded) groundedCount++;
        continue;
      }
      if (radial && dt > 0) {
        const previous = corner.tyreCompression;
        // Analytic Kelvin-Voigt series relaxation. No unsprung mass and no
        // second Fz: the one series reaction is delivered through suspension.
        const free = previous * Math.exp(-radial.stiffness * dt / Math.max(1, radial.damping));
        const force = springRate * compression + damping * compressionVelocity +
          this.bumpStopForce(id, compression) + antiRollForce;
        const stiffness = projection * radial.stiffness + springRate / projection;
        const response = -Math.expm1(-stiffness * dt / (projection * radial.damping + damping / projection));
        const change = (force - projection * radial.stiffness * previous) / stiffness * response;
        // Resolve finite radial closure before the existing strut-stop solver.
        const closure = previous + (corner.minSuspensionLength - corner.requiredLength) * projection;
        const next = grounded ? clamp(Math.max(free, previous + change, closure), 0, radial.maximumCompression) : free;
        corner.tyreCompression = next;
        corner.tyreCompressionVelocity = (next - previous) / dt;
        const delta = (next - previous) / projection;
        corner.requiredLength += delta;
        corner.suspensionLength = corner.supportValid === false ? corner.maxSuspensionLength
          : clamp(corner.requiredLength, corner.minSuspensionLength, corner.maxSuspensionLength);
        compression = this.config.suspension.restLength + this.rideHeightOffset - corner.suspensionLength;
        corner.compression = compression;
        grounded = corner.supportValid !== false && corner.requiredLength <= corner.maxSuspensionLength + 1e-6;
        corner.grounded = grounded;
        compressionVelocity = grounded ? compressionVelocity - corner.tyreCompressionVelocity / projection : 0;
        corner.effectiveRadius = this.config.wheelRadius + this.staticLoad(id) / radial.stiffness - next;
        const mount = corner.attachmentWorldPosition, axis = corner.suspensionAxis;
        point.x = mount.x + axis.x * corner.suspensionLength;
        point.y = mount.y + axis.y * corner.suspensionLength;
        point.z = mount.z + axis.z * corner.suspensionLength;
        const road = corner.surfacePoint;
        corner.penetration = grounded && corner.requiredLength < corner.minSuspensionLength
          ? Math.max(0, corner.effectiveRadius - ((point.x - road.x) * n.x +
            (point.y - road.y) * n.y + (point.z - road.z) * n.z)) : 0;
        // The massless series reaction is transmitted through the suspension
        // once. A bottomed strut retains its existing mechanical reaction path.
        corner.normalLoad = grounded ? Math.max(0, springRate * compression + damping * compressionVelocity +
          this.bumpStopForce(id, compression) + antiRollForce) / projection : 0;
      } else {
        corner.normalLoad = grounded ? Math.max(0, springRate * compression + damping * compressionVelocity +
          this.bumpStopForce(id, compression) + antiRollForce) / projection : 0;
      }
      const springForce = springRate * compression;
      const damperForce = damping * compressionVelocity;
      const bumpStopForce = this.bumpStopForce(id, compression);
      const supportForce = corner.normalLoad * corner.surfaceNormal.y;
      corner.compressionVelocity = compressionVelocity;
      corner.springForce = springForce;
      corner.damperForce = damperForce;
      corner.bumpStopForce = bumpStopForce;
      corner.supportForce = supportForce;
      corner.antiRollForce = antiRollForce;
      corner.contactForce = 0;
      corner.tyreNormalForce = corner.normalLoad;
      this.groundedWheels[id] = grounded;
      supportTotal += supportForce;
      if (grounded) groundedCount++;
    }
    frame.active = true;
    frame.groundedWheels = groundedCount;
    frame.supportForce = supportTotal;
    this.publishCorners();
    return frame;
  }

  public getVerticalSnapshot(): SuspensionVerticalSnapshot { return this.verticalFrame; }
  /** Mechanical-stop impulse is a physical reaction, averaged for tyre input. */
  public publishContactImpulses(impulses: readonly number[], dt: number): void {
    let total = 0;
    for (let i = 0; i < WHEEL_IDS.length; i++) {
      const corner = this.verticalFrame.wheels[WHEEL_IDS[i]!]!;
      corner.contactForce = corner.grounded ? impulses[i]! / dt : 0;
      corner.normalLoad = corner.grounded ? corner.normalLoad + corner.contactForce : 0;
      corner.tyreNormalForce = corner.normalLoad;
      if (corner.unsprungMass) corner.supportForce += corner.contactForce * corner.surfaceNormal.y;
      else corner.supportForce = corner.normalLoad * corner.surfaceNormal.y;
      total += corner.supportForce;
    }
    this.verticalFrame.supportForce = total;
    this.publishCorners();
  }
  public getGroundedWheels(): Readonly<Record<WheelId, boolean>> { return this.groundedWheels; }

  /** Explicit teleport/respawn: do not differentiate the previous surface sample. */
  public resetVerticalContact(): void {
    const radial = this.config.tires.verticalCompliance;
    for (const id of WHEEL_IDS) {
      const corner = this.verticalFrame.wheels[id];
      corner.tyreCompression = radial ? this.staticLoad(id) / radial.stiffness : 0;
      corner.tyreCompressionVelocity = 0;
      corner.effectiveRadius = this.config.wheelRadius;
      corner.unsprungPosition = this.config.suspension.restLength - this.sprungStaticLoad(id) / this.springRate(id);
      corner.unsprungVelocity = corner.unsprungAcceleration = 0;
    }
  }

  /** Geometry-only refresh: never integrate forces or differentiate a sample twice. */
  public refreshVerticalGeometry(step: SuspensionVerticalStep): SuspensionVerticalSnapshot {
    const pitch = this.chassis.pitch + (this.chassis.dynamicAttitude ? 0 : this.chassis.terrainPitch);
    const roll = this.chassis.roll + (this.chassis.dynamicAttitude ? 0 : this.chassis.terrainRoll);
    const cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    const cy = Math.cos(step.yaw ?? 0), sy = Math.sin(step.yaw ?? 0);
    const body = chassisBodyPose({ ...this.chassis, chassisY: step.chassisY }, 0, step.yaw);
    let groundedCount = 0;
    let supportForce = 0;
    for (const id of WHEEL_IDS) {
      const corner = this.verticalFrame.wheels[id];
      const wheel = wheelLocalPosition(this.config, id);
      const restCompression = this.sprungStaticLoad(id) / this.springRate(id);
      const restLength = this.config.suspension.restLength + this.rideHeightOffset;
      const { minimumCompression, maximumCompression } = this.travelLimits(id);
      corner.minSuspensionLength = restLength - maximumCompression;
      corner.maxSuspensionLength = restLength - minimumCompression;
      corner.restSuspensionLength = clamp(restLength - restCompression,
        corner.minSuspensionLength, corner.maxSuspensionLength);
      // Fixed chassis mount. Rotate Z, X, Y, exactly as the visual's YXZ Euler.
      const mountY = this.config.wheelRadius + this.config.suspension.restLength - restCompression;
      const rx = cr * wheel.x - sr * mountY, ry = sr * wheel.x + cr * mountY;
      const py = cp * ry - sp * wheel.z, pz = sp * ry + cp * wheel.z;
      const mount = corner.attachmentWorldPosition, axis = corner.suspensionAxis;
      mount.x = (step.x ?? 0) + body.offsetX + cy * rx + sy * pz;
      mount.y = body.y + py;
      mount.z = (step.z ?? 0) + body.offsetZ - sy * rx + cy * pz;
      axis.x = cy * sr - sy * sp * cr;
      axis.y = -cp * cr;
      axis.z = -sy * sr - cy * sp * cr;
      const contact = step.contacts?.[id], normal = corner.surfaceNormal;
      corner.supportValid = contact?.supportValid !== false;
      const n = contact?.normal;
      const norm = n ? Math.hypot(n.x, n.y, n.z) : 0;
      normal.x = norm > 1e-7 && n!.y > 0 ? n!.x / norm : 0;
      normal.y = norm > 1e-7 && n!.y > 0 ? n!.y / norm : 1;
      normal.z = norm > 1e-7 && n!.y > 0 ? n!.z / norm : 0;
      const point = corner.surfacePoint;
      point.x = contact?.x ?? mount.x;
      point.y = this.finite(contact?.height, this.chassis.groundHeight);
      point.z = contact?.z ?? mount.z;
      const alongNormal = -(axis.x * normal.x + axis.y * normal.y + axis.z * normal.z);
      const distance = (mount.x - point.x) * normal.x + (mount.y - point.y) * normal.y +
        (mount.z - point.z) * normal.z;
      const radial = this.config.tires.verticalCompliance;
      if (corner.unsprungMass > 0 && radial) {
        corner.suspensionLength = clamp(corner.unsprungPosition, corner.minSuspensionLength, corner.maxSuspensionLength);
        corner.compression = restLength - corner.suspensionLength;
        const raw = this.config.wheelRadius + this.staticLoad(id) / radial.stiffness - distance + alongNormal * corner.suspensionLength;
        corner.tyreCompression = contact?.supportValid !== false && alongNormal > .1 ? clamp(raw, 0, radial.maximumCompression) : 0;
        corner.effectiveRadius = this.config.wheelRadius + this.staticLoad(id) / radial.stiffness - corner.tyreCompression;
        corner.requiredLength = alongNormal > .1 ? (distance - corner.effectiveRadius) / alongNormal : Infinity;
        corner.surfaceHeight = point.y;
        corner.grounded = contact?.supportValid !== false && alongNormal > .1 && raw > 0 && corner.tyreNormalForce > 0;
        const center = corner.wheelCenterWorld;
        center.x = mount.x + axis.x * corner.suspensionLength;
        center.y = mount.y + axis.y * corner.suspensionLength;
        center.z = mount.z + axis.z * corner.suspensionLength;
        // Only finite tyre closure at a fully bottomed strut is a body/road stop.
        corner.penetration = contact?.supportValid !== false && corner.suspensionLength <= corner.minSuspensionLength + 1e-6
          ? Math.max(0, raw - radial.maximumCompression) : 0;
        if (!corner.grounded) corner.normalLoad = corner.tyreNormalForce = 0;
        this.groundedWheels[id] = corner.grounded;
        if (corner.grounded) groundedCount++;
        supportForce += corner.supportForce;
        continue;
      }
      corner.effectiveRadius = this.config.wheelRadius + (radial ? this.staticLoad(id) / radial.stiffness - corner.tyreCompression : 0);
      const requiredLength = contact === undefined ? corner.restSuspensionLength
        : alongNormal > 1e-4 ? (distance - corner.effectiveRadius) / alongNormal : Infinity;
      corner.suspensionLength = contact?.supportValid === false ? corner.maxSuspensionLength
        : clamp(requiredLength, corner.minSuspensionLength, corner.maxSuspensionLength);
      corner.requiredLength = requiredLength;
      corner.compression = restLength - corner.suspensionLength;
      corner.surfaceHeight = point.y;
      corner.grounded = contact?.supportValid !== false && requiredLength <= corner.maxSuspensionLength + 1e-6;
      const center = corner.wheelCenterWorld;
      center.x = mount.x + axis.x * corner.suspensionLength;
      center.y = mount.y + axis.y * corner.suspensionLength;
      center.z = mount.z + axis.z * corner.suspensionLength;
      corner.penetration = contact !== undefined && corner.grounded &&
        requiredLength < corner.minSuspensionLength
        ? Math.max(0, corner.effectiveRadius - ((center.x - point.x) * normal.x +
          (center.y - point.y) * normal.y + (center.z - point.z) * normal.z)) : 0;
      this.groundedWheels[id] = corner.grounded;
      if (corner.grounded) groundedCount++;
      else { corner.supportForce = 0; corner.normalLoad = 0; corner.contactForce = 0; }
      supportForce += corner.supportForce;
    }
    this.verticalFrame.groundedWheels = groundedCount;
    this.verticalFrame.supportForce = supportForce;
    return this.verticalFrame;
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
    const groundHeight = mean(active);
    // Compare matched wheel tracks/axles. With three contacts, comparing a
    // single front wheel to the rear mean aliases crossfall into pitch (and
    // longitudinal grade into roll), rotating mounts into the bump stops.
    let forwardSum = 0, forwardPairs = 0, rightSum = 0, rightPairs = 0;
    if (active.includes('frontLeft') && active.includes('rearLeft')) {
      forwardSum += (heights.frontLeft - heights.rearLeft) / Math.max(.5, this.config.wheelBase);
      forwardPairs++;
    }
    if (active.includes('frontRight') && active.includes('rearRight')) {
      forwardSum += (heights.frontRight - heights.rearRight) / Math.max(.5, this.config.wheelBase);
      forwardPairs++;
    }
    if (active.includes('frontLeft') && active.includes('frontRight')) {
      rightSum += (heights.frontRight - heights.frontLeft) / Math.max(.5, this.config.frontTrackWidth);
      rightPairs++;
    }
    if (active.includes('rearLeft') && active.includes('rearRight')) {
      rightSum += (heights.rearRight - heights.rearLeft) / Math.max(.5, this.config.rearTrackWidth);
      rightPairs++;
    }
    const forwardSlope = forwardPairs > 0 ? forwardSum / forwardPairs : previousForwardSlope;
    const rightSlope = rightPairs > 0 ? rightSum / rightPairs : previousRightSlope;
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
      restCompression: this.sprungStaticLoad(id) / this.springRate(id),
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
    return this.geometryMass * this.config.gravity * (id.startsWith('front') ? frontShare : 1 - frontShare) * 0.5;
  }

  private unsprungMass(id: WheelId): number {
    const masses = this.config.suspension.unsprungMass;
    return masses && this.config.tires.verticalCompliance ? (id.startsWith('front') ? masses.front : masses.rear) : 0;
  }

  private sprungStaticLoad(id: WheelId): number {
    return this.staticLoad(id) - this.unsprungMass(id) * this.config.gravity;
  }

  /** Zero travel relative to loaded rest geometry gives the authored static alignment. */
  private kinematicAngle(id: WheelId, toe: boolean): number {
    const axle = id.startsWith('front') ? this.config.suspension.kinematics?.front : this.config.suspension.kinematics?.rear;
    if (!axle) return 0;
    const delta = this.corners[id].compression - this.sprungStaticLoad(id) / this.springRate(id);
    return toe ? axle.staticToe + delta * axle.bumpToeGainPerMeter : axle.staticCamber + delta * axle.camberGainPerMeter;
  }

  private travelLimits(id: WheelId) {
    const restCompression = this.sprungStaticLoad(id) / this.springRate(id);
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
    const wheels = this.verticalFrame.wheels;
    const front = wheels.frontLeft.grounded && wheels.frontRight.grounded ? (wheels.frontLeft.compression - wheels.frontRight.compression) *
      Math.max(0, this.config.suspension.antiRollStiffnessFront) : 0;
    const rear = wheels.rearLeft.grounded && wheels.rearRight.grounded ? (wheels.rearLeft.compression - wheels.rearRight.compression) *
      Math.max(0, this.config.suspension.antiRollStiffnessRear) : 0;
    return { frontLeft: front, frontRight: -front, rearLeft: rear, rearRight: -rear };
  }

  private springRate(id: WheelId): number {
    return Math.max(1_000, id.startsWith('front') ? this.config.suspension.springRateFront : this.config.suspension.springRateRear);
  }

  private finite(value: number | undefined, fallback = 0): number {
    return value !== undefined && Number.isFinite(value) ? value : fallback;
  }
}
