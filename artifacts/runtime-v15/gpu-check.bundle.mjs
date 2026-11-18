// src/game/StreamingShaderWarmup.ts
import { BackSide, DoubleSide, FrontSide, Group, InstancedMesh, Line, Mesh, MeshDepthMaterial, Points, RGBADepthPacking, Scene, Texture, Vector4, VSMShadowMap, WebGLRenderTarget } from "three";

// src/loading/Loading.ts
var nextPaint = () => new Promise((resolve) => {
  if (typeof document === "undefined" || typeof requestAnimationFrame === "undefined" || document.hidden) {
    setTimeout(resolve, 0);
    return;
  }
  const frame = requestAnimationFrame(() => {
    clearTimeout(fallback);
    setTimeout(resolve, 0);
  });
  const fallback = setTimeout(() => {
    cancelAnimationFrame(frame);
    resolve();
  }, 100);
});
function drain(steps) {
  for (; ; ) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

// src/game/runtime/FixedStepClock.ts
var FixedStepClock = class {
  constructor(now = () => performance.now()) {
    this.now = now;
  }
  now;
  stepSeconds = 1 / 120;
  pendingSeconds = 0;
  steps = 0;
  started = 0;
  active = false;
  normalDelta = 1 / 60;
  dropped = 0;
  droppedFrame = 0;
  simulated = 0;
  begin(deltaSeconds, active) {
    this.steps = 0;
    this.started = this.now();
    this.droppedFrame = 0;
    if (active && this.active && Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
      const expired = Math.floor((this.pendingSeconds + 1e-12) / this.stepSeconds) * this.stepSeconds;
      this.pendingSeconds = Math.max(0, this.pendingSeconds - expired);
      const admitted = deltaSeconds >= 0.05 ? this.normalDelta : deltaSeconds;
      this.droppedFrame = expired + deltaSeconds - admitted;
      this.dropped += this.droppedFrame;
      this.pendingSeconds += admitted;
      if (deltaSeconds <= 1 / 30) this.normalDelta += (deltaSeconds - this.normalDelta) * 0.1;
    }
    this.active = active;
  }
  canStep() {
    return this.active && this.pendingSeconds + 1e-12 >= this.stepSeconds && this.steps < 6 && (this.steps === 0 || this.now() - this.started < 5);
  }
  completeStep() {
    this.pendingSeconds = Math.max(0, this.pendingSeconds - this.stepSeconds);
    this.steps++;
    this.simulated += this.stepSeconds;
  }
  reset() {
    this.pendingSeconds = 0;
    this.steps = 0;
    this.active = false;
    this.droppedFrame = 0;
    this.normalDelta = 1 / 60;
  }
  get interpolation() {
    return this.active ? Math.min(1, this.pendingSeconds / this.stepSeconds) : 1;
  }
  get debtSeconds() {
    return this.pendingSeconds;
  }
  get completedSteps() {
    return this.steps;
  }
  get surrenderedSeconds() {
    return this.dropped;
  }
  get surrenderedFrameSeconds() {
    return this.droppedFrame;
  }
  get simulatedSeconds() {
    return this.simulated;
  }
};

// src/game/runtime/RuntimePerformance.ts
var phases = ["simulation", "scene", "render", "streaming", "assets", "background", "maintenance"];
var fields = [
  "time",
  "rafMs",
  "cpuMs",
  ...phases,
  "steps",
  "debtMs",
  "surrenderedMs",
  "simulationSeconds",
  "queued",
  "calls",
  "triangles",
  "viewCalls",
  "shadowCalls",
  "backgroundCalls",
  "visibleObjects",
  "geometries",
  "textures",
  "programs",
  "heapBytes"
];
var indexes = Object.fromEntries(fields.map((name, index) => [name, index]));
var capacity = 4096;
var RuntimePerformance = class {
  values = new Float64Array(capacity * fields.length);
  rows = Array.from({ length: capacity }, (_, index) => this.values.subarray(index * fields.length, (index + 1) * fields.length));
  driving = new Uint8Array(capacity);
  totals = new Float64Array(phases.length);
  next = 0;
  count = 0;
  time = 0;
  rafMs = 0;
  renderer;
  heapBytes = NaN;
  nextHeapAt = 0;
  observer;
  gpuExtension;
  gpuQuery;
  measuringGpu = false;
  frames = 0;
  slowFrames = [];
  atoms = [];
  external = [];
  gpu = [];
  presentation = [];
  state;
  previousAutoReset = true;
  originalDirect;
  rendering = false;
  viewCalls = 0;
  shadowCalls = 0;
  backgroundCalls = 0;
  renderedObjects = /* @__PURE__ */ new WeakMap();
  frameId = 0;
  visibleObjectCount = 0;
  mode = "loading";
  bindRenderer(renderer, state) {
    this.renderer = renderer;
    this.state = state;
    this.previousAutoReset = renderer.info.autoReset;
    renderer.info.autoReset = false;
    const direct = this.originalDirect = renderer.renderBufferDirect;
    renderer.renderBufferDirect = (...args) => {
      if (this.rendering) {
        this.viewCalls++;
        if (this.renderedObjects.get(args[4]) !== this.frameId) {
          this.renderedObjects.set(args[4], this.frameId);
          this.visibleObjectCount++;
        }
        if (args[3].type === "MeshDepthMaterial" || args[3].type === "MeshDistanceMaterial") this.shadowCalls++;
        if (args[4].name.startsWith("Regional background")) this.backgroundCalls++;
      }
      return direct.apply(renderer, args);
    };
    this.gpuExtension = renderer.getContext().getExtension("EXT_disjoint_timer_query_webgl2");
    if (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")) {
      this.observer = new PerformanceObserver((list) => {
        for (const event of list.getEntries()) {
          this.presentation.push(event.toJSON());
          if (this.presentation.length > 64) this.presentation.shift();
        }
      });
      this.observer.observe({ type: "long-animation-frame" });
    }
  }
  begin(time, rafMs, mode) {
    this.time = time;
    this.rafMs = rafMs;
    this.mode = mode;
    this.totals.fill(0);
    this.viewCalls = this.shadowCalls = this.backgroundCalls = 0;
    this.frameId++;
    this.visibleObjectCount = 0;
    this.renderer?.info.reset();
    if (time >= this.nextHeapAt) {
      this.heapBytes = performance.memory?.usedJSHeapSize ?? NaN;
      this.nextHeapAt = time + 1e3;
    }
    this.pollGpu();
  }
  add(phase, ms) {
    this.totals[phases.indexOf(phase)] += ms;
  }
  atomic(label, ms) {
    this.atoms.push({ time: this.time, label, ms });
    if (this.atoms.length > 128) this.atoms.shift();
  }
  worker(sample) {
    this.external.push(sample);
    if (this.external.length > 256) this.external.shift();
  }
  beginGpu() {
    this.rendering = true;
    if (!this.renderer || !this.gpuExtension || this.gpuQuery || ++this.frames % 60) return;
    const gl = this.renderer.getContext();
    if (gl.getQuery(this.gpuExtension.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) return;
    const query = gl.createQuery();
    if (!query) return;
    gl.beginQuery(this.gpuExtension.TIME_ELAPSED_EXT, query);
    this.gpuQuery = { query, time: this.time };
    this.measuringGpu = true;
  }
  endGpu() {
    this.rendering = false;
    if (!this.measuringGpu) return;
    this.renderer.getContext().endQuery(this.gpuExtension.TIME_ELAPSED_EXT);
    this.measuringGpu = false;
  }
  pollGpu() {
    if (!this.gpuQuery || !this.renderer || this.measuringGpu) return;
    const gl = this.renderer.getContext();
    const { query, time } = this.gpuQuery;
    if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return;
    if (!gl.getParameter(this.gpuExtension.GPU_DISJOINT_EXT)) {
      this.gpu.push({ time, gpuMs: gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6 });
      if (this.gpu.length > 256) this.gpu.shift();
    }
    gl.deleteQuery(query);
    this.gpuQuery = void 0;
  }
  finish(cpuMs, simulation, queued) {
    const row = this.rows[this.next];
    row[indexes.time] = this.time;
    row[indexes.rafMs] = this.rafMs;
    row[indexes.cpuMs] = cpuMs;
    for (let i = 0; i < phases.length; i++) row[3 + i] = this.totals[i];
    row[indexes.steps] = simulation.completedSteps;
    row[indexes.debtMs] = simulation.debtSeconds * 1e3;
    row[indexes.surrenderedMs] = simulation.surrenderedFrameSeconds * 1e3;
    row[indexes.simulationSeconds] = simulation.simulatedSeconds;
    row[indexes.queued] = queued;
    row[indexes.calls] = this.renderer?.info.render.calls ?? NaN;
    row[indexes.triangles] = this.renderer?.info.render.triangles ?? NaN;
    row[indexes.viewCalls] = this.viewCalls;
    row[indexes.shadowCalls] = this.shadowCalls;
    row[indexes.backgroundCalls] = this.backgroundCalls;
    row[indexes.visibleObjects] = this.visibleObjectCount;
    row[indexes.geometries] = this.renderer?.info.memory.geometries ?? NaN;
    row[indexes.textures] = this.renderer?.info.memory.textures ?? NaN;
    row[indexes.programs] = this.renderer?.info.programs?.length ?? NaN;
    row[indexes.heapBytes] = this.heapBytes;
    this.driving[this.next] = this.mode === "driving" ? 1 : 0;
    if (this.rafMs > 33 || cpuMs > 25) {
      this.slowFrames.push({ ...this.row(this.next), state: this.state?.() });
      if (this.slowFrames.length > 96) this.slowFrames.shift();
    }
    this.next = (this.next + 1) % capacity;
    this.count = Math.min(capacity, this.count + 1);
  }
  row(index) {
    return Object.fromEntries(fields.map((field, column) => [field, this.values[index * fields.length + column]]));
  }
  report() {
    const frames = [];
    for (let i = 0; i < this.count; i++) {
      const index = (this.next - this.count + i + capacity) % capacity;
      frames.push({ ...this.row(index), driving: !!this.driving[index] });
    }
    const windows = /* @__PURE__ */ new Map();
    for (const frame of frames) {
      const second = Math.floor(frame.time / 1e3);
      const window = windows.get(second) ?? [];
      window.push(frame);
      windows.set(second, window);
    }
    return {
      limitations: {
        cpu: "Main-thread wall-clock spans, including any synchronous driver wait. Not a CPU utilization counter.",
        gpu: this.gpuExtension ? "Sparse EXT_disjoint_timer_query_webgl2 around actual mirror/main/overlay passes. External profilers may own the query." : "GPU timer unavailable on this context.",
        presentation: "Long Animation Frame timestamps are sparse browser evidence. Complete display presentation intervals and Electron compositor CPU are unavailable.",
        gpuBufferBytes: "Unavailable through a supported renderer API. Dedicated validation uses instrumented WebGL allocations.",
        visibleObjects: "Unique object IDs actually submitted to main/mirror/shadow passes, excluding preparation micro-draws. Counts span the union of those views.",
        heap: "performance.memory is origin/process-specific. Worker heaps require separate CDP sampling."
      },
      capacity,
      fields,
      frames,
      windows: [...windows].map(([second, rows]) => ({
        second,
        count: rows.length,
        driving: rows.some((row) => row.driving),
        cpuMaxMs: Math.max(...rows.map((row) => row.cpuMs)),
        rafMaxMs: Math.max(...rows.map((row) => row.rafMs)),
        callsMax: Math.max(...rows.map((row) => row.calls))
      })),
      slowFrames: this.slowFrames,
      atomicCosts: this.atoms,
      worker: this.external,
      gpu: this.gpu,
      longAnimationFrames: this.presentation,
      presentationIntervals: null,
      gpuBufferBytes: null,
      materialCount: null
    };
  }
  dispose() {
    this.observer?.disconnect();
    this.endGpu();
    if (this.gpuQuery && this.renderer) this.renderer.getContext().deleteQuery(this.gpuQuery.query);
    this.gpuQuery = void 0;
    if (this.renderer) this.renderer.info.autoReset = this.previousAutoReset;
    if (this.renderer && this.originalDirect) this.renderer.renderBufferDirect = this.originalDirect;
  }
};

// src/game/runtime/RuntimeCoordinator.ts
var priorities = { visible: 0, upcoming: 1, gpu: 2, background: 3, decoration: 4, maintenance: 5 };
var RuntimeCoordinator = class {
  simulation = new FixedStepClock();
  performance = new RuntimePerformance();
  tasks = /* @__PURE__ */ new Map();
  ordered = [];
  callback;
  frameHandle = 0;
  fallback;
  lastTime;
  started = 0;
  frameCpuAverage = 8;
  intervalAverage = 16.7;
  spareMs = 0;
  disposed = false;
  sequence = 0;
  mode = "loading";
  draining = false;
  deadline = 0;
  jobs = { completed: 0, cancelled: 0, failed: 0, coalesced: 0, overBudgetAtoms: 0 };
  start(callback) {
    if (this.callback || this.disposed) return;
    this.callback = callback;
    this.lastTime = void 0;
    this.scheduleFrame();
  }
  scheduleFrame() {
    if (!this.callback || this.disposed) return;
    this.frameHandle = requestAnimationFrame(this.onRaf);
    this.fallback = setTimeout(this.onFallback, 100);
  }
  onRaf = (time) => {
    clearTimeout(this.fallback);
    this.frame(time, true);
  };
  onFallback = () => {
    cancelAnimationFrame(this.frameHandle);
    this.frame(performance.now(), false);
  };
  frame(time, raf) {
    if (!this.callback || this.disposed) return;
    this.started = performance.now();
    const interval = this.lastTime === void 0 ? 0 : Math.max(0, time - this.lastTime);
    this.lastTime = time;
    if (interval > 0 && interval < 32) this.intervalAverage += (interval - this.intervalAverage) * 0.05;
    this.performance.begin(time, raf ? interval : NaN, this.mode);
    try {
      this.callback(time);
      const criticalMs = performance.now() - this.started;
      this.frameCpuAverage += (criticalMs - this.frameCpuAverage) * 0.08;
      const displayBudget = Math.min(16.7, Math.max(8.3, this.intervalAverage));
      const reserve = interval > 25 ? 2 : 1;
      this.spareMs = this.mode === "loading" ? 6 : this.mode === "suspended" ? 1 : Math.max(0, Math.min(3, displayBudget - Math.max(criticalMs, this.frameCpuAverage) - reserve));
      this.drain();
    } catch (error) {
      this.callback = void 0;
      throw error;
    } finally {
      this.performance.endGpu();
      this.performance.finish(performance.now() - this.started, this.simulation, this.tasks.size);
      if (!this.disposed) this.scheduleFrame();
    }
  }
  setMode(mode) {
    this.mode = mode;
    this.performance.mode = mode;
  }
  get driving() {
    return this.mode === "driving";
  }
  /** Nested work uses this same deadline instead of establishing another budget. */
  get remainingMs() {
    return Math.max(0, this.deadline - performance.now());
  }
  measure(phase, work) {
    const start = performance.now();
    try {
      return work();
    } finally {
      this.performance.add(phase, performance.now() - start);
    }
  }
  enqueue(spec) {
    const previous = this.tasks.get(spec.id);
    if (previous) {
      previous.spec = spec;
      this.jobs.coalesced++;
      return previous.handle;
    }
    let resolve, reject;
    const done = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const job = { spec, state: "queued", created: performance.now(), resolve, reject };
    job.handle = {
      done,
      get state() {
        return job.state;
      },
      pause: () => {
        if (job.state === "queued") job.state = "paused";
      },
      resume: () => {
        if (job.state === "paused") job.state = "queued";
      },
      cancel: () => this.finishTask(job, "cancelled")
    };
    if (this.disposed) {
      job.state = "cancelled";
      resolve();
      return job.handle;
    }
    this.tasks.set(spec.id, job);
    return job.handle;
  }
  atomic(label, priority, valid, ready, work) {
    return this.enqueue({
      id: "asset:" + ++this.sequence,
      phase: "assets",
      priority,
      valid,
      ready,
      step: () => {
        const start = performance.now();
        work();
        const elapsed = performance.now() - start;
        if (elapsed > 2) this.performance.atomic(label, elapsed);
        if (elapsed > this.spareMs) this.jobs.overBudgetAtoms++;
        return true;
      }
    }).done;
  }
  finishTask(job, state, error) {
    if (this.tasks.get(job.spec.id) !== job) return;
    this.tasks.delete(job.spec.id);
    job.state = state;
    if (state === "complete") this.jobs.completed++;
    if (state === "cancelled") this.jobs.cancelled++;
    if (state === "failed") {
      this.jobs.failed++;
      job.reject(error);
    } else job.resolve();
  }
  drain() {
    if (this.draining) return;
    this.draining = true;
    this.deadline = performance.now() + this.spareMs;
    try {
      const ordered = this.ordered;
      ordered.length = 0;
      for (const job of this.tasks.values()) ordered.push(job);
      ordered.sort((a, b) => priorities[a.spec.priority()] - priorities[b.spec.priority()] || a.created - b.created);
      let atoms = 0;
      for (const job of ordered) {
        if (this.tasks.get(job.spec.id) !== job) continue;
        if (!job.spec.valid()) {
          this.finishTask(job, "cancelled");
          continue;
        }
        if (job.state === "paused") continue;
        const now = performance.now();
        const starved = now - job.created > (job.spec.priority() === "visible" ? 50 : 250);
        if (now >= this.deadline) {
          if (priorities[job.spec.priority()] >= 3 && ordered.some((other) => other !== job && this.tasks.get(other.spec.id) === other && priorities[other.spec.priority()] < 3 && (!other.spec.ready || other.spec.ready()))) continue;
          if (!starved || atoms >= 2 || this.mode === "suspended") continue;
          this.deadline = now + 0.5;
        }
        try {
          if (job.spec.ready && !job.spec.ready()) continue;
          job.state = "running";
          const started = performance.now();
          const complete = this.measure(job.spec.phase, () => job.spec.step(this.deadline));
          if (performance.now() - started > 2 && job.spec.phase !== "assets") this.performance.atomic(job.spec.id, performance.now() - started);
          atoms++;
          if (complete) this.finishTask(job, "complete");
          else job.state = "queued";
        } catch (error) {
          this.finishTask(job, "failed", error);
        }
      }
    } finally {
      this.ordered.length = 0;
      this.draining = false;
    }
  }
  suspend() {
    this.simulation.reset();
    this.lastTime = void 0;
  }
  report() {
    return { jobs: { ...this.jobs }, queued: this.tasks.size, ...this.performance.report() };
  }
  dispose() {
    this.disposed = true;
    this.callback = void 0;
    cancelAnimationFrame(this.frameHandle);
    clearTimeout(this.fallback);
    for (const job of this.tasks.values()) this.finishTask(job, "cancelled");
    this.performance.dispose();
  }
};

// src/game/StreamingShaderWarmup.ts
var StreamingShaderWarmup = class {
  constructor(renderer, runtime) {
    this.renderer = renderer;
    this.ownsRuntime = !runtime;
    this.runtime = runtime ?? new RuntimeCoordinator();
    if (this.ownsRuntime) this.runtime.start(() => {
    });
  }
  renderer;
  tasks = /* @__PURE__ */ new Set();
  gpuFence = null;
  runtime;
  ownsRuntime;
  prepared = /* @__PURE__ */ new Set();
  uploadedTextures = /* @__PURE__ */ new WeakMap();
  depthMaterials = /* @__PURE__ */ new Map();
  depthTarget = new WebGLRenderTarget(1, 1, { depthBuffer: false });
  disposed = false;
  statistics = { roots: 0, completedRoots: 0, cancelledRoots: 0, activity: "\u7B49\u5F85\u8D44\u6E90", objects: 0, representatives: 0, submissions: 0, maxSubmitMs: 0, cacheHits: 0, resourceBatches: 0, maxResourceMs: 0, textureUploads: 0 };
  get idle() {
    return this.tasks.size === 0;
  }
  prepare(root, scene, world, views, alive, priority = () => 0) {
    this.statistics.roots++;
    const run = async () => {
      if (this.disposed || !alive()) return;
      const targetScene = new Scene(), lights = [];
      targetScene.environment = scene.environment;
      targetScene.background = scene.background;
      targetScene.fog = scene.fog;
      targetScene.environmentIntensity = scene.environmentIntensity;
      targetScene.environmentRotation.copy(scene.environmentRotation);
      const gather = (object) => {
        if (object === world || !object.visible) return;
        if (object.isLight) lights.push(object);
        for (const child of object.children) gather(child);
      };
      gather(scene);
      targetScene.children.push(...lights);
      const objects = [], all = [], seen = /* @__PURE__ */ new Set();
      root.traverse((object) => {
        if (object instanceof Line || object instanceof Points) {
          objects.push(object);
          all.push(object);
          return;
        }
        if (!(object instanceof Mesh) || object.isSkinnedMesh || object.isBatchedMesh || Object.keys(object.geometry.morphAttributes).length) {
          if (object.material) objects.push(object);
          return;
        }
        this.statistics.objects++;
        all.push(object);
        const materials = Array.isArray(object.material) ? object.material : [object.material], attributes = Object.entries(object.geometry.attributes).map(([name, a]) => name + ":" + a.itemSize).sort().join(","), instance = object instanceof InstancedMesh ? ":instance:" + !!object.instanceColor + ":" + !!object.morphTexture : ":mesh";
        const key = materials.map((m) => m.uuid).join("|") + instance + ":" + object.receiveShadow + ":" + attributes;
        if (!seen.has(key)) {
          seen.add(key);
          objects.push(object);
        }
      });
      this.statistics.representatives += objects.length;
      const usedMaterials = /* @__PURE__ */ new Set();
      for (const object of all) for (const material of Array.isArray(object.material) ? object.material : [object.material]) usedMaterials.add(material);
      for (const material of usedMaterials) for (const value of Object.values(material)) {
        if (!(value instanceof Texture) || value.isRenderTargetTexture || this.uploadedTextures.get(value) === value.version) continue;
        await this.atomic("Texture upload", priority, alive, () => {
          if (this.uploadedTextures.get(value) === value.version) return;
          this.statistics.activity = `\u7EB9\u7406\u4E0A\u4F20 \xB7 ${root.name || "\u573A\u666F\u8D44\u6E90"}`;
          const started = performance.now();
          this.renderer.initTexture(value);
          this.uploadedTextures.set(value, value.version);
          this.statistics.textureUploads++;
          this.statistics.maxResourceMs = Math.max(this.statistics.maxResourceMs, performance.now() - started);
          this.fence();
        });
        if (this.disposed || !alive()) return;
      }
      const programViews = [];
      const contexts = /* @__PURE__ */ new Set();
      for (const view of views) {
        const lighting = lights.filter((l) => l.layers.test(view.camera.layers)).map((l) => {
          const light = l;
          return l.type + ":" + !!light.castShadow + ":" + !!light.map;
        }).sort().join("|");
        const output = !view.target ? "screen:" + this.renderer.outputColorSpace : view.target.isXRRenderTarget ? "xr:" + view.target.texture.colorSpace : "offscreen";
        const context = [lighting, view.camera.type, view.camera.layers.mask, output, this.renderer.toneMapping, this.renderer.shadowMap.enabled, this.renderer.shadowMap.type, scene.fog?.constructor.name, scene.environment?.uuid ?? "", this.renderer.clippingPlanes.length, this.renderer.localClippingEnabled].join(":");
        if (contexts.has(context)) continue;
        contexts.add(context);
        programViews.push(view);
        const key = (object, plain = false) => {
          if (!(object instanceof Mesh) || Object.keys(object.geometry.morphAttributes).length || object.isSkinnedMesh || object.isBatchedMesh) return void 0;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          return context + "|" + materials.map((m) => m.uuid + ":" + m.version).join("|") + "|" + Object.entries(object.geometry.attributes).map(([name, a]) => name + ":" + a.itemSize).sort().join(",") + "|" + object.receiveShadow + "|" + (object instanceof InstancedMesh ? "instance:" + (!plain && !!object.instanceColor) + ":" + !!object.morphTexture : "mesh");
        };
        const needsProgram = (o) => {
          const k = key(o);
          return !k || !this.prepared.has(k) || o instanceof InstancedMesh && !!o.instanceColor && !this.prepared.has(key(o, true));
        };
        const needed = objects.filter((o) => {
          if (needsProgram(o)) return true;
          this.statistics.cacheHits++;
          return false;
        });
        for (let i = 0; i < needed.length; i += 12) {
          if (this.disposed || !alive()) return;
          this.statistics.activity = `\u6750\u8D28\u7A0B\u5E8F \xB7 ${root.name || "\u573A\u666F\u8D44\u6E90"}`;
          const batch = new Group(), chunk = needed.slice(i, i + 12).filter(needsProgram);
          if (!chunk.length) continue;
          batch.traverse = (callback) => {
            callback(batch);
            for (const object of chunk) callback(object);
          };
          let pending = Promise.resolve();
          await this.atomic("Shader variants", priority, alive, () => {
            const previous = this.renderer.getRenderTarget(), cube = this.renderer.getActiveCubeFace(), mip = this.renderer.getActiveMipmapLevel();
            const started = performance.now();
            try {
              this.renderer.setRenderTarget(view.target);
              const materials = this.renderer.compile(batch, view.camera, targetScene), programs = /* @__PURE__ */ new Set();
              const colors = /* @__PURE__ */ new Map();
              for (const object of chunk) if (object instanceof InstancedMesh && object.instanceColor && !this.prepared.has(key(object, true))) colors.set(object, object.instanceColor);
              if (colors.size) {
                const plain = new Group();
                plain.traverse = (cb) => {
                  cb(plain);
                  for (const object of colors.keys()) cb(object);
                };
                try {
                  for (const object of colors.keys()) object.instanceColor = null;
                  for (const material of this.renderer.compile(plain, view.camera, targetScene)) materials.add(material);
                } finally {
                  for (const [object, color] of colors) object.instanceColor = color;
                }
              }
              for (const material of materials) {
                const properties = this.renderer.properties.get(material);
                for (const program of properties.programs?.values() ?? []) if (typeof program.isReady === "function") programs.add(program);
              }
              pending = programs.size ? new Promise((resolve) => {
                const check = () => {
                  if (!alive()) {
                    resolve();
                    return;
                  }
                  for (const program of programs) if (!program.isReady()) {
                    setTimeout(check, 4);
                    return;
                  }
                  resolve();
                };
                check();
              }) : this.renderer.compileAsync(batch, view.camera, targetScene);
            } finally {
              this.renderer.setRenderTarget(previous, cube, mip);
              this.statistics.maxSubmitMs = Math.max(this.statistics.maxSubmitMs, performance.now() - started);
              this.statistics.submissions++;
            }
          });
          await pending;
          if (!alive()) return;
          for (const object of chunk) {
            const k = key(object);
            if (k) this.prepared.add(k);
            if (object instanceof InstancedMesh && object.instanceColor) {
              const plain = key(object, true);
              if (plain) this.prepared.add(plain);
            }
          }
          while (this.prepared.size > 512) this.prepared.delete(this.prepared.values().next().value);
        }
      }
      for (let i = 0; i < programViews.length; i++) await this.upload(i === 0 ? all : objects.filter((o) => o instanceof Mesh || o instanceof Line || o instanceof Points), targetScene, programViews[i], alive, priority);
      if (this.renderer.shadowMap.enabled && !this.renderer.localClippingEnabled && !this.renderer.clippingPlanes.length) {
        const casters = all.filter((o) => o instanceof Mesh && o.castShadow && !o.customDepthMaterial && !Array.isArray(o.material));
        const originals = /* @__PURE__ */ new Map();
        const overrides = /* @__PURE__ */ new Map();
        for (const object of casters) {
          const depth = this.depthFor(object.material);
          if (!depth) continue;
          originals.set(object, object.material);
          overrides.set(object, depth);
          object.customDepthMaterial = depth;
        }
        const depthScene = new Scene();
        depthScene.matrixWorldAutoUpdate = false;
        depthScene.children.push(...lights);
        try {
          const shadowObjects = [...originals.keys()];
          for (let i = 0; i < shadowObjects.length; i += 12) {
            if (this.disposed || !alive()) return;
            const chunk = shadowObjects.slice(i, i + 12), batch = new Group();
            batch.traverse = (cb) => {
              cb(batch);
              for (const o of chunk) cb(o);
            };
            let pending = Promise.resolve();
            await this.atomic("Shadow variants", priority, alive, () => {
              this.statistics.activity = "\u9634\u5F71\u6750\u8D28\u51C6\u5907";
              const previous = this.renderer.getRenderTarget();
              try {
                for (const o of chunk) o.material = overrides.get(o);
                this.renderer.setRenderTarget(this.depthTarget);
                pending = this.ready(this.renderer.compile(batch, views[0].camera, depthScene), alive);
              } finally {
                for (const o of chunk) o.material = originals.get(o);
                this.renderer.setRenderTarget(previous);
              }
            });
            await pending;
          }
          await this.upload(shadowObjects, depthScene, { camera: views[0].camera, target: this.depthTarget }, alive, priority, overrides);
        } finally {
          for (const [object, material] of originals) object.material = material;
        }
      }
      await this.waitForFence(alive);
    };
    const task = Promise.resolve().then(run).then(() => {
      if (alive() && !this.disposed) this.statistics.completedRoots++;
      else this.statistics.cancelledRoots++;
    }).finally(() => this.tasks.delete(task));
    this.tasks.add(task);
    return task;
  }
  atomic(label, priority, alive, work) {
    return this.runtime.atomic(
      label,
      () => priority() < 100 ? "visible" : priority() < 1e3 ? "upcoming" : priority() < 1e4 ? "gpu" : priority() < 2e4 ? "background" : "decoration",
      () => !this.disposed && alive(),
      () => this.gpuReady(),
      work
    );
  }
  fence() {
    const gl = this.renderer.getContext?.();
    if (gl?.fenceSync) {
      if (this.gpuFence) gl.deleteSync(this.gpuFence);
      this.gpuFence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (!this.gpuFence) throw Error("GPU resource completion fence unavailable");
      gl.flush();
    }
  }
  gpuReady() {
    if (!this.gpuFence) return true;
    const gl = this.renderer.getContext();
    if (gl.isContextLost()) throw Error("GPU context lost during loading");
    const state = gl.clientWaitSync(this.gpuFence, 0, 0);
    if (state === gl.TIMEOUT_EXPIRED) return false;
    gl.deleteSync(this.gpuFence);
    this.gpuFence = null;
    if (state === gl.WAIT_FAILED) throw Error("GPU resource preparation failed");
    return true;
  }
  /** Poll an actual GPU completion fence without synchronously waiting on it. */
  async settle(alive) {
    if (this.disposed || !alive()) return;
    this.fence();
    await this.waitForFence(alive);
  }
  async waitForFence(alive) {
    while (!this.disposed && alive() && !this.gpuReady()) {
      this.statistics.activity = "\u7B49\u5F85 GPU \u5B8C\u6210\u8D44\u6E90\u63D0\u4EA4";
      await nextPaint();
    }
  }
  ready(materials, alive) {
    const programs = /* @__PURE__ */ new Set();
    for (const material of materials) {
      const p = this.renderer.properties.get(material);
      for (const program of p.programs?.values() ?? []) programs.add(program);
    }
    return new Promise((resolve) => {
      const check = () => {
        if (this.disposed || !alive()) {
          resolve();
          return;
        }
        for (const p of programs) if (!p.isReady()) {
          setTimeout(check, 4);
          return;
        }
        resolve();
      };
      check();
    });
  }
  depthFor(material) {
    const m = material;
    if (m.clippingPlanes?.length || m.displacementMap) return void 0;
    const side = m.shadowSide ?? (this.renderer.shadowMap.type === VSMShadowMap ? m.side : m.side === FrontSide ? BackSide : m.side === BackSide ? FrontSide : DoubleSide), key = [side, !!m.map, m.map?.channel, !!m.alphaMap, m.alphaMap?.channel, m.alphaToCoverage ? 0.5 : m.alphaTest, m.wireframe].join(":");
    let depth = this.depthMaterials.get(key);
    if (depth) return depth;
    if (this.depthMaterials.size >= 32) return void 0;
    depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, map: m.map, alphaMap: m.alphaMap, alphaTest: m.alphaToCoverage ? 0.5 : m.alphaTest, side, wireframe: m.wireframe });
    this.depthMaterials.set(key, depth);
    return depth;
  }
  async upload(objects, scene, view, alive, priority, overrides) {
    const batch = new Scene();
    batch.matrixWorldAutoUpdate = false;
    batch.environment = scene.environment;
    batch.fog = scene.fog;
    batch.environmentIntensity = scene.environmentIntensity;
    batch.environmentRotation.copy(scene.environmentRotation);
    const lights = scene.children.filter((o) => o.isLight);
    const draws = [];
    for (const object of objects) {
      const geometry = object.geometry, end = Math.min(geometry.drawRange.start + geometry.drawRange.count, geometry.index?.count ?? geometry.getAttribute("position").count);
      const groups = Array.isArray(object.material) ? geometry.groups : [geometry.drawRange];
      for (const group of groups) {
        const start = Math.max(geometry.drawRange.start, group.start), count = Math.min(end, group.start + group.count) - start;
        if (count > 0) {
          const draw = { object, start, count: Math.min(object instanceof Line ? 2 : 3, count), plain: false };
          draws.push(draw);
          if (object instanceof InstancedMesh && object.instanceColor) draws.push({ ...draw, plain: true });
        }
      }
    }
    let at = 0;
    while (at < draws.length) {
      if (this.disposed || !alive()) return;
      await this.atomic("Geometry / VAO upload", priority, alive, () => {
        this.statistics.activity = `\u51E0\u4F55\u4E0E\u7ED8\u5236\u8D44\u6E90 \xB7 ${at} / ${draws.length}`;
        const started = performance.now(), previous = this.renderer.getRenderTarget(), cube = this.renderer.getActiveCubeFace(), mip = this.renderer.getActiveMipmapLevel(), viewport = this.renderer.getViewport(new Vector4()), scissor = this.renderer.getScissor(new Vector4()), test = this.renderer.getScissorTest(), clear = this.renderer.autoClear, shadows = this.renderer.shadowMap.autoUpdate, needs = this.renderer.shadowMap.needsUpdate, xr = this.renderer.xr.enabled;
        let bytes = 0, count = 0;
        try {
          this.renderer.setRenderTarget(view.target);
          this.renderer.setViewport(0, 0, 1, 1);
          this.renderer.setScissor(0, 0, 1, 1);
          this.renderer.setScissorTest(true);
          this.renderer.autoClear = false;
          this.renderer.shadowMap.autoUpdate = false;
          this.renderer.shadowMap.needsUpdate = false;
          this.renderer.xr.enabled = false;
          do {
            const draw = draws[at++], object = draw.object, originalMaterial = object.material, instanceColor = object instanceof InstancedMesh ? object.instanceColor : null;
            if (object instanceof Mesh && overrides?.has(object)) object.material = overrides.get(object);
            const geometry = object.geometry, range = { ...geometry.drawRange }, instances = object instanceof InstancedMesh ? object.count : 0, culled = object.frustumCulled, visible = object.visible, children = object.children, materials = Array.isArray(object.material) ? object.material : [object.material], writes = materials.map((m) => [m.colorWrite, m.depthWrite]);
            try {
              geometry.setDrawRange(draw.start, draw.count);
              if (object instanceof InstancedMesh) {
                object.count = Math.min(1, instances);
                if (draw.plain) object.instanceColor = null;
              }
              object.frustumCulled = false;
              object.visible = true;
              object.children = [];
              for (const m of materials) {
                m.colorWrite = false;
                m.depthWrite = false;
              }
              batch.children = [...lights, object];
              this.renderer.render(batch, view.camera);
            } finally {
              geometry.setDrawRange(range.start, range.count);
              if (object instanceof InstancedMesh) {
                object.count = instances;
                object.instanceColor = instanceColor;
              }
              object.frustumCulled = culled;
              object.visible = visible;
              object.children = children;
              materials.forEach((m, i) => {
                m.colorWrite = writes[i][0];
                m.depthWrite = writes[i][1];
              });
              object.material = originalMaterial;
            }
            for (const a of Object.values(geometry.attributes)) bytes += a.array.byteLength;
            bytes += geometry.index?.array.byteLength ?? 0;
            count++;
          } while (at < draws.length && count < 16 && bytes < 2 * 1024 * 1024 && performance.now() - started < 2);
        } finally {
          batch.children = [];
          this.renderer.setRenderTarget(previous, cube, mip);
          this.renderer.setViewport(viewport);
          this.renderer.setScissor(scissor);
          this.renderer.setScissorTest(test);
          this.renderer.autoClear = clear;
          this.renderer.shadowMap.autoUpdate = shadows;
          this.renderer.shadowMap.needsUpdate = needs;
          this.renderer.xr.enabled = xr;
          this.statistics.resourceBatches++;
          this.statistics.maxResourceMs = Math.max(this.statistics.maxResourceMs, performance.now() - started);
        }
        this.fence();
      });
    }
  }
  dispose() {
    this.disposed = true;
    if (this.ownsRuntime) this.runtime.dispose();
    void Promise.allSettled([...this.tasks]).then(() => {
      if (this.gpuFence) this.renderer.getContext().deleteSync(this.gpuFence);
      this.gpuFence = null;
      for (const m of this.depthMaterials.values()) m.dispose();
      this.depthMaterials.clear();
      this.depthTarget.dispose();
      this.prepared.clear();
    });
  }
};

