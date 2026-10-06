// src/vehicle/VehicleDimensions.ts
var VEHICLE_WHEEL_IDS = ["frontLeft", "frontRight", "rearLeft", "rearRight"];
var FAMILY_SEDAN_DIMENSIONS = Object.freeze({
  length: 4.5026,
  width: 1.8,
  height: 1.645,
  wheelBase: 2.7,
  frontTrackWidth: 1.55,
  rearTrackWidth: 1.54,
  wheelRadius: 0.315,
  wheelWidth: 0.215
});
var SPORT_COUPE_DIMENSIONS = Object.freeze({
  length: 4.55,
  width: 1.88,
  height: 1.508,
  wheelBase: 2.64,
  frontTrackWidth: 1.6,
  rearTrackWidth: 1.62,
  wheelRadius: 0.335,
  wheelWidth: 0.255
});
function wheelLocalPosition(dimensions, id) {
  const front = id === "frontLeft" || id === "frontRight";
  const left = id === "frontLeft" || id === "rearLeft";
  return {
    x: (left ? -0.5 : 0.5) * (front ? dimensions.frontTrackWidth : dimensions.rearTrackWidth),
    y: dimensions.wheelRadius ?? 0,
    z: (front ? -0.5 : 0.5) * dimensions.wheelBase
  };
}

// src/vehicle/config/defaultVehiclePhysicsConfig.ts
var degreesToRadians = (degrees) => degrees * Math.PI / 180;
var DEFAULT_VEHICLE_PHYSICS_CONFIG = {
  ...FAMILY_SEDAN_DIMENSIONS,
  mass: 1380,
  trackWidth: 1.55,
  frontWeightBias: 0.62,
  centerOfMassHeight: 0.54,
  centerOfMassLongitudinalOffset: 0,
  yawInertia: 2500,
  drivetrainType: "FWD",
  frontTorqueSplit: 1,
  rearTorqueSplit: 0,
  drivetrainLayout: "FWD",
  drivenWheelWeightFraction: 0.62,
  gravity: 9.81,
  engine: {
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
      lightLoadRPM: 1700,
      highLoadRPM: 2500,
      throttleCurveExponent: 0.65,
      firstGearOffsetRPM: 120,
      minimumSpeedKmh: 8,
      hysteresisRPM: 140
    },
    redlineWarningRPM: 5550,
    redlineRPM: 6e3,
    revLimiterRPM: 6e3,
    revLimiterType: "hard",
    maxRPM: 6250,
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
      { rpm: 1500, torque: 126 },
      { rpm: 2500, torque: 153 },
      { rpm: 3500, torque: 170 },
      { rpm: 4300, torque: 174 },
      { rpm: 5100, torque: 158 },
      { rpm: 5600, torque: 132 },
      { rpm: 6e3, torque: 104 },
      { rpm: 6250, torque: 70 }
    ]
  },
  transmission: {
    reverseRatio: -3.42,
    gearRatios: {
      1: 3.58,
      2: 1.93,
      3: 1.28,
      4: 0.95,
      5: 0.76
    },
    finalDrive: 4.1,
    finalDriveRatio: 4.1,
    efficiency: 0.9,
    drivetrainEfficiency: 0.9,
    shiftTime: 0.11,
    reverseLockoutSpeed: 1.5,
    minimumClutchDisengagementForShift: 0.88,
    synchroStrength: 1
  },
  clutch: {
    maxClutchTorque: 285,
    maxTorque: 285,
    // A broad controller-friendly bite band closely reproduces the previous
    // engagement^1.7 capacity while making both limits explicit per vehicle.
    bitePointStart: 0.98,
    bitePointEnd: 0.02,
    engagementCurve: "progressive",
    engagementCurveExponent: 1.62,
    // Softer capacity growth around the bite point makes a partial pedal much
    // easier to meter while retaining full torque capacity when fully closed.
    torqueCapacityExponent: 1.7,
    couplingStiffness: 10.5,
    disengagementRate: 7.5,
    engagementRate: 2.15,
    manualShiftMaxEngagement: 0.12
  },
  autoClutch: {
    gearChangeDelay: 0.11,
    shiftDisengagedThreshold: 0.015,
    // A family-car launch feeds the clutch in over roughly 0--16 km/h instead
    // of delivering the complete first-gear torque step at walking pace.
    launchFullyEngagedSpeed: 4.5,
    launchMinimumEngagement: 0.18,
    antiStallRPMFraction: 0.72,
    takeoverRate: 1.35
  },
  brakes: {
    // Axle totals; their sum / wheel radius equals the legacy 11.5 kN force.
    maxBrakeTorqueFront: 2464,
    maxBrakeTorqueRear: 1159,
    frontBrakeBias: 0.68,
    maxBrakeForce: 11500,
    handbrakeTorque: 1953,
    handbrakeAxle: "rear",
    maxHandbrakeForce: 6200,
    response: 12,
    handbrakeResponse: 18
  },
  steering: {
    maxRoadWheelAngle: degreesToRadians(31.5),
    maxSteeringAngle: degreesToRadians(31.5),
    // Roughly 1.5 turns from centre to either lock (1080° lock-to-lock).
    steeringWheelLock: degreesToRadians(1080),
    steeringRatio: 17.14,
    steeringResponse: 3.2,
    steeringReturnRate: 5.5,
    steeringDamping: 11,
    highSpeedSteeringReduction: 3e-3,
    highSpeedReduction: 3e-3,
    ackermannFactor: 0.86,
    yawResponseScale: 0.42,
    minimumYawResponseRate: 1.8,
    maximumYawResponseRate: 7.5,
    handbrakeOversteerGain: 1.25,
    maximumYawRate: 1.35
  },
  aero: {
    dragCoefficient: 0.29,
    frontalArea: 2.2,
    airDensity: 1.225,
    liftCoefficientFront: 0.04,
    liftCoefficientRear: 0.06
  },
  tires: {
    rollingResistance: 0.012,
    longitudinalGrip: 0.9,
    lateralGrip: 0.92,
    gripCoefficient: 0.9,
    corneringStiffnessFront: 72e3,
    corneringStiffnessRear: 76e3,
    lateralSlipRecoveryRate: 8.5,
    handbrakeRearGripFactor: 0.12,
    maximumBodySlipAngle: degreesToRadians(38),
    combinedGripLateralReduction: 0.28,
    contactYawInfluence: 0.65,
    peakSlipRatio: 0.11,
    peakSlipAngle: degreesToRadians(8),
    gripFalloff: 0.35
  },
  suspension: {
    rideHeight: 0.145,
    restLength: 0.36,
    springRateFront: 31e3,
    springRateRear: 28e3,
    damperCompressionFront: 2350,
    damperCompressionRear: 2050,
    damperReboundFront: 3650,
    damperReboundRear: 3250,
    suspensionTravel: 0.14,
    antiRollStiffness: 18e3
  },
  driverAids: {
    hillHoldEnabled: false,
    hillHoldDuration: 1.8,
    antiStallStrength: 0.55,
    absEnabled: false,
    tractionControlEnabled: false,
    stabilityControlEnabled: false,
    autoBlipEnabled: false
  },
  safety: {
    maxSubstep: 1 / 120,
    maxFrameTime: 0.1,
    // Corruption guards only; normal top speed still emerges from ratios,
    // redline, available torque, and drag rather than these distant limits.
    maxForwardSpeed: 90,
    maxReverseSpeed: 25,
    maxAbsPosition: 1e5
  }
};
function cloneVehiclePhysicsConfig(config) {
  return {
    ...config,
    engine: {
      ...config.engine,
      shiftRecommendation: {
        ...config.engine.shiftRecommendation
      },
      torqueCurve: config.engine.torqueCurve.map((point) => ({ ...point }))
    },
    transmission: {
      ...config.transmission,
      gearRatios: { ...config.transmission.gearRatios }
    },
    clutch: { ...config.clutch },
    autoClutch: { ...config.autoClutch },
    brakes: { ...config.brakes },
    steering: { ...config.steering },
    aero: { ...config.aero },
    tires: { ...config.tires },
    suspension: { ...config.suspension },
    driverAids: { ...config.driverAids },
    safety: { ...config.safety }
  };
}
function createDefaultVehiclePhysicsConfig() {
  return cloneVehiclePhysicsConfig(DEFAULT_VEHICLE_PHYSICS_CONFIG);
}

// src/vehicle/config/sportsCoupePhysicsConfig.ts
var degreesToRadians2 = (degrees) => degrees * Math.PI / 180;
var SPORTS_COUPE_PHYSICS_CONFIG = {
  ...DEFAULT_VEHICLE_PHYSICS_CONFIG,
  ...SPORT_COUPE_DIMENSIONS,
  mass: 1490,
  trackWidth: 1.61,
  frontWeightBias: 0.52,
  centerOfMassHeight: 0.46,
  centerOfMassLongitudinalOffset: -0.03,
  yawInertia: 2360,
  drivetrainType: "RWD",
  frontTorqueSplit: 0,
  rearTorqueSplit: 1,
  drivetrainLayout: "RWD",
  drivenWheelWeightFraction: 0.48,
  engine: {
    ...DEFAULT_VEHICLE_PHYSICS_CONFIG.engine,
    idleRPM: 920,
    stallRPM: 560,
    idleControlMaxTorque: 74,
    idleControlBandRPM: 290,
    idleControlStrength: 74,
    shiftRecommendation: {
      lightLoadRPM: 2050,
      highLoadRPM: 3350,
      throttleCurveExponent: 0.72,
      firstGearOffsetRPM: 180,
      minimumSpeedKmh: 10,
      hysteresisRPM: 180
    },
    redlineWarningRPM: 7050,
    redlineRPM: 7350,
    revLimiterRPM: 7350,
    revLimiterType: "soft",
    maxRPM: 7600,
    engineInertia: 0.31,
    engineFrictionTorque: 18,
    engineBrakingStrength: 82,
    engineBraking: 100,
    throttleResponseRate: 3.75,
    throttleResponse: 3.75,
    throttleReleaseResponse: 8.5,
    starterTorque: 145,
    torqueCurve: [
      { rpm: 920, torque: 178 },
      { rpm: 1500, torque: 270 },
      { rpm: 2500, torque: 348 },
      { rpm: 3500, torque: 390 },
      { rpm: 4500, torque: 410 },
      { rpm: 5500, torque: 405 },
      { rpm: 6500, torque: 395 },
      { rpm: 7050, torque: 360 },
      { rpm: 7350, torque: 310 },
      { rpm: 7600, torque: 220 }
    ]
  },
  transmission: {
    reverseRatio: -3.44,
    gearRatios: {
      1: 3.77,
      2: 2.26,
      3: 1.65,
      4: 1.29,
      5: 1.03,
      6: 0.84,
      7: 0.68
    },
    finalDrive: 3.46,
    finalDriveRatio: 3.46,
    efficiency: 0.92,
    drivetrainEfficiency: 0.92,
    shiftTime: 0.095,
    reverseLockoutSpeed: 1.5,
    minimumClutchDisengagementForShift: 0.88,
    synchroStrength: 1
  },
  clutch: {
    ...DEFAULT_VEHICLE_PHYSICS_CONFIG.clutch,
    maxClutchTorque: 610,
    maxTorque: 610,
    engagementCurveExponent: 1.72,
    torqueCapacityExponent: 1.58,
    couplingStiffness: 13.2,
    disengagementRate: 8.5,
    engagementRate: 2.35
  },
  autoClutch: {
    ...DEFAULT_VEHICLE_PHYSICS_CONFIG.autoClutch,
    gearChangeDelay: 0.095,
    launchFullyEngagedSpeed: 5.8,
    launchMinimumEngagement: 0.14,
    antiStallRPMFraction: 0.7,
    takeoverRate: 1.55
  },
  brakes: {
    maxBrakeTorqueFront: 3180,
    maxBrakeTorqueRear: 1560,
    frontBrakeBias: 0.67,
    maxBrakeForce: 14150,
    handbrakeTorque: 2680,
    handbrakeAxle: "rear",
    maxHandbrakeForce: 8e3,
    response: 14,
    handbrakeResponse: 20
  },
  steering: {
    maxRoadWheelAngle: degreesToRadians2(30),
    maxSteeringAngle: degreesToRadians2(30),
    steeringWheelLock: degreesToRadians2(780),
    steeringRatio: 13,
    steeringResponse: 3.55,
    steeringReturnRate: 6.2,
    steeringDamping: 12.5,
    highSpeedSteeringReduction: 32e-4,
    highSpeedReduction: 32e-4,
    ackermannFactor: 0.91,
    yawResponseScale: 0.47,
    minimumYawResponseRate: 1.9,
    maximumYawResponseRate: 8.2,
    handbrakeOversteerGain: 1.38,
    maximumYawRate: 1.5
  },
  aero: {
    dragCoefficient: 0.31,
    frontalArea: 2.04,
    airDensity: 1.225,
    liftCoefficientFront: -0.02,
    liftCoefficientRear: -0.05
  },
  tires: {
    rollingResistance: 0.013,
    longitudinalGrip: 1.04,
    lateralGrip: 1.08,
    gripCoefficient: 1.04,
    corneringStiffnessFront: 87e3,
    corneringStiffnessRear: 91e3,
    lateralSlipRecoveryRate: 9.2,
    handbrakeRearGripFactor: 0.1,
    maximumBodySlipAngle: degreesToRadians2(42),
    combinedGripLateralReduction: 0.26,
    contactYawInfluence: 0.6,
    peakSlipRatio: 0.1,
    peakSlipAngle: degreesToRadians2(7.5),
    gripFalloff: 0.31
  },
  suspension: {
    rideHeight: 0.115,
    restLength: 0.3,
    springRateFront: 39e3,
    springRateRear: 41e3,
    damperCompressionFront: 2850,
    damperCompressionRear: 2950,
    damperReboundFront: 4250,
    damperReboundRear: 4400,
    suspensionTravel: 0.105,
    antiRollStiffness: 27e3
  },
  driverAids: {
    ...DEFAULT_VEHICLE_PHYSICS_CONFIG.driverAids,
    antiStallStrength: 0.62,
    absEnabled: false,
    tractionControlEnabled: false,
    stabilityControlEnabled: false
  },
  safety: {
    ...DEFAULT_VEHICLE_PHYSICS_CONFIG.safety,
    maxForwardSpeed: 105,
    maxReverseSpeed: 28
  }
};

