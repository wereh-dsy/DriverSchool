// src/input/inputMath.ts
function clamp(value, minimum, maximum) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(maximum, Math.max(minimum, value));
}
function clamp01(value) {
  return clamp(value, 0, 1);
}
function applyAxisDeadzone(value, deadzone, exponent = 1) {
  const axis = clamp(value, -1, 1);
  const safeDeadzone = clamp(deadzone, 0, 0.95);
  const magnitude = Math.abs(axis);
  if (magnitude <= safeDeadzone) return 0;
  const normalized = (magnitude - safeDeadzone) / (1 - safeDeadzone);
  const curved = Math.pow(normalized, Math.max(0.01, exponent));
  return Math.sign(axis) * curved;
}
function applyRadialDeadzone(x, y, deadzone, exponent = 1) {
  const safeX = clamp(x, -1, 1);
  const safeY = clamp(y, -1, 1);
  const magnitude = Math.hypot(safeX, safeY);
  const safeDeadzone = clamp(deadzone, 0, 0.95);
  if (magnitude <= safeDeadzone || magnitude <= Number.EPSILON) {
    return { x: 0, y: 0 };
  }
  const normalizedMagnitude = clamp01(
    (Math.min(1, magnitude) - safeDeadzone) / (1 - safeDeadzone)
  );
  const curvedMagnitude = Math.pow(normalizedMagnitude, Math.max(0.01, exponent));
  return {
    x: safeX / magnitude * curvedMagnitude,
    y: safeY / magnitude * curvedMagnitude
  };
}
function normalizeTrigger(value, deadzone) {
  const trigger = clamp01(value);
  const safeDeadzone = clamp(deadzone, 0, 0.95);
  if (trigger <= safeDeadzone) return 0;
  return (trigger - safeDeadzone) / (1 - safeDeadzone);
}
function applyTriggerCurve(value, deadzone, exponent = 1) {
  const normalized = normalizeTrigger(value, deadzone);
  if (normalized === 0) return 0;
  return Math.pow(
    normalized,
    Math.max(0.01, exponent)
  );
}

