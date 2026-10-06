import * as THREE from 'three';

export const CIRCUIT_ROAD_SURFACE_OFFSET = 0.024;

export const measureCircuitRibbonJoinGap = (
  geometry: THREE.BufferGeometry,
): number => {
  const positions = geometry.getAttribute('position');
  if (positions === undefined || positions.itemSize < 3 || positions.count < 4) return 0;

  const finalRingStart = positions.count - 2;
  let maximumGapSquared = 0;
  for (let side = 0; side < 2; side += 1) {
    const dx = positions.getX(side) - positions.getX(finalRingStart + side);
    const dy = positions.getY(side) - positions.getY(finalRingStart + side);
    const dz = positions.getZ(side) - positions.getZ(finalRingStart + side);
    maximumGapSquared = Math.max(maximumGapSquared, dx * dx + dy * dy + dz * dz);
  }
  return Math.sqrt(maximumGapSquared);
};

export const createCircuitRibbonGeometry = (
  curve: THREE.Curve<THREE.Vector3>,
  width: number,
  y: number,
  maximumSpacing = 0.8,
  lateralOffset = 0,
): THREE.BufferGeometry => {
  const length = curve.getLength();
  const segments = Math.max(8, Math.ceil(length / maximumSpacing));
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const tangent = new THREE.Vector3();
  const right = new THREE.Vector3();
  const start = curve.getPointAt(0);
  const end = curve.getPointAt(1);
  const isClosed = start.distanceToSquared(end) < 1e-12;

  for (let index = 0; index <= segments; index += 1) {
    if (isClosed && index === segments) {
      // Copy the first ring verbatim. Sampling getTangentAt(1) uses a
      // one-sided finite difference and can rotate the final lateral vector
      // slightly even when the authored curve is analytically C1-continuous.
      positions.push(
        positions[0]!, positions[1]!, positions[2]!,
        positions[3]!, positions[4]!, positions[5]!,
      );
      uvs.push(0, length / 8, 1, length / 8);
      continue;
    }
    const t = index / segments;
    const centre = curve.getPointAt(t);
    tangent.copy(curve.getTangentAt(t)).normalize();
    right.set(-tangent.z, 0, tangent.x).normalize();
    const centreX = centre.x + right.x * lateralOffset;
    const centreZ = centre.z + right.z * lateralOffset;
    for (const side of [-1, 1]) {
      positions.push(
        centreX + right.x * width * 0.5 * side,
        y,
        centreZ + right.z * width * 0.5 * side,
      );
      uvs.push(side < 0 ? 0 : 1, length * t / 8);
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
  geometry.userData.circuitClosedRibbon = isClosed;
  geometry.userData.maximumJoinGap = isClosed
    ? measureCircuitRibbonJoinGap(geometry)
    : 0;
  return geometry;
};

export const createFlatPatch = (
  width: number,
  length: number,
  x: number,
  z: number,
  y: number,
  material: THREE.Material,
): THREE.Mesh => {
  const geometry = new THREE.PlaneGeometry(width, length);
  geometry.rotateX(-Math.PI * 0.5);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  return mesh;
};

export const createRoutePatch = (
  curve: THREE.Curve<THREE.Vector3>,
  distance: number,
  width: number,
  length: number,
  y: number,
  material: THREE.Material,
): THREE.Mesh => {
  const routeLength = curve.getLength();
  const t = THREE.MathUtils.euclideanModulo(distance, routeLength) / routeLength;
  const point = curve.getPointAt(t);
  const tangent = curve.getTangentAt(t).normalize();
  const geometry = new THREE.PlaneGeometry(width, length);
  geometry.rotateX(-Math.PI * 0.5);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(point.x, y, point.z);
  mesh.rotation.y = Math.atan2(tangent.x, tangent.z);
  return mesh;
};
