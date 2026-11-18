import * as THREE from 'three';
import type { DrivingGround } from '../DrivingGround';
import { SURFACE_MATERIALS, surfaceResponseAliases, type RoadSurfaceSample, type SurfaceType } from '../SurfaceMaterial';
import { surfaceProfile } from '../SurfaceProfile';

interface Zone {
  readonly name: string;
  readonly minX: number; readonly maxX: number;
  readonly minZ: number; readonly maxZ: number;
  readonly sample: RoadSurfaceSample;
  /** Circle or capsule, otherwise a rectangle. */
  readonly radius?: number;
  readonly ax?: number; readonly az?: number;
  readonly bx?: number; readonly bz?: number;
}

const COLORS: Partial<Record<SurfaceType, number>> = {
  asphalt: 0x41464c, 'wet-asphalt': 0x263844, 'packed-snow': 0xc8d5db,
  'fresh-snow': 0xf1f4f5, ice: 0x8bc7dc, gravel: 0x90877b,
  sand: 0xd6b578, mud: 0x67452f, grass: 0x66884a,
};
const CELL = 16;
const cacheSample = (type: SurfaceType, depth?: number): RoadSurfaceSample => Object.freeze({
  ...surfaceResponseAliases(SURFACE_MATERIALS[type]), profile: surfaceProfile(SURFACE_MATERIALS[type]),
  depth: depth ?? surfaceProfile(SURFACE_MATERIALS[type]).defaultDepth,
  height: 0, normal: new THREE.Vector3(0, 1, 0), gradient: new THREE.Vector2(), grade: 0,
});

/** Small, flat authored test facility. The build-time cell index retains only
 * nearby zones; a query returns a cached immutable sample without allocation. */
export class MixedSurfaceGround implements DrivingGround {
  public readonly root = new THREE.Group();
  public readonly metadata = { id: 'mixed-surface-proving-ground', version: 1,
    displayName: 'Mixed Surface Proving Ground · 混合路面试验场',
    description: '600 × 460 米独立试验场：九类路面、并排比较道、三档松软深度、冰面圆盘、雪地短环线与分离附着制动道。' };
  public readonly worldBounds = { minX: -230, maxX: 230, minZ: -300, maxZ: 300 };
  public readonly spawnPose = { position: new THREE.Vector3(-200, .04, 195), yawRadians: 0 };
  public readonly colliders = [];
  private readonly zones: Zone[] = [];
  private readonly columns = Math.ceil(460 / CELL);
  private readonly rows = Math.ceil(600 / CELL);
  private readonly cells: Zone[][] = Array.from({ length: this.columns * this.rows }, () => []);
  private readonly grass = cacheSample('grass');
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly textures: THREE.Texture[] = [];

