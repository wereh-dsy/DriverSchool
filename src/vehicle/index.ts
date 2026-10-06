export {
  DEFAULT_VEHICLE_ID,
  VEHICLE_CATALOG,
  VEHICLE_IDS,
  createVehiclePhysicsConfig,
  getNextVehicleId,
  getVehicleDescriptor,
  isVehicleId,
} from './VehicleCatalog';
export type { VehicleCapabilities, VehicleDescriptor, VehicleId } from './VehicleCatalog';
export { runVehicleCatalogSelfTest } from './VehicleCatalog.selftest';
export type { VehicleCatalogSelfTestResult } from './VehicleCatalog.selftest';
export * from './control';
