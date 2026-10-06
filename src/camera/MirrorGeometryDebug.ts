import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Object3D, Vector3 } from 'three';
import { VEHICLE_RENDER_LAYERS } from '../vehicle/visual/VehicleRenderLayers';

/** Real world markers, not mirror-only imagery. They remain fixed as the car moves. */
export class MirrorGeometryDebug {
  readonly root = new Group();
  private readonly geometry = new BoxGeometry(0.7, 1.4, 0.7);
  private readonly materials = [0xe12835, 0xf5f5f1, 0x267aff]
    .map(color => new MeshBasicMaterial({ color }));
  private readonly position = new Vector3();

  constructor() {
    this.root.name = 'Mirror geometry: left red / rear white / right blue';
    for (let index = 0; index < 3; index += 1) {
      const marker = new Mesh(this.geometry, this.materials[index]);
      marker.name = ['Left rear red reference', 'Rear centre white reference', 'Right rear blue reference'][index]!;
      marker.layers.set(VEHICLE_RENDER_LAYERS.WORLD);
      this.root.add(marker);
    }
    this.root.visible = false;
  }

  /** Snapshot the vehicle frame on activation; never parent the markers to the car. */
  anchorVehicle(vehicleRoot: Object3D): void {
    vehicleRoot.updateWorldMatrix(true, false);
    for (let index = 0; index < 3; index += 1) {
      const x = index === 0 ? -1.65 : index === 2 ? 1.65 : 0;
      this.position.set(x, 0.7, index === 1 ? 10 : 6).applyMatrix4(vehicleRoot.matrixWorld);
      this.root.children[index]!.position.copy(this.position);
      // World-up boxes give an unambiguous vertical reference even on slopes.
      this.root.children[index]!.rotation.set(0, vehicleRoot.rotation.y, 0);
    }
    this.root.updateMatrixWorld(true);
  }

  setVisible(visible: boolean): void { this.root.visible = visible; }

  dispose(): void {
    this.root.removeFromParent();
    this.geometry.dispose();
    this.materials.forEach(material => material.dispose());
  }
}
