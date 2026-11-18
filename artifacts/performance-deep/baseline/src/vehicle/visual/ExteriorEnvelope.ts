import * as T from 'three';
import type { VehicleVisualConfig } from './VehicleVisualConfig';

/** Correct bumper-only overhangs, preserving axle/arch/cabin/door datums.
 * Not a vehicle scale: the complete wheel neighbourhood and occupied cabin are fixed.
 * Invoked while constructing owned static resources, before registry publication. */
export function fitExteriorOverhangs(root: T.Group, c: VehicleVisualConfig,
  frontOverhang: number, rearOverhang: number): void {
  root.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(root);
  const frontEnd = -c.wheelBase / 2 - frontOverhang;
  const rearEnd = c.wheelBase / 2 + rearOverhang;
  const frontFixed = -c.wheelBase / 2 - c.wheelRadius - .17;
  const rearFixed = c.wheelBase / 2 + c.wheelRadius + .17;
  const frontScale=(frontEnd-frontFixed)/(bounds.min.z-frontFixed);
  const rearScale=(rearEnd-rearFixed)/(bounds.max.z-rearFixed);
  if(Math.abs(frontScale-1)<1e-7&&Math.abs(rearScale-1)<1e-7)return;
  const oldGeometries = new Set<T.BufferGeometry>();
  const inverseRoot = root.matrixWorld.clone().invert();
  root.traverse(object => {
    if (!(object instanceof T.Mesh)) return;
    const toRoot = inverseRoot.clone().multiply(object.matrixWorld), toLocal = toRoot.clone().invert();
    if(!object.geometry.boundingBox)object.geometry.computeBoundingBox();
    const localBounds=object.geometry.boundingBox!.clone().applyMatrix4(toRoot);
    if((localBounds.min.z>=frontFixed||Math.abs(frontScale-1)<1e-7)
      &&(localBounds.max.z<=rearFixed||Math.abs(rearScale-1)<1e-7))return;
    const geometry = object.geometry.clone(); oldGeometries.add(object.geometry);
    const positions = geometry.getAttribute('position'), point = new T.Vector3();
    for (let i=0;i<positions.count;i++) {
      point.fromBufferAttribute(positions,i).applyMatrix4(toRoot);
      if(point.z < frontFixed) point.z = frontFixed + (point.z-frontFixed)*frontScale;
      else if(point.z > rearFixed) point.z = rearFixed + (point.z-rearFixed)*rearScale;
      point.applyMatrix4(toLocal); positions.setXYZ(i,point.x,point.y,point.z);
    }
    positions.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
    object.geometry=geometry;
  });
  const retained=new Set<T.BufferGeometry>();
  root.traverse(object=>{if(object instanceof T.Mesh)retained.add(object.geometry);});
  for(const geometry of oldGeometries)if(!retained.has(geometry))geometry.dispose();
}
