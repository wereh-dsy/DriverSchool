import { readFileSync, writeFileSync } from 'node:fs';

const output = new URL('./', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name + '.json', output), 'utf8'));
const mib = bytes => bytes / 1048576;
const percentiles = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const at = p => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? null;
  return { n: sorted.length, p50: at(.5), p95: at(.95), p99: at(.99), max: at(1) };
};
const frames = values => ({
  ...percentiles(values),
  ...Object.fromEntries([33, 50, 100].map(ms => ['over' + ms, values.filter(value => value > ms).length])),
});

const comparison = {};
for (const variant of ['before', 'after', 'final']) {
  const run = read(variant + '-cold-day');
  const exit = read(variant + '-day-release');
  const heaps = read('heaps-' + variant);
  const worker = run.resources.worker;
  const events = run.frameTiming.cpuSlow.filter(event => event.start >= run.driveAt);
  const screen = run.initialization.measures.filter(event => event.name.startsWith('loading:firstScreen:'));
  const { background, cachedRoadBytes, terrainCacheBytes, recipeBudgetBytes, pinnedRoadBytes, borrowedTerrainBytes } = run.resources;
  comparison[variant] = {
    conditions: run.conditions,
    loadingMs: run.loadMs,
    loadingFrames: frames(run.loadingFrames),
    loadingTasksOver50Ms: run.longTasks.filter(row => row.start >= run.clickAt && row.start < run.driveAt),
    loadingBatchesMs: run.initialization.measures.filter(event => event.name === 'loading:batched').map(event => event.detail),
    startupCpu: {
      phasesMs: run.initialization.ground.initializationMs,
      screen,
      construction: run.initialization.measures.filter(event => ['loading:gameConstruction', 'loading:environmentMap', 'loading:renderer'].includes(event.name)),
    },
    loadingOverlay: {
      mounted: run.overlayMounted,
      released: run.overlayDetachedAfterReady,
      updates: run.progress.length,
      monotonic: run.progress.every((row, index) => index === 0 || row.percent >= run.progress[index - 1].percent),
    },
    driving: frames(run.rows.map(row => row.dt)),
    byPhase: Object.fromEntries([...new Set(run.rows.map(row => row.phase))].map(phase => [
      phase, frames(run.rows.filter(row => row.phase === phase).map(row => row.dt)),
    ])),
    route: { turnFinished: run.turnFinished, turnDistance: run.turnDistance, station: run.rows.at(-1).station },
    measuredSlowCallbackCpu: percentiles(events.map(event => event.cpuMs)),
    peakCallbackDetails: events.toSorted((a, b) => b.cpuMs - a.cpuMs).slice(0, 6).map(event => ({ ...event, drivingElapsed: event.start - run.driveAt })),
    sampledGpuExecution: percentiles(run.frameTiming.gpuSamples.map(event => event.gpuMs)),
    mainPerformanceMemoryMiB: percentiles(run.rows.map(row => mib(row.heap))),
    cdpUsedJSHeapMiB: Object.fromEntries([...new Set(heaps.map(row => row.type))].map(type => [
      type, percentiles(heaps.filter(row => row.type === type).map(row => mib(row.usedSize))),
    ])),
    cdpBackingStorageMiB: Object.fromEntries([...new Set(heaps.map(row => row.type))].map(type => [
      type, percentiles(heaps.filter(row => row.type === type && Number.isFinite(row.backingStorageSize)).map(row => mib(row.backingStorageSize))),
    ])),
    glBufferPeakMiB: mib(run.gpu.bufferPeak),
    initialBufferDataCalls: run.loadingGL.bufferDataCalls,
    initialUploadMiB: mib(run.loadingGL.uploadBytes),
    recipeResidency: { cachedRoadBytes, terrainCacheBytes, recipeBudgetBytes, pinnedRoadBytes, borrowedTerrainBytes },
    background,
    worker: {
      jobs: worker.jobs,
      remaining: { queued: worker.queued, inFlight: worker.inFlight },
      perType: Object.fromEntries([...new Set(worker.samples.map(sample => sample.kind))].map(kind => {
        const samples = worker.samples.filter(sample => sample.kind === kind);
        return [kind, {
          activeMs: percentiles(samples.map(sample => sample.activeMs)),
          roundTripMs: percentiles(samples.map(sample => sample.roundTripMs)),
          queueWaitMs: percentiles(samples.map(sample => sample.queueWaitMs)),
          receiveWaitMs: percentiles(samples.map(sample => sample.receiveWaitMs)),
        }];
      })),
    },
    maxStreamUpdateMs: run.resources.maxUpdateMs,
    warmup: run.warmup,
    publicationCount: run.resources.publications.length,
    release: {
      disposed: exit.state.disposed,
      resourcesReleased: exit.state.resourcesReleased,
      glBufferBytes: exit.gpu.bufferBytes,
      recipes: exit.state.cachedRoadBytes + exit.state.terrainCacheBytes,
      workerDisposed: exit.state.worker.jobs.disposed,
    },
    errors: [...run.errors, ...exit.errors],
  };
}
writeFileSync(new URL('comparison.json', output), JSON.stringify(comparison, null, 2) + '\n');
for (const [variant, stats] of Object.entries(comparison)) {
  const {loadingMs, loadingFrames, driving, mainPerformanceMemoryMiB, cdpUsedJSHeapMiB, glBufferPeakMiB, sampledGpuExecution, maxStreamUpdateMs} = stats;
  console.log(variant, {loadingMs, loadingMax: loadingFrames.max, driving, heap: mainPerformanceMemoryMiB.max, cdpUsedJSHeapMiB, glBufferPeakMiB, sampledGpuExecution, maxStreamUpdateMs});
}


