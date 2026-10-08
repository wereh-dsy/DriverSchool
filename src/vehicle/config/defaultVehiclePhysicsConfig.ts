import type { DriveModeCalibration, VehiclePhysicsConfig } from './VehiclePhysicsConfig';
import { FAMILY_SEDAN_DIMENSIONS } from '../VehicleDimensions';

const degreesToRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * A naturally aspirated, front-wheel-drive family saloon. The figures are
 * deliberately ordinary: about 175 Nm, a five-speed manual, and road tyres.
 */
export const DEFAULT_VEHICLE_PHYSICS_CONFIG: VehiclePhysicsConfig = {
  ...FAMILY_SEDAN_DIMENSIONS,
  mass: 1_380,
  fuel: { tankCapacityL: 50, defaultFuelL: 35, fuelDensity: 0.745,
    peakThermalEfficiency: 0.30, referenceConsumptionLPer100km: 7.2 },
  trackWidth: 1.55,
  frontWeightBias: 0.62,
  centerOfMassHeight: 0.54,
  centerOfMassLongitudinalOffset: 0,
  yawInertia: 2_500,
  drivetrainType: 'FWD',
  differentialType: 'open',
  frontTorqueSplit: 1,
  rearTorqueSplit: 0,
  drivetrainLayout: 'FWD',
  drivenWheelWeightFraction: 0.62,
  gravity: 9.81,
  engine: {
    layout: 'INLINE', cylinderCount: 4, torqueRipple: .018, soundProfile: 'balanced',
    displacementL: 1.6,
    partThrottleExponent: 1.08,
    revHang: { enabled: true, holdTime: 0.12, decayTime: 0.28, strength: 0.88 },
    // Slightly brisk warm idle keeps low-speed clutch work calm without
    // turning the idle governor into hidden launch assistance.
    idleRPM: 850,
    // A warm naturally-aspirated petrol engine can catch a modest accessory
    // load, but a locked drivetrain can still pull it below combustion speed.
    stallRPM: 500,
    idleControlMaxTorque: 58,
    idleControlBandRPM: 250,
    idleControlStrength: 58,
    shiftRecommendation: {
      // Typical calm petrol-family-car advice: early for economy, but with
      // enough load sensitivity to avoid asking for the next gear at 1,500 rpm.
      lightLoadRPM: 1_700,
      highLoadRPM: 2_500,
      throttleCurveExponent: 0.65,
      firstGearOffsetRPM: 120,
      minimumSpeedKmh: 8,
      hysteresisRPM: 140,
    },
    redlineWarningRPM: 5_550,
    redlineRPM: 6_000,
    revLimiterRPM: 6_000,
    revLimiterType: 'hard',
    maxRPM: 6_250,
    engineInertia: 0.38,
    // Split the previous 78 Nm closed-throttle loss into its constant and
    // speed-dependent parts without changing the old curve at either end.
    engineFrictionTorque: 14,
    engineBrakingStrength: 64,
    engineBraking: 78,
    // The accelerator builds progressively (especially important for binary
    // keyboard input) while lift-off remains prompt and controllable.
    throttleResponse: 3,
    throttleResponseRate: 3,
    throttleReleaseResponse: 7.5,
    starterTorque: 105,
    torqueCurve: [
      { rpm: 850, torque: 88 },
      { rpm: 1_500, torque: 126 },
      { rpm: 2_500, torque: 153 },
      { rpm: 3_500, torque: 170 },
      { rpm: 4_300, torque: 174 },
      { rpm: 5_100, torque: 158 },
      { rpm: 5_600, torque: 132 },
      { rpm: 6_000, torque: 104 },
      { rpm: 6_250, torque: 70 },
    ],
  },
  transmission: {
    drivetrainLash: { reversalTime: 0.12, torqueDeadzone: 5 },
    reverseRatio: -3.42,
    gearRatios: {
      1: 3.58,
      2: 1.93,
      3: 1.28,
      4: 0.95,
      5: 0.76,
    },
    finalDrive: 4.1,
    finalDriveRatio: 4.1,
    efficiency: 0.9,
    drivetrainEfficiency: 0.9,
    shiftTime: 0.11,
    reverseLockoutSpeed: 1.5,
    minimumClutchDisengagementForShift: 0.88,
    synchroStrength: 1,
  },
  clutch: {
    maxClutchTorque: 285,
    maxTorque: 285,
    // A broad controller-friendly bite band closely reproduces the previous
    // engagement^1.7 capacity while making both limits explicit per vehicle.
    bitePointStart: 0.98,
    bitePointEnd: 0.02,
    engagementCurve: 'progressive',
    engagementCurveExponent: 1.62,
    // Softer capacity growth around the bite point makes a partial pedal much
    // easier to meter while retaining full torque capacity when fully closed.
    torqueCapacityExponent: 1.7,
    couplingStiffness: 10.5,
    disengagementRate: 7.5,
    engagementRate: 2.15,
    manualShiftMaxEngagement: 0.12,
  },
  autoClutch: {
    gearChangeDelay: 0.11,
    shiftDisengagedThreshold: 0.015,
    // A family-car launch feeds the clutch in over roughly 0--16 km/h instead
    // of delivering the complete first-gear torque step at walking pace.
    launchFullyEngagedSpeed: 4.5,
    launchMinimumEngagement: 0.18,
    antiStallRPMFraction: 0.72,
    takeoverRate: 1.35,
  },
  brakes: {
    pedalCurveExponent: 1.05,
    applyResponse: 12,
    releaseResponse: 18,
    // Axle totals; their sum / wheel radius equals the legacy 11.5 kN force.
    maxBrakeTorqueFront: 2_464,
    maxBrakeTorqueRear: 1_159,
    frontBrakeBias: 0.68,
    maxBrakeForce: 11_500,
    handbrakeTorque: 1_953,
    handbrakeAxle: 'rear',
    maxHandbrakeForce: 6_200,
    response: 12,
    handbrakeResponse: 18,
  },
  steering: {
    maxRoadWheelAngle: degreesToRadians(31.5),
    maxSteeringAngle: degreesToRadians(31.5),
    // Roughly 1.5 turns from centre to either lock (1080° lock-to-lock).
    steeringWheelLock: degreesToRadians(1_080),
    steeringRatio: 17.14,
    steeringResponse: 3.2,
    steeringReturnRate: 5.5,
    steeringDamping: 11,
    highSpeedSteeringReduction: 0.003,
    highSpeedReduction: 0.003,
    highSpeedReferenceSpeed: 18.25,
    highSpeedMinimumAuthority: 0.22,
    ackermannFactor: 0.86,
    yawResponseScale: 0.42,
    minimumYawResponseRate: 1.8,
    maximumYawResponseRate: 7.5,
    handbrakeOversteerGain: 1.25,
    maximumYawRate: 1.35,
  },
  aero: {
    dragCoefficient: 0.29,
    frontalArea: 2.2,
    airDensity: 1.225,
    liftCoefficientFront: 0.04,
    liftCoefficientRear: 0.06,
  },
  tires: {
    loadSensitivity: 0.06,
    wheelInertia: 1.2,
    rollingResistance: 0.012,
    longitudinalGrip: 0.9,
    lateralGrip: 0.92,
    gripCoefficient: 0.9,
    corneringStiffnessFront: 72_000,
    corneringStiffnessRear: 76_000,
    lateralSlipRecoveryRate: 8.5,
    handbrakeRearGripFactor: 0.12,
    maximumBodySlipAngle: degreesToRadians(38),
    combinedGripLateralReduction: 0.28,
    contactYawInfluence: 0.65,
    peakSlipRatio: 0.11,
    peakSlipAngle: degreesToRadians(8),
    gripFalloff: 0.35,
  },
  suspension: {
    rideHeight: 0.145,
    restLength: 0.36,
    springRateFront: 31_000,
    springRateRear: 28_000,
    damperCompressionFront: 2_350,
    damperCompressionRear: 2_050,
    damperReboundFront: 3_650,
    damperReboundRear: 3_250,
    suspensionTravel: 0.14,
    bumpStopStartRatio: 0.8,
    bumpStopStiffness: 180_000,
    antiRollStiffnessFront: 10_500,
    antiRollStiffnessRear: 7_500,
    antiRollStiffness: 18_000,
  },
  driverAids: {
    hillHoldEnabled: false,
    hillHoldDuration: 1.8,
    antiStallStrength: 0.55,
    absEnabled: false,
    tractionControlEnabled: false,
    stabilityControlEnabled: true,
    autoBlipEnabled: false,
  },
  safety: {
    maxSubstep: 1 / 120,
    maxFrameTime: 0.1,
    // Corruption guards only; normal top speed still emerges from ratios,
    // redline, available torque, and drag rather than these distant limits.
    maxForwardSpeed: 90,
    maxReverseSpeed: 25,
    maxAbsPosition: 100_000,
  },
};

