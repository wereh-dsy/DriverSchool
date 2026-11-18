import type { CityResourceTiming, CityRuntimeData } from './CityRuntimeData';

declare const __CITY_MAIN_RUNTIME_URL__: string;
let runtime: CityRuntimeData | undefined;
let preparedWorker: Worker | undefined;
export function takePreparedCityWorker(map: import('./CityMapData').CityMapData): Worker | undefined {
  if (runtime?.map !== map) return undefined; const worker = preparedWorker; preparedWorker = undefined; return worker;
}
let pending: Promise<CityRuntimeData> | undefined;

/** Explicit resource boundary; the main game bundle contains no City Main map data. */
export async function prepareCityMain(supplied?: CityRuntimeData): Promise<CityResourceTiming> {
  const timing = { startedAt: performance.now(), resourceLoadMs: 0, mapParseMs: 0, cached: !!runtime };
  if (supplied) { if (runtime !== supplied) { preparedWorker?.terminate(); preparedWorker = undefined; } runtime = supplied; }
  if (!runtime) {
    pending ??= (async () => {
      const url = new URL(__CITY_MAIN_RUNTIME_URL__, document.baseURI).href;
      if (typeof Worker !== 'undefined') {
        const worker = new Worker(new URL('./VisualStreaming.worker.ts', import.meta.url), { type: 'module' });
        try {
          const data = await new Promise<CityRuntimeData>((resolve, reject) => {
            worker.onmessage = event => {
              if (event.data.kind === 'error') { reject(new Error(event.data.message)); return; }
              if (event.data.kind !== 'runtime') return;
              timing.resourceLoadMs = event.data.loadMs; timing.mapParseMs = event.data.parseMs;
              resolve(event.data.data);
            };
            worker.onerror = event => reject(new Error(`Map resource worker: ${event.message}`));
            worker.postMessage({ kind: 'loadRuntime', url });
          });
          worker.onmessage = null; worker.onerror = null; preparedWorker = worker;
          performance.measure('city:resourceLoad', {start:timing.startedAt,end:performance.now()});
          return data;
        } catch (error) { worker.terminate(); throw error; }
      }
      const response = await fetch(url);
      if (!response.ok) throw new Error(`City Main map resource: HTTP ${response.status}`);
      const json = await response.text(), parsedAt = performance.now();
      timing.resourceLoadMs = parsedAt - timing.startedAt;
      const data = JSON.parse(json) as CityRuntimeData;
      timing.mapParseMs = performance.now() - parsedAt;
      return data;
    })();
    try { runtime = await pending; } finally { pending = undefined; }
  }
  return timing;
}

export function cityMainRuntime(): CityRuntimeData {
  if (!runtime) throw new Error('City Main requires prepareDrivingGround before construction.');
  return runtime;
}
