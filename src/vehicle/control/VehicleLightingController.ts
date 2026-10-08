import type { VehicleInputState } from '../../input/VehicleInputState';

export type VehicleLightMode = 'off' | 'position' | 'low' | 'high';
export type ActiveTurnSignal = 'left' | 'right' | null;

export interface VehicleLightingState {
  readonly mainLightMode: VehicleLightMode;
  readonly fogLightsEnabled: boolean;
  readonly leftTurnSignal: boolean;
  readonly rightTurnSignal: boolean;
  readonly hazard: boolean;
  readonly brakeLight: boolean;
  readonly reverseLight: boolean;
  readonly highBeamFlash: boolean;
  readonly effectiveHighBeam: boolean;
  readonly positionLight: boolean;
  readonly lowBeam: boolean;
  readonly leftBlinkOn: boolean;
  readonly rightBlinkOn: boolean;
}

export interface VehicleLightingTelemetry {
  readonly autoOffWithIgnition?: boolean;
  readonly ignitionOn: boolean;
  /** The transmission's engaged output, never its last requested selector. */
  readonly actualGear: number | string;
  /** SI radians; positive right, negative left, matching the physical steering rack. */
  readonly steeringWheelAngle: number;
}

export interface TurnSignalAutoCancelConfig {
  readonly cancelArmAngleDeg: number;
  readonly cancelReturnAngleDeg: number;
}

export const DEFAULT_TURN_SIGNAL_AUTO_CANCEL: TurnSignalAutoCancelConfig = Object.freeze({
  cancelArmAngleDeg: 80, cancelReturnAngleDeg: 20,
});

/** Arm after a real turn, then cancel only on a return into the central band. */
export class TurnSignalAutoCancel {
  public armed = false;
  private selected: ActiveTurnSignal = null;
  private readonly armAngle: number;
  private readonly returnAngle: number;

  public constructor(config: Partial<TurnSignalAutoCancelConfig> = {}) {
    this.armAngle = (config.cancelArmAngleDeg ?? DEFAULT_TURN_SIGNAL_AUTO_CANCEL.cancelArmAngleDeg) * Math.PI / 180;
    this.returnAngle = (config.cancelReturnAngleDeg ?? DEFAULT_TURN_SIGNAL_AUTO_CANCEL.cancelReturnAngleDeg) * Math.PI / 180;
  }

  public reset(): void { this.armed = false; this.selected = null; }

  public update(signal: ActiveTurnSignal, steeringWheelAngle: number, hazard = false): boolean {
    if (signal !== this.selected || hazard) {
      this.armed = false;
      this.selected = hazard ? null : signal;
    }
    if (hazard || signal === null || !Number.isFinite(steeringWheelAngle)) return false;
    const directionAngle = steeringWheelAngle * (signal === 'left' ? -1 : 1);
    if (!this.armed && directionAngle >= this.armAngle) this.armed = true;
    if (this.armed && Math.abs(steeringWheelAngle) <= this.returnAngle) {
      this.reset();
      return true;
    }
    return false;
  }
}

/** The sole lamp-state authority. Visuals only consume its resolved output. */
export class VehicleLightingController {
  public readonly autoCancel: TurnSignalAutoCancel;
  private mode: VehicleLightMode = 'off';
  private fog = false;
  private signal: ActiveTurnSignal = null;
  private hazard = false;
  private blinkTime = 0;
  private brake = false;
  private reverse = false;
  private flash = false;
  private lightPowerAvailable = true;

  public constructor(cancelConfig: Partial<TurnSignalAutoCancelConfig> = {}) {
    this.autoCancel = new TurnSignalAutoCancel(cancelConfig);
  }

  public get state(): VehicleLightingState {
    const blinkOn = Math.floor(this.blinkTime * 2.1) % 2 === 0;
    const mode = this.lightPowerAvailable ? this.mode : 'off';
    const effectiveHighBeam = this.lightPowerAvailable && (mode === 'high' || this.flash);
    return {
      mainLightMode: mode, fogLightsEnabled: this.lightPowerAvailable && this.fog,
      leftTurnSignal: this.signal === 'left', rightTurnSignal: this.signal === 'right',
      hazard: this.hazard, brakeLight: this.brake, reverseLight: this.reverse,
      highBeamFlash: this.flash, effectiveHighBeam,
      positionLight: mode !== 'off', lowBeam: mode === 'low' || mode === 'high',
      leftBlinkOn: blinkOn && (this.hazard || this.signal === 'left'),
      rightBlinkOn: blinkOn && (this.hazard || this.signal === 'right'),
    };
  }

  public setMainLightMode(mode: VehicleLightMode): VehicleLightingState {
    this.mode = mode;
    if (mode === 'off') this.fog = false;
    return this.state;
  }

  public cycleMainLightMode(): VehicleLightingState {
    const modes: readonly VehicleLightMode[] = ['off', 'position', 'low', 'high'];
    return this.setMainLightMode(modes[(modes.indexOf(this.mode) + 1) % modes.length]!);
  }

  public toggleFog(): VehicleLightingState {
    this.fog = !this.fog;
    if (this.fog && this.mode === 'off') this.mode = 'position';
    return this.state;
  }

  public reset(): void {
    this.mode = 'off'; this.fog = false; this.signal = null; this.hazard = false;
    this.blinkTime = 0; this.brake = false; this.reverse = false; this.flash = false;
    this.lightPowerAvailable = true;
    this.autoCancel.reset();
  }

  public update(deltaTime: number, input: Readonly<VehicleInputState>, telemetry: VehicleLightingTelemetry): VehicleLightingState {
    this.lightPowerAvailable = telemetry.autoOffWithIgnition !== true || telemetry.ignitionOn;
    if (input.cycleLights) this.cycleMainLightMode();
    if (input.fogToggle) this.toggleFog();
    if (input.hazard) {
      this.hazard = !this.hazard; this.signal = null;
      this.blinkTime = 0; this.autoCancel.reset();
    }
    if (input.leftIndicator) this.toggleSignal('left');
    if (input.rightIndicator) this.toggleSignal('right');
    if (this.autoCancel.update(this.signal, telemetry.steeringWheelAngle, this.hazard)) this.signal = null;
    this.flash = input.highBeamFlash === true;
    this.brake = Number.isFinite(input.brake) && input.brake > 0.04;
    this.reverse = telemetry.ignitionOn && telemetry.actualGear === 'R';
    this.blinkTime += Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0;
    return this.state;
  }

  private toggleSignal(signal: Exclude<ActiveTurnSignal, null>): void {
    this.signal = this.signal === signal && !this.hazard ? null : signal;
    this.hazard = false; this.blinkTime = 0; this.autoCancel.reset();
  }
}
