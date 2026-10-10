import type { DriveSelector } from '../config';
import type { FixedReductionConfig } from '../config/ElectricVehiclePhysicsConfig';
import type { PowertrainTransmission, PowertrainTransmissionSnapshot } from '../powertrain/Powertrain';

/** One permanent ratio. Reverse is motor direction, not a physical gear. */
export class FixedReductionTransmission implements PowertrainTransmission {
  public readonly type = 'FIXED_REDUCTION';
  private readonly snapshot: PowertrainTransmissionSnapshot = { type: 'FIXED_REDUCTION', selectedMode: 'P', currentPhysicalGear: null,
    currentRatio: 0, outputTorque: 0, inputRPM: 0, outputRPM: 0, transmittedTorque: 0,
    shiftInProgress: false, shiftState: 'NONE', shiftProgress: 0, kickdown: false, selectorRejectedReason: null, parkingLocked: true };
  public constructor(public readonly config: FixedReductionConfig) {}
  public get mode(): DriveSelector { return this.snapshot.selectedMode!; }
  public reset(mode: DriveSelector = 'P'): void {
    this.snapshot.selectedMode = mode; this.snapshot.selectorRejectedReason = null; this.update(0, 0);
  }
  public requestSelector(mode: DriveSelector, speed: number, lateralSpeed = 0, brake = 0): boolean {
    if (!['P', 'R', 'N', 'D'].includes(mode) || ![speed, lateralSpeed, brake].every(Number.isFinite)) return false;
    if (mode === this.mode) { this.snapshot.selectorRejectedReason = null; return true; }
    const reason = brake < .1 ? 'brake-required' : mode === 'P' && Math.hypot(speed, lateralSpeed) > this.config.parkMaximumSpeed
      ? 'park-while-moving' : (mode === 'R' && speed > this.config.directionLockoutSpeed) ||
        (mode === 'D' && speed < -this.config.directionLockoutSpeed) ? 'direction-while-moving' : null;
    this.snapshot.selectorRejectedReason = reason;
    if (reason) return false;
    this.snapshot.selectedMode = mode; this.update(0, 0); return true;
  }
  public update(wheelOmega: number, motorTorque: number): number {
    const driving = this.mode === 'D' || this.mode === 'R';
    this.snapshot.currentRatio = driving ? this.config.ratio : 0;
    this.snapshot.outputRPM = wheelOmega * 30 / Math.PI;
    this.snapshot.inputRPM = wheelOmega * this.config.ratio * 30 / Math.PI;
    // Regeneration flows back through the driveline, losing energy in the other direction.
    this.snapshot.outputTorque = driving ? motorTorque * this.config.ratio *
      (motorTorque * wheelOmega < 0 ? 1 / this.config.efficiency : this.config.efficiency) : 0;
    this.snapshot.transmittedTorque = motorTorque;
    this.snapshot.parkingLocked = this.mode === 'P';
    return this.snapshot.outputTorque;
  }
  public getSnapshot(): PowertrainTransmissionSnapshot { return { ...this.snapshot }; }
}
