/** Selected mode only. Selection never implies detection or steering engagement. */
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
  public get state(): Readonly<LaneAssistState> { return this.current; }
  public constructor(private readonly notificationSeconds = 1.6) {}

  public setMode(mode: LaneAssistMode): void {
    if (!MODES.includes(mode) || mode === this.current.mode) return;
    this.current.mode = mode;
    this.current.notificationVisible = true;
    this.notificationRemaining = this.notificationSeconds;
    this.current.version++;
  }
  public cycleMode(): void {
    this.setMode(MODES[(MODES.indexOf(this.current.mode) + 1) % MODES.length]!);
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
