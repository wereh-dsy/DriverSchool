import * as THREE from 'three';
import type { Subject3Point2 } from './Subject3GroundConfig';

export const SUBJECT3_ROAD_SURFACE_OFFSET = 0.024;

export type Subject3HeightSampler = (x: number, z: number) => number;
interface RibbonPoint extends Subject3Point2 { readonly y?: number }

/** Exact bend vertices with mitered offsets, shared by asphalt, paint and kerbs. */
export const sampleRibbonPolyline = (points: readonly RibbonPoint[], maximumSpacing: number):
  { point: RibbonPoint; tangent: Subject3Point2 }[] => {
  const samples: { point: RibbonPoint; tangent: Subject3Point2 }[] = [];
  const direction = (a: Subject3Point2, b: Subject3Point2): Subject3Point2 => {
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
  };
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i]!;
    const incoming = direction(points[Math.max(0, i - 1)]!, point);
    const outgoing = direction(point, points[Math.min(points.length - 1, i + 1)]!);
    const divisor = Math.max(0.25, 1 + incoming.x * outgoing.x + incoming.z * outgoing.z);
    const tangent = i === 0 ? outgoing : i === points.length - 1 ? incoming
      : { x: (incoming.x + outgoing.x) / divisor, z: (incoming.z + outgoing.z) / divisor };
    samples.push({ point, tangent });
    if (i === points.length - 1) continue;
    const next = points[i + 1]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(next.x - point.x, next.z - point.z) / maximumSpacing));
    for (let step = 1; step < steps; step += 1) {
      const t = step / steps;
      samples.push({ point: { x: point.x + (next.x - point.x) * t, z: point.z + (next.z - point.z) * t,
        y: point.y === undefined && next.y === undefined ? undefined : (point.y ?? 0) + ((next.y ?? 0) - (point.y ?? 0)) * t },
        tangent: outgoing });
    }
  }
  return samples;
};

export const createStripGeometry = (
  points: readonly RibbonPoint[],
  heightAt: Subject3HeightSampler,
  options: {
    readonly innerOffset: number;
    readonly outerOffset: number;
    readonly yOffset: number;
    readonly maximumSpacing?: number;
  },
): THREE.BufferGeometry | null => {
  if (points.length < 2) return null;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const fine = sampleRibbonPolyline(points, options.maximumSpacing ?? 1.4);

  for (let index = 0; index < fine.length; index += 1) {
    const sample = fine[index]!;
    const rightX = -sample.tangent.z;
    const rightZ = sample.tangent.x;
    const point = sample.point;
    for (const offset of [options.innerOffset, options.outerOffset]) {
      const x = point.x + rightX * offset;
      const z = point.z + rightZ * offset;
      positions.push(x, (point.y ?? heightAt(x, z)) + options.yOffset, z);
      uvs.push(offset === options.innerOffset ? 0 : 1, index / (fine.length - 1 || 1));
    }
  }
  for (let index = 0; index < fine.length - 1; index += 1) {
    const base = index * 2;
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
};

/** Road surface ribbon: `width` metres wide, centred on the supplied polyline. */
export const makeRoadRibbon = (
  name: string,
  points: readonly Subject3Point2[],
  width: number,
  material: THREE.Material,
  heightAt: Subject3HeightSampler,
  shadows: boolean,
): THREE.Mesh | null => {
  const geometry = createStripGeometry(points, heightAt, {
    innerOffset: -width * 0.5,
    outerOffset: width * 0.5,
    yOffset: SUBJECT3_ROAD_SURFACE_OFFSET,
    maximumSpacing: 3,
  });
  if (geometry === null) return null;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = shadows;
  mesh.userData.subject3RoadSurface = true;
  return mesh;
};

/** Flat, road-conforming marking ribbon used by every painted line. */
export const makeMarkingRibbon = (
  name: string,
  points: readonly Subject3Point2[],
  width: number,
  material: THREE.Material,
  heightAt: Subject3HeightSampler,
  clearance: number,
  lateralOffset = 0,
  maximumSpacing = 1.6,
): THREE.Mesh | null => {
  const geometry = createStripGeometry(points, heightAt, {
    innerOffset: lateralOffset - width * 0.5,
    outerOffset: lateralOffset + width * 0.5,
    yOffset: SUBJECT3_ROAD_SURFACE_OFFSET + clearance,
    maximumSpacing,
  });
  if (geometry === null) return null;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData.subject3RoadMarking = true;
  return mesh;
};

export const makeBox = (
  name: string,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  material: THREE.Material,
  shadows: boolean,
): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
  mesh.name = name;
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  return mesh;
};

const transformMarkingPoint = (
  center: Subject3Point2,
  yawRadians: number,
  localX: number,
  localZ: number,
): Subject3Point2 => {
  const cos = Math.cos(yawRadians);
  const sin = Math.sin(yawRadians);
  return {
    x: center.x + localX * cos + localZ * sin,
    z: center.z - localX * sin + localZ * cos,
  };
};

