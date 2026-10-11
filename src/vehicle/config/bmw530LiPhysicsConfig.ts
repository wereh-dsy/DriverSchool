import { createDefaultVehiclePhysicsConfig } from './defaultVehiclePhysicsConfig';
import { createRoadAutoHoldConfig, createRoadParkingBrakeConfig } from './VehiclePlatformConfig';
import { FAMILY_CONVERTER_CONFIG } from './transmissionTestVehicleConfigs';
import { calibrateTyres } from './TyreCalibration';
import { BMW_530LI_DIMENSIONS } from '../VehicleDimensions';
import type { AutomaticShiftConfig, VehiclePhysicsConfig } from './VehiclePhysicsConfig';

const rad = (v: number) => v * Math.PI / 180;
const shift = (up: number[], down: number[], kickdown: number, target: number): AutomaticShiftConfig => ({
  map: [0, .25, .6, 1].map((throttle, i) => ({ throttle, upshiftRPM: up[i]!, downshiftRPM: down[i]! })),
  minimumUpshiftSpeeds: [2.6, 4.5, 6.8, 9, 12, 15, 18], hysteresisRPM: 170,
  minimumTimeInGear: 1.2, kickdownThrottle: kickdown, kickdownTargetRPM: target,
  kickdownMaximumRPM: 6100, gearRPMCorrections: [100, 40, 0, 0, 0, 0, 0, 0],
});

