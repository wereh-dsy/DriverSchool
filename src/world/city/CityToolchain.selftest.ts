import { newCityMap, type CityPoint } from './CityMapData';
import { connectRoad, connectRoads, createIntersection, createRoad, placePrefab, placePreset, roadEndpoint, saveMap, splitRoadAtPoint, validateMap } from './MapAPI';
import { expandPreset, PRESET_CATALOG } from './presets/InfrastructurePresets';
import { connectionPoint, polylineLength, portDirections, roadPoints, rotatePoint, sampleAt } from './geometry';
import { validatePresetGeometry } from './presets/PresetGeometryValidation';
import { CityGround } from './CityGround';
import { VehicleCollisionSystem } from '../../vehicle/physics/CollisionSystem';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error('City toolchain: ' + message);
}
const close = (a: CityPoint, b: CityPoint) => Math.hypot(a.x - b.x, (a.y ?? 0) - (b.y ?? 0), a.z - b.z) < 1e-6;
function rejects(operation: () => unknown, map: ReturnType<typeof newCityMap>, code: string): void {
  const before = JSON.stringify(map); let error = '';
  try { operation(); } catch (e) { error = String(e); }
  assert(error.includes(code), 'expected ' + code + ', received ' + error);
  assert(JSON.stringify(map) === before, 'failed mutation must be atomic: ' + code);
}

/** Explicit cardinal transform, geometry and reference checks, without rendering/physics. */
export function validatePresets() {
  let cases = 0, drivingCases = 0, drivingSamples = 0;
  const presets: { id: string; cases: number }[] = [];
  for (const preset of PRESET_CATALOG) {
    let count = 0;
    for (const variant of [{}, { mainRoadLanes: 4, crossRoadLanes: 6, mainElevation: 12, rampLaneCount: 2, rampRadius: 40 }]) {
      const local = expandPreset(preset.id, { ...variant, groupId: 'fixture' });
      if (preset.production) {
        drivingSamples += validateDrivingCorridor({ ...newCityMap(), ...local }); drivingCases++;
      }
      for (const degrees of [0, 90, 180, 270]) {
        const rotation = degrees * Math.PI / 180, position = { x: 123, y: 7, z: -456 };
        const stamp = expandPreset(preset.id, { ...variant, groupId: 'fixture', position, rotation });
        const map = { ...newCityMap(), ...stamp }, report = validateMap(map);
        assert(report.valid, preset.id + ' / ' + degrees + ': ' + JSON.stringify(report.errors));
        if (preset.production) assert(validatePresetGeometry(map).length === 0, preset.id + ': ' + JSON.stringify(validatePresetGeometry(map)));
        const elements = [...stamp.roads, ...stamp.intersections, ...stamp.objects, ...stamp.roadLinks, ...stamp.connectionPorts];
        assert(new Set(elements.map(e => e.id)).size === elements.length, preset.id + ' unique IDs');
        const expected = (p: CityPoint): CityPoint => ({ x: p.x * Math.cos(rotation) + p.z * Math.sin(rotation) + position.x,
          y: (p.y ?? 0) + position.y, z: -p.x * Math.sin(rotation) + p.z * Math.cos(rotation) + position.z });
        stamp.roads.forEach((r, i) => r.centerline.forEach((p, n) => assert(close(p, expected(local.roads[i]!.centerline[n]!)), preset.id + ' XYZ transform')));
        for (const [actual, original] of [[stamp.intersections, local.intersections], [stamp.objects, local.objects]] as const) {
          actual.forEach((e, i) => { assert(close(e.position, expected(original[i]!.position)), preset.id + ' element transform');
            assert(Math.abs(e.rotation - original[i]!.rotation - rotation) < 1e-6, preset.id + ' element rotation'); });
        }
        for (const link of stamp.roadLinks) assert(close(roadEndpoint(map, link.from), roadEndpoint(map, link.to)), preset.id + ' coincident links');
        for (const j of stamp.intersections) for (const c of j.connections) assert(close(roadEndpoint(map, { roadId: c.roadId, end: c.end }), connectionPoint(j, c.port, map)), preset.id + ' junction alignment');
        for (const port of stamp.connectionPorts) assert(close(roadEndpoint(map, port.endpoint), expected(roadEndpoint({ ...newCityMap(), ...local }, local.connectionPorts.find(p => p.id === port.id)!.endpoint))), preset.id + ' transformed port');
        cases++; count++;
      }
    }
    presets.push({ id: preset.id, cases: count });
  }
  validateGeometryRejections();
  return { valid: true, errorCount: 0, cases, drivingCases, drivingSamples, geometryRejections: 8, presets };
}

