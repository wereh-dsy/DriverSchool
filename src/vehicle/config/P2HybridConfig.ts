import type { BatteryPackConfig, ElectricMotorConfig } from './ElectricVehiclePhysicsConfig';
import type { VehicleDriveMode, VehiclePhysicsConfig } from './VehiclePhysicsConfig';

export type HybridMode = 'EV' | 'HEV' | 'INTELLIGENT' | 'HYBRID' | 'SPORT' | 'CHARGE_HOLD' | 'CHARGE';
export type TransferMode = '2H' | 'AWD' | '4H' | '4L';
export type P2TerrainMode = 'OFF' | 'SNOW' | 'MUD' | 'SAND';
export type P2EvFallbackReason = 'NONE' | 'LOW_SOC' | 'THERMAL_LIMIT' | 'BATTERY_LIMIT' | 'POWER_DEMAND' | 'SPEED_LIMIT';
export interface ShaftLockConfig {
  /** Wheel-equivalent elastic shaft stiffness Nm/rad, damping Nms/rad and capacity Nm. */
  stiffness: number; damping: number; capacity: number;
}
/** Per-driving-mode calibration for P2 parallel hybrid response & energy rules. */
export interface P2DriveModeStrategy {
  acceleration: number;
  demandResponseRate: number;
  fullPowerPedalStart: number;
  coastDecelerationScale: number;
  engineStartPowerScale: number;
  engineStartSpeedScale: number;
  startDelayScale: number;
  engineEfficientLoad: number;
  sportEngineReady?: boolean;
  smartTargetSocOffset?: number;
}
/** All-terrain strategy separated from road ECO/STANDARD/SPORT driving modes. */
export interface P2TerrainStrategy {
  pedalExponent: number;
  acceleration: number;
  demandResponseRate: number;
  fullPowerPedalStart: number;
  coastDecelerationScale: number;
  engineStartPowerScale: number;
  preferEngineReady: boolean;
  tcsSlipMultiplier: number;
}
/** Low-cost rule-based approximation of Tank 500 Hi4-T INTELLIGENT energy management. */
export interface P2IntelligentStrategyConfig {
  urbanSpeedMps: number;
  highwaySpeedMps: number;
  urbanStartPowerScale: number;
  midStartPowerScale: number;
  highwayStartPowerScale: number;
  urbanTargetSOC: number;
  midTargetSOC: number;
  highwayTargetSOC: number;
  generationPowerCapW: number;
  evMaxSpeedMps: number;
}
/** All powers W, shaft torques Nm; these are calibrations, never vehicle-name switches. */
export interface P2HybridConfig {
  battery: BatteryPackConfig;
  motor: ElectricMotorConfig;
  charging: { acPower: number; dcPower: number; acEfficiency: number; dcEfficiency: number };
  inverterEfficiency: number;
  auxiliaryPower: number;
  starterPower: number;
  systemPower: number;
  systemTorque: number;
  engineCooling?: { coolantWasteFraction: number; thermostatStartC: number; thermostatFullC: number;
    bypassWPerK: number; fanStartC: number; fanFullC: number; minimumFanFraction: number };
  defaultMode: HybridMode;
  energyModeOrder?: readonly HybridMode[];
  /** Pedal requests chassis acceleration before the common shaft envelope. SI. */
  driveability?: { normalAcceleration: number; sportAcceleration: number; ecoAcceleration: number;
    lowRangeAcceleration: number; creepSpeed: number; creepAcceleration: number; coastDeceleration: number;
    fullPowerPedalStart?: number };
  driveModeStrategy?: Readonly<Partial<Record<VehicleDriveMode, P2DriveModeStrategy>>>;
  terrainStrategies?: Readonly<Partial<Record<Exclude<P2TerrainMode, 'OFF'>, P2TerrainStrategy>>>;
  intelligent?: P2IntelligentStrategyConfig;
  energyManagement: {
    minimumSOC: number; restartSOC: number; holdSOC: number; chargeTargetSOC: number;
    engineStartPower: number; engineStopPower: number; engineStartSpeed: number;
    minimumRunTime: number; minimumOffTime: number; maximumGenerationPower: number;
    generationMinimumRPM: number; engineEfficientLoad: number; synchronizationToleranceRPM: number;
    startDemand?: number; startDelay?: number; stopDelay?: number;
  };
  transfer: { modes: readonly TransferMode[]; defaultMode: TransferMode; lowRatio: number;
    efficiency: number; highShiftMaximumSpeed: number; lowShiftMaximumSpeed: number; lowMaximumSpeed: number;
    frontShare: number; maximumFrontShare: number; couplingResponse: number;
    centerLock?: ShaftLockConfig; rearLock?: ShaftLockConfig; frontLock?: ShaftLockConfig;
    lockMaximumSpeed?: number; lockMaximumSlip?: number };
  regen: { minimumSpeed: number; fullSpeed: number; liftTorque: number };
}
export interface P2HybridVehiclePhysicsConfig extends VehiclePhysicsConfig { hybrid: P2HybridConfig }
export function isP2HybridConfig(config: object): config is P2HybridVehiclePhysicsConfig {
  return 'hybrid' in config && (config as VehiclePhysicsConfig).hybrid !== undefined;
}
