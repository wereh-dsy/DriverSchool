import { createTest6ATVehiclePhysicsConfig } from './transmissionTestVehicleConfigs';
import type { VehiclePhysicsConfig } from './VehiclePhysicsConfig';

/** Reuse the 6AT sedan's complete chassis, transmission and visual dimensions. */
export function createAWDTestVehiclePhysicsConfig(mode: 'full-time' | 'on-demand'): VehiclePhysicsConfig {
  const config = createTest6ATVehiclePhysicsConfig();
  config.transmission.supportsManualSelection = false;
  config.drivetrainType = config.drivetrainLayout = 'AWD';
  config.frontTorqueSplit = mode === 'full-time' ? .4 : .9;
  config.rearTorqueSplit = 1 - config.frontTorqueSplit;
  config.drivenWheelWeightFraction = 1;
  config.awd = { mode, accelerationRearTorqueSplit: .3, maximumRearTorqueSplit: .5, response: 3 };
  return config;
}
