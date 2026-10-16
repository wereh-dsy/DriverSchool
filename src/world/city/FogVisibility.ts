import { Frustum, InstancedMesh, Matrix4, Mesh, Sphere, Vector3, type Camera, type Object3D } from 'three';

/** Static sector bounds; fog depth is camera-space Z, not radial distance.
 * The union includes real off-axis mirrors. Near shadow/parking content is kept. */
export class FogVisibility {
  private readonly bounds = new WeakMap<Object3D, { sphere: Sphere; fogged: boolean }>();
  private readonly scratch = new Sphere();
  private readonly matrix = new Matrix4();
  private readonly eye = new Vector3();
  private readonly views = Array.from({ length: 4 }, () => ({ frustum: new Frustum(), camera: undefined as Camera | undefined }));
  private viewCount = 0;
  private far = Infinity;
  public configure(eye: Vector3, fogFar: number, cameras: readonly Camera[]): void {
    this.eye.copy(eye); this.far = fogFar; this.viewCount = 0;
    for (const camera of cameras) {
      const view = this.views[this.viewCount++];
      if (!view) { this.far = Infinity; break; }
      camera.updateWorldMatrix(true, false);
      view.camera = camera;
      view.frustum.setFromProjectionMatrix(this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    }
  }
  public update(root: Object3D): void {
    if (!Number.isFinite(this.far) || !this.viewCount) { root.visible = true; return; }
    let entry = this.bounds.get(root);
    if (!entry) {
      entry = { sphere: new Sphere(), fogged: true };
      root.updateWorldMatrix(true, true);
      root.traverse(object => {
        if (!(object instanceof Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (materials.some(material => (material as { fog?: boolean }).fog !== true)) entry!.fogged = false;
        if (object instanceof InstancedMesh) {
          if (!object.boundingSphere) object.computeBoundingSphere();
          this.scratch.copy(object.boundingSphere!);
        } else {
          if (!object.geometry.boundingSphere) object.geometry.computeBoundingSphere();
          this.scratch.copy(object.geometry.boundingSphere!);
        }
        entry!.sphere.union(this.scratch.applyMatrix4(object.matrixWorld));
      });
      this.bounds.set(root, entry);
    }
    const sphere = entry.sphere;
    root.visible = !entry.fogged || sphere.distanceToPoint(this.eye) <= 400;
    for (let i = 0; !root.visible && i < this.viewCount; i++) {
      const view = this.views[i]!, e = view.camera!.matrixWorldInverse.elements, p = sphere.center;
      const depth = -(e[2]! * p.x + e[6]! * p.y + e[10]! * p.z + e[14]!);
      root.visible = depth <= this.far + sphere.radius + 32 && view.frustum.intersectsSphere(sphere);
    }
  }
}
