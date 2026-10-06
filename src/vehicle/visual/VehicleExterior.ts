import * as THREE from 'three';

import type { VehicleVisualConfig } from './VehicleVisualConfig';
import { VEHICLE_RENDER_LAYERS } from './VehicleRenderLayers';

// The declared dimensions include the existing lamp lips / exhaust outlets.
// Build the underlying loft inside that same envelope, rather than enlarging it
// a second time when these small exterior components are attached.
const bodyHalfLength = (config: VehicleVisualConfig): number =>
  (config.dimensions.length - (config.body.profile === 'sport-coupe' ? 0.12 : 0.0226)) * 0.5;
const bodyHalfWidth = (config: VehicleVisualConfig): number =>
  (config.dimensions.width - 0.01) * 0.5;

interface BodyStation {
  readonly z: number;
  readonly bottomY: number;
  readonly lowerHalfWidth: number;
  readonly shoulderY: number;
  readonly shoulderHalfWidth: number;
  readonly topY: number;
  readonly topHalfWidth: number;
}

interface ExteriorMaterials {
  readonly paint: THREE.MeshStandardMaterial;
  readonly paintDark: THREE.MeshStandardMaterial;
  readonly trim: THREE.MeshStandardMaterial;
  readonly glass: THREE.MeshPhysicalMaterial;
  readonly lamp: THREE.MeshStandardMaterial;
  readonly rearLamp: THREE.MeshStandardMaterial;
  readonly chrome: THREE.MeshStandardMaterial;
}

interface QuadPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const stationPoints = (station: BodyStation): readonly THREE.Vector3[] => [
  new THREE.Vector3(-station.lowerHalfWidth, station.bottomY, station.z),
  new THREE.Vector3(station.lowerHalfWidth, station.bottomY, station.z),
  new THREE.Vector3(station.shoulderHalfWidth, station.shoulderY, station.z),
  new THREE.Vector3(station.topHalfWidth, station.topY, station.z),
  new THREE.Vector3(-station.topHalfWidth, station.topY, station.z),
  new THREE.Vector3(-station.shoulderHalfWidth, station.shoulderY, station.z),
];

/**
 * Creates a deliberately low-poly longitudinal shell.  The six-point body
 * sections give the flanks a sill, shoulder and tumblehome instead of the
 * rectangular cross-section used by the original placeholder body.
 */
