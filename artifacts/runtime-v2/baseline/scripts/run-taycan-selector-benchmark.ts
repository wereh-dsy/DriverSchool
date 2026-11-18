import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { CityGround } from '../src/world/city/CityGround';
import data from '../src/world/regional/regional-main.json';
import { createVehiclePhysicsConfig, getVehicleDescriptor } from '../src/vehicle/VehicleCatalog';
import { VehicleDynamics } from '../src/vehicle/physics/VehicleDynamics';
import { VehicleContactSystem } from '../src/vehicle/physics/VehicleContactSystem';
import { ElectricPowertrain } from '../src/vehicle/powertrain/ElectricPowertrain';
import { createNeutralVehicleInputState } from '../src/input/VehicleInputState';
import { AccelerationTest } from '../src/experimental/acceleration/AccelerationTest';
import { AccelerationRunDiagnostics, type AccelerationRunReport } from '../src/experimental/acceleration/AccelerationRunDiagnostics';
const reference = JSON.parse(readFileSync('artifacts/performance-tcs/user-runtime-6.218.json', 'utf8')) as AccelerationRunReport;
const initial = reference.initial!;
const ground = new CityGround(data, { loadRadius: 0 });
const runtimeGround = Object.assign(Object.create(ground) as CityGround, {
  spawnPose: { position: new Vector3(initial.position.x, initial.position.groundHeight + .04, initial.position.z), yawRadians: initial.position.yaw },
});
const output = process.argv[2] ?? 'artifacts/performance-tcs/selector-after';
mkdirSync(output, { recursive: true });
const rows = [];
for (const route of ['direct-ui', 'shift-buttons', 'input-selector', 'initialized-d'] as const) {
  for (const tcs of [true, false]) for (const launch of [false, true]) {
    const config = createVehiclePhysicsConfig('porsche-taycan-4s');
    // Match the uploaded road pose, SOC, mode and temperatures. Start neutral so
    // the test isolates selector routing from any earlier EPB application.
    const car = new VehicleDynamics<ElectricPowertrain>(config, { ...initial.position,
      driveSelector: route === 'initialized-d' ? 'D' : 'N', stateOfCharge: initial.powertrain.ev!.stateOfCharge });
    car.powertrain.reset({ driveSelector: route === 'initialized-d' ? 'D' : 'N', ev: {
      stateOfCharge: initial.powertrain.ev!.stateOfCharge, batteryTemperature: initial.powertrain.ev!.batteryTemperature,
      frontMotorTemperature: initial.powertrain.ev!.frontMotorTemperature, rearMotorTemperature: initial.powertrain.ev!.rearMotorTemperature,
      frontInverterTemperature: initial.powertrain.ev!.frontInverterTemperature, rearInverterTemperature: initial.powertrain.ev!.rearInverterTemperature } });
    while (car.driveMode !== 'SPORT_PLUS') car.cycleDriveMode();
    car.setAutoHoldEnabled(true);
    car.setDriverAssistOptions({ absEnabled: true, ebdEnabled: true, tractionControlEnabled: tcs, stabilityControlEnabled: true });
    const contacts = new VehicleContactSystem(runtimeGround, getVehicleDescriptor('porsche-taycan-4s').visualConfig.collisionDimensions);
    const input = createNeutralVehicleInputState();
    input.brake = .5;
    if (route === 'direct-ui') {
      if (!car.requestDriveSelector('D', input.brake)) throw new Error('UI selector rejected');
    } else if (route === 'input-selector') input.driveSelector = 'D';
    else if (route === 'shift-buttons') input.shiftUp = true;
    contacts.step(1 / 120, input, car);
    input.driveSelector = undefined; input.shiftUp = false;
    for (let n = 0; n < 240; n++) contacts.step(1 / 120, input, car);
    if (launch) {
      input.brake = 1; input.throttle = 1;
      for (let n = 0; n < 120; n++) contacts.step(1 / 120, input, car);
      if (car.powertrain.launchControl!.state !== 'READY') throw new Error('LC not ready');
    }
    const selectorModes = { front: car.powertrain.frontDriveUnit!.transmission.mode, rear: car.powertrain.rearDriveUnit!.transmission.mode };
    const test = new AccelerationTest(), diagnostics = new AccelerationRunDiagnostics();
    test.arm(car.getSnapshot(), 0); diagnostics.arm(reference.context, test.state);
    input.brake = 0;
    const milestones: Record<string, number | null> = { 30: null, 50: null, 100: null };
    let time = 0, maxFrontWheelTorque = 0;
    for (let n = 0; n < 2400; n++) {
      input.throttle = !launch && n === 0 ? initial.driver.throttle : 1;
      const before = car.getSnapshot(), after = contacts.step(1 / 120, input, car);
      test.update(1 / 120, before, after, input.throttle, true, contacts.collision?.collided);
      diagnostics.update(1 / 120, test.state, before, after, input, input, contacts.wheelContacts,
        car.driverAssists.frontTorqueFactor, car.driverAssists.rearTorqueFactor);
      for (const speed of [30, 50, 100]) if (milestones[speed] === null && after.speedKmh >= speed)
        milestones[speed] = time + (speed - before.speedKmh) / (after.speedKmh - before.speedKmh) / 120;
      maxFrontWheelTorque = Math.max(maxFrontWheelTorque, Math.abs(after.wheels.frontLeft.driveTorque) + Math.abs(after.wheels.frontRight.driveTorque));
      time += 1 / 120;
      if (test.state.phase === 'COMPLETED' || test.state.phase === 'INTERRUPTED') break;
    }
    if (test.state.phase !== 'COMPLETED') throw new Error(`${route} failed: ${test.state.notice}`);
    const row = { route, tcs, launch, selectorModes, milestones, result: test.state.to100,
      summary: diagnostics.report!.summary, maxFrontWheelTorque };
    rows.push(row); console.log(JSON.stringify(row));
    writeFileSync(`${output}/${route}-${tcs ? 'on' : 'off'}-${launch ? 'lc' : 'pedal'}.json`, diagnostics.serialize()!);
  }
}
writeFileSync(`${output}/summary.json`, JSON.stringify(rows, null, 2));
ground.dispose();
