import type { CityPoint, CityRoad } from '../world/city/CityMapData';
import { polylineLength, roadPoints, sampleAt } from '../world/city/geometry';
import { roadFunction } from '../world/city/RoadClassification';

/**
 * Small, deterministic repair kernels used by the editor CLI. These are not a
 * civil-engineering solver: each function only reshapes an authored centerline
 * while keeping requested endpoints fixed.
 */
export interface AlignmentOptions {
  start?: number;
  end?: number;
  /** 0..2; 1 is the normal amount, >1 removes larger waves. */
  strength?: number;
  preserveEndpoints?: boolean;
  /** Douglas-Peucker tolerance for the repaired control polyline. */
  simplifyTolerance?: number;
  curve?: 'polyline' | 'smooth';
}
export interface ElevationOptions {
  start?: number;
  end?: number;
  /** 0..2 vertical smoothing amount. */
  strength?: number;
  preserveEndpoints?: boolean;
  /** Preferred target grade (default 0.08). Hard map limit is handled by validation. */
  maxGrade?: number;
  /** For ramps and deliberate grades. */
  monotonic?: boolean;
  /** 0.02 m default; removes only effectively duplicate profile points. */
  simplifyTolerance?: number;
}
export interface RepairMetrics {
  beforeMaxGrade: number;
  afterMaxGrade: number;
  beforeGradeReversals: number;
  afterGradeReversals: number;
  beforeMaxTurnDegrees?: number;
  afterMaxTurnDegrees?: number;
  removedControlPoints: number;
  affectedStart: number;
  affectedEnd: number;
  maxDeviation: number;
  maxHeightDelta: number;
  monotonic?: boolean;
  note?: string;
}
const R = Math.PI / 180;
const horizontal = (a: CityPoint, b: CityPoint): number => Math.hypot(b.x - a.x, b.z - a.z);
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const round = (value: number, digits = 2): number => Math.round(value * 10 ** digits) / 10 ** digits;
function stationTable(points: readonly CityPoint[]): number[] {
  const result = [0];
  for (let i = 1; i < points.length; i++) result.push(result[i - 1]! + horizontal(points[i - 1]!, points[i]!));
  return result;
}
function rangePoints(points: readonly CityPoint[], stations: readonly number[], start: number, end: number): CityPoint[] {
  const at = (station: number): CityPoint => ({ ...(points[stations.indexOf(station)] ?? sampleAt(points, station).point) });
  return [at(start), ...points.filter((_, i) => stations[i]! > start && stations[i]! < end).map(p => ({ ...p })), at(end)];
}
function replaceRange(points: readonly CityPoint[], stations: readonly number[], start: number, end: number, replacement: readonly CityPoint[]): CityPoint[] {
  return [...points.filter((_, i) => stations[i]! < start), ...replacement, ...points.filter((_, i) => stations[i]! > end)].map(p => ({ ...p }));
}
function sampleRange(points: readonly CityPoint[], from: number, to: number, step: number): CityPoint[] {
  if (to - from < 0.2) return [sampleAt(points, from).point, sampleAt(points, to).point];
  const result: CityPoint[] = [];
  for (let d = from; d < to; d += step) result.push({ ...sampleAt(points, d).point });
  result.push({ ...sampleAt(points, to).point });
  return result;
}
function perpendicular(a: CityPoint, b: CityPoint, p: CityPoint): number {
  const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
  if (length < 1e-6) return horizontal(a, p);
  return Math.abs((p.x - a.x) * dz - (p.z - a.z) * dx) / length;
}
/** RDP with an elevation-error term, so a straight road still keeps its profile bends. */
export function simplifyPoints(points: readonly CityPoint[], toleranceXZ = 0.25, toleranceY = 0.04): CityPoint[] {
  if (points.length <= 2) return points.map(p => ({ ...p }));
  const keep = new Set<number>([0, points.length - 1]);
  const visit = (first: number, last: number): void => {
    if (last <= first + 1) return;
    let index = -1, best = -1;
    const a = points[first]!, b = points[last]!;
    const span = Math.max(1e-6, horizontal(a, b));
    for (let i = first + 1; i < last; i++) {
      const p = points[i]!;
      const t = clamp(((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (span * span), 0, 1);
      const xz = perpendicular(a, b, p);
      const y = Math.abs((p.y ?? 0) - ((a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t));
      const error = Math.max(xz / toleranceXZ, toleranceY > 0 ? y / toleranceY : 0);
      if (error > best) { best = error; index = i; }
    }
    if (best > 1 && index > 0) { keep.add(index); visit(first, index); visit(index, last); }
  };
  visit(0, points.length - 1);
  return [...keep].sort((a, b) => a - b).map(i => ({ ...points[i]! }));
}
/**
 * Replace sharp polyline corners with tangent circular arcs. The road's
 * endpoints are never moved; only interior vertices inside the repair range.
 */
export function filletCorners(points: readonly CityPoint[], options: { minAngleDegrees?: number; maxRadius?: number; step?: number } = {}): { points: CityPoint[]; filleted: number } {
  const result = points.map(p => ({ ...p })), minAngle = (options.minAngleDegrees ?? 40) * R, maxRadius = options.maxRadius ?? 40, step = options.step ?? 0.75;
  let filleted = 0;
  for (let pass = 0; pass < 24; pass++) {
    let index = -1, best = minAngle;
    for (let i = 1; i < result.length - 1; i++) {
      const a = result[i - 1]!, b = result[i]!, c = result[i + 1]!;
      const turn = Math.abs(turnAngle(a, b, c));
      if (turn < best || turn > 150 * R || Math.min(horizontal(a, b), horizontal(b, c)) < 0.5) continue;
      best = turn; index = i;
    }
    if (index < 0) break;
    const a = result[index - 1]!, b = result[index]!, c = result[index + 1]!;
    const l1 = horizontal(a, b), l2 = horizontal(b, c);
    const u1 = { x: (a.x - b.x) / l1, z: (a.z - b.z) / l1 }, u2 = { x: (c.x - b.x) / l2, z: (c.z - b.z) / l2 };
    const delta = Math.acos(clamp(u1.x * u2.x + u1.z * u2.z, -1, 1)); // interior angle
    const turn = Math.PI - delta; // deviation from straight
    if (turn < minAngle || turn > 150 * R) break;
    let tangent = Math.min(l1, l2) * 0.8;
    let radius = tangent / Math.tan(turn / 2);
    if (!Number.isFinite(radius) || radius < 0.5) { result.splice(index, 1); continue; }
    if (radius > maxRadius) { radius = maxRadius; tangent = radius * Math.tan(turn / 2); }
    if (tangent > Math.min(l1, l2) * 0.9) { tangent = Math.min(l1, l2) * 0.9; radius = tangent / Math.tan(turn / 2); }
    const t1 = { x: b.x + u1.x * tangent, y: (b.y ?? 0) + ((a.y ?? 0) - (b.y ?? 0)) * (tangent / l1), z: b.z + u1.z * tangent };
    const t2 = { x: b.x + u2.x * tangent, y: (b.y ?? 0) + ((c.y ?? 0) - (b.y ?? 0)) * (tangent / l2), z: b.z + u2.z * tangent };
    const bisectorLength = Math.hypot(u1.x + u2.x, u1.z + u2.z);
    if (bisectorLength < 1e-6) { result.splice(index, 1); continue; }
    const bx = (u1.x + u2.x) / bisectorLength, bz = (u1.z + u2.z) / bisectorLength;
    const distance = radius / Math.cos(turn / 2);
    const cx = b.x + bx * distance, cz = b.z + bz * distance;
    const startAngle = Math.atan2(t1.z - cz, t1.x - cx), endAngle = Math.atan2(t2.z - cz, t2.x - cx);
    const direction = Math.sign(turnAngle(a, b, c));
    let sweep = endAngle - startAngle;
    sweep = Math.atan2(Math.sin(sweep), Math.cos(sweep));
    if (Math.sign(sweep) !== direction && Math.abs(sweep) > 1e-6) sweep = direction * (Math.PI * 2 - Math.abs(sweep));
    const count = Math.max(2, Math.ceil(Math.abs(sweep) * radius / step));
    const arc: CityPoint[] = [];
    for (let k = 0; k <= count; k++) {
      const angle = startAngle + sweep * (k / count);
      const t = k / count;
      arc.push({ x: cx + Math.cos(angle) * radius, y: (t1.y ?? 0) + ((t2.y ?? 0) - (t1.y ?? 0)) * t, z: cz + Math.sin(angle) * radius });
    }
    result.splice(index, 1, ...arc);
    filleted++;
  }
  return { points: result, filleted };
}
function turnAngle(a: CityPoint, b: CityPoint, c: CityPoint): number {
  const h1 = Math.atan2(b.z - a.z, b.x - a.x), h2 = Math.atan2(c.z - b.z, c.x - b.x);
  return Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1));
}
function movingAverage(points: readonly CityPoint[], radius: number): CityPoint[] {
  const table = stationTable(points), result: CityPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    let x = 0, z = 0, y = 0, count = 0;
    for (let k = 0; k < points.length; k++) {
      if (Math.abs(table[k]! - table[i]!) > radius) continue;
      x += points[k]!.x; z += points[k]!.z; y += points[k]!.y ?? 0; count++;
    }
    result.push({ x: x / count, y: y / count, z: z / count });
  }
  return result;
}
function maxTurnDegrees(points: readonly CityPoint[]): number {
  let max = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]!, b = points[i]!, c = points[i + 1]!;
    const h1 = Math.atan2(b.x - a.x, b.z - a.z), h2 = Math.atan2(c.x - b.x, c.z - b.z);
    max = Math.max(max, Math.abs(Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1))) / R);
  }
  return max;
}
export function gradeMetrics(points: readonly CityPoint[]): { maxGrade: number; reversals: number } {
  const table = stationTable(points);
  let maxGrade = 0, reversals = 0, previous = 0;
  for (let i = 1; i < points.length; i++) {
    const length = table[i]! - table[i - 1]!;
    if (length < 0.05) continue;
    const grade = ((points[i]!.y ?? 0) - (points[i - 1]!.y ?? 0)) / length;
    maxGrade = Math.max(maxGrade, Math.abs(grade));
    if (Math.abs(grade) < 0.006) continue;
    const sign = Math.sign(grade);
    if (previous && sign !== previous) reversals++;
    previous = sign;
  }
  return { maxGrade, reversals };
}
function emptyMetrics(start: number, end: number): RepairMetrics {
  return { beforeMaxGrade: 0, afterMaxGrade: 0, beforeGradeReversals: 0, afterGradeReversals: 0, removedControlPoints: 0, affectedStart: round(start), affectedEnd: round(end), maxDeviation: 0, maxHeightDelta: 0 };
}
function nearestOnPath(points: readonly CityPoint[], target: CityPoint): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    const t = l2 ? clamp(((target.x - a.x) * dx + (target.z - a.z) * dz) / l2, 0, 1) : 0;
    best = Math.min(best, Math.hypot(target.x - a.x - dx * t, target.z - a.z - dz * t));
  }
  return best;
}
function maxHeightDelta(original: readonly CityPoint[], originalStations: readonly number[], repaired: readonly CityPoint[]): number {
  const originalHeights = original.map(p => p.y ?? 0);
  let max = 0;
  for (const p of repaired) {
    const station = nearestStation(original, p);
    max = Math.max(max, Math.abs((p.y ?? 0) - profileAt(originalStations, originalHeights, station)));
  }
  return max;
}
function nearestStation(points: readonly CityPoint[], target: CityPoint): number {
  const table = stationTable(points);
  let best = Infinity, station = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!, dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    const t = l2 ? clamp(((target.x - a.x) * dx + (target.z - a.z) * dz) / l2, 0, 1) : 0;
    const d = Math.hypot(target.x - a.x - dx * t, target.z - a.z - dz * t);
    if (d < best) { best = d; station = table[i - 1]! + Math.sqrt(l2) * t; }
  }
  return station;
}
/** Horizontal smoothing with fixed endpoints and a preserved range boundary. */
export function smoothAlignment(source: readonly CityPoint[], options: AlignmentOptions = {}): { points: CityPoint[]; metrics: RepairMetrics } {
  const original = source.map(p => ({ ...p })), originalStations = stationTable(original);
  const length = polylineLength(original);
  const snap=(station:number)=>originalStations.find(s=>Math.abs(s-station)<.05)??station;
  const start = snap(clamp(options.start ?? 0, 0, length)), end = snap(clamp(options.end ?? length, start, length));
  if (end - start < 1 || original.length < 3) return { points: original, metrics: emptyMetrics(start, end) };
  const preserve = start > 0 || end < length || options.preserveEndpoints !== false;
  const strength = clamp(options.strength ?? 1, 0.1, 2.5);
  const tolerance = Math.max(0.05, options.simplifyTolerance ?? 0.8);
  const authoredRange = rangePoints(original, originalStations, start, end);
  const first = authoredRange[0]!, last = authoredRange.at(-1)!;
  // Keep the authored control points inside the range, round sharp interior
  // corners with tangent arcs, then low-pass the result.
  const authoredInterior = authoredRange.slice(1, -1);
  const filleted = filletCorners([{ ...first }, ...authoredInterior, { ...last }], { minAngleDegrees: 40, maxRadius: 36, step: 0.75 });
  const filletLength = polylineLength(filleted.points);
  const range = sampleRange(filleted.points, 0, filletLength, 2);
  const smoothed = movingAverage(range, clamp(8 + strength * 10, 10, 35));
  // Pin the two range ends exactly, then taper the average back into the
  // authored shape so the repair does not create a new kink at its boundary.
  const rangeTable = stationTable(smoothed);
  const taper = Math.min(8, Math.max(2, (end - start) / 8));
  for (let i = 1; i < smoothed.length - 1; i++) {
    const distanceFromEnd = Math.min(rangeTable[i]!, filletLength - rangeTable[i]!);
    const weight = taper > 0 ? clamp(distanceFromEnd / taper, 0, 1) : 1;
    const authoredStation = start + (end - start) * (rangeTable[i]! / Math.max(1, filletLength));
    const authored = sampleAt(original, authoredStation).point;
    smoothed[i] = {
      x: authored.x + (smoothed[i]!.x - authored.x) * weight,
      y: (authored.y ?? 0) + ((smoothed[i]!.y ?? 0) - (authored.y ?? 0)) * weight,
      z: authored.z + (smoothed[i]!.z - authored.z) * weight,
    };
  }
  if (preserve) { smoothed[0] = { ...first }; smoothed[smoothed.length - 1] = { ...last }; }
  const simplified = simplifyPoints(smoothed, tolerance, 0.06);
  // Keep the authored points outside the repaired range, including their
  // individual control points and exact elevations.
  const merged = replaceRange(original, originalStations, start, end, simplified);
  let maxDeviation = 0;
  for (const p of merged) maxDeviation = Math.max(maxDeviation, nearestOnPath(original, p));
  return {
    points: merged,
    metrics: {
      ...emptyMetrics(start, end),
      beforeMaxTurnDegrees: round(maxTurnDegrees(original)), afterMaxTurnDegrees: round(maxTurnDegrees(merged)),
      removedControlPoints: Math.max(0, original.length - merged.length), maxDeviation: round(maxDeviation, 2),
      maxHeightDelta: round(maxHeightDelta(original, originalStations, merged), 3),
    },
  };
}
function enforceMonotonic(values: readonly number[], increasing: boolean): number[] {
  const result = values.slice(), start = values[0]!, end = values.at(-1)!;
  if (increasing ? start > end : start < end) return result; // impossible; keep the authored endpoints.
  // Forward and backward passes keep both fixed endpoints and are much cheaper
  // and more predictable than a full constrained spline for these short ramps.
  let previous = start;
  for (let i = 1; i < result.length - 1; i++) {
    result[i] = increasing ? clamp(result[i]!, previous, end) : clamp(result[i]!, end, previous);
    if (increasing && result[i]! < previous) result[i] = previous;
    if (!increasing && result[i]! > previous) result[i] = previous;
    previous = result[i]!;
  }
  let next = end;
  for (let i = result.length - 2; i > 0; i--) {
    result[i] = increasing ? clamp(result[i]!, start, next) : clamp(result[i]!, next, start);
    if (increasing && result[i]! > next) result[i] = next;
    if (!increasing && result[i]! < next) result[i] = next;
    next = result[i]!;
  }
  result[0] = start; result[result.length - 1] = end;
  return result;
}
function limitGrade(values: readonly number[], stations: readonly number[], maxGrade: number, preserve: boolean): number[] {
  if (values.length < 2) return values.slice();
  const result = values.slice(), first = values[0]!, last = values.at(-1)!, count = result.length;
  if (preserve) { result[0] = first; result[count - 1] = last; }
  // With fixed endpoints, the forward pass must not clamp the final endpoint
  // before the backward pass propagates the real endpoint constraint.
  for (let pass = 0; pass < 12; pass++) {
    for (let i = 1; i < (preserve ? count - 1 : count); i++) {
      const ds = Math.max(1e-6, stations[i]! - stations[i - 1]!);
      result[i] = clamp(result[i]!, result[i - 1]! - maxGrade * ds, result[i - 1]! + maxGrade * ds);
    }
    for (let i = (preserve ? count - 2 : count - 1); i >= 0; i--) {
      const ds = Math.max(1e-6, stations[i + 1]! - stations[i]!);
      result[i] = clamp(result[i]!, result[i + 1]! - maxGrade * ds, result[i + 1]! + maxGrade * ds);
    }
    if (preserve) { result[0] = first; result[count - 1] = last; }
  }
  return result;
}
function profileAt(stations: readonly number[], values: readonly number[], station: number): number {
  if (station <= stations[0]!) return values[0]!;
  if (station >= stations.at(-1)!) return values.at(-1)!;
  for (let i = 1; i < stations.length; i++) if (stations[i]! >= station) {
    const span = stations[i]! - stations[i - 1]! || 1;
    return values[i - 1]! + (values[i]! - values[i - 1]!) * ((station - stations[i - 1]!) / span);
  }
  return values.at(-1)!;
}
/** Remove high-frequency vertical oscillation while retaining requested endpoint heights. */
export function repairElevation(source: readonly CityPoint[], options: ElevationOptions = {}): { points: CityPoint[]; metrics: RepairMetrics } {
  const raw = source.map(p => ({ ...p })), rawStations = stationTable(raw);
  const length = polylineLength(raw);
  const start = clamp(options.start ?? 0, 0, length), end = clamp(options.end ?? length, start, length);
  if (end - start < 2 || raw.length < 2) return { points: raw, metrics: emptyMetrics(start, end) };
  if (start > 0 || end < length) {
    // Run every profile operation on the isolated interval. Its boundary XYZ
    // are hard constraints; no grade pass or simplification sees outside nodes.
    const interval = rangePoints(raw, rawStations, start, end);
    const repaired = repairElevation(interval, { ...options, start: undefined, end: undefined, preserveEndpoints: true });
    repaired.points[0] = { ...interval[0]! };
    repaired.points[repaired.points.length - 1] = { ...interval.at(-1)! };
    return { points: replaceRange(raw, rawStations, start, end, repaired.points), metrics: { ...repaired.metrics, affectedStart: round(start), affectedEnd: round(end) } };
  }
  const preserve = options.preserveEndpoints !== false;
  const strength = clamp(options.strength ?? 1, 0.1, 2.5);
  const samples = sampleRange(raw, start, end, 3), table = stationTable(samples);
  const heights = samples.map(p => p.y ?? 0);
  const ambient = movingAverage(samples, clamp(20 + strength * 25, 24, 80)).map(p => p.y ?? 0);
  let target = heights.map((value, i) => value + (ambient[i]! - value) * clamp(strength, 0, 1));
  const before = gradeMetrics(raw);
  if (preserve && target.length > 1) { target[0] = heights[0]!; target[target.length - 1] = heights.at(-1)!; }
  const net = target.at(-1)! - target[0]!;
  const monotonic = options.monotonic === true;
  if (monotonic) target = enforceMonotonic(target, net >= 0);
  if (preserve && target.length > 1) { target[0] = heights[0]!; target[target.length - 1] = heights.at(-1)!; }
  const averageGrade = Math.abs(net) / Math.max(1, end - start);
  let maxGrade = Math.max(0.01, options.maxGrade ?? 0.08);
  let note: string | undefined;
  if (averageGrade > maxGrade) { note = `endpoint delta requires ${(averageGrade * 100).toFixed(1)}% average grade`; maxGrade = Math.max(maxGrade, averageGrade * 1.03); }
  target = limitGrade(target, table, maxGrade, preserve);
  const repaired = raw.map((p, i) => {
    const station = rawStations[i]!;
    if (station < start || station > end) return { ...p };
    return { ...p, y: profileAt(table, target, station - start) };
  });
  // Re-apply the grade limit on the authored vertex spacing. The sampled
  // profile can otherwise leave one short final segment above the target.
  const authoredHeights = limitGrade(repaired.map(p => p.y ?? 0), rawStations, maxGrade, preserve);
  for (let i = 0; i < repaired.length; i++) repaired[i] = { ...repaired[i]!, y: authoredHeights[i]! };
  let simplified = simplifyPoints(repaired, 0.02, Math.max(0.005, options.simplifyTolerance ?? 0.02));
  const simplifiedStations = stationTable(simplified);
  const simplifiedHeights = limitGrade(simplified.map(p => p.y ?? 0), simplifiedStations, maxGrade, preserve);
  simplified = simplified.map((p, i) => ({ ...p, y: simplifiedHeights[i]! }));
  const after = gradeMetrics(simplified);
  let delta = 0;
  for (const p of simplified) {
    const station = nearestStation(raw, p);
    delta = Math.max(delta, Math.abs((p.y ?? 0) - profileAt(rawStations, raw.map(q => q.y ?? 0), station)));
  }
  return {
    points: simplified,
    metrics: {
      ...emptyMetrics(start, end), beforeMaxGrade: round(before.maxGrade * 100, 1), afterMaxGrade: round(after.maxGrade * 100, 1),
      beforeGradeReversals: before.reversals, afterGradeReversals: after.reversals,
      removedControlPoints: Math.max(0, raw.length - simplified.length), maxHeightDelta: round(delta, 3), monotonic, note,
    },
  };
}
export function elevationRepairForRoad(road: CityRoad, options: ElevationOptions = {}): { points: CityPoint[]; metrics: RepairMetrics } {
  const path = roadPoints(road);
  const partial = (options.start ?? 0) > 0 || (options.end ?? Infinity) < polylineLength(path);
  const source = partial ? path : roadPoints({ ...road, curve: 'polyline' });
  const net = Math.abs((source.at(-1)?.y ?? 0) - (source[0]?.y ?? 0));
  let variation = 0;
  for (let i = 1; i < source.length; i++) variation += Math.abs((source[i]!.y ?? 0) - (source[i - 1]!.y ?? 0));
  // A ramp that climbs over another road is not a one-way grade. Preserve its
  // local reversals unless the caller explicitly asks for monotonic repair.
  const monotonic = options.monotonic ?? (roadFunction(road) === 'ramp' && net > 1.2 && variation < net * 2.5);
  return repairElevation(source, { ...options, monotonic });
}
/** Rebuild the four intentional cubic handles from a repaired ramp. */
export function cubicHandles(points: readonly CityPoint[]): CityPoint[] {
  if (points.length < 2) throw new Error('Ramp needs at least two points');
  const a = points[0]!, b = points.at(-1)!;
  const span = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const startSample = sampleAt(points, Math.min(12, span * 0.25));
  const endSample = sampleAt(points, Math.max(0, polylineLength(points) - Math.min(12, span * 0.25)));
  const handle = Math.max(12, span * 0.3);
  return [
    { ...a },
    { x: a.x + startSample.tangent.x * handle, y: a.y, z: a.z + startSample.tangent.z * handle },
    { x: b.x - endSample.tangent.x * handle, y: b.y, z: b.z - endSample.tangent.z * handle },
    { ...b },
  ];
}
