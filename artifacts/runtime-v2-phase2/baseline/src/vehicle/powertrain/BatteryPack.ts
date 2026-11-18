import type { BatteryPackConfig } from '../config/ElectricVehiclePhysicsConfig';
import { clamp, clamp01 } from '../physics/math';
import { EVThermalState, smoothLimit } from './EVThermalState';

/** Usable stored energy is authoritative. All power arguments use W, all energy uses kWh. */
export class BatteryPack {
  private energyKWh: number;
  private ocvTime = Infinity;
  private cachedOCV = 0;
  public current = 0;
  public voltage = 0;
  public resistiveLoss = 0;
  public readonly thermal?: EVThermalState;
  public constructor(public readonly config: BatteryPackConfig, ambient = 20) {
    this.energyKWh = config.usableCapacityKWh * config.defaultStateOfCharge;
    if (config.thermal) this.thermal = new EVThermalState(config.thermal, ambient);
    this.voltage = this.openCircuitVoltage;
  }
  public get temperature(): number { return this.thermal?.temperature ?? 20; }
  public get grossEnergyKWh(): number { return this.config.grossEnergyKWh ?? this.config.usableCapacityKWh; }
  public get usableEnergyKWh(): number { return this.config.usableCapacityKWh; }
  private coldFactor(charge: boolean): number {
    const c = this.config;
    const full = charge ? c.coldChargeFullTemperature ?? 10 : c.coldDischargeFullTemperature ?? 5;
    const zero = charge ? c.coldChargeZeroTemperature ?? -20 : c.coldDischargeZeroTemperature ?? -35;
    return smoothLimit((this.temperature - zero) / (full - zero));
  }
  /** Small continuous OCV approximation, with steeper knees near empty/full. */
  public get openCircuitVoltage(): number {
    if (this.ocvTime >= .05) {
      const soc = this.stateOfCharge;
      this.cachedOCV = this.config.nominalVoltage * (.86 + .22 * soc - .08 * Math.exp(-soc * 18) + .035 * soc ** 8);
      this.ocvTime = 0;
    }
    return this.cachedOCV;
  }
  public get internalResistance(): number {
    return (this.config.electrical?.internalResistance ?? 0) *
      (1 + 2 * (1 - this.coldFactor(false)) + .3 * Math.max(0, this.temperature - 40) / 30);
  }
  public get dischargeCurrentLimit(): number {
    return (this.config.electrical?.maxDischargeCurrent ?? this.config.maxDischargePower / this.config.nominalVoltage) * this.dischargeFactor *
      this.coldFactor(false) * (this.thermal?.capability ?? 1);
  }
  public get chargeCurrentLimit(): number {
    return (this.config.electrical?.maxChargeCurrent ?? this.config.maxChargePower / this.config.nominalVoltage) * this.chargeFactor *
      this.coldFactor(true) * (this.thermal?.capability ?? 1);
  }
  public get availableDischargePower(): number {
    const ceiling = this.config.maxDischargePower * this.dischargeFactor * this.coldFactor(false) * (this.thermal?.capability ?? 1);
    if (!this.config.electrical) return ceiling;
    const ocv = this.openCircuitVoltage, r = this.internalResistance;
    const current = Math.min(this.dischargeCurrentLimit, ocv / Math.max(1e-6, 2 * r));
    return Math.min(ceiling, current * (ocv - current * r));
  }
  public get availableChargePower(): number {
    const ceiling = this.config.maxChargePower * this.chargeFactor * this.coldFactor(true) * (this.thermal?.capability ?? 1);
    if (!this.config.electrical) return ceiling;
    const current = this.chargeCurrentLimit;
    return Math.min(ceiling, current * (this.openCircuitVoltage + current * this.internalResistance));
  }
  public get stateOfCharge(): number { return this.energyKWh / this.config.usableCapacityKWh; }
  public get remainingEnergyKWh(): number { return this.energyKWh; }
  public setStateOfCharge(soc: number): void {
    if (Number.isFinite(soc)) {
      this.energyKWh = clamp01(soc) * this.config.usableCapacityKWh;
      this.ocvTime = Infinity;
      this.current = this.resistiveLoss = 0; this.voltage = this.openCircuitVoltage;
    }
  }
  public get dischargeFactor(): number {
    return smoothLimit((this.stateOfCharge - this.config.lowSOCEnd) / (this.config.lowSOCStart - this.config.lowSOCEnd));
  }
  public get chargeFactor(): number {
    return smoothLimit((this.config.highSOCRegenEnd - this.stateOfCharge) / (this.config.highSOCRegenEnd - this.config.highSOCRegenStart));
  }
  public dischargeLimit(dt: number): number {
    return Math.min(this.availableDischargePower,
      this.energyKWh * 3_600_000 * this.config.dischargeEfficiency * (this.config.electrical ? Math.max(.1, 1 - this.dischargeCurrentLimit * this.internalResistance / this.openCircuitVoltage) : 1) / Math.max(1e-6, dt));
  }
  public chargeLimit(dt: number): number {
    return Math.min(this.availableChargePower,
      (this.config.usableCapacityKWh - this.energyKWh) * 3_600_000 / this.config.chargeEfficiency / Math.max(1e-6, dt));
  }
  /** Signed terminal power: positive draw, negative recovery. Returns actual terminal power. */
  public integrate(dt: number, terminalPower: number): number {
    if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(terminalPower)) return 0;
    const power = clamp(terminalPower, -this.chargeLimit(dt), this.dischargeLimit(dt));
    const ocv = this.openCircuitVoltage, r = this.internalResistance;
    // Stable analytic small root of P = I(OCV - IR); negative current charges.
    this.current = 2 * power / Math.max(1, ocv + Math.sqrt(Math.max(0, ocv * ocv - 4 * r * power)));
    this.voltage = ocv - this.current * r;
    this.resistiveLoss = this.current * this.current * r;
    const chemicalPower = power + this.resistiveLoss;
    const storedPower = chemicalPower >= 0 ? chemicalPower / this.config.dischargeEfficiency : chemicalPower * this.config.chargeEfficiency;
    this.energyKWh = clamp(this.energyKWh - storedPower * dt / 3_600_000, 0, this.config.usableCapacityKWh);
    this.ocvTime += dt;
    return power;
  }
}
