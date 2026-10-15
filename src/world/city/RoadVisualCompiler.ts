import { BufferGeometry, Float32BufferAttribute, InstancedMesh, Material, Matrix4, Mesh, Vector3, type MeshBasicMaterial } from 'three';
import type { CityMapData } from './CityMapData';
import { RoadBuilder } from './RoadBuilder';
import { exportVisualGeometry, type CompiledRoadVisual } from './VisualStreamingData';
import type { Subject3Materials } from '../subject3/materials';

/** Uses exactly the existing authored builder; only visual CPU output crosses the worker boundary. */
export class RoadVisualCompiler {
  private readonly builder: RoadBuilder;
  private readonly roads: Map<string, CityMapData['roads'][number]>;
  private readonly names = new Map<Material, string>();
  private readonly exportedInstances = new Set<string>();
  public constructor(private readonly map: CityMapData, materials: Subject3Materials & { tunnelLight: MeshBasicMaterial }) {
    this.builder = new RoadBuilder(materials, map); this.roads = new Map(map.roads.map(r => [r.id, r]));
    for (const [name, material] of Object.entries(materials)) this.names.set(material, name);
  }
  public compile(id: string): CompiledRoadVisual {
    const road = this.roads.get(id); if (!road) throw new Error(`Unknown visual road ${id}`);
    const group = this.builder.build(road); group.updateMatrixWorld(true);
    const surfaces = new Map<string, { key: string; material: string; positions: number[]; normals: number[]; uvs: number[]; barrierTriangles: number }>();
    const instances = new Map<string, CompiledRoadVisual['instances'][number] & { values: number[] }>();
    const matrix = new Matrix4(), position = new Vector3();
    const key = (x: number, z: number) => `${Math.floor(x / this.map.sectorSize)},${Math.floor(z / this.map.sectorSize)}`;
    group.traverse(o => {
      if (!(o instanceof Mesh)) return;
      const material = this.names.get(o.material as Material);
      if (!material) throw new Error(`Unregistered road visual material on ${id}`);
      if (o instanceof InstancedMesh) {
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, matrix); matrix.premultiply(o.matrixWorld); position.setFromMatrixPosition(matrix);
          const sector = key(position.x, position.z), batchKey = sector + '|' + o.geometry.uuid;
          let batch = instances.get(batchKey);
          if (!batch) {
            const geometryId = o.geometry.uuid;
            batch = { key: sector, material, geometryId, matrices: new Float32Array(), values: [], lamp: o.userData.environmentLamp === true };
            if (!this.exportedInstances.has(geometryId)) { batch.geometry = exportVisualGeometry(o.geometry); this.exportedInstances.add(geometryId); }
            instances.set(batchKey, batch);
          }
          batch.values.push(...matrix.elements);
        }
        o.dispose(); return;
      }
      const geometry = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); geometry.applyMatrix4(o.matrixWorld);
      const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
      for (let i = 0; i < p.count; i += 3) {
        const sector = key((p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3);
        const batchKey = sector + '|' + material;
        let b = surfaces.get(batchKey);
        if (!b) { b = { key: sector, material, positions: [], normals: [], uvs: [], barrierTriangles: 0 }; surfaces.set(batchKey, b); }
        if (o.name === 'road barrier') b.barrierTriangles++;
        for (let j = i; j < i + 3; j++) {
          b.positions.push(p.getX(j), p.getY(j), p.getZ(j)); b.normals.push(n.getX(j), n.getY(j), n.getZ(j)); b.uvs.push(uv?.getX(j) ?? 0, uv?.getY(j) ?? 0);
        }
      }
      geometry.dispose(); o.geometry.dispose();
    });
    return { id, surfaces: [...surfaces.values()].map(b => {
      const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(b.positions, 3));
      g.setAttribute('normal', new Float32BufferAttribute(b.normals, 3)); g.setAttribute('uv', new Float32BufferAttribute(b.uvs, 2));
      const geometry = exportVisualGeometry(g); g.dispose();
      return { key: b.key, material: b.material, geometry, barrierTriangles: b.barrierTriangles };
    }), instances: [...instances.values()].map(({ values, ...b }) => ({ ...b, matrices: new Float32Array(values) })) };
  }
}
