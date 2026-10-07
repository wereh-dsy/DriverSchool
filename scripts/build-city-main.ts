/**
 * City Main's existing authored layout, rebuilt through the checked CityMap API.
 * No repair pass: invalid recipes fail before writing the map.
 * Run: node scripts/build-city-main.mjs
 */
import { writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { newCityMap, type CityPoint, type CityRoad, type IntersectionPort, type IntersectionType, type PrefabId, type RoadEndpoint, type RoadType } from '../src/world/city/CityMapData';
import { junctionExtent, portDirections, roadPoints, rotatePoint } from '../src/world/city/geometry';
import { connectRoad, connectRoads, createIntersection, createRoad, placePrefab, placePreset, roadEndpoint, saveMap, splitRoadAtPoint, validateMap } from '../src/world/city/MapAPI';
import { point3 } from '../src/world/city/coordinates';

const map = newCityMap();
map.id = 'city-main'; map.name = 'City Main'; map.version = 1; map.sectorSize = 500;
// Cover the already-authored ramps and local street ends, without adding streets.
map.bounds = { minX: -1900, maxX: 2050, minZ: -2000, maxZ: 1600 };
const DECK_Y = 9, DECK_HALF = 1500, DECK_APPROACH = 1800;
const EAST_Z = -1412.6, WEST_Z = -1387.4;
const DIAMOND = { z: -700, height: 8, rotation: Math.PI / 2, group: 'city-main-diamond' };
const ROUNDABOUT = { x: 250, z: 650 };
const TYPE_BY_LANES: Record<number, RoadType> = { 1: 'ramp_1', 2: 'urban_2lane', 3: 'highway', 4: 'urban_4lane', 6: 'urban_6lane' };
const SPEED: Record<string, number> = { urban_local_2: 30, urban_street_4: 40, urban_boulevard_6: 60, elevated_expressway_6: 80, ramp_1: 40 };
type End = 'start' | 'end';
interface RoadSpec {
  id: string; points: CityPoint[]; lanes: number; dir: 'two-way' | 'forward' | 'reverse';
  style: string; speed?: number; district?: string; curve?: 'polyline' | 'smooth';
}
function road(spec: RoadSpec): CityRoad {
  const type = TYPE_BY_LANES[spec.lanes];
  if (!type) throw new Error('city-main: unsupported lane count on ' + spec.id);
  return createRoad(map, { baseName: spec.id, type, centerline: spec.points, laneCount: spec.lanes,
    laneWidth: spec.lanes === 1 || spec.lanes === 3 ? 3.6 : 3.5, travelDirection: spec.dir,
    styleId: spec.style, speedLimit: spec.speed ?? SPEED[spec.style] ?? 40,
    district: spec.district, curve: spec.curve ?? 'polyline', elevationMode: 'custom' });
}
const first = (r: CityRoad) => ({ road: r, end: 'start' as const });
const last = (r: CityRoad) => ({ road: r, end: 'end' as const });
const asEndpoint = (n: { road: CityRoad; end: End }): RoadEndpoint => ({ roadId: n.road.id, end: n.end });
const link = (from: RoadEndpoint, to: RoadEndpoint): void => { connectRoads(map, from, to); };
function chain(prefix: string, points: CityPoint[], lanes: number, style: string, dir: 'two-way' | 'forward', district: string, speed?: number): CityRoad[] {
  const built: CityRoad[] = [];
  for (let i = 1; i < points.length; i++) built.push(road({ id: prefix + '-' + i, points: [points[i - 1]!, points[i]!], lanes, dir, style, speed, district }));
  for (let i = 1; i < built.length; i++) link(asEndpoint(last(built[i - 1]!)), asEndpoint(first(built[i]!)));
  return built;
}
const slope = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, steps = 3): CityPoint[] =>
  Array.from({ length: steps + 1 }, (_, i) => point3(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, z0 + (z1 - z0) * i / steps));

