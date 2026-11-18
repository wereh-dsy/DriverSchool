/** Preserve sub-step phase, but surrender stalled or unprocessed whole steps.
 * Recovery advances at the new frame's pace instead of replaying old wall time. */
export class FixedStepClock {
  readonly stepSeconds = 1 / 120;
  private pendingSeconds = 0;
  private steps = 0;
  private started = 0;
  private active = false;
  private normalDelta = 1 / 60;
  private dropped = 0;
  private droppedFrame = 0;
  private simulated = 0;
  constructor(private readonly now = () => performance.now()) {}
  begin(deltaSeconds: number, active: boolean): void {
    this.steps = 0;
    this.started = this.now();
    this.droppedFrame = 0;
    if (active && this.active && Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
      const expired = Math.floor((this.pendingSeconds + 1e-12) / this.stepSeconds) * this.stepSeconds;
      this.pendingSeconds = Math.max(0, this.pendingSeconds - expired);
      const admitted = deltaSeconds >= .05 ? this.normalDelta : deltaSeconds;
      this.droppedFrame = expired + deltaSeconds - admitted;
      this.dropped += this.droppedFrame;
      this.pendingSeconds += admitted;
      if (deltaSeconds <= 1 / 30) this.normalDelta += (deltaSeconds - this.normalDelta) * .1;
    }
    this.active = active;
  }
  canStep(): boolean {
    return this.active && this.pendingSeconds + 1e-12 >= this.stepSeconds &&
      this.steps < 6 && (this.steps === 0 || this.now() - this.started < 5);
  }
  completeStep(): void {
    this.pendingSeconds = Math.max(0, this.pendingSeconds - this.stepSeconds);
    this.steps++;
    this.simulated += this.stepSeconds;
  }
  reset(): void { this.pendingSeconds = 0; this.steps = 0; this.active = false;this.droppedFrame=0;this.normalDelta=1/60; }
  get interpolation(): number { return this.active ? Math.min(1, this.pendingSeconds / this.stepSeconds) : 1; }
  get debtSeconds(): number { return this.pendingSeconds; }
  get completedSteps(): number { return this.steps; }
  get surrenderedSeconds(): number { return this.dropped; }
  get surrenderedFrameSeconds(): number { return this.droppedFrame; }
  get simulatedSeconds(): number { return this.simulated; }
}
