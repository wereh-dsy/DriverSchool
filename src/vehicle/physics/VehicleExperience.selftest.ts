import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { Group, Vector2, Vector3 } from 'three';
import { createVehiclePhysicsConfig, ICE_VEHICLE_CATALOG } from '../VehicleCatalog';
import { cloneVehiclePhysicsConfig, createDefaultVehiclePhysicsConfig } from '../config';
import { calibrateTyres } from '../config/TyreCalibration';
import { CruiseControlController } from '../control/CruiseControlController';
import { TripComputer } from '../control/TripComputer';
import { DriverAssistSystem } from './DriverAssistSystem';
import { SuspensionSystem } from './SuspensionSystem';
import { TyreGripModel } from './TyreGripModel';
import { VehicleDynamics } from './VehicleDynamics';
import { sampleWheelContacts, WHEEL_IDS } from './WheelContact';
import { SURFACE_MATERIALS } from '../../world/SurfaceMaterial';
import { BrakeTorqueCoordinator } from './BrakeTorqueCoordinator';
import { VehicleFeedbackSystem } from '../feedback/VehicleFeedbackSystem';
import { VehicleContactSystem } from './VehicleContactSystem';
import type { DrivingGround } from '../../world/DrivingGround';

/** V1 integration checks, using the actual fixed-step torque/contact paths. */
export function runVehicleExperienceSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string): void => { assertions++; if (!ok) throw new Error(`Vehicle experience: ${message}`); };
  const close = (a: number, b: number, tolerance = 1e-6): boolean => Math.abs(a - b) <= tolerance;
  const dt = 1 / 120, input = createNeutralVehicleInputState();
  const flat = { longitudinalAcceleration: 0, lateralAcceleration: 0 };
  const base = createDefaultVehiclePhysicsConfig();
  const lift = new SuspensionSystem(base);
  const original = lift.getSnapshot();
  for (let i = 0; i < 600; i++) lift.update(dt, { ...flat, frontAeroVerticalForce: -300, rearAeroVerticalForce: 100 });
  const aerodynamic = lift.getSnapshot();
  assert(close(aerodynamic.wheels.frontLeft.normalLoad + aerodynamic.wheels.frontRight.normalLoad,
    base.mass * base.gravity * base.frontWeightBias + 300), 'front downforce adds front tyre normal load');
  assert(close(aerodynamic.wheels.rearLeft.normalLoad + aerodynamic.wheels.rearRight.normalLoad,
    base.mass * base.gravity * (1 - base.frontWeightBias) - 100), 'rear lift independently removes rear tyre normal load');
  assert(aerodynamic.wheels.frontLeft.compression > original.wheels.frontLeft.compression &&
    aerodynamic.wheels.rearLeft.compression < original.wheels.rearLeft.compression, 'aero changes physical spring compression');
  const aeroAt = (speed: number) => {
    const car = new VehicleDynamics(cloneVehiclePhysicsConfig(base), { speed, engineRunning: false, gear: 'N' });
    return car.stepFixed(dt, input);
  };
  const zero = aeroAt(0), slow = aeroAt(10), fast = aeroAt(20), reverse = aeroAt(-20);
  assert(zero.frontAeroVerticalForce === 0 && zero.rearAeroVerticalForce === 0, 'zero-speed aero is zero');
  assert(close(fast.frontAeroVerticalForce, slow.frontAeroVerticalForce * 4) &&
    close(fast.rearAeroVerticalForce, slow.rearAeroVerticalForce * 4), 'independent lift scales with v squared');
  assert(close(fast.forces.aerodynamicDragForce, -.5 * base.aero.airDensity * base.aero.dragCoefficient * base.aero.frontalArea * 400), 'drag formula unchanged');
  assert(close(fast.frontAeroVerticalForce, reverse.frontAeroVerticalForce) &&
    close(fast.forces.aerodynamicDragForce, -reverse.forces.aerodynamicDragForce), 'reverse keeps vertical signs and reverses drag');
  const comfort = calibrateTyres(base.tires, 'COMFORT_TOURING'), performance = calibrateTyres(base.tires, 'PERFORMANCE');
  const comfortModel = new TyreGripModel(comfort), performanceModel = new TyreGripModel(performance);
  assert(Math.abs(performanceModel.lateralForce(.08, performance.corneringStiffnessFront / 2, performance.lateralGrip * 3500)) >
    Math.abs(comfortModel.lateralForce(.08, comfort.corneringStiffnessFront / 2, comfort.lateralGrip * 3500)), 'performance lateral force exceeds comfort in intended range');
  assert(performanceModel.wetRetention(0) === 1 && comfortModel.wetRetention(0, true) === 1, 'wet retention leaves dry road unchanged');
  assert(performanceModel.wetRetention(1) < comfortModel.wetRetention(1) && performanceModel.wetRetention(.5) < 1, 'wet tyre retention differs and blends');
  const scale = performanceModel.combinedScale(6000, 6000, 4000, 4000);
  assert(performanceModel.usage(6000 * scale, 6000 * scale, 4000, 4000) <= 1 + 1e-9, 'combined force stays bounded');
  const wetContacts = sampleWheelContacts({ sampleRoadSurface: () => ({ ...SURFACE_MATERIALS.asphalt,
    height: 0, normal: new Vector3(0, 1, 0), gradient: new Vector2(), grade: 0,
    gripMultiplier: 1, rollingResistanceMultiplier: 1 }) }, { x: 0, z: 0, yaw: 0 }, base, 1);
  const roadCar = new VehicleDynamics(base, { speed: 15, gear: 'N' });
  const wet = roadCar.stepFixed(dt, { ...input, brake: .5 }, { wheelContacts: wetContacts });
  const wheel = wet.wheels.frontLeft;
  assert(wheel.longitudinalUsage > 0 && Math.abs(wheel.longitudinalForce) / wheel.longitudinalUsage < wheel.normalLoad * base.tires.longitudinalGrip,
    'surface weather and tyre retention enter wheel grip');
  const fixed = new SuspensionSystem(base);
  fixed.setDriveMode('SPORT'); const fixedResult = fixed.update(dt, flat);
  assert(fixedResult.dampingMultiplier === 1 && fixedResult.rideHeightOffset === 0, 'fixed suspension remains fixed');
  const suvConfig = createVehiclePhysicsConfig('road-suv-v6-8at'), suvSuspension = new SuspensionSystem(suvConfig);
  suvSuspension.setDriveMode('SPORT');
  const first = suvSuspension.update(dt, flat);
  assert(first.dampingMultiplier > 1 && first.dampingMultiplier < 1.02, 'mode damping transition is smooth');
  assert(Math.abs(first.rideHeightOffset) <= suvConfig.suspension.airSuspension!.adjustmentRate * dt + 1e-9 &&
    Math.abs(first.chassis.rideOffset) < .001, 'air rest geometry and chassis transition smoothly');
  for (let i = 0; i < 1200; i++) suvSuspension.update(dt, flat);
  const sport = suvSuspension.getSnapshot();
  assert(close(sport.rideHeightOffset, -.02) && sport.dampingMultiplier > 1.39 && sport.chassis.rideOffset < -.019,
    'SPORT lowers real rest geometry and settles to lower supported chassis');
  suvSuspension.reset();
  for (let i = 0; i < 840; i++) suvSuspension.update(dt, { ...flat, speed: 35 });
  assert(suvSuspension.getSnapshot().rideHeightOffset === 0, 'high-speed lowering waits for delay');
  for (let i = 0; i < 960; i++) suvSuspension.update(dt, { ...flat, speed: 35 });
  assert(close(suvSuspension.getSnapshot().rideHeightOffset, -.015), 'high-speed lowering settles');
  for (let i = 0; i < 600; i++) suvSuspension.update(dt, { ...flat, speed: 20 });
  assert(close(suvSuspension.getSnapshot().rideHeightOffset, 0), 'lower speed restores normal geometry');
  suvSuspension.reset(); assert(suvSuspension.getSnapshot().rideHeightOffset === 0, 'respawn clears air actuator state');
  assert(!createVehiclePhysicsConfig('executive-lwb-2t').suspension.airSuspension, 'A6L has adaptive dampers without air suspension');
  for (const id of ['executive-lwb-2t', 'road-suv-v6-8at'] as const) {
    const config = createVehiclePhysicsConfig(id), car = new VehicleDynamics(config, { gear: 1, driveSelector: 'D' });
    for (let i = 0; i < 480; i++) car.stepFixed(dt, { ...input, brake: .6 }, { gradeRadians: .04 });
    assert(car.getSnapshot().engineRunning && car.getSnapshot().startStop?.enabled === false, `${id}: default OFF never auto stops`);
    car.setStartStopEnabled(true);
    const feedback = new VehicleFeedbackSystem(); feedback.setVehicleConfig(config); feedback.reset(car.getSnapshot());
    let falseStall = false;
    for (let i = 0; i < 480; i++) {
      const state = car.stepFixed(dt, { ...input, brake: .6 }, { gradeRadians: .04 });
      falseStall ||= feedback.update(dt, state).hapticPulses.some(pulse => pulse.kind === 'stall');
    }
    let stopped = car.getSnapshot();
    assert(stopped.startStop?.state === 'AUTO_STOPPED' && stopped.vehicleOperational && !stopped.driveAvailable && stopped.autoHold.holding,
      `${id}: held D auto-stop preserves vehicle power`);
    assert(!falseStall, `${id}: automatic stop does not emit stall feedback`);
    for (let i = 0; i < 120; i++) stopped = car.stepFixed(dt, input, { gradeRadians: .04 });
    assert(stopped.startStop?.state === 'AUTO_STOPPED' && stopped.autoHold.holding, `${id}: brake release retains auto-stop and hold`);
    let powered = false;
    const heldPosition = car.z;
    for (let i = 0; i < 360; i++) {
      const launched = car.stepFixed(dt, { ...input, throttle: .3 }, { gradeRadians: .04 });
      assert(car.z - heldPosition < .03, `${id}: launch coupling prepares before pressure release on slope`);
      if (!launched.driveAvailable) assert(launched.autoHold.holding && launched.autoHold.pressure > .5, `${id}: hold waits for propulsion`);
      powered ||= launched.driveAvailable;
    }
    assert(powered && !car.getSnapshot().autoHold.holding && car.speed > .3, `${id}: restart precedes physical launch`);
    car.reset({ gear: 1, driveSelector: 'D' });
    for (let i = 0; i < 480; i++) car.stepFixed(dt, { ...input, brake: .6 });
    car.stepFixed(dt, { ...input, brake: .6, driveSelector: 'R' });
    assert(car.getSnapshot().startStop?.state === 'RESTARTING', `${id}: reverse request restarts`);
    assert(car.requestEngineToggle() === 'stopped' && !car.powertrain.vehicleOperational, `${id}: manual power-off wins during restart`);
    car.reset({ gear: 1, driveSelector: 'D' });
    for (let i = 0; i < 480; i++) car.stepFixed(dt, { ...input, brake: .6 });
    car.setCurrentFuelL(0);
    for (let i = 0; i < 240; i++) car.stepFixed(dt, { ...input, throttle: .4 });
    assert(!car.engine.isStarting && !car.getSnapshot().driveAvailable && car.getSnapshot().startStop?.state === 'DISABLED', `${id}: empty tank cannot restart loop`);
  }
  for (const id of ['test-6at-sedan', 'road-suv-v6-8at', 'test-7dct-sedan', 'executive-lwb-2t'] as const) {
    for (const direction of ['D', 'R'] as const) {
      const car = new VehicleDynamics(createVehiclePhysicsConfig(id), { gear: 1, driveSelector: direction });
      car.setAutoHoldEnabled(false);
      let maximumSpeed = 0;
      for (let i = 0; i < 1800; i++) { car.stepFixed(dt, input); maximumSpeed = Math.max(maximumSpeed, Math.abs(car.speed)); }
      assert(car.speed * (direction === 'D' ? 1 : -1) > .1 && maximumSpeed < 4, `${id}/${direction}: physical creep has finite low speed`);
      const beforeBrake = Math.abs(car.speed);
      for (let i = 0; i < 480; i++) car.stepFixed(dt, { ...input, brake: .5 });
      assert(Math.abs(car.speed) < .06 && beforeBrake > .1, `${id}: brake overcomes creep`);
      if (car.transmission.type === 'DCT') assert((car.getSnapshot().transmission.dct?.clutchAEngagement ?? 0) < .01, 'DCT stopped brake opens clutch');
    }
    const held = new VehicleDynamics(createVehiclePhysicsConfig(id), { gear: 1, driveSelector: 'D' });
    for (let i = 0; i < 240; i++) held.stepFixed(dt, { ...input, brake: .6 });
    if (held.capabilities.autoHold) {
      const state = held.stepFixed(dt, input);
      assert(state.autoHold.holding && WHEEL_IDS.every(id => state.wheels[id].driveTorque === 0), 'hold cancels physical creep torque');
    }
  }
  const trip = new TripComputer(); trip.update(10, 10, .02); trip.update(10, -10, .01); trip.update(0, 100);
  assert(close(trip.getSnapshot().totalDistanceKm, .2) && close(trip.getSnapshot().tripA.fuelUsedL, .03), 'trip counts forward/reverse fuel and ignores paused dt');
  trip.resetTripA(); assert(trip.getSnapshot().tripA.distanceKm === 0 && close(trip.getSnapshot().totalDistanceKm, .2) && close(trip.getSnapshot().tripB.distanceKm, .2), 'Trip A reset preserves odometer and B');
  const restored = new TripComputer(); restored.restore(JSON.parse(JSON.stringify(trip.getSnapshot())));
  assert(close(restored.getSnapshot().totalDistanceKm, .2) && close(restored.getSnapshot().tripB.fuelUsedL, .03), 'trip persistence roundtrip');
  const coast = new VehicleDynamics(base, { speed: -5, engineRunning: false }); coast.stepFixed(dt, input);
  const distance = coast.tripComputer.getSnapshot().totalDistanceKm;
  coast.reset({ x: 10000, z: 10000, speed: 0 });
  assert(distance > 0 && coast.tripComputer.getSnapshot().totalDistanceKm === distance, 'engine-off coast counts, teleport and respawn do not');
  const fuelCar = new VehicleDynamics(createVehiclePhysicsConfig('test-6at-sedan'), { gear: 1, driveSelector: 'D' });
  const fuelBefore = fuelCar.fuel.currentFuelL;
  for (let i = 0; i < 240; i++) fuelCar.stepFixed(dt, { ...input, throttle: .3 });
  assert(close(fuelCar.tripComputer.getSnapshot().tripA.fuelUsedL, fuelBefore - fuelCar.fuel.currentFuelL, 1e-10), 'trip consumes exact FuelSystem delta');
  for (const descriptor of ICE_VEHICLE_CATALOG) {
    const car = new VehicleDynamics(createVehiclePhysicsConfig(descriptor.id));
    car.setDriverAssistOptions({ absEnabled: false, ebdEnabled: true, tractionControlEnabled: false, stabilityControlEnabled: false });
    car.reset(); const aids = car.getSnapshot().driverAssists;
    assert(!aids.absEnabled && !aids.tractionControlEnabled && !aids.stabilityControlEnabled && !aids.escActive && aids.ebdEnabled,
      `${descriptor.id}: independent assist settings survive reset and EBD stays built-in`);
    assert(Number.isFinite(car.stepFixed(dt, input).speed), `${descriptor.id}: catalog fixed-step regression`);
  }
  const unsupported = cloneVehiclePhysicsConfig(base); unsupported.capabilities = { abs: false, tcs: false, esc: false };
  const aids = new DriverAssistSystem(unsupported); aids.setOptions({ absEnabled: true, ebdEnabled: true, tractionControlEnabled: true, stabilityControlEnabled: true });
  const aidState = aids.getSnapshot();
  assert(!aidState.absEnabled && !aidState.tractionControlEnabled && !aidState.stabilityControlEnabled && !aidState.absSupported && !aidState.escSupported,
    'capability wins over user preferences');
  const coordinator = new BrakeTorqueCoordinator(); coordinator.requestWheel(0, 'cruise', 200);
  assert(coordinator.hasServiceRequest(0) && coordinator.resolve(0, 1000, .25).appliedBrakeTorque === 50,
    'independent cruise request retains final ABS authority');
  const stability = new DriverAssistSystem(base); stability.reset(true);
  stability.setOptions({ absEnabled: false, ebdEnabled: true, tractionControlEnabled: false, stabilityControlEnabled: true });
  assert(stability.getSnapshot().stabilityControlEnabled && !stability.getSnapshot().escActive, 'enabled ESC is distinct from intervening ESC');
  for (let i = 0; i < 120; i++) stability.updateStability(dt, 20, .03, -.9, -4, roadCar.getSnapshot().wheels,
    [3000, 3000, 3000, 3000], [3000, 3000, 3000, 3000]);
  assert(stability.getSnapshot().escActive, 'ABS and TCS OFF leave ESC intervention available');
  stability.setOptions({ absEnabled: true, ebdEnabled: true, tractionControlEnabled: true, stabilityControlEnabled: false });
  assert(!stability.getSnapshot().escActive && stability.esc.brakeTorques.every(torque => torque === 0), 'ESC OFF immediately clears actuator requests');
  return { passed: true, assertions };
}

export function runCruiseVehicleExperienceSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string): void => { assertions++; if (!ok) throw new Error(`Cruise vehicle experience: ${message}`); };
  const dt = 1 / 120, baseInput = createNeutralVehicleInputState();
  const metrics: { vehicle: string; target: number; setSpeed: number; mode: string; actual: number; minimum: number; maximum: number; spread: number; mean: number; drift: number }[] = [];
  const surface = { ...SURFACE_MATERIALS.asphalt, height: 0, normal: new Vector3(0, 1, 0), gradient: new Vector2(), grade: 0,
    gripMultiplier: 1, rollingResistanceMultiplier: 1 };
  const ground = { root: new Group(), colliders: [], spawnPose: { position: new Vector3() },
    worldBounds: { minX: -1e6, maxX: 1e6, minZ: -1e6, maxZ: 1e6 },
    sampleRoadSurface: () => surface,
  } as unknown as DrivingGround;
  for (const descriptor of ICE_VEHICLE_CATALOG.filter(vehicle => vehicle.physicsConfig.driveModes)) {
    const car = new VehicleDynamics(createVehiclePhysicsConfig(descriptor.id), { speed: 20, gear: 4, driveSelector: 'D' });
    let requestedThrottle = NaN;
    const prepare = car.powertrain.prepare.bind(car.powertrain);
    car.powertrain.prepare = context => { requestedThrottle = context.throttle; prepare(context); };
    for (let i = 0; i < 3; i++) {
      car.cycleDriveMode();
      for (const driver of [0, .9]) {
        const expected = Math.max(car.driverThrottleCommand(driver), .55);
        car.stepFixed(dt, { ...baseInput, throttle: driver, cruiseThrottle: .55 });
        assert(requestedThrottle === expected, `${descriptor.id}/${car.driveMode}: pedal shaping precedes max arbitration; cruise reaches Powertrain unchanged`);
      }
    }
  }
  for (const descriptor of ICE_VEHICLE_CATALOG.filter(vehicle => vehicle.capabilities.cruiseControl)) {
    const id = descriptor.id;
    for (const target of [60, 80, 100, 120]) {
      const config = createVehiclePhysicsConfig(id), speed = target / 3.6;
      const gear = 5;
      const rpm = speed / config.wheelRadius * (config.transmission.gearRatios[gear] ?? 1) * config.transmission.finalDriveRatio * 60 / (2 * Math.PI);
      const car = new VehicleDynamics(config, { speed, gear, driveSelector: 'D', engineRPM: rpm, clutchEngagement: 1 });
      const contacts = new VehicleContactSystem(ground, descriptor.visualConfig.dimensions);
      const cruise = new CruiseControlController(config.cruiseControl);
      const tick = (i: number, grade = 0, throttle = 0, brake = 0) => {
        const state = car.getSnapshot();
        const controls = cruise.update(dt, { ...baseInput, cruiseToggle: i === 0, throttle, brake }, {
          available: true, speedMetersPerSecond: state.speed, engineRunning: state.driveAvailable, gear: state.gear,
          driveSelector: state.transmission.selectedMode ?? undefined, torqueLimitFactor: state.driverAssists.engineTorqueFactor,
          currentThrottle: state.throttle, driverThrottleCommand: car.driverThrottleCommand(throttle),
        });
        return grade === 0 ? contacts.step(dt, controls, car) : car.stepFixed(dt, controls, { gradeRadians: grade });
      };
      let minimum = Infinity, maximum = -Infinity;
      let sum = 0, firstSum = 0, lastSum = 0;
      for (let i = 0; i < 21600; i++) {
        const state = tick(i);
        if (i >= 18000) { minimum = Math.min(minimum, state.speed * 3.6); maximum = Math.max(maximum, state.speed * 3.6); sum += state.speed * 3.6; }
        if (i >= 18000 && i < 19200) firstSum += state.speed * 3.6;
        if (i >= 20400) lastSum += state.speed * 3.6;
      }
      assert(cruise.status.active && minimum >= target - 1 && maximum <= target + 1,
        `${id} ${target}: flat speed ${car.speed * 3.6}, spread ${maximum - minimum}`);
      const drift = (lastSum - firstSum) / 1200;
      assert(Math.abs(drift) < .2, `${id} ${target}: steady state cannot keep losing speed (${drift})`);
      metrics.push({ vehicle: id, target, setSpeed: target, mode: 'NORMAL', actual: car.speed * 3.6, minimum, maximum,
        spread: maximum - minimum, mean: sum / 3600, drift });
      if (target === 80) {
        for (let i = 1; i < 6000; i++) tick(i, .025);
        assert(Math.abs(car.speed * 3.6 - target) <= 1, `${id}: mild uphill restores target (${car.speed * 3.6})`);
        for (let i = 1; i < 360; i++) tick(i, 0, .6);
        assert(cruise.status.active && car.speed * 3.6 > target, `${id}: driver accelerator overrides`);
        for (let i = 1; i < 7200; i++) tick(i);
        assert(Math.abs(car.speed * 3.6 - target) <= 1, `${id}: override release recovers target (${car.speed * 3.6})`);
        for (let i = 1; i < 6000; i++) tick(i, -.04);
        assert(car.speed * 3.6 < target + 8 && car.brakes.coordinator.wheelTorques.some(t => t.requestedBrakeTorque > 0), `${id}: downhill modest service braking bounds overspeed`);
        tick(1, 0, 0, .3); assert(!cruise.status.active, `${id}: driver brake cancels`);
      }
    }
  }
  const cruise = new CruiseControlController();
  for (const descriptor of ICE_VEHICLE_CATALOG.filter(vehicle => vehicle.capabilities.cruiseControl && vehicle.physicsConfig.driveModes)) {
    const id = descriptor.id;
    const order = descriptor.physicsConfig.driveModeOrder ?? ['ECO', 'NORMAL', 'SPORT'] as const;
    for (const mode of [order[0]!, order[order.length - 1]!]) for (const target of [60, 80, 100, 120]) {
    const config = createVehiclePhysicsConfig(id);
    const car = new VehicleDynamics(config, { gear: 1, driveSelector: 'D' });
    for (let n = 0; n < order.length && car.driveMode !== mode; n++) car.cycleDriveMode();
    const contacts = new VehicleContactSystem(ground, descriptor.visualConfig.dimensions);
    let launchSteps = 0;
    while (car.speed * 3.6 < target && launchSteps++ < 18000) contacts.step(dt, { ...baseInput, throttle: .6 }, car);
    assert(car.speed * 3.6 >= target, `${id}/${mode}: driver reaches SET speed through real torque path`);
    const controller = new CruiseControlController(config.cruiseControl);
    let minimum = Infinity, maximum = -Infinity;
    let sum = 0, firstSum = 0, lastSum = 0;
    for (let i = 0; i < 21600; i++) {
      const state = car.getSnapshot();
      const request = controller.update(dt, { ...baseInput, cruiseToggle: i === 0 }, {
        available: true, speedMetersPerSecond: state.speed, engineRunning: state.driveAvailable, gear: state.gear,
        driveSelector: 'D', torqueLimitFactor: state.driverAssists.engineTorqueFactor,
        currentThrottle: state.throttle, driverThrottleCommand: car.driverThrottleCommand(0),
      });
      contacts.step(dt, request, car);
      if (i === 0) assert(Math.abs(request.cruiseThrottle! - state.throttle) < 1e-10 && request.throttle === 0,
        `${id}/${mode}: SET retains actuator output with released pedal`);
      if (i >= 18000) { minimum = Math.min(minimum, car.speed * 3.6); maximum = Math.max(maximum, car.speed * 3.6); sum += car.speed * 3.6; }
      if (i >= 18000 && i < 19200) firstSum += car.speed * 3.6;
      if (i >= 20400) lastSum += car.speed * 3.6;
    }
    const setSpeed = controller.status.targetSpeedKmh!;
    const drift = (lastSum - firstSum) / 1200;
    assert(minimum >= setSpeed - 1 && maximum <= setSpeed + 1 && Math.abs(drift) < .2, `${id}/${mode}/${target}: steady target (${minimum}..${maximum}, drift ${drift})`);
    metrics.push({ vehicle: id, target, setSpeed, mode, actual: car.speed * 3.6, minimum, maximum,
      spread: maximum - minimum, mean: sum / 3600, drift });
    }
  }
  const context = { available: true, engineRunning: true, speedMetersPerSecond: 80 / 3.6, gear: 5, driveSelector: 'D' as const };
  cruise.update(dt, { ...baseInput, cruiseToggle: true }, context);
  for (let i = 0; i < 20000; i++) cruise.update(dt, baseInput, { ...context, speedMetersPerSecond: 10 });
  assert(Math.abs(cruise.status.integralThrottle) <= cruise.config.integralLimit, 'integral saturates safely under impossible load');
  const limited = new CruiseControlController(); limited.update(dt, { ...baseInput, cruiseToggle: true }, context);
  for (let i = 0; i < 500; i++) limited.update(dt, baseInput, { ...context, speedMetersPerSecond: 20, torqueLimitFactor: .3 });
  assert(limited.status.integralThrottle === 0, 'TCS limiting freezes integration instead of bypassing torque control');
  for (const selector of ['N', 'P', 'R'] as const) {
    cruise.reset(); cruise.update(dt, { ...baseInput, cruiseToggle: true }, context);
    cruise.update(dt, baseInput, { ...context, driveSelector: selector }); assert(!cruise.status.active, `${selector} cancels cruise`);
  }
  cruise.reset(); cruise.update(dt, { ...baseInput, cruiseToggle: true }, context);
  cruise.update(dt, baseInput, { ...context, engineRunning: false }); assert(!cruise.status.active, 'propulsion loss cancels cruise');
  return { passed: true, assertions, metrics };
}
