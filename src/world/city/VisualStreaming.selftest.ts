import { Group, InstancedMesh, Mesh, MeshBasicMaterial } from 'three';
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
  for (const m of Object.values(materials)) m.dispose();
  return { passed: true, assertions, parityRoads: roads.map(r => r.id) };
}
