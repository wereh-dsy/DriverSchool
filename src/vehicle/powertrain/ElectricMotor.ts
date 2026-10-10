import type { ElectricMotorConfig } from '../config/ElectricVehiclePhysicsConfig';
import type { DriveTorqueSource } from '../physics/DriveTorqueSource';
import { clamp, clamp01, damp } from '../physics/math';

/** Rigidly coupled motor shaft. Its speed comes from wheels; no idle, clutch or free engine integration. */
export class ElectricMotor implements DriveTorqueSource {
  public shaftAngularVelocity = 0;
  public deliveredDriveTorque = 0;
  public requestedDrive = 0;
  private targetTorque = 0;
  public constructor(public readonly config: ElectricMotorConfig) {}
  public get rotationalInertia(): number { return this.config.rotationalInertia; }
  public get availableDriveTorque(): number { return this.deliveredDriveTorque; }
  public get canDeliverTorque(): boolean { return Math.abs(this.shaftAngularVelocity) < this.config.maxRPM * Math.PI / 30; }
  public setShaftSpeed(omega: number): void { this.shaftAngularVelocity = Number.isFinite(omega) ? omega : 0; }
  public driveLimit(electricalPower: number): number {
    const omega = Math.abs(this.shaftAngularVelocity), maximum = this.config.maxRPM * Math.PI / 30;
    const overspeedTaper = clamp01((maximum - omega) / (maximum * .025));
    return Math.min(this.config.maxDriveTorque, this.config.maxDrivePower / Math.max(1, omega),
      electricalPower * this.config.motoringEfficiency / Math.max(1, omega)) * overspeedTaper;
  }
  public regenLimit(electricalPower: number): number {
    return Math.min(this.config.maxRegenTorque, this.config.maxRegenPower / Math.max(1, Math.abs(this.shaftAngularVelocity)),
      electricalPower / this.config.regenEfficiency / Math.max(1, Math.abs(this.shaftAngularVelocity)));
  }
  public requestDrive(demand: number, _dt: number): void { this.requestedDrive = clamp01(demand); }
  public requestTorque(torque: number): void { this.targetTorque = torque; }
  public updateState(dt: number, _loadTorque: number): void {
    this.deliveredDriveTorque = damp(this.deliveredDriveTorque, this.targetTorque, this.config.driveResponseRate, dt);
  }
  /** Traction, battery and overspeed limits can reduce authority immediately. */
  public limitTorque(driveLimit: number, regenLimit: number, direction = Math.sign(this.shaftAngularVelocity) || 1): void {
    this.deliveredDriveTorque = clamp(this.deliveredDriveTorque, -Math.max(0, direction > 0 ? regenLimit : driveLimit),
      Math.max(0, direction > 0 ? driveLimit : regenLimit));
  }
  public constrainRegeneration(maximumTorque: number): void {
    if (this.deliveredDriveTorque * this.shaftAngularVelocity < 0)
      this.deliveredDriveTorque = -Math.sign(this.shaftAngularVelocity) * Math.min(Math.abs(this.deliveredDriveTorque), maximumTorque);
  }
  public reset(): void { this.deliveredDriveTorque = this.requestedDrive = this.targetTorque = this.shaftAngularVelocity = 0; }
}
