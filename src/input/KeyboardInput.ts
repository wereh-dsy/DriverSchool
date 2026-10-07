import type {
  VehicleInputDevice,
  VehicleInputDeviceContext,
  VehicleInputDeviceState,
} from './VehicleInputDevice';
import type {
  RequestedGear,
  DriveSelector,
  VehicleInputSourceInfo,
} from './VehicleInputState';
import {
  createKeyboardBindings,
  DEFAULT_KEYBOARD_BINDINGS,
  RESERVED_GAME_KEYS,
  type KeyboardBindings,
  type KeyboardDrivingAction,
} from './KeyboardBindings';

const BINDINGS_STORAGE_KEY = 'drivergame.keyboard-bindings.v1';

export interface KeyboardInputResponseConfig {
  /** Seconds^-1. A default keyboard press reaches full throttle in ~1.15 s. */
  throttleRiseRate: number;
  throttleFallRate: number;
  steeringRiseRate: number;
  steeringReturnRate: number;
}

export const DEFAULT_KEYBOARD_INPUT_RESPONSE: Readonly<KeyboardInputResponseConfig> = {
  throttleRiseRate: 0.88,
  throttleFallRate: 2.8,
  steeringRiseRate: 2.15,
  steeringReturnRate: 3.8,
};

export interface KeyboardInputOptions {
  target?: Window | null;
  id?: string;
  priority?: number;
  bindings?: Partial<KeyboardBindings>;
  response?: Partial<KeyboardInputResponseConfig>;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}

/** Keyboard adapter producing the same normalized contract as every device. */
export class KeyboardInput implements VehicleInputDevice {
  public readonly id: string;
  public readonly priority: number;

  private readonly target: Window | null;
  private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  private readonly response: KeyboardInputResponseConfig;
  private bindings: KeyboardBindings;
  private readonly held = new Set<KeyboardDrivingAction>();
  private enabled = true;
  private throttleValue = 0;
  private steeringValue = 0;
  private pendingShiftUp = false;
  private pendingShiftDown = false;
  private pendingDirectGear: RequestedGear | undefined;
  private pendingModeToggle = false;
  private pendingHandbrakeToggle = false;
  private pendingLeftIndicator = false;
  private pendingRightIndicator = false;
  private pendingHazard = false;
  private pendingCycleLights = false;
  private pendingEngineStart = false;
  private pendingCruiseToggle = false;
  private pendingFogToggle = false;
  private pendingDriveSelector: DriveSelector | undefined;
  private lastInputAt: number | null = null;
  private context: VehicleInputDeviceContext = {
    deltaTime: 0,
    controlMode: 'normal',
    manualClutchPedal: 1,
    actualClutchEngagement: 0,
  };

  public constructor(options: KeyboardInputOptions = {}) {
    this.id = options.id ?? 'keyboard';
    this.priority = options.priority ?? 10;
    this.target = options.target === undefined
      ? (typeof window === 'undefined' ? null : window)
      : options.target;
    this.storage = options.storage === undefined
      ? this.getDefaultStorage()
      : options.storage;
    this.response = { ...DEFAULT_KEYBOARD_INPUT_RESPONSE, ...options.response };
    this.bindings = createKeyboardBindings({
      ...this.readStoredBindings(),
      ...options.bindings,
    });
    this.target?.addEventListener('keydown', this.onKeyDown, { passive: false });
    this.target?.addEventListener('keyup', this.onKeyUp, { passive: false });
    this.target?.addEventListener('blur', this.onBlur);
  }

  public get sourceInfo(): VehicleInputSourceInfo {
    return {
      id: this.id,
      kind: 'keyboard',
      label: 'Keyboard',
      connected: this.enabled && this.target !== null,
    };
  }

  public update(context: VehicleInputDeviceContext): void {
    this.context = context;
    const dt = Number.isFinite(context.deltaTime) ? Math.max(0, context.deltaTime) : 0;
    const throttleTarget = this.enabled && this.held.has('throttle') ? 1 : 0;
    const steeringTarget = this.enabled
      ? Number(this.held.has('steerRight')) - Number(this.held.has('steerLeft'))
      : 0;
    this.throttleValue = this.moveTowards(
      this.throttleValue,
      throttleTarget,
      (throttleTarget > this.throttleValue
        ? this.response.throttleRiseRate
        : this.response.throttleFallRate) * dt,
    );
    const steeringRate = steeringTarget === 0
      ? this.response.steeringReturnRate
      : this.response.steeringRiseRate;
    this.steeringValue = this.moveTowards(
      this.steeringValue,
      steeringTarget,
      steeringRate * dt,
    );
  }

