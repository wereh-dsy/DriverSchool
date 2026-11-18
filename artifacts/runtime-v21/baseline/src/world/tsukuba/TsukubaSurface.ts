import { MathUtils } from 'three';
import { SURFACE_MATERIALS, type SurfaceMaterial } from '../SurfaceMaterial';
import { bandEnvelope, type TsukubaLayout, type TsukubaRouteSample } from './TsukubaLayout';
import { TsukubaHeightProfile, type HeightStation } from './TsukubaElevation';

interface Segment { readonly a: TsukubaRouteSample; readonly b: TsukubaRouteSample; readonly pit: boolean }
interface Projection { distance: number; lateral: number; width: number; squared: number }
const CELL = 32;

/** Static broad phase: wheel queries only inspect segments in their own cell.
 * One set of authored widths/bands drives both contact response and rendering.
 */
export class TsukubaSurface {
  private readonly cells = new Map<string, Segment[]>();
  private readonly homeYaw: number;
  private readonly pitProfile: TsukubaHeightProfile;
  private readonly pitStraightStart: number;
  private readonly pitStraightEnd: number;
  private readonly terrain: Float64Array;
  private readonly terrainColumns: number;
  private readonly terrainRows: number;
  private readonly terrainStepX: number;
  private readonly terrainStepZ: number;
  private queryX = NaN;
  private queryZ = NaN;
  private readonly road: Projection = { distance: 0, lateral: 0, width: 0, squared: Infinity };
  private readonly pit: Projection = { distance: 0, lateral: 0, width: 0, squared: Infinity };
  public constructor(private readonly layout: TsukubaLayout) {
    this.homeYaw = layout.poseAt(0).yawRadians;
    for (const [samples, pit] of [[layout.samples, false], [layout.pitSamples, true]] as const) {
      for (let i = 1; i < samples.length; i++) {
        const segment = { a: samples[i - 1]!, b: samples[i]!, pit };
        const pad = 35;
        for (let x = Math.floor((Math.min(segment.a.x, segment.b.x) - pad) / CELL);
          x <= Math.floor((Math.max(segment.a.x, segment.b.x) + pad) / CELL); x++) {
          for (let z = Math.floor((Math.min(segment.a.z, segment.b.z) - pad) / CELL);
            z <= Math.floor((Math.max(segment.a.z, segment.b.z) + pad) / CELL); z++) {
            const key = `${x},${z}`;
            let cell = this.cells.get(key);
            if (!cell) { cell = []; this.cells.set(key, cell); }
            cell.push(segment);
          }
        }
      }
    }
    let distance = 0;
    const stations: HeightStation[] = [{ distance: 0, height: this.mainHeightNear(layout.pitSamples[0]!) }];
    for (const curve of layout.pitCurve.curves) {
      distance += curve.getLength();
      stations.push({ distance, height: this.mainHeightNear(curve.getPoint(1)) });
    }
    this.pitProfile = new TsukubaHeightProfile(stations);
    this.pitStraightStart = stations[2]!.distance;
    this.pitStraightEnd = stations[3]!.distance;
    // Bake broad earthworks once. A finite-radius fade to flat ground would
    // create an artificial steep rim outside the elevated T1 runoff.
    const b = layout.bounds;
    this.terrainColumns = Math.ceil((b.maxX - b.minX) / 4);
    this.terrainRows = Math.ceil((b.maxZ - b.minZ) / 4);
    this.terrainStepX = (b.maxX - b.minX) / this.terrainColumns;
    this.terrainStepZ = (b.maxZ - b.minZ) / this.terrainRows;
    this.terrain = new Float64Array((this.terrainColumns + 1) * (this.terrainRows + 1));
    const supports = layout.samples.filter((_, i) => i % 10 === 0)
      .map(p => ({ x: p.x, z: p.z, y: layout.elevation.heightAt(p.distance) }));
    for (const p of layout.pitSamples.filter((_, i) => i % 8 === 0)) {
      supports.push({ x: p.x, z: p.z, y: this.pitHeightAt(p.distance, p.x, p.z) });
    }
    for (let row = 0; row <= this.terrainRows; row++) for (let col = 0; col <= this.terrainColumns; col++) {
      const x = b.minX + col * this.terrainStepX, z = b.minZ + row * this.terrainStepZ;
      let sum = 0, weights = 0;
      for (const p of supports) {
        const weight = 1 / ((x - p.x) ** 2 + (z - p.z) ** 2 + 144) ** 2;
        sum += weight * p.y; weights += weight;
      }
      this.terrain[row * (this.terrainColumns + 1) + col] = sum / weights;
    }
  }
  public pavementClearanceAt(x: number, z: number): number {
    this.query(x, z);
    return Math.min(Math.sqrt(this.road.squared) - this.road.width * 0.5,
      Math.sqrt(this.pit.squared) - this.layout.pitWidth * 0.5);
  }
  public heightAt(x: number, z: number): number {
    this.query(x, z);
    const base = this.baseFromQuery(x, z);
    if (this.onPit() || this.onApron(x, z)) return base;
    const p = this.road, beyond = Math.sqrt(p.squared) - p.width * 0.5;
    if (beyond < 0 || beyond > 1.2 || !Number.isFinite(p.squared)) return base;
    for (const band of this.layout.kerbs) {
      if (Math.sign(p.lateral) !== band.side || p.distance < band.start || p.distance > band.end) continue;
      const width = band.width * bandEnvelope(band, p.distance);
      if (width < 0.001 || beyond > width) continue;
      // Triangular cross section and long, shallow ribs: actual suspension input.
      const cross = 1 - Math.abs(beyond / width * 2 - 1);
      return base + cross * (0.052 + 0.012 * Math.sin(p.distance * Math.PI * 2 / 3.5));
    }
    return base;
  }
  /** Continuous road beds, pit approaches and earthworks, excluding kerb ribs. */
  public baseHeightAt(x: number, z: number): number {
    this.query(x, z); return this.baseFromQuery(x, z);
  }
  public materialAt(x: number, z: number): SurfaceMaterial {
    this.query(x, z);
    const p = this.road, beyond = Math.sqrt(p.squared) - p.width * 0.5;
    if (this.onPit() || this.onApron(x, z) || (Number.isFinite(p.squared) && beyond <= 0)) return SURFACE_MATERIALS.asphalt;
    for (const band of this.layout.kerbs) {
      if (Math.sign(p.lateral) === band.side && p.distance >= band.start && p.distance <= band.end
        && beyond <= band.width * bandEnvelope(band, p.distance)) return SURFACE_MATERIALS.curb;
    }
    for (const band of this.layout.runoffs) {
      if (Math.sign(p.lateral) === band.side && p.distance >= band.start && p.distance <= band.end
        && beyond >= 2 && beyond <= 2 + band.width * bandEnvelope(band, p.distance)) return SURFACE_MATERIALS['loose-gravel'];
    }
    return SURFACE_MATERIALS.grass;
  }
  public dispose(): void { this.cells.clear(); }
  private onPit(): boolean { return this.pit.squared <= (this.layout.pitWidth * 0.5) ** 2; }
  private onApron(x: number, z: number): boolean {
    return this.apronDistance(x, z) === 0;
  }
  private apronDistance(x: number, z: number): number {
    const yaw = this.homeYaw;
    const along = -Math.sin(yaw) * x - Math.cos(yaw) * z;
    const lateral = Math.cos(yaw) * x - Math.sin(yaw) * z;
    return Math.hypot(Math.max(-17.775 - along, 0, along - 81.275), Math.max(19.5 - lateral, 0, lateral - 30.5));
  }
  private pitHeightAt(distance: number, x: number, z: number): number {
    const apron = this.layout.elevation.heightAt(-Math.sin(this.homeYaw) * x - Math.cos(this.homeYaw) * z);
    const blend = MathUtils.smoothstep(distance, this.pitStraightStart, this.pitStraightStart + 15)
      * (1 - MathUtils.smoothstep(distance, this.pitStraightEnd - 15, this.pitStraightEnd));
    return MathUtils.lerp(this.pitProfile.at(distance), apron, blend);
  }
  private baseFromQuery(x: number, z: number): number {
    const road = this.road, pit = this.pit, profile = this.layout.elevation;
    let height = this.backgroundAt(x, z);
    const mainBlend = 1 - MathUtils.smoothstep(Math.sqrt(road.squared) - road.width / 2, 0, 3);
    const pitBlend = 1 - MathUtils.smoothstep(Math.sqrt(pit.squared) - this.layout.pitWidth / 2, 0, 3);
    if (mainBlend > 0) height = MathUtils.lerp(height, profile.roadHeightAt(road.distance, road.lateral), mainBlend);
    if (pitBlend > 0) height = MathUtils.lerp(height, this.pitHeightAt(pit.distance, x, z), pitBlend * (1 - mainBlend));
    const apronBlend = 1 - MathUtils.smoothstep(this.apronDistance(x, z), 0, 3);
    if (apronBlend > 0) {
      const along = -Math.sin(this.homeYaw) * x - Math.cos(this.homeYaw) * z;
      height = MathUtils.lerp(height, profile.heightAt(along), apronBlend * (1 - mainBlend));
    }
    return height;
  }
  private backgroundAt(x: number, z: number): number {
    const u = MathUtils.clamp((x - this.layout.bounds.minX) / this.terrainStepX, 0, this.terrainColumns);
    const v = MathUtils.clamp((z - this.layout.bounds.minZ) / this.terrainStepZ, 0, this.terrainRows);
    const col = Math.min(this.terrainColumns - 1, Math.floor(u)), row = Math.min(this.terrainRows - 1, Math.floor(v));
    const tx = u - col, tz = v - row, stride = this.terrainColumns + 1, i = row * stride + col;
    return MathUtils.lerp(MathUtils.lerp(this.terrain[i]!, this.terrain[i + 1]!, tx),
      MathUtils.lerp(this.terrain[i + stride]!, this.terrain[i + stride + 1]!, tx), tz);
  }
  private mainHeightNear(point: { x: number; z: number }): number {
    let best = Infinity, height = 0;
    const samples = this.layout.samples;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]!, b = samples[i]!, dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
      const t = MathUtils.clamp(((point.x - a.x) * dx + (point.z - a.z) * dz) / l2, 0, 1);
      const ox = point.x - a.x - dx * t, oz = point.z - a.z - dz * t, squared = ox * ox + oz * oz;
      if (squared >= best) continue;
      best = squared;
      const d = MathUtils.lerp(a.distance, b.distance, t), lateral = (-ox * dz + oz * dx) / Math.sqrt(l2);
      height = this.layout.elevation.roadHeightAt(d, MathUtils.clamp(lateral, -a.width / 2, a.width / 2));
    }
    return height;
  }
  private query(x: number, z: number): void {
    if (x === this.queryX && z === this.queryZ) return;
    this.queryX = x; this.queryZ = z;
    this.road.squared = Infinity; this.road.lateral = Infinity;
    this.pit.squared = Infinity;
    const segments = this.cells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
    if (!segments) return;
    for (const s of segments) {
      const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, l2 = dx * dx + dz * dz;
      const t = MathUtils.clamp(((x - s.a.x) * dx + (z - s.a.z) * dz) / (l2 || 1), 0, 1);
      const ox = x - s.a.x - dx * t, oz = z - s.a.z - dz * t, squared = ox * ox + oz * oz;
      const distance = MathUtils.lerp(s.a.distance, s.b.distance, t);
      const lateral = (-ox * dz + oz * dx) / Math.sqrt(l2 || 1);
      const result = s.pit ? this.pit : this.road;
      if (squared >= result.squared) continue;
      result.squared = squared;
      result.distance = distance;
      result.width = s.pit ? this.layout.pitWidth : this.layout.widthAt(result.distance);
      result.lateral = lateral;
    }
  }
}
