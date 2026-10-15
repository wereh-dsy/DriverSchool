import * as THREE from 'three';
import { TsukubaElevation } from './TsukubaElevation';

export const TSUKUBA_ID = 'tsukuba-tc2000';
export const TSUKUBA_LENGTH = 2045;
type Point = readonly [number, number];
interface TraceSection {
  readonly id: string;
  readonly label: string;
  readonly end: Point;
  readonly controls?: readonly [Point, Point];
  readonly width: number;
}

/** Digitized centreline of official course-spec_01.png, in image pixels.
 * Four-wheel 80R route, excluding the motorcycle MC chicane.
 * Source and accuracy notes: docs/TSUKUBA_TC2000.md; not survey coordinates.
 */
const START: Point = [420, 328];
const TRACE: readonly TraceSection[] = [
  { id: 'home', label: 'Home straight', end: [795, 153], width: 15 },
  { id: 't1-entry', label: 'First corner · 55R entry', controls: [[850, 127], [897, 158]], end: [908, 207], width: 13 },
  { id: 't1-exit', label: 'First corner · tightening exit', controls: [[918, 252], [904, 281]], end: [855, 298], width: 12 },
  { id: 's-entry', label: 'S curves · approach', controls: [[779, 324], [665, 343]], end: [609, 382], width: 10.5 },
  { id: 's-bend', label: 'S curves · direction change', controls: [[553, 421], [493, 496]], end: [398, 515], width: 10.5 },
  { id: 'hairpin-1-entry', label: 'First hairpin · entry', controls: [[365, 522], [299, 524]], end: [269, 552], width: 11 },
  { id: 'hairpin-1', label: 'First hairpin · left', controls: [[213, 604], [282, 688]], end: [354, 644], width: 11 },
  { id: 'dunlop-approach', label: 'Dunlop approach', end: [573, 509], width: 10.5 },
  { id: 'dunlop', label: 'Dunlop · right 35R', controls: [[623, 478], [656, 490]], end: [689, 532], width: 10.5 },
  { id: '80r-entry', label: '80R · left transition', controls: [[722, 574], [761, 639]], end: [810, 672], width: 10 },
  { id: '80r-exit', label: '80R · opening left', controls: [[859, 705], [890, 710]], end: [960, 710], width: 10 },
  { id: 'hairpin-2-approach', label: 'Second hairpin approach', controls: [[1100, 710], [1158, 686]], end: [1230, 662], width: 10.5 },
  { id: 'hairpin-2', label: 'Second hairpin · right 25R', controls: [[1340, 625], [1399, 732]], end: [1280, 756], width: 11 },
  { id: 'hairpin-2-exit', label: 'Second hairpin · opening exit', controls: [[1263, 759], [1249, 760]], end: [1235, 760], width: 11 },
  { id: 'back', label: 'Back straight', end: [330, 767], width: 10 },
  { id: 'final-entry', label: 'Final corner · fast right 100R', controls: [[196, 768], [136, 706]], end: [141, 577], width: 11 },
  { id: 'final-exit', label: 'Final corner · right 90R exit', controls: [[144, 499], [183, 439]], end: [255, 405], width: 12 },
  { id: 'home-return', label: 'Home straight · start/finish', end: START, width: 15 },
];

const vector = (p: Point, scale: number): THREE.Vector3 =>
  new THREE.Vector3((p[0] - START[0]) * scale, 0, (p[1] - START[1]) * scale);

function traceCurve(scale: number): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();
  let previous = START;
  for (const section of TRACE) {
    path.add(section.controls
      ? new THREE.CubicBezierCurve3(vector(previous, scale), vector(section.controls[0], scale),
        vector(section.controls[1], scale), vector(section.end, scale))
      : new THREE.LineCurve3(vector(previous, scale), vector(section.end, scale)));
    previous = section.end;
  }
  return path;
}

export interface TsukubaSection {
  readonly id: string; readonly label: string; readonly start: number; readonly end: number;
  readonly startWidth: number; readonly endWidth: number;
}
export interface TsukubaBand {
  readonly start: number; readonly end: number; readonly side: number; readonly width: number;
}
export interface TsukubaRouteSample {
  readonly x: number; readonly z: number; readonly distance: number; readonly width: number;
  readonly y?: number;
}

export class TsukubaLayout {
  public readonly scale = TSUKUBA_LENGTH / traceCurve(1).getLength();
  public readonly curve = traceCurve(this.scale);
  public readonly length = this.curve.getLength();
  public readonly sections: readonly TsukubaSection[];
  public readonly elevation: TsukubaElevation;
  public readonly samples: readonly TsukubaRouteSample[];
  public readonly pitCurve: THREE.CurvePath<THREE.Vector3>;
  public readonly pitWidth = 5.5;
  public readonly pitSamples: readonly TsukubaRouteSample[];
  public readonly kerbs: readonly TsukubaBand[];
  public readonly runoffs: readonly TsukubaBand[];
  public readonly bounds;

