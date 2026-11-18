import type { CityIntersection, CityMapData, CityPoint, CityRoad } from '../world/city/CityMapData';
import { junctionSurfaceContains } from '../world/city/JunctionSurface';
import { polylineLength, roadEdges, roadPoints, sampleAt } from '../world/city/geometry';
import { roadFunction } from '../world/city/RoadClassification';
import type { EditorArea } from './EditorCommands';
import { bounds, distance, overlaps } from './EditorGeometry';
import { approachPaintOffsets } from '../world/city/SignalPlacement';

/**
 * Map-quality diagnostics for the CLI/Agent workflow. This is deliberately
 * separate from schema validation: validate decides whether the map is
 * structurally legal, diagnose reports geometric and marking quality.
 */
export type DiagnosticSeverity = 'info' | 'warning' | 'error';
export type DiagnosticMetric = number | string | boolean | null;
export interface RepairSuggestion {
  op: 'smoothRoad' | 'repairElevation' | 'simplifyRoad' | 'repairRamp' | 'repairIntersection';
  id: string;
  [key: string]: unknown;
}
export interface DiagnosticIssue {
  id?: string;
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  roadId?: string;
  corridorId?: string;
  intersectionId?: string;
  objectId?: string;
  /** Station along the reported road, metres from its authored start. */
  station?: number;
  metrics?: Record<string, DiagnosticMetric>;
  repair?: RepairSuggestion;
}
export interface DiagnosticScope {
  roadId?: string;
  corridorId?: string;
  intersectionId?: string;
  bbox?: EditorArea;
  center?: CityPoint;
  radius?: number;
  full?: boolean;
  limit?: number;
  /** Only return these codes (prefix match is supported, e.g. geometry.). */
  codes?: string[];
  minSeverity?: DiagnosticSeverity;
}
export interface DiagnosticReport {
  scope: string;
  revision?: number;
  coverage: { roadsChecked: number; roadsTotal: number; intersectionsChecked: number; intersectionsTotal: number };
  counts: {
    error: number; warning: number; info: number; total: number;
    bySeverity: Record<DiagnosticSeverity, number>;
    byCode: Record<string, number>;
  };
  issues: DiagnosticIssue[];
  truncated: boolean;
  pagination?: { offset: number; limit: number; total: number; returned: number; nextOffset: number | null };
}
export interface DiagnosticPageRequest {
  offset?: number;
  limit?: number;
  codes?: string[];
  minSeverity?: DiagnosticSeverity;
}
interface IndexLike { query(area: EditorArea): string[] }
interface Options { index?: IndexLike; revision?: number; retainAllIssues?: boolean }
const R = Math.PI / 180;
const round = (value: number, digits = 1): number => Math.round(value * 10 ** digits) / 10 ** digits;
const severityRank: Record<DiagnosticSeverity, number> = { info: 0, warning: 1, error: 2 };
const turn = (a: CityPoint, b: CityPoint, c: CityPoint): number => {
  const h1 = Math.atan2(b.x - a.x, b.z - a.z), h2 = Math.atan2(c.x - b.x, c.z - b.z);
  return Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1));
};
const horizontal = (a: CityPoint, b: CityPoint): number => Math.hypot(b.x - a.x, b.z - a.z);
function stations(points: readonly CityPoint[]): number[] {
  const result = [0];
  for (let i = 1; i < points.length; i++) result.push(result[i - 1]! + horizontal(points[i - 1]!, points[i]!));
  return result;
}
function resample(points: readonly CityPoint[], step = 3): CityPoint[] {
  const length = polylineLength(points);
  if (length < 1e-6 || points.length < 2) return points.map(p => ({ ...p }));
  const result: CityPoint[] = [];
  for (let d = 0; d < length; d += step) result.push({ ...sampleAt(points, d).point });
  result.push({ ...sampleAt(points, length).point });
  return result;
}
/** Perpendicular XZ deviation of one interior vertex from its neighbours' chord. */
function chordDeviation(a: CityPoint, b: CityPoint, c: CityPoint): number {
  const dx = c.x - a.x, dz = c.z - a.z, length = Math.hypot(dx, dz);
  if (length < 1e-6) return horizontal(a, b);
  return Math.abs((b.x - a.x) * dz - (b.z - a.z) * dx) / length;
}
function segmentIntersection(a: CityPoint, b: CityPoint, c: CityPoint, d: CityPoint): { x: number; z: number } | null {
  const ux = b.x - a.x, uz = b.z - a.z, vx = d.x - c.x, vz = d.z - c.z;
  const den = ux * vz - uz * vx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * vz - (c.z - a.z) * vx) / den;
  const s = ((c.x - a.x) * uz - (c.z - a.z) * ux) / den;
  if (t < 0.02 || t > 0.98 || s < 0.02 || s > 0.98) return null;
  return { x: a.x + ux * t, z: a.z + uz * t };
}
function movingAverage(values: readonly number[], radius: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    let sum = 0, count = 0;
    for (let k = Math.max(0, i - radius); k <= Math.min(values.length - 1, i + radius); k++) { sum += values[k]!; count++; }
    result.push(sum / count);
  }
  return result;
}
function gradeCounts(points: readonly CityPoint[], deadband = 0.006): { max: number; reversals: number; stations: number[] } {
  const table = stations(points);
  let max = 0, reversals = 0, previous = 0;
  const at: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const length = table[i]! - table[i - 1]!;
    if (length < 0.05) continue;
    const grade = ((points[i]!.y ?? 0) - (points[i - 1]!.y ?? 0)) / length;
    max = Math.max(max, Math.abs(grade));
    if (Math.abs(grade) < deadband) continue;
    const sign = Math.sign(grade);
    if (previous && sign !== previous) { reversals++; at.push(table[i]!); }
    previous = sign;
  }
  return { max, reversals, stations: at };
}
function horizontalLoop(points: readonly CityPoint[]): boolean {
  if (points.length < 6) return false;
  let total = 0, positive = 0, negative = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const angle = turn(points[i - 1]!, points[i]!, points[i + 1]!);
    total += angle;
    if (angle > 0) positive += Math.abs(angle); else negative += Math.abs(angle);
  }
  return Math.abs(total) > Math.PI * 1.55 && Math.max(positive, negative) > Math.min(positive, negative) * 2.5;
}
/** Best short-window zigzag: alternating turns and real lateral excursion. */
function zigzag(points: readonly CityPoint[], table: readonly number[]): { station: number; reversals: number; swing: number } | null {
  let best: { station: number; reversals: number; swing: number } | null = null;
  const turns: { station: number; angle: number }[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const angle = turn(points[i - 1]!, points[i]!, points[i + 1]!);
    if (Math.abs(angle) >= 6 * R) turns.push({ station: table[i]!, angle });
  }
  for (let start = 0; start < turns.length; start++) {
    let sign = 0, reversals = 0, end = start;
    while (end + 1 < turns.length && turns[end + 1]!.station - turns[start]!.station <= 90) {
      end++;
      const next = Math.sign(turns[end]!.angle);
      if (sign && next !== sign) reversals++;
      sign = next;
    }
    if (reversals < 3) continue;
    const from = sampleAt(points, turns[start]!.station).point, to = sampleAt(points, turns[end]!.station).point;
    let swing = 0;
    for (let i = start; i <= end; i++) {
      const p = sampleAt(points, turns[i]!.station).point;
      swing = Math.max(swing, chordDeviation(from, p, to));
    }
    if (swing < 0.35) continue;
    if (!best || reversals > best.reversals || reversals === best.reversals && swing > best.swing)
      best = { station: turns[start]!.station, reversals, swing };
  }
  return best;
}
function elevationExtrema(points: readonly CityPoint[], table: readonly number[]): { station: number; amplitude: number; high: boolean }[] {
  const extrema: { station: number; amplitude: number; high: boolean }[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const y0 = points[i - 1]!.y ?? 0, y1 = points[i]!.y ?? 0, y2 = points[i + 1]!.y ?? 0;
    if ((y1 >= y0 && y1 > y2) || (y1 <= y0 && y1 < y2)) {
      const amplitude = Math.abs(y1 - (y0 + y2) / 2);
      if (amplitude > 0.12) extrema.push({ station: table[i]!, amplitude, high: y1 >= y0 });
    }
  }
  return extrema;
}
function highFrequencyHeightOscillation(points: readonly CityPoint[], table: readonly number[]): { count: number; amplitude: number } {
  let count = 0, amplitude = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const before = (points[i]!.y ?? 0) - (points[i - 1]!.y ?? 0);
    const after = (points[i + 1]!.y ?? 0) - (points[i]!.y ?? 0);
    const span = table[i + 1]! - table[i - 1]!;
    if (span > 35 || span < 0.05) continue;
    if (Math.sign(before) && Math.sign(before) !== Math.sign(after) && Math.abs(before) > 0.07 && Math.abs(after) > 0.07) {
      count++; amplitude = Math.max(amplitude, Math.min(Math.abs(before), Math.abs(after)));
    }
  }
  return { count, amplitude };
}
function waveMetrics(points: readonly CityPoint[]): { crossings: number; rms: number; reversals: number; maxGrade: number; amplitude: number } {
  const samples = resample(points, 3), table = stations(samples), heights = samples.map(p => p.y ?? 0);
  const trendRadius = 4; // ~12 m each side of a 3 m sample.
  const trend = movingAverage(heights, Math.min(trendRadius, Math.max(1, Math.floor(samples.length / 8))));
  const residual = heights.map((h, i) => h - trend[i]!);
  if (residual.length > 4) { // Do not count flat profile ends as oscillation.
    const radius = Math.min(4, Math.floor(residual.length / 4));
    for (let i = 0; i < radius; i++) { residual[i] = 0; residual[residual.length - 1 - i] = 0; }
  }
  let crossings = 0, sign = 0;
  const threshold = 0.08;
  for (const value of residual) {
    if (value > threshold) { if (sign < 0) crossings++; sign = 1; }
    else if (value < -threshold) { if (sign > 0) crossings++; sign = -1; }
  }
  const rms = Math.sqrt(residual.reduce((sum, value) => sum + value * value, 0) / Math.max(1, residual.length));
  const extrema = elevationExtrema(samples, table);
  let amplitude = 0;
  for (const e of extrema) amplitude = Math.max(amplitude, e.amplitude);
  const grades = gradeCounts(samples);
  return { crossings, rms, reversals: grades.reversals, maxGrade: grades.max, amplitude };
}
function segmentGradeChanges(points: readonly CityPoint[], table: readonly number[]): { station: number; change: number }[] {
  const result: { station: number; change: number }[] = [];
  for (let i = 2; i < points.length - 1; i++) {
    const a = table[i - 1]! - table[i - 2]!, b = table[i]! - table[i - 1]!;
    if (a < 0.05 || b < 0.05 || a + b > 30) continue;
    const g1 = ((points[i - 1]!.y ?? 0) - (points[i - 2]!.y ?? 0)) / a;
    const g2 = ((points[i]!.y ?? 0) - (points[i - 1]!.y ?? 0)) / b;
    const change = Math.abs(g2 - g1);
    if (change > 0.07) result.push({ station: table[i]!, change });
  }
  return result;
}
function redundantElevationPoints(points: readonly CityPoint[], table: readonly number[]): number {
  let count = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const span = table[i + 1]! - table[i - 1]!;
    if (span < 0.05) continue;
    const expected = (points[i - 1]!.y ?? 0) + ((points[i + 1]!.y ?? 0) - (points[i - 1]!.y ?? 0)) * ((table[i]! - table[i - 1]!) / span);
    if (Math.abs((points[i]!.y ?? 0) - expected) < 0.02) count++;
  }
  return count;
}
function roadIssue(severity: DiagnosticSeverity, code: string, road: CityRoad, message: string, extra: Partial<DiagnosticIssue> = {}): DiagnosticIssue {
  return { severity, code, roadId: road.id, message, metrics: { roadClass: roadFunction(road), length: round(polylineLength(roadPoints(road))), ...extra.metrics }, ...extra };
}

