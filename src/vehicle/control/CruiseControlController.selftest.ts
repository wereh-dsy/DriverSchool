import { createNeutralVehicleInputState } from '../../input/VehicleInputState';
import { CruiseControlController } from './CruiseControlController';

export interface CruiseControlControllerSelfTestResult {
  passed: true;
  assertions: number;
}

/** Framework-free deterministic checks for cruise policy and safety exits. */
export function runCruiseControlControllerSelfTest(): CruiseControlControllerSelfTestResult {
  let assertions = 0;
  const assert = (condition: boolean, message: string): void => {
    assertions += 1;
    if (!condition) throw new Error(`Cruise-control self-test failed: ${message}`);
  };

  const controller = new CruiseControlController();
  const base = createNeutralVehicleInputState('normal', 0);
  const context = {
    available: true,
    speedMetersPerSecond: 25,
    engineRunning: true,
    gear: 5,
  } as const;

  let output = controller.update(1 / 60, { ...base, cruiseToggle: true }, context);
  assert(controller.status.active, 'a valid toggle arms cruise');
  assert(controller.status.targetSpeedKmh === 90, 'activation captures current speed');
  assert(output.throttle > 0, 'active cruise requests holding throttle');

  output = controller.update(1 / 60, { ...base, cruiseToggle: false }, {
    ...context,
    speedMetersPerSecond: 23,
  });
  assert(output.throttle > 0.2, 'speed loss increases cruise throttle');
  assert(output.brake === 0, 'underspeed does not request brake');

  output = controller.update(1 / 60, { ...base, cruiseToggle: false }, {
    ...context,
    speedMetersPerSecond: 29,
  });
  assert(output.throttle === 0, 'large overspeed closes cruise throttle');
  assert(output.brake > 0 && output.brake <= 0.16, 'large overspeed requests only light brake');

  output = controller.update(1 / 60, { ...base, throttle: 0.8 }, context);
  assert(output.throttle === 0.8 && output.brake === 0, 'driver throttle overrides cruise output');
  assert(controller.status.active, 'driver throttle override does not cancel cruise');

  controller.update(1 / 60, { ...base, brake: 0.2 }, context);
  assert(!controller.status.active, 'driver brake cancels cruise immediately');
  assert(controller.status.lastEvent?.reason === 'driver-brake', 'brake cancellation is reported');

  controller.update(1 / 60, { ...base, cruiseToggle: true }, {
    ...context,
    available: false,
  });
  assert(!controller.status.active, 'unavailable vehicle cannot arm cruise');
  assert(controller.status.lastEvent?.kind === 'rejected', 'unavailable request is rejected');

  controller.update(1 / 60, { ...base, cruiseToggle: true }, {
    ...context,
    speedMetersPerSecond: 4,
  });
  assert(!controller.status.active, 'low-speed request cannot arm cruise');
  assert(controller.status.lastEvent?.reason === 'speed-too-low', 'low-speed rejection is reported');

  controller.update(1 / 60, { ...base, cruiseToggle: true }, context);
  assert(controller.status.active, 'cruise can be armed again after rejection');
  controller.update(1 / 60, { ...base, cruiseToggle: false }, {
    ...context,
    engineRunning: false,
  });
  assert(!controller.status.active, 'engine stop cancels cruise');

  controller.update(1 / 60, { ...base, cruiseToggle: true }, context);
  controller.update(1 / 60, { ...base, cruiseToggle: false, controlMode: 'manual-clutch' }, context);
  assert(!controller.status.active, 'manual clutch mode cancels cruise');

  return { passed: true, assertions };
}
