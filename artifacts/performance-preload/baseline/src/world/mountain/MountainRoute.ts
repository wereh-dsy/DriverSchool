import * as THREE from 'three';
import type { SurfaceType } from '../SurfaceMaterial';

export const smooth = (v: number): number => {
  const t = THREE.MathUtils.clamp(v, 0, 1);
  return t * t * (3 - 2 * t);
};
export const windowAt = (s: number, start: number, end: number, fade: number): number =>
  smooth((s - start) / fade) * smooth((end - s) / fade);

export interface MountainSection {
  readonly id: string;
  readonly start: number;
  readonly end: number;
}
export interface RoutePoint {
  x: number; z: number; s: number; tx: number; tz: number;
}
export interface RouteHit extends RoutePoint {
  lateral: number; distance: number; route: MountainPath;
}
interface HeightKey { s: number; y: number; grade: number }

class MountainArc extends THREE.Curve<THREE.Vector3> {
  constructor(private cx: number, private cz: number, private radius: number,
    private start: number, private turn: number) { super(); }
  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const a = this.start + this.turn * t;
    return target.set(this.cx + Math.cos(a) * this.radius, 0, this.cz + Math.sin(a) * this.radius);
  }
  override getTangent(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const a = this.start + this.turn * t;
    return target.set(-Math.sin(a) * Math.sign(this.turn), 0, Math.cos(a) * Math.sign(this.turn));
  }
  override getLength(): number { return this.radius * Math.abs(this.turn); }
}