// src/vehicle/physics/math.ts
var clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
var clamp01 = (value) => clamp(value, 0, 1);
var moveTowards = (current, target, maxDelta) => {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
};
var damp = (current, target, response, dt2) => {
  if (response <= 0 || dt2 <= 0) return current;
  return current + (target - current) * (1 - Math.exp(-response * dt2));
};
var rpmToRadiansPerSecond = (rpm) => rpm * Math.PI * 2 / 60;
var radiansPerSecondToRPM = (angularVelocity) => angularVelocity * 60 / (Math.PI * 2);
var wrapAngle = (radians) => {
  const wrapped = (radians + Math.PI) % (Math.PI * 2);
  return (wrapped < 0 ? wrapped + Math.PI * 2 : wrapped) - Math.PI;
};

// src/vehicle/physics/AutoClutchController.ts
var AutoClutchController = class {
  constructor(config, idleRPM) {
    this.config = config;
    this.idleRPM = idleRPM;
  }
  config;
  idleRPM;
  state = "steady";
  pendingGear = null;
  commandedEngagement = 0;
  shiftTimer = 0;
  reset(currentEngagement = 0) {
    this.commandedEngagement = clamp01(currentEngagement);
    this.state = "steady";
    this.pendingGear = null;
    this.shiftTimer = 0;
  }
  /** Smoothly inherit a clutch position when Manual mode releases control. */
  takeOver(currentEngagement) {
    this.commandedEngagement = Number.isFinite(currentEngagement) ? clamp01(currentEngagement) : 0;
    this.pendingGear = null;
    this.shiftTimer = 0;
    this.state = "takeover";
  }
  /** Cancel automatic sequencing before Manual mode takes ownership. */
  releaseControl(currentEngagement) {
    this.commandedEngagement = Number.isFinite(currentEngagement) ? clamp01(currentEngagement) : 0;
    this.pendingGear = null;
    this.shiftTimer = 0;
    this.state = "steady";
  }
  requestShift(targetGear) {
    if (this.pendingGear !== null || this.isShifting) return false;
    this.pendingGear = targetGear;
    this.shiftTimer = 0;
    this.state = "shift-disengaging";
    return true;
  }
  update(dt2, context) {
    const safeDt = Number.isFinite(dt2) ? Math.max(0, dt2) : 0;
    const drivingTarget = this.calculateDrivingTarget(context);
    switch (this.state) {
      case "shift-disengaging": {
        this.commandedEngagement = 0;
        if (context.currentEngagement <= this.config.shiftDisengagedThreshold) {
          this.state = "shift-hold";
          this.shiftTimer = Math.max(0, this.config.gearChangeDelay);
        }
        return { targetEngagement: 0, cutThrottle: true };
      }
      case "shift-hold": {
        this.commandedEngagement = 0;
        this.shiftTimer -= safeDt;
        if (this.shiftTimer <= 0) {
          const gearToEngage = this.pendingGear;
          this.pendingGear = null;
          this.state = "shift-reengaging";
          return gearToEngage === null ? { targetEngagement: 0, cutThrottle: true } : { targetEngagement: 0, cutThrottle: true, gearToEngage };
        }
        return { targetEngagement: 0, cutThrottle: true };
      }
      case "shift-reengaging": {
        this.commandedEngagement = drivingTarget;
        if (Math.abs(context.currentEngagement - drivingTarget) <= 0.015) {
          this.state = "steady";
        }
        return { targetEngagement: drivingTarget, cutThrottle: false };
      }
      case "takeover": {
        this.commandedEngagement = moveTowards(
          this.commandedEngagement,
          drivingTarget,
          Math.max(0, this.config.takeoverRate) * safeDt
        );
        if (Math.abs(this.commandedEngagement - drivingTarget) <= 1e-4) {
          this.state = "steady";
        }
        return { targetEngagement: this.commandedEngagement, cutThrottle: false };
      }
      case "steady": {
        this.commandedEngagement = drivingTarget;
        return { targetEngagement: drivingTarget, cutThrottle: false };
      }
    }
  }
  get isShifting() {
    return this.state === "shift-disengaging" || this.state === "shift-hold" || this.state === "shift-reengaging";
  }
  calculateDrivingTarget(context) {
    if (context.currentGear === "N") return 0;
    const absoluteSpeed = Math.abs(context.vehicleSpeed);
    const coupledRPM = Math.abs(context.coupledEngineRPM);
    const launchSpeed = Math.max(0.1, this.config.launchFullyEngagedSpeed);
    const idleRPM = Math.max(1, this.idleRPM);
    if (absoluteSpeed >= launchSpeed || coupledRPM >= idleRPM * 1.08) return 1;
    const antiStallStart = idleRPM * clamp(this.config.antiStallRPMFraction, 0, 0.98);
    const antiStallProgress = clamp01(
      (coupledRPM - antiStallStart) / Math.max(1, idleRPM - antiStallStart)
    );
    if (context.throttle <= 0.02) return antiStallProgress;
    const launchProgress = clamp01(absoluteSpeed / launchSpeed);
    const minimumEngagement = clamp01(this.config.launchMinimumEngagement);
    const launchTarget = minimumEngagement + (1 - minimumEngagement) * launchProgress;
    const rpmHeadroom = clamp01((context.engineRPM - idleRPM) / (idleRPM * 0.55));
    const antiStallLimit = minimumEngagement + (1 - minimumEngagement) * Math.max(antiStallProgress, rpmHeadroom);
    return Math.min(launchTarget, antiStallLimit);
  }
};

// src/vehicle/physics/BrakeSystem.ts
var BrakeSystem = class {
  constructor(config, wheelRadius = 0.315) {
    this.config = config;
    this.wheelRadius = wheelRadius;
  }
  config;
  wheelRadius;
  brakeInput = 0;
  handbrakeInput = 0;
  reset() {
    this.brakeInput = 0;
    this.handbrakeInput = 0;
  }
  update(dt2, targetInput, targetHandbrake = 0) {
    const safeDt = Number.isFinite(dt2) ? Math.max(0, dt2) : 0;
    this.brakeInput = damp(
      this.brakeInput,
      Number.isFinite(targetInput) ? clamp01(targetInput) : 0,
      this.config.response,
      safeDt
    );
    this.handbrakeInput = damp(
      this.handbrakeInput,
      Number.isFinite(targetHandbrake) ? clamp01(targetHandbrake) : 0,
      this.config.handbrakeResponse,
      safeDt
    );
  }
  /**
   * Returns a signed longitudinal force. Around rest it only cancels an
   * existing force, so the brake can hold the car without launching it back.
   */
  calculateServiceForce(speed, forceWithoutBrakes) {
    return this.calculateOpposingForce(
      speed,
      forceWithoutBrakes,
      this.getServiceBrakeTorqueLimit() / Math.max(0.01, this.wheelRadius) * this.brakeInput
    );
  }
  /** Handbrake is an independent force source, never a velocity multiplier. */
  calculateHandbrakeForce(speed, forceWithoutHandbrake) {
    return this.calculateOpposingForce(
      speed,
      forceWithoutHandbrake,
      this.config.handbrakeTorque / Math.max(0.01, this.wheelRadius) * this.handbrakeInput
    );
  }
  /** Backward-compatible total-force helper. */
  calculateForce(speed, forceWithoutBrakes) {
    const serviceForce = this.calculateServiceForce(speed, forceWithoutBrakes);
    const handbrakeForce = this.calculateHandbrakeForce(
      speed,
      forceWithoutBrakes + serviceForce
    );
    return serviceForce + handbrakeForce;
  }
  calculateOpposingForce(speed, forceWithoutThisBrake, availableForce) {
    if (availableForce <= 0) return 0;
    if (Math.abs(speed) > 0.05) return -Math.sign(speed) * availableForce;
    if (Math.abs(forceWithoutThisBrake) > 0.01) {
      return -Math.sign(forceWithoutThisBrake) * Math.min(availableForce, Math.abs(forceWithoutThisBrake));
    }
    return 0;
  }
  getServiceBrakeTorqueLimit() {
    const frontBias = Math.min(0.98, Math.max(0.02, this.config.frontBrakeBias));
    const frontLimitedTotal = this.config.maxBrakeTorqueFront / frontBias;
    const rearLimitedTotal = this.config.maxBrakeTorqueRear / (1 - frontBias);
    return Math.max(0, Math.min(frontLimitedTotal, rearLimitedTotal));
  }
};

