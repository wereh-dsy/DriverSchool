import { createDefaultVehiclePhysicsConfig } from '../config';
import { SURFACE_MATERIALS } from '../../world/SurfaceMaterial';
import { wheelLocalPosition } from '../VehicleDimensions';
import { WHEEL_IDS, type WheelContactSet } from './WheelContact';
import { SuspensionSystem } from './SuspensionSystem';

/** Small mechanical checks, not final vehicle calibration. */
export function runSuspensionMechanicsSelfTest() {
  const config = createDefaultVehiclePhysicsConfig();
  let assertions = 0;
  const assert = (ok: boolean, message: string) => {
    assertions++;
    if (!ok) throw new Error(`Suspension mechanics: ${message}`);
  };
  const bar = new SuspensionSystem(config);
  const noBarConfig = createDefaultVehiclePhysicsConfig();
  noBarConfig.suspension.antiRollStiffnessFront = 0;
  noBarConfig.suspension.antiRollStiffnessRear = 0;
  const noBar = new SuspensionSystem(noBarConfig);
  for (let i = 0; i < 240; i++) {
    bar.update(1 / 120, { longitudinalAcceleration: 0, lateralAcceleration: 4 });
    noBar.update(1 / 120, { longitudinalAcceleration: 0, lateralAcceleration: 4 });
  }
  const coupled = bar.getSnapshot();
  assert(Math.abs(coupled.chassis.roll) < Math.abs(noBar.getSnapshot().chassis.roll),
    'mechanical coupling reduces actual spring-driven roll');
  assert(coupled.wheels.frontLeft.antiRollForce > 0 && coupled.wheels.rearLeft.antiRollForce > 0,
    'compressed outside springs generate restoring bar support');
  assert(Math.abs(coupled.wheels.frontLeft.antiRollForce + coupled.wheels.frontRight.antiRollForce) < 1e-10 &&
    Math.abs(coupled.wheels.rearLeft.antiRollForce + coupled.wheels.rearRight.antiRollForce) < 1e-10,
    'each axle bar creates equal and opposite forces, not new supported weight');
  assert(Math.abs(Object.values(coupled.wheels).reduce((sum, w) => sum + w.normalLoad, 0) -
    config.mass * config.gravity) < 1e-7, 'coupled corner loads conserve supported weight');
  const contacts = Object.fromEntries(WHEEL_IDS.map(id => {
    const p = wheelLocalPosition(config, id);
    return [id, { ...SURFACE_MATERIALS.asphalt, id, x: p.x, z: p.z,
      height: id === 'frontLeft' ? .3 : 0, normal: { x: 0, y: 1, z: 0 } }];
  })) as unknown as WheelContactSet;
  const bumped = new SuspensionSystem(config);
  let maximumStopForce = 0;
  for (let i = 0; i < 120; i++) {
    const snapshot = bumped.update(1 / 120, { contacts, longitudinalAcceleration: -10, lateralAcceleration: 8 });
    maximumStopForce = Math.max(maximumStopForce, snapshot.wheels.frontLeft.bumpStopForce);
    assert(Object.values(snapshot.wheels).every(w => Object.values(w).every(Number.isFinite)),
      'stop/bar corner states remain finite');
  }
  assert(maximumStopForce > 0, 'near-end compression adds progressive support');
  const atRest = new SuspensionSystem(config).getSnapshot();
  assert(Object.values(atRest.wheels).every(w => w.bumpStopForce === 0 && w.antiRollForce === 0),
    'flat static rest does not activate a bar or bump stop');
  return { assertions, maximumStopForce };
}
