import * as THREE from 'three';

import type { MirrorVisualConfig, VehicleVisualConfig } from './VehicleVisualConfig';
import type { MirrorSurfaceMesh } from './VehicleVisual';

/**
 * Dedicated low-cost Model 3 exterior.  The body is a set of smooth longitudinal
 * grids rather than a re-used saloon loft: a low nose, a single fastback arc
 * from the windscreen to the rear glass, a rear haunch over the trailing wheel
 * and real open wheel arches.  Only shared material/asset contracts are used.
 *
 * Coordinate system matches every other vehicle visual: +X right, +Y up,
 * -Z forward, origin midway between the axles at tyre-contact height.
 */

const lerp = THREE.MathUtils.lerp;
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));
const smoothStep = (value: number): number => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

type Point = readonly [number, number, number];

interface BodySection {
  readonly z: number;
  readonly top: number;
  readonly shoulder: number;
  readonly half: number;
  readonly belt: number;
}

/** z, deck/belt height, shoulder height, shoulder half-width, belt half-width. */
const SECTIONS: readonly (readonly [number, number, number, number, number])[] = [
  [-2.349, .748, .600, .780, .600],
  [-2.300, .772, .620, .838, .690],
  [-2.220, .798, .640, .878, .760],
  [-2.120, .824, .660, .900, .800],
  [-2.000, .848, .675, .910, .830],
  [-1.850, .872, .690, .916, .855],
  [-1.700, .888, .700, .918, .872],
  [-1.550, .900, .706, .919, .880],
  [-1.438, .906, .710, .919, .884],
  [-1.250, .914, .714, .917, .886],
  [-1.050, .921, .718, .914, .887],
  [-.950, .929, .720, .912, .887],
  [-.900, .948, .722, .911, .887],
  [-.700, .955, .726, .909, .888],
  [-.400, .959, .730, .910, .890],
  [.000, .962, .736, .912, .892],
  [.400, .965, .742, .916, .894],
  [.800, .969, .748, .920, .895],
  [1.100, .972, .750, .920, .893],
  [1.300, .974, .748, .917, .889],
  [1.438, .973, .744, .913, .883],
  [1.600, .966, .738, .904, .870],
  [1.800, .955, .728, .896, .855],
  [1.980, .944, .716, .886, .836],
  [2.150, .933, .700, .872, .812],
  [2.280, .923, .682, .858, .785],
  [2.349, .912, .655, .840, .745],
];

const sectionAt = (z: number): BodySection => {
  const first = SECTIONS[0]!;
  const last = SECTIONS[SECTIONS.length - 1]!;
  if (z <= first[0]) return { z, top: first[1], shoulder: first[2], half: first[3], belt: first[4] };
  if (z >= last[0]) return { z, top: last[1], shoulder: last[2], half: last[3], belt: last[4] };
  let low = 0;
  let high = SECTIONS.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (SECTIONS[middle]![0] <= z) low = middle; else high = middle;
  }
  const a = SECTIONS[low]!;
  const b = SECTIONS[high]!;
  const t = (z - a[0]) / (b[0] - a[0]);
  return {
    z,
    top: lerp(a[1], b[1], t),
    shoulder: lerp(a[2], b[2], t),
    half: lerp(a[3], b[3], t),
    belt: lerp(a[4], b[4], t),
  };
};

/** Flank width at a height, including a subtle rear haunch and front fender. */
const widthAt = (z: number, y: number): number => {
  const section = sectionAt(z);
  const base = .245;
  const shoulder = Math.max(section.shoulder, base + .012);
  const top = Math.max(section.top, shoulder + .012);
  const baseWidth = y <= shoulder
    ? section.half * (.928 + .072 * smoothStep((y - base) / (shoulder - base)))
    : lerp(section.half, section.belt, smoothStep((y - shoulder) / (top - shoulder)));
  const rearHaunch = .006 * Math.exp(-(((z - 1.16) / .42) ** 2)) * Math.exp(-(((y - .70) / .15) ** 2));
  const frontFender = .0035 * Math.exp(-(((z + 1.55) / .35) ** 2)) * Math.exp(-(((y - .70) / .16) ** 2));
  return Math.min(.9195, baseWidth + rearHaunch + frontFender);
};

const bodyHalfLength = (config: VehicleVisualConfig): number =>
  (config.dimensions.length - .0226) * .5;

/** Rounded bumper plan; the side skin and fascia share the exact same map. */
const endAdjustedZ = (z: number, x: number): number => {
  const frontRamp = clamp((-z - 1.92) / .40, 0, 1);
  const rearRamp = clamp((z - 1.92) / .40, 0, 1);
  const factor = Math.min(1.4, Math.abs(x) / .92);
  const cubed = factor * factor * factor;
  return z + .095 * cubed * frontRamp - .075 * cubed * rearRamp;
};

const archBottomAt = (config: VehicleVisualConfig, z: number): number => {
  const center = config.body.wheelArchCenterY ?? config.dimensions.wheelRadius;
  const height = config.dimensions.wheelRadius + config.body.wheelArchClearance;
  const halfWidth = config.dimensions.wheelRadius + .055;
  let bottom = .256;
  for (const axle of [-config.wheelBase * .5, config.wheelBase * .5]) {
    const distance = Math.abs(z - axle);
    if (distance < halfWidth) {
      bottom = Math.max(bottom, center + height * Math.sqrt(1 - (distance / halfWidth) ** 2));
    }
  }
  return bottom;
};

/**
 * Door-skin height used by the shared cockpit trim.  The exterior module owns
 * the real section, so the cockpit cards follow this body instead of the
 * generic electric-fastback loft.
 */
export function teslaModel3DoorSkinAnchor(z: number): THREE.Vector3 {
  const y = sectionAt(z).top - .008;
  return new THREE.Vector3(widthAt(z, y) + .001, y, z);
}

interface ExteriorMaterials {
  readonly paint: THREE.MeshPhysicalMaterial;
  readonly paintDark: THREE.MeshStandardMaterial;
  readonly trim: THREE.MeshStandardMaterial;
  readonly gloss: THREE.MeshStandardMaterial;
  readonly underbody: THREE.MeshStandardMaterial;
  readonly liner: THREE.MeshStandardMaterial;
  readonly glassWindshield: THREE.MeshPhysicalMaterial;
  readonly glassSide: THREE.MeshPhysicalMaterial;
  readonly glassRoof: THREE.MeshPhysicalMaterial;
  readonly lens: THREE.MeshPhysicalMaterial;
  readonly redLens: THREE.MeshStandardMaterial;
}

