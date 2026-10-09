import { createDefaultVehiclePhysicsConfig } from './defaultVehiclePhysicsConfig';
import { calibrateTyres } from './TyreCalibration';
import { FAMILY_CONVERTER_CONFIG } from './transmissionTestVehicleConfigs';
import { COMFORT_CVT_DIMENSIONS } from '../VehicleDimensions';
import type { VehiclePhysicsConfig } from './VehiclePhysicsConfig';

/** Independent ordinary 2.0 NA family calibration, not a production-car replica. */
export function createCVTSedanPhysicsConfig(): VehiclePhysicsConfig {
  const config = createDefaultVehiclePhysicsConfig();
  config.fuel = { tankCapacityL: 53, defaultFuelL: 37, fuelDensity: 0.745,
    peakThermalEfficiency: 0.34, referenceConsumptionLPer100km: 6.8 };
  const converter = FAMILY_CONVERTER_CONFIG;
  Object.assign(config, COMFORT_CVT_DIMENSIONS, {
    mass: 1415, trackWidth: 1.585, frontWeightBias: .595, drivenWheelWeightFraction: .595,
    centerOfMassHeight: .54, enginePlacement: 'FRONT', yawInertia: 2680,
  });
  config.engine = { ...config.engine, layout: 'INLINE', cylinderCount: 4, displacementL: 2.0, idleRPM: 800, engineInertia: .46, partThrottleExponent: .78,
    throttleResponse: 2.65, throttleResponseRate: 2.65, throttleReleaseResponse: 6.8,
    engineFrictionTorque: 13, engineBrakingStrength: 46, engineBraking: 59,
    idleControlStrength: 70, idleControlMaxTorque: 70, idleControlBandRPM: 290,
    redlineRPM: 6250, revLimiterRPM: 6250, maxRPM: 6500, redlineWarningRPM: 5850,
    revHang: { ...config.engine.revHang!, enabled: false },
    torqueCurve: [{ rpm: 800, torque: 94 }, { rpm: 1500, torque: 145 }, { rpm: 2500, torque: 174 },
      { rpm: 3500, torque: 192 }, { rpm: 4400, torque: 198 }, { rpm: 5200, torque: 187 },
      { rpm: 5800, torque: 170 }, { rpm: 6250, torque: 137 }, { rpm: 6500, torque: 94 }] };
  config.brakes = { ...config.brakes, pedalCurveExponent: 1.22, applyResponse: 10.5, releaseResponse: 16,
    frontBrakeBias: .65, maxBrakeTorqueFront: 11500 * config.wheelRadius * .65,
    maxBrakeTorqueRear: 11500 * config.wheelRadius * .35, maxBrakeForce: 11500, response: 10.5,
    handbrakeTorque: 6000 * config.wheelRadius, maxHandbrakeForce: 6000 };
  const roadAngle = 33 * Math.PI / 180;
  config.steering = { ...config.steering, maxRoadWheelAngle: roadAngle, maxSteeringAngle: roadAngle,
    steeringRatio: 17.1, steeringWheelLock: roadAngle * 17.1 * 2, steeringResponse: 3.05,
    steeringDamping: 9.5, steeringReturnRate: 4.8,
    returnProfile: { lowSpeedRate: .42, highSpeedRate: 4.8, speedReference: 12.5 },
    highSpeedReferenceSpeed: 18, highSpeedMinimumAuthority: .23, ackermannFactor: .88 };
  config.suspension = { ...config.suspension, rideHeight: .155, restLength: .37,
    springRateFront: 27500, springRateRear: 25500,
    damperCompressionFront: 2100, damperCompressionRear: 1900,
    damperReboundFront: 3250, damperReboundRear: 2900, suspensionTravel: .18,
    antiRollStiffnessFront: 8000, antiRollStiffnessRear: 6000, antiRollStiffness: 14000 };
  config.tires = { ...config.tires, wheelInertia: 1.18, longitudinalGrip: .92, lateralGrip: .94,
    gripCoefficient: .92, corneringStiffnessFront: 70000, corneringStiffnessRear: 74000,
    rollingResistance: .0125, peakSlipRatio: .115, peakSlipAngle: 8.5 * Math.PI / 180, gripFalloff: .32 };
  config.tires = calibrateTyres(config.tires, 'ECO_TOURING');
  config.aero = { ...config.aero, dragCoefficient: .28, frontalArea: 2.2, liftCoefficientFront: .025, liftCoefficientRear: .035 };
  config.transmission = { ...config.transmission, type: 'CVT', supportsManualSelection: false, automatic: undefined, dct: undefined,
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
