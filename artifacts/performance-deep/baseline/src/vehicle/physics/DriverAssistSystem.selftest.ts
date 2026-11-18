import { createDefaultVehiclePhysicsConfig } from '../config';
import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { VehicleDynamics } from './VehicleDynamics';
import { DriverAssistSystem } from './DriverAssistSystem';

export function runDriverAssistSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, label: string) => { assertions++; if (!ok) throw new Error(`Driver assists: ${label}`); };
  const config = createDefaultVehiclePhysicsConfig();
  const controller = new DriverAssistSystem(config);
  const options = { absEnabled: true, ebdEnabled: true, tractionControlEnabled: true };
  controller.setOptions(options); controller.reset(true);
  const wheels = new VehicleDynamics(config).getSnapshot().wheels;
  assert(controller.getSnapshot().absWarning, 'brief ignition check');
  for (let i = 0; i < 150; i++) controller.updateTraction(1/120, wheels, 0, true, false);
  assert(!controller.getSnapshot().absWarning, 'normal lamp extinguishes');
  const slipWheels = { ...wheels, frontLeft: { ...wheels.frontLeft, longitudinalSpeed: 10, slipRatio: -.8 } };
  for (let i = 0; i < 30; i++) controller.updateBrakes(1/120, 10, 1, slipWheels, [4000, 4000, 1500, 1500]);
  assert(controller.pressures[0]! < .5 && controller.pressures[1] === 1, 'independent ABS release');
  assert(controller.frontBrakeBias > config.brakes.frontBrakeBias, 'EBD responds to axle capacity');
  controller.updateBrakes(1/120, .3, 1, slipWheels, [4000,4000,1500,1500]);
  assert(controller.pressures.every(p => p === 1), 'ABS low speed exit');
  const spinning = { ...wheels, frontLeft: { ...wheels.frontLeft, longitudinalSpeed: 3, slipRatio: .8 } };
  for (let i = 0; i < 60; i++) controller.updateTraction(1/120, spinning, 1, true, true);
  assert(controller.engineTorqueFactor < .4, 'TCS smoothly cuts crank torque');
  const reduced = controller.engineTorqueFactor;
  controller.updateTraction(1/120, wheels, 1, true, true);
  assert(controller.engineTorqueFactor > reduced && controller.engineTorqueFactor < reduced + .03, 'smooth TCS recovery');
  controller.setOptions({ ...options, absEnabled: false, tractionControlEnabled: false });
  controller.updateBrakes(1/120, 10, 1, slipWheels, [4000,4000,1500,1500]);
  controller.updateTraction(1/120, spinning, 1, true, true);
  assert(controller.pressures.every(p => p === 1) && controller.engineTorqueFactor === 1 && controller.getSnapshot().ebdEnabled,
    'independent switches do not bind EBD to ABS/TCS');
  assert(controller.getSnapshot().absWarning && controller.getSnapshot().tcsOff, 'disabled warnings');
  controller.setOptions({ ...options, ebdEnabled: false });
  controller.updateBrakes(1/120, 10, 1, slipWheels, [4000,4000,1500,1500]);
  assert(controller.frontBrakeBias === config.brakes.frontBrakeBias, 'fixed bias when EBD off');
  const active = new VehicleDynamics(config, { speed: 20, gear: 'N' });
  const inactive = new VehicleDynamics(config, { speed: 20, gear: 'N' });
  active.setDriverAssistOptions(options);
  const input = { ...createNeutralVehicleInputState(), brake: 1, handbrake: 1 };
  let a = active.getSnapshot(); let b = inactive.getSnapshot(); let activeSeen = false; let modulationSeen = false;
  for (let i = 0; i < 120; i++) {
    a = active.stepFixed(1/120, input, { surfaceGripMultiplier: .3 });
    b = inactive.stepFixed(1/120, input, { surfaceGripMultiplier: .3 });
    activeSeen ||= a.driverAssists.absActive;
    modulationSeen ||= a.wheels.frontLeft.appliedBrakeTorque < a.wheels.frontLeft.requestedBrakeTorque;
    assert(Object.values(a.wheels).every(w => Number.isFinite(w.angularVelocity) && Number.isFinite(w.longitudinalForce)), 'finite braking');
  }
  assert(activeSeen && modulationSeen, 'ABS connected to real service torque');
  assert(a.wheels.rearLeft.appliedHandbrakeTorque === b.wheels.rearLeft.appliedHandbrakeTorque, 'handbrake untouched');
  assert(b.wheels.frontLeft.angularVelocity === 0, 'disabled ABS allows wheel lock');
  return { assertions, absSeen: activeSeen };
}
