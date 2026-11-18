import { Frustum, InstancedMesh, Matrix4, Mesh, Sphere, Vector3, type Box3, type Camera, type Object3D } from 'three';

/** Static sector bounds; fog depth is camera-space Z, not radial distance.
 * The union includes real off-axis mirrors. Near shadow/parking content is kept. */
export class FogVisibility {
  expandPrepared(root:Object3D,sphere:Sphere):void {this.bounds.get(root)?.sphere.union(sphere);}
  roadBoxVisible(box:Box3):boolean {
    if(!this.viewCount||!Number.isFinite(this.far))return true;
    for(let i=0;i<this.viewCount;i++){
      const view=this.views[i]!;
      const x=view.x>0?box.max.x:box.min.x,y=view.y>0?box.max.y:box.min.y,z=view.z>0?box.max.z:box.min.z;
      const minimumDepth=-(view.x*x+view.y*y+view.z*z+view.w);
      if(minimumDepth<this.far&&view.frustum.intersectsBox(box))return true;
    }
    return false;
  }
  includePrepared(root:Object3D,child:Object3D):void {
    const parent=this.bounds.get(root),added=this.bounds.get(child);
    if(parent&&added){parent.sphere.union(added.sphere);parent.fogged=parent.fogged&&added.fogged;}
    else if(added&&root.children.length===1)this.bounds.set(root,{sphere:added.sphere.clone(),fogged:added.fogged});
    else this.bounds.delete(root);
  }
  private readonly bounds = new WeakMap<Object3D, { sphere: Sphere; fogged: boolean }>();
  private readonly scratch = new Sphere();
  private readonly matrix = new Matrix4();
  private readonly eye = new Vector3();
  private readonly views = Array.from({ length: 4 }, () => ({ frustum: new Frustum(), planes: new Float64Array(24), x:0,y:0,z:0,w:0 }));
  private viewCount = 0;
  private far = Infinity;
  public configure(eye: Vector3, fogFar: number, cameras: readonly Camera[]): void {
    this.eye.copy(eye); this.far = fogFar; this.viewCount = 0;
    for (const camera of cameras) {
      const view = this.views[this.viewCount++];
      if (!view) { this.far = Infinity; break; }
      camera.updateWorldMatrix(true, false);
      view.frustum.setFromProjectionMatrix(this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const e=camera.matrixWorldInverse.elements;view.x=e[2]!;view.y=e[6]!;view.z=e[10]!;view.w=e[14]!;
      for(let i=0;i<6;i++){const p=view.frustum.planes[i]!,at=i*4;view.planes[at]=p.normal.x;view.planes[at+1]=p.normal.y;view.planes[at+2]=p.normal.z;view.planes[at+3]=p.constant;}
    }
  }
  public *prepareSteps(root: Object3D): Generator<void> {
    const entry = { sphere: new Sphere(), fogged: true };
    const objects = [root];
    while (objects.length) {
      const object = objects.pop()!;
      const prepared=object===root?undefined:this.bounds.get(object);
      if(prepared){entry.sphere.union(prepared.sphere);entry.fogged=entry.fogged&&prepared.fogged;yield;continue;}
      // Match traverse order so the accumulated bounding sphere stays identical.
      for (let i = object.children.length - 1; i >= 0; i--) objects.push(object.children[i]!);
      if (object instanceof Mesh) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (materials.some(material => (material as { fog?: boolean }).fog !== true)) entry.fogged = false;
        if (object instanceof InstancedMesh) {
          if (!object.boundingSphere) object.computeBoundingSphere();
          this.scratch.copy(object.boundingSphere!);
        } else {
          if (!object.geometry.boundingSphere) object.geometry.computeBoundingSphere();
          this.scratch.copy(object.geometry.boundingSphere!);
        }
        entry.sphere.union(this.scratch.applyMatrix4(object.matrixWorld));
        yield;
      }
    }
    this.bounds.set(root, entry);
  }
  public update(root: Object3D): void {
    if (!Number.isFinite(this.far) || !this.viewCount) { root.visible = true; return; }
    const entry = this.bounds.get(root);
    // Publication prepares bounds. Unknown/debug roots remain conservative;
    // never build a whole subtree synchronously in a driving frame.
    if(!entry){root.visible=true;return;}
    const sphere = entry.sphere;
    const p=sphere.center,r=sphere.radius,dx=p.x-this.eye.x,dy=p.y-this.eye.y,dz=p.z-this.eye.z;
    root.visible = !entry.fogged || dx*dx+dy*dy+dz*dz <= (400+r)*(400+r);
    for (let i = 0; !root.visible && i < this.viewCount; i++) {
      const view = this.views[i]!, a=view.planes;
      if(-(view.x*p.x+view.y*p.y+view.z*p.z+view.w)>this.far+r+32)continue;
      root.visible=true;
      for(let j=0;j<24;j+=4)if(a[j]!*p.x+a[j+1]!*p.y+a[j+2]!*p.z+a[j+3]! < -r){root.visible=false;break;}
    }
  }
}
