import type { LateralAssistController } from './LateralAssistController';

/** Runtime permission/request, not a claim that lane sensing or steering is active. */
export enum LaneAssistMode {
  OFF = 'OFF',
  WARNING_ONLY = 'WARNING_ONLY',
  KEEP_ASSIST = 'KEEP_ASSIST',
  CENTERING_ASSIST = 'CENTERING_ASSIST',
}

export interface LaneAssistState {
  readonly mode: LaneAssistMode;
  readonly notificationVisible: boolean;
  /** Changes on selection and popup expiry, including when the vehicle is stationary. */
  readonly version: number;
}

export const LANE_ASSIST_LABELS: Readonly<Record<LaneAssistMode, string>> = {
  [LaneAssistMode.OFF]: 'OFF',
  [LaneAssistMode.WARNING_ONLY]: 'LDW',
  [LaneAssistMode.KEEP_ASSIST]: 'LKA',
  [LaneAssistMode.CENTERING_ASSIST]: 'LCC',
};
const MODES = [LaneAssistMode.OFF, LaneAssistMode.WARNING_ONLY, LaneAssistMode.KEEP_ASSIST, LaneAssistMode.CENTERING_ASSIST] as const;

/** Vehicle-level state authority shared by input commands and future car settings. */
export class LaneAssistStateController {
  private readonly current = { mode: LaneAssistMode.OFF, notificationVisible: false, version: 0 };
  private notificationRemaining = 0;
  private warningAvailable = true;
  private keepingAvailable = true;
  private centeringAvailable = true;
  public get state(): Readonly<LaneAssistState> { return this.current; }
  public constructor(private readonly notificationSeconds = 1.6) {}

  public setMode(mode: LaneAssistMode): void {
    if (!this.available(mode) || mode === this.current.mode) return;
    this.current.mode = mode;
    this.current.notificationVisible = true;
    this.notificationRemaining = this.notificationSeconds;
    this.current.version++;
  }
  public cycleMode(): void {
    const index = MODES.indexOf(this.current.mode);
    for (let offset = 1; offset <= MODES.length; offset++) {
      const mode = MODES[(index + offset) % MODES.length]!;
      if (this.available(mode)) { this.setMode(mode); return; }
    }
  }
  /** Persistent preferences bound the selectable runtime modes. */
  public setAvailability(warning: boolean, keeping: boolean, centering: boolean): void {
    this.warningAvailable = warning; this.keepingAvailable = keeping; this.centeringAvailable = centering;
    if (!this.available(this.current.mode)) this.setMode(keeping ? LaneAssistMode.KEEP_ASSIST : LaneAssistMode.OFF);
  }
  public cancelCentering(): void {
    if (this.current.mode === LaneAssistMode.CENTERING_ASSIST)
      this.setMode(this.keepingAvailable ? LaneAssistMode.KEEP_ASSIST : LaneAssistMode.OFF);
  }
  public toggleCentering(): void {
    if (this.current.mode === LaneAssistMode.CENTERING_ASSIST) this.cancelCentering();
    else this.setMode(LaneAssistMode.CENTERING_ASSIST);
  }
  /** All input/settings paths apply the same mode to the existing controller. */
  public applyTo(controller: LateralAssistController): void {
    const mode = this.current.mode;
    controller.setPreferences(this.keepingAvailable && mode === LaneAssistMode.KEEP_ASSIST,
      this.centeringAvailable && mode === LaneAssistMode.CENTERING_ASSIST);
    controller.setLCCRequested(mode === LaneAssistMode.CENTERING_ASSIST);
  }
  private available(mode: LaneAssistMode): boolean {
    return mode === LaneAssistMode.OFF || mode === LaneAssistMode.WARNING_ONLY && this.warningAvailable ||
      mode === LaneAssistMode.KEEP_ASSIST && this.keepingAvailable || mode === LaneAssistMode.CENTERING_ASSIST && this.centeringAvailable;
  }
  public update(dt: number): void {
    if (!this.current.notificationVisible) return;
    this.notificationRemaining -= Number.isFinite(dt) ? Math.max(0, dt) : 0;
    if (this.notificationRemaining <= 0) {
      this.current.notificationVisible = false;
      this.current.version++;
    }
  }
  public reset(): void {
    this.current.mode = LaneAssistMode.OFF;
    this.current.notificationVisible = false;
    this.notificationRemaining = 0;
    this.current.version++;
  }
}