// src/input/GamepadInput.ts
var DEFAULT_GAMEPAD_INPUT_CONFIG = {
  leftStickDeadzone: 0.13,
  leftStickResponseExponent: 1.85,
  rightStickDeadzone: 0.14,
  rightStickResponseExponent: 1.45,
  throttleDeadzone: 0.03,
  throttleResponseExponent: 1.1,
  triggerDeadzone: 0.03,
  triggerResponseExponent: 1.55
};
var ZERO_THROTTLE_DIAGNOSTICS = {
  rtRaw: 0,
  rtNormalized: 0,
  throttleCommand: 0
};
var ZERO_CONTINUOUS = {
  throttle: 0,
  brake: 0,
  steering: 0,
  handbrake: 0,
  lookX: 0,
  lookY: 0,
  clutchPedalRate: 0,
  highBeamFlash: false,
  hornPressed: false,
  deviceActive: false
};
var GamepadInput = class {
  id;
  priority;
  target;
  gamepadNavigator;
  config;
  enabled = true;
  selectedIndex = null;
  activeGamepad = null;
  connectionKey = null;
  previousButtons = [];
  lastDeviceLabel = "Standard Gamepad";
  lastMapping = "";
  lastGamepadTimestamp = -1;
  lastInputAt = null;
  continuous = { ...ZERO_CONTINUOUS };
  throttleDiagnostics = {
    ...ZERO_THROTTLE_DIAGNOSTICS
  };
  context = {
    deltaTime: 0,
    controlMode: "normal",
    manualClutchPedal: 1,
    actualClutchEngagement: 0
  };
  pendingShiftUp = false;
  pendingShiftDown = false;
  pendingHandbrakeToggle = false;
  pendingLeftIndicator = false;
  pendingRightIndicator = false;
  pendingHazard = false;
  pendingCycleLights = false;
  pendingEngineStart = false;
  pendingCruiseToggle = false;
  pendingFogToggle = false;
  constructor(options = {}) {
    this.id = options.id ?? "gamepad";
    this.priority = options.priority ?? 20;
    this.config = { ...DEFAULT_GAMEPAD_INPUT_CONFIG, ...options.config };
    this.target = options.target === void 0 ? typeof window === "undefined" ? null : window : options.target;
    this.gamepadNavigator = options.navigator === void 0 ? typeof navigator === "undefined" ? null : navigator : options.navigator;
    this.target?.addEventListener("gamepadconnected", this.onGamepadConnected);
    this.target?.addEventListener("gamepaddisconnected", this.onGamepadDisconnected);
  }
  get sourceInfo() {
    const connected = this.enabled && this.selectedIndex !== null;
    const info = {
      id: this.id,
      kind: "gamepad",
      label: this.lastDeviceLabel,
      connected
    };
    if (connected && this.selectedIndex !== null) info.gamepadIndex = this.selectedIndex;
    if (connected) info.mapping = this.lastMapping;
    return info;
  }
  /** Latest real browser object for the centralized capability-detecting haptics adapter. */
  getActiveGamepad() {
    return this.enabled && this.activeGamepad?.connected === true ? this.activeGamepad : null;
  }
  /** Read-only RT stages for F2 tuning; a snapshot cannot alter input state. */
  getThrottleDiagnostics() {
    return { ...this.throttleDiagnostics };
  }
  update(context) {
    this.context = context;
    const gamepad = this.pollGamepad();
    if (gamepad === null) {
      this.continuous = { ...ZERO_CONTINUOUS };
      return;
    }
    const pressed = this.readPressedButtons(gamepad);
    const nextConnectionKey = `${gamepad.index}:${gamepad.id}:${gamepad.mapping}`;
    const firstSampleAfterConnection = nextConnectionKey !== this.connectionKey;
    if (firstSampleAfterConnection) {
      this.connectionKey = nextConnectionKey;
      this.previousButtons = pressed;
      this.clearPendingEdges();
    } else if (this.enabled) {
      this.pendingShiftUp ||= this.isRisingEdge(pressed, 5);
      this.pendingShiftDown ||= this.isRisingEdge(pressed, 4);
      this.pendingFogToggle ||= this.isRisingEdge(pressed, 3);
      this.pendingHandbrakeToggle ||= this.isRisingEdge(pressed, 0);
      this.pendingLeftIndicator ||= this.isRisingEdge(pressed, 14);
      this.pendingRightIndicator ||= this.isRisingEdge(pressed, 15);
      this.pendingHazard ||= this.isRisingEdge(pressed, 13);
      this.pendingCycleLights ||= this.isRisingEdge(pressed, 12);
      this.pendingEngineStart ||= this.isRisingEdge(pressed, 9);
      this.pendingCruiseToggle ||= this.isRisingEdge(pressed, 2);
      this.previousButtons = pressed;
    } else {
      this.previousButtons = pressed;
      this.clearPendingEdges();
    }
    if (!this.enabled) {
      this.continuous = { ...ZERO_CONTINUOUS };
      return;
    }
    const steering = applyAxisDeadzone(
      gamepad.axes[0] ?? 0,
      this.config.leftStickDeadzone,
      this.config.leftStickResponseExponent
    );
    const rtRaw = this.getRawButtonValue(gamepad, 7);
    const rtNormalized = normalizeTrigger(rtRaw, this.config.throttleDeadzone);
    const throttle = Math.pow(rtNormalized, Math.max(0.01, this.config.throttleResponseExponent));
    this.throttleDiagnostics = { rtRaw, rtNormalized, throttleCommand: throttle };
    const brake = applyTriggerCurve(
      this.getButtonValue(gamepad, 6),
      this.config.triggerDeadzone,
      this.config.triggerResponseExponent
    );
    const handbrake = this.getButtonValue(gamepad, 0);
    const rawRightX = gamepad.axes[2] ?? 0;
    const rawRightY = gamepad.axes[3] ?? 0;
    const look = context.controlMode === "normal" ? applyRadialDeadzone(
      rawRightX,
      rawRightY,
      this.config.rightStickDeadzone,
      this.config.rightStickResponseExponent
    ) : { x: 0, y: 0 };
    const clutchPedalRate = context.controlMode === "manual-clutch" ? clamp(rawRightY, -1, 1) : 0;
    const highBeamFlash = pressed[10] === true;
    const hornPressed = pressed[11] === true;
    const hasHeldControlButton = [0, 2, 3, 4, 5, 9, 10, 11, 12, 13, 14, 15].some((buttonIndex) => pressed[buttonIndex] === true);
    const deviceActive = Math.abs(steering) > 0 || throttle > 0 || brake > 0 || handbrake > 0 || Math.abs(look.x) > 0 || Math.abs(look.y) > 0 || Math.abs(clutchPedalRate) > this.config.rightStickDeadzone || hasHeldControlButton;
    this.continuous = {
      throttle,
      brake,
      steering,
      handbrake,
      lookX: look.x,
      lookY: look.y,
      clutchPedalRate,
      highBeamFlash,
      hornPressed,
      deviceActive
    };
    if (deviceActive && gamepad.timestamp !== this.lastGamepadTimestamp) {
      this.lastGamepadTimestamp = gamepad.timestamp;
      this.lastInputAt = this.now();
    }
  }
  consumeState() {
    const info = this.sourceInfo;
    const active = this.continuous.deviceActive || this.hasPendingEdge();
    const state = {
      throttle: this.continuous.throttle,
      brake: this.continuous.brake,
      steering: this.continuous.steering,
      handbrake: this.continuous.handbrake,
      clutchPedal: this.context.manualClutchPedal,
      lookX: this.continuous.lookX,
      lookY: this.continuous.lookY,
      shiftUp: this.pendingShiftUp,
      shiftDown: this.pendingShiftDown,
      leftIndicator: this.pendingLeftIndicator,
      rightIndicator: this.pendingRightIndicator,
      hazard: this.pendingHazard,
      cycleLights: this.pendingCycleLights,
      engineStart: this.pendingEngineStart,
      cruiseToggle: this.pendingCruiseToggle,
      fogToggle: this.pendingFogToggle,
      highBeamFlash: this.continuous.highBeamFlash,
      hornPressed: this.continuous.hornPressed,
      controlMode: this.context.controlMode,
      source: "gamepad",
      sourceMetadata: {
        primary: info.connected ? info : null,
        active: active && info.connected ? [info] : [],
        connected: info.connected ? [info] : [],
        lastInputAt: this.lastInputAt
      },
      deviceActive: active,
      toggleControlMode: false,
      toggleHandbrake: this.pendingHandbrakeToggle,
      clutchInputKind: this.context.controlMode === "manual-clutch" ? "rate" : "none",
      clutchPedalRate: this.continuous.clutchPedalRate
    };
    this.clearPendingEdges();
    return state;
  }
  setEnabled(enabled) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) this.activeGamepad = null;
    this.continuous = { ...ZERO_CONTINUOUS };
    this.throttleDiagnostics = { ...ZERO_THROTTLE_DIAGNOSTICS };
    this.clearPendingEdges();
    this.connectionKey = null;
  }
  dispose() {
    this.target?.removeEventListener("gamepadconnected", this.onGamepadConnected);
    this.target?.removeEventListener("gamepaddisconnected", this.onGamepadDisconnected);
    this.clearConnection();
  }
  pollGamepad() {
    if (this.gamepadNavigator === null) {
      this.clearConnection();
      return null;
    }
    let gamepads;
    try {
      gamepads = Array.from(this.gamepadNavigator.getGamepads());
    } catch {
      this.clearConnection();
      return null;
    }
    let selected = this.selectedIndex === null ? null : gamepads[this.selectedIndex] ?? null;
    if (selected === null || !selected.connected) {
      selected = gamepads.find(
        (candidate) => candidate !== null && candidate.connected && candidate.mapping === "standard"
      ) ?? gamepads.find(
        (candidate) => candidate !== null && candidate.connected
      ) ?? null;
    }
    if (selected === null) {
      this.clearConnection();
      return null;
    }
    if (this.selectedIndex !== selected.index) this.connectionKey = null;
    this.selectedIndex = selected.index;
    this.lastDeviceLabel = selected.id || "Standard Gamepad";
    this.lastMapping = selected.mapping;
    this.activeGamepad = selected;
    return selected;
  }
  readPressedButtons(gamepad) {
    const buttonCount = Math.max(16, gamepad.buttons.length);
    const pressed = new Array(buttonCount).fill(false);
    for (let index = 0; index < buttonCount; index += 1) {
      const button = gamepad.buttons[index];
      pressed[index] = button?.pressed === true || (button?.value ?? 0) > 0.5;
    }
    return pressed;
  }
  isRisingEdge(current, index) {
    return current[index] === true && this.previousButtons[index] !== true;
  }
  getButtonValue(gamepad, index) {
    return clamp01(this.getRawButtonValue(gamepad, index));
  }
  getRawButtonValue(gamepad, index) {
    const button = gamepad.buttons[index];
    if (button === void 0) return 0;
    return Number.isFinite(button.value) ? button.value : Number(button.pressed);
  }
  onGamepadConnected = (event) => {
    if (this.selectedIndex !== null) return;
    this.selectedIndex = event.gamepad.index;
    this.lastDeviceLabel = event.gamepad.id || "Standard Gamepad";
    this.lastMapping = event.gamepad.mapping;
    this.connectionKey = null;
  };
  onGamepadDisconnected = (event) => {
    if (event.gamepad.index !== this.selectedIndex) return;
    this.clearConnection();
  };
  clearConnection() {
    this.selectedIndex = null;
    this.activeGamepad = null;
    this.connectionKey = null;
    this.previousButtons = [];
    this.lastGamepadTimestamp = -1;
    this.continuous = { ...ZERO_CONTINUOUS };
    this.throttleDiagnostics = { ...ZERO_THROTTLE_DIAGNOSTICS };
    this.clearPendingEdges();
  }
  clearPendingEdges() {
    this.pendingShiftUp = false;
    this.pendingShiftDown = false;
    this.pendingHandbrakeToggle = false;
    this.pendingLeftIndicator = false;
    this.pendingRightIndicator = false;
    this.pendingHazard = false;
    this.pendingCycleLights = false;
    this.pendingEngineStart = false;
    this.pendingCruiseToggle = false;
    this.pendingFogToggle = false;
  }
  hasPendingEdge() {
    return this.pendingShiftUp || this.pendingShiftDown || this.pendingHandbrakeToggle || this.pendingLeftIndicator || this.pendingRightIndicator || this.pendingHazard || this.pendingCycleLights || this.pendingEngineStart || this.pendingCruiseToggle || this.pendingFogToggle;
  }
  now() {
    return typeof performance === "undefined" ? Date.now() : performance.now();
  }
};

