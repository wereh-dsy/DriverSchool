import type { EVThermalConfig } from '../config/ElectricVehiclePhysicsConfig';
import { clamp01 } from '../physics/math';

export function smoothLimit(value: number): number {
  const x = clamp01(value); return x * x * (3 - 2 * x);
}
/** Exact constant-input lumped integration; stable at reduced thermal update rates. */
export class EVThermalState {
  public temperature: number;
  public constructor(public readonly config: EVThermalConfig, public ambient = 20) {
    this.temperature = ambient + config.initialTemperatureOffset;
  }
  public get capability(): number {
    return 1 - (1 - this.config.minimumCapability) * smoothLimit(
      (this.temperature - this.config.derateStartTemperature) /
      (this.config.criticalTemperature - this.config.derateStartTemperature));
  }
  public integrate(dt: number, heatW: number, speed: number, coolingMultiplier = 1): void {
    const c = this.config;
    const conductance = c.coolingRate * coolingMultiplier + c.airflowCooling * Math.min(60, Math.abs(speed));
    const equilibrium = this.ambient + Math.max(0, heatW) / Math.max(.01, conductance);
    this.temperature += (equilibrium - this.temperature) * -Math.expm1(-conductance * dt / c.thermalCapacity);
  }
}