// src/world/city/geometry.ts
import { CatmullRomCurve3, Vector3 } from "three";

// src/world/city/CityMapData.ts
var INTERSECTION_LANES = { t_2lane: 2, t_4lane: 4, cross_4lane: 4, cross_6lane: 6, irregular: 6, divided_cross: 6 };
function newCityMap() {
  return {
    schemaVersion: 2,
    id: "new-city",
    name: "New City",
    version: 1,
    sectorSize: 500,
    roadLinks: [],
    connectionPorts: [],
    bounds: { minX: -1e3, maxX: 1e3, minZ: -1e3, maxZ: 1e3 },
    roads: [],
    intersections: [],
    objects: [],
    environment: { districts: [], spawnPoints: [{ id: "start", position: { x: 0, y: 0, z: 0 }, rotation: 0 }] }
  };
}

// src/world/city/geometry.ts
var portDirections = {
  north: { x: 0, z: -1 },
  east: { x: 1, z: 0 },
  south: { x: 0, z: 1 },
  west: { x: -1, z: 0 },
  extra: { x: Math.SQRT1_2, z: -Math.SQRT1_2 },
  extra2: { x: -Math.SQRT1_2, z: Math.SQRT1_2 }
};
function rotatePoint(p, radians) {
  const c = Math.cos(radians), s = Math.sin(radians);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}
