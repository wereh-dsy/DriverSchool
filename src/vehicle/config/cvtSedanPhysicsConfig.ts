import { createTest6ATVehiclePhysicsConfig } from './transmissionTestVehicleConfigs';
import type { VehiclePhysicsConfig } from './VehiclePhysicsConfig';

/** Independent ordinary 2.0 NA family calibration, not a production-car replica. */
export function createCVTSedanPhysicsConfig(): VehiclePhysicsConfig {
  const config = createTest6ATVehiclePhysicsConfig();
  const converter = config.transmission.automatic!.converter;
  config.mass = 1440;
  config.engine = { ...config.engine, engineInertia: .42, partThrottleExponent: .72 };
  config.transmission = { ...config.transmission, type: 'CVT', automatic: undefined, dct: undefined,
    gearRatios: {}, reverseRatio: -2.2, finalDrive: 5.1, finalDriveRatio: 5.1,
    cvt: { minimumRatio: .42, maximumRatio: 2.6, ratioChangeRate: .85, targetRPMResponse: 2.5,
      parkMaximumSpeed: .35,
      targetRPMCurve: [{ throttle: 0, rpm: 1100 }, { throttle: .15, rpm: 1450 },
        { throttle: .4, rpm: 2400 }, { throttle: .7, rpm: 4100 }, { throttle: 1, rpm: 5700 }],
      converter: { ...converter, torqueRatioCurve: converter.torqueRatioCurve.map(p => ({ ...p })),
        // CVT can lock while still using a large launch ratio. Use gentler
        // coupling than AT's high-gear-only lockup to avoid torque sign chatter.
        lockupStiffness: 1.1, lockupMinimumSpeed: 7, lockupMaximumThrottle: 1.05, lockupApplyRate: 1.3 } } };
  return config;
}
