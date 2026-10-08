import * as THREE from 'three';
import type { VehicleVisual } from '../vehicle/visual/VehicleVisual';
import { VEHICLE_RENDER_LAYERS } from '../vehicle/visual/VehicleRenderLayers';

/** Two small real scene views in the existing MMI; no image stitching and no idle passes. */
export class ParkingCamera {
  private readonly rear = new THREE.PerspectiveCamera(95, 2, .08, 45);
  private readonly bird = new THREE.OrthographicCamera(-5.5, 5.5, 5.5, -5.5, .1, 25);
  private readonly target = new THREE.WebGLRenderTarget(576, 192, { depthBuffer: true });
  private readonly marker = new THREE.Group();
  private readonly display: THREE.Mesh | undefined;
  private readonly original: THREE.Material | THREE.Material[] | undefined;
  private readonly material: THREE.MeshBasicMaterial;
  private elapsed = Infinity;
  public renderCount = 0;
  public constructor(private readonly renderer: THREE.WebGLRenderer, private readonly scene: THREE.Scene,
    private readonly vehicle: VehicleVisual) {
    this.display = vehicle.cockpitRoot.getObjectByName('Infotainment display') as THREE.Mesh | undefined;
    this.original = this.display?.material;
    this.material = new THREE.MeshBasicMaterial({ map: this.target.texture, toneMapped: false });
    this.rear.layers.set(VEHICLE_RENDER_LAYERS.WORLD); this.rear.layers.enable(VEHICLE_RENDER_LAYERS.EXTERIOR);
    this.bird.layers.mask = this.rear.layers.mask;
    const dimensions = vehicle.config.dimensions;
    const body = new THREE.Mesh(new THREE.BoxGeometry(dimensions.width, .06, dimensions.length),
      new THREE.MeshBasicMaterial({ color: 0x7e8c9c }));
    const glass = new THREE.Mesh(new THREE.BoxGeometry(dimensions.width * .72, .065, dimensions.length * .43),
      new THREE.MeshBasicMaterial({ color: 0x23313f }));
    body.layers.set(VEHICLE_RENDER_LAYERS.EXTERIOR); glass.layers.mask = body.layers.mask;
    this.marker.add(body, glass); this.marker.visible = false; scene.add(this.marker);
  }
  public update(dt: number, reversing: boolean): void {
    if (!this.display) return;
    this.display.material = reversing ? this.material : this.original!;
    if (!reversing) { this.elapsed = Infinity; return; }
    this.elapsed += dt; if (this.elapsed < .1) return; this.elapsed = 0;
    const root = this.vehicle.root; root.updateWorldMatrix(true, false);
    const d = this.vehicle.config.dimensions;
    this.rear.position.copy(root.localToWorld(new THREE.Vector3(0, .79, d.length * .5 - .03)));
    this.rear.up.set(0, 1, 0);
    this.rear.lookAt(root.localToWorld(new THREE.Vector3(0, .30, d.length * .5 + 9)));
    const center = root.getWorldPosition(new THREE.Vector3());
    this.bird.position.set(center.x, center.y + 9, center.z);
    this.bird.up.set(-Math.sin(root.rotation.y), 0, -Math.cos(root.rotation.y));
    this.bird.lookAt(center.x, center.y, center.z);
    this.marker.position.set(center.x, center.y + .21, center.z); this.marker.rotation.y = root.rotation.y;
    const previous = this.renderer.getRenderTarget();
    const viewport = this.renderer.getViewport(new THREE.Vector4()), scissor = this.renderer.getScissor(new THREE.Vector4());
    const scissorTest = this.renderer.getScissorTest(), autoClear = this.renderer.autoClear;
    const shadows = this.renderer.shadowMap.autoUpdate, visible = root.visible;
    try {
      root.visible = false; this.renderer.shadowMap.autoUpdate = false;
      this.renderer.setRenderTarget(this.target); this.renderer.setScissorTest(true); this.renderer.autoClear = true;
      this.renderer.setViewport(0, 0, 384, 192); this.renderer.setScissor(0, 0, 384, 192);
      this.renderer.render(this.scene, this.rear);
      this.marker.visible = true;
      this.renderer.setViewport(384, 0, 192, 192); this.renderer.setScissor(384, 0, 192, 192);
      this.renderer.render(this.scene, this.bird); this.renderCount += 2;
    } finally {
      this.marker.visible = false; root.visible = visible; this.renderer.shadowMap.autoUpdate = shadows;
      this.renderer.autoClear = autoClear; this.renderer.setRenderTarget(previous);
      this.renderer.setViewport(viewport); this.renderer.setScissor(scissor); this.renderer.setScissorTest(scissorTest);
    }
  }
  public dispose(): void {
    if (this.display) this.display.material = this.original!;
    this.marker.removeFromParent(); this.marker.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
    this.target.dispose(); this.material.dispose();
  }
}
