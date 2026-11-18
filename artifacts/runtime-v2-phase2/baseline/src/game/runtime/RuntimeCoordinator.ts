import { FixedStepClock } from './FixedStepClock';
import { RuntimePerformance, type RuntimePhase } from './RuntimePerformance';

export type RuntimePriority = 'visible' | 'upcoming' | 'gpu' | 'background' | 'decoration' | 'maintenance';
export type RuntimeTaskState = 'queued' | 'paused' | 'running' | 'complete' | 'cancelled' | 'failed';
export interface RuntimeTask {
  id: string;
  phase: RuntimePhase;
  priority: () => RuntimePriority;
  valid: () => boolean;
  ready?: () => boolean;
  /** Return true when finished. Otherwise retain the continuation for another frame. */
  step: (deadline: number) => boolean;
}
export interface RuntimeTaskHandle {
  readonly done: Promise<void>;
  readonly state: RuntimeTaskState;
  pause(): void;
  resume(): void;
  cancel(): void;
}
interface QueuedTask {
  spec: RuntimeTask;
  state: RuntimeTaskState;
  created: number;
  resolve: () => void;
  reject: (error: unknown) => void;
  handle: RuntimeTaskHandle;
}
const priorities: Record<RuntimePriority, number> = { visible: 0, upcoming: 1, gpu:2, background: 3, decoration:4, maintenance: 5 };

/** One owner for RAF, active-time debt and admitted main-thread background work. */
export class RuntimeCoordinator {
  readonly simulation = new FixedStepClock();
  readonly performance = new RuntimePerformance();
  private readonly tasks = new Map<string, QueuedTask>();
  private readonly ordered:QueuedTask[]=[];
  private callback?: (time: number) => void;
  private frameHandle = 0;
  private fallback?: ReturnType<typeof setTimeout>;
  private lastTime?: number;
  private started = 0;
  private frameCpuAverage = 8;
  private intervalAverage = 16.7;
  private spareMs = 0;
  private disposed = false;
  private sequence = 0;
  private mode: 'loading' | 'driving' | 'suspended' = 'loading';
  private draining = false;
  private deadline = 0;
  readonly jobs = { completed: 0, cancelled: 0, failed: 0, coalesced: 0, overBudgetAtoms: 0 };