/** Authored road curves, not a general map builder. Distances are horizontal metres. */
export class MountainPath {
  readonly samples: RoutePoint[];
  readonly length: number;
  readonly bins = new Map<string, number[]>();
  readonly heightKeys: HeightKey[] = [];
  readonly binSize = 32;
  constructor(readonly id: string, readonly curve: THREE.CurvePath<THREE.Vector3>,
    readonly sections: MountainSection[], readonly main?: MountainPath,
    readonly connection?: readonly [number, number]) {
    this.length = curve.getLength();
    const count = Math.ceil(this.length / 0.75);
    this.samples = [];
    for (let i = 0; i <= count; i++) {
      const p = curve.getPoint(i / count);
      const t = curve.getTangent(i / count).normalize();
      this.samples.push({ x: p.x, z: p.z, tx: t.x, tz: t.z, s: this.length * i / count });
    }
    if (id === 'main') this.samples[count] = { ...this.samples[0]!, s: this.length };
    for (let i = 0; i < count; i++) {
      const a = this.samples[i]!, b = this.samples[i + 1]!;
      // Includes earth shoulders and a half-cell diagonal for terrain refinement queries.
      for (let bx = Math.floor((Math.min(a.x, b.x) - 48) / 32); bx <= Math.floor((Math.max(a.x, b.x) + 48) / 32); bx++) {
        for (let bz = Math.floor((Math.min(a.z, b.z) - 48) / 32); bz <= Math.floor((Math.max(a.z, b.z) + 48) / 32); bz++) {
          const key = `${bx},${bz}`;
          const entries = this.bins.get(key);
          if (entries) entries.push(i); else this.bins.set(key, [i]);
        }
      }
    }
  }
  section(id: string): MountainSection {
    const result = this.sections.find(s => s.id === id);
    if (!result) throw new Error(`Missing mountain section: ${id}`);
    return result;
  }
  point(s: number): RoutePoint {
    const distance = THREE.MathUtils.clamp(s, 0, this.length);
    const u = distance / this.length * (this.samples.length - 1);
    const i = Math.min(this.samples.length - 2, Math.floor(u)), t = u - i;
    const a = this.samples[i]!, b = this.samples[i + 1]!;
    const tx = THREE.MathUtils.lerp(a.tx, b.tx, t), tz = THREE.MathUtils.lerp(a.tz, b.tz, t);
    const norm = Math.hypot(tx, tz);
    return { x: THREE.MathUtils.lerp(a.x, b.x, t), z: THREE.MathUtils.lerp(a.z, b.z, t),
      tx: tx / norm, tz: tz / norm, s: distance };
  }
  nearest(x: number, z: number): RouteHit | undefined {
    const entries = this.bins.get(`${Math.floor(x / 32)},${Math.floor(z / 32)}`);
    if (!entries) return undefined;
    let best = Infinity, selected = -1, selectedT = 0;
    for (const i of entries) {
      const a = this.samples[i]!, b = this.samples[i + 1]!;
      const dx = b.x - a.x, dz = b.z - a.z;
      const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
      const d = (x - a.x - t * dx) ** 2 + (z - a.z - t * dz) ** 2;
      if (d < best) { best = d; selected = i; selectedT = t; }
    }
    if (selected < 0) return undefined;
    const a = this.samples[selected]!, b = this.samples[selected + 1]!;
    const p = this.point(THREE.MathUtils.lerp(a.s, b.s, selectedT));
    return { ...p, lateral: -(x - p.x) * p.tz + (z - p.z) * p.tx,
      distance: Math.sqrt(best), route: this };
  }
  height(s: number): number {
    if ((this.id === 'side-slope' || this.id === 'deep-ruts') && this.main) {
      const p = this.point(s), hit = this.main.nearest(p.x, p.z)!;
      return this.main.height(hit.s) + this.main.bank(hit.s) * hit.lateral;
    }
    if (this.id === 'steep-climb' && this.main) {
      const toe = 40, top = this.length - 40;
      if (s <= toe || s >= top) {
        const p = this.point(s), hit = this.main.nearest(p.x, p.z)!;
        return this.main.height(hit.s);
      }
      const a = this.heightKeys[1]!, b = this.heightKeys[2]!;
      const length = top - toe, d = s - toe;
      const knots = [0, 12, length * 0.32, length * 0.43, length * 0.57, length * 0.68, length - 12, length];
      const fixed = [a.grade, 0, 0, 0.105, 0.105, 0, 0, b.grade];
      const scaled = [0, 1, 1, 0, 0, 1, 1, 0];
      let knownRise = 0, scaleRise = 0;
      for (let i = 1; i < knots.length; i++) {
        const run = knots[i]! - knots[i - 1]!;
        knownRise += run * (fixed[i]! + fixed[i - 1]!) / 2;
        scaleRise += run * (scaled[i]! + scaled[i - 1]!) / 2;
      }
      const peak = (b.y - a.y - knownRise) / scaleRise;
      let y = a.y;
      for (let i = 1; i < knots.length; i++) {
        const run = knots[i]! - knots[i - 1]!, step = Math.min(run, Math.max(0, d - knots[i - 1]!));
        const ga = fixed[i - 1]! + scaled[i - 1]! * peak, gb = fixed[i]! + scaled[i]! * peak;
        y += ga * step + (gb - ga) * step * step / (2 * run);
        if (d <= knots[i]!) break;
      }
      return y;
    }
    const keys = this.heightKeys;
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1]!, b = keys[i]!;
      if (s <= b.s) {
        const length = b.s - a.s, t = THREE.MathUtils.clamp((s - a.s) / length, 0, 1);
        return (2 * t ** 3 - 3 * t * t + 1) * a.y + (t ** 3 - 2 * t * t + t) * length * a.grade
          + (-2 * t ** 3 + 3 * t * t) * b.y + (t ** 3 - t * t) * length * b.grade;
      }
    }
    return keys[keys.length - 1]!.y;
  }
  width(s: number): number {
    if (this.id === 'steep-climb') return 4;
    if (this.id !== 'main') return 4.1;
    const side = this.section('mountain-side'), ridge = this.section('ridge');
    const broken = this.section('broken-dirt'), descent = this.section('descent');
    return 6.3 - 0.5 * smooth((s - 320) / 100) - 1.0 * smooth((s - side.start) / 150)
      + 0.3 * smooth((s - ridge.start) / 80) - 0.8 * smooth((s - broken.start) / 80)
      + 0.6 * smooth((s - descent.start) / 80) + 1.4 * smooth((s - this.section('return').start) / 80);
  }
  bank(s: number): number {
    if (this.id === 'side-slope' && this.main) {
      const p = this.point(s), hit = this.main.nearest(p.x, p.z)!;
      const baseline = this.main.bank(hit.s) * (p.tx * hit.tx + p.tz * hit.tz);
      return THREE.MathUtils.lerp(baseline, Math.tan(THREE.MathUtils.degToRad(11.2)), windowAt(s, 0, this.length, 40));
    }
    if (this.id !== 'main') return 0;
    const side = this.section('mountain-side'), ridge = this.section('ridge');
    const degrees = 4.2 * windowAt(s, side.start, side.end, 65)
      + 3.1 * windowAt(s, side.start + 120, side.start + 240, 40)
      + 2.2 * windowAt(s, ridge.start, ridge.end, 70);
    return Math.tan(THREE.MathUtils.degToRad(degrees));
  }
  /** Centimetre-scale damage is confined to the erosion road; hills come from height keys. */
  disturbance(s: number, lateral: number): number {
    if (this.id === 'deep-ruts') {
      const p = this.point(s), separation = this.main!.nearest(p.x, p.z)!.distance;
      return this.erosion(s, lateral, 0.235) * windowAt(s, 0, this.length, 12) * smooth((separation - 4) / 3);
    }
    if (this.id !== 'main') return 0;
    const broken = this.section('broken-dirt'), erosion = this.section('articulation');
    const d = s - broken.start;
    const crown = -0.009 * Math.sqrt(lateral * lateral + 0.16);
    const small = windowAt(d, 80, 160, 20) * (0.035 * Math.sin(d * 0.65) + 0.012 * Math.sin(d * 1.07));
    const travel = -0.11 * Math.exp(-1 * ((d - 210 - lateral * 1.4) / 7) ** 2)
      + 0.105 * Math.exp(-1 * ((d - 280 + lateral) / 6) ** 2)
      - 0.09 * Math.exp(-1 * ((d - 350 - lateral * 1.6) / 6.5) ** 2);
    const wash = windowAt(d, 400, 455, 12) * (0.043 * Math.sin(d * Math.PI * 2 / 4.1)
      + 0.009 * Math.sin(d * Math.PI * 2 / 3.3));
    const ruts = this.erosion(s - erosion.start, lateral, 0.165)
      * windowAt(s, erosion.start, erosion.end, 15);
    const fast = this.section('fast-gravel'), ridge = this.section('ridge');
    const crests = 0.45 * Math.exp(-1 * ((s - fast.start - 320) / 55) ** 2)
      - 0.3 * Math.exp(-1 * ((s - fast.start - 670) / 48) ** 2)
      + 0.55 * Math.exp(-1 * ((s - ridge.start - 430) / 60) ** 2)
      - 0.3 * Math.exp(-1 * ((s - ridge.start - 780) / 50) ** 2);
    return crests + crown + small + travel * windowAt(s, broken.start, broken.end, 30) + wash + ruts;
  }
  private erosion(s: number, lateral: number, depth: number): number {
    // Three broad oblique drainage channels, alternating which wheel track crosses first.
    return -depth * (Math.exp(-1 * ((s - 22 - lateral * 1.4) / 2.8) ** 2) * Math.exp(-1 * ((lateral + 0.85) / 1.45) ** 2)
      + Math.exp(-1 * ((s - 44 + lateral * 1.4) / 3) ** 2) * Math.exp(-1 * ((lateral - 0.85) / 1.45) ** 2)
      + Math.exp(-1 * ((s - 68 - lateral * 1.4) / 3.2) ** 2) * Math.exp(-1 * ((lateral + 0.7) / 1.5) ** 2));
  }
  surfaceKeys(): readonly (readonly [number, SurfaceType])[] {
    if (this.id === 'steep-climb') return [[0, 'loose-gravel']];
    if (this.id === 'deep-ruts') return [[0, 'dirt']];
    if (this.id !== 'main') return [[0, 'compact-gravel']];
    const broken = this.section('broken-dirt'), descent = this.section('descent');
    const valley = this.section('valley'), back = this.section('return');
    return [[0, 'asphalt'], [350, 'compact-gravel'], [broken.start, 'dirt'],
      [descent.start, 'compact-gravel'], [descent.start + 440, 'dirt'], [descent.start + 540, 'compact-gravel'],
      [valley.start, 'damp-dirt'], [back.start - 50, 'dirt'], [back.start + 5, 'compact-gravel'],
      [this.length - 260, 'asphalt']];
  }
}