/**
 * Returns a detached config so callers may tune a car without mutating the
 * shared default or another vehicle instance.
 */
export function cloneVehiclePhysicsConfig(
  config: VehiclePhysicsConfig,
): VehiclePhysicsConfig {
  return {
    ...config,
    fuel: { ...config.fuel },
    driveModes: config.driveModes === undefined ? undefined : {
      ECO: cloneDriveMode(config.driveModes.ECO), NORMAL: cloneDriveMode(config.driveModes.NORMAL),
      SPORT: cloneDriveMode(config.driveModes.SPORT),
    },
    awd: config.awd === undefined ? undefined : { ...config.awd },
    engine: {
      ...config.engine,
      firingCharacter: config.engine.firingCharacter === undefined ? undefined : { ...config.engine.firingCharacter },
      startupCharacter: config.engine.startupCharacter === undefined ? undefined : { ...config.engine.startupCharacter },
      ignitionSequence: config.engine.ignitionSequence === undefined ? undefined : { ...config.engine.ignitionSequence },
      turbo: config.engine.turbo === undefined ? undefined : {
        ...config.engine.turbo,
        baseTorqueCurve: config.engine.turbo.baseTorqueCurve.map((point) => ({ ...point })),
      },
      revHang: config.engine.revHang === undefined ? undefined : { ...config.engine.revHang },
      shiftRecommendation: {
        ...config.engine.shiftRecommendation,
      },
      torqueCurve: config.engine.torqueCurve.map((point) => ({ ...point })),
    },
    transmission: {
      ...config.transmission,
      drivetrainLash: config.transmission.drivetrainLash === undefined ? undefined : { ...config.transmission.drivetrainLash },
      gearRatios: { ...config.transmission.gearRatios },
      automatic: config.transmission.automatic === undefined ? undefined : {
        ...config.transmission.automatic,
        converter: { ...config.transmission.automatic.converter,
          torqueRatioCurve: config.transmission.automatic.converter.torqueRatioCurve.map((point) => ({ ...point })) },
        shiftStrategy: { ...config.transmission.automatic.shiftStrategy,
          map: config.transmission.automatic.shiftStrategy.map.map((point) => ({ ...point })),
          minimumUpshiftSpeeds: [...config.transmission.automatic.shiftStrategy.minimumUpshiftSpeeds],
          gearRPMCorrections: config.transmission.automatic.shiftStrategy.gearRPMCorrections?.slice() },
      },
      dct: config.transmission.dct === undefined ? undefined : {
        ...config.transmission.dct,
        shiftStrategy: { ...config.transmission.dct.shiftStrategy,
          map: config.transmission.dct.shiftStrategy.map.map((point) => ({ ...point })),
          minimumUpshiftSpeeds: [...config.transmission.dct.shiftStrategy.minimumUpshiftSpeeds],
          gearRPMCorrections: config.transmission.dct.shiftStrategy.gearRPMCorrections?.slice() },
      },
      cvt: config.transmission.cvt === undefined ? undefined : {
        ...config.transmission.cvt,
        targetRPMCurve: config.transmission.cvt.targetRPMCurve.map(point => ({ ...point })),
        converter: { ...config.transmission.cvt.converter,
          torqueRatioCurve: config.transmission.cvt.converter.torqueRatioCurve.map(point => ({ ...point })) },
      },
    },
    clutch: { ...config.clutch },
    autoClutch: { ...config.autoClutch },
    brakes: { ...config.brakes },
    steering: { ...config.steering, returnProfile: config.steering.returnProfile === undefined ? undefined : { ...config.steering.returnProfile } },
    aero: { ...config.aero },
    tires: { ...config.tires },
    suspension: { ...config.suspension },
    driverAids: { ...config.driverAids, esc: config.driverAids.esc === undefined ? undefined : { ...config.driverAids.esc } },
    safety: { ...config.safety },
  };
}

export function createDefaultVehiclePhysicsConfig(): VehiclePhysicsConfig {
  return cloneVehiclePhysicsConfig(DEFAULT_VEHICLE_PHYSICS_CONFIG);
}

function cloneDriveMode(calibration: DriveModeCalibration): DriveModeCalibration {
  return { ...calibration, shiftStrategy: { ...calibration.shiftStrategy,
    map: calibration.shiftStrategy.map.map(point => ({ ...point })),
    minimumUpshiftSpeeds: [...calibration.shiftStrategy.minimumUpshiftSpeeds],
    gearRPMCorrections: calibration.shiftStrategy.gearRPMCorrections?.slice() } };
}