function junctionExtent(j, map) {
  let width = INTERSECTION_LANES[j.type] * 3.5;
  for (const connection of j.connections) {
    const road = map.roads.find((r) => r.id === connection.roadId);
    if (road) width = Math.max(width, road.laneCount * road.laneWidth);
  }
  return Math.max(width / 2 + 7, ...Object.values(j.approachOffsets ?? {}).map((p) => Math.max(Math.abs(p.x), Math.abs(p.z))));
}
function roadEdges(road) {
  const half = road.laneCount * road.laneWidth / 2;
  const left = -half - (road.shoulders?.left ?? 0), right = half + (road.shoulders?.right ?? 0);
  return { left, right, width: right - left };
}
function roadPoints(road) {
  const points = road.centerline.map((p) => ({ ...p, y: road.elevationMode === "ground" ? road.elevation ?? 0 : road.elevationMode === "elevated" ? road.elevation ?? 6 : p.y ?? 0 }));
  if (road.curve !== "smooth" || points.length < 3) return points;
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(p.x, 0, p.z)), false, "centripetal");
  const count = Math.max(8, Math.ceil(polylineLength(points) / 3));
  return curve.getPoints(count).map((p, index) => {
    const node = index / count * (points.length - 1), a = Math.min(points.length - 2, Math.floor(node)), t = node - a;
    return { x: p.x, y: points[a].y + (points[a + 1].y - points[a].y) * t, z: p.z };
  });
}
function polylineLength(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return sum;
}
function sampleAt(points, distance) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 1e-8) continue;
    if (distance <= length || i === points.length - 1) {
      const t = Math.min(1, distance / length);
      return { point: { x: a.x + (b.x - a.x) * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, z: a.z + (b.z - a.z) * t }, tangent: { x: (b.x - a.x) / length, y: ((b.y ?? 0) - (a.y ?? 0)) / length, z: (b.z - a.z) / length } };
    }
    distance -= length;
  }
  return { point: points[0], tangent: { x: 0, z: -1 } };
}

