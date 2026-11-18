import { createNeutralVehicleInputState } from '../input/VehicleInputState';
import { createTank500Hi4TPhysicsConfig } from './config/tank500Hi4TPhysicsConfig';
import { VehicleDynamics } from './physics/VehicleDynamics';
import { HybridEnergyManagement, type HybridDrivingState } from './powertrain/HybridEnergyManagement';
import { P2HybridPowertrain } from './powertrain/P2HybridPowertrain';
import type { PowertrainUpdateContext } from './powertrain/Powertrain';

export function runTank500DriveabilitySelfTest() {
  let assertions = 0; const check = (ok: boolean, message: string) => { assertions++; if (!ok) throw Error('Tank driveability: ' + message); };
  const input = createNeutralVehicleInputState(), dt = 1 / 120;
  const results: Record<string, unknown> = {};
  const create = () => new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'D', stateOfCharge: .75 });
  for (const pedal of [0, .20, 1]) {
    const car = create(); if (pedal === 1) car.powertrain.setHybridMode('SPORT');
    let startEngine = -1, time100 = -1, peakAcceleration = 0;
    for (let i = 0; i < 1200; i++) {
      const s = car.stepFixed(dt, { ...input, throttle: pedal });
      if (s.engineRunning && startEngine < 0) startEngine = (i + 1) * dt;
      if (s.speed >= 100 / 3.6 && time100 < 0) time100 = (i + 1) * dt;
      peakAcceleration = Math.max(peakAcceleration, s.acceleration);
    }
    if (pedal === 0) check(car.speed > .4 && car.speed < 1.45 && startEngine < 0, 'released brake gives gentle electric creep');
    if (pedal === .2) check(car.speed > 5 && car.speed < 10 && startEngine < 0 && car.powertrain.fuel.getSnapshot().fuelUsedL === 0, 'urban light pedal remains electric with progressive acceleration');
    if (pedal === 1) check(time100 >= 6.5 && time100 < 9 && startEngine > 0 && startEngine < 1, 'Sport promptly starts ICE and gives plausible full-load performance');
    results['pedal' + pedal] = { speedKmhAt10s: car.speed * 3.6, engineStartSeconds: startEngine, zeroTo100Seconds: time100, peakAcceleration };
  }
  const held = create();
  for (let i = 0; i < 240; i++) held.stepFixed(dt, { ...input, brake: .7 });
  check(Math.abs(held.speed) < .05 && held.powertrain.motor.deliveredDriveTorque <= 0 && !held.powertrain.engine.isRunning, 'holding brake suppresses electric creep and engine request');
  const coast = new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'D', stateOfCharge: .75, speed: 15 });
  coast.powertrain.setHybridMode('EV'); const before = coast.powertrain.battery.remainingEnergyKWh;
  for (let i = 0; i < 360; i++) coast.stepFixed(dt, input);
  check(coast.speed < 15 && coast.speed > 10 && coast.powertrain.battery.remainingEnergyKWh > before, 'lift-off decelerates smoothly and restores measured energy');
  results.coast = { speedKmh: coast.speed * 3.6, recoveredKWh: coast.powertrain.battery.remainingEnergyKWh - before };
  // Park must allow crank generation while the driver's brake holds the wheels.
  const parked = new P2HybridPowertrain(createTank500Hi4TPhysicsConfig());
  parked.reset({ driveSelector: 'P', ev: { stateOfCharge: .4 } }); parked.setHybridMode('CHARGE');
  const energy = parked.battery.remainingEnergyKWh;
  const c: PowertrainUpdateContext = { dt, throttle: 0, brake: 1, parkingBrakeActive: true, vehicleSpeed: 0, vehicleLateralSpeed: 0,
    drivenWheelAngularVelocity: 0, drivenWheelInertia: 40, torqueLimitFactor: 1, clutchPedal: 0 };
  for (let i = 0; i < 2400; i++) { parked.prepare(c); parked.update(c); parked.finishStep(0); }
  check(parked.battery.remainingEnergyKWh > energy && parked.fuel.getSnapshot().fuelUsedL > 0 && parked.axleOutput.drivenWheelTorque === 0, 'park/brake charging pays fuel and cannot propel wheels');
  results.parkCharge = { gainedKWh: parked.battery.remainingEnergyKWh - energy, fuelL: parked.fuel.getSnapshot().fuelUsedL };
  const cfg = createTank500Hi4TPhysicsConfig().hybrid, ems = new HybridEnergyManagement(cfg);
  const s: HybridDrivingState = { dt, operational: true, connected: false, speed: 10, demandTorque: 80, shaftOmega: 180,
    soc: .7, dischargePower: 150000, chargePower: 60000, brake: 0, engineRunning: false, fuelAvailable: true,
    shifting: false, engineTorqueCapacity: 380, motorTorqueCapacity: 400, pedal: .9 };
  for (let i = 0; i < 24; i++) ems.update(s);
  check(!ems.engineRequested, 'short kickdown pulse does not trigger combustion');
  for (let i = 0; i < 24; i++) ems.update({ ...s, pedal: .2 });
  check(!ems.engineRequested, 'start dwell cancels on released demand');
  for (let i = 0; i < 48; i++) ems.update(s);
  check(ems.engineRequested, 'sustained driver demand triggers combustion');
  for (let i = 0; i < 120; i++) ems.update({ ...s, engineRunning: true, pedal: .2 });
  check(ems.engineRequested, 'minimum run duration prevents cycling after pedal lift');
  for (let i = 0; i < 1920; i++) ems.update({ ...s, engineRunning: true, pedal: .2 });
  check(!ems.engineRequested, 'settled low demand eventually returns to EV');
  return { assertions, results };
}
