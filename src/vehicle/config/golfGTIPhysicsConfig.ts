import { createTest7DCTVehiclePhysicsConfig } from './transmissionTestVehicleConfigs';
import { GOLF_GTI_DIMENSIONS } from '../VehicleDimensions';
import { createRoadAutoHoldConfig, createRoadParkingBrakeConfig } from './VehiclePlatformConfig';
import { createTyreThermalPressureConfig } from './TyreThermalPressureConfig';
import { createLateralAssistConfig } from '../control/LateralAssistController';
import { calibrateTyres } from './TyreCalibration';
import { VehicleControlPresets } from '../control/VehicleControlPresets';
import type { AutomaticShiftConfig, VehiclePhysicsConfig } from './VehiclePhysicsConfig';

const rad = (n: number) => n * Math.PI / 180;
const schedule = (up: number[], down: number[], kickdown: number, target: number): AutomaticShiftConfig => ({
  map: [0, .2, .45, .7, .9, 1].map((throttle, i) => ({ throttle, upshiftRPM: up[i]!, downshiftRPM: down[i]! })),
  minimumUpshiftSpeeds: [2.5, 4.2, 6.8, 9.5, 12.5, 16], hysteresisRPM: 180,
  minimumTimeInGear: .9, kickdownThrottle: kickdown, kickdownTargetRPM: target,
  kickdownMaximumRPM: 6100, maximumAutomaticRPM: 6500, minimumPostShiftRPM: 950,
  economicalShiftFactor: .96, liftHoldTime: 0,
});