// src/world/subject3/geometry.ts
import * as THREE from "three";
var sampleRibbonPolyline = (points, maximumSpacing) => {
  const samples = [];
  const direction = (a, b) => {
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
  };
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const incoming = direction(points[Math.max(0, i - 1)], point);
    const outgoing = direction(point, points[Math.min(points.length - 1, i + 1)]);
    const divisor = Math.max(0.25, 1 + incoming.x * outgoing.x + incoming.z * outgoing.z);
    const tangent = i === 0 ? outgoing : i === points.length - 1 ? incoming : { x: (incoming.x + outgoing.x) / divisor, z: (incoming.z + outgoing.z) / divisor };
    samples.push({ point, tangent });
    if (i === points.length - 1) continue;
    const next = points[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(next.x - point.x, next.z - point.z) / maximumSpacing));
    for (let step = 1; step < steps; step += 1) {
      const t = step / steps;
      samples.push({
        point: {
          x: point.x + (next.x - point.x) * t,
          z: point.z + (next.z - point.z) * t,
          y: point.y === void 0 && next.y === void 0 ? void 0 : (point.y ?? 0) + ((next.y ?? 0) - (point.y ?? 0)) * t
        },
        tangent: outgoing
      });
    }
  }
  return samples;
};
var ARROW_OUTLINES = Object.freeze({
  "left-right": [
    [-0.18, 1.9],
    [-0.18, 0.65],
    [-0.62, 0.65],
    [-0.62, 0.95],
    [-1.35, 0.25],
    [-0.62, -0.45],
    [-0.62, -0.15],
    [0.62, -0.15],
    [0.62, -0.45],
    [1.35, 0.25],
    [0.62, 0.95],
    [0.62, 0.65],
    [0.18, 0.65],
    [0.18, 1.9]
  ],
  straight: [
    [-0.18, 1.9],
    [-0.18, -0.35],
    [-0.58, -0.35],
    [0, -1.7],
    [0.58, -0.35],
    [0.18, -0.35],
    [0.18, 1.9]
  ],
  left: [
    [-0.18, 1.9],
    [-0.18, 0.65],
    [-0.62, 0.65],
    [-0.62, 0.95],
    [-1.35, 0.25],
    [-0.62, -0.45],
    [-0.62, -0.15],
    [0.18, -0.15],
    [0.18, 1.9]
  ],
  right: [
    [0.18, 1.9],
    [0.18, 0.65],
    [0.62, 0.65],
    [0.62, 0.95],
    [1.35, 0.25],
    [0.62, -0.45],
    [0.62, -0.15],
    [-0.18, -0.15],
    [-0.18, 1.9]
  ],
  "straight-left": [
    [-0.18, 1.9],
    [-0.18, 0.35],
    [-0.62, 0.35],
    [-0.62, 0.6],
    [-1.4, 0.05],
    [-0.62, -0.5],
    [-0.62, -0.2],
    [-0.18, -0.2],
    [-0.18, -0.35],
    [-0.55, -0.35],
    [0, -1.6],
    [0.55, -0.35],
    [0.18, -0.35],
    [0.18, 1.9]
  ],
  "straight-right": [
    [0.18, 1.9],
    [0.18, 0.35],
    [0.62, 0.35],
    [0.62, 0.6],
    [1.4, 0.05],
    [0.62, -0.5],
    [0.62, -0.2],
    [0.18, -0.2],
    [0.18, -0.35],
    [0.55, -0.35],
    [0, -1.6],
    [-0.55, -0.35],
    [-0.18, -0.35],
    [-0.18, 1.9]
  ]
});

// src/world/city/JunctionSurface.ts
import { BufferGeometry as BufferGeometry3, Float32BufferAttribute as Float32BufferAttribute3, ShapeUtils as ShapeUtils2, Vector2 as Vector22 } from "three";

// src/world/city/RoadEdgeChain.ts
import { BufferGeometry as BufferGeometry2, Float32BufferAttribute as Float32BufferAttribute2 } from "three";
var RoadEdgeChains = class {
  corridors = [];
  frames = /* @__PURE__ */ new Map();
  starts = /* @__PURE__ */ new Map();
  neighbours = /* @__PURE__ */ new Map();
  roads = /* @__PURE__ */ new Map();
  continuationIds = /* @__PURE__ */ new Map();
  constructor(map, deferred = false) {
    this.initialization = this.initialize(map);
    if (!deferred) drain(this.initialization);
  }
  initialization;
  *initialize(map) {
    const roads = this.roads, paths = /* @__PURE__ */ new Map();
    for (const road of map.roads) {
      roads.set(road.id, road);
      paths.set(road.id, roadPoints(road));
      yield;
    }
    const key = (e) => e.roadId + ":" + e.end;
    const groups = [];
    const endpointGroups = /* @__PURE__ */ new Map();
    for (const link of map.roadLinks ?? []) {
      yield;
      const a = endpointGroups.get(key(link.from)), b = endpointGroups.get(key(link.to));
      if (a && b && a !== b) {
        a.push(...b);
        for (const end of b) endpointGroups.set(key(end), a);
        groups.splice(groups.indexOf(b), 1);
      } else if (a && !b) {
        a.push(link.to);
        endpointGroups.set(key(link.to), a);
      } else if (b && !a) {
        b.push(link.from);
        endpointGroups.set(key(link.from), b);
      } else if (!a && !b) {
        const group = [link.from, link.to];
        groups.push(group);
        endpointGroups.set(key(link.from), group);
        endpointGroups.set(key(link.to), group);
      }
    }
    const neighbour = /* @__PURE__ */ new Map();
    const out = (e) => {
      const p = paths.get(e.roadId), a = e.end === "start" ? p[0] : p.at(-1), b = e.end === "start" ? p[1] : p.at(-2), l = Math.hypot(b.x - a.x, b.z - a.z);
      return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
    };
    for (const g of groups) for (const a of g) {
      yield;
      const r = roads.get(a.roadId), p = paths.get(r.id)[a.end === "start" ? 0 : paths.get(r.id).length - 1], u = out(a);
      const matches = g.filter((b) => b.roadId !== r.id).filter((b) => {
        const s = roads.get(b.roadId), v = out(b), q = paths.get(s.id)[b.end === "start" ? 0 : paths.get(s.id).length - 1];
        return r.laneCount === s.laneCount && r.laneWidth === s.laneWidth && JSON.stringify(r.shoulders) === JSON.stringify(s.shoulders) && r.structure?.barrierEnabled === s.structure?.barrierEnabled && Math.hypot(p.x - q.x, p.z - q.z) < 0.06 && Math.abs((p.y ?? 0) - (q.y ?? 0)) < 0.02 && u.x * v.x + u.z * v.z < -0.95;
      });
      if (matches.length === 1) neighbour.set(key(a), matches[0]);
    }
    for (const [id, end] of neighbour) {
      const back = neighbour.get(key(end));
      if (!back || key(back) !== id) neighbour.delete(id);
    }
    for (const [id, end] of neighbour) this.neighbours.set(id, end);
    const seen = /* @__PURE__ */ new Set();
    for (const seed of map.roads) {
      yield;
      if (seen.has(seed.id)) continue;
      let begin = { roadId: seed.id, end: "start" };
      const searched = /* @__PURE__ */ new Set();
      while (neighbour.has(key(begin)) && !searched.has(begin.roadId)) {
        searched.add(begin.roadId);
        const a = neighbour.get(key(begin));
        begin = { roadId: a.roadId, end: a.end === "start" ? "end" : "start" };
      }
      const parts = [], points = [];
      let current = begin, distance = 0;
      while (!seen.has(current.roadId)) {
        const r = roads.get(current.roadId), reverse = current.end === "end", p = reverse ? [...paths.get(r.id)].reverse() : paths.get(r.id);
        const start = points.length ? points.length - 1 : 0;
        points.push(...points.length ? p.slice(1) : p);
        parts.push({ r, reverse, start, end: points.length - 1 });
        this.starts.set(r.id, { distance, reverse });
        distance += polylineLength(p);
        seen.add(r.id);
        const next = neighbour.get(key({ roadId: r.id, end: reverse ? "start" : "end" }));
        if (!next) break;
        current = next;
      }
      const frames = sampleRibbonPolyline(points, Infinity);
      if (points.length > 3 && Math.hypot(points[0].x - points.at(-1).x, points[0].z - points.at(-1).z) < 0.06) {
        const p = points[0], a = points.at(-2), b = points[1], al = Math.hypot(p.x - a.x, p.z - a.z), bl = Math.hypot(b.x - p.x, b.z - p.z), u = { x: (p.x - a.x) / al, z: (p.z - a.z) / al }, v = { x: (b.x - p.x) / bl, z: (b.z - p.z) / bl }, divisor = Math.max(0.25, 1 + u.x * v.x + u.z * v.z), t = { x: (u.x + v.x) / divisor, z: (u.z + v.z) / divisor };
        frames[0].tangent = t;
        frames.at(-1).tangent = t;
      }
      for (const part of parts) {
        const f = frames.slice(part.start, part.end + 1);
        this.frames.set(part.r.id, part.reverse ? f.reverse().map((a) => ({ point: a.point, tangent: { x: -a.tangent.x, z: -a.tangent.z } })) : f);
      }
      this.corridors.push({ id: "edge:" + parts[0].r.id, roadIds: parts.map((p) => p.r.id), points, length: distance });
      const ids = new Set(parts.map((p) => p.r.id));
      for (const id of ids) this.continuationIds.set(id, ids);
    }
    for (const group of groups) for (const end of group) {
      yield;
      const road = roads.get(end.roadId);
      if (!road.gore && !road.highwayTransition) continue;
      const own = this.frames.get(road.id), frame = own[end.end === "start" ? 0 : own.length - 1];
      const hosts = group.filter((e) => e.roadId !== road.id).map((e) => ({ end: e, road: roads.get(e.roadId) })).filter((q) => q.road.laneCount > road.laneCount || q.road.laneCount === road.laneCount && q.road.laneWidth > road.laneWidth + 0.01).sort((a, b) => b.road.laneCount * b.road.laneWidth - a.road.laneCount * a.road.laneWidth || a.road.id.localeCompare(b.road.id));
      const host = hosts[0];
      if (!host) continue;
      const frames = this.frames.get(host.road.id), other = frames[host.end.end === "start" ? 0 : frames.length - 1], sign = frame.tangent.x * other.tangent.x + frame.tangent.z * other.tangent.z >= 0 ? 1 : -1;
      if (Math.hypot(frame.point.x - other.point.x, frame.point.z - other.point.z) > 0.06 || Math.abs((frame.point.y ?? 0) - (other.point.y ?? 0)) > 0.02 || (frame.tangent.x * other.tangent.x + frame.tangent.z * other.tangent.z) * sign < 0.7) continue;
      frame.tangent = { x: other.tangent.x * sign, z: other.tangent.z * sign };
    }
  }
  continuations(roadId) {
    return this.continuationIds.get(roadId) ?? /* @__PURE__ */ new Set([roadId]);
  }
  edge(road, offset, yOffset = 0) {
    return (this.frames.get(road.id) ?? sampleRibbonPolyline(roadPoints(road), Infinity)).map((f) => ({ x: f.point.x - f.tangent.z * offset, y: (f.point.y ?? 0) + yOffset, z: f.point.z + f.tangent.x * offset }));
  }
  /** Structure offsets may differ at a tunnel portal. Blend both sections to a
   * common wall/rail endpoint while keeping the drivable pavement edge fixed. */
  barrierEdge(road, side, enclosureWall = false) {
    const reserve = (r) => enclosureWall ? r.structure?.enclosure?.wallOffset ?? r.structure?.barrierOffset ?? 0 : r.structure?.barrierOffset ?? 0;
    const frames = this.frames.get(road.id), own = reserve(road), edges = roadEdges(road), length = polylineLength(frames.map((f) => f.point));
    const joined = (end2) => {
      const e = this.neighbours.get(road.id + ":" + end2), other = e ? this.roads.get(e.roadId) : void 0;
      return other && (!enclosureWall || other.structure?.enclosure) ? (own + reserve(other)) / 2 : own;
    };
    const start = joined("start"), end = joined("end");
    let d = 0;
    return frames.map((f, i) => {
      if (i) d += Math.hypot(f.point.x - frames[i - 1].point.x, f.point.z - frames[i - 1].point.z);
      const span = Math.min(30, length / 2), extra = own + (start - own) * Math.max(0, 1 - d / span) + (end - own) * Math.max(0, 1 - (length - d) / span), offset = (side < 0 ? edges.left : edges.right) + side * extra;
      return { x: f.point.x - f.tangent.z * offset, y: f.point.y ?? 0, z: f.point.z + f.tangent.x * offset };
    });
  }
  /** Sampling phase shared across continued road IDs, avoiding paired lamps at seams. */
  firstStation(road, spacing, phase = spacing / 2) {
    const start = this.starts.get(road.id);
    if (!start) return phase;
    const d = ((phase - start.distance) % spacing + spacing) % spacing;
    return start.reverse ? ((start.distance + polylineLength(roadPoints(road)) - phase) % spacing + spacing) % spacing : d;
  }
};
var cache = /* @__PURE__ */ new WeakMap();
function roadEdgeChains(map) {
  let c = cache.get(map);
  if (!c) {
    c = new RoadEdgeChains(map);
    cache.set(map, c);
  }
  return c;
}