// src/vehicle/physics/Clutch.ts
var Clutch = class {
  constructor(config) {
    this.config = config;
  }
  config;
  /** Zero is open, one is fully coupled. */
  engagement = 0;
  targetEngagement = 0;
  state = "disengaged";
  lastSlipAngularVelocity = 0;
  lastTransmittedTorque = 0;
  reset(engagement = 0) {
    const safeEngagement = Number.isFinite(engagement) ? clamp01(engagement) : 0;
    this.engagement = safeEngagement;
    this.targetEngagement = safeEngagement;
    this.state = safeEngagement >= 1 ? "coupled" : safeEngagement <= 0 ? "disengaged" : "slipping";
    this.lastSlipAngularVelocity = 0;
    this.lastTransmittedTorque = 0;
  }
  /**
   * Converts pedal travel into a mechanical target. This is linear for V0.1;
   * a bite-point curve can be introduced here without changing input adapters.
   */
  pedalToEngagement(clutchPedal) {
    const pedal = Number.isFinite(clutchPedal) ? clamp01(clutchPedal) : 0;
    return 1 - pedal;
  }
  /** Move the physical pressure plate toward an actuator/pedal command. */
  update(dt2, targetEngagement) {
    const safeDt = Number.isFinite(dt2) ? Math.max(0, dt2) : 0;
    this.targetEngagement = Number.isFinite(targetEngagement) ? clamp01(targetEngagement) : this.engagement;
    const isOpening = this.targetEngagement < this.engagement;
    const rate = isOpening ? this.config.disengagementRate : this.config.engagementRate;
    this.engagement = moveTowards(
      this.engagement,
      this.targetEngagement,
      Math.max(0, rate) * safeDt
    );
    if (!Number.isFinite(this.engagement)) this.engagement = 0;
    this.engagement = clamp01(this.engagement);
    const error = this.targetEngagement - this.engagement;
    if (this.engagement <= 1e-4 && this.targetEngagement <= 1e-4) {
      this.state = "disengaged";
    } else if (error < -1e-4) {
      this.state = "disengaging";
    } else if (error > 1e-4) {
      this.state = "engaging";
    } else if (this.engagement >= 1 - 1e-4) {
      this.state = "coupled";
    } else {
      this.state = "slipping";
    }
  }
  /**
   * Current torque capacity. Bite limits are expressed in pedal-down travel,
   * while engagement remains the device-independent zero-to-one mechanical
   * state. Thermal and wear multipliers can be applied after this curve.
   */
  getTorqueCapacity(engagement = this.engagement) {
    const pedal = 1 - clamp01(engagement);
    const biteStart = clamp01(this.config.bitePointStart);
    const biteEnd = Math.min(biteStart - 1e-4, clamp01(this.config.bitePointEnd));
    const biteProgress = clamp01((biteStart - pedal) / (biteStart - biteEnd));
    const shapedEngagement = this.config.engagementCurve === "linear" ? biteProgress : biteProgress ** Math.max(0.1, this.config.engagementCurveExponent);
    return Math.max(0, this.config.maxClutchTorque * shapedEngagement);
  }
  calculateSlipAngularVelocity(engineAngularVelocity, gearboxInputAngularVelocity) {
    const slip = engineAngularVelocity - gearboxInputAngularVelocity;
    return Number.isFinite(slip) ? slip : 0;
  }
  /**
   * Positive torque flows engine -> gearbox. Negative torque is back-drive and
   * therefore becomes engine braking once it reaches the driven wheels.
   */
  calculateTransmittedTorque(crankTorque, engineAngularVelocity, gearboxInputAngularVelocity) {
    const capacity = this.getTorqueCapacity();
    const safeCrankTorque = Number.isFinite(crankTorque) ? crankTorque : 0;
    const slip = this.calculateSlipAngularVelocity(
      engineAngularVelocity,
      gearboxInputAngularVelocity
    );
    this.lastSlipAngularVelocity = slip;
    if (capacity <= 0) {
      this.lastTransmittedTorque = 0;
      return 0;
    }
    const requestedTorque = safeCrankTorque + slip * this.config.couplingStiffness;
    const transmittedTorque = clamp(requestedTorque, -capacity, capacity);
    this.lastTransmittedTorque = Number.isFinite(transmittedTorque) ? transmittedTorque : 0;
    return this.lastTransmittedTorque;
  }
};

// src/vehicle/physics/Engine.ts
var Engine = class {
  constructor(config) {
    this.config = config;
    if (config.torqueCurve.length === 0) {
      throw new Error("Engine torqueCurve must contain at least one sample.");
    }
    this.torqueCurve = [...config.torqueCurve].sort((a, b) => a.rpm - b.rpm);
    this.currentRPM = config.idleRPM;
  }
  config;
  currentRPM;
  throttle = 0;
  isRunning = true;
  torqueCurve;
  fuelCutActive = false;
  reset(rpm = this.config.idleRPM, running = true) {
    this.isRunning = running;
    this.currentRPM = running ? clamp(rpm, this.config.stallRPM + 1, this.config.maxRPM) : 0;
    this.throttle = 0;
    this.fuelCutActive = false;
  }
  /** Starter abstraction; ignition timing and battery state can be added later. */
  start() {
    this.isRunning = true;
    this.currentRPM = this.config.idleRPM;
    this.throttle = 0;
    this.fuelCutActive = false;
  }
  stop() {
    this.isRunning = false;
    this.currentRPM = 0;
    this.throttle = 0;
    this.fuelCutActive = false;
  }
  updateThrottle(targetThrottle, dt2) {
    const target = clamp01(targetThrottle);
    const response = target < this.throttle ? this.config.throttleReleaseResponse : this.config.throttleResponseRate;
    this.throttle = damp(this.throttle, target, response, dt2);
  }
  /** Linear interpolation of the data-driven full-load torque curve. */
  getTorqueAtRPM(rpm) {
    const first = this.torqueCurve[0];
    const last = this.torqueCurve[this.torqueCurve.length - 1];
    if (first === void 0 || last === void 0) return 0;
    if (rpm <= first.rpm) return first.torque;
    if (rpm >= last.rpm) return last.torque;
    for (let index = 1; index < this.torqueCurve.length; index += 1) {
      const upper = this.torqueCurve[index];
      const lower = this.torqueCurve[index - 1];
      if (upper !== void 0 && lower !== void 0 && rpm <= upper.rpm) {
        const range = Math.max(1, upper.rpm - lower.rpm);
        const fraction = (rpm - lower.rpm) / range;
        return lower.torque + (upper.torque - lower.torque) * fraction;
      }
    }
    return last.torque;
  }
  /** Current net torque available at the crank before clutch load. */
  getTorqueSample() {
    if (!this.isRunning) {
      return {
        combustionTorque: 0,
        engineBrakingTorque: 0,
        idleControlTorque: 0,
        netCrankTorque: 0
      };
    }
    const rpmRange = Math.max(1, this.config.redlineRPM - this.config.idleRPM);
    const normalizedRPM = clamp((this.currentRPM - this.config.idleRPM) / rpmRange, 0, 1);
    const limiterMultiplier = this.fuelCutActive ? 0 : 1;
    const combustionTorque = this.getTorqueAtRPM(this.currentRPM) * this.throttle * limiterMultiplier;
    const engineBrakingTorque = (this.config.engineFrictionTorque + this.config.engineBrakingStrength * normalizedRPM) * (1 - this.throttle) ** 1.6;
    const idleTarget = this.config.idleRPM;
    const idleError = clamp(
      (idleTarget - this.currentRPM) / Math.max(1, this.config.idleControlBandRPM),
      0,
      1
    );
    const idleReserve = Math.max(0, this.config.idleControlStrength - engineBrakingTorque);
    const idleActivation = clamp(
      (this.config.idleRPM * 1.15 - this.currentRPM) / Math.max(1, this.config.idleRPM * 0.15),
      0,
      1
    );
    const idleControlTorque = (engineBrakingTorque + idleReserve * idleError) * idleActivation;
    const netCrankTorque = combustionTorque + idleControlTorque - engineBrakingTorque;
    return { combustionTorque, engineBrakingTorque, idleControlTorque, netCrankTorque };
  }
  /** Apply clutch load and integrate crankshaft angular velocity. */
  integrate(dt2, clutchLoadTorque) {
    if (!Number.isFinite(dt2) || dt2 <= 0) return;
    if (!this.isRunning) {
      this.currentRPM = 0;
      return;
    }
    const torque = this.getTorqueSample().netCrankTorque - clutchLoadTorque;
    const angularAcceleration = torque / Math.max(0.01, this.config.engineInertia);
    const nextAngularVelocity = rpmToRadiansPerSecond(this.currentRPM) + angularAcceleration * dt2;
    const nextRPM = clamp(radiansPerSecondToRPM(nextAngularVelocity), 0, this.config.maxRPM);
    if (nextRPM <= this.config.stallRPM) {
      this.stop();
      return;
    }
    this.currentRPM = nextRPM;
    if (this.currentRPM >= this.config.revLimiterRPM) this.fuelCutActive = true;
    if (this.currentRPM < this.config.revLimiterRPM - 250) this.fuelCutActive = false;
    if (!Number.isFinite(this.currentRPM)) this.reset();
  }
  get angularVelocity() {
    return rpmToRadiansPerSecond(this.currentRPM);
  }
  get isOnLimiter() {
    return this.fuelCutActive;
  }
};

// src/vehicle/physics/Gearbox.ts
var ALL_FORWARD_GEARS = [1, 2, 3, 4, 5, 6, 7];
var Gearbox = class {
  constructor(config, initialGear = "N") {
    this.config = config;
    this.currentGear = initialGear;
  }
  config;
  currentGear;
  setGear(gear) {
    this.currentGear = gear;
  }
  reset(gear = "N") {
    this.currentGear = gear;
  }
  getRatio(gear = this.currentGear) {
    if (gear === "N") return 0;
    if (gear === "R") return this.config.reverseRatio;
    return this.config.gearRatios[gear] ?? 0;
  }
  getShiftUpGear() {
    const shiftOrder = ["R", "N", ...this.getForwardGears()];
    const index = shiftOrder.indexOf(this.currentGear);
    if (index < 0) return "N";
    return shiftOrder[Math.min(shiftOrder.length - 1, index + 1)] ?? this.currentGear;
  }
  getShiftDownGear() {
    const shiftOrder = ["R", "N", ...this.getForwardGears()];
    const index = shiftOrder.indexOf(this.currentGear);
    if (index < 0) return "N";
    return shiftOrder[Math.max(0, index - 1)] ?? this.currentGear;
  }
  getForwardGears() {
    return ALL_FORWARD_GEARS.filter((gear) => {
      const ratio = this.config.gearRatios[gear];
      return ratio !== void 0 && Number.isFinite(ratio) && ratio > 0;
    });
  }
  getMaximumForwardGear() {
    return this.getForwardGears().at(-1) ?? 1;
  }
  isGearAvailable(gear) {
    return gear === "R" || gear === "N" || this.getForwardGears().includes(gear);
  }
  /** Signed input-shaft speed; reverse ratio and reverse motion cancel. */
  getInputAngularVelocity(vehicleSpeed, wheelRadius) {
    const wheelAngularVelocity = vehicleSpeed / Math.max(0.01, wheelRadius);
    return wheelAngularVelocity * this.getRatio() * this.config.finalDriveRatio;
  }
  getCoupledEngineRPM(vehicleSpeed, wheelRadius) {
    return radiansPerSecondToRPM(this.getInputAngularVelocity(vehicleSpeed, wheelRadius));
  }
  getWheelTorque(clutchTorque) {
    return clutchTorque * this.getRatio() * this.config.finalDriveRatio * this.config.drivetrainEfficiency;
  }
  getTheoreticalSpeedAtRPM(gear, engineRPM, wheelRadius) {
    const ratio = Math.abs(this.getRatio(gear) * this.config.finalDriveRatio);
    if (ratio <= 0) return 0;
    return rpmToRadiansPerSecond(engineRPM) / ratio * wheelRadius;
  }
  static isForwardGear(gear) {
    return typeof gear === "number";
  }
};