// 1. Existing elevated east-west expressway and its four ramps.
const ebW = road({ id: 'main-eb-west-approach', points: [...slope(-DECK_APPROACH, EAST_Z, -DECK_HALF, EAST_Z, 0, DECK_Y), point3(0, DECK_Y, EAST_Z), point3(600, DECK_Y, EAST_Z)], lanes: 3, dir: 'forward', style: 'elevated_expressway_6', district: 'expressway' });
const ebC = road({ id: 'main-eb-city', points: [point3(600, DECK_Y, EAST_Z), point3(1700, DECK_Y, EAST_Z)], lanes: 3, dir: 'forward', style: 'elevated_expressway_6', district: 'expressway' });
const ebE = road({ id: 'main-eb-east-approach', points: slope(1700, EAST_Z, DECK_APPROACH, EAST_Z, DECK_Y, 0, 4), lanes: 3, dir: 'forward', style: 'elevated_expressway_6', district: 'expressway' });
link(asEndpoint(last(ebW)), asEndpoint(first(ebC))); link(asEndpoint(last(ebC)), asEndpoint(first(ebE)));
const wbE = road({ id: 'main-wb-east-approach', points: slope(DECK_APPROACH, WEST_Z, 1700, WEST_Z, 0, DECK_Y), lanes: 3, dir: 'forward', style: 'elevated_expressway_6', district: 'expressway' });
const wbC = road({ id: 'main-wb-city', points: [point3(1700, DECK_Y, WEST_Z), point3(600, DECK_Y, WEST_Z)], lanes: 3, dir: 'forward', style: 'elevated_expressway_6', district: 'expressway' });
const wbW = road({ id: 'main-wb-west-approach', points: [point3(600, DECK_Y, WEST_Z), point3(-600, DECK_Y, WEST_Z), point3(-DECK_HALF, DECK_Y, WEST_Z), ...slope(-DECK_HALF, WEST_Z, -DECK_APPROACH, WEST_Z, DECK_Y, 0).slice(1)], lanes: 3, dir: 'forward', style: 'elevated_expressway_6', district: 'expressway' });
link(asEndpoint(last(wbE)), asEndpoint(first(wbC))); link(asEndpoint(last(wbC)), asEndpoint(first(wbW)));
function ramp(id: string, points: CityPoint[], attach: RoadEndpoint, rampEnd: End): void {
  const r = road({ id, points, lanes: 2, dir: 'forward', style: 'ramp_1', district: 'expressway', curve: 'smooth' });
  link({ roadId: r.id, end: rampEnd }, attach);
}
ramp('ramp-eb-entry', [point3(432, 0, -1232.6), point3(500, 2.2, -1290), point3(545, 3.9, -1350), point3(575, 5.6, -1398), point3(590.6, 7.2, -1405.9), point3(600, DECK_Y, EAST_Z)], { roadId: ebC.id, end: 'start' }, 'end');
ramp('ramp-eb-exit', [point3(1700, DECK_Y, EAST_Z), point3(1735.9, 7.4, -1426.9), point3(1780, 4.2, -1490), point3(1830, 1.2, -1560), point3(1880, 0, -1640)], { roadId: ebC.id, end: 'end' }, 'start');
ramp('ramp-wb-entry', [point3(1953, 0, -1357.4), point3(1920, 1.6, -1405), point3(1855, 3.4, -1370), point3(1790, 5.2, -1380), point3(1733, 7.2, -1371.3), point3(1700, DECK_Y, WEST_Z)], { roadId: wbC.id, end: 'start' }, 'end');
ramp('ramp-wb-exit', [point3(600, DECK_Y, WEST_Z), point3(566, 7.2, -1335), point3(510, 4.6, -1290), point3(440, 1.6, -1262), point3(360, 0, -1240)], { roadId: wbC.id, end: 'end' }, 'start');

// 2. Existing diamond interchange, placed transactionally.
const diamond = placePreset(map, 'diamond_interchange', { position: point3(0, 0, DIAMOND.z), rotation: DIAMOND.rotation,
  mainRoadLanes: 6, crossRoadLanes: 6, mainElevation: DIAMOND.height, rampLaneCount: 2, rampRadius: 55, groupId: DIAMOND.group });
const dNode = (label: string) => {
  const endpoint = diamond.connectionPorts.find(p => p.label === label)?.endpoint;
  if (!endpoint) throw new Error('city-main: missing diamond port ' + label);
  return { road: map.roads.find(r => r.id === endpoint.roadId)!, end: endpoint.end };
};
const dPortPoint = (label: string): CityPoint => roadEndpoint(map, asEndpoint(dNode(label)));

