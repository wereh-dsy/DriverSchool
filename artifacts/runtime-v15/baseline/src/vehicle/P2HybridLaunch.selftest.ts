import { createNeutralVehicleInputState } from '../input/VehicleInputState';
import type { HybridMode } from './config/P2HybridConfig';
import { createTank500Hi4TPhysicsConfig } from './config/tank500Hi4TPhysicsConfig';
import { VehicleDynamics } from './physics/VehicleDynamics';
import { P2HybridPowertrain } from './powertrain/P2HybridPowertrain';

/** Real selector/brake workflow: never initialize straight into an unbraked D launch. */
export function runP2HybridLaunchSelfTest() {
  const dt = 1 / 120, input = createNeutralVehicleInputState(); let assertions = 0;
  const check = (ok: boolean, message: string) => { assertions++; if (!ok) throw Error('P2 launch: ' + message); };
  const results: Record<string, unknown> = {};
  const create = (mode: HybridMode, reverse = false, soc = .75) => {
    const car = new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'P', stateOfCharge: soc });
    car.powertrain.setHybridMode(mode);
    for (let i = 0; i < 120; i++) car.stepFixed(dt, { ...input, brake: .8 });
    check(car.requestDriveSelector(reverse ? 'R' : 'D', 1), 'brake-held selector accepted');
    for (let i = 0; i < 60; i++) car.stepFixed(dt, { ...input, brake: .8 });
    return car;
  };
  for (const mode of ['EV', 'HYBRID', 'SPORT', 'CHARGE_HOLD', 'CHARGE'] as const) {
    const car = create(mode); let electricDriveSamples = 0;
    for (let i = 0; i < 960; i++) {
      const s = car.stepFixed(dt, { ...input, throttle: .6 });
      if (s.speed > 1 && s.powertrain.ev!.motorTorque > 10) electricDriveSamples++;
      if (mode === 'EV') check(!s.engineRunning && s.clutchEngagement === 0, 'EV keeps ICE disconnected after brake release');
    }
    check(car.speed > 8, `${mode} accelerates beyond regen-fade crawl: ${car.speed} m/s`);
    check(electricDriveSamples > 120, `${mode} has sustained real electric assistance after braking`);
    check(car.brakes.brakeInput > 0 && car.brakes.brakeInput < 1e-20, 'actual hydraulic release tail remains in brake physics');
    results[mode] = { speedKmh: car.speed * 3.6, electricDriveSamples, soc: car.powertrain.battery.stateOfCharge };
  }
  const reverse = create('EV', true);
  for (let i = 0; i < 480; i++) reverse.stepFixed(dt, { ...input, throttle: .35 });
  check(reverse.speed < -2 && reverse.powertrain.motor.deliveredDriveTorque > 10, 'brake-held R launch delivers motor torque through reverse ratio');
  check(!reverse.engine.isRunning, 'reverse EV remains electric');
  results.reverse = { speedKmh: reverse.speed * 3.6, motorTorque: reverse.powertrain.motor.deliveredDriveTorque };
  const stopGo = create('EV');
  for (let i = 0; i < 600; i++) stopGo.stepFixed(dt, { ...input, throttle: .5 });
  for (let i = 0; i < 480; i++) stopGo.stepFixed(dt, { ...input, brake: .6 });
  check(Math.abs(stopGo.speed) < .2, 'service braking reaches a real stop');
  let recoverySamples = 0;
  for (let i = 0; i < 600; i++) {
    const s = stopGo.stepFixed(dt, { ...input, throttle: .5 });
    if (s.speed > 1 && s.powertrain.ev!.motorTorque > 10) recoverySamples++;
  }
  check(stopGo.speed > 5 && recoverySamples > 120, 'brake-to-stop then re-accelerate restores sustained EV propulsion');
  // A current brake application still wins over an overlapping accelerator command.
  for (let i = 0; i < 60; i++) {
    const s = stopGo.stepFixed(dt, { ...input, throttle: .8, brake: .6 });
    check(s.powertrain.ev!.motorTorque <= 0 && s.clutchEngagement === 0, 'active brake retains propulsion override');
  }
  check(stopGo.getSnapshot().powertrain.ev!.regenerativeBrakeTorque > 10, 'real service braking still regenerates');
  const low = create('EV', false, .14);
  for (let i = 0; i < 960; i++) low.stepFixed(dt, { ...input, throttle: .6 });
  check(low.engine.isRunning && low.speed > 8, 'low SOC brake-held launch hands over to ICE without losing drivability');
  results.lowSOC = { speedKmh: low.speed * 3.6, soc: low.powertrain.battery.stateOfCharge };
  return { assertions, results };
}
