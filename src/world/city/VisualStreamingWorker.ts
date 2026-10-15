import type { CityMapData } from './CityMapData';
import type { CompiledRoadVisual, TerrainVisualData, VisualWorkerReply, VisualWorkerRequest } from './VisualStreamingData';
/** One bounded in-flight job: near-road requests outrank terrain/background work. */
export class VisualStreamingWorker {
  private readonly worker: Worker;
  private readonly queued = new Map<string, { request: VisualWorkerRequest; priority: number }>();
  private inFlight = false;
  private initialized = false;
  private disposed = false;
  public error: Error | undefined;
  public constructor(map: CityMapData, private readonly roadReady: (data: CompiledRoadVisual) => void,
    private readonly terrainReady: (data: TerrainVisualData) => void) {
    this.worker = new Worker(new URL('./VisualStreaming.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<VisualWorkerReply>) => {
      if (this.disposed) return;
      this.inFlight = false;
      if (e.data.kind === 'ready') this.initialized = true;
      else if (e.data.kind === 'error') this.error = new Error(e.data.message);
      else if (e.data.kind === 'road') this.roadReady(e.data.data);
      else if (e.data.kind === 'background') e.data.data.forEach(this.terrainReady);
      else this.terrainReady(e.data.data);
    };
    this.worker.onerror = e => { this.error = new Error(`Visual streaming worker: ${e.message}`); this.inFlight = false; };
    this.worker.postMessage({ kind: 'init', map } satisfies VisualWorkerRequest);
  }
  public request(key: string, request: VisualWorkerRequest, priority: number): void {
    const previous = this.queued.get(key);
    if (!previous || priority < previous.priority) this.queued.set(key, { request, priority });
  }
  public advance(): void {
    if (this.disposed || this.inFlight || !this.initialized || this.error) return;
    let chosen: string | undefined, priority = Infinity;
    for (const [key, job] of this.queued) if (job.priority < priority) { chosen = key; priority = job.priority; }
    if (chosen === undefined) return;
    const job = this.queued.get(chosen)!; this.queued.delete(chosen); this.inFlight = true; this.worker.postMessage(job.request);
  }
  public dispose(): void { this.disposed = true; this.worker.terminate(); this.queued.clear(); }
}