const createMaterials = (config: VehicleVisualConfig): ExteriorMaterials => ({
  paint: new THREE.MeshPhysicalMaterial({
    color: config.body.color, roughness: .30, metalness: .42,
    clearcoat: .9, clearcoatRoughness: .13,
  }),
  paintDark: new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.body.color).multiplyScalar(.62), roughness: .38, metalness: .36,
  }),
  trim: new THREE.MeshStandardMaterial({ color: config.body.trimColor, roughness: .62, metalness: .08 }),
  gloss: new THREE.MeshStandardMaterial({ color: 0x06080a, roughness: .16, metalness: .34, side: THREE.DoubleSide }),
  underbody: new THREE.MeshStandardMaterial({ color: 0x07090b, roughness: .96, metalness: .02 }),
  liner: new THREE.MeshStandardMaterial({ color: 0x0a0d10, roughness: .98, metalness: .01, side: THREE.DoubleSide }),
  glassWindshield: new THREE.MeshPhysicalMaterial({
    color: 0x6f8797, transparent: true, opacity: config.windowGlass?.windshieldOpacity ?? .16,
    roughness: .07, metalness: .08, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide,
  }),
  glassSide: new THREE.MeshPhysicalMaterial({
    color: 0x26323b, transparent: true, opacity: .44, roughness: .10, metalness: .12,
    clearcoat: 1, depthWrite: false, side: THREE.DoubleSide,
  }),
  glassRoof: new THREE.MeshPhysicalMaterial({
    color: 0x0d1419, transparent: true, opacity: .93, roughness: .05, metalness: .24,
    clearcoat: 1, depthWrite: true, side: THREE.DoubleSide,
  }),
  lens: new THREE.MeshPhysicalMaterial({
    color: 0x0b1117, roughness: .10, metalness: .30, clearcoat: 1, side: THREE.DoubleSide,
  }),
  redLens: new THREE.MeshStandardMaterial({
    color: 0x1d0509, roughness: .16, metalness: .22, side: THREE.DoubleSide,
  }),
});

/** UV-free grid mesh; `reverse` flips winding when the surface faces -axis. */
const gridMesh = (
  name: string,
  rows: number,
  columns: number,
  point: (u: number, v: number) => Point,
  material: THREE.Material,
  category: string,
  reverse = false,
): THREE.Mesh => {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      const p = point(row / rows, column / columns);
      positions.push(p[0], p[1], p[2]);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      if (reverse) indices.push(a, a + 1, b, b, a + 1, b + 1);
      else indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData.vehicleBodyPart = category;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

const addMesh = (
  root: THREE.Group, name: string, geometry: THREE.BufferGeometry,
  material: THREE.Material, category: string, shadow = true,
): THREE.Mesh => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData.vehicleBodyPart = category;
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  root.add(mesh);
  return mesh;
};

const addTube = (
  root: THREE.Group, name: string, points: readonly Point[], radius: number,
  material: THREE.Material, category: string,
): THREE.Mesh => {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
  const geometry = new THREE.TubeGeometry(curve, Math.max(10, points.length * 8), radius, 5, false);
  return addMesh(root, name, geometry, material, category);
};

const addLightingKey = (mesh: THREE.Mesh, key: string): void => {
  mesh.userData.lightingKey = key;
};

/* ------------------------------------------------------------------ body */

const addBodySides = (root: THREE.Group, config: VehicleVisualConfig, m: ExteriorMaterials): void => {
  const halfLength = bodyHalfLength(config);
  const rows = 128;
  for (const sign of [-1, 1] as const) {
    const side = sign < 0 ? 'Left' : 'Right';
    const lower = gridMesh(`${side} Model 3 lower body side`, rows, 7, (u, v) => {
      const z = lerp(-halfLength, halfLength, u);
      const section = sectionAt(z);
      const bottom = archBottomAt(config, z);
      const crease = Math.max(section.shoulder, bottom + .012);
      const y = lerp(bottom, crease, v);
      const x = widthAt(z, y);
      return [sign * x, y, endAdjustedZ(z, x)];
    }, m.paint, 'body', sign > 0);
    const upper = gridMesh(`${side} Model 3 shoulder and belt`, rows, 6, (u, v) => {
      const z = lerp(-halfLength, halfLength, u);
      const section = sectionAt(z);
      const bottom = archBottomAt(config, z);
      const crease = Math.max(section.shoulder, bottom + .012);
      const y = lerp(crease, section.top, v);
      const x = widthAt(z, y) + (1 - v) * .0015;
      return [sign * x, y, endAdjustedZ(z, x)];
    }, m.paint, 'body', sign > 0);
    root.add(lower, upper);
  }
};

const addUnderbody = (root: THREE.Group, config: VehicleVisualConfig, m: ExteriorMaterials): void => {
  const halfLength = bodyHalfLength(config);
  const floor = new THREE.BoxGeometry(1.34, .016, config.dimensions.length - .34);
  const floorMesh = addMesh(root, 'Tesla underbody', floor, m.underbody, 'main-shell');
  floorMesh.position.set(0, config.body.groundClearance + .008, 0);
  const close = new THREE.BoxGeometry(.022, .14, halfLength * 1.30);
  for (const sign of [-1, 1] as const) {
    const panel = addMesh(root, `${sign < 0 ? 'Left' : 'Right'} underbody side closure`,
      close, m.underbody, 'underbody');
    panel.position.set(sign * .70, config.body.groundClearance + .075, 0);
  }
  const tray = new THREE.BoxGeometry(1.40, .012, .44);
  for (const front of [true, false]) {
    const panel = addMesh(root, `${front ? 'Front' : 'Rear'} undertray`, tray, m.underbody, 'underbody');
    panel.position.set(0, config.body.groundClearance + .022, (front ? -1 : 1) * (halfLength - .34));
  }
  // Dark lower closures stop a low camera from seeing through the bumper into
  // the wheel wells; they stay on the loaded floor datum.
  const valance = new THREE.BoxGeometry(1.22, .100, .05);
  for (const front of [true, false]) {
    const panel = addMesh(root, `${front ? 'Front' : 'Rear'} lower valance closure`,
      valance, m.underbody, 'underbody');
    panel.position.set(0, .190, (front ? -1 : 1) * (halfLength - .055));
  }
  const sillPan = new THREE.BoxGeometry(.18, .012, 2.0);
  for (const sign of [-1, 1] as const) {
    const panel = addMesh(root, `${sign < 0 ? 'Left' : 'Right'} sill underside`,
      sillPan, m.underbody, 'underbody');
    panel.position.set(sign * .76, .250, 0);
  }
  const rearValance = new THREE.BoxGeometry(1.18, .10, .06);
  const diffuser = addMesh(root, 'Tesla rear valance', rearValance, m.trim, 'diffuser');
  diffuser.position.set(0, .255, halfLength - .04);
};

