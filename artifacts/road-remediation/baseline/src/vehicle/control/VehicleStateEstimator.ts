import type { VehicleChassisConfig } from '../config';
import { WHEEL_IDS, type WheelContactSet, type WheelId } from '../physics/WheelContact';
import type { WheelPhysicsStateSet, WheelGeometryState } from '../physics/WheelPhysicsState';
import { longitudinalSlip } from '../physics/LongitudinalSlip';
import { contactUsefulSlip } from '../physics/SurfaceInteraction';
import { clamp, damp } from '../physics/math';

export interface VehicleControlWheelState {
  rawNormalLoad: number;
  estimatedControlNormalLoad: number;
  rawLongitudinalSlip: number;
  estimatedLongitudinalSlip: number;
  wheelAngularVelocity: number;
  wheelLinearSurfaceSpeed: number;
  /** Physical rolling/torque radius. effectiveRadius below is contact geometry only. */
  rollingRadius: number;
  effectiveRadius: number;
  unsprungPosition: number;
  unsprungVelocity: number;
  unsprungAcceleration: number;
  tyreCompression: number;
  tyreCompressionVelocity: number;
  groundedDuration: number;
  driveSlipDuration: number;
  brakeSlipDuration: number;
  roadContactReady: boolean;
  wheelHop: boolean;
  contactState: 'grounded' | 'unloaded' | 'airborne' | 'support-rejected' | 'landing';
  rawLongitudinalCapacity: number;
  estimatedLongitudinalCapacity: number;
  rawLateralCapacity: number;
  estimatedLateralCapacity: number;
  /** Conservative force available now; zero on rejected/airborne contacts. */
  safeLongitudinalCapacity: number;
  angularVelocity: number;
  linearSurfaceSpeed: number;
  longitudinalSlipRatio: number;
  longitudinalVelocity: number;
  normalLoad: number;
  grounded: boolean;
  driven: boolean;
  steeringAngle: number;
  lateralForce: number;
  usefulSlipRatio: number;
}
export interface VehicleControlState {
  pitch: number;
  pitchRate: number;
  roll: number;
  rollRate: number;
  chassisY: number;
  verticalVelocity: number;
  verticalAcceleration: number;
  /** Allows learning to exclude contact transients without changing stored profiles. */
  contactTransient: boolean;
  longitudinalVelocity: number;
  lateralVelocity: number;
  speed: number;
  longitudinalAcceleration: number;
  lateralAcceleration: number;
  yawRate: number;
  yawAcceleration: number;
  estimatedSideslipAngle: number;
  steeringAngle: number;
  wheels: Record<WheelId, VehicleControlWheelState>;
}
export interface ControlChassisObservation {
  pitch: number; roll: number; pitchAngularVelocity?: number; rollAngularVelocity?: number;
  chassisY?: number; verticalVelocity?: number; verticalAcceleration?: number;
  y?: number; velocity?: number; acceleration?: number; dynamicAttitude?: boolean;
}
type GeometryObservations = Readonly<Record<WheelId, WheelGeometryState & { supportValid?: boolean }>>;
const finite = (v: number): number => Number.isFinite(v) ? v : 0;
const wheelState = (): VehicleControlWheelState => ({ angularVelocity: 0, linearSurfaceSpeed: 0,
  rawNormalLoad: 0, estimatedControlNormalLoad: 0, rawLongitudinalSlip: 0, estimatedLongitudinalSlip: 0,
  wheelAngularVelocity: 0, wheelLinearSurfaceSpeed: 0, rollingRadius: .315, effectiveRadius: .315,
  unsprungPosition: 0, unsprungVelocity: 0, unsprungAcceleration: 0, tyreCompression: 0, tyreCompressionVelocity: 0,
  groundedDuration: 0, driveSlipDuration: 0, brakeSlipDuration: 0, roadContactReady: false, wheelHop: false,
  contactState: 'airborne', rawLongitudinalCapacity: 0, estimatedLongitudinalCapacity: 0,
  rawLateralCapacity: 0, estimatedLateralCapacity: 0, safeLongitudinalCapacity: 0,
  longitudinalSlipRatio: 0, longitudinalVelocity: 0, normalLoad: 0, grounded: false,
  driven: false, steeringAngle: 0, lateralForce: 0, usefulSlipRatio: .1 });

