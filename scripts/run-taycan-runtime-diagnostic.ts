import { mkdirSync, writeFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { CityGround } from '../src/world/city/CityGround';
import data from '../src/world/regional/regional-main.json';
import { createVehiclePhysicsConfig, getVehicleDescriptor } from '../src/vehicle/VehicleCatalog';
import { VehicleDynamics } from '../src/vehicle/physics/VehicleDynamics';
import { VehicleContactSystem } from '../src/vehicle/physics/VehicleContactSystem';
import { ElectricPowertrain } from '../src/vehicle/powertrain/ElectricPowertrain';
import { createNeutralVehicleInputState } from '../src/input/VehicleInputState';
import { AccelerationTest } from '../src/experimental/acceleration/AccelerationTest';
import { AccelerationRunDiagnostics } from '../src/experimental/acceleration/AccelerationRunDiagnostics';
const ground = new CityGround(data, { loadRadius: 0 });
// Screenshot wheel anchors are near (-825, 8, -1392), heading +X.
// Use the actual regional query, support-layer selection and collision adapter.
const runtimeGround = Object.assign(Object.create(ground) as CityGround, {
  spawnPose: { position: new Vector3(-925, 8.04, -1392), yawRadians: -Math.PI / 2 },
});
const rows = [];
for (const source of ['full-pedal', 'keyboard-ramp'] as const) {
  const config = createVehiclePhysicsConfig('porsche-taycan-4s');
  const car = new VehicleDynamics<ElectricPowertrain>(config, { x: -925, z: -1392, yaw: -Math.PI / 2,
    driveSelector: 'D', stateOfCharge: .83 }, new ElectricPowertrain(config));
  while (car.driveMode !== 'SPORT_PLUS') car.cycleDriveMode();
  const contacts = new VehicleContactSystem(runtimeGround, getVehicleDescriptor('porsche-taycan-4s').visualConfig.collisionDimensions);
  const test = new AccelerationTest(), diagnostics = new AccelerationRunDiagnostics();
  test.arm(car.getSnapshot(), 0);
  diagnostics.arm({ vehicleId: 'porsche-taycan-4s', vehicleVersion: 1, groundId: ground.metadata.id,
    groundVersion: ground.metadata.version, weather: 'CLEAR', wetness: 0 }, test.state);
  const input = createNeutralVehicleInputState();
  for (let i = 0; i < 1800; i++) {
    input.throttle = source === 'full-pedal' ? 1 : Math.min(1, (i + 1) / 120 * .88);
    const before = car.getSnapshot(), after = contacts.step(1 / 120, input, car);
    test.update(1 / 120, before, after, input.throttle, true, contacts.collision?.collided);
    diagnostics.update(1 / 120, test.state, before, after, input, input, contacts.wheelContacts,
      car.driverAssists.frontTorqueFactor, car.driverAssists.rearTorqueFactor);
    if (test.state.phase === 'COMPLETED' || test.state.phase === 'INTERRUPTED') break;
  }
  if (test.state.phase !== 'COMPLETED') throw new Error(`Runtime benchmark ${source}: ${test.state.phase}: ${test.state.notice}`);
  const result = { source, result: test.state.to100, summary: diagnostics.report!.summary,
    initial: diagnostics.report!.initial!.position, mode: diagnostics.report!.initial!.driveMode };
  rows.push(result);
  mkdirSync('artifacts/performance-tcs/runtime', { recursive: true });
  writeFileSync(`artifacts/performance-tcs/runtime/${source}.json`, diagnostics.serialize()!);
  console.log(JSON.stringify(result));
}
writeFileSync('artifacts/performance-tcs/runtime/summary.json', JSON.stringify(rows, null, 2));
ground.dispose();