// 3. Original ground street layout. Coordinates are always X/Y/Z.
const nsSouth = chain('ns-south-boulevard', [point3(0, 0, 1300), point3(0, 0, 1150), point3(0, 0, 900), point3(0, 0, 650), point3(0, 0, 120), point3(0, 0, -100), point3(0, 0, -360)], 6, 'urban_boulevard_6', 'two-way', 'central');
link(asEndpoint(last(nsSouth[nsSouth.length - 1]!)), asEndpoint(dNode('West Crossroad')));
const nsNorth = chain('ns-north-boulevard', [dPortPoint('East Crossroad'), point3(0, 0, -1200), point3(0, 0, -1500)], 6, 'urban_boulevard_6', 'two-way', 'central');
const nsWest = chain('ns-west-boulevard', [point3(-900, 0, -1500), point3(-900, 0, -1000), point3(-900, 0, -800), point3(-900, 0, -420), point3(-900, 0, -250), point3(-900, 0, 120), point3(-900, 0, 380), point3(-900, 0, 650), point3(-900, 0, 900), point3(-900, 0, 1150), point3(-900, 0, 1300)], 6, 'urban_boulevard_6', 'two-way', 'central');
const nsEast = chain('ns-east-boulevard', [point3(600, 0, -1500), point3(600, 0, -1000), point3(600, 0, -800), point3(600, 0, -250), point3(600, 0, 120), point3(600, 0, 650), point3(600, 0, 900), point3(600, 0, 1150), point3(600, 0, 1300)], 6, 'urban_boulevard_6', 'two-way', 'commercial');
const nsMid = chain('ns-mid-street', [point3(-420, 0, -1500), point3(-420, 0, -1000), point3(-420, 0, -250), point3(-420, 0, 120), point3(-420, 0, 380), point3(-420, 0, 650), point3(-420, 0, 900), point3(-420, 0, 1150)], 4, 'urban_street_4', 'two-way', 'residential');
const nsFarWest = chain('ns-far-west-street', [point3(-1250, 0, -1500), point3(-1250, 0, -250), point3(-1250, 0, 380), point3(-1250, 0, 1150)], 2, 'urban_local_2', 'two-way', 'residential');
const nsWestLocal = chain('ns-west-local', [point3(-1130, 0, 120), point3(-1130, 0, 380), point3(-1130, 0, 650), point3(-1130, 0, 900), point3(-1130, 0, 950), point3(-1130, 0, 1500)], 2, 'urban_local_2', 'two-way', 'residential');
const nsEastLocal = chain('ns-east-local', [point3(950, 0, -250), point3(950, 0, 380), point3(950, 0, 650), point3(950, 0, 700), point3(950, 0, 1100), point3(950, 0, 1500)], 2, 'urban_local_2', 'two-way', 'commercial');
const nsOldTown = chain('ns-old-town', [point3(230, 0, 120), point3(230, 0, 380), point3(230, 0, 650), point3(230, 0, 900), point3(230, 0, 1080), point3(230, 0, 1150)], 2, 'urban_local_2', 'two-way', 'old-town');
const ewNorthEdge = chain('ew-north-edge', [point3(-1400, 0, -1500), point3(-900, 0, -1500), point3(-420, 0, -1500), point3(0, 0, -1500), point3(600, 0, -1500), point3(1400, 0, -1500)], 4, 'urban_street_4', 'two-way', 'periphery');
const ewNorth2 = chain('ew-north-two', [point3(-1400, 0, -1000), point3(-900, 0, -1000), point3(-420, 0, -1000), point3(0, 0, -1000), point3(600, 0, -1000), point3(1400, 0, -1000)], 4, 'urban_street_4', 'two-way', 'periphery');
const ewDiamondWest = chain('ew-diamond-west', [point3(-1400, 0, -700), point3(-900, 0, -700), point3(-420, 0, -700), point3(-310, 0, -700)], 6, 'urban_boulevard_6', 'two-way', 'central');
const ewDiamondEast = chain('ew-diamond-east', [point3(310, 0, -700), point3(600, 0, -700), point3(1400, 0, -700)], 6, 'urban_boulevard_6', 'two-way', 'central');
const ewCentral = chain('ew-central-boulevard', [point3(-1400, 0, 120), point3(-1250, 0, 120), point3(-1130, 0, 120), point3(-900, 0, 120), point3(-420, 0, 120), point3(0, 0, 120), point3(230, 0, 120), point3(600, 0, 120), point3(1400, 0, 120)], 6, 'urban_boulevard_6', 'two-way', 'central');
const ewResidentialWest = chain('ew-residential-west', [point3(-1400, 0, 650), point3(-900, 0, 650), point3(-420, 0, 650), point3(0, 0, 650), point3(70, 0, 650)], 4, 'urban_street_4', 'two-way', 'residential');
const ewResidentialEast = chain('ew-residential-east', [point3(430, 0, 650), point3(600, 0, 650), point3(1400, 0, 650)], 4, 'urban_street_4', 'two-way', 'commercial');
const ewSouth = chain('ew-south-boulevard', [point3(-1400, 0, 1150), point3(-1280, 0, 1150), point3(-1250, 0, 1150), point3(-1130, 0, 1150), point3(-900, 0, 1150), point3(-700, 0, 1150), point3(-420, 0, 1150), point3(0, 0, 1150), point3(230, 0, 1150), point3(600, 0, 1150), point3(950, 0, 1150), point3(1100, 0, 1150), point3(1400, 0, 1150)], 6, 'urban_boulevard_6', 'two-way', 'old-town');
const ewLocalNorth = chain('ew-local-north', [point3(-1400, 0, -250), point3(-900, 0, -250), point3(-420, 0, -250), point3(0, 0, -250), point3(600, 0, -250), point3(950, 0, -250)], 2, 'urban_local_2', 'two-way', 'residential');
const ewLocalRes = chain('ew-local-res', [point3(-1400, 0, 380), point3(-1250, 0, 380), point3(-900, 0, 380), point3(-620, 0, 380), point3(-420, 0, 380)], 2, 'urban_local_2', 'two-way', 'residential');
const ewOldTown = chain('ew-old-town', [point3(0, 0, 900), point3(230, 0, 900), point3(600, 0, 900), point3(700, 0, 900), point3(950, 0, 900), point3(1400, 0, 900)], 2, 'urban_local_2', 'two-way', 'old-town');
const diag = chain('diagonal-boulevard', [point3(350, 0, 1100), point3(0, 0, 650), point3(-420, 0, 120), point3(-900, 0, -420), point3(-1400, 0, -900)], 6, 'urban_boulevard_6', 'two-way', 'central');
const diagWest = chain('diagonal-west', [point3(-420, 0, 1150), point3(-700, 0, 800), point3(-900, 0, 400), point3(-1130, 0, 120)], 4, 'urban_street_4', 'two-way', 'residential');
const curveSouthWest = chain('curved-south-west', [point3(-1400, 0, 950), point3(-1280, 0, 950), point3(-1250, 0, 950), point3(-1200, 0, 1030), point3(-1000, 0, 1000), point3(-820, 0, 880)], 4, 'urban_street_4', 'two-way', 'residential');
const curveEast = chain('curved-east', [point3(1400, 0, 480), point3(1150, 0, 560), point3(780, 0, 590), point3(600, 0, 650)], 4, 'urban_street_4', 'two-way', 'commercial');