// src/input/KeyboardBindings.ts
var KEYBOARD_BINDING_DEFINITIONS = [
  { action: "throttle", label: "\u6CB9\u95E8", group: "\u9A7E\u9A76" },
  { action: "brake", label: "\u5236\u52A8", group: "\u9A7E\u9A76" },
  { action: "steerLeft", label: "\u5DE6\u8F6C", group: "\u9A7E\u9A76" },
  { action: "steerRight", label: "\u53F3\u8F6C", group: "\u9A7E\u9A76" },
  { action: "handbrake", label: "\u624B\u5239", group: "\u9A7E\u9A76" },
  { action: "shiftUp", label: "\u5347\u6321", group: "\u53D8\u901F\u7BB1" },
  { action: "shiftDown", label: "\u964D\u6321", group: "\u53D8\u901F\u7BB1" },
  { action: "reverse", label: "\u5012\u6321", group: "\u53D8\u901F\u7BB1" },
  { action: "neutral", label: "\u7A7A\u6321", group: "\u53D8\u901F\u7BB1" },
  { action: "gear1", label: "\u4E00\u6321", group: "\u53D8\u901F\u7BB1" },
  { action: "gear2", label: "\u4E8C\u6321", group: "\u53D8\u901F\u7BB1" },
  { action: "gear3", label: "\u4E09\u6321", group: "\u53D8\u901F\u7BB1" },
  { action: "gear4", label: "\u56DB\u6321", group: "\u53D8\u901F\u7BB1" },
  { action: "gear5", label: "\u4E94\u6321", group: "\u53D8\u901F\u7BB1" },
  { action: "gear6", label: "\u516D\u6321", group: "\u53D8\u901F\u7BB1" },
  { action: "gear7", label: "\u4E03\u6321", group: "\u53D8\u901F\u7BB1" },
  { action: "toggleClutchMode", label: "\u79BB\u5408\u6A21\u5F0F", group: "\u79BB\u5408\u5668" },
  { action: "clutchRelease", label: "\u677E\u79BB\u5408", group: "\u79BB\u5408\u5668" },
  { action: "clutchPress", label: "\u8E29\u79BB\u5408", group: "\u79BB\u5408\u5668" },
  { action: "leftIndicator", label: "\u5DE6\u8F6C\u5411\u706F", group: "\u8F66\u8F86\u9644\u4EF6" },
  { action: "rightIndicator", label: "\u53F3\u8F6C\u5411\u706F", group: "\u8F66\u8F86\u9644\u4EF6" },
  { action: "hazard", label: "\u53CC\u95EA", group: "\u8F66\u8F86\u9644\u4EF6" },
  { action: "cycleLights", label: "\u5207\u6362\u706F\u5149", group: "\u8F66\u8F86\u9644\u4EF6" },
  { action: "fogToggle", label: "\u524D\u540E\u96FE\u706F", group: "\u8F66\u8F86\u9644\u4EF6" },
  { action: "highBeamFlash", label: "\u95EA\u8FDC\u5149\uFF08\u6309\u4F4F\uFF09", group: "\u8F66\u8F86\u9644\u4EF6" },
  { action: "horn", label: "\u5587\u53ED\uFF08\u6309\u4F4F\uFF09", group: "\u8F66\u8F86\u9644\u4EF6" },
  { action: "selectorPark", label: "\u81EA\u52A8\u6321 P \u9A7B\u8F66", group: "\u8F66\u8F86\u9644\u4EF6" },
  { action: "selectorReverse", label: "\u81EA\u52A8\u6321 R \u5012\u8F66", group: "\u8F66\u8F86\u9644\u4EF6" },
  { action: "selectorNeutral", label: "\u81EA\u52A8\u6321 N \u7A7A\u6321", group: "\u8F66\u8F86\u9644\u4EF6" },
  { action: "selectorDrive", label: "\u81EA\u52A8\u6321 D \u524D\u8FDB", group: "\u8F66\u8F86\u9644\u4EF6" },
  { action: "engineStart", label: "\u53D1\u52A8\u673A\u5F00\u5173\uFF08\u70B9\u706B/\u7184\u706B\uFF09", group: "\u8F66\u8F86\u9644\u4EF6" }
];
var DEFAULT_KEYBOARD_BINDINGS = Object.freeze({
  throttle: "KeyW",
  brake: "KeyS",
  steerLeft: "KeyA",
  steerRight: "KeyD",
  shiftUp: "KeyE",
  shiftDown: "KeyQ",
  handbrake: "Space",
  reverse: "KeyR",
  neutral: "KeyN",
  gear1: "Digit1",
  gear2: "Digit2",
  gear3: "Digit3",
  gear4: "Digit4",
  gear5: "Digit5",
  gear6: "Digit6",
  gear7: "Digit7",
  toggleClutchMode: "KeyM",
  clutchRelease: "KeyZ",
  clutchPress: "KeyX",
  leftIndicator: "KeyJ",
  rightIndicator: "KeyK",
  hazard: "KeyH",
  cycleLights: "KeyL",
  fogToggle: "KeyF",
  highBeamFlash: "ShiftLeft",
  horn: "KeyO",
  selectorPark: "KeyP",
  selectorReverse: "BracketLeft",
  selectorNeutral: "Backslash",
  selectorDrive: "BracketRight",
  engineStart: "KeyI"
});
var RESERVED_GAME_KEYS = /* @__PURE__ */ new Set([
  "Escape",
  "Enter",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F12",
  "Backspace",
  "KeyC"
]);
function createKeyboardBindings(overrides) {
  const bindings = { ...DEFAULT_KEYBOARD_BINDINGS };
  if (overrides === void 0 || overrides === null) return bindings;
  for (const definition of KEYBOARD_BINDING_DEFINITIONS) {
    const candidate = overrides[definition.action];
    if (typeof candidate !== "string" || candidate.length === 0 || RESERVED_GAME_KEYS.has(candidate) || candidate.startsWith("F")) continue;
    const previousCode = bindings[definition.action];
    const conflictingAction = Object.keys(bindings).find((action) => action !== definition.action && bindings[action] === candidate);
    bindings[definition.action] = candidate;
    if (conflictingAction !== void 0) bindings[conflictingAction] = previousCode;
  }
  return bindings;
}

