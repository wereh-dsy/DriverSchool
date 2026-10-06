/** The two driver-assistance modes exposed by the input layer. */
export type VehicleControlMode = 'normal' | 'manual-clutch';

/** Gear requests supported by the current sequential/direct-selection UI. */
export type RequestedGear = 'R' | 'N' | 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** Selector requests are separate from mechanical/manual gear requests. */
export type DriveSelector = 'P' | 'R' | 'N' | 'D';

/**
 * Broad source kinds keep the public contract open to wheels, pedal sets and
 * other controllers without making vehicle physics depend on their APIs.
 */
export type VehicleInputSource = 'keyboard' | 'gamepad' | 'wheel';

export type VehicleInputSourceKind = VehicleInputSource | 'unknown';

export interface VehicleInputSourceInfo {
  /** Stable identifier within one VehicleInputSystem instance. */
  id: string;
  kind: VehicleInputSourceKind;
  label: string;
  connected: boolean;
  /** Present for browser Gamepad API devices. */
  gamepadIndex?: number;
  /** Browser-reported Gamepad.mapping value, normally "standard". */
  mapping?: string;
}

export interface VehicleInputSourceMetadata {
  /** Most recently active source, or a connected source before first input. */
  primary: VehicleInputSourceInfo | null;
  /** Sources which contributed non-zero input during the latest update. */
  active: readonly VehicleInputSourceInfo[];
  /** All devices currently available to the aggregator. */
  connected: readonly VehicleInputSourceInfo[];
  /** High-resolution timestamp of the latest detected input, when available. */
  lastInputAt: number | null;
}

/**
 * The sole input contract consumed by vehicle/game systems.
 *
 * Continuous values are normalized. `throttle`, `brake`, `handbrake` and
 * `clutchPedal` are in [0, 1], while steering/look axes are in [-1, 1].
 * Discrete fields are latched edges: one call to consumeState() observes an
 * edge once, regardless of render rate or the number of fixed physics steps.
 */
export interface VehicleInputState {
  throttle: number;
  brake: number;
  steering: number;
  /** Persistent 0/1 latch owned by VehicleInputSystem, not a held button. */
  handbrake: number;
  /** 0 = released/engaged clutch, 1 = fully pressed/disengaged clutch. */
  clutchPedal: number;
  lookX: number;
  lookY: number;
  shiftUp: boolean;
  shiftDown: boolean;
  /** Toggle-request edges; these are commands, not persistent lamp states. */
  leftIndicator: boolean;
  rightIndicator: boolean;
  hazard: boolean;
  cycleLights: boolean;
  engineStart: boolean;
  /** Request edge for an optional vehicle-level cruise controller. */
  cruiseToggle: boolean;
  /** Discrete toggle; held buttons never repeat this command. */
  fogToggle?: boolean;
  /** Momentary controls, independent from persistent light/gear modes. */
  highBeamFlash?: boolean;
  hornPressed?: boolean;
  driveSelector?: DriveSelector;
  directGear?: RequestedGear;
  controlMode: VehicleControlMode;
  /** Lightweight discriminator used by HUD/gameplay messaging. */
  source: VehicleInputSource;
  /** Full diagnostics for hot-plugging and mixed-device input. */
  sourceMetadata: VehicleInputSourceMetadata;
}

export function createNeutralVehicleInputState(
  controlMode: VehicleControlMode = 'normal',
  clutchPedal = 1,
): VehicleInputState {
  return {
    throttle: 0,
    brake: 0,
    steering: 0,
    handbrake: 0,
    clutchPedal: clamp01(clutchPedal),
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
    source: 'keyboard',
    sourceMetadata: {
      primary: null,
      active: [],
      connected: [],
      lastInputAt: null,
    },
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
