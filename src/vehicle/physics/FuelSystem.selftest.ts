import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { createVehiclePhysicsConfig, VEHICLE_CATALOG } from '../VehicleCatalog';
import type { VehicleDriveMode } from '../config';
import { Engine } from './Engine';
import { FuelSystem } from './FuelSystem';
import { VehicleDynamics } from './VehicleDynamics';

/** Fuel energy/accounting, mass coupling and starvation regressions. */
export function runFuelSystemSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string): void => {
    assertions++;
    if (!ok) throw new Error(`Fuel: ${message}`);
  };
  const dt = 1 / 120;
  const input = createNeutralVehicleInputState();
  const idleFlows: Record<string, number> = {};
  for (const descriptor of VEHICLE_CATALOG) {
    const config = createVehiclePhysicsConfig(descriptor.id);
    const baseMass = config.mass;
    const vehicle = new VehicleDynamics(config);
    const initial = vehicle.getSnapshot();
    for (let i = 0; i < 120; i++) vehicle.stepFixed(dt, input);
    const idle = vehicle.getSnapshot();
    idleFlows[descriptor.id] = idle.fuel.currentFuelFlowLPerHour;
    assert(config.fuel.defaultFuelL > 0 && config.fuel.defaultFuelL <= config.fuel.tankCapacityL, `${descriptor.id} tank defaults`);
    assert(idle.fuel.currentFuelFlowLPerHour > 0 && idle.fuel.currentFuelL < initial.fuel.currentFuelL, `${descriptor.id} idles and burns fuel`);
    assert(Math.abs(initial.fuel.currentFuelL - idle.fuel.currentFuelL - idle.fuel.fuelUsedL) < 1e-10, 'burn accounting conserves litres');
    assert(config.mass === baseMass && Math.abs(idle.effectiveVehicleMass - baseMass - idle.fuel.fuelMassKg) < 1e-9, 'one mass addition preserves base config');
    assert(idle.effectiveVehicleMass < initial.effectiveVehicleMass, 'burn lowers mass');
    assert(idle.fuel.instantConsumptionUnit === 'L/h' && idle.fuel.averageConsumptionLPer100km === null, 'idle metrics avoid division by tiny distance');
    const wheelLoad = Object.values(idle.wheels).reduce((sum, wheel) => sum + wheel.normalLoad, 0);
    assert(Math.abs(wheelLoad - idle.effectiveVehicleMass * config.gravity) < 1e-6, 'suspension shares effective mass');
    const tripUsed = idle.fuel.fuelUsedL;
    vehicle.setCurrentFuelL(config.fuel.tankCapacityL * 0.5);
    assert(vehicle.getSnapshot().fuel.fuelPercent === 50, 'settings-style edit accepts percentages converted to litres');
    vehicle.setCurrentFuelL(1e6);
    assert(vehicle.fuel.currentFuelL === config.fuel.tankCapacityL, 'tank capacity clamps edits');
    assert(vehicle.getSnapshot().fuel.fuelUsedL === tripUsed, 'editing tank contents does not falsify trip consumption');
    vehicle.setCurrentFuelL(-1);
    assert(vehicle.getSnapshot().fuel.lowFuel && vehicle.getSnapshot().fuel.emptyFuel, 'empty and low-fuel flags');
    assert(vehicle.effectiveVehicleMass === baseMass, 'empty tank removes all fuel mass');
    const rpmBefore = vehicle.engine.currentRPM;
    const sample = vehicle.engine.getTorqueSample();
    assert(sample.combustionTorque === 0 && sample.idleControlTorque === 0 && sample.revHangTorque === 0, 'empty tank disables all combustion sources');
    assert(vehicle.engine.currentRPM === rpmBefore, 'fuel edit does not snap RPM');
    vehicle.stepFixed(dt, input);
    assert(vehicle.engine.currentRPM > 0 && vehicle.engine.currentRPM < rpmBefore, 'natural first-step coast down');
    for (let i = 0; i < 360; i++) vehicle.stepFixed(dt, input);
    assert(!vehicle.engine.isRunning && vehicle.engine.currentRPM === 0, 'empty engine naturally stops');
    assert(!vehicle.requestEngineStart(), 'empty engine cannot start');
    vehicle.engine.start();
    assert(!vehicle.engine.isRunning, 'engine-level starter also rejects no fuel');
    const reset = vehicle.reset();
    assert(reset.fuel.currentFuelL === 0 && !reset.engineRunning, 'pose reset cannot refill or restart empty engine');
    vehicle.setCurrentFuelL(5);
    assert(vehicle.requestEngineStart(), 'fuel restoration permits existing safe start');
    assert(descriptor.physicsConfig.fuel.defaultFuelL === config.fuel.defaultFuelL, 'catalog fuel config remains unchanged');
  }
  assert(idleFlows['sport-coupe']! > idleFlows['family-sedan']! * 1.5, 'large GT engine has materially higher idle consumption');

  const config = createVehiclePhysicsConfig('family-sedan');
  const flowAt = (rpm: number, throttle: number, mode: VehicleDriveMode = 'NORMAL', limit = 1): number => {
    const engine = new Engine(config.engine);
    engine.reset(rpm);
    engine.throttle = throttle;
    engine.setTorqueLimitFactor(limit);
    const fuel = new FuelSystem(config.fuel, config.engine);
    fuel.update(dt, rpm, throttle, engine.getTorqueSample(), 20, 0, mode);
    return fuel.getSnapshot().currentFuelFlowLPerHour;
  };
  const light = flowAt(2200, 0.15);
  assert(flowAt(2200, 0.8) > light * 2, 'large throttle increases consumption');
  assert(flowAt(5500, 0.9) > flowAt(2200, 0.9) * 1.4, 'high RPM under load burns more');
  assert(flowAt(3500, 0.7, 'NORMAL', 0.4) < flowAt(3500, 0.7), 'actual torque intervention reduces fuel');
  assert(flowAt(2200, 0.3, 'ECO') < flowAt(2200, 0.3) && flowAt(2200, 0.3) < flowAt(2200, 0.3, 'SPORT'), 'small efficiency mode calibration is ordered');
  // Existing live modes primarily alter throttle/shift behavior, never peak torque.
  const modeFlows: number[] = [];
  for (const mode of ['ECO', 'NORMAL', 'SPORT'] as const) {
    const car = new VehicleDynamics(createVehiclePhysicsConfig('executive-lwb-2t'));
    const envelope = JSON.stringify(car.config.engine.torqueCurve);
    while (car.driveMode !== mode) car.cycleDriveMode();
    car.engine.reset(2500);
    car.stepFixed(dt, { ...input, throttle: 0.4 });
    modeFlows.push(car.getSnapshot().fuel.currentFuelFlowLPerHour);
    assert(envelope === JSON.stringify(car.config.engine.torqueCurve), 'modes preserve maximum power envelope');
  }
  assert(modeFlows[0]! < modeFlows[1]! && modeFlows[1]! < modeFlows[2]!, 'existing live drive modes affect consumption naturally');

  const fuel = new FuelSystem(config.fuel, config.engine);
  const engine = new Engine(config.engine);
  engine.reset(2200); engine.throttle = 0.15;
  for (let i = 0; i < 120 * 20; i++) fuel.update(dt, 2200, 0.15, engine.getTorqueSample(), 20, 0);
  const cruise = fuel.getSnapshot();
  assert(cruise.instantConsumptionUnit === 'L/100km' && cruise.averageConsumptionLPer100km! > 0, 'moving metrics and average available');
  engine.reset(5500); engine.throttle = 1;
  for (let i = 0; i < 120; i++) fuel.update(dt, 5500, 1, engine.getTorqueSample(), 20, 0);
  const burst = fuel.getSnapshot();
  assert(Math.abs(burst.estimatedRangeKm - cruise.estimatedRangeKm) / cruise.estimatedRangeKm < 0.1, 'one-second full throttle does not jerk range');
  const stoppedRange = burst.estimatedRangeKm;
  engine.reset();
  for (let i = 0; i < 120; i++) fuel.update(dt, config.engine.idleRPM, 0, engine.getTorqueSample(), 0, 0);
  assert(Math.abs(fuel.getSnapshot().estimatedRangeKm - stoppedRange) < 1, 'stopping holds useful range history');
  const rolling = new VehicleDynamics(config, { speed: 10, engineRPM: 3000 });
  rolling.setCurrentFuelL(0);
  rolling.stepFixed(dt, input);
  assert(rolling.speed > 9 && rolling.engine.currentRPM > 0, 'empty tank retains rolling physics and rotational dynamics');
  const tiny = new VehicleDynamics(createVehiclePhysicsConfig('family-sedan'), { currentFuelL: 1e-6 });
  tiny.stepFixed(dt, input);
  assert(tiny.fuel.currentFuelL === 0 && Math.abs(tiny.getSnapshot().fuel.fuelUsedL - 1e-6) < 1e-12, 'natural depletion never overdrafts tank');
  return { assertions, idleFlowsLPerHour: idleFlows, liveModeFlowsLPerHour: modeFlows };
}
