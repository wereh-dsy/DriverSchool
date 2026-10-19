import {
  BoxGeometry, BufferGeometry, CanvasTexture, DoubleSide, Float32BufferAttribute,
  Group, Mesh, MeshBasicMaterial, SRGBColorSpace,
} from 'three';
import type { VehicleVisual } from '../vehicle/visual/VehicleVisual';
import { WiperController } from '../vehicle/control/WiperController';
import { VEHICLE_RENDER_LAYERS } from '../vehicle/visual/VehicleRenderLayers';

interface GlassDrop {
  x: number;
  y: number;
  radius: number;
  water: number;
  rate: number;
  threshold: number;
  rank: number;
  age: number;
  life: number;
  slip: number;
  shape: number;
  visibility: number;
}

interface FilmMark {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
  readonly alpha: number;
  readonly speed: number;
}

const MASK_COLS = 96;
const MASK_ROWS = 48;
const SIMULATION_INTERVAL = 1 / 20;
const DROP_CAPACITY = 360;
const FILM_MARKS = 26;

/** Physical front pane only: follows head look, depth-tested against cabin trim.
 * Hidden during mirror rendering by DrivingGame; never drawn over the HUD.
 * A 96x48 numeric wiper mask replaces per-drop physical clearing.
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
  private readonly filmMarks: FilmMark[] = [];
  private readonly mask = new Float32Array(MASK_COLS * MASK_ROWS);
  private readonly width: number;
  private readonly height: number;
  private readonly topWidth: number;
  private readonly reach: number;
  private readonly pivots: readonly number[];
  private elapsed = 0;
  private totalWater = 0;
  private drewLastTime = false;
  private speed = 0;
  private rain = 0;
  private filmPhase = 0;
  private filmClear = 0;
  private pendingSweepMin = Number.POSITIVE_INFINITY;
  private pendingSweepMax = Number.NEGATIVE_INFINITY;

  public constructor(vehicle: Pick<VehicleVisual, 'config' | 'root'>) {
    const { cabin, body } = vehicle.config;
    this.width = cabin.width - 0.05;
    this.topWidth = body.roofWidth - 0.09;
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
      this.topWidth / 2, this.height, 0, -this.topWidth / 2, this.height, 0,
    ], 3));
    // Physical x/y coordinates also drive the clearing mask; taper stays exact.
    geometry.setAttribute('uv', new Float32BufferAttribute([
      0, 0, 1, 0, 0.5 + this.topWidth / this.width / 2, 1, 0.5 - this.topWidth / this.width / 2, 1,
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
    // Seed the bounded pools once; lifecycle updates only reuse these objects.
    for (let i = 0; i < DROP_CAPACITY; i++) {
      const drop: GlassDrop = { x: 0, y: 0, radius: 1, water: 0, rate: 1, threshold: 0,
        rank: 0, age: 0, life: 1, slip: 0, shape: 0, visibility: 0 };
      this.resetDrop(drop);
      this.drops.push(drop);
    }
    for (let i = 0; i < FILM_MARKS; i++) {
      this.filmMarks.push({
        x: Math.random(), y: Math.random(),
        rx: 10 + Math.random() * 28, ry: 4 + Math.random() * 14,
        alpha: .035 + Math.random() * .055, speed: .04 + Math.random() * .18,
      });
    }
    this.root.traverse(object => object.layers.set(VEHICLE_RENDER_LAYERS.INTERIOR));
    vehicle.root.add(this.root);
  }

  /** rainIntensity 0..1; the pane position and wiper geometry stay vehicle-local. */
  public update(dt: number, rainIntensity: number, controller: WiperController, speed = 0): void {
    for (const wiper of this.wipers) wiper.rotation.z = controller.angle;
    this.speed = Math.abs(speed);
    const rain = Number.isFinite(rainIntensity) ? Math.min(1, Math.max(0, rainIntensity)) : 0;
    this.rain = rain;
    // Once clear and fully dry, the pane costs only the wiper mesh assignment.
    if (rain <= .001 && this.totalWater <= .001 && !controller.sweeping &&
      this.pendingSweepMax <= this.pendingSweepMin) { this.elapsed = 0; return; }
    // Accumulate the whole stroke segment between low-frequency mask updates.
    if (controller.sweeping) {
      this.pendingSweepMin = Math.min(this.pendingSweepMin, controller.sweptMin);
      this.pendingSweepMax = Math.max(this.pendingSweepMax, controller.sweptMax);
    }
    this.elapsed += Math.max(0, dt);
    if (this.elapsed < SIMULATION_INTERVAL) return;
    const step = Math.min(.1, this.elapsed);
    this.elapsed = 0;
    this.decayMask(step);
    if (this.pendingSweepMax > this.pendingSweepMin) {
      this.markSweptMask(this.pendingSweepMin, this.pendingSweepMax);
      this.pendingSweepMin = Number.POSITIVE_INFINITY;
      this.pendingSweepMax = Number.NEGATIVE_INFINITY;
    }
    if (controller.sweeping) this.filmClear = 1;
    else this.filmClear = Math.max(0, this.filmClear - step * .8);
    this.simulateDrops(step, rain);
    const hasWater = this.totalWater > .01 || this.rain > .02;
    this.pane.visible = hasWater;
    if ((hasWater || this.drewLastTime) && this.context !== null) this.draw(this.context);
    this.drewLastTime = hasWater;
  }

  public dispose(): void {
    this.root.removeFromParent();
    this.root.traverse(object => { if (object instanceof Mesh) object.geometry.dispose(); });
    this.texture.dispose();
    this.material.dispose();
    this.wiperMaterial.dispose();
  }

  private simulateDrops(step: number, rain: number): void {
    const activeLimit = 70 + rain * 90;
    const rankLimit = activeLimit / DROP_CAPACITY;
    const air = Math.min(1, this.speed / 35);
    const rate = rain > .04 ? rain * .42 : -.12;
    const lift = air * .024;
    const gravity = (1 - air) * .012;
    this.totalWater = 0;
    for (const drop of this.drops) {
      drop.age += step;
      if (drop.age >= drop.life || drop.y < 0 || drop.y > this.height) this.resetDrop(drop);
      const phase = drop.age / drop.life;
      const active = rain + .05 >= drop.threshold;
      const prominent = drop.rank <= rankLimit;
      const targetVisibility = active ? (prominent ? 1 : .10) : .03;
      drop.visibility += (targetVisibility - drop.visibility) * Math.min(1, step * 4);
      // Cheap lifecycle: grow, linger, then fade. Wiping clears water only;
      // the drop refills at mature rate so the glass rewets gradually.
      if (phase < .18) drop.water += rate * drop.rate * step * 1.5;
      else if (phase < .78) drop.water += rate * drop.rate * step * .12;
      else drop.water -= step * .34;
      drop.water = Math.min(.55, Math.max(0, drop.water));
      if (phase > .18) {
        drop.y += (lift - gravity) * (.35 + drop.water) * step;
        drop.x += air * drop.slip * step * .35;
        const half = this.halfWidth(drop.y);
        if (Math.abs(drop.x) > half) drop.x = Math.sign(drop.x || 1) * half * .98;
      }
      const cleared = this.maskAt(drop.x, drop.y);
      if (cleared > 0) drop.water *= Math.max(0, 1 - cleared * Math.min(1, step * 14));
      this.totalWater += drop.water * drop.visibility;
    }
    this.filmPhase += (.25 + air * .9) * step;
  }

  private draw(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, 512, 256);
    const rain = this.rain;
    // Very light water film: a few large translucent marks rather than a
    // fullscreen noise pass. Wipers temporarily reduce it, then it returns.
    if (rain > .001) {
      const filmAlpha = (.022 + rain * .045) * (1 - this.filmClear * .62);
      ctx.fillStyle = '#9db7c7';
      ctx.globalAlpha = filmAlpha;
      for (const mark of this.filmMarks) {
        const y = ((mark.y + this.filmPhase * mark.speed) % 1.15 - .075) * 256;
        ctx.beginPath();
        ctx.ellipse(mark.x * 512, y, mark.rx, mark.ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const tailBase = 4 + Math.min(16, this.speed * .38);
    const drift = Math.min(8, this.speed * .1);
    for (const drop of this.drops) {
      const alpha = Math.min(.52, drop.water * drop.visibility * (1 - this.maskAt(drop.x, drop.y)));
      if (alpha < .012) continue;
      const x = (drop.x / this.width + .5) * 512;
      const y = (1 - drop.y / this.height) * 256;
      const phase = drop.age / drop.life;
      const streak = Math.min(1, Math.max(0, (phase - .18) / .55));
      ctx.globalAlpha = alpha;
      if (drop.shape < .50) {
        // Micro droplet: most of the population.
        ctx.fillStyle = '#8fa9b9';
        ctx.beginPath();
        ctx.ellipse(x, y, Math.max(.45, drop.radius * .58), Math.max(.5, drop.radius * .78), 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (drop.shape < .78) {
        // Soft irregular oval with a faint rim.
        ctx.fillStyle = '#829dad';
        ctx.beginPath();
        ctx.ellipse(x, y, drop.radius * .92, drop.radius * 1.34, drop.slip * .35, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = alpha * .32;
        ctx.strokeStyle = '#b3c8d4';
        ctx.lineWidth = .55;
        ctx.stroke();
      } else if (drop.shape < .92) {
        // Short sliding streak, never a large circular bead.
        ctx.strokeStyle = '#9db6c5';
        ctx.lineWidth = Math.max(.55, drop.radius * .5);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + drift * drop.slip, y + (this.speed > 8 ? 1 : -1) * (tailBase * .55 + streak * 8));
        ctx.stroke();
      } else {
        // Rare larger event: two overlapping small lobes, not a perfect circle.
        ctx.fillStyle = '#7e99ab';
        ctx.beginPath();
        ctx.ellipse(x - drop.radius * .18, y, drop.radius * .62, drop.radius * .86, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + drop.radius * .26, y + drop.radius * .22, drop.radius * .44, drop.radius * .58, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (streak > .08 && alpha > .035) {
        ctx.globalAlpha = alpha * .26 * (1 - streak * .35);
        ctx.strokeStyle = '#a5bdcb';
        ctx.lineWidth = .6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + drift * drop.slip, y + (this.speed > 8 ? 1 : -1) * (tailBase + streak * 10));
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    this.texture.needsUpdate = true;
  }

  private resetDrop(drop: GlassDrop): void {
    drop.y = Math.random() * this.height;
    const half = this.halfWidth(drop.y);
    drop.x = (Math.random() * 2 - 1) * half;
    drop.radius = .55 + Math.pow(Math.random(), 2.2) * 2.6;
    drop.water = 0;
    drop.rate = .6 + Math.random() * 1.1;
    drop.threshold = Math.random() * .95;
    drop.rank = Math.random();
    drop.age = 0;
    drop.life = 2.8 + Math.random() * 5.2;
    drop.slip = Math.random() * 2 - 1;
    drop.shape = Math.random();
    drop.visibility = .03;
  }

  private halfWidth(y: number): number {
    const fraction = Math.min(1, Math.max(0, y / this.height));
    return (this.width + (this.topWidth - this.width) * fraction) / 2;
  }

  private decayMask(step: number): void {
    const decay = Math.min(1, step * .55);
    for (let i = 0; i < this.mask.length; i++) {
      const value = this.mask[i]!;
      if (value > 0) this.mask[i] = Math.max(0, value - decay);
    }
  }

  /** Marks only the current sweep sector; decay lets droplets return afterwards. */
  private markSweptMask(sweptMin: number, sweptMax: number): void {
    const min = Math.min(sweptMin, sweptMax) - .045;
    const max = Math.max(sweptMin, sweptMax) + .045;
    for (let row = 0; row < MASK_ROWS; row++) {
      const y = (row + .5) / MASK_ROWS * this.height;
      for (let col = 0; col < MASK_COLS; col++) {
        const x = (col + .5) / MASK_COLS * this.width - this.width * .5;
        for (const pivot of this.pivots) {
          const dx = x - pivot, dy = y - .018;
          const radius = Math.hypot(dx, dy);
          if (radius < this.reach * .32 || radius > this.reach * 1.04) continue;
          const angle = Math.atan2(dy, dx);
          if (angle < min || angle > max) continue;
          this.mask[row * MASK_COLS + col] = 1;
          break;
        }
      }
    }
  }

  private maskAt(x: number, y: number): number {
    const col = Math.min(MASK_COLS - 1, Math.max(0, Math.floor((x / this.width + .5) * MASK_COLS)));
    const row = Math.min(MASK_ROWS - 1, Math.max(0, Math.floor(y / this.height * MASK_ROWS)));
    return this.mask[row * MASK_COLS + col]!;
  }
}
