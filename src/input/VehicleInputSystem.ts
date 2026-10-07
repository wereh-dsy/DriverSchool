import { GamepadInput, type GamepadInputOptions } from './GamepadInput';
import { KeyboardInput, type KeyboardInputOptions } from './KeyboardInput';
import {
  ManualClutchController,
  type ManualClutchControllerConfig,
} from './ManualClutchController';
import type {
  VehicleInputDevice,
  VehicleInputDeviceState,
} from './VehicleInputDevice';
import {
  createNeutralVehicleInputState,
  type RequestedGear,
  type DriveSelector,
  type VehicleControlMode,
  type VehicleInputSource,
  type VehicleInputSourceInfo,
  type VehicleInputSourceMetadata,
  type VehicleInputState,
} from './VehicleInputState';
import { clamp, clamp01 } from './inputMath';

export interface VehicleInputSystemOptions {
  /** Pass false to omit the built-in adapter (useful for deterministic tests). */
  keyboard?: KeyboardInputOptions | false;
  /** Pass false to omit the built-in adapter (useful for deterministic tests). */
  gamepad?: GamepadInputOptions | false;
  devices?: readonly VehicleInputDevice[];
  manualClutch?: Partial<ManualClutchControllerConfig>;
  initialControlMode?: VehicleControlMode;
}

interface DiscreteInputFrame {
  shiftUp: boolean;
  shiftDown: boolean;
  leftIndicator: boolean;
  rightIndicator: boolean;
  hazard: boolean;
  cycleLights: boolean;
  engineStart: boolean;
  cruiseToggle: boolean;
  fogToggle: boolean;
  cycleWipers: boolean;
  cycleDriveMode: boolean;
  directGear?: RequestedGear;
  driveSelector?: DriveSelector;
}

/**
 * Aggregates every input device into the one VehicleInputState contract.
 * Device APIs stop here: VehicleDynamics only ever receives normalized state.
 */
export class VehicleInputSystem {
  public readonly keyboard: KeyboardInput | null;
  public readonly gamepad: GamepadInput | null;

  private readonly devices: VehicleInputDevice[] = [];
  private readonly manualClutch: ManualClutchController;
  private readonly pendingDiscreteFrames: DiscreteInputFrame[] = [];
  private enabled = true;
  private mode: VehicleControlMode;
  private latestState: VehicleInputState;
  private primarySourceId: string | null = null;
  private lastInputAt: number | null = null;
  /** Persistent parking-brake state shared by every input device. */
  private handbrakeLatched = false;

  public constructor(options: VehicleInputSystemOptions = {}) {
    this.mode = options.initialControlMode ?? 'normal';
    this.manualClutch = new ManualClutchController(options.manualClutch);
    this.latestState = createNeutralVehicleInputState(this.mode, 1);

    this.keyboard = options.keyboard === false
      ? null
      : new KeyboardInput(options.keyboard);
    this.gamepad = options.gamepad === false
      ? null
      : new GamepadInput(options.gamepad);
    if (this.keyboard !== null) this.registerDevice(this.keyboard);
    if (this.gamepad !== null) this.registerDevice(this.gamepad);
    for (const device of options.devices ?? []) this.registerDevice(device);
  }

  public get controlMode(): VehicleControlMode {
    return this.mode;
  }

  public get manualClutchPedal(): number {
    return this.manualClutch.clutchPedal;
  }

  public get isHandbrakeLatched(): boolean {
    return this.handbrakeLatched;
  }

  /**
   * Register a wheel/pedal or other adapter. Its implementation remains fully
   * outside physics as long as it implements VehicleInputDevice.
   */
  public registerDevice(device: VehicleInputDevice): () => void {
    if (this.devices.some((candidate) => candidate.id === device.id)) {
      throw new Error(`Vehicle input device id already registered: ${device.id}`);
    }
    this.devices.push(device);
    this.devices.sort((left, right) => right.priority - left.priority);
    device.setEnabled(this.enabled);
    return () => this.unregisterDevice(device.id);
  }

