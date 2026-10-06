import { createTest6ATVehiclePhysicsConfig, createTest7DCTVehiclePhysicsConfig } from '../src/vehicle/config';
import { VehicleDynamics } from '../src/vehicle/physics/VehicleDynamics';
import { createNeutralVehicleInputState } from '../src/input/VehicleInputState';

const result = [];
for (const factory of [createTest6ATVehiclePhysicsConfig, createTest7DCTVehiclePhysicsConfig]) {
  const config = factory();
  for (const [label, speed, selector] of [
    ['rolling-N-to-D', 22, 'D'], ['rolling-backward-N-to-R', -8, 'R'],
  ] as const) {
    const car = new VehicleDynamics(config, { speed, driveSelector: 'N', engineRPM: config.engine.idleRPM });
    const accepted = car.requestDriveSelector(selector);
    const gearImmediately = car.gearbox.currentGear;
    const input = createNeutralVehicleInputState();
    let maximumRPM = 0; let maximumCoupledRPM = 0; let maximumDeceleration = 0;
    const gearChanges: { seconds: number; gear: string | number; rpm: number }[] = [];
    let previousGear = gearImmediately;
    for (let frame = 0; frame < 480; frame++) {
      const state = car.stepFixed(1 / 120, input);
      maximumRPM = Math.max(maximumRPM, state.rpm);
      maximumCoupledRPM = Math.max(maximumCoupledRPM, Math.abs(car.gearbox.getCoupledEngineRPM(state.speed, config.wheelRadius)));
      maximumDeceleration = Math.max(maximumDeceleration, Math.abs(state.acceleration));
      if (state.gear !== previousGear) { gearChanges.push({ seconds: frame / 120, gear: state.gear, rpm: state.rpm }); previousGear = state.gear; }
    }
    result.push({ type: config.transmission.type, label, accepted, gearImmediately,
      maximumRPM, maximumCoupledRPM, maximumDeceleration, endSpeed: car.speed, gearChanges });
  }
  const car = new VehicleDynamics(config, { driveSelector: 'D', speed: 0 });
  car.lateralVelocity = 9;
  result.push({ type: config.transmission.type, label: 'park-while-side-sliding', accepted: car.requestDriveSelector('P'),
    beforeLateralVelocity: car.lateralVelocity, afterLateralVelocity: car.stepFixed(1 / 120, createNeutralVehicleInputState()).lateralVelocity });
}
console.log(JSON.stringify(result, null, 2));

// Constant pedal long runs: report only gear reversals, so genuine repeated
// hunting is distinguishable from a normal upshift ladder while accelerating.
const longRuns = [];
for (const factory of [createTest6ATVehiclePhysicsConfig, createTest7DCTVehiclePhysicsConfig]) {
  for (const throttle of [0.08, 0.25, 0.45, 0.85]) {
    const config = factory();
    const car = new VehicleDynamics(config, { driveSelector: 'D' });
    const input = { ...createNeutralVehicleInputState(), throttle };
    let previousGear = 1; let previousDirection = 0;
    const changes: { seconds: number; gear: number; rpm: number; kmh: number }[] = [];
    let directionReversals = 0; let minRPM = Infinity; let maxRPM = 0;
    for (let frame = 0; frame < 180 * 120; frame++) {
      const state = car.stepFixed(1 / 120, input);
      minRPM = Math.min(minRPM, state.rpm); maxRPM = Math.max(maxRPM, state.rpm);
      if (typeof state.gear === 'number' && state.gear !== previousGear) {
        const direction = Math.sign(state.gear - previousGear);
        if (previousDirection !== 0 && direction !== previousDirection) directionReversals++;
        previousDirection = direction; previousGear = state.gear;
        changes.push({ seconds: frame / 120, gear: state.gear, rpm: state.rpm, kmh: state.speedKmh });
      }
    }
    longRuns.push({ type: config.transmission.type, throttle, directionReversals,
      minRPM, maxRPM, endKmh: car.getSnapshot().speedKmh, changes });
  }
}
console.log(JSON.stringify({ longRuns }, null, 2));