const createLoftGeometry = (stations: readonly BodyStation[]): THREE.BufferGeometry => {
  if (stations.length < 2) throw new Error('A vehicle body loft needs at least two stations.');

  const sectionSize = 6;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const station of stations) {
    for (const point of stationPoints(station)) positions.push(point.x, point.y, point.z);
  }

  for (let stationIndex = 0; stationIndex < stations.length - 1; stationIndex += 1) {
    const current = stationIndex * sectionSize;
    const next = (stationIndex + 1) * sectionSize;
    for (let edge = 0; edge < sectionSize; edge += 1) {
      const following = (edge + 1) % sectionSize;
      indices.push(
        current + edge,
        current + following,
        next + following,
        current + edge,
        next + following,
        next + edge,
      );
    }
  }

  // The section polygon is counter-clockwise when viewed from +Z.
  for (let edge = 1; edge < sectionSize - 1; edge += 1) {
    indices.push(0, edge + 1, edge);
  }
  const rear = (stations.length - 1) * sectionSize;
  for (let edge = 1; edge < sectionSize - 1; edge += 1) {
    indices.push(rear, rear + edge, rear + edge + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
};

/**
 * A denser inexpensive loft opens each wheel arch rather than painting a dark
 * circle onto an uninterrupted flank. The narrow underfloor remains below
 * the cabin; only the side ring lifts above the actual wheel clearance.
 */
const createBodyGeometry = (
  stations: readonly BodyStation[],
  config: VehicleVisualConfig,
): THREE.BufferGeometry => {
  const dense: BodyStation[] = [];
  for (let index = 0; index < stations.length - 1; index += 1) {
    const from = stations[index]!;
    const to = stations[index + 1]!;
    const subdivisions = Math.ceil((to.z - from.z) / 0.085);
    for (let sample = 0; sample < subdivisions; sample += 1) {
      const t = sample / subdivisions;
      dense.push({
        z: THREE.MathUtils.lerp(from.z, to.z, t),
        bottomY: THREE.MathUtils.lerp(from.bottomY, to.bottomY, t),
        lowerHalfWidth: THREE.MathUtils.lerp(from.lowerHalfWidth, to.lowerHalfWidth, t),
        shoulderY: THREE.MathUtils.lerp(from.shoulderY, to.shoulderY, t),
        shoulderHalfWidth: THREE.MathUtils.lerp(from.shoulderHalfWidth, to.shoulderHalfWidth, t),
        topY: THREE.MathUtils.lerp(from.topY, to.topY, t),
        topHalfWidth: THREE.MathUtils.lerp(from.topHalfWidth, to.topHalfWidth, t),
      });
    }
  }
  dense.push(stations[stations.length - 1]!);
  const archRadius = config.dimensions.wheelRadius * 1.12;
  const halfWheelBase = config.dimensions.wheelBase * 0.5;
  const positions: number[] = [];
  const indices: number[] = [];
  const clippedSide = (station: BodyStation, y: number): number => y < station.shoulderY
    ? THREE.MathUtils.lerp(station.lowerHalfWidth, station.shoulderHalfWidth,
      (y - station.bottomY) / (station.shoulderY - station.bottomY))
    : THREE.MathUtils.lerp(station.shoulderHalfWidth, station.topHalfWidth,
      (y - station.shoulderY) / (station.topY - station.shoulderY));
  for (const station of dense) {
    const nearestAxleDistance = Math.min(Math.abs(station.z + halfWheelBase), Math.abs(station.z - halfWheelBase));
    const sideBottomY = nearestAxleDistance < archRadius
      ? Math.min(station.topY - 0.012, config.dimensions.wheelRadius
        + Math.sqrt(archRadius * archRadius - nearestAxleDistance * nearestAxleDistance))
      : station.bottomY;
    const shoulderY = Math.max(station.shoulderY, sideBottomY);
    const bottomHalfWidth = clippedSide(station, sideBottomY);
    const shoulderHalfWidth = clippedSide(station, shoulderY);
    const points = [
      new THREE.Vector3(-station.lowerHalfWidth, station.bottomY, station.z),
      new THREE.Vector3(station.lowerHalfWidth, station.bottomY, station.z),
      new THREE.Vector3(bottomHalfWidth, sideBottomY, station.z),
      new THREE.Vector3(shoulderHalfWidth, shoulderY, station.z),
      new THREE.Vector3(station.topHalfWidth, station.topY, station.z),
      new THREE.Vector3(-station.topHalfWidth, station.topY, station.z),
      new THREE.Vector3(-shoulderHalfWidth, shoulderY, station.z),
      new THREE.Vector3(-bottomHalfWidth, sideBottomY, station.z),
    ];
    for (const point of points) positions.push(point.x, point.y, point.z);
  }
  const ringSize = 8;
  for (let stationIndex = 0; stationIndex < dense.length - 1; stationIndex += 1) {
    const current = stationIndex * ringSize;
    const next = current + ringSize;
    // The lateral wheel-opening faces are deliberately absent between the
    // underfloor (0/1) and clipped flank (2/7). No invisible visual wheel cover.
    for (const edge of [0, 2, 3, 4, 5, 6]) {
      const following = edge + 1;
      indices.push(current + edge, current + following, next + following,
        current + edge, next + following, next + edge);
    }
  }
  for (let edge = 1; edge < ringSize - 1; edge += 1) indices.push(0, edge + 1, edge);
  const rear = (dense.length - 1) * ringSize;
  for (let edge = 1; edge < ringSize - 1; edge += 1) indices.push(rear, rear + edge, rear + edge + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
};

const createTaperedPanelGeometry = (
  frontZ: number,
  rearZ: number,
  frontHalfWidth: number,
  rearHalfWidth: number,
  frontY: number,
  rearY: number,
  thickness: number,
): THREE.BufferGeometry => {
  const positions = [
    -frontHalfWidth, frontY, frontZ,
    frontHalfWidth, frontY, frontZ,
    rearHalfWidth, rearY, rearZ,
    -rearHalfWidth, rearY, rearZ,
    -frontHalfWidth, frontY - thickness, frontZ,
    frontHalfWidth, frontY - thickness, frontZ,
    rearHalfWidth, rearY - thickness, rearZ,
    -rearHalfWidth, rearY - thickness, rearZ,
  ];
  const indices = [
    0, 3, 2, 0, 2, 1,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    3, 7, 6, 3, 6, 2,
    0, 4, 7, 0, 7, 3,
    1, 2, 6, 1, 6, 5,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
};

const createQuadGeometry = (
  points: readonly [QuadPoint, QuadPoint, QuadPoint, QuadPoint],
  reverse = false,
): THREE.BufferGeometry => {
  const positions = points.flatMap((point) => [point.x, point.y, point.z]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(reverse ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
};

const createMesh = (
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  category: string,
): THREE.Mesh => {
  geometry.name = `${name} geometry`;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData.vehicleBodyPart = category;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.layers.set(VEHICLE_RENDER_LAYERS.EXTERIOR);
  return mesh;
};

const createBeam = (
  name: string,
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  category = 'pillar',
): THREE.Mesh => {
  const midpoint = from.clone().add(to).multiplyScalar(0.5);
  const direction = to.clone().sub(from);
  const geometry = new THREE.CylinderGeometry(radius * 0.84, radius, direction.length(), 6);
  const beam = createMesh(name, geometry, material, category);
  beam.position.copy(midpoint);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return beam;
};

const addSymmetricMeshes = (
  root: THREE.Group,
  name: string,
  geometryFactory: (side: -1 | 1) => THREE.BufferGeometry,
  material: THREE.Material,
  category: string,
): readonly [THREE.Mesh, THREE.Mesh] => {
  const left = createMesh(`Left ${name}`, geometryFactory(-1), material, category);
  const right = createMesh(`Right ${name}`, geometryFactory(1), material, category);
  root.add(left, right);
  return [left, right];
};

const addWheelArchFlares = (
  root: THREE.Group,
  config: VehicleVisualConfig,
  material: THREE.Material,
): void => {
  const sport = config.body.profile === 'sport-coupe';
  const archRadius = config.wheelRadius * (sport ? 1.17 : 1.13);
  const tube = sport ? 0.047 : 0.038;
  const x = bodyHalfWidth(config) - tube - 0.006;
  const axleZ = config.wheelBase * 0.5;
  for (const side of [-1, 1] as const) {
    for (const axle of [-1, 1] as const) {
      const geometry = new THREE.TorusGeometry(archRadius, tube, 6, 18, Math.PI);
      geometry.rotateY(Math.PI / 2);
      const mesh = createMesh(
        `${side < 0 ? 'Left' : 'Right'} ${axle < 0 ? 'front' : 'rear'} wheel-arch flare`,
        geometry,
        material,
        'wheel-arch',
      );
      mesh.position.set(side * x, config.wheelRadius, axle * axleZ);
      root.add(mesh);
    }
  }
};

const addCabinGlazingAndPillars = (
  root: THREE.Group,
  config: VehicleVisualConfig,
  materials: ExteriorMaterials,
): void => {
  const { body, cabin } = config;
  const sport = body.profile === 'sport-coupe';
  const side = cabin.width * 0.5 + 0.018;
  const topHalfWidth = body.roofWidth * 0.5 - 0.045;
  const windscreenBottomHalfWidth = cabin.width * 0.5 - 0.025;
  const rearGlassBottomZ = sport ? 1.17 : 1.04;
  const rearGlassTopZ = sport ? 0.62 : 0.79;
  const rearGlassBottomY = sport ? 0.73 : 0.82;
  const rearGlassTopY = cabin.roofY - 0.055;

  const frontBottomLeft = new THREE.Vector3(-windscreenBottomHalfWidth, cabin.windshieldBottomY, cabin.windshieldBottomZ);
  const frontBottomRight = new THREE.Vector3(windscreenBottomHalfWidth, cabin.windshieldBottomY, cabin.windshieldBottomZ);
  const frontTopLeft = new THREE.Vector3(-topHalfWidth, cabin.windshieldTopY, cabin.windshieldTopZ);
  const frontTopRight = new THREE.Vector3(topHalfWidth, cabin.windshieldTopY, cabin.windshieldTopZ);
  const windshield = createMesh(
    'Exterior front windshield',
    createQuadGeometry([
      frontBottomLeft,
      frontBottomRight,
      frontTopRight,
      frontTopLeft,
    ], true),
    materials.glass,
    'glass',
  );
  windshield.castShadow = false;
  windshield.renderOrder = 2;
  root.add(windshield);

  const rearBottomLeft = new THREE.Vector3(-windscreenBottomHalfWidth * 0.95, rearGlassBottomY, rearGlassBottomZ);
  const rearBottomRight = new THREE.Vector3(windscreenBottomHalfWidth * 0.95, rearGlassBottomY, rearGlassBottomZ);
  const rearTopLeft = new THREE.Vector3(-topHalfWidth, rearGlassTopY, rearGlassTopZ);
  const rearTopRight = new THREE.Vector3(topHalfWidth, rearGlassTopY, rearGlassTopZ);
  const rearWindow = createMesh(
    'Exterior rear window',
    createQuadGeometry([
      rearBottomLeft,
      rearBottomRight,
      rearTopRight,
      rearTopLeft,
    ]),
    materials.glass,
    'glass',
  );
  rearWindow.castShadow = false;
  rearWindow.renderOrder = 2;
  root.add(rearWindow);

  for (const direction of [-1, 1] as const) {
    const outwardX = direction * side;
    const frontLow: QuadPoint = {
      x: outwardX,
      y: cabin.windshieldBottomY + 0.025,
      z: cabin.windshieldBottomZ + 0.07,
    };
    const frontHigh: QuadPoint = {
      x: direction * topHalfWidth,
      y: cabin.windshieldTopY - 0.02,
      z: cabin.windshieldTopZ + 0.025,
    };
    const rearHigh: QuadPoint = {
      x: direction * topHalfWidth,
      y: rearGlassTopY - 0.015,
      z: rearGlassTopZ - 0.015,
    };
    const rearLow: QuadPoint = {
      x: outwardX,
      y: rearGlassBottomY + 0.01,
      z: rearGlassBottomZ - 0.05,
    };
    const middleLow = new THREE.Vector3(outwardX, sport ? 0.8 : 0.83, sport ? 0.27 : 0.31);
    const middleHigh = new THREE.Vector3(direction * topHalfWidth,
      THREE.MathUtils.lerp(cabin.windshieldTopY, rearGlassTopY, 0.58), sport ? 0.21 : 0.29);
    const frontMiddleLow = middleLow.clone();
    const frontMiddleHigh = middleHigh.clone();
    const rearMiddleLow = middleLow.clone();
    const rearMiddleHigh = middleHigh.clone();
    frontMiddleLow.z -= 0.022;
    frontMiddleHigh.z -= 0.022;
    rearMiddleLow.z += 0.022;
    rearMiddleHigh.z += 0.022;
    const frontWindow = createMesh(
      `${direction < 0 ? 'Left' : 'Right'} front side window`,
      createQuadGeometry([frontLow, frontHigh, frontMiddleHigh, frontMiddleLow], direction < 0),
      materials.glass, 'glass',
    );
    const rearSideWindow = createMesh(
      `${direction < 0 ? 'Left' : 'Right'} ${sport ? 'quarter' : 'rear door'} side window`,
      createQuadGeometry([rearMiddleLow, rearMiddleHigh, rearHigh, rearLow], direction < 0),
      materials.glass, 'glass',
    );
    for (const window of [frontWindow, rearSideWindow]) {
      window.castShadow = false;
      window.renderOrder = 2;
      root.add(window);
    }

    root.add(
      createBeam(
        `${direction < 0 ? 'Left' : 'Right'} A-pillar exterior`,
        direction < 0 ? frontBottomLeft : frontBottomRight,
        direction < 0 ? frontTopLeft : frontTopRight,
        sport ? 0.042 : 0.048,
        materials.paintDark,
      ),
      createBeam(
        `${direction < 0 ? 'Left' : 'Right'} C-pillar exterior`,
        direction < 0 ? rearTopLeft : rearTopRight,
        direction < 0 ? rearBottomLeft : rearBottomRight,
        sport ? 0.075 : 0.085,
        materials.paint,
      ),
    );

    const beltline = createBeam(
      `${direction < 0 ? 'Left' : 'Right'} window beltline`,
      new THREE.Vector3(outwardX, frontLow.y - 0.015, frontLow.z),
      new THREE.Vector3(outwardX, rearLow.y - 0.015, rearLow.z),
      0.018,
      materials.trim,
      'window-trim',
    );
    root.add(beltline);

    const bPillarZ = sport ? 0.27 : 0.31;
    const upperY = THREE.MathUtils.lerp(cabin.windshieldTopY, rearGlassTopY, 0.52);
    root.add(createBeam(
      `${direction < 0 ? 'Left' : 'Right'} B-pillar exterior`,
      new THREE.Vector3(outwardX, sport ? 0.8 : 0.83, bPillarZ),
      new THREE.Vector3(direction * topHalfWidth, upperY, bPillarZ - (sport ? 0.06 : 0.02)),
      sport ? 0.027 : 0.038,
      materials.trim,
    ));
  }
};

const addRoof = (
  root: THREE.Group,
  config: VehicleVisualConfig,
  material: THREE.Material,
): void => {
  const { body, cabin } = config;
  const sport = body.profile === 'sport-coupe';
  const roofFront = cabin.windshieldTopZ - 0.04;
  const roofRear = sport ? 0.69 : 0.84;
  const halfWidth = body.roofWidth * 0.5;
  const stations: BodyStation[] = [
    {
      z: roofFront,
      bottomY: cabin.roofY - 0.062,
      lowerHalfWidth: halfWidth * 0.88,
      shoulderY: cabin.roofY - 0.025,
      shoulderHalfWidth: halfWidth,
      topY: cabin.roofY + 0.012,
      topHalfWidth: halfWidth * 0.82,
    },
    {
      z: body.roofCenterZ,
      bottomY: cabin.roofY - 0.055,
      lowerHalfWidth: halfWidth * 0.92,
      shoulderY: cabin.roofY - 0.01,
      shoulderHalfWidth: halfWidth,
      topY: cabin.roofY + (sport ? 0.028 : 0.035),
      topHalfWidth: halfWidth * 0.8,
    },
    {
      z: roofRear,
      bottomY: cabin.roofY - 0.075,
      lowerHalfWidth: halfWidth * 0.84,
      shoulderY: cabin.roofY - 0.035,
      shoulderHalfWidth: halfWidth * 0.93,
      topY: cabin.roofY,
      topHalfWidth: halfWidth * 0.75,
    },
  ];
  root.add(createMesh(
    sport ? 'Fastback roof outer shell' : 'Sedan roof outer shell',
    createLoftGeometry(stations),
    material,
    'roof',
  ));
};

const addSedanDetails = (
  root: THREE.Group,
  config: VehicleVisualConfig,
  materials: ExteriorMaterials,
): void => {
  const halfLength = bodyHalfLength(config);
  const halfWidth = bodyHalfWidth(config);
  const hoodFront = -halfLength + 0.24;
  const hoodRear = config.cabin.windshieldBottomZ - 0.1;
  root.add(createMesh(
    'Sedan sculpted bonnet',
    createTaperedPanelGeometry(
      hoodFront,
      hoodRear,
      halfWidth * 0.86,
      halfWidth * 0.91,
      config.body.hoodTopY - 0.055,
      config.body.hoodTopY + 0.025,
      0.045,
    ),
    materials.paint,
    'hood',
  ));

  root.add(createMesh(
    'Sedan boot lid',
    createTaperedPanelGeometry(
      1.06,
      halfLength - 0.14,
      halfWidth * 0.87,
      halfWidth * 0.82,
      config.body.trunkDeckY + 0.025,
      config.body.trunkDeckY - 0.015,
      0.048,
    ),
    materials.paint,
    'trunk',
  ));

  const grille = createMesh(
    'Sedan chrome framed grille',
    new THREE.CapsuleGeometry(0.095, 0.48, 4, 12),
    materials.trim,
    'grille',
  );
  grille.rotation.z = Math.PI / 2;
  grille.scale.set(1, 1.1, 0.08);
  grille.position.set(0, 0.47, -halfLength - 0.006);
  root.add(grille);

  for (const x of [-0.55, 0.55]) {
    const headlamp = createMesh(
      `${x < 0 ? 'Left' : 'Right'} swept sedan headlamp`,
      createQuadGeometry([
        { x: x - 0.215, y: 0.575, z: -halfLength - 0.009 },
        { x: x + 0.215, y: 0.575, z: -halfLength - 0.009 },
        { x: x + 0.18, y: 0.695, z: -halfLength + 0.006 },
        { x: x - 0.19, y: 0.67, z: -halfLength + 0.006 },
      ], true),
      materials.lamp,
      'headlamp',
    );
    headlamp.castShadow = false;
    root.add(headlamp);

    const tailLamp = createMesh(
      `${x < 0 ? 'Left' : 'Right'} sedan tail lamp`,
      createQuadGeometry([
        { x: x - 0.22, y: 0.62, z: halfLength + 0.009 },
        { x: x + 0.22, y: 0.62, z: halfLength + 0.009 },
        { x: x + 0.2, y: 0.75, z: halfLength + 0.005 },
        { x: x - 0.19, y: 0.76, z: halfLength + 0.005 },
      ]),
      materials.rearLamp,
      'tail-lamp',
    );
    tailLamp.castShadow = false;
    root.add(tailLamp);
  }

  // Quiet brightwork and panel breaks make the family car read as a real
  // four-door saloon without adding expensive high-resolution geometry.
  for (const side of [-1, 1] as const) {
    const sideX = side * (halfWidth - 0.008);
    for (const z of [0.3, 1.015]) {
      const sideStation = sampleStation(createSedanStations(config), z);
      const lowerX = side * stationHalfWidthAtY(sideStation, 0.39);
      const upperX = side * stationHalfWidthAtY(sideStation, 0.78);
      root.add(createBeam(
        `${side < 0 ? 'Left' : 'Right'} sedan door shut line`,
        new THREE.Vector3(lowerX, 0.39, z + 0.02),
        new THREE.Vector3(upperX, 0.78, z - 0.015),
        0.008,
        materials.trim,
        'panel-gap',
      ));
    }
    root.add(createBeam(
      `${side < 0 ? 'Left' : 'Right'} sedan lower chrome strip`,
      new THREE.Vector3(sideX, 0.42, -0.83),
      new THREE.Vector3(sideX, 0.43, 1.03),
      0.008,
      materials.chrome,
      'brightwork',
    ));
  }
};

const sampleStation = (stations: readonly BodyStation[], z: number): BodyStation => {
  const index = stations.findIndex((station) => station.z >= z);
  if (index <= 0) return stations[Math.max(0, index)] ?? stations[stations.length - 1]!;
  const from = stations[index - 1]!;
  const to = stations[index]!;
  const t = (z - from.z) / (to.z - from.z);
  return {
    z, bottomY: THREE.MathUtils.lerp(from.bottomY, to.bottomY, t),
    lowerHalfWidth: THREE.MathUtils.lerp(from.lowerHalfWidth, to.lowerHalfWidth, t),
    shoulderY: THREE.MathUtils.lerp(from.shoulderY, to.shoulderY, t),
    shoulderHalfWidth: THREE.MathUtils.lerp(from.shoulderHalfWidth, to.shoulderHalfWidth, t),
    topY: THREE.MathUtils.lerp(from.topY, to.topY, t),
    topHalfWidth: THREE.MathUtils.lerp(from.topHalfWidth, to.topHalfWidth, t),
  };
};

const stationHalfWidthAtY = (station: BodyStation, y: number): number => y <= station.shoulderY
  ? THREE.MathUtils.lerp(station.lowerHalfWidth, station.shoulderHalfWidth,
    THREE.MathUtils.clamp((y - station.bottomY) / (station.shoulderY - station.bottomY), 0, 1))
  : THREE.MathUtils.lerp(station.shoulderHalfWidth, station.topHalfWidth,
    THREE.MathUtils.clamp((y - station.shoulderY) / (station.topY - station.shoulderY), 0, 1));

/** Low-resolution panel skins follow the shell exactly and retain real wheel openings. */
const addFlankPanels = (root: THREE.Group, config: VehicleVisualConfig, materials: ExteriorMaterials): void => {
  const sport = config.body.profile === 'sport-coupe';
  const stations = sport ? createSportsStations(config) : createSedanStations(config);
  const panels = sport
    ? [
      ['front fender', -bodyHalfLength(config) + 0.23, -0.79, 'front-fender'],
      ['coupe door', -0.79, 0.64, 'door'],
      ['rear quarter panel and tail corner', 0.64, bodyHalfLength(config) - 0.12, 'rear-quarter'],
    ] as const
    : [
      ['front fender', -bodyHalfLength(config) + 0.23, -0.79, 'front-fender'],
      ['front door', -0.79, 0.3, 'door'],
      ['rear door', 0.3, 1.015, 'door'],
      ['rear quarter panel and tail corner', 1.015, bodyHalfLength(config) - 0.12, 'rear-quarter'],
    ] as const;
  const archRadius = config.dimensions.wheelRadius * 1.12;
  const halfWheelBase = config.dimensions.wheelBase * 0.5;
  for (const direction of [-1, 1] as const) {
    for (const [name, frontZ, rearZ, category] of panels) {
      const positions: number[] = [];
      const indices: number[] = [];
      const steps = Math.ceil((rearZ - frontZ) / 0.085);
      for (let step = 0; step <= steps; step += 1) {
        const z = THREE.MathUtils.lerp(frontZ, rearZ, step / steps);
        const station = sampleStation(stations, z);
        const distance = Math.min(Math.abs(z + halfWheelBase), Math.abs(z - halfWheelBase));
        const archBottom = distance < archRadius
          ? config.dimensions.wheelRadius + Math.sqrt(archRadius * archRadius - distance * distance)
          : 0.35;
        const bottomY = Math.min(station.topY - 0.012, Math.max(0.35, archBottom));
        const middleY = Math.max(bottomY, station.shoulderY);
        for (const y of [bottomY, middleY, station.topY - 0.008]) {
          positions.push(direction * (stationHalfWidthAtY(station, y) + 0.001), y, z);
        }
      }
      for (let step = 0; step < steps; step += 1) {
        for (let strip = 0; strip < 2; strip += 1) {
          const a = step * 3 + strip;
          const b = a + 1;
          const c = b + 3;
          const d = a + 3;
          indices.push(...(direction > 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c]));
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      root.add(createMesh(`${direction < 0 ? 'Left' : 'Right'} ${name}`, geometry, materials.paint, category));
    }
    for (const handleZ of sport ? [0.43] : [0.13, 0.82]) {
      const station = sampleStation(stations, handleZ);
      const handle = createMesh(`${direction < 0 ? 'Left' : 'Right'} door handle`,
        new THREE.BoxGeometry(0.018, 0.022, 0.115), materials.trim, 'door-handle');
      handle.position.set(direction * (stationHalfWidthAtY(station, 0.74) + 0.004), 0.74, handleZ);
      root.add(handle);
    }
  }
};

const addSportsDetails = (
  root: THREE.Group,
  config: VehicleVisualConfig,
  materials: ExteriorMaterials,
): void => {
  const halfLength = bodyHalfLength(config);
  const halfWidth = bodyHalfWidth(config);
  root.add(createMesh(
    'Sports power-dome bonnet',
    createTaperedPanelGeometry(
      -halfLength + 0.17,
      config.cabin.windshieldBottomZ - 0.08,
      halfWidth * 0.83,
      halfWidth * 0.91,
      config.body.hoodTopY - 0.115,
      config.body.hoodTopY + 0.028,
      0.038,
    ),
    materials.paint,
    'hood',
  ));
  root.add(createMesh(
    'Sports bonnet centre power bulge',
    createTaperedPanelGeometry(
      -halfLength + 0.34,
      config.cabin.windshieldBottomZ - 0.14,
      0.25,
      0.31,
      config.body.hoodTopY - 0.058,
      config.body.hoodTopY + 0.052,
      0.025,
    ),
    materials.paintDark,
    'hood-contour',
  ));
  root.add(createMesh(
    'Sports short rear deck',
    createTaperedPanelGeometry(
      1.14,
      halfLength - 0.1,
      halfWidth * 0.87,
      halfWidth * 0.78,
      config.body.trunkDeckY + 0.035,
      config.body.trunkDeckY - 0.035,
      0.04,
    ),
    materials.paint,
    'trunk',
  ));

  const centreIntake = createMesh(
    'Sports central front intake',
    new THREE.CapsuleGeometry(0.12, 0.55, 4, 12),
    materials.trim,
    'grille',
  );
  centreIntake.rotation.z = Math.PI / 2;
  centreIntake.scale.set(1, 1.3, 0.075);
  centreIntake.position.set(0, 0.405, -halfLength - 0.008);
  root.add(centreIntake);

  for (const side of [-1, 1] as const) {
    const x = side * 0.62;
    const headlamp = createMesh(
      `${side < 0 ? 'Left' : 'Right'} blade sports headlamp`,
      createQuadGeometry([
        { x: x - 0.2, y: 0.55, z: -halfLength - 0.008 },
        { x: x + 0.2, y: 0.56, z: -halfLength - 0.008 },
        { x: x + 0.17, y: 0.65, z: -halfLength + 0.02 },
        { x: x - 0.14, y: 0.68, z: -halfLength + 0.025 },
      ], true),
      materials.lamp,
      'headlamp',
    );
    headlamp.castShadow = false;
    root.add(headlamp);

    const sideIntake = createMesh(
      `${side < 0 ? 'Left' : 'Right'} sports brake intake`,
      createQuadGeometry([
        { x: x - side * 0.17, y: 0.29, z: -halfLength - 0.01 },
        { x: x + side * 0.17, y: 0.3, z: -halfLength - 0.01 },
        { x: x + side * 0.13, y: 0.45, z: -halfLength + 0.002 },
        { x: x - side * 0.09, y: 0.42, z: -halfLength + 0.002 },
      ], true),
      materials.trim,
      'intake',
    );
    root.add(sideIntake);

    const tailLamp = createMesh(
      `${side < 0 ? 'Left' : 'Right'} sports tail lamp blade`,
      createQuadGeometry([
        { x: x - 0.23, y: 0.58, z: halfLength + 0.008 },
        { x: x + 0.23, y: 0.58, z: halfLength + 0.008 },
        { x: x + 0.2, y: 0.68, z: halfLength + 0.005 },
        { x: x - 0.2, y: 0.7, z: halfLength + 0.005 },
      ]),
      materials.rearLamp,
      'tail-lamp',
    );
    tailLamp.castShadow = false;
    root.add(tailLamp);

    const sillBlade = createMesh(
      `${side < 0 ? 'Left' : 'Right'} sports side blade`,
      createTaperedPanelGeometry(-0.88, 0.91, 0.035, 0.035, 0.31, 0.34, 0.075),
      materials.trim,
      'side-aero',
    );
    sillBlade.position.x = side * (halfWidth - 0.035);
    root.add(sillBlade);
  }

  const splitter = createMesh(
    'Sports front splitter',
    createTaperedPanelGeometry(
      -halfLength - 0.035,
      -halfLength + 0.25,
      halfWidth * 0.94,
      halfWidth * 0.82,
      0.205,
      0.225,
      0.025,
    ),
    materials.trim,
    'aero',
  );
  root.add(splitter);

  const diffuser = createMesh(
    'Sports rear diffuser',
    createTaperedPanelGeometry(
      halfLength - 0.25,
      halfLength + 0.025,
      halfWidth * 0.76,
      halfWidth * 0.88,
      0.24,
      0.22,
      0.07,
    ),
    materials.trim,
    'aero',
  );
  root.add(diffuser);

  const lip = createMesh(
    'Sports integrated ducktail spoiler',
    createTaperedPanelGeometry(
      halfLength - 0.27,
      halfLength - 0.08,
      halfWidth * 0.78,
      halfWidth * 0.75,
      config.body.trunkDeckY + 0.08,
      config.body.trunkDeckY + 0.13,
      0.035,
    ),
    materials.paintDark,
    'aero',
  );
  root.add(lip);

  const exhaustMaterial = materials.chrome;
  for (const x of [-0.58, 0.58]) {
    const exhaust = createMesh(
      `${x < 0 ? 'Left' : 'Right'} sports exhaust outlet`,
      new THREE.CylinderGeometry(0.055, 0.062, 0.12, 12, 1, true),
      exhaustMaterial,
      'exhaust',
    );
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(x, 0.29, halfLength + 0.025);
    root.add(exhaust);
  }
};

const createMaterials = (config: VehicleVisualConfig): ExteriorMaterials => ({
  paint: new THREE.MeshStandardMaterial({
    color: config.body.color,
    roughness: 0.31,
    metalness: 0.5,
  }),
  paintDark: new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.body.color).multiplyScalar(0.67),
    roughness: 0.39,
    metalness: 0.43,
  }),
  trim: new THREE.MeshStandardMaterial({
    color: config.body.trimColor,
    roughness: 0.73,
    metalness: 0.09,
  }),
  glass: new THREE.MeshPhysicalMaterial({
    color: config.body.profile === 'sport-coupe' ? 0x6d8794 : 0x89a8b4,
    transparent: true,
    opacity: config.body.profile === 'sport-coupe' ? 0.32 : 0.25,
    roughness: 0.08,
    metalness: 0.04,
    transmission: 0.17,
    depthWrite: false,
    side: THREE.FrontSide,
  }),
  lamp: new THREE.MeshStandardMaterial({
    color: 0xeaf7ff,
    emissive: 0x8ab6ca,
    emissiveIntensity: 0.72,
    roughness: 0.17,
    metalness: 0.1,
  }),
  rearLamp: new THREE.MeshStandardMaterial({
    color: 0xc01828,
    emissive: 0x4d0308,
    emissiveIntensity: 0.68,
    roughness: 0.22,
  }),
  chrome: new THREE.MeshStandardMaterial({
    color: 0xbac1c5,
    roughness: 0.24,
    metalness: 0.82,
  }),
});

const createSedanStations = (config: VehicleVisualConfig): readonly BodyStation[] => {
  const halfLength = bodyHalfLength(config);
  const halfWidth = bodyHalfWidth(config);
  return [
    { z: -halfLength, bottomY: 0.22, lowerHalfWidth: halfWidth * 0.68, shoulderY: 0.46, shoulderHalfWidth: halfWidth * 0.86, topY: 0.62, topHalfWidth: halfWidth * 0.76 },
    { z: -halfLength + 0.27, bottomY: 0.21, lowerHalfWidth: halfWidth * 0.73, shoulderY: 0.49, shoulderHalfWidth: halfWidth * 0.97, topY: 0.69, topHalfWidth: halfWidth * 0.91 },
    { z: -config.wheelBase * 0.5, bottomY: 0.2, lowerHalfWidth: halfWidth * 0.73, shoulderY: 0.54, shoulderHalfWidth: halfWidth, topY: 0.75, topHalfWidth: halfWidth * 0.93 },
    { z: config.cabin.windshieldBottomZ - 0.06, bottomY: 0.2, lowerHalfWidth: halfWidth * 0.72, shoulderY: 0.57, shoulderHalfWidth: halfWidth * 0.988, topY: config.body.hoodTopY, topHalfWidth: halfWidth * 0.91 },
    { z: 0.54, bottomY: 0.2, lowerHalfWidth: halfWidth * 0.72, shoulderY: 0.58, shoulderHalfWidth: halfWidth * 0.985, topY: 0.8, topHalfWidth: halfWidth * 0.91 },
    { z: config.wheelBase * 0.5, bottomY: 0.2, lowerHalfWidth: halfWidth * 0.73, shoulderY: 0.55, shoulderHalfWidth: halfWidth, topY: 0.77, topHalfWidth: halfWidth * 0.92 },
    { z: halfLength - 0.2, bottomY: 0.22, lowerHalfWidth: halfWidth * 0.73, shoulderY: 0.5, shoulderHalfWidth: halfWidth * 0.96, topY: 0.72, topHalfWidth: halfWidth * 0.84 },
    { z: halfLength, bottomY: 0.25, lowerHalfWidth: halfWidth * 0.67, shoulderY: 0.45, shoulderHalfWidth: halfWidth * 0.87, topY: 0.65, topHalfWidth: halfWidth * 0.76 },
  ];
};

const createSportsStations = (config: VehicleVisualConfig): readonly BodyStation[] => {
  const halfLength = bodyHalfLength(config);
  const halfWidth = bodyHalfWidth(config);
  return [
    { z: -halfLength, bottomY: 0.19, lowerHalfWidth: halfWidth * 0.73, shoulderY: 0.39, shoulderHalfWidth: halfWidth * 0.9, topY: 0.51, topHalfWidth: halfWidth * 0.72 },
    { z: -halfLength + 0.3, bottomY: 0.18, lowerHalfWidth: halfWidth * 0.77, shoulderY: 0.44, shoulderHalfWidth: halfWidth, topY: 0.61, topHalfWidth: halfWidth * 0.89 },
    { z: -config.wheelBase * 0.5, bottomY: 0.18, lowerHalfWidth: halfWidth * 0.75, shoulderY: 0.52, shoulderHalfWidth: halfWidth, topY: 0.67, topHalfWidth: halfWidth * 0.9 },
    { z: config.cabin.windshieldBottomZ - 0.05, bottomY: 0.18, lowerHalfWidth: halfWidth * 0.73, shoulderY: 0.55, shoulderHalfWidth: halfWidth, topY: config.body.hoodTopY, topHalfWidth: halfWidth * 0.89 },
    { z: 0.54, bottomY: 0.18, lowerHalfWidth: halfWidth * 0.73, shoulderY: 0.56, shoulderHalfWidth: halfWidth, topY: 0.73, topHalfWidth: halfWidth * 0.9 },
    { z: config.wheelBase * 0.5, bottomY: 0.18, lowerHalfWidth: halfWidth * 0.76, shoulderY: 0.54, shoulderHalfWidth: halfWidth, topY: 0.69, topHalfWidth: halfWidth * 0.91 },
    { z: halfLength - 0.2, bottomY: 0.2, lowerHalfWidth: halfWidth * 0.76, shoulderY: 0.48, shoulderHalfWidth: halfWidth * 0.97, topY: 0.62, topHalfWidth: halfWidth * 0.84 },
    { z: halfLength, bottomY: 0.23, lowerHalfWidth: halfWidth * 0.7, shoulderY: 0.42, shoulderHalfWidth: halfWidth * 0.89, topY: 0.57, topHalfWidth: halfWidth * 0.75 },
  ];
};

/** Lightweight complete exterior, authored from the shared SI vehicle envelope. */
export function buildVehicleExterior(
  root: THREE.Group,
  config: VehicleVisualConfig,
): void {
  const sport = config.body.profile === 'sport-coupe';
  const materials = createMaterials(config);
  root.userData.vehicleProfile = config.body.profile;

  root.add(createMesh(
    sport ? 'Low-poly sports body shell' : 'Low-poly sedan body shell',
    createBodyGeometry(sport ? createSportsStations(config) : createSedanStations(config), config),
    materials.paint,
    'main-shell',
  ));

  const halfLength = bodyHalfLength(config);
  const halfWidth = bodyHalfWidth(config);
  root.add(
    createMesh(
      'Front bumper fascia',
      createQuadGeometry([
        { x: -halfWidth * 0.77, y: sport ? 0.22 : 0.25, z: -halfLength - 0.004 },
        { x: halfWidth * 0.77, y: sport ? 0.22 : 0.25, z: -halfLength - 0.004 },
        { x: halfWidth * 0.88, y: sport ? 0.47 : 0.52, z: -halfLength + 0.006 },
        { x: -halfWidth * 0.88, y: sport ? 0.47 : 0.52, z: -halfLength + 0.006 },
      ], true),
      materials.paintDark,
      'bumper',
    ),
    createMesh(
      'Rear bumper fascia',
      createQuadGeometry([
        { x: -halfWidth * 0.78, y: sport ? 0.23 : 0.26, z: halfLength + 0.004 },
        { x: halfWidth * 0.78, y: sport ? 0.23 : 0.26, z: halfLength + 0.004 },
        { x: halfWidth * 0.88, y: sport ? 0.48 : 0.51, z: halfLength - 0.006 },
        { x: -halfWidth * 0.88, y: sport ? 0.48 : 0.51, z: halfLength - 0.006 },
      ]),
      materials.paintDark,
      'bumper',
    ),
  );
  addRoof(root, config, materials.paint);
  addCabinGlazingAndPillars(root, config, materials);
  addWheelArchFlares(root, config, materials.paintDark);
  addFlankPanels(root, config, materials);

  if (sport) addSportsDetails(root, config, materials);
  else addSedanDetails(root, config, materials);

  const [leftSill, rightSill] = addSymmetricMeshes(
    root,
    'rocker sill',
    () => createTaperedPanelGeometry(-0.94, 1.04, 0.04, 0.04, 0.3, 0.32, 0.1),
    sport ? materials.trim : materials.paintDark,
    'sill',
  );
  leftSill.position.set(-bodyHalfWidth(config) + 0.035, 0, 0);
  rightSill.position.set(bodyHalfWidth(config) - 0.035, 0, 0);
}