  public constructor() {
    this.root.name = 'Mixed Surface Proving Ground';
    this.plane(0, 0, 460, 600, 'grass', 0, -.006);
    this.rect('Main dry straight · 360 m', -212, -188, -150, 210, 'asphalt');
    this.rect('Common entry apron', -218, 215, 180, 215, 'asphalt');
    this.rect('Return / ice access', -218, 205, -135, -100, 'asphalt');
    const strips = [
      ['DRY ASPHALT', -150, 'asphalt'], ['WET ASPHALT', -112, 'wet-asphalt'],
      ['PACKED SNOW', -74, 'packed-snow'], ['GRAVEL', -36, 'gravel'],
      ['SAND', 2, 'sand'], ['MUD', 40, 'mud'], ['FRESH SNOW', 78, 'fresh-snow'],
    ] as const;
    for (const [name, x, type] of strips) {
      if (type === 'sand' || type === 'mud' || type === 'fresh-snow') {
        const depths = type === 'fresh-snow' ? [.04, .12, .25] : type === 'sand' ? [.03, .10, .22] : [.025, .08, .18];
        for (let i = 0; i < 3; i++) {
          const high = 180 - i * 90, low = high - 90;
          this.rect(`${name} ${['shallow', 'medium', 'deep'][i]}`, x - 12, x + 12, low, high, type, depths[i]);
          this.label(`${['SHALLOW', 'MEDIUM', 'DEEP'][i]} ${depths[i]! * 100} cm`, x + 12.6, high - 7, 1.4, 9);
        }
      } else this.rect(name, x - 12, x + 12, -90, 180, type);
      this.rect(`${name} exit`, x - 12, x + 12, -100, -90, 'asphalt');
      this.label(name, x, 182, 3.4, 22);
      this.line(x - 12.4, 180, x - 12.4, -90, 0xf1df8a);
      this.line(x + 12.4, 180, x + 12.4, -90, 0xf1df8a);
    }
    this.rect('Ice access lane', 143, 167, -170, -130, 'asphalt');
    this.circle('Ice skid pad · 84 m', 155, -215, 42, 'ice');
    this.label('ICE SKID PAD · 84 m', 155, -170, 3.4, 31);
    this.rect('Grass braking / stability', 104, 209, 230, 280, 'grass');
    this.label('GRASS / TRACK OFF', 155, 281, 3.4, 36);
    this.rect('Split mu dry LEFT', -212, -200, -280, -150, 'asphalt');
    this.rect('Split mu ice RIGHT', -200, -188, -280, -150, 'ice');
    this.label('SPLIT µ · LEFT DRY / RIGHT ICE · 130 m', -200, -147, 3.8, 47);
    this.line(-200, -150, -200, -280, 0xffd75e);
    this.label('MAIN DRY · 360 m / SPLIT µ AHEAD', -200, 217, 3.8, 45);
    this.snowLoop();
    this.indexZones();
  }

