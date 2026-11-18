import type { P2HybridVehiclePhysicsConfig } from '../config/P2HybridConfig';
import type { EngineTorqueSample } from '../physics/Engine';
import type { ICEHeatState } from './ICEHeatState';
import { smoothLimit } from './EVThermalState';

/** Fuel LHV -> indicated work, coolant/oil heat and exhaust; no target temperature forcing. */
export class P2ThermalBudget {
  public fuelPowerW = 0;
  public engineHeatW = 0;
  public engineRejectedHeatW = 0;
  public exhaustHeatW = 0;
  public engineMechanicalW = 0;
  public fuelEnergyResidualW = 0;
  public fuelEnergyJ = 0;
  public coolantHeatJ = 0;
  public motorHeatW = 0;
  public batteryHeatW = 0;
  public reset(): void { this.fuelPowerW = this.engineHeatW = this.engineRejectedHeatW = this.exhaustHeatW =
    this.fuelEnergyJ = this.coolantHeatJ = this.motorHeatW = this.batteryHeatW = this.engineMechanicalW = this.fuelEnergyResidualW = 0; }
  public update(dt: number, fuelL: number, omega: number, sample: EngineTorqueSample | undefined,
    speed: number, config: P2HybridVehiclePhysicsConfig, thermal: ICEHeatState | undefined): void {
    const c = config.hybrid.engineCooling, e = config.engine.thermal;
    this.fuelPowerW = Math.max(0, fuelL) * config.fuel.fuelDensity * 43_200_000 / Math.max(1e-8, dt);
    this.fuelEnergyJ += this.fuelPowerW * dt;
    if (!c || !e || !thermal) return;
    const indicated = Math.max(0, (sample ? sample.combustionTorque + sample.idleControlTorque + sample.revHangTorque : 0) * omega);
    const waste = Math.max(0, this.fuelPowerW - indicated);
    const friction = Math.max(0, (sample?.engineBrakingTorque ?? 0) * omega);
    this.engineHeatW = waste * c.coolantWasteFraction + friction;
    this.exhaustHeatW = waste * (1 - c.coolantWasteFraction);
    this.engineMechanicalW = indicated - friction;
    this.fuelEnergyResidualW = this.fuelPowerW - this.engineMechanicalW - this.engineHeatW - this.exhaustHeatW;
    const thermostat = smoothLimit((thermal.temperatureC - c.thermostatStartC) / (c.thermostatFullC - c.thermostatStartC));
    const fan = c.minimumFanFraction + (1 - c.minimumFanFraction) *
      smoothLimit((thermal.temperatureC - c.fanStartC) / (c.fanFullC - c.fanStartC));
    const conductance = c.bypassWPerK + thermostat * (e.coolingWPerK * fan + e.airflowCoolingWPerKPerMps * Math.abs(speed));
    const ambient = config.ambientTemperature ?? 20, before = thermal.temperatureC;
    thermal.integrateHeat(dt, this.engineHeatW, conductance, ambient);
    this.engineRejectedHeatW = this.engineHeatW - (thermal.temperatureC - before) * e.heatCapacityJPerK / Math.max(1e-8, dt);
    this.coolantHeatJ += this.engineHeatW * dt;
  }
  public getSnapshot() { return { fuelPowerW: this.fuelPowerW, engineHeatW: this.engineHeatW,
    engineRejectedHeatW: this.engineRejectedHeatW, exhaustHeatW: this.exhaustHeatW,
    motorHeatW: this.motorHeatW, batteryHeatW: this.batteryHeatW, fuelEnergyJ: this.fuelEnergyJ, coolantHeatJ: this.coolantHeatJ,
    engineMechanicalW: this.engineMechanicalW, fuelEnergyResidualW: this.fuelEnergyResidualW }; }
}
