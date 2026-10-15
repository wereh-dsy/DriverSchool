import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { createVehiclePhysicsConfig } from '../../vehicle/VehicleCatalog';
import { VehicleDynamics } from '../../vehicle/physics/VehicleDynamics';
import { ElectricPowertrain } from '../../vehicle/powertrain/ElectricPowertrain';
import { createWheelContactBuffer } from '../../vehicle/physics/WheelContact';
import { AccelerationTest } from './AccelerationTest';
import { AccelerationRunDiagnostics } from './AccelerationRunDiagnostics';

export function runAccelerationRunDiagnosticsSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, label: string) => { assertions++; if (!ok) throw new Error(`Acceleration diagnostic: ${label}`); };
  const config = createVehiclePhysicsConfig('porsche-taycan-4s'), dt = 1 / 120;
  const create = () => {
    const car = new VehicleDynamics<ElectricPowertrain>(structuredClone(config), { driveSelector: 'D' }, new ElectricPowertrain(structuredClone(config)));
    car.cycleDriveMode(); car.cycleDriveMode(); return car;
  };
  const car = create(), reference = create();
  const input = { ...createNeutralVehicleInputState(), throttle: 1 }, contacts = createWheelContactBuffer();
  const test = new AccelerationTest();
  let writes = 0, saved = '';
  const recorder = new AccelerationRunDiagnostics({ setItem(_key, value) { writes++; saved = value; } });
  const context = { vehicleId: 'porsche-taycan-4s', vehicleVersion: 1, groundId: 'regional-main', groundVersion: 1, weather: 'CLEAR', wetness: 0 };
  test.arm(car.getSnapshot(), 0); recorder.arm(context, test.state);
  for (let n = 0; n < 60; n++) recorder.update(dt, test.state, car.getSnapshot(), car.getSnapshot(), input, input, contacts, 1, 1);
  assert(recorder.report!.samples.length === 0 && writes === 0 && recorder.serialize() === null, 'waiting does not collect/save a fake run');
  for (let n = 0; n < 1200; n++) {
    const before = car.getSnapshot(), after = car.stepFixed(dt, input, { wheelContacts: contacts });
    reference.stepFixed(dt, input, { wheelContacts: contacts });
    test.update(dt, before, after, 1, true);
    recorder.update(dt, test.state, before, after, input, input, contacts,
      car.driverAssists.frontTorqueFactor, car.driverAssists.rearTorqueFactor);
    assert(car.speed === reference.speed && car.powertrain.battery.remainingEnergyKWh === reference.powertrain.battery.remainingEnergyKWh,
      'observing must not change acceleration or battery work');
    assert(writes === (test.state.phase === 'COMPLETED' ? 1 : 0), 'persist once at completion, never at physics frequency');
    if (test.state.phase === 'COMPLETED') break;
  }
  const report = JSON.parse(recorder.serialize()!);
  assert(report.measurement.to100.elapsedSeconds === test.state.to100!.elapsedSeconds, 'exports the real passive-meter result');
  assert(report.initial.driveMode === 'SPORT_PLUS' && report.initial.driver.throttle === 1, 'captures actual mode and pedal');
  assert(report.summary.throttleBelow95Seconds === 0 && report.summary.serviceBrakeSeconds === 0, 'full pedal without brake drag');
  assert(report.summary.surfaces.join() === 'asphalt' && report.summary.peakThermalDerate === 0, 'captures surface and thermal state');
  const sample = report.samples.find((s: { speedKmh: number }) => s.speedKmh > 30);
  assert(sample.powertrain.ev.frontDriveUnit.requestedTorque > 0 && sample.powertrain.ev.rearDriveUnit.deliveredTorque > 0,
    'both motor requests and delivery available');
  assert(sample.powertrain.ev.availableDischargePower > 0 && sample.wheels.length === 4 && Number.isFinite(sample.wheels[0].slip),
    'pack budget and all wheel observations available');
  for (let n = 0; n < 120; n++) {
    const before = car.getSnapshot(), after = car.stepFixed(dt, input);
    recorder.update(dt, test.state, before, after, input, input, contacts, 1, 1);
  }
  assert(recorder.serialize() === JSON.stringify(report, null, 2) && writes === 1, 'completed trace freezes borrowed motor/tyre state');
  assert(JSON.parse(saved).schemaVersion === 1, 'versioned optional browser checkpoint');
  const inaccessible = new AccelerationRunDiagnostics({ setItem() { throw new Error('quota'); } });
  inaccessible.arm(context, test.state);
  inaccessible.update(dt, test.state, car.getSnapshot(), car.getSnapshot(), input, input, contacts, 1, 1);
  assert(inaccessible.serialize() !== null, 'storage failure never breaks measurement or export');
  return { assertions, samples: report.samples.length, writes, zeroTo100: test.state.to100!.elapsedSeconds, passive: true };
}