  public sampleRoadSurface(x: number, z: number): RoadSurfaceSample {
    const col = Math.floor((x - this.worldBounds.minX) / CELL);
    const row = Math.floor((z - this.worldBounds.minZ) / CELL);
    if (col < 0 || col >= this.columns || row < 0 || row >= this.rows) return this.grass;
    const zones = this.cells[row * this.columns + col]!;
    // Last authored zone owns overlaps (identical ownership in the visual mesh).
    for (let i = zones.length - 1; i >= 0; i--) {
      const zone = zones[i]!;
      if (x < zone.minX || x > zone.maxX || z < zone.minZ || z > zone.maxZ) continue;
      if (zone.radius !== undefined) {
        const dx = zone.bx! - zone.ax!, dz = zone.bz! - zone.az!;
        const length2 = dx * dx + dz * dz;
        const t = length2 > 0 ? THREE.MathUtils.clamp(((x - zone.ax!) * dx + (z - zone.az!) * dz) / length2, 0, 1) : 0;
        if ((x - zone.ax! - t * dx) ** 2 + (z - zone.az! - t * dz) ** 2 > zone.radius ** 2) continue;
      }
      return zone.sample;
    }
    return this.grass;
  }
  public getRoadHeightAt(_x: number, _z: number): number { return 0; }
  public getRoadPitchAt(_x: number, _z: number, _yaw: number): number { return 0; }
  public get queryDiagnostics(): { zones: number; maximumCellCandidates: number } {
    return { zones: this.zones.length, maximumCellCandidates: Math.max(...this.cells.map(c => c.length)) };
  }
  public dispose(): void {
    this.root.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Line) object.geometry.dispose(); });
    for (const material of this.materials.values()) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.root.clear();
  }

  private indexZones(): void {
    for (const zone of this.zones) {
      const c0 = Math.max(0, Math.floor((zone.minX + 230) / CELL));
      const c1 = Math.min(this.columns - 1, Math.floor((zone.maxX + 230) / CELL));
      const r0 = Math.max(0, Math.floor((zone.minZ + 300) / CELL));
      const r1 = Math.min(this.rows - 1, Math.floor((zone.maxZ + 300) / CELL));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.cells[r * this.columns + c]!.push(zone);
    }
  }
  private material(type: SurfaceType, depth = 0): THREE.MeshStandardMaterial {
    const key = `${type}:${depth}`;
    let material = this.materials.get(key);
    if (!material) {
      const color = new THREE.Color(COLORS[type] ?? 0x777777).multiplyScalar(1 - Math.min(.22, depth * .7));
      material = new THREE.MeshStandardMaterial({ color, roughness: type === 'ice' ? .20 : type === 'wet-asphalt' ? .28 : .95,
        metalness: 0 });
      material.userData.wetRoad = type === 'asphalt';
      this.materials.set(key, material);
    }
    return material;
  }
  private plane(x: number, z: number, width: number, length: number, type: SurfaceType, depth = 0, y = .005): void {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), this.material(type, depth));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, y, z); mesh.receiveShadow = true;
    this.root.add(mesh);
  }
  private rect(name: string, minX: number, maxX: number, minZ: number, maxZ: number, type: SurfaceType, depth?: number): void {
    this.zones.push({ name, minX, maxX, minZ, maxZ, sample: cacheSample(type, depth) });
    this.plane((minX + maxX) / 2, (minZ + maxZ) / 2, maxX - minX, maxZ - minZ, type, depth, .005 + this.zones.length * .00002);
  }
  private circle(name: string, x: number, z: number, radius: number, type: SurfaceType): void {
    this.zones.push({ name, minX: x - radius, maxX: x + radius, minZ: z - radius, maxZ: z + radius,
      sample: cacheSample(type), radius, ax: x, az: z, bx: x, bz: z });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 96), this.material(type));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, .014, z); mesh.receiveShadow = true; this.root.add(mesh);
  }
  private snowLoop(): void {
    // Handcrafted broad bend, short straight and tighter southern return.
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(122, 0, 159), new THREE.Vector3(177, 0, 159), new THREE.Vector3(195, 0, 129),
      new THREE.Vector3(166, 0, 95), new THREE.Vector3(121, 0, 37), new THREE.Vector3(127, 0, 1),
      new THREE.Vector3(155, 0, -6), new THREE.Vector3(176, 0, 28), new THREE.Vector3(157, 0, 76),
      new THREE.Vector3(112, 0, 128),
    ], true, 'centripetal');
    const points = path.getPoints(96), sample = cacheSample('packed-snow');
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!, b = points[i + 1]!, radius = 7;
      this.zones.push({ name: 'Snow handling loop', minX: Math.min(a.x, b.x) - radius, maxX: Math.max(a.x, b.x) + radius,
        minZ: Math.min(a.z, b.z) - radius, maxZ: Math.max(a.z, b.z) + radius, radius,
        ax: a.x, az: a.z, bx: b.x, bz: b.z, sample });
      const length = a.distanceTo(b);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, length + .08), this.material('packed-snow'));
      mesh.rotation.set(-Math.PI / 2, 0, Math.atan2(b.x - a.x, b.z - a.z));
      mesh.position.set((a.x + b.x) / 2, .017, (a.z + b.z) / 2); mesh.receiveShadow = true; this.root.add(mesh);
      const joint = new THREE.Mesh(new THREE.CircleGeometry(radius, 20), this.material('packed-snow'));
      joint.rotation.x = -Math.PI / 2; joint.position.set(a.x, .0171, a.z); this.root.add(joint);
    }
    this.rect('Snow loop entry', 114, 130, 158, 185, 'packed-snow');
    this.label('SNOW HANDLING LOOP', 150, 179, 3.5, 40);
  }
  private line(ax: number, az: number, bx: number, bz: number, color: number): void {
    const material = new THREE.MeshStandardMaterial({ color });
    material.userData.roadMarking = true;
    this.materials.set(`line-${this.materials.size}`, material);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.12, Math.hypot(bx - ax, bz - az)), material);
    mesh.rotation.set(-Math.PI / 2, 0, Math.atan2(bx - ax, bz - az));
    mesh.position.set((ax + bx) / 2, .023, (az + bz) / 2); this.root.add(mesh);
  }
  private label(text: string, x: number, z: number, y: number, width: number): void {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 96;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#16222b'; ctx.fillRect(0, 0, 1024, 96);
    ctx.fillStyle = '#f8f0c9'; ctx.font = 'bold 37px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 48, 990);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; this.textures.push(texture);
    const material = new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide, emissive: 0x333333 });
    this.materials.set(`sign-${this.materials.size}`, material);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 96 / 1024), material);
    mesh.position.set(x, y, z); this.root.add(mesh);
  }
}
