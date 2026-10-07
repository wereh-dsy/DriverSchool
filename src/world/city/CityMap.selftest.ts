import { InstancedMesh, Mesh } from 'three';
import { CityGround } from './CityGround';
import { loadCityMap } from './CityMapLoader';
import { buildCityRoadNetwork } from './CityRoadNetwork';
import { connectionPoint, syncConnections } from './geometry';
import { CityEditorHistory } from '../../editor/CityEditorHistory';
import cityAlpha from './maps/city-alpha.json';
import { connectRoad, createRoad, deleteObject, moveRoadNode, newCityMap, placePreset, saveMap, validateMap } from './MapAPI';
import { expandPreset, PRESET_CATALOG } from './presets/InfrastructurePresets';
import { roadPoints, sampleAt, polylineLength } from './geometry';
import { roadPiers } from './RoadInfrastructure';

const assert = (condition: unknown, message: string): void => { if (!condition) throw new Error(`CityMap selftest: ${message}`); };
export function runCityMapSelfTest(): { roads: number; intersections: number; prefabs: number; instancedBatches: number; streaming: string } {
  const data = loadCityMap(cityAlpha);
  assert(JSON.stringify(loadCityMap(JSON.parse(JSON.stringify(data)))) === JSON.stringify(data), 'JSON roundtrip');
  for (const j of data.intersections) for (const c of j.connections) {
    const r = data.roads.find(r => r.id === c.roadId)!, p = c.end === 'start' ? r.centerline[0]! : r.centerline.at(-1)!, port = connectionPoint(j, c.port, data);
    assert(Math.hypot(p.x - port.x, p.z - port.z) < 1e-7, 'connected road meets port');
  }
  const moved = structuredClone(data), j = moved.intersections[0]!; j.position.x += 25; j.rotation += Math.PI / 2; syncConnections(moved);
  assert(JSON.stringify(moved.roads) !== JSON.stringify(data.roads), 'junction transform moves connected endpoints');
  const history = new CityEditorHistory(); history.record(data, moved);
  assert(JSON.stringify(history.undo(moved)) === JSON.stringify(data), 'undo restores connection edits');
  assert(JSON.stringify(history.redo(data)) === JSON.stringify(moved), 'redo restores connection edits');
  for (const invalid of [
    { ...data, sectorSize: 0 }, { ...data, objects: [{ ...data.objects[0], prefabId: 'missing' }] },
    { ...data, roads: [{ ...data.roads[0], laneCount: 5 }] },
    { ...data, intersections: [{ ...data.intersections[0], connections: [{ roadId: 'missing', end: 'start', port: 'north' }] }] },
  ]) { let rejected = false; try { loadCityMap(invalid); } catch { rejected = true; } assert(rejected, 'invalid JSON rejected'); }
  const oneWay = structuredClone(data); oneWay.roads[0]!.travelDirection = 'forward';
  const network = buildCityRoadNetwork(oneWay), road = network.segments[0]!;
  assert(road.lanes.every(l => l.direction === 'forward'), 'one-way lanes');
  assert(!network.laneConnections.some(c => c.intersectionId === road.startIntersectionId && road.lanes.some(l => l.id === c.fromLaneId)), 'one-way origin has no incoming lanes');
  const detached = structuredClone(data); detached.intersections = []; detached.roads = [detached.roads[0]!, { ...detached.roads[0]!, id: 'extension', centerline: [detached.roads[0]!.centerline.at(-1)!, { x: 20, z: 150 }] }];
  detached.roadLinks = []; detached.connectionPorts = [];
  assert(!buildCityRoadNetwork(detached).endpointNodes.some(n => n.ends.length === 2), 'coincident geometry does not create topology');
  connectRoad(detached, { roadId: detached.roads[0]!.id, end: 'end' }, { endpoint: { roadId: 'extension', end: 'start' } });
  assert(buildCityRoadNetwork(detached).endpointNodes.some(n => n.ends.length === 2), 'explicit snapped endpoints share a node');
  const ground = new CityGround(data);
  assert(ground.sampleRoadSurface(ground.spawnPose.position.x, ground.spawnPose.position.z).surfaceType === 'asphalt', 'drivable spawn');
  for (const segment of ground.roadNetwork.segments) {
    const a = segment.centerline[0]!, b = segment.centerline[1]!;
    assert(ground.sampleRoadSurface((a.x + b.x) / 2, (a.z + b.z) / 2, undefined, ((a.y ?? 0) + (b.y ?? 0)) / 2).surfaceType === 'asphalt', 'road query independent of active visuals');
  }
  assert(ground.sectors.active.size <= 9, '3×3 active sectors');
  let instancedBatches = 0;
  ground.root.traverse(o => { if (o instanceof InstancedMesh) instancedBatches++; });
  assert(instancedBatches > 0, 'prefab instancing');
  const initialCount = ground.sectors.signals.getHeadCount(), initialKeys = [...ground.sectors.active.keys()].sort().join('|');
  const unchangedRoot = [...ground.sectors.active.values()][0];
  ground.updatePlayerPosition(ground.spawnPose.position.x, ground.spawnPose.position.z);
  assert([...ground.sectors.active.values()][0] === unchangedRoot, 'same-sector update creates no objects');
  let disposed = 0;
  ground.root.traverse(o => { if (o instanceof Mesh && !(o instanceof InstancedMesh)) o.geometry.addEventListener('dispose', () => disposed++); });
  ground.updatePlayerPosition(5000, 5000);
  assert(ground.sectors.active.size === 0 && ground.sectors.signals.getHeadCount() === 0 && disposed > 0, 'distant sectors and heads released');
  ground.updatePlayerPosition(ground.spawnPose.position.x, ground.spawnPose.position.z);
  assert(ground.sectors.signals.getHeadCount() === initialCount && [...ground.sectors.active.keys()].sort().join('|') === initialKeys, 'reload without duplicate objects/signals');
  ground.dispose();
  runCityElevationSelfTest();
  return { roads: data.roads.length, intersections: data.intersections.length, prefabs: data.objects.length, instancedBatches, streaming: 'load/unload/reload passed' };
}
function runCityElevationSelfTest(): void {
  const map = newCityMap();
  const lower = createRoad(map, { id: 'lower', styleId: 'urban_street_4', centerline: [{ x: -150, z: 0 }, { x: 150, z: 0 }] });
  const upper = createRoad(map, { id: 'upper', styleId: 'elevated_expressway_6', centerline: [{ x: 0, z: 150 }, { x: 0, z: -150 }] });
  const ramp = createRoad(map, { id: 'ramp', styleId: 'ramp_1', curve: 'smooth', centerline: [{ x: 0, y: 0, z: 300 }, { x: 0, y: 3, z: 225 }, { x: 0, y: 6, z: 150 }] });
  connectRoad(map, { roadId: ramp.id, end: 'end' }, { endpoint: { roadId: upper.id, end: 'start' } });
  const network = buildCityRoadNetwork(map);
  assert(!network.connectivity.some(n => n.incomingRoadIds.includes(lower.id) && n.outgoingRoadIds.includes(upper.id)), 'upper/lower crossing is disconnected');
  assert(network.laneConnections.some(n => n.fromLaneId.startsWith('ramp:') && n.toLaneId.startsWith('upper:')), 'ramp explicitly joins upper lanes');
  assert(roadPiers(upper, map).every(p => Math.abs(p.position.z) > lower.laneCount * lower.laneWidth / 2 + 2), 'piers clear underlying carriageway');
  const ground = new CityGround(map, { editor: true });
  assert(ground.sampleRoadSurface(0, 0, undefined, 0).height === 0, 'lower crossing support stays at ground');
  assert(ground.sampleRoadSurface(0, 0, undefined, 6).height === 6, 'upper crossing support stays on deck');
  const points = roadPoints(ramp), length = polylineLength(points); let y = 0;
  for (let d = 0; d <= length; d += 0.5) {
    const p = sampleAt(points, d).point; ground.setSurfaceReferenceHeight(y);
    const s = ground.sampleRoadSurface(p.x, p.z); assert(Math.abs(s.height - (p.y ?? 0)) < 0.01 && s.surfaceType === 'asphalt', 'continuous drivable ramp support'); y = s.height;
  }
  let piers = 0, maximumY = 0;
  ground.root.traverse(o => { if (o instanceof InstancedMesh && o.count > 0) piers++; if (o instanceof Mesh) { const p = o.geometry.getAttribute('position'); for (let i = 0; i < p.count; i++) maximumY = Math.max(maximumY, p.getY(i)); } });
  assert(piers > 0 && maximumY >= 6, 'elevated mesh and instanced piers'); ground.dispose();
  const legacy = newCityMap(); createRoad(legacy, { centerline: [{ x: 0, z: 0 }, { x: 100, z: 0 }] });
  legacy.schemaVersion = 1; legacy.roadLinks = undefined; legacy.roads[0]!.centerline.forEach(p => { delete p.y; });
  assert(loadCityMap(legacy).roads[0]!.centerline.every(p => p.y === 0), 'V1 missing Y defaults to zero');
  for (const descriptor of PRESET_CATALOG) for (const parameters of [{}, { mainRoadLanes: 4, crossRoadLanes: 6, mainElevation: 12, rampRadius: 40, rampLaneCount: 2, rotation: 0.7, position: { x: 10, y: 1, z: 20 } }]) {
    const candidate = newCityMap(), stamp = placePreset(candidate, descriptor.id, parameters);
    assert(validateMap(candidate).valid && JSON.parse(saveMap(candidate)).schemaVersion === 2, `preset ${descriptor.id} valid/roundtrip`);
    assert([...stamp.roads, ...stamp.objects, ...stamp.intersections].every(e => e.groupId === stamp.groupId && e.presetSource === descriptor.id), 'expanded elements retain authoring metadata');
    const n = buildCityRoadNetwork(candidate);
    assert(n.endpointNodes.filter(n => n.ends.length > 1).length > 0 || ['urban_overpass', 'residential_block', 'commercial_block', 'industrial_block'].includes(descriptor.id), 'preset has explicit continuation nodes');
  }
  const presetMap = newCityMap(), stamp = placePreset(presetMap, 'diamond_interchange');
  const editable = stamp.roads[0]!; moveRoadNode(presetMap, editable.id, 0, { x: 100, y: 6, z: 350 }); deleteObject(presetMap, stamp.objects[0]?.id ?? editable.id);
  assert(!presetMap.roads.some(r => r.id === editable.id), 'expanded road deletion removes references');
  const invalid = structuredClone(map); invalid.roads[0]!.centerline[1]!.y = 30; invalid.roads[0]!.elevationMode = 'custom'; invalid.roads[0]!.centerline[1]!.x = -149;
  assert(validateMap(invalid).errors.some(e => e.code === 'slope.extreme'), 'extreme grade is actionable error');
  const mismatched = structuredClone(map); mismatched.roads.find(r => r.id === 'ramp')!.centerline.at(-1)!.y = 5;
  assert(validateMap(mismatched).errors.some(e => e.code === 'height.mismatch'), 'connected elevation mismatch is actionable error');
  const overpass = expandPreset('urban_overpass'), isolated = { ...newCityMap(), ...overpass };
  assert(buildCityRoadNetwork(isolated).connectivity.length === 0, 'overpass has no crossing connection');
}