const addHood = (root: THREE.Group, config: VehicleVisualConfig, m: ExteriorMaterials): void => {
  const halfLength = bodyHalfLength(config);
  const cowlZ = config.cabin.windshieldBottomZ;
  const hood = gridMesh('Tesla aluminium bonnet', 28, 22, (u, v) => {
    const z = lerp(-halfLength, cowlZ, u);
    const section = sectionAt(z);
    const across = v * 2 - 1;
    const x = across * section.belt * .998;
    const crown = .020 * Math.sin(Math.PI * u);
    const ridge = .005 * Math.exp(-(((Math.abs(across) - .58) / .09) ** 2)) * Math.sin(Math.PI * u);
    return [x, section.top + crown * (1 - across * across) + ridge, endAdjustedZ(z, x)];
  }, m.paint, 'hood');
  root.add(hood);
  const rear = sectionAt(cowlZ);
  for (const sign of [-1, 1] as const) {
    const edge: Point[] = [];
    for (let step = 0; step <= 8; step += 1) {
      const z = lerp(-halfLength + .03, cowlZ - .02, step / 8);
      const section = sectionAt(z);
      const x = sign * (section.belt - .004);
      edge.push([x, section.top + .002, endAdjustedZ(z, x)]);
    }
    addTube(root, `${sign < 0 ? 'Left' : 'Right'} bonnet shut line`, edge, .0032, m.trim, 'panel-gap');
  }
  const cowl = new THREE.BoxGeometry(rear.belt * 1.90, .012, .075);
  const panel = addMesh(root, 'Model 3 black cowl vent', cowl, m.trim, 'cowl');
  panel.position.set(0, rear.top + .003, cowlZ - .02);
  const frontEdge: Point[] = [];
  for (let step = 0; step <= 10; step += 1) {
    const x = lerp(-.585, .585, step / 10);
    frontEdge.push([x, sectionAt(-halfLength).top + .002, endAdjustedZ(-halfLength, x) - .001]);
  }
  addTube(root, 'Bonnet leading shut line', frontEdge, .003, m.trim, 'panel-gap');
  for (const sign of [-1, 1] as const) {
    const wiper = new THREE.BoxGeometry(.36, .008, .016);
    const blade = addMesh(root, `${sign < 0 ? 'Left' : 'Right'} parked wiper`, wiper, m.gloss, 'cowl');
    blade.position.set(sign * .30, rear.top + .012, cowlZ - .045);
    blade.rotation.y = sign * .10;
  }
};

const addTrunk = (root: THREE.Group, config: VehicleVisualConfig, m: ExteriorMaterials): void => {
  const halfLength = bodyHalfLength(config);
  const rearGlassBottomZ = 1.600;
  const deck = gridMesh('Tesla fastback boot lid', 18, 20, (u, v) => {
    const z = lerp(rearGlassBottomZ, halfLength, u);
    const section = sectionAt(z);
    const across = v * 2 - 1;
    const x = across * section.belt * .998;
    const crown = .018 * Math.sin(Math.PI * u);
    return [x, section.top + crown * (1 - across * across), endAdjustedZ(z, x)];
  }, m.paint, 'trunk');
  root.add(deck);
  const lip = new THREE.BoxGeometry(1.24, .012, .12);
  const blade = addMesh(root, 'Tesla integrated boot lip', lip, m.paint, 'trunk');
  blade.position.set(0, sectionAt(2.28).top + .010, 2.28);
  blade.rotation.x = -.02;
  const rear = sectionAt(rearGlassBottomZ);
  for (const sign of [-1, 1] as const) {
    const edge: Point[] = [];
    for (let step = 0; step <= 7; step += 1) {
      const z = lerp(rearGlassBottomZ + .04, halfLength - .02, step / 7);
      const section = sectionAt(z);
      const x = sign * (section.belt - .004);
      edge.push([x, section.top + .002, endAdjustedZ(z, x)]);
    }
    addTube(root, `${sign < 0 ? 'Left' : 'Right'} boot shut line`, edge, .0032, m.trim, 'panel-gap');
  }
  const seal = new THREE.BoxGeometry(rear.belt * 1.95, .014, .045);
  const sealMesh = addMesh(root, 'Rear glass lower seal', seal, m.trim, 'window-trim');
  sealMesh.position.set(0, rear.top + .006, rearGlassBottomZ + .01);
  const rearEdge: Point[] = [];
  for (let step = 0; step <= 10; step += 1) {
    const x = lerp(-.72, .72, step / 10);
    rearEdge.push([x, sectionAt(halfLength).top + .002, endAdjustedZ(halfLength, x) + .001]);
  }
  addTube(root, 'Boot trailing shut line', rearEdge, .003, m.trim, 'panel-gap');
};

