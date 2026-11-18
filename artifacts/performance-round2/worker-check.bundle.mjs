// src/world/city/CityMainResource.ts
var runtime;
var preparedWorker;
function takePreparedCityWorker(map) {
  if (runtime?.map !== map) return void 0;
  const worker = preparedWorker;
  preparedWorker = void 0;
  return worker;
}

// src/world/city/VisualStreamingWorker.ts
var VisualStreamingWorker = class {
  constructor(map, roadReady, terrainReady, _roadGeometryTrial, diagnostics = false, cancelled) {
    this.roadReady = roadReady;
    this.terrainReady = terrainReady;
    this.cancelled = cancelled;
    const prepared = takePreparedCityWorker(map);
    this.worker = prepared ?? new Worker(new URL("./VisualStreaming.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e) => {
      if (this.disposed) return;
      const id = this.inFlightKey ?? "init";
      if (e.data.kind === "cancelled") this.jobs.cancelledInFlight++;
      else this.jobs.completed++;
      this.samples.push({ kind: e.data.kind, id, activeMs: e.data.activeMs ?? e.data.cpuMs ?? 0, elapsedMs: e.data.cpuMs ?? 0, maxStepMs: e.data.maxStepMs ?? 0, roundTripMs: performance.now() - this.sentAt, queueWaitMs: this.queueWaitMs, sendWaitMs: e.data.workerStartedAt === void 0 ? void 0 : e.data.workerStartedAt - (performance.timeOrigin + this.sentAt), receiveWaitMs: e.data.workerFinishedAt === void 0 ? void 0 : performance.timeOrigin + performance.now() - e.data.workerFinishedAt, transferBytes: e.data.transferBytes, workerHeapBytes: e.data.workerHeapBytes, metrics: e.data.metrics, cache: e.data.cache });
      if (this.samples.length > 1024) this.samples.shift();
      this.inFlight = false;
      this.inFlightKey = void 0;
      this.inFlightRequest = void 0;
      this.cancelling = false;
      if (e.data.kind === "ready") {
        this.initialized = true;
        this.timings.initializationMs = e.data.cpuMs ?? 0;
        performance.measure("city:workerReady", { start: this.startedAt, end: performance.now() });
      } else if (e.data.kind === "error") this.error = new Error(e.data.message);
      else if (e.data.kind === "cancelled") this.cancelled?.(id);
      else if (e.data.kind === "road") this.roadReady(e.data.data);
      else if (e.data.kind === "background") e.data.data.forEach(this.terrainReady);
      else this.terrainReady(e.data.data);
      if (e.data.kind === "road") this.timings.roadCompileMs += e.data.cpuMs ?? 0;
      else if (e.data.kind === "terrain") this.timings.terrainCompileMs += e.data.cpuMs ?? 0;
      else if (e.data.kind === "background") this.timings.backgroundCompileMs += e.data.cpuMs ?? 0;
    };
    this.worker.onerror = (e) => {
      this.error = new Error(`Visual streaming worker: ${e.message}`);
      this.inFlight = false;
    };
    this.sentAt = performance.now();
    this.worker.postMessage({ kind: "init", map: prepared ? void 0 : map, diagnostics });
  }
  roadReady;
  terrainReady;
  cancelled;
  worker;
  queued = /* @__PURE__ */ new Map();
  inFlight = false;
  inFlightKey;
  inFlightRequest;
  cancelling = false;
  initialized = false;
  disposed = false;
  samples = [];
  queuedAt = /* @__PURE__ */ new Map();
  jobs = { completed: 0, cancelledQueued: 0, cancelledInFlight: 0, coalescedRequests: 0, disposed: false };
  queueWaitMs = 0;
  sentAt = 0;
  timings = { initializationMs: 0, roadCompileMs: 0, terrainCompileMs: 0, backgroundCompileMs: 0 };
  startedAt = performance.now();
  error;
  request(key, request, priority) {
    if (this.disposed || this.error || this.inFlightKey === key) return;
    const previous = this.queued.get(key);
    if (previous) this.jobs.coalescedRequests++;
    else this.queuedAt.set(key, performance.now());
    if (!previous || priority < previous.priority) this.queued.set(key, { request, priority });
  }
  advance() {
    if (this.disposed || this.inFlight || !this.initialized || this.error) return;
    let chosen, priority = Infinity;
    for (const [key, job2] of this.queued) if (job2.priority < priority) {
      chosen = key;
      priority = job2.priority;
    }
    if (chosen === void 0) return;
    const job = this.queued.get(chosen);
    this.queued.delete(chosen);
    this.inFlight = true;
    this.inFlightKey = chosen;
    this.inFlightRequest = job.request;
    this.sentAt = performance.now();
    this.queueWaitMs = this.sentAt - (this.queuedAt.get(chosen) ?? this.sentAt);
    this.queuedAt.delete(chosen);
    this.worker.postMessage({ ...job.request, sentAt: performance.timeOrigin + this.sentAt });
  }
  retainRequests(roadIds, terrainIds) {
    const removed = [];
    const active = this.inFlightRequest;
    if (!this.cancelling && active && (active.kind === "road" && !roadIds.has(active.id) || active.kind === "terrain" && !terrainIds.has(active.key + ":" + active.tier) || active.kind === "background" && active.keys.every((key) => !terrainIds.has(key + ":far")))) {
      this.cancelling = true;
      this.worker.postMessage({ kind: "cancel" });
    }
    for (const [key, { request }] of this.queued) {
      if (request.kind === "background") {
        const kept = request.keys.filter((k) => terrainIds.has(k + ":far"));
        for (const k of request.keys) if (!kept.includes(k)) removed.push(k + ":far");
        if (!kept.length) {
          this.queued.delete(key);
          this.queuedAt.delete(key);
          this.jobs.cancelledQueued++;
        } else if (kept.length !== request.keys.length) request.keys = kept;
        continue;
      }
      if (request.kind === "road" && !roadIds.has(request.id) || request.kind === "terrain" && !terrainIds.has(request.key + ":" + request.tier)) {
        this.queued.delete(key);
        this.queuedAt.delete(key);
        this.jobs.cancelledQueued++;
        removed.push(key);
      }
    }
    return removed;
  }
  get state() {
    return { queued: this.queued.size, inFlight: this.inFlightKey, samples: this.samples, jobs: { ...this.jobs } };
  }
  get hasForegroundWork() {
    if (this.inFlightKey && !this.inFlightKey.startsWith("background:")) return true;
    for (const job of this.queued.values()) if (job.priority < 1e4) return true;
    return false;
  }
  dispose() {
    this.disposed = true;
    this.jobs.disposed = true;
    this.worker.terminate();
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.queued.clear();
    this.queuedAt.clear();
    this.inFlight = false;
    this.inFlightKey = void 0;
    this.inFlightRequest = void 0;
  }
};
export {
  VisualStreamingWorker
};