// src/input/KeyboardInput.ts
var BINDINGS_STORAGE_KEY = "drivergame.keyboard-bindings.v1";
var DEFAULT_KEYBOARD_INPUT_RESPONSE = {
  throttleRiseRate: 0.88,
  throttleFallRate: 2.8,
  steeringRiseRate: 2.15,
  steeringReturnRate: 3.8
};
var KeyboardInput = class {
  id;
  priority;
  target;
  storage;
  response;
  bindings;
  held = /* @__PURE__ */ new Set();
  enabled = true;
  throttleValue = 0;
  steeringValue = 0;
  pendingShiftUp = false;
  pendingShiftDown = false;
  pendingDirectGear;
  pendingModeToggle = false;
  pendingHandbrakeToggle = false;
  pendingLeftIndicator = false;
  pendingRightIndicator = false;
  pendingHazard = false;
  pendingCycleLights = false;
  pendingEngineStart = false;
  pendingFogToggle = false;
  pendingDriveSelector;
  lastInputAt = null;
  context = {
    deltaTime: 0,
    controlMode: "normal",
    manualClutchPedal: 1,
    actualClutchEngagement: 0
  };
  constructor(options = {}) {
    this.id = options.id ?? "keyboard";
    this.priority = options.priority ?? 10;
    this.target = options.target === void 0 ? typeof window === "undefined" ? null : window : options.target;
    this.storage = options.storage === void 0 ? this.getDefaultStorage() : options.storage;
    this.response = { ...DEFAULT_KEYBOARD_INPUT_RESPONSE, ...options.response };
    this.bindings = createKeyboardBindings({
      ...this.readStoredBindings(),
      ...options.bindings
    });
    this.target?.addEventListener("keydown", this.onKeyDown, { passive: false });
    this.target?.addEventListener("keyup", this.onKeyUp, { passive: false });
    this.target?.addEventListener("blur", this.onBlur);
  }
  get sourceInfo() {
    return {
      id: this.id,
      kind: "keyboard",
      label: "Keyboard",
      connected: this.enabled && this.target !== null
    };
  }
  update(context) {
    this.context = context;
    const dt = Number.isFinite(context.deltaTime) ? Math.max(0, context.deltaTime) : 0;
    const throttleTarget = this.enabled && this.held.has("throttle") ? 1 : 0;
    const steeringTarget = this.enabled ? Number(this.held.has("steerRight")) - Number(this.held.has("steerLeft")) : 0;
    this.throttleValue = this.moveTowards(
      this.throttleValue,
      throttleTarget,
      (throttleTarget > this.throttleValue ? this.response.throttleRiseRate : this.response.throttleFallRate) * dt
    );
    const steeringRate = steeringTarget === 0 ? this.response.steeringReturnRate : this.response.steeringRiseRate;
    this.steeringValue = this.moveTowards(
      this.steeringValue,
      steeringTarget,
      steeringRate * dt
    );
  }
  consumeState() {
    const info = this.sourceInfo;
    const left = this.enabled && this.held.has("steerLeft");
    const right = this.enabled && this.held.has("steerRight");
    const clutchRelease = this.enabled && this.held.has("clutchRelease");
    const clutchPress = this.enabled && this.held.has("clutchPress");
    const clutchPedalRate = this.context.controlMode === "manual-clutch" ? Number(clutchPress) - Number(clutchRelease) : 0;
    const throttle = this.enabled ? this.throttleValue : 0;
    const brake = this.enabled && this.held.has("brake") ? 1 : 0;
    const handbrake = this.enabled && this.held.has("handbrake") ? 1 : 0;
    const shiftUp = this.enabled && this.pendingShiftUp;
    const shiftDown = this.enabled && this.pendingShiftDown;
    const directGear = this.enabled ? this.pendingDirectGear : void 0;
    const toggleControlMode = this.enabled && this.pendingModeToggle;
    const toggleHandbrake = this.enabled && this.pendingHandbrakeToggle;
    const leftIndicator = this.enabled && this.pendingLeftIndicator;
    const rightIndicator = this.enabled && this.pendingRightIndicator;
    const hazard = this.enabled && this.pendingHazard;
    const cycleLights = this.enabled && this.pendingCycleLights;
    const engineStart = this.enabled && this.pendingEngineStart;
    const fogToggle = this.enabled && this.pendingFogToggle;
    const highBeamFlash = this.enabled && this.held.has("highBeamFlash");
    const hornPressed = this.enabled && this.held.has("horn");
    const driveSelector = this.enabled ? this.pendingDriveSelector : void 0;
    const deviceActive = throttle > 0 || brake > 0 || handbrake > 0 || left || right || Math.abs(this.steeringValue) > 1e-4 || clutchPedalRate !== 0 || shiftUp || shiftDown || directGear !== void 0 || toggleControlMode || toggleHandbrake || leftIndicator || rightIndicator || hazard || cycleLights || engineStart || fogToggle || highBeamFlash || hornPressed || driveSelector !== void 0;
    const state = {
      throttle,
      brake,
      steering: this.enabled ? this.steeringValue : 0,
      handbrake,
      clutchPedal: this.context.manualClutchPedal,
      lookX: 0,
      lookY: 0,
      shiftUp,
      shiftDown,
      leftIndicator,
      rightIndicator,
      hazard,
      cycleLights,
      engineStart,
      cruiseToggle: false,
      fogToggle,
      highBeamFlash,
      hornPressed,
      controlMode: this.context.controlMode,
      source: "keyboard",
      sourceMetadata: {
        primary: info.connected ? info : null,
        active: deviceActive ? [info] : [],
        connected: info.connected ? [info] : [],
        lastInputAt: this.lastInputAt
      },
      deviceActive,
      toggleControlMode,
      toggleHandbrake,
      clutchInputKind: this.context.controlMode === "manual-clutch" ? "rate" : "none",
      clutchPedalRate
    };
    if (directGear !== void 0) state.directGear = directGear;
    if (driveSelector !== void 0) state.driveSelector = driveSelector;
    this.pendingShiftUp = false;
    this.pendingShiftDown = false;
    this.pendingDirectGear = void 0;
    this.pendingModeToggle = false;
    this.pendingHandbrakeToggle = false;
    this.pendingLeftIndicator = false;
    this.pendingRightIndicator = false;
    this.pendingHazard = false;
    this.pendingCycleLights = false;
    this.pendingEngineStart = false;
    this.pendingFogToggle = false;
    this.pendingDriveSelector = void 0;
    return state;
  }
  setEnabled(enabled) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.reset();
  }
  getBindings() {
    return { ...this.bindings };
  }
  /**
   * Rebinds one action. If the requested key is already used, the two actions
   * swap keys so every driving action remains reachable.
   */
  setBinding(action, code) {
    if (!(action in this.bindings) || typeof code !== "string" || code.length === 0 || RESERVED_GAME_KEYS.has(code) || code.startsWith("F")) return;
    const previousCode = this.bindings[action];
    const conflictingAction = Object.keys(this.bindings).find((candidate) => candidate !== action && this.bindings[candidate] === code);
    this.bindings[action] = code;
    if (conflictingAction !== void 0) this.bindings[conflictingAction] = previousCode;
    this.reset();
    this.persistBindings();
  }
  resetBindings() {
    this.bindings = createKeyboardBindings(DEFAULT_KEYBOARD_BINDINGS);
    this.reset();
    try {
      this.storage?.removeItem(BINDINGS_STORAGE_KEY);
    } catch {
    }
  }
  dispose() {
    this.target?.removeEventListener("keydown", this.onKeyDown);
    this.target?.removeEventListener("keyup", this.onKeyUp);
    this.target?.removeEventListener("blur", this.onBlur);
    this.reset();
  }
  onKeyDown = (event) => {
    if (!this.enabled || event.ctrlKey || event.metaKey || event.altKey) return;
    const action = this.findAction(event.code);
    if (action === void 0) return;
    event.preventDefault();
    this.held.add(action);
    this.lastInputAt = event.timeStamp;
    if (event.repeat) return;
    if (action === "shiftUp") this.pendingShiftUp = true;
    if (action === "shiftDown") this.pendingShiftDown = true;
    if (action === "reverse") this.pendingDirectGear = "R";
    if (action === "neutral") this.pendingDirectGear = "N";
    if (action === "toggleClutchMode") this.pendingModeToggle = true;
    if (action === "handbrake") this.pendingHandbrakeToggle = true;
    if (action === "leftIndicator") this.pendingLeftIndicator = true;
    if (action === "rightIndicator") this.pendingRightIndicator = true;
    if (action === "hazard") this.pendingHazard = true;
    if (action === "cycleLights") this.pendingCycleLights = true;
    if (action === "engineStart") this.pendingEngineStart = true;
    if (action === "fogToggle") this.pendingFogToggle = true;
    const selectorByAction = {
      selectorPark: "P",
      selectorReverse: "R",
      selectorNeutral: "N",
      selectorDrive: "D"
    };
    const selector = selectorByAction[action];
    if (selector !== void 0) this.pendingDriveSelector = selector;
    const directGearByAction = {
      gear1: 1,
      gear2: 2,
      gear3: 3,
      gear4: 4,
      gear5: 5,
      gear6: 6,
      gear7: 7
    };
    const directGear = directGearByAction[action];
    if (directGear !== void 0) this.pendingDirectGear = directGear;
  };
  onKeyUp = (event) => {
    const action = this.findAction(event.code);
    if (action === void 0 || !this.held.delete(action)) return;
    event.preventDefault();
    this.lastInputAt = event.timeStamp;
  };
  onBlur = () => this.reset();
  reset() {
    this.held.clear();
    this.throttleValue = 0;
    this.steeringValue = 0;
    this.pendingShiftUp = false;
    this.pendingShiftDown = false;
    this.pendingDirectGear = void 0;
    this.pendingModeToggle = false;
    this.pendingHandbrakeToggle = false;
    this.pendingLeftIndicator = false;
    this.pendingRightIndicator = false;
    this.pendingHazard = false;
    this.pendingCycleLights = false;
    this.pendingEngineStart = false;
    this.pendingFogToggle = false;
    this.pendingDriveSelector = void 0;
  }
  findAction(code) {
    return Object.keys(this.bindings).find((action) => this.bindings[action] === code);
  }
  moveTowards(current, target, maximumDelta) {
    if (!Number.isFinite(current) || !Number.isFinite(target)) return 0;
    if (maximumDelta <= 0) return current;
    const delta = target - current;
    if (Math.abs(delta) <= maximumDelta) return target;
    return current + Math.sign(delta) * maximumDelta;
  }
  getDefaultStorage() {
    try {
      return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
      return null;
    }
  }
  readStoredBindings() {
    try {
      const stored = this.storage?.getItem(BINDINGS_STORAGE_KEY);
      return stored === null || stored === void 0 ? {} : JSON.parse(stored);
    } catch {
      return {};
    }
  }
  persistBindings() {
    try {
      this.storage?.setItem(BINDINGS_STORAGE_KEY, JSON.stringify(this.bindings));
    } catch {
    }
  }
};

// src/input/ManualClutchController.ts
var DEFAULT_MANUAL_CLUTCH_CONFIG = {
  deadzone: 0.14,
  responseExponent: 1.7,
  pressRate: 2.2,
  releaseRate: 1.15,
  maximumDeltaTime: 0.1
};
var ManualClutchController = class {
  pedal = 1;
  config;
  constructor(config = {}) {
    this.config = { ...DEFAULT_MANUAL_CLUTCH_CONFIG, ...config };
  }
  get clutchPedal() {
    return this.pedal;
  }
  get clutchEngagement() {
    return 1 - this.pedal;
  }
  /** Seamlessly take over from the currently simulated clutch engagement. */
  takeOver(actualClutchEngagement) {
    this.pedal = 1 - clamp01(actualClutchEngagement);
    return this.pedal;
  }
  setPedal(clutchPedal) {
    this.pedal = clamp01(clutchPedal);
    return this.pedal;
  }
  update(deltaTime, rateAxis) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) return this.pedal;
    const dt = Math.min(deltaTime, Math.max(0, this.config.maximumDeltaTime));
    const shapedRate = applyAxisDeadzone(
      clamp(rateAxis, -1, 1),
      this.config.deadzone,
      this.config.responseExponent
    );
    if (shapedRate === 0) return this.pedal;
    const travelRate = shapedRate > 0 ? this.config.pressRate : this.config.releaseRate;
    this.pedal = clamp01(this.pedal + shapedRate * travelRate * dt);
    return this.pedal;
  }
};

