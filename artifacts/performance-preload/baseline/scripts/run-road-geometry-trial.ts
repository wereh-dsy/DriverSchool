import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { BufferGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import type { CityMapData } from '../src/world/city/CityMapData';
import { runContinuousRoadGeometrySelfTest } from '../src/world/city/ContinuousRoadGeometry.selftest';
import { ROAD_GEOMETRY_BUDGET, PavementTriangleIndex } from '../src/world/city/ContinuousRoadGeometry';
import { RoadBuilder } from '../src/world/city/RoadBuilder';
import { SectorManager } from '../src/world/city/SectorManager';
import { PrefabRegistry } from '../src/world/city/PrefabRegistry';
import { createSubject3Materials } from '../src/world/subject3/materials';
import { ROAD_TRIAL_CASES, roadTrialRegion } from './road-geometry-trial-data';
import { polylineLength, roadPoints, sampleAt } from '../src/world/city/geometry';
import { runVisualStreamingLifecycleSelfTest } from '../src/world/city/VisualStreamingLifecycle.selftest';
import { IntersectionBuilder } from '../src/world/city/IntersectionBuilder';
import { runtimeRoadClearance } from '../src/world/city/RoadClearance';
import { roadEdgeChains } from '../src/world/city/RoadEdgeChain';
import { roadPierSteps } from '../src/world/city/RoadInfrastructure';
import { drain } from '../src/loading/Loading';

let assertions = 0;
function check(ok: boolean, message: string): void { assertions++; if (!ok) throw new Error('Road trial: ' + message); }
const sourcePath = 'src/world/regional/regional-main.json', raw = await readFile(sourcePath), source = JSON.parse(raw.toString()) as CityMapData;
const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const before = hash(JSON.stringify(source));
const unit = runContinuousRoadGeometrySelfTest();
const materials = { ...createSubject3Materials(), tunnelLight: new MeshBasicMaterial({ color: 0xffefd0 }) };

function metrics(root: Group) {
  let draws = 0, triangles = 0, bufferBytes = 0;
  const geometries = new Set<BufferGeometry>();
  root.traverse(o => {
    if (!(o instanceof Mesh)) return;
    const g = o.geometry, count = o instanceof InstancedMesh ? o.count : 1;
    if (!g.getAttribute('position')?.count || !count) return;
    draws++; triangles += (g.index?.count ?? g.getAttribute('position').count) / 3 * count;
    if (!geometries.has(g)) {
      geometries.add(g);
      for (const name of Object.keys(g.attributes)) bufferBytes += g.getAttribute(name).array.byteLength;
      bufferBytes += g.index?.array.byteLength ?? 0;
    }
    if (o instanceof InstancedMesh) bufferBytes += o.instanceMatrix.array.byteLength;
  });
  return { draws, triangles, bufferBytes, geometries: geometries.size };
}
function release(group: Group): void {
  const geometries = new Set<BufferGeometry>();
  group.traverse(o => { if (o instanceof Mesh) geometries.add(o.geometry); if (o instanceof InstancedMesh) o.dispose(); });
  for (const g of geometries) g.dispose();
}
const results: unknown[] = [];
for (const test of ROAD_TRIAL_CASES) {
  const { map, selection, focus } = roadTrialRegion(source, test);
  const legacy = new RoadBuilder(materials, map), trial = new RoadBuilder(materials, map, selection);
  let paintVertices = 0, maxPaintHeightError = 0, missingPaint = 0, roofHits = 0, comparedRoads = 0, intrusionSamples = 0, piersChecked = 0, junctionPaintVertices = 0;
  const clearance = runtimeRoadClearance(map);
  for (const road of map.roads.filter(r => selection.roadIds.includes(r.id))) {
    const a = legacy.build(road), b = trial.build(road), surfaceA = a.children.find(o => o.name === 'road pavement') as Mesh;
    const surfaceB = b.children.find(o => o.name === 'road pavement') as Mesh;
    const pa = surfaceA.geometry.getAttribute('position'), pb = surfaceB.geometry.getAttribute('position');
    check(pa.count === pb.count, test.id + ': exact physical ribbon vertex count');
    for (let i = 0; i < pa.array.length; i++) check(Math.abs(Number(pa.array[i]) - Number(pb.array[i])) < 1e-5, test.id + ': unchanged pavement XYZ');
    const index = new PavementTriangleIndex([surfaceB.geometry]);
    b.traverse(o => {
      if (!(o instanceof Mesh)) return;
      const p = o.geometry.getAttribute('position'), n = o.geometry.getAttribute('normal');
      for (let i = 0; i < p.count; i++) check(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i) + n.getX(i) + n.getY(i) + n.getZ(i)), test.id + ': finite geometry/normals');
      const kind = o.userData.roadStructureKind as string | undefined;
      if(kind && ['curb','sidewalk','metal-rail','concrete-barrier','cutting-wall','tunnel-wall'].includes(kind)) {
        const continuations=roadEdgeChains(map).continuations(road.id);
        for(let i=0;i<p.count;i+=3){
          const point={x:p.getX(i),y:p.getY(i),z:p.getZ(i)};
          check(!clearance.roadAt(point,-.001,point.y-1.5,point.y+.05,undefined,id=>id===road.id,true),test.id+': structure stays outside its own live lanes '+JSON.stringify({road:road.id,kind,point}));
          // Check other live carriageways throughout the structure's occupied
          // height, not just matching XZ or the object's centroid.
          check(!clearance.roadAt(point,-.001,point.y-1.5,point.y+.05,road.id,id=>!continuations.has(id),true),test.id+': structure avoids another drivable layer '+JSON.stringify({road:road.id,kind,point}));
          intrusionSamples++;
        }
      }
      if(o instanceof InstancedMesh&&kind==='guardrail-posts'){
        const matrix=new Matrix4();
        for(let instance=0;instance<o.count;instance++){
          o.getMatrixAt(instance,matrix);
          for(const x of [-.04,.04])for(const y of [-.525,.525])for(const z of [-.05,.05]){
            const point=new Vector3(x,y,z).applyMatrix4(matrix);
            check(!clearance.roadAt(point,-.001,point.y-1.5,point.y+.05,undefined,id=>id===road.id,true),test.id+': guardrail post corners outside live lanes');intrusionSamples++;
          }
        }
      }
      if (!o.userData.markingOwner) return;
      if (p.count === 0) missingPaint++;
      for (let i = 0; i < p.count; i++) {
        const h = index.heightAt(p.getX(i), p.getZ(i), p.getY(i));
        check(h !== undefined, test.id + ': paint stays inside its final pavement owner ' + JSON.stringify({road:road.id,mesh:o.name,x:p.getX(i),y:p.getY(i),z:p.getZ(i)}));
        maxPaintHeightError = Math.max(maxPaintHeightError, Math.abs(p.getY(i) - h! - .008)); paintVertices++;
      }
    });
    if (road.structure?.enclosure && road.structure.enclosure.kind !== 'cutting') {
      const roof = b.children.find(o => o.name === 'tunnel ceiling and portals') as Mesh;
      check(!!roof, test.id + ': real tunnel roof'); roof.updateMatrixWorld(true);
      const points = roadPoints(road), length = polylineLength(points);
      for (const t of [.02, .25, .5, .75, .98]) {
        const p = sampleAt(points, length * t).point;
        const hits = new Raycaster(new Vector3(p.x, (p.y ?? 0) + 1.5, p.z), new Vector3(0, 1, 0)).intersectObject(roof);
        check(hits.length > 0, test.id + ': ceiling visible from cabin, including near portals'); roofHits++;
      }
    }
    for(const pier of drain(roadPierSteps(road,map,clearance))){
      check(!clearance.roadAt(pier.position,2,pier.baseY,pier.baseY+pier.height,road.id),test.id+': piers avoid lower roads');piersChecked++;
    }
    // Unselected context uses exactly the same builder path.
    check(b.children.some(o => o.name === 'road pavement'), test.id + ': preserves road details');
    comparedRoads++; release(a); release(b);
  }
  for(const j of map.intersections.filter(j=>selection.intersectionIds.includes(j.id))){
    const old=new IntersectionBuilder(map,materials).build(j), next=new IntersectionBuilder(map,materials,selection).build(j);
    next.updateMatrixWorld(true);
    const top=next.children.find(o=>o.name==='junction pavement') as Mesh;
    const worldTop=top.geometry.clone().applyMatrix4(top.matrixWorld), projections=new Map<string,PavementTriangleIndex>();
    const oldPaint=old.children.filter(o=>o instanceof Mesh&&o.userData.markingOwner), newPaint=next.children.filter(o=>o instanceof Mesh&&o.userData.markingOwner);
    next.traverse(o=>{
      if(!(o instanceof Mesh)||o.userData.roadStructureKind!=='curb-return')return;
      const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld),p=geometry.getAttribute('position');
      for(let i=0;i<p.count;i+=3){
        const point={x:p.getX(i),y:p.getY(i),z:p.getZ(i)};
        check(!clearance.roadAt(point,-.001,point.y-.5,point.y+.05,undefined,undefined,true),test.id+': junction curb leaves all entry lanes open');intrusionSamples++;
      }
      geometry.dispose();
    });
    check(oldPaint.length===newPaint.length,test.id+': retains every junction paint object');
    for(const o of newPaint as Mesh[]){
      const port=o.userData.approachPort as string;let index=projections.get(port);
      if(!index){
        const roadId=j.connections.find(c=>c.port===port)!.roadId,road=map.roads.find(r=>r.id===roadId)!;
        const roadGroup=trial.build(road), roadTop=roadGroup.children.find(o=>o.name==='road pavement') as Mesh;
        index=new PavementTriangleIndex([worldTop,roadTop.geometry]);projections.set(port,index);release(roadGroup);
      }
      const world=o.geometry.clone().applyMatrix4(o.matrixWorld),p=world.getAttribute('position');
      check(p.count>0,test.id+': junction paint not silently erased '+o.name+' '+port);
      for(let i=0;i<p.count;i++){
        const height=index.heightAt(p.getX(i),p.getZ(i),p.getY(i));
        check(height!==undefined,test.id+': junction paint owned by actual junction or its own approach');
        check(Math.abs(p.getY(i)-height!-.008)<.0005,test.id+': junction paint follows final XYZ');junctionPaintVertices++;
      }
      world.dispose();
    }
    worldTop.dispose();release(old);release(next);
  }
  check(maxPaintHeightError < .0005, test.id + ': paint follows graded surface within 0.5 mm');
  check(missingPaint === 0, test.id + ': no complete existing paint object silently removed');
  const samples: Record<string, (ReturnType<typeof metrics> & { generationMs: number; reloadStable: boolean })[]> = { legacy: [], continuous: [] };
  for (const variant of ['legacy', 'continuous', 'continuous', 'legacy', 'legacy', 'continuous']) {
    const region = roadTrialRegion(source, test), prefabs = new PrefabRegistry(materials), start = performance.now();
    const sectors = new SectorManager(region.map, materials, prefabs, { loadRadius: 1, roadGeometryTrial: variant === 'continuous' ? region.selection : undefined });
    sectors.updatePosition(focus.x, focus.z);
    const generationMs = performance.now() - start, initial = metrics(sectors.root);
    const instanceMatrices: number[] = [];
    sectors.root.traverse(o => { if (o instanceof InstancedMesh && o.count) { const m = new Matrix4(); o.getMatrixAt(0, m); instanceMatrices.push(m.determinant()); } });
    check(instanceMatrices.every(d => d > 0), test.id + ': non-mirrored instance bases');
    sectors.updatePosition(1000000, 1000000);
    check(metrics(sectors.root).triangles === 0, test.id + ': unloaded sectors retain no rendered road geometry');
    sectors.updatePosition(focus.x, focus.z);
    const after = metrics(sectors.root), reloadStable = after.draws === initial.draws && after.triangles === initial.triangles && after.bufferBytes === initial.bufferBytes;
    check(reloadStable, test.id + ': sector unload/reload has stable draw/triangle/buffer counts');
    samples[variant]!.push({ ...initial, generationMs, reloadStable }); sectors.dispose(); prefabs.dispose();
  }
  const median = (variant: string) => [...samples[variant]!].sort((a, b) => a.generationMs - b.generationMs)[1]!;
  const old = median('legacy'), next = median('continuous');
  check(next.draws <= old.draws + ROAD_GEOMETRY_BUDGET.maxExtraSectorDraws * 9, test.id + ': draw budget');
  check(next.triangles <= old.triangles * ROAD_GEOMETRY_BUDGET.maxTrianglesRatio, test.id + ': triangle budget');
  check(next.bufferBytes <= old.bufferBytes * ROAD_GEOMETRY_BUDGET.maxBufferRatio, test.id + ': buffer budget');
  check(next.generationMs <= old.generationMs + ROAD_GEOMETRY_BUDGET.maxAddedGenerationMs, test.id + ': additional initialization budget');
  check(next.generationMs <= old.generationMs * ROAD_GEOMETRY_BUDGET.maxGenerationRatio, test.id + ': relative initialization budget');
  results.push({ id: test.id, label: test.label, selectedRoads: selection.roadIds, selectedJunctions: selection.intersectionIds, contextRoads: map.roads.length,
    comparedRoads, paintVertices, junctionPaintVertices, missingPaint, maxPaintHeightError, roofHits, intrusionSamples, piersChecked, legacy: old, continuous: next,
    ratios: { triangles: next.triangles / old.triangles, buffers: next.bufferBytes / old.bufferBytes, generation: next.generationMs / old.generationMs } });
  console.log(JSON.stringify(results.at(-1)));
}
check(hash(JSON.stringify(source)) === before, 'source objects remain unchanged');
check(hash(await readFile(sourcePath)) === hash(raw), 'regional-main.json bytes remain unchanged');
const lifecycle = await runVisualStreamingLifecycleSelfTest();
const output = { source: sourcePath, sourceSHA256: hash(raw), unit, assertions, lifecycle, budget: ROAD_GEOMETRY_BUDGET, results };
const outputDirectory=process.env.ROAD_GEOMETRY_REPORT_DIR??'artifacts/road-geometry-trial';
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputDirectory+'/local-checks.json', JSON.stringify(output, null, 2) + '\n');
for (const material of Object.values(materials)) material.dispose();
console.log(JSON.stringify({ unit, assertions, lifecycle, report: 'artifacts/road-geometry-trial/local-checks.json' }));
