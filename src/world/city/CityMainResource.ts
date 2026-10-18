import type { CityResourceTiming, CityRuntimeData } from './CityRuntimeData';

declare const __CITY_MAIN_RUNTIME_URL__: string;
let runtime: CityRuntimeData | undefined;
let pending: Promise<CityRuntimeData> | undefined;

/** Explicit resource boundary; the main game bundle contains no City Main map data. */
export async function prepareCityMain(supplied?: CityRuntimeData): Promise<CityResourceTiming> {
  const timing = { startedAt: performance.now(), resourceLoadMs: 0, mapParseMs: 0, cached: !!runtime };
  if (supplied) runtime = supplied;
  if (!runtime) {
    pending ??= (async () => {
      const response = await fetch(new URL(__CITY_MAIN_RUNTIME_URL__, document.baseURI));
      if (!response.ok) throw new Error(`City Main map resource: HTTP ${response.status}`);
      const json = await response.text();
      const parsedAt = performance.now(); timing.resourceLoadMs = parsedAt - timing.startedAt;
      const data = JSON.parse(json) as CityRuntimeData;
      timing.mapParseMs = performance.now() - parsedAt;
      performance.measure('city:resourceLoad', { start: timing.startedAt, end: parsedAt });
      performance.measure('city:mapParse', { start: parsedAt, end: performance.now() });
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