// src/world/city/JunctionSurface.ts
function compileJunctionSurface(j) {
  const outline = j.pavementFootprint.map((p) => {
    const q = rotatePoint(p, j.rotation);
    return { x: j.position.x + q.x, y: (j.position.y ?? 0) + (q.y ?? 0), z: j.position.z + q.z };
  });
  const minX = Math.min(...outline.map((p) => p.x)), maxX = Math.max(...outline.map((p) => p.x)), minZ = Math.min(...outline.map((p) => p.z)), maxZ = Math.max(...outline.map((p) => p.z));
  const base = j.position.y ?? 0;
  const planes = outline.map((a, i) => {
    const b = outline[(i + 1) % outline.length], ax = a.x - j.position.x, az = a.z - j.position.z, bx = b.x - j.position.x, bz = b.z - j.position.z, den = ax * bz - az * bx;
    return { ax, az, bx, bz, den, gx: ((a.y - base) * bz - (b.y - base) * az) / den, gz: (ax * (b.y - base) - bx * (a.y - base)) / den };
  }).filter((p) => Math.abs(p.den) > 1e-8);
  return { contains(x, z) {
    if (x < minX || x > maxX || z < minZ || z > maxZ) return false;
    let inside = false;
    for (let i = 0, k = outline.length - 1; i < outline.length; k = i++) {
      const a = outline[i], b = outline[k];
      if (a.z > z !== b.z > z && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
  }, heightAt(x, z) {
    const qx = x - j.position.x, qz = z - j.position.z;
    for (const p of planes) {
      const u = (qx * p.bz - qz * p.bx) / p.den, v = (p.ax * qz - p.az * qx) / p.den;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6) return base + p.gx * qx + p.gz * qz;
    }
    return base;
  } };
}
function junctionSurfaceContains(j, map, p, margin = 0) {
  const q = rotatePoint({ x: p.x - j.position.x, z: p.z - j.position.z }, -j.rotation), outline = j.pavementFootprint;
  if (!outline) {
    const h = junctionExtent(j, map) + margin;
    return Math.abs(q.x) <= h && Math.abs(q.z) <= h;
  }
  let inside = false;
  for (let i = 0, k = outline.length - 1; i < outline.length; k = i++) {
    const a = outline[i], b = outline[k];
    if (a.z > q.z !== b.z > q.z && q.x < (b.x - a.x) * (q.z - a.z) / (b.z - a.z) + a.x)
      inside = !inside;
    const dx = b.x - a.x, dz = b.z - a.z, l = dx * dx + dz * dz, t = l ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.z - a.z) * dz) / l)) : 0;
    const distance = Math.hypot(q.x - a.x - t * dx, q.z - a.z - t * dz);
    if (margin < 0 && distance <= -margin) return false;
    if (distance <= margin + 1e-6)
      return true;
  }
  return inside;
}
function junctionSurfaceHeight(j, p) {
  const outline = j.pavementFootprint, base = j.position.y ?? 0;
  if (!outline)
    return base;
  const q = rotatePoint({ x: p.x - j.position.x, z: p.z - j.position.z }, -j.rotation);
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length], den = a.x * b.z - a.z * b.x;
    if (Math.abs(den) < 1e-8)
      continue;
    const u = (q.x * b.z - q.z * b.x) / den, v = (a.x * q.z - a.z * q.x) / den;
    if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6)
      return base + u * (a.y ?? 0) + v * (b.y ?? 0);
  }
  return base;
}

// src/world/city/RoadClearance.ts
var runtimeCache = /* @__PURE__ */ new WeakMap();
function runtimeRoadClearance(map) {
  let index = runtimeCache.get(map);
  if (!index) {
    index = new RoadClearance(map);
    runtimeCache.set(map, index);
  }
  return index;
}
var RoadClearance = class {
  constructor(map, deferred = false) {
    this.map = map;
    this.initialization = this.initialize(map);
    if (!deferred) drain(this.initialization);
  }
  map;
  buckets = /* @__PURE__ */ new Map();
  junctionBuckets = /* @__PURE__ */ new Map();
  initialization;
  *initialize(map) {
    if (map.regional) for (const junction of map.intersections) {
      yield;
      const radius = (junction.pavementFootprint ? Math.max(...junction.pavementFootprint.map((p) => Math.hypot(p.x, p.z))) : Math.SQRT2 * junctionExtent(junction, map)) + 1e-5;
      for (let x = Math.floor((junction.position.x - radius) / 50); x <= Math.floor((junction.position.x + radius) / 50); x++) for (let z = Math.floor((junction.position.z - radius) / 50); z <= Math.floor((junction.position.z + radius) / 50); z++) {
        const key = x + "," + z, list = this.junctionBuckets.get(key) ?? [];
        list.push(junction);
        this.junctionBuckets.set(key, list);
      }
    }
    for (const road of map.roads) {
      const points = roadPoints(road), edges = roadEdges(road), margin = Math.max(-edges.left, edges.right) + 6;
      for (let i = 1; i < points.length; i++) {
        if (i % 64 === 1) yield;
        const a = points[i - 1], b = points[i], segment = { roadId: road.id, a, b, ...edges, laneHalf: road.laneCount * road.laneWidth / 2 };
        for (let x = Math.floor((Math.min(a.x, b.x) - margin) / 50); x <= Math.floor((Math.max(a.x, b.x) + margin) / 50); x++)
          for (let z = Math.floor((Math.min(a.z, b.z) - margin) / 50); z <= Math.floor((Math.max(a.z, b.z) + margin) / 50); z++) {
            const key = `${x},${z}`, bucket = this.buckets.get(key) ?? [];
            bucket.push(segment);
            this.buckets.set(key, bucket);
          }
      }
    }
  }
  roadAt(p, margin = 0, minY = -Infinity, maxY = Infinity, exclude, match, carriagewayOnly = false) {
    for (let bx = Math.floor((p.x - margin) / 50); bx <= Math.floor((p.x + margin) / 50); bx++) for (let bz = Math.floor((p.z - margin) / 50); bz <= Math.floor((p.z + margin) / 50); bz++) for (const s of this.buckets.get(`${bx},${bz}`) ?? []) {
      if (s.roadId === exclude || match && !match(s.roadId)) continue;
      const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, length = Math.hypot(dx, dz);
      if (length < 0.01) continue;
      const along = ((p.x - s.a.x) * dx + (p.z - s.a.z) * dz) / length;
      if (along < -margin || along > length + margin) continue;
      const t = Math.max(0, Math.min(1, along / length));
      const y = (s.a.y ?? 0) + ((s.b.y ?? 0) - (s.a.y ?? 0)) * t;
      const offset = (-(p.x - s.a.x) * dz + (p.z - s.a.z) * dx) / length;
      if (y >= minY && y <= maxY && offset >= (carriagewayOnly ? -s.laneHalf : s.left) - margin && offset <= (carriagewayOnly ? s.laneHalf : s.right) + margin) return true;
    }
    return false;
  }
  /** Lowest overlying support plane, used to terminate retaining walls below decks. */
  lowestDeckHeight(p, minY, maxY, exclude, margin = 3) {
    let result = Infinity;
    for (const s of this.buckets.get(`${Math.floor(p.x / 50)},${Math.floor(p.z / 50)}`) ?? []) {
      if (s.roadId === exclude) continue;
      const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, l = Math.hypot(dx, dz);
      if (l < 0.01) continue;
      const along = ((p.x - s.a.x) * dx + (p.z - s.a.z) * dz) / l;
      if (along < -margin || along > l + margin) continue;
      const t = Math.max(0, Math.min(1, along / l)), y = (s.a.y ?? 0) + ((s.b.y ?? 0) - (s.a.y ?? 0)) * t, offset = (-(p.x - s.a.x) * dz + (p.z - s.a.z) * dx) / l;
      if (y >= minY && y <= maxY && offset >= s.left - margin && offset <= s.right + margin) result = Math.min(result, y);
    }
    return Number.isFinite(result) ? result : void 0;
  }
  junctionAt(p, margin = 0, minY = -Infinity, maxY = Infinity) {
    const candidates = this.map.regional ? /* @__PURE__ */ new Set() : void 0;
    if (candidates) {
      const pad = Math.max(0, margin);
      for (let x = Math.floor((p.x - pad) / 50); x <= Math.floor((p.x + pad) / 50); x++) for (let z = Math.floor((p.z - pad) / 50); z <= Math.floor((p.z + pad) / 50); z++) for (const j of this.junctionBuckets.get(x + "," + z) ?? []) candidates.add(j);
    }
    for (const j of candidates ?? this.map.intersections) {
      const y = junctionSurfaceHeight(j, p);
      if (y < minY || y > maxY) continue;
      if (junctionSurfaceContains(j, this.map, p, margin)) return true;
    }
    return false;
  }
  /** Includes shoulders, junction crossings and signal sight space. */
  permitsProp(p, radius = 1, height = 2) {
    const y = p.y ?? 0;
    return !this.roadAt(p, radius, y - 2, y + height + 0.65) && !this.junctionAt(p, radius + 8, y - 2, y + height + 0.65);
  }
};
function barrierOffset(road, side, enclosureWall = false) {
  const edges = roadEdges(road);
  return (side < 0 ? edges.left : edges.right) + side * (enclosureWall ? road.structure?.enclosure?.wallOffset ?? road.structure?.barrierOffset ?? 0 : road.structure?.barrierOffset ?? 0);
}

// src/vehicle/physics/CollisionSystem.ts
var rightAxis = (yaw) => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });
var lengthAxis = (yaw) => ({ x: Math.sin(yaw), z: Math.cos(yaw) });
var makeOBB = (center, halfWidth, halfLength, yaw) => {
  const right = rightAxis(yaw);
  const length = lengthAxis(yaw);
  const corners = [];
  for (const [side, end] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    corners.push({
      x: center.x + right.x * halfWidth * side + length.x * halfLength * end,
      z: center.z + right.z * halfWidth * side + length.z * halfLength * end
    });
  }
  return { center: { ...center }, halfWidth, halfLength, yaw, corners };
};
var createStaticOBBCollider = (options) => ({
  ...makeOBB(
    { x: options.x, z: options.z },
    Math.max(0.01, options.width) * 0.5,
    Math.max(0.01, options.length) * 0.5,
    options.yaw ?? 0
  ),
  id: options.id,
  type: options.type ?? "obstacle",
  minHeight: options.minHeight ?? Number.NEGATIVE_INFINITY,
  maxHeight: options.maxHeight ?? Number.POSITIVE_INFINITY
});