const addFascias = (root: THREE.Group, config: VehicleVisualConfig, m: ExteriorMaterials): void => {
  const halfLength = bodyHalfLength(config);
  const frontZ = (x: number): number => endAdjustedZ(-halfLength, x) - .001;
  const rearZ = (x: number): number => endAdjustedZ(halfLength, x) + .001;
  const frontWidth = (y: number): number => widthAt(-halfLength, y);
  const rearWidth = (y: number): number => widthAt(halfLength, y);

  const frontLower = gridMesh('Tesla front bumper lower', 6, 22, (u, v) => {
    const y = lerp(.245, .405, u);
    const across = v * 2 - 1;
    const x = across * frontWidth(y);
    return [x, y, frontZ(x)];
  }, m.paint, 'bumper');
  const frontUpper = gridMesh('Tesla front bumper upper', 10, 22, (u, v) => {
    const y = lerp(.405, sectionAt(-halfLength).top, u);
    const across = v * 2 - 1;
    const x = across * frontWidth(y);
    return [x, y, frontZ(x)];
  }, m.paint, 'bumper');
  root.add(frontLower, frontUpper);

  // Model 3 has a closed upper nose with one wide lower intake and corner ducts.
  const intake = gridMesh('Tesla lower cooling intake', 4, 14, (u, v) => {
    const y = lerp(.285, .400, u);
    const across = v * 2 - 1;
    const x = across * .46;
    return [x, y, frontZ(x) - .004];
  }, m.trim, 'grille');
  root.add(intake);
  for (const sign of [-1, 1] as const) {
    const duct = gridMesh(`${sign < 0 ? 'Left' : 'Right'} Tesla air curtain`,
      5, 4, (u, v) => {
        const y = lerp(.345, .585, u);
        const x = sign * lerp(.545, .625, v);
        return [x, y, frontZ(x) - .003];
      }, m.trim, 'intake', sign < 0);
    root.add(duct);
  }
  const splitter = gridMesh('Tesla front splitter lip', 2, 18, (u, v) => {
    const y = lerp(.225, .255, u);
    const across = v * 2 - 1;
    const x = across * .80;
    return [x, y, frontZ(x) - .012];
  }, m.trim, 'aero');
  root.add(splitter);

  const rearLower = gridMesh('Tesla rear bumper lower', 4, 22, (u, v) => {
    const y = lerp(.245, .335, u);
    const across = v * 2 - 1;
    const x = across * rearWidth(y);
    return [x, y, rearZ(x)];
  }, m.paint, 'bumper', true);
  const rearUpper = gridMesh('Tesla rear bumper upper', 9, 22, (u, v) => {
    const y = lerp(.335, sectionAt(halfLength).top, u);
    const across = v * 2 - 1;
    const x = across * rearWidth(y);
    return [x, y, rearZ(x)];
  }, m.paint, 'bumper', true);
  root.add(rearLower, rearUpper);

  const valance = gridMesh('Tesla rear diffuser panel', 4, 14, (u, v) => {
    const y = lerp(.238, .345, u);
    const across = v * 2 - 1;
    const x = across * .62;
    return [x, y, rearZ(x) + .004];
  }, m.trim, 'diffuser', true);
  root.add(valance);
  for (const x of [-.30, 0, .30]) {
    const strake = new THREE.BoxGeometry(.018, .085, .030);
    const mesh = addMesh(root, 'Tesla diffuser strake', strake, m.trim, 'diffuser');
    mesh.position.set(x, .293, rearZ(x) + .004);
  }
  const rearLip = gridMesh('Tesla rear valance lip', 2, 16, (u, v) => {
    const y = lerp(.225, .250, u);
    const across = v * 2 - 1;
    const x = across * .70;
    return [x, y, rearZ(x) + .010];
  }, m.trim, 'aero', true);
  root.add(rearLip);
};

/* ------------------------------------------------------------- greenhouse */

/** t, z, centreline y, half-width, crown. One continuous fastback arc. */
const CANOPY: readonly (readonly [number, number, number, number, number])[] = [
  [0, -.900, .950, .700, .006],
  [.06, -.760, 1.040, .684, .012],
  [.13, -.580, 1.150, .668, .020],
  [.21, -.390, 1.258, .650, .030],
  [.30, -.210, 1.345, .634, .038],
  [.38, -.050, 1.398, .622, .044],
  [.46, .110, 1.424, .616, .046],
  [.54, .270, 1.436, .612, .046],
  [.62, .440, 1.430, .608, .044],
  [.70, .620, 1.402, .606, .040],
  [.78, .810, 1.352, .610, .034],
  [.86, 1.010, 1.278, .620, .026],
  [.92, 1.220, 1.178, .636, .017],
  [.97, 1.430, 1.070, .658, .010],
  [1, 1.600, .966, .684, .004],
];

interface CanopyPoint {
  readonly z: number;
  readonly y: number;
  readonly half: number;
  readonly crown: number;
}

const canopyAt = (t: number): CanopyPoint => {
  const first = CANOPY[0]!;
  const last = CANOPY[CANOPY.length - 1]!;
  const clamped = clamp(t, 0, 1);
  if (clamped <= first[0]) return { z: first[1], y: first[2], half: first[3], crown: first[4] };
  if (clamped >= last[0]) return { z: last[1], y: last[2], half: last[3], crown: last[4] };
  let low = 0;
  let high = CANOPY.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (CANOPY[middle]![0] <= clamped) low = middle; else high = middle;
  }
  const a = CANOPY[low]!;
  const b = CANOPY[high]!;
  const f = (clamped - a[0]) / (b[0] - a[0]);
  return { z: lerp(a[1], b[1], f), y: lerp(a[2], b[2], f), half: lerp(a[3], b[3], f), crown: lerp(a[4], b[4], f) };
};

const canopyPoint = (t: number, across: number): Point => {
  const p = canopyAt(t);
  return [across * p.half, p.y - p.crown * across * across, p.z];
};

