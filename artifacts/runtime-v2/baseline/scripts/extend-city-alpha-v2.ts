/** One-time, idempotent authored demo stamp; existing City Alpha elements stay intact. */
import { readFileSync, writeFileSync } from 'node:fs';
import { loadCityMap } from '../src/world/city/CityMapLoader';
import { createRoad, placePreset, connectRoad, roadEndpoint, saveMap, validateMap } from '../src/world/city/MapAPI';
const path = 'src/world/city/maps/city-alpha.json', map = loadCityMap(JSON.parse(readFileSync(path, 'utf8')));
if (!map.roads.some(r => r.groupId === 'alpha-v2-overpass')) {
  map.version = 2; map.bounds.maxX = 1950;
  const overpass = placePreset(map, 'urban_overpass', { position: { x: 1300, y: 0, z: -150 }, groupId: 'alpha-v2-overpass' });
  const diamond = placePreset(map, 'diamond_interchange', { position: { x: 1300, y: 0, z: 650 }, groupId: 'alpha-v2-diamond' });
  const westPort = overpass.connectionPorts.find(p => p.label === 'West Crossroad')!.endpoint;
  const west = roadEndpoint(map, westPort);
  const access = createRoad(map, { id: 'alpha-v2-overpass-access', styleId: 'urban_street_4', curve: 'smooth', groupId: 'alpha-v2-demo', centerline: [{ x: 960, y: 0, z: 90 }, { x: 1050, y: 0, z: 40 }, { x: 1050, y: 0, z: -80 }, west] });
  const existing = map.roads.find(r => r.id === 'east-extension');
  if (existing) connectRoad(map, { roadId: access.id, end: 'start' }, { endpoint: { roadId: existing.id, end: 'end' } });
  connectRoad(map, { roadId: access.id, end: 'end' }, { endpoint: westPort });
  const northPort = diamond.connectionPorts.find(p => p.label === 'West Crossroad')!.endpoint;
  const connector = createRoad(map, { id: 'alpha-v2-diamond-access', styleId: 'urban_street_4', curve: 'smooth', groupId: 'alpha-v2-demo', centerline: [{ x: 760, y: 0, z: 850 }, { x: 890, y: 0, z: 850 }, { x: 940, y: 0, z: 720 }, roadEndpoint(map, northPort)] });
  const industry = map.roads.find(r => r.id === 'commercial-industrial');
  if (industry) connectRoad(map, { roadId: connector.id, end: 'start' }, { endpoint: { roadId: industry.id, end: 'end' } });
  connectRoad(map, { roadId: connector.id, end: 'end' }, { endpoint: northPort });
  const eastPort = diamond.connectionPorts.find(p => p.label === 'East Crossroad')!.endpoint, east = roadEndpoint(map, eastPort);
  const ramp = createRoad(map, { id: 'alpha-v2-ramp', styleId: 'urban_street_4', groupId: 'alpha-v2-demo', elevationMode: 'custom', structure: { barrierEnabled: true, pierSpacing: 30, pierStyle: 'round' }, centerline: [east, { x: 1630, y: 0, z: 650 }, { x: 1750, y: 6, z: 650 }] });
  const deck = createRoad(map, { id: 'alpha-v2-elevated', styleId: 'elevated_expressway_6', groupId: 'alpha-v2-demo', centerline: [{ x: 1750, y: 6, z: 650 }, { x: 1880, y: 6, z: 650 }] });
  connectRoad(map, { roadId: ramp.id, end: 'start' }, { endpoint: eastPort }); connectRoad(map, { roadId: deck.id, end: 'start' }, { endpoint: { roadId: ramp.id, end: 'end' } });
  map.environment.metadata = { ...map.environment.metadata, v2Demo: 'East extension: overpass at (1300,-150), diamond at (1300,650), ramp and elevated deck to X=1880. Original districts retained.' };
  writeFileSync(path, saveMap(map), 'utf8');
}
const accessRoad = map.roads.find(r => r.id === 'alpha-v2-diamond-access');
if (accessRoad && !map.roadLinks?.some(l => [l.from, l.to].some(e => e.roadId === accessRoad.id && e.end === 'start'))) {
  connectRoad(map, { roadId: accessRoad.id, end: 'start' }, { endpoint: { roadId: 'commercial-industrial', end: 'end' } });
  writeFileSync(path, saveMap(map), 'utf8');
}
if (!map.roads.some(r => r.id === 'alpha-v2-overpass-main-access')) {
  const port = map.connectionPorts!.find(p => p.groupId === 'alpha-v2-overpass' && p.label === 'South Mainline')!.endpoint;
  const access = createRoad(map, { id: 'alpha-v2-overpass-main-access', styleId: 'urban_boulevard_6', groupId: 'alpha-v2-demo', curve: 'smooth', centerline: [{ x: 960, y: 0, z: 90 }, { x: 1100, y: 0, z: 230 }, { x: 1300, y: 0, z: 230 }, roadEndpoint(map, port)] });
  connectRoad(map, { roadId: access.id, end: 'start' }, { endpoint: { roadId: 'east-extension', end: 'end' } });
  connectRoad(map, { roadId: access.id, end: 'end' }, { endpoint: port });
  const deck = map.roads.find(r => r.id === 'alpha-v2-elevated')!; deck.elevationMode = 'elevated'; deck.elevation = 6;
  writeFileSync(path, saveMap(map), 'utf8');
}
console.log(JSON.stringify({ roads: map.roads.length, intersections: map.intersections.length, validation: validateMap(map) }, null, 2));
