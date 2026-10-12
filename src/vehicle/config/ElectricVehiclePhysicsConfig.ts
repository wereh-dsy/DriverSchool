import type { VehicleChassisConfig } from './VehiclePhysicsConfig';

export interface ElectricMotorConfig {
  /** maxDrivePower is short-term mechanical peak power in W. */
  maxDriveTorque: number; maxDrivePower: number; maxRPM: number; rotationalInertia: number;
  driveResponseRate: number; motoringEfficiency: number;
  maxRegenTorque: number; maxRegenPower: number; regenEfficiency: number;
  continuousPower?: number; baseSpeedRPM?: number; highSpeedRollOffRPM?: number;
  thermal?: EVThermalConfig;
  efficiencyMap?: { lightLoadPenalty: number; highLoadPenalty: number; highSpeedPenalty: number };
}
/** SI: heat capacity J/K, cooling conductance W/K. */
export interface EVThermalConfig {
  thermalCapacity: number; coolingRate: number; airflowCooling: number;
  derateStartTemperature: number; criticalTemperature: number; minimumCapability: number;
  initialTemperatureOffset: number;
}
export interface InverterConfig {
  maxPower: number; efficiency: number; thermal: EVThermalConfig;
}
export interface BatteryPackConfig {
  usableCapacityKWh: number; defaultStateOfCharge: number; nominalVoltage: number;
  maxDischargePower: number; maxChargePower: number;
  dischargeEfficiency: number; chargeEfficiency: number;
  lowSOCStart: number; lowSOCEnd: number; highSOCRegenStart: number; highSOCRegenEnd: number;
  grossEnergyKWh?: number; thermal?: EVThermalConfig;
  coldDischargeFullTemperature?: number; coldDischargeZeroTemperature?: number;
  coldChargeFullTemperature?: number; coldChargeZeroTemperature?: number;
}
export interface FixedReductionConfig {
  ratio: number; efficiency: number; reverseSpeedLimit: number;
  parkMaximumSpeed: number; directionLockoutSpeed: number;
  creepEnabled: boolean; creepTorque: number; creepSpeed: number;
}
export interface RegenConfig {
  brakeRegenFraction?: number;
  brakeLightDeceleration: number;
  strength: number; maximumLiftOffDeceleration: number;
  fadeSpeed: number; minimumSpeed: number;
  /** Brake/hold completes a lift-off stop after the motor loses low-speed authority. */
  stopBrakeSpeed: number; stopBrakeDemand: number;
  referenceConsumptionKWhPer100km: number;
}
export interface EVTwoSpeedConfig extends FixedReductionConfig {
  type: 'TWO_SPEED'; secondRatio: number; shiftDuration: number; minimumShiftInterval: number;
  normalUpshiftSpeed: number; normalDownshiftSpeed: number;
  sportUpshiftSpeed: number; sportDownshiftSpeed: number;
  sportPlusUpshiftSpeed: number; sportPlusDownshiftSpeed: number;
}
export interface ElectricDriveUnitConfig {
  axle: 'front' | 'rear'; motor: ElectricMotorConfig; inverter: InverterConfig;
  transmission: FixedReductionConfig | EVTwoSpeedConfig;
}
export interface EVModeCalibration {
  coolingMultiplier: number; powerFraction: number; frontParticipation: number;
  liftOffMultiplier: number; shiftStrategy: 'range' | 'normal' | 'sport' | 'sport-plus';
}
export interface EVLaunchConfig {
  normalPower: number; overboostPower: number; duration: number; energyBudgetKJ: number;
  cooldown: number; armTime: number; minimumSOC: number;
  minimumBatteryTemperature: number; maximumBatteryTemperature: number;
  maximumMotorTemperature: number; maximumInverterTemperature: number;
}
/** A chassis plus electrical systems; no dummy combustion/coupling/gearing fields. */
export interface ElectricVehiclePhysicsConfig extends VehicleChassisConfig {
  battery: BatteryPackConfig;
  motor: ElectricMotorConfig;
  fixedReduction: FixedReductionConfig;
  regen: RegenConfig;
  /** Legacy fields above are calibration aliases for the primary unit. */
  driveUnits?: readonly ElectricDriveUnitConfig[];
  normalSystemPower?: number; launchControl?: EVLaunchConfig;
  auxiliaryPower?: number; hvacPower?: number; ambientTemperature?: number; audioPresence?: number;
  transmission?: never;
}
export function isElectricConfig(config: VehicleChassisConfig): config is ElectricVehiclePhysicsConfig {
  return 'battery' in config && 'motor' in config && 'fixedReduction' in config;
}
