import { BufferGeometry, Float32BufferAttribute, Group, InstancedMesh, Material, Matrix4, Mesh, Vector3 } from 'three';
import type { CityIntersection, CityMapData, CityObject } from './CityMapData';
import type { Subject3Materials } from '../subject3/materials';
import { Subject3TrafficSignals } from '../subject3/trafficSignals';
import { RoadBuilder } from './RoadBuilder';
import { IntersectionBuilder } from './IntersectionBuilder';
import { PrefabRegistry } from './PrefabRegistry';

interface GeometryPlan { positions: number[]; normals: number[]; uvs: number[]; material: Material }
interface InstancePlan { geometry: BufferGeometry; material: Material; matrices: Matrix4[]; lamp: boolean }
interface SectorPlan { surfaces: Map<Material, GeometryPlan>; instances: Map<BufferGeometry, InstancePlan>; intersections: CityIntersection[]; objects: CityObject[] }
export interface SectorOptions { loadRadius?: number; editor?: boolean }
export class SectorManager {
  readonly root = new Group();
  readonly active = new Map<string, Group>();
  private readonly plans = new Map<string, SectorPlan>();
  private readonly infrastructureGeometry = new Set<BufferGeometry>();
  private readonly intersectionBuilder: IntersectionBuilder;
  readonly signals: Subject3TrafficSignals;
  private currentX = Infinity;
  private currentZ = Infinity;
  readonly loadRadius: number;
  constructor(readonly map: CityMapData, materials: Subject3Materials, readonly prefabs: PrefabRegistry, options: SectorOptions = {}) {
    this.loadRadius = Math.max(0, Math.floor(options.loadRadius ?? 1));
    this.intersectionBuilder = new IntersectionBuilder(map, materials);
    this.signals = new Subject3TrafficSignals(map.intersections.length, map.intersections.map(j => j.signals?.offsetSeconds ?? 0), { greenSeconds: 25, amberSeconds: 3, allRedSeconds: 2 });
    this.root.add(this.signals.root);
    const roads = new RoadBuilder(materials, map);
    // Compile only CPU plans. Runtime GPU meshes exist only in active sectors.
    for (const road of map.roads) {
      const group = roads.build(road); group.updateMatrixWorld(true);
      group.traverse(object => {
        if (!(object instanceof Mesh)) return;
        if (object instanceof InstancedMesh) {
          this.infrastructureGeometry.add(object.geometry);
          const matrix = new Matrix4(), position = new Vector3();
          for (let i = 0; i < object.count; i++) {
            object.getMatrixAt(i, matrix); matrix.premultiply(object.matrixWorld); position.setFromMatrixPosition(matrix);
            const sector = this.plan(this.key(position.x, position.z));
            let plan = sector.instances.get(object.geometry);
            if (!plan) { plan = { geometry: object.geometry, material: object.material as Material, matrices: [], lamp: object.userData.environmentLamp === true }; sector.instances.set(object.geometry, plan); }
            plan.matrices.push(matrix.clone());
          }
          object.dispose(); return;
        }
        const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
        geometry.applyMatrix4(object.matrixWorld);
        const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), uvs = geometry.getAttribute('uv');
        const material = object.material as Material;
        for (let i = 0; i < positions.count; i += 3) {
          const x = (positions.getX(i) + positions.getX(i + 1) + positions.getX(i + 2)) / 3;
          const z = (positions.getZ(i) + positions.getZ(i + 1) + positions.getZ(i + 2)) / 3;
          const sector = this.plan(this.key(x, z));
          let plan = sector.surfaces.get(material);
          if (!plan) { plan = { positions: [], normals: [], uvs: [], material }; sector.surfaces.set(material, plan); }
          for (let v = i; v < i + 3; v++) {
            plan.positions.push(positions.getX(v), positions.getY(v), positions.getZ(v));
            plan.normals.push(normals.getX(v), normals.getY(v), normals.getZ(v));
            plan.uvs.push(uvs?.getX(v) ?? 0, uvs?.getY(v) ?? 0);
          }
        }
        geometry.dispose(); object.geometry.dispose();
      });
    }
    for (const j of map.intersections) this.plan(this.key(j.position.x, j.position.z)).intersections.push(j);
    for (const o of map.objects) this.plan(this.key(o.position.x, o.position.z)).objects.push(o);
    if (options.editor) for (const key of this.plans.keys()) this.load(key);
  }
  private key(x: number, z: number): string { return `${Math.floor(x / this.map.sectorSize)},${Math.floor(z / this.map.sectorSize)}`; }
  private plan(key: string): SectorPlan {
    let plan = this.plans.get(key);
    if (!plan) { plan = { surfaces: new Map(), instances: new Map(), intersections: [], objects: [] }; this.plans.set(key, plan); }
    return plan;
  }
  updatePosition(x: number, z: number): boolean {
    const sx = Math.floor(x / this.map.sectorSize), sz = Math.floor(z / this.map.sectorSize);
    if (sx === this.currentX && sz === this.currentZ) return false;
    this.currentX = sx; this.currentZ = sz;
    const wanted = new Set<string>();
    for (let dx = -this.loadRadius; dx <= this.loadRadius; dx++) for (let dz = -this.loadRadius; dz <= this.loadRadius; dz++) {
      const key = `${sx + dx},${sz + dz}`; wanted.add(key); this.load(key);
    }
    for (const key of this.active.keys()) if (!wanted.has(key)) this.unload(key);
    return true;
  }
  private load(key: string): void {
    if (this.active.has(key)) return;
    const plan = this.plans.get(key); if (!plan) return;
    const root = new Group(); root.name = `City sector ${key}`;
    for (const p of plan.surfaces.values()) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(p.positions, 3));
      geometry.setAttribute('normal', new Float32BufferAttribute(p.normals, 3));
      geometry.setAttribute('uv', new Float32BufferAttribute(p.uvs, 2));
      const mesh = new Mesh(geometry, p.material); mesh.receiveShadow = true; root.add(mesh);
    }
    for (const p of plan.instances.values()) {
      const mesh = new InstancedMesh(p.geometry, p.material, p.matrices.length); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.environmentLamp = p.lamp;
      p.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix)); mesh.computeBoundingSphere(); root.add(mesh);
    }
    for (const j of plan.intersections) root.add(this.intersectionBuilder.build(j, this.signals, this.map.intersections.indexOf(j)));
    root.add(this.prefabs.buildInstances(plan.objects));
    this.active.set(key, root); this.root.add(root);
  }
  private unload(key: string): void {
    const root = this.active.get(key); if (!root) return;
    for (const j of this.plans.get(key)!.intersections) this.signals.removeHeadsForJunction(this.map.intersections.indexOf(j));
    root.traverse(o => {
      if (o instanceof InstancedMesh) o.dispose(); // Template geometry/materials belong to the registry.
      else if (o instanceof Mesh) o.geometry.dispose();
    });
    root.removeFromParent(); this.active.delete(key);
  }
  update(dt: number): void { this.signals.update(dt); }
  dispose(): void { for (const key of this.active.keys()) this.unload(key); for (const geometry of this.infrastructureGeometry) geometry.dispose(); this.infrastructureGeometry.clear(); this.root.clear(); this.plans.clear(); }
}
