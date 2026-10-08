import { createDefaultVehiclePhysicsConfig } from './defaultVehiclePhysicsConfig';
import { FLOW_6AT_DIMENSIONS, FORMAL_DCT_DIMENSIONS } from '../VehicleDimensions';
import type { AutomaticShiftConfig, TorqueConverterConfig, VehiclePhysicsConfig } from './VehiclePhysicsConfig';

const radians = (degrees: number): number => degrees * Math.PI / 180;

/** Existing hydrodynamic unit data, reusable without inheriting another car's engine/chassis. */
export const FAMILY_CONVERTER_CONFIG: TorqueConverterConfig = {
  pumpTorqueCoefficient: .0038,
  torqueRatioCurve: [{ speedRatio: 0, torqueRatio: 2.05 }, { speedRatio: .5, torqueRatio: 1.5 },
    { speedRatio: .8, torqueRatio: 1.13 }, { speedRatio: 1, torqueRatio: 1 }],
  maximumPumpTorque: 280, backdriveCoupling: .35,
  lockupCapacity: 310, lockupStiffness: 7, lockupApplyRate: .75, lockupReleaseRate: 4.5,
  lockupMinimumSpeed: 14, lockupMinimumSpeedRatio: .8, lockupMaximumThrottle: .5,
};

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

/** Linear NA / agile supported chassis; inspired by, not a replica of Mazda. */
export function createTest6ATVehiclePhysicsConfig(): VehiclePhysicsConfig {
  const config = createDefaultVehiclePhysicsConfig();
  config.fuel = { tankCapacityL: 55, defaultFuelL: 38, fuelDensity: 0.745,
    peakThermalEfficiency: 0.32, referenceConsumptionLPer100km: 7.5 };
  Object.assign(config, FLOW_6AT_DIMENSIONS, {
    mass: 1375, trackWidth: 1.555, frontWeightBias: .60, drivenWheelWeightFraction: .60,
    centerOfMassHeight: .49, centerOfMassLongitudinalOffset: 0, yawInertia: 2490,
  });
  config.engine = { ...config.engine, layout: 'INLINE', cylinderCount: 4, displacementL: 2.0, idleRPM: 800, engineInertia: .36,
    partThrottleExponent: .88, throttleResponse: 4.2, throttleResponseRate: 4.2, throttleReleaseResponse: 9,
    engineFrictionTorque: 13, engineBrakingStrength: 58, engineBraking: 71,
    idleControlBandRPM: 240, redlineRPM: 6500, revLimiterRPM: 6500, maxRPM: 6750, redlineWarningRPM: 6100,
    revHang: { ...config.engine.revHang!, enabled: false },
    idleControlStrength: 66, idleControlMaxTorque: 66,
    torqueCurve: [{ rpm: 800, torque: 91 }, { rpm: 1500, torque: 140 }, { rpm: 2500, torque: 172 },
      { rpm: 3500, torque: 188 }, { rpm: 4400, torque: 202 }, { rpm: 5200, torque: 196 },
      { rpm: 6000, torque: 175 }, { rpm: 6500, torque: 148 }, { rpm: 6750, torque: 104 }] };
  config.brakes = { ...config.brakes, pedalCurveExponent: 1, applyResponse: 13, releaseResponse: 19,
    frontBrakeBias: .67, maxBrakeTorqueFront: 11900 * config.wheelRadius * .67,
    maxBrakeTorqueRear: 11900 * config.wheelRadius * .33, maxBrakeForce: 11900, response: 13,
    handbrakeTorque: 6100 * config.wheelRadius, maxHandbrakeForce: 6100 };
  config.steering = { ...config.steering, maxRoadWheelAngle: radians(33), maxSteeringAngle: radians(33),
    steeringRatio: 15.2, steeringWheelLock: radians(33 * 15.2 * 2), steeringResponse: 3.8,
    steeringDamping: 12.5, steeringReturnRate: 5.8,
    returnProfile: { lowSpeedRate: .65, highSpeedRate: 5.8, speedReference: 11 },
    highSpeedReferenceSpeed: 19.5, highSpeedMinimumAuthority: .24, ackermannFactor: .88 };
  config.suspension = { ...config.suspension, rideHeight: .14, restLength: .34,
    springRateFront: 36000, springRateRear: 32000,
    damperCompressionFront: 2450, damperCompressionRear: 2200,
    damperReboundFront: 3700, damperReboundRear: 3300, suspensionTravel: .145,
    antiRollStiffnessFront: 12000, antiRollStiffnessRear: 9500, antiRollStiffness: 21500 };
  config.tires = { ...config.tires, wheelInertia: 1.16, longitudinalGrip: 1, lateralGrip: 1.02,
    gripCoefficient: 1, corneringStiffnessFront: 80000, corneringStiffnessRear: 84000,
    rollingResistance: .0115, peakSlipRatio: .105, peakSlipAngle: radians(7.5), gripFalloff: .33 };
  config.aero = { ...config.aero, dragCoefficient: .28, frontalArea: 2.13 };
  config.transmission = { ...config.transmission, type: 'TORQUE_CONVERTER_AT', supportsManualSelection: true, manualAutoUpshiftAtRedline: true, manualSelectionTimeout: 8,
    gearRatios: { 1: 3.552, 2: 2.022, 3: 1.347, 4: 1, 5: 0.745, 6: 0.599 },
    reverseRatio: -3.052, finalDrive: 3.6, finalDriveRatio: 3.6,
    shiftTime: 0.52, reverseLockoutSpeed: 1.0,
    automatic: { shiftStrategy: makeShiftMap(config.engine.redlineRPM), shiftTorqueFactor: 0.6, parkMaximumSpeed: 0.35,
      converter: { ...FAMILY_CONVERTER_CONFIG,
        torqueRatioCurve: FAMILY_CONVERTER_CONFIG.torqueRatioCurve.map(point => ({ ...point })) } } };
  return config;
}

