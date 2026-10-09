import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { createDefaultVehiclePhysicsConfig, createTest6ATVehiclePhysicsConfig, createTest7DCTVehiclePhysicsConfig,
  createCVTSedanPhysicsConfig } from '../config';
import { createAWDVehicleFixture } from '../fixtures/awdVehicleFixture';
import { ESCController } from './ESCController';
import { AWDTorqueDistribution } from './AWDTorqueDistribution';
import { DriverAssistSystem } from './DriverAssistSystem';
import { BrakeSystem } from './BrakeSystem';
import { VehicleDynamics } from './VehicleDynamics';

/** Deterministic connection checks; no driving-feel calibration or long simulations. */
export function runESCAWDSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string): void => {
    assertions++; if (!ok) throw new Error(`ESC/AWD: ${message}`);
  };
  const dt = 1 / 120, config = createDefaultVehiclePhysicsConfig();
  const wheels = new VehicleDynamics(config).getSnapshot().wheels;
  const limits = [4000, 4000, 3000, 3000];
  const esc = new ESCController(config);
  for (let i = 0; i < 120; i++) esc.update(dt, true, 20, .03, -20 * Math.tan(.03) / config.wheelBase, 0, wheels, limits, limits);
  assert(!esc.active, 'ordinary corner remains unbraked');
  esc.reset();
  for (let i = 0; i < 60; i++) esc.update(dt, true, 20, .03, -.9, -4, wheels, limits, limits);
  assert(esc.active && esc.mode === 'oversteer' && esc.brakeTorques[0]! > 0 && esc.brakeTorques.slice(1).every(t => t === 0),
    'right-turn oversteer brakes outside front for positive corrective yaw');
  const beforeRelease = esc.brakeTorques[0]!;
  esc.update(dt, true, 20, .03, esc.expectedYawRate, 0, wheels, limits, limits);
  assert(esc.brakeTorques[0]! > 0 && esc.brakeTorques[0]! < beforeRelease, 'release is gradual');
  for (let i = 0; i < 150; i++) esc.update(dt, true, 20, .03, -20 * Math.tan(.03) / config.wheelBase, 0, wheels, limits, limits);
  assert(!esc.active, 'stable motion exits intervention');
  for (const sign of [-1, 1]) {
    esc.reset();
    for (let i = 0; i < 90; i++) esc.update(dt, true, 20, sign * .1, -sign * .04, 0, wheels, limits, limits);
    const inside = sign > 0 ? 3 : 2;
    assert(esc.mode === 'understeer' && esc.brakeTorques[inside]! > 0 &&
      esc.brakeTorques.filter(t => t > 0).length === 1, 'understeer selects inside rear in both directions');
  }
  esc.update(dt, true, 2, .1, -1, -2, wheels, limits, limits);
  assert(esc.brakeTorques[2]! < 400, 'low-speed exit releases demand');
  esc.reset();
  const small = [10, 10, 10, 10];
  for (let i = 0; i < 60; i++) esc.update(dt, true, 20, .03, -.9, -4, wheels, small, small);
  assert(esc.brakeTorques.every(t => t <= 10 * config.wheelRadius * .45), 'ESC follows current surface/load limits');
  esc.update(dt, false, 20, .1, -1, -4, wheels, limits, limits);
  assert(esc.brakeTorques.every(t => t === 0), 'ESC disable clears wheel demands');

  const aids = new DriverAssistSystem(config);
  aids.setOptions({ absEnabled: true, ebdEnabled: true, tractionControlEnabled: true, stabilityControlEnabled: true });
  aids.reset(true);
  assert(aids.getSnapshot().skidLamp, 'shared skid lamp ignition check');
  for (let i = 0; i < 150; i++) aids.updateTraction(dt, wheels, 0, true, false);
  assert(!aids.getSnapshot().skidLamp, 'shared lamp off after ignition check');
  let lit = false, dark = false;
  for (let i = 0; i < 90; i++) {
    aids.updateTraction(dt, wheels, 0, true, false);
    aids.updateStability(dt, 20, .03, -.9, -4, wheels, limits, limits);
    if (aids.getSnapshot().escActive) { lit ||= aids.getSnapshot().skidLamp; dark ||= !aids.getSnapshot().skidLamp; }
  }
  assert(lit && dark, 'ESC intervention flashes existing skid lamp');
  const locked = { ...wheels, frontLeft: { ...wheels.frontLeft, longitudinalSpeed: 20, slipRatio: -.8 } };
  for (let i = 0; i < 30; i++) aids.updateBrakes(dt, 20, 0, locked, limits);
  assert(aids.pressures[0]! < .5 && aids.pressures[1] === 1, 'ABS modulates ESC with no brake pedal');
  const brakes = new BrakeSystem(config.brakes);
  brakes.setDriverAidState(aids.frontBrakeBias, aids.pressures, aids.esc.brakeTorques);
  const delivery = brakes.getWheelTorques('frontLeft');
  assert(delivery.requestedBrakeTorque > 0 && delivery.appliedBrakeTorque < delivery.requestedBrakeTorque,
    'ESC and ABS reach the same wheel actuator');
  brakes.brakeInput = .8;
  const merged = brakes.getWheelTorques('frontLeft');
  brakes.setDriverAidState(aids.frontBrakeBias, aids.pressures);
  assert(merged.requestedBrakeTorque === Math.max(delivery.requestedBrakeTorque, brakes.getWheelTorques('frontLeft').requestedBrakeTorque),
    'service and ESC hydraulic requests are not added twice');
  aids.setOptions({ absEnabled: true, ebdEnabled: true, tractionControlEnabled: true, stabilityControlEnabled: false });
  assert(aids.getSnapshot().escOff && !aids.getSnapshot().tcsOff && aids.getSnapshot().absEnabled && aids.getSnapshot().ebdEnabled,
    'ESC switch and warning are independent');

  const full = new AWDTorqueDistribution(createAWDVehicleFixture('full-time'));
  full.update(dt, 1, wheels, true);
  assert(Math.abs(full.rearTorqueSplit - .6) < 1e-9 && full.updateSpeeds(40, 80) === 64,
    'fixed AWD split and both-axle speed feedback');
  const demand = new AWDTorqueDistribution(createAWDVehicleFixture('on-demand'));
  demand.update(dt, .15, wheels, true);
  assert(Math.abs(demand.rearTorqueSplit - .1) < 1e-9, 'on-demand nominal cruise split');
  demand.update(dt, 1, wheels, true);
  assert(demand.rearTorqueSplit > .1 && demand.rearTorqueSplit < .11, 'acceleration smoothly increases rear share');
  const spin = { ...wheels, frontLeft: { ...wheels.frontLeft, longitudinalSpeed: 10, slipRatio: .8 } };
  for (let i = 0; i < 120; i++) demand.update(dt, .4, spin, true);
  assert(demand.rearTorqueSplit > .47 && demand.rearTorqueSplit <= .5, 'front slip approaches configured maximum');
  const reverseSpin = { ...wheels, frontLeft: { ...wheels.frontLeft, longitudinalSpeed: -10, slipRatio: -.8 } };
  demand.reset();
  for (let i = 0; i < 120; i++) demand.update(dt, .4, reverseSpin, true);
  assert(demand.rearTorqueSplit > .47, 'reverse slip also transfers torque rearward');

  for (const preset of [config, createTest6ATVehiclePhysicsConfig(), createTest7DCTVehiclePhysicsConfig(), createCVTSedanPhysicsConfig()]) {
    preset.drivetrainType = preset.drivetrainLayout = 'AWD';
    preset.frontTorqueSplit = .4; preset.rearTorqueSplit = .6; preset.awd = { mode: 'full-time' };
    const car = new VehicleDynamics(preset, { speed: 10, gear: 2, engineRPM: 2500, clutchEngagement: 1,
      controlMode: 'manual-clutch', driveSelector: 'D' });
    car.wheelRotation.constrainAngularVelocity('frontLeft', 20);
    car.wheelRotation.constrainAngularVelocity('frontRight', 40);
    car.wheelRotation.constrainAngularVelocity('rearLeft', 60);
    car.wheelRotation.constrainAngularVelocity('rearRight', 80);
    assert(car.getSnapshot().awd?.carrierAngularVelocity === 54 && car.getSnapshot().rearDifferential?.carrierAngularVelocity === 70,
      'all transmission adapters receive both independent axle carriers');
    car.reset({ speed: 10, gear: 2, engineRPM: 2500, clutchEngagement: 1, controlMode: 'manual-clutch', driveSelector: 'D' });
    let snapshot = car.getSnapshot();
    for (let i = 0; i < 60; i++) snapshot = car.stepFixed(dt, {
      ...createNeutralVehicleInputState(), throttle: .7, steering: .1, controlMode: 'manual-clutch', clutchPedal: 0,
    });
    const w = snapshot.wheels, total = snapshot.differential.inputTorque + snapshot.rearDifferential!.inputTorque;
    assert(total > 0 && Math.abs(w.frontLeft.driveTorque - total * .2) < 1e-8 &&
      Math.abs(w.rearLeft.driveTorque - total * .3) < 1e-8 && w.frontLeft.driveTorque === w.frontRight.driveTorque &&
      w.rearLeft.driveTorque === w.rearRight.driveTorque, 'MT/AT/DCT/CVT deliver conserving torque through two open differentials');
    assert(w.frontLeft.angularVelocity !== w.frontRight.angularVelocity, 'AWD leaves turning wheel speeds independent');
    assert(Object.values(w).every(wheel => Number.isFinite(wheel.angularVelocity) && wheel.gripUsage <= 1 + 1e-8) &&
      !snapshot.recoveredFromInvalidState, 'AWD keeps finite independent tyre states and combined grip bounds');
    car.reset({ speed: -3, gear: 'R', engineRPM: 1800, clutchEngagement: 1, controlMode: 'manual-clutch', driveSelector: 'R' });
    for (let i = 0; i < 45; i++) snapshot = car.stepFixed(dt, {
      ...createNeutralVehicleInputState(), throttle: .5, controlMode: 'manual-clutch', clutchPedal: 0,
    });
    assert(snapshot.wheels.frontLeft.driveTorque < 0 && snapshot.wheels.rearLeft.driveTorque < 0, 'all AWD transmissions propel in reverse');
    car.reset();
    assert(car.getSnapshot().rearDifferential!.inputTorque === 0, 'reset clears both carriers');
  }
  const onDemandCar = new VehicleDynamics(createAWDVehicleFixture('on-demand'), { speed: 10, driveSelector: 'D' });
  onDemandCar.setDriverAssistOptions({ absEnabled: true, ebdEnabled: true, tractionControlEnabled: false, stabilityControlEnabled: false });
  const rearOnlySpin = { ...wheels, rearLeft: { ...wheels.rearLeft, longitudinalSpeed: 10, slipRatio: .8 } };
  const awdAids = new DriverAssistSystem(createAWDVehicleFixture('full-time'));
  awdAids.setOptions({ absEnabled: true, ebdEnabled: true, tractionControlEnabled: true });
  awdAids.reset(true);
  for (let i = 0; i < 30; i++) awdAids.updateTraction(dt, rearOnlySpin, 1, true, true);
  assert(awdAids.engineTorqueFactor < .5, 'AWD TCS also monitors rear driven wheels');
  for (let i = 0; i < 90; i++) onDemandCar.stepFixed(dt, { ...createNeutralVehicleInputState(), throttle: 1 });
  assert(onDemandCar.getSnapshot().awd!.rearTorqueSplit > .25 && !onDemandCar.getSnapshot().driverAssists.tractionControlEnabled,
    'on-demand AWD operates independently of TCS');

  // An injected excess yaw must be opposed by real steered-wheel forces.
  const active = new VehicleDynamics(config, { speed: 20, gear: 'N' });
  const passive = new VehicleDynamics(config, { speed: 20, gear: 'N' });
  passive.setDriverAssistOptions({ absEnabled: true, ebdEnabled: true, tractionControlEnabled: true, stabilityControlEnabled: false });
  active.yawRate = passive.yawRate = -.8;
  active.lateralVelocity = passive.lateralVelocity = -4;
  let seen = false;
  for (let i = 0; i < 60; i++) {
    const a = active.stepFixed(dt, createNeutralVehicleInputState());
    passive.stepFixed(dt, createNeutralVehicleInputState());
    seen ||= a.wheels.frontLeft.appliedBrakeTorque > 5 && a.wheels.frontLeft.brakeForce < 0;
  }
  assert(seen && active.yawRate > passive.yawRate, 'single-wheel tyre braking really opposes excess yaw');
  return { assertions };
}
