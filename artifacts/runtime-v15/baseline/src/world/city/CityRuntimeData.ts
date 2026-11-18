import type { CityMapData } from './CityMapData';
import { loadCityMap } from './CityMapLoader';
import { buildCityRoadNetwork, type CityRoadNetwork } from './CityRoadNetwork';

/** Build-owned JSON. Editor imports continue through the normal validating loader. */
export interface CityRuntimeData { map: CityMapData; roadNetwork: CityRoadNetwork }

/** JSON duplicates authored polyline points in the navigation view. Restore
 * sharing before structured-clone publication; both are immutable in a game
 * runtime. Curves and any non-identical/extended point records stay independent. */
export function shareCityRuntimePaths(runtime:CityRuntimeData):CityRuntimeData {
  const roads=new Map(runtime.map.roads.map(r=>[r.id,r]));
  for(const segment of runtime.roadNetwork.segments){
    const road=roads.get(segment.id);if(!road||road.curve==='smooth'||road.centerline.length!==segment.centerline.length)continue;
    if(road.centerline.every((p,i)=>{const q=segment.centerline[i]!;return Object.keys(p).length===3&&Object.keys(q).length===3&&p.x===q.x&&p.y===q.y&&p.z===q.z;}))segment.centerline=road.centerline;
  }
  return runtime;
}

export function compileCityRuntimeData(source: unknown): CityRuntimeData {
  const map = loadCityMap(source);
  return { map, roadNetwork: buildCityRoadNetwork(map) };
}

export interface CityResourceTiming {
  startedAt: number; resourceLoadMs: number; mapParseMs: number; cached: boolean;
}
