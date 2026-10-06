import { createDefaultVehiclePhysicsConfig } from './defaultVehiclePhysicsConfig';
import type { AutomaticShiftConfig, VehiclePhysicsConfig } from './VehiclePhysicsConfig';

const makeShiftMap = (redline: number): AutomaticShiftConfig => ({
  map: [ { throttle: 0, upshiftRPM: 1650, downshiftRPM: 900 },
    { throttle: 0.25, upshiftRPM: 1900, downshiftRPM: 1050 },
    { throttle: 0.6, upshiftRPM: 3900, downshiftRPM: 1650 },
    { throttle: 1, upshiftRPM: redline - 350, downshiftRPM: 2600 } ],
  minimumUpshiftSpeeds: [3, 5, 7.5, 10, 12.5, 15],
  hysteresisRPM: 130, minimumTimeInGear: 1.15,
  kickdownThrottle: 0.8, kickdownTargetRPM: 4200, kickdownMaximumRPM: redline - 450,
  gearRPMCorrections: [100, 0, 0, 0, 0, 0, 0],
});

/** Development preset, not a claim of official production-car specifications. */
export function createTest6ATVehiclePhysicsConfig(): VehiclePhysicsConfig {
  const config = createDefaultVehiclePhysicsConfig();
  config.mass = 1410;
  config.engine = { ...config.engine, idleRPM: 850, engineInertia: 0.4,
    revHang: { ...config.engine.revHang!, enabled: false },
    idleControlStrength: 72, idleControlMaxTorque: 72,
    torqueCurve: [ { rpm: 850, torque: 95 }, { rpm: 1500, torque: 144 }, { rpm: 2500, torque: 181 },
      { rpm: 3500, torque: 198 }, { rpm: 4400, torque: 202 }, { rpm: 5200, torque: 190 },
      { rpm: 6000, torque: 157 }, { rpm: 6250, torque: 110 } ] };
  config.transmission = { ...config.transmission, type: 'TORQUE_CONVERTER_AT',
    gearRatios: { 1: 3.552, 2: 2.022, 3: 1.347, 4: 1, 5: 0.745, 6: 0.599 },
    reverseRatio: -3.052, finalDrive: 3.6, finalDriveRatio: 3.6,
    shiftTime: 0.52, reverseLockoutSpeed: 1.0,
    automatic: { shiftStrategy: makeShiftMap(config.engine.redlineRPM), shiftTorqueFactor: 0.6, parkMaximumSpeed: 0.35,
      converter: { pumpTorqueCoefficient: 0.0038,
        torqueRatioCurve: [ { speedRatio: 0, torqueRatio: 2.05 }, { speedRatio: 0.5, torqueRatio: 1.5 },
          { speedRatio: 0.8, torqueRatio: 1.13 }, { speedRatio: 1, torqueRatio: 1 } ],
        maximumPumpTorque: 280, backdriveCoupling: 0.35,
        lockupCapacity: 310, lockupStiffness: 7,
        lockupApplyRate: 0.75, lockupReleaseRate: 4.5,
        lockupMinimumSpeed: 14, lockupMinimumSpeedRatio: 0.8, lockupMaximumThrottle: 0.5 } } };
  return config;
}

/** Independent placeholder seven-speed turbo-sedan calibration for backend tests. */
export function createTest7DCTVehiclePhysicsConfig(): VehiclePhysicsConfig {
  const config = createDefaultVehiclePhysicsConfig();
  config.mass = 1395;
  config.engine = { ...config.engine, idleRPM: 850, engineInertia: 0.34,
    revHang: { ...config.engine.revHang!, enabled: false },
    idleControlStrength: 72, idleControlMaxTorque: 72, redlineRPM: 6200,
    revLimiterRPM: 6200, maxRPM: 6400, redlineWarningRPM: 5800,
    torqueCurve: [ { rpm: 850, torque: 115 }, { rpm: 1200, torque: 180 }, { rpm: 1500, torque: 240 },
      { rpm: 2000, torque: 250 }, { rpm: 3500, torque: 250 }, { rpm: 4500, torque: 220 },
      { rpm: 5500, torque: 185 }, { rpm: 6200, torque: 142 }, { rpm: 6400, torque: 100 } ] };
  config.transmission = { ...config.transmission, type: 'DCT',
    gearRatios: { 1: 3.5, 2: 2.12, 3: 1.52, 4: 1.14, 5: 0.9, 6: 0.73, 7: 0.6 },
    reverseRatio: -3.2, finalDrive: 3.65, finalDriveRatio: 3.65,
    shiftTime: 0.2, reverseLockoutSpeed: 1.0,
    dct: { shiftStrategy: makeShiftMap(config.engine.redlineRPM),
      clutchCapacity: 310, couplingStiffness: 10, clutchApplyRate: 1.8, clutchReleaseRate: 8,
      creepEngagement: 0.13, launchFullyEngagedSpeed: 4.3,
      unexpectedShiftDelay: 0.11, parkMaximumSpeed: 0.35 } };
  return config;
}
