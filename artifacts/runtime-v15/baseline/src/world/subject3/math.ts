import * as THREE from 'three';
import type { Subject3Point2 } from './Subject3GroundConfig';

export type { Subject3Point2 } from './Subject3GroundConfig';

/**
 * Shared planar maths for the Subject 3 map.
 *
 * Convention (identical to the vehicle and the other grounds): a yaw of zero
 * points a vehicle or mesh toward world -Z, and yaw increases counter
 * clockwise seen from above:
 *   forward = (-sin yaw, -cos yaw)
 *   right   = ( cos yaw, -sin yaw)
 */
export const smoothstep01 = (value: number): number => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

export const planarForward = (yawRadians: number): Subject3Point2 => ({
  x: -Math.sin(yawRadians),
  z: -Math.cos(yawRadians),
});

/** Yaw that makes the local -Z axis point along the supplied direction. */
export const yawFacing = (directionX: number, directionZ: number): number =>
  Math.atan2(-directionX, -directionZ);

/** Yaw that makes a box's local +X axis point along the supplied direction. */
export const yawAlongLocalX = (directionX: number, directionZ: number): number =>
  Math.atan2(-directionZ, directionX);

/** Right-hand normal of a heading; yaw zero points toward -Z. */
export const rightNormal = (directionX: number, directionZ: number): Subject3Point2 => ({
  x: -directionZ,
  z: directionX,
});

export const normalize2 = (direction: Subject3Point2): Subject3Point2 => {
  const length = Math.hypot(direction.x, direction.z);
  if (length < 1e-9) return { x: 0, z: -1 };
  return { x: direction.x / length, z: direction.z / length };
};

export const pointAlong = (
  from: Subject3Point2,
  direction: Subject3Point2,
  distance: number,
): Subject3Point2 => ({ x: from.x + direction.x * distance, z: from.z + direction.z * distance });

export const pointAlongLateral = (
  from: Subject3Point2,
  right: Subject3Point2,
  lateralOffset: number,
): Subject3Point2 => ({ x: from.x + right.x * lateralOffset, z: from.z + right.z * lateralOffset });

export const translatePolyline = (
  points: readonly Subject3Point2[],
  right: Subject3Point2,
  lateralOffset: number,
): Subject3Point2[] => points.map((point) => pointAlongLateral(point, right, lateralOffset));

export const polylineLength = (points: readonly Subject3Point2[]): number => {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (!previous || !point) continue;
    length += Math.hypot(point.x - previous.x, point.z - previous.z);
  }
  return length;
};

export interface Subject3PolylineSample {
  readonly point: Subject3Point2;
  readonly tangent: Subject3Point2;
  readonly distance: number;
}

/** Samples a polyline by arc length; used to trim markings at junctions. */
export const samplePolylineAt = (
  points: readonly Subject3Point2[],
  targetDistance: number,
): Subject3PolylineSample => {
  const first = points[0] ?? { x: 0, z: 0 };
  const last = points[points.length - 1] ?? first;
  if (points.length < 2) {
    return { point: { ...first }, tangent: { x: 0, z: -1 }, distance: 0 };
  }
  const total = polylineLength(points);
  const clamped = THREE.MathUtils.clamp(targetDistance, 0, total);
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (!start || !end) continue;
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const segmentLength = Math.hypot(dx, dz);
    if (segmentLength < 1e-9) continue;
    if (travelled + segmentLength >= clamped) {
      const t = (clamped - travelled) / segmentLength;
      return {
        point: { x: start.x + dx * t, z: start.z + dz * t },
        tangent: { x: dx / segmentLength, z: dz / segmentLength },
        distance: clamped,
      };
    }
    travelled += segmentLength;
  }
  const previous = points[points.length - 2] ?? first;
  const dx = last.x - previous.x;
  const dz = last.z - previous.z;
  const segmentLength = Math.hypot(dx, dz) || 1;
  return {
    point: { ...last },
    tangent: { x: dx / segmentLength, z: dz / segmentLength },
    distance: total,
  };
};

