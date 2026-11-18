import { createDefaultVehiclePhysicsConfig } from './defaultVehiclePhysicsConfig';
import { VehicleControlPresets } from '../control/VehicleControlPresets';
import { createLateralAssistConfig } from '../control/LateralAssistController';
import { createRoadAutoHoldConfig, createRoadParkingBrakeConfig } from './VehiclePlatformConfig';
import { FAMILY_CONVERTER_CONFIG } from './transmissionTestVehicleConfigs';
import { calibrateTyres } from './TyreCalibration';
import { createTyreThermalPressureConfig } from './TyreThermalPressureConfig';
import { MAYBACH_S680_DIMENSIONS } from '../VehicleDimensions';
import type { AutomaticShiftConfig, VehiclePhysicsConfig } from './VehiclePhysicsConfig';

const rad = (v: number): number => v * Math.PI / 180;

/**
 * Six-point pedal/throttle schedule shared by the three drive modes. Each mode
 * supplies its own upshift/downshift columns, so the transmission behaviour is
 * calibration, not a second gearbox.
 */
const shift = (up: readonly number[], down: readonly number[], kickdown: number, target: number,
  extra: Partial<AutomaticShiftConfig> = {}): AutomaticShiftConfig => ({
  map: [0, .2, .45, .7, .9, 1].map((throttle, i) => ({ throttle,
    upshiftRPM: up[i] ?? up[up.length - 1]!, downshiftRPM: down[i] ?? down[down.length - 1]! })),
  minimumUpshiftSpeeds: [2.4, 4.2, 6.4, 8.8, 11.4, 14.2, 17.4, 20.6],
  hysteresisRPM: 180, minimumTimeInGear: 1.8, kickdownThrottle: kickdown, kickdownTargetRPM: target,
  kickdownMaximumRPM: 5800, gearRPMCorrections: [90, 30, 0, 0, 0, 0, 0, 0],
  maximumAutomaticRPM: 6100, minimumPostShiftRPM: 850,
  liftHoldTime: 0, economicalShiftFactor: .93,
  ...extra,
});

/** Z223 V12 S 680. Public envelope/rating; all chassis, converter, thermal and
 * acoustic calibration is an engineering estimate (see docs/MAYBACH_S680.md).
 * Independent ICE configuration: no ISG, battery or electric drive units. */
