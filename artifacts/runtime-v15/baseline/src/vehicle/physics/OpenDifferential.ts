import type { Differential, DifferentialSnapshot } from './Differential';
/** @deprecated Shared observation type now covers open and LSD carriers. */
export type OpenDifferentialSnapshot = DifferentialSnapshot;

/** Ideal massless open carrier. Wheel inertia/tyre reaction live in the wheel solver. */
export class OpenDifferential implements Differential {
  public carrierAngularVelocity = 0;
  public leftAngularVelocity = 0;
  public rightAngularVelocity = 0;
  public inputTorque = 0;
  public leftTorque = 0;
  public rightTorque = 0;

  public constructor(public readonly axle: 'front' | 'rear') {}

  public reset(): void {
    this.updateSpeeds(0, 0); this.distributeTorque(0);
  }

  public updateSpeeds(left: number, right: number): number {
    this.leftAngularVelocity = left;
    this.rightAngularVelocity = right;
    this.carrierAngularVelocity = (left + right) * 0.5;
    return this.carrierAngularVelocity;
  }

  public distributeTorque(afterFinalDriveTorque: number, _dt?: number): void {
    this.inputTorque = afterFinalDriveTorque;
    // Equal side-gear torque, NOT equal speed and NOT traction-biased torque.
    // A spinning low-grip wheel raises carrier speed and therefore backdrives
    // the existing transmission/clutch/engine, without any slip intervention.
    this.leftTorque = afterFinalDriveTorque * 0.5;
    this.rightTorque = this.leftTorque;
  }

  public getSnapshot(): OpenDifferentialSnapshot {
    return { type: 'open', axle: this.axle, carrierAngularVelocity: this.carrierAngularVelocity,
      leftAngularVelocity: this.leftAngularVelocity, rightAngularVelocity: this.rightAngularVelocity,
      inputTorque: this.inputTorque, leftTorque: this.leftTorque, rightTorque: this.rightTorque };
  }
}
