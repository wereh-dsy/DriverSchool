import type { CityMapData } from './CityMapData';
import { loadCityMap } from './CityMapLoader';
import { buildCityRoadNetwork, type CityRoadNetwork } from './CityRoadNetwork';

/** Build-owned JSON. Editor imports continue through the normal validating loader. */
export interface CityRuntimeData { map: CityMapData; roadNetwork: CityRoadNetwork }

export function compileCityRuntimeData(source: unknown): CityRuntimeData {
  const map = loadCityMap(source);
  return { map, roadNetwork: buildCityRoadNetwork(map) };
}

export interface CityResourceTiming {
  startedAt: number; resourceLoadMs: number; mapParseMs: number; cached: boolean;
}
