import { createRoadAutoHoldConfig, createRoadParkingBrakeConfig } from './VehiclePlatformConfig';
import { createDefaultVehiclePhysicsConfig } from './defaultVehiclePhysicsConfig';
import { VehicleControlPresets } from '../control/VehicleControlPresets';
import { createLateralAssistConfig } from '../control/LateralAssistController';
import { calibrateTyres } from './TyreCalibration';
import { createTyreThermalPressureConfig } from './TyreThermalPressureConfig';
import { FAMILY_CONVERTER_CONFIG } from './transmissionTestVehicleConfigs';
import { ROAD_SUV_DIMENSIONS } from '../VehicleDimensions';
import type { VehiclePhysicsConfig } from './VehiclePhysicsConfig';

/** Touareg-like road SUV: V6, hydrodynamic eight-speed and existing dynamic AWD. */
export function createRoadSUVPhysicsConfig(): VehiclePhysicsConfig {
  const config = createDefaultVehiclePhysicsConfig();
  config.controlCalibration = VehicleControlPresets.roadSUV;
  config.lateralAssist = createLateralAssistConfig();
  Object.assign(config, ROAD_SUV_DIMENSIONS, { mass: 2100, trackWidth: 1.67,
    frontWeightBias: .54, centerOfMassHeight: .70, enginePlacement: 'FRONT',
    yawInertia: 4400, drivetrainType: 'AWD', drivetrainLayout: 'AWD',
    frontTorqueSplit: .55, rearTorqueSplit: .45 });
  config.fuel = { tankCapacityL: 90, defaultFuelL: 63, fuelDensity: .745,
    peakThermalEfficiency: .33, referenceConsumptionLPer100km: 10.5 };
  config.awd = { mode: 'on-demand', accelerationRearTorqueSplit: .50,
    maximumRearTorqueSplit: .60, response: 2.8 };
  config.engine = { ...config.engine, layout: 'V', cylinderCount: 6, bankAngle: Math.PI / 2,
    displacementL: 3.0, engineInertia: .49, idleRPM: 720, stallRPM: 440,
    torqueRipple: .010, firingCharacter: { smoothness: .91, inertiaScale: 1.10, brakingScale: 1.04 },
    soundProfile: 'full-bodied', partThrottleExponent: .88,
    throttleResponseRate: 2.9, throttleResponse: 2.9, throttleReleaseResponse: 6.5,
    engineFrictionTorque: 20, engineBrakingStrength: 82, engineBraking: 102,
    idleControlStrength: 110, idleControlMaxTorque: 110, idleControlBandRPM: 280,
    redlineWarningRPM: 5900, redlineRPM: 6400, revLimiterRPM: 6400, maxRPM: 6600,
    starterTorque: 170, revHang: { ...config.engine.revHang!, enabled: false },
    startupCharacter: { crankingDuration: .60, crankingRPM: 250, flareRPM: 1050,
      settlingDuration: .95, shutdownFriction: 36 },
    torqueCurve: [{ rpm: 720, torque: 165 }, { rpm: 1200, torque: 290 }, { rpm: 1800, torque: 430 },
      { rpm: 2200, torque: 450 }, { rpm: 4500, torque: 450 }, { rpm: 5500, torque: 425 },
      { rpm: 6000, torque: 395 }, { rpm: 6400, torque: 340 }, { rpm: 6600, torque: 265 }],
    turbo: { enabled: true, inertia: .48, pressureGain: 1.2, maxPressureRatio: 2.0,
      turbineDriveStrength: 1.9, compressorLoadStrength: .18, friction: .15, wastegateGain: 5,
      baseTorqueCurve: [{ rpm: 720, torque: 115 }, { rpm: 1200, torque: 165 }, { rpm: 1800, torque: 220 },
        { rpm: 2200, torque: 235 }, { rpm: 4500, torque: 235 }, { rpm: 5500, torque: 218 },
        { rpm: 6000, torque: 202 }, { rpm: 6400, torque: 175 }, { rpm: 6600, torque: 140 }] } };
  config.transmission = { ...config.transmission, type: 'TORQUE_CONVERTER_AT',
    supportsManualSelection: true, manualAutoUpshiftAtRedline: true, manualSelectionTimeout: 8,
    gearRatios: { 1: 4.714, 2: 3.143, 3: 2.106, 4: 1.667, 5: 1.285, 6: 1, 7: .839, 8: .667 },
    reverseRatio: -3.317, finalDrive: 3.27, finalDriveRatio: 3.27,
    efficiency: .90, drivetrainEfficiency: .90, shiftTime: .42, reverseLockoutSpeed: 1,
    automatic: { parkMaximumSpeed: .35, shiftTorqueFactor: .67,
      shiftStrategy: { map: [0, .2, .45, .7, .9, 1].map((throttle, i) => ({ throttle,
        upshiftRPM: [1400, 1700, 2350, 3400, 4700, 5950][i]!,
        downshiftRPM: [850, 950, 1150, 1450, 1900, 2500][i]! })),
        minimumUpshiftSpeeds: [2.8, 4.8, 7, 9, 11.5, 14, 17],
        hysteresisRPM: 150, minimumTimeInGear: 1.25, kickdownThrottle: .92,
        kickdownTargetRPM: 3900, kickdownMaximumRPM: 5900,
        maximumAutomaticRPM: 6200, minimumPostShiftRPM: 950, economicalShiftFactor: .94, liftHoldTime: 0,
        gearRPMCorrections: [120, 50, 0, 0, 0, 0, 0, 0] },
      converter: { ...FAMILY_CONVERTER_CONFIG,
        torqueRatioCurve: FAMILY_CONVERTER_CONFIG.torqueRatioCurve.map(point => ({ ...point })),
        pumpTorqueCoefficient: .0065, maximumPumpTorque: 570, lockupCapacity: 620,
        lockupStiffness: 10, lockupApplyRate: .65, lockupMinimumSpeed: 11,
        lockupMinimumSpeedRatio: .78, lockupMaximumThrottle: 1 } } };
  const brakeForce = 22500;
  config.brakes = { ...config.brakes, pedalCurveExponent: 1.08, applyResponse: 11.5,
    response: 11.5, releaseResponse: 18, frontBrakeBias: .66,
    maxBrakeForce: brakeForce, maxBrakeTorqueFront: brakeForce * config.wheelRadius * .66,
    maxBrakeTorqueRear: brakeForce * config.wheelRadius * .34,
    handbrakeTorque: 8500 * config.wheelRadius, maxHandbrakeForce: 8500 };
  const angle = 33 * Math.PI / 180;
  config.steering = { ...config.steering, maxRoadWheelAngle: angle, maxSteeringAngle: angle,
    steeringRatio: 17.8, steeringWheelLock: angle * 17.8 * 2,
    steeringResponse: 2.75, steeringDamping: 10.5, steeringReturnRate: 4.8,
    returnProfile: { lowSpeedRate: .50, highSpeedRate: 4.8, speedReference: 12 },
    highSpeedReferenceSpeed: 19, highSpeedMinimumAuthority: .22, ackermannFactor: .87 };
  config.suspension = { ...config.suspension, rideHeight: .215, restLength: .43,
    kinematics: {
      front: { topology: 'MULTI_LINK', staticCamber: -.006, camberGainPerMeter: -.24, staticToe: 0, bumpToeGainPerMeter: .006, antiDiveRatio: .18, antiSquatRatio: .10 },
      rear: { topology: 'MULTI_LINK', staticCamber: -.008, camberGainPerMeter: -.22, staticToe: .0005, bumpToeGainPerMeter: .015, antiDiveRatio: 0, antiSquatRatio: .18 },
    },
    springRateFront: 47000, springRateRear: 44000,
    damperCompressionFront: 3400, damperCompressionRear: 3150,
    damperReboundFront: 5050, damperReboundRear: 4700,
    suspensionTravel: .21, bumpStopStiffness: 310000,
    antiRollStiffnessFront: 14500, antiRollStiffnessRear: 11500, antiRollStiffness: 26000 };
  config.tires = { ...config.tires, wheelInertia: 2.25, rollingResistance: .013,
    longitudinalGrip: .98, lateralGrip: .99, gripCoefficient: .98, loadSensitivity: .07,
    corneringStiffnessFront: 102000, corneringStiffnessRear: 106000,
    peakSlipRatio: .11, peakSlipAngle: 8 * Math.PI / 180, gripFalloff: .35 };
  config.tires = calibrateTyres(config.tires, 'SUV_ROAD');
  config.capabilities = { ...config.capabilities, tpms: true };
  config.tires.thermalPressureFront = createTyreThermalPressureConfig(260, { thermalCapacity: 40000, heatingEfficiency: .70 });
  config.tires.thermalPressureRear = createTyreThermalPressureConfig(280, { thermalCapacity: 42000, heatingEfficiency: .70 });
  config.aero = { ...config.aero, dragCoefficient: .33, frontalArea: 2.76, liftCoefficientFront: .015, liftCoefficientRear: .02 };
  config.suspension.adaptiveDamping = { responseRate: 2, modeMultipliers: { ECO: .97, NORMAL: 1, SPORT: 1.4 } };
  config.suspension.airSuspension = { nominalRideHeight: .215, minimumOffset: -.025, maximumOffset: 0,
    adjustmentRate: .004, modeOffsets: { ECO: -.005, NORMAL: 0, SPORT: -.02 },
    highSpeedLowering: { activateSpeed: 30, restoreSpeed: 24, delay: 8, offset: -.015 } };
  config.startStop = { enabledByDefault: false, minimumStopDelay: 2.5, stopSpeedThreshold: .06,
    brakeThreshold: .25, restartThrottleThreshold: .10, restartBrakeReleaseThreshold: .08, restartDelay: .25 };
  config.driverAids = { ...config.driverAids, absEnabled: true, ebdEnabled: true,
    tractionControlEnabled: true, stabilityControlEnabled: true,
    tcs: { slipThresholdMultiplier: 1.15, maximumTorqueReduction: .95, response: 7, recoveryResponse: 1.8 },
    esc: { yawErrorThreshold: .14, sideslipThreshold: .085, response: 10, minimumSpeed: 4.5 } };
  const normalShift = config.transmission.automatic!.shiftStrategy;
  config.driveModes = Object.fromEntries((['ECO', 'NORMAL', 'SPORT'] as const).map(mode => [mode, {
    throttleExponent: mode === 'ECO' ? 1.25 : mode === 'SPORT' ? .86 : 1,
    throttleResponse: mode === 'ECO' ? 2.4 : mode === 'SPORT' ? 3.8 : 2.9,
    shiftStrategy: { ...normalShift, map: normalShift.map.map(point => ({ ...point,
      upshiftRPM: point.upshiftRPM * (mode === 'ECO' ? .93 : mode === 'SPORT' ? 1.12 : 1) })),
      liftHoldTime: mode === 'SPORT' ? 1.4 : 0, economicalShiftFactor: mode === 'SPORT' ? 1 : .94 },
    steeringResponse: mode === 'SPORT' ? 3 : 2.75, steeringDamping: mode === 'SPORT' ? 12 : 10.5,
    accelerationRearTorqueSplit: mode === 'SPORT' ? .54 : .50,
  }])) as unknown as VehiclePhysicsConfig['driveModes'];
  config.frontDiff = { type: 'open' };
  config.rearDiff = { type: 'open' };
  config.electronicDifferential = { slipThreshold: .18, speedDifferenceThreshold: .65,
    maximumBrakeTorque: 450, response: 8 };
  config.parkingBrake = createRoadParkingBrakeConfig(config.brakes.handbrakeTorque);
  config.autoHold = createRoadAutoHoldConfig();
  return config;
}
