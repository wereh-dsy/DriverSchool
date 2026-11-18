import type { CityObject } from './CityMapData';

const criticalPrefabs = new Set([
  'guardrail','noise_barrier','traffic_sign','guide_sign','streetlight','streetlight_dual',
  'streetlight_highway','streetlight_small','bus_stop','parked_car','hardscape','embankment',
]);
export const roadCriticalObject = (object:CityObject):boolean => criticalPrefabs.has(object.prefabId);
export interface RoadVisualManifest {
  roadIds:string[];
  surfaceBatches:number;
  markingBatches:number;
  barrierTriangles:number;
  infrastructureBatches:number;
  signs:number;
  signalizedJunctions:number;
  criticalObjects:number;
  complete:boolean;
}
