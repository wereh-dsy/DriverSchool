import type { Object3D, WebGLRenderer } from 'three';
import type { FixedStepClock } from './FixedStepClock';

export type RuntimePhase = 'simulation' | 'scene' | 'render' | 'streaming' | 'assets' | 'background' | 'maintenance';
const phases: RuntimePhase[] = ['simulation', 'scene', 'render', 'streaming', 'assets', 'background', 'maintenance'];
const fields = ['time', 'rafMs', 'cpuMs', ...phases, 'steps', 'debtMs', 'surrenderedMs', 'simulationSeconds', 'queued', 'calls', 'triangles',
  'viewCalls', 'shadowCalls', 'backgroundCalls', 'visibleObjects', 'geometries', 'textures', 'programs', 'heapBytes'] as const;
type Field = typeof fields[number];
const indexes = Object.fromEntries(fields.map((name, index) => [name, index])) as Record<Field, number>;
const capacity = 4096;

/** Bounded CPU/RAF history. GPU and presentation evidence have separate clocks and provenance. */
export class RuntimePerformance {
  private readonly values = new Float64Array(capacity * fields.length);
  private readonly rows=Array.from({length:capacity},(_,index)=>this.values.subarray(index*fields.length,(index+1)*fields.length));
  private readonly driving = new Uint8Array(capacity);
  private readonly totals = new Float64Array(phases.length);
  private next = 0;
  private count = 0;
  private time = 0;
  private rafMs = 0;
  private renderer?: WebGLRenderer;
  private heapBytes = NaN;
  private nextHeapAt = 0;
  private observer?: PerformanceObserver;
  private gpuExtension?: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private gpuQuery?: { query: WebGLQuery; time: number };
  private measuringGpu = false;
  private frames = 0;
  private readonly slowFrames: unknown[] = [];
  private readonly atoms: unknown[] = [];
  private readonly external: unknown[] = [];
  private readonly gpu: { time: number; gpuMs: number }[] = [];
  private readonly presentation: unknown[] = [];
  private state?: () => unknown;
  private previousAutoReset = true;
  private originalDirect?:WebGLRenderer['renderBufferDirect'];
  private rendering=false;
  private viewCalls=0;
  private shadowCalls=0;
  private backgroundCalls=0;
  private readonly renderedObjects=new WeakMap<Object3D,number>();
  private frameId=0;
  private visibleObjectCount=0;
  mode: 'loading' | 'driving' | 'suspended' = 'loading';

