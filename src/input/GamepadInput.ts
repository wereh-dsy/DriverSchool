import type {
  VehicleInputDevice,
  VehicleInputDeviceContext,
  VehicleInputDeviceState,
} from './VehicleInputDevice';
import type { VehicleInputSourceInfo } from './VehicleInputState';
import {
  applyAxisDeadzone,
  applyRadialDeadzone,
  applyTriggerCurve,
  clamp,
  clamp01,
  normalizeTrigger,
} from './inputMath';

export interface GamepadInputConfig {
  leftStickDeadzone: number;
  leftStickResponseExponent: number;
  rightStickDeadzone: number;
  rightStickResponseExponent: number;
  /** RT mapping stays independent of the LT brake curve and engine response. */
  throttleDeadzone: number;
  throttleResponseExponent: number;
  /** Existing trigger settings retain the LT brake mapping. */
  triggerDeadzone: number;
  triggerResponseExponent: number;
}

export const DEFAULT_GAMEPAD_INPUT_CONFIG: Readonly<GamepadInputConfig> = {
  leftStickDeadzone: 0.13,
  leftStickResponseExponent: 1.85,
  rightStickDeadzone: 0.14,
  rightStickResponseExponent: 1.45,
  throttleDeadzone: 0.03,
  throttleResponseExponent: 1.1,
  triggerDeadzone: 0.03,
  triggerResponseExponent: 1.55,
};

export interface GamepadThrottleDiagnostics {
  /** Browser RT button value before clamping/deadzone, normally [0, 1]. */
  readonly rtRaw: number;
  /** RT after range normalization and deadzone rescaling, before the curve. */
  readonly rtNormalized: number;
  /** Final RT command sent to input aggregation, before engine filtering. */
  readonly throttleCommand: number;
}

const ZERO_THROTTLE_DIAGNOSTICS: Readonly<GamepadThrottleDiagnostics> = {
  rtRaw: 0,
  rtNormalized: 0,
  throttleCommand: 0,
};

export interface GamepadInputOptions {
  target?: Window | null;
  navigator?: Pick<Navigator, 'getGamepads'> | null;
  id?: string;
  priority?: number;
  config?: Partial<GamepadInputConfig>;
}

interface GamepadContinuousState {
  throttle: number;
  brake: number;
  steering: number;
  handbrake: number;
  lookX: number;
  lookY: number;
  clutchPedalRate: number;
  highBeamFlash: boolean;
  hornPressed: boolean;
  deviceActive: boolean;
}

const ZERO_CONTINUOUS: Readonly<GamepadContinuousState> = {
  throttle: 0,
  brake: 0,
  steering: 0,
  handbrake: 0,
  lookX: 0,
  lookY: 0,
  clutchPedalRate: 0,
  highBeamFlash: false,
  hornPressed: false,
  deviceActive: false,
};

/** Browser Gamepad API adapter using the W3C standard mapping. */
export class GamepadInput implements VehicleInputDevice {
  public readonly id: string;
  public readonly priority: number;

  private readonly target: Window | null;
  private readonly gamepadNavigator: Pick<Navigator, 'getGamepads'> | null;
  private readonly config: GamepadInputConfig;
  private enabled = true;
  private selectedIndex: number | null = null;
  private activeGamepad: Gamepad | null = null;
  private connectionKey: string | null = null;
  private previousButtons: boolean[] = [];
  private lastDeviceLabel = 'Standard Gamepad';
  private lastMapping = '';
  private lastGamepadTimestamp = -1;
  private lastInputAt: number | null = null;
  private continuous: GamepadContinuousState = { ...ZERO_CONTINUOUS };
  private throttleDiagnostics: Readonly<GamepadThrottleDiagnostics> = {
    ...ZERO_THROTTLE_DIAGNOSTICS,
  };
  private context: VehicleInputDeviceContext = {
    deltaTime: 0,
    controlMode: 'normal',
    manualClutchPedal: 1,
    actualClutchEngagement: 0,
  };
  private pendingReturnToAuto = false;
  private upHoldTime = -1;
  private upHoldSent = false;
  private pendingShiftUp = false;
  private pendingShiftDown = false;
  private pendingHandbrakeToggle = false;
  private pendingLeftIndicator = false;
  private pendingRightIndicator = false;
  private pendingHazard = false;
  private pendingCycleLights = false;
  private pendingEngineStart = false;
  private pendingCruiseToggle = false;
  private pendingCycleDriveMode = false;
  private pendingFogToggle = false;

