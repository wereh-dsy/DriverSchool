import {
  BoxGeometry, BufferGeometry, CanvasTexture, DoubleSide, Float32BufferAttribute,
  Group, Mesh, MeshBasicMaterial, SRGBColorSpace,
} from 'three';
import type { VehicleVisual } from '../vehicle/visual/VehicleVisual';
import type { Weather } from '../world/environment/EnvironmentState';
import { WiperController } from '../vehicle/control/WiperController';
import { VEHICLE_RENDER_LAYERS } from '../vehicle/visual/VehicleRenderLayers';

interface GlassDrop { x: number; y: number; radius: number; water: number; rate: number; }

/** Physical front pane only: follows head look, depth-tested against cabin trim.
 * Hidden during mirror rendering by DrivingGame; never drawn over the HUD.
 */
export class WindshieldRain {
  public readonly root = new Group();
  private readonly canvas = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D | null;
  private readonly texture: CanvasTexture;
  private readonly material: MeshBasicMaterial;
  private readonly pane: Mesh;
  private readonly wiperMaterial = new MeshBasicMaterial({ color: 0x181d21, side: DoubleSide });
  private readonly wipers: Group[] = [];
  private readonly drops: GlassDrop[] = [];
  private readonly width: number;
  private readonly height: number;
  private readonly reach: number;
  private readonly pivots: readonly number[];
  private elapsed = 0;
  private totalWater = 0;

  public constructor(vehicle: Pick<VehicleVisual, 'config' | 'root'>) {
    const { cabin, body } = vehicle.config;
    this.width = cabin.width - 0.05;
    const topWidth = body.roofWidth - 0.09;
    const dy = cabin.windshieldTopY - cabin.windshieldBottomY;
    const dz = cabin.windshieldTopZ - cabin.windshieldBottomZ;
    this.height = Math.hypot(dy, dz);
    this.reach = Math.min(this.height * 0.88, this.width * 0.43);
    this.pivots = [-this.width * 0.34, this.width * 0.12];
    this.root.name = 'Front windshield rain and wipers';
    // In front of the existing glass, offset along its exterior normal.
    this.root.position.set(0, cabin.windshieldBottomY + dz / this.height * 0.014,
      cabin.windshieldBottomZ - dy / this.height * 0.014);
    this.root.rotation.x = Math.atan2(dz, dy);
    this.canvas.width = 512;
    this.canvas.height = 256;
    this.context = this.canvas.getContext('2d');
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.material = new MeshBasicMaterial({
      map: this.texture, transparent: true, depthWrite: false, side: DoubleSide,
      toneMapped: false,
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([
      -this.width / 2, 0, 0, this.width / 2, 0, 0,
      topWidth / 2, this.height, 0, -topWidth / 2, this.height, 0,
    ], 3));
    // Physical x/y coordinates also drive the clearing mask; taper stays exact.
    geometry.setAttribute('uv', new Float32BufferAttribute([
      0, 0, 1, 0, 0.5 + topWidth / this.width / 2, 1, 0.5 - topWidth / this.width / 2, 1,
    ], 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    this.pane = new Mesh(geometry, this.material);
    this.pane.renderOrder = 3;
    this.root.add(this.pane);
    for (const x of this.pivots) {
      const pivot = new Group();
      pivot.position.set(x, 0.018, -0.008);
      const arm = new Mesh(new BoxGeometry(this.reach * 0.67, 0.009, 0.009), this.wiperMaterial);
      arm.position.x = this.reach * 0.335;
      const blade = new Mesh(new BoxGeometry(this.reach * 0.48, 0.018, 0.012), this.wiperMaterial);
      blade.position.x = this.reach * 0.76;
      pivot.add(arm, blade);
      this.wipers.push(pivot);
      this.root.add(pivot);
    }
    // Seed positions once; only small scalar moisture values change per frame.
    for (let i = 0; i < 420; i++) {
      const y = Math.random() * this.height;
      const halfWidth = (this.width + (topWidth - this.width) * y / this.height) / 2;
      this.drops.push({ x: (Math.random() * 2 - 1) * halfWidth, y,
        radius: 1.1 + Math.random() * 2.3, water: 0, rate: 0.4 + Math.random() * 1.2 });
    }
    this.root.traverse(object => object.layers.set(VEHICLE_RENDER_LAYERS.INTERIOR));
    vehicle.root.add(this.root);
  }

  public update(dt: number, weather: Weather, controller: WiperController): void {
    for (const wiper of this.wipers) wiper.rotation.z = controller.angle;
    const rate = weather === 'HEAVY_RAIN' ? 0.24 : weather === 'LIGHT_RAIN' ? 0.065 : -0.12;
    this.totalWater = 0;
    for (const drop of this.drops) {
      drop.water = Math.min(0.65, Math.max(0, drop.water + rate * drop.rate * dt));
      if (controller.sweeping) {
        for (const x of this.pivots) {
          const dx = drop.x - x;
          const dy = drop.y - 0.018;
          const radius = Math.hypot(dx, dy);
          const angle = Math.atan2(dy, dx);
          if (radius >= this.reach * 0.5 && radius <= this.reach * 1.02 &&
            angle >= controller.sweptMin - 0.045 && angle <= controller.sweptMax + 0.045) {
            drop.water *= 0.04;
          }
        }
      }
      this.totalWater += drop.water;
    }
    this.pane.visible = this.totalWater > 0.01;
    this.elapsed += dt;
    if (this.elapsed < 1 / 30 || this.context === null) return;
    this.elapsed = 0;
    const ctx = this.context;
    ctx.clearRect(0, 0, 512, 256);
    for (const drop of this.drops) {
      if (drop.water < 0.01) continue;
      const x = (drop.x / this.width + 0.5) * 512;
      const y = (1 - drop.y / this.height) * 256;
      ctx.globalAlpha = drop.water;
      ctx.fillStyle = '#6a8596';
      ctx.beginPath();
      ctx.ellipse(x, y, drop.radius, drop.radius * 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d0e3ec';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.globalAlpha = drop.water * 0.32;
      ctx.strokeStyle = '#98adb7';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.8, y + drop.radius * 5); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    this.texture.needsUpdate = true;
  }

  public dispose(): void {
    this.root.removeFromParent();
    this.root.traverse(object => { if (object instanceof Mesh) object.geometry.dispose(); });
    this.texture.dispose();
    this.material.dispose();
    this.wiperMaterial.dispose();
  }
}
