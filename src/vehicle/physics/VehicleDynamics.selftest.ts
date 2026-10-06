import {
  createNeutralVehicleInputState,
  type VehicleInputState,
} from '../../input/VehicleInputState';
import { DEFAULT_VEHICLE_PHYSICS_CONFIG } from '../config';
import { UpshiftAdvisor } from './UpshiftAdvisor';
import { VehicleDynamics } from './VehicleDynamics';

export interface VehicleDynamicsSelfTestResult {
  straightZ: number;
  rightTurnX: number;
  rightTurnYaw: number;
  gearedCoastSpeed: number;
  neutralCoastSpeed: number;
  manualShiftRejected: boolean;
  manualShiftAccepted: boolean;
  autoShiftPassed: boolean;
  modeTakeoverMaxJump: number;
  handbrakeSlowedVehicle: boolean;
  lightLoadUpshiftRPM: number;
  highLoadUpshiftRPM: number;
  everydayUpshiftRangePassed: boolean;
  upshiftHysteresisPassed: boolean;
  invalidUpshiftSuppressed: boolean;
  redlineIsSeparate: boolean;
  throttleProgressionPassed: boolean;
  steeringSensitivityPassed: boolean;
  steeringContinuityMaxYawStep: number;
  normalSteeringContinuityPassed: boolean;
  highSpeedYawRatio: number;
  highSpeedYawReductionPassed: boolean;
  handbrakeSlideAngleDegrees: number;
  handbrakeYawGain: number;
  handbrakeSlidePassed: boolean;
  handbrakeSlideRecoveryPassed: boolean;
  surfaceGripResponsePassed: boolean;
  longitudinalBaselineSpeedKmh: number;
  longitudinalBaselineDistance: number;
  longitudinalBaselinePassed: boolean;
  manualBrakeStallPassed: boolean;
  idleLoadSagRPM: number;
  idleCreepSpeedKmh: number;
  idleLoadBehaviourPassed: boolean;
  highGearIdleLaunchPrevented: boolean;
  engineRestartInterlockPassed: boolean;
  ignitionTogglePassed: boolean;
  normalFirstGearLaunchPassed: boolean;
  normalAutoClutchAntiStallPassed: boolean;
  nanRecoveryPassed: boolean;
}

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`VehicleDynamics self-test failed: ${message}`);
};

const makeInput = (overrides: Partial<VehicleInputState> = {}): VehicleInputState => ({
  ...createNeutralVehicleInputState(overrides.controlMode ?? 'normal'),
  ...overrides,
});

/**
 * Framework-free numerical regression test useful from a browser console or a
 * test runner. It covers coordinate conventions, clutch ownership and guards.
 */
