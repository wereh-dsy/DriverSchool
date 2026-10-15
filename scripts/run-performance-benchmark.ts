import { mkdirSync, writeFileSync } from 'node:fs';
import { VEHICLE_CATALOG, createVehiclePhysicsConfig } from '../src/vehicle/VehicleCatalog';
import { isElectricConfig } from '../src/vehicle/config/ElectricVehiclePhysicsConfig';
import { createNeutralVehicleInputState } from '../src/input/VehicleInputState';
import { VehicleDynamics } from '../src/vehicle/physics/VehicleDynamics';
import { ICEPowertrain } from '../src/vehicle/powertrain/ICEPowertrain';
import { ElectricPowertrain } from '../src/vehicle/powertrain/ElectricPowertrain';
import type { Powertrain } from '../src/vehicle/powertrain/Powertrain';
import { WHEEL_IDS, createWheelContactBuffer } from '../src/vehicle/physics/WheelContact';
import { contactUsefulSlip } from '../src/vehicle/physics/SurfaceInteraction';

// Run via esbuild --bundle --platform=node --format=esm. No render clock/input device.
const dt = 1 / 120;
const output = process.argv[2] ?? 'artifacts/performance-tcs/after';
const filter = process.argv[3];
mkdirSync(output, { recursive: true });
const results = [];
const traceHz = process.env.BENCH_TRACE_120HZ ? 120 : 20;
for (const descriptor of VEHICLE_CATALOG.filter(v => !filter || v.id.includes(filter))) {
  for (const tcs of [true, false]) {
    const config = createVehiclePhysicsConfig(descriptor.id);
    const ev = isElectricConfig(config);
    const provider: Powertrain = ev ? new ElectricPowertrain(config) : new ICEPowertrain(config);
    const manual = provider.transmission.type === 'MANUAL';
    const car = new VehicleDynamics<Powertrain>(config, { engineRunning: true, gear: manual ? 1 : undefined,
      driveSelector: manual ? undefined : 'N', controlMode: manual ? 'manual-clutch' : 'normal',
      ambientTemperatureC: 20, stateOfCharge: .8 }, provider);
    if (ev) provider.reset({ driveSelector: 'N', ev: { stateOfCharge: .8, batteryTemperature: 30,
      frontMotorTemperature: 40, rearMotorTemperature: 40, frontInverterTemperature: 35, rearInverterTemperature: 35 } });
    // Enter D through the same vehicle/powertrain boundary as the settings UI.
    // Do not conceal multi-unit selector defects by spawning directly in D.
    if (!manual && !car.requestDriveSelector('D', 1)) throw new Error(`${descriptor.id}: production D request rejected`);
    if (provider instanceof ElectricPowertrain && [provider.frontDriveUnit, provider.rearDriveUnit].some(unit => unit && unit.transmission.mode !== 'D'))
      throw new Error(`${descriptor.id}: an installed EV axle did not enter D`);
    for (const id of WHEEL_IDS) {
      car.wheelRotation.tyres.states[id].temperatureC = 35;
      car.wheelRotation.tyres.refresh(id);
    }
    car.setDriverAssistOptions({ absEnabled: true, ebdEnabled: true, tractionControlEnabled: tcs, stabilityControlEnabled: true });
    const launch = descriptor.capabilities.launchControl && process.env.BENCH_LAUNCH !== '0';
    if (process.env.BENCH_MODE) {
      let cycles = 0;
      while (car.driveMode !== process.env.BENCH_MODE && cycles++ < 8) car.cycleDriveMode();
      if (car.driveMode !== process.env.BENCH_MODE) throw new Error('Requested diagnostic mode unavailable');
    }
    if (process.env.BENCH_PRELOAD) car.setAutoHoldEnabled(false);
    if (launch) while (car.driveMode !== 'SPORT_PLUS') car.cycleDriveMode();
    const input = createNeutralVehicleInputState(manual ? 'manual-clutch' : 'normal', 1);
    const environment = { wheelContacts: createWheelContactBuffer(), ambientTemperatureC: 20, gradeRadians: 0 };
    // Settle springs/calipers. MT pre-revs through real engine integration;
    // only official launch-capable vehicles receive brake+full-throttle arming.
    for (let i = 0; i < 240; i++) car.stepFixed(dt, { ...input, brake: 1 }, environment);
    for (let i = 0; i < 120; i++) {
      const throttle = launch || process.env.BENCH_PRELOAD ? 1 : manual ? Math.max(0, Math.min(.65, .2 + (2400 - (car.getSnapshot().rpm ?? 0)) / 1200)) : 0;
      car.stepFixed(dt, { ...input, brake: 1, throttle }, environment);
    }
    const ready = provider instanceof ElectricPowertrain ? provider.launchControl?.state : undefined;
    if (launch && ready !== 'READY') throw new Error(`${descriptor.id}: launch not READY (${ready})`);
    const initial = { rpm: car.getSnapshot().rpm, speed: car.speed, driveMode: car.driveMode, launchState: ready,
      transmission: car.transmission.getSnapshot(), tyres: structuredClone(car.wheelRotation.tyres.states),
      ev: provider.getSnapshot().ev ? structuredClone(provider.getSnapshot().ev) : undefined };
    let state = car.getSnapshot(), tcsSeconds = 0, strongSeconds = 0, continuous = 0, longest = 0, reductionIntegral = 0;
    let peakSlip = 0, slipIntegral = 0, maxBrakeAfterRelease = 0, maxRegen = 0, escSeconds = 0;
    const milestones: Record<string, number | null> = { '30': null, '50': null, '100': null };
    const trace = [];
    let shiftTime = -1, shifted = false;
    for (let i = 0; i < 3600; i++) {
      const time = i * dt, previousSpeed = state.speedKmh;
      let throttle = 1, clutchPedal = manual ? Math.max(0, 1 - time / .65) : 1;
      let shiftUp = false;
      if (manual && provider instanceof ICEPowertrain) {
        if (shiftTime < 0 && time > .8 && (state.rpm ?? 0) >= provider.config.engine.redlineRPM * .94 &&
          typeof state.gear === 'number' && state.gear < Object.keys(provider.config.transmission.gearRatios).length) {
          shiftTime = time; shifted = false;
        }
        if (shiftTime >= 0) {
          const elapsed = time - shiftTime;
          throttle = elapsed < .26 ? 0 : 1;
          clutchPedal = elapsed < .08 ? elapsed / .08 : elapsed < .22 ? 1 : Math.max(0, 1 - (elapsed - .22) / .18);
          if (elapsed >= .18 && !shifted) { shiftUp = true; shifted = true; }
          if (elapsed >= .40) shiftTime = -1;
        }
      }
      state = car.stepFixed(dt, { ...input, throttle, clutchPedal, shiftUp }, environment);
      if (shiftUp && state.shiftRejected) throw new Error('benchmark shift rejected');
      if (state.recoveredFromInvalidState) throw new Error(`${descriptor.id}: corrupt physics state`);
      for (const target of [30, 50, 100]) if (milestones[target] === null && state.speedKmh >= target) {
        milestones[target] = time + dt * (target - previousSpeed) / (state.speedKmh - previousSpeed);
      }
      const factor = car.driverAssists.engineTorqueFactor;
      const reduction = 1 - factor;
      tcsSeconds += state.driverAssists.tcsActive ? dt : 0;
      strongSeconds += factor < .7 ? dt : 0;
      continuous = state.driverAssists.tcsActive ? continuous + dt : 0;
      longest = Math.max(longest, continuous); reductionIntegral += reduction * dt;
      escSeconds += state.driverAssists.escActive ? dt : 0;
      const driven = WHEEL_IDS.filter((_, j) => config.drivetrainType === 'AWD' || (j < 2) === (config.drivetrainType === 'FWD'));
      const slips = driven.map(id => state.wheels[id].slipRatio * Math.sign(state.wheels[id].longitudinalSpeed || state.wheels[id].angularVelocity));
      peakSlip = Math.max(peakSlip, ...slips); slipIntegral += Math.max(...slips) * dt;
      if (time > .5) maxBrakeAfterRelease = Math.max(maxBrakeAfterRelease, ...WHEEL_IDS.map(id => state.wheels[id].appliedBrakeTorque));
      maxRegen = Math.max(maxRegen, state.powertrain.ev?.regenerativeBrakeTorque ?? 0);
      if (i % (process.env.BENCH_TRACE_120HZ ? 1 : 6) === 0) trace.push({ time: time + dt, speedKmh: state.speedKmh, acceleration: state.acceleration,
        gear: state.transmission, mode: car.driveMode, driverThrottle: throttle, throttle: state.throttle,
        clutchPedal, rpm: state.rpm, engine: provider instanceof ICEPowertrain ? provider.engine.lastTorqueSample : undefined,
        transmissionInputTorque: state.forces.clutchTorque,
        requestedDriveTorque: provider instanceof ICEPowertrain ? provider.engine.getTorqueAtRPM(state.rpm ?? 0) * state.throttle : undefined,
        deliveredSourceTorque: provider.torqueSource.deliveredDriveTorque,
        deliveredWheelTorque: WHEEL_IDS.map(id => state.wheels[id].driveTorque),
        tcsReduction: reduction, frontFactor: car.driverAssists.frontTorqueFactor, rearFactor: car.driverAssists.rearTorqueFactor,
        escActive: state.driverAssists.escActive, escBrakeTorques: [...car.driverAssists.esc.brakeTorques],
        tractionBrakes: [...car.driverAssists.differentialBrakeTorques], forces: state.forces,
        ev: state.powertrain.ev ? structuredClone(state.powertrain.ev) : undefined,
        wheels: WHEEL_IDS.map(id => ({ id, speed: state.wheels[id].angularVelocity, groundSpeed: state.wheels[id].longitudinalSpeed,
          slip: state.wheels[id].slipRatio, usefulSlip: contactUsefulSlip(config.tires.peakSlipRatio, environment.wheelContacts[id], state.wheels[id].tyre?.longitudinalStiffnessFactor),
          targetSlip: contactUsefulSlip(config.tires.peakSlipRatio, environment.wheelContacts[id], state.wheels[id].tyre?.longitudinalStiffnessFactor) * (config.driverAids.tcs?.slipThresholdMultiplier ?? 1.25),
          load: state.wheels[id].normalLoad, force: state.wheels[id].longitudinalForce, brake: state.wheels[id].appliedBrakeTorque,
          pressure: state.wheels[id].tyre?.gaugePressureKPa, temperature: state.wheels[id].tyre?.temperatureC,
          surface: state.wheels[id].surfaceType })) });
      if (milestones[100] !== null) break;
    }
    const seconds = milestones[100] ?? 30;
    const row = { id: descriptor.id, vehicle: descriptor.displayName, tcs, launch, ready, initial, mode: car.driveMode,
      drivetrain: config.drivetrainType, transmission: provider.transmission.type, mass: state.effectiveVehicleMass,
      milestones, tcsSeconds, strongSeconds, longest, meanReduction: reductionIntegral / seconds,
      peakSlip, meanSlip: slipIntegral / seconds, escSeconds, maxBrakeAfterRelease, maxRegen };
    results.push(row);
    writeFileSync(`${output}/${descriptor.id}-${tcs ? 'on' : 'off'}.json`, JSON.stringify({ row, trace }));
    console.log(`${descriptor.displayName} TCS ${tcs ? 'ON ' : 'OFF'}: ${[30, 50, 100].map(v => milestones[v]?.toFixed(3) ?? 'DNF').join(' / ')} s | TCS ${tcsSeconds.toFixed(2)} s strong ${strongSeconds.toFixed(2)} s mean cut ${(row.meanReduction * 100).toFixed(1)}%`);
  }
}
writeFileSync(`${output}/summary.json`, JSON.stringify({ protocol: { dt, traceHz, timing: 'pedal/brake release, no rollout', ambientC: 20,
  tyreC: 35, batteryC: 30, motorC: 40, inverterC: 35, soc: .8, surface: 'flat Dry Asphalt, no wind',
  manual: 'bounded feedback pre-rev toward 2400 rpm (actual initial state recorded); 0.65 s progressive clutch launch; 0.40 s shifts at 94% redline',
  automatic: 'N -> production selector request D, default production mode; official LC: SPORT_PLUS, verified READY' }, results }, null, 2));
