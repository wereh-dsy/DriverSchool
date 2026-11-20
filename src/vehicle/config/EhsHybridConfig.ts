import type { ElectricMotorConfig, FixedReductionConfig } from './ElectricVehiclePhysicsConfig';
import type { HybridBatteryConfig } from './HybridBatteryConfig';
import type { VehicleDriveMode, VehiclePhysicsConfig } from './VehiclePhysicsConfig';

export type EhsDriverMode = 'EV' | 'HEV' | 'HOLD' | 'SPORT';
export type EhsEvFallbackReason = 'NONE' | 'LOW_SOC' | 'THERMAL_LIMIT' | 'BATTERY_LIMIT' | 'POWER_DEMAND';
/** DIRECT is an operating label within the single PARALLEL mechanical path. */
export type EhsPath = 'EV' | 'SERIES' | 'PARALLEL';
/** Per-driving-mode calibration for EHS series-parallel response & energy rules. */
export interface EhsDriveModeStrategy {
  accelerationScale: number;
  torqueResponse: number;
  fullPowerPedalStart: number;
  /** Optional soft ceiling on front-axle demand (e.g. SNOW low-adhesion traction). */
  maximumDemandScale?: number;
  liftRegenScale: number;
  engineStartPowerScale: number;
  engineStopPowerScale: number;
  evPowerThresholdScale: number;
  /** Throttle threshold in HEV that triggers proactive ICE+P1 coordination (undefined = power-only). */
  assistThrottleThreshold?: number;
  seriesRpmScale: number;
  parallelLoadMin: number;
}
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
  energyModeOrder?: readonly EhsDriverMode[];
  driveModeStrategy?: Readonly<Partial<Record<VehicleDriveMode, EhsDriveModeStrategy>>>;
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
