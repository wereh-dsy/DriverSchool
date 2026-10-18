import { createDefaultVehiclePhysicsConfig } from './defaultVehiclePhysicsConfig';
import { createLateralAssistConfig } from '../control/LateralAssistController';
import { createRoadAutoHoldConfig, createRoadParkingBrakeConfig } from './VehiclePlatformConfig';
import { FAMILY_CONVERTER_CONFIG } from './transmissionTestVehicleConfigs';
import { calibrateTyres } from './TyreCalibration';
import { createTyreThermalPressureConfig } from './TyreThermalPressureConfig';
import { MERCEDES_E300L_DIMENSIONS } from '../VehicleDimensions';
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
  hysteresisRPM: 150, minimumTimeInGear: 1.35, kickdownThrottle: kickdown, kickdownTargetRPM: target,
  kickdownMaximumRPM: 5900, gearRPMCorrections: [90, 30, 0, 0, 0, 0, 0, 0],
  maximumAutomaticRPM: 6150, minimumPostShiftRPM: 900,
  liftHoldTime: 0, economicalShiftFactor: .93,
  ...extra,
});

/**
 * 2026 Mercedes-Benz E 300 L 尊贵型 (V214, China long wheelbase).
 *
 * Modelled as a 2.0-litre turbocharged inline four, longitudinal nine-speed
 * torque-converter automatic and rear-wheel drive. The real car's 48 V mild
 * hybrid is deliberately not simulated: this configuration produces no electric
 * telemetry, state of charge or motor torque, and the combustion curve, inertia,
 * converter, ratios and shift schedule carry the whole driving character.
 */