  bindRenderer(renderer: WebGLRenderer, state: () => unknown): void {
    this.renderer = renderer;
    this.state = state;
    this.previousAutoReset = renderer.info.autoReset;
    renderer.info.autoReset = false;
    const direct=this.originalDirect=renderer.renderBufferDirect;
    renderer.renderBufferDirect=(...args:Parameters<WebGLRenderer['renderBufferDirect']>)=>{
      if(this.rendering) {
        this.viewCalls++;
        if(this.renderedObjects.get(args[4])!==this.frameId){
          this.renderedObjects.set(args[4],this.frameId);this.visibleObjectCount++;
        }
        if(args[3].type==='MeshDepthMaterial'||args[3].type==='MeshDistanceMaterial')this.shadowCalls++;
        if(args[4].name.startsWith('Regional background'))this.backgroundCalls++;
      }
      return direct.apply(renderer,args);
    };
    this.gpuExtension = renderer.getContext().getExtension('EXT_disjoint_timer_query_webgl2');
    if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')) {
      this.observer = new PerformanceObserver(list => {
        for (const event of list.getEntries()) {
          this.presentation.push(event.toJSON());
          if (this.presentation.length > 64) this.presentation.shift();
        }
      });
      this.observer.observe({ type: 'long-animation-frame' });
    }
  }
  begin(time: number, rafMs: number, mode: typeof this.mode): void {
    this.time = time;
    this.rafMs = rafMs;
    this.mode = mode;
    this.totals.fill(0);
    this.viewCalls=this.shadowCalls=this.backgroundCalls=0;
    this.frameId++;this.visibleObjectCount=0;
    this.renderer?.info.reset();
    if (time >= this.nextHeapAt) {
      this.heapBytes = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? NaN;
      this.nextHeapAt = time + 1000;
    }
    this.pollGpu();
  }
  add(phase: RuntimePhase, ms: number): void { this.totals[phases.indexOf(phase)]! += ms; }
  atomic(label: string, ms: number): void {
    this.atoms.push({ time: this.time, label, ms });
    if (this.atoms.length > 128) this.atoms.shift();
  }
  worker(sample: unknown): void {
    this.external.push(sample);
    if (this.external.length > 256) this.external.shift();
  }
  beginGpu(): void {
    this.rendering=true;
    if (!this.renderer || !this.gpuExtension || this.gpuQuery || ++this.frames % 60) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    // A profiler may already own this timer target. Nested queries are invalid.
    if (gl.getQuery(this.gpuExtension.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) return;
    const query = gl.createQuery();
    if (!query) return;
    gl.beginQuery(this.gpuExtension.TIME_ELAPSED_EXT, query);
    this.gpuQuery = { query, time: this.time };
    this.measuringGpu = true;
  }
  endGpu(): void {
    this.rendering=false;
    if (!this.measuringGpu) return;
    (this.renderer!.getContext() as WebGL2RenderingContext).endQuery(this.gpuExtension!.TIME_ELAPSED_EXT);
    this.measuringGpu = false;
  }
  private pollGpu(): void {
    if (!this.gpuQuery || !this.renderer || this.measuringGpu) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const { query, time } = this.gpuQuery;
    if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return;
    if (!gl.getParameter(this.gpuExtension!.GPU_DISJOINT_EXT)) {
      this.gpu.push({ time, gpuMs: gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6 });
      if (this.gpu.length > 256) this.gpu.shift();
    }
    gl.deleteQuery(query);
    this.gpuQuery = undefined;
  }
  finish(cpuMs: number, simulation: FixedStepClock, queued: number): void {
    const row = this.rows[this.next]!;
    row[indexes.time] = this.time; row[indexes.rafMs] = this.rafMs; row[indexes.cpuMs] = cpuMs;
    for (let i = 0; i < phases.length; i++) row[3 + i] = this.totals[i]!;
    row[indexes.steps] = simulation.completedSteps; row[indexes.debtMs] = simulation.debtSeconds * 1000;
    row[indexes.surrenderedMs] = simulation.surrenderedFrameSeconds * 1000;
    row[indexes.simulationSeconds] = simulation.simulatedSeconds;
    row[indexes.queued] = queued;
    row[indexes.calls] = this.renderer?.info.render.calls ?? NaN;
    row[indexes.triangles] = this.renderer?.info.render.triangles ?? NaN;
    row[indexes.viewCalls]=this.viewCalls;
    row[indexes.shadowCalls]=this.shadowCalls;
    row[indexes.backgroundCalls]=this.backgroundCalls;
    row[indexes.visibleObjects]=this.visibleObjectCount;
    row[indexes.geometries] = this.renderer?.info.memory.geometries ?? NaN;
    row[indexes.textures] = this.renderer?.info.memory.textures ?? NaN;
    row[indexes.programs] = this.renderer?.info.programs?.length ?? NaN;
    row[indexes.heapBytes] = this.heapBytes;
    this.driving[this.next] = this.mode === 'driving' ? 1 : 0;
    if (this.rafMs > 33 || cpuMs > 25) {
      this.slowFrames.push({ ...this.row(this.next), state: this.state?.() });
      if (this.slowFrames.length > 96) this.slowFrames.shift();
    }
    this.next = (this.next + 1) % capacity;
    this.count = Math.min(capacity, this.count + 1);
  }
  private row(index: number): Record<Field, number> {
    return Object.fromEntries(fields.map((field, column) => [field, this.values[index * fields.length + column]!])) as Record<Field, number>;
  }
  report() {
    const frames = [];
    for (let i = 0; i < this.count; i++) {
      const index = (this.next - this.count + i + capacity) % capacity;
      frames.push({ ...this.row(index), driving: !!this.driving[index] });
    }
    const windows = new Map<number, typeof frames>();
    for (const frame of frames) {
      const second = Math.floor(frame.time! / 1000);
      const window = windows.get(second) ?? [];
      window.push(frame); windows.set(second, window);
    }
    return {
      limitations: {
        cpu: 'Main-thread wall-clock spans, including any synchronous driver wait. Not a CPU utilization counter.',
        gpu: this.gpuExtension ? 'Sparse EXT_disjoint_timer_query_webgl2 around actual mirror/main/overlay passes. External profilers may own the query.' : 'GPU timer unavailable on this context.',
        presentation: 'Long Animation Frame timestamps are sparse browser evidence. Complete display presentation intervals and Electron compositor CPU are unavailable.',
        gpuBufferBytes: 'Unavailable through a supported renderer API. Dedicated validation uses instrumented WebGL allocations.',
        visibleObjects: 'Unique object IDs actually submitted to main/mirror/shadow passes, excluding preparation micro-draws. Counts span the union of those views.',
        heap: 'performance.memory is origin/process-specific. Worker heaps require separate CDP sampling.',
      },
      capacity, fields, frames, windows: [...windows].map(([second, rows]) => ({
        second, count: rows.length, driving: rows.some(row => row.driving),
        cpuMaxMs: Math.max(...rows.map(row => row.cpuMs!)), rafMaxMs: Math.max(...rows.map(row => row.rafMs!)),
        callsMax: Math.max(...rows.map(row => row.calls!)),
      })),
      slowFrames: this.slowFrames, atomicCosts: this.atoms, worker: this.external, gpu: this.gpu,
      longAnimationFrames: this.presentation,
      presentationIntervals: null, gpuBufferBytes: null, materialCount: null,
    };
  }
  dispose(): void {
    this.observer?.disconnect();
    this.endGpu();
    if (this.gpuQuery && this.renderer) (this.renderer.getContext() as WebGL2RenderingContext).deleteQuery(this.gpuQuery.query);
    this.gpuQuery = undefined;
    if (this.renderer) this.renderer.info.autoReset = this.previousAutoReset;
    if(this.renderer&&this.originalDirect)this.renderer.renderBufferDirect=this.originalDirect;
  }
}
