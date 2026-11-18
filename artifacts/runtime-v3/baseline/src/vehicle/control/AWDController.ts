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
      let frontSlip = 0, rearSlip = 0, frontCapacity = 0, rearCapacity = 0;
      for (let i = 0; i < 4; i++) {
        const w = state.wheels[WHEEL_IDS[i]!];
        const direction = Math.sign(w.longitudinalVelocity || w.linearSurfaceSpeed);
        const capacity = w.grounded ? w.estimatedLongitudinalCapacity : 0;
        const excess = w.roadContactReady && w.driveSlipDuration >= .04
          ? Math.max(0, w.estimatedLongitudinalSlip * direction - w.usefulSlipRatio) : 0;
        // A single hopping wheel is not evidence that the whole axle has lost grip.
        if (i < 2) { frontSlip += excess * capacity; frontCapacity += capacity; }
        else { rearSlip += excess * capacity; rearCapacity += capacity; }
      }
      frontSlip /= Math.max(1, frontCapacity); rearSlip /= Math.max(1, rearCapacity);
      const totalCapacity = frontCapacity + rearCapacity;
      if (totalCapacity > 1) {
        const capacityShare = rearCapacity / totalCapacity;
        target += (capacityShare - target) * .5 * clamp(throttle + .2, 0, 1);
        if (frontCapacity < 1) target = tune.maximumRearRatio;
        else if (rearCapacity < 1) target = tune.minimumRearRatio;
      }
      const delta = frontSlip - rearSlip;
      if (Math.abs(delta) > tune.slipHysteresis) this.slipDirection = Math.sign(delta);
      else if (Math.abs(delta) < tune.slipHysteresis * .5) this.slipDirection = 0;
      const attitudeConfidence = 1 / (1 + .25 * Math.abs(state.pitchRate) + .1 * Math.abs(state.pitch));
      if (this.slipDirection * delta > 0) target += clamp(delta, -.6, .6) * tune.slipGain * attitudeConfidence;
      target += clamp(rearAuthority - frontAuthority, -.6, .6) * .15;
      const turnDemand = clamp(state.speed / 30, 0, 1) * clamp(Math.abs(state.steeringAngle) * state.speed / 3, 0, 1);
      target += tune.corneringBias * turnDemand * clamp(Math.abs(state.lateralAcceleration) / 4, .15, 1);
      // Actual measured Fz above already contains pitch/load transfer. Do not add
      // a second ax-based rear-load estimate on top of the physical reaction.
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