// src/vehicle/physics/SteeringSystem.ts
var SteeringSystem = class {
  constructor(config, wheelBase = 2.7, frontTrackWidth = 1.55) {
    this.config = config;
    this.wheelBase = wheelBase;
    this.frontTrackWidth = frontTrackWidth;
  }
  config;
  wheelBase;
  frontTrackWidth;
  steeringInput = 0;
  steeringAngle = 0;
  steeringWheelAngle = 0;
  leftRoadWheelAngle = 0;
  rightRoadWheelAngle = 0;
  reset() {
    this.steeringInput = 0;
    this.steeringAngle = 0;
    this.steeringWheelAngle = 0;
    this.leftRoadWheelAngle = 0;
    this.rightRoadWheelAngle = 0;
  }
  update(dt2, targetInput, speed) {
    const command = clamp(targetInput, -1, 1);
    const response = Math.abs(command) < 1e-3 ? this.config.steeringReturnRate : this.config.steeringResponse;
    this.steeringInput = damp(this.steeringInput, command, response, dt2);
    const speedReduction = 1 / (1 + this.config.highSpeedSteeringReduction * speed * speed);
    const targetRoadWheelAngle = this.steeringInput * this.config.maxRoadWheelAngle * speedReduction;
    this.steeringAngle = damp(
      this.steeringAngle,
      targetRoadWheelAngle,
      this.config.steeringDamping,
      dt2
    );
    this.steeringWheelAngle = this.steeringInput * this.config.steeringWheelLock * 0.5;
    this.updateAckermannAngles();
    if (!Number.isFinite(this.steeringAngle)) this.reset();
  }
  updateAckermannAngles() {
    const centre = this.steeringAngle;
    const magnitude = Math.abs(centre);
    if (magnitude < 1e-5) {
      this.leftRoadWheelAngle = centre;
      this.rightRoadWheelAngle = centre;
      return;
    }
    const radius = Math.max(this.frontTrackWidth, this.wheelBase / Math.tan(magnitude));
    const inner = Math.atan(
      this.wheelBase / Math.max(0.05, radius - this.frontTrackWidth * 0.5)
    );
    const outer = Math.atan(
      this.wheelBase / (radius + this.frontTrackWidth * 0.5)
    );
    const ackermann = clamp(this.config.ackermannFactor, 0, 1);
    const blendedInner = magnitude + (inner - magnitude) * ackermann;
    const blendedOuter = magnitude + (outer - magnitude) * ackermann;
    if (centre > 0) {
      this.leftRoadWheelAngle = blendedOuter;
      this.rightRoadWheelAngle = blendedInner;
    } else {
      this.leftRoadWheelAngle = -blendedInner;
      this.rightRoadWheelAngle = -blendedOuter;
    }
  }
};

// src/vehicle/physics/UpshiftAdvisor.ts
var UpshiftAdvisor = class {
  constructor(config, maximumForwardGear = 5) {
    this.config = config;
    this.maximumForwardGear = maximumForwardGear;
    this.sample = {
      targetRPM: this.getTargetRPM(0, 1),
      available: false,
      recommended: false
    };
  }
  config;
  maximumForwardGear;
  sample;
  reset() {
    this.sample = {
      targetRPM: this.getTargetRPM(0, 1),
      available: false,
      recommended: false
    };
  }
  update(context) {
    const targetRPM = this.getTargetRPM(context.throttle, context.gear);
    const minimumSpeedKmh = Math.max(0, this.finiteOr(this.config.minimumSpeedKmh, 0));
    const isForwardUpshiftGear = typeof context.gear === "number" && context.gear >= 1 && context.gear < this.maximumForwardGear;
    const available = isForwardUpshiftGear && !context.shiftInProgress && this.finiteOr(context.speedKmh, 0) >= minimumSpeedKmh;
    let recommended = this.sample.recommended;
    if (!available) {
      recommended = false;
    } else {
      const hysteresisRPM = Math.max(0, this.finiteOr(this.config.hysteresisRPM, 0));
      const releaseRPM = targetRPM - hysteresisRPM;
      const engineRPM = Math.max(0, this.finiteOr(context.engineRPM, 0));
      recommended = recommended ? engineRPM >= releaseRPM : engineRPM >= targetRPM;
    }
    this.sample = { targetRPM, available, recommended };
    return this.getSample();
  }
  getSample() {
    return { ...this.sample };
  }
  /** Returns the calibrated 1,500--2,500-ish target before eligibility gates. */
  getTargetRPM(throttle, gear) {
    const low = Math.max(1, this.finiteOr(this.config.lightLoadRPM, 1700));
    const high = Math.max(low, this.finiteOr(this.config.highLoadRPM, 2500));
    const exponent = Math.max(
      0.05,
      this.finiteOr(this.config.throttleCurveExponent, 0.65)
    );
    const load = clamp01(this.finiteOr(throttle, 0)) ** exponent;
    const firstGearOffset = gear === 1 ? Math.max(0, this.finiteOr(this.config.firstGearOffsetRPM, 0)) : 0;
    return clamp(low + (high - low) * load + firstGearOffset, low, high);
  }
  finiteOr(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }
};

// src/vehicle/physics/WheelContact.ts
var WHEEL_IDS = VEHICLE_WHEEL_IDS;

// src/vehicle/physics/SuspensionSystem.ts
var SuspensionSystem = class {
  constructor(config) {
    this.config = config;
    this.reset();
  }
  config;
  corners = {};
  longitudinalAcceleration = 0;
  lateralAcceleration = 0;
  previousRideOffset = 0;
  chassis = { groundHeight: 0, rideOffset: 0, pitch: 0, roll: 0, verticalVelocity: 0 };
  reset() {
    this.longitudinalAcceleration = 0;
    this.lateralAcceleration = 0;
    this.previousRideOffset = 0;
    this.chassis = { groundHeight: 0, rideOffset: 0, pitch: 0, roll: 0, verticalVelocity: 0 };
    for (const id of WHEEL_IDS) {
      const load = this.staticLoad(id);
      this.corners[id] = { compression: load / this.springRate(id), velocity: 0, load, spring: load, damper: 0 };
    }
  }
  update(dt2, step) {
    const safeDt = clamp(Number.isFinite(dt2) ? dt2 : 0, 0, this.config.safety.maxSubstep);
    const accelerationBlend = 1 - Math.exp(-10 * safeDt);
    this.longitudinalAcceleration += (clamp(this.finite(step.longitudinalAcceleration), -12, 12) - this.longitudinalAcceleration) * accelerationBlend;
    this.lateralAcceleration += (clamp(this.finite(step.lateralAcceleration), -12, 12) - this.lateralAcceleration) * accelerationBlend;
    let normalY = step.normal?.y ?? 1;
    if (step.contacts !== void 0) normalY = WHEEL_IDS.reduce((sum, id) => sum + step.contacts[id].normal.y * 0.25, 0);
    const supportedWeight = this.config.mass * this.config.gravity * clamp(this.finite(normalY, 1), 0.3, 1);
    const frontShare = clamp(this.config.frontWeightBias, 0.05, 0.95);
    const longitudinalTransfer = this.config.mass * this.longitudinalAcceleration * this.config.centerOfMassHeight / Math.max(0.5, this.config.wheelBase);
    const frontLateralTransfer = this.config.mass * frontShare * this.lateralAcceleration * this.config.centerOfMassHeight / Math.max(0.5, this.config.frontTrackWidth);
    const rearLateralTransfer = this.config.mass * (1 - frontShare) * this.lateralAcceleration * this.config.centerOfMassHeight / Math.max(0.5, this.config.rearTrackWidth);
    const targetLoads = {
      frontLeft: supportedWeight * frontShare * 0.5 - longitudinalTransfer * 0.5 + frontLateralTransfer,
      frontRight: supportedWeight * frontShare * 0.5 - longitudinalTransfer * 0.5 - frontLateralTransfer,
      rearLeft: supportedWeight * (1 - frontShare) * 0.5 + longitudinalTransfer * 0.5 + rearLateralTransfer,
      rearRight: supportedWeight * (1 - frontShare) * 0.5 + longitudinalTransfer * 0.5 - rearLateralTransfer
    };
    for (const id of WHEEL_IDS) targetLoads[id] = Math.max(this.staticLoad(id) * 0.08, targetLoads[id]);
    const targetTotal = WHEEL_IDS.reduce((sum, id) => sum + targetLoads[id], 0);
    const heights = Object.fromEntries(WHEEL_IDS.map((id) => [id, this.finite(step.contacts?.[id].height)]));
    const groundHeight = WHEEL_IDS.reduce((sum, id) => sum + heights[id] * 0.25, 0);
    const frontHeight = (heights.frontLeft + heights.frontRight) * 0.5;
    const rearHeight = (heights.rearLeft + heights.rearRight) * 0.5;
    const leftHeight = (heights.frontLeft + heights.rearLeft) * 0.5;
    const rightHeight = (heights.frontRight + heights.rearRight) * 0.5;
    const forwardSlope = (frontHeight - rearHeight) / Math.max(0.5, this.config.wheelBase);
    const rightSlope = (rightHeight - leftHeight) / Math.max(0.5, (this.config.frontTrackWidth + this.config.rearTrackWidth) * 0.5);
    for (const id of WHEEL_IDS) {
      const corner = this.corners[id];
      const front = id.startsWith("front");
      const springRate = this.springRate(id);
      const restCompression = this.staticLoad(id) / springRate;
      const wheel = wheelLocalPosition(this.config, id);
      const groundResidual = clamp(heights[id] - groundHeight + wheel.z * forwardSlope - wheel.x * rightSlope, -0.05, 0.05);
      const targetLoad = targetLoads[id] * supportedWeight / Math.max(1, targetTotal);
      const damping = corner.velocity >= 0 ? front ? this.config.suspension.damperCompressionFront : this.config.suspension.damperCompressionRear : front ? this.config.suspension.damperReboundFront : this.config.suspension.damperReboundRear;
      const cornerMass = this.staticLoad(id) / this.config.gravity;
      const acceleration = (targetLoad + springRate * groundResidual - springRate * corner.compression - damping * corner.velocity) / Math.max(20, cornerMass);
      corner.velocity += acceleration * safeDt;
      corner.compression += corner.velocity * safeDt;
      const halfTravel = this.config.suspension.suspensionTravel * 0.5;
      const minimumCompression = Math.max(0, restCompression - halfTravel);
      const maximumCompression = Math.min(this.config.suspension.restLength * 0.94, restCompression + halfTravel);
      const limited = clamp(corner.compression, minimumCompression, maximumCompression);
      if (limited !== corner.compression) corner.velocity = 0;
      corner.compression = limited;
      corner.spring = springRate * corner.compression;
      corner.damper = damping * corner.velocity;
      corner.load = Math.max(this.staticLoad(id) * 0.08, corner.spring + corner.damper);
    }
    const actualTotal = WHEEL_IDS.reduce((sum, id) => sum + this.corners[id].load, 0);
    for (const id of WHEEL_IDS) this.corners[id].load *= supportedWeight / Math.max(1, actualTotal);
    const displacement = (id) => this.corners[id].compression - this.staticLoad(id) / this.springRate(id);
    const frontDisplacement = (displacement("frontLeft") + displacement("frontRight")) * 0.5;
    const rearDisplacement = (displacement("rearLeft") + displacement("rearRight")) * 0.5;
    const leftDisplacement = (displacement("frontLeft") + displacement("rearLeft")) * 0.5;
    const rightDisplacement = (displacement("frontRight") + displacement("rearRight")) * 0.5;
    const rideOffset = -(frontDisplacement + rearDisplacement) * 0.5;
    const rollRestraint = 1 / (1 + this.config.suspension.antiRollStiffness / Math.max(1, this.config.suspension.springRateFront + this.config.suspension.springRateRear));
    this.chassis = {
      groundHeight,
      rideOffset,
      pitch: clamp(Math.atan2(rearDisplacement - frontDisplacement, this.config.wheelBase), -0.065, 0.065),
      roll: clamp(Math.atan2(
        leftDisplacement - rightDisplacement,
        (this.config.frontTrackWidth + this.config.rearTrackWidth) * 0.5
      ) * rollRestraint, -0.075, 0.075),
      verticalVelocity: safeDt > 0 ? (rideOffset - this.previousRideOffset) / safeDt : 0
    };
    this.previousRideOffset = rideOffset;
    return this.getSnapshot();
  }
  getSnapshot() {
    const wheels = Object.fromEntries(WHEEL_IDS.map((id) => [id, {
      normalLoad: this.corners[id].load,
      staticLoad: this.staticLoad(id),
      compression: this.corners[id].compression,
      compressionVelocity: this.corners[id].velocity,
      restCompression: this.staticLoad(id) / this.springRate(id),
      springForce: this.corners[id].spring,
      damperForce: this.corners[id].damper
    }]));
    return { wheels, chassis: { ...this.chassis } };
  }
  staticLoad(id) {
    const frontShare = clamp(this.config.frontWeightBias, 0.05, 0.95);
    return this.config.mass * this.config.gravity * (id.startsWith("front") ? frontShare : 1 - frontShare) * 0.5;
  }
  springRate(id) {
    return Math.max(1e3, id.startsWith("front") ? this.config.suspension.springRateFront : this.config.suspension.springRateRear);
  }
  finite(value, fallback = 0) {
    return value !== void 0 && Number.isFinite(value) ? value : fallback;
  }
};