/** Midrange turbo / stable saloon chassis; retain the existing turbo and DCT units. */
export function createTest7DCTVehiclePhysicsConfig(): VehiclePhysicsConfig {
  const config = createDefaultVehiclePhysicsConfig();
  config.fuel = { tankCapacityL: 50, defaultFuelL: 35, fuelDensity: 0.745,
    peakThermalEfficiency: 0.33, referenceConsumptionLPer100km: 6.5 };
  Object.assign(config, FORMAL_DCT_DIMENSIONS, {
    mass: 1420, trackWidth: 1.5375, frontWeightBias: .615, drivenWheelWeightFraction: .615,
    centerOfMassHeight: .515, centerOfMassLongitudinalOffset: 0, yawInertia: 2770,
  });
  config.engine = { ...config.engine, layout: 'INLINE', cylinderCount: 4, displacementL: 1.4, idleRPM: 800, engineInertia: .34,
    throttleResponse: 3.6, throttleResponseRate: 3.6, throttleReleaseResponse: 8.2,
    engineFrictionTorque: 12, engineBrakingStrength: 55, engineBraking: 67, idleControlBandRPM: 270,
    revHang: { ...config.engine.revHang!, enabled: false },
    idleControlStrength: 68, idleControlMaxTorque: 68, redlineRPM: 6200,
    revLimiterRPM: 6200, maxRPM: 6400, redlineWarningRPM: 5800,
    // This curve now starts from unboosted air potential, rather than assuming
    // full boost at every pedal position. Preserve useful everyday load demand.
    partThrottleExponent: 0.65,
    turbo: {
      enabled: true, inertia: 0.42, pressureGain: 1.3, maxPressureRatio: 2.15,
      turbineDriveStrength: 1.75, compressorLoadStrength: 0.18,
      friction: 0.16, wastegateGain: 5,
      // Initial 1.4-litre unboosted potential. The existing 250 Nm curve
      // remains the full-boost envelope; this is not final vehicle tuning.
      baseTorqueCurve: [
        { rpm: 850, torque: 75 }, { rpm: 1200, torque: 95 }, { rpm: 1500, torque: 118 },
        { rpm: 2000, torque: 128 }, { rpm: 3500, torque: 130 }, { rpm: 4500, torque: 120 },
        { rpm: 5500, torque: 105 }, { rpm: 6200, torque: 86 }, { rpm: 6400, torque: 70 },
      ],
    },
    torqueCurve: [ { rpm: 850, torque: 115 }, { rpm: 1200, torque: 180 }, { rpm: 1500, torque: 240 },
      { rpm: 2000, torque: 250 }, { rpm: 3500, torque: 250 }, { rpm: 4500, torque: 220 },
      { rpm: 5500, torque: 185 }, { rpm: 6200, torque: 142 }, { rpm: 6400, torque: 100 } ] };
  config.brakes = { ...config.brakes, pedalCurveExponent: .92, applyResponse: 14, releaseResponse: 19,
    frontBrakeBias: .68, maxBrakeTorqueFront: 12400 * config.wheelRadius * .68,
    maxBrakeTorqueRear: 12400 * config.wheelRadius * .32, maxBrakeForce: 12400, response: 14,
    handbrakeTorque: 6200 * config.wheelRadius, maxHandbrakeForce: 6200 };
  config.steering = { ...config.steering, maxRoadWheelAngle: radians(32), maxSteeringAngle: radians(32),
    steeringRatio: 16.6, steeringWheelLock: radians(32 * 16.6 * 2), steeringResponse: 3.3,
    steeringDamping: 10.5, steeringReturnRate: 5.4,
    returnProfile: { lowSpeedRate: .5, highSpeedRate: 5.4, speedReference: 12 },
    highSpeedReferenceSpeed: 18.5, highSpeedMinimumAuthority: .23, ackermannFactor: .87 };
  config.suspension = { ...config.suspension, rideHeight: .145, restLength: .35,
    springRateFront: 34000, springRateRear: 29000,
    damperCompressionFront: 2500, damperCompressionRear: 2200,
    damperReboundFront: 3800, damperReboundRear: 3450, suspensionTravel: .15,
    antiRollStiffnessFront: 11500, antiRollStiffnessRear: 8500, antiRollStiffness: 20000 };
  config.tires = { ...config.tires, wheelInertia: 1.12, longitudinalGrip: .96, lateralGrip: .98,
    gripCoefficient: .96, corneringStiffnessFront: 78000, corneringStiffnessRear: 80000,
    rollingResistance: .012, peakSlipRatio: .11, peakSlipAngle: radians(7.7), gripFalloff: .34 };
  config.aero = { ...config.aero, dragCoefficient: .29, frontalArea: 2.18 };
  config.transmission = { ...config.transmission, type: 'DCT', supportsManualSelection: true, manualAutoUpshiftAtRedline: true, manualSelectionTimeout: 8,
    gearRatios: { 1: 3.5, 2: 2.12, 3: 1.52, 4: 1.14, 5: 0.9, 6: 0.73, 7: 0.6 },
    reverseRatio: -3.2, finalDrive: 3.65, finalDriveRatio: 3.65,
    shiftTime: 0.2, reverseLockoutSpeed: 1.0,
    dct: { shiftStrategy: makeShiftMap(config.engine.redlineRPM),
      clutchCapacity: 310, couplingStiffness: 10, clutchApplyRate: 1.8, clutchReleaseRate: 8,
      creepEngagement: 0.13, launchFullyEngagedSpeed: 4.3,
      unexpectedShiftDelay: 0.11, parkMaximumSpeed: 0.35 } };
  return config;
}