/** Borrows physical observations; no second wheel-speed or contact simulation.
 * One persistent sample per fixed step; contact/load refresh never differentiates twice. */
export class VehicleStateEstimator {
  public readonly state: VehicleControlState = {
    pitch: 0, pitchRate: 0, roll: 0, rollRate: 0, chassisY: 0, verticalVelocity: 0, verticalAcceleration: 0,
    contactTransient: true,
    longitudinalVelocity: 0, lateralVelocity: 0, speed: 0,
    longitudinalAcceleration: 0, lateralAcceleration: 0, yawRate: 0, yawAcceleration: 0,
    estimatedSideslipAngle: 0, steeringAngle: 0,
    wheels: { frontLeft: wheelState(), frontRight: wheelState(), rearLeft: wheelState(), rearRight: wheelState() },
  };
  private initialized = false;
  private readonly sampled = [false, false, false, false];
  public constructor(private readonly config: VehicleChassisConfig) {}
  public reset(): void {
    this.initialized = false; this.sampled.fill(false); this.state.yawAcceleration = 0;
    for (const id of WHEEL_IDS) {
      const w = this.state.wheels[id];
      w.groundedDuration = w.driveSlipDuration = w.brakeSlipDuration = 0;
      w.roadContactReady = false;
    }
  }
  public update(dt: number, longitudinal: number, lateral: number, acceleration: number,
    lateralAcceleration: number, yawRate: number, steeringAngle: number,
    wheels: WheelPhysicsStateSet, contacts?: WheelContactSet, chassis?: ControlChassisObservation): VehicleControlState {
    const s = this.state, yaw = finite(yawRate), h = clamp(finite(dt), 0, .1);
    s.yawAcceleration = this.initialized && h > 0
      ? damp(s.yawAcceleration, clamp((yaw - s.yawRate) / h, -100, 100), 10, h) : 0;
    this.initialized = true;
    s.longitudinalVelocity = finite(longitudinal); s.lateralVelocity = finite(lateral);
    s.speed = Math.hypot(s.longitudinalVelocity, s.lateralVelocity);
    s.longitudinalAcceleration = finite(acceleration); s.lateralAcceleration = finite(lateralAcceleration);
    s.yawRate = yaw; s.steeringAngle = finite(steeringAngle);
    // No pi-radian sideslip discontinuity when reversing or parking.
    s.estimatedSideslipAngle = Math.atan(s.lateralVelocity / Math.max(2, Math.abs(s.longitudinalVelocity))) *
      clamp(s.speed / 2, 0, 1);
    if (chassis) {
      // Only dynamic attitude, never terrain/reference-plane or visual deflection.
      s.pitch = chassis.dynamicAttitude === false ? 0 : finite(chassis.pitch);
      s.roll = chassis.dynamicAttitude === false ? 0 : finite(chassis.roll);
      s.pitchRate = finite(chassis.pitchAngularVelocity ?? 0); s.rollRate = finite(chassis.rollAngularVelocity ?? 0);
      s.chassisY = finite(chassis.chassisY ?? chassis.y ?? 0);
      s.verticalVelocity = finite(chassis.verticalVelocity ?? chassis.velocity ?? 0);
      s.verticalAcceleration = finite(chassis.verticalAcceleration ?? chassis.acceleration ?? 0);
    }
    this.refreshWheels(wheels, contacts, undefined, undefined, undefined, h);
    return s;
  }
  public refreshWheels(wheels: WheelPhysicsStateSet, contacts?: WheelContactSet,
    loads?: readonly number[], grounded?: readonly boolean[], geometry?: GeometryObservations, dt = 0): void {
    const h = clamp(finite(dt), 0, .1);
    this.state.contactTransient = false;
    for (let i = 0; i < 4; i++) {
      const id = WHEEL_IDS[i]!, source = wheels[id], out = this.state.wheels[id];
      const g = geometry?.[id] ?? source.geometry;
      const previousLoad = out.rawNormalLoad, previouslyGrounded = out.grounded;
      out.angularVelocity = finite(source.angularVelocity);
      out.wheelAngularVelocity = out.angularVelocity;
      // WheelRotationSystem still uses the configured rolling radius for Fx/slip.
      // Radial effectiveRadius is a different geometric datum; do not mix them.
      out.rollingRadius = this.config.wheelRadius;
      out.effectiveRadius = Number.isFinite(g?.effectiveRadius) && g!.effectiveRadius! > 0 ? g!.effectiveRadius! : out.rollingRadius;
      out.linearSurfaceSpeed = out.angularVelocity * this.config.wheelRadius;
      out.wheelLinearSurfaceSpeed = out.linearSurfaceSpeed;
      out.longitudinalVelocity = finite(source.longitudinalSpeed);
      // The solver's regularized slip is authoritative. Fallback uses the same formula.
      out.rawLongitudinalSlip = Number.isFinite(source.slipRatio) ? source.slipRatio
        : longitudinalSlip(out.linearSurfaceSpeed, out.longitudinalVelocity);
      out.rawNormalLoad = finite(loads?.[i] ?? source.normalLoad);
      out.normalLoad = out.rawNormalLoad; // Compatibility diagnostic alias, not a filtered physics write.
      const rejected = contacts?.[id].supportValid === false || geometry?.[id].supportValid === false;
      const physicalGrounded = grounded?.[i] ?? source.grounded ?? out.rawNormalLoad > 1;
      out.grounded = !rejected && physicalGrounded && out.rawNormalLoad > 1;
      out.unsprungPosition = finite(g?.unsprungPosition ?? 0); out.unsprungVelocity = finite(g?.unsprungVelocity ?? 0);
      out.unsprungAcceleration = finite(g?.unsprungAcceleration ?? 0);
      out.tyreCompression = finite(g?.tyreCompression ?? 0); out.tyreCompressionVelocity = finite(g?.tyreCompressionVelocity ?? 0);
      out.driven = this.config.drivetrainType === 'AWD' || (i < 2) === (this.config.drivetrainType === 'FWD');
      out.steeringAngle = finite(source.steeringAngle); out.lateralForce = finite(source.lateralForce);
      out.usefulSlipRatio = Math.max(.015, finite(contactUsefulSlip(this.config.tires.peakSlipRatio,
        contacts?.[id], source.tyre?.longitudinalStiffnessFactor)));
      if (!out.grounded) {
        out.estimatedControlNormalLoad = out.estimatedLongitudinalSlip = 0;
        out.groundedDuration = out.driveSlipDuration = out.brakeSlipDuration = 0;
      } else if (h > 0 || !this.sampled[i]) {
        out.groundedDuration = previouslyGrounded && this.sampled[i] ? out.groundedDuration + h : h;
        out.estimatedControlNormalLoad = !this.sampled[i] ? Math.max(0, out.rawNormalLoad)
          : damp(out.estimatedControlNormalLoad, Math.max(0, out.rawNormalLoad), 1 / .03, h);
        out.estimatedLongitudinalSlip = damp(previouslyGrounded ? out.estimatedLongitudinalSlip : 0,
          clamp(out.rawLongitudinalSlip, -2, 2), 1 / .018, h);
      }
      if (h > 0) out.wheelHop = out.grounded && (Math.abs(out.unsprungVelocity) > .35 ||
        Math.abs(out.unsprungAcceleration) > 30 || Math.abs(out.tyreCompressionVelocity) > .25 ||
        this.sampled[i] === true && Math.abs(out.rawNormalLoad - previousLoad) > Math.max(150, previousLoad * .45));
      const minimumLoad = Math.max(30, this.config.mass * this.config.gravity * .25 * .04);
      out.roadContactReady = out.grounded && out.groundedDuration + 1e-9 >= .025 &&
        Math.min(out.rawNormalLoad, out.estimatedControlNormalLoad) > minimumLoad;
      out.contactState = rejected ? 'support-rejected' : !physicalGrounded ? 'airborne'
        : !out.grounded || out.rawNormalLoad < minimumLoad ? 'unloaded' : out.groundedDuration < .025 ? 'landing' : 'grounded';
      out.longitudinalSlipRatio = out.estimatedLongitudinalSlip;
      if (h > 0) {
        const direction = Math.sign(out.longitudinalVelocity || out.linearSurfaceSpeed);
        const raw = out.rawLongitudinalSlip * direction, estimated = out.estimatedLongitudinalSlip * direction;
        // Both raw and estimated evidence must persist: a single spike cannot
        // be prolonged into intervention by the filter's own decay tail.
        out.driveSlipDuration = out.roadContactReady && raw > out.usefulSlipRatio && estimated > out.usefulSlipRatio
          ? out.driveSlipDuration + h : 0;
        out.brakeSlipDuration = out.roadContactReady && -raw > out.usefulSlipRatio && -estimated > out.usefulSlipRatio
          ? out.brakeSlipDuration + h : 0;
      }
      this.sampled[i] = true;
      const mu = Math.max(0, finite(source.estimatedFriction ?? this.config.tires.longitudinalGrip));
      out.rawLongitudinalCapacity = out.grounded ? Math.max(0, out.rawNormalLoad) * mu : 0;
      out.estimatedLongitudinalCapacity = out.grounded ? out.estimatedControlNormalLoad * mu : 0;
      const lateralMu = mu * this.config.tires.lateralGrip / Math.max(.01, this.config.tires.longitudinalGrip);
      out.rawLateralCapacity = out.grounded ? Math.max(0, out.rawNormalLoad) * lateralMu : 0;
      out.estimatedLateralCapacity = out.grounded ? out.estimatedControlNormalLoad * lateralMu : 0;
      this.updateSafeCapacity(out);
      this.state.contactTransient ||= !out.roadContactReady || out.wheelHop;
    }
  }
  /** Borrow the tyre solver's actual surface/load-sensitive limits; no new grip model. */
  public setPhysicalCapacities(longitudinal: readonly number[], lateral?: readonly number[]): void {
    for (let i = 0; i < 4; i++) {
      const w = this.state.wheels[WHEEL_IDS[i]!];
      w.rawLongitudinalCapacity = w.grounded ? Math.max(0, finite(longitudinal[i] ?? 0)) : 0;
      w.rawLateralCapacity = w.grounded ? Math.max(0, finite(lateral?.[i] ?? w.rawLateralCapacity)) : 0;
      const ratio = w.rawNormalLoad > 1 ? w.estimatedControlNormalLoad / w.rawNormalLoad : 0;
      w.estimatedLongitudinalCapacity = w.rawLongitudinalCapacity * ratio;
      w.estimatedLateralCapacity = w.rawLateralCapacity * ratio;
      this.updateSafeCapacity(w);
    }
  }
  private updateSafeCapacity(w: VehicleControlWheelState): void {
    const usage = Math.min(1, Math.abs(w.lateralForce) / Math.max(1, w.rawLateralCapacity));
    w.safeLongitudinalCapacity = w.grounded ? Math.min(w.rawLongitudinalCapacity, w.estimatedLongitudinalCapacity) *
      Math.sqrt(Math.max(0, 1 - usage * usage)) : 0;
  }
}
