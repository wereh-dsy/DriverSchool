import { createDefaultVehiclePhysicsConfig, createTest6ATVehiclePhysicsConfig,
  createTest7DCTVehiclePhysicsConfig, type VehiclePhysicsConfig } from '../config';
import { Engine } from '../physics/Engine';
import { Gearbox } from '../physics/Gearbox';
import { Clutch } from '../physics/Clutch';
import { AutoClutchController } from '../physics/AutoClutchController';
import { TorqueConverter } from './automatic/TorqueConverter';
import { createTransmissionSystem } from './createTransmissionSystem';
import type { TransmissionContext } from './TransmissionSystem';
import { VehicleDynamics, type VehicleSnapshot } from '../physics/VehicleDynamics';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';

export function runTransmissionBackendSelfTest(): { assertions: number; converterRatios: number[]; atCreepTorque: number; dctCreepTorque: number } {
  let assertions = 0;
  const assert = (condition: boolean, message: string): void => { assertions++; if (!condition) throw new Error(`Transmission: ${message}`); };
  const atConfig = createTest6ATVehiclePhysicsConfig();
  const context = (config: VehiclePhysicsConfig, speed = 0, throttle = 0): TransmissionContext => ({ dt: 1 / 120,
    engineAngularVelocity: config.engine.idleRPM * 2 * Math.PI / 60, engineRPM: config.engine.idleRPM,
    engineRunning: true, engineInertia: config.engine.engineInertia, idleRPM: config.engine.idleRPM,
    stallRPM: config.engine.stallRPM, redlineRPM: config.engine.redlineRPM,
    availableEngineTorque: 15, throttle, brake: 0, vehicleSpeed: speed, drivenWheelAngularVelocity: speed / config.wheelRadius });
  const converter = new TorqueConverter(atConfig.transmission.automatic!.converter);
  const converterRatios = [0, 0.5, 0.8, 1].map((ratio) => {
    const ctx = context(atConfig);
    converter.update(ctx, ctx.engineAngularVelocity * ratio, 1);
    return converter.torqueRatio;
  });
  assert(converterRatios[0]! >= 1.8 && converterRatios[0]! <= 2.2, 'stall ratio near two');
  assert(converterRatios[1]! > converterRatios[2]! && converterRatios[2]! > converterRatios[3]!, 'multiplication decreases continuously');
  assert(converterRatios[3] === 1, 'coupled ratio one');
  let atCreepTorque = 0; let dctCreepTorque = 0;
  for (const config of [atConfig, createTest7DCTVehiclePhysicsConfig()]) {
    const gearbox = new Gearbox(config.transmission);
    const transmission = createTransmissionSystem(config.transmission, gearbox, new Clutch(config.clutch),
      new AutoClutchController(config.autoClutch, config.engine.idleRPM));
    const engine = new Engine(config.engine);
    transmission.reset();
    assert(transmission.getSnapshot().selectedMode === 'P', 'automatic defaults parked');
    assert(!transmission.requestSelector('P', 12), 'reject moving park');
    assert(!transmission.requestSelector('R', 12), 'reject forward moving reverse');
    assert(transmission.requestSelector('D', 0), 'drive selection accepted');
    let lastLoad = 0;
    for (let frame = 0; frame < 600; frame++) {
      const ctx = { ...context(config), engineAngularVelocity: engine.angularVelocity, engineRPM: engine.currentRPM,
        availableEngineTorque: engine.getTorqueSample().netCrankTorque };
      transmission.prepare(ctx);
      const output = transmission.update(ctx);
      engine.integrate(ctx.dt, output.engineLoadTorque);
      lastLoad = output.drivenWheelTorque;
      assert(engine.isRunning && Number.isFinite(engine.currentRPM), 'stationary drive idle stable');
      assert(Number.isFinite(output.engineLoadTorque) && Math.abs(output.engineLoadTorque) < 500, 'bounded load');
    }
    assert(lastLoad > 50 && lastLoad < 900, 'idle creep comes from transmitted crank torque');
    if (config.transmission.type === 'DCT') dctCreepTorque = lastLoad; else atCreepTorque = lastLoad;
    assert(transmission.requestSelector('N', 0), 'neutral accepted');
    const ctx = context(config);
    transmission.prepare(ctx);
    assert(transmission.update(ctx).drivenWheelTorque === 0, 'neutral disconnects torque');
    if (config.transmission.type === 'DCT') assert(transmission.getSnapshot().torqueConverter === undefined, 'DCT never has converter/lockup');
    else assert(transmission.getSnapshot().dct === undefined, 'AT never has DCT clutches');
  }
  const mtConfig = createDefaultVehiclePhysicsConfig();
  const mt = createTransmissionSystem(mtConfig.transmission, new Gearbox(mtConfig.transmission), new Clutch(mtConfig.clutch),
    new AutoClutchController(mtConfig.autoClutch, mtConfig.engine.idleRPM));
  assert(mt.type === 'MANUAL' && mt.getSnapshot().selectedMode === null, 'legacy config defaults to genuine MT');
  return { assertions, converterRatios, atCreepTorque, dctCreepTorque };
}