  public constructor() {
    let distance = 0;
    this.sections = TRACE.map((section, index) => {
      const start = distance;
      distance += this.curve.curves[index]!.getLength();
      return { id: section.id, label: section.label, start, end: distance,
        startWidth: TRACE[(index + TRACE.length - 1) % TRACE.length]!.width, endWidth: section.width };
    });
    this.elevation = new TsukubaElevation(this.sections, this.length);
    this.samples = this.sample(this.curve, distance => this.widthAt(distance), true);
    // Inside final bend -> home straight -> inside T1 -> downstream merge.
    const pit = new THREE.CurvePath<THREE.Vector3>();
    const cubic = (a: Point, b: Point, c: Point, d: Point): void => {
      pit.add(new THREE.CubicBezierCurve3(vector(a, this.scale), vector(b, this.scale),
        vector(c, this.scale), vector(d, this.scale)));
    };
    cubic([144, 623], [155, 558], [170, 510], [207, 483]);
    cubic([207, 483], [230, 466], [270, 446], [300, 432]);
    pit.add(new THREE.LineCurve3(vector([300, 432], this.scale), vector([794, 202], this.scale)));
    cubic([794, 202], [847, 177], [886, 244], [843, 273]);
    cubic([843, 273], [823, 287], [802, 316], [780, 323]);
    this.pitCurve = pit;
    this.pitSamples = this.sample(pit, () => this.pitWidth);
    const band = (first: string, last: string, side: number, width: number, trim = 0): TsukubaBand => ({
      start: this.section(first).start + trim, end: this.section(last).end - trim, side, width,
    });
    this.kerbs = [band('t1-entry', 't1-exit', 1, 1.1, 12), band('s-bend', 's-bend', -1, 0.9, 12),
      band('hairpin-1', 'hairpin-1', -1, 1.2, 5), band('dunlop', 'dunlop', 1, 1.1, 5),
      band('80r-entry', '80r-exit', -1, 1, 12), band('hairpin-2', 'hairpin-2-exit', 1, 1.2, 8),
      band('final-entry', 'final-exit', 1, 1.1, 18),
      { start: this.section('t1-exit').end - 12, end: this.section('t1-exit').end + 35, side: -1, width: 1.1 },
      { start: this.section('hairpin-1').end - 8, end: this.section('hairpin-1').end + 35, side: 1, width: 1 },
      { start: this.section('final-exit').end - 10, end: this.section('final-exit').end + 40, side: -1, width: 1.1 }];
    this.runoffs = [band('t1-entry', 't1-exit', -1, 10),
      band('hairpin-1-entry', 'hairpin-1', 1, 6), band('dunlop', 'dunlop', -1, 5),
      band('hairpin-2', 'hairpin-2-exit', -1, 8), band('final-entry', 'final-exit', -1, 10)];
    this.bounds = Object.freeze({ minX: Math.min(...this.samples.map(p => p.x)) - 60,
      maxX: Math.max(...this.samples.map(p => p.x)) + 60,
      minZ: Math.min(...this.samples.map(p => p.z)) - 60,
      maxZ: Math.max(...this.samples.map(p => p.z)) + 60 });
  }
  public section(id: string): TsukubaSection { return this.sections.find(s => s.id === id)!; }
  public widthAt(distance: number): number {
    const d = THREE.MathUtils.euclideanModulo(distance, this.length);
    const s = this.sections.find(section => d <= section.end) ?? this.sections[0]!;
    return s.startWidth + (s.endWidth - s.startWidth) * THREE.MathUtils.smoothstep(d, s.start, s.end);
  }
  public poseAt(distance: number, offset = 0): { position: THREE.Vector3; yawRadians: number } {
    const t = THREE.MathUtils.euclideanModulo(distance, this.length) / this.length;
    const position = this.curve.getPointAt(t), tangent = this.curve.getTangentAt(t).normalize();
    position.x -= tangent.z * offset; position.z += tangent.x * offset;
    return { position, yawRadians: Math.atan2(-tangent.x, -tangent.z) };
  }
  private sample(curve: THREE.Curve<THREE.Vector3>, width: (distance: number) => number, elevated = false): TsukubaRouteSample[] {
    const length = curve.getLength(), count = Math.ceil(length / 1.5);
    return Array.from({ length: count + 1 }, (_, i) => {
      const p = curve.getPointAt(i / count), distance = length * i / count;
      return { x: p.x, z: p.z, distance, width: width(distance), y: elevated ? this.elevation.heightAt(distance) : undefined };
    });
  }
}

/** Same smooth taper for visible strips and physical surface queries. */
export function bandEnvelope(band: TsukubaBand, distance: number): number {
  return THREE.MathUtils.smoothstep(distance, band.start, band.start + 5)
    * (1 - THREE.MathUtils.smoothstep(distance, band.end - 5, band.end));
}