// src/input/VehicleInputState.ts
function createNeutralVehicleInputState(controlMode = "normal", clutchPedal = 1) {
  return {
    throttle: 0,
    brake: 0,
    steering: 0,
    handbrake: 0,
    clutchPedal: clamp012(clutchPedal),
    lookX: 0,
    lookY: 0,
    shiftUp: false,
    shiftDown: false,
    leftIndicator: false,
    rightIndicator: false,
    hazard: false,
    cycleLights: false,
    engineStart: false,
    cruiseToggle: false,
    fogToggle: false,
    highBeamFlash: false,
    hornPressed: false,
    controlMode,
    source: "keyboard",
    sourceMetadata: {
      primary: null,
      active: [],
      connected: [],
      lastInputAt: null
    }
  };
}
function clamp012(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

// src/input/VehicleInputSystem.ts
var VehicleInputSystem = class {
  keyboard;
  gamepad;
  devices = [];
  manualClutch;
  pendingDiscreteFrames = [];
  enabled = true;
  mode;
  latestState;
  primarySourceId = null;
  lastInputAt = null;
  /** Persistent parking-brake state shared by every input device. */
  handbrakeLatched = false;
  constructor(options = {}) {
    this.mode = options.initialControlMode ?? "normal";
    this.manualClutch = new ManualClutchController(options.manualClutch);
    this.latestState = createNeutralVehicleInputState(this.mode, 1);
    this.keyboard = options.keyboard === false ? null : new KeyboardInput(options.keyboard);
    this.gamepad = options.gamepad === false ? null : new GamepadInput(options.gamepad);
    if (this.keyboard !== null) this.registerDevice(this.keyboard);
    if (this.gamepad !== null) this.registerDevice(this.gamepad);
    for (const device of options.devices ?? []) this.registerDevice(device);
  }
  get controlMode() {
    return this.mode;
  }
  get manualClutchPedal() {
    return this.manualClutch.clutchPedal;
  }
  get isHandbrakeLatched() {
    return this.handbrakeLatched;
  }
  /**
   * Register a wheel/pedal or other adapter. Its implementation remains fully
   * outside physics as long as it implements VehicleInputDevice.
   */
  registerDevice(device) {
    if (this.devices.some((candidate) => candidate.id === device.id)) {
      throw new Error(`Vehicle input device id already registered: ${device.id}`);
    }
    this.devices.push(device);
    this.devices.sort((left, right) => right.priority - left.priority);
    device.setEnabled(this.enabled);
    return () => this.unregisterDevice(device.id);
  }
  unregisterDevice(deviceOrId) {
    const id = typeof deviceOrId === "string" ? deviceOrId : deviceOrId.id;
    const index = this.devices.findIndex((device) => device.id === id);
    if (index < 0) return false;
    const [removed] = this.devices.splice(index, 1);
    removed?.dispose();
    if (this.primarySourceId === id) this.primarySourceId = null;
    return true;
  }
  setEnabled(enabled) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    for (const device of this.devices) device.setEnabled(enabled);
    if (!enabled) {
      this.pendingDiscreteFrames.length = 0;
      this.primarySourceId = null;
      this.latestState = createNeutralVehicleInputState(
        this.mode,
        this.latestState.clutchPedal
      );
      this.latestState.handbrake = Number(this.handbrakeLatched);
    }
  }
  /**
   * Explicit mode selection for UI/testing. Entering manual mode always starts
   * at the actual simulated engagement, never at a stale stick position.
   */
  setControlMode(mode, actualClutchEngagement = this.manualClutch.clutchEngagement) {
    if (mode === this.mode) return;
    if (mode === "manual-clutch") {
      this.manualClutch.takeOver(this.safeActualEngagement(actualClutchEngagement));
    }
    this.mode = mode;
    this.latestState = {
      ...this.latestState,
      clutchPedal: mode === "manual-clutch" ? this.manualClutch.clutchPedal : 1 - this.safeActualEngagement(actualClutchEngagement),
      lookX: 0,
      lookY: 0,
      controlMode: mode
    };
  }
  /** Poll/update once per render frame before running fixed vehicle steps. */
  update(deltaTime, actualClutchEngagement) {
    const actualEngagement = this.safeActualEngagement(actualClutchEngagement);
    const dt = Number.isFinite(deltaTime) && deltaTime > 0 ? deltaTime : 0;
    const pedalBeforeUpdate = this.mode === "manual-clutch" ? this.manualClutch.clutchPedal : 1 - actualEngagement;
    const context = {
      deltaTime: dt,
      controlMode: this.mode,
      manualClutchPedal: pedalBeforeUpdate,
      actualClutchEngagement: actualEngagement
    };
    const samples = [];
    for (const device of this.devices) {
      device.update(context);
      samples.push(device.consumeState());
    }
    if (samples.some((sample) => sample.toggleHandbrake)) {
      this.handbrakeLatched = !this.handbrakeLatched;
    }
    const requestedModeToggle = samples.some((sample) => sample.toggleControlMode);
    if (requestedModeToggle) {
      if (this.mode === "normal") {
        this.manualClutch.takeOver(actualEngagement);
        this.mode = "manual-clutch";
      } else {
        this.mode = "normal";
      }
    }
    const continuous = this.combineContinuous(samples);
    let clutchPedal;
    if (this.mode === "manual-clutch") {
      const absoluteClutch = samples.find(
        (sample) => sample.clutchInputKind === "absolute" && sample.sourceMetadata.primary?.connected === true
      );
      if (absoluteClutch !== void 0) {
        clutchPedal = this.manualClutch.setPedal(absoluteClutch.clutchPedal);
      } else if (!requestedModeToggle) {
        const clutchRate = this.strongestSignedAxis(
          samples.map((sample) => sample.clutchInputKind === "rate" ? sample.clutchPedalRate : 0)
        );
        clutchPedal = this.manualClutch.update(dt, clutchRate);
      } else {
        clutchPedal = this.manualClutch.clutchPedal;
      }
      continuous.lookX = 0;
      continuous.lookY = 0;
    } else {
      clutchPedal = 1 - actualEngagement;
    }
    this.enqueueDiscreteFrame(samples);
    const sourceMetadata = this.buildSourceMetadata(samples);
    const source = this.toPublicSource(sourceMetadata.primary);
    this.latestState = {
      throttle: continuous.throttle,
      brake: continuous.brake,
      steering: continuous.steering,
      handbrake: Number(this.handbrakeLatched),
      clutchPedal,
      lookX: continuous.lookX,
      lookY: continuous.lookY,
      shiftUp: false,
      shiftDown: false,
      leftIndicator: false,
      rightIndicator: false,
      hazard: false,
      cycleLights: false,
      engineStart: false,
      cruiseToggle: false,
      fogToggle: false,
      highBeamFlash: samples.some((sample) => sample.highBeamFlash === true),
      hornPressed: samples.some((sample) => sample.hornPressed === true),
      controlMode: this.mode,
      source,
      sourceMetadata
    };
  }
  /**
   * Consume one queued discrete frame. Continuous input is always the latest
   * sample. If no fixed step ran, queued edges survive until a later call.
   */
  consumeState() {
    const discrete = this.pendingDiscreteFrames.shift();
    return this.copyStateWithDiscrete(discrete);
  }
  /** Inspect without consuming the next shift/gear edge. */
  peekState() {
    return this.copyStateWithDiscrete(this.pendingDiscreteFrames[0]);
  }
  dispose() {
    for (const device of this.devices.splice(0)) device.dispose();
    this.pendingDiscreteFrames.length = 0;
    this.primarySourceId = null;
  }
  combineContinuous(samples) {
    let throttle = 0;
    let brake = 0;
    let steering = 0;
    let lookX = 0;
    let lookY = 0;
    let strongestLookMagnitude = 0;
    for (const sample of samples) {
      throttle = Math.max(throttle, clamp01(sample.throttle));
      brake = Math.max(brake, clamp01(sample.brake));
      const candidateSteering = clamp(sample.steering, -1, 1);
      if (Math.abs(candidateSteering) > Math.abs(steering)) steering = candidateSteering;
      const lookMagnitude = Math.hypot(sample.lookX, sample.lookY);
      if (lookMagnitude > strongestLookMagnitude) {
        strongestLookMagnitude = lookMagnitude;
        lookX = clamp(sample.lookX, -1, 1);
        lookY = clamp(sample.lookY, -1, 1);
      }
    }
    return { throttle, brake, steering, lookX, lookY };
  }
  enqueueDiscreteFrame(samples) {
    let shiftUp = false;
    let shiftDown = false;
    let leftIndicator = false;
    let rightIndicator = false;
    let hazard = false;
    let cycleLights = false;
    let engineStart = false;
    let cruiseToggle = false;
    let fogToggle = false;
    let directGear;
    let driveSelector;
    for (const sample of samples) {
      shiftUp ||= sample.shiftUp;
      shiftDown ||= sample.shiftDown;
      leftIndicator ||= sample.leftIndicator;
      rightIndicator ||= sample.rightIndicator;
      hazard ||= sample.hazard;
      cycleLights ||= sample.cycleLights;
      engineStart ||= sample.engineStart;
      cruiseToggle ||= sample.cruiseToggle;
      fogToggle ||= sample.fogToggle === true;
      if (directGear === void 0 && sample.directGear !== void 0) {
        directGear = sample.directGear;
      }
      if (driveSelector === void 0 && sample.driveSelector !== void 0) driveSelector = sample.driveSelector;
    }
    if (!shiftUp && !shiftDown && !leftIndicator && !rightIndicator && !hazard && !cycleLights && !engineStart && !cruiseToggle && !fogToggle && directGear === void 0 && driveSelector === void 0) return;
    const frame = {
      shiftUp,
      shiftDown,
      leftIndicator,
      rightIndicator,
      hazard,
      cycleLights,
      engineStart,
      cruiseToggle,
      fogToggle
    };
    if (directGear !== void 0) frame.directGear = directGear;
    if (driveSelector !== void 0) frame.driveSelector = driveSelector;
    this.pendingDiscreteFrames.push(frame);
  }
  buildSourceMetadata(samples) {
    const connected = this.uniqueSources(
      samples.flatMap((sample) => sample.sourceMetadata.connected)
    );
    const active = this.uniqueSources(
      samples.filter((sample) => sample.deviceActive).flatMap((sample) => sample.sourceMetadata.active)
    );
    const newestDeviceTimestamp = samples.reduce((newest, sample) => {
      const timestamp = sample.sourceMetadata.lastInputAt;
      if (timestamp === null) return newest;
      return newest === null ? timestamp : Math.max(newest, timestamp);
    }, null);
    if (active.length > 0) {
      this.primarySourceId = active[0]?.id ?? null;
      this.lastInputAt = newestDeviceTimestamp ?? this.now();
    } else if (this.primarySourceId === null || !connected.some((source) => source.id === this.primarySourceId)) {
      this.primarySourceId = connected[0]?.id ?? null;
    }
    const primary = connected.find((source) => source.id === this.primarySourceId) ?? null;
    return { primary, active, connected, lastInputAt: this.lastInputAt };
  }
  uniqueSources(sources) {
    const seen = /* @__PURE__ */ new Set();
    return sources.filter((source) => {
      if (seen.has(source.id)) return false;
      seen.add(source.id);
      return true;
    });
  }
  copyStateWithDiscrete(discrete) {
    const state = {
      ...this.latestState,
      sourceMetadata: {
        ...this.latestState.sourceMetadata,
        active: [...this.latestState.sourceMetadata.active],
        connected: [...this.latestState.sourceMetadata.connected]
      },
      shiftUp: discrete?.shiftUp ?? false,
      shiftDown: discrete?.shiftDown ?? false,
      leftIndicator: discrete?.leftIndicator ?? false,
      rightIndicator: discrete?.rightIndicator ?? false,
      hazard: discrete?.hazard ?? false,
      cycleLights: discrete?.cycleLights ?? false,
      engineStart: discrete?.engineStart ?? false,
      cruiseToggle: discrete?.cruiseToggle ?? false,
      fogToggle: discrete?.fogToggle ?? false
    };
    if (discrete?.directGear !== void 0) state.directGear = discrete.directGear;
    else delete state.directGear;
    if (discrete?.driveSelector !== void 0) state.driveSelector = discrete.driveSelector;
    else delete state.driveSelector;
    return state;
  }
  strongestSignedAxis(axes) {
    let strongest = 0;
    for (const axis of axes) {
      const safeAxis = clamp(axis, -1, 1);
      if (Math.abs(safeAxis) > Math.abs(strongest)) strongest = safeAxis;
    }
    return strongest;
  }
  safeActualEngagement(value) {
    return Number.isFinite(value) ? clamp01(value) : this.manualClutch.clutchEngagement;
  }
  toPublicSource(source) {
    if (source?.kind === "gamepad" || source?.kind === "wheel") return source.kind;
    return "keyboard";
  }
  now() {
    return typeof performance === "undefined" ? Date.now() : performance.now();
  }
};