  public consumeState(): VehicleInputDeviceState {
    const info = this.sourceInfo;
    const left = this.enabled && this.held.has('steerLeft');
    const right = this.enabled && this.held.has('steerRight');
    const clutchRelease = this.enabled && this.held.has('clutchRelease');
    const clutchPress = this.enabled && this.held.has('clutchPress');
    const clutchPedalRate = this.context.controlMode === 'manual-clutch'
      ? Number(clutchPress) - Number(clutchRelease)
      : 0;
    const throttle = this.enabled ? this.throttleValue : 0;
    const brake = this.enabled && this.held.has('brake') ? 1 : 0;
    const handbrake = this.enabled && this.held.has('handbrake') ? 1 : 0;
    const shiftUp = this.enabled && this.pendingShiftUp;
    const shiftDown = this.enabled && this.pendingShiftDown;
    const directGear = this.enabled ? this.pendingDirectGear : undefined;
    const toggleControlMode = this.enabled && this.pendingModeToggle;
    const toggleHandbrake = this.enabled && this.pendingHandbrakeToggle;
    const leftIndicator = this.enabled && this.pendingLeftIndicator;
    const rightIndicator = this.enabled && this.pendingRightIndicator;
    const hazard = this.enabled && this.pendingHazard;
    const cycleLights = this.enabled && this.pendingCycleLights;
    const engineStart = this.enabled && this.pendingEngineStart;
    const cruiseToggle = this.enabled && this.pendingCruiseToggle;
    const fogToggle = this.enabled && this.pendingFogToggle;
    const highBeamFlash = this.enabled && this.held.has('highBeamFlash');
    const hornPressed = this.enabled && this.held.has('horn');
    const driveSelector = this.enabled ? this.pendingDriveSelector : undefined;
    const deviceActive =
      throttle > 0 || brake > 0 || handbrake > 0 || left || right ||
      Math.abs(this.steeringValue) > 1e-4 ||
      clutchPedalRate !== 0 || shiftUp || shiftDown || directGear !== undefined ||
      toggleControlMode || toggleHandbrake || leftIndicator || rightIndicator ||
      hazard || cycleLights || engineStart || cruiseToggle || fogToggle || highBeamFlash || hornPressed || driveSelector !== undefined;

    const state: VehicleInputDeviceState = {
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
      cruiseToggle,
      fogToggle,
      highBeamFlash,
      hornPressed,
      controlMode: this.context.controlMode,
      source: 'keyboard',
      sourceMetadata: {
        primary: info.connected ? info : null,
        active: deviceActive ? [info] : [],
        connected: info.connected ? [info] : [],
        lastInputAt: this.lastInputAt,
      },
      deviceActive,
      toggleControlMode,
      toggleHandbrake,
      clutchInputKind: this.context.controlMode === 'manual-clutch' ? 'rate' : 'none',
      clutchPedalRate,
    };
    if (directGear !== undefined) state.directGear = directGear;
    if (driveSelector !== undefined) state.driveSelector = driveSelector;

    this.pendingShiftUp = false;
    this.pendingShiftDown = false;
    this.pendingDirectGear = undefined;
    this.pendingModeToggle = false;
    this.pendingHandbrakeToggle = false;
    this.pendingLeftIndicator = false;
    this.pendingRightIndicator = false;
    this.pendingHazard = false;
    this.pendingCycleLights = false;
    this.pendingEngineStart = false;
    this.pendingCruiseToggle = false;
    this.pendingFogToggle = false;
    this.pendingDriveSelector = undefined;
    return state;
  }

  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.reset();
  }

  public getBindings(): KeyboardBindings {
    return { ...this.bindings };
  }

  /**
   * Rebinds one action. If the requested key is already used, the two actions
   * swap keys so every driving action remains reachable.
   */
  public setBinding(action: KeyboardDrivingAction, code: string): void {
    if (
      !(action in this.bindings) ||
      typeof code !== 'string' ||
      code.length === 0 ||
      RESERVED_GAME_KEYS.has(code) ||
      code.startsWith('F')
    ) return;
    const previousCode = this.bindings[action];
    const conflictingAction = (Object.keys(this.bindings) as KeyboardDrivingAction[])
      .find((candidate) => candidate !== action && this.bindings[candidate] === code);
    this.bindings[action] = code;
    if (conflictingAction !== undefined) this.bindings[conflictingAction] = previousCode;
    this.reset();
    this.persistBindings();
  }

  public resetBindings(): void {
    this.bindings = createKeyboardBindings(DEFAULT_KEYBOARD_BINDINGS);
    this.reset();
    try {
      this.storage?.removeItem(BINDINGS_STORAGE_KEY);
    } catch {
      // Storage may be unavailable in privacy/sandboxed contexts.
    }
  }

  public dispose(): void {
    this.target?.removeEventListener('keydown', this.onKeyDown);
    this.target?.removeEventListener('keyup', this.onKeyUp);
    this.target?.removeEventListener('blur', this.onBlur);
    this.reset();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled || event.ctrlKey || event.metaKey || event.altKey) return;
    const action = this.findAction(event.code);
    if (action === undefined) return;
    event.preventDefault();

    this.held.add(action);
    this.lastInputAt = event.timeStamp;
    if (event.repeat) return;

    if (action === 'shiftUp') this.pendingShiftUp = true;
    if (action === 'shiftDown') this.pendingShiftDown = true;
    if (action === 'reverse') this.pendingDirectGear = 'R';
    if (action === 'neutral') this.pendingDirectGear = 'N';
    if (action === 'toggleClutchMode') this.pendingModeToggle = true;
    if (action === 'handbrake') this.pendingHandbrakeToggle = true;
    if (action === 'leftIndicator') this.pendingLeftIndicator = true;
    if (action === 'rightIndicator') this.pendingRightIndicator = true;
    if (action === 'hazard') this.pendingHazard = true;
    if (action === 'cycleLights') this.pendingCycleLights = true;
    if (action === 'engineStart') this.pendingEngineStart = true;
    if (action === 'cruiseToggle') this.pendingCruiseToggle = true;
    if (action === 'fogToggle') this.pendingFogToggle = true;
    const selectorByAction: Partial<Record<KeyboardDrivingAction, DriveSelector>> = {
      selectorPark: 'P', selectorReverse: 'R', selectorNeutral: 'N', selectorDrive: 'D',
    };
    const selector = selectorByAction[action];
    if (selector !== undefined) this.pendingDriveSelector = selector;
    const directGearByAction: Partial<Record<KeyboardDrivingAction, RequestedGear>> = {
      gear1: 1,
      gear2: 2,
      gear3: 3,
      gear4: 4,
      gear5: 5,
      gear6: 6,
      gear7: 7,
    };
    const directGear = directGearByAction[action];
    if (directGear !== undefined) this.pendingDirectGear = directGear;
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const action = this.findAction(event.code);
    if (action === undefined || !this.held.delete(action)) return;
    event.preventDefault();
    this.lastInputAt = event.timeStamp;
  };

  private readonly onBlur = (): void => this.reset();

  private reset(): void {
    this.held.clear();
    this.throttleValue = 0;
    this.steeringValue = 0;
    this.pendingShiftUp = false;
    this.pendingShiftDown = false;
    this.pendingDirectGear = undefined;
    this.pendingModeToggle = false;
    this.pendingHandbrakeToggle = false;
    this.pendingLeftIndicator = false;
    this.pendingRightIndicator = false;
    this.pendingHazard = false;
    this.pendingCycleLights = false;
    this.pendingEngineStart = false;
    this.pendingCruiseToggle = false;
    this.pendingFogToggle = false;
    this.pendingDriveSelector = undefined;
  }

  private findAction(code: string): KeyboardDrivingAction | undefined {
    return (Object.keys(this.bindings) as KeyboardDrivingAction[])
      .find((action) => this.bindings[action] === code);
  }

  private moveTowards(current: number, target: number, maximumDelta: number): number {
    if (!Number.isFinite(current) || !Number.isFinite(target)) return 0;
    if (maximumDelta <= 0) return current;
    const delta = target - current;
    if (Math.abs(delta) <= maximumDelta) return target;
    return current + Math.sign(delta) * maximumDelta;
  }

  private getDefaultStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  }

  private readStoredBindings(): Partial<KeyboardBindings> {
    try {
      const stored = this.storage?.getItem(BINDINGS_STORAGE_KEY);
      return stored === null || stored === undefined
        ? {}
        : JSON.parse(stored) as Partial<KeyboardBindings>;
    } catch {
      return {};
    }
  }

  private persistBindings(): void {
    try {
      this.storage?.setItem(BINDINGS_STORAGE_KEY, JSON.stringify(this.bindings));
    } catch {
      // A failed preference write must never disable driving input.
    }
  }
}
