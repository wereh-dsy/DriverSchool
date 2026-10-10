import type { BatteryPackConfig } from '../config/ElectricVehiclePhysicsConfig';
import { clamp, clamp01 } from '../physics/math';

/** Usable stored energy is authoritative. All power arguments use W, all energy uses kWh. */
export class BatteryPack {
  private energyKWh: number;
  public constructor(public readonly config: BatteryPackConfig) {
    this.energyKWh = config.usableCapacityKWh * config.defaultStateOfCharge;
  }
  public get stateOfCharge(): number { return this.energyKWh / this.config.usableCapacityKWh; }
  public get remainingEnergyKWh(): number { return this.energyKWh; }
  public setStateOfCharge(soc: number): void {
    if (Number.isFinite(soc)) this.energyKWh = clamp01(soc) * this.config.usableCapacityKWh;
  }
  public get dischargeFactor(): number {
    return clamp01((this.stateOfCharge - this.config.lowSOCEnd) / (this.config.lowSOCStart - this.config.lowSOCEnd));
  }
  public get chargeFactor(): number {
    return clamp01((this.config.highSOCRegenEnd - this.stateOfCharge) / (this.config.highSOCRegenEnd - this.config.highSOCRegenStart));
  }
  public dischargeLimit(dt: number): number {
    return Math.min(this.config.maxDischargePower * this.dischargeFactor,
      this.energyKWh * 3_600_000 * this.config.dischargeEfficiency / Math.max(1e-6, dt));
  }
  public chargeLimit(dt: number): number {
    return Math.min(this.config.maxChargePower * this.chargeFactor,
      (this.config.usableCapacityKWh - this.energyKWh) * 3_600_000 / this.config.chargeEfficiency / Math.max(1e-6, dt));
  }
  /** Signed terminal power: positive draw, negative recovery. Returns actual terminal power. */
  public integrate(dt: number, terminalPower: number): number {
    if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(terminalPower)) return 0;
    const power = clamp(terminalPower, -this.chargeLimit(dt), this.dischargeLimit(dt));
    const storedPower = power >= 0 ? power / this.config.dischargeEfficiency : power * this.config.chargeEfficiency;
    this.energyKWh = clamp(this.energyKWh - storedPower * dt / 3_600_000, 0, this.config.usableCapacityKWh);
    return power;
  }
}