export function runVehicleDynamicsSelfTest(): VehicleDynamicsSelfTestResult {
  const straight = new VehicleDynamics();
  const autoShiftRequested = straight.requestGear(1);
  for (let step = 0; step < 300; step += 1) {
    straight.update(1 / 120, makeInput({ throttle: 0.55 }));
  }
  const autoShiftPassed = autoShiftRequested && straight.gearbox.currentGear === 1;
  assert(autoShiftPassed, 'Normal mode must complete its automatic-clutch shift');
  assert(straight.z < 0, 'yaw=0 forward motion must travel toward world -Z');
  assert(Math.abs(straight.x) < 1e-6, 'straight motion must not drift laterally');

  const rightTurn = new VehicleDynamics(undefined, { speed: 8, gear: 'N' });
  for (let step = 0; step < 120; step += 1) {
    rightTurn.update(1 / 120, makeInput({ steering: 1 }));
  }
  assert(rightTurn.x > 0, 'positive steering must move the car toward its right (+X)');
  assert(rightTurn.yaw < 0, 'a right turn must produce negative Three.js Y rotation');
  assert(rightTurn.z < 0, 'a forward right turn must retain a -Z component');

  const gearedCoast = new VehicleDynamics(undefined, {
    speed: 22,
    gear: 3,
    engineRPM: 3_600,
    clutchEngagement: 1,
  });
  const neutralCoast = new VehicleDynamics(undefined, { speed: 22, gear: 'N' });
  for (let step = 0; step < 360; step += 1) {
    gearedCoast.update(1 / 120, makeInput());
    neutralCoast.update(1 / 120, makeInput());
  }
  assert(
    gearedCoast.speed < neutralCoast.speed,
    'in-gear engine braking must slow more than neutral coasting',
  );

  const manual = new VehicleDynamics(undefined, {
    gear: 1,
    clutchEngagement: 1,
    controlMode: 'manual-clutch',
  });
  const rejectedSnapshot = manual.stepFixed(1 / 120, makeInput({
    controlMode: 'manual-clutch',
    clutchPedal: 0,
    directGear: 2,
  }));
  const manualShiftRejected =
    rejectedSnapshot.gear === 1 &&
    rejectedSnapshot.shiftRejected &&
    rejectedSnapshot.shiftRejectionReason === 'clutch-not-disengaged';
  assert(manualShiftRejected, 'Manual mode must reject a shift while the clutch is engaged');

  for (let step = 0; step < 30; step += 1) {
    manual.stepFixed(1 / 120, makeInput({
      controlMode: 'manual-clutch',
      clutchPedal: 1,
    }));
  }
  const acceptedSnapshot = manual.stepFixed(1 / 120, makeInput({
    controlMode: 'manual-clutch',
    clutchPedal: 1,
    directGear: 2,
  }));
  const manualShiftAccepted =
    acceptedSnapshot.gear === 2 && !acceptedSnapshot.shiftRejected;
  assert(manualShiftAccepted, 'Manual mode must shift after the player opens the clutch');

  const takeover = new VehicleDynamics(undefined, {
    speed: 4,
    gear: 1,
    engineRPM: 1_800,
    clutchEngagement: 0.48,
    controlMode: 'normal',
  });
  const beforeManual = takeover.clutch.engagement;
  const afterManual = takeover.stepFixed(1 / 120, makeInput({
    controlMode: 'manual-clutch',
    clutchPedal: 1 - beforeManual,
  })).clutchEngagement;
  const beforeNormal = afterManual;
  const afterNormal = takeover.stepFixed(1 / 120, makeInput({
    controlMode: 'normal',
    clutchPedal: 1 - beforeNormal,
  })).clutchEngagement;
  const modeTakeoverMaxJump = Math.max(
    Math.abs(afterManual - beforeManual),
    Math.abs(afterNormal - beforeNormal),
  );
  assert(modeTakeoverMaxJump < 0.03, 'mode takeover must not jump clutch engagement');

  const freeCoast = new VehicleDynamics(undefined, { speed: 12, gear: 'N' });
  const handbrakeCoast = new VehicleDynamics(undefined, { speed: 12, gear: 'N' });
  for (let step = 0; step < 120; step += 1) {
    freeCoast.stepFixed(1 / 120, makeInput());
    handbrakeCoast.stepFixed(1 / 120, makeInput({ handbrake: 1 }));
  }
  const handbrakeSlowedVehicle = handbrakeCoast.speed < freeCoast.speed - 1;
  assert(handbrakeSlowedVehicle, 'handbrake force must slow the vehicle independently');

  const advisor = new UpshiftAdvisor(
    DEFAULT_VEHICLE_PHYSICS_CONFIG.engine.shiftRecommendation,
  );
  const lightLoadUpshiftRPM = advisor.getTargetRPM(0.08, 2);
  const highLoadUpshiftRPM = advisor.getTargetRPM(1, 2);
  const everydayUpshiftRangePassed =
    lightLoadUpshiftRPM >= 1_500 &&
    highLoadUpshiftRPM <= 2_500 &&
    highLoadUpshiftRPM > lightLoadUpshiftRPM;
  assert(
    everydayUpshiftRangePassed,
    'daily upshift targets must rise with load while remaining in the 1,500--2,500 rpm band',
  );

  const advised = advisor.update({
    engineRPM: lightLoadUpshiftRPM + 1,
    throttle: 0.08,
    speedKmh: 40,
    gear: 2,
    shiftInProgress: false,
  });
  const heldNearThreshold = advisor.update({
    engineRPM: lightLoadUpshiftRPM - 50,
    throttle: 0.08,
    speedKmh: 40,
    gear: 2,
    shiftInProgress: false,
  });
  const releasedBelowHysteresis = advisor.update({
    engineRPM:
      lightLoadUpshiftRPM -
      DEFAULT_VEHICLE_PHYSICS_CONFIG.engine.shiftRecommendation.hysteresisRPM -
      1,
    throttle: 0.08,
    speedKmh: 40,
    gear: 2,
    shiftInProgress: false,
  });
  const upshiftHysteresisPassed =
    advised.recommended &&
    heldNearThreshold.recommended &&
    !releasedBelowHysteresis.recommended;
  assert(upshiftHysteresisPassed, 'upshift cue must latch cleanly around its threshold');

  const topGearAdvice = advisor.update({
    engineRPM: 3_000,
    throttle: 0.5,
    speedKmh: 100,
    gear: 5,
    shiftInProgress: false,
  });
  const lowSpeedAdvice = advisor.update({
    engineRPM: 3_000,
    throttle: 0.5,
    speedKmh: 2,
    gear: 1,
    shiftInProgress: false,
  });
  const invalidUpshiftSuppressed =
    !topGearAdvice.available &&
    !topGearAdvice.recommended &&
    !lowSpeedAdvice.available &&
    !lowSpeedAdvice.recommended;
  assert(
    invalidUpshiftSuppressed,
    'upshift advice must be suppressed in top gear and during very low-speed launch',
  );

  const { engine: engineConfig } = DEFAULT_VEHICLE_PHYSICS_CONFIG;
  const redlineIsSeparate =
    engineConfig.redlineWarningRPM > highLoadUpshiftRPM + 2_500 &&
    engineConfig.redlineRPM > engineConfig.redlineWarningRPM &&
    engineConfig.maxRPM >= engineConfig.redlineRPM;
  assert(redlineIsSeparate, 'daily shift advice and redline protection must remain separate');

  const responseCar = new VehicleDynamics();
  responseCar.engine.updateThrottle(1, 0.25);
  const throttleAfterQuarterSecond = responseCar.engine.throttle;
  responseCar.engine.updateThrottle(1, 0.75);
  const throttleAfterOneSecond = responseCar.engine.throttle;
  responseCar.engine.updateThrottle(0, 0.25);
  const throttleAfterLift = responseCar.engine.throttle;
  const throttleProgressionPassed =
    throttleAfterQuarterSecond >= 0.4 &&
    throttleAfterQuarterSecond <= 0.62 &&
    throttleAfterOneSecond >= 0.9 &&
    throttleAfterLift <= 0.2;
  assert(
    throttleProgressionPassed,
    'throttle must build progressively but return promptly when the driver lifts',
  );

  const parkingSteering = responseCar.steering;
  const roadSteering = new VehicleDynamics().steering;
  for (let step = 0; step < 120; step += 1) {
    parkingSteering.update(1 / 120, 1, 0);
    roadSteering.update(1 / 120, 1, 27.78);
  }
  const steeringSensitivityPassed =
    parkingSteering.steeringAngle > 0 &&
    roadSteering.steeringAngle > 0 &&
    roadSteering.steeringAngle < parkingSteering.steeringAngle * 0.4;
  assert(
    steeringSensitivityPassed,
    'full steering at 100 km/h must be substantially calmer than parking-speed lock',
  );

  const lowSpeedHandling = new VehicleDynamics(undefined, { speed: 8, gear: 'N' });
  const highSpeedHandling = new VehicleDynamics(undefined, { speed: 27.78, gear: 'N' });
  let steeringContinuityMaxYawStep = 0;
  let previousLowSpeedYawRate = 0;
  for (let step = 0; step < 120; step += 1) {
    const lowSnapshot = lowSpeedHandling.stepFixed(
      1 / 120,
      makeInput({ steering: 0.6 }),
    );
    highSpeedHandling.stepFixed(1 / 120, makeInput({ steering: 0.6 }));
    steeringContinuityMaxYawStep = Math.max(
      steeringContinuityMaxYawStep,
      Math.abs(lowSnapshot.yawRate - previousLowSpeedYawRate),
    );
    previousLowSpeedYawRate = lowSnapshot.yawRate;
  }
  const normalSteeringContinuityPassed =
    steeringContinuityMaxYawStep < 0.025 &&
    lowSpeedHandling.yawRate < 0 &&
    lowSpeedHandling.x > 0;
  assert(
    normalSteeringContinuityPassed,
    'normal steering yaw must build continuously and retain the right-turn convention',
  );
  const highSpeedYawRatio =
    Math.abs(highSpeedHandling.yawRate) /
    Math.max(1e-4, Math.abs(lowSpeedHandling.yawRate));
  const highSpeedYawReductionPassed =
    highSpeedYawRatio > 0.15 && highSpeedYawRatio < 0.55;
  assert(
    highSpeedYawReductionPassed,
    '100 km/h yaw response must be materially lower, but remain controllable',
  );

  const normalCorner = new VehicleDynamics(undefined, { speed: 16, gear: 'N' });
  const handbrakeCorner = new VehicleDynamics(undefined, { speed: 16, gear: 'N' });
  for (let step = 0; step < 60; step += 1) {
    normalCorner.stepFixed(1 / 120, makeInput({ steering: 0.55 }));
    handbrakeCorner.stepFixed(1 / 120, makeInput({ steering: 0.55 }));
  }
  const slideStartYaw = handbrakeCorner.yaw;
  for (let step = 0; step < 120; step += 1) {
    normalCorner.stepFixed(1 / 120, makeInput({ steering: 0.55 }));
    handbrakeCorner.stepFixed(
      1 / 120,
      makeInput({ steering: 0.55, handbrake: 1 }),
    );
  }
  const handbrakeSlideSnapshot = handbrakeCorner.getSnapshot();
  const normalCornerYawChange = Math.abs(normalCorner.yaw - slideStartYaw);
  const handbrakeYawChange = Math.abs(handbrakeCorner.yaw - slideStartYaw);
  const handbrakeSlideAngleDegrees =
    Math.abs(handbrakeSlideSnapshot.bodySlipAngle) * 180 / Math.PI;
  const handbrakeYawGain = handbrakeYawChange / Math.max(1e-4, normalCornerYawChange);
  const handbrakeSlidePassed =
    handbrakeSlideAngleDegrees >= 7 &&
    handbrakeSlideAngleDegrees <= 25 &&
    Math.abs(handbrakeSlideSnapshot.lateralVelocity) >= 1 &&
    handbrakeSlideSnapshot.rearLateralGripFactor <= 0.2 &&
    handbrakeYawGain > 1.05 &&
    Math.abs(handbrakeSlideSnapshot.yawRate) <
      DEFAULT_VEHICLE_PHYSICS_CONFIG.steering.maximumYawRate;
  assert(
    handbrakeSlidePassed,
    'rear handbrake must create visible velocity/body separation without an instant spin',
  );
  for (let step = 0; step < 180; step += 1) {
    handbrakeCorner.stepFixed(1 / 120, makeInput());
  }
  const recoveredSlide = handbrakeCorner.getSnapshot();
  const handbrakeSlideRecoveryPassed =
    Math.abs(recoveredSlide.bodySlipAngle) < 0.02 &&
    Math.abs(recoveredSlide.yawRate) < 0.05;
  assert(
    handbrakeSlideRecoveryPassed,
    'releasing steering and handbrake must settle the slide progressively',
  );

  const dryCorner = new VehicleDynamics(undefined, { speed: 16, gear: 'N' });
  const lowGripCorner = new VehicleDynamics(undefined, { speed: 16, gear: 'N' });
  for (let step = 0; step < 120; step += 1) {
    dryCorner.stepFixed(1 / 120, makeInput({ steering: 0.6 }));
    lowGripCorner.stepFixed(
      1 / 120,
      makeInput({ steering: 0.6 }),
      { surfaceLateralGripMultiplier: 0.45 },
    );
  }
  const surfaceGripResponsePassed =
    Math.abs(lowGripCorner.yawRate) < Math.abs(dryCorner.yawRate) * 0.65 &&
    Math.abs(lowGripCorner.x) < Math.abs(dryCorner.x);
  assert(
    surfaceGripResponsePassed,
    'reduced road lateral grip must reduce cornering authority and trajectory curvature',
  );

  const longitudinalBaselineSpeedKmh = straight.speed * 3.6;
  const longitudinalBaselineDistance = Math.abs(straight.z);
  const longitudinalBaselinePassed =
    longitudinalBaselineSpeedKmh >= 8.3 &&
    longitudinalBaselineSpeedKmh <= 9.3 &&
    longitudinalBaselineDistance >= 2.2 &&
    longitudinalBaselineDistance <= 2.8;
  assert(
    longitudinalBaselinePassed,
    'parameter refinement must preserve the calibrated 55%-throttle launch baseline',
  );

  const brakeStall = new VehicleDynamics(undefined, {
    speed: 6,
    gear: 1,
    engineRPM: 2_650,
    clutchEngagement: 1,
    controlMode: 'manual-clutch',
  });
  for (let step = 0; step < 600; step += 1) {
    brakeStall.stepFixed(1 / 120, makeInput({
      controlMode: 'manual-clutch',
      clutchPedal: 0,
      brake: 1,
    }));
  }
  const brakeStallSnapshot = brakeStall.getSnapshot();
  const manualBrakeStallPassed =
    !brakeStallSnapshot.engineRunning &&
    brakeStallSnapshot.rpm === 0 &&
    Math.abs(brakeStallSnapshot.speed) < 0.05;
  assert(
    manualBrakeStallPassed,
    'an engaged in-gear manual clutch must stall when the brakes bring the car to rest',
  );

  // Twenty percent engagement represents the early bite region: idle should
  // visibly sag, but the car must only creep instead of surging forward.
  const idleCreep = new VehicleDynamics(undefined, {
    gear: 1,
    engineRPM: DEFAULT_VEHICLE_PHYSICS_CONFIG.engine.idleRPM,
    clutchEngagement: 0.2,
    controlMode: 'manual-clutch',
  });
  for (let step = 0; step < 120; step += 1) {
    idleCreep.stepFixed(1 / 120, makeInput({
      controlMode: 'manual-clutch',
      clutchPedal: 0.8,
    }));
  }
  const idleCreepSnapshot = idleCreep.getSnapshot();
  const idleLoadSagRPM =
    DEFAULT_VEHICLE_PHYSICS_CONFIG.engine.idleRPM - idleCreepSnapshot.rpm;
  const idleCreepSpeedKmh = idleCreepSnapshot.speedKmh;
  const idleLoadBehaviourPassed =
    idleCreepSnapshot.engineRunning &&
    idleLoadSagRPM >= 35 &&
    idleLoadSagRPM <= 230 &&
    idleCreepSpeedKmh > 0.25 &&
    idleCreepSpeedKmh < 3;
  assert(
    idleLoadBehaviourPassed,
    'the first-gear bite point must cause a visible idle sag and a slow, controllable creep',
  );

  const highGearLaunch = new VehicleDynamics(undefined, {
    gear: 5,
    engineRPM: DEFAULT_VEHICLE_PHYSICS_CONFIG.engine.idleRPM,
    clutchEngagement: 1,
    controlMode: 'manual-clutch',
  });
  let highGearPeakSpeedKmh = 0;
  for (let step = 0; step < 240; step += 1) {
    const snapshot = highGearLaunch.stepFixed(1 / 120, makeInput({
      controlMode: 'manual-clutch',
      clutchPedal: 0,
    }));
    highGearPeakSpeedKmh = Math.max(highGearPeakSpeedKmh, snapshot.speedKmh);
  }
  const highGearIdleLaunchPrevented =
    !highGearLaunch.engine.isRunning &&
    highGearPeakSpeedKmh < 1;
  assert(
    highGearIdleLaunchPrevented,
    'fifth gear must stall at idle rather than launching the vehicle',
  );

  const blockedInGear = !highGearLaunch.requestEngineStart();
  for (let step = 0; step < 30; step += 1) {
    highGearLaunch.stepFixed(1 / 120, makeInput({
      controlMode: 'manual-clutch',
      clutchPedal: 1,
    }));
  }
  const restartedWithOpenClutch = highGearLaunch.requestEngineStart();
  const restartedSnapshot = highGearLaunch.getSnapshot();
  const engineRestartInterlockPassed =
    blockedInGear &&
    restartedWithOpenClutch &&
    restartedSnapshot.engineRunning &&
    restartedSnapshot.rpm === DEFAULT_VEHICLE_PHYSICS_CONFIG.engine.idleRPM;
  assert(
    engineRestartInterlockPassed,
    'restart must be rejected in gear with the clutch engaged and accepted once it is open',
  );

  const ignitionToggle = new VehicleDynamics(undefined, {
    speed: 12,
    gear: 3,
    engineRPM: 2_500,
    clutchEngagement: 1,
    controlMode: 'manual-clutch',
  });
  const stoppedByToggle = ignitionToggle.requestEngineToggle() === 'stopped';
  let ignitionOffStayedFinite = true;
  for (let step = 0; step < 30; step += 1) {
    const snapshot = ignitionToggle.stepFixed(1 / 120, makeInput({
      controlMode: 'manual-clutch',
      clutchPedal: 0,
    }));
    ignitionOffStayedFinite &&= [
      snapshot.speed,
      snapshot.rpm,
      snapshot.forces.netForce,
      snapshot.forces.clutchTorque,
    ].every(Number.isFinite);
  }
  const movingInGearRestartBlocked =
    ignitionToggle.requestEngineToggle() === 'start-rejected';
  for (let step = 0; step < 30; step += 1) {
    ignitionToggle.stepFixed(1 / 120, makeInput({
      controlMode: 'manual-clutch',
      clutchPedal: 1,
    }));
  }
  const restartedByToggle = ignitionToggle.requestEngineToggle() === 'started';
  const ignitionToggleSnapshot = ignitionToggle.getSnapshot();
  const ignitionTogglePassed =
    stoppedByToggle &&
    ignitionOffStayedFinite &&
    movingInGearRestartBlocked &&
    restartedByToggle &&
    ignitionToggleSnapshot.engineRunning &&
    ignitionToggleSnapshot.rpm === DEFAULT_VEHICLE_PHYSICS_CONFIG.engine.idleRPM;
  assert(
    ignitionTogglePassed,
    'ignition toggle must stop safely while moving, preserve finite physics, and retain the restart interlock',
  );

  const normalFirstGearLaunchPassed =
    straight.engine.isRunning && straight.speed * 3.6 > 2;
  assert(
    normalFirstGearLaunchPassed,
    `normal-mode first-gear auto-clutch launch must remain usable after stall tuning (got ${(straight.speed * 3.6).toFixed(2)} km/h)`,
  );

  const normalBrakeStop = new VehicleDynamics(undefined, {
    speed: 6,
    gear: 1,
    engineRPM: 2_650,
    clutchEngagement: 1,
    controlMode: 'normal',
  });
  for (let step = 0; step < 600; step += 1) {
    normalBrakeStop.stepFixed(1 / 120, makeInput({ brake: 1 }));
  }
  const normalBrakeStopSnapshot = normalBrakeStop.getSnapshot();
  const normalAutoClutchAntiStallPassed =
    normalBrakeStopSnapshot.engineRunning &&
    Math.abs(normalBrakeStopSnapshot.speed) < 0.05 &&
    normalBrakeStopSnapshot.clutchEngagement < 0.05;
  assert(
    normalAutoClutchAntiStallPassed,
    'normal-mode auto-clutch must open during a stop and keep the engine running',
  );

  gearedCoast.x = Number.NaN;
  const recovered = gearedCoast.update(1 / 120, makeInput());
  const nanRecoveryPassed = recovered.recoveredFromInvalidState && Number.isFinite(recovered.x);
  assert(nanRecoveryPassed, 'NaN state must recover to the last valid snapshot');

  return {
    straightZ: straight.z,
    rightTurnX: rightTurn.x,
    rightTurnYaw: rightTurn.yaw,
    gearedCoastSpeed: gearedCoast.speed,
    neutralCoastSpeed: neutralCoast.speed,
    manualShiftRejected,
    manualShiftAccepted,
    autoShiftPassed,
    modeTakeoverMaxJump,
    handbrakeSlowedVehicle,
    lightLoadUpshiftRPM,
    highLoadUpshiftRPM,
    everydayUpshiftRangePassed,
    upshiftHysteresisPassed,
    invalidUpshiftSuppressed,
    redlineIsSeparate,
    throttleProgressionPassed,
    steeringSensitivityPassed,
    steeringContinuityMaxYawStep,
    normalSteeringContinuityPassed,
    highSpeedYawRatio,
    highSpeedYawReductionPassed,
    handbrakeSlideAngleDegrees,
    handbrakeYawGain,
    handbrakeSlidePassed,
    handbrakeSlideRecoveryPassed,
    surfaceGripResponsePassed,
    longitudinalBaselineSpeedKmh,
    longitudinalBaselineDistance,
    longitudinalBaselinePassed,
    manualBrakeStallPassed,
    idleLoadSagRPM,
    idleCreepSpeedKmh,
    idleLoadBehaviourPassed,
    highGearIdleLaunchPrevented,
    engineRestartInterlockPassed,
    ignitionTogglePassed,
    normalFirstGearLaunchPassed,
    normalAutoClutchAntiStallPassed,
    nanRecoveryPassed,
  };
}
