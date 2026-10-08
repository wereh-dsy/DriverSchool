import { createDefaultVehiclePhysicsConfig } from './defaultVehiclePhysicsConfig';
import { EXECUTIVE_LWB_DIMENSIONS } from '../VehicleDimensions';
import type { AutomaticShiftConfig, VehiclePhysicsConfig } from './VehiclePhysicsConfig';

const radians = (degrees: number): number => degrees * Math.PI / 180;
const shiftMap = (up: readonly number[], down: readonly number[], kickdown: number,
  target: number, dwell: number): AutomaticShiftConfig => ({
  map: [0, .25, .6, 1].map((throttle, i) => ({ throttle, upshiftRPM: up[i]!, downshiftRPM: down[i]! })),
  minimumUpshiftSpeeds: [2.8, 4.8, 7, 9, 11.5, 14], hysteresisRPM: 160,
  minimumTimeInGear: dwell, kickdownThrottle: kickdown, kickdownTargetRPM: target,
  kickdownMaximumRPM: 5700, gearRPMCorrections: [100, 0, 0, 0, 0, 0, 0],
});

/** A6L-inspired 2.0T executive calibration; no vehicle-name branches in physics. */
export function createExecutiveSedanPhysicsConfig(): VehiclePhysicsConfig {
  const config = createDefaultVehiclePhysicsConfig();
  config.fuel = { tankCapacityL: 73, defaultFuelL: 51, fuelDensity: 0.745,
    peakThermalEfficiency: 0.34, referenceConsumptionLPer100km: 8.2 };
  Object.assign(config, EXECUTIVE_LWB_DIMENSIONS, { mass: 1840, trackWidth: 1.625,
    frontWeightBias: .56, drivenWheelWeightFraction: 1, centerOfMassHeight: .50,
    centerOfMassLongitudinalOffset: 0, yawInertia: 3950,
    drivetrainType: 'AWD', drivetrainLayout: 'AWD', frontTorqueSplit: .75, rearTorqueSplit: .25 });
  config.awd = { mode: 'on-demand', accelerationRearTorqueSplit: .40, maximumRearTorqueSplit: .50, response: 2.4 };
  config.engine = { ...config.engine, layout: 'INLINE', cylinderCount: 4, displacementL: 2.0, idleRPM: 780, engineInertia: .43,
    partThrottleExponent: .85, throttleResponse: 3.2, throttleResponseRate: 3.2, throttleReleaseResponse: 7.5,
    engineFrictionTorque: 16, engineBrakingStrength: 67, engineBraking: 83,
    idleControlBandRPM: 280, idleControlStrength: 85, idleControlMaxTorque: 85,
    redlineRPM: 6400, revLimiterRPM: 6400, maxRPM: 6600, redlineWarningRPM: 6000,
    revHang: { ...config.engine.revHang!, enabled: false },
    torqueCurve: [{ rpm: 780, torque: 140 }, { rpm: 1200, torque: 250 }, { rpm: 1600, torque: 335 },
      { rpm: 2000, torque: 370 }, { rpm: 4200, torque: 370 }, { rpm: 5000, torque: 335 },
      { rpm: 5800, torque: 292 }, { rpm: 6400, torque: 238 }, { rpm: 6600, torque: 180 }],
    turbo: { enabled: true, inertia: .50, pressureGain: 1.3, maxPressureRatio: 2.15,
      turbineDriveStrength: 1.8, compressorLoadStrength: .18, friction: .16, wastegateGain: 5,
      baseTorqueCurve: [{ rpm: 780, torque: 100 }, { rpm: 1200, torque: 135 }, { rpm: 1600, torque: 160 },
        { rpm: 2000, torque: 178 }, { rpm: 4200, torque: 180 }, { rpm: 5000, torque: 164 },
        { rpm: 5800, torque: 144 }, { rpm: 6400, torque: 119 }, { rpm: 6600, torque: 90 }] } };
  config.engine.ignitionSequence = { crankingDuration: .55, crankingRPM: 270,
    flareRPM: 1120, settlingDuration: .85, shutdownFriction: 30 };
  const normalShift = shiftMap([1550, 1900, 3450, 5950], [900, 1100, 1650, 2600], .84, 4000, 1.5);
  config.transmission = { ...config.transmission, type: 'DCT', supportsManualSelection: true, manualAutoUpshiftAtRedline: true, manualSelectionTimeout: 8,
    gearRatios: { 1: 3.45, 2: 2.18, 3: 1.52, 4: 1.12, 5: .87, 6: .69, 7: .56 },
    reverseRatio: -3.1, finalDrive: 3.85, finalDriveRatio: 3.85, shiftTime: .30, reverseLockoutSpeed: 1,
    dct: { shiftStrategy: { ...normalShift }, clutchCapacity: 440, couplingStiffness: 11,
      clutchApplyRate: 1.25, clutchReleaseRate: 7, creepEngagement: .10,
      launchFullyEngagedSpeed: 4.8, unexpectedShiftDelay: .14, parkMaximumSpeed: .35 } };
  const braking = 18500;
  config.brakes = { ...config.brakes, pedalCurveExponent: 1.18, applyResponse: 10, releaseResponse: 17,
    frontBrakeBias: .65, maxBrakeForce: braking, response: 10,
    maxBrakeTorqueFront: braking * config.wheelRadius * .65,
    maxBrakeTorqueRear: braking * config.wheelRadius * .35,
    handbrakeTorque: 8000 * config.wheelRadius, maxHandbrakeForce: 8000 };
  config.steering = { ...config.steering, maxRoadWheelAngle: radians(32), maxSteeringAngle: radians(32),
    steeringRatio: 17.5, steeringWheelLock: radians(32 * 17.5 * 2), steeringResponse: 2.85,
    steeringDamping: 10, steeringReturnRate: 4.8,
    returnProfile: { lowSpeedRate: .50, highSpeedRate: 4.8, speedReference: 14 },
    highSpeedReferenceSpeed: 17, highSpeedMinimumAuthority: .20, ackermannFactor: .88 };
  config.suspension = { ...config.suspension, rideHeight: .145, restLength: .37,
    springRateFront: 39000, springRateRear: 35500,
    damperCompressionFront: 3050, damperCompressionRear: 2800,
    damperReboundFront: 4600, damperReboundRear: 4250, suspensionTravel: .17,
    antiRollStiffnessFront: 14500, antiRollStiffnessRear: 11500, antiRollStiffness: 26000 };
  config.tires = { ...config.tires, wheelInertia: 1.65, longitudinalGrip: 1.03, lateralGrip: 1.04,
    gripCoefficient: 1.03, corneringStiffnessFront: 103000, corneringStiffnessRear: 108000,
    rollingResistance: .0115, peakSlipRatio: .105, peakSlipAngle: radians(7.5), gripFalloff: .32 };
  config.aero = { ...config.aero, dragCoefficient: .28, frontalArea: 2.30 };
  config.driverAids = { ...config.driverAids, absEnabled: true, ebdEnabled: true,
    tractionControlEnabled: true, stabilityControlEnabled: true,
    esc: { yawErrorThreshold: .14, sideslipThreshold: .075, response: 10 } };
  config.driveModes = {
    ECO: { throttleExponent: 1.32, throttleResponse: 2.4,
      shiftStrategy: shiftMap([1400, 1650, 2900, 5650], [850, 950, 1400, 2200], .95, 3300, 1.8),
      steeringResponse: 2.65, steeringDamping: 9, accelerationRearTorqueSplit: .35 },
    NORMAL: { throttleExponent: 1, throttleResponse: 3.2, shiftStrategy: normalShift,
      steeringResponse: 2.85, steeringDamping: 10, accelerationRearTorqueSplit: .40 },
    SPORT: { throttleExponent: .82, throttleResponse: 4.6,
      shiftStrategy: shiftMap([2400, 3000, 4600, 6100], [1400, 1800, 2400, 3200], .68, 4800, 1.1),
      steeringResponse: 3.25, steeringDamping: 12, accelerationRearTorqueSplit: .46 },
  };
  return config;
}
