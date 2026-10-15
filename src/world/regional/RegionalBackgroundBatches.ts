import { Box3, BufferAttribute, BufferGeometry, Group, Mesh, Sphere, Vector3, type Material } from 'three';
import type { VisualGeometryData } from '../city/VisualStreamingData';
interface Batch { mesh: Mesh; used: number; capacity: number; bounds: Box3 }
/** Spatially bounded append buffers, rather than a new permanent Mesh every update frame. */
export class RegionalBackgroundBatches {
  public readonly root = new Group();
  private readonly batches = new Map<string, Batch>();
  public get count(): number { return this.batches.size; }
  public append(key: string, role: number, data: VisualGeometryData, material: Material): void {
    if (!data.position.length) return;
    const coordinates = key.split(',').map(Number), batchKey = `${Math.floor(coordinates[0]! / 8)},${Math.floor(coordinates[1]! / 8)}:${role}`;
    let b = this.batches.get(batchKey);
    if (!b) {
      const mesh = new Mesh(new BufferGeometry(), material); mesh.name = `Regional background batch ${batchKey}`;
      b = { mesh, used: 0, capacity: 0, bounds: new Box3() }; this.batches.set(batchKey, b); this.root.add(mesh);
    }
    const count = data.position.length / 3, required = b.used + count;
    if (required > b.capacity) {
      b.capacity = Math.max(2048, 2 ** Math.ceil(Math.log2(required)));
      // Dispose while the old attributes are still installed, so their GPU buffers are freed.
      b.mesh.geometry.dispose();
      for (const name of data.color ? ['position', 'normal', 'color'] : ['position', 'normal']) {
        const old = b.mesh.geometry.getAttribute(name), a = new Float32Array(b.capacity * 3);
        if (old) a.set(old.array);
        b.mesh.geometry.setAttribute(name, new BufferAttribute(a, 3));
      }
    }
    for (const [name, source] of [['position', data.position], ['normal', data.normal], ['color', data.color]] as const) {
      if (!source) continue;
      const attribute = b.mesh.geometry.getAttribute(name) as BufferAttribute;
      (attribute.array as Float32Array).set(source, b.used * 3);
      attribute.addUpdateRange(b.used * 3, source.length); attribute.needsUpdate = true;
    }
    b.used = required; b.mesh.geometry.setDrawRange(0, b.used);
    b.bounds.union(new Box3(new Vector3(data.bounds[0], data.bounds[1], data.bounds[2]), new Vector3(data.bounds[3], data.bounds[4], data.bounds[5])));
    b.mesh.geometry.boundingBox = b.bounds;
    b.mesh.geometry.boundingSphere = b.bounds.getBoundingSphere(b.mesh.geometry.boundingSphere ?? new Sphere());
  }
  public dispose(): void { for (const b of this.batches.values()) b.mesh.geometry.dispose(); this.batches.clear(); this.root.clear(); }
}