const addCanopy = (root: THREE.Group, m: ExteriorMaterials): void => {
  const panel = (name: string, from: number, to: number, rows: number, material: THREE.Material): void => {
    root.add(gridMesh(name, rows, 10, (u, v) =>
      canopyPoint(lerp(from, to, u), v * 2 - 1), material, 'glass'));
  };
  panel('Model 3 windscreen', 0, .30, 8, m.glassWindshield);
  panel('Model 3 panoramic glass roof', .30, .70, 8, m.glassRoof);
  panel('Model 3 rear glass', .70, 1, 10, m.glassSide);

  for (const sign of [-1, 1] as const) {
    // Black glass border first, then the narrow painted roof rail. The black
    // band reaches in over the side-window top so there is no open drip slot.
    const blackRail = gridMesh(`${sign < 0 ? 'Left' : 'Right'} glass roof border`, 26, 2, (u, v) => {
      const p = canopyAt(lerp(.27, .91, u));
      const x = lerp(.603, .648, v);
      const y = p.y - p.crown - .002 - v * .004;
      return [sign * x, y, p.z];
    }, m.gloss, 'roof', sign < 0);
    const paintRail = gridMesh(`${sign < 0 ? 'Left' : 'Right'} roof rail`, 26, 2, (u, v) => {
      const p = canopyAt(lerp(.27, .91, u));
      const x = lerp(.648, .668, v);
      const y = p.y - p.crown - .006 - v * .006;
      return [sign * x, y, p.z];
    }, m.paint, 'roof', sign < 0);
    root.add(blackRail, paintRail);
    const frit: Point[] = [];
    for (let step = 0; step <= 14; step += 1) {
      const p = canopyAt(step / 14);
      frit.push([sign * (p.half + .001), p.y - p.crown + .001, p.z]);
    }
    addTube(root, `${sign < 0 ? 'Left' : 'Right'} glass roof frit`, frit, .0065, m.gloss, 'window-trim');
  }
  const seam = (t: number, label: string): void => {
    const points: Point[] = [];
    for (let step = 0; step <= 12; step += 1) {
      const p = canopyPoint(t, step / 6 - 1);
      points.push([p[0], p[1] + .001, p[2]]);
    }
    addTube(root, label, points, .0065, m.gloss, 'window-trim');
  };
  seam(.30, 'Windscreen header seal');
  seam(.70, 'Panoramic roof trailing seal');
  seam(1, 'Rear glass lower seal');

  for (const sign of [-1, 1] as const) {
    const side = sign < 0 ? 'Left' : 'Right';
    const base = canopyPoint(0, sign);
    const top = canopyPoint(.30, sign);
    addTube(root, `${side} black A-pillar`,
      [[base[0] + sign * .010, base[1], base[2] + .008],
        [top[0] + sign * .010, top[1], top[2] + .006]], .024, m.gloss, 'pillar');
    const seal: Point[] = [];
    for (let step = 0; step <= 8; step += 1) {
      const p = canopyPoint((step / 8) * .30, sign);
      seal.push([p[0] + sign * .004, p[1] + .003, p[2] + .002]);
    }
    addTube(root, `${side} windscreen side seal`, seal, .007, m.gloss, 'window-trim');
    // Close the triangular base between the bonded windscreen edge and the
    // inboard door-glass leading edge. Without this the cabin would be open
    // below the thin A-pillar beam.
    const skin = gridMesh(`${side} A-pillar side skin`, 5, 5, (u, v) => {
      const windX = lerp(.700, .634, u);
      const windY = lerp(.950, 1.307, u);
      const windZ = lerp(-.900, -.210, u);
      const glassX = lerp(.818, .610, u);
      const glassY = lerp(.956, 1.307, u);
      const glassZ = lerp(-.820, -.210, u);
      const amount = smoothStep(v);
      const x = lerp(windX, glassX, amount) + .005 * Math.sin(Math.PI * v) * Math.sin(Math.PI * u);
      return [sign * x, lerp(windY, glassY, amount), lerp(windZ, glassZ, amount)];
    }, m.gloss, 'pillar', sign < 0);
    root.add(skin);
  }
};

const addSideWindows = (root: THREE.Group, config: VehicleVisualConfig, m: ExteriorMaterials): void => {
  const glassX = config.cabin.width * .5 + .018;
  const window = (
    label: string, sign: -1 | 1,
    bottomZ: readonly number[], topZ: readonly number[],
    bottomY: readonly number[], topY: readonly number[], topX: readonly number[],
  ): void => {
    root.add(gridMesh(`${sign < 0 ? 'Left' : 'Right'} ${label}`, 3, bottomZ.length - 1, (u, v) => {
      const index = clamp(Math.round(v * (bottomZ.length - 1)), 0, bottomZ.length - 1);
      const bz = bottomZ[index]!;
      const tz = topZ[index]!;
      const z = lerp(bz, tz, u);
      const y = lerp(bottomY[index]!, topY[index]!, u);
      const x = lerp(glassX, topX[index]!, u) + .0035 * Math.sin(Math.PI * u);
      return [sign * x, y, z];
    }, m.glassSide, 'glass', sign < 0));
    const low: Point[] = [];
    const high: Point[] = [];
    for (let index = 0; index < bottomZ.length; index += 1) {
      low.push([sign * glassX, bottomY[index]!, bottomZ[index]!]);
      high.push([sign * topX[index]!, topY[index]!, topZ[index]!]);
    }
    addTube(root, `${sign < 0 ? 'Left' : 'Right'} ${label} lower seal`, low, .0055, m.gloss, 'window-trim');
    addTube(root, `${sign < 0 ? 'Left' : 'Right'} ${label} upper seal`, high, .0055, m.gloss, 'window-trim');
  };

  const frontBottomZ = [-.82, -.64, -.44, -.24, -.04, .16, .29] as const;
  const frontTopZ = [-.21, -.14, -.07, .01, .09, .16, .23] as const;
  const frontBottomY = [.956, .957, .958, .960, .961, .963, .964] as const;
  const frontTopY = [1.307, 1.322, 1.338, 1.355, 1.370, 1.381, 1.387] as const;
  const rearBottomZ = [.36, .52, .68, .83, .96, 1.06] as const;
  const rearTopZ = [.28, .40, .52, .64, .74, .82] as const;
  const rearBottomY = [.965, .967, .969, .970, .971, .972] as const;
  const rearTopY = [1.389, 1.384, 1.377, 1.366, 1.344, 1.319] as const;
  const topX = [.610, .608, .606, .604, .603, .602, .602] as const;
  const rearTopX = [.610, .607, .605, .603, .601, .600] as const;

  for (const sign of [-1, 1] as const) {
    window('front window', sign, frontBottomZ, frontTopZ, frontBottomY, frontTopY, topX);
    window('rear window', sign, rearBottomZ, rearTopZ, rearBottomY, rearTopY, rearTopX);
    const frontLeading: Point[] = [
      [sign * glassX, frontBottomY[0]!, frontBottomZ[0]!],
      [sign * topX[0]!, frontTopY[0]!, frontTopZ[0]!],
    ];
    addTube(root, `${sign < 0 ? 'Left' : 'Right'} front window leading seal`,
      frontLeading, .0055, m.gloss, 'window-trim');
    const rearTrailing: Point[] = [
      [sign * glassX, rearBottomY[5]!, rearBottomZ[5]!],
      [sign * rearTopX[5]!, rearTopY[5]!, rearTopZ[5]!],
    ];
    addTube(root, `${sign < 0 ? 'Left' : 'Right'} rear window trailing seal`,
      rearTrailing, .0055, m.gloss, 'window-trim');
    const bPillar = gridMesh(`${sign < 0 ? 'Left' : 'Right'} black B-pillar`, 2, 1, (u, v) => {
      const zBottom = lerp(.285, .355, v);
      const zTop = lerp(.195, .285, v);
      const z = lerp(zBottom, zTop, u);
      const x = lerp(glassX + .004, .615, u);
      const y = lerp(.958, 1.385, u);
      return [sign * x, y, z];
    }, m.gloss, 'pillar', sign < 0);
    root.add(bPillar);
    // Rear sail: window trailing edge to the quarter/deck edge, a real shoulder.
    const cSail = gridMesh(`${sign < 0 ? 'Left' : 'Right'} rear shoulder sail`, 6, 7, (u, v) => {
      const innerX = lerp(glassX, .602, v);
      const innerZ = lerp(1.060, .820, v);
      const innerY = lerp(.964, 1.318, v);
      const outerX = lerp(.870, .622, v);
      const outerZ = lerp(1.620, 1.010, v);
      const outerY = lerp(.966, 1.252, v);
      const x = lerp(innerX, outerX, u) + .004 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
      return [sign * x, lerp(innerY, outerY, u), lerp(innerZ, outerZ, u)];
    }, m.paint, 'rear-quarter', sign > 0);
    root.add(cSail);
    // Close the quarter's belt slot between the body edge and the sail bottom.
    const quarterShelf = gridMesh(`${sign < 0 ? 'Left' : 'Right'} rear quarter shelf`, 18, 2, (u, v) => {
      const z = lerp(1.060, 1.600, u);
      const section = sectionAt(z);
      const sailEdge = lerp(.818, .870, u);
      const x = lerp(sailEdge, section.belt + .0008, v);
      const y = lerp(.965, section.top + .001, v);
      return [sign * x, y, z];
    }, m.paint, 'rear-quarter', sign < 0);
    root.add(quarterShelf);
  }
};

