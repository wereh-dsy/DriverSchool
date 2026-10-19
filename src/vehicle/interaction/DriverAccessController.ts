/** A little rolling creep is treated as stationary for door/exit commands. */
export const DEFAULT_STATIONARY_SPEED_EPSILON = 0.25;

export type DriverDoorState = 'CLOSED' | 'OPENING' | 'OPEN' | 'CLOSING';

export interface DriverDoorConfig {
  readonly openSeconds: number;
  readonly closeSeconds: number;
}

export interface DriverWindowConfig {
  /** Seconds for the glass to travel the full closed-to-open range. */
  readonly travelSeconds: number;
}

export interface DriverAccessCommandResult {
  readonly accepted: boolean;
  readonly reason?: 'unsupported' | 'vehicle-moving' | 'not-near';
}

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/**
 * Continuous driver-door animation. Commands only change the target; the
 * current opening fraction always moves from its current value, so a reversal
 * during OPENING/CLOSING never restarts or teleports the mesh.
 */
export class DriverDoorController {
  private stateValue: DriverDoorState = 'CLOSED';
  private fraction = 0;
  private targetOpen = false;
  private openSeconds = 0.55;
  private closeSeconds = 0.65;

  public get state(): DriverDoorState {
    return this.stateValue;
  }

  /** 0 = fully closed, 1 = fully open. */
  public get openFraction(): number {
    return this.fraction;
  }

  public get wantsOpen(): boolean {
    return this.targetOpen;
  }

  public configure(config: DriverDoorConfig): void {
    this.openSeconds = Math.max(0.05, config.openSeconds);
    this.closeSeconds = Math.max(0.05, config.closeSeconds);
  }

  public reset(): void {
    this.stateValue = 'CLOSED';
    this.fraction = 0;
    this.targetOpen = false;
  }

  public open(): void {
    this.targetOpen = true;
    if (this.stateValue !== 'OPEN') this.stateValue = 'OPENING';
  }

  public close(): void {
    this.targetOpen = false;
    if (this.stateValue !== 'CLOSED') this.stateValue = 'CLOSING';
  }

  /** Reverses the current target without changing the current opening fraction. */
  public toggle(): void {
    if (this.targetOpen) this.close();
    else this.open();
  }

  public update(deltaSeconds: number): void {
    const dt = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
    if (dt <= 0) return;
    if (this.stateValue === 'OPENING') {
      this.fraction = Math.min(1, this.fraction + dt / this.openSeconds);
      if (this.fraction >= 1) {
        this.fraction = 1;
        this.stateValue = 'OPEN';
      }
    } else if (this.stateValue === 'CLOSING') {
      this.fraction = Math.max(0, this.fraction - dt / this.closeSeconds);
      if (this.fraction <= 0) {
        this.fraction = 0;
        this.stateValue = 'CLOSED';
      }
    }
  }
}

/**
 * Held electric-window switch. The fraction is continuous, holds its value
 * when released and reverses immediately without a position jump.
 */
export class DriverWindowController {
  private fraction = 0;
  private travelSeconds = 2.4;
  private stopped = false;
  private lastUp = false;
  private lastDown = false;

  /** 0 = fully closed, 1 = fully open. */
  public get openFraction(): number {
    return this.fraction;
  }

  public configure(config: DriverWindowConfig): void {
    this.travelSeconds = Math.max(0.1, config.travelSeconds);
  }

  public reset(): void {
    this.fraction = 0;
    this.stopped = false;
    this.lastUp = false;
    this.lastDown = false;
  }

  public setPosition(position: number): void {
    this.fraction = clamp01(position);
    this.stopped = false;
  }

  /** Explicit shared stop action; resumes when either switch changes state. */
  public stop(): void {
    this.stopped = true;
    // Forget the previous sample so the next switch press is always a change.
    this.lastUp = false;
    this.lastDown = false;
  }

  public update(deltaSeconds: number, up: boolean, down: boolean): void {
    const dt = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
    if (up !== this.lastUp || down !== this.lastDown) this.stopped = false;
    this.lastUp = up;
    this.lastDown = down;
    // Releasing both switches stops on the current intermediate fraction.
    if (dt <= 0 || up === down || this.stopped) return;
    const direction = down ? 1 : -1;
    this.fraction = clamp01(this.fraction + direction * dt / this.travelSeconds);
  }
}

/** Pure predicate used by tests and by the game-side exit request. */
export function canExitVehicle(input: {
  readonly driving: boolean;
  readonly engineRunning: boolean;
  readonly speedMetersPerSecond: number;
}): boolean {
  // The engine deliberately may keep running; only the door interlock matters.
  return input.driving && Math.abs(input.speedMetersPerSecond) <= DEFAULT_STATIONARY_SPEED_EPSILON;
}
