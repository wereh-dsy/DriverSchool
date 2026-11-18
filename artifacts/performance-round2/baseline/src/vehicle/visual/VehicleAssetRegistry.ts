import * as T from 'three';

/** One game owns the registry. Config identity + section keys isolate calibrations.
 * Templates/geometry/static textures belong to the registry; cloned scene nodes,
 * mutable materials, display canvases and reflection targets belong to instances. */
export class VehicleAssetRegistry {
  private readonly sections = new Map<object, Map<string, T.Group>>();
  private readonly resources = new Set<T.BufferGeometry | T.Material | T.Texture>();
  private readonly canvases = new Map<string, HTMLCanvasElement>();
  private instances = 0;
  private readonly borrowers = new Map<object, number>();
  public retain(owner?: object): void { this.instances++; if (owner) this.borrowers.set(owner, (this.borrowers.get(owner) ?? 0) + 1); }
  public release(owner?: object): void { this.instances--; if (owner) { const count = (this.borrowers.get(owner) ?? 1) - 1; if (count) this.borrowers.set(owner, count); else this.borrowers.delete(owner); } }
  /** Keep at most three recent owners, plus any still borrowed by live visuals. */
  public prune(maxOwners = 3): void {
    const capacity = maxOwners + (this.sections.has(this) ? 1 : 0);
    for (const owner of this.sections.keys()) {
      if (this.sections.size <= capacity) break;
      if (owner !== this && !this.borrowers.has(owner)) this.sections.delete(owner);
    }
    const retained = new Set<T.BufferGeometry | T.Material | T.Texture>();
    for (const sections of this.sections.values()) for (const root of sections.values()) root.traverse(o => {
      if (!(o instanceof T.Mesh)) return;
      retained.add(o.geometry);
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
        retained.add(material); for (const value of Object.values(material)) if (value instanceof T.Texture) retained.add(value);
      }
    });
    for (const resource of this.resources) if (!retained.has(resource)) { resource.dispose(); this.resources.delete(resource); }
    while (this.canvases.size > 8) this.canvases.delete(this.canvases.keys().next().value!);
  }
  public owns(resource: T.BufferGeometry | T.Material | T.Texture): boolean { return this.resources.has(resource); }
  public prepareSection(owner: object, key: string, build: (root: T.Group) => void): void {
    let entries = this.sections.get(owner);
    if (entries) { this.sections.delete(owner); this.sections.set(owner, entries); }
    if (!entries) { entries = new Map(); this.sections.set(owner, entries); }
    let template = entries.get(key);
    if (!template) {
      template = new T.Group(); build(template); entries.set(key, template);
      template.traverse(o => {
        if (!(o instanceof T.Mesh)) return;
        this.resources.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          this.resources.add(m);
          for (const value of Object.values(m)) if (value instanceof T.Texture) this.resources.add(value);
        }
      });
    }
  }
  public section(owner: object, key: string, build: (root: T.Group) => void): T.Group {
    this.prepareSection(owner,key,build);
    const template = this.sections.get(owner)!.get(key)!;
    const instance = template.clone(true), materials = new Map<T.Material, T.Material>();
    instance.traverse(o => {
      if (!(o instanceof T.Mesh)) return;
      const clone = (m: T.Material) => {
        let copy = materials.get(m); if (!copy) { copy = m.clone(); materials.set(m, copy); } return copy;
      };
      o.material = Array.isArray(o.material) ? o.material.map(clone) : clone(o.material);
    });
    return instance;
  }
  public canvas(key: string, width: number, height: number, draw: (context: CanvasRenderingContext2D) => void): HTMLCanvasElement {
    let canvas = this.canvases.get(key);
    if (!canvas) {
      canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d'); if (context) draw(context);
      this.canvases.set(key, canvas);
    }
    return canvas;
  }
  public mesh(owner: object, key: string, build: () => T.Mesh, material?: T.Material): T.Mesh {
    const root = this.section(owner, key, root => {
      const mesh = build();
      // A cabin builder supplies an instance material. Never adopt that live
      // material into registry ownership when capturing immutable geometry.
      if (material) mesh.material = material.clone();
      root.add(mesh);
    });
    const mesh = root.children[0] as T.Mesh;
    if (material) {
      for (const copy of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) copy.dispose();
      mesh.material = material;
    }
    mesh.removeFromParent(); return mesh;
  }
  /** Prevent accidentally destroying assets while a vehicle still borrows them. */
  public dispose(): void {
    if (this.instances !== 0) throw new Error('Vehicle assets still have live instances');
    this.resources.forEach(r => r.dispose()); this.resources.clear(); this.sections.clear(); this.canvases.clear();
  }
}
