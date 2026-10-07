import type { VehiclePhysicsConfig } from '../config';
import { WHEEL_IDS } from './WheelContact';
import type { WheelPhysicsStateSet } from './WheelPhysicsState';
import { clamp, damp } from './math';

/** Lightweight yaw/slip observer which only requests hydraulic wheel torque. */
export class ESCController {
  public readonly brakeTorques = [0, 0, 0, 0];
  public expectedYawRate = 0;
  public mode: 'inactive' | 'oversteer' | 'understeer' = 'inactive';
  private selectedWheel = -1;
  private confirmation = 0;
  private candidateWheel = -1;
  public constructor(private readonly config: VehiclePhysicsConfig) {}
  public get active(): boolean {
    return this.brakeTorques[0]! > 5 || this.brakeTorques[1]! > 5 ||
      this.brakeTorques[2]! > 5 || this.brakeTorques[3]! > 5;
  }
  public reset(): void {
    this.brakeTorques.fill(0); this.expectedYawRate = 0; this.mode = 'inactive';
    this.selectedWheel = -1; this.candidateWheel = -1; this.confirmation = 0;
  }
  public update(dt: number, enabled: boolean, speed: number, steering: number, yawRate: number,
    lateralVelocity: number, wheels: WheelPhysicsStateSet, longitudinalLimits: readonly number[],
    lateralLimits: readonly number[]): void {
    const tune = this.config.driverAids.esc;
    let totalLateral = 0;
    for (let i = 0; i < 4; i++) totalLateral += lateralLimits[i]!;
    const yawLimit = totalLateral / Math.max(1, this.config.mass * Math.abs(speed));
    // + steering is right, whereas + body yaw is left in the existing solver.
    const reference = clamp(-speed * Math.tan(steering) / this.config.wheelBase, -yawLimit, yawLimit);
    this.expectedYawRate = damp(this.expectedYawRate, reference, 5, dt);
    if (!enabled) { this.reset(); return; }
    let wheel = -1, target = 0;
    let mode: typeof this.mode = 'inactive';
    if (speed > (tune?.minimumSpeed ?? 5) && totalLateral > 1) {
      const expected = this.expectedYawRate;
      const beta = Math.atan2(lateralVelocity, speed);
      const threshold = (tune?.yawErrorThreshold ?? .16) + Math.abs(expected) * .35;
      const hysteresis = this.selectedWheel >= 0 ? .6 : 1;
      const slipThreshold = (tune?.sideslipThreshold ?? .14) * hysteresis;
      const over = Math.abs(yawRate) > Math.abs(expected) + threshold * hysteresis ||
        (yawRate * expected < 0 && Math.abs(yawRate) > threshold * hysteresis) ||
        (Math.abs(beta) > slipThreshold && Math.abs(yawRate) > .1);
      const under = Math.abs(expected) > .22 &&
        Math.abs(expected) - yawRate * Math.sign(expected) > threshold * hysteresis;
      if (over || under) {
        mode = over ? 'oversteer' : 'understeer';
        const correction = expected - yawRate - (over ? beta * 1.2 : 0);
        const first = over ? 0 : 2;
        // Evaluate the actual brake lever including front steering. Choose the
        // outside front for excess yaw, inside rear for insufficient yaw.
        const distanceFront = clamp(this.config.wheelBase * (1 - this.config.frontWeightBias) -
          this.config.centerOfMassLongitudinalOffset, this.config.wheelBase * .1, this.config.wheelBase * .9);
        const position = over ? distanceFront : distanceFront - this.config.wheelBase;
        const track = over ? this.config.frontTrackWidth : this.config.rearTrackWidth;
        for (let i = first; i < first + 2; i++) {
          const angle = over ? wheels[WHEEL_IDS[i]!].steeringAngle : 0;
          const x = (i % 2 === 0 ? -1 : 1) * track * .5;
          const lever = -x * Math.cos(angle) + position * Math.sin(angle);
          if (lever * correction <= 0 || Math.abs(lever) < .1) continue;
          const w = wheels[WHEEL_IDS[i]!];
          const lateralUsage = Math.min(.98, Math.abs(w.lateralForce) / Math.max(1, lateralLimits[i]!));
          const available = longitudinalLimits[i]! * Math.sqrt(1 - lateralUsage * lateralUsage);
          const hardware = (over ? this.config.brakes.maxBrakeTorqueFront : this.config.brakes.maxBrakeTorqueRear) * .5;
          const gripFraction = clamp(tune?.maximumBrakeGripFraction ?? .45, 0, .8);
          target = Math.min(hardware, available * this.config.wheelRadius * gripFraction,
            Math.abs(correction) * this.config.yawInertia * .9 * this.config.wheelRadius / Math.abs(lever));
          wheel = target > 5 ? i : -1;
          break;
        }
      }
    }
    if (wheel !== this.candidateWheel) { this.candidateWheel = wheel; this.confirmation = 0; }
    this.confirmation = wheel >= 0 ? this.confirmation + dt : 0;
    // Require sustained deviation and release the old wheel before switching
    // sides/axles, so a sign change cannot alternate brake pulses each tick.
    if (wheel !== this.selectedWheel && this.active) { wheel = -1; target = 0; }
    else if (this.confirmation < .1) { wheel = -1; target = 0; }
    else this.selectedWheel = wheel;
    for (let i = 0; i < 4; i++) {
      const request = i === wheel ? target : 0;
      const lateralUsage = Math.min(.98, Math.abs(wheels[WHEEL_IDS[i]!].lateralForce) / Math.max(1, lateralLimits[i]!));
      const availableTorque = Math.max(0, longitudinalLimits[i]!) * this.config.wheelRadius *
        Math.sqrt(1 - lateralUsage * lateralUsage) * clamp(tune?.maximumBrakeGripFraction ?? .45, 0, .8);
      this.brakeTorques[i] = Math.min(availableTorque,
        damp(this.brakeTorques[i]!, request, request > this.brakeTorques[i]! ? (tune?.response ?? 6) : 10, dt));
      if (this.brakeTorques[i]! < .5 && request === 0) this.brakeTorques[i] = 0;
    }
    this.mode = this.active ? mode : 'inactive';
    if (!this.active && wheel < 0) this.selectedWheel = -1;
  }
}