/** 2.0T / wet 7DCT / front-wheel drive. Game calibration, not OEM certification. */
export function createGolfGTIPhysicsConfig(): VehiclePhysicsConfig {
  const c = createTest7DCTVehiclePhysicsConfig();
  c.controlCalibration = VehicleControlPresets.hotHatch;
  Object.assign(c, GOLF_GTI_DIMENSIONS, { mass: 1400, trackWidth: 1.527, frontWeightBias: .61,
    centerOfMassHeight: .49, yawInertia: 2320, enginePlacement: 'FRONT',
    drivetrainType: 'FWD', drivetrainLayout: 'FWD', frontTorqueSplit: 1, rearTorqueSplit: 0 });
  c.fuel = { tankCapacityL: 50, defaultFuelL: 35, fuelDensity: .745,
    peakThermalEfficiency: .33, referenceConsumptionLPer100km: 7.2 };
  const torqueCurve = [{ rpm: 800, torque: 110 }, { rpm: 1200, torque: 205 }, { rpm: 1600, torque: 320 },
    { rpm: 2000, torque: 350 }, { rpm: 4400, torque: 350 }, { rpm: 5000, torque: 335 },
    { rpm: 5800, torque: 290 }, { rpm: 6500, torque: 245 }, { rpm: 6700, torque: 195 }];
  c.engine = { ...c.engine, displacementL: 2, engineInertia: .32, idleRPM: 800,
    partThrottleExponent: .8, throttleResponse: 4.2, throttleResponseRate: 4.2, throttleReleaseResponse: 8.5,
    engineFrictionTorque: 14, engineBrakingStrength: 62, engineBraking: 74,
    idleControlStrength: 85, idleControlMaxTorque: 85, torqueRipple: .017,
    redlineWarningRPM: 6200, redlineRPM: 6500, revLimiterRPM: 6500, maxRPM: 6700, torqueCurve,
    ignitionSequence: { crankingDuration: .48, crankingRPM: 270, flareRPM: 1250, settlingDuration: .8, shutdownFriction: 30 },
    turbo: { ...c.engine.turbo!, inertia: .36, pressureGain: 1.25, maxPressureRatio: 2.12,
      turbineDriveStrength: 1.9,
      // Idle/low-speed operation is largely unboosted. Dividing the whole peak
      // envelope by boost pressure would understate a 2.0 L engine below spool.
      baseTorqueCurve: [{rpm:800,torque:95},{rpm:1200,torque:125},{rpm:1600,torque:155},
        {rpm:2000,torque:170},{rpm:4400,torque:172},{rpm:5000,torque:165},
        {rpm:5800,torque:143},{rpm:6500,torque:120},{rpm:6700,torque:96}] } };
  const eco = schedule([1450, 1750, 2250, 3200, 4800, 6100], [900, 1000, 1150, 1450, 1950, 2450], .96, 4200);
  const normal = schedule([1750, 2150, 2950, 4200, 5700, 6450], [950, 1100, 1450, 1850, 2400, 2900], .9, 4700);
  const sport = { ...schedule([2600, 3200, 4250, 5600, 6300, 6500], [1400, 1700, 2150, 2650, 3100, 3450], .82, 5200),
    liftHoldTime: 1.2, economicalShiftFactor: 1, brakingDownshiftRPM: 2400 };
  c.transmission = { ...c.transmission, gearRatios: { 1: 3.4, 2: 2.12, 3: 1.48, 4: 1.11, 5: .87, 6: .71, 7: .59 },
    finalDrive: 3.9, finalDriveRatio: 3.9, reverseRatio: -3.1, efficiency: .94, drivetrainEfficiency: .94, shiftTime: .18,
    dct: { ...c.transmission.dct!, shiftStrategy: normal, clutchCapacity: 430, couplingStiffness: 11,
      clutchApplyRate: 2.2, clutchReleaseRate: 9, creepEngagement: .10, launchFullyEngagedSpeed: 4.5,
      revMatching: { response: 5, maximumThrottle: .35 } } };
  c.steering = { ...c.steering, maxRoadWheelAngle: rad(33), maxSteeringAngle: rad(33),
    steeringRatio: 14.1, steeringWheelLock: rad(33 * 14.1 * 2), steeringResponse: 3.8,
    steeringDamping: 10.5, highSpeedReferenceSpeed: 19, highSpeedMinimumAuthority: .24 };
  c.suspension = { ...c.suspension, rideHeight: .135, restLength: .34, suspensionTravel: .145,
    springRateFront: 37000, springRateRear: 33000, damperCompressionFront: 2700, damperCompressionRear: 2450,
    damperReboundFront: 4150, damperReboundRear: 3750,
    antiRollStiffnessFront: 12000, antiRollStiffnessRear: 10500, antiRollStiffness: 22500,
    kinematics: { front: { ...c.suspension.kinematics!.front, staticCamber: rad(-.8) },
      rear: { ...c.suspension.kinematics!.rear, staticCamber: rad(-1.2), staticToe: .0007 } } };
  c.tires = { ...calibrateTyres(c.tires, 'PERFORMANCE'), wheelInertia: 1.18, rollingResistance: .0115,
    longitudinalGrip: 1.04, lateralGrip: 1.05, gripCoefficient: 1.04,
    corneringStiffnessFront: 86000, corneringStiffnessRear: 87500,
    peakSlipRatio: .105, peakSlipAngle: rad(7.3), gripFalloff: .34 };
  c.tires.thermalPressureFront = createTyreThermalPressureConfig(250);
  c.tires.thermalPressureRear = createTyreThermalPressureConfig(240);
  const force = 15700, bias = .68;
  c.brakes = { ...c.brakes, frontBrakeBias: bias, maxBrakeForce: force,
    maxBrakeTorqueFront: force * c.wheelRadius * bias, maxBrakeTorqueRear: force * c.wheelRadius * (1 - bias),
    pedalCurveExponent: 1.08, applyResponse: 13, response: 13, releaseResponse: 19 };
  c.aero = { ...c.aero, dragCoefficient: .31, frontalArea: 2.12, liftCoefficientFront: .025, liftCoefficientRear: .035 };
  c.frontDiff = { type: 'open' }; c.rearDiff = { type: 'open' };
  c.electronicDifferential = { slipThreshold: .13, speedDifferenceThreshold: 3.5, maximumBrakeTorque: 350, response: 8 };
  c.driverAids = { ...c.driverAids, absEnabled: true, ebdEnabled: true, tractionControlEnabled: true, stabilityControlEnabled: true,
    tcs: { slipThresholdMultiplier: 1.15, maximumTorqueReduction: .93, response: 8, recoveryResponse: 2.5 },
    esc: { yawErrorThreshold: .18, sideslipThreshold: .085, response: 10 } };
  c.driveModes = {
    ECO: { throttleExponent: 1.3, throttleResponse: 2.8, shiftStrategy: eco, dctShiftTime: .23, steeringResponse: 3.5, steeringDamping: 10 },
    NORMAL: { throttleExponent: 1, throttleResponse: 4.2, shiftStrategy: normal, dctShiftTime: .18, steeringResponse: 3.8, steeringDamping: 10.5 },
    SPORT: { throttleExponent: .88, throttleResponse: 5.2, shiftStrategy: sport, dctShiftTime: .15, steeringResponse: 4.2, steeringDamping: 11.5 },
  };
  c.driveModeOrder = ['ECO', 'NORMAL', 'SPORT']; c.defaultDriveMode = 'NORMAL';
  c.parkingBrake = createRoadParkingBrakeConfig(c.brakes.handbrakeTorque); c.autoHold = createRoadAutoHoldConfig();
  c.lateralAssist = createLateralAssistConfig();
  c.capabilities = { ...c.capabilities, cruiseControl: true, tpms: true };
  return c;
}
