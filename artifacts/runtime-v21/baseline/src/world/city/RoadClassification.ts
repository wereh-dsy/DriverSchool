import type { CityRoad, RoadFunction } from './CityMapData';

/** The only legacy semantic inference. Explicit roadClass always wins. */
export function roadFunction(road: CityRoad): RoadFunction {
  switch (road.roadClass) {
    case 'avenue': return 'arterial';
    case 'alley': return 'local';
    case 'industrial': return 'collector';
    case undefined:
      if (road.styleId === 'urban_auxiliary_2') return 'frontage';
      if (road.styleId === 'collector_distributor_2') return 'connector';
      if (road.type === 'highway' && road.styleId === 'urban_local_2' && road.speedLimit <= 30) return 'collector';
      if (road.type === 'ramp_1' || road.gore && road.laneCount <= 2) return 'ramp';
      if (road.type === 'highway' || road.styleId === 'urban_expressway_6') return 'expressway';
      return road.type === 'urban_6lane' ? 'arterial' : road.type === 'urban_4lane' ? 'collector' : 'local';
    default: return road.roadClass;
  }
}

export function isControlledAccessRoad(road: CityRoad): boolean {
  const kind = roadFunction(road);
  return kind === 'expressway' || kind === 'ramp' || kind === 'connector';
}