export function createMaybachS680PhysicsConfig(): VehiclePhysicsConfig {
  const c = createDefaultVehiclePhysicsConfig();
  c.controlCalibration = { ...structuredClone(VehicleControlPresets.luxuryExecutive),
    drivetrain: { nominalRearRatio: .69, accelerationRearRatio: .69,
      minimumRearRatio: .69, maximumRearRatio: .69, corneringBias: 0, stabilityGain: 0,
      response: 3, rateLimit: .20 } };
  c.lateralAssist = createLateralAssistConfig();
  Object.assign(c, MAYBACH_S680_DIMENSIONS, {
    // 2575 kg at default 90% fuel; config mass excludes consumables.
    mass: 2524, trackWidth: 1.6715, frontWeightBias: .53,
    centerOfMassHeight: .56, enginePlacement: 'FRONT', yawInertia: 6550,
    drivetrainType: 'AWD', drivetrainLayout: 'AWD', frontTorqueSplit: .31, rearTorqueSplit: .69,
  });
  c.awd = { mode: 'full-time', accelerationRearTorqueSplit: .69, maximumRearTorqueSplit: .69, response: 3 };
  c.fuel = { tankCapacityL: 76, defaultFuelL: 68.4, fuelDensity: .745,
    peakThermalEfficiency: .32, referenceConsumptionLPer100km: 14.1 };
  c.engine = { ...c.engine, layout: 'V', cylinderCount: 12, bankAngle: rad(60), displacementL: 5.980,
    ratedNetPowerW: 450000, torqueCurveIsNet: true, engineInertia: .65, idleRPM: 650, stallRPM: 350, torqueRipple: .0025,
    soundProfile: 'full-bodied', partThrottleExponent: 1.06,
    throttleResponse: 3.2, throttleResponseRate: 3.2, throttleReleaseResponse: 4.6,
    engineFrictionTorque: 35, engineBrakingStrength: 95, engineBraking: 115,
    idleControlStrength: 150, idleControlMaxTorque: 150, idleControlBandRPM: 230,
    redlineWarningRPM: 5800, redlineRPM: 6200, revLimiterRPM: 6200, maxRPM: 6400,
    revHang: { ...c.engine.revHang!, enabled: false },
    ignitionSequence: { crankingDuration: .80, crankingRPM: 190, flareRPM: 920, settlingDuration: 1.25, shutdownFriction: 45 },
    thermal: { initialTemperatureC: 20, heatCapacityJPerK: 420000, heatFraction: .30,
      coolingWPerK: 210, airflowCoolingWPerKPerMps: 12, derateStartC: 115, derateEndC: 135, minimumTorqueFactor: .50 },
    torqueCurve: [
      { rpm: 650, torque: 260 }, { rpm: 1000, torque: 440 }, { rpm: 1400, torque: 650 },
      { rpm: 1800, torque: 840 }, { rpm: 2000, torque: 900 }, { rpm: 4000, torque: 900 },
      { rpm: 4500, torque: 875 }, { rpm: 5000, torque: 845 }, { rpm: 5250, torque: 818.5 }, { rpm: 5500, torque: 781 },
      { rpm: 6000, torque: 680 }, { rpm: 6100, torque: 655 }, { rpm: 6200, torque: 625 }, { rpm: 6400, torque: 565 },
    ],
    // Two turbos represented by one equivalent shaft, not two torque sources.
    turbo: { enabled: true, inertia: .10, pressureGain: 1.18, maxPressureRatio: 2.15,
      turbineDriveStrength: 4.5, compressorLoadStrength: .17, friction: .16, wastegateGain: 5,
      baseTorqueCurve: [
        { rpm: 650, torque: 235 }, { rpm: 1000, torque: 345 }, { rpm: 1400, torque: 405 },
        { rpm: 1800, torque: 440 }, { rpm: 2000, torque: 450 }, { rpm: 4000, torque: 450 },
        { rpm: 4500, torque: 440 }, { rpm: 5000, torque: 425 }, { rpm: 5500, torque: 393 },
        { rpm: 6000, torque: 342 }, { rpm: 6100, torque: 330 }, { rpm: 6200, torque: 315 }, { rpm: 6400, torque: 285 },
      ] },
  };
  // Calm everyday schedule: lifts early under light pedal and holds a tall gear
  // while cruising, but still has a real kickdown window.
  const normal = shift([1450, 1700, 2200, 3250, 4650, 5500], [760, 850, 1050, 1400, 1850, 2300], .94, 4100);
  c.transmission = { ...c.transmission, type: 'TORQUE_CONVERTER_AT', supportsManualSelection: true,
    manualAutoUpshiftAtRedline: true, manualSelectionTimeout: 8,
    // 9G-TRONIC step ratios. Ninth is a genuine tall overdrive.
    gearRatios: { 1: 5.354, 2: 3.243, 3: 2.252, 4: 1.631, 5: 1.211, 6: 1, 7: .865, 8: .717, 9: .601 },
    reverseRatio: -4.13, finalDrive: 2.82, finalDriveRatio: 2.82,
    efficiency: .91, drivetrainEfficiency: .91,
    // A torque-converter step takes longer than a dual clutch, but loses less.
    shiftTime: .42, reverseLockoutSpeed: 1,
    automatic: { parkMaximumSpeed: .35, shiftTorqueFactor: .92, shiftThrottleFactor: .84,
      shiftStrategy: structuredClone(normal), smoothRatioShift: true,
      thermal: { initialTemperatureC: 20, heatCapacityJPerK: 110000, coolingWPerK: 95,
        airflowCoolingWPerKPerMps: 5, derateStartC: 125, derateEndC: 155, minimumTorqueFactor: .5 },
      converter: { ...FAMILY_CONVERTER_CONFIG,
        // High-capacity V12 converter; progressive lockup retains low-speed isolation.
        hydraulicResponseRate: 3,
        pumpTorqueCoefficient: .019, maximumPumpTorque: 1250, lockupCapacity: 1250,
        lockupStiffness: 16, lockupApplyRate: .60, lockupReleaseRate: 3.2,
        lockupMinimumSpeed: 10, lockupMinimumSpeedRatio: .76, lockupMaximumThrottle: 1,
        backdriveCoupling: .40,
        torqueRatioCurve: [{ speedRatio: 0, torqueRatio: 2.02 }, { speedRatio: .5, torqueRatio: 1.48 },
          { speedRatio: .8, torqueRatio: 1.12 }, { speedRatio: 1, torqueRatio: 1 }] } } };
  const force = 27500;
  c.brakes = { ...c.brakes, pedalCurveExponent: 1.14, applyResponse: 8.8, response: 8.8,
    releaseResponse: 16.5, frontBrakeBias: .64, maxBrakeForce: force,
    maxBrakeTorqueFront: force * c.wheelRadius * .64, maxBrakeTorqueRear: force * c.wheelRadius * .36,
    handbrakeTorque: 8300 * c.wheelRadius, maxHandbrakeForce: 8300 };
  c.steering = { ...c.steering, maxRoadWheelAngle: rad(34), maxSteeringAngle: rad(34),
    // Direct-ratio rack with speed-sensitive authority; light at parking speed,
    // clearly tighter around the centre at motorway speed.
    steeringRatio: 16.8, steeringWheelLock: rad(34 * 16.8 * 2), steeringResponse: 3.15,
    steeringDamping: 10.4, steeringReturnRate: 4.9,
    returnProfile: { lowSpeedRate: .60, highSpeedRate: 4.9, speedReference: 13 },
    highSpeedReferenceSpeed: 20, highSpeedMinimumAuthority: .20, ackermannFactor: .92,
    rearAxle: { maximumAngle: rad(4.5), lowSpeedRatio: -.22, highSpeedRatio: .11,
      transitionStartSpeed: 8, transitionEndSpeed: 22, response: 3 } };
  c.suspension = { ...c.suspension, rideHeight: .145, restLength: .410, bumpStopStiffness: 240000,
    springRateFront: 34000, springRateRear: 32000, unsprungMass: { front: 54, rear: 56 },
    damperCompressionFront: 2450, damperCompressionRear: 2300,
    damperReboundFront: 3900, damperReboundRear: 3700, suspensionTravel: .210,
    antiRollStiffnessFront: 19500, antiRollStiffnessRear: 14500, antiRollStiffness: 34000,
    adaptiveDamping: { responseRate: 2.4, modeMultipliers: { NORMAL: 1, SPORT: 1.25, MAYBACH: .88 } },
    airSuspension: { nominalRideHeight: .145, minimumOffset: -.020, maximumOffset: .015,
      adjustmentRate: .006, modeOffsets: { NORMAL: 0, SPORT: -.012, MAYBACH: .008 },
      highSpeedLowering: { activateSpeed: 33.33, restoreSpeed: 25, delay: 8, offset: -.015 } },
    kinematics: {
      front: { topology: 'MULTI_LINK', staticCamber: -.010, camberGainPerMeter: -.32,
        staticToe: 0, bumpToeGainPerMeter: .006, antiDiveRatio: .20, antiSquatRatio: .06 },
      rear: { topology: 'MULTI_LINK', staticCamber: -.018, camberGainPerMeter: -.28,
        staticToe: .001, bumpToeGainPerMeter: .012, antiDiveRatio: 0, antiSquatRatio: .20 },
    } };
  c.tires = { ...calibrateTyres(c.tires, 'PREMIUM_TOURING'), wheelInertia: 2.25, rollingResistance: .0108,
    loadSensitivity: .05, longitudinalGrip: 1.04, lateralGrip: 1.04, gripCoefficient: 1.04,
    corneringStiffnessFront: 125000, corneringStiffnessRear: 133000,
    peakSlipRatio: .105, peakSlipAngle: rad(7.4), gripFalloff: .32 };
  c.aero = { ...c.aero, dragCoefficient: .29, frontalArea: 2.51,
    liftCoefficientFront: .006, liftCoefficientRear: .008 };
  c.driverAids = { ...c.driverAids, absEnabled: true, ebdEnabled: true, tractionControlEnabled: true,
    stabilityControlEnabled: true,
    tcs: { slipThresholdMultiplier: 1.32, maximumTorqueReduction: .88, response: 6.4, recoveryResponse: 2.4 },
    esc: { yawErrorThreshold: .16, sideslipThreshold: .085, response: 9 } };
  c.defaultDriveMode = 'NORMAL'; c.driveModeOrder = ['NORMAL', 'SPORT', 'MAYBACH'];
  c.driveModes = {
    NORMAL: { throttleExponent: 1.24, throttleResponse: 3.2, shiftStrategy: normal,
      steeringResponse: 3, steeringDamping: 10.4 },
    SPORT: { throttleExponent: 1.04, throttleResponse: 4.2,
      shiftStrategy: shift([2000, 2500, 3350, 4450, 5450, 6050], [1000, 1150, 1500, 1950, 2400, 2700], .90, 4500,
        { liftHoldTime: .8, minimumTimeInGear: 1.5, economicalShiftFactor: 1 }),
      steeringResponse: 3.4, steeringDamping: 11.4 },
    MAYBACH: { throttleExponent: 1.30, throttleResponse: 1.8,
      shiftStrategy: shift([1300, 1500, 1950, 2850, 4200, 5750], [720, 780, 920, 1200, 1650, 2100], .98, 3900,
        { minimumTimeInGear: 2.2, hysteresisRPM: 210, launchGear: 2 }), steeringResponse: 2.7, steeringDamping: 10 },
  };
  c.frontDiff = { type: 'open' }; c.rearDiff = { type: 'open' };
  c.parkingBrake = createRoadParkingBrakeConfig(c.brakes.handbrakeTorque);
  c.autoHold = createRoadAutoHoldConfig();
  // Mode mutation must not retain Maybach's optional second-gear launch.
  for (const mode of ['NORMAL', 'SPORT'] as const) c.driveModes[mode]!.shiftStrategy!.launchGear = 1;
  c.capabilities = { ...c.capabilities, tpms: true };
  c.tires.thermalPressureFront = createTyreThermalPressureConfig(260, { thermalCapacity: 42000 });
  c.tires.verticalCompliance = { stiffness: 230000, damping: 2600, maximumCompression: .055 };
  c.tires.thermalPressureRear = createTyreThermalPressureConfig(280, { thermalCapacity: 44000 });
  return c;
}
