import type { EngineConfig } from '../config';
import { clamp01 } from '../physics/math';

/** One coolant/oil thermal mass, engineering estimate rather than OEM protection. */
export class ICEHeatState {
  public temperatureC: number;
  constructor(private readonly config: NonNullable<EngineConfig['thermal']>) {
    this.temperatureC = config.initialTemperatureC;
  }
  reset(): void { this.temperatureC = this.config.initialTemperatureC; }
  get torqueFactor(): number {
    const c = this.config, t = clamp01((this.temperatureC - c.derateStartC) / (c.derateEndC - c.derateStartC));
    return 1 - t * t * (3 - 2 * t) * (1 - c.minimumTorqueFactor);
  }
  update(dt: number, combustionPowerW: number, speed: number, ambientC: number): void {
    const c = this.config;
    const cooling = c.coolingWPerK + c.airflowCoolingWPerKPerMps * Math.abs(speed);
    // Exact linear heat balance avoids overshoot, including engine-off cooldown.
    const target = ambientC + Math.max(0, combustionPowerW) * c.heatFraction / cooling;
    this.temperatureC = target + (this.temperatureC - target) * Math.exp(-cooling * dt / c.heatCapacityJPerK);
  }
}
