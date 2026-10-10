import type { VehicleControlMode } from '../../input/VehicleInputState';
import type { DriveModeCalibration, DriveSelector, Gear, TransmissionType, VehicleDriveMode } from '../config';
import type { DriveTorqueSource } from '../physics/DriveTorqueSource';
import type { AutoClutchState } from '../physics/AutoClutchController';
import type { ClutchState } from '../physics/Clutch';
import type { RevHangSnapshot } from '../physics/Engine';
import type { FuelSnapshot } from '../physics/FuelSystem';
import type { DrivetrainLashSnapshot } from '../physics/DrivetrainLash';
import type { TransmissionSnapshot, TransmissionSystem } from '../transmission/TransmissionSystem';

/** Common shaft telemetry; ICE-specific transmission detail remains optional. */
export type PowertrainTransmissionSnapshot = Omit<TransmissionSnapshot, 'type' | 'engineLoadTorque'> & {
  type: TransmissionType | 'FIXED_REDUCTION'; engineLoadTorque?: number;
};
export interface PowertrainTransmission extends Pick<TransmissionSystem, 'requestSelector' | 'requestManualSelection' | 'returnToAuto'> {
  readonly type: PowertrainTransmissionSnapshot['type'];
  getSnapshot(): PowertrainTransmissionSnapshot;
}
export type ShiftRejectionReason = 'clutch-not-disengaged' | 'engine-over-speed' |
  'gear-not-available' | 'already-selected' | 'shift-in-progress';

/** Optional ICE compatibility telemetry, not required source components. */
export interface ICEVehicleTelemetry {
  startStop?: { supported: boolean; enabled: boolean; state: 'DISABLED' | 'READY' | 'AUTO_STOPPED' | 'RESTARTING' };
  fuel: FuelSnapshot;
  rpm: number;
  engineRunning: boolean;
  idleRPM: number;
  /** Compatibility alias for the current load-dependent recommendation. */
  shiftWarningRPM: number;
  recommendedUpshiftRPM: number;
  upshiftRecommendationAvailable: boolean;
  upshiftRecommended: boolean;
  redlineWarningRPM: number;
  nearRedline: boolean;
  onRevLimiter: boolean;
  redlineRPM: number;
  gear: Gear;
  requestedGear: Gear | null;
  /** Pedal down = 1, independently of mechanical engagement. */
  clutchPedal: number;
  clutchEngagement: number;
  clutchState: ClutchState;
  autoClutchState: AutoClutchState;
  drivetrainLash: DrivetrainLashSnapshot;
  revHang: RevHangSnapshot;
}
export interface PowertrainSnapshot {
  kind: string;
  vehicleOperational: boolean;
  driveAvailable: boolean;
  inputShaftAngularVelocity: number;
  sourceInertia: number;
  availableDriveTorque: number;
  transmission: PowertrainTransmissionSnapshot;
  ice?: ICEVehicleTelemetry;
  ev?: EVTelemetry;
}
export interface EVTelemetry {
  regenBrakeLight: boolean;
  stateOfCharge: number; remainingEnergyKWh: number; batteryPowerKw: number;
  motorRPM: number; motorTorque: number; drivePowerKw: number; regenPowerKw: number;
  regenLimited: boolean; regenLimitReason: string | null;
  tripEnergyConsumedKWh: number; tripEnergyRecoveredKWh: number;
  averageConsumptionKWhPer100km: number | null; estimatedRangeKm: number;
  requestedBrakeTorque: number; regenerativeBrakeTorque: number;
}
export interface PowertrainInitialState {
  vehicleOperational?: boolean;
  driveAvailable?: boolean;
  shaftAngularVelocity?: number;
  gear?: Gear;
  driveSelector?: DriveSelector;
  controlMode?: VehicleControlMode;
  ice?: { engineRPM?: number; engineRunning?: boolean; clutchEngagement?: number; currentFuelL?: number };
  ev?: { stateOfCharge?: number };
}
/** Generic chassis/shaft context. Legacy RPM thresholds belong inside ICEPowertrain. */
export interface PowertrainUpdateContext {
  /** Unmodulated driven-axle share of the common service-brake demand, Nm. */
  drivenAxleBrakeTorque?: number;
  totalServiceBrakeTorque?: number;
  autoHoldHolding?: boolean;
  parkingBrakeActive?: boolean;
  dt: number; throttle: number; brake: number;
  vehicleSpeed: number; vehicleLateralSpeed: number;
  drivenWheelAngularVelocity: number; torqueLimitFactor: number;
  clutchPedal: number; selectorRequest?: DriveSelector; driveMode?: VehicleDriveMode;
}
export interface PowertrainOutput {
  /** Physical motor braking magnitude at the driven axle, NOT a hydraulic request. */
  regenerativeWheelTorque?: number;
  /** Low-speed lift-off stop requests the ordinary service brake/hold path. */
  stopBrakeDemand?: number;
  consumedFuelL?: number;
  drivenWheelTorque: number; inputLoadTorque: number;
  couplingSlipAngularVelocity: number; parkingLocked: boolean;
}
/** Owns source, coupling and transmission lifecycle without requiring ICE components. */
export interface Powertrain {
  readonly serviceBrakeDemand?: number;
  /** Rotor inertia reflected to EACH driven wheel, kg m². */
  readonly drivenWheelInertia?: number;
  /** Final same-step ABS/traction authority; provider updates its persistent output. */
  limitRegeneration?(maximumWheelTorque: number): number;
  readonly torqueSource: DriveTorqueSource;
  readonly transmission: PowertrainTransmission;
  readonly supportsManualSelection: boolean;
  readonly vehicleOperational: boolean;
  readonly driveAvailable: boolean;
  readonly driving: boolean;
  readonly gear: Gear | null;
  readonly throttle: number;
  readonly variableMassKg: number;
  readonly numericallyValid: boolean;
  reset(state: PowertrainInitialState, recovering?: boolean): void;
  captureState(previous?: PowertrainInitialState): PowertrainInitialState;
  requestStart(): boolean;
  requestStop(): boolean;
  requestGear(gear: Gear, mode: VehicleControlMode, speed: number): ShiftRejectionReason | null;
  getShiftGear(direction: -1 | 1): Gear | null;
  setControlMode(mode: VehicleControlMode): VehicleControlMode;
  applyDriveMode?(calibration: DriveModeCalibration): void;
  prepare(context: PowertrainUpdateContext): void;
  update(context: PowertrainUpdateContext): PowertrainOutput;
  finishStep(speed: number, drivenWheelAngularVelocity?: number): void;
  getSnapshot(): PowertrainSnapshot;
}