export class MountainRoute {
  readonly main: MountainPath;
  readonly branches: readonly MountainPath[];
  readonly paths: readonly MountainPath[];
  constructor() {
    const curve = new THREE.CurvePath<THREE.Vector3>();
    const sections: MountainSection[] = [];
    let p = new THREE.Vector3(0, 0, 700), distance = 0;
    const line = (x: number, z: number): void => {
      const end = new THREE.Vector3(x, 0, z);
      curve.add(new THREE.LineCurve3(p.clone(), end)); p = end;
    };
    const bend = (ax: number, az: number, bx: number, bz: number, x: number, z: number): void => {
      const end = new THREE.Vector3(x, 0, z);
      curve.add(new THREE.CubicBezierCurve3(p.clone(), new THREE.Vector3(ax, 0, az), new THREE.Vector3(bx, 0, bz), end)); p = end;
    };
    const section = (id: string, build: () => void): void => {
      build(); const end = curve.getLength(); sections.push({ id, start: distance, end }); distance = end;
    };
    section('asphalt-approach', () => line(-350, 700));
    section('fast-gravel', () => {
      bend(-550, 700, -800, 650, -850, 480);
      bend(-900, 310, -920, 170, -860, 10);
    });
    section('mountain-side', () => bend(-820, -100, -870, -210, -850, -360));
    section('climb', () => {
      bend(-850, -393, -835, -410, -800, -410);
      line(-680, -410);
      for (let i = 0; i < 4; i++) {
        const east = i % 2 === 0, cx = east ? -680 : -840, cz = -434 - i * 48;
        const arc = new MountainArc(cx, cz, 24, Math.PI / 2, east ? -Math.PI : Math.PI);
        curve.add(arc); p = arc.getPoint(1);
        line(east ? -840 : -680, -458 - i * 48);
      }
    });
    section('ridge', () => {
      bend(-480, -602, -530, -720, -340, -720);
      bend(-260, -720, -180, -690, -80, -690);
      bend(60, -690, 150, -750, 280, -730);
      bend(380, -715, 410, -660, 500, -660);
    });
    section('broken-dirt', () => {
      bend(690, -660, 860, -560, 875, -420);
      bend(886, -320, 820, -315, 855, -240);
    });
    section('articulation', () => bend(874, -200, 895, -170, 890, -130));
    section('descent', () => {
      bend(880, -20, 700, 50, 765, 160);
      bend(815, 245, 920, 225, 880, 350);
      bend(837, 487, 700, 410, 700, 555);
      bend(700, 625, 650, 653, 580, 670);
    });
    section('valley', () => bend(500, 690, 425, 700, 330, 700));
    section('return', () => line(0, 700));
    this.main = new MountainPath('main', curve, sections);
    const m = this.main, climb = m.section('climb'), ridge = m.section('ridge');
    const broken = m.section('broken-dirt'), erosion = m.section('articulation'), descent = m.section('descent');
    m.heightKeys.push({ s: 0, y: 2, grade: 0 }, { s: 350, y: 2, grade: 0 },
      { s: m.section('fast-gravel').end, y: 9, grade: 0.012 },
      { s: climb.start, y: 18, grade: 0.045 },
      { s: climb.start + 250, y: 31, grade: 0.065 },
      { s: climb.start + 490, y: 38, grade: 0.095 },
      { s: climb.start + 730, y: 60, grade: 0.085 },
      { s: climb.end, y: 84, grade: 0.012 },
      { s: ridge.start + 500, y: 88, grade: 0 },
      { s: ridge.end, y: 84, grade: -0.008 },
      { s: broken.end, y: 78, grade: -0.012 },
      { s: erosion.end, y: 76, grade: -0.035 },
      { s: descent.start + 300, y: 57, grade: -0.065 },
      { s: descent.start + 650, y: 30, grade: -0.072 },
      { s: descent.end, y: 8, grade: -0.026 },
      { s: m.section('valley').end, y: 2, grade: 0 }, { s: m.length, y: 2, grade: 0 });
    const branch = (id: string, start: number, end: number, offset: number, custom?: THREE.CurvePath<THREE.Vector3>): MountainPath => {
      let c = custom;
      if (!c) {
        c = new THREE.CurvePath<THREE.Vector3>();
        let last: THREE.Vector3 | undefined;
        for (let i = 0; i <= 80; i++) {
          const t = i / 80, v = m.point(THREE.MathUtils.lerp(start, end, t));
          const shift = offset * Math.sin(Math.PI * t) ** 2;
          const next = new THREE.Vector3(v.x - v.tz * shift, 0, v.z + v.tx * shift);
          if (last) c.add(new THREE.LineCurve3(last, next));
          last = next;
        }
      }
      const path = new MountainPath(id, c, [], m, [start, end]);
      const a = m.point(start), b = m.point(end), ta = path.point(0), tb = path.point(path.length);
      const slope = (s: number): number => (m.height(s + 0.1) - m.height(s - 0.1)) / 0.2;
      path.heightKeys.push({ s: 0, y: m.height(start), grade: slope(start) * (a.tx * ta.tx + a.tz * ta.tz) },
        { s: path.length, y: m.height(end), grade: slope(end) * (b.tx * tb.tx + b.tz * tb.tz) });
      return path;
    };
    const climbEntryLength = climb.end - climb.start - 120 - 4 * 160 - 4 * Math.PI * 24;
    const steepStart = climb.start + climbEntryLength + 45;
    const steepEnd = steepStart + 160 + Math.PI * 24;
    const a = m.point(steepStart), b = m.point(steepEnd);
    const shortcut = new THREE.CurvePath<THREE.Vector3>();
    shortcut.add(new THREE.CubicBezierCurve3(new THREE.Vector3(a.x, 0, a.z),
      new THREE.Vector3(a.x + 107, 0, a.z), new THREE.Vector3(b.x + 107, 0, b.z), new THREE.Vector3(b.x, 0, b.z)));
    this.branches = [branch('steep-climb', steepStart, steepEnd, 0, shortcut),
      branch('side-slope', m.section('mountain-side').start + 100, m.section('mountain-side').start + 220, 13),
      branch('deep-ruts', erosion.start + 10, erosion.start + 75, -9)];
    const steep = this.branches[0]!;
    const mainBed = (s: number): number => {
      const p = steep.point(s), hit = m.nearest(p.x, p.z)!;
      return m.height(hit.s);
    };
    steep.heightKeys.splice(1, 0, ...[40, steep.length - 40].map(s => ({ s, y: mainBed(s),
      grade: (mainBed(s + 0.1) - mainBed(s - 0.1)) / 0.2 })));
    this.paths = [m, ...this.branches];
  }
  nearest(x: number, z: number): RouteHit | undefined {
    let best: RouteHit | undefined;
    for (const path of this.paths) {
      const hit = path.nearest(x, z);
      if (hit && (!best || hit.distance < best.distance)) best = hit;
    }
    return best;
  }
}
