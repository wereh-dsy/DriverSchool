import { createTank500Hi4TPhysicsConfig } from './config/tank500Hi4TPhysicsConfig';
import { VehicleDynamics } from './physics/VehicleDynamics';
import { P2HybridPowertrain } from './powertrain/P2HybridPowertrain';
import { createNeutralVehicleInputState } from '../input/VehicleInputState';
import type { PowertrainUpdateContext } from './powertrain/Powertrain';
import { createWheelContactBuffer, WHEEL_IDS } from './physics/WheelContact';
import { SURFACE_MATERIALS } from '../world/SurfaceMaterial';

export function runTank500HybridControlSelfTest() {
  let assertions = 0; const check = (ok: boolean, m: string) => { assertions++; if (!ok) throw Error('Tank hybrid control: ' + m); };
  const dt = 1 / 120, input = createNeutralVehicleInputState(), results: Record<string, unknown> = {};
  const contacts = createWheelContactBuffer();
  for (const id of WHEEL_IDS) Object.assign(contacts[id], SURFACE_MATERIALS.asphalt, { supportValid: true, height: 0 });
  const environment = { wheelContacts: contacts };
  const acceleration: unknown[] = [];
  for (const mode of ['HYBRID', 'SPORT', 'EV'] as const) {
    const car = new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'P', stateOfCharge: .75 });
    car.powertrain.setHybridMode(mode);
    for (let i = 0; i < 120; i++) car.stepFixed(dt, { ...input, brake: .8 }, environment);
    check(car.requestDriveSelector('D', 1), 'real brake-held D selection');
    for (let i = 0; i < 60; i++) car.stepFixed(dt, { ...input, brake: .8 }, environment);
    if (mode === 'SPORT') check(car.engine.isRunning && car.powertrain.fuel.getSnapshot().fuelUsedL > 0, 'Sport prepares combustion and pays real idle fuel before launch');
    let time100 = -1, firstCoupled = -1, peakInputKW = 0, peakElectricKW = 0; const trace: unknown[] = [];
    for (let i = 0; i < 2400; i++) {
      const s = car.stepFixed(dt, { ...input, throttle: 1 }, environment), h = s.powertrain.hybrid!;
      const inputKW = car.powertrain.torqueSource.deliveredDriveTorque * s.powertrain.inputShaftAngularVelocity / 1000;
      peakInputKW = Math.max(peakInputKW, inputKW); peakElectricKW = Math.max(peakElectricKW, h.motorPowerW / 1000);
      if (firstCoupled < 0 && s.clutchEngagement > .2) firstCoupled = (i + 1) * dt;
      check(!s.recoveredFromInvalidState && inputKW <= 300.001 && h.motorPowerW <= 120001, 'launch has no recovery, extra source or over-rating electric output');
      if (mode === 'EV') check(!s.engineRunning && s.clutchEngagement === 0, 'EV zero-to-100 never borrows combustion power');
      if (i % 120 === 119) trace.push({ t: (i + 1) * dt, kmh: s.speed * 3.6, rpm: s.rpm,
        engineKW: h.enginePowerW / 1000, motorKW: h.motorPowerW / 1000, wheelKW: h.wheelPowerW / 1000, k0: h.clutchEngagement, gear: s.gear });
      if (s.speed >= 100 / 3.6) { time100 = (i + 1) * dt; break; }
    }
    check(time100 > 0 && time100 < (mode === 'EV' ? 18 : mode === 'SPORT' ? 7.6 : 8.2), 'bounded full-chain 0-100 after brake release: ' + mode + ' ' + time100);
    if (mode !== 'EV') check(firstCoupled > 0 && firstCoupled < 2, 'K0 catches a rising input shaft before the first upshift');
    acceleration.push({ mode, time100, firstCoupled, peakInputKW, peakElectricKW, trace });
  }
  results.acceleration = acceleration;
  const electricSport = new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'D', stateOfCharge: .75 });
  electricSport.cycleDriveMode(); electricSport.cycleDriveMode(); electricSport.powertrain.setHybridMode('EV');
  check(electricSport.driveMode === 'SPORT', 'sporty chassis fixture');
  for (let i = 0; i < 480; i++) { const s = electricSport.stepFixed(dt, { ...input, throttle: .7 }); check(!s.engineRunning && s.clutchEngagement === 0, 'explicit EV overrides chassis Sport engine preference'); }

  const braking: { name: string; distance: number; speed: number; recoveredKWh: number; regenSamples: number; hydraulicSamples: number }[] = [];
  for (const [name, soc, ambient] of [['normal', .75, 20], ['full', 1, 20], ['cold', .75, -25], ['hot', .75, 55]] as const) {
    const cfg = createTank500Hi4TPhysicsConfig(); cfg.ambientTemperature = ambient;
    const car = new VehicleDynamics<P2HybridPowertrain>(cfg, { driveSelector: 'D', speed: 20, stateOfCharge: soc });
    car.powertrain.setHybridMode('EV'); const before = car.powertrain.battery.remainingEnergyKWh;
    let distance = 0, regenSamples = 0, hydraulicSamples = 0;
    for (let i = 0; i < 600; i++) {
      const s = car.stepFixed(dt, { ...input, brake: .6 }, environment); distance += Math.abs(s.speed) * dt;
      if (s.powertrain.ev!.regenerativeBrakeTorque > 10) regenSamples++;
      if (s.wheels.frontLeft.appliedBrakeTorque + s.wheels.rearLeft.appliedBrakeTorque > 10) hydraulicSamples++;
      check(!s.recoveredFromInvalidState && s.powertrain.ev!.motorTorque <= 0, 'braking never adds positive motor drive');
    }
    check(car.speed < .1 && hydraulicSamples > 0, name + ' pack retains full mechanical stopping');
    if (name === 'normal') check(regenSamples > 0 && car.powertrain.battery.remainingEnergyKWh > before, 'normal pack stores actual recovered energy');
    if (name === 'cold') check(regenSamples === 0 && car.powertrain.battery.remainingEnergyKWh <= before, 'cold charge rejection cannot invent energy; hydraulics still stop');
    braking.push({ name, distance, speed: car.speed, recoveredKWh: car.powertrain.battery.remainingEnergyKWh - before, regenSamples, hydraulicSamples });
  }
  check(Math.max(...braking.map(b => b.distance)) - Math.min(...braking.map(b => b.distance)) < 5, 'hydraulic blend compensates large changes in pack regenerative capability');
  results.braking = braking;
  const lockedBrake = new VehicleDynamics<P2HybridPowertrain>(createTank500Hi4TPhysicsConfig(), { driveSelector: 'D', speed: 20, stateOfCharge: .75 });
  lockedBrake.powertrain.setHybridMode('EV'); check(lockedBrake.powertrain.requestTransferMode('4H', 20, 1), 'central lock brake fixture');
  const iceContacts = createWheelContactBuffer();
  for (const id of WHEEL_IDS) Object.assign(iceContacts[id], SURFACE_MATERIALS.ice, { supportValid: true });
  let releases = 0, lockedBrakeRecovered = 0;
  for (let i = 0; i < 1200; i++) {
    const s = lockedBrake.stepFixed(dt, { ...input, brake: 1 }, { wheelContacts: iceContacts });
    check(!s.recoveredFromInvalidState && s.powertrain.ev!.motorTorque <= 0, 'central lock/ABS brake solve adds no drive or recovery');
    if (lockedBrake.driverAssists.pressures.some(p => p < .98)) releases++;
    lockedBrakeRecovered = s.powertrain.ev!.tripEnergyRecoveredKWh;
  }
  check(releases > 0 && lockedBrake.speed < 20 && lockedBrake.powertrain.transfer.centerLock!.engaged, 'ABS modulates on ice while central shaft lock remains physical');
  results.centralLockABS = { finalSpeedKmh: lockedBrake.speed * 3.6, absReleaseSamples: releases, recoveredKWh: lockedBrakeRecovered,
    center: lockedBrake.powertrain.transfer.centerLock!.getSnapshot() };
  const cfg = createTank500Hi4TPhysicsConfig(), p = new P2HybridPowertrain(cfg);
  p.reset({ driveSelector: 'D', gear: 4, ev: { stateOfCharge: .75 } }); p.setHybridMode('EV');
  const c: PowertrainUpdateContext = { dt, throttle: 0, brake: .5, totalServiceBrakeTorque: 4000,
    vehicleSpeed: 16, vehicleLateralSpeed: 0, drivenWheelAngularVelocity: 16 / cfg.wheelRadius, torqueLimitFactor: 1, clutchPedal: 0 };
  for (let i = 0; i < 120; i++) { p.prepare(c); p.update(c); p.finishStep(16); }
  p.prepare(c); p.update(c); p.limitAxleRegeneration(100, 100);
  check(p.getSnapshot().ev.regenerativeBrakeTorque <= 154 && p.motor.deliveredDriveTorque < 0, 'partial shared-shaft ABS cap recomputes physical output');
  check(Math.abs(p.torqueSource.deliveredDriveTorque - p.motor.deliveredDriveTorque) < 1e-8, 'ABS-updated torque proxy matches actual motor');
  const energy = p.battery.remainingEnergyKWh; p.limitAxleRegeneration(0, 5000); p.finishStep(16);
  check(p.axleOutput.drivenWheelTorque === 0 && p.battery.remainingEnergyKWh <= energy, 'same-step ABS release eliminates regen torque and stored recovery');
  return { assertions, results };
}