  public constructor(options: GamepadInputOptions = {}) {
    this.id = options.id ?? 'gamepad';
    this.priority = options.priority ?? 20;
    this.config = { ...DEFAULT_GAMEPAD_INPUT_CONFIG, ...options.config };
    this.target = options.target === undefined
      ? (typeof window === 'undefined' ? null : window)
      : options.target;
    this.gamepadNavigator = options.navigator === undefined
      ? (typeof navigator === 'undefined' ? null : navigator)
      : options.navigator;
    this.target?.addEventListener('gamepadconnected', this.onGamepadConnected);
    this.target?.addEventListener('gamepaddisconnected', this.onGamepadDisconnected);
  }

  public get sourceInfo(): VehicleInputSourceInfo {
    const connected = this.enabled && this.selectedIndex !== null;
    const info: VehicleInputSourceInfo = {
      id: this.id,
      kind: 'gamepad',
      label: this.lastDeviceLabel,
      connected,
    };
    if (connected && this.selectedIndex !== null) info.gamepadIndex = this.selectedIndex;
    if (connected) info.mapping = this.lastMapping;
    return info;
  }

  /** Latest real browser object for the centralized capability-detecting haptics adapter. */
  public getActiveGamepad(): Gamepad | null {
    return this.enabled && this.activeGamepad?.connected === true ? this.activeGamepad : null;
  }

  /** Read-only RT stages for F2 tuning; a snapshot cannot alter input state. */
  public getThrottleDiagnostics(): Readonly<GamepadThrottleDiagnostics> {
    return { ...this.throttleDiagnostics };
  }

  public update(context: VehicleInputDeviceContext): void {
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
      // A held button during connection must not synthesize a new edge.
      this.upHoldTime = -1; this.upHoldSent = false;
      this.connectionKey = nextConnectionKey;
      this.previousButtons = pressed;
      this.clearPendingEdges();
    } else if (this.enabled) {
      if (this.isRisingEdge(pressed, 5)) { this.upHoldTime = 0; this.upHoldSent = false; }
      if (pressed[5] && !pressed[4] && this.upHoldTime >= 0) {
        this.upHoldTime += Math.max(0, context.deltaTime);
        if (this.upHoldTime >= 1 && !this.upHoldSent) {
          this.pendingReturnToAuto = true; this.upHoldSent = true;
        }
      } else { this.upHoldTime = -1; this.upHoldSent = false; }
      this.pendingShiftUp ||= this.isRisingEdge(pressed, 5); // RB
      this.pendingShiftDown ||= this.isRisingEdge(pressed, 4); // LB
      this.pendingFogToggle ||= this.isRisingEdge(pressed, 3); // Y
      this.pendingHandbrakeToggle ||= this.isRisingEdge(pressed, 0); // A
      this.pendingLeftIndicator ||= this.isRisingEdge(pressed, 14); // D-pad Left
      this.pendingRightIndicator ||= this.isRisingEdge(pressed, 15); // D-pad Right
      this.pendingHazard ||= this.isRisingEdge(pressed, 13); // D-pad Down
      this.pendingCycleLights ||= this.isRisingEdge(pressed, 12); // D-pad Up
      this.pendingEngineStart ||= this.isRisingEdge(pressed, 9); // Start
      this.pendingCruiseToggle ||= this.isRisingEdge(pressed, 2); // X
      this.pendingCycleDriveMode ||= this.isRisingEdge(pressed, 1); // B
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
      this.config.leftStickResponseExponent,
    );
    // Standard-mapped RT is already [0, 1]. Apply its deadzone and mild curve
    // once here; Engine.updateThrottle alone owns the temporal response filter.
    const rtRaw = this.getRawButtonValue(gamepad, 7);
    const rtNormalized = normalizeTrigger(rtRaw, this.config.throttleDeadzone);
    const throttle = Math.pow(rtNormalized, Math.max(0.01, this.config.throttleResponseExponent));
    this.throttleDiagnostics = { rtRaw, rtNormalized, throttleCommand: throttle };
    const brake = applyTriggerCurve(
      this.getButtonValue(gamepad, 6),
      this.config.triggerDeadzone,
      this.config.triggerResponseExponent,
    );
    const handbrake = this.getButtonValue(gamepad, 0); // A
    const rawRightX = gamepad.axes[2] ?? 0;
    const rawRightY = gamepad.axes[3] ?? 0;
    const look = context.controlMode === 'normal'
      ? applyRadialDeadzone(
        rawRightX,
        rawRightY,
        this.config.rightStickDeadzone,
        this.config.rightStickResponseExponent,
      )
      : { x: 0, y: 0 };

