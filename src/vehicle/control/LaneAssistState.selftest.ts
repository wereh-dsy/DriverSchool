import { LaneAssistMode, LaneAssistStateController, LANE_ASSIST_LABELS } from './LaneAssistState';

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
  return { assertions };
}