/** Filled road paint polygon; local +X is lateral and local -Z is forward. */
export const makeFlatMarkingPolygon = (
  name: string,
  center: Subject3Point2,
  yawRadians: number,
  outline: readonly (readonly [number, number])[],
  material: THREE.Material,
  heightAt: Subject3HeightSampler,
  clearance: number,
): THREE.Mesh | null => {
  if (outline.length < 3) return null;
  const contour = outline.map(([x, z]) => new THREE.Vector2(x, z));
  if (THREE.ShapeUtils.isClockWise(contour)) contour.reverse();
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  if (faces.length === 0) return null;
  const positions: number[] = [];
  for (const point of contour) {
    const world = transformMarkingPoint(center, yawRadians, point.x, point.y);
    positions.push(world.x, heightAt(world.x, world.z) + SUBJECT3_ROAD_SURFACE_OFFSET + clearance, world.z);
  }
  const indices: number[] = [];
  // ShapeUtils triangulates in XY; mapping Y to world Z reverses the normal.
  for (const face of faces) indices.push(face[0]!, face[2]!, face[1]!);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData.subject3RoadMarking = true;
  return mesh;
};

/** Road paint rectangle, expressed with its width along the local +X axis. */
export const makeMarkingRectangle = (
  name: string,
  center: Subject3Point2,
  yawRadians: number,
  width: number,
  depth: number,
  material: THREE.Material,
  heightAt: Subject3HeightSampler,
  clearance: number,
): THREE.Mesh | null => makeFlatMarkingPolygon(
  name,
  center,
  yawRadians,
  [
    [-width * 0.5, -depth * 0.5],
    [width * 0.5, -depth * 0.5],
    [width * 0.5, depth * 0.5],
    [-width * 0.5, depth * 0.5],
  ],
  material,
  heightAt,
  clearance,
);

export type Subject3ArrowKind = 'straight' | 'left' | 'right' | 'straight-left' | 'straight-right' | 'left-right';

const ARROW_OUTLINES: Readonly<Record<Subject3ArrowKind, readonly (readonly [number, number])[]>> =
  Object.freeze({
    'left-right': [
      [-0.18, 1.9], [-0.18, 0.65], [-0.62, 0.65], [-0.62, 0.95], [-1.35, 0.25],
      [-0.62, -0.45], [-0.62, -0.15], [0.62, -0.15], [0.62, -0.45], [1.35, 0.25],
      [0.62, 0.95], [0.62, 0.65], [0.18, 0.65], [0.18, 1.9],
    ],
    straight: [
      [-0.18, 1.9], [-0.18, -0.35], [-0.58, -0.35], [0, -1.7], [0.58, -0.35], [0.18, -0.35], [0.18, 1.9],
    ],
    left: [
      [-0.18, 1.9], [-0.18, 0.65], [-0.62, 0.65], [-0.62, 0.95], [-1.35, 0.25],
      [-0.62, -0.45], [-0.62, -0.15], [0.18, -0.15], [0.18, 1.9],
    ],
    right: [
      [0.18, 1.9], [0.18, 0.65], [0.62, 0.65], [0.62, 0.95], [1.35, 0.25],
      [0.62, -0.45], [0.62, -0.15], [-0.18, -0.15], [-0.18, 1.9],
    ],
    'straight-left': [
      [-0.18, 1.9], [-0.18, 0.35], [-0.62, 0.35], [-0.62, 0.6], [-1.4, 0.05],
      [-0.62, -0.5], [-0.62, -0.2], [-0.18, -0.2], [-0.18, -0.35], [-0.55, -0.35],
      [0, -1.6], [0.55, -0.35], [0.18, -0.35], [0.18, 1.9],
    ],
    'straight-right': [
      [0.18, 1.9], [0.18, 0.35], [0.62, 0.35], [0.62, 0.6], [1.4, 0.05],
      [0.62, -0.5], [0.62, -0.2], [0.18, -0.2], [0.18, -0.35], [0.55, -0.35],
      [0, -1.6], [-0.55, -0.35], [-0.18, -0.35], [-0.18, 1.9],
    ],
  });

export const makeDirectionArrow = (
  name: string,
  center: Subject3Point2,
  yawRadians: number,
  kind: Subject3ArrowKind,
  length: number,
  width: number,
  material: THREE.Material,
  heightAt: Subject3HeightSampler,
  clearance: number,
): THREE.Mesh | null => {
  const outline = ARROW_OUTLINES[kind].map(([localX, localZ]) => [
    localX * width * 0.5,
    localZ * length / 3.6,
  ] as const);
  return makeFlatMarkingPolygon(name, center, yawRadians, outline, material, heightAt, clearance);
};