/** Splits a polyline into the parts outside every supplied distance range. */
export const splitPolylineOutsideRanges = (
  points: readonly Subject3Point2[],
  ranges: readonly { readonly start: number; readonly end: number }[],
  maximumSampleSpacing = 2,
): Subject3Point2[][] => {
  if (points.length < 2) return [];
  const total = polylineLength(points);
  if (total < 1e-6) return [];
  const merged: { start: number; end: number }[] = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end + 1e-6) {
      merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, range.end) };
      continue;
    }
    merged.push({ start: range.start, end: range.end });
  }
  const kept: Subject3Point2[][] = [];
  let cursor = 0;
  const flush = (from: number, to: number): void => {
    if (to - from < 0.35) return;
    const count = Math.max(2, Math.ceil((to - from) / maximumSampleSpacing));
    const part: Subject3Point2[] = [];
    for (let index = 0; index <= count; index += 1) {
      part.push(samplePolylineAt(points, from + (to - from) * index / count).point);
    }
    kept.push(part);
  };
  for (const range of merged) {
    if (range.start > cursor) flush(cursor, Math.min(range.start, total));
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < total) flush(cursor, total);
  return kept;
};

export interface Subject3DashRange {
  readonly startDistance: number;
  readonly endDistance: number;
}

/** Continuous dash ranges along a polyline, useful for lane divider markings. */
export const dashRangesAlong = (
  points: readonly Subject3Point2[],
  dashLength: number,
  gapLength: number,
): Subject3DashRange[] => {
  const total = polylineLength(points);
  const pitch = Math.max(0.5, dashLength + gapLength);
  const ranges: Subject3DashRange[] = [];
  for (let start = 0; start < total; start += pitch) {
    const end = Math.min(start + dashLength, total);
    if (end - start < 0.4) break;
    ranges.push({ startDistance: start, endDistance: end });
  }
  return ranges;
};

export const clipPolylineRange = (
  points: readonly Subject3Point2[],
  startDistance: number,
  endDistance: number,
): Subject3Point2[] | null => {
  const total = polylineLength(points);
  const start = THREE.MathUtils.clamp(startDistance, 0, total);
  const end = THREE.MathUtils.clamp(endDistance, 0, total);
  if (end - start < 0.35) return null;
  const count = Math.max(2, Math.ceil((end - start) / 2));
  const part: Subject3Point2[] = [];
  for (let index = 0; index <= count; index += 1) {
    part.push(samplePolylineAt(points, start + (end - start) * index / count).point);
  }
  return part;
};

export const distancePointToSegment = (
  x: number,
  z: number,
  start: Subject3Point2,
  end: Subject3Point2,
): number => {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const squaredLength = dx * dx + dz * dz;
  const t = squaredLength > 1e-9
    ? THREE.MathUtils.clamp(((x - start.x) * dx + (z - start.z) * dz) / squaredLength, 0, 1)
    : 0;
  return Math.hypot(x - (start.x + dx * t), z - (start.z + dz * t));
};

export const distanceToPolyline = (x: number, z: number, points: readonly Subject3Point2[]): number => {
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (!start || !end) continue;
    nearest = Math.min(nearest, distancePointToSegment(x, z, start, end));
  }
  return nearest;
};

export const distanceOutsideRectangle = (
  x: number,
  z: number,
  minimumX: number,
  maximumX: number,
  minimumZ: number,
  maximumZ: number,
): number => Math.hypot(
  Math.max(minimumX - x, 0, x - maximumX),
  Math.max(minimumZ - z, 0, z - maximumZ),
);

export const createPolylineCurve = (
  points: readonly Subject3Point2[],
): THREE.Curve<THREE.Vector3> => {
  const vectors = points.map((point) => new THREE.Vector3(point.x, 0, point.z));
  if (vectors.length < 2) {
    const only = vectors[0] ?? new THREE.Vector3();
    return new THREE.LineCurve3(only, only.clone().add(new THREE.Vector3(0.001, 0, 0)));
  }
  if (vectors.length === 2) return new THREE.LineCurve3(vectors[0]!, vectors[1]!);
  const path = new THREE.CurvePath<THREE.Vector3>();
  for (let index = 1; index < vectors.length; index += 1) {
    const start = vectors[index - 1];
    const end = vectors[index];
    if (start && end) path.add(new THREE.LineCurve3(start, end));
  }
  return path;
};
