import type { CityMapData, CityObject } from '../CityMapData';

/** Refine the eight existing anchors; their placement, scale and collision
 * envelopes remain the V6.1 authored values. No additional buildings. */
export function styleCityV62Landmarks(map:CityMapData):void {
  const models:Record<string,NonNullable<CityObject['landmarkModel']>>={
    'v61-city-station':'station','v61-government':'government','v61-museum':'museum',
    'v61-university-library':'university','v61-exhibition':'exhibition',
    'v61-stadium':'stadium','v61-sports-hall':'arena',
  };
  const tower=map.environment.landmarks!.find(l=>l.id==='jincheng-center')!;
  const object=map.objects.find(o=>Math.hypot(o.position.x-tower.position.x,o.position.z-tower.position.z)<.1)!;
  models[object.id]='tower';
  for(const [id,model]of Object.entries(models)) {
    const o=map.objects.find(o=>o.id===id);if(!o)throw new Error('V6.2 missing existing landmark '+id);o.landmarkModel=model;
  }
}