export function createMercedesE300LPhysicsConfig(): VehiclePhysicsConfig {
  const c = createDefaultVehiclePhysicsConfig();
  c.lateralAssist = createLateralAssistConfig();
  Object.assign(c, MERCEDES_E300L_DIMENSIONS, {
    mass: 1950, trackWidth: 1.613, frontWeightBias: .52,
    centerOfMassHeight: .52, enginePlacement: 'FRONT',
    // Long-wheelbase body with a longitudinal powertrain and a heavy rear axle.
    yawInertia: 4380,
    drivetrainType: 'RWD', drivetrainLayout: 'RWD', frontTorqueSplit: 0, rearTorqueSplit: 1,
  });
  c.fuel = { tankCapacityL: 66, defaultFuelL: 46, fuelDensity: .745,
    peakThermalEfficiency: .345, referenceConsumptionLPer100km: 7.9 };
  c.engine = { ...c.engine, layout: 'INLINE', cylinderCount: 4, displacementL: 2,
    // Deliberately unhurried: a large turbo four with a heavy crank feels slower
    // to pick up than a hot hatch, and settles to a quiet idle.
    engineInertia: .43, idleRPM: 700, stallRPM: 400, torqueRipple: .010,
    soundProfile: 'full-bodied',
    partThrottleExponent: .82,
    throttleResponse: 2.7, throttleResponseRate: 2.7, throttleReleaseResponse: 6.2,
    engineFrictionTorque: 17, engineBrakingStrength: 58, engineBraking: 75,
    idleControlStrength: 74, idleControlMaxTorque: 74, idleControlBandRPM: 230,
    redlineWarningRPM: 5900, redlineRPM: 6250, revLimiterRPM: 6250, maxRPM: 6450,
    revHang: { ...c.engine.revHang!, enabled: false },
    ignitionSequence: { crankingDuration: .62, crankingRPM: 240, flareRPM: 1020, settlingDuration: 1.05, shutdownFriction: 26 },
    torqueCurve: [
      { rpm: 700, torque: 128 }, { rpm: 1000, torque: 208 }, { rpm: 1250, torque: 292 },
      { rpm: 1500, torque: 352 }, { rpm: 1800, torque: 390 }, { rpm: 2000, torque: 400 },
      { rpm: 3200, torque: 400 }, { rpm: 3800, torque: 392 }, { rpm: 4500, torque: 375 },
      { rpm: 5000, torque: 362 }, { rpm: 5500, torque: 336 }, { rpm: 5800, torque: 318 },
      { rpm: 6000, torque: 302 }, { rpm: 6250, torque: 270 }, { rpm: 6450, torque: 234 },
    ],
    turbo: { enabled: true, inertia: .46, pressureGain: 1.20, maxPressureRatio: 2.06,
      turbineDriveStrength: 1.78, compressorLoadStrength: .17, friction: .16, wastegateGain: 5,
      baseTorqueCurve: [
        // Unboosted volumetric efficiency stays comparatively strong down low,
        // which is what lets the turbo four pull cleanly off idle instead of
        // bogging until the boost arrives.
        { rpm: 700, torque: 106 }, { rpm: 1000, torque: 152 }, { rpm: 1250, torque: 190 },
        { rpm: 1500, torque: 220 }, { rpm: 1800, torque: 235 }, { rpm: 2000, torque: 240 },
        { rpm: 3200, torque: 240 }, { rpm: 3800, torque: 232 }, { rpm: 4500, torque: 218 },
        { rpm: 5000, torque: 208 }, { rpm: 5500, torque: 188 }, { rpm: 5800, torque: 176 },
        { rpm: 6000, torque: 166 }, { rpm: 6250, torque: 148 }, { rpm: 6450, torque: 126 },
      ] },
  };
  // Calm everyday schedule: lifts early under light pedal and holds a tall gear
  // while cruising, but still has a real kickdown window.
  const normal = shift([1620, 1850, 2350, 3500, 4800, 6000], [820, 900, 1150, 1550, 2050, 2500], .93, 4300);
  c.transmission = { ...c.transmission, type: 'TORQUE_CONVERTER_AT', supportsManualSelection: true,
    manualAutoUpshiftAtRedline: true, manualSelectionTimeout: 8,
    // 9G-TRONIC step ratios. Ninth is a genuine tall overdrive.
    gearRatios: { 1: 5.354, 2: 3.243, 3: 2.252, 4: 1.631, 5: 1.211, 6: 1, 7: .865, 8: .717, 9: .601 },
    reverseRatio: -4.13, finalDrive: 3.07, finalDriveRatio: 3.07,
    efficiency: .91, drivetrainEfficiency: .91,
    // A torque-converter step takes longer than a dual clutch, but loses less.
    shiftTime: .34, reverseLockoutSpeed: 1,
    automatic: { parkMaximumSpeed: .35, shiftTorqueFactor: .84, shiftStrategy: normal,
      converter: { ...FAMILY_CONVERTER_CONFIG,
        // Matched to a 400 Nm four: a small family-car unit would slip far too
        // long and quench the launch before the engine reached its plateau.
        pumpTorqueCoefficient: .0106, maximumPumpTorque: 620, lockupCapacity: 620,
        lockupStiffness: 11.5, lockupApplyRate: .78, lockupReleaseRate: 4.2,
        lockupMinimumSpeed: 9, lockupMinimumSpeedRatio: .70, lockupMaximumThrottle: 1,
        backdriveCoupling: .44,
        torqueRatioCurve: [{ speedRatio: 0, torqueRatio: 2.02 }, { speedRatio: .5, torqueRatio: 1.48 },
          { speedRatio: .8, torqueRatio: 1.12 }, { speedRatio: 1, torqueRatio: 1 }] } } };
  const force = 19500;
  c.brakes = { ...c.brakes, pedalCurveExponent: 1.14, applyResponse: 9.6, response: 9.6,
    releaseResponse: 16.5, frontBrakeBias: .64, maxBrakeForce: force,
    maxBrakeTorqueFront: force * c.wheelRadius * .64, maxBrakeTorqueRear: force * c.wheelRadius * .36,
    handbrakeTorque: 8300 * c.wheelRadius, maxHandbrakeForce: 8300 };
  c.steering = { ...c.steering, maxRoadWheelAngle: rad(34), maxSteeringAngle: rad(34),
    // Direct-ratio rack with speed-sensitive authority; light at parking speed,
    // clearly tighter around the centre at motorway speed.
    steeringRatio: 15.9, steeringWheelLock: rad(34 * 15.9 * 2), steeringResponse: 3.15,
    steeringDamping: 10.4, steeringReturnRate: 4.9,
    returnProfile: { lowSpeedRate: .60, highSpeedRate: 4.9, speedReference: 13 },
    highSpeedReferenceSpeed: 20, highSpeedMinimumAuthority: .20, ackermannFactor: .92 };
  c.suspension = { ...c.suspension, rideHeight: .148, restLength: .368,
    springRateFront: 37200, springRateRear: 35800,
    damperCompressionFront: 2720, damperCompressionRear: 2640,
    damperReboundFront: 4080, damperReboundRear: 3980, suspensionTravel: .165,
    antiRollStiffnessFront: 14800, antiRollStiffnessRear: 11800, antiRollStiffness: 26600,
    // Comfort-biased adaptive dampers: ECO relaxes them, SPORT tightens body
    // control without turning the car into a sports saloon.
    adaptiveDamping: { responseRate: 3.1, modeMultipliers: { ECO: .88, NORMAL: 1, SPORT: 1.34 } },
    kinematics: {
      front: { topology: 'MULTI_LINK', staticCamber: -.010, camberGainPerMeter: -.34,
        staticToe: 0, bumpToeGainPerMeter: .008, antiDiveRatio: .16, antiSquatRatio: .06 },
      rear: { topology: 'MULTI_LINK', staticCamber: -.018, camberGainPerMeter: -.30,
        staticToe: .0010, bumpToeGainPerMeter: .016, antiDiveRatio: 0, antiSquatRatio: .16 },
    } };
  c.tires = calibrateTyres({ ...c.tires, wheelInertia: 1.78, rollingResistance: .0115,
    loadSensitivity: .05, longitudinalGrip: 1.04, lateralGrip: 1.05, gripCoefficient: 1.04,
    peakSlipRatio: .105, peakSlipAngle: rad(7.2), gripFalloff: .32 }, 'PREMIUM_TOURING');
  // The wider rear 275 section carries a little more cornering capacity through
  // the existing axle stiffness calibration, not a grip multiplier.
  c.tires.corneringStiffnessFront = 96000;
  c.tires.corneringStiffnessRear = 112000;
  c.aero = { ...c.aero, dragCoefficient: .23, frontalArea: 2.30,
    liftCoefficientFront: .008, liftCoefficientRear: .012 };
  c.driverAids = { ...c.driverAids, absEnabled: true, ebdEnabled: true, tractionControlEnabled: true,
    stabilityControlEnabled: true,
    tcs: { slipThresholdMultiplier: 1.32, maximumTorqueReduction: .88, response: 6.4, recoveryResponse: 2.4 },
    esc: { yawErrorThreshold: .16, sideslipThreshold: .085, response: 9 } };
  c.driveModes = {
    // Softer pedal ramp and earlier shifts, but the first third of the pedal
    // still moves the car normally.
    ECO: { throttleExponent: 1.24, throttleResponse: 2.35,
      shiftStrategy: shift([1380, 1560, 2050, 3000, 4150, 5750], [760, 820, 980, 1250, 1700, 2150], .96, 4100),
      steeringResponse: 2.9, steeringDamping: 9.8 },
    NORMAL: { throttleExponent: 1, throttleResponse: 2.7, shiftStrategy: normal,
      steeringResponse: 3.15, steeringDamping: 10.4 },
    SPORT: { throttleExponent: .90, throttleResponse: 3.9,
      shiftStrategy: { ...shift([2250, 2750, 3800, 5050, 5850, 6200], [1150, 1350, 1750, 2250, 2700, 3050], .89, 4700),
        liftHoldTime: 1.3, economicalShiftFactor: 1 }, steeringResponse: 3.6, steeringDamping: 11.6 },
  };
  c.frontDiff = { type: 'open' }; c.rearDiff = { type: 'open' };
  c.parkingBrake = createRoadParkingBrakeConfig(c.brakes.handbrakeTorque);
  c.autoHold = createRoadAutoHoldConfig();
  c.startStop = { enabledByDefault: false, minimumStopDelay: 1.8, stopSpeedThreshold: .06, brakeThreshold: .24,
    restartThrottleThreshold: .1, restartBrakeReleaseThreshold: .08, restartDelay: .22 };
  c.capabilities = { ...c.capabilities, tpms: true };
  c.tires.thermalPressureFront = createTyreThermalPressureConfig(250, { thermalCapacity: 34000 });
  c.tires.thermalPressureRear = createTyreThermalPressureConfig(270, { thermalCapacity: 36000 });
  return c;
}