  public unregisterDevice(deviceOrId: VehicleInputDevice | string): boolean {
    const id = typeof deviceOrId === 'string' ? deviceOrId : deviceOrId.id;
    const index = this.devices.findIndex((device) => device.id === id);
    if (index < 0) return false;
    const [removed] = this.devices.splice(index, 1);
    removed?.dispose();
    if (this.primarySourceId === id) this.primarySourceId = null;
    return true;
  }

  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    for (const device of this.devices) device.setEnabled(enabled);
    if (!enabled) {
      this.pendingDiscreteFrames.length = 0;
      this.primarySourceId = null;
      this.latestState = createNeutralVehicleInputState(
        this.mode,
        this.latestState.clutchPedal,
      );
      // Input suspension must not release a parked vehicle.
      this.latestState.handbrake = Number(this.handbrakeLatched);
    }
  }

  /**
   * Explicit mode selection for UI/testing. Entering manual mode always starts
   * at the actual simulated engagement, never at a stale stick position.
   */
  public setControlMode(
    mode: VehicleControlMode,
    actualClutchEngagement = this.manualClutch.clutchEngagement,
  ): void {
    if (mode === this.mode) return;
    if (mode === 'manual-clutch') {
      this.manualClutch.takeOver(this.safeActualEngagement(actualClutchEngagement));
    }
    this.mode = mode;
    this.latestState = {
      ...this.latestState,
      clutchPedal: mode === 'manual-clutch'
        ? this.manualClutch.clutchPedal
        : 1 - this.safeActualEngagement(actualClutchEngagement),
      lookX: 0,
      lookY: 0,
      controlMode: mode,
    };
  }

  /** Poll/update once per render frame before running fixed vehicle steps. */
  public update(deltaTime: number, actualClutchEngagement: number): void {
    const actualEngagement = this.safeActualEngagement(actualClutchEngagement);
    const dt = Number.isFinite(deltaTime) && deltaTime > 0 ? deltaTime : 0;
    const pedalBeforeUpdate = this.mode === 'manual-clutch'
      ? this.manualClutch.clutchPedal
      : 1 - actualEngagement;
    const context = {
      deltaTime: dt,
      controlMode: this.mode,
      manualClutchPedal: pedalBeforeUpdate,
      actualClutchEngagement: actualEngagement,
    } as const;
    const samples: VehicleInputDeviceState[] = [];
    for (const device of this.devices) {
      device.update(context);
      samples.push(device.consumeState());
    }

    // Devices report only a debounced rising edge. The latch deliberately
    // lives here so keyboard/gamepad switching and hot-plugging cannot release
    // the parking brake.
    if (samples.some((sample) => sample.toggleHandbrake)) {
      this.handbrakeLatched = !this.handbrakeLatched;
    }

    const requestedModeToggle = samples.some((sample) => sample.toggleControlMode);
    if (requestedModeToggle) {
      if (this.mode === 'normal') {
        this.manualClutch.takeOver(actualEngagement);
        this.mode = 'manual-clutch';
      } else {
        this.mode = 'normal';
      }
    }

    const continuous = this.combineContinuous(samples);
    let clutchPedal: number;
    if (this.mode === 'manual-clutch') {
      const absoluteClutch = samples.find(
        (sample) => sample.clutchInputKind === 'absolute' &&
          sample.sourceMetadata.primary?.connected === true,
      );
      if (absoluteClutch !== undefined) {
        clutchPedal = this.manualClutch.setPedal(absoluteClutch.clutchPedal);
      } else if (!requestedModeToggle) {
        const clutchRate = this.strongestSignedAxis(
          samples.map((sample) =>
            sample.clutchInputKind === 'rate' ? sample.clutchPedalRate : 0),
        );
        clutchPedal = this.manualClutch.update(dt, clutchRate);
      } else {
        // The keyboard mode-toggle frame performs only the takeover, preventing
        // a diagonal stick position from moving the pedal immediately.
        clutchPedal = this.manualClutch.clutchPedal;
      }
      // The right stick is exclusively a clutch control in manual mode.
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
      cycleWipers: false,
      cycleDriveMode: false,
      highBeamFlash: samples.some((sample) => sample.highBeamFlash === true),
      hornPressed: samples.some((sample) => sample.hornPressed === true),
      controlMode: this.mode,
      source,
      sourceMetadata,
    };
  }

  /**
   * Consume one queued discrete frame. Continuous input is always the latest
   * sample. If no fixed step ran, queued edges survive until a later call.
   */
  public consumeState(): VehicleInputState {
    const discrete = this.pendingDiscreteFrames.shift();
    return this.copyStateWithDiscrete(discrete);
  }

  /** Inspect without consuming the next shift/gear edge. */
  public peekState(): VehicleInputState {
    return this.copyStateWithDiscrete(this.pendingDiscreteFrames[0]);
  }

  public dispose(): void {
    for (const device of this.devices.splice(0)) device.dispose();
    this.pendingDiscreteFrames.length = 0;
    this.primarySourceId = null;
  }

  private combineContinuous(samples: readonly VehicleInputDeviceState[]): {
    throttle: number;
    brake: number;
    steering: number;
    lookX: number;
    lookY: number;
  } {
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

  private enqueueDiscreteFrame(samples: readonly VehicleInputDeviceState[]): void {
    let shiftUp = false;
    let shiftDown = false;
    let leftIndicator = false;
    let rightIndicator = false;
    let hazard = false;
    let cycleLights = false;
    let engineStart = false;
    let cruiseToggle = false;
    let fogToggle = false;
    let cycleWipers = false;
    let cycleDriveMode = false;
    let directGear: RequestedGear | undefined;
    let driveSelector: DriveSelector | undefined;
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
      cycleWipers ||= sample.cycleWipers === true;
      cycleDriveMode ||= sample.cycleDriveMode === true;
      // Samples are priority-sorted, so the first direct request wins a tie.
      if (directGear === undefined && sample.directGear !== undefined) {
        directGear = sample.directGear;
      }
      if (driveSelector === undefined && sample.driveSelector !== undefined) driveSelector = sample.driveSelector;
    }
    if (
      !shiftUp && !shiftDown && !leftIndicator && !rightIndicator && !hazard &&
      !cycleLights && !engineStart && !cruiseToggle && !fogToggle && !cycleWipers && !cycleDriveMode && directGear === undefined && driveSelector === undefined
    ) return;
    const frame: DiscreteInputFrame = {
      shiftUp,
      shiftDown,
      leftIndicator,
      rightIndicator,
      hazard,
      cycleLights,
      engineStart,
      cruiseToggle,
      fogToggle,
      cycleWipers,
      cycleDriveMode,
    };
    if (directGear !== undefined) frame.directGear = directGear;
    if (driveSelector !== undefined) frame.driveSelector = driveSelector;
    this.pendingDiscreteFrames.push(frame);
  }

  private buildSourceMetadata(
    samples: readonly VehicleInputDeviceState[],
  ): VehicleInputSourceMetadata {
    const connected = this.uniqueSources(
      samples.flatMap((sample) => sample.sourceMetadata.connected),
    );
    const active = this.uniqueSources(
      samples
        .filter((sample) => sample.deviceActive)
        .flatMap((sample) => sample.sourceMetadata.active),
    );
    const newestDeviceTimestamp = samples.reduce<number | null>((newest, sample) => {
      const timestamp = sample.sourceMetadata.lastInputAt;
      if (timestamp === null) return newest;
      return newest === null ? timestamp : Math.max(newest, timestamp);
    }, null);
    if (active.length > 0) {
      this.primarySourceId = active[0]?.id ?? null;
      this.lastInputAt = newestDeviceTimestamp ?? this.now();
    } else if (
      this.primarySourceId === null ||
      !connected.some((source) => source.id === this.primarySourceId)
    ) {
      this.primarySourceId = connected[0]?.id ?? null;
    }
    const primary = connected.find((source) => source.id === this.primarySourceId) ?? null;
    return { primary, active, connected, lastInputAt: this.lastInputAt };
  }

  private uniqueSources(sources: readonly VehicleInputSourceInfo[]): VehicleInputSourceInfo[] {
    const seen = new Set<string>();
    return sources.filter((source) => {
      if (seen.has(source.id)) return false;
      seen.add(source.id);
      return true;
    });
  }

  private copyStateWithDiscrete(discrete: DiscreteInputFrame | undefined): VehicleInputState {
    const state: VehicleInputState = {
      ...this.latestState,
      sourceMetadata: {
        ...this.latestState.sourceMetadata,
        active: [...this.latestState.sourceMetadata.active],
        connected: [...this.latestState.sourceMetadata.connected],
      },
      shiftUp: discrete?.shiftUp ?? false,
      shiftDown: discrete?.shiftDown ?? false,
      leftIndicator: discrete?.leftIndicator ?? false,
      rightIndicator: discrete?.rightIndicator ?? false,
      hazard: discrete?.hazard ?? false,
      cycleLights: discrete?.cycleLights ?? false,
      engineStart: discrete?.engineStart ?? false,
      cruiseToggle: discrete?.cruiseToggle ?? false,
      fogToggle: discrete?.fogToggle ?? false,
      cycleWipers: discrete?.cycleWipers ?? false,
      cycleDriveMode: discrete?.cycleDriveMode ?? false,
    };
    if (discrete?.directGear !== undefined) state.directGear = discrete.directGear;
    else delete state.directGear;
    if (discrete?.driveSelector !== undefined) state.driveSelector = discrete.driveSelector;
    else delete state.driveSelector;
    return state;
  }

  private strongestSignedAxis(axes: readonly number[]): number {
    let strongest = 0;
    for (const axis of axes) {
      const safeAxis = clamp(axis, -1, 1);
      if (Math.abs(safeAxis) > Math.abs(strongest)) strongest = safeAxis;
    }
    return strongest;
  }

  private safeActualEngagement(value: number): number {
    return Number.isFinite(value) ? clamp01(value) : this.manualClutch.clutchEngagement;
  }

  private toPublicSource(source: VehicleInputSourceInfo | null): VehicleInputSource {
    if (source?.kind === 'gamepad' || source?.kind === 'wheel') return source.kind;
    return 'keyboard';
  }

  private now(): number {
    return typeof performance === 'undefined' ? Date.now() : performance.now();
  }
}