link(asEndpoint(first(nsNorth[0]!)), asEndpoint(dNode('East Crossroad')));

// 4. Explicit authored junction sites. Only geometrically aligned, ground-level
// roads can supply arms; diagonal streets retain their existing topology.
const PORT_ORDER: IntersectionPort[] = ['north', 'east', 'south', 'west'];
function jn(type: IntersectionType, x: number, z: number, signalized: boolean, _tolerance = 48, district?: string) {
  const position = point3(x, 0, z);
  // Split a genuine interior crossing once, using the shared API. Never cut at
  // an endpoint or project a point onto an unrelated neighbouring road.
  for (const r of [...map.roads]) {
    if (r.groupId || r.centerline.some(p => Math.abs(p.y ?? 0) > 0.01)) continue;
    const points = roadPoints(r);
    if ([points[0]!, points.at(-1)!].some(p => Math.hypot(p.x - x, p.z - z) < 0.05)) continue;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!, b = points[i]!, dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
      if (Math.abs(dx) > 0.01 && Math.abs(dz) > 0.01 || l2 < 0.0025) continue;
      const t = ((x - a.x) * dx + (z - a.z) * dz) / l2;
      if (t <= 0 || t >= 1 || Math.hypot(a.x + dx * t - x, a.z + dz * t - z) > 0.05) continue;
      splitRoadAtPoint(map, r.id, position); break;
    }
  }
  const arms = new Map<IntersectionPort, RoadEndpoint>();
  for (const r of map.roads) {
    if (r.groupId || r.centerline.some(p => Math.abs(p.y ?? 0) > 0.01)) continue;
    for (const end of ['start', 'end'] as const) {
      if (map.intersections.some(j => j.connections.some(c => c.roadId === r.id && c.end === end))) continue;
      const index = end === 'start' ? 0 : r.centerline.length - 1, p = r.centerline[index]!;
      if (Math.hypot(p.x - x, p.z - z) > 0.05) continue;
      const q = r.centerline[end === 'start' ? 1 : index - 1]!, length = Math.hypot(q.x - x, q.z - z);
      if (length < 0.05) continue;
      for (const port of PORT_ORDER) {
        const d = portDirections[port];
        if (((q.x - x) * d.x + (q.z - z) * d.z) / length < 0.99) continue;
        if (arms.has(port)) throw new Error('city-main: ambiguous arm at ' + x + ',' + z + ' / ' + port);
        arms.set(port, { roadId: r.id, end });
      }
    }
  }
  let rotation = 0;
  if (type.startsWith('t_') && arms.size === 3) {
    const missing = PORT_ORDER.find(p => !arms.has(p))!;
    rotation = ({ south: 0, east: Math.PI / 2, north: Math.PI, west: Math.PI * 1.5 })[missing];
  }
  const j = createIntersection(map, { baseName: 'junction', type, position, rotation, signalized, district });
  for (const local of type.startsWith('t_') ? ['north', 'east', 'west'] as const : PORT_ORDER) {
    const direction = rotatePoint(portDirections[local], rotation);
    const world = PORT_ORDER.find(p => Math.hypot(portDirections[p].x - direction.x, portDirections[p].z - direction.z) < 1e-6)!;
    const endpoint = arms.get(world); if (endpoint) connectRoad(map, endpoint, { junctionId: j.id, port: local });
  }
  return j;
}
jn('cross_6lane', 0, 120, true, 60, 'central');
jn('cross_6lane', 0, 650, true, 60, 'central');
jn('cross_6lane', 0, 900, true, 50, 'central');
jn('cross_6lane', 0, 1150, true, 56, 'old-town');
jn('cross_6lane', -900, 120, true, 60, 'central');
jn('cross_6lane', -900, 650, true, 56, 'residential');
jn('cross_6lane', -900, 1150, true, 56, 'old-town');
jn('cross_4lane', -900, -250, true, 50, 'periphery');
jn('cross_4lane', -900, 380, false, 50, 'residential');
jn('cross_4lane', -900, 900, false, 50, 'old-town');
jn('cross_6lane', -900, -420, true, 56, 'periphery');
jn('cross_6lane', 600, 120, true, 60, 'commercial');
jn('cross_6lane', 600, 650, true, 56, 'commercial');
jn('cross_6lane', 600, 1150, true, 56, 'old-town');
jn('cross_4lane', 600, -250, false, 50, 'periphery');
jn('cross_4lane', 600, 900, false, 50, 'old-town');
jn('cross_4lane', -420, 120, true, 50, 'central');
jn('cross_4lane', -420, 380, false, 50, 'residential');
jn('cross_4lane', -420, 1150, false, 50, 'residential');
jn('cross_4lane', -420, -250, false, 50, 'periphery');
jn('cross_4lane', -420, 650, false, 50, 'residential');
jn('cross_4lane', -1250, 380, false, 50, 'residential');
jn('cross_4lane', -1250, 1150, false, 50, 'residential');
jn('cross_4lane', -1250, 950, false, 50, 'residential');
jn('cross_4lane', -1130, 1150, false, 50, 'residential');
jn('cross_4lane', -1130, 650, false, 50, 'residential');
jn('cross_4lane', -1130, 120, false, 50, 'periphery');
jn('cross_4lane', 950, 380, false, 50, 'commercial');
jn('cross_4lane', 950, 650, false, 50, 'commercial');
jn('cross_4lane', 950, 1150, false, 50, 'old-town');
jn('cross_4lane', 950, 900, false, 50, 'old-town');
jn('cross_4lane', 230, 1150, false, 50, 'old-town');
jn('cross_4lane', 230, 900, false, 50, 'old-town');
jn('cross_4lane', 230, 650, false, 50, 'old-town');
jn('cross_4lane', 230, 120, true, 50, 'central');
jn('cross_4lane', 0, -250, true, 50, 'periphery');
jn('cross_4lane', 0, -1000, false, 50, 'periphery');
jn('cross_4lane', -900, -1000, false, 50, 'periphery');
jn('cross_4lane', -420, -1000, false, 50, 'periphery');
jn('cross_4lane', 600, -1000, false, 50, 'periphery');
jn('cross_4lane', 1100, 1150, false, 50, 'old-town');
jn('cross_4lane', 0, -1500, true, 50, 'periphery');
jn('cross_4lane', -900, -1500, false, 50, 'periphery');
jn('cross_4lane', -420, -1500, false, 50, 'periphery');
jn('cross_4lane', 600, -1500, false, 50, 'periphery');