// src/input/VehicleInputSystem.selftest.ts
function runVehicleInputSystemSelfTest() {
  let assertions = 0;
  const assert = (condition, message) => {
    assertions += 1;
    if (!condition) throw new Error(`VehicleInputSystem self-test failed: ${message}`);
  };
  const assertNear = (actual, expected, tolerance, message) => {
    assert(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
  };
  let gamepad = createMockGamepad();
  const gamepads = [];
  const navigatorMock = {
    getGamepads: () => {
      gamepads[0] = gamepad;
      return gamepads;
    }
  };
  const input = new VehicleInputSystem({
    keyboard: false,
    gamepad: { target: null, navigator: navigatorMock }
  });
  const actualEngagement = 0.63;
  try {
    input.update(1 / 60, actualEngagement);
    let state = input.consumeState();
    assert(state.controlMode === "normal", "initial mode is normal");
    assert(state.source === "gamepad", "connected gamepad is reported");
    assert(
      input.gamepad?.getActiveGamepad() === gamepad,
      "haptics receives the current real selected browser object"
    );
    const connectedPad = requireGamepad(gamepad);
    connectedPad.axes[0] = 0.05;
    setButton(connectedPad, 7, 0.64);
    setButton(connectedPad, 6, 0.31);
    advance(connectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    const config = DEFAULT_GAMEPAD_INPUT_CONFIG;
    assertNear(
      state.throttle,
      applyTriggerCurve(0.64, config.throttleDeadzone, config.throttleResponseExponent),
      1e-10,
      "RT remains analog and follows its independent mild response curve"
    );
    assertNear(
      state.brake,
      applyTriggerCurve(0.31, config.triggerDeadzone, config.triggerResponseExponent),
      1e-10,
      "LT remains analog and follows its response curve"
    );
    assert(state.throttle > 0 && state.throttle < 1, "RT is not reduced to a button");
    assert(state.brake > 0 && state.brake < 1, "LT is not reduced to a button");
    assert(state.steering === 0, "left-stick noise inside deadzone is removed");
    assert(config.triggerResponseExponent === 1.55, "LT retains its original response exponent");
    const rtDiagnostics = input.gamepad?.getThrottleDiagnostics();
    assert(rtDiagnostics?.rtRaw === 0.64, "diagnostics expose the browser RT raw value");
    assertNear(
      rtDiagnostics?.rtNormalized ?? -1,
      (0.64 - 0.03) / 0.97,
      1e-10,
      "RT normalization rescales the deadzone before the curve"
    );
    assertNear(
      rtDiagnostics?.throttleCommand ?? -1,
      state.throttle,
      1e-10,
      "diagnostics expose the command before engine response filtering"
    );
    let previousThrottle = 0;
    for (const [raw, minimum, maximum] of [
      [0, 0, 0],
      [0.02, 0, 0],
      [0.03, 0, 0],
      [0.1, 0.05, 0.08],
      [0.2, 0.14, 0.19],
      [0.3, 0.23, 0.29],
      [0.4, 0.34, 0.39],
      [0.5, 0.44, 0.49],
      [0.6, 0.54, 0.59],
      [0.7, 0.64, 0.7],
      [0.8, 0.76, 0.81],
      [0.9, 0.87, 0.91],
      [1, 1, 1]
    ]) {
      setButton(connectedPad, 7, raw);
      advance(connectedPad);
      input.update(1 / 60, actualEngagement);
      state = input.consumeState();
      assert(
        state.throttle >= minimum && state.throttle <= maximum,
        `RT ${raw} reaches a usable near-linear throttle range`
      );
      assert(
        state.throttle >= previousThrottle && state.throttle - previousThrottle < 0.13,
        "RT increases continuously without a late-travel surge"
      );
      assertNear(
        state.brake,
        applyTriggerCurve(0.31, config.triggerDeadzone, config.triggerResponseExponent),
        1e-10,
        "RT tuning leaves the LT brake command unchanged"
      );
      previousThrottle = state.throttle;
    }
    assert(rtDiagnostics?.rtRaw === 0.64, "previous diagnostics are stable snapshots");
    setButton(connectedPad, 7, 0.64);
    connectedPad.axes[0] = 0.5;
    advance(connectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.steering > 0, "steering survives outside the deadzone");
    assert(state.steering < 0.5, "steering response curve gives finer mid-stick control");
    setButton(connectedPad, 0, 1);
    advance(connectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.handbrake === 1, "A rising edge latches the handbrake on");
    advance(connectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.handbrake === 1, "holding A does not toggle the handbrake repeatedly");
    setButton(connectedPad, 0, 0);
    setButton(connectedPad, 14, 1);
    setButton(connectedPad, 12, 1);
    setButton(connectedPad, 9, 1);
    setButton(connectedPad, 2, 1);
    advance(connectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.leftIndicator, "D-pad Left emits a left-indicator toggle request");
    assert(state.cycleLights, "D-pad Up emits a light-cycle request");
    assert(state.engineStart, "Start emits an engine-start request");
    assert(state.cruiseToggle, "X emits a cruise-control toggle request");
    advance(connectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(
      !state.leftIndicator && !state.cycleLights && !state.engineStart && !state.cruiseToggle,
      "held accessory buttons emit only one edge"
    );
    setButton(connectedPad, 14, 0);
    setButton(connectedPad, 12, 0);
    setButton(connectedPad, 9, 0);
    setButton(connectedPad, 2, 0);
    setButton(connectedPad, 15, 1);
    setButton(connectedPad, 13, 1);
    advance(connectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.rightIndicator, "D-pad Right emits a right-indicator toggle request");
    assert(state.hazard, "D-pad Down emits a hazard-light toggle request");
    setButton(connectedPad, 15, 0);
    setButton(connectedPad, 13, 0);
    setButton(connectedPad, 3, 1);
    setButton(connectedPad, 1, 1);
    setButton(connectedPad, 10, 1);
    setButton(connectedPad, 11, 1);
    advance(connectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.fogToggle === true, "Y requests one front/rear-fog toggle");
    assert(state.directGear === void 0, "Y/B do not request Neutral or Reverse");
    assert(state.highBeamFlash === true && state.hornPressed === true, "L3/R3 provide independent held flash/horn");
    assert(state.controlMode === "normal", "R3 is no longer a manual-clutch shortcut");
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(
      state.fogToggle === false && state.highBeamFlash === true && state.hornPressed === true,
      "fog consumes its edge while flash/horn remain held"
    );
    setButton(connectedPad, 3, 0);
    setButton(connectedPad, 1, 0);
    setButton(connectedPad, 10, 0);
    setButton(connectedPad, 11, 0);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.highBeamFlash === false && state.hornPressed === false, "flash/horn immediately release");
    const pedalBeforeToggle = state.clutchPedal;
    input.setControlMode("manual-clutch", actualEngagement);
    state = input.peekState();
    assert(state.controlMode === "manual-clutch", "explicit/keyboard mode selection enters manual mode");
    assertNear(
      state.clutchPedal,
      1 - actualEngagement,
      1e-12,
      "manual controller takes over actual clutch engagement"
    );
    assertNear(
      state.clutchPedal,
      pedalBeforeToggle,
      1e-12,
      "normal-to-manual takeover is continuous"
    );
    advance(connectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.controlMode === "manual-clutch", "manual mode remains selected while gamepad driving");
    connectedPad.axes[2] = 0.9;
    connectedPad.axes[3] = 0.45;
    advance(connectedPad);
    const pedalBeforeRateInput = state.clutchPedal;
    input.update(0.1, actualEngagement);
    state = input.consumeState();
    assert(state.lookX === 0 && state.lookY === 0, "manual mode disables right-stick look");
    assert(state.clutchPedal > pedalBeforeRateInput, "right-stick down presses clutch by rate");
    assert(state.clutchPedal < 1, "rate input does not map directly to pedal position");
    connectedPad.axes[3] = 0;
    advance(connectedPad);
    const heldPedal = state.clutchPedal;
    input.update(0.1, actualEngagement);
    state = input.consumeState();
    assertNear(state.clutchPedal, heldPedal, 1e-12, "centred stick holds clutch position");
    assert(state.lookX === 0, "manual mode ignores right-stick X even while deflected");
    connectedPad.connected = false;
    gamepad = null;
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(
      state.throttle === 0 && state.brake === 0 && state.steering === 0 && state.handbrake === 1,
      "disconnect clears driving axes but preserves the handbrake latch"
    );
    assert(state.sourceMetadata.connected.length === 0, "disconnect clears device metadata");
    assert(input.gamepad?.getActiveGamepad() === null, "disconnect clears the haptics pad reference");
    assert(!state.highBeamFlash && !state.hornPressed, "disconnect releases momentary accessory controls");
    const disconnectedDiagnostics = input.gamepad?.getThrottleDiagnostics();
    assert(disconnectedDiagnostics?.rtRaw === 0 && disconnectedDiagnostics.rtNormalized === 0 && disconnectedDiagnostics.throttleCommand === 0, "disconnect clears every RT diagnostics stage");
    const reconnectedPad = createMockGamepad();
    setButton(reconnectedPad, 11, 1);
    setButton(reconnectedPad, 0, 1);
    setButton(reconnectedPad, 2, 1);
    gamepad = reconnectedPad;
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.source === "gamepad", "reconnected gamepad is discovered by polling");
    assert(
      state.controlMode === "manual-clutch",
      "button already held during reconnect does not synthesize an edge"
    );
    assert(state.handbrake === 1, "held A during reconnect does not change the latch");
    assert(!state.cruiseToggle, "held X during reconnect does not synthesize cruise toggle");
    advance(reconnectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.controlMode === "manual-clutch", "held R3 remains stable after reconnect");
    setButton(reconnectedPad, 2, 0);
    advance(reconnectedPad);
    input.update(1 / 60, actualEngagement);
    input.consumeState();
    setButton(reconnectedPad, 2, 1);
    advance(reconnectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.cruiseToggle, "fresh X edge resumes after reconnect");
    setButton(reconnectedPad, 11, 0);
    advance(reconnectedPad);
    input.update(1 / 60, actualEngagement);
    input.consumeState();
    setButton(reconnectedPad, 11, 1);
    advance(reconnectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(
      state.controlMode === "manual-clutch" && state.hornPressed === true,
      "fresh R3 after reconnect is horn, not a clutch toggle"
    );
    input.setControlMode("normal", actualEngagement);
    setButton(reconnectedPad, 0, 0);
    advance(reconnectedPad);
    input.update(1 / 60, actualEngagement);
    input.consumeState();
    setButton(reconnectedPad, 0, 1);
    advance(reconnectedPad);
    input.update(1 / 60, actualEngagement);
    state = input.consumeState();
    assert(state.handbrake === 0, "a fresh A edge releases the latched handbrake");
    setButton(reconnectedPad, 7, 0.4);
    input.update(1 / 60, actualEngagement);
    assert(
      (input.gamepad?.getThrottleDiagnostics().throttleCommand ?? 0) > 0,
      "RT diagnostics resume after reconnect"
    );
    input.setEnabled(false);
    const disabledDiagnostics = input.gamepad?.getThrottleDiagnostics();
    assert(disabledDiagnostics?.rtRaw === 0 && disabledDiagnostics.rtNormalized === 0 && disabledDiagnostics.throttleCommand === 0, "input suspension clears RT diagnostics immediately");
    assert(input.peekState().throttle === 0, "input suspension clears the throttle command");
    input.setEnabled(true);
    const keyboardTarget = new EventTarget();
    const storedPreferences = /* @__PURE__ */ new Map();
    const keyboardInput = new VehicleInputSystem({
      gamepad: false,
      keyboard: {
        target: keyboardTarget,
        storage: {
          getItem: (key) => storedPreferences.get(key) ?? null,
          setItem: (key, value) => {
            storedPreferences.set(key, value);
          },
          removeItem: (key) => {
            storedPreferences.delete(key);
          }
        }
      }
    });
    const keyboard = keyboardInput.keyboard;
    if (keyboard === null) throw new Error("Keyboard adapter was not created");
    try {
      dispatchKeyboardKey(keyboardTarget, "keydown", "KeyW");
      keyboardInput.update(0.5, 0);
      let keyboardState = keyboardInput.consumeState();
      assert(
        keyboardState.throttle > 0.4 && keyboardState.throttle < 0.5,
        "keyboard throttle rises progressively instead of jumping to full"
      );
      keyboardInput.update(0.7, 0);
      keyboardState = keyboardInput.consumeState();
      assertNear(keyboardState.throttle, 1, 1e-12, "held keyboard throttle reaches full");
      dispatchKeyboardKey(keyboardTarget, "keyup", "KeyW");
      keyboardInput.update(0.2, 0);
      keyboardState = keyboardInput.consumeState();
      assert(
        keyboardState.throttle < 0.5,
        "keyboard throttle releases faster than it builds"
      );
      dispatchKeyboardKey(keyboardTarget, "keydown", "Space");
      keyboardInput.update(1 / 60, 0);
      keyboardState = keyboardInput.consumeState();
      assert(keyboardState.handbrake === 1, "Space latches the handbrake on");
      keyboardInput.update(1 / 60, 0);
      keyboardState = keyboardInput.consumeState();
      assert(keyboardState.handbrake === 1, "held Space leaves the latch unchanged");
      dispatchKeyboardKey(keyboardTarget, "keyup", "Space");
      keyboardInput.update(1 / 60, 0);
      keyboardState = keyboardInput.consumeState();
      assert(keyboardState.handbrake === 1, "releasing Space does not release the handbrake");
      keyboardInput.setEnabled(false);
      assert(
        keyboardInput.peekState().handbrake === 1,
        "disabling input preserves the handbrake latch"
      );
      keyboardInput.setEnabled(true);
      keyboardInput.update(1 / 60, 0);
      keyboardState = keyboardInput.consumeState();
      assert(
        keyboardState.handbrake === 1,
        "re-enabling input preserves the handbrake latch"
      );
      dispatchKeyboardKey(keyboardTarget, "keydown", "Space");
      keyboardInput.update(1 / 60, 0);
      keyboardState = keyboardInput.consumeState();
      assert(keyboardState.handbrake === 0, "a second Space edge releases the handbrake");
      dispatchKeyboardKey(keyboardTarget, "keyup", "Space");
      dispatchKeyboardKey(keyboardTarget, "keydown", "KeyM");
      keyboardInput.update(1 / 60, actualEngagement);
      keyboardState = keyboardInput.consumeState();
      assert(keyboardState.controlMode === "manual-clutch", "keyboard M remains the manual-clutch toggle");
      assertNear(keyboardState.clutchPedal, 1 - actualEngagement, 1e-12, "keyboard M takes over actual clutch smoothly");
      dispatchKeyboardKey(keyboardTarget, "keyup", "KeyM");
      dispatchKeyboardKey(keyboardTarget, "keydown", "KeyF");
      dispatchKeyboardKey(keyboardTarget, "keydown", "ShiftLeft");
      dispatchKeyboardKey(keyboardTarget, "keydown", "KeyO");
      keyboardInput.update(1 / 60, actualEngagement);
      keyboardState = keyboardInput.consumeState();
      assert(
        keyboardState.fogToggle === true && keyboardState.highBeamFlash === true && keyboardState.hornPressed === true,
        "keyboard has independent fog, held flash and horn bindings"
      );
      keyboardInput.update(1 / 60, actualEngagement);
      keyboardState = keyboardInput.consumeState();
      assert(
        !keyboardState.fogToggle && keyboardState.highBeamFlash === true && keyboardState.hornPressed === true,
        "keyboard held fog does not repeat while flash/horn remain active"
      );
      for (const code of ["KeyF", "ShiftLeft", "KeyO"]) dispatchKeyboardKey(keyboardTarget, "keyup", code);
      for (const [code, selector] of [
        ["KeyP", "P"],
        ["BracketLeft", "R"],
        ["Backslash", "N"],
        ["BracketRight", "D"]
      ]) {
        dispatchKeyboardKey(keyboardTarget, "keydown", code);
        keyboardInput.update(1 / 60, actualEngagement);
        keyboardState = keyboardInput.consumeState();
        assert(
          keyboardState.driveSelector === selector && keyboardState.directGear === void 0,
          `keyboard ${code} sends independent AT selector ${selector}`
        );
        keyboardInput.update(1 / 60, actualEngagement);
        assert(keyboardInput.consumeState().driveSelector === void 0, "held selector emits only one request");
        dispatchKeyboardKey(keyboardTarget, "keyup", code);
      }
      for (const code of ["KeyJ", "KeyK", "KeyH", "KeyL", "KeyI"]) {
        dispatchKeyboardKey(keyboardTarget, "keydown", code);
      }
      keyboardInput.update(1 / 60, 0);
      keyboardState = keyboardInput.consumeState();
      assert(keyboardState.leftIndicator, "J requests the left indicator");
      assert(keyboardState.rightIndicator, "K requests the right indicator");
      assert(keyboardState.hazard, "H requests hazard lights");
      assert(keyboardState.cycleLights, "L requests a light cycle");
      assert(keyboardState.engineStart, "I requests engine start");
      keyboardInput.update(1 / 60, 0);
      keyboardState = keyboardInput.consumeState();
      assert(
        !keyboardState.leftIndicator && !keyboardState.rightIndicator && !keyboardState.hazard && !keyboardState.cycleLights && !keyboardState.engineStart,
        "held keyboard accessory keys emit only one edge"
      );
      for (const code of ["KeyJ", "KeyK", "KeyH", "KeyL", "KeyI"]) {
        dispatchKeyboardKey(keyboardTarget, "keyup", code);
      }
      keyboard.setBinding("throttle", "KeyL");
      const swapped = keyboard.getBindings();
      assert(
        swapped.throttle === "KeyL" && swapped.cycleLights === "KeyW",
        "rebinding can swap with the rebindable light key"
      );
      keyboard.setBinding("throttle", "KeyC");
      assert(
        keyboard.getBindings().throttle === "KeyL",
        "reserved game key cannot replace a driving binding"
      );
      assert(storedPreferences.size > 0, "custom keyboard bindings are persisted");
    } finally {
      keyboardInput.dispose();
    }
    return { passed: true, assertions };
  } finally {
    input.dispose();
  }
}
function dispatchKeyboardKey(target, type, code) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperties(event, {
    code: { value: code },
    ctrlKey: { value: false },
    metaKey: { value: false },
    altKey: { value: false },
    repeat: { value: false }
  });
  target.dispatchEvent(event);
}
function createMockGamepad() {
  return {
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => createButton(0)),
    connected: true,
    id: "Mock Standard Gamepad",
    index: 0,
    mapping: "standard",
    timestamp: 1
  };
}
function createButton(value) {
  return {
    pressed: value > 0.5,
    touched: value > 0,
    value
  };
}
function setButton(gamepad, index, value) {
  gamepad.buttons[index] = createButton(value);
}
function advance(gamepad) {
  gamepad.timestamp += 1;
}
function requireGamepad(gamepad) {
  if (gamepad === null) throw new Error("VehicleInputSystem self-test setup lost gamepad");
  return gamepad;
}
export {
  runVehicleInputSystemSelfTest
};