// src/world/city/RoadCompileSampling.ts
function roadCompileSampler(points) {
  if (points.length < 16) return (distance) => sampleAt(points, distance);
  const lengths = new Float64Array(points.length);
  for (let i = 1; i < points.length; i++) lengths[i] = Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
  return (distance) => {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], length = lengths[i];
      if (length < 1e-8) continue;
      if (distance <= length || i === points.length - 1) {
        const t = Math.min(1, distance / length);
        return { point: { x: a.x + (b.x - a.x) * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, z: a.z + (b.z - a.z) * t }, tangent: { x: (b.x - a.x) / length, y: ((b.y ?? 0) - (a.y ?? 0)) / length, z: (b.z - a.z) / length } };
      }
      distance -= length;
    }
    return { point: points[0], tangent: { x: 0, z: -1 } };
  };
}

// src/world/regional/RegionalTerrain.ts
import { BufferGeometry as BufferGeometry5, DataTexture, Float32BufferAttribute as Float32BufferAttribute4, Group as Group2, Mesh as Mesh3, MeshLambertMaterial, NearestFilter, Vector2 as Vector23 } from "three";

// src/world/city/VisualStreamingData.ts
import { Box3, BufferAttribute, BufferGeometry as BufferGeometry4, Sphere, Vector3 as Vector32 } from "three";

// src/world/city/CityTerrain.ts
function cityTerrainOffsetAt(forms, x, z) {
  let y = 0;
  for (const f of forms ?? []) {
    const dx = (x - f.center.x) / f.radiusX, dz = (z - f.center.z) / f.radiusZ, q = dx * dx + dz * dz;
    if (q < 1) y += f.height * (1 - q) ** 2;
  }
  return y;
}

// src/world/regional/RegionalTerrain.ts
var samplerCache = /* @__PURE__ */ new WeakMap();
function regionalTerrainSampler(map) {
  let sampler = samplerCache.get(map);
  if (!sampler) {
    sampler = new RegionalTerrainSampler(map);
    samplerCache.set(map, sampler);
  }
  return sampler;
}
var blend = (v) => {
  v = Math.max(0, Math.min(1, v));
  return v * v * (3 - 2 * v);
};
var RegionalTerrainSampler = class {
  constructor(map, deferred = false) {
    this.map = map;
    this.cityAreas = [map.regional.cityBounds, ...map.regional.cityExtensions ?? []];
    this.westCrossings = map.regional.structures.filter((s) => s.kind === "bridge" && s.routes.includes("S37")).map((s) => s.center).sort((a, b) => a.z - b.z);
    this.initialization = this.initialize(map);
    if (!deferred) drain(this.initialization);
  }
  map;
  cityAreas;
  buckets = /* @__PURE__ */ new Map();
  westCrossings;
  initialization;
  *initialize(map) {
    for (const road of map.roads) {
      if (!road.id.startsWith("regional:")) continue;
      for (let i = 1; i < road.centerline.length; i++) {
        if (i % 64 === 1) yield;
        const a = road.centerline[i - 1], b = road.centerline[i], s = { a, b, halfWidth: road.laneCount * road.laneWidth / 2 + 4, tunnel: road.corridorSection === "TUNNEL", bridge: road.corridorSection === "BRIDGE", ramp: road.corridorSection === "RAMP" };
        for (let x = Math.floor((Math.min(a.x, b.x) - 90) / 100); x <= Math.floor((Math.max(a.x, b.x) + 90) / 100); x++) for (let z = Math.floor((Math.min(a.z, b.z) - 90) / 100); z <= Math.floor((Math.max(a.z, b.z) + 90) / 100); z++) {
          const key = `${x},${z}`, bucket = this.buckets.get(key) ?? [];
          bucket.push(s);
          this.buckets.set(key, bucket);
        }
      }
    }
  }
  /** Smooth, low-frequency shoreline shared by terrain, water tiles and diagnostics. */
  shoreAt(x) {
    const coast = this.map.regional?.coast;
    if (!coast || x < coast.minX || x > coast.maxX) return void 0;
    for (let i = 1; i < coast.shoreline.length; i++) {
      const a = coast.shoreline[i - 1], b = coast.shoreline[i];
      if (x <= b.x) {
        const t = blend((x - a.x) / (b.x - a.x));
        return a.z + (b.z - a.z) * t;
      }
    }
    return coast.shoreline.at(-1)?.z;
  }
  waterAt(x, z) {
    const shore = this.shoreAt(x);
    if (shore !== void 0) return z > shore;
    const east = 6250 + z * 0.08 + 80 * Math.sin(z / 1300);
    const a = this.westCrossings[0], b = this.westCrossings[1], t = a && b ? (z - a.z) / (b.z - a.z) : 0;
    const west = a && b ? a.x + (b.x - a.x) * t + 220 * Math.sin(t * Math.PI * 2) : -3450 - 500 * Math.sin(z / 850);
    return x > 4e3 && Math.abs(x - east) < 260 || x < -2600 && Math.abs(x - west) < 42 || x > 6800 && Math.abs((z + 50) % 900) < 12;
  }
  macroHeight(x, z) {
    if (this.cityAreas.some((city) => x >= city.minX && x <= city.maxX && z >= city.minZ && z <= city.maxZ)) return -0.04 + cityTerrainOffsetAt(this.map.environment.landforms, x, z);
    const north = blend((-z - 2100) / 2200);
    const ridge = 55 * Math.exp(-(((z + 3250) / 380) ** 2)) + 65 * Math.exp(-(((z + 5050) / 540) ** 2));
    const valley = 12 + 10 * Math.sin(x / 1600) ** 2;
    let height = north * (ridge + valley) + blend((-x - 2500) / 1600) * 10 * (0.6 + 0.4 * Math.sin(z / 780));
    if (this.map.regional?.highways && x > 4500 && z < -5300) height += 55 * Math.exp(-(((x - 5350) / 1500) ** 2) - ((z + 6500) / 650) ** 2);
    if (this.waterAt(x, z)) height = -7;
    const coast = this.map.regional?.coast, shore = this.shoreAt(x);
    if (coast && shore !== void 0) {
      const distance = z - shore, width = coast.transitionWidth / 2;
      const coastal = coast.seaLevel + (distance < 0 ? coast.landHeight - coast.seaLevel : 8) * Math.tanh(-distance / width);
      height += (coastal - height) * blend((x - coast.minX) / 1e3);
    }
    return height - 0.04;
  }
  projection(x, z, s) {
    const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, t = Math.max(0, Math.min(1, ((x - s.a.x) * dx + (z - s.a.z) * dz) / (dx * dx + dz * dz)));
    return { distance: Math.hypot(x - s.a.x - dx * t, z - s.a.z - dz * t), height: (s.a.y ?? 0) + ((s.b.y ?? 0) - (s.a.y ?? 0)) * t };
  }
  nearRoad(x, z, margin) {
    return (this.buckets.get(`${Math.floor(x / 100)},${Math.floor(z / 100)}`) ?? []).some((s) => this.projection(x, z, s).distance < s.halfWidth + margin);
  }
  heightAt(x, z) {
    let result = this.macroHeight(x, z), best = Infinity, selected, height = 0;
    for (const s of this.buckets.get(`${Math.floor(x / 100)},${Math.floor(z / 100)}`) ?? []) {
      const q = this.projection(x, z, s), distance = q.distance - s.halfWidth;
      if (distance < best) {
        best = distance;
        selected = s;
        height = q.height;
      }
    }
    if (selected && best < 65) {
      if (selected.tunnel) return Math.max(result, height + 10);
      if (selected.ramp) result = Math.min(result, height - 0.65) * (1 - blend((best - 25) / 40)) + result * blend((best - 25) / 40);
      else if (selected.bridge) result = Math.min(result, height - 12) * (1 - blend(best / 65)) + result * blend(best / 65);
      else {
        const u = blend((best - 25) / 65);
        result = (height - 0.04) * (1 - u) + result * u;
      }
    }
    for (const s of this.buckets.get(`${Math.floor(x / 100)},${Math.floor(z / 100)}`) ?? []) {
      if (s.tunnel) continue;
      const q = this.projection(x, z, s), d = q.distance - s.halfWidth;
      if (d < 65) {
        const u = blend((d - 25) / 40), cap = q.height - (s.ramp || s.bridge ? 0.65 : 0.04);
        result = Math.min(result, cap * (1 - u) + result * u);
      }
    }
    return result;
  }
};

// src/world/city/RoadClassification.ts
function roadFunction(road) {
  switch (road.roadClass) {
    case "avenue":
      return "arterial";
    case "alley":
      return "local";
    case "industrial":
      return "collector";
    case void 0:
      if (road.styleId === "urban_auxiliary_2") return "frontage";
      if (road.styleId === "collector_distributor_2") return "connector";
      if (road.type === "highway" && road.styleId === "urban_local_2" && road.speedLimit <= 30) return "collector";
      if (road.type === "ramp_1" || road.gore && road.laneCount <= 2) return "ramp";
      if (road.type === "highway" || road.styleId === "urban_expressway_6") return "expressway";
      return road.type === "urban_6lane" ? "arterial" : road.type === "urban_4lane" ? "collector" : "local";
    default:
      return road.roadClass;
  }
}

// src/world/city/RoadPavementSurface.ts
function roadPavementTriangle(a, b, c, length, masks = []) {
  const ux = b.x - a.x, uz = b.z - a.z, vx = c.x - a.x, vz = c.z - a.z, den = ux * vz - uz * vx;
  const gx = (((b.y ?? 0) - (a.y ?? 0)) * vz - ((c.y ?? 0) - (a.y ?? 0)) * uz) / den, gz = (ux * ((c.y ?? 0) - (a.y ?? 0)) - vx * ((b.y ?? 0) - (a.y ?? 0))) / den;
  const heightAt = (x, z) => (a.y ?? 0) + gx * (x - a.x) + gz * (z - a.z);
  return { gx, gz, length, heightAt, extensionAt: (_x, _z) => 0, contains: (extra) => (x, z) => {
    const u = ((x - a.x) * vz - (z - a.z) * vx) / den, v = (ux * (z - a.z) - uz * (x - a.x)) / den;
    const tolerance = extra / Math.max(0.1, Math.min(Math.hypot(ux, uz), Math.hypot(vx, vz)));
    if (u < -tolerance - 1e-7 || v < -tolerance - 1e-7 || u + v > 1 + tolerance + 1e-7) return false;
    for (const mask of masks) if (mask.contains(x, z) && Math.abs(mask.heightAt(x, z) - heightAt(x, z)) <= 0.5) return false;
    return true;
  } };
}

