import type { ElectricMotorConfig } from '../config/ElectricVehiclePhysicsConfig';
import type { DriveTorqueSource } from '../physics/DriveTorqueSource';
import { clamp, clamp01, damp } from '../physics/math';
import { EVThermalState, smoothLimit } from './EVThermalState';

/** Rigidly coupled motor shaft. Its speed comes from wheels; no idle, clutch or free engine integration. */
export class ElectricMotor implements DriveTorqueSource {
  public shaftAngularVelocity = 0;
  public deliveredDriveTorque = 0;
  public requestedDrive = 0;
  private targetTorque = 0;
  public responseRate: number;
  public readonly thermal?: EVThermalState;
  public constructor(public readonly config: ElectricMotorConfig, ambient = 20) {
    this.responseRate = config.driveResponseRate;
    if (config.thermal) this.thermal = new EVThermalState(config.thermal, ambient);
  }
  public get temperature(): number { return this.thermal?.temperature ?? 20; }
  public get thermalCapability(): number { return this.thermal?.capability ?? 1; }
  public get availablePower(): number {
    const continuous = this.config.continuousPower ?? this.config.maxDrivePower;
    return continuous + (this.config.maxDrivePower - continuous) * this.thermalCapability;
  }
  public efficiency(torque: number, regenerating = false): number {
    const base = regenerating ? this.config.regenEfficiency : this.config.motoringEfficiency;
    const map = this.config.efficiencyMap;
    if (!map) return base;
    const load = clamp01(Math.abs(torque) / this.config.maxDriveTorque);
    const rpm = clamp01(Math.abs(this.shaftAngularVelocity) * 30 / Math.PI / this.config.maxRPM);
    return clamp(base - map.lightLoadPenalty * (1 - load) ** 2 - map.highLoadPenalty * load ** 2 -
      map.highSpeedPenalty * rpm ** 2, .65, .98);
  }
  public get rotationalInertia(): number { return this.config.rotationalInertia; }
  public get availableDriveTorque(): number { return this.deliveredDriveTorque; }
  public get canDeliverTorque(): boolean { return Math.abs(this.shaftAngularVelocity) < this.config.maxRPM * Math.PI / 30; }
  public setShaftSpeed(omega: number): void { this.shaftAngularVelocity = Number.isFinite(omega) ? omega : 0; }
  public driveLimit(electricalPower: number): number {
    const omega = Math.abs(this.shaftAngularVelocity), maximum = this.config.maxRPM * Math.PI / 30;
    const rollOff = (this.config.highSpeedRollOffRPM ?? this.config.maxRPM * .975) * Math.PI / 30;
    const taper = 1 - smoothLimit((omega - rollOff) / Math.max(1, maximum - rollOff));
    const baseOmega = (this.config.baseSpeedRPM ?? this.config.maxDrivePower / this.config.maxDriveTorque * 30 / Math.PI) * Math.PI / 30;
    const curve = this.config.maxDriveTorque * Math.min(1, baseOmega / Math.max(1, omega));
    return Math.min(curve * this.availablePower / this.config.maxDrivePower, this.availablePower / Math.max(1, omega),
      electricalPower * this.efficiency(this.config.maxDriveTorque) / Math.max(1, omega)) * taper;
  }
  public regenLimit(electricalPower: number): number {
    const omega = Math.max(1, Math.abs(this.shaftAngularVelocity));
    return Math.min(this.config.maxRegenTorque * this.thermalCapability,
      this.config.maxRegenPower * this.thermalCapability / omega,
      electricalPower / Math.max(.65, this.efficiency(this.config.maxRegenTorque, true)) / omega);
  }
  public requestDrive(demand: number, _dt: number): void { this.requestedDrive = clamp01(demand); }
  public requestTorque(torque: number): void { this.targetTorque = torque; }
  public updateState(dt: number, _loadTorque: number): void {
    this.deliveredDriveTorque = damp(this.deliveredDriveTorque, this.targetTorque, this.responseRate, dt);
  }
  /** Traction, battery and overspeed limits can reduce authority immediately. */
  public limitTorque(driveLimit: number, regenLimit: number, direction = Math.sign(this.shaftAngularVelocity) || 1): void {
    this.deliveredDriveTorque = clamp(this.deliveredDriveTorque, -Math.max(0, direction > 0 ? regenLimit : driveLimit),
      Math.max(0, direction > 0 ? driveLimit : regenLimit));
  }
  public constrainRegeneration(maximumTorque: number, direction = Math.sign(this.shaftAngularVelocity)): void {
    if (this.deliveredDriveTorque * direction < 0)
      this.deliveredDriveTorque = -direction * Math.min(Math.abs(this.deliveredDriveTorque), maximumTorque);
  }
  public scaleTorque(factor: number): void { this.deliveredDriveTorque *= clamp01(factor); }
  public reset(): void { this.deliveredDriveTorque = this.requestedDrive = this.targetTorque = this.shaftAngularVelocity = 0; }
}