// Preserve the six offset derivative streets, selecting their genuine crossing
// by position instead of stale segment IDs. Splitting is owned by jn / MapAPI.
for (const spec of [
  { name: 'old-town-west', insert: point3(700, 0, 900), far: point3(700, 0, 1040), district: 'old-town' },
  { name: 'old-town-east', insert: point3(1100, 0, 900), far: point3(1100, 0, 1040), district: 'old-town' },
  { name: 'east-local', insert: point3(950, 0, 1100), far: point3(800, 0, 1100), district: 'commercial' },
  { name: 'south-boulevard', insert: point3(-700, 0, 1150), far: point3(-700, 0, 1010), district: 'residential' },
  { name: 'central-boulevard', insert: point3(-620, 0, 120), far: point3(-620, 0, -20), district: 'central' },
  { name: 'residential-west', insert: point3(-620, 0, 650), far: point3(-620, 0, 780), district: 'residential' },
]) {
  road({ id: 'derivative-' + spec.name, points: [spec.far, spec.insert], lanes: 2, dir: 'two-way', style: 'urban_local_2', district: spec.district });
  jn('t_2lane', spec.insert.x, spec.insert.z, false, 50, spec.district);
}

// 5. Original roundabout at ground height. In/Out follow the preset's authored
// direction; each link is created once with a standard endpoint reference.
const roundabout = placePreset(map, 'roundabout', { position: point3(ROUNDABOUT.x, 0, ROUNDABOUT.z), rotation: 0, rampLaneCount: 2, rampRadius: 48, groupId: 'city-main-roundabout' });
for (const [gridEnd, label, inbound] of [
  [point3(250, 0, 380), 'North Out', false], [point3(250, 0, 1150), 'South In', true],
  [point3(430, 0, 650), 'East In', true], [point3(70, 0, 650), 'West Out', false],
] as [CityPoint, string, boolean][]) {
  const port = roundabout.connectionPorts.find(p => p.label === label)?.endpoint;
  if (!port) throw new Error('city-main: missing roundabout port ' + label);
  const ringPoint = roadEndpoint(map, port);
  const stub = road({ id: 'roundabout-link-' + label.split(' ')[0]!.toLowerCase(),
    points: inbound ? [gridEnd, ringPoint] : [ringPoint, gridEnd], lanes: 2, dir: 'forward', style: 'urban_local_2', district: 'residential' });
  link({ roadId: stub.id, end: inbound ? 'end' : 'start' }, port);
  // Existing east/west boulevard endpoint continues at the authored grid point.
  for (const r of map.roads) {
    if (r.id === stub.id || r.groupId) continue;
    for (const end of ['start', 'end'] as const) {
      const p = roadEndpoint(map, { roadId: r.id, end });
      if (Math.hypot(p.x - gridEnd.x, p.z - gridEnd.z, p.y ?? 0) < 0.05) link({ roadId: stub.id, end: inbound ? 'start' : 'end' }, { roadId: r.id, end });
    }
  }
}
jn('cross_4lane', ROUNDABOUT.x, 380, false, 50, 'residential');
jn('cross_4lane', ROUNDABOUT.x, 1150, false, 50, 'residential');