// src/vehicle/physics/VehicleDynamics.ts
var ZERO_FORCES = {
  wheelForce: 0,
  brakeForce: 0,
  serviceBrakeForce: 0,
  handbrakeForce: 0,
  aerodynamicDragForce: 0,
  rollingResistanceForce: 0,
  gradeForce: 0,
  externalForce: 0,
  netForce: 0,
  engineBrakingForce: 0,
  clutchTorque: 0,
  clutchSlipAngularVelocity: 0
};
var VehicleDynamics = class {
  constructor(config = createDefaultVehiclePhysicsConfig(), initialState = {}) {
    this.config = config;
    this.engine = new Engine(config.engine);
    this.clutch = new Clutch(config.clutch);
    this.autoClutch = new AutoClutchController(config.autoClutch, config.engine.idleRPM);
    this.gearbox = new Gearbox(config.transmission);
    this.brakes = new BrakeSystem(config.brakes, config.wheelRadius);
    this.steering = new SteeringSystem(
      config.steering,
      config.wheelBase,
      config.frontTrackWidth
    );
    this.upshiftAdvisor = new UpshiftAdvisor(
      config.engine.shiftRecommendation,
      this.gearbox.getMaximumForwardGear()
    );
    this.suspension = new SuspensionSystem(config);
    this.lastValidState = {
      x: 0,
      z: 0,
      yaw: 0,
      speed: 0,
      rpm: config.engine.idleRPM,
      engineRunning: true,
      gear: "N",
      clutchEngagement: 0,
      controlMode: "normal",
      bodySlipAngle: 0,
      lateralVelocity: 0,
      contactSlipRecovery: false,
      contactSlipHoldTime: 0,
      yawRate: 0
    };
    this.reset(initialState);
  }
  config;
  engine;
  clutch;
  autoClutch;
  gearbox;
  brakes;
  steering;
  upshiftAdvisor;
  suspension;
  x = 0;
  z = 0;
  yaw = 0;
  /** Signed longitudinal velocity in m/s; negative means reversing. */
  speed = 0;
  acceleration = 0;
  yawRate = 0;
  /** Positive means the velocity vector points to the vehicle's right. */
  bodySlipAngle = 0;
  lateralVelocity = 0;
  lateralAcceleration = 0;
  rearLateralGripFactor = 1;
  forces = { ...ZERO_FORCES };
  previousShiftUp = false;
  previousShiftDown = false;
  controlMode = "normal";
  clutchPedal = 1;
  shiftRejected = false;
  shiftRejectionReason = null;
  shiftEventSequence = 0;
  lastValidState;
  recoveredThisUpdate = false;
  wheels = {};
  /** Preserve an oblique collision's tangent velocity while contact settles. */
  contactSlipRecovery = false;
  contactSlipHoldTime = 0;
  reset(initialState = {}) {
    this.x = this.finiteOr(initialState.x, 0);
    this.z = this.finiteOr(initialState.z, 0);
    this.yaw = wrapAngle(this.finiteOr(initialState.yaw, 0));
    this.speed = clamp(
      this.finiteOr(initialState.speed, 0),
      -this.config.safety.maxReverseSpeed,
      this.config.safety.maxForwardSpeed
    );
    this.acceleration = 0;
    this.yawRate = 0;
    this.bodySlipAngle = 0;
    this.lateralVelocity = 0;
    this.contactSlipRecovery = false;
    this.contactSlipHoldTime = 0;
    this.lateralAcceleration = 0;
    this.rearLateralGripFactor = 1;
    this.suspension.reset();
    this.initializeWheelStates();
    this.engine.reset(
      this.finiteOr(initialState.engineRPM, this.config.engine.idleRPM),
      initialState.engineRunning !== false
    );
    this.gearbox.reset(initialState.gear ?? "N");
    const initialEngagement = this.safeUnitInput(initialState.clutchEngagement ?? 0);
    this.clutch.reset(initialEngagement);
    this.autoClutch.reset(initialEngagement);
    this.brakes.reset();
    this.steering.reset();
    this.upshiftAdvisor.reset();
    this.controlMode = initialState.controlMode === "manual-clutch" ? "manual-clutch" : "normal";
    this.clutchPedal = 1 - initialEngagement;
    this.forces = { ...ZERO_FORCES };
    this.previousShiftUp = false;
    this.previousShiftDown = false;
    this.shiftRejected = false;
    this.shiftRejectionReason = null;
    this.shiftEventSequence = 0;
    this.recoveredThisUpdate = false;
    this.storeLastValidState();
    this.updateUpshiftRecommendation();
    return this.getSnapshot();
  }
  setPose(x, z, yaw, speed = this.speed) {
    if (![x, z, yaw, speed].every(Number.isFinite)) return;
    this.x = x;
    this.z = z;
    this.yaw = wrapAngle(yaw);
    this.speed = clamp(
      speed,
      -this.config.safety.maxReverseSpeed,
      this.config.safety.maxForwardSpeed
    );
    this.storeLastValidState();
  }
  /**
   * Import a collision correction without retaining the pre-impact slip state.
   * CollisionSystem owns contact detection and response; this method only keeps
   * the drivetrain's local velocity and body/velocity heading consistent.
   */
  applyContactCorrection(correction) {
    if (![correction.x, correction.z, correction.velocityX, correction.velocityZ].every(Number.isFinite)) return this.getSnapshot();
    this.x = correction.x;
    this.z = correction.z;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    this.speed = clamp(
      -sin * correction.velocityX - cos * correction.velocityZ,
      -this.config.safety.maxReverseSpeed,
      this.config.safety.maxForwardSpeed
    );
    const lateral = cos * correction.velocityX - sin * correction.velocityZ;
    this.lateralVelocity = lateral;
    this.bodySlipAngle = Math.abs(this.speed) > 0.05 ? Math.atan(lateral / this.speed) : 0;
    this.contactSlipRecovery = Math.abs(lateral) > 0.025;
    this.contactSlipHoldTime = this.contactSlipRecovery ? 0.12 : 0;
    this.yawRate = clamp(
      this.finiteOr(correction.yawRate, 0),
      -this.config.steering.maximumYawRate,
      this.config.steering.maximumYawRate
    );
    this.acceleration = 0;
    this.lateralAcceleration = -this.speed * this.yawRate;
    this.storeLastValidState();
    return this.getSnapshot();
  }
  /**
   * Attempts to crank the engine. Starting in gear is permitted only when the
   * physical clutch is already sufficiently open, so callers can give useful
   * feedback without knowing any drivetrain internals.
   */
  requestEngineStart() {
    if (this.engine.isRunning) return false;
    const drivetrainIsSafe = this.gearbox.currentGear === "N" || 1 - this.clutch.engagement >= this.config.transmission.minimumClutchDisengagementForShift;
    if (!drivetrainIsSafe) return false;
    this.engine.start();
    this.storeLastValidState();
    return true;
  }
  /**
   * Switches ignition off immediately. This is deliberately permitted while
   * moving or in gear; the drivetrain continues to coast/back-drive through
   * the normal clutch model and no pose or velocity state is rewritten.
   */
  requestEngineStop() {
    if (!this.engine.isRunning) return false;
    this.engine.stop();
    this.updateUpshiftRecommendation();
    this.storeLastValidState();
    return true;
  }
  /** One edge-triggered cockpit command can safely operate both directions. */
  requestEngineToggle() {
    if (this.engine.isRunning) {
      this.requestEngineStop();
      return "stopped";
    }
    return this.requestEngineStart() ? "started" : "start-rejected";
  }
  /**
   * Request a gear under the active control mode. Normal mode sequences the
   * automatic clutch; Manual mode swaps immediately only when actually open.
   */
  requestGear(requestedGear, mode = this.controlMode) {
    if (!this.gearbox.isGearAvailable(requestedGear)) {
      return this.rejectShift("gear-not-available");
    }
    let targetGear = requestedGear;
    const directionConflict = requestedGear === "R" && this.speed > this.config.transmission.reverseLockoutSpeed || Gearbox.isForwardGear(requestedGear) && this.speed < -this.config.transmission.reverseLockoutSpeed;
    if (directionConflict) targetGear = "N";
    if (targetGear !== "N" && this.wouldOverRev(targetGear)) {
      return this.rejectShift("engine-over-speed");
    }
    if (targetGear === this.gearbox.currentGear && this.autoClutch.pendingGear === null) {
      return this.rejectShift("already-selected");
    }
    if (mode === "manual-clutch") {
      if (1 - this.clutch.engagement < this.config.transmission.minimumClutchDisengagementForShift) {
        return this.rejectShift("clutch-not-disengaged");
      }
      this.gearbox.setGear(targetGear);
      this.acceptShift();
      return true;
    }
    if (!this.autoClutch.requestShift(targetGear)) {
      return this.rejectShift("shift-in-progress");
    }
    this.acceptShift();
    return true;
  }
  /** Variable-frame entry point with bounded internal substeps. */
  update(deltaTime, input, environment = {}) {
    this.recoveredThisUpdate = false;
    this.validateOrRecover();
    this.updateControlMode(input.controlMode);
    this.processShiftCommands(input);
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) return this.getSnapshot();
    const maxFrameTime = Math.max(1e-4, this.config.safety.maxFrameTime);
    const maxSubstep = Math.max(1e-4, this.config.safety.maxSubstep);
    const frameTime = Math.min(deltaTime, maxFrameTime);
    const stepCount = Math.max(1, Math.ceil(frameTime / maxSubstep));
    const dt2 = frameTime / stepCount;
    for (let step = 0; step < stepCount; step += 1) {
      this.integrateStep(dt2, input, environment);
    }
    return this.getSnapshot();
  }
  /** Single integration step for tests or an upper-layer fixed-step driver. */
  stepFixed(dt2, input, environment = {}) {
    this.recoveredThisUpdate = false;
    this.validateOrRecover();
    this.updateControlMode(input.controlMode);
    this.processShiftCommands(input);
    if (Number.isFinite(dt2) && dt2 > 0) {
      const maxFrameTime = Math.max(1e-4, this.config.safety.maxFrameTime);
      this.integrateStep(Math.min(dt2, maxFrameTime), input, environment);
    }
    return this.getSnapshot();
  }
  getSnapshot() {
    this.synchronizeWheelPositions();
    const upshift = this.upshiftAdvisor.getSample();
    return {
      x: this.x,
      z: this.z,
      yaw: this.yaw,
      speed: this.speed,
      speedKmh: Math.abs(this.speed) * 3.6,
      acceleration: this.acceleration,
      yawRate: this.yawRate,
      bodySlipAngle: this.bodySlipAngle,
      lateralVelocity: this.lateralVelocity,
      lateralAcceleration: this.lateralAcceleration,
      rearLateralGripFactor: this.rearLateralGripFactor,
      rpm: this.engine.currentRPM,
      engineRunning: this.engine.isRunning,
      idleRPM: this.config.engine.idleRPM,
      shiftWarningRPM: upshift.targetRPM,
      recommendedUpshiftRPM: upshift.targetRPM,
      upshiftRecommendationAvailable: upshift.available,
      upshiftRecommended: upshift.recommended,
      redlineWarningRPM: this.config.engine.redlineWarningRPM,
      nearRedline: this.engine.currentRPM >= this.config.engine.redlineWarningRPM,
      onRevLimiter: this.engine.isOnLimiter,
      redlineRPM: this.config.engine.redlineRPM,
      gear: this.gearbox.currentGear,
      requestedGear: this.autoClutch.pendingGear,
      throttle: this.engine.throttle,
      brake: this.brakes.brakeInput,
      handbrake: this.brakes.handbrakeInput,
      steer: this.steering.steeringInput,
      controlMode: this.controlMode,
      clutchPedal: this.controlMode === "manual-clutch" ? this.clutchPedal : 1 - this.clutch.engagement,
      clutchEngagement: this.clutch.engagement,
      clutchState: this.clutch.state,
      autoClutchState: this.autoClutch.state,
      shiftRejected: this.shiftRejected,
      shiftRejectionReason: this.shiftRejectionReason,
      shiftEventSequence: this.shiftEventSequence,
      steeringAngle: this.steering.steeringAngle,
      leftRoadWheelAngle: this.steering.leftRoadWheelAngle,
      rightRoadWheelAngle: this.steering.rightRoadWheelAngle,
      steeringWheelAngle: this.steering.steeringWheelAngle,
      forces: { ...this.forces },
      wheels: Object.fromEntries(WHEEL_IDS.map((id) => [id, {
        ...this.wheels[id],
        worldPosition: { ...this.wheels[id].worldPosition },
        groundNormal: { ...this.wheels[id].groundNormal }
      }])),
      chassis: this.suspension.getSnapshot().chassis,
      recoveredFromInvalidState: this.recoveredThisUpdate
    };
  }
  integrateStep(dt2, input, environment) {
    const throttleCommand = this.safeUnitInput(input.throttle);
    const brakeCommand = this.safeUnitInput(input.brake);
    const handbrakeCommand = this.safeUnitInput(input.handbrake);
    const steerCommand = clamp(this.finiteOr(input.steering, 0), -1, 1);
    let clutchTarget;
    let autoUpdate = {
      targetEngagement: this.clutch.engagement,
      cutThrottle: false
    };
    if (this.controlMode === "normal") {
      autoUpdate = this.autoClutch.update(dt2, {
        currentEngagement: this.clutch.engagement,
        currentGear: this.gearbox.currentGear,
        vehicleSpeed: this.speed,
        engineRPM: this.engine.currentRPM,
        coupledEngineRPM: this.gearbox.getCoupledEngineRPM(
          this.speed,
          this.config.wheelRadius
        ),
        throttle: throttleCommand
      });
      if (autoUpdate.gearToEngage !== void 0) {
        this.gearbox.setGear(autoUpdate.gearToEngage);
      }
      clutchTarget = autoUpdate.targetEngagement;
    } else {
      this.clutchPedal = this.safeUnitInput(input.clutchPedal);
      clutchTarget = this.clutch.pedalToEngagement(this.clutchPedal);
    }
    this.engine.updateThrottle(autoUpdate.cutThrottle ? 0 : throttleCommand, dt2);
    this.brakes.update(dt2, brakeCommand, handbrakeCommand);
    this.steering.update(dt2, steerCommand, this.speed);
    this.clutch.update(dt2, clutchTarget);
    const inputShaftVelocity = this.gearbox.getInputAngularVelocity(
      this.speed,
      this.config.wheelRadius
    );
    const crankTorque = this.engine.getTorqueSample().netCrankTorque;
    const clutchTorque = this.gearbox.currentGear === "N" ? 0 : this.clutch.calculateTransmittedTorque(
      crankTorque,
      this.engine.angularVelocity,
      inputShaftVelocity
    );
    if (this.gearbox.currentGear === "N") {
      this.clutch.lastSlipAngularVelocity = 0;
      this.clutch.lastTransmittedTorque = 0;
    }
    this.engine.integrate(dt2, clutchTorque);
    const dragForce = -0.5 * this.config.aero.airDensity * this.config.aero.dragCoefficient * this.config.aero.frontalArea * this.speed * Math.abs(this.speed);
    const grade = this.getContactGrade(environment);
    const gradeForce = -this.config.mass * this.config.gravity * Math.sin(grade);
    const externalForce = this.finiteOr(environment.externalLongitudinalForce, 0);
    const tyreForces = this.calculateTyreContactForces(
      dt2,
      environment,
      grade,
      this.gearbox.getWheelTorque(clutchTorque) / Math.max(0.01, this.config.wheelRadius),
      dragForce + gradeForce + externalForce
    );
    const {
      wheelForce,
      rollingForce,
      rollingMagnitude,
      serviceBrakeForce,
      handbrakeForce
    } = tyreForces;
    const forceWithoutBrakes = wheelForce + dragForce + rollingForce + gradeForce + externalForce;
    const brakeForce = serviceBrakeForce + handbrakeForce;
    const netForce = forceWithoutBrakes + brakeForce;
    this.acceleration = netForce / Math.max(1, this.config.mass) - this.lateralVelocity * this.yawRate;
    const previousSpeed = this.speed;
    let nextSpeed = previousSpeed + this.acceleration * dt2;
    const crossedZero = previousSpeed > 0 && nextSpeed < 0 || previousSpeed < 0 && nextSpeed > 0;
    const propulsionWouldReverse = Math.abs(wheelForce + gradeForce + externalForce) < Math.abs(dragForce + rollingForce + brakeForce);
    if (crossedZero && propulsionWouldReverse) nextSpeed = 0;
    if (Math.abs(nextSpeed) < 2e-3 && Math.abs(netForce) < rollingMagnitude + 1) nextSpeed = 0;
    this.speed = clamp(
      nextSpeed,
      -this.config.safety.maxReverseSpeed,
      this.config.safety.maxForwardSpeed
    );
    const averageSpeed = (previousSpeed + this.speed) * 0.5;
    this.integrateLateralDynamics(
      dt2,
      averageSpeed,
      tyreForces
    );
    const engineBrakingForce = Math.abs(this.speed) > 0.05 && wheelForce * this.speed < 0 && throttleCommand < 0.05 ? wheelForce : 0;
    this.forces = {
      wheelForce,
      brakeForce,
      serviceBrakeForce,
      handbrakeForce,
      aerodynamicDragForce: dragForce,
      rollingResistanceForce: rollingForce,
      gradeForce,
      externalForce,
      netForce,
      engineBrakingForce,
      clutchTorque,
      clutchSlipAngularVelocity: this.clutch.lastSlipAngularVelocity
    };
    this.applyWorldBounds(environment.bounds);
    this.validateOrRecover();
    this.updateUpshiftRecommendation();
  }
  /** Sum four independently limited contact forces and moments in body coordinates. */
  integrateLateralDynamics(dt2, averageSpeed, contacts) {
    const absoluteSpeed = Math.abs(averageSpeed);
    const collisionHold = this.contactSlipRecovery && this.contactSlipHoldTime > 0;
    if (collisionHold) {
      this.contactSlipHoldTime = Math.max(0, this.contactSlipHoldTime - dt2);
    } else {
      const yawDamping = this.config.tires.lateralSlipRecoveryRate * 0.18 * Math.min(1, absoluteSpeed / 3) * this.rearLateralGripFactor;
      const yawAcceleration = contacts.yawMoment / Math.max(1, this.config.yawInertia) * Math.max(0.05, this.config.steering.yawResponseScale) - this.yawRate * yawDamping;
      this.yawRate += clamp(yawAcceleration, -5, 5) * dt2;
      const maximumYawRate = Math.max(0.1, this.config.steering.maximumYawRate);
      this.yawRate = clamp(this.yawRate, -maximumYawRate, maximumYawRate);
      const lateralAcceleration = contacts.lateralForce / Math.max(1, this.config.mass) + averageSpeed * this.yawRate;
      this.lateralVelocity += lateralAcceleration * dt2;
      if (absoluteSpeed < 0.4) {
        const restBlend = clamp01(1 - absoluteSpeed / 0.4);
        this.yawRate *= Math.exp(-12 * restBlend * dt2);
        this.lateralVelocity *= Math.exp(-12 * restBlend * dt2);
      }
      const slipLimit = Math.max(0.05, this.config.tires.maximumBodySlipAngle) * (averageSpeed < 0 ? 0.55 : 1);
      const velocityLimit = Math.max(0.05, absoluteSpeed) * Math.tan(slipLimit);
      if (!this.contactSlipRecovery) this.lateralVelocity = clamp(this.lateralVelocity, -velocityLimit, velocityLimit);
      if (this.contactSlipRecovery && Math.abs(this.lateralVelocity) < 0.025) this.contactSlipRecovery = false;
    }
    this.bodySlipAngle = absoluteSpeed > 0.05 ? Math.atan(this.lateralVelocity / averageSpeed) : 0;
    const middleYaw = this.yaw + this.yawRate * dt2 * 0.5;
    this.x += (-Math.sin(middleYaw) * averageSpeed + Math.cos(middleYaw) * this.lateralVelocity) * dt2;
    this.z += (-Math.cos(middleYaw) * averageSpeed - Math.sin(middleYaw) * this.lateralVelocity) * dt2;
    this.yaw = wrapAngle(this.yaw + this.yawRate * dt2);
    this.lateralAcceleration = contacts.lateralForce / Math.max(1, this.config.mass);
  }
  /** Refresh contact metadata after the scene adapter's final pose/collision query. */
  syncWheelContacts(contacts) {
    for (const id of WHEEL_IDS) {
      this.wheels[id] = {
        ...this.wheels[id],
        worldPosition: { x: contacts[id].x, y: contacts[id].height + this.config.wheelRadius, z: contacts[id].z },
        surfaceType: contacts[id].surfaceType,
        groundNormal: { ...contacts[id].normal }
      };
    }
  }
  synchronizeWheelPositions() {
    for (const id of WHEEL_IDS) {
      const local = wheelLocalPosition(this.config, id);
      this.wheels[id] = {
        ...this.wheels[id],
        worldPosition: {
          x: this.x + local.x * Math.cos(this.yaw) + local.z * Math.sin(this.yaw),
          y: this.wheels[id].worldPosition.y,
          z: this.z - local.x * Math.sin(this.yaw) + local.z * Math.cos(this.yaw)
        }
      };
    }
  }
  /** Contact normals provide longitudinal slope, including heading across a ramp. */
  getContactGrade(environment) {
    const contacts = environment.wheelContacts;
    const normals = contacts === void 0 ? environment.groundNormal === void 0 ? [] : [environment.groundNormal] : [
      contacts.frontLeft.normal,
      contacts.frontRight.normal,
      contacts.rearLeft.normal,
      contacts.rearRight.normal
    ];
    if (normals.length === 0) return clamp(
      this.finiteOr(environment.gradeRadians, 0),
      -Math.PI * 0.45,
      Math.PI * 0.45
    );
    let x = 0;
    let y = 0;
    let z = 0;
    for (const normal of normals) {
      x += this.finiteOr(normal.x, 0);
      y += Math.max(0, this.finiteOr(normal.y, 1));
      z += this.finiteOr(normal.z, 0);
    }
    return clamp(Math.atan2(
      x * Math.sin(this.yaw) + z * Math.cos(this.yaw),
      Math.max(1e-4, y)
    ), -Math.PI * 0.45, Math.PI * 0.45);
  }
  /**
   * Static axle load is divided across four contacts. Each tyre gets its own
   * drive, brake and resistance budget, so straddling a boundary changes only
   * the contacting side instead of switching the entire car's material.
   */
  calculateTyreContactForces(dt2, environment, grade, requestedDriveForce, otherLongitudinalForce) {
    const suspension = this.suspension.update(dt2, {
      contacts: environment.wheelContacts,
      normal: environment.groundNormal ?? { x: 0, y: Math.cos(grade), z: Math.sin(grade) },
      longitudinalAcceleration: this.acceleration,
      lateralAcceleration: this.lateralAcceleration
    });
    const frontWeight = clamp(this.config.frontWeightBias, 0.05, 0.95);
    const shares = [
      frontWeight * 0.5,
      frontWeight * 0.5,
      (1 - frontWeight) * 0.5,
      (1 - frontWeight) * 0.5
    ];
    const localX = [
      -this.config.frontTrackWidth * 0.5,
      this.config.frontTrackWidth * 0.5,
      -this.config.rearTrackWidth * 0.5,
      this.config.rearTrackWidth * 0.5
    ];
    const wheelContacts = environment.wheelContacts;
    const contacts = wheelContacts === void 0 ? void 0 : [
      wheelContacts.frontLeft,
      wheelContacts.frontRight,
      wheelContacts.rearLeft,
      wheelContacts.rearRight
    ];
    const sharedGrip = Math.max(0, this.finiteOr(environment.surfaceGripMultiplier, 1));
    const legacyLongitudinal = sharedGrip * Math.max(
      0,
      this.finiteOr(environment.surfaceLongitudinalGripMultiplier, 1)
    );
    const legacyLateral = sharedGrip * Math.max(
      0,
      this.finiteOr(environment.surfaceLateralGripMultiplier, 1)
    );
    const legacyRolling = Math.max(
      0,
      this.finiteOr(environment.rollingResistanceMultiplier, 1)
    );
    const gripLong = shares.map((_, i) => Math.max(
      0,
      this.finiteOr(contacts?.[i]?.longitudinalGrip, legacyLongitudinal)
    ));
    const gripLat = shares.map((_, i) => Math.max(
      0,
      this.finiteOr(contacts?.[i]?.lateralGrip, legacyLateral)
    ));
    const rolling = shares.map((_, i) => Math.max(
      0,
      this.finiteOr(contacts?.[i]?.rollingResistance, legacyRolling)
    ));
    const loads = WHEEL_IDS.map((id) => suspension.wheels[id].normalLoad);
    const limits = loads.map((load, i) => this.config.tires.longitudinalGrip * load * gripLong[i]);
    const splitTotal = Math.max(0, this.config.frontTorqueSplit) + Math.max(0, this.config.rearTorqueSplit);
    const frontDriveShare = splitTotal > 1e-6 ? Math.max(0, this.config.frontTorqueSplit) / splitTotal : this.config.drivetrainType === "RWD" ? 0 : this.config.drivetrainType === "AWD" ? 0.5 : 1;
    const driveShares = [
      frontDriveShare * 0.5,
      frontDriveShare * 0.5,
      (1 - frontDriveShare) * 0.5,
      (1 - frontDriveShare) * 0.5
    ];
    const requestedDrive = driveShares.map((share) => requestedDriveForce * share);
    const drive = requestedDrive.map((force, i) => this.smoothForceLimit(force, limits[i]));
    const rollingMagnitudes = loads.map((load, i) => this.config.tires.rollingResistance * load * rolling[i]);
    const rollingForces = rollingMagnitudes.map((magnitude, i) => -magnitude * Math.tanh((this.speed + this.yawRate * localX[i]) / 0.2));
    const sum = (values) => values.reduce((total, value) => total + value, 0);
    const forceWithoutBrakes = sum(drive) + sum(rollingForces) + otherLongitudinalForce;
    const rawServiceForce = this.brakes.calculateServiceForce(this.speed, forceWithoutBrakes);
    const rawHandbrakeForce = this.brakes.calculateHandbrakeForce(
      this.speed,
      forceWithoutBrakes + rawServiceForce
    );
    const frontBrakeShare = clamp(this.config.brakes.frontBrakeBias, 0.02, 0.98);
    const brakeShares = [
      frontBrakeShare * 0.5,
      frontBrakeShare * 0.5,
      (1 - frontBrakeShare) * 0.5,
      (1 - frontBrakeShare) * 0.5
    ];
    const service = brakeShares.map((share) => rawServiceForce * share);
    const requestedHandbrake = shares.map((_, i) => i >= 2 ? rawHandbrakeForce * 0.5 : 0);
    const handbrake = [...requestedHandbrake];
    const usage = [0, 0, 0, 0];
    const lateral = [0, 0, 0, 0];
    const lateralLimits = [0, 0, 0, 0];
    const angles = [this.steering.leftRoadWheelAngle, this.steering.rightRoadWheelAngle, 0, 0];
    const driveBody = [0, 0, 0, 0];
    const serviceBody = [0, 0, 0, 0];
    const handbrakeBody = [0, 0, 0, 0];
    const rollingBody = [0, 0, 0, 0];
    const lateralScrub = [0, 0, 0, 0];
    const rearAvailability = [];
    let asymmetricLongitudinalMoment = 0;
    let totalYawMoment = 0;
    const distanceToFront = clamp(this.config.wheelBase * (1 - frontWeight) - this.config.centerOfMassLongitudinalOffset, this.config.wheelBase * 0.1, this.config.wheelBase * 0.9);
    const distanceToRear = this.config.wheelBase - distanceToFront;
    const longitudinalPositions = [distanceToFront, distanceToFront, -distanceToRear, -distanceToRear];
    for (const i of [0, 1, 2, 3]) {
      const demand = drive[i] + service[i] + handbrake[i];
      const limitedDemand = this.smoothForceLimit(demand, limits[i]);
      const forceScale = Math.abs(demand) > 1e-6 ? limitedDemand / demand : 1;
      drive[i] *= forceScale;
      service[i] *= forceScale;
      handbrake[i] *= forceScale;
      const tyreForce = drive[i] + service[i] + handbrake[i];
      usage[i] = limits[i] > 1 ? clamp01(Math.abs(tyreForce) / limits[i]) : 1;
      const combinedAvailability = 1 - clamp01(this.config.tires.combinedGripLateralReduction) * usage[i] * usage[i];
      const handbrakeUsage = limits[i] > 1 ? clamp01(Math.abs(requestedHandbrake[i]) / limits[i]) : 0;
      const lockedRearAvailability = 1 - (1 - clamp01(this.config.tires.handbrakeRearGripFactor)) * handbrakeUsage * handbrakeUsage * (3 - 2 * handbrakeUsage);
      if (i >= 2) rearAvailability.push(lockedRearAvailability);
      const lateralAvailability = combinedAvailability * lockedRearAvailability;
      lateralLimits[i] = this.config.tires.lateralGrip * loads[i] * gripLat[i] * lateralAvailability;
      const wheelForwardVelocity = this.speed + this.yawRate * localX[i];
      const wheelLateralVelocity = this.lateralVelocity - this.yawRate * longitudinalPositions[i];
      const slipAngle = Math.atan((wheelLateralVelocity - wheelForwardVelocity * Math.tan(angles[i])) / Math.max(3, Math.abs(wheelForwardVelocity)));
      const staticLoad = suspension.wheels[WHEEL_IDS[i]].staticLoad;
      const loadStiffness = Math.max(0.1, loads[i] / Math.max(1, staticLoad));
      const corneringStiffness = (i < 2 ? this.config.tires.corneringStiffnessFront : this.config.tires.corneringStiffnessRear) * 0.5 * loadStiffness;
      const tyreLateral = this.smoothForceLimit(-corneringStiffness * slipAngle, lateralLimits[i]);
      const cosine = Math.cos(angles[i]);
      const sine = Math.sin(angles[i]);
      driveBody[i] = drive[i] * cosine;
      serviceBody[i] = service[i] * cosine;
      handbrakeBody[i] = handbrake[i] * cosine;
      rollingBody[i] = rollingForces[i] * cosine;
      lateralScrub[i] = -tyreLateral * sine;
      const longitudinal = (tyreForce + rollingForces[i]) * cosine + lateralScrub[i];
      lateral[i] = (tyreForce + rollingForces[i]) * sine + tyreLateral * cosine;
      asymmetricLongitudinalMoment += localX[i] * (tyreForce + rollingForces[i]);
      totalYawMoment += localX[i] * longitudinal - longitudinalPositions[i] * lateral[i];
      const id = WHEEL_IDS[i];
      const localWheel = wheelLocalPosition(this.config, id);
      const worldX = this.x + localWheel.x * Math.cos(this.yaw) + localWheel.z * Math.sin(this.yaw);
      const worldZ = this.z - localWheel.x * Math.sin(this.yaw) + localWheel.z * Math.cos(this.yaw);
      const spring = suspension.wheels[id];
      this.wheels[id] = {
        id,
        worldPosition: { x: contacts?.[i]?.x ?? worldX, y: (contacts?.[i]?.height ?? 0) + this.config.wheelRadius, z: contacts?.[i]?.z ?? worldZ },
        surfaceType: contacts?.[i]?.surfaceType ?? "asphalt",
        groundNormal: { ...contacts?.[i]?.normal ?? environment.groundNormal ?? { x: 0, y: Math.cos(grade), z: Math.sin(grade) } },
        normalLoad: loads[i],
        steeringAngle: angles[i],
        driveTorque: requestedDrive[i] * this.config.wheelRadius,
        driveForce: drive[i],
        brakeTorque: Math.abs(rawServiceForce * brakeShares[i]) * this.config.wheelRadius,
        brakeForce: service[i],
        handbrakeTorque: Math.abs(requestedHandbrake[i]) * this.config.wheelRadius,
        handbrakeForce: handbrake[i],
        rollingResistanceForce: rollingForces[i],
        longitudinalForce: longitudinal,
        lateralForce: lateral[i],
        suspensionCompression: spring.compression,
        suspensionVelocity: spring.compressionVelocity,
        suspensionRestCompression: spring.restCompression,
        springForce: spring.springForce,
        damperForce: spring.damperForce,
        wheelAngularVelocity: wheelForwardVelocity / Math.max(0.01, this.config.wheelRadius),
        slipAngle
      };
    }
    this.rearLateralGripFactor = rearAvailability.reduce((total, value) => total + value, 0) * 0.5;
    return {
      wheelForce: sum(driveBody) + sum(lateralScrub),
      serviceBrakeForce: sum(serviceBody),
      handbrakeForce: sum(handbrakeBody),
      rollingForce: sum(rollingBody),
      rollingMagnitude: sum(rollingMagnitudes),
      longitudinalForceLimit: sum(limits),
      frontLateralGrip: (gripLat[0] + gripLat[1]) * 0.5,
      rearLateralGrip: (gripLat[2] + gripLat[3]) * 0.5,
      frontLongitudinalUsage: (usage[0] + usage[1]) * 0.5,
      rearLongitudinalUsage: (usage[2] + usage[3]) * 0.5,
      contactYawAcceleration: clamp(asymmetricLongitudinalMoment / Math.max(1, this.config.yawInertia) * clamp01(this.config.tires.contactYawInfluence), -0.65, 0.65),
      lateralForce: sum(lateral),
      yawMoment: totalYawMoment,
      lateralForceLimit: sum(lateralLimits)
    };
  }
  smoothForceLimit(demand, limit) {
    if (limit <= 1e-6) return 0;
    const ratio = Math.abs(demand) / limit;
    return demand / Math.pow(1 + ratio ** 6, 1 / 6);
  }
  initializeWheelStates() {
    const springs = this.suspension.getSnapshot();
    for (const id of WHEEL_IDS) {
      const local = wheelLocalPosition(this.config, id);
      const spring = springs.wheels[id];
      this.wheels[id] = {
        id,
        worldPosition: {
          x: this.x + local.x * Math.cos(this.yaw) + local.z * Math.sin(this.yaw),
          y: this.config.wheelRadius,
          z: this.z - local.x * Math.sin(this.yaw) + local.z * Math.cos(this.yaw)
        },
        surfaceType: "asphalt",
        groundNormal: { x: 0, y: 1, z: 0 },
        normalLoad: spring.normalLoad,
        steeringAngle: 0,
        driveTorque: 0,
        driveForce: 0,
        brakeTorque: 0,
        brakeForce: 0,
        handbrakeTorque: 0,
        handbrakeForce: 0,
        rollingResistanceForce: 0,
        longitudinalForce: 0,
        lateralForce: 0,
        suspensionCompression: spring.compression,
        suspensionVelocity: 0,
        suspensionRestCompression: spring.restCompression,
        springForce: spring.springForce,
        damperForce: 0,
        wheelAngularVelocity: this.speed / this.config.wheelRadius,
        slipAngle: 0
      };
    }
  }
  updateControlMode(requestedMode) {
    const nextMode = requestedMode === "manual-clutch" ? "manual-clutch" : "normal";
    if (nextMode === this.controlMode) return;
    if (nextMode === "manual-clutch") {
      this.autoClutch.releaseControl(this.clutch.engagement);
      this.clutchPedal = 1 - this.clutch.engagement;
    } else {
      this.autoClutch.takeOver(this.clutch.engagement);
      this.clutchPedal = 1 - this.clutch.engagement;
    }
    this.controlMode = nextMode;
  }
  processShiftCommands(input) {
    const shiftUp = input.shiftUp === true;
    const shiftDown = input.shiftDown === true;
    if (input.directGear !== void 0) {
      this.requestGear(input.directGear, this.controlMode);
    } else if (shiftUp && !this.previousShiftUp && !shiftDown) {
      this.requestGear(this.gearbox.getShiftUpGear(), this.controlMode);
    } else if (shiftDown && !this.previousShiftDown && !shiftUp) {
      this.requestGear(this.gearbox.getShiftDownGear(), this.controlMode);
    }
    this.previousShiftUp = shiftUp;
    this.previousShiftDown = shiftDown;
  }
  wouldOverRev(targetGear) {
    const ratio = this.gearbox.getRatio(targetGear);
    const wheelAngularVelocity = this.speed / Math.max(0.01, this.config.wheelRadius);
    const coupledRPM = Math.abs(
      wheelAngularVelocity * ratio * this.config.transmission.finalDriveRatio * 60 / (Math.PI * 2)
    );
    return coupledRPM > this.config.engine.maxRPM * 1.05;
  }
  acceptShift() {
    this.shiftRejected = false;
    this.shiftRejectionReason = null;
    this.shiftEventSequence += 1;
  }
  rejectShift(reason) {
    this.shiftRejected = true;
    this.shiftRejectionReason = reason;
    this.shiftEventSequence += 1;
    return false;
  }
  applyWorldBounds(bounds) {
    if (bounds === void 0) return;
    if (![bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].every(Number.isFinite)) return;
    if (bounds.minX > bounds.maxX || bounds.minZ > bounds.maxZ) return;
    const boundedX = clamp(this.x, bounds.minX, bounds.maxX);
    const boundedZ = clamp(this.z, bounds.minZ, bounds.maxZ);
    if (boundedX !== this.x || boundedZ !== this.z) {
      this.x = boundedX;
      this.z = boundedZ;
      this.speed = 0;
      this.acceleration = 0;
      this.yawRate = 0;
      this.bodySlipAngle = 0;
      this.lateralVelocity = 0;
      this.lateralAcceleration = 0;
    }
  }
  validateOrRecover() {
    const values = [
      this.x,
      this.z,
      this.yaw,
      this.speed,
      this.acceleration,
      this.yawRate,
      this.bodySlipAngle,
      this.lateralVelocity,
      this.lateralAcceleration,
      this.rearLateralGripFactor,
      this.engine.currentRPM,
      this.clutch.engagement,
      this.clutch.targetEngagement,
      this.brakes.brakeInput,
      this.brakes.handbrakeInput
    ];
    const positionIsReasonable = Math.abs(this.x) <= this.config.safety.maxAbsPosition && Math.abs(this.z) <= this.config.safety.maxAbsPosition;
    if (values.every(Number.isFinite) && positionIsReasonable) {
      this.storeLastValidState();
      return;
    }
    this.x = this.lastValidState.x;
    this.z = this.lastValidState.z;
    this.yaw = this.lastValidState.yaw;
    this.speed = this.lastValidState.speed;
    this.acceleration = 0;
    this.yawRate = this.lastValidState.yawRate;
    this.bodySlipAngle = this.lastValidState.bodySlipAngle;
    this.lateralVelocity = this.lastValidState.lateralVelocity;
    this.contactSlipRecovery = this.lastValidState.contactSlipRecovery;
    this.contactSlipHoldTime = this.lastValidState.contactSlipHoldTime;
    this.lateralAcceleration = -this.speed * this.yawRate;
    this.rearLateralGripFactor = 1;
    this.engine.reset(this.lastValidState.rpm, this.lastValidState.engineRunning);
    this.gearbox.reset(this.lastValidState.gear);
    this.clutch.reset(this.lastValidState.clutchEngagement);
    this.controlMode = this.lastValidState.controlMode;
    this.clutchPedal = 1 - this.clutch.engagement;
    if (this.controlMode === "normal") {
      this.autoClutch.takeOver(this.clutch.engagement);
    } else {
      this.autoClutch.releaseControl(this.clutch.engagement);
    }
    this.brakes.reset();
    this.steering.reset();
    this.upshiftAdvisor.reset();
    this.forces = { ...ZERO_FORCES };
    this.recoveredThisUpdate = true;
  }
  storeLastValidState() {
    this.lastValidState = {
      x: this.x,
      z: this.z,
      yaw: this.yaw,
      speed: this.speed,
      rpm: this.engine.currentRPM,
      engineRunning: this.engine.isRunning,
      gear: this.gearbox.currentGear,
      clutchEngagement: this.clutch.engagement,
      controlMode: this.controlMode,
      bodySlipAngle: this.bodySlipAngle,
      lateralVelocity: this.lateralVelocity,
      contactSlipRecovery: this.contactSlipRecovery,
      contactSlipHoldTime: this.contactSlipHoldTime,
      yawRate: this.yawRate
    };
  }
  safeUnitInput(value) {
    return clamp01(this.finiteOr(value, 0));
  }
  updateUpshiftRecommendation() {
    this.upshiftAdvisor.update({
      engineRPM: this.engine.currentRPM,
      throttle: this.engine.throttle,
      speedKmh: Math.abs(this.speed) * 3.6,
      gear: this.gearbox.currentGear,
      shiftInProgress: this.autoClutch.isShifting
    });
  }
  finiteOr(value, fallback) {
    return value !== void 0 && Number.isFinite(value) ? value : fallback;
  }
};