export function runTransmissionVehicleSelfTest(): { assertions: number; scenarios: Record<string, unknown>[] } {
  let assertions = 0;
  const assert = (condition: boolean, message: string): void => { assertions++; if (!condition) throw new Error(`Transmission vehicle: ${message}`); };
  const dt = 1 / 120;
  const scenarios: Record<string, unknown>[] = [];
  for (const config of [createTest6ATVehiclePhysicsConfig(), createTest7DCTVehiclePhysicsConfig()]) {
    const type = config.transmission.type!;
    const car = new VehicleDynamics(config);
    const input = createNeutralVehicleInputState();
    const run = (seconds: number, throttle: number, brake = 0): VehicleSnapshot => {
      input.throttle = throttle; input.brake = brake;
      let state = car.getSnapshot();
      for (let frame = 0; frame < Math.round(seconds / dt); frame++) {
        state = car.stepFixed(dt, input);
        assert(state.engineRunning && Number.isFinite(state.rpm) && Number.isFinite(state.speed), `${type} stays finite/running`);
        assert(Math.abs(state.transmission.engineLoadTorque) < 650, `${type} bounded load torque`);
        if (state.transmission.dct !== undefined) {
          const clutches = state.transmission.dct;
          assert(clutches.clutchAEngagement + clutches.clutchBEngagement < 1.001, 'DCT no two fully rigid different shafts');
        }
      }
      return state;
    };
    const parkedZ = car.z;
    run(1, 0.7);
    assert(car.speed === 0 && car.z === parkedZ, `${type} P separate parking constraint`);
    assert(car.requestDriveSelector('D'), `${type} P to D`);
    const stopped = run(3, 0, 1);
    assert(stopped.speedKmh < 0.05, `${type} D full brake stationary`);
    if (type === 'DCT') assert(stopped.transmission.dct!.clutchAEngagement < 0.01 && stopped.transmission.dct!.clutchBEngagement < 0.01, 'DCT stop opens drive clutch');
    const creep = run(5, 0);
    assert(creep.speedKmh > 0.5 && creep.speedKmh < 12, `${type} controlled physical creep ${creep.speedKmh}`);
    const creepSpeedKmh = creep.speedKmh;
    const light = run(60, 0.3);
    assert(typeof light.gear === 'number' && light.gear >= 4, `${type} light throttle auto 1 through 4 ${light.gear}`);
    const lightGear = light.gear; const lightRPM = light.rpm;
    // Starting from a high ratio at road speed provides a reproducible cruise
    // and sudden-throttle kickdown case, without making a hidden driving AI.
    const cruiseGear = type === 'DCT' ? 7 : 6;
    const cruiseSpeed = 22;
    const coupledRPM = Math.abs(cruiseSpeed / config.wheelRadius * config.transmission.finalDriveRatio * config.transmission.gearRatios[cruiseGear]! * 60 / (2 * Math.PI));
    car.reset({ speed: cruiseSpeed, gear: cruiseGear, driveSelector: 'D', engineRPM: coupledRPM + (type === 'DCT' ? 0 : 180) });
    const cruise = run(5, 0.22);
    const cruiseLockup = cruise.transmission.torqueConverter?.lockupEngagement ?? null;
    if (type === 'TORQUE_CONVERTER_AT') assert(cruiseLockup !== null && cruiseLockup > 0.8, `AT cruise lockup ${cruiseLockup}`);
    const beforeKickdownGear = cruise.gear;
    const beforeKickdownRPM = cruise.rpm;
    let kickdownSeen = false; let handoverSeen = false; let kickdownMinimumGear = 7;
    input.throttle = 1;
    for (let frame = 0; frame < 240; frame++) {
      const state = car.stepFixed(dt, input);
      if (state.transmission.kickdown) kickdownSeen = true;
      if (typeof state.gear === 'number') kickdownMinimumGear = Math.min(kickdownMinimumGear, state.gear);
      if (state.transmission.dct !== undefined) {
        const d = state.transmission.dct;
        if (d.clutchAEngagement > 0.02 && d.clutchBEngagement > 0.02) handoverSeen = true;
      }
      assert(state.engineRunning && Number.isFinite(state.rpm), `${type} safe kickdown engine`);
    }
    const afterKickdown = car.getSnapshot();
    assert(kickdownSeen && typeof beforeKickdownGear === 'number' && kickdownMinimumGear <= beforeKickdownGear - 2,
      `${type} genuine multi-gear kickdown ${beforeKickdownGear} -> ${kickdownMinimumGear}`);
    assert(afterKickdown.rpm > beforeKickdownRPM + 400, `${type} kickdown engine load changes real RPM`);
    if (type === 'TORQUE_CONVERTER_AT') assert(afterKickdown.transmission.torqueConverter!.lockupEngagement < 0.01, 'kickdown unlocks converter');
    assert(!car.requestDriveSelector('P') && !car.requestDriveSelector('R'), `${type} rejects moving park/reverse`);
    const brakeStop = run(8, 0, 1);
    assert(brakeStop.speedKmh < 0.05 && brakeStop.engineRunning, `${type} stop in D without stall`);
    assert(car.requestDriveSelector('R'), `${type} reverse at rest`);
    const reverse = run(4, 0);
    assert(reverse.speed < -0.1 && reverse.speed > -4, `${type} converter/clutch reverse creep`);
    run(3, 0, 1);
    assert(car.requestDriveSelector('N'), `${type} neutral after reverse`);
    const neutralRPM = run(2, 0.5).rpm;
    assert(car.getSnapshot().forces.wheelForce === 0 && neutralRPM > config.engine.idleRPM + 600, `${type} N free engine rev`);
    car.reset({ driveSelector: 'P' });
    input.throttle = 0; input.brake = 0;
    input.steering = 0.5;
    for (let frame = 0; frame < 240; frame++) car.stepFixed(dt, input, { gradeRadians: 0.13 });
    assert(car.speed === 0 && car.x === 0 && car.z === 0, `${type} P holds slope without huge brake`);
    scenarios.push({ type, creepSpeedKmh, lightGear, lightRPM, cruiseLockup, beforeKickdownGear,
      kickdownMinimumGear, beforeKickdownRPM, kickdownRPM: afterKickdown.rpm, handoverSeen, reverseSpeedKmh: reverse.speedKmh });
  }
  return { assertions, scenarios };
}

