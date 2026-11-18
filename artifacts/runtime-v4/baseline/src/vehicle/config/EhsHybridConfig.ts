import type { ElectricMotorConfig, FixedReductionConfig } from './ElectricVehiclePhysicsConfig';
import type { HybridBatteryConfig } from './HybridBatteryConfig';
import type { VehiclePhysicsConfig } from './VehiclePhysicsConfig';

export type EhsDriverMode = 'EV' | 'HEV' | 'HOLD' | 'SPORT';
/** DIRECT is an operating label within the single PARALLEL mechanical path. */
export type EhsPath = 'EV' | 'SERIES' | 'PARALLEL';
export interface EhsHybridConfig extends HybridBatteryConfig {
  p1: ElectricMotorConfig;
  p3: ElectricMotorConfig;
  reduction: FixedReductionConfig;
  directDrive: { ratio: number; efficiency: number; capacityNm: number; referenceTorqueNm: number; couplingStiffness: number; engagementSeconds: number;
    synchronizationRPM: number; minimumRPM: number; maximumRPM: number };
  inverterEfficiency: number;
  busEfficiency: number;
  auxiliaryPower: number;
  engineCooling: { thermostatStartC: number; thermostatFullC: number; bypassWPerK: number };
  defaultMode: EhsDriverMode;
  control: { holdSOC: number; minimumSOC: number; restartSOC: number; startPowerW: number;
    stopPowerW: number; minimumRunSeconds: number; minimumOffSeconds: number;
    pathDwellSeconds: number; generationReserveW: number; efficientLoad: number;
    efficientRPM: readonly { powerW: number; rpm: number }[];
    acceleration: number; torqueResponse: number; liftRegenWheelNm: number; regenMinimumSpeed: number; regenFullSpeed: number };
}
export interface EhsHybridVehiclePhysicsConfig extends VehiclePhysicsConfig { ehs: EhsHybridConfig }
export function isEhsHybridConfig(config: object): config is EhsHybridVehiclePhysicsConfig {
  return 'ehs' in config && (config as EhsHybridVehiclePhysicsConfig).ehs !== undefined;
}
