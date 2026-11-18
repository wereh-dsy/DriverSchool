import type { BatteryPackConfig, ElectricMotorConfig } from './ElectricVehiclePhysicsConfig';
import type { VehiclePhysicsConfig } from './VehiclePhysicsConfig';

export type HybridMode = 'EV' | 'HYBRID' | 'SPORT' | 'CHARGE_HOLD' | 'CHARGE';
export type TransferMode = '2H' | 'AWD' | '4H' | '4L';
export interface ShaftLockConfig {
  /** Wheel-equivalent elastic shaft stiffness Nm/rad, damping Nms/rad and capacity Nm. */
  stiffness: number; damping: number; capacity: number;
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
  /** Pedal requests chassis acceleration before the common shaft envelope. SI. */
  driveability?: { normalAcceleration: number; sportAcceleration: number; ecoAcceleration: number;
    lowRangeAcceleration: number; creepSpeed: number; creepAcceleration: number; coastDeceleration: number;
    fullPowerPedalStart?: number };
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
