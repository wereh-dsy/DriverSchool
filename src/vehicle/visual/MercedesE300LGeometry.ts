import * as T from 'three';
import type { Vector3Tuple as P } from './VehicleVisualConfig';

/**
 * Local construction tools for the V214 E 300 L. Shared mesh helpers stay where
 * they are; these exist because the Mercedes surfaces are authored as closed
 * lofts and star-geometry light guides rather than the other cars' builders.
 */
export function mesh(name: string, geometry: T.BufferGeometry, material: T.Material): T.Mesh {
  const m = new T.Mesh(geometry, material);
  m.name = name; m.castShadow = true; m.receiveShadow = true; return m;
}

/** Bicubic-ish surface patch from a parametric point function, u along Z. */
export function grid(name: string, rows: number, columns: number,
  point: (u: number, v: number) => P, material: T.Material): T.Mesh {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= columns; c++) {
    positions.push(...point(r / rows, c / columns));
    uvs.push(c / columns, 1 - r / rows);
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
    const a = r * (columns + 1) + c, b = a + columns + 1;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices); g.computeVertexNormals(); return mesh(name, g, material);
}

export function polygon(name: string, points: readonly P[], material: T.Material): T.Mesh {
  const a = new T.Vector3(...points[0]!), b = new T.Vector3(...points[1]!), c = new T.Vector3(...points[2]!);
  const n = b.clone().sub(a).cross(c.clone().sub(a));
  const dominant = Math.abs(n.x) > Math.abs(n.y) && Math.abs(n.x) > Math.abs(n.z) ? 'x' : Math.abs(n.y) > Math.abs(n.z) ? 'y' : 'z';
  const outline = points.map(p => new T.Vector2(...(dominant === 'x' ? [p[2], p[1]] as const
    : dominant === 'y' ? [p[0], p[2]] as const : [p[0], p[1]] as const)));
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(points.flat(), 3));
  g.setIndex(T.ShapeUtils.triangulateShape(outline, []).flat());
  g.computeVertexNormals(); return mesh(name, g, material);
}

/** Round tube through the points; closed loops keep their exact corners. */
export function path(name: string, points: readonly P[], radius: number, material: T.Material, closed = false): T.Mesh {
  const line = new T.CurvePath<T.Vector3>();
  if (closed) for (let i = 0; i < points.length; i++) line.add(new T.LineCurve3(
    new T.Vector3(...points[i]!), new T.Vector3(...points[(i + 1) % points.length]!)));
  const curve = closed ? line : new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)), false, 'centripetal');
  return mesh(name, new T.TubeGeometry(curve, Math.max(10, points.length * 5), radius, 6, closed), material);
}

export function beam(name: string, a: P, b: P, radius: number, material: T.Material): T.Mesh {
  const from = new T.Vector3(...a), to = new T.Vector3(...b), delta = to.clone().sub(from);
  const m = mesh(name, new T.CylinderGeometry(radius, radius, delta.length(), 12), material);
  m.position.copy(from).add(to).multiplyScalar(.5);
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize()); return m;
}

export function roundShape(w: number, h: number, r: number): T.Shape {
  const s = new T.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}

