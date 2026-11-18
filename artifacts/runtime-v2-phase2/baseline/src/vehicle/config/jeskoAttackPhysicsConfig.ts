import { createDefaultVehiclePhysicsConfig } from './defaultVehiclePhysicsConfig';
import { JESKO_ATTACK_DIMENSIONS } from '../VehicleDimensions';
import type { AutomaticShiftConfig, VehiclePhysicsConfig } from './VehiclePhysicsConfig';

/** Official envelope/output anchors; all unreported chassis/gear values are
 * independent engineering estimates, not another car's complete calibration. */
export function createJeskoAttackPhysicsConfig(): VehiclePhysicsConfig {
  const c = createDefaultVehiclePhysicsConfig();
  Object.assign(c, JESKO_ATTACK_DIMENSIONS, { mass: 1375.3, trackWidth: 1.675,
    enginePlacement: 'MID', frontWeightBias: .43, centerOfMassHeight: .36, yawInertia: 1730,
    drivetrainType: 'RWD', drivetrainLayout: 'RWD', frontTorqueSplit: 0, rearTorqueSplit: 1 });
  c.controlCalibration = {
    throttle: { pedalExponent: 1.04, torqueSmoothingSeconds: .010 },
    abs: { slipMultiplier: 1, releaseResponse: 32, recoverResponse: 6, hysteresis: .014 },
    tcs: { slipMultiplier: 1.18, torqueDelay: .035, severeSlip: .10, response: 18,
      recoveryResponse: 2.8, maximumTorqueReduction: .93, brakeFraction: .14 },
    esc: { yawErrorThreshold: .24, sideslipThreshold: .13, response: 12,
      confirmationTime: .07, maximumBrakeGripFraction: .32 },
  };
  c.fuel = { tankCapacityL: 72, defaultFuelL: 60, fuelDensity: .745,
    peakThermalEfficiency: .33, referenceConsumptionLPer100km: 20 };
  c.engine = { ...c.engine, ratedNetPowerW: 955000, layout: 'V', cylinderCount: 8, bankAngle: Math.PI / 2, displacementL: 5,
    revHang: undefined, soundProfile: 'full-bodied', torqueRipple: .012,
    firingCharacter: { smoothness: .86, inertiaScale: 1, brakingScale: 1 },
    idleRPM: 1000, stallRPM: 580, idleControlMaxTorque: 130, idleControlStrength: 130, idleControlBandRPM: 320,
    engineInertia: .19, engineFrictionTorque: 24, engineBrakingStrength: 110, engineBraking: 134,
    partThrottleExponent: 1.08, throttleResponse: 13, throttleResponseRate: 13, throttleReleaseResponse: 20,
    redlineWarningRPM: 8000, redlineRPM: 8500, revLimiterRPM: 8550, maxRPM: 8800,
    revLimiterType: 'hard', starterTorque: 220,
    ignitionSequence: { crankingDuration: .55, crankingRPM: 420, flareRPM: 1650, settlingDuration: .65, shutdownFriction: 85 },
    shiftRecommendation: { lightLoadRPM: 2800, highLoadRPM: 8250, throttleCurveExponent: 1,
      firstGearOffsetRPM: 0, minimumSpeedKmh: 12, hysteresisRPM: 150 },
    // Combustion ceiling includes 24 Nm accessory/bearing drag: net 1500 at
    // 5100, 955 kW (~1280 bhp) at 7800. No constant 1500 Nm plateau to redline.
    torqueCurve: [{ rpm: 1000, torque: 260 }, { rpm: 1800, torque: 520 }, { rpm: 2700, torque: 1040 },
      { rpm: 4000, torque: 1370 }, { rpm: 5100, torque: 1524 }, { rpm: 6000, torque: 1470 },
      { rpm: 6170, torque: 1445 }, { rpm: 6500, torque: 1375 }, { rpm: 7000, torque: 1285 },
      { rpm: 7500, torque: 1225 }, { rpm: 7800, torque: 1193.18 }, { rpm: 8000, torque: 1130 },
      { rpm: 8500, torque: 1000 }, { rpm: 8800, torque: 800 }],
    turbo: { enabled: true, inertia: .12, pressureGain: 2.2, maxPressureRatio: 2.7,
      turbineDriveStrength: .95, compressorLoadStrength: .08, friction: .10, wastegateGain: 5,
      baseTorqueCurve: [{ rpm: 1000, torque: 230 }, { rpm: 1800, torque: 340 }, { rpm: 2700, torque: 455 },
        { rpm: 4000, torque: 570 }, { rpm: 5100, torque: 630 }, { rpm: 6170, torque: 605 },
        { rpm: 7800, torque: 510 }, { rpm: 8500, torque: 450 }, { rpm: 8800, torque: 390 }] },
    thermal: { initialTemperatureC: 85, heatCapacityJPerK: 220000, heatFraction: .26,
      coolingWPerK: 1000, airflowCoolingWPerKPerMps: 28, derateStartC: 118, derateEndC: 140, minimumTorqueFactor: .40 } };
  const shiftStrategy: AutomaticShiftConfig = {
    map: [{ throttle: 0, upshiftRPM: 2600, downshiftRPM: 1300 }, { throttle: .3, upshiftRPM: 3600, downshiftRPM: 1900 },
      { throttle: .65, upshiftRPM: 6100, downshiftRPM: 3200 }, { throttle: 1, upshiftRPM: 8250, downshiftRPM: 4600 }],
    minimumUpshiftSpeeds: [7, 10, 14, 18, 22, 26, 30, 34], hysteresisRPM: 100,
    minimumTimeInGear: .35, maximumAutomaticRPM: 8330, minimumPostShiftRPM: 1600,
    minimumUpshiftRoadRPMFraction: .85,
    liftHoldTime: 1, economicalShiftFactor: 1, brakingDownshiftRPM: 3500,
    kickdownThrottle: .86, kickdownTargetRPM: 6600, kickdownMaximumRPM: 8100 };
  c.transmission = { ...c.transmission, type: 'LST', supportsManualSelection: true,
    manualAutoUpshiftAtRedline: true, manualSelectionTimeout: 20, shiftTime: .03,
    gearRatios: { 1: 4.71, 2: 3.53, 3: 2.65, 4: 2.19, 5: 1.77, 6: 1.48, 7: 1.24, 8: 1.08, 9: .88 },
    reverseRatio: -3.54, finalDrive: 2.77, finalDriveRatio: 2.77, efficiency: .94, drivetrainEfficiency: .94,
    lst: { shiftStrategy, clutchCapacity: 1900, couplingStiffness: 24, launchTargetRPM: 3300,
      engagementRate: 4.5, launchFullyEngagedSpeed: 7, parkMaximumSpeed: .25 } };
  c.clutch = { ...c.clutch, maxTorque: 1900, maxClutchTorque: 1900 };
  c.rearDiff = { type: 'lsd', preload: 70, lockStrength: .20, torqueBiasRatio: 3.2,
    speedDifferenceSensitivity: .22, response: 15 };
  c.electronicDifferential = { slipThreshold: .15, speedDifferenceThreshold: .9, maximumBrakeTorque: 450, response: 12 };
  c.tires = { ...c.tires, longitudinalGrip: 1.40, lateralGrip: 1.45, gripCoefficient: 1.40,
    corneringStiffnessFront: 108000, corneringStiffnessRear: 146000, wheelInertia: 1.85,
    rollingResistance: .014, loadSensitivity: .085, peakSlipRatio: .10, peakSlipAngle: .115,
    gripFalloff: .28, lateralSlipRecoveryRate: 8, camberStiffness: 1050,
    wetLongitudinalGripRetention: .80, wetLateralGripRetention: .78 };
  // Pushrod motion ratio and Triplex support reduced to wheel rates, axle
  // damping and progressive bump support; no independently resolved third strut.
  c.suspension = { ...c.suspension, rideHeight: .09, restLength: .25, suspensionTravel: .10,
    springRateFront: 105000, springRateRear: 140000,
    damperCompressionFront: 4400, damperCompressionRear: 5400,
    damperReboundFront: 6500, damperReboundRear: 7800,
    bumpStopStartRatio: .72, bumpStopStiffness: 280000,
    antiRollStiffnessFront: 23000, antiRollStiffnessRear: 27000, antiRollStiffness: 50000,
    kinematics: {
      front: { topology: 'DOUBLE_WISHBONE', staticCamber: -.025, camberGainPerMeter: -.55, staticToe: 0,
        bumpToeGainPerMeter: .004, antiDiveRatio: .22, antiSquatRatio: 0 },
      rear: { topology: 'DOUBLE_WISHBONE', staticCamber: -.030, camberGainPerMeter: -.48, staticToe: .001,
        bumpToeGainPerMeter: .012, antiDiveRatio: 0, antiSquatRatio: .24 } },
    adaptiveDamping: { responseRate: 4, modeMultipliers: { NORMAL: 1 } } };
  const angle = 30 * Math.PI / 180;
  c.steering = { ...c.steering, maxRoadWheelAngle: angle, maxSteeringAngle: angle, steeringRatio: 17.4,
    steeringWheelLock: angle * 17.4 * 2, steeringResponse: 5, steeringDamping: 14, steeringReturnRate: 7.5,
    highSpeedReferenceSpeed: 27, highSpeedMinimumAuthority: .18, ackermannFactor: .94,
    yawResponseScale: .46, maximumYawRate: 1.8 };
  c.brakes = { ...c.brakes, maxBrakeTorqueFront: 5800, maxBrakeTorqueRear: 4200,
    frontBrakeBias: .58, maxBrakeForce: 10000 / c.wheelRadius,
    pedalCurveExponent: 1.12, applyResponse: 20, releaseResponse: 25, response: 20,
    handbrakeTorque: 2600, maxHandbrakeForce: 2600 / c.wheelRadius };
  const point = (kmh: number, kgf: number, frontShare: number, cd: number) => {
    const speed = kmh / 3.6, cl = -kgf * 9.80665 / (.5 * 1.225 * 1.88 * speed * speed);
    return { speed, frontCl: cl * frontShare, rearCl: cl * (1 - frontShare), cd };
  };
  c.aero = { dragCoefficient: .42, frontalArea: 1.88, airDensity: 1.225,
    liftCoefficientFront: 0, liftCoefficientRear: 0,
    activeAero: { deployStartSpeed: 60 / 3.6, deployFullSpeed: 170 / 3.6, responseRate: 3,
      stowedLiftFraction: .72, maximumDownforceN: 1400 * 9.80665, brakingDragDelta: .16,
      curve: [point(100, 105, .43, .42), point(200, 440, .43, .44),
        point(250, 700, .43, .46), point(290, 1000, .44, .48), point(350, 1400, .44, .50)] } };
  c.driverAids = { ...c.driverAids, absEnabled: true, ebdEnabled: true, tractionControlEnabled: true,
    stabilityControlEnabled: true, autoBlipEnabled: true,
    tcs: { slipThresholdMultiplier: 1.25, maximumTorqueReduction: .93, response: 14, recoveryResponse: 4 },
    esc: { minimumSpeed: 3, yawErrorThreshold: .24, sideslipThreshold: .13, maximumBrakeGripFraction: .32, response: 12 } };
  // Factory KES setting names; detailed thresholds/schedules are engineering
  // estimates. All settings retain the same engine power curve and 9-speed LST.
  const schedule=(low:number,part:number,high:number,kick:number,hold:number):AutomaticShiftConfig=>({
    ...shiftStrategy,map:[{throttle:0,upshiftRPM:low,downshiftRPM:1300},
      {throttle:.3,upshiftRPM:part,downshiftRPM:1900},
      {throttle:.65,upshiftRPM:high,downshiftRPM:3200},
      {throttle:1,upshiftRPM:8250,downshiftRPM:4600}],
    kickdownThrottle:kick,liftHoldTime:hold,
  });
  c.driveModeOrder=['NORMAL','WET','SPORT','RACE'];c.defaultDriveMode='SPORT';
  c.driveModes={
    NORMAL:{throttleExponent:1.20,throttleResponse:9,steeringResponse:4.5,steeringDamping:15,
      shiftStrategy:schedule(2300,3000,5200,.92,.35)},
    WET:{throttleExponent:1.42,throttleResponse:8,steeringResponse:4.6,steeringDamping:16,
      shiftStrategy:schedule(2500,3400,5600,.95,.6)},
    SPORT:{throttleExponent:1,throttleResponse:13,steeringResponse:5,steeringDamping:14,
      shiftStrategy:structuredClone(shiftStrategy)},
    RACE:{throttleExponent:.92,throttleResponse:18,steeringResponse:6,steeringDamping:13,
      shiftStrategy:schedule(3300,4800,7200,.76,2.2)},
  };
  c.controlCalibration.modes={
    NORMAL:{throttle:{pedalExponent:1.25,torqueSmoothingSeconds:.028},tcs:{slipMultiplier:1.12,torqueDelay:.025,recoveryResponse:2.6},
      esc:{yawErrorThreshold:.17,sideslipThreshold:.10,confirmationTime:.045}},
    WET:{throttle:{pedalExponent:1.48,torqueSmoothingSeconds:.045},tcs:{slipMultiplier:1.02,torqueDelay:.012,recoveryResponse:1.8,brakeFraction:.16},
      esc:{yawErrorThreshold:.13,sideslipThreshold:.075,confirmationTime:.025}},
    SPORT:{throttle:{pedalExponent:1.04,torqueSmoothingSeconds:.010},tcs:{slipMultiplier:1.18,torqueDelay:.035,recoveryResponse:2.8},
      esc:{yawErrorThreshold:.24,sideslipThreshold:.13,confirmationTime:.07}},
    RACE:{throttle:{pedalExponent:.96,torqueSmoothingSeconds:.005},tcs:{slipMultiplier:1.40,torqueDelay:.065,recoveryResponse:3.4,brakeFraction:.12},
      esc:{yawErrorThreshold:.29,sideslipThreshold:.17,confirmationTime:.09}},
  };
  c.suspension.adaptiveDamping!.modeMultipliers={NORMAL:.88,WET:.96,SPORT:1,RACE:1.18};
  c.safety = { ...c.safety, maxForwardSpeed: 160 };
  c.capabilities = { advancedInstrument: true };
  return c;
}
