import { newCityMap, type CityRoad } from './CityMapData';
import { applyRoadCrossSection } from './RoadCrossSection';
import { isControlledAccessRoad, roadFunction } from './RoadClassification';
import { buildCityRoadNetwork } from './CityRoadNetwork';
import { validateMap } from './CityMapValidation';

export function runCityRoadModelSelfTest(): { assertions: number } {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error(`City road model: ${message}`); };
  const road = (id: string, roadClass: CityRoad['roadClass'], z: number): CityRoad => ({
    id, roadClass, crossSection: 'shouldered', centerline: [{ x: 0, y: 0, z }, { x: 100, y: 0, z }],
    laneCount: 2, laneWidth: 3.75, travelDirection: 'forward', speedLimit: 60, elevationMode: 'ground',
  });
  const map = newCityMap();
  const expressway = road('ground-expressway', 'expressway', 0);
  const ramp = road('two-lane-ramp', 'ramp', 100);
  ramp.elevationMode = 'elevated'; ramp.elevation = 8;
  const frontage = road('frontage', 'frontage', 200); frontage.type = 'highway';
  const arterial = road('bridge-arterial', 'arterial', 300); arterial.elevationMode = 'elevated'; arterial.elevation = 6;
  map.roads.push(expressway, ramp, frontage, arterial);
  assert(validateMap(map).valid, 'explicit functions and profiles need no legacy type; two-lane ramp is valid');
  const network = buildCityRoadNetwork(map);
  assert(network.segments[0]!.roadType === 'highway' && network.segments[0]!.centerline[0]!.y === 0, 'expressway does not imply elevated');
  assert(network.segments[1]!.roadType === 'ramp' && network.segments[1]!.lanes.length === 2, 'ramp function independent of lane count');
  assert(network.segments[2]!.roadFunction === 'frontage' && network.segments[2]!.roadType === 'urban' && !isControlledAccessRoad(frontage), 'explicit frontage overrides legacy highway');
  assert(network.segments[3]!.roadFunction === 'arterial' && network.segments[3]!.centerline[0]!.y === 6, 'arterial supports a bridge');
  applyRoadCrossSection(arterial, 'street');
  assert(arterial.roadClass === 'arterial' && arterial.elevation === 6 && arterial.elevationMode === 'elevated' && arterial.speedLimit === 60, 'geometric preset preserves function/structure/speed');
  assert(roadFunction({ ...expressway, roadClass: undefined, type: 'ramp_1' }) === 'ramp', 'legacy ramp compatibility');
  assert(roadFunction({ ...expressway, roadClass: 'avenue' }) === 'arterial', 'legacy class alias');
  ramp.laneCount = 3; ramp.travelDirection = 'two-way';
  assert(validateMap(map).errors.some(e => e.code === 'direction.invalid'), 'profiles retain directional lane validation');
  return { assertions };
}
