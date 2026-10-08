import type { LapCourseDefinition, LapGate, LapPosition } from './LapCourseDefinition';

export interface LapFeedback {
  readonly lapMs: number;
  readonly deltaMs: number | null;
  readonly newBest: boolean;
}

export interface LapTimerState {
  phase: 'WAITING_FOR_START' | 'RUNNING';
  lap: number;
  currentMs: number;
  lastMs: number | null;
  bestMs: number | null;
  checkpointsPassed: number;
  feedback: LapFeedback | null;
  feedbackSeconds: number;
}

export const formatLapTime = (milliseconds: number | null): string => {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return '--:--.---';
  const total = Math.max(0, Math.round(milliseconds));
  const minutes = Math.floor(total / 60_000).toString().padStart(2, '0');
  const seconds = Math.floor(total / 1_000) % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${(total % 1_000).toString().padStart(3, '0')}`;
};

export class LapRecordStore {
  public constructor(private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>) {}

  private getStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
    return this.storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
  }

  private key(trackId: string, vehicleId: string): string {
    return `drivergame.best-lap.v1:${JSON.stringify([trackId, vehicleId])}`;
  }

  public load(trackId: string, vehicleId: string): number | null {
    try {
      const raw = this.getStorage()?.getItem(this.key(trackId, vehicleId));
      if (!raw) return null;
      const value: unknown = JSON.parse(raw);
      if (typeof value !== 'object' || value === null || !('bestLapMs' in value)) return null;
      const time = value.bestLapMs;
      return typeof time === 'number' && Number.isFinite(time) && time > 0 ? time : null;
    } catch { return null; }
  }

  public save(trackId: string, vehicleId: string, bestLapMs: number): void {
    if (!Number.isFinite(bestLapMs) || bestLapMs <= 0) return;
    try {
      this.getStorage()?.setItem(this.key(trackId, vehicleId), JSON.stringify({ bestLapMs }));
    } catch { /* Keep the session record when browser storage is unavailable. */ }
  }
}

/** Simulation-time state machine, independent of rendering, vehicle physics and UI. */
export class LapTimer {
  public readonly state: LapTimerState = {
    phase: 'WAITING_FOR_START', lap: 0, currentMs: 0, lastMs: null, bestMs: null,
    checkpointsPassed: 0, feedback: null, feedbackSeconds: 0,
  };
  private course: LapCourseDefinition | undefined;
  private vehicleId = '';
  private previousX = 0;
  private previousZ = 0;
  private previousY = 0;
  private hasPrevious = false;
  private suspended = false;
  private pauseX = 0;
  private pauseZ = 0;

  public constructor(private readonly records = new LapRecordStore()) {}

  public configure(course: LapCourseDefinition | undefined, vehicleId: string, position: LapPosition): void {
    this.course = course;
    this.vehicleId = vehicleId;
    this.state.bestMs = course ? this.records.load(course.trackId, vehicleId) : null;
    this.reset(position);
  }

  public reset(position: LapPosition): void {
    this.invalidate();
    this.state.lap = 0;
    this.state.lastMs = null;
    this.state.feedback = null;
    this.state.feedbackSeconds = 0;
    this.suspended = false;
    this.remember(position);
  }

  public suspend(position: LapPosition): void {
    if (!this.suspended) {
      this.pauseX = this.hasPrevious ? this.previousX : position.x;
      this.pauseZ = this.hasPrevious ? this.previousZ : position.z;
      this.suspended = true;
    }
    // Menus suppress controls but the existing game can still coast. Such
    // movement must not buy an untimed shortcut while the clock is paused.
    if (Math.hypot(position.x - this.pauseX, position.z - this.pauseZ) > 0.2) this.invalidate();
    this.remember(position);
  }

  public update(dt: number, position: LapPosition, enabled = true): void {
    if (!this.course) return;
    if (!enabled) { this.suspend(position); return; }
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.suspended = false;
    if (!this.hasPrevious || !Number.isFinite(position.x + position.z + (position.y ?? 0)) ||
      Math.hypot(position.x - this.previousX, position.z - this.previousZ) > Math.max(8, dt * 150)) {
      this.invalidate();
      this.remember(position);
      return;
    }
    this.state.feedbackSeconds = Math.max(0, this.state.feedbackSeconds - dt);
    if (this.state.feedbackSeconds === 0) this.state.feedback = null;
    if (this.state.phase === 'RUNNING') this.state.currentMs += dt * 1_000;

    const startCrossing = this.crossing(this.course.startFinish, position);
    if (startCrossing < 0) {
      this.invalidate();
    } else if (startCrossing > 0) {
      const remainderMs = dt * 1_000 * (2 - startCrossing);
      if (this.state.phase === 'RUNNING' &&
        this.state.checkpointsPassed === this.course.checkpoints.length) {
        const lapMs = this.state.currentMs - remainderMs;
        const previousBest = this.state.bestMs;
        const newBest = previousBest === null || lapMs < previousBest;
        if (lapMs > 0) {
          this.state.lastMs = lapMs;
          if (newBest) {
            this.state.bestMs = lapMs;
            this.records.save(this.course.trackId, this.vehicleId, lapMs);
          }
          this.state.feedback = { lapMs, newBest, deltaMs: previousBest === null ? null : lapMs - previousBest };
          this.state.feedbackSeconds = 4;
          this.state.lap += 1;
        }
      } else if (this.state.phase === 'WAITING_FOR_START') {
        this.state.lap = Math.max(1, this.state.lap);
      }
      this.state.phase = 'RUNNING';
      this.state.currentMs = remainderMs;
      this.state.checkpointsPassed = 0;
    } else if (this.state.phase === 'RUNNING') {
      for (let index = 0; index < this.course.checkpoints.length; index += 1) {
        const crossing = this.crossing(this.course.checkpoints[index]!, position);
        if (crossing === 0) continue;
        if (crossing < 0 || index !== this.state.checkpointsPassed) this.invalidate();
        else this.state.checkpointsPassed += 1;
        break;
      }
    }
    this.remember(position);
  }

  private invalidate(): void {
    this.state.phase = 'WAITING_FOR_START';
    this.state.currentMs = 0;
    this.state.checkpointsPassed = 0;
  }

  private remember(position: LapPosition): void {
    this.previousX = position.x;
    this.previousZ = position.z;
    this.previousY = position.y ?? 0;
    this.hasPrevious = Number.isFinite(this.previousX + this.previousZ + this.previousY);
  }

  /** Zero: no crossing; +/- (1 + step fraction): crossing direction and time. */
  private crossing(gate: LapGate, position: LapPosition): number {
    const before = (this.previousX - gate.center.x) * gate.forward.x +
      (this.previousZ - gate.center.z) * gate.forward.z;
    const after = (position.x - gate.center.x) * gate.forward.x +
      (position.z - gate.center.z) * gate.forward.z;
    const forward = before < 0 && after >= 0;
    const backward = before > 0 && after <= 0;
    if (!forward && !backward) return 0;
    const fraction = before / (before - after);
    const x = this.previousX + (position.x - this.previousX) * fraction - gate.center.x;
    const z = this.previousZ + (position.z - this.previousZ) * fraction - gate.center.z;
    const y = this.previousY + ((position.y ?? 0) - this.previousY) * fraction;
    if (Math.abs(-gate.forward.z * x + gate.forward.x * z) > gate.halfWidth ||
      Math.abs(y - (gate.center.y ?? 0)) > gate.heightTolerance) return 0;
    return (forward ? 1 : -1) * (1 + fraction);
  }
}