// src/input/VehicleInputState.ts
function createNeutralVehicleInputState(controlMode = "normal", clutchPedal = 1) {
  return {
    throttle: 0,
    brake: 0,
    steering: 0,
    handbrake: 0,
    clutchPedal: clamp012(clutchPedal),
    lookX: 0,
    lookY: 0,
    shiftUp: false,
    shiftDown: false,
    leftIndicator: false,
    rightIndicator: false,
    hazard: false,
    cycleLights: false,
    engineStart: false,
    cruiseToggle: false,
    controlMode,
    source: "keyboard",
    sourceMetadata: {
      primary: null,
      active: [],
      connected: [],
      lastInputAt: null
    }
  };
}
function clamp012(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

// scripts/inspect-contact-tuning.ts
var dt = 1 / 120;
for (const config of [DEFAULT_VEHICLE_PHYSICS_CONFIG, SPORTS_COUPE_PHYSICS_CONFIG]) {
  const base = createNeutralVehicleInputState();
  const summary = [];
  for (const [speed, steering, brake, handbrake, grass] of [
    [8, 0.6, 0, 0, 1],
    [27.78, 0.6, 0, 0, 1],
    [16, 0.55, 0, 0, 1],
    [16, 0.55, 0, 1, 1],
    [16, 0.6, 0, 0, 1],
    [16, 0.6, 0, 0, 0.45],
    [20, 0.65, 0.35, 0, 1]
  ]) {
    const car = new VehicleDynamics(config, { speed, gear: "N" });
    for (let i = 0; i < (handbrake ? 180 : 120); i++) {
      car.stepFixed(dt, { ...base, steering, brake, handbrake: i < 60 ? 0 : handbrake }, { surfaceLateralGripMultiplier: grass });
    }
    const s = car.getSnapshot();
    summary.push({
      speed,
      steering,
      brake,
      handbrake,
      grass,
      finalSpeed: s.speed,
      yaw: s.yaw,
      yawRate: s.yawRate,
      x: s.x,
      slipDeg: s.bodySlipAngle * 180 / Math.PI,
      vy: s.lateralVelocity,
      rearGrip: s.rearLateralGripFactor,
      load: Object.values(s.wheels).map((w) => Math.round(w.normalLoad)),
      chassis: s.chassis
    });
    if (handbrake) {
      for (let i = 0; i < 600; i++) {
        const s2 = car.stepFixed(dt, base);
        if (i % 60 === 59) console.log("recover step", i, s2.speed, s2.yawRate, s2.lateralVelocity, s2.wheels.frontLeft.lateralForce, s2.wheels.rearLeft.lateralForce);
      }
      console.log("recovery", car.getSnapshot().bodySlipAngle, car.getSnapshot().yawRate);
    }
  }
  console.log(JSON.stringify({ name: config.name, summary }, null, 2));
}
