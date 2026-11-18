import type {
  VehicleControlMode,
  VehicleInputSourceInfo,
  VehicleInputState,
} from './VehicleInputState';

export interface VehicleInputDeviceContext {
  deltaTime: number;
  controlMode: VehicleControlMode;
  /** Current pedal position owned by the manual-clutch controller. */
  manualClutchPedal: number;
  /** Current simulated engagement, supplied by VehicleDynamics via the game. */
  actualClutchEngagement: number;
}

export type ClutchInputKind = 'none' | 'rate' | 'absolute';

/**
 * Device-local extension of the public state. `clutchPedalRate`,
 * `toggleControlMode` and `toggleHandbrake` are resolved by
 * VehicleInputSystem and never leak into vehicle physics. A future
 * three-pedal device can use `absolute` and place its physical pedal position
 * in VehicleInputState.clutchPedal.
 */
export interface VehicleInputDeviceState extends VehicleInputState {
  deviceActive: boolean;
  toggleControlMode: boolean;
  /** Rising-edge request; VehicleInputSystem owns the persistent latch. */
  toggleHandbrake: boolean;
  clutchInputKind: ClutchInputKind;
  /** Positive presses the clutch pedal; negative releases it. */
  clutchPedalRate: number;
}

/** Adapter contract implemented by keyboard, gamepad and future wheel input. */
export interface VehicleInputDevice {
  readonly id: string;
  /** Higher-priority devices win ties between competing signed axes. */
  readonly priority: number;
  readonly sourceInfo: VehicleInputSourceInfo;

  update(context: VehicleInputDeviceContext): void;
  /** Returns a snapshot and consumes only this device's latched edges. */
  consumeState(): VehicleInputDeviceState;
  setEnabled(enabled: boolean): void;
  dispose(): void;
}
