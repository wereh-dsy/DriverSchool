import { Box3, BoxGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
import { FogVisibility } from './FogVisibility';
import { RoadSignRenderer } from './RoadSignRenderer';
import type { RoadSignDefinition } from './RoadSignData';
import alpha from './maps/city-alpha.json';
import { loadCityMap } from './CityMapLoader';
import { RoadBuilder } from './RoadBuilder';
import { RoadVisualCompiler } from './RoadVisualCompiler';
import { exportVisualGeometry, importVisualGeometry, visualTransfers } from './VisualStreamingData';
import { createSubject3Materials } from '../subject3/materials';
import { RegionalBackgroundBatches } from '../regional/RegionalBackgroundBatches';
import { Subject3TrafficSignals } from '../subject3/trafficSignals';
import { IntersectionBuilder } from './IntersectionBuilder';

export function runVisualStreamingSelfTest() {
  let assertions = 0;
  const check = (condition: boolean, message: string) => { assertions++; if (!condition) throw new Error(`Visual streaming: ${message}`); };
  const map = loadCityMap(alpha), materials = { ...createSubject3Materials(), tunnelLight: new MeshBasicMaterial({ color: 0xffefd0 }) };
  const compiler = new RoadVisualCompiler(map, materials), builder = new RoadBuilder(materials, map);
  const roads = [map.roads[0]!, map.roads.find(r => r.type === 'highway')!];
  for (const road of roads) {
    const group = builder.build(road); let vertices = 0, instances = 0;
    group.traverse(o => { if (o instanceof InstancedMesh) instances += o.count; else if (o instanceof Mesh) vertices += o.geometry.index?.count ?? o.geometry.getAttribute('position').count; });
    const data = compiler.compile(road.id);
    check(data.surfaces.reduce((n, p) => n + p.geometry.position.length / 3, 0) === vertices, 'worker retains every authored triangle');
    check(data.instances.reduce((n, p) => n + p.matrices.length / 16, 0) === instances, 'worker retains infrastructure instances');
    const transfer = visualTransfers(data); check(new Set(transfer).size === transfer.length, 'transfer buffers are unique');
    for (const p of data.surfaces) {
      const restored = importVisualGeometry(p.geometry), roundtrip = exportVisualGeometry(restored);
      check(roundtrip.position.every((v, i) => v === p.geometry.position[i]), 'geometry transfer preserves world positions');
      check(roundtrip.normal.every((v, i) => v === p.geometry.normal[i]), 'geometry transfer preserves normals'); restored.dispose();
    }
    group.traverse(o => { if (o instanceof InstancedMesh) o.dispose(); else if (o instanceof Mesh) o.geometry.dispose(); });
  }
  const batch = new RegionalBackgroundBatches(), data = compiler.compile(map.roads[1]!.id).surfaces[0]!.geometry;
  for (let i = 0; i < 24; i++) batch.append(`${i % 8},${Math.floor(i / 8)}`, 0, data, materials.asphalt);
  check(batch.count === 1, 'background draw count follows spatial batches, not update frames');
  const mesh = batch.root.children[0] as Mesh;
  check(mesh.geometry.drawRange.count === data.position.length / 3 * 24, 'append buffers retain all content');
  check(mesh.geometry.boundingSphere!.radius > 0, 'batch bounds valid for culling');
  batch.dispose(); check(batch.root.children.length === 0, 'background resources disposed');
  const signals = new Subject3TrafficSignals(map.intersections.length, [], { greenSeconds: 25, amberSeconds: 3, allRedSeconds: 2 });
  const junction = map.intersections.find(j => j.signalized)!, index = map.intersections.indexOf(junction), intersections = new IntersectionBuilder(map, materials);
  const owners = [new Group(), new Group()];
  for (const owner of owners) { intersections.build(junction, signals, index).traverse(o => { if (o instanceof Mesh) o.geometry.dispose(); }); for (const head of [...signals.root.children]) owner.add(head); }
  const heads = signals.getHeadCount(); check(heads > 0, 'streamed signals registered');
  signals.removeHeadsForJunction(index, owners[0]); check(signals.getHeadCount() === heads / 2, 'cancelled publication retains replacement signal heads');
  signals.update(.1); signals.removeHeadsForJunction(index, owners[1]); check(signals.getHeadCount() === 0, 'publication signal resources released'); signals.dispose();
  const signRenderer = new RoadSignRenderer({ road: { primaryText: '测试路', kind: 'urban' } }, () => null);
  const sign: RoadSignDefinition = { id: 'a', type: 'EXPRESSWAY_ADVANCE', template: 'highway-gantry', size: 'large',
    roadId: 'road', position: { x: 0, y: 4, z: 0 }, heading: .3, laneDirection: 'forward', language: 'zh-CN',
    destinations: [{ roadNameId: 'road', arrow: 'straight' }], gantryPosts: [-9, 9] };
  const signs = [sign, { ...sign, id: 'b', position: { x: 35, y: 8, z: 22 }, heading: -.4 }];
  const separate = signs.map(s => signRenderer.buildInstances([s])), together = signRenderer.buildInstances(signs);
  const count = (g: Group) => g.children.reduce((n, o) => n + (o as InstancedMesh).count, 0);
  const bounds = new Box3(); separate.forEach(g => bounds.union(new Box3().setFromObject(g)));
  const mergedBounds = new Box3().setFromObject(together);
  check(together.children.length === 3, 'all gantry support pieces share two batches plus their board');
  check(count(together) === separate.reduce((n, g) => n + count(g), 0), 'support batching retains every authored piece');
  check(bounds.min.distanceTo(mergedBounds.min) < 1e-5 && bounds.max.distanceTo(mergedBounds.max) < 1e-5, 'support batching preserves world placement and bounds');
  check(together.children.every(o => (o as InstancedMesh).userData.signIds.length === (o as InstancedMesh).count), 'batched sign identity remains aligned with instances');
  for (const g of [...separate, together]) for (const o of g.children) (o as InstancedMesh).dispose();
  signRenderer.dispose();
  const visibility = new FogVisibility(), fogGeometry = new BoxGeometry(200, 2, 2);
  const distantMesh = new Mesh(fogGeometry, materials.asphalt); distantMesh.position.z = -1200;
  const distant = new Group().add(distantMesh), eye = new Vector3(), camera = new PerspectiveCamera(90, 2, .1, 3000);
  visibility.configure(eye, 1000, [camera]); visibility.update(distant); check(!distant.visible, 'fully fogged static sectors skip all render passes');
  visibility.configure(eye, 1250, [camera]); visibility.update(distant); check(distant.visible, 'sector bounds crossing visible range remain visible');
  const corner = new Group().add(new Mesh(fogGeometry, materials.asphalt)); corner.position.set(1800, 0, -1200);
  visibility.update(corner); check(corner.visible, 'fog depth uses view Z so wide-screen corners are not cut early');
  const rear = new PerspectiveCamera(90, 2, .1, 3000); rear.lookAt(0, 0, 1);
  const behind = new Group().add(new Mesh(fogGeometry, materials.asphalt)); behind.position.z = 1200;
  visibility.update(behind); check(!behind.visible, 'distant sectors outside every view are skipped');
  visibility.configure(eye, 1250, [camera, rear]); visibility.update(behind); check(behind.visible, 'mirror-only scenery remains visible');
  const near = new Group().add(new Mesh(fogGeometry, materials.asphalt)); near.position.z = 100;
  visibility.configure(eye, 1250, [camera]); visibility.update(near); check(near.visible, 'near shadow casters and parking surroundings are retained');
  visibility.configure(eye, Infinity, [camera]); visibility.update(distant); check(distant.visible, 'inspection cameras restore distant sectors');
  const unfogged = new MeshBasicMaterial({ fog: false }), sky = new Group().add(new Mesh(fogGeometry, unfogged));
  sky.position.x = 2000; visibility.configure(eye, 100, [camera]); visibility.update(sky); check(sky.visible, 'unfogged artwork is never distance-culled');
  fogGeometry.dispose(); unfogged.dispose();
  for (const m of Object.values(materials)) m.dispose();
  return { passed: true, assertions, parityRoads: roads.map(r => r.id) };
}
