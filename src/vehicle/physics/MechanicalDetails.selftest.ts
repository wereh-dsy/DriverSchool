import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { SURFACE_MATERIALS } from '../../world/SurfaceMaterial';
import { createDefaultVehiclePhysicsConfig, createSportsCoupePhysicsConfig, cloneVehiclePhysicsConfig } from '../config';
import { wheelLocalPosition } from '../VehicleDimensions';
import { DrivetrainLash } from './DrivetrainLash';
import { Engine } from './Engine';
import { VehicleDynamics } from './VehicleDynamics';
import { WHEEL_IDS, type WheelContactSet } from './WheelContact';

/** Short mechanical acceptance checks; no track laps or endurance simulation. */
export function runMechanicalDetailsSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => {
    assertions++;
    if (!ok) throw new Error(`Mechanical details: ${message}`);
  };
  const dt = 1 / 120;
  const family = createDefaultVehiclePhysicsConfig();
  const gt = createSportsCoupePhysicsConfig();
  const lash = new DrivetrainLash(family.transmission.drivetrainLash);
  for (let i = 0; i < 20; i++) lash.update(dt, 90, 285);
  assert(lash.getSnapshot().state === 1 && lash.getSnapshot().effectiveTorqueFactor === 1, 'steady drive retains full torque');
  const firstReverseFactor = lash.update(dt, -90, 285);
  assert(firstReverseFactor < 1 && lash.getSnapshot().state > 0, 'torque reversal takes up finite lash');
  for (let i = 0; i < 20; i++) lash.update(dt, -90, 285);
  assert(lash.getSnapshot().state === -1 && lash.getSnapshot().effectiveTorqueFactor === 1, 'steady engine braking retains full torque');
  assert(lash.getSnapshot().joltIntensity < 0 && Math.abs(lash.getSnapshot().joltIntensity) < 0.25, 'loaded reversal gives a mild signed existing-feedback input');
  for (let i = 0; i < 20; i++) lash.update(dt, i % 2 ? 2 : -2, 285);
  assert(lash.getSnapshot().target === 0 && lash.getSnapshot().state === 0, 'near-zero torque has a deadzone');
  const tight = new DrivetrainLash(gt.transmission.drivetrainLash);
  for (let i = 0; i < 20; i++) tight.update(dt, 150, 610);
  lash.reset();
  for (let i = 0; i < 20; i++) lash.update(dt, 90, 285);
  for (let i = 0; i < 9; i++) { tight.update(dt, -150, 610); lash.update(dt, -90, 285); }
  assert(tight.getSnapshot().state === -1 && lash.getSnapshot().state > -1, 'GT takes up lash sooner');

  const revHangTelemetry = [];
  const keyboardLift = new Engine(family.engine);
  keyboardLift.reset(3000);
  keyboardLift.updateThrottle(0.4, dt, { enabled: true, gearEngaged: true, clutchEngagement: 1 });
  let keyboardHangSeen = false;
  for (let i = 1; i <= 24; i++) {
    keyboardLift.updateThrottle(Math.max(0, 0.4 - 2.8 * dt * i), dt,
      { enabled: true, gearEngaged: true, clutchEngagement: 0 });
    keyboardHangSeen ||= keyboardLift.getRevHangSnapshot().active;
  }
  assert(keyboardHangSeen, 'keyboard accelerator release arms hang before reaching zero');
  for (const [name, config] of [['family', family], ['gt', gt]] as const) {
    const plainConfig = cloneVehiclePhysicsConfig(config);
    plainConfig.engine.revHang!.enabled = false;
    const engine = new Engine(config.engine);
    const plain = new Engine(plainConfig.engine);
    engine.reset(3000); plain.reset(3000);
    for (const e of [engine, plain]) {
      e.updateThrottle(0.45, dt, { enabled: true, gearEngaged: true, clutchEngagement: 1 });
      e.throttle = 0.12;
    }
    let peakResidual = 0;
    let hangSeen = false;
    for (let i = 0; i < 54; i++) {
      for (const e of [engine, plain]) {
        e.updateThrottle(0, dt, { enabled: true, gearEngaged: true, clutchEngagement: 0 });
        e.integrate(dt, 0);
      }
      peakResidual = Math.max(peakResidual, engine.getRevHangSnapshot().residualTorque);
      hangSeen ||= engine.getRevHangSnapshot().active;
    }
    const savedRPM = engine.currentRPM - plain.currentRPM;
    assert(hangSeen && peakResidual > 1 && savedRPM > 10, `${name}: residual airflow slows free crank deceleration`);
    assert(!engine.getRevHangSnapshot().active, `${name}: hold and decay finish promptly`);
    engine.reset(3000);
    engine.updateThrottle(0.45, dt);
    engine.updateThrottle(0, dt, { enabled: true, gearEngaged: true, clutchEngagement: 1 });
    assert(!engine.getRevHangSnapshot().active, `${name}: engaged wheels retain crank-load priority`);
    engine.updateThrottle(0.45, dt);
    engine.updateThrottle(0, dt, { enabled: true, gearEngaged: false, clutchEngagement: 0 });
    assert(!engine.getRevHangSnapshot().active, `${name}: neutral free rev remains ordinary`);
    engine.reset();
    for (let i = 0; i < 60; i++) {
      engine.updateThrottle(0, dt, { enabled: true, gearEngaged: true, clutchEngagement: 0 });
      engine.integrate(dt, 0);
    }
    assert(Math.abs(engine.currentRPM - config.engine.idleRPM) < 1 && !engine.getRevHangSnapshot().active, `${name}: stable idle without hang`);
    engine.integrate(0.1, 500);
    assert(!engine.isRunning, `${name}: load can still stall the engine`);
    engine.start();
    assert(engine.currentRPM === config.engine.idleRPM && !engine.getRevHangSnapshot().active, `${name}: restart clears residual airflow`);
    revHangTelemetry.push({ vehicle: name, peakResidualTorque: peakResidual, savedRPM });

    const speed = 3000 * 2 * Math.PI / 60 * config.wheelRadius /
      (config.transmission.gearRatios[2]! * config.transmission.finalDriveRatio);
    const car = new VehicleDynamics(config, { speed, gear: 2, engineRPM: 3000,
      clutchEngagement: 1, controlMode: 'manual-clutch' });
    const input = { ...createNeutralVehicleInputState(), controlMode: 'manual-clutch' as const, clutchPedal: 0, throttle: 0.55 };
    for (let i = 0; i < 45; i++) car.stepFixed(dt, input);
    input.throttle = 0;
    let reversalSeen = false;
    for (let i = 0; i < 45; i++) {
      const state = car.stepFixed(dt, input);
      reversalSeen ||= state.drivetrainLash.target === -1 && state.drivetrainLash.effectiveTorqueFactor < 0.99;
    }
    assert(reversalSeen && car.getSnapshot().drivetrainLash.effectiveTorqueFactor === 1,
      `${name}: lift-off unloads briefly then restores engine braking`);
    assert(car.getSnapshot().forces.engineBrakingForce < 0 && !car.getSnapshot().revHang.active,
      `${name}: engaged closed-throttle engine braking is preserved`);
    input.throttle = 0.6;
    const contacts = Object.fromEntries(WHEEL_IDS.map(id => {
      const local = wheelLocalPosition(config, id);
      return [id, { ...SURFACE_MATERIALS[id.endsWith('Right') ? 'grass' : 'asphalt'],
        id, x: local.x, z: local.z, height: 0, normal: { x: 0, y: 1, z: 0 } }];
    })) as unknown as WheelContactSet;
    let state = car.getSnapshot();
    for (let i = 0; i < 45; i++) state = car.stepFixed(dt, input, { wheelContacts: contacts });
    const driven = config.frontTorqueSplit === 1 ? ['frontLeft', 'frontRight'] as const : ['rearLeft', 'rearRight'] as const;
    const undriven = config.frontTorqueSplit === 1 ? ['rearLeft', 'rearRight'] as const : ['frontLeft', 'frontRight'] as const;
    assert(state.wheels[driven[0]].driveTorque > 0 && state.wheels[driven[0]].driveTorque === state.wheels[driven[1]].driveTorque,
      `${name}: each driven wheel receives an equal torque share`);
    assert(undriven.every(id => state.wheels[id].driveTorque === 0), `${name}: undriven axle receives no engine torque`);
    assert(state.wheels[driven[1]].longitudinalForce < state.wheels[driven[0]].longitudinalForce,
      `${name}: own surface limits actual tyre force, not the equal requested axle torques`);
    assert(WHEEL_IDS.every(id => state.wheels[id].brakeTorque === 0), `${name}: drive torque is separate from brake torque`);
    const launch = new VehicleDynamics(config, { gear: 1 });
    const launchInput = { ...createNeutralVehicleInputState(), throttle: 0.65 };
    for (let i = 0; i < 360; i++) launch.stepFixed(dt, launchInput, { gradeRadians: 0.08 });
    assert(launch.engine.isRunning && Number.isFinite(launch.speed) && launch.speed > 0,
      `${name}: short assisted hill launch retains running engine and forward drive`);
    const reverse = new VehicleDynamics(config, { gear: 'R' });
    for (let i = 0; i < 120; i++) reverse.stepFixed(dt, launchInput);
    assert(reverse.engine.isRunning && reverse.speed < 0 && Number.isFinite(reverse.getSnapshot().drivetrainLash.state),
      `${name}: low-speed reverse is stable`);
  }
  assert(revHangTelemetry[0]!.savedRPM > revHangTelemetry[1]!.savedRPM * 2, 'family rev hang is more apparent than GT');
  return { assertions, revHang: revHangTelemetry };
}