  start(callback: (time: number) => void): void {
    if (this.callback || this.disposed) return;
    this.callback = callback;
    this.lastTime = undefined;
    this.scheduleFrame();
  }
  private scheduleFrame():void {
    if (!this.callback || this.disposed) return;
    this.frameHandle = requestAnimationFrame(this.onRaf);
    // A window can lose visibility between requesting RAF and receiving it.
    // Timers keep loading/cancellation progressing while simulation is suspended.
    this.fallback = setTimeout(this.onFallback,100);
  }
  private readonly onRaf=(time:number):void=>{clearTimeout(this.fallback);this.frame(time,true);};
  private readonly onFallback=():void=>{cancelAnimationFrame(this.frameHandle);this.frame(performance.now(),false);};
  private frame(time: number, raf: boolean): void {
    if (!this.callback || this.disposed) return;
    this.started = performance.now();
    const interval = this.lastTime === undefined ? 0 : Math.max(0, time - this.lastTime);
    this.lastTime = time;
    if (interval > 0 && interval < 32) this.intervalAverage += (interval - this.intervalAverage) * .05;
    this.performance.begin(time, raf?interval:NaN, this.mode);
    try {
      this.callback(time);
      const criticalMs = performance.now() - this.started;
      this.frameCpuAverage += (criticalMs - this.frameCpuAverage) * .08;
      const displayBudget = Math.min(16.7, Math.max(8.3, this.intervalAverage));
      const reserve = interval > 25 ? 2 : 1;
      this.spareMs = this.mode === 'loading' ? 6 :
        this.mode === 'suspended' ? 1 : Math.max(0, Math.min(3, displayBudget - Math.max(criticalMs, this.frameCpuAverage) - reserve));
      this.drain();
    } catch(error) {
      this.callback=undefined;
      throw error;
    } finally {
      this.performance.endGpu();
      this.performance.finish(performance.now() - this.started, this.simulation, this.tasks.size);
      if (!this.disposed) this.scheduleFrame();
    }
  }
  setMode(mode: 'loading' | 'driving' | 'suspended'): void { this.mode = mode; this.performance.mode = mode; }
  get driving(): boolean { return this.mode === 'driving'; }
  /** Nested work uses this same deadline instead of establishing another budget. */
  get remainingMs(): number { return Math.max(0, this.deadline - performance.now()); }
  measure<T>(phase: RuntimePhase, work: () => T): T {
    const start = performance.now();
    try { return work(); } finally { this.performance.add(phase, performance.now() - start); }
  }
  enqueue(spec: RuntimeTask): RuntimeTaskHandle {
    const previous = this.tasks.get(spec.id);
    if (previous) { previous.spec = spec; this.jobs.coalesced++; return previous.handle; }
    let resolve!: () => void, reject!: (error: unknown) => void;
    const done = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    const job = { spec, state: 'queued', created: performance.now(), resolve, reject } as QueuedTask;
    job.handle = {
      done,
      get state() { return job.state; },
      pause: () => { if (job.state === 'queued') job.state = 'paused'; },
      resume: () => { if (job.state === 'paused') job.state = 'queued'; },
      cancel: () => this.finishTask(job, 'cancelled'),
    };
    if (this.disposed) { job.state = 'cancelled'; resolve(); return job.handle; }
    this.tasks.set(spec.id, job);
    return job.handle;
  }
  atomic(label: string, priority: () => RuntimePriority, valid: () => boolean, ready: () => boolean, work: () => void): Promise<void> {
    return this.enqueue({
      id: 'asset:' + ++this.sequence, phase: 'assets', priority, valid, ready,
      step: () => {
        const start = performance.now();
        work();
        const elapsed = performance.now() - start;
        if (elapsed > 2) this.performance.atomic(label, elapsed);
        if (elapsed > this.spareMs) this.jobs.overBudgetAtoms++;
        return true;
      },
    }).done;
  }
  private finishTask(job: QueuedTask, state: 'complete' | 'cancelled' | 'failed', error?: unknown): void {
    if (this.tasks.get(job.spec.id)!==job) return;
    this.tasks.delete(job.spec.id);
    job.state = state;
    if (state === 'complete') this.jobs.completed++;
    if (state === 'cancelled') this.jobs.cancelled++;
    if (state === 'failed') { this.jobs.failed++; job.reject(error); } else job.resolve();
  }
  private drain(): void {
    if (this.draining) return;
    this.draining = true;
    this.deadline = performance.now() + this.spareMs;
    try {
      const ordered = this.ordered;
      ordered.length=0;
      for(const job of this.tasks.values())ordered.push(job);
      ordered.sort((a, b) => priorities[a.spec.priority()] - priorities[b.spec.priority()] || a.created - b.created);
      let atoms = 0;
      for (const job of ordered) {
        if (this.tasks.get(job.spec.id)!==job) continue;
        if (!job.spec.valid()) { this.finishTask(job, 'cancelled'); continue; }
        if (job.state === 'paused') continue;
        const now = performance.now();
        const starved = now-job.created > (job.spec.priority()==='visible'?50:250);
        if (now >= this.deadline) {
          if(priorities[job.spec.priority()]>=3&&ordered.some(other=>other!==job&&this.tasks.get(other.spec.id)===other&&priorities[other.spec.priority()]<3&&(!other.spec.ready||other.spec.ready())))continue;
          if (!starved || atoms >= 2 || this.mode === 'suspended') continue;
          this.deadline = now + .5;
        }
        try {
          if (job.spec.ready && !job.spec.ready()) continue;
          job.state = 'running';
          const started = performance.now();
          const complete = this.measure(job.spec.phase, () => job.spec.step(this.deadline));
          if (performance.now()-started>2 && job.spec.phase!=='assets') this.performance.atomic(job.spec.id,performance.now()-started);
          atoms++;
          if (complete) this.finishTask(job, 'complete'); else job.state = 'queued';
        } catch (error) { this.finishTask(job, 'failed', error); }
      }
    } finally { this.ordered.length=0;this.draining = false; }
  }
  suspend(): void { this.simulation.reset(); this.lastTime = undefined; }
  report() { return { jobs: { ...this.jobs }, queued: this.tasks.size, ...this.performance.report() }; }
  dispose(): void {
    this.disposed = true;
    this.callback = undefined;
    cancelAnimationFrame(this.frameHandle);
    clearTimeout(this.fallback);
    for (const job of this.tasks.values()) this.finishTask(job, 'cancelled');
    this.performance.dispose();
  }
}