/** Horizontal/vertical alignment quality of one road. */
export function diagnoseRoad(row: CityRoad): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [], points = roadPoints(row), raw = roadPoints({ ...row, curve: 'polyline' });
  if (points.length < 2) return issues;
  const table = stations(points), rawTable = stations(raw), loop = horizontalLoop(points);
  const ramp = roadFunction(row) === 'ramp';
  const horizontalRepair: RepairSuggestion = { op: ramp ? 'repairRamp' : 'smoothRoad', id: row.id, strength: 1, preserveEndpoints: true };
  const verticalRepair: RepairSuggestion = { op: ramp ? 'repairRamp' : 'repairElevation', id: row.id, preserveEndpoints: true, monotonic: ramp ? undefined : false };
  // --- horizontal ---------------------------------------------------------
  const segments: number[] = [];
  for (let i = 1; i < points.length; i++) segments.push(horizontal(points[i - 1]!, points[i]!));
  const short = segments.filter(v => v < 1.5).length;
  if (short >= 2 && !loop) issues.push(roadIssue(short >= 4 ? 'warning' : 'info', 'geometry.shortSegments', row, `${short} road segments shorter than 1.5 m`, { metrics: { shortSegments: short }, repair: horizontalRepair }));
  if (!loop) {
    interface Bend { index: number; station: number; angle: number; radius: number; span: number; }
    const bends: Bend[] = [];
    for (let i = 1; i < points.length - 1; i++) {
      const angle = Math.abs(turn(points[i - 1]!, points[i]!, points[i + 1]!));
      if (angle < 38 * R) continue;
      const a = segments[i - 1] ?? 0, b = segments[i] ?? 0;
      const radius = angle > 1e-4 ? Math.min(a, b) / (2 * Math.sin(Math.min(Math.PI - 1e-4, angle) / 2)) : Infinity;
      bends.push({ index: i, station: table[i]!, angle, radius, span: a + b });
    }
    if (bends.length) {
      // Consecutive flagged vertices are one physical bend, not many defects.
      const clusters: Bend[][] = [];
      for (const bend of bends) {
        const last = clusters.at(-1);
        if (last && bend.index - last.at(-1)!.index <= 2) last.push(bend); else clusters.push([bend]);
      }
      let worst = clusters[0]!;
      for (const cluster of clusters) if (Math.max(...cluster.map(b => b.angle)) > Math.max(...worst.map(b => b.angle))) worst = cluster;
      const peak = worst.reduce((best, bend) => bend.angle > best.angle ? bend : best);
      const angle = peak.angle / R;
      if (angle >= 50 && (peak.radius < 35 || angle >= 65)) issues.push(roadIssue(angle >= 80 ? 'error' : 'warning', 'geometry.sharpBend', row, `${angle.toFixed(0)}° bend over ${round(peak.span)} m`, { station: round(peak.station), metrics: { angleDegrees: round(angle, 0), radius: round(peak.radius), span: round(peak.span) }, repair: { ...horizontalRepair, strength: angle >= 80 ? 1.5 : 1 } }));
    }
    const zig = zigzag(points, table);
    if (zig) issues.push(roadIssue('warning', 'geometry.zigzag', row, `${zig.reversals} alternating bends within ${round(zig.swing)} m lateral swing`, { station: round(zig.station), metrics: { reversals: zig.reversals, swing: round(zig.swing) }, repair: { ...horizontalRepair, strength: 1.25 } }));
    // Two opposite, tight turns separated by a short middle segment.
    for (let i = 1; i < points.length - 2; i++) {
      const first = turn(points[i - 1]!, points[i]!, points[i + 1]!);
      const second = turn(points[i]!, points[i + 1]!, points[i + 2]!);
      if (Math.abs(first) < 25 * R || Math.abs(second) < 25 * R || Math.sign(first) === Math.sign(second)) continue;
      if (Math.min(segments[i] ?? 0, segments[i - 1] ?? 0, segments[i + 1] ?? 0) > 35) continue;
      issues.push(roadIssue('warning', 'geometry.awkwardS', row, 'Tight S bend between two opposite turns', { station: round(table[i]!), metrics: { firstDegrees: round(Math.abs(first) / R, 0), secondDegrees: round(Math.abs(second) / R, 0) }, repair: horizontalRepair }));
      break;
    }
  }
  // Genuinely redundant (collinear) vertices. This is intentionally stricter
  // than simplification: it only reports points that can be removed without
  // changing the authored polyline perceptibly.
  let collinear = 0;
  for (let i = 1; i < raw.length - 1; i++) {
    const before = horizontal(raw[i - 1]!, raw[i]!), after = horizontal(raw[i]!, raw[i + 1]!);
    if (before < 0.5 || after < 0.5) continue;
    if (Math.abs(turn(raw[i - 1]!, raw[i]!, raw[i + 1]!)) < 0.8 * R || chordDeviation(raw[i - 1]!, raw[i]!, raw[i + 1]!) < 0.02) collinear++;
  }
  if (collinear >= 2) issues.push(roadIssue('info', 'geometry.redundantControlPoints', row, `${collinear} redundant centerline points`, { metrics: { redundantPoints: collinear }, repair: { op: 'simplifyRoad', id: row.id, tolerance: 0.2 } }));
  if (!loop && points.length <= 700) {
    const limit = Math.min(points.length - 2, 500);
    outer: for (let i = 1; i < limit; i++) for (let k = i + 2; k < limit; k++) {
      if (i === 0 && k === points.length - 1) continue;
      if (segments[i - 1]! + segments[k - 1]! < 2) continue;
      const hit = segmentIntersection(points[i - 1]!, points[i]!, points[k - 1]!, points[k]!);
      if (hit && Math.abs((points[i - 1]!.y ?? 0) - (points[k - 1]!.y ?? 0)) < 0.5) {
        issues.push(roadIssue('warning', 'geometry.selfIntersection', row, 'Road centerline crosses itself', { metrics: { x: round(hit.x), z: round(hit.z) }, repair: horizontalRepair }));
        break outer;
      }
    }
  }
  // --- vertical -----------------------------------------------------------
  const wave = waveMetrics(points);
  const grades = gradeCounts(points);
  if (grades.max > 0.25) issues.push(roadIssue('error', 'vertical.excessiveGrade', row, `Maximum grade ${(grades.max * 100).toFixed(1)}%`, { metrics: { maxGradePercent: round(grades.max * 100) }, repair: verticalRepair }));
  else if (grades.max > 0.12) issues.push(roadIssue('warning', 'vertical.steepGrade', row, `Grade ${(grades.max * 100).toFixed(1)}% exceeds 12%`, { metrics: { maxGradePercent: round(grades.max * 100) }, repair: verticalRepair }));
  if (wave.crossings >= 3 && wave.rms >= 0.11) issues.push(roadIssue('warning', 'vertical.wave', row, `Elevation oscillates ${wave.crossings} times (${round(wave.rms, 2)} m RMS)`, { metrics: { reversals: wave.reversals, crossings: wave.crossings, rms: round(wave.rms, 2), amplitude: round(wave.amplitude, 2), maxGradePercent: round(wave.maxGrade * 100) }, repair: { ...verticalRepair, strength: 2 } }));
  else if (wave.reversals >= 4) issues.push(roadIssue('info', 'vertical.gradeReversals', row, `${wave.reversals} grade direction changes`, { metrics: { reversals: wave.reversals, maxGradePercent: round(wave.maxGrade * 100) }, repair: verticalRepair }));
  const rawExtrema = elevationExtrema(raw, rawTable);
  const close = rawExtrema.filter((e, i) => i > 0 && e.station - rawExtrema[i - 1]!.station < 30 && Math.abs(e.amplitude) > 0.12);
  const heightOscillation = highFrequencyHeightOscillation(raw, rawTable);
  if (rawExtrema.length >= 3 && heightOscillation.count >= 3 && heightOscillation.amplitude >= 0.1)
    issues.push(roadIssue('warning', 'vertical.elevationPointOscillation', row, `${heightOscillation.count} high-frequency elevation control points`, { metrics: { oscillations: heightOscillation.count, amplitude: round(heightOscillation.amplitude, 2), closeExtrema: close.length }, repair: { ...verticalRepair, strength: 2 } }));
  const abrupt = segmentGradeChanges(raw, rawTable);
  if (abrupt.length) {
    const worst = abrupt.reduce((a, b) => a.change > b.change ? a : b);
    issues.push(roadIssue('warning', 'vertical.abruptGradeChange', row, `Grade changes ${(worst.change * 100).toFixed(0)}% over a short interval`, { station: round(worst.station), metrics: { gradeChangePercent: round(worst.change * 100) }, repair: verticalRepair }));
  }
  const redundantY = redundantElevationPoints(raw, rawTable);
  if (redundantY >= 2) issues.push(roadIssue('info', 'vertical.redundantElevationPoints', row, `${redundantY} redundant elevation points`, { metrics: { redundantPoints: redundantY }, repair: { op: 'simplifyRoad', id: row.id, tolerance: 0.1 } }));
  if (ramp) {
    const start = raw[0]?.y ?? 0, end = raw.at(-1)?.y ?? 0, net = Math.abs(end - start);
    let variation = 0;
    for (let i = 1; i < raw.length; i++) variation += Math.abs((raw[i]!.y ?? 0) - (raw[i - 1]!.y ?? 0));
    if (net > 1.5 && variation > net * 1.7) {
      // A turbine loop legitimately rises and falls over other roads. Only call
      // it a defect when extra travel is modest; otherwise suggest smoothing.
      const moderate = variation < net * 2.5;
      issues.push(roadIssue(moderate ? 'warning' : 'info', 'vertical.rampReversal', row, `Ramp rises/falls ${round(variation)} m for a ${round(net)} m net change`, { metrics: { netChange: round(net), totalVariation: round(variation) }, repair: { op: 'repairRamp', id: row.id, strength: 1.5, ...(moderate ? { monotonic: true } : {}) } }));
    }
  }
  return issues;
}
function endpointOf(row: CityRoad, end: 'start' | 'end'): CityPoint {
  const points = roadPoints(row);
  return end === 'start' ? points[0]! : points.at(-1)!;
}
function isOneWay(row: CityRoad): boolean { return row.travelDirection === 'forward' || row.travelDirection === 'reverse'; }
function cornerCrosswalk(row: CityRoad, mouth: CityPoint, outward: CityPoint, offset: number): { center: CityPoint; right: CityPoint; width: number } {
  const edges = roadEdges(row);
  return { center: { x: mouth.x + outward.x * offset, y: mouth.y, z: mouth.z + outward.z * offset }, right: { x: outward.z, z: -outward.x }, width: edges.right - edges.left };
}
function outsideStopOffset(j: CityIntersection, map: CityMapData, mouth: CityPoint, outward: CityPoint): number {
  return approachPaintOffsets(map,j,mouth,outward).boundaryOffset;
}
function obbOverlap(a: { center: CityPoint; right: CityPoint; width: number }, b: { center: CityPoint; right: CityPoint; width: number }): boolean {
  // Crosswalk bars are 0.55 m wide across and 3 m long along the approach.
  const axes = [a.right, { x: -a.right.z, z: a.right.x }, b.right, { x: -b.right.z, z: b.right.x }];
  const dx = b.center.x - a.center.x, dz = b.center.z - a.center.z;
  const halfDepth = 1.5;
  for (const axis of axes) {
    const ra = Math.abs(axis.x * a.right.x + axis.z * a.right.z) * a.width / 2 + Math.abs(axis.x * -a.right.z + axis.z * a.right.x) * halfDepth;
    const rb = Math.abs(axis.x * b.right.x + axis.z * b.right.z) * b.width / 2 + Math.abs(axis.x * -b.right.z + axis.z * b.right.x) * halfDepth;
    if (Math.abs(dx * axis.x + dz * axis.z) > ra + rb) return false;
  }
  return true;
}
function junctionMarkingIssues(j: CityIntersection, map: CityMapData, otherJunctions: readonly CityIntersection[]): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [], name = j.id;
  const add = (severity: DiagnosticSeverity, code: string, message: string, extra: Partial<DiagnosticIssue> = {}) => issues.push({ severity, code, intersectionId: name, message, ...extra });
  const footprint = j.pavementFootprint;
  if (!footprint) add('warning', 'intersection.noFootprint', 'Junction has no authored pavement footprint', { repair: { op: 'repairIntersection', id: name } });
  if (j.markingFootprint?.kind === 'junction' || (!j.markingFootprint && footprint))
    add('info', 'marking.genericFootprint', 'Marking suppression uses a generic footprint instead of the final pavement polygon', { repair: { op: 'repairIntersection', id: name } });
  const points = new Map<string, { row: CityRoad; mouth: CityPoint; outward: CityPoint; local: CityPoint; incoming: boolean }>();
  for (const c of j.connections) {
    const row = map.roads.find(r => r.id === c.roadId);
    if (!row) { add('error', 'intersection.missingApproach', `Connection ${c.roadId} has no road`); continue; }
    const path = roadPoints(row), start = c.end === 'start', neighbour = start ? path[1] ?? path[0]! : path.at(-2) ?? path.at(-1)!;
    const mouth = endpointOf(row, c.end);
    const mx = neighbour.x - mouth.x, mz = neighbour.z - mouth.z, ml = Math.hypot(mx, mz) || 1;
    const outward = { x: mx / ml, z: mz / ml }, local = { x: mouth.x - j.position.x, z: mouth.z - j.position.z };
    if (footprint && !junctionSurfaceContains(j, map, mouth, 1.0)) add('warning', 'intersection.mouthOutsideFootprint', `Approach ${c.roadId}:${c.end} is outside its pavement footprint`, { station: 0, metrics: { roadId: c.roadId }, repair: { op: 'repairIntersection', id: name } });
    const expected = j.pavementHeights?.[c.port] ?? j.position.y ?? 0;
    if (Math.abs((mouth.y ?? 0) - expected) > 0.2) add('error', 'intersection.heightMismatch', `Approach ${c.roadId} is ${round((mouth.y ?? 0) - expected, 2)} m above the junction mouth`, { metrics: { roadId: c.roadId, gap: round(Math.abs((mouth.y ?? 0) - expected), 2) } });
    if (polylineLength(roadPoints(row)) < 12) add('warning', 'intersection.shortApproach', `Approach ${c.roadId} is only ${round(polylineLength(roadPoints(row)))} m long`, { metrics: { roadId: c.roadId, length: round(polylineLength(roadPoints(row))) }, repair: { op: 'repairIntersection', id: name } });
    const incoming = row.travelDirection === 'two-way' || (row.travelDirection === 'forward') === (c.end === 'end');
    points.set(c.port, { row, mouth, outward, local, incoming });
  }
  if (footprint) {
    const h = Math.max(...footprint.map(p => Math.hypot(p.x, p.z)));
    for (const [port, p] of points) if (Math.hypot(p.local.x, p.local.z) > h + 3) add('warning', 'intersection.approachReach', `Arm ${port} extends ${round(Math.hypot(p.local.x, p.local.z) - h)} m beyond the footprint`, { metrics: { port, excess: round(Math.hypot(p.local.x, p.local.z) - h) }, repair: { op: 'repairIntersection', id: name } });
  }
  // Acute approaches: compare actual outward tangents. Divided pairs are
  // expected to be nearly parallel, so they are excluded by name/one-way.
  const entries = [...points.entries()];
  for (let i = 0; i < entries.length; i++) for (let k = i + 1; k < entries.length; k++) {
    const a = entries[i]![1], b = entries[k]![1];
    if (a.row.id === b.row.id) continue;
    const dot = a.outward.x * b.outward.x + a.outward.z * b.outward.z;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot))) / R;
    if (angle < 30) {
      const divided = isOneWay(a.row) && isOneWay(b.row) && (a.row.roadNameId && a.row.roadNameId === b.row.roadNameId || a.row.groupId && a.row.groupId === b.row.groupId);
      if (!divided) add('warning', 'intersection.acuteApproach', `Arms ${entries[i]![0]} and ${entries[k]![0]} meet at ${round(angle, 0)}°`, { metrics: { angleDegrees: round(angle, 0), portA: entries[i]![0], portB: entries[k]![0] }, repair: { op: 'repairIntersection', id: name } });
    }
  }
  // Stale port bearings from an older edit.
  if (j.portAngles) for (const [port, entry] of points) {
    const authored = (j.portAngles as Record<string, number | undefined>)[port];
    if (authored === undefined) continue;
    const actual = Math.atan2(entry.outward.x, -entry.outward.z);
    const delta = Math.abs(Math.atan2(Math.sin(actual - authored), Math.cos(actual - authored))) / R;
    if (delta > 25) add('warning', 'intersection.stalePortAngle', `Port ${port} bearing differs from the road by ${round(delta, 0)}°`, { metrics: { port, deltaDegrees: round(delta, 0) }, repair: { op: 'repairIntersection', id: name } });
  }
  // Marking placement: crosswalks are now generated outside the final mouth.
  const crosswalks: { port: string; box: { center: CityPoint; right: CityPoint; width: number }; row: CityRoad }[] = [];
  for (const [port, entry] of points) {
    const offset = outsideStopOffset(j, map, entry.mouth, entry.outward);
    const stopOffset = offset + 4.4;
    const stop = { x: entry.mouth.x + entry.outward.x * stopOffset, y: entry.mouth.y, z: entry.mouth.z + entry.outward.z * stopOffset };
    if (offset >= 30 && footprint) add('warning', 'intersection.approachKink', `Approach ${port} runs along the junction edge; smooth it before rebuilding markings`, { metrics: { port, offset }, repair: { op: 'repairIntersection', id: name } });
    else if (offset > 8) add('warning', 'marking.stopLineDisplaced', `Stop line on ${port} is ${round(offset)} m from the mouth because the approach is tangential`, { metrics: { port, offset: round(offset) }, repair: { op: 'repairIntersection', id: name } });
    else if (footprint && junctionSurfaceContains(j, map, stop, 0.05)) add('error', 'marking.stopLineInside', `Stop line on ${port} sits inside the junction pavement`, { metrics: { port }, repair: { op: 'repairIntersection', id: name } });
    if (j.signalized) crosswalks.push({ port, row: entry.row, box: cornerCrosswalk(entry.row, entry.mouth, entry.outward, offset + 2.2) });
  }
  for (let i = 0; i < crosswalks.length; i++) for (let k = i + 1; k < crosswalks.length; k++) {
    if (!obbOverlap(crosswalks[i]!.box, crosswalks[k]!.box)) continue;
    add('warning', 'marking.crosswalkOverlap', `Crosswalks on ${crosswalks[i]!.port} and ${crosswalks[k]!.port} overlap`, { metrics: { portA: crosswalks[i]!.port, portB: crosswalks[k]!.port }, repair: { op: 'repairIntersection', id: name } });
  }
  for (const other of otherJunctions) {
    const d = distance(j.position, other.position);
    if (d < 8 && Math.abs((j.position.y ?? 0) - (other.position.y ?? 0)) < 0.5) add('error', 'intersection.duplicate', `Junction duplicates ${other.id} within ${round(d)} m`, { metrics: { duplicateId: other.id, distance: round(d) }, repair: { op: 'repairIntersection', id: name } });
    else if (d < 30) {
      const divides = j.connections.some(a => other.connections.some(b => {
        if (a.roadId === b.roadId) return true;
        const ra = map.roads.find(r => r.id === a.roadId), rb = map.roads.find(r => r.id === b.roadId);
        return !!ra && !!rb && isOneWay(ra) && isOneWay(rb) && !!ra.roadNameId && ra.roadNameId === rb.roadNameId;
      }));
      if (divides) add('warning', 'intersection.closePair', `Junction is ${round(d)} m from ${other.id}; likely one logical intersection`, { metrics: { otherId: other.id, distance: round(d) }, repair: { op: 'repairIntersection', id: name } });
    }
  }
  return issues;
}
function corridorIndex(map: CityMapData): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const corridor of map.editing?.corridors ?? []) for (const id of corridor.roadIds) {
    const list = index.get(id) ?? []; list.push(corridor.id); index.set(id, list);
  }
  return index;
}
function checkEndpoints(rows: readonly CityRoad[], map: CityMapData): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const used = new Set<string>();
  for (const j of map.intersections) for (const c of j.connections) used.add(`${c.roadId}:${c.end}`);
  for (const link of map.roadLinks ?? []) { used.add(`${link.from.roadId}:${link.from.end}`); used.add(`${link.to.roadId}:${link.to.end}`); }
  const endpoints: { row: CityRoad; end: 'start' | 'end'; point: CityPoint; used: boolean }[] = [];
  for (const row of rows) for (const end of ['start', 'end'] as const) endpoints.push({ row, end, point: endpointOf(row, end), used: used.has(`${row.id}:${end}`) });
  for (const item of endpoints) {
    if (item.used) continue;
    const kind = roadFunction(item.row);
    const severity: DiagnosticSeverity = kind === 'expressway' || kind === 'arterial' ? 'warning' : 'info';
    issues.push(roadIssue(severity, 'topology.deadEnd', item.row, `Open ${item.end} endpoint; verify this is an intentional terminus`, { station: round(item.end === 'start' ? 0 : polylineLength(roadPoints(item.row))), metrics: { end: item.end }, repair: undefined }));
  }
  // Nearby endpoint pairs that look intended but are not explicitly linked.
  for (let i = 0; i < endpoints.length; i++) for (let k = i + 1; k < endpoints.length; k++) {
    const a = endpoints[i]!, b = endpoints[k]!;
    if (a.row.id === b.row.id || a.used || b.used) continue;
    const gap = distance(a.point, b.point);
    if (gap > 0.05 && gap < 3 && Math.abs((a.point.y ?? 0) - (b.point.y ?? 0)) < 0.5) {
      issues.push(roadIssue('warning', 'topology.endpointGap', a.row, `${round(gap, 2)} m gap to ${b.row.id}:${b.end} without an explicit link`, { metrics: { otherRoadId: b.row.id, gap: round(gap, 2) } }));
    }
  }
  for (const row of rows) {
    const length = polylineLength(roadPoints(row));
    const ends = ['start', 'end'].filter(end => used.has(`${row.id}:${end}`)).length;
    if (length < 5) issues.push(roadIssue('warning', 'topology.tinyFragment', row, `Road fragment is only ${round(length)} m long`, { metrics: { length: round(length), connectedEnds: ends }, repair: undefined }));
    else if (length < 16 && ends === 2) issues.push(roadIssue('info', 'topology.shortConnector', row, `Short connector between junctions (${round(length)} m)`, { metrics: { length: round(length) }, repair: undefined }));
    if ((row.markings !== false) && length < 10 && ends < 2) issues.push(roadIssue('warning', 'marking.fragmentMarkings', row, 'Tiny road fragment still carries road markings', { metrics: { length: round(length) }, repair: undefined }));
  }
  return issues;
}
function checkCrossings(rows: readonly CityRoad[], map: CityMapData, index?: IndexLike): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  for (const row of rows) {
    const pts = roadPoints(row);
    const nearby = new Map<string, CityRoad>();
    if (index) for (const id of index.query(bounds(pts, 60))) { const other = map.roads.find(r => r.id === id); if (other) nearby.set(id, other); }
    else for (const other of map.roads) if (overlaps(bounds(pts, 60), bounds(roadPoints(other), 60))) nearby.set(other.id, other);
    for (const other of nearby.values()) {
      if (other.id === row.id || other.id < row.id) continue;
      const otherPoints = roadPoints(other);
      let handled = false;
      for (let i = 1; i < pts.length && !handled; i++) for (let k = 1; k < otherPoints.length && !handled; k++) {
        const hit = segmentIntersection(pts[i - 1]!, pts[i]!, otherPoints[k - 1]!, otherPoints[k]!);
        if (!hit) continue;
        const a = pts[i - 1]!, b = pts[i]!, c = otherPoints[k - 1]!, d = otherPoints[k]!;
        const ux = b.x - a.x, uz = b.z - a.z, vx = d.x - c.x, vz = d.z - c.z;
        const den = ux * vz - uz * vx;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((c.x - a.x) * vz - (c.z - a.z) * vx) / den, s = ((c.x - a.x) * uz - (c.z - a.z) * ux) / den;
        const ya = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, yb = (c.y ?? 0) + ((d.y ?? 0) - (c.y ?? 0)) * s;
        const kindA = roadFunction(row), kindB = roadFunction(other);
        if (Math.abs(ya - yb) < 0.5 && (kindA === 'expressway' || kindB === 'expressway' || kindA === 'ramp' || kindB === 'ramp')) {
          const junction = map.intersections.some(j => j.connections.some(x => x.roadId === row.id) && j.connections.some(x => x.roadId === other.id));
          const link = (map.roadLinks ?? []).some(l => [l.from.roadId, l.to.roadId].includes(row.id) && [l.from.roadId, l.to.roadId].includes(other.id));
          if (!junction && !link) issues.push(roadIssue('error', 'topology.expresswayCrossing', row, `Controlled-access crossing with ${other.id} has no junction or link`, { metrics: { otherRoadId: other.id }, repair: undefined }));
        } else if (Math.abs(ya - yb) > 0.5 && Math.abs(ya - yb) < 5.5) {
          issues.push(roadIssue('warning', 'topology.lowClearance', row, `Crossing clearance with ${other.id} is ${round(Math.abs(ya - yb), 2)} m`, { metrics: { otherRoadId: other.id, clearance: round(Math.abs(ya - yb), 2) }, repair: undefined }));
        }
        handled = true; // one crossing per pair is enough for a local receipt
      }
    }
  }
  return issues;
}
function chooseScope(map: CityMapData, scope: DiagnosticScope, index?: IndexLike): { label: string; rows: CityRoad[]; junctions: CityIntersection[] } {
  // Explicit full scope must not depend on bounds, index contents or local caps.
  if (scope.full) return { label: 'full', rows: map.roads, junctions: map.intersections };
  let rows: CityRoad[] = [], junctions: CityIntersection[] = [], label = '';
  const byId = new Map(map.roads.map(r => [r.id, r]));
  const junctionFor = (ids: Set<string>) => map.intersections.filter(j => j.connections.some(c => ids.has(c.roadId)));
  if (scope.roadId) {
    const row = byId.get(scope.roadId);
    if (!row) throw new Error(`Unknown road: ${scope.roadId}`);
    rows = [row]; junctions = junctionFor(new Set([row.id]));
    const p = roadPoints(row), area = bounds(p, 90);
    for (const j of map.intersections) if (overlaps(bounds([j.position], 1), area)) junctions.push(j);
    label = `road:${row.id}`;
  } else if (scope.corridorId) {
    const corridor = map.editing?.corridors.find(c => c.id === scope.corridorId);
    if (!corridor) throw new Error(`Unknown corridor: ${scope.corridorId}`);
    rows = corridor.roadIds.map(id => byId.get(id)).filter((r): r is CityRoad => !!r);
    const ids = new Set(rows.map(r => r.id));
    junctions = map.intersections.filter(j => j.connections.some(c => ids.has(c.roadId)) || rows.some(r => overlaps(bounds(roadPoints(r), 1), bounds([j.position], 80))));
    label = `corridor:${corridor.id}`;
  } else if (scope.intersectionId) {
    const j = map.intersections.find(j => j.id === scope.intersectionId);
    if (!j) throw new Error(`Unknown intersection: ${scope.intersectionId}`);
    rows = j.connections.map(c => byId.get(c.roadId)).filter((r): r is CityRoad => !!r);
    junctions = [j, ...map.intersections.filter(other => other.id !== j.id && distance(other.position, j.position) < 90)];
    label = `intersection:${j.id}`;
  } else {
    const area = scope.bbox ?? (scope.center ? bounds([scope.center], scope.radius ?? 200) : undefined);
    if (!area) throw new Error('diagnose needs roadId, corridorId, intersectionId, bbox/center or full:true');
    const ids = new Set(index?.query(area) ?? map.roads.filter(r => overlaps(bounds(roadPoints(r), 1), area)).map(r => r.id));
    rows = map.roads.filter(r => ids.has(r.id));
    junctions = map.intersections.filter(j => overlaps(bounds([j.position], 1), area) || j.connections.some(c => ids.has(c.roadId)));
    label = scope.bbox ? 'bbox' : scope.center ? `center:${scope.center.x},${scope.center.z}` : 'full';
  }
  // Keep local diagnostics bounded even when a caller passes an enormous bbox.
  const cap = 600;
  if (rows.length > cap) rows = rows.slice(0, cap);
  const rowIds = new Set(rows.map(r => r.id));
  junctions = junctions.filter(j => !j.connections.length || j.connections.some(c => rowIds.has(c.roadId)) || scope.intersectionId === j.id);
  const seen = new Set<string>();
  junctions = junctions.filter(j => seen.has(j.id) ? false : (seen.add(j.id), true));
  return { label, rows, junctions };
}
export function diagnoseMap(map: CityMapData, scope: DiagnosticScope = {}, options: Options = {}): DiagnosticReport {
  const chosen = chooseScope(map, scope, options.index);
  const corridors = corridorIndex(map), issues: DiagnosticIssue[] = [];
  const add = (issue: DiagnosticIssue) => {
    if (issue.roadId && !issue.corridorId) issue.corridorId = corridors.get(issue.roadId)?.[0];
    issues.push(issue);
  };
  for (const row of chosen.rows) for (const issue of diagnoseRoad(row)) add(issue);
  for (const issue of checkEndpoints(chosen.rows, map)) add(issue);
  for (const issue of checkCrossings(chosen.rows, map, options.index)) add(issue);
  for (const j of chosen.junctions) for (const issue of junctionMarkingIssues(j, map, map.intersections.filter(other => other.id !== j.id && distance(other.position, j.position) < 60))) add(issue);
  // Dedupe repeated pair reports.
  const seen = new Set<string>(), unique: DiagnosticIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.code}|${issue.roadId ?? ''}|${issue.intersectionId ?? ''}|${issue.station ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key); unique.push(issue);
  }
  const min = scope.minSeverity ? severityRank[scope.minSeverity] : 0;
  const codes = scope.codes?.length ? scope.codes : undefined;
  const filtered = unique.filter(issue => severityRank[issue.severity] >= min && (!codes || codes.some(code => issue.code === code || issue.code.startsWith(code.endsWith('.') ? code : code + '.') || issue.code.startsWith(code))));
  filtered.sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || a.code.localeCompare(b.code) || (a.station ?? 0) - (b.station ?? 0));
  const limit = Math.max(1, Math.min(scope.limit ?? 100, 1000));
  const counts: DiagnosticReport['counts'] = { error: 0, warning: 0, info: 0, total: filtered.length, bySeverity: { error: 0, warning: 0, info: 0 }, byCode: {} };
  for (const issue of filtered) {
    counts[issue.severity]++;
    counts.bySeverity[issue.severity]++;
    counts.byCode[issue.code] = (counts.byCode[issue.code] ?? 0) + 1;
  }
  return {
    scope: chosen.label, revision: options.revision,
    coverage: { roadsChecked: chosen.rows.length, roadsTotal: map.roads.length, intersectionsChecked: chosen.junctions.length, intersectionsTotal: map.intersections.length },
    counts, issues: options.retainAllIssues ? filtered : filtered.slice(0, limit),
    truncated: !options.retainAllIssues && filtered.length > limit,
  };
}
/** Page an immutable complete receipt; this never loads or diagnoses a map. */
export function pageDiagnosticReport(report: DiagnosticReport, request: DiagnosticPageRequest = {}): DiagnosticReport {
  if (!Array.isArray(report.issues) || report.truncated || report.issues.length !== report.counts?.total)
    throw new Error('Diagnosis receipt is incomplete; paging requires a complete diagnose --out receipt');
  const offset = request.offset ?? 0, requestedLimit = request.limit ?? 100;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(requestedLimit) || requestedLimit < 1)
    throw new Error('Diagnosis page requires a non-negative integer offset and a positive integer limit');
  const limit = Math.min(requestedLimit, 1000);
  const min = request.minSeverity ? severityRank[request.minSeverity] : 0;
  const codes = request.codes?.length ? request.codes : undefined;
  const selected = report.issues.filter(issue => severityRank[issue.severity] >= min && (!codes || codes.some(code => issue.code === code || issue.code.startsWith(code.endsWith('.') ? code : code + '.') || issue.code.startsWith(code))));
  const issues = selected.slice(offset, offset + limit), end = offset + issues.length;
  return {
    ...report, issues, truncated: issues.length !== selected.length,
    pagination: { offset, limit, total: selected.length, returned: issues.length, nextOffset: end < selected.length ? end : null },
  };
}
/** Turn a diagnostic receipt into explicit repair commands (never implicit). */
export function repairCommandsFromDiagnosis(report: DiagnosticReport, options: { codes?: string[]; minSeverity?: DiagnosticSeverity; limit?: number } = {}): { op: string; [key: string]: unknown }[] {
  const min = severityRank[options.minSeverity ?? 'warning'], commands = new Map<string, RepairSuggestion>();
  for (const issue of report.issues) {
    if (severityRank[issue.severity] < min) continue;
    if (options.codes?.length && !options.codes.some(code => issue.code === code || issue.code.startsWith(code))) continue;
    if (!issue.repair) continue;
    const key = `${issue.repair.op}|${issue.repair.id}`, previous = commands.get(key);
    if (!previous) { commands.set(key, { ...issue.repair }); continue; }
    // Several diagnostics can suggest the same repair. Merge them and keep
    // the strongest requested smoothing rather than the alphabetically first.
    const merged: RepairSuggestion = { ...previous, ...issue.repair };
    const strength = Math.max(Number(previous.strength ?? 0), Number(issue.repair.strength ?? 0));
    if (strength > 0) merged.strength = strength;
    if (previous.monotonic === true || issue.repair.monotonic === true) merged.monotonic = true;
    commands.set(key, merged);
  }
  return [...commands.values()].slice(0, options.limit ?? commands.size) as unknown as { op: string; [key: string]: unknown }[];
}