/* --------------------------------------------------------------- details */

const addWheelArches = (root: THREE.Group, config: VehicleVisualConfig, m: ExteriorMaterials): void => {
  const center = config.body.wheelArchCenterY ?? config.dimensions.wheelRadius;
  const radius = config.dimensions.wheelRadius + config.body.wheelArchClearance;
  for (const sign of [-1, 1] as const) {
    const side = sign < 0 ? 'Left' : 'Right';
    for (const axle of [-config.wheelBase * .5, config.wheelBase * .5]) {
      const end = axle < 0 ? 'front' : 'rear';
      const lip = gridMesh(`${side} ${end} wheel-arch flare`, 22, 2, (u, v) => {
        const angle = u * Math.PI;
        const z = axle + Math.cos(angle) * radius;
        const y = center + Math.sin(angle) * radius;
        const x = widthAt(z, y) + .0015 - v * .012;
        return [sign * x, y + v * .004, endAdjustedZ(z, x)];
      }, m.paint, 'wheel-arch', sign < 0);
      root.add(lip);
      const liner = gridMesh(`${side} ${end} wheel-house liner`, 26, 4, (u, v) => {
        const angle = u * Math.PI;
        const z = axle + Math.cos(angle) * (radius + .006);
        const roof = center + Math.sin(angle) * (radius + .006);
        const outer = widthAt(z, roof) - .010;
        const x = sign * lerp(outer, .635, Math.min(1, v * 2));
        const y = lerp(roof, .155, Math.max(0, v * 2 - 1));
        return [x, y, z];
      }, m.liner, 'wheel-well');
      root.add(liner);
    }
    // A slim dark rocker edge keeps the low view closed without a body kit.
    const rocker = gridMesh(`${side} rocker edge`, 40, 2, (u, v) => {
      const z = lerp(-1.04, 1.04, u);
      const y = lerp(.248, .278, v);
      const x = widthAt(z, y) + .001;
      return [sign * x, y, endAdjustedZ(z, x)];
    }, m.trim, 'sill', sign > 0);
    root.add(rocker);
  }
};

interface LampColumn {
  readonly kind: 'front' | 'side' | 'rear';
  readonly at: number;
  readonly y: number;
}

const lampPoint = (
  config: VehicleVisualConfig, column: LampColumn, dy: number, offset: number,
): Point => {
  if (column.kind === 'front') {
    const x = column.at;
    return [x, column.y + dy, endAdjustedZ(-bodyHalfLength(config), x) - .002 - offset];
  }
  if (column.kind === 'rear') {
    const x = column.at;
    return [x, column.y + dy, endAdjustedZ(bodyHalfLength(config), x) + .002 + offset];
  }
  const x = widthAt(column.at, column.y + dy) + .004 + offset;
  return [x, column.y + dy, endAdjustedZ(column.at, x)];
};

