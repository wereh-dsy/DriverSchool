export type { ElectricVehiclePhysicsConfig, ElectricMotorConfig, BatteryPackConfig, FixedReductionConfig, RegenConfig } from './ElectricVehiclePhysicsConfig';
export { isElectricConfig } from './ElectricVehiclePhysicsConfig';
export { createTeslaModel3PhysicsConfig } from './teslaModel3PhysicsConfig';
export type {
  AeroConfig,
  AutoClutchConfig,
  BrakeConfig,
  ClutchConfig,
  EngineConfig,
  FuelConfig,
  TurbochargerConfig,
  ForwardGear,
  ForwardGearRatios,
  Gear,
  SimulationSafetyConfig,
  ShiftRecommendationConfig,
  SteeringConfig,
  SuspensionConfig,
  SuspensionTopology,
  SuspensionAxleKinematicsConfig,
  TireConfig,
  TorqueCurvePoint,
  TransmissionConfig,
  TransmissionType,
  DriveSelector,
  AutomaticShiftConfig,
  AutomaticShiftMapPoint,
  TorqueConverterConfig,
  AutomaticTransmissionConfig,
  DualClutchTransmissionConfig,
  CVTConfig,
  VehiclePhysicsConfig,
  VehicleChassisConfig,
  VehicleDriveMode,
  DriveModeCalibration,
  DriverAidConfig,
} from './VehiclePhysicsConfig';
export {
  DEFAULT_VEHICLE_PHYSICS_CONFIG,
  cloneVehiclePhysicsConfig,
  createDefaultVehiclePhysicsConfig,
} from './defaultVehiclePhysicsConfig';
export {
  SPORTS_COUPE_PHYSICS_CONFIG,
  createSportsCoupePhysicsConfig,
} from './sportsCoupePhysicsConfig';
export { createTest6ATVehiclePhysicsConfig, createTest7DCTVehiclePhysicsConfig } from './transmissionTestVehicleConfigs';
export { createCVTSedanPhysicsConfig } from './cvtSedanPhysicsConfig';
export { createExecutiveSedanPhysicsConfig } from './executiveSedanPhysicsConfig';

export { createRoadSUVPhysicsConfig } from './roadSUVPhysicsConfig';
export { createFerrari458PhysicsConfig } from './ferrari458PhysicsConfig';
export type { DifferentialConfig, ElectronicDifferentialConfig, ParkingBrakeConfig, AutoHoldConfig } from './VehiclePlatformConfig';
