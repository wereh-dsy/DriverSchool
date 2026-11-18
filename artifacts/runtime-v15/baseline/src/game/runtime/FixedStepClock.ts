/** Active simulation time is retained until consumed. Menu/hidden wall time is suspended. */
export class FixedStepClock {
  readonly stepSeconds = 1 / 120;
  private pendingSeconds = 0;
  private steps = 0;
  private started = 0;
  private active = false;
  constructor(private readonly now = () => performance.now()) {}
  begin(deltaSeconds: number, active: boolean): void {
    this.steps = 0;
    this.started = this.now();
    if (active && this.active && Number.isFinite(deltaSeconds) && deltaSeconds > 0) this.pendingSeconds += deltaSeconds;
    this.active = active;
  }
  canStep(): boolean {
    return this.active && this.pendingSeconds + 1e-12 >= this.stepSeconds &&
      this.steps < 16 && (this.steps === 0 || this.now() - this.started < 5);
  }
  completeStep(): void {
    this.pendingSeconds = Math.max(0, this.pendingSeconds - this.stepSeconds);
    this.steps++;
  }
  reset(): void { this.pendingSeconds = 0; this.steps = 0; this.active = false; }
  get interpolation(): number { return this.active ? Math.min(1, this.pendingSeconds / this.stepSeconds) : 1; }
  get debtSeconds(): number { return this.pendingSeconds; }
  get completedSteps(): number { return this.steps; }
}