function validateGeometryRejections(): void {
  const base={...newCityMap(),...expandPreset('highway_entry')};
  const check=(mutate:(m:typeof base)=>void,code:string,pose=false)=>{
    const map=structuredClone(base);mutate(map);
    const issues=pose?validateMap(map).errors:validatePresetGeometry(map);
    assert(issues.some(e=>e.code===code),'geometry must reject '+code);
  };
  const ramp=(m:typeof base)=>m.roads.find(r=>r.gore)!;
  check(m=>{ramp(m).laneWidth=3;},'geometry.width');
  check(m=>{ramp(m).shoulders={left:0,right:0};},'geometry.rampWidth');
  check(m=>{ramp(m).centerline[30]!.y=30;},'geometry.grade');
  check(m=>{ramp(m).centerline=[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:1,y:0,z:1}];},'geometry.curve');
  check(m=>{m.objects.push({id:'bad-tree',prefabId:'tree',position:{...m.roads[0]!.centerline[0]!},rotation:0});},'geometry.prop');
  check(m=>{m.connectionPorts![0]!.position!.x+=1;},'port.endpointMismatch',true);
  check(m=>{m.connectionPorts![0]!.heading!+=Math.PI/2;},'port.headingMismatch',true);
  check(m=>{m.roads.push({...structuredClone(ramp(m)),id:'overlapping-ramp'});},'geometry.overlap');
}

/** Sedan envelope and four wheel contacts through the actual runtime support/collider plans. */
function validateDrivingCorridor(map: ReturnType<typeof newCityMap>): number {
  const ground=new CityGround(map,{loadRadius:0}), collisions=new VehicleCollisionSystem(ground.colliders);
  let samples=0;
  try {
    for(const j of map.intersections.filter(j=>j.signalized)) {
      ground.sectors.updatePosition(j.position.x,j.position.z);
      const heads=ground.sectors.signals.root.children.filter(h=>h.userData.subject3JunctionIndex===map.intersections.indexOf(j));
      const incoming=j.connections.filter(c=>{
        const r=map.roads.find(r=>r.id===c.roadId)!;
        return r.travelDirection==='two-way'||(r.travelDirection==='forward')===(c.end==='end');
      });
      assert(heads.length===incoming.length,'each incoming approach has a far-side signal');
      for(const c of incoming) {
        const h=heads.find(h=>h.name===`Traffic signal ${c.roadId}`)!;
        const d=rotatePoint(portDirections[c.port],j.rotation);
        assert(-(Math.sin(h.rotation.y)*d.x+Math.cos(h.rotation.y)*d.z)>0.999,'signal front faces served approach');
        assert((h.position.x-j.position.x)*d.x+(h.position.z-j.position.z)*d.z<0,'signal stands beyond the junction');
      }
    }
    for(const r of map.roads) {
      const points=roadPoints(r),length=polylineLength(points);
      for(let lane=0;lane<r.laneCount;lane++) for(let d=3;d<length-3;d+=3) {
        const s=sampleAt(points,d),offset=-r.laneCount*r.laneWidth/2+(lane+0.5)*r.laneWidth;
        const p={x:s.point.x-s.tangent.z*offset,y:s.point.y??0,z:s.point.z+s.tangent.x*offset,yaw:Math.atan2(-s.tangent.x,-s.tangent.z)};
        for(const lateral of [-0.85,0.85]) for(const along of [-1.35,1.35]) {
          const x=p.x-s.tangent.z*lateral+s.tangent.x*along,z=p.z+s.tangent.x*lateral+s.tangent.z*along;
          const contact=ground.sampleRoadSurface(x,z,undefined,p.y);
          assert(contact.surfaceType==='asphalt'&&Math.abs(contact.height-p.y)<0.2,`wheel support ${r.id} / ${d.toFixed(1)}m`);
        }
        const result=collisions.resolve({previousPose:p,pose:p,velocity:{x:0,z:0},dimensions:{width:1.85,length:4.6,height:1.55},dt:1/120});
        assert(!result.collided,`sedan corridor ${r.id} / ${d.toFixed(1)}m: ${result.contacts.map(c=>c.colliderId).join(', ')}`);
        samples++;
      }
    }
  } finally { ground.dispose(); }
  return samples;
}

