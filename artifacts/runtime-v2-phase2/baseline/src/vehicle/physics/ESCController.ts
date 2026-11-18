import type { VehicleChassisConfig } from '../config';
import { WHEEL_IDS } from './WheelContact';
import type { WheelPhysicsStateSet } from './WheelPhysicsState';
import { clamp, damp } from './math';
import { VehicleStateEstimator, type VehicleControlState } from '../control/VehicleStateEstimator';
import { BaseControlCalibration, type ControlCalibration } from '../control/BaseControlCalibration';
import { HardSafetyEnvelope } from '../control/VehicleControlCalibration';

/** Lightweight yaw/slip observer which only requests hydraulic wheel torque. */
export class ESCController {
  public readonly brakeTorques = [0, 0, 0, 0];
  public expectedYawRate = 0;
  public yawMomentRequest = 0;
  public torqueFactor = 1;
  public mode: 'inactive' | 'oversteer' | 'understeer' = 'inactive';
  private selectedWheel = -1;
  private confirmation = 0;
  private candidateWheel = -1;
  private legacyEstimator?: VehicleStateEstimator;
  public constructor(private readonly config: VehicleChassisConfig, private calibration: ControlCalibration['esc'] = BaseControlCalibration.esc) {}
  public setCalibration(calibration: ControlCalibration['esc']): void { this.calibration = calibration; }
  public get active(): boolean {
    return this.brakeTorques[0]! > 5 || this.brakeTorques[1]! > 5 ||
      this.brakeTorques[2]! > 5 || this.brakeTorques[3]! > 5;
  }
  public reset(): void {
    this.brakeTorques.fill(0); this.expectedYawRate = 0; this.mode = 'inactive';
    this.selectedWheel = -1; this.candidateWheel = -1; this.confirmation = 0;
    this.yawMomentRequest = 0; this.torqueFactor = 1; this.legacyEstimator?.reset();
  }
  public update(dt: number, enabled: boolean, speed: number, steering: number, yawRate: number,
    lateralVelocity: number, wheels: WheelPhysicsStateSet, longitudinalLimits: readonly number[],
    lateralLimits: readonly number[]): void {
    // Compatibility adapter for callers outside the shared runtime control loop.
    this.legacyEstimator ??= new VehicleStateEstimator(this.config);
    const state = this.legacyEstimator.update(dt, speed, lateralVelocity, 0, 0, yawRate, steering, wheels);
    this.legacyEstimator.setPhysicalCapacities(longitudinalLimits, lateralLimits);
    this.updateState(dt, enabled, state, longitudinalLimits, lateralLimits);
  }
  public updateState(dt: number, enabled: boolean, state: VehicleControlState,
    longitudinalLimits: readonly number[], lateralLimits: readonly number[]): void {
    const tune = this.calibration;
    const speed = state.longitudinalVelocity, steering = state.steeringAngle, yawRate = state.yawRate;
    const wheels = state.wheels;
    let totalLateral = 0;
    for (let i = 0; i < 4; i++) {
      const w = wheels[WHEEL_IDS[i]!];
      if (w.grounded) totalLateral += w.estimatedLateralCapacity;
    }
    const yawLimit = totalLateral / Math.max(1, this.config.mass * Math.abs(speed));
    // + steering is right, whereas + body yaw is left in the existing solver.
    const reference = clamp(-speed * Math.tan(steering) / this.config.wheelBase, -yawLimit, yawLimit);
    this.expectedYawRate = damp(this.expectedYawRate, reference, 5, dt);
    if (!enabled) { this.reset(); return; }
    let wheel = -1, target = 0;
    let requestedMoment = 0, torqueTarget = 1;
    let mode: typeof this.mode = 'inactive';
    if (speed > (tune?.minimumSpeed ?? 5) && totalLateral > 1) {
      const expected = this.expectedYawRate;
      const beta = state.estimatedSideslipAngle;
      const threshold = (tune?.yawErrorThreshold ?? .16) + Math.abs(expected) * .35;
      const hysteresis = this.selectedWheel >= 0 ? .6 : 1;
      const slipThreshold = (tune?.sideslipThreshold ?? .14) * hysteresis;
      const hardIntervention = Math.abs(beta) > HardSafetyEnvelope.maximumSideslip ||
        Math.abs(expected - yawRate) > HardSafetyEnvelope.maximumYawError;
      const over = Math.abs(yawRate) > Math.abs(expected) + threshold * hysteresis ||
        (yawRate * expected < 0 && Math.abs(yawRate) > threshold * hysteresis) ||
        (Math.abs(beta) > slipThreshold && Math.abs(yawRate) > .1) ||
        Math.abs(beta) > HardSafetyEnvelope.maximumSideslip;
      const under = Math.abs(expected) > .22 &&
        Math.abs(expected) - yawRate * Math.sign(expected) > threshold * hysteresis;
      if (over || under) {
        mode = over ? 'oversteer' : 'understeer';
        const correction = expected - yawRate - (over ? beta * 1.2 : 0);
        requestedMoment = clamp(correction * this.config.yawInertia * (hardIntervention ? 1.2 : tune.interventionGain),
          -this.config.yawInertia, this.config.yawInertia);
        torqueTarget = 1 - clamp((Math.abs(correction) - threshold) * tune.torqueReductionGain, 0,
          hardIntervention ? .65 : tune.maximumTorqueReduction);
        const first = over ? 0 : 2;
        // Evaluate the actual brake lever including front steering. Choose the
        // outside front for excess yaw, inside rear for insufficient yaw.
        const distanceFront = clamp(this.config.wheelBase * (1 - this.config.frontWeightBias), this.config.wheelBase * .1, this.config.wheelBase * .9);
        let bestAuthority = 0;
        for (let offset = 0; offset < 4; offset++) {
          const i = (first + offset) % 4;
          const w = wheels[WHEEL_IDS[i]!];
          const angle = i < 2 ? w.steeringAngle : 0;
          const position = i < 2 ? distanceFront : distanceFront - this.config.wheelBase;
          const track = i < 2 ? this.config.frontTrackWidth : this.config.rearTrackWidth;
          const x = (i % 2 === 0 ? -1 : 1) * track * .5;
          const lever = -x * Math.cos(angle) + position * Math.sin(angle);
          if (lever * correction <= 0 || Math.abs(lever) < .1) continue;
          const candidate = Math.min(this.wheelAuthority(state, i, longitudinalLimits[i]!, lateralLimits[i]!),
            Math.abs(requestedMoment) * w.rollingRadius / Math.abs(lever));
          // Prefer the conventional axle, but use a loaded alternative if that
          // wheel cannot deliver the requested moment. Never boost beyond its capacity.
          const score = candidate * Math.abs(lever) * (offset < 2 ? 1 : .75);
          if (candidate > 5 && score > bestAuthority) { bestAuthority = score; target = candidate; wheel = i; }
        }
      }
    }
    if (wheel !== this.candidateWheel) { this.candidateWheel = wheel; this.confirmation = 0; }
    this.confirmation = wheel >= 0 ? this.confirmation + dt : 0;
    // Require sustained deviation and release the old wheel before switching
    // sides/axles, so a sign change cannot alternate brake pulses each tick.
    if (wheel !== this.selectedWheel && this.active) { wheel = -1; target = 0; }
    else if (this.confirmation < tune.confirmationTime) { wheel = -1; target = 0; }
    else this.selectedWheel = wheel;
    for (let i = 0; i < 4; i++) {
      const request = i === wheel ? target : 0;
      const availableTorque = this.wheelAuthority(state, i, longitudinalLimits[i]!, lateralLimits[i]!);
      this.brakeTorques[i] = Math.min(availableTorque,
        damp(this.brakeTorques[i]!, request, request > this.brakeTorques[i]! ? (tune?.response ?? 6) : 10, dt));
      if (this.brakeTorques[i]! < .5 && request === 0) this.brakeTorques[i] = 0;
    }
    this.mode = this.active ? mode : 'inactive';
    this.yawMomentRequest = damp(this.yawMomentRequest, wheel >= 0 ? requestedMoment : 0, 6, dt);
    this.torqueFactor = damp(this.torqueFactor, this.active && wheel >= 0 ? torqueTarget : 1, torqueTarget < this.torqueFactor ? 6 : 3, dt);
    if (!this.active && wheel < 0) this.selectedWheel = -1;
  }
  private wheelAuthority(state: VehicleControlState, index: number, longitudinal: number, lateral: number): number {
    const w = state.wheels[WHEEL_IDS[index]!];
    if (!w.roadContactReady || !w.grounded) return 0;
    const usage = Math.min(.98, Math.abs(w.lateralForce) / Math.max(1, lateral));
    // Real attitude/rates reduce actuator confidence during rapid body motion;
    // Fz remains the only axle/wheel load source, with no inferred load transfer.
    const attitude = clamp(Math.abs(Math.cos(state.pitch) * Math.cos(state.roll)), .4, 1) /
      (1 + .1 * Math.abs(state.pitchRate) + .1 * Math.abs(state.rollRate));
    const available = Math.min(Math.max(0, longitudinal), w.estimatedLongitudinalCapacity) * Math.sqrt(1 - usage * usage);
    const hardware = (index < 2 ? this.config.brakes.maxBrakeTorqueFront : this.config.brakes.maxBrakeTorqueRear) * .5;
    return Math.min(hardware, available * w.rollingRadius * this.calibration.maximumBrakeGripFraction * attitude);
  }
}
