import type { VehicleChassisConfig } from '../config';
import { WHEEL_IDS } from '../physics/WheelContact';
import { clamp, damp } from '../physics/math';
import type { ControlCalibration } from './BaseControlCalibration';
import type { VehicleControlState } from './VehicleStateEstimator';

/** Shared axle allocator. ICE carriers and independent EV units borrow the same
 * ratios; it owns neither brakes nor motor/pack capacity. No identity branches. */
export class AWDController {
  public rearTorqueSplit: number;
  public carrierAngularVelocity = 0;
  /** Reserved actuator interface only; advanced vectoring is not implemented. */
  public readonly additionalYawTorqueRequest = 0;
  private slipDirection = 0;
  public get frontAxleTorqueRatio(): number { return 1 - this.rearTorqueSplit; }
  public get rearAxleTorqueRatio(): number { return this.rearTorqueSplit; }
  public constructor(private readonly config: VehicleChassisConfig, private calibration: ControlCalibration['drivetrain']) {
    this.rearTorqueSplit = calibration.nominalRearRatio;
  }
  public setCalibration(calibration: ControlCalibration['drivetrain']): void {
    this.calibration = calibration;
    this.rearTorqueSplit = clamp(this.rearTorqueSplit, calibration.minimumRearRatio, calibration.maximumRearRatio);
  }
  public reset(): void { this.rearTorqueSplit = this.calibration.nominalRearRatio; this.carrierAngularVelocity = 0; this.slipDirection = 0; }
  public update(dt: number, state: VehicleControlState, throttle: number, driving: boolean,
    frontAuthority = 1, rearAuthority = 1, stabilityMode: 'inactive' | 'oversteer' | 'understeer' = 'inactive'): void {
    const h = Number.isFinite(dt) ? clamp(dt, 0, .1) : 0, tune = this.calibration;
    let target = tune.nominalRearRatio;
    if (driving && throttle > .03) {
      const demand = clamp((throttle - .15) / .75 + Math.max(0, state.longitudinalAcceleration) / 12, 0, 1);
      target += (tune.accelerationRearRatio - target) * demand;
      let frontSlip = 0, rearSlip = 0;
      for (let i = 0; i < 4; i++) {
        const w = state.wheels[WHEEL_IDS[i]!];
        const direction = Math.sign(w.longitudinalVelocity || w.linearSurfaceSpeed);
        const excess = Math.max(0, w.longitudinalSlipRatio * direction - w.usefulSlipRatio) +
          (!w.grounded && Math.abs(w.linearSurfaceSpeed) > 2 ? .2 : 0);
        if (i < 2) frontSlip = Math.max(frontSlip, excess); else rearSlip = Math.max(rearSlip, excess);
      }
      const delta = frontSlip - rearSlip;
      if (Math.abs(delta) > tune.slipHysteresis) this.slipDirection = Math.sign(delta);
      else if (Math.abs(delta) < tune.slipHysteresis * .5) this.slipDirection = 0;
      if (this.slipDirection * delta > 0) target += clamp(delta, -.6, .6) * tune.slipGain;
      target += clamp(rearAuthority - frontAuthority, -.6, .6) * .15;
      const turnDemand = clamp(state.speed / 30, 0, 1) * clamp(Math.abs(state.steeringAngle) * state.speed / 3, 0, 1);
      target += tune.corneringBias * turnDemand * clamp(Math.abs(state.lateralAcceleration) / 4, .15, 1);
      // Forward acceleration gives the loaded rear axle a small generic preference.
      target += clamp(state.longitudinalAcceleration / 5, -.5, 1) * .02;
      const kinematicYaw = -state.longitudinalVelocity * Math.tan(state.steeringAngle) / this.config.wheelBase;
      const yawExcess = Math.abs(state.yawRate) - Math.abs(kinematicYaw);
      const severity = clamp((Math.abs(yawExcess) - .15) / .6, 0, 1) * clamp(state.speed / 25, 0, 1);
      // Modest axle support only. ESC retains the actual corrective yaw/brake authority.
      const tendency = stabilityMode === 'oversteer' ? -1 : stabilityMode === 'understeer' ? 1 : -Math.sign(yawExcess);
      target += tendency * tune.stabilityGain * severity;
    } else this.slipDirection = 0;
    target = clamp(target, tune.minimumRearRatio, tune.maximumRearRatio);
    const filtered = damp(this.rearTorqueSplit, target, tune.response, h);
    this.rearTorqueSplit = clamp(this.rearTorqueSplit + clamp(filtered - this.rearTorqueSplit,
      -tune.rateLimit * h, tune.rateLimit * h), tune.minimumRearRatio, tune.maximumRearRatio);
  }
  public updateSpeeds(front: number, rear: number): number {
    this.carrierAngularVelocity = front * this.frontAxleTorqueRatio + rear * this.rearTorqueSplit;
    return this.carrierAngularVelocity;
  }
  public getSnapshot() {
    return { mode: this.config.awd?.mode ?? 'full-time', frontTorqueSplit: this.frontAxleTorqueRatio,
      rearTorqueSplit: this.rearTorqueSplit, carrierAngularVelocity: this.carrierAngularVelocity };
  }
}
