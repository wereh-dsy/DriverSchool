export interface OpenDifferentialSnapshot {
  readonly type: 'open';
  readonly axle: 'front' | 'rear';
  /** After-final-drive carrier angular speed, rad/s. */
  readonly carrierAngularVelocity: number;
  readonly leftAngularVelocity: number;
  readonly rightAngularVelocity: number;
  readonly inputTorque: number;
  readonly leftTorque: number;
  readonly rightTorque: number;
}

/** Ideal massless open carrier. Wheel inertia/tyre reaction live in the wheel solver. */
export class OpenDifferential {
  public carrierAngularVelocity = 0;
  public leftAngularVelocity = 0;
  public rightAngularVelocity = 0;
  public inputTorque = 0;
  public leftTorque = 0;
  public rightTorque = 0;

  public constructor(public readonly axle: 'front' | 'rear') {}

  public updateSpeeds(left: number, right: number): number {
    this.leftAngularVelocity = left;
    this.rightAngularVelocity = right;
    this.carrierAngularVelocity = (left + right) * 0.5;
    return this.carrierAngularVelocity;
  }

  public distributeTorque(afterFinalDriveTorque: number): void {
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