// 6. Preserve existing district filling and spawn locations.
let objectCounter = 0;
const place = (prefabId: PrefabId, x: number, z: number, rotation = 0, district?: string, scale?: {
    x: number;
    y: number;
    z: number;
}): void => {
    objectCounter++;
    placePrefab(map, { baseName: prefabId, prefabId, position: point3(x, 0, z), rotation, ...(district ? { district } : {}), ...(scale ? { scale } : {}) });
};
function treeLine(x0: number, z0: number, x1: number, z1: number, spacing: number, district: string, keepOut: {
    x: number;
    z: number;
    r: number;
}[], offset: number): void {
    const length = Math.hypot(x1 - x0, z1 - z0);
    if (length < 1)
        return;
    const ux = (x1 - x0) / length, uz = (z1 - z0) / length;
    for (let d = spacing * 0.5 + (offset % spacing); d < length - 2; d += spacing) {
        const x = x0 + ux * d, z = z0 + uz * d;
        if (keepOut.some(k => Math.hypot(x - k.x, z - k.z) < k.r))
            continue;
        place('tree', x, z, ((objectCounter % 7) - 3) * 0.08, district);
    }
}
function streetLamps(x0: number, z0: number, x1: number, z1: number, spacing: number, district: string): void {
    const length = Math.hypot(x1 - x0, z1 - z0);
    if (length < spacing)
        return;
    const ux = (x1 - x0) / length, uz = (z1 - z0) / length;
    for (let d = spacing * 0.5; d < length - spacing * 0.4; d += spacing)
        place('streetlight', x0 + ux * d, z0 + uz * d, Math.atan2(ux, uz), district);
}
function buildings(district: string, prefabId: PrefabId, cells: [
    number,
    number,
    number,
    number
][], size: number): void {
    for (const [x0, z0, x1, z1] of cells) {
        const width = x1 - x0, depth = z1 - z0;
        const columns = Math.max(1, Math.round(width / (size * 2.6))), rows = Math.max(1, Math.round(depth / (size * 2.6)));
        for (let i = 0; i < columns; i++)
            for (let k = 0; k < rows; k++) {
                place(prefabId, x0 + width * (i + 0.5) / columns, z0 + depth * (k + 0.5) / rows, 0, district);
            }
    }
}
function parkingRows(district: string, cells: [
    number,
    number,
    number,
    number
][], spacing: number): void {
    for (const [x0, z0, x1, z1] of cells)
        for (let x = x0; x <= x1 + 0.1; x += spacing)
            for (let z = z0; z <= z1 + 0.1; z += spacing)
                place('parked_car', x, z, Math.PI / 2, district);
}
// Existing district presets, kept at their authored scale inside a fitting block.
placePreset(map, 'commercial_block', { position: point3(-300, 0, 320), rotation: 0, groupId: 'city-main-commercial' });
placePreset(map, 'residential_block', { position: point3(-1080, 0, 880), rotation: Math.PI, groupId: 'city-main-residential' });
placePreset(map, 'industrial_block', { position: point3(-1150, 0, -560), rotation: 0, groupId: 'city-main-industrial' });
buildings('central', 'office', [[-260, -90, -70, 50], [80, -90, 260, 50], [80, 200, 260, 330], [-300, -620, -80, -480], [900, -180, 1120, -60]], 26);
buildings('central', 'commercial', [[-250, 200, -70, 330]], 24);
place('school', -1060, -400, 0, 'central');
place('parking', 320, -90, Math.PI / 2, 'central', { x: 1.4, y: 1, z: 1.4 });
place('parking', -300, -90, 0, 'central');
place('garage', 320, 260, 0, 'central', { x: 1.5, y: 1, z: 1.5 });
place('bus_stop', 58, 130, Math.PI / 2, 'central');
place('bus_stop', -58, 108, -Math.PI / 2, 'central');
place('bus_stop', 58, 660, Math.PI / 2, 'commercial');
place('bus_stop', 150, 1140, -Math.PI / 2, 'old-town');
place('traffic_sign', 24, 146, Math.PI, 'central');
place('traffic_sign', -24, 94, 0, 'central');
buildings('residential', 'residential_low', [[-1180, -120, -980, 50], [-1180, 200, -980, 340], [-860, -600, -620, -400], [-1180, 700, -980, 860], [-620, 700, -430, 860]], 15);
buildings('residential', 'residential_mid', [[-860, -150, -620, 50]], 18);
parkingRows('residential', [[-800, -980, -680, -920]], 14);
buildings('commercial', 'commercial', [[700, -90, 900, 50], [1000, -90, 1180, 50], [700, 250, 900, 340], [1000, 250, 1200, 340]], 20);
buildings('commercial', 'office', [[1000, 200, 1200, 240]], 22);
place('bus_stop', 660, 130, Math.PI / 2, 'commercial');
place('parking', 1080, -130, 0, 'commercial', { x: 1.6, y: 1, z: 1.6 });
buildings('old-town', 'residential_low', [[-70, 950, 180, 1080], [320, 950, 520, 1080], [700, 950, 880, 1080], [1020, 950, 1180, 1080], [-70, 1230, 180, 1320]], 12);
buildings('old-town', 'commercial', [[320, 1230, 520, 1330]], 16);
buildings('industrial', 'industrial', [[-1400, -900, -1000, -700], [-1400, -600, -1000, -480]], 26);
place('guardrail', -960, -800, 0, 'industrial', { x: 1.4, y: 1, z: 1 });
place('garage', -1340, -980, 0, 'industrial');
parkingRows('industrial', [[-1300, -430, -1180, -370]], 14);
// Street trees: regular boulevard rhythm, tighter residential, sparse old town.
const TREE_SPACING: Record<string, number> = { central: 17, commercial: 18, residential: 16, 'old-town': 42, periphery: 26, industrial: 30 };
for (const r of map.roads) {
    const district = r.district ?? 'periphery';
    if (district === 'expressway')
        continue;
    if (r.elevationMode !== 'custom' || r.centerline.some(q => (q.y ?? 0) > 0.5))
        continue;
    const spacing = TREE_SPACING[district] ?? 26;
    const keepOut = map.intersections.map(j => ({ x: j.position.x, z: j.position.z, r: junctionExtent(j, map) + 4 }));
    const offset = r.laneCount * r.laneWidth / 2 + (r.sidewalk?.width ?? 2) + 1.5;
    const pts = r.centerline;
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!, b = pts[i]!;
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length < 22)
            continue;
        const nx = (b.z - a.z) / length, nz = -(b.x - a.x) / length;
        for (const side of [1, -1]) {
            treeLine(a.x + nx * offset * side, a.z + nz * offset * side, b.x + nx * offset * side, b.z + nz * offset * side, spacing, district, keepOut, i * 3 + (side > 0 ? 0 : spacing * 0.5));
        }
    }
}
// Street lamps along every four/six-lane carriageway.
for (const r of map.roads) {
    if (r.district === 'expressway' || r.laneCount < 2)
        continue;
    if (r.elevationMode !== 'custom' || r.centerline.some(q => (q.y ?? 0) > 0.5))
        continue;
    const district = r.district ?? 'periphery';
    const offset = r.laneCount * r.laneWidth / 2 + (r.sidewalk?.width ?? 2) + 0.9;
    const pts = r.centerline;
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!, b = pts[i]!;
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length < 50)
            continue;
        const nx = (b.z - a.z) / length, nz = -(b.x - a.x) / length;
        for (const side of [-1, 1])
            streetLamps(a.x + nx * offset * side, a.z + nz * offset * side, b.x + nx * offset * side, b.z + nz * offset * side, district === 'central' ? 42 : 58, district);
    }
}
map.environment.districts = [
    { id: 'central', name: 'Central Modern', description: 'Six-lane boulevards, offices and large signalised junctions.' },
    { id: 'residential', name: 'Residential West', description: 'Four-lane outer roads with quieter two-lane inner streets.' },
    { id: 'old-town', name: 'Old Town South', description: 'Compact two-lane grid, offset junctions and tighter blocks.' },
    { id: 'commercial', name: 'Commercial East', description: 'Commercial frontage, parking, bus stops and a roundabout.' },
    { id: 'industrial', name: 'Industrial Northwest', description: 'Factories and workshops west of the west boulevard.' },
    { id: 'expressway', name: 'Elevated Expressway', description: 'Two three-lane carriageways on a 9 m deck across the north.' },
    { id: 'periphery', name: 'Periphery', description: 'Outer streets and expansion reserve.' },
];
map.environment.spawnPoints = [
    { id: 'central-boulevard', position: point3(0, 0, 400), rotation: Math.PI },
    { id: 'commercial-east', position: point3(600, 0, 780), rotation: Math.PI },
    { id: 'residential-west', position: point3(-900, 0, -400), rotation: 0 },
    { id: 'expressway-eastbound', position: point3(0, DECK_Y, EAST_Z), rotation: Math.PI / 2 },
    { id: 'expressway-westbound', position: point3(300, DECK_Y, WEST_Z), rotation: -Math.PI / 2 },
];
map.environment.metadata = { author: 'scripts/build-city-main.ts', districts: String(map.environment.districts.length) };

// 7. Validation gates the only filesystem mutation. Never remove bad elements.
const report = validateMap(map);
if (!report.valid) throw new Error(JSON.stringify(report, null, 2));
const destination = 'src/world/city/maps/city-main.json', temporary = destination + '.tmp-' + process.pid;
try { writeFileSync(temporary, saveMap(map), 'utf8'); renameSync(temporary, destination); }
finally { if (existsSync(temporary)) unlinkSync(temporary); }
console.log(JSON.stringify({ saved: destination, roads: map.roads.length, intersections: map.intersections.length,
  objects: map.objects.length, links: map.roadLinks?.length, errorCount: report.errorCount, warningCount: report.warningCount,
  warnings: report.warnings }, null, 2));
