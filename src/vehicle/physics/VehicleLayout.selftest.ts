import { createDefaultVehiclePhysicsConfig, type VehiclePhysicsConfig } from '../config';
import { VEHICLE_CATALOG } from '../VehicleCatalog';
import { validateVehiclePlatformConfig } from '../config/validateVehiclePlatformConfig';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { SuspensionSystem } from './SuspensionSystem';
import { TyreGripModel } from './TyreGripModel';
import { VehicleDynamics } from './VehicleDynamics';

export function runVehicleLayoutSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error(`Vehicle layout: ${message}`); };
  const config = createDefaultVehiclePhysicsConfig();
  const axleLoads = (c: VehiclePhysicsConfig, acceleration = 0) => {
    const suspension = new SuspensionSystem(c);
    for (let i = 0; i < 240; i++) suspension.update(1 / 120, { longitudinalAcceleration: acceleration, lateralAcceleration: 0 });
    const w = suspension.getSnapshot().wheels;
    return { front: w.frontLeft.normalLoad + w.frontRight.normalLoad, rear: w.rearLeft.normalLoad + w.rearRight.normalLoad };
  };
  const front = axleLoads(config);
  const mr = { ...config, enginePlacement: 'MID' as const, frontWeightBias: .42,
    drivetrainType: 'RWD' as const, drivetrainLayout: 'RWD' as const, frontTorqueSplit: 0, rearTorqueSplit: 1 };
  const rear = axleLoads(mr);
  validateVehiclePlatformConfig(mr);
  assert(front.front > front.rear && rear.rear > rear.front, 'FWD/MR static distribution');
  assert(Math.abs(front.front / (config.mass * config.gravity) - .62) < 1e-6, 'front share controls suspension initialization');
  assert(Math.abs(rear.front / (config.mass * config.gravity) - .42) < 1e-6, 'same geometry, rearward CG reduces front load');
  assert(axleLoads(mr, 4).rear > rear.rear && axleLoads(mr, -4).front > rear.front, 'acceleration/reverse braking transfer directions');
  const accelerated = axleLoads(mr, 4);
  const transfer = config.mass * 4 * config.centerOfMassHeight / config.wheelBase;
  assert(Math.abs(accelerated.rear - rear.rear - transfer) < transfer * .02, 'transfer is m*a*h/L');
  const rr = { ...mr, enginePlacement: 'REAR' as const, frontWeightBias: .38, yawInertia: 2900 };
  validateVehiclePlatformConfig(rr);
  assert(axleLoads(rr).rear > axleLoads(rr).front && rr.yawInertia > mr.yawInertia, 'RR supports independent polar inertia');
  const invalid = { ...mr, frontWeightBias: .65 };
  let rejected = false;
  try { validateVehiclePlatformConfig(invalid); } catch { rejected = true; }
  assert(rejected, 'implausible MID calibration rejected');
  validateVehiclePlatformConfig({ ...invalid, layoutCalibrationNote: 'Deliberate front ballast fixture' });
  const yaw = (inertia: number, placement: VehiclePhysicsConfig['enginePlacement']) => {
    const c = { ...config, yawInertia: inertia, enginePlacement: placement, layoutCalibrationNote: 'Identical mass properties metadata isolation fixture' };
    c.driverAids = { ...config.driverAids, stabilityControlEnabled: false };
    const car = new VehicleDynamics(c, { speed: 15, gear: 'N' });
    car.steering.update(1, .12, 15);
    const state = car.stepFixed(1 / 120, { ...createNeutralVehicleInputState(), steering: .12 });
    return { rate: state.yawRate };
  };
  const low = yaw(1800, 'FRONT'), high = yaw(3600, 'FRONT');
  assert(Math.abs(low.rate) > Math.abs(high.rate) * 1.8, 'equivalent tyre moment responds through configured yaw inertia');
  const metadata = yaw(1800, 'MID');
  assert(Math.abs(metadata.rate - low.rate) < 1e-12, 'placement alone has no handling gain');
  const grip = new TyreGripModel(config.tires), reference = config.mass * config.gravity / 4;
  assert(grip.loadFactor(reference * 1.2, reference) < 1 &&
    reference * 1.2 * grip.loadFactor(reference * 1.2, reference) < reference * 1.2, 'load-sensitive force is sublinear');
  for (const car of VEHICLE_CATALOG) {
    validateVehiclePlatformConfig(car.physicsConfig);
    const loads = axleLoads(car.physicsConfig);
    assert(Math.abs(loads.front / (loads.front + loads.rear) - car.physicsConfig.frontWeightBias) < 1e-6, `${car.id}: suspension matches mass distribution`);
  }
  return { assertions, front, rear, accelerated };
}