export function runTransmissionShiftSelfTest(): { assertions: number; scenarios: Record<string, unknown>[] } {
  let assertions = 0;
  const assert = (condition: boolean, message: string): void => { assertions++; if (!condition) throw new Error(`Transmission shift: ${message}`); };
  const dt = 1 / 120;
  const scenarios: Record<string, unknown>[] = [];
  for (const config of [createTest6ATVehiclePhysicsConfig(), createTest7DCTVehiclePhysicsConfig()]) {
    const type = config.transmission.type!;
    const input = createNeutralVehicleInputState();
    const car = new VehicleDynamics(config, { driveSelector: 'D' });
    let previous = car.getSnapshot();
    let shiftStartedAt: number | null = null;
    let firstShiftRPM = 0; let firstShiftDuration = 0;
    let firstShiftMinWheelTorque = Infinity;
    let previousShaft = previous.transmission.dct?.activeShaft;
    let shaftSwitches = 0; let overlapSeen = false;
    input.throttle = 0.3;
    for (let frame = 0; frame < 3600; frame++) {
      const state = car.stepFixed(dt, input);
      if (!previous.transmission.shiftInProgress && state.transmission.shiftInProgress && shiftStartedAt === null) {
        shiftStartedAt = frame * dt; firstShiftRPM = previous.rpm;
      }
      if (firstShiftDuration === 0 && shiftStartedAt !== null) {
        firstShiftMinWheelTorque = Math.min(firstShiftMinWheelTorque, state.forces.wheelForce * config.wheelRadius);
        if (previous.transmission.shiftInProgress && !state.transmission.shiftInProgress) firstShiftDuration = frame * dt - shiftStartedAt;
      }
      const dct = state.transmission.dct;
      if (dct !== undefined) {
        if (dct.activeShaft !== previousShaft) { shaftSwitches++; previousShaft = dct.activeShaft; }
        if (dct.clutchAEngagement > 0.03 && dct.clutchBEngagement > 0.03) overlapSeen = true;
        assert(!(dct.clutchAEngagement > 0.99 && dct.clutchBEngagement > 0.99), 'no rigid mismatched dual engagement');
        if (dct.clutchAEngagement < 0.001 && dct.shaftAGear !== null && typeof dct.shaftAGear === 'number') assert(dct.shaftAGear % 2 === 1, 'shaft A odd gearing');
        if (dct.clutchBEngagement < 0.001 && dct.shaftBGear !== null && typeof dct.shaftBGear === 'number') assert(dct.shaftBGear % 2 === 0, 'shaft B even gearing');
      }
      assert(Number.isFinite(state.rpm) && state.engineRunning, `${type} calm shifts finite`);
      previous = state;
    }
    assert(firstShiftRPM > 1400 && firstShiftRPM < 3300, `${type} calm upshift sensible ${firstShiftRPM}`);
    assert(firstShiftDuration >= (type === 'DCT' ? 0.15 : 0.3) && firstShiftDuration <= (type === 'DCT' ? 0.31 : 0.8), `${type} configured physical shift time ${firstShiftDuration}`);
    if (type === 'DCT') {
      assert(overlapSeen && shaftSwitches >= 2, 'DCT real alternating overlapping clutches');
      assert(firstShiftMinWheelTorque > 5, `DCT adjacent handover retains positive drive ${firstShiftMinWheelTorque}`);
      assert(previous.transmission.dct!.preselectedGear !== null, 'DCT preselects another ratio while idle');
    }
    car.reset({ driveSelector: 'D' });
    input.throttle = 1;
    let fullThrottleFirstShiftRPM = 0; let previousGear = 1;
    let maximumRPMStep = 0; let lastRPM = config.engine.idleRPM; let gearChanges = 0;
    for (let frame = 0; frame < 4200; frame++) {
      const state = car.stepFixed(dt, input);
      if (state.gear !== previousGear && typeof state.gear === 'number') {
        if (fullThrottleFirstShiftRPM === 0) fullThrottleFirstShiftRPM = state.rpm;
        assert(state.gear > previousGear, `${type} full throttle shifts progress rather than hunt`);
        previousGear = state.gear; gearChanges++;
      }
      maximumRPMStep = Math.max(maximumRPMStep, Math.abs(state.rpm - lastRPM)); lastRPM = state.rpm;
      assert(state.engineRunning && state.rpm <= config.engine.maxRPM && Number.isFinite(state.transmission.transmittedTorque), `${type} full throttle bounded`);
    }
    assert(gearChanges >= 3, `${type} no converter-limiter first-gear trap`);
    assert(fullThrottleFirstShiftRPM > firstShiftRPM + 1500, `${type} throttle changes shift map`);
    assert(maximumRPMStep < 170, `${type} no forced RPM jump ${maximumRPMStep}`);
    car.reset({ driveSelector: 'D' });
    input.throttle = 0;
    let maximumLowSpeedStep = 0; let lastSpeed = 0;
    for (let cycle = 0; cycle < 6; cycle++) {
      for (let frame = 0; frame < 600; frame++) {
        // Smooth brake modulation and a firm final stop at 0--10 km/h.
        input.brake = frame < 200 ? 0 : frame < 400 ? (frame - 200) / 200 * 0.35 : 0.8;
        const state = car.stepFixed(dt, input);
        maximumLowSpeedStep = Math.max(maximumLowSpeedStep, Math.abs(state.speed - lastSpeed)); lastSpeed = state.speed;
        assert(state.engineRunning && state.rpm >= config.engine.stallRPM + 100 && state.speed >= -0.002, `${type} stop/go stable idle/direction`);
        assert(!state.transmission.shiftInProgress, `${type} no low-speed gear hunting`);
      }
      assert(Math.abs(car.speed) < 0.02, `${type} each stop/go cycle reaches rest`);
    }
    assert(maximumLowSpeedStep < 0.09, `${type} no low speed torque jump ${maximumLowSpeedStep}`);
    const selector = car.getSnapshot().transmission.selectedMode;
    car.x = NaN;
    const recovered = car.stepFixed(dt, input);
    assert(recovered.recoveredFromInvalidState && recovered.transmission.selectedMode === selector, `${type} recovery preserves PRND`);
    scenarios.push({ type, firstShiftRPM, firstShiftDuration, firstShiftMinWheelTorque,
      fullThrottleFirstShiftRPM, maximumRPMStep, gearChanges, overlapSeen, shaftSwitches, maximumLowSpeedStep });
  }
  return { assertions, scenarios };
}
