export type VehicleLoadingPhase = 'Static asset prepare' | 'Instance creation' | 'Dynamic state init' | 'Visual warmup' | 'Ready' | 'Failed';
/** One work item per animation frame. Async shader compilation does not block HUD painting. */
export class VehicleLoadingLifecycle {
  public phase: VehicleLoadingPhase = 'Ready';
  public error: unknown;
  private tasks: { phase: VehicleLoadingPhase; run: () => void | Promise<unknown> }[] = [];
  private pending = false;
  private generation = 0;
  public get ready(): boolean { return this.phase === 'Ready'; }
  public constructor(private readonly changed: (phase: VehicleLoadingPhase) => void) {}
  public mark(phase: VehicleLoadingPhase): void { this.phase = phase; this.changed(phase); }
  public enqueue(phase: VehicleLoadingPhase, run: () => void | Promise<unknown>): void { this.tasks.push({ phase, run }); }
  public advance(): void {
    if (this.pending || this.phase === 'Failed') return;
    const task = this.tasks.shift();
    if (!task) { this.mark('Ready'); return; }
    this.mark(task.phase);
    const generation = this.generation;
    try {
      const result = task.run();
      if (result instanceof Promise) {
        this.pending = true;
        void result.then(() => { if (generation === this.generation) this.pending = false; }, error => {
          if (generation === this.generation) { this.pending = false; this.error = error; this.mark('Failed'); }
        });
      }
    } catch (error) { this.error = error; this.mark('Failed'); }
  }
  public dispose(): void { this.generation++; this.tasks = []; }
}
