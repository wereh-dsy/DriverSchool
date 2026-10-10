import { createDefaultVehiclePhysicsConfig } from './defaultVehiclePhysicsConfig';
import { FERRARI_458_DIMENSIONS } from '../VehicleDimensions';
import { calibrateTyres } from './TyreCalibration';
import type { AutomaticShiftConfig, DriveModeCalibration, VehiclePhysicsConfig } from './VehiclePhysicsConfig';

/** First-pass road calibration, not proprietary Ferrari suspension/E-Diff data. */
export function createFerrari458PhysicsConfig(): VehiclePhysicsConfig {
  const c = createDefaultVehiclePhysicsConfig();
  Object.assign(c, FERRARI_458_DIMENSIONS, { mass: 1435, trackWidth: 1.615,
    enginePlacement: 'MID', frontWeightBias: .42,
    centerOfMassHeight: .40, yawInertia: 1850, drivetrainType: 'RWD', drivetrainLayout: 'RWD',
    frontTorqueSplit: 0, rearTorqueSplit: 1 });
  // 1435 kg base + 44.7 kg default fuel = 1479.7 kg road-ready.
  c.fuel = { tankCapacityL: 86, defaultFuelL: 60, fuelDensity: .745,
    peakThermalEfficiency: .30, referenceConsumptionLPer100km: 13.3 };
  c.engine = { ...c.engine, layout: 'V', cylinderCount: 8, bankAngle: Math.PI / 2, displacementL: 4.499,
    turbo: undefined, revHang: undefined, torqueRipple: .016, soundProfile: 'full-bodied',
    firingCharacter: { smoothness: .8, inertiaScale: 1, brakingScale: 1 },
    idleRPM: 1000, stallRPM: 600, idleControlMaxTorque: 95, idleControlStrength: 95, idleControlBandRPM: 300,
    engineInertia: .24, engineFrictionTorque: 20, engineBrakingStrength: 90, engineBraking: 110,
    partThrottleExponent: 1, throttleResponse: 9, throttleResponseRate: 9, throttleReleaseResponse: 12,
    redlineWarningRPM: 8500, redlineRPM: 9000, revLimiterRPM: 9100, maxRPM: 9350, revLimiterType: 'soft', starterTorque: 180,
    shiftRecommendation: { lightLoadRPM: 3000, highLoadRPM: 8500, throttleCurveExponent: 1,
      firstGearOffsetRPM: 100, minimumSpeedKmh: 10, hysteresisRPM: 180 },
    torqueCurve: [{ rpm: 1000, torque: 180 }, { rpm: 2000, torque: 300 }, { rpm: 3250, torque: 432 },
      { rpm: 4500, torque: 490 }, { rpm: 6000, torque: 540 }, { rpm: 7000, torque: 526 },
      { rpm: 8000, torque: 495 }, { rpm: 9000, torque: 445 }, { rpm: 9350, torque: 370 }] };
  const strategy = (light: number, full: number, brakeRPM: number): AutomaticShiftConfig => ({
    map: [{ throttle: 0, upshiftRPM: light, downshiftRPM: 1400 },
      { throttle: .3, upshiftRPM: light + 900, downshiftRPM: 2000 },
      { throttle: .65, upshiftRPM: 6500, downshiftRPM: 3200 },
      { throttle: 1, upshiftRPM: full, downshiftRPM: 5000 }],
    minimumUpshiftSpeeds: [5, 9, 13, 17, 22, 28], hysteresisRPM: 120, minimumTimeInGear: .45,
    kickdownThrottle: .75, kickdownTargetRPM: 6500, kickdownMaximumRPM: 8500, brakingDownshiftRPM: brakeRPM });
  c.transmission = { ...c.transmission, type: 'DCT', supportsManualSelection: true,
    manualAutoUpshiftAtRedline: true, manualSelectionTimeout: 12, shiftTime: .11,
    gearRatios: { 1: 3.077, 2: 2.185, 3: 1.626, 4: 1.286, 5: 1.028, 6: .839, 7: .693 },
    reverseRatio: -2.79, finalDrive: 5.143, finalDriveRatio: 5.143, efficiency: .94, drivetrainEfficiency: .94,
    drivetrainLash: { reversalTime: .035, torqueDeadzone: 8 },
    dct: { shiftStrategy: strategy(3000, 8750, 3500), clutchCapacity: 700, couplingStiffness: 14,
      clutchApplyRate: 3.5, clutchReleaseRate: 12, creepEngagement: .10, launchFullyEngagedSpeed: 5,
      unexpectedShiftDelay: .04, parkMaximumSpeed: .35, revMatching: { response: 4, maximumThrottle: .65 } } };
  c.rearDiff = { type: 'lsd', preload: 45, lockStrength: .16, torqueBiasRatio: 3,
    speedDifferenceSensitivity: .18, response: 12 };
  c.electronicDifferential = { slipThreshold: .17, speedDifferenceThreshold: .8, maximumBrakeTorque: 350, response: 10 };
  c.tires = { ...calibrateTyres(c.tires, 'PERFORMANCE'), wheelInertia: 1.65, loadSensitivity: .07,
    corneringStiffnessFront: 90000, corneringStiffnessRear: 116000, lateralSlipRecoveryRate: 8,
    peakSlipRatio: .10, peakSlipAngle: .12, gripFalloff: .30 };
  c.suspension = { ...c.suspension, rideHeight: .115, restLength: .30,
    kinematics: {
      front: { topology: 'DOUBLE_WISHBONE', staticCamber: -.018, camberGainPerMeter: -.46, staticToe: 0, bumpToeGainPerMeter: .005, antiDiveRatio: .18, antiSquatRatio: 0 },
      rear: { topology: 'MULTI_LINK', staticCamber: -.022, camberGainPerMeter: -.36, staticToe: .0006, bumpToeGainPerMeter: .020, antiDiveRatio: 0, antiSquatRatio: .18 },
    },
    springRateFront: 42000, springRateRear: 56000, damperCompressionFront: 2900, damperCompressionRear: 3400,
    damperReboundFront: 4300, damperReboundRear: 5000, suspensionTravel: .115,
    antiRollStiffnessFront: 14000, antiRollStiffnessRear: 17500, antiRollStiffness: 31500,
    adaptiveDamping: { responseRate: 3, modeMultipliers: { WET: .92, SPORT: 1, RACE: 1.12 } } };
  const angle = 30 * Math.PI / 180;
  c.steering = { ...c.steering, maxRoadWheelAngle: angle, maxSteeringAngle: angle, steeringRatio: 11.9,
    steeringWheelLock: angle * 11.9 * 2, steeringResponse: 4.2, steeringDamping: 13, steeringReturnRate: 6.5,
    highSpeedReferenceSpeed: 21, highSpeedMinimumAuthority: .20, ackermannFactor: .92,
    yawResponseScale: .47, maximumYawRate: 1.7 };
  c.brakes = { ...c.brakes, maxBrakeTorqueFront: 4100, maxBrakeTorqueRear: 2900,
    maxBrakeForce: 7000 / c.wheelRadius, frontBrakeBias: .586, pedalCurveExponent: 1.18,
    applyResponse: 16, releaseResponse: 22, response: 16, handbrakeTorque: 2500, maxHandbrakeForce: 2500 / c.wheelRadius };
  c.aero = { dragCoefficient: .33, frontalArea: 1.95, airDensity: 1.225,
    liftCoefficientFront: -.055, liftCoefficientRear: -.10 };
  c.driverAids = { ...c.driverAids, absEnabled: true, ebdEnabled: true, tractionControlEnabled: true,
    stabilityControlEnabled: true, autoBlipEnabled: true,
    tcs: { slipThresholdMultiplier: 1.55, maximumTorqueReduction: .90, response: 8, recoveryResponse: 3 },
    esc: { minimumSpeed: 3, yawErrorThreshold: .28, sideslipThreshold: .16, maximumBrakeGripFraction: .28, response: 10 } };
  const mode = (throttleExponent: number, throttleResponse: number, shiftStrategy: AutomaticShiftConfig,
    dctShiftTime: number, slip: number, yaw: number, sideslip: number): DriveModeCalibration => ({
    throttleExponent, throttleResponse, shiftStrategy, dctShiftTime, steeringResponse: 4.2, steeringDamping: 13,
    tcs: { ...c.driverAids.tcs!, slipThresholdMultiplier: slip },
    esc: { ...c.driverAids.esc!, yawErrorThreshold: yaw, sideslipThreshold: sideslip } });
  c.driveModes = { WET: mode(1.45, 5.5, strategy(2400, 8500, 2800), .15, 1.15, .18, .10),
    SPORT: mode(1, 9, strategy(3000, 8750, 3500), .11, 1.55, .28, .16),
    RACE: mode(.9, 11, strategy(3800, 8800, 4300), .08, 1.9, .38, .21) };
  c.defaultDriveMode = 'SPORT'; c.driveModeOrder = ['WET', 'SPORT', 'RACE'];
  c.capabilities = { cruiseControl: true, advancedInstrument: true };
  return c;
}
