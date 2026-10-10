export { BrakeSystem } from './BrakeSystem';
export { BrakeTorqueCoordinator } from './BrakeTorqueCoordinator';
export type { DriveTorqueSource } from './DriveTorqueSource';
export type { Differential, DifferentialSnapshot } from './Differential';
export { createDifferential, LimitedSlipDifferential } from './LimitedSlipDifferential';
export { ESCController } from './ESCController';
export { AWDTorqueDistribution } from './AWDTorqueDistribution';
export type { WheelBrakeTorques } from './BrakeSystem';
export { WheelRotationSystem } from './WheelRotationSystem';
export type { WheelRotationInput, WheelRotationState } from './WheelRotationSystem';
export { AutoClutchController } from './AutoClutchController';
export type {
  AutoClutchContext,
  AutoClutchState,
  AutoClutchUpdateResult,
} from './AutoClutchController';
export { Clutch } from './Clutch';
export type { ClutchState } from './Clutch';
export { Engine } from './Engine';
export { FuelSystem } from './FuelSystem';
export type { FuelSnapshot } from './FuelSystem';
export type { EngineTorqueSample } from './Engine';
export { Gearbox } from './Gearbox';
export { SteeringSystem } from './SteeringSystem';
export { UpshiftAdvisor } from './UpshiftAdvisor';
export type {
  UpshiftAdvisorContext,
  UpshiftRecommendation,
} from './UpshiftAdvisor';
export { VehicleDynamics } from './VehicleDynamics';
export { VehicleContactSystem } from './VehicleContactSystem';
export {
  VehicleCollisionSystem, createVehicleOBB, createStaticOBBCollider,
  createBarrierColliders,
} from './CollisionSystem';
export type {
  StaticCollider, StaticColliderType, CollisionOBB, CollisionContact, CollisionResolution,
  CollisionDimensions, CollisionPose, CollisionPoint2, CollisionStep,
} from './CollisionSystem';
export { sampleWheelContacts, averageWheelGroundGeometry, WHEEL_IDS } from './WheelContact';
export type { WheelContact, WheelContactSet, GroundNormal } from './WheelContact';
export { runVehicleDynamicsSelfTest } from './VehicleDynamics.selftest';
export type { VehicleDynamicsSelfTestResult } from './VehicleDynamics.selftest';
export type {
  EngineToggleResult,
  ShiftRejectionReason,
  VehicleEnvironment,
  VehicleContactCorrection,
  VehicleForceSnapshot,
  VehicleInitialState,
  VehicleSnapshot,
  VehicleRuntimeSnapshot,
  VehicleWorldBounds,
} from './VehicleDynamics';
