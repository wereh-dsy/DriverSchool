import * as THREE from 'three';
import type { Subject2Point2 } from './Subject2GroundConfig';

export const SUBJECT2_ROAD_SURFACE_OFFSET = 0.022;

export type Subject2HeightSampler = (x: number, z: number) => number;

export const createPathCurve = (
  points: readonly Subject2Point2[],
  smooth = false,
): THREE.Curve<THREE.Vector3> => {
  const vectors = points.map((point) => new THREE.Vector3(point.x, 0, point.z));
  if (vectors.length < 2) {
    const only = vectors[0] ?? new THREE.Vector3();
    return new THREE.LineCurve3(only, only.clone().add(new THREE.Vector3(0.001, 0, 0)));
  }
  if (vectors.length === 2) return new THREE.LineCurve3(vectors[0]!, vectors[1]!);
  if (smooth) return new THREE.CatmullRomCurve3(vectors, false, 'centripetal', 0.5);
  const path = new THREE.CurvePath<THREE.Vector3>();
  for (let index = 1; index < vectors.length; index += 1) {
    const start = vectors[index - 1];
    const end = vectors[index];
    if (start && end) path.add(new THREE.LineCurve3(start, end));
  }
  return path;
};

export const sampleCurvePoints = (
  curve: THREE.Curve<THREE.Vector3>,
  maximumSpacing = 0.5,
): Subject2Point2[] => {
  const divisions = Math.max(1, Math.ceil(curve.getLength() / maximumSpacing));
  return curve.getSpacedPoints(divisions).map((point) => ({ x: point.x, z: point.z }));
};

