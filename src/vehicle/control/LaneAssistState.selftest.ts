import { LaneAssistMode, LaneAssistStateController, LANE_ASSIST_LABELS } from './LaneAssistState';
import { LateralAssistController, createLateralAssistConfig, arbitrateLateralSteering } from './LateralAssistController';
import { createDefaultVehiclePhysicsConfig } from '../config/defaultVehiclePhysicsConfig';
import { createLaneObservation } from '../../world/navigation/LaneObservation';

export function runLaneAssistStateSelfTest(): { assertions: number } {
  let assertions = 0;
  const assert = (value: boolean, message: string) => {
    assertions++; if (!value) throw new Error(`Lane Assist state: ${message}`);
  };
  const controller = new LaneAssistStateController(), state = controller.state;
  assert(state.mode === LaneAssistMode.OFF && !state.notificationVisible, 'initial OFF has no popup');
  for (const [mode, label] of [[LaneAssistMode.WARNING_ONLY, 'LDW'], [LaneAssistMode.KEEP_ASSIST, 'LKA'],
    [LaneAssistMode.CENTERING_ASSIST, 'LCC'], [LaneAssistMode.OFF, 'OFF']] as const) {
    controller.cycleMode();
    assert(state.mode === mode && LANE_ASSIST_LABELS[state.mode] === label && state.notificationVisible, `cycle ${label}`);
    const version = state.version;
    controller.update(1.5);
    assert(state.notificationVisible && state.version === version, 'popup remains for 1.5 seconds without per-tick versions');
    controller.update(.11);
    assert(!state.notificationVisible && state.version > version, 'expiry requests a redraw after 1.6 seconds');
  }
  controller.setMode(LaneAssistMode.CENTERING_ASSIST);
  controller.update(1); controller.setMode(LaneAssistMode.WARNING_ONLY); controller.update(1);
  assert(state.notificationVisible && state.mode === LaneAssistMode.WARNING_ONLY, 'another entry point refreshes the same state and popup');
  controller.update(Number.NaN);
  assert(state.notificationVisible, 'invalid dt cannot expire notification');
  controller.setMode('invalid' as LaneAssistMode);
  assert(state.mode === LaneAssistMode.WARNING_ONLY, 'invalid requested mode is ignored');
  controller.reset();
  assert(state.mode === LaneAssistMode.OFF && !state.notificationVisible, 'vehicle reset clears selection and popup');
  const vehicle = createDefaultVehiclePhysicsConfig(), lateral = new LateralAssistController();
  lateral.configure(createLateralAssistConfig(), vehicle.steering, vehicle.wheelBase);
  const lane = { ...createLaneObservation(), valid: true, laneId: 'lane', laneWidth: 3.5, confidence: 1,
    distanceToLeftBoundary: 2.7, distanceToRightBoundary: .8, lateralOffset: .95,
    headingError: .06, lookAheadLateralOffset: 2.8, lookAheadDistance: 32,
    leftBoundaryType: 'dashed' as const, rightBoundaryType: 'dashed' as const };
  const context = { speed: 30, lateralVelocity: 0, yawRate: 0, driverSteering: 0,
    operational: true, forwardGear: true, suspended: false, leftSignal: false, rightSignal: false };
  const run = () => { controller.applyTo(lateral); for (let i = 0; i < 240; i++) lateral.update(1/120, lane, context); };
  controller.setMode(LaneAssistMode.KEEP_ASSIST); run();
  assert(arbitrateLateralSteering(0, lateral.output) < -.005, 'selected LKA actually protects departure');
  controller.setMode(LaneAssistMode.OFF); controller.applyTo(lateral);
  assert(arbitrateLateralSteering(0, lateral.output) === 0 && !lateral.lccRequested, 'OFF immediately clears steering and request, including residual correction');
  controller.setMode(LaneAssistMode.WARNING_ONLY); run();
  assert(arbitrateLateralSteering(0, lateral.output) === 0 && !lateral.lccRequested, 'LDW cannot steer');
  controller.toggleCentering(); controller.applyTo(lateral);
  assert(state.mode === LaneAssistMode.CENTERING_ASSIST && lateral.lccRequested, 'G/settings SET shares selected LCC request');
  controller.cancelCentering(); controller.applyTo(lateral);
  assert(state.mode === LaneAssistMode.KEEP_ASSIST && !lateral.lccRequested, 'menu/CANCEL drops request and returns to permitted LKA');
  controller.setAvailability(true, false, false); run();
  assert(state.mode === LaneAssistMode.OFF && arbitrateLateralSteering(0, lateral.output) === 0, 'F3 disabling support cannot leave a steering mode active');
  controller.cycleMode(); assert(state.mode === LaneAssistMode.WARNING_ONLY, 'warning remains available when steering preferences are disabled');
  controller.cycleMode(); assert(state.mode === LaneAssistMode.OFF, 'Y skips disabled steering modes');
  controller.toggleCentering(); assert(state.mode === LaneAssistMode.OFF, 'disabled LCC SET cannot change mode');
  controller.setAvailability(false, false, false); controller.cycleMode();
  assert(state.mode === LaneAssistMode.OFF, 'unsupported vehicle stays OFF');
  controller.setAvailability(true, true, true); controller.toggleCentering(); controller.reset(); run();
  assert(!lateral.lccRequested && arbitrateLateralSteering(0, lateral.output) === 0, 'reset/ignition OFF cannot re-request centering');
  return { assertions };
}
