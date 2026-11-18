import type { BatteryPackConfig } from './ElectricVehiclePhysicsConfig';

/** Shared PHEV storage/charger contract, independent of mechanical hybrid topology. */
export interface HybridBatteryConfig {
  battery: BatteryPackConfig;
  charging: { acPower: number; dcPower: number; acEfficiency: number; dcEfficiency: number };
}