/** Rounded slab; every visible trim/screen bezel keeps a real bevel. */
export function rounded(name: string, size: P, position: P, material: T.Material, radius = .012): T.Mesh {
  const r = Math.min(radius, size[0] * .3, size[1] * .3, size[2] * .3);
  const g = new T.ExtrudeGeometry(roundShape(size[0] - 2 * r, size[1] - 2 * r, r),
    { depth: size[2] - 2 * r, steps: 1, bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -size[2] / 2 + r);
  const m = mesh(name, g, material); m.position.set(...position); return m;
}

/** Soft upholstered volume: superellipsoid, not a box with a bulge. */
export function upholstered(name: string, size: P, position: P, material: T.Material, power = .55): T.Mesh {
  const geometry = new T.SphereGeometry(1, 32, 20);
  const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  const normal = new T.Vector3();
  for (let i = 0; i < positions.count; i++) {
    const unit = [positions.getX(i), positions.getY(i), positions.getZ(i)];
    const p = unit.map((v, axis) => Math.sign(v) * Math.abs(v) ** power * size[axis]! / 2);
    positions.setXYZ(i, p[0]!, p[1]!, p[2]!);
    normal.set(...unit.map((v, axis) => Math.sign(v) * Math.abs(v) ** (2 - power) / size[axis]!) as [number, number, number]).normalize();
    normals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  const m = mesh(name, geometry, material); m.position.set(...position); return m;
}

/** Closed loft between constant-topology YZ sections placed at given Z. */
export function loft(name: string, sections: readonly { z: number; points: readonly (readonly [number, number])[] }[],
  material: T.Material): T.Mesh {
  const positions = sections.flatMap(s => s.points.flatMap(([x, y]) => [x, y, s.z]));
  const n = sections[0]!.points.length, indices: number[] = [];
  for (let s = 0; s < sections.length - 1; s++) for (let i = 0; i < n; i++) {
    const a = s * n + i, b = s * n + (i + 1) % n, c = a + n, d = b + n;
    indices.push(a, c, b, b, c, d);
  }
  const cap = T.ShapeUtils.triangulateShape(sections[0]!.points.map(p => new T.Vector2(...p)), []);
  const end = (sections.length - 1) * n;
  for (const [a, b, c] of cap) indices.push(a!, b!, c!, end + c!, end + b!, end + a!);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setIndex(indices); g.computeVertexNormals(); return mesh(name, g, material);
}

/** Capped world-space rings, used for oblique frames and shaped spokes. */
export function sweep(name: string, rings: readonly (readonly P[])[], material: T.Material): T.Mesh {
  const count = rings[0]!.length, positions = rings.flatMap(ring => ring.flat()), indices: number[] = [];
  // Ring-wall UVs let one veneer or leather map follow a cross-car sweep.
  const uvs: number[] = rings.flatMap((_ring, index) => Array.from({ length: count },
    (_unused, around) => [around / count, 1 - index / Math.max(1, rings.length - 1)]).flat());
  for (let r = 0; r < rings.length - 1; r++) for (let i = 0; i < count; i++) {
    const a = r * count + i, b = r * count + (i + 1) % count;
    indices.push(a, a + count, b, b, a + count, b + count);
  }
  for (const index of [0, rings.length - 1]) {
    const ring = rings[index]!, p = new T.Vector3(...ring[0]!);
    const normal = new T.Vector3(...ring[1]!).sub(p).cross(new T.Vector3(...ring[2]!).sub(p));
    const axis = Math.abs(normal.x) > Math.abs(normal.y) && Math.abs(normal.x) > Math.abs(normal.z) ? 'x'
      : Math.abs(normal.y) > Math.abs(normal.z) ? 'y' : 'z';
    const outline = ring.map(([x, y, z]) => new T.Vector2(...(axis === 'x' ? [z, y]
      : axis === 'y' ? [x, z] : [x, y]) as [number, number]));
    for (const face of T.ShapeUtils.triangulateShape(outline, []))
      indices.push(...(index === 0 ? face : face.reverse()).map(i => index * count + i));
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return mesh(name, geometry, material);
}

/** Flat text decal; only static labels use it (never live telemetry). */
export function label(name: string, text: string, width: number, height: number, position: P,
  rotation: P = [0, 0, 0], color = '#e6e2d8'): T.Mesh {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d')!; ctx.clearRect(0, 0, 512, 96);
  ctx.fillStyle = color; ctx.font = '500 42px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 48);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
  const m = mesh(name, new T.PlaneGeometry(width, height),
    new T.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, side: T.DoubleSide }));
  m.position.set(...position); m.rotation.set(...rotation); m.castShadow = false; return m;
}

/**
 * The three-pointed star: one concave polygon (three tips, three valleys) plus
 * an encircling ring. Used for the bonnet ornament, the boot emblem and the
 * star-motif tail-lamp light guides, so the marque signature is one primitive.
 */
export function threePointedStar(radius: number, thickness: number, material: T.Material,
  valleyRatio = .24): T.Mesh {
  const shape = new T.Shape();
  for (let i = 0; i < 3; i++) {
    const tip = Math.PI / 2 + i * Math.PI * 2 / 3;
    const valley = tip + Math.PI / 3;
    const tipPoint = new T.Vector2(Math.cos(tip) * radius, Math.sin(tip) * radius);
    const valleyPoint = new T.Vector2(Math.cos(valley) * radius * valleyRatio, Math.sin(valley) * radius * valleyRatio);
    if (i === 0) shape.moveTo(tipPoint.x, tipPoint.y); else shape.lineTo(tipPoint.x, tipPoint.y);
    shape.lineTo(valleyPoint.x, valleyPoint.y);
  }
  shape.closePath();
  const geometry = new T.ExtrudeGeometry(shape, { depth: thickness, steps: 1, bevelEnabled: false, curveSegments: 4 });
  geometry.translate(0, 0, -thickness / 2);
  return mesh('Three-pointed star', geometry, material);
}

/** Star inside a chrome ring, facing +Z; caller orients and scales it. */
export function starEmblem(name: string, radius: number, chrome: T.Material, face: T.Material): T.Group {
  const g = new T.Group(); g.name = name;
  const ring = mesh('Star emblem ring', new T.TorusGeometry(radius, radius * .058, 8, 44), chrome);
  g.add(ring, threePointedStar(radius * .86, radius * .16, face));
  return g;
}

/** Greenhouse and roof datums shared by glass, pillars, trim and headliner. */
export const mercedesRoofHeight = (z: number, x: number): number => {
  const t = T.MathUtils.clamp((z + .33) / 1.46, 0, 1);
  return 1.426 + .046 * Math.sin(Math.PI * t) - .024 * (x / .72) ** 2;
};

export const mercedesSideGlassX = (y: number): number =>
  .848 - .156 * T.MathUtils.clamp((y - .955) / .485, 0, 1);

/** One shared windshield surface for glass, frit, A-pillars and interior trim. */
export function mercedesWindshieldPoint(u: number, v: number): P {
  const across = v * 2 - 1;
  const x = across * (.844 - .150 * u);
  const crown = .030 * (1 - across * across) * Math.sin(u * Math.PI);
  return [x, .955 + .487 * u + crown * .3 - .024 * u * (x / .72) ** 2, -.925 + .600 * u - crown];
}

export function mercedesFrontWindowCorners(sign: number): P[] {
  return [[-.878, .958], [-.352, 1.418], [.372, 1.448], [.406, .958]]
    .map(([z, y]) => [sign * mercedesSideGlassX(y!), y!, z!] as P);
}

/** Rear door glass: a long, gently falling pane, not a fastback sweep. */
export function mercedesRearWindowCorners(sign: number): P[] {
  return [[.442, .958], [.442, 1.446], [.962, 1.418], [1.372, 1.070], [1.256, .958]]
    .map(([z, y]) => [sign * mercedesSideGlassX(y!), y!, z!] as P);
}

export function mercedesWindshieldLeadingPoint(sign: number, u: number): P {
  const y = .958 + .460 * u;
  return [sign * mercedesSideGlassX(y), y, -.878 + .525 * u];
}

/** A-pillar section between the windshield edge and the front glass leading edge. */
export function mercedesAPillarRing(sign: number, u: number, interior: boolean): P[] {
  const a = mercedesWindshieldPoint(u, sign < 0 ? 0 : 1), b = mercedesWindshieldLeadingPoint(sign, u);
  const aw = Math.abs(a[0]), bw = Math.abs(b[0]);
  if (interior) return [
    [sign * (aw - .010), a[1] + .002, a[2] + .005], [sign * (aw - .026), a[1] + .012, a[2] + .019],
    [sign * ((aw + bw) / 2 - .024), (a[1] + b[1]) / 2 + .013, (a[2] + b[2]) / 2 + .021],
    [sign * (bw - .020), b[1] + .010, b[2] + .012], [sign * (bw - .004), b[1] + .002, b[2] + .005],
    [sign * ((aw + bw) / 2 + .002), (a[1] + b[1]) / 2 - .009, (a[2] + b[2]) / 2 - .008],
  ];
  return [[sign * (aw + .012), a[1] - .014, a[2] - .014], [sign * (aw - .011), a[1] - .006, a[2] - .004],
    [sign * (aw - .015), a[1] + .012, a[2] + .013], [sign * (bw - .013), b[1] + .012, b[2] + .012],
    [sign * (bw + .012), b[1] - .004, b[2] + .004], [sign * (bw + .021), b[1] - .014, b[2] - .013]];
}

/** Rear glazing, shared by the exterior pane and the interior parcel shelf. */
export function mercedesRearGlassPoint(u: number, v: number): P {
  const across = v * 2 - 1;
  const crown = .024 * (1 - across * across) * Math.sin(u * Math.PI);
  return [across * T.MathUtils.lerp(.834, .694, u),
    T.MathUtils.lerp(.958, 1.428, u + .94 * u * (1 - u)) + crown * .3,
    T.MathUtils.lerp(1.842, 1.062, u) + crown];
}
