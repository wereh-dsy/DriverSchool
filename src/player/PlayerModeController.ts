export type PlayerMode = 'Driving' | 'OnFoot';
export type PlayerTransitionKind = 'exit' | 'enter';

export interface PlayerTransitionUpdate {
  readonly kind: PlayerTransitionKind;
  /** Eased 0..1 blend factor for the camera transition. */
  readonly progress: number;
  readonly completed: boolean;
}

export interface PlayerModeConfig {
  readonly exitSeconds: number;
  readonly enterSeconds: number;
}

export const DEFAULT_PLAYER_MODE_CONFIG: Readonly<PlayerModeConfig> = Object.freeze({
  exitSeconds: 0.8,
  enterSeconds: 0.8,
});

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

export const smoothPlayerTransition = (progress: number): number => {
  const t = clamp01(progress);
  return t * t * (3 - 2 * t);
};

/**
 * Owns only the Driving/OnFoot boundary and its timed camera transition.
 * Vehicle physics, cameras and walking stay in their own modules.
 */
export class PlayerModeController {
  private modeValue: PlayerMode = 'Driving';
  private active: { kind: PlayerTransitionKind; elapsed: number; duration: number } | null = null;
  private readonly config: PlayerModeConfig;

  public constructor(config: Partial<PlayerModeConfig> = {}) {
    this.config = { ...DEFAULT_PLAYER_MODE_CONFIG, ...config };
  }

  public get mode(): PlayerMode {
    return this.modeValue;
  }

  public get transitioning(): boolean {
    return this.active !== null;
  }

  public get transitionKind(): PlayerTransitionKind | null {
    return this.active?.kind ?? null;
  }

  public reset(mode: PlayerMode = 'Driving'): void {
    this.modeValue = mode;
    this.active = null;
  }

  public beginExit(): boolean {
    if (this.modeValue !== 'Driving' || this.active !== null) return false;
    this.active = { kind: 'exit', elapsed: 0, duration: Math.max(0.05, this.config.exitSeconds) };
    return true;
  }

  public beginEnter(): boolean {
    if (this.modeValue !== 'OnFoot' || this.active !== null) return false;
    this.active = { kind: 'enter', elapsed: 0, duration: Math.max(0.05, this.config.enterSeconds) };
    return true;
  }

  /** Advances the transition and commits the destination mode on completion. */
  public update(deltaSeconds: number): PlayerTransitionUpdate | null {
    const active = this.active;
    if (active === null) return null;
    active.elapsed += Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
    const raw = clamp01(active.elapsed / active.duration);
    const completed = raw >= 1;
    if (completed) {
      this.modeValue = active.kind === 'exit' ? 'OnFoot' : 'Driving';
      this.active = null;
    }
    return { kind: active.kind, progress: smoothPlayerTransition(raw), completed };
  }

  /** Raw (un-eased) 0..1 progress, mainly for diagnostics/tests. */
  public get progress(): number {
    if (this.active === null) return 0;
    return clamp01(this.active.elapsed / this.active.duration);
  }
}