// src/world/city/RoadCarriageway.ts
var innerRoadSide = (road) => road.travelDirection === "reverse" ? 1 : -1;
var hasCentralBarrier = (road) => road.travelDirection === "two-way" && road.structure?.medianBarrierStyle === "concrete" && road.structure.barrierEnabled !== false;
var cache2 = /* @__PURE__ */ new WeakMap();
function roadCarriageways(map) {
  let index = cache2.get(map);
  if (!index) {
    index = new RoadCarriageways(map);
    cache2.set(map, index);
  }
  return index;
}
var RoadCarriageways = class {
  constructor(map, deferred = false) {
    this.map = map;
    this.initialization = this.initialize();
    if (!deferred) drain(this.initialization);
  }
  map;
  buckets = /* @__PURE__ */ new Map();
  paving = /* @__PURE__ */ new Map();
  initialization;
  prepareSteps() {
    return this.initialization;
  }
  *initialize() {
    const map = this.map;
    let work = 0;
    for (const road of map.roads) {
      yield;
      if (road.travelDirection === "two-way" || road.laneCount < 2 || road.highwayTransition) continue;
      const kind = roadFunction(road);
      if (kind !== "expressway" && kind !== "arterial" && road.designProfile !== "motorway") continue;
      const points = roadPoints(road), margin = road.laneCount * road.laneWidth / 2 + 36;
      for (let i = 1; i < points.length; i++) {
        if (++work % 32 === 0) yield;
        const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length < 1e-6) continue;
        const entry = { road, a, b, length, tx: (b.x - a.x) / length, tz: (b.z - a.z) / length };
        for (let x = Math.floor((Math.min(a.x, b.x) - margin) / 64); x <= Math.floor((Math.max(a.x, b.x) + margin) / 64); x++) for (let z = Math.floor((Math.min(a.z, b.z) - margin) / 64); z <= Math.floor((Math.max(a.z, b.z) + margin) / 64); z++) {
          const key = x + "," + z, list = this.buckets.get(key) ?? [];
          list.push(entry);
          this.buckets.set(key, list);
        }
      }
    }
  }
  /** Exact load-time footing plane. Nominal shoulder overlap alone is not
   * sufficient at a mitered road-ID seam or a masked junction mouth. */
  pavedHeight(roadId, p) {
    let paving = this.paving.get(roadId);
    if (!paving) {
      const road = this.map.roads.find((r) => r.id === roadId);
      const edges = roadEdges(road), chains = roadEdgeChains(this.map), left = chains.edge(road, edges.left), right = chains.edge(road, edges.right), masks = this.map.intersections.filter((j) => j.pavementFootprint && j.connections.some((c) => c.roadId === roadId)).map(compileJunctionSurface);
      const planes = [], cells = /* @__PURE__ */ new Map();
      for (let i = 1; i < left.length; i++) for (const [a, b, c] of [[left[i - 1], right[i - 1], left[i]], [right[i - 1], right[i], left[i]]]) if (Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) > 1e-8) {
        const id = planes.length, minX = Math.min(a.x, b.x, c.x), maxX = Math.max(a.x, b.x, c.x), minZ = Math.min(a.z, b.z, c.z), maxZ = Math.max(a.z, b.z, c.z);
        const epsilon = 1e-6 + (maxX - minX + maxZ - minZ) * 3e-7;
        planes.push(roadPavementTriangle(a, b, c, 1, masks));
        for (let x = Math.floor((minX - epsilon) / 32); x <= Math.floor((maxX + epsilon) / 32); x++) for (let z = Math.floor((minZ - epsilon) / 32); z <= Math.floor((maxZ + epsilon) / 32); z++) {
          const key = x + "," + z, list = cells.get(key) ?? [];
          list.push(id);
          cells.set(key, list);
        }
      }
      paving = { planes, cells };
      this.paving.set(roadId, paving);
    }
    let height, error = Infinity;
    for (const id of paving.cells.get(Math.floor(p.x / 32) + "," + Math.floor(p.z / 32)) ?? []) {
      const plane = paving.planes[id];
      if (plane.contains(0)(p.x, p.z)) {
        const y = plane.heightAt(p.x, p.z), e = Math.abs(y - (p.y ?? 0));
        if (e < error) {
          height = y;
          error = e;
        }
      }
    }
    return error <= 0.2 ? height : void 0;
  }
  opposing(road, p, tangent) {
    if (road.travelDirection === "two-way" || road.laneCount < 2 || road.highwayTransition) return void 0;
    const sign = road.travelDirection === "reverse" ? -1 : 1, side = innerRoadSide(road), half = road.laneCount * road.laneWidth / 2, ownEdges = roadEdges(road), ownPaved = side < 0 ? -ownEdges.left : ownEdges.right;
    let result, best = Infinity;
    for (const s of this.buckets.get(Math.floor(p.x / 64) + "," + Math.floor(p.z / 64)) ?? []) {
      if (s.road.id === road.id) continue;
      const otherSign = s.road.travelDirection === "reverse" ? -1 : 1, dot = tangent.x * s.tx + tangent.z * s.tz;
      if (dot * sign * otherSign > -0.97) continue;
      const t = ((p.x - s.a.x) * s.tx + (p.z - s.a.z) * s.tz) / s.length;
      if (t < 0 || t > 1) continue;
      const q = { x: s.a.x + (s.b.x - s.a.x) * t, y: (s.a.y ?? 0) + ((s.b.y ?? 0) - (s.a.y ?? 0)) * t, z: s.a.z + (s.b.z - s.a.z) * t };
      if (Math.abs((p.y ?? 0) - (q.y ?? 0)) > 0.2) continue;
      const lateral = (-(q.x - p.x) * tangent.z + (q.z - p.z) * tangent.x) * side, otherHalf = s.road.laneCount * s.road.laneWidth / 2;
      if (lateral < Math.max(half, otherHalf) + 0.2 || lateral > half + otherHalf + 16 || lateral >= best) continue;
      const facing = (-(p.x - q.x) * s.tz + (p.z - q.z) * s.tx) * innerRoadSide(s.road);
      if (facing < otherHalf) continue;
      const edges = roadEdges(s.road), otherPaved = innerRoadSide(s.road) < 0 ? -edges.left : edges.right;
      const axis = (half + lateral - otherHalf) / 2, midpoint = { x: p.x - tangent.z * side * axis, y: Math.min(p.y ?? 0, q.y ?? 0), z: p.z + tangent.x * side * axis };
      const pavementGap = lateral - ownPaved - otherPaved;
      result = { road: s.road, laneGap: lateral - half - otherHalf, pavementGap, distance: lateral, midpoint, sharedPavement: pavementGap <= 0.05 };
      best = lateral;
    }
    return result;
  }
};

// src/world/city/RoadInfrastructure.ts
function retainingWallHeight(road, p, clearance) {
  const y = p.y ?? 0, top = Math.max(0.3, y + (road.designProfile === "motorway" && road.structure?.enclosure?.kind === "cutting" ? road.structure.enclosure.clearance : 1.1)), deck = clearance?.lowestDeckHeight(p, y + 4.5, top + 0.65, road.id);
  return (deck === void 0 ? top : Math.min(top, deck - 0.65)) - y;
}
function barrierPoints(road, _map) {
  const points = roadPoints(road), length = polylineLength(points);
  const start = 0, end = length;
  const result = [];
  for (let d = start; d < end; d += 3) result.push(sampleAt(points, d).point);
  result.push(sampleAt(points, end).point);
  return result;
}
function* roadPierSteps(road, map, clearance = map ? new RoadClearance(map) : void 0) {
  if (road.structure?.piersEnabled === false) return [];
  let work = 0;
  const points = roadPoints(road), length = polylineLength(points), spacing = road.structure?.pierSpacing ?? 30, piers = [];
  for (let d = spacing / 2; d < length - 8; d += spacing) {
    if (++work % 16 === 0) yield;
    const { point: p } = sampleAt(points, d), baseY = map?.regional && road.id.startsWith("regional:") ? regionalTerrainSampler(map).heightAt(p.x, p.z) : 0, height = (p.y ?? 0) - 0.65 - baseY;
    if (height < 2) continue;
    if (clearance?.junctionAt(p, 10, baseY, (p.y ?? 0) - 0.65) || clearance?.roadAt(p, 2, baseY, (p.y ?? 0) - 0.65, road.id)) continue;
    piers.push({ position: p, height, baseY });
  }
  return piers;
}
function* barrierSectionSteps(road, map, clearance = map ? new RoadClearance(map) : void 0, retainingWall = false) {
  let work = 0;
  const sections = [];
  const continuation = map ? roadEdgeChains(map).continuations(road.id) : /* @__PURE__ */ new Set([road.id]);
  const carriageways = map ? roadCarriageways(map) : void 0;
  const branchOpenings = retainingWall && road.structure?.enclosure?.kind !== "cutting" ? road.structure?.enclosure?.branchOpenings : void 0;
  const blocked = (p) => {
    const y = p.y ?? 0, top = retainingWall ? y + (branchOpenings ? road.structure.enclosure.clearance : retainingWallHeight(road, p, clearance)) + 0.3 : y + 1.3;
    return !!(clearance?.roadAt(p, retainingWall ? 0.9 : 0.5, y - 2.1, top, road.id, (id) => branchOpenings ? branchOpenings.includes(id) : !continuation.has(id)) || !branchOpenings && clearance?.junctionAt(p, retainingWall ? 0.9 : 0.5, y - 2.1, top));
  };
  const boundary = (a, b) => {
    let lo = 0, hi = 1;
    const state = blocked(a);
    for (let n = 0; n < 15; n++) {
      const t2 = (lo + hi) / 2, p = { x: a.x + (b.x - a.x) * t2, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t2, z: a.z + (b.z - a.z) * t2 };
      if (blocked(p) === state) lo = t2;
      else hi = t2;
    }
    const t = state ? hi : lo;
    return { x: a.x + (b.x - a.x) * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, z: a.z + (b.z - a.z) * t };
  };
  for (const side of [-1, 1]) {
    const edge = map ? roadEdgeChains(map).barrierEdge(road, side, retainingWall) : barrierPoints(road).map((p, i, a) => {
      const b = a[Math.min(i + 1, a.length - 1)], c = a[Math.max(0, i - 1)], l = Math.hypot(b.x - c.x, b.z - c.z) || 1, offset = barrierOffset(road, side, retainingWall);
      return { x: p.x - (b.z - c.z) / l * offset, y: p.y, z: p.z + (b.x - c.x) / l * offset };
    });
    const path = [];
    for (let i = 1; i < edge.length; i++) {
      const a = edge[i - 1], b = edge[i], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 3));
      if (!path.length) path.push(a);
      for (let n = 1; n <= steps; n++) {
        if (++work % 64 === 0) yield;
        const t = n / steps;
        path.push(n === steps ? b : { x: a.x + (b.x - a.x) * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, z: a.z + (b.z - a.z) * t });
      }
    }
    if (!retainingWall && carriageways && road.travelDirection !== "two-way" && side === innerRoadSide(road)) {
      const centre = roadPoints(road), total = polylineLength(centre), sample = roadCompileSampler(centre);
      let run = [];
      const flushMedian = () => {
        if (run.length > 1) sections.push({ side, points: run, kind: "shared-median" });
        run = [];
      };
      for (let d = 0; d <= total; d = Math.min(total, d + 3)) {
        if (++work % 16 === 0) yield;
        const f = sample(d), pair = carriageways.opposing(road, f.point, f.tangent);
        if (pair?.sharedPavement && pair.laneGap >= 0.6) {
          const p = pair.midpoint, own = carriageways.pavedHeight(road.id, p), opposite = carriageways.pavedHeight(pair.road.id, p), floor = own === void 0 ? opposite : opposite === void 0 ? own : Math.max(own, opposite), y = floor ?? p.y ?? 0;
          if (floor !== void 0 && road.id.localeCompare(pair.road.id) < 0 && !clearance?.roadAt(p, 0.2, y - 2.1, y + 1.3, road.id, (id) => id !== pair.road.id && !continuation.has(id), true) && !clearance?.junctionAt(p, 0.5, y - 2.1, y + 1.3)) run.push({ ...p, y });
          else flushMedian();
        } else flushMedian();
        if (d === total) break;
      }
      flushMedian();
    }
    let current = [];
    const flush = () => {
      if (current.length > 1) sections.push({ side, points: current });
      current = [];
    };
    for (let i = 1; i < path.length; i++) {
      if (++work % 16 === 0) yield;
      const a = path[i - 1], b = path[i], length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 0.01) continue;
      const p = {
        x: (a.x + b.x) / 2,
        y: ((a.y ?? 0) + (b.y ?? 0)) / 2,
        z: (a.z + b.z) / 2
      };
      const ba = blocked(a), bb = blocked(b), bm = blocked(p);
      if (ba && bb) {
        flush();
        continue;
      }
      if (!ba && !bb && !bm) {
        if (!current.length) current.push(a);
        current.push(b);
        continue;
      }
      if (!ba) {
        if (!current.length) current.push(a);
        current.push(boundary(a, bm ? p : b));
        flush();
      } else flush();
      if (!bb) {
        current.push(boundary(bm ? p : a, b), b);
      }
    }
    flush();
  }
  return sections;
}
function* centralBarrierSectionSteps(road, map, clearance = map ? new RoadClearance(map) : void 0) {
  if (!hasCentralBarrier(road)) return [];
  const linked = /* @__PURE__ */ new Set();
  for (const link of map?.roadLinks ?? []) {
    if (link.from.roadId === road.id) linked.add(link.to.roadId);
    if (link.to.roadId === road.id) linked.add(link.from.roadId);
  }
  let work = 0;
  const points = roadPoints(road), length = polylineLength(points), sections = [];
  let run = [];
  const sample = roadCompileSampler(points);
  const flush = () => {
    if (run.length > 1) sections.push(run);
    run = [];
  };
  for (let d = 0; d <= length; d = Math.min(length, d + 1.5)) {
    if (++work % 16 === 0) yield;
    const p = sample(d).point, y = p.y ?? 0;
    if (clearance?.junctionAt(p, 1, y - 0.2, y + 0.2) || clearance?.roadAt(p, 0.2, y - 0.2, y + 1.3, road.id, (id) => !linked.has(id), true)) flush();
    else run.push(p);
    if (d === length) break;
  }
  flush();
  return sections;
}
function* enclosureWallSectionSteps(road, map, clearance = map ? new RoadClearance(map) : void 0) {
  if (road.structure?.enclosure?.kind === "cutting" || road.structure?.enclosure?.branchOpenings?.length) return yield* barrierSectionSteps(road, map, clearance, true);
  return [-1, 1].map((side) => ({ side, points: map ? roadEdgeChains(map).barrierEdge(road, side, true) : roadPoints(road) }));
}
function* roadStructureColliderSteps(road, map, clearance = new RoadClearance(map)) {
  let count = 0;
  for (const points of yield* centralBarrierSectionSteps(road, map, clearance)) for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.z - a.z);
    yield createStaticOBBCollider({ id: `${road.id}:median:${count++}`, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, width: 0.24, length, yaw: Math.atan2(b.x - a.x, b.z - a.z), minHeight: Math.min(a.y ?? 0, b.y ?? 0) + 0.024, maxHeight: Math.max(a.y ?? 0, b.y ?? 0) + 1.1, type: "guardrail" });
  }
  for (const [i, p] of (yield* roadPierSteps(road, map, clearance)).entries()) {
    count++;
    yield createStaticOBBCollider({ id: `${road.id}:pier:${i}`, x: p.position.x, z: p.position.z, width: 1.2, length: 1.2, minHeight: p.baseY, maxHeight: p.baseY + p.height, type: "obstacle" });
  }
  for (const { side, points: originalPoints } of yield* barrierSectionSteps(road, map, clearance)) {
    const points = road.id.startsWith("regional:") ? originalPoints.filter((b, i, p) => {
      if (!i || i === p.length - 1) return true;
      const a = p[i - 1], c = p[i + 1], dx = b.x - a.x, dz = b.z - a.z, ex = c.x - b.x, ez = c.z - b.z;
      return Math.abs(dx * ez - dz * ex) > 1e-7 || dx * ex + dz * ez <= 0 || Math.abs((a.y ?? 0) - (b.y ?? 0)) > 1e-7 || Math.abs((b.y ?? 0) - (c.y ?? 0)) > 1e-7;
    }) : originalPoints;
    const offset = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 0.01 || road.structure?.barrierEnabled === false || road.structure?.barrierEnabled !== true && Math.max(a.y ?? 0, b.y ?? 0) < 2) continue;
      yield createStaticOBBCollider({
        id: `${road.id}:barrier:${count++}:${side}`,
        x: (a.x + b.x) / 2 - (b.z - a.z) / length * offset,
        z: (a.z + b.z) / 2 + (b.x - a.x) / length * offset,
        width: 0.28,
        length,
        yaw: Math.atan2(b.x - a.x, b.z - a.z),
        minHeight: Math.min(a.y ?? 0, b.y ?? 0) + 0.05,
        maxHeight: Math.max(a.y ?? 0, b.y ?? 0) + 1.1,
        type: "guardrail"
      });
    }
  }
  const enclosure = road.structure?.enclosure;
  if (enclosure) {
    const chain = roadEdgeChains(map), points = chain.edge(road, 0), left = chain.barrierEdge(road, -1, true), right = chain.barrierEdge(road, 1, true);
    const walls = yield* enclosureWallSectionSteps(road, map, clearance);
    for (const { side, points: wallPoints } of walls) for (let i = 1; i < wallPoints.length; i++) {
      const a = wallPoints[i - 1], b = wallPoints[i], length = Math.hypot(b.x - a.x, b.z - a.z);
      const offset = side * 0.15;
      const p = { x: (a.x + b.x) / 2 - (b.z - a.z) / length * offset, y: Math.max(a.y ?? 0, b.y ?? 0), z: (a.z + b.z) / 2 + (b.x - a.x) / length * offset };
      yield createStaticOBBCollider({
        id: `${road.id}:wall:${count++}:${side}`,
        x: p.x,
        z: p.z,
        width: 0.3,
        length: length + 0.04,
        yaw: Math.atan2(b.x - a.x, b.z - a.z),
        minHeight: Math.min(a.y ?? 0, b.y ?? 0),
        maxHeight: p.y + (enclosure.kind === "cutting" ? retainingWallHeight(road, p, clearance) : enclosure.clearance),
        type: "obstacle"
      });
    }
    if (enclosure.kind !== "cutting") for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 0.01) continue;
      const nx = -(b.z - a.z) / length, nz = (b.x - a.x) / length, cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
      const offsets = [left[i - 1], left[i], right[i - 1], right[i]].map((p) => (p.x - cx) * nx + (p.z - cz) * nz), lo = Math.min(...offsets) - 0.3, hi = Math.max(...offsets) + 0.3, offset = (lo + hi) / 2;
      count++;
      yield createStaticOBBCollider({
        id: `${road.id}:ceiling:${i}`,
        x: cx + nx * offset,
        z: cz + nz * offset,
        width: hi - lo,
        length: length + 0.04,
        yaw: Math.atan2(b.x - a.x, b.z - a.z),
        minHeight: Math.min(a.y ?? 0, b.y ?? 0) + enclosure.clearance,
        maxHeight: Math.max(a.y ?? 0, b.y ?? 0) + enclosure.clearance + 0.65,
        type: "obstacle"
      });
    }
  }
}