export const createRibbonGeometry = (
  curve: THREE.Curve<THREE.Vector3>,
  width: number,
  heightAt: Subject2HeightSampler,
  yOffset: number,
  maximumSpacing = 0.5,
  lateralOffset = 0,
): THREE.BufferGeometry => {
  const segments = Math.max(1, Math.ceil(curve.getLength() / maximumSpacing));
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const tangent = new THREE.Vector3();
  const right = new THREE.Vector3();

  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const centre = curve.getPointAt(t);
    tangent.copy(curve.getTangentAt(t)).normalize();
    right.set(-tangent.z, 0, tangent.x).normalize();
    const centreX = centre.x + right.x * lateralOffset;
    const centreZ = centre.z + right.z * lateralOffset;
    for (const side of [-1, 1]) {
      const x = centreX + right.x * width * 0.5 * side;
      const z = centreZ + right.z * width * 0.5 * side;
      positions.push(x, heightAt(x, z) + yOffset, z);
      uvs.push(side < 0 ? 0 : 1, index / segments);
    }
  }
  for (let index = 0; index < segments; index += 1) {
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

export const createSurfacePatchGeometry = (
  centerX: number,
  centerZ: number,
  length: number,
  width: number,
  heightAt: Subject2HeightSampler,
  yOffset: number,
  maximumSpacing = 1,
): THREE.BufferGeometry => {
  const xSegments = Math.max(1, Math.ceil(length / maximumSpacing));
  const zSegments = Math.max(1, Math.ceil(width / maximumSpacing));
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let zIndex = 0; zIndex <= zSegments; zIndex += 1) {
    const v = zIndex / zSegments;
    const z = centerZ - width * 0.5 + width * v;
    for (let xIndex = 0; xIndex <= xSegments; xIndex += 1) {
      const u = xIndex / xSegments;
      const x = centerX - length * 0.5 + length * u;
      positions.push(x, heightAt(x, z) + yOffset, z);
      uvs.push(u, v);
    }
  }
  for (let zIndex = 0; zIndex < zSegments; zIndex += 1) {
    for (let xIndex = 0; xIndex < xSegments; xIndex += 1) {
      const a = zIndex * (xSegments + 1) + xIndex;
      const b = a + 1;
      const c = a + xSegments + 1;
      const d = c + 1;
      // Counter-clockwise when viewed from above, so FrontSide faces +Y.
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
};

export const makeRoadRibbon = (
  name: string,
  points: readonly Subject2Point2[],
  width: number,
  material: THREE.Material,
  heightAt: Subject2HeightSampler,
  shadows: boolean,
  smooth = false,
): { readonly mesh: THREE.Mesh; readonly curve: THREE.Curve<THREE.Vector3> } => {
  const curve = createPathCurve(points, smooth);
  const mesh = new THREE.Mesh(
    createRibbonGeometry(curve, width, heightAt, SUBJECT2_ROAD_SURFACE_OFFSET, 0.45),
    material,
  );
  mesh.name = name;
  mesh.receiveShadow = shadows;
  return { mesh, curve };
};

export const makeMarkingRibbon = (
  name: string,
  curve: THREE.Curve<THREE.Vector3>,
  lateralOffset: number,
  width: number,
  material: THREE.Material,
  heightAt: Subject2HeightSampler,
  clearance: number,
): THREE.Mesh => {
  const geometry = createRibbonGeometry(
    curve,
    width,
    heightAt,
    SUBJECT2_ROAD_SURFACE_OFFSET + clearance,
    0.35,
    lateralOffset,
  );
  geometry.userData.maximumJoinGap = 0;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData.subject2RoadMarking = true;
  return mesh;
};

export const makeSurfacePatch = (
  name: string,
  centerX: number,
  centerZ: number,
  length: number,
  width: number,
  material: THREE.Material,
  heightAt: Subject2HeightSampler,
  shadows: boolean,
): THREE.Mesh => {
  const mesh = new THREE.Mesh(
    createSurfacePatchGeometry(
      centerX,
      centerZ,
      length,
      width,
      heightAt,
      SUBJECT2_ROAD_SURFACE_OFFSET,
    ),
    material,
  );
  mesh.name = name;
  mesh.receiveShadow = shadows;
  return mesh;
};

export const makeTransverseMarking = (
  name: string,
  centerX: number,
  centerZ: number,
  width: number,
  depth: number,
  material: THREE.Material,
  heightAt: Subject2HeightSampler,
  clearance: number,
): THREE.Mesh => {
  const curve = new THREE.LineCurve3(
    new THREE.Vector3(centerX - width * 0.5, 0, centerZ),
    new THREE.Vector3(centerX + width * 0.5, 0, centerZ),
  );
  return makeMarkingRibbon(name, curve, 0, depth, material, heightAt, clearance);
};

export const makeBox = (
  name: string,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  material: THREE.Material,
  shadows: boolean,
): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  return mesh;
};

export const makeDirectionArrow = (
  name: string,
  center: Subject2Point2,
  yawRadians: number,
  material: THREE.Material,
  heightAt: Subject2HeightSampler,
  clearance: number,
): THREE.Mesh => {
  const geometry = new THREE.BufferGeometry();
  const local = [
    [-0.7, 0.65], [0.7, 0.65], [0.7, -0.35], [1.25, -0.35],
    [0, -1.65], [-1.25, -0.35], [-0.7, -0.35],
  ] as const;
  const positions: number[] = [];
  const cos = Math.cos(yawRadians);
  const sin = Math.sin(yawRadians);
  for (const [x, z] of local) {
    // Match Three.js/vehicle +Y yaw convention: yaw 0 points toward -Z and
    // -PI/2 points toward +X.
    const worldX = center.x + x * cos + z * sin;
    const worldZ = center.z - x * sin + z * cos;
    positions.push(
      worldX,
      heightAt(worldX, worldZ) + SUBJECT2_ROAD_SURFACE_OFFSET + clearance,
      worldZ,
    );
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([0, 1, 2, 0, 2, 6, 6, 2, 3, 6, 3, 5, 5, 3, 4]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData.subject2RoadMarking = true;
  return mesh;
};
