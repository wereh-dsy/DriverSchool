import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { createVehiclePhysicsConfig, getVehicleDescriptor, VEHICLE_CATALOG } from '../VehicleCatalog';
import { cloneVehiclePhysicsConfig } from '../config';
import { BrakeSystem } from './BrakeSystem';
import { DriverAssistSystem } from './DriverAssistSystem';
import { createDifferential } from './LimitedSlipDifferential';
import { VehicleDynamics } from './VehicleDynamics';
import { WheelRotationSystem } from './WheelRotationSystem';
import { WHEEL_IDS } from './WheelContact';

/** Deterministic boundary/state checks at 120 Hz; no subjective driving calibration. */
export function runVehiclePlatformSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string): void => {
    assertions++; if (!ok) throw new Error(`Vehicle platform: ${message}`);
  };
  const dt = 1 / 120, neutral = createNeutralVehicleInputState();
  for (const descriptor of VEHICLE_CATALOG) {
    assert(Object.keys(descriptor.capabilities).length === 19, `${descriptor.id}: complete support flags`);
    assert(descriptor.capabilities.awd === (descriptor.physicsConfig.drivetrainType === 'AWD'), 'layout and AWD support agree');
    assert(!(descriptor.capabilities.mechanicalHandbrake && descriptor.capabilities.electronicParkingBrake), 'one parking actuator type');
  }
  const gtConfig = createVehiclePhysicsConfig('sport-coupe');
  const diff = createDifferential('rear', gtConfig.rearDiff);
  assert(diff.getSnapshot().type === 'lsd', 'GT uses the configured rear LSD');
  let previous = 500;
  for (let n = 0; n < 180; n++) {
    diff.updateSpeeds(25, 90); diff.distributeTorque(1000, dt);
    assert(Math.abs(diff.leftTorque + diff.rightTorque - 1000) < 1e-9, 'LSD conserves axle torque');
    assert(Math.abs(diff.leftTorque - previous) < 15, 'constant input locking ramps without torque spikes');
    assert(diff.leftTorque * 25 + diff.rightTorque * 90 <= 1000 * 57.5, 'LSD coupling dissipates shaft power');
    previous = diff.leftTorque;
  }
  assert(diff.leftTorque > diff.rightTorque * 1.5, 'LSD biases the slower wheel');
  diff.updateSpeeds(90, 25); diff.distributeTorque(1000, dt);
  assert(diff.leftTorque * 90 + diff.rightTorque * 25 <= 1000 * 57.5, 'speed reversal never adds shaft power');
  diff.updateSpeeds(-25, -90);
  for (let n = 0; n < 120; n++) diff.distributeTorque(-1000, dt);
  assert(diff.leftTorque < diff.rightTorque && Math.abs(diff.leftTorque + diff.rightTorque + 1000) < 1e-9, 'reverse torque bias and conservation');
  diff.reset(); assert(diff.getSnapshot().inputTorque === 0 && diff.getSnapshot().lockingTorque === 0, 'LSD reset clears memory');
  const splitTraction = (limited: boolean): number => {
    const carrier = createDifferential('rear', limited ? gtConfig.rearDiff : { type: 'open' });
    const wheels = new WheelRotationSystem(gtConfig.tires, gtConfig.wheelRadius); wheels.reset(8);
    for (let n = 0; n < 240; n++) {
      carrier.updateSpeeds(wheels.getAngularVelocity('rearLeft'), wheels.getAngularVelocity('rearRight'));
      carrier.distributeTorque(1600, dt);
      for (const id of ['rearLeft', 'rearRight'] as const) wheels.updateWheel(id, dt, {
        longitudinalSpeed: 8, lateralSpeed: 0, normalLoad: 4000, staticNormalLoad: 4000,
        driveTorque: id === 'rearLeft' ? carrier.leftTorque : carrier.rightTorque,
        brakeTorque: 0, handbrakeTorque: 0, surfaceLongitudinalGrip: id === 'rearLeft' ? 1 : .15,
      });
    }
    return wheels.getSnapshot('rearLeft').longitudinalForce + wheels.getSnapshot('rearRight').longitudinalForce;
  };
  const openTraction = splitTraction(false), lsdTraction = splitTraction(true);
  assert(lsdTraction > openTraction * 1.1, 'GT LSD produces more actual split-surface tyre force');

  const luxury = createVehiclePhysicsConfig('executive-lwb-2t');
  const copy = cloneVehiclePhysicsConfig(luxury);
  copy.parkingBrake!.applyRate = 9;
  assert(luxury.parkingBrake!.applyRate !== copy.parkingBrake!.applyRate, 'parking calibration is detached');
  const aids = new DriverAssistSystem(luxury);
  const wheels = new VehicleDynamics(luxury, { speed: 10, driveSelector: 'D' }).getSnapshot().wheels;
  Object.assign(wheels.frontLeft, { slipRatio: .8, longitudinalSpeed: 10, angularVelocity: 80 });
  Object.assign(wheels.frontRight, { slipRatio: 0, longitudinalSpeed: 10, angularVelocity: 10 / luxury.wheelRadius });
  for (let n = 0; n < 120; n++) aids.updateTraction(dt, wheels, .5, true, true);
  assert(aids.differentialBrakeTorques[0]! > 100 && aids.differentialBrakeTorques[1] === 0, 'eDiff requests only the spinning side');
  assert(aids.engineTorqueFactor < 1, 'existing TCS torque intervention remains active alongside eDiff');
  const brakes = new BrakeSystem(luxury.brakes);
  brakes.setTractionRequests(aids.differentialBrakeTorques);
  brakes.setDriverAidState(.65, [1, 1, 1, 1], [500, 0, 0, 0]);
  brakes.prepareRequests();
  Object.assign(wheels.frontLeft, { slipRatio: -.6 });
  for (let n = 0; n < 60; n++) aids.updateBrakes(dt, 10, 0, wheels, [4000, 4000, 4000, 4000], brakes.coordinator);
  brakes.setDriverAidState(aids.frontBrakeBias, aids.pressures, [500, 0, 0, 0]);
  const merged = brakes.getWheelTorques('frontLeft');
  assert(merged.requestedBrakeTorque === 500 && merged.appliedBrakeTorque < 100, 'ABS reduces merged ESC/eDiff demand without double counting');
  brakes.setHoldingRequests(.6, .5, luxury.parkingBrake, .8);
  const held = brakes.getWheelTorques('rearLeft');
  assert(held.requestedBrakeTorque > 0 && held.appliedHandbrakeTorque > 0, 'hold and parking use distinct actuators through one coordinator');

  for (const id of ['executive-lwb-2t', 'road-suv-v6-8at'] as const) {
    const config = createVehiclePhysicsConfig(id);
    for (const grade of [0, .12, -.12]) {
      const car = new VehicleDynamics(config, { engineRunning: true, driveSelector: 'D', gear: 1 });
      let state = car.getSnapshot();
      for (let n = 0; n < 180; n++) state = car.stepFixed(dt, { ...neutral, brake: .65 }, { gradeRadians: grade });
      assert(state.autoHold.holding, `${id}: hold captures on grade ${grade}`);
      const stoppedAt = state.z;
      for (let n = 0; n < 240; n++) state = car.stepFixed(dt, neutral, { gradeRadians: grade });
      assert(Math.abs(state.z - stoppedAt) < .03 && Math.abs(state.speed) < .005, `${id}: hydraulic hold prevents rollback`);
      assert(Object.values(state.wheels).some(w => w.appliedBrakeTorque > 100), 'hold has actual wheel torque');
      for (let n = 0; n < 45; n++) state = car.stepFixed(dt, { ...neutral, throttle: .01 }, { gradeRadians: grade });
      assert(state.autoHold.holding && !state.autoHold.releasing, 'one percent throttle does not release hold');
      let priorPressure = state.autoHold.pressure;
      for (let n = 0; n < 180; n++) {
        state = car.stepFixed(dt, { ...neutral, throttle: .45 }, { gradeRadians: grade });
        assert(priorPressure - state.autoHold.pressure <= config.autoHold!.releaseRate * dt + 1e-9, 'hydraulic release remains rate limited');
        priorPressure = state.autoHold.pressure;
      }
      assert(!state.autoHold.holding && state.autoHold.pressure === 0 && state.speed > .05,
        `${id}: drive request releases and launches on ${grade}: ${JSON.stringify({ speed: state.speed, rpm: state.rpm, autoHold: state.autoHold, parking: state.parkingBrake, gear: state.gear })}`);
    }
    const car = new VehicleDynamics(config, { driveSelector: 'D', gear: 1 });
    for (let n = 0; n < 120; n++) car.stepFixed(dt, { ...neutral, brake: .7 }, { gradeRadians: .1 });
    assert(car.requestEngineStop(), 'ignition can turn off during hold');
    let state = car.getSnapshot();
    const parkedAt = state.z;
    for (let n = 0; n < 180; n++) {
      state = car.stepFixed(dt, neutral, { gradeRadians: .1 });
      assert(state.autoHold.pressure > 0 || state.parkingBrake.fraction > 0, 'hold-to-EPB transfer has continuous brake support');
    }
    assert(state.parkingBrake.engaged && state.autoHold.state === 'OFF' && state.autoHold.pressure === 0,
      `${id}: shutdown completes one EPB handoff`);
    assert(Math.abs(state.z - parkedAt) < .03, 'EPB parking supports the grade');
    // Automatic engagement must remain operable with the same latched action.
    state = car.stepFixed(dt, { ...neutral, handbrake: 1 });
    assert(state.parkingBrake.state === 'RELEASING' && state.parkingBrake.fraction > .9, 'manual action releases automatically engaged EPB smoothly');
    car.reset({ speed: 25, gear: 4, driveSelector: 'D' });
    for (let n = 0; n < 60; n++) state = car.stepFixed(dt, { ...neutral, handbrake: 1 });
    assert(state.parkingBrake.fraction === 0 && state.parkingBrake.emergencyBraking,
      `${id}: moving EPB uses controlled hydraulic braking`);
    assert(WHEEL_IDS.every(w => state.wheels[w].appliedHandbrakeTorque === 0), 'moving EPB never locks a parking axle');
    assert(state.speed < 25 && state.wheels.frontLeft.appliedBrakeTorque > 0, 'EPB emergency request actually decelerates through service brakes');
    car.reset({ driveSelector: 'P' });
    for (let n = 0; n < 120; n++) state = car.stepFixed(dt, neutral);
    assert(state.parkingBrake.engaged && !state.autoHold.holding, 'P applies parking once without Auto Hold');
    assert(car.requestDriveSelector('D', 1), 'parked car accepts a brake-protected drive request');
    for (let n = 0; n < 180; n++) state = car.stepFixed(dt, { ...neutral, throttle: .4 });
    assert(state.parkingBrake.state === 'RELEASED' && state.speed > .1, 'drive intent smoothly releases automatic parking');
    car.reset({ driveSelector: 'D' });
    state = car.stepFixed(dt, { ...neutral, handbrake: 1 });
    assert(state.parkingBrake.applying && state.parkingBrake.fraction < .03, 'manual stationary apply begins with limited actuator travel');
    for (let n = 0; n < 120; n++) state = car.stepFixed(dt, { ...neutral, handbrake: 1 });
    assert(state.parkingBrake.engaged, 'holding the latched command never retriggers EPB');
    for (let n = 0; n < 80; n++) state = car.stepFixed(dt, neutral);
    assert(state.parkingBrake.state === 'RELEASED', 'next handbrake action completes manual release');
    car.reset({ driveSelector: 'N' });
    for (let n = 0; n < 120; n++) state = car.stepFixed(dt, { ...neutral, brake: .7 });
    assert(!state.autoHold.holding, 'N does not capture Auto Hold');
    car.reset({ driveSelector: 'R', gear: 'R' });
    for (let n = 0; n < 120; n++) state = car.stepFixed(dt, { ...neutral, brake: .7 });
    assert(state.autoHold.holding, 'reverse supports stop hold');
    car.setAutoHoldEnabled(false);
    for (let n = 0; n < 60; n++) state = car.stepFixed(dt, neutral);
    assert(!state.autoHold.enabled && !state.autoHold.holding, 'Auto Hold can be independently disabled');
  }
  const disabled = createVehiclePhysicsConfig('executive-lwb-2t');
  disabled.parkingBrake = undefined; disabled.autoHold = undefined;
  disabled.transmission.supportsManualSelection = false;
  disabled.capabilities = { ...disabled.capabilities, driveModes: false, abs: false, ebd: false, tcs: false, esc: false };
  const noFeatures = new VehicleDynamics(disabled, { driveSelector: 'D' });
  noFeatures.setDriverAssistOptions({ absEnabled: true, ebdEnabled: true, tractionControlEnabled: true, stabilityControlEnabled: true });
  let disabledState = noFeatures.stepFixed(dt, { ...neutral, brake: .7, cycleDriveMode: true });
  assert(!disabledState.autoHold.enabled && !noFeatures.parkingBrake && !disabledState.driveMode, 'system removal and optional declarations disable features');
  assert(!disabledState.driverAssists.absEnabled && !disabledState.driverAssists.ebdEnabled &&
    !disabledState.driverAssists.tractionControlEnabled && !disabledState.driverAssists.stabilityControlEnabled,
    'settings cannot enable unsupported aids');
  const noPaddles = new VehicleDynamics(disabled, { speed: 15, gear: 4, driveSelector: 'D', engineRPM: 2200 });
  const noManual = noPaddles.stepFixed(dt, { ...neutral, shiftDown: true, brake: .65 });
  assert(!noManual.transmission.manualSelectionActive, 'transmission calibration disables stepped manual selection');
  const mechanical = new VehicleDynamics(gtConfig);
  for (let n = 0; n < 120; n++) disabledState = mechanical.stepFixed(dt, { ...neutral, handbrake: 1 });
  assert(!mechanical.parkingBrake && disabledState.wheels.rearLeft.appliedHandbrakeTorque > 1000, 'GT cable handbrake is preserved');
  assert(getVehicleDescriptor('family-sedan').capabilities.mechanicalHandbrake, 'school sedan retains mechanical handbrake');
  const source = mechanical.torqueSource;
  assert(source === mechanical.engine && source.shaftAngularVelocity > 0 && source.canDeliverTorque, 'ICE implements the live torque-source boundary');
  source.requestDrive(.4, dt); source.updateState(dt, 0);
  assert(source.requestedDrive === .4 && Number.isFinite(source.deliveredDriveTorque), 'source exposes requested and delivered state');
  return { assertions, openTraction, lsdTraction };
}