// src/world/city/CityPhysicsSectors.ts
var CityPhysicsSectors = class {
  constructor(sectors, publish) {
    this.sectors = sectors;
    this.publish = publish;
    const size = sectors.map.sectorSize;
    this.activeRadius = size * 0.6;
    this.preloadRadius = this.activeRadius + size;
    this.order = new Map(sectors.map.roads.map((r, i) => [r, i]));
  }
  sectors;
  publish;
  jobs = /* @__PURE__ */ new Map();
  active = /* @__PURE__ */ new Set();
  wanted = [];
  required = /* @__PURE__ */ new Set();
  guardRoads = /* @__PURE__ */ new Set();
  published = [];
  signature = "";
  selectedAt = -Infinity;
  safeCells = "";
  dirty = false;
  disposed = false;
  order;
  activeRadius;
  preloadRadius;
  forwardMetres = 0;
  buildActiveMs = 0;
  maxBatchMs = 0;
  maxSingleBuildStepMs = 0;
  synchronousFallbacks = 0;
  completedRoads = 0;
  keys(x, z, radius) {
    const size = this.sectors.map.sectorSize, keys = [];
    for (let sx = Math.floor((x - radius) / size); sx <= Math.floor((x + radius) / size); sx++)
      for (let sz = Math.floor((z - radius) / size); sz <= Math.floor((z + radius) / size); sz++) keys.push(`${sx},${sz}`);
    return keys;
  }
  roads(keys) {
    const roads = /* @__PURE__ */ new Set();
    for (const key of keys) for (const road of this.sectors.roadsForSector(key) ?? []) roads.add(road);
    return roads;
  }
  select(x, z, vx = 0, vz = 0) {
    const now = performance.now(), size = this.sectors.map.sectorSize;
    const signature = this.sectors.sectorKey(x, z);
    if (signature === this.signature && now - this.selectedAt < 200) return;
    this.signature = signature;
    this.selectedAt = now;
    this.active = new Set(this.keys(x, z, this.activeRadius));
    this.required = this.roads(this.active);
    this.dirty = true;
    const speed = Math.hypot(vx, vz), fx = speed > 0.1 ? vx / speed : 0, fz = speed > 0.1 ? vz / speed : 0;
    this.forwardMetres = Math.min(size * 4, speed * 12);
    const preload = new Set(this.keys(x, z, this.preloadRadius));
    for (let d = 0; d <= this.forwardMetres; d += size * 0.5)
      for (const key of this.keys(x + fx * d, z + fz * d, this.activeRadius)) preload.add(key);
    for (const key of this.keys(x + fx * this.forwardMetres, z + fz * this.forwardMetres, this.activeRadius)) preload.add(key);
    const wanted = this.roads(preload);
    this.wanted = [...wanted].sort((a, b) => Number(this.required.has(b)) - Number(this.required.has(a)) || this.distance(a, x, z, fx, fz) - this.distance(b, x, z, fx, fz));
    const retained = this.roads(this.keys(x, z, this.preloadRadius + size * 2));
    for (const road of wanted) retained.add(road);
    for (const [road, job] of this.jobs) if (!retained.has(road)) {
      job.task.return(void 0);
      this.jobs.delete(road);
      if (job.ready) this.dirty = true;
    }
    this.safeCells = "";
  }
  distance(road, x, z, fx, fz) {
    let best = Infinity;
    for (const p of road.centerline) {
      const dx = p.x - x, dz = p.z - z;
      best = Math.min(best, Math.hypot(dx, dz) - Math.max(0, dx * fx + dz * fz) * 0.4);
    }
    return best;
  }
  job(road) {
    let job = this.jobs.get(road);
    if (!job) {
      job = { task: roadStructureColliderSteps(road, this.sectors.map, runtimeRoadClearance(this.sectors.map)), colliders: [], ready: false };
      this.jobs.set(road, job);
    }
    return job;
  }
  step(job) {
    const started = performance.now();
    const next = job.task.next();
    this.maxSingleBuildStepMs = Math.max(this.maxSingleBuildStepMs, performance.now() - started);
    if (next.done) {
      job.ready = true;
      this.dirty = true;
      this.completedRoads++;
    } else if (next.value) job.colliders.push(next.value);
  }
  commit() {
    if (!this.dirty) return;
    const roads = /* @__PURE__ */ new Set([...this.required, ...this.guardRoads]);
    const jobs = [...roads].sort((a, b) => this.order.get(a) - this.order.get(b)).map((r) => this.jobs.get(r)).filter((j) => !!j?.ready);
    if (jobs.length !== this.published.length || jobs.some((job, i) => job !== this.published[i])) {
      this.publish(jobs.map((j) => j.colliders));
      this.published = jobs;
    }
    this.dirty = false;
  }
  advance(budgetMs = 3, requiredOnly = false) {
    if (this.disposed) return;
    const started = performance.now();
    for (const road of requiredOnly ? this.required : this.wanted) {
      const job = this.job(road);
      while (!job.ready) {
        this.step(job);
        if (performance.now() - started >= budgetMs) {
          this.finishBatch(started);
          return;
        }
      }
    }
    this.finishBatch(started);
  }
  get preloadProgress() {
    let done = 0;
    for (const road of this.wanted) if (this.jobs.get(road)?.ready) done++;
    return { done, total: this.wanted.length };
  }
  finishBatch(started) {
    this.commit();
    const elapsed = performance.now() - started;
    this.buildActiveMs += elapsed;
    this.maxBatchMs = Math.max(this.maxBatchMs, elapsed);
  }
  async prepareSpawn(x, z, yaw, signal) {
    this.select(x, z, -Math.sin(yaw), -Math.cos(yaw));
    const started = performance.now();
    while ([...this.required].some((road) => !this.jobs.get(road)?.ready)) {
      if (signal?.aborted) throw new DOMException("Loading cancelled", "AbortError");
      this.advance(5, true);
      await nextPaint();
    }
    this.commit();
    performance.mark("loading:spawnPhysicsReady");
    performance.measure("physics:spawnReady", { start: started, end: performance.now(), detail: this.statistics });
  }
  /** Before every physical sweep: finish only missing roads in the swept guard.
   * No speed/pose correction or invented wall. The usual path is four floor ops.
   * Surface support is global, so loading can never turn a road into grass/void. */
  ensure(x, z, vx, vz, dt, bodyRadius) {
    if (this.disposed) return;
    this.select(x, z, vx, vz);
    const size = this.sectors.map.sectorSize, radius = bodyRadius + Math.hypot(vx, vz) * Math.max(0, dt) * 2 + 4;
    const minX = Math.floor((x - radius) / size), maxX = Math.floor((x + radius) / size), minZ = Math.floor((z - radius) / size), maxZ = Math.floor((z + radius) / size);
    const cells = `${minX},${maxX},${minZ},${maxZ}`;
    if (cells === this.safeCells) return;
    this.guardRoads.clear();
    this.dirty = true;
    const started = performance.now();
    let fallback = false;
    for (let sx = minX; sx <= maxX; sx++) for (let sz = minZ; sz <= maxZ; sz++) for (const road of this.sectors.roadsForSector(`${sx},${sz}`) ?? []) {
      this.guardRoads.add(road);
      const job = this.job(road);
      if (!job.ready) fallback = true;
      while (!job.ready) this.step(job);
    }
    if (fallback) this.synchronousFallbacks++;
    this.finishBatch(started);
    this.safeCells = cells;
  }
  get statistics() {
    let readySectors = 0, cachedColliders = 0;
    for (const key of this.active) if ([...this.sectors.roadsForSector(key) ?? []].every((r) => this.jobs.get(r)?.ready)) readySectors++;
    for (const job of this.jobs.values()) if (job.ready) cachedColliders += job.colliders.length;
    const colliders = this.published.reduce((sum, j) => sum + j.colliders.length, 0);
    return { activeSectors: readySectors, requestedActiveSectors: this.active.size, readySectors, cachedRoads: this.jobs.size, totalRoads: this.sectors.map.roads.length, completedRoads: this.completedRoads, colliders, cachedColliders, activeRadius: this.activeRadius, preloadRadius: this.preloadRadius, forwardMetres: this.forwardMetres, colliderBuildActiveMs: this.buildActiveMs, maxBatchMs: this.maxBatchMs, maxSingleBuildStepMs: this.maxSingleBuildStepMs, synchronousFallbacks: this.synchronousFallbacks };
  }
  dispose() {
    this.disposed = true;
    for (const job of this.jobs.values()) job.task.return(void 0);
    this.jobs.clear();
    this.wanted = [];
    this.required.clear();
    this.guardRoads.clear();
    this.published = [];
    this.active.clear();
  }
};
export {
  CityPhysicsSectors,
  StreamingShaderWarmup,
  newCityMap
};