    // In manual mode X is deliberately ignored. The unshaped Y value is sent
    // to ManualClutchController, which owns its precision deadzone/curve.
    const clutchPedalRate = context.controlMode === 'manual-clutch'
      ? clamp(rawRightY, -1, 1)
      : 0;
    const highBeamFlash = pressed[10] === true; // L3 hold, never a mode toggle.
    const hornPressed = pressed[11] === true; // R3 hold, never a clutch mode toggle.
    const hasHeldControlButton = [0, 2, 3, 4, 5, 9, 10, 11, 12, 13, 14, 15]
      .some((buttonIndex) => pressed[buttonIndex] === true);
    const deviceActive =
      Math.abs(steering) > 0 || throttle > 0 || brake > 0 || handbrake > 0 ||
      Math.abs(look.x) > 0 || Math.abs(look.y) > 0 ||
      Math.abs(clutchPedalRate) > this.config.rightStickDeadzone ||
      hasHeldControlButton;
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
      deviceActive,
    };

    if (deviceActive && gamepad.timestamp !== this.lastGamepadTimestamp) {
      this.lastGamepadTimestamp = gamepad.timestamp;
      this.lastInputAt = this.now();
    }
  }

  public consumeState(): VehicleInputDeviceState {
    const info = this.sourceInfo;
    const active = this.continuous.deviceActive || this.hasPendingEdge();
    const state: VehicleInputDeviceState = {
      throttle: this.continuous.throttle,
      brake: this.continuous.brake,
      steering: this.continuous.steering,
      handbrake: this.continuous.handbrake,
      clutchPedal: this.context.manualClutchPedal,
      lookX: this.continuous.lookX,
      lookY: this.continuous.lookY,
      returnToAuto: this.pendingReturnToAuto,
      shiftUp: this.pendingShiftUp,
      shiftDown: this.pendingShiftDown,
      leftIndicator: this.pendingLeftIndicator,
      rightIndicator: this.pendingRightIndicator,
      hazard: this.pendingHazard,
      cycleLights: this.pendingCycleLights,
      engineStart: this.pendingEngineStart,
      cruiseToggle: this.pendingCruiseToggle,
      cycleDriveMode: this.pendingCycleDriveMode,
      fogToggle: this.pendingFogToggle,
      highBeamFlash: this.continuous.highBeamFlash,
      hornPressed: this.continuous.hornPressed,
      controlMode: this.context.controlMode,
      source: 'gamepad',
      sourceMetadata: {
        primary: info.connected ? info : null,
        active: active && info.connected ? [info] : [],
        connected: info.connected ? [info] : [],
        lastInputAt: this.lastInputAt,
      },
      deviceActive: active,
      toggleControlMode: false,
      toggleHandbrake: this.pendingHandbrakeToggle,
      clutchInputKind: this.context.controlMode === 'manual-clutch' ? 'rate' : 'none',
      clutchPedalRate: this.continuous.clutchPedalRate,
    };
    this.clearPendingEdges();
    return state;
  }

  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) this.activeGamepad = null;
    this.continuous = { ...ZERO_CONTINUOUS };
    this.throttleDiagnostics = { ...ZERO_THROTTLE_DIAGNOSTICS };
    this.clearPendingEdges();
    // Resynchronise held buttons before accepting new edges after re-enable.
    this.upHoldTime = -1; this.upHoldSent = false;
    this.connectionKey = null;
  }

  public dispose(): void {
    this.target?.removeEventListener('gamepadconnected', this.onGamepadConnected);
    this.target?.removeEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    this.clearConnection();
  }

  private pollGamepad(): Gamepad | null {
    if (this.gamepadNavigator === null) {
      this.clearConnection();
      return null;
    }

    let gamepads: readonly (Gamepad | null)[];
    try {
      gamepads = Array.from(this.gamepadNavigator.getGamepads());
    } catch {
      this.clearConnection();
      return null;
    }

    let selected = this.selectedIndex === null
      ? null
      : (gamepads[this.selectedIndex] ?? null);
    if (selected === null || !selected.connected) {
      selected = gamepads.find(
        (candidate): candidate is Gamepad =>
          candidate !== null && candidate.connected && candidate.mapping === 'standard',
      ) ?? gamepads.find(
        (candidate): candidate is Gamepad => candidate !== null && candidate.connected,
      ) ?? null;
    }

    if (selected === null) {
      this.clearConnection();
      return null;
    }

    if (this.selectedIndex !== selected.index) this.connectionKey = null;
    this.selectedIndex = selected.index;
    this.lastDeviceLabel = selected.id || 'Standard Gamepad';
    this.lastMapping = selected.mapping;
    this.activeGamepad = selected;
    return selected;
  }

  private readPressedButtons(gamepad: Gamepad): boolean[] {
    const buttonCount = Math.max(16, gamepad.buttons.length);
    const pressed = new Array<boolean>(buttonCount).fill(false);
    for (let index = 0; index < buttonCount; index += 1) {
      const button = gamepad.buttons[index];
      pressed[index] = button?.pressed === true || (button?.value ?? 0) > 0.5;
    }
    return pressed;
  }

  private isRisingEdge(current: readonly boolean[], index: number): boolean {
    return current[index] === true && this.previousButtons[index] !== true;
  }

  private getButtonValue(gamepad: Gamepad, index: number): number {
    return clamp01(this.getRawButtonValue(gamepad, index));
  }

  private getRawButtonValue(gamepad: Gamepad, index: number): number {
    const button = gamepad.buttons[index];
    if (button === undefined) return 0;
    return Number.isFinite(button.value) ? button.value : Number(button.pressed);
  }

  private readonly onGamepadConnected = (event: GamepadEvent): void => {
    if (this.selectedIndex !== null) return;
    this.selectedIndex = event.gamepad.index;
    this.lastDeviceLabel = event.gamepad.id || 'Standard Gamepad';
    this.lastMapping = event.gamepad.mapping;
    this.upHoldTime = -1; this.upHoldSent = false;
    this.connectionKey = null;
  };

  private readonly onGamepadDisconnected = (event: GamepadEvent): void => {
    if (event.gamepad.index !== this.selectedIndex) return;
    this.clearConnection();
  };

  private clearConnection(): void {
    this.selectedIndex = null;
    this.activeGamepad = null;
    this.upHoldTime = -1; this.upHoldSent = false;
    this.connectionKey = null;
    this.previousButtons = [];
    this.lastGamepadTimestamp = -1;
    this.continuous = { ...ZERO_CONTINUOUS };
    this.throttleDiagnostics = { ...ZERO_THROTTLE_DIAGNOSTICS };
    this.clearPendingEdges();
  }

  private clearPendingEdges(): void {
    this.pendingReturnToAuto = false;
    this.pendingShiftUp = false;
    this.pendingShiftDown = false;
    this.pendingHandbrakeToggle = false;
    this.pendingLeftIndicator = false;
    this.pendingRightIndicator = false;
    this.pendingHazard = false;
    this.pendingCycleLights = false;
    this.pendingEngineStart = false;
    this.pendingCruiseToggle = false;
    this.pendingCycleDriveMode = false;
    this.pendingFogToggle = false;
  }

  private hasPendingEdge(): boolean {
    return this.pendingReturnToAuto || this.pendingShiftUp || this.pendingShiftDown ||
      this.pendingHandbrakeToggle || this.pendingLeftIndicator ||
      this.pendingRightIndicator || this.pendingHazard ||
      this.pendingCycleLights || this.pendingEngineStart ||
      this.pendingCruiseToggle || this.pendingCycleDriveMode || this.pendingFogToggle;
  }

  private now(): number {
    return typeof performance === 'undefined' ? Date.now() : performance.now();
  }
}
