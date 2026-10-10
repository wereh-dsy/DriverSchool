import type { VehicleChassisConfig } from './VehiclePhysicsConfig';

export interface ElectricMotorConfig {
  maxDriveTorque: number; maxDrivePower: number; maxRPM: number; rotationalInertia: number;
  driveResponseRate: number; motoringEfficiency: number;
  maxRegenTorque: number; maxRegenPower: number; regenEfficiency: number;
}
export interface BatteryPackConfig {
  usableCapacityKWh: number; defaultStateOfCharge: number; nominalVoltage: number;
  maxDischargePower: number; maxChargePower: number;
  dischargeEfficiency: number; chargeEfficiency: number;
  lowSOCStart: number; lowSOCEnd: number; highSOCRegenStart: number; highSOCRegenEnd: number;
}
export interface FixedReductionConfig {
  ratio: number; efficiency: number; reverseSpeedLimit: number;
  parkMaximumSpeed: number; directionLockoutSpeed: number;
  creepEnabled: boolean; creepTorque: number; creepSpeed: number;
}
export interface RegenConfig {
  brakeLightDeceleration: number;
  strength: number; maximumLiftOffDeceleration: number;
  fadeSpeed: number; minimumSpeed: number;
  /** Brake/hold completes a lift-off stop after the motor loses low-speed authority. */
  stopBrakeSpeed: number; stopBrakeDemand: number;
  referenceConsumptionKWhPer100km: number;
}
/** A chassis plus electrical systems; no dummy combustion/coupling/gearing fields. */
export interface ElectricVehiclePhysicsConfig extends VehicleChassisConfig {
  battery: BatteryPackConfig;
  motor: ElectricMotorConfig;
  fixedReduction: FixedReductionConfig;
  regen: RegenConfig;
  transmission?: never;
}
export function isElectricConfig(config: VehicleChassisConfig): config is ElectricVehiclePhysicsConfig {
  return 'battery' in config && 'motor' in config && 'fixedReduction' in config;
}