export function validateAuthoringAPI() {
  const map = newCityMap(), line = [{ x: 0, y: 2, z: 0 }, { x: 100, y: 6, z: 0 }], untouched = JSON.stringify(line);
  const r = createRoad(map, { baseName: 'diagonal-boulevard', centerline: line });
  assert(JSON.stringify(line) === untouched && r.centerline[0]!.y === 2 && r.centerline[1]!.y === 6, 'styles preserve supplied heights and caller points');
  const next = createRoad(map, { baseName: 'diagonal-boulevard', centerline: [{ x: 100, y: 6, z: 0 }, { x: 200, y: 6, z: 0 }] });
  assert(next.id === 'diagonal-boulevard-2', 'deterministic unique names');
  const feeder = createRoad(map, { baseName: 'feeder', centerline: [{ x: -100, y: 2, z: 0 }, { x: 0, y: 2, z: 0 }] });
  connectRoads(map, { roadId: feeder.id, end: 'end' }, { roadId: r.id, end: 'start' });
  connectRoads(map, { roadId: r.id, end: 'end' }, { roadId: next.id, end: 'start' });
  map.connectionPorts!.push({ id: 'terminal-port', label: 'End', endpoint: { roadId: r.id, end: 'end' } });
  const split = splitRoadAtPoint(map, r.id, { x: 50, y: 4, z: 0 });
  assert(split.before === r && validateMap(map).valid, 'split retains live references and validates');
  assert(map.connectionPorts![0]!.endpoint.roadId === split.after.id && map.roadLinks!.some(l => l.from.roadId === split.after.id && l.from.end === 'end' && l.to.roadId === next.id), 'split remaps old end link and exposed port');
  assert(map.roadLinks!.some(l => l.from.roadId === feeder.id && l.to.roadId === r.id && l.to.end === 'start'), 'split preserves original start link');
  const controlMap = newCityMap(), controlRoad = createRoad(controlMap, { centerline: [{ x: 0, y: 0, z: 0 }, { x: 50, y: 2, z: 0 }, { x: 100, y: 4, z: 0 }] });
  const controlSplit = splitRoadAtPoint(controlMap, controlRoad.id, { x: 50.02, y: 2.0008, z: 0 });
  assert(close(roadEndpoint(controlMap, controlSplit.from), roadEndpoint(controlMap, controlSplit.to)), 'near-control split shares one exact vertex');
  rejects(() => splitRoadAtPoint(map, r.id, { x: 0, y: 2, z: 0 }), map, 'split.endpoint');
  rejects(() => splitRoadAtPoint(map, r.id, { x: 20, y: 2, z: 99 }), map, 'split.off-road');
  rejects(() => createRoad(map, { centerline: [{ x: 0, z: 0 }, { x: 0, z: 0 }] }), map, 'road.degenerate');
  rejects(() => createRoad(map, { centerline: [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 10, z: 0 }], curve: 'smooth' }), map, 'road.degenerate');
  rejects(() => createRoad(map, { id: r.id, centerline: [{ x: 0, z: 0 }, { x: 10, z: 0 }] }), map, 'id.duplicate');
  rejects(() => createRoad(map, { elevationMode: 'custom', centerline: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 6, z: 0 }] }), map, 'slope.extreme');
  rejects(() => connectRoads(map, split.from, split.to), map, 'connection.duplicate');
  rejects(() => connectRoads(map, { roadId: r.id, end: 'start' }, { roadId: next.id, end: 'end' }), map, 'connection.gap');
  rejects(() => connectRoads(map, { roadId: 'missing', end: 'end' }, split.to), map, 'connection.broken');
  rejects(() => connectRoads(map, { roadId: r.id, end: 'wrong' } as never, split.to), map, 'connection.shape');
  rejects(() => connectRoads(map, { roadId: r.id, end: 'start', road: r } as never, split.to), map, 'connection.shape');
  rejects(() => placePreset(map, 'roundabout', { position: { x: 0, y: 650, z: 0 } }), map, 'preset.output');
  const a = placePreset(map, 'urban_overpass', { groupId: 'overpass' });
  const b = placePreset(map, 'urban_overpass', { groupId: 'overpass' });
  assert(a.groupId === 'overpass' && b.groupId === 'overpass-2' && map.roads.includes(a.roads[0]!), 'repeat stamps and live returned references');
  const collision = newCityMap();
  createRoad(collision, { id: 'stamp:overpass', centerline: [{ x: 0, z: 0 }, { x: 20, z: 0 }] });
  const stamp = placePreset(collision, 'urban_overpass', { groupId: 'stamp' });
  assert(stamp.roads[0]!.id === 'stamp:overpass-2' && validateMap(collision).valid, 'stamp collision remaps exposed references');
  const junctionMap = newCityMap(), j = createIntersection(junctionMap, { type: 'cross_4lane', position: { x: 100, y: 0, z: 0 }, rotation: 0, signalized: false });
  const arm = createRoad(junctionMap, { centerline: [{ x: 0, z: 0 }, { x: 100, z: 0 }] });
  connectRoad(junctionMap, { roadId: arm.id, end: 'end' }, { junctionId: j.id, port: 'west' });
  rejects(() => connectRoad(junctionMap, { roadId: arm.id, end: 'start' }, { junctionId: j.id, port: 'invalid' } as never), junctionMap, 'port.invalid');
  const halves = splitRoadAtPoint(junctionMap, arm.id, { x: 30, y: 0, z: 0 });
  assert(j.connections[0]!.roadId === halves.after.id, 'split preserves outer junction connection');
  assert(validateMap(junctionMap).warnings.some(w => w.code === 'junction.weak'), 'weak junction remains a warning');
  placePrefab(map, { prefabId: 'tree', position: { x: 0, y: 0, z: 0 }, rotation: 0 });
  assert(validateMap(JSON.parse(saveMap(map))).valid, 'save/import roundtrip');
  return { valid: true, errorCount: 0, checks: 'creation, IDs, styles, links, split references, atomic rejection, stamps, warnings, save/load' };
}