const lampRibbon = (
  root: THREE.Group, config: VehicleVisualConfig, name: string, sign: number,
  columns: readonly LampColumn[], halfHeight: number, material: THREE.Material,
  category: string, key?: string, zOrigin?: number,
): THREE.Mesh | null => {
  if (columns.length < 2) return null;
  const rows = 2;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index < columns.length; index += 1) {
    for (let row = 0; row <= rows; row += 1) {
      const dy = lerp(-halfHeight, halfHeight, row / rows);
      const point = lampPoint(config, columns[index]!, dy, key === undefined ? 0 : .0045);
      positions.push(sign * point[0], point[1], point[2] - (zOrigin ?? 0));
    }
  }
  const frontFacing = columns[0]!.kind === 'front';
  const reverse = frontFacing ? sign > 0 : sign < 0;
  for (let index = 0; index < columns.length - 1; index += 1) {
    for (let row = 0; row < rows; row += 1) {
      const a = index * (rows + 1) + row;
      const b = a + rows + 1;
      if (reverse) indices.push(a, a + 1, b, b, a + 1, b + 1);
      else indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const mesh = addMesh(root, name, geometry, material, category, false);
  if (zOrigin !== undefined) mesh.position.z = zOrigin;
  if (key !== undefined) addLightingKey(mesh, key);
  return mesh;
};

const addLamps = (root: THREE.Group, config: VehicleVisualConfig, m: ExteriorMaterials): void => {
  const frontColumns: LampColumn[] = [
    { kind: 'front', at: .470, y: .700 },
    { kind: 'front', at: .555, y: .704 },
    { kind: 'front', at: .615, y: .710 },
    { kind: 'side', at: -2.300, y: .716 },
    { kind: 'side', at: -2.240, y: .730 },
    { kind: 'side', at: -2.170, y: .745 },
    { kind: 'side', at: -2.100, y: .758 },
  ];
  const rearColumns: LampColumn[] = [
    { kind: 'rear', at: .300, y: .858 },
    { kind: 'rear', at: .460, y: .862 },
    { kind: 'rear', at: .610, y: .866 },
    { kind: 'rear', at: .735, y: .870 },
    { kind: 'side', at: 2.300, y: .870 },
    { kind: 'side', at: 2.230, y: .872 },
    { kind: 'side', at: 2.160, y: .874 },
  ];
  const shifted = (columns: readonly LampColumn[], dy: number): LampColumn[] =>
    columns.map(column => ({ ...column, y: column.y + dy }));
  for (const sign of [-1, 1] as const) {
    const side = sign < 0 ? 'Left' : 'Right';
    const frontOrigin = -(config.dimensions.length * .5 + .002);
    const rearOrigin = config.dimensions.length * .5 + .002;
    lampRibbon(root, config, `${side} swept headlamp housing`, sign, frontColumns, .034, m.lens, 'headlamp');
    lampRibbon(root, config, `${side} low/high headlamp`, sign, shifted(frontColumns, -.004),
      .009, m.lens, 'lamp-lens', 'head', frontOrigin);
    lampRibbon(root, config, `${side} daytime running lamp`, sign, shifted(frontColumns, .027),
      .0035, m.lens, 'lamp-lens', 'position', frontOrigin);
    lampRibbon(root, config, `${side} front turn signal`, sign, shifted(frontColumns.slice(4), .014),
      .0075, m.lens, 'lamp-lens', sign < 0 ? 'left' : 'right', frontOrigin);

    lampRibbon(root, config, `${side} wraparound tail lamp housing`, sign, rearColumns, .029,
      m.redLens, 'tail-lamp');
    lampRibbon(root, config, `${side} rear tail lamp`, sign, shifted(rearColumns, .001),
      .006, m.redLens, 'lamp-lens', 'tail', rearOrigin);
    lampRibbon(root, config, `${side} brake lamp`, sign, shifted(rearColumns, -.011),
      .006, m.redLens, 'lamp-lens', 'brake', rearOrigin);
    lampRibbon(root, config, `${side} rear turn signal`, sign, shifted(rearColumns.slice(4), .014),
      .007, m.redLens, 'lamp-lens', sign < 0 ? 'left' : 'right', rearOrigin);
    lampRibbon(root, config, `${side} reverse lamp`, sign, shifted(rearColumns.slice(0, 2), -.023),
      .006, m.lens, 'lamp-lens', 'reverse', rearOrigin);
  }
  const high = addMesh(root, 'High-mounted centre brake lamp',
    new THREE.BoxGeometry(.22, .012, .008), m.redLens, 'lamp-lens', false);
  high.position.set(0, canopyAt(.78).y - .030, canopyAt(.78).z + .004);
  addLightingKey(high, 'brake');
  const fog = addMesh(root, 'Rear fog lamp',
    new THREE.BoxGeometry(.10, .030, .006), m.redLens, 'lamp-lens', false);
  fog.position.set(-.30, .315, endAdjustedZ(bodyHalfLength(config), -.30) + .010);
  addLightingKey(fog, 'fogRear');
};

const addTrimDetails = (root: THREE.Group, m: ExteriorMaterials): void => {
  for (const sign of [-1, 1] as const) {
    const side = sign < 0 ? 'Left' : 'Right';
    // Close the belt slot between the door top and the inset side glass. The
    // outer strip is body paint; only the narrow seal next to the glass is black.
    const shelf = gridMesh(`${side} door belt shelf`, 34, 2, (u, v) => {
      const z = lerp(-.86, 1.06, u);
      const section = sectionAt(z);
      const x = lerp(section.belt + .0008, .842, v);
      const y = lerp(section.top + .001, section.top - .005, v);
      return [sign * x, y, z];
    }, m.paint, 'body', sign > 0);
    root.add(shelf);
    const seal = gridMesh(`${side} window belt seal`, 34, 2, (u, v) => {
      const z = lerp(-.86, 1.06, u);
      const section = sectionAt(z);
      const x = lerp(.842, .820, v);
      const y = lerp(section.top - .005, section.top + .0005, v);
      return [sign * x, y, z];
    }, m.gloss, 'window-trim', sign > 0);
    root.add(seal);
    for (const gapZ of [-.80, .30, 1.04]) {
      const points: Point[] = [];
      for (const y of [.34, .52, .70, .84, .925]) {
        const x = widthAt(gapZ, y) + .0015;
        points.push([sign * x, y, endAdjustedZ(gapZ, x)]);
      }
      addTube(root, `${side} door shut line`, points, .0028, m.gloss, 'panel-gap');
    }
    for (const handleZ of [.15, .82]) {
      const y = .895;
      const x = widthAt(handleZ, y) + .002;
      const handle = new THREE.BoxGeometry(.006, .024, .185);
      const mesh = addMesh(root, `${side} flush door handle`, handle, m.paintDark, 'door-handle');
      mesh.position.set(sign * x, y, handleZ);
    }
    const belt: Point[] = [];
    for (let step = 0; step <= 12; step += 1) {
      const z = lerp(-.84, 1.10, step / 12);
      const y = sectionAt(z).top - .012;
      belt.push([sign * (widthAt(z, y) + .001), y, z]);
    }
    addTube(root, `${side} beltline trim`, belt, .003, m.gloss, 'window-trim');
  }
  // Charge flap on the left rear quarter, flat and flush.
  const flap = gridMesh('Left charge port flap', 2, 2, (u, v) => {
    const z = lerp(.78, .94, v);
    const y = lerp(.73, .83, u);
    return [-widthAt(z, y) - .0015, y, z];
  }, m.paintDark, 'charge-port', true);
  root.add(flap);
};

/* -------------------------------------------------------------- assembly */

export function buildTeslaModel3Exterior(root: THREE.Group, config: VehicleVisualConfig): void {
  const materials = createMaterials(config);
  addBodySides(root, config, materials);
  addUnderbody(root, config, materials);
  addHood(root, config, materials);
  addTrunk(root, config, materials);
  addFascias(root, config, materials);
  addCanopy(root, materials);
  addSideWindows(root, config, materials);
  addWheelArches(root, config, materials);
  addLamps(root, config, materials);
  addTrimDetails(root, materials);
}

/* ---------------------------------------------------------------- mirror */

const roundedRectShape = (width: number, height: number, radius: number): THREE.Shape => {
  const shape = new THREE.Shape();
  const x = -width * .5;
  const y = -height * .5;
  const r = Math.min(radius, width * .5, height * .5);
  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r);
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
};

