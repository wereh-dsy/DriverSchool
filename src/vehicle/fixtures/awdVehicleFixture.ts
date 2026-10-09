import { createTest6ATVehiclePhysicsConfig } from '../config/transmissionTestVehicleConfigs';
import type { VehiclePhysicsConfig } from '../config/VehiclePhysicsConfig';

/** Selftest-only AWD topology on the unchanged 6AT chassis; never registered for players. */
export function createAWDVehicleFixture(mode: 'full-time' | 'on-demand'): VehiclePhysicsConfig {
  const config = createTest6ATVehiclePhysicsConfig();
  config.transmission.supportsManualSelection = false;
  config.drivetrainType = config.drivetrainLayout = 'AWD';
  config.frontTorqueSplit = mode === 'full-time' ? .4 : .9;
  config.rearTorqueSplit = 1 - config.frontTorqueSplit;
  config.drivenWheelWeightFraction = 1;
  config.awd = { mode, accelerationRearTorqueSplit: .3, maximumRearTorqueSplit: .5, response: 3 };
  return config;
}
