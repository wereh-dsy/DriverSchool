import type { VehicleChassisConfig } from '../config';
import { WHEEL_IDS, type WheelContactSet, type WheelId } from '../physics/WheelContact';
import type { WheelPhysicsStateSet } from '../physics/WheelPhysicsState';
import { longitudinalSlip } from '../physics/LongitudinalSlip';
import { contactUsefulSlip } from '../physics/SurfaceInteraction';
import { clamp, damp } from '../physics/math';

export interface VehicleControlWheelState {
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
const finite = (v: number): number => Number.isFinite(v) ? v : 0;
const wheelState = (): VehicleControlWheelState => ({ angularVelocity: 0, linearSurfaceSpeed: 0,
  longitudinalSlipRatio: 0, longitudinalVelocity: 0, normalLoad: 0, grounded: false,
  driven: false, steeringAngle: 0, lateralForce: 0, usefulSlipRatio: .1 });

/** Borrows physical observations; no second wheel-speed or contact simulation.
 * One persistent sample per fixed step; contact/load refresh never differentiates twice. */
export class VehicleStateEstimator {
  public readonly state: VehicleControlState = {
    longitudinalVelocity: 0, lateralVelocity: 0, speed: 0,
    longitudinalAcceleration: 0, lateralAcceleration: 0, yawRate: 0, yawAcceleration: 0,
    estimatedSideslipAngle: 0, steeringAngle: 0,
    wheels: { frontLeft: wheelState(), frontRight: wheelState(), rearLeft: wheelState(), rearRight: wheelState() },
  };
  private initialized = false;
  public constructor(private readonly config: VehicleChassisConfig) {}
  public reset(): void { this.initialized = false; this.state.yawAcceleration = 0; }
  public update(dt: number, longitudinal: number, lateral: number, acceleration: number,
    lateralAcceleration: number, yawRate: number, steeringAngle: number,
    wheels: WheelPhysicsStateSet, contacts?: WheelContactSet): VehicleControlState {
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
    this.refreshWheels(wheels, contacts);
    return s;
  }
  public refreshWheels(wheels: WheelPhysicsStateSet, contacts?: WheelContactSet,
    loads?: readonly number[], grounded?: readonly boolean[]): void {
    for (let i = 0; i < 4; i++) {
      const id = WHEEL_IDS[i]!, source = wheels[id], out = this.state.wheels[id];
      out.angularVelocity = finite(source.angularVelocity);
      out.linearSurfaceSpeed = out.angularVelocity * this.config.wheelRadius;
      out.longitudinalVelocity = finite(source.longitudinalSpeed);
      // The solver's regularized slip is authoritative. Fallback uses the same formula.
      out.longitudinalSlipRatio = Number.isFinite(source.slipRatio) ? clamp(source.slipRatio, -2, 2)
        : longitudinalSlip(out.linearSurfaceSpeed, out.longitudinalVelocity);
      out.normalLoad = Math.max(0, finite(loads?.[i] ?? source.normalLoad));
      out.grounded = (grounded?.[i] ?? source.grounded ?? true) && out.normalLoad > 1;
      out.driven = this.config.drivetrainType === 'AWD' || (i < 2) === (this.config.drivetrainType === 'FWD');
      out.steeringAngle = finite(source.steeringAngle); out.lateralForce = finite(source.lateralForce);
      out.usefulSlipRatio = Math.max(.015, finite(contactUsefulSlip(this.config.tires.peakSlipRatio,
        contacts?.[id], source.tyre?.longitudinalStiffnessFactor)));
    }
  }
}
