import type { VehicleChassisConfig } from '../config';
import type { WheelPhysicsStateSet } from './WheelPhysicsState';
import { clamp, damp } from './math';

export interface AWDTorqueDistributionSnapshot {
  readonly mode: 'full-time' | 'on-demand';
  readonly frontTorqueSplit: number;
  readonly rearTorqueSplit: number;
  readonly carrierAngularVelocity: number;
}

/** Massless axle torque allocation; no wheel locking or extra drivetrain losses. */
export class AWDTorqueDistribution {
  public rearTorqueSplit = 0;
  public carrierAngularVelocity = 0;
  private readonly nominalRear: number;
  public constructor(private readonly config: VehicleChassisConfig) {
    const front = Math.max(0, config.frontTorqueSplit);
    const rear = Math.max(0, config.rearTorqueSplit);
    this.nominalRear = front + rear > 0 ? rear / (front + rear) : .5;
    this.reset();
  }
  public reset(): void { this.rearTorqueSplit = this.nominalRear; this.carrierAngularVelocity = 0; }
  public update(dt: number, throttle: number, wheels: WheelPhysicsStateSet, driving: boolean): void {
    let target = this.nominalRear;
    if (this.config.awd?.mode === 'on-demand' && driving) {
      const maximum = clamp(this.config.awd.maximumRearTorqueSplit ?? .5, this.nominalRear, 1);
      const acceleration = clamp(this.config.awd.accelerationRearTorqueSplit ?? .3, this.nominalRear, maximum);
      const demand = clamp((throttle - .25) / .55, 0, 1);
      const left = wheels.frontLeft, right = wheels.frontRight;
      const slip = Math.max(left.slipRatio * Math.sign(left.longitudinalSpeed || left.angularVelocity),
        right.slipRatio * Math.sign(right.longitudinalSpeed || right.angularVelocity));
      const slipDemand = throttle > .05
        ? clamp((slip - this.config.tires.peakSlipRatio * 1.2) / .3, 0, 1) : 0;
      target = Math.max(this.nominalRear + (acceleration - this.nominalRear) * demand,
        this.nominalRear + (maximum - this.nominalRear) * slipDemand);
    }
    this.rearTorqueSplit = this.config.awd?.mode === 'on-demand'
      ? damp(this.rearTorqueSplit, target, Math.max(.1, this.config.awd.response ?? 3), dt) : target;
  }
  public updateSpeeds(front: number, rear: number): number {
    // Torque-weighted speed also preserves input/output power across both axles.
    this.carrierAngularVelocity = front * (1 - this.rearTorqueSplit) + rear * this.rearTorqueSplit;
    return this.carrierAngularVelocity;
  }
  public getSnapshot(): AWDTorqueDistributionSnapshot {
    return { mode: this.config.awd?.mode ?? 'full-time', frontTorqueSplit: 1 - this.rearTorqueSplit,
      rearTorqueSplit: this.rearTorqueSplit, carrierAngularVelocity: this.carrierAngularVelocity };
  }
}
