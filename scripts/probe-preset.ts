import { expandPreset } from '../src/world/city/presets/InfrastructurePresets';
import { applyRoadStyle } from '../src/world/city/RoadStyles';
import { newCityMap } from '../src/world/city/CityMapData';

const run = (label: string): void => {
  const stamp = expandPreset('diamond_interchange', { position: { x: 0, y: 0, z: -700 }, rotation: Math.PI / 2, mainElevation: 8, mainRoadLanes: 6, crossRoadLanes: 6, rampLaneCount: 2, rampRadius: 55, groupId: 'probe' });
  console.log(label, JSON.stringify(stamp.roads[0]!.centerline[0]));
};
run('plain');
const m = newCityMap();
const r = { id: 'x', type: 'urban_4lane' as const, centerline: [{ x: 0, z: 0 }, { x: 10, z: 0 }], laneCount: 4, laneWidth: 3.5, travelDirection: 'two-way' as const, speedLimit: 40 };
applyRoadStyle(r as never, 'urban_street_4');
console.log('after style', JSON.stringify(r));
run('after-style');
