import type { DriveSelector } from '../config';
import type { ElectricDriveUnitConfig } from '../config/ElectricVehiclePhysicsConfig';
import { ElectricMotor } from './ElectricMotor';
import { Inverter } from './Inverter';
import { FixedReductionTransmission } from '../transmission/FixedReductionTransmission';
import { EVTwoSpeedTransmission } from '../transmission/EVTwoSpeedTransmission';
import type { EVTransmission } from '../transmission/EVTransmission';

export interface ElectricDriveUnitState {
  selectorMode: DriveSelector; wheelTorque: number;
  motorRpm: number; requestedTorque: number; deliveredTorque: number;
  electricalPower: number; mechanicalPower: number; motorTemperature: number; inverterTemperature: number;
  torqueLimit: number; powerLimit: number; regenTorqueLimit: number; gearRatio: number;
}
export class ElectricDriveUnit {
  public readonly motor: ElectricMotor;
  public readonly inverter: Inverter;
  public readonly transmission: EVTransmission;
  public wheelTorque = 0;
  public driveLimit = 0;
  public regenLimit = 0;
  public electricalPower = 0;
  public mechanicalPower = 0;
  public requestedTorque = 0;
  private readonly state: ElectricDriveUnitState = { selectorMode: 'P', wheelTorque: 0, motorRpm: 0, requestedTorque: 0, deliveredTorque: 0,
    electricalPower: 0, mechanicalPower: 0, motorTemperature: 20, inverterTemperature: 20,
    torqueLimit: 0, powerLimit: 0, regenTorqueLimit: 0, gearRatio: 0 };
  private motorHeatJ = 0;
  private inverterHeatJ = 0;
  public constructor(public readonly config: ElectricDriveUnitConfig, ambient = 20) {
    this.motor = new ElectricMotor(config.motor, ambient); this.inverter = new Inverter(config.inverter, ambient);
    this.transmission = 'type' in config.transmission && config.transmission.type === 'TWO_SPEED'
      ? new EVTwoSpeedTransmission(config.transmission) : new FixedReductionTransmission(config.transmission);
  }
  public get powerLimit(): number { return Math.min(this.motor.availablePower, this.inverter.availablePower * this.motor.efficiency(this.config.motor.maxDriveTorque)); }
  public get wheelInertia(): number { return this.motor.rotationalInertia * this.transmission.ratio ** 2 / 2; }
  public prepare(wheelOmega: number, discharge: number, charge: number, traction: number, batteryFactor: number, fade: number): void {
    this.motor.setShaftSpeed(wheelOmega * this.transmission.ratio);
    this.driveLimit = Math.min(this.motor.driveLimit(Math.min(discharge, this.inverter.availablePower) * this.inverter.config.efficiency),
      this.config.motor.maxDriveTorque * batteryFactor) * traction;
    this.regenLimit = this.motor.regenLimit(Math.min(charge, this.inverter.availablePower) / this.inverter.config.efficiency) * fade;
  }
  public deliver(torque: number, dt: number, wheelOmega: number, direction: number, allowed: boolean): void {
    this.requestedTorque = allowed ? torque : 0;
    this.motor.requestTorque(this.requestedTorque); this.motor.updateState(dt, 0);
    this.motor.limitTorque(this.driveLimit * this.transmission.torqueTransfer, this.regenLimit * this.transmission.torqueTransfer,
      Math.sign(this.motor.shaftAngularVelocity) || direction);
    if (!allowed) this.motor.limitTorque(0, 0);
    // Shift interruption acts on actual rotor torque, so losses and battery work follow it.
    this.wheelTorque = this.transmission.update(wheelOmega, this.motor.deliveredDriveTorque);
  }
  public constrainRegen(maxWheelTorque: number, wheelOmega: number, motion = Math.sign(wheelOmega)): void {
    const limit = Math.max(0, maxWheelTorque) / this.transmission.ratio * this.transmission.efficiency;
    this.regenLimit = Math.min(this.regenLimit, limit);
    this.motor.constrainRegeneration(limit, motion);
    this.wheelTorque = this.transmission.update(wheelOmega, this.motor.deliveredDriveTorque);
  }
  public account(dt: number, wheelOmega?: number): number {
    const previous = this.motor.shaftAngularVelocity;
    if (wheelOmega !== undefined) {
      this.motor.setShaftSpeed(wheelOmega * this.transmission.ratio);
      this.transmission.update(wheelOmega, this.motor.deliveredDriveTorque);
    }
    this.mechanicalPower = this.motor.deliveredDriveTorque * (previous + this.motor.shaftAngularVelocity) * .5;
    const recovery = this.mechanicalPower < 0, efficiency = this.motor.efficiency(this.motor.deliveredDriveTorque, recovery);
    const motorElectrical = recovery ? this.mechanicalPower * efficiency : this.mechanicalPower / efficiency;
    this.electricalPower = recovery ? motorElectrical * this.inverter.config.efficiency : motorElectrical / this.inverter.config.efficiency;
    this.motorHeatJ += Math.abs(motorElectrical - this.mechanicalPower) * dt;
    // Copper loss at standstill: finite heat, no invented mechanical work.
    const copper = 160 * (this.motor.deliveredDriveTorque / this.config.motor.maxDriveTorque) ** 2;
    this.electricalPower += copper; this.motorHeatJ += copper * dt;
    this.inverterHeatJ += Math.abs(this.electricalPower - copper - motorElectrical) * dt;
    return this.electricalPower;
  }
  public integrateThermal(dt: number, speed: number, cooling: number): void {
    this.motor.thermal?.integrate(dt, this.motorHeatJ / dt, speed, cooling);
    this.inverter.thermal.integrate(dt, this.inverterHeatJ / dt, speed, cooling);
    this.motorHeatJ = this.inverterHeatJ = 0;
  }
  public reset(): void {
    this.motor.reset(); this.wheelTorque = this.driveLimit = this.regenLimit = this.electricalPower = this.mechanicalPower = this.requestedTorque = 0;
    this.motorHeatJ = this.inverterHeatJ = 0;
  }
  public getState(): ElectricDriveUnitState {
    const s = this.state;
    s.selectorMode = this.transmission.mode; s.wheelTorque = this.wheelTorque;
    s.motorRpm = Math.abs(this.motor.shaftAngularVelocity) * 30 / Math.PI; s.requestedTorque = this.requestedTorque;
    s.deliveredTorque = this.motor.deliveredDriveTorque; s.mechanicalPower = this.mechanicalPower; s.electricalPower = this.electricalPower;
    s.motorTemperature = this.motor.temperature; s.inverterTemperature = this.inverter.thermal.temperature;
    s.torqueLimit = this.driveLimit; s.powerLimit = this.powerLimit; s.regenTorqueLimit = this.regenLimit; s.gearRatio = this.transmission.ratio;
    return s;
  }
}