/**
 * Streamlined Model 3 door mirror.  The optical plane keeps the exact shared
 * transform contract; only the housing/sail silhouette is authored here.
 */
export function buildTeslaModel3SideMirror(
  exteriorRoot: THREE.Group,
  surfaceRoot: THREE.Group,
  side: 'left' | 'right',
  mirrorConfig: MirrorVisualConfig,
  config: VehicleVisualConfig,
): MirrorSurfaceMesh {
  const sign = side === 'left' ? -1 : 1;
  const assembly = new THREE.Group();
  assembly.name = `${side} mirror assembly`;
  assembly.position.set(...mirrorConfig.position);
  assembly.rotation.set(...mirrorConfig.rotation);

  const capMaterial = new THREE.MeshPhysicalMaterial({
    color: config.body.color, roughness: .28, metalness: .44, clearcoat: .8, clearcoatRoughness: .15,
    side: THREE.DoubleSide,
  });
  const blackMaterial = new THREE.MeshStandardMaterial({
    color: config.body.trimColor, roughness: .34, metalness: .22, side: THREE.DoubleSide,
  });
  const housingWidth = mirrorConfig.size[0] + .028;
  const housingHeight = mirrorConfig.size[1] + .026;
  const housingDepth = Math.max(.06, mirrorConfig.housingDepth + .02);
  const housingShape = roundedRectShape(housingWidth, housingHeight, .022);
  const housingGeometry = new THREE.ExtrudeGeometry(housingShape, {
    depth: housingDepth, bevelEnabled: true, bevelThickness: .005, bevelSize: .004,
    bevelSegments: 2, steps: 1, curveSegments: 6,
  });
  housingGeometry.translate(0, 0, -housingDepth * .5);
  const housing = new THREE.Mesh(housingGeometry, capMaterial);
  housing.name = `${side} mirror housing`;
  housing.position.z = -housingDepth * .5 + .004;
  housing.castShadow = true;
  housing.userData.vehicleBodyPart = 'mirror-housing';
  assembly.add(housing);

  const repeater = new THREE.Mesh(new THREE.BoxGeometry(.012, .013, .072), blackMaterial);
  repeater.name = `${side === 'left' ? 'Left' : 'Right'} mirror amber repeater`;
  repeater.position.set(sign * .082, -.040, -.012);
  repeater.userData.lightingKey = sign < 0 ? 'left' : 'right';
  // The mirror is outside the body envelope used for contact/framing.
  repeater.userData.vehicleBodyPart = 'mirror-housing';
  assembly.add(repeater);
  exteriorRoot.add(assembly);

  const surface: MirrorSurfaceMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(mirrorConfig.size[0], mirrorConfig.size[1]),
    new THREE.MeshStandardMaterial({ color: 0x9cb8bf, roughness: .06, metalness: .9, side: THREE.FrontSide }),
  );
  surface.name = `${side} mirror surface`;
  surface.position.copy(new THREE.Vector3(...mirrorConfig.position))
    .add(new THREE.Vector3(0, 0, .008).applyEuler(new THREE.Euler(...mirrorConfig.rotation)));
  surface.rotation.set(...mirrorConfig.rotation);
  surface.userData.mirrorSide = side;
  surface.userData.mirrorShape = 'rounded';
  surface.userData.localNormal = new THREE.Vector3(0, 0, 1);
  surface.renderOrder = 3;
  surfaceRoot.add(surface);

  const mountZ = mirrorConfig.mountPosition?.[2] ?? config.cabin.windshieldBottomZ + .065;
  const doorEdge = teslaModel3DoorSkinAnchor(mountZ);
  const mount = new THREE.Vector3(sign * (doorEdge.x + .004), doorEdge.y + .052, mountZ);
  const sailShape = new THREE.Shape();
  sailShape.moveTo(sign * .050, -.058);
  sailShape.lineTo(-sign * .090, -.058);
  sailShape.lineTo(sign * .042, .062);
  sailShape.closePath();
  const sail = new THREE.Mesh(new THREE.ExtrudeGeometry(sailShape,
    { depth: .020, bevelEnabled: false, steps: 1 }), blackMaterial);
  sail.name = `${side} door mirror sail mount`;
  sail.position.copy(mount);
  sail.rotation.y = sign * Math.PI / 2;
  sail.userData.vehicleBodyPart = 'mirror-housing';
  sail.castShadow = true;
  exteriorRoot.add(sail);

  const connection = new THREE.Vector3(-sign * .098, -.022, -.020)
    .applyEuler(assembly.rotation).add(assembly.position);
  const start = mount.clone().add(new THREE.Vector3(sign * .012, -.010, .006));
  const delta = connection.clone().sub(start);
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(.013, .019, delta.length(), 10), blackMaterial);
  stalk.name = `${side} mirror stalk`;
  stalk.position.copy(start).add(connection).multiplyScalar(.5);
  stalk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  stalk.castShadow = true;
  stalk.userData.vehicleBodyPart = 'mirror-housing';
  exteriorRoot.add(stalk);

  return surface;
}
