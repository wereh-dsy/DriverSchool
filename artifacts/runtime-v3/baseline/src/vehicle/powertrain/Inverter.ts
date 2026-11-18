import type { InverterConfig } from '../config/ElectricVehiclePhysicsConfig';
import { EVThermalState } from './EVThermalState';

export class Inverter {
  public readonly thermal: EVThermalState;
  public constructor(public readonly config: InverterConfig, ambient = 20) {
    this.thermal = new EVThermalState(config.thermal, ambient);
  }
  public get availablePower(): number { return this.config.maxPower * this.thermal.capability; }
}
