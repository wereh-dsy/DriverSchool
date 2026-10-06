import {
  DEFAULT_GAMEPAD_INPUT_CONFIG,
  type GamepadInputConfig,
} from './GamepadInput';
import { VehicleInputSystem } from './VehicleInputSystem';
import { applyTriggerCurve } from './inputMath';

export interface VehicleInputSystemSelfTestResult {
  passed: true;
  assertions: number;
}

interface MutableMockGamepad {
  axes: number[];
  buttons: GamepadButton[];
  connected: boolean;
  id: string;
  index: number;
  mapping: GamepadMappingType;
  timestamp: number;
}

/**
 * Framework-free deterministic checks for the browser Gamepad adapter and the
 * manual-clutch transition owned by VehicleInputSystem. Throws on failure.
 */
export function runVehicleInputSystemSelfTest(): VehicleInputSystemSelfTestResult {
  let assertions = 0;
  const assert = (condition: boolean, message: string): void => {
    assertions += 1;
    if (!condition) throw new Error(`VehicleInputSystem self-test failed: ${message}`);
  };
  const assertNear = (
    actual: number,
    expected: number,
    tolerance: number,
    message: string,
  ): void => {
    assert(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
  };

  let gamepad: MutableMockGamepad | null = createMockGamepad();
  const gamepads: Array<Gamepad | null> = [];
  const navigatorMock: Pick<Navigator, 'getGamepads'> = {
    getGamepads: () => {
      gamepads[0] = gamepad as Gamepad | null;
      return gamepads as Gamepad[];
    },
  };
  const input = new VehicleInputSystem({
    keyboard: false,
    gamepad: { target: null, navigator: navigatorMock },
  });
  const actualEngagement = 0.63;

  try {
    // First connected sample synchronises held buttons without creating edges.
    input.update(1 / 60, actualEngagement);
    let state = input.consumeState();
    assert(state.controlMode === 'normal', 'initial mode is normal');
    assert(state.source === 'gamepad', 'connected gamepad is reported');
    assert(input.gamepad?.getActiveGamepad() === gamepad as unknown as Gamepad,
      'haptics receives the current real selected browser object');

    const connectedPad = requireGamepad(gamepad);
    connectedPad.axes[0] = 0.05;
    setButton(connectedPad, 7, 0.64); // RT
    setButton(connectedPad, 6, 0.31); // LT
    advance(connectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    const config: Readonly<GamepadInputConfig> = DEFAULT_GAMEPAD_INPUT_CONFIG;
    assertNear(
      state.throttle,
      applyTriggerCurve(0.64, config.throttleDeadzone, config.throttleResponseExponent),
      1e-10,
      'RT remains analog and follows its independent mild response curve',
    );
    assertNear(
      state.brake,
      applyTriggerCurve(0.31, config.triggerDeadzone, config.triggerResponseExponent),
      1e-10,
      'LT remains analog and follows its response curve',
    );
    assert(state.throttle > 0 && state.throttle < 1, 'RT is not reduced to a button');
    assert(state.brake > 0 && state.brake < 1, 'LT is not reduced to a button');
    assert(state.steering === 0, 'left-stick noise inside deadzone is removed');
    assert(config.triggerResponseExponent === 1.55, 'LT retains its original response exponent');
    const rtDiagnostics = input.gamepad?.getThrottleDiagnostics();
    assert(rtDiagnostics?.rtRaw === 0.64, 'diagnostics expose the browser RT raw value');
    assertNear(
      rtDiagnostics?.rtNormalized ?? -1,
      (0.64 - 0.03) / 0.97,
      1e-10,
      'RT normalization rescales the deadzone before the curve',
    );
    assertNear(rtDiagnostics?.throttleCommand ?? -1, state.throttle, 1e-10,
      'diagnostics expose the command before engine response filtering');

    let previousThrottle = 0;
    for (const [raw, minimum, maximum] of [
      [0, 0, 0], [0.02, 0, 0], [0.03, 0, 0],
      [0.1, 0.05, 0.08], [0.2, 0.14, 0.19], [0.3, 0.23, 0.29],
      [0.4, 0.34, 0.39], [0.5, 0.44, 0.49], [0.6, 0.54, 0.59],
      [0.7, 0.64, 0.70], [0.8, 0.76, 0.81], [0.9, 0.87, 0.91], [1, 1, 1],
    ] as const) {
      setButton(connectedPad, 7, raw);
      advance(connectedPad);
      input.update(1 / 60, actualEngagement);
      state = input.consumeState();
      assert(state.throttle >= minimum && state.throttle <= maximum,
        `RT ${raw} reaches a usable near-linear throttle range`);
      assert(state.throttle >= previousThrottle && state.throttle - previousThrottle < 0.13,
        'RT increases continuously without a late-travel surge');
      assertNear(state.brake,
        applyTriggerCurve(0.31, config.triggerDeadzone, config.triggerResponseExponent), 1e-10,
        'RT tuning leaves the LT brake command unchanged');
      previousThrottle = state.throttle;
    }
    assert(rtDiagnostics?.rtRaw === 0.64, 'previous diagnostics are stable snapshots');
    setButton(connectedPad, 7, 0.64);

    connectedPad.axes[0] = 0.5;
    advance(connectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.steering > 0, 'steering survives outside the deadzone');
    assert(state.steering < 0.5, 'steering response curve gives finer mid-stick control');

    setButton(connectedPad, 0, 1); // A
    advance(connectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.handbrake === 1, 'A rising edge latches the handbrake on');

    advance(connectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.handbrake === 1, 'holding A does not toggle the handbrake repeatedly');

    setButton(connectedPad, 0, 0);
    setButton(connectedPad, 14, 1); // D-pad Left
    setButton(connectedPad, 12, 1); // D-pad Up
    setButton(connectedPad, 9, 1); // Start
    setButton(connectedPad, 2, 1); // X
    advance(connectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.leftIndicator, 'D-pad Left emits a left-indicator toggle request');
    assert(state.cycleLights, 'D-pad Up emits a light-cycle request');
    assert(state.engineStart, 'Start emits an engine-start request');
    assert(state.cruiseToggle, 'X emits a cruise-control toggle request');

    advance(connectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(
      !state.leftIndicator && !state.cycleLights && !state.engineStart &&
        !state.cruiseToggle,
      'held accessory buttons emit only one edge',
    );

    setButton(connectedPad, 14, 0);
    setButton(connectedPad, 12, 0);
    setButton(connectedPad, 9, 0);
    setButton(connectedPad, 2, 0);
    setButton(connectedPad, 15, 1); // D-pad Right
    setButton(connectedPad, 13, 1); // D-pad Down
    advance(connectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.rightIndicator, 'D-pad Right emits a right-indicator toggle request');
    assert(state.hazard, 'D-pad Down emits a hazard-light toggle request');

    setButton(connectedPad, 15, 0);
    setButton(connectedPad, 13, 0);

    setButton(connectedPad, 3, 1); // Y
    setButton(connectedPad, 1, 1); // B reserved
    setButton(connectedPad, 10, 1); // L3 hold
    setButton(connectedPad, 11, 1); // R3 horn
    advance(connectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.fogToggle === true, 'Y requests one front/rear-fog toggle');
    assert(state.directGear === undefined, 'Y/B do not request Neutral or Reverse');
    assert(state.highBeamFlash === true && state.hornPressed === true, 'L3/R3 provide independent held flash/horn');
    assert(state.controlMode === 'normal', 'R3 is no longer a manual-clutch shortcut');
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.fogToggle === false && state.highBeamFlash === true && state.hornPressed === true,
      'fog consumes its edge while flash/horn remain held');
    setButton(connectedPad, 3, 0);
    setButton(connectedPad, 1, 0);
    setButton(connectedPad, 10, 0);
    setButton(connectedPad, 11, 0);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.highBeamFlash === false && state.hornPressed === false, 'flash/horn immediately release');

    const pedalBeforeToggle = state.clutchPedal;
    input.setControlMode('manual-clutch', actualEngagement);
    state = input.peekState();
    assert(state.controlMode === 'manual-clutch', 'explicit/keyboard mode selection enters manual mode');
    assertNear(
      state.clutchPedal,
      1 - actualEngagement,
      1e-12,
      'manual controller takes over actual clutch engagement',
    );
    assertNear(
      state.clutchPedal,
      pedalBeforeToggle,
      1e-12,
      'normal-to-manual takeover is continuous',
    );

    advance(connectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.controlMode === 'manual-clutch', 'manual mode remains selected while gamepad driving');

    connectedPad.axes[2] = 0.9;
    connectedPad.axes[3] = 0.45;
    advance(connectedPad);
    const pedalBeforeRateInput = state.clutchPedal;
    input.update(0.1, actualEngagement);
    state = input.consumeState();
    assert(state.lookX === 0 && state.lookY === 0, 'manual mode disables right-stick look');
    assert(state.clutchPedal > pedalBeforeRateInput, 'right-stick down presses clutch by rate');
    assert(state.clutchPedal < 1, 'rate input does not map directly to pedal position');

    connectedPad.axes[3] = 0;
    advance(connectedPad);
    const heldPedal = state.clutchPedal;
    input.update(0.1, actualEngagement);
    state = input.consumeState();
    assertNear(state.clutchPedal, heldPedal, 1e-12, 'centred stick holds clutch position');
    assert(state.lookX === 0, 'manual mode ignores right-stick X even while deflected');

    connectedPad.connected = false;
    gamepad = null;
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(
      state.throttle === 0 && state.brake === 0 && state.steering === 0 &&
        state.handbrake === 1,
      'disconnect clears driving axes but preserves the handbrake latch',
    );
    assert(state.sourceMetadata.connected.length === 0, 'disconnect clears device metadata');
    assert(input.gamepad?.getActiveGamepad() === null, 'disconnect clears the haptics pad reference');
    assert(!state.highBeamFlash && !state.hornPressed, 'disconnect releases momentary accessory controls');
    const disconnectedDiagnostics = input.gamepad?.getThrottleDiagnostics();
    assert(disconnectedDiagnostics?.rtRaw === 0 && disconnectedDiagnostics.rtNormalized === 0 &&
      disconnectedDiagnostics.throttleCommand === 0, 'disconnect clears every RT diagnostics stage');

    const reconnectedPad = createMockGamepad();
    setButton(reconnectedPad, 11, 1);
    setButton(reconnectedPad, 0, 1);
    setButton(reconnectedPad, 2, 1);
    gamepad = reconnectedPad;
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.source === 'gamepad', 'reconnected gamepad is discovered by polling');
    assert(
      state.controlMode === 'manual-clutch',
      'button already held during reconnect does not synthesize an edge',
    );
    assert(state.handbrake === 1, 'held A during reconnect does not change the latch');
    assert(!state.cruiseToggle, 'held X during reconnect does not synthesize cruise toggle');

    advance(reconnectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.controlMode === 'manual-clutch', 'held R3 remains stable after reconnect');

    setButton(reconnectedPad, 2, 0);
    advance(reconnectedPad);
    input.update(1 / 60, actualEngagement);
    input.consumeState();
    setButton(reconnectedPad, 2, 1);
    advance(reconnectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.cruiseToggle, 'fresh X edge resumes after reconnect');

    setButton(reconnectedPad, 11, 0);
    advance(reconnectedPad);
    input.update(1 / 60, actualEngagement);
    input.consumeState();
    setButton(reconnectedPad, 11, 1);
    advance(reconnectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.controlMode === 'manual-clutch' && state.hornPressed === true,
      'fresh R3 after reconnect is horn, not a clutch toggle');
    input.setControlMode('normal', actualEngagement);

    setButton(reconnectedPad, 0, 0);
    advance(reconnectedPad);
    input.update(1 / 60, actualEngagement);
    input.consumeState();
    setButton(reconnectedPad, 0, 1);
    advance(reconnectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.handbrake === 0, 'a fresh A edge releases the latched handbrake');

    setButton(reconnectedPad, 7, 0.4);
    input.update(1 / 60, actualEngagement);
    assert((input.gamepad?.getThrottleDiagnostics().throttleCommand ?? 0) > 0,
      'RT diagnostics resume after reconnect');
    input.setEnabled(false);
    const disabledDiagnostics = input.gamepad?.getThrottleDiagnostics();
    assert(disabledDiagnostics?.rtRaw === 0 && disabledDiagnostics.rtNormalized === 0 &&
      disabledDiagnostics.throttleCommand === 0, 'input suspension clears RT diagnostics immediately');
    assert(input.peekState().throttle === 0, 'input suspension clears the throttle command');
    input.setEnabled(true);

    const keyboardTarget = new EventTarget() as unknown as Window;
    const storedPreferences = new Map<string, string>();
    const keyboardInput = new VehicleInputSystem({
      gamepad: false,
      keyboard: {
        target: keyboardTarget,
        storage: {
        getItem: (key) => storedPreferences.get(key) ?? null,
        setItem: (key, value) => { storedPreferences.set(key, value); },
        removeItem: (key) => { storedPreferences.delete(key); },
        },
      },
    });
    const keyboard = keyboardInput.keyboard;
    if (keyboard === null) throw new Error('Keyboard adapter was not created');
    try {
      dispatchKeyboardKey(keyboardTarget, 'keydown', 'KeyW');
      keyboardInput.update(0.5, 0);
      let keyboardState = keyboardInput.consumeState();
      assert(
        keyboardState.throttle > 0.4 && keyboardState.throttle < 0.5,
        'keyboard throttle rises progressively instead of jumping to full',
      );
      keyboardInput.update(0.7, 0);
      keyboardState = keyboardInput.consumeState();
      assertNear(keyboardState.throttle, 1, 1e-12, 'held keyboard throttle reaches full');

      dispatchKeyboardKey(keyboardTarget, 'keyup', 'KeyW');
      keyboardInput.update(0.2, 0);
      keyboardState = keyboardInput.consumeState();
      assert(
        keyboardState.throttle < 0.5,
        'keyboard throttle releases faster than it builds',
      );

      dispatchKeyboardKey(keyboardTarget, 'keydown', 'Space');
      keyboardInput.update(1 / 60, 0);
      keyboardState = keyboardInput.consumeState();
      assert(keyboardState.handbrake === 1, 'Space latches the handbrake on');
      keyboardInput.update(1 / 60, 0);
      keyboardState = keyboardInput.consumeState();
      assert(keyboardState.handbrake === 1, 'held Space leaves the latch unchanged');
      dispatchKeyboardKey(keyboardTarget, 'keyup', 'Space');
      keyboardInput.update(1 / 60, 0);
      keyboardState = keyboardInput.consumeState();
      assert(keyboardState.handbrake === 1, 'releasing Space does not release the handbrake');
      keyboardInput.setEnabled(false);
      assert(
        keyboardInput.peekState().handbrake === 1,
        'disabling input preserves the handbrake latch',
      );
      keyboardInput.setEnabled(true);
      keyboardInput.update(1 / 60, 0);
      keyboardState = keyboardInput.consumeState();
      assert(
        keyboardState.handbrake === 1,
        're-enabling input preserves the handbrake latch',
      );
      dispatchKeyboardKey(keyboardTarget, 'keydown', 'Space');
      keyboardInput.update(1 / 60, 0);
      keyboardState = keyboardInput.consumeState();
      assert(keyboardState.handbrake === 0, 'a second Space edge releases the handbrake');
      dispatchKeyboardKey(keyboardTarget, 'keyup', 'Space');

      dispatchKeyboardKey(keyboardTarget, 'keydown', 'KeyM');
      keyboardInput.update(1 / 60, actualEngagement);
      keyboardState = keyboardInput.consumeState();
      assert(keyboardState.controlMode === 'manual-clutch', 'keyboard M remains the manual-clutch toggle');
      assertNear(keyboardState.clutchPedal, 1 - actualEngagement, 1e-12, 'keyboard M takes over actual clutch smoothly');
      dispatchKeyboardKey(keyboardTarget, 'keyup', 'KeyM');
      dispatchKeyboardKey(keyboardTarget, 'keydown', 'KeyF');
      dispatchKeyboardKey(keyboardTarget, 'keydown', 'ShiftLeft');
      dispatchKeyboardKey(keyboardTarget, 'keydown', 'KeyO');
      keyboardInput.update(1 / 60, actualEngagement);
      keyboardState = keyboardInput.consumeState();
      assert(keyboardState.fogToggle === true && keyboardState.highBeamFlash === true && keyboardState.hornPressed === true,
        'keyboard has independent fog, held flash and horn bindings');
      keyboardInput.update(1 / 60, actualEngagement);
      keyboardState = keyboardInput.consumeState();
      assert(!keyboardState.fogToggle && keyboardState.highBeamFlash === true && keyboardState.hornPressed === true,
        'keyboard held fog does not repeat while flash/horn remain active');
      for (const code of ['KeyF', 'ShiftLeft', 'KeyO']) dispatchKeyboardKey(keyboardTarget, 'keyup', code);
      for (const [code, selector] of [
        ['KeyP', 'P'], ['BracketLeft', 'R'], ['Backslash', 'N'], ['BracketRight', 'D'],
      ] as const) {
        dispatchKeyboardKey(keyboardTarget, 'keydown', code);
        keyboardInput.update(1 / 60, actualEngagement);
        keyboardState = keyboardInput.consumeState();
        assert(keyboardState.driveSelector === selector && keyboardState.directGear === undefined,
          `keyboard ${code} sends independent AT selector ${selector}`);
        keyboardInput.update(1 / 60, actualEngagement);
        assert(keyboardInput.consumeState().driveSelector === undefined, 'held selector emits only one request');
        dispatchKeyboardKey(keyboardTarget, 'keyup', code);
      }
      for (const code of ['KeyJ', 'KeyK', 'KeyH', 'KeyL', 'KeyI']) {
        dispatchKeyboardKey(keyboardTarget, 'keydown', code);
      }
      keyboardInput.update(1 / 60, 0);
      keyboardState = keyboardInput.consumeState();
      assert(keyboardState.leftIndicator, 'J requests the left indicator');
      assert(keyboardState.rightIndicator, 'K requests the right indicator');
      assert(keyboardState.hazard, 'H requests hazard lights');
      assert(keyboardState.cycleLights, 'L requests a light cycle');
      assert(keyboardState.engineStart, 'I requests engine start');
      keyboardInput.update(1 / 60, 0);
      keyboardState = keyboardInput.consumeState();
      assert(
        !keyboardState.leftIndicator && !keyboardState.rightIndicator &&
          !keyboardState.hazard && !keyboardState.cycleLights &&
          !keyboardState.engineStart,
        'held keyboard accessory keys emit only one edge',
      );
      for (const code of ['KeyJ', 'KeyK', 'KeyH', 'KeyL', 'KeyI']) {
        dispatchKeyboardKey(keyboardTarget, 'keyup', code);
      }

      keyboard.setBinding('throttle', 'KeyL');
      const swapped = keyboard.getBindings();
      assert(
        swapped.throttle === 'KeyL' && swapped.cycleLights === 'KeyW',
        'rebinding can swap with the rebindable light key',
      );
      keyboard.setBinding('throttle', 'KeyC');
      assert(
        keyboard.getBindings().throttle === 'KeyL',
        'reserved game key cannot replace a driving binding',
      );
      assert(storedPreferences.size > 0, 'custom keyboard bindings are persisted');
    } finally {
      keyboardInput.dispose();
    }

    return { passed: true, assertions };
  } finally {
    input.dispose();
  }
}

function dispatchKeyboardKey(
  target: Window,
  type: 'keydown' | 'keyup',
  code: string,
): void {
  const event = new Event(type, { cancelable: true });
  Object.defineProperties(event, {
    code: { value: code },
    ctrlKey: { value: false },
    metaKey: { value: false },
    altKey: { value: false },
    repeat: { value: false },
  });
  target.dispatchEvent(event);
}

function createMockGamepad(): MutableMockGamepad {
  return {
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => createButton(0)),
    connected: true,
    id: 'Mock Standard Gamepad',
    index: 0,
    mapping: 'standard',
    timestamp: 1,
  };
}

function createButton(value: number): GamepadButton {
  return {
    pressed: value > 0.5,
    touched: value > 0,
    value,
  };
}

function setButton(gamepad: MutableMockGamepad, index: number, value: number): void {
  gamepad.buttons[index] = createButton(value);
}

function advance(gamepad: MutableMockGamepad): void {
  gamepad.timestamp += 1;
}

function requireGamepad(gamepad: MutableMockGamepad | null): MutableMockGamepad {
  if (gamepad === null) throw new Error('VehicleInputSystem self-test setup lost gamepad');
  return gamepad;
}
