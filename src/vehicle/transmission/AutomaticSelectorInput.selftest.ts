import { VehicleInputSystem } from '../../input/VehicleInputSystem';
import { createNeutralVehicleInputState, type DriveSelector } from '../../input/VehicleInputState';
import { createDefaultVehiclePhysicsConfig, createTest6ATVehiclePhysicsConfig,
  createTest7DCTVehiclePhysicsConfig } from '../config';
import { VehicleDynamics } from '../physics/VehicleDynamics';

/** Short check of the real standard-pad -> unified input -> PRND path. */
export function runAutomaticSelectorInputSelfTest(): { assertions: number } {
  let assertions = 0;
  const assert = (condition: boolean, message: string): void => {
    assertions++;
    if (!condition) throw new Error(`Automatic selector input: ${message}`);
  };
  const dt = 1 / 120;
  for (const config of [createTest6ATVehiclePhysicsConfig(), createTest7DCTVehiclePhysicsConfig()]) {
    const car = new VehicleDynamics(config);
    const buttons = Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false }));
    const pad = { id: 'Standard pad selector test', index: 0, mapping: 'standard',
      connected: true, timestamp: 0, axes: [0, 0, 0, 0], buttons } as unknown as Gamepad;
    const input = new VehicleInputSystem({ keyboard: false,
      gamepad: { target: null, navigator: { getGamepads: () => [pad] } } });
    const poll = (rb = false, lb = false, direct?: DriveSelector, brake = 1) => {
      buttons[5] = { value: Number(rb), pressed: rb, touched: rb };
      buttons[4] = { value: Number(lb), pressed: lb, touched: lb };
      buttons[6] = { value: brake, pressed: brake > 0.5, touched: brake > 0 };
      input.update(dt, car.getSnapshot().clutchEngagement);
      const command = { ...input.consumeState() };
      if (direct !== undefined) command.driveSelector = direct;
      return car.stepFixed(dt, command).transmission;
    };
    const press = (rb: boolean, lb: boolean) => { poll(); return poll(rb, lb); };
    poll(); // First neutral poll establishes connection/button baselines.
    assert(car.getSnapshot().transmission.selectedMode === 'P', 'automatic begins in P');
    const noBrake = poll(true, false, undefined, 0);
    assert(noBrake.selectedMode === 'P' && noBrake.selectorRejectedReason === 'brake-required',
      'RB without service brake rejects at rest');
    assert(poll(true, false, undefined, 1).selectedMode === 'P',
      'pressing brake after rejected held RB does not replay the request');
    for (const expected of ['R', 'N', 'D'] as const) {
      assert(press(true, false).selectedMode === expected, `RB advances to ${expected}`);
      for (let i = 0; i < 5; i++) assert(poll(true).selectedMode === expected, 'held RB never repeats');
    }
    assert(press(true, false).selectedMode === 'D', 'D does not wrap into P');
    for (const expected of ['N', 'R', 'P'] as const) {
      assert(press(false, true).selectedMode === expected, `LB moves back to ${expected}`);
      assert(poll(false, true).selectedMode === expected, 'held LB never repeats');
    }
    assert(press(false, true).selectedMode === 'P', 'P does not wrap into D');
    assert(press(true, true).selectedMode === 'P', 'opposing bumpers cancel');
    poll();
    assert(poll(true, false, 'N').selectedMode === 'N', 'explicit selector takes priority over bumper');
    // Keyboard/direct selector commands use the exact same unified brake gate.
    // Handbrake is not a substitute for the service pedal.
    for (const from of ['P', 'R', 'N', 'D'] as const) {
      const target = from === 'D' ? 'N' : 'D';
      car.reset({ driveSelector: from });
      const rejected = car.stepFixed(dt, { ...createNeutralVehicleInputState(),
        driveSelector: target, handbrake: 1 });
      assert(rejected.transmission.selectedMode === from && rejected.transmission.selectorRejectedReason === 'brake-required',
        `${from} direct selector cannot bypass brake with handbrake`);
      const accepted = car.stepFixed(dt, { ...createNeutralVehicleInputState(), driveSelector: target, brake: 0.1 });
      assert(accepted.transmission.selectedMode === target, `${from} direct selector accepts raw minimum brake immediately`);
    }
    car.reset({ driveSelector: 'N' });
    poll(false, false, undefined, 0);
    const noBrakeDown = poll(false, true, undefined, 0);
    assert(noBrakeDown.selectedMode === 'N' && noBrakeDown.selectorRejectedReason === 'brake-required',
      'LB without service brake also rejects');
    assert(poll(false, true, undefined, 1).selectedMode === 'N',
      'held rejected LB does not replay when brake is pressed');
    car.reset({ driveSelector: 'N', speed: 20 });
    const reverseRejected = press(false, true);
    assert(reverseRejected.selectedMode === 'N' && reverseRejected.selectorRejectedReason === 'direction-while-moving',
      'moving forward cannot bumper-select R');
    car.reset({ driveSelector: 'R', speed: 3 });
    const parkRejected = press(false, true);
    assert(parkRejected.selectedMode === 'R' && parkRejected.selectorRejectedReason === 'park-while-moving',
      'moving cannot bumper-select P');
    car.reset({ driveSelector: 'D', gear: 3, speed: 12 });
    assert(press(true, false).currentPhysicalGear !== 4, 'RB in D does not become a manual ratio request');
    input.dispose();
  }
  const manual = new VehicleDynamics(createDefaultVehiclePhysicsConfig());
  manual.stepFixed(dt, { ...createNeutralVehicleInputState(), shiftUp: true });
  assert(manual.getSnapshot().requestedGear === 1 && manual.getSnapshot().transmission.selectedMode === null,
    'manual shift-up retains its existing gear/clutch sequencing');
  return { assertions };
}
