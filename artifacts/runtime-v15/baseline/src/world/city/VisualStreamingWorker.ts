import { takePreparedCityWorker } from './CityMainResource';
import type { RuntimeCoordinator, RuntimePriority, RuntimeTaskHandle } from '../../game/runtime/RuntimeCoordinator';
import type { CityMapData } from './CityMapData';
import type { CompiledRoadVisual, TerrainVisualData, VisualWorkerReply, VisualWorkerRequest } from './VisualStreamingData';
/** One bounded in-flight job: near-road requests outrank terrain/background work. */
export class VisualStreamingWorker {
  private runtime?: RuntimeCoordinator;
  private dispatchTask?:RuntimeTaskHandle;
  setRuntimeCoordinator(runtime: RuntimeCoordinator): void { this.runtime = runtime; }
  get queueState() { return { queued:this.queued.size,inFlight:this.inFlightKey }; }
  private readonly worker: Worker;
  private readonly queued = new Map<string, { request: VisualWorkerRequest; priority: number }>();
  private inFlight = false;
  private inFlightKey?: string;
  private inFlightRequest?: VisualWorkerRequest;
  private cancelling = false;
  private initialized = false;
  private disposed = false;
  readonly samples: {kind:string;id:string;activeMs:number;elapsedMs:number;maxStepMs:number;roundTripMs:number;queueWaitMs?:number;sendWaitMs?:number;receiveWaitMs?:number;transferBytes?:number;workerHeapBytes?:number|null;metrics?:VisualWorkerReply['metrics'];cache?:VisualWorkerReply['cache']}[]=[];
  private readonly queuedAt=new Map<string,number>();
  readonly jobs={completed:0,cancelledQueued:0,cancelledInFlight:0,coalescedRequests:0,disposed:false};
  private queueWaitMs=0;
  private sentAt=0;
  readonly timings = { initializationMs: 0, roadCompileMs: 0, terrainCompileMs: 0, backgroundCompileMs: 0 };
  private readonly startedAt = performance.now();
  public error: Error | undefined;
  public constructor(map: CityMapData, private readonly roadReady: (data: CompiledRoadVisual) => void,
    private readonly terrainReady: (data: TerrainVisualData) => void, _roadGeometryTrial?: import('./RoadGeometryTrial').RoadGeometryTrialSelection,diagnostics=false,
    private readonly cancelled?: (key: string) => void) {
    const prepared = takePreparedCityWorker(map);
    this.worker = prepared ?? new Worker(new URL('./VisualStreaming.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<VisualWorkerReply>) => {
      if (this.disposed) return;
      const id=this.inFlightKey??'init';
      if (e.data.kind === 'cancelled') this.jobs.cancelledInFlight++;
      else this.jobs.completed++;
      this.samples.push({kind:e.data.kind,id,activeMs:e.data.activeMs??e.data.cpuMs??0,elapsedMs:e.data.cpuMs??0,maxStepMs:e.data.maxStepMs??0,roundTripMs:performance.now()-this.sentAt,queueWaitMs:this.queueWaitMs,sendWaitMs:e.data.workerStartedAt===undefined?undefined:e.data.workerStartedAt-(performance.timeOrigin+this.sentAt),receiveWaitMs:e.data.workerFinishedAt===undefined?undefined:performance.timeOrigin+performance.now()-e.data.workerFinishedAt,transferBytes:e.data.transferBytes,workerHeapBytes:e.data.workerHeapBytes,metrics:e.data.metrics,cache:e.data.cache});
      if(this.samples.length>1024)this.samples.shift();
      this.runtime?.performance.worker(this.samples[this.samples.length-1]);
      this.inFlight = false;
      this.inFlightKey = undefined;
      this.inFlightRequest = undefined;
      this.cancelling = false;
      if (e.data.kind === 'ready') { this.initialized = true; this.timings.initializationMs = e.data.cpuMs ?? 0; performance.measure('city:workerReady', {start:this.startedAt,end:performance.now()}); }
      else if (e.data.kind === 'error') this.error = new Error(e.data.message);
      else if (e.data.kind === 'cancelled') this.cancelled?.(id);
      else if (e.data.kind === 'road') this.roadReady(e.data.data);
      else if (e.data.kind === 'background') e.data.data.forEach(this.terrainReady);
      else this.terrainReady(e.data.data);
      if (e.data.kind === 'road') this.timings.roadCompileMs += e.data.cpuMs ?? 0;
      else if (e.data.kind === 'terrain') this.timings.terrainCompileMs += e.data.cpuMs ?? 0;
      else if (e.data.kind === 'background') this.timings.backgroundCompileMs += e.data.cpuMs ?? 0;
    };
    this.worker.onerror = e => { this.error = new Error(`Visual streaming worker: ${e.message}`); this.inFlight = false; };
    this.sentAt=performance.now();this.worker.postMessage({ kind: 'init', map: prepared ? undefined : map,diagnostics } satisfies VisualWorkerRequest);
  }
  public request(key: string, request: VisualWorkerRequest, priority: number): void {
    if (this.disposed || this.error || this.inFlightKey === key) return;
    const previous = this.queued.get(key);
    if(previous)this.jobs.coalescedRequests++;else this.queuedAt.set(key,performance.now());
    if (!previous || priority < previous.priority) this.queued.set(key, { request, priority });
  }
  public advance(): void {
    if (this.runtime) {
      if (this.disposed || this.inFlight || !this.initialized || this.error || !this.queued.size) return;
      if(this.dispatchTask?.state==='queued')return;
      this.dispatchTask=this.runtime.enqueue({
        id:'worker:dispatch',phase:'background',valid:()=>!this.disposed&&!this.error&&this.queued.size>0,
        priority:()=>this.nextPriority(),
        step:()=>{this.dispatch();return true;},
      });
      void this.dispatchTask.done.catch(error=>{this.error=error instanceof Error?error:new Error(String(error));});
      return;
    }
    this.dispatch();
  }
  private nextPriority():RuntimePriority {
    let priority=Infinity;
    for(const job of this.queued.values())priority=Math.min(priority,job.priority);
    return priority<100?'visible':priority<10000?'upcoming':'background';
  }
  private dispatch():void {
    if (this.disposed || this.inFlight || !this.initialized || this.error) return;
    let chosen: string | undefined, priority = Infinity;
    for (const [key, job] of this.queued) if (job.priority < priority) { chosen = key; priority = job.priority; }
    if (chosen === undefined) return;
    const job = this.queued.get(chosen)!;
    this.queued.delete(chosen);
    this.inFlight = true;
    this.inFlightKey = chosen;
    this.inFlightRequest = job.request;
    this.sentAt = performance.now();
    this.queueWaitMs = this.sentAt - (this.queuedAt.get(chosen) ?? this.sentAt);
    this.queuedAt.delete(chosen);
    this.worker.postMessage({ ...job.request, sentAt: performance.timeOrigin + this.sentAt });
  }
  public retainRequests(roadIds:ReadonlySet<string>,terrainIds:ReadonlySet<string>):string[]{
    const removed:string[]=[];
    const active = this.inFlightRequest;
    if (!this.cancelling && active && (
      (active.kind === 'road' && !roadIds.has(active.id)) ||
      (active.kind === 'terrain' && !terrainIds.has(active.key + ':' + active.tier)) ||
      (active.kind === 'background' && active.keys.every(key => !terrainIds.has(key + ':far')))
    )) {
      this.cancelling = true;
      this.worker.postMessage({ kind: 'cancel' } satisfies VisualWorkerRequest);
    }
    for(const [key,{request}]of this.queued){
      if(request.kind==='background'){
        const kept=request.keys.filter(k=>terrainIds.has(k+':far'));
        for(const k of request.keys)if(!kept.includes(k))removed.push(k+':far');
        if(!kept.length){this.queued.delete(key);this.queuedAt.delete(key);this.jobs.cancelledQueued++;}
        else if(kept.length!==request.keys.length)request.keys=kept;
        continue;
      }
      if(request.kind==='road'&&!roadIds.has(request.id)||request.kind==='terrain'&&!terrainIds.has(request.key+':'+request.tier)){this.queued.delete(key);this.queuedAt.delete(key);this.jobs.cancelledQueued++;removed.push(key);}
    }
    return removed;
  }
  get state(){return {queued:this.queued.size,inFlight:this.inFlightKey,samples:this.samples,jobs:{...this.jobs}};}
  get hasForegroundWork():boolean {if(this.inFlightKey&&!this.inFlightKey.startsWith('background:'))return true;for(const job of this.queued.values())if(job.priority<10000)return true;return false;}
  public dispose(): void { this.disposed = true;this.dispatchTask?.cancel();this.jobs.disposed=true; this.worker.terminate();this.worker.onmessage=null;this.worker.onerror=null; this.queued.clear();this.queuedAt.clear();this.inFlight=false;this.inFlightKey=undefined;this.inFlightRequest=undefined; }
}