/** G38 LCI, 2.0T / longitudinal 8AT / RWD. Simulation calibration, not an M car. */
export function createBMW530LiPhysicsConfig(): VehiclePhysicsConfig {
  const c = createDefaultVehiclePhysicsConfig();
  Object.assign(c, BMW_530LI_DIMENSIONS, { mass: 1745, trackWidth: 1.6175,
    frontWeightBias: .51, centerOfMassHeight: .50, enginePlacement: 'FRONT_MID',
    // Body-sized polar inertia, with allowance for the centralised powertrain.
    yawInertia: 3820, drivetrainType: 'RWD', drivetrainLayout: 'RWD', frontTorqueSplit: 0, rearTorqueSplit: 1 });
  c.fuel = { tankCapacityL: 68, defaultFuelL: 47.6, fuelDensity: .745,
    peakThermalEfficiency: .34, referenceConsumptionLPer100km: 8 };
  c.engine = { ...c.engine, layout: 'INLINE', cylinderCount: 4, displacementL: 2,
    engineInertia: .39, idleRPM: 750, stallRPM: 430, torqueRipple: .012,
    partThrottleExponent: 1, throttleResponse: 3.4, throttleResponseRate: 3.4, throttleReleaseResponse: 7,
    engineFrictionTorque: 15, engineBrakingStrength: 65, engineBraking: 80,
    idleControlStrength: 90, idleControlMaxTorque: 90, idleControlBandRPM: 260,
    redlineWarningRPM: 6200, redlineRPM: 6500, revLimiterRPM: 6500, maxRPM: 6700,
    revHang: { ...c.engine.revHang!, enabled: false },
    ignitionSequence: { crankingDuration: .55, crankingRPM: 260, flareRPM: 1100, settlingDuration: .9, shutdownFriction: 30 },
    torqueCurve: [{ rpm: 750, torque: 115 }, { rpm: 1200, torque: 235 }, { rpm: 1600, torque: 325 },
      { rpm: 2000, torque: 350 }, { rpm: 4500, torque: 350 }, { rpm: 5200, torque: 330 },
      { rpm: 6000, torque: 285 }, { rpm: 6500, torque: 245 }, { rpm: 6700, torque: 195 }],
    turbo: { enabled: true, inertia: .43, pressureGain: 1.25, maxPressureRatio: 2.1,
      turbineDriveStrength: 1.9, compressorLoadStrength: .18, friction: .15, wastegateGain: 5,
      baseTorqueCurve: [{ rpm: 750, torque: 95 }, { rpm: 1200, torque: 125 }, { rpm: 1600, torque: 155 },
        { rpm: 2000, torque: 170 }, { rpm: 4500, torque: 172 }, { rpm: 5200, torque: 162 },
        { rpm: 6000, torque: 140 }, { rpm: 6500, torque: 120 }, { rpm: 6700, torque: 96 }] } };
  const normal = shift([1500, 1850, 3400, 6100], [850, 1050, 1600, 2600], .84, 4100);
  c.transmission = { ...c.transmission, type: 'TORQUE_CONVERTER_AT', supportsManualSelection: true,
    manualAutoUpshiftAtRedline: true, manualSelectionTimeout: 8,
    gearRatios: { 1: 5, 2: 3.2, 3: 2.143, 4: 1.72, 5: 1.314, 6: 1, 7: .822, 8: .64 },
    reverseRatio: -3.456, finalDrive: 2.929, finalDriveRatio: 2.929,
    efficiency: .92, drivetrainEfficiency: .92, shiftTime: .25, reverseLockoutSpeed: 1,
    automatic: { parkMaximumSpeed: .35, shiftTorqueFactor: .80, shiftStrategy: normal,
      converter: { ...FAMILY_CONVERTER_CONFIG,
        torqueRatioCurve: FAMILY_CONVERTER_CONFIG.torqueRatioCurve.map(p => ({ ...p })),
        pumpTorqueCoefficient: .0058, maximumPumpTorque: 450, lockupCapacity: 460,
        lockupStiffness: 11, lockupApplyRate: .8, lockupMinimumSpeed: 9,
        lockupMinimumSpeedRatio: .78, lockupMaximumThrottle: .65 } } };
  const force = 19000;
  c.brakes = { ...c.brakes, pedalCurveExponent: 1.17, applyResponse: 10.5, response: 10.5,
    releaseResponse: 17, frontBrakeBias: .63, maxBrakeForce: force,
    maxBrakeTorqueFront: force * c.wheelRadius * .63, maxBrakeTorqueRear: force * c.wheelRadius * .37,
    handbrakeTorque: 7800 * c.wheelRadius, maxHandbrakeForce: 7800 };
  c.steering = { ...c.steering, maxRoadWheelAngle: rad(33), maxSteeringAngle: rad(33),
    steeringRatio: 16.2, steeringWheelLock: rad(33 * 16.2 * 2), steeringResponse: 3.3,
    steeringDamping: 10, steeringReturnRate: 5.1,
    returnProfile: { lowSpeedRate: .55, highSpeedRate: 5.1, speedReference: 14 },
    highSpeedReferenceSpeed: 19, highSpeedMinimumAuthority: .21, ackermannFactor: .9 };
  c.suspension = { ...c.suspension, rideHeight: .145, restLength: .36,
    springRateFront: 38500, springRateRear: 37500,
    damperCompressionFront: 3000, damperCompressionRear: 2900,
    damperReboundFront: 4450, damperReboundRear: 4350, suspensionTravel: .16,
    antiRollStiffnessFront: 14500, antiRollStiffnessRear: 12500, antiRollStiffness: 27000,
    kinematics: {
      front: { topology: 'DOUBLE_WISHBONE', staticCamber: -.009, camberGainPerMeter: -.38,
        staticToe: 0, bumpToeGainPerMeter: .007, antiDiveRatio: .18, antiSquatRatio: .05 },
      rear: { topology: 'MULTI_LINK', staticCamber: -.016, camberGainPerMeter: -.32,
        staticToe: .0007, bumpToeGainPerMeter: .017, antiDiveRatio: 0, antiSquatRatio: .18 },
    } };
  c.tires = calibrateTyres({ ...c.tires, wheelInertia: 1.6, rollingResistance: .0115,
    longitudinalGrip: 1.02, lateralGrip: 1.03, gripCoefficient: 1.02,
    corneringStiffnessFront: 99000, corneringStiffnessRear: 105000,
    peakSlipRatio: .105, peakSlipAngle: rad(7.5), gripFalloff: .33 }, 'PREMIUM_TOURING');
  c.aero = { ...c.aero, dragCoefficient: .27, frontalArea: 2.28,
    liftCoefficientFront: .01, liftCoefficientRear: .013 };
  c.driverAids = { ...c.driverAids, absEnabled: true, ebdEnabled: true, tractionControlEnabled: true,
    stabilityControlEnabled: true, tcs: { slipThresholdMultiplier: 1.12, maximumTorqueReduction: .95,
      response: 8, recoveryResponse: 2 }, esc: { yawErrorThreshold: .15, sideslipThreshold: .08, response: 10 } };
  c.driveModes = {
    ECO: { throttleExponent: 1.3, throttleResponse: 2.5,
      shiftStrategy: shift([1350, 1600, 2800, 5850], [800, 900, 1350, 2200], .95, 3400), steeringResponse: 3, steeringDamping: 9.5 },
    NORMAL: { throttleExponent: 1, throttleResponse: 3.4, shiftStrategy: normal, steeringResponse: 3.3, steeringDamping: 10 },
    SPORT: { throttleExponent: .88, throttleResponse: 4.5,
      shiftStrategy: shift([2300, 2900, 4400, 6300], [1350, 1700, 2350, 3200], .7, 4800), steeringResponse: 3.7, steeringDamping: 11.5 },
  };
  c.frontDiff = { type: 'open' }; c.rearDiff = { type: 'open' };
  c.parkingBrake = createRoadParkingBrakeConfig(c.brakes.handbrakeTorque);
  c.autoHold = createRoadAutoHoldConfig();
  c.startStop = { enabledByDefault: false, minimumStopDelay: 2, stopSpeedThreshold: .06, brakeThreshold: .25,
    restartThrottleThreshold: .1, restartBrakeReleaseThreshold: .08, restartDelay: .2 };
  return c;
}
