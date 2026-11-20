import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { surfaceGrid, surfaceMesh } from './SurfaceVehicleGeometry';
import type { VehicleVisualConfig, Vector3Tuple as P } from './VehicleVisualConfig';

function joinMeshes(name: string, parts: T.Mesh[], material: T.Material, shadow = true): T.Mesh {
  const geometries = parts.map(part => {
    part.updateMatrix();
    let g = part.geometry.clone().applyMatrix4(part.matrix);
    if (g.index) { const idx = g; g = g.toNonIndexed(); idx.dispose(); }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) {
      const count = g.getAttribute('position').count;
      g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(count * 2), 2));
    }
    part.geometry.dispose();
    return g;
  });
  const merged = mergeGeometries(geometries, false)!;
  geometries.forEach(g => g.dispose());
  const mesh = new T.Mesh(merged, material);
  mesh.name = name; mesh.castShadow = shadow; mesh.receiveShadow = shadow;
  return mesh;
}

function makeBox(size: P, at: P, material: T.Material, rot?: P): T.Mesh {
  const m = new T.Mesh(new T.BoxGeometry(...size), material);
  m.position.set(...at);
  if (rot) m.rotation.set(...rot);
  return m;
}

/** Ribbon whose FrontSide normal points toward `facingZ` (-1 for front lamps, +1 for rear lamps). */
function makeRibbon(name: string, pts: readonly P[], halfHeight: number, material: T.Material, facingZ: -1 | 1 = 1): T.Mesh {
  const ordered = pts.length >= 2 && (facingZ > 0 ? pts[0]![0] > pts[pts.length - 1]![0] : pts[0]![0] < pts[pts.length - 1]![0])
    ? [...pts].reverse()
    : pts;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const [x, y, z] = ordered[i]!;
    pos.push(x, y - halfHeight, z, x, y + halfHeight, z);
    const u = i / Math.max(1, ordered.length - 1);
    uv.push(u, 0, u, 1);
    if (i > 0) {
      const n = i * 2;
      // When x increases left-to-right (facingZ > 0): (n-2, n, n-1) has +Z normal.
      // When x decreases right-to-left (facingZ < 0): (n-2, n, n-1) has -Z normal.
      idx.push(n - 2, n, n - 1, n - 1, n, n + 1);
    }
  }
  return surfaceMesh(name, pos, idx, uv, material);
}

function makeQuadStrip(name: string, a: readonly P[], b: readonly P[], material: T.Material): T.Mesh {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const count = Math.min(a.length, b.length);
  for (let i = 0; i < count; i++) {
    pos.push(...a[i]!, ...b[i]!);
    const v = i / Math.max(1, count - 1);
    uv.push(0, v, 1, v);
    if (i > 0) { const n = i * 2; idx.push(n - 2, n - 1, n, n - 1, n + 1, n); }
  }
  return surfaceMesh(name, pos, idx, uv, material);
}

function createQinExteriorAtlas(): T.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
  const ctx = cv.getContext('2d'); if (!ctx) return null;
  ctx.fillStyle = '#0f161b'; ctx.fillRect(0, 0, 1024, 512);

  // Region A (0..512, 0..256): 2026 Dragon-Scale dot-matrix horizontal grille
  const gGrad = ctx.createLinearGradient(0, 0, 0, 256);
  gGrad.addColorStop(0, '#090e13'); gGrad.addColorStop(0.5, '#131d25'); gGrad.addColorStop(1, '#080d11');
  ctx.fillStyle = gGrad; ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
  for (let y = 12; y < 248; y += 14) { ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(504, y); ctx.stroke(); }
  // 5 refined rows of parametric Dragon-Scale satin-chrome dashes
  for (let row = 0; row < 5; row++) {
    const ry = 34 + row * 46;
    const cols = 14 - (row % 2);
    const margin = 24 + Math.abs(row - 2) * 8;
    const span = 512 - margin * 2;
    for (let col = 0; col < cols; col++) {
      const f = cols > 1 ? col / (cols - 1) : 0.5;
      const cx = margin + f * span;
      const centerWeight = 1 - Math.abs(f * 2 - 1) * 0.30;
      const dw = (span / cols) * 0.58 * centerWeight;
      const dh = 7.5;
      const dashGrad = ctx.createLinearGradient(cx, ry - dh, cx, ry + dh);
      dashGrad.addColorStop(0, '#e2eaef'); dashGrad.addColorStop(0.5, '#9eaab2'); dashGrad.addColorStop(1, '#4b5860');
      ctx.fillStyle = dashGrad;
      ctx.beginPath();
      ctx.moveTo(cx - dw / 2, ry - dh / 2);
      ctx.lineTo(cx + dw / 2, ry - dh / 2);
      ctx.lineTo(cx + dw * 0.42, ry + dh / 2);
      ctx.lineTo(cx - dw * 0.42, ry + dh / 2);
      ctx.closePath(); ctx.fill();
    }
  }

  // Region B (512..768, 0..256): Front "秦" Dynasty crest
  const bGrad = ctx.createLinearGradient(512, 0, 512, 256);
  bGrad.addColorStop(0, '#2a343b'); bGrad.addColorStop(0.5, '#11181e'); bGrad.addColorStop(1, '#1e272e');
  ctx.fillStyle = bGrad; ctx.fillRect(512, 0, 256, 256);
  ctx.strokeStyle = '#c8d4db'; ctx.lineWidth = 8; ctx.strokeRect(528, 22, 224, 212);
  ctx.fillStyle = '#edf5fa'; ctx.font = 'bold 132px "Microsoft YaHei", "SimHei", serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('秦', 640, 134);

  // Region C (768..1024, 0..256): Rear modern "BYD" emblem
  ctx.fillStyle = '#141c21'; ctx.fillRect(768, 0, 256, 256);
  ctx.fillStyle = '#e0e9ee'; ctx.font = 'bold 78px "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('BYD', 896, 130);

  // Region D (0..512, 256..512): NEV / Showroom plate "秦 PLUS DM-i" (clean margin)
  const pGrad = ctx.createLinearGradient(0, 256, 0, 512);
  pGrad.addColorStop(0, '#eff6f2'); pGrad.addColorStop(0.55, '#c4e3d4'); pGrad.addColorStop(1, '#7fc2a3');
  ctx.fillStyle = pGrad; ctx.fillRect(14, 272, 484, 224);
  ctx.strokeStyle = '#18242a'; ctx.lineWidth = 10; ctx.strokeRect(18, 276, 476, 216);
  ctx.fillStyle = '#111d24'; ctx.font = 'bold 52px "Microsoft YaHei", "Segoe UI", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('秦 PLUS DM-i', 256, 386);

  // Region E (512..1024, 256..512): Smoked ruby taillight backing housing
  const tGrad = ctx.createLinearGradient(512, 256, 512, 512);
  tGrad.addColorStop(0, '#1c070a'); tGrad.addColorStop(0.5, '#3b0a12'); tGrad.addColorStop(1, '#140507');
  ctx.fillStyle = tGrad; ctx.fillRect(512, 256, 512, 256);
  ctx.strokeStyle = 'rgba(220, 40, 55, 0.35)'; ctx.lineWidth = 4;
  for (let i = 0; i < 16; i++) {
    const sx = 532 + i * 30;
    ctx.beginPath(); ctx.moveTo(sx, 272); ctx.lineTo(sx + 18, 496); ctx.stroke();
  }

  const tex = new T.CanvasTexture(cv);
  tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

function createQinTailMask(): T.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const ctx = cv.getContext('2d'); if (!ctx) return null;
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 512, 128);

  // Continuous horizontal upper & lower glowing light bars across full width
  ctx.fillStyle = '#ececec'; ctx.fillRect(10, 22, 492, 10);
  ctx.fillStyle = '#a8a8a8'; ctx.fillRect(10, 96, 492, 7);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(130, 58, 252, 10);

  // Authentic interwoven "中国结" (Chinese Knot) diagonal ribbon clusters on left & right wings
  const drawKnot = (x0: number, x1: number) => {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6.5; ctx.lineCap = 'round';
    const steps = 4, dx = (x1 - x0) / steps;
    for (let i = 0; i < steps; i++) {
      const a = x0 + i * dx, b = a + dx;
      ctx.beginPath(); ctx.moveTo(a, 30); ctx.lineTo(b, 94); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(a, 94); ctx.lineTo(b, 30); ctx.stroke();
    }
    ctx.strokeStyle = '#d6d6d6'; ctx.lineWidth = 3.5;
    for (let i = 0; i < steps; i++) {
      const cx = x0 + (i + 0.5) * dx;
      ctx.beginPath();
      ctx.moveTo(cx, 38); ctx.lineTo(cx + dx * 0.34, 62);
      ctx.lineTo(cx, 86); ctx.lineTo(cx - dx * 0.34, 62);
      ctx.closePath(); ctx.stroke();
    }
  };
  drawKnot(14, 152);
  drawKnot(360, 498);

  const tex = new T.CanvasTexture(cv);
  tex.anisotropy = 4;
  return tex;
}

function setUVRegion(mesh: T.Mesh, u0: number, v0: number, u1: number, v1: number, flipX = false): T.Mesh {
  const uv = mesh.geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    const u = flipX ? 1 - uv.getX(i) : uv.getX(i);
    const v = 1 - uv.getY(i);
    uv.setXY(i, T.MathUtils.lerp(u0, u1, u), T.MathUtils.lerp(v0, v1, v));
  }
  uv.needsUpdate = true;
  return mesh;
}

/** MY2026 January Qin PLUS DM-i 210KM 进取型 sculpted Dragon Face saloon. */
export function buildQinPlusExterior(root: T.Group, c: VehicleVisualConfig): void {
  const paint = new T.MeshPhysicalMaterial({
    color: c.body.color, roughness: .26, metalness: .42,
    clearcoat: .50, clearcoatRoughness: .16, side: T.DoubleSide,
  });
  const black = new T.MeshStandardMaterial({ color: 0x12191f, roughness: .46, metalness: .10, side: T.DoubleSide });
  const glossBlack = new T.MeshStandardMaterial({ color: 0x0b1015, roughness: .18, metalness: .18, side: T.DoubleSide });
  const satin = new T.MeshStandardMaterial({ color: 0xc2cdd2, metalness: .84, roughness: .22, side: T.DoubleSide });
  const glass = new T.MeshPhysicalMaterial({
    color: c.windowGlass?.color ?? 0x566e75, roughness: .08, metalness: .16,
    clearcoat: .65, clearcoatRoughness: .08, transparent: true, opacity: .30,
    side: T.DoubleSide, depthWrite: false,
  });
  const lampCover = new T.MeshPhysicalMaterial({
    color: 0xdce8ef, roughness: .07, metalness: .10, clearcoat: .8,
    transparent: true, opacity: .22, side: T.DoubleSide, depthWrite: false,
  });
  const optic = new T.MeshStandardMaterial({ color: 0x161d24, roughness: .22, metalness: .12, side: T.DoubleSide });
  const reflectorRed = new T.MeshStandardMaterial({ color: 0x9e1620, roughness: .28, metalness: .15 });

  const atlas = createQinExteriorAtlas();
  const tailMask = createQinTailMask();
  const atlasMat = new T.MeshStandardMaterial({
    color: 0xffffff, map: atlas ?? undefined, roughness: .34, metalness: .28, side: T.DoubleSide,
  });
  const tailOpticMat = new T.MeshStandardMaterial({
    color: 0x1c080b, alphaMap: tailMask ?? undefined, emissiveMap: tailMask ?? undefined,
    alphaTest: .08, roughness: .22, side: T.DoubleSide,
  });

  // Sleek MY2026 4780 x 1837 x 1515 mm low-nose fastback saloon profile stations:
  // [z, halfWidth, sillY, beltY, crownAdd]
  const stations: readonly [number, number, number, number, number][] = [
    [-2.390, .748, .240, .645, .016],
    [-2.270, .840, .225, .722, .024],
    [-2.040, .894, .222, .795, .026],
    [-1.740, .912, .222, .852, .024],
    [-1.359, .9185, .224, .896, .022],
    [-.990, .908, .222, .948, .018],
    [-.350, .900, .222, .970, .014],
    [.250, .902, .222, .988, .012],
    [.920, .910, .226, 1.006, .012],
    [1.359, .9185, .230, 1.014, .014],
    [1.760, .902, .244, 1.002, .016],
    [2.080, .874, .268, .972, .018],
    [2.300, .818, .305, .942, .014],
    [2.390, .752, .348, .860, .010],
  ];

  const sampleStation = (z: number): [number, number, number, number] => {
    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i]!, b = stations[i + 1]!;
      if (z >= a[0] && z <= b[0]) {
        const f = (z - a[0]) / Math.max(1e-6, b[0] - a[0]);
        return [
          T.MathUtils.lerp(a[1], b[1], f),
          T.MathUtils.lerp(a[2], b[2], f),
          T.MathUtils.lerp(a[3], b[3], f),
          T.MathUtils.lerp(a[4], b[4], f),
        ];
      }
    }
    const last = z < 0 ? stations[0]! : stations[stations.length - 1]!;
    return [last[1], last[2], last[3], last[4]];
  };

  // Plan-view curved nose & tail sweep so bumpers wrap organically into fenders.
  const endSweepZ = (z: number, uAbs: number, yFrac: number): number => {
    if (z < -1.92) {
      const s = T.MathUtils.clamp((-1.92 - z) / (2.39 - 1.92), 0, 1);
      const plan = .140 * s * s * uAbs * uAbs;
      const vert = s > .7 ? .026 * ((s - .7) / .3) * ((yFrac - .42) ** 2) : 0;
      return z + plan + vert;
    }
    if (z > 1.95) {
      const s = T.MathUtils.clamp((z - 1.95) / (2.39 - 1.95), 0, 1);
      const plan = -.112 * s * s * uAbs * uAbs;
      const vert = s > .7 ? -.020 * ((s - .7) / .3) * ((yFrac - .48) ** 2) : 0;
      return z + plan + vert;
    }
    return z;
  };

  const frontZ = (x: number, y: number, offset = 0): number => {
    const u = Math.min(1, Math.abs(x) / .75);
    const yFrac = T.MathUtils.clamp((y - .24) / .48, 0, 1);
    return endSweepZ(-2.390, u, yFrac) + offset;
  };
  const rearZ = (x: number, y: number, offset = 0): number => {
    const u = Math.min(1, Math.abs(x) / .75);
    const yFrac = T.MathUtils.clamp((y - .34) / .56, 0, 1);
    return endSweepZ(2.390, u, yFrac) + offset;
  };

  const archR = c.wheelRadius + c.body.wheelArchClearance;
  const axleHalf = c.wheelBase / 2;
  const archY = (z: number) => {
    const d = Math.min(Math.abs(z + axleHalf), Math.abs(z - axleHalf));
    return d < archR ? c.wheelRadius + Math.sqrt(archR * archR - d * d) : 0;
  };

  // Economical adaptive Z slices: smooth around arches & nose/tail, sparse along doors.
  const zSet = new Set<number>([-2.39, -2.34, -2.26, -2.14, -2.02, -1.90, -.99, -.50, .0, .25, .75, 1.76, 1.96, 2.14, 2.28, 2.35, 2.39]);
  for (const center of [-axleHalf, axleHalf]) {
    zSet.add(Number((center - archR - .005).toFixed(4)));
    zSet.add(Number((center + archR + .005).toFixed(4)));
    for (let i = -7; i <= 7; i++) {
      const angle = (i / 7) * (Math.PI / 2);
      zSet.add(Number((center + Math.sin(angle) * archR).toFixed(4)));
    }
  }
  const zSlices = [...zSet].filter(z => z >= -2.39 && z <= 2.39).sort((a, b) => a - b);

  // 13-point sculpted cross-section around each Z station
  const ringCount = 13;
  const bodyPos: number[] = [], bodyUv: number[] = [], bodyIdx: number[] = [];
  const slicePoints: P[][] = [];

  for (let sIdx = 0; sIdx < zSlices.length; sIdx++) {
    const z = zSlices[sIdx]!;
    const [w, sill, belt, crown] = sampleStation(z);
    const aY = archY(z);
    const inArch = aY > sill + .01;
    const bot = Math.max(sill, aY);
    const span = Math.max(.08, belt - bot);
    const rockerW = inArch ? w * .975 : w * .885;
    const flareW = inArch ? w * .995 : w * .972;
    const bellyW = w;
    const creaseW = w * .976;
    const beltW = w * .898;
    const dome = z < -.99 ? .007 * Math.sin(T.MathUtils.clamp((-z - .99) / 1.35, 0, 1) * Math.PI) : 0;

    const rawRing: [number, number, number][] = [
      [-rockerW, bot, 0],
      [-flareW, bot + span * .18, .18],
      [-bellyW, bot + span * .52, .52],
      [-creaseW, belt - Math.min(.095, span * .24), .78],
      [-beltW, belt, 1],
      [-beltW * .48, belt + crown * .72 + dome, 1],
      [0, belt + crown, 1],
      [beltW * .48, belt + crown * .72 + dome, 1],
      [beltW, belt, 1],
      [creaseW, belt - Math.min(.095, span * .24), .78],
      [bellyW, bot + span * .52, .52],
      [flareW, bot + span * .18, .18],
      [rockerW, bot, 0],
    ];
    const pts: P[] = [];
    for (let i = 0; i < ringCount; i++) {
      const [rx, ry, yFrac] = rawRing[i]!;
      const uAbs = Math.min(1, Math.abs(rx) / Math.max(.1, w));
      const rz = endSweepZ(z, uAbs, yFrac);
      pts.push([rx, ry, rz]);
      bodyPos.push(rx, ry, rz);
      bodyUv.push((z + 2.39) / 4.78, i / (ringCount - 1));
    }
    slicePoints.push(pts);
  }

  for (let row = 0; row < zSlices.length - 1; row++) {
    const zMid = (zSlices[row]! + zSlices[row + 1]!) / 2;
    const isCabin = zMid > -.99 && zMid < 1.76;
    for (let edge = 0; edge < ringCount; edge++) {
      if (isCabin && (edge === 4 || edge === 5 || edge === 6 || edge === 7 || edge === 12)) continue;
      const a = row * ringCount + edge;
      const b = row * ringCount + (edge + 1) % ringCount;
      const c0 = (row + 1) * ringCount + edge;
      const d0 = (row + 1) * ringCount + (edge + 1) % ringCount;
      bodyIdx.push(a, c0, b, b, c0, d0);
    }
  }
  const frontCap = T.ShapeUtils.triangulateShape(slicePoints[0]!.map(p => new T.Vector2(p[0], p[1])), []);
  for (const [a, b, c0] of frontCap) bodyIdx.push(a!, b!, c0!);
  const lastBase = (zSlices.length - 1) * ringCount;
  const rearCap = T.ShapeUtils.triangulateShape(slicePoints[slicePoints.length - 1]!.map(p => new T.Vector2(p[0], p[1])), []);
  for (const [a, b, c0] of rearCap) bodyIdx.push(lastBase + c0!, lastBase + b!, lastBase + a!);

  const bodyMesh = surfaceMesh('Qin PLUS continuous saloon body and wheel arch skins', bodyPos, bodyIdx, bodyUv, paint);
  bodyMesh.userData.vehicleBodyPart = 'body';
  root.add(bodyMesh);

  // Analytical greenhouse curves shared by roof, glass, pillars, and chrome DLO trim
  const roofZ0 = -.47, roofZ1 = 1.23;
  const roofHalfW = (t: number) => .612 + .042 * Math.sin(t * Math.PI);
  const roofEdgeY = (t: number) => 1.466 - .046 * (t * 2 - 1) ** 2;
  const roofPoint = (u: number, v: number): P => {
    const s = u * 2 - 1;
    const hw = roofHalfW(v);
    const yEdge = roofEdgeY(v);
    return [s * hw, yEdge + .049 * (1 - s * s), T.MathUtils.lerp(roofZ0, roofZ1, v)];
  };
  const beltPoint = (side: number, z: number, inset = 0): P => {
    const [w, , belt] = sampleStation(z);
    return [side * (w * .898 - inset), belt, z];
  };

  // Continuous curved roof (hits exact 1.515 m crown, flush with windshield & cant rails)
  const roof = surfaceGrid('Qin PLUS curved roof', 8, 12, roofPoint, paint);
  roof.userData.vehicleBodyPart = 'body';
  root.add(roof);

  // Curved front & rear windshields matching exact roof header and beltline cowl
  const cowlPoint = (u: number): P => {
    const s = u * 2 - 1;
    const [w, , belt, crown] = sampleStation(-.99);
    return [s * (w * .892), belt + crown * (1 - s * s), -.99 - .025 * (1 - s * s)];
  };
  const rearDeckPoint = (u: number): P => {
    const s = u * 2 - 1;
    const [w, , belt, crown] = sampleStation(1.76);
    return [s * (w * .888), belt + crown * (1 - s * s), 1.76 + .020 * (1 - s * s)];
  };
  root.add(surfaceGrid('Qin PLUS front windshield', 5, 8, (u, v) => {
    const a = cowlPoint(u), b = roofPoint(u, 0);
    return [T.MathUtils.lerp(a[0], b[0], v), T.MathUtils.lerp(a[1], b[1], v) + .010 * Math.sin(v * Math.PI), T.MathUtils.lerp(a[2], b[2], v)];
  }, glass));
  root.add(surfaceGrid('Qin PLUS rear windshield', 5, 8, (u, v) => {
    const a = roofPoint(u, 1), b = rearDeckPoint(u);
    return [T.MathUtils.lerp(a[0], b[0], v), T.MathUtils.lerp(a[1], b[1], v) + .008 * Math.sin(v * Math.PI), T.MathUtils.lerp(a[2], b[2], v)];
  }, glass));

  const sideGlassParts: T.Mesh[] = [];
  const paintedTrimParts: T.Mesh[] = [];
  const blackTrimParts: T.Mesh[] = [];
  const glossBlackParts: T.Mesh[] = [];
  const satinTrimParts: T.Mesh[] = [];
  const coverGlassParts: T.Mesh[] = [];

  for (const side of [-1, 1]) {
    const sideGlaze = surfaceGrid('Qin side glass', 3, 10, (u, v) => {
      const zBot = T.MathUtils.lerp(-.90, 1.56, v);
      const zTop = T.MathUtils.lerp(-.44, 1.18, v);
      const tTop = T.MathUtils.clamp((zTop - roofZ0) / (roofZ1 - roofZ0), 0, 1);
      const bp = beltPoint(side, zBot, .012);
      const rp = roofPoint(side < 0 ? 0 : 1, tTop);
      const bow = .018 * Math.sin(u * Math.PI);
      return [
        T.MathUtils.lerp(bp[0], rp[0], u) + side * bow,
        T.MathUtils.lerp(bp[1], rp[1] - .015, u),
        T.MathUtils.lerp(zBot, zTop, u),
      ];
    }, glass);
    sideGlassParts.push(sideGlaze);

    // Flush painted A-pillar
    const aOuter: P[] = [], aInner: P[] = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const b0 = beltPoint(side, -.99, .002), r0 = roofPoint(side < 0 ? 0 : 1, 0);
      const x = T.MathUtils.lerp(b0[0], r0[0], t);
      const y = T.MathUtils.lerp(b0[1], r0[1], t) + .006 * Math.sin(t * Math.PI);
      const z = T.MathUtils.lerp(b0[2], r0[2], t);
      aOuter.push([x + side * .006, y + .004, z - .022]);
      aInner.push([x + side * .002, y - .012, z + .040]);
    }
    paintedTrimParts.push(makeQuadStrip('A-pillar', aOuter, aInner, paint));

    // Flush painted roof cant rail
    const cantTop: P[] = [], cantBot: P[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const rp = roofPoint(side < 0 ? 0 : 1, t);
      cantTop.push([rp[0], rp[1], rp[2]]);
      cantBot.push([rp[0] + side * .022, rp[1] - .030, rp[2]]);
    }
    paintedTrimParts.push(makeQuadStrip('Roof cant rail', cantTop, cantBot, paint));

    // Sculpted fastback painted C-pillar sail panel
    const cFront: P[] = [], cRear: P[] = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const r1 = roofPoint(side < 0 ? 0 : 1, 1), b1 = beltPoint(side, 1.76, .002);
      const x = T.MathUtils.lerp(r1[0], b1[0], t);
      const y = T.MathUtils.lerp(r1[1], b1[1], t) + .006 * Math.sin(t * Math.PI);
      const z = T.MathUtils.lerp(r1[2], b1[2], t);
      cFront.push([x + side * .008, y - .010, z - .165 + .035 * t]);
      cRear.push([x + side * .004, y + .002, z + .022]);
    }
    paintedTrimParts.push(makeQuadStrip('C-pillar', cFront, cRear, paint));

    // Gloss-black flush B-pillar applique & C-quarter divider
    const bFront: P[] = [], bRear: P[] = [];
    for (let i = 0; i <= 3; i++) {
      const u = i / 3;
      const bp = beltPoint(side, .24, .006);
      const rp = roofPoint(side < 0 ? 0 : 1, (.24 - roofZ0) / (roofZ1 - roofZ0));
      const x = T.MathUtils.lerp(bp[0], rp[0] + side * .014, u) + side * (.018 * Math.sin(u * Math.PI) + .004);
      const y = T.MathUtils.lerp(bp[1], rp[1] - .026, u);
      bFront.push([x, y, .195 + .010 * u]);
      bRear.push([x, y, .290 + .010 * u]);
    }
    glossBlackParts.push(makeQuadStrip('B-pillar', bFront, bRear, glossBlack));

    const qFront: P[] = [], qRear: P[] = [];
    for (let i = 0; i <= 2; i++) {
      const u = i / 2;
      const bp = beltPoint(side, 1.18, .008);
      const rp = roofPoint(side < 0 ? 0 : 1, (1.08 - roofZ0) / (roofZ1 - roofZ0));
      const x = T.MathUtils.lerp(bp[0], rp[0] + side * .016, u) + side * (.016 * Math.sin(u * Math.PI) + .004);
      const y = T.MathUtils.lerp(bp[1], rp[1] - .028, u);
      qFront.push([x, y, 1.14 - .06 * u]);
      qRear.push([x, y, 1.19 - .06 * u]);
    }
    glossBlackParts.push(makeQuadStrip('C-quarter divider', qFront, qRear, glossBlack));

    // Sleek satin-chrome upper window DLO arch & beltline chrome trim
    const dloUpper: P[] = [];
    for (let i = 0; i <= 12; i++) {
      const f = i / 12;
      if (f < .22) {
        const t = f / .22;
        const b0 = beltPoint(side, -.91, .005), r0 = roofPoint(side < 0 ? 0 : 1, 0);
        dloUpper.push([T.MathUtils.lerp(b0[0], r0[0] + side * .018, t) + side * .005,
          T.MathUtils.lerp(b0[1], r0[1] - .026, t), T.MathUtils.lerp(-.91, roofZ0, t)]);
      } else if (f <= .80) {
        const t = (f - .22) / .58;
        const rp = roofPoint(side < 0 ? 0 : 1, t);
        dloUpper.push([rp[0] + side * .022, rp[1] - .028, rp[2]]);
      } else {
        const t = (f - .80) / .20;
        const r1 = roofPoint(side < 0 ? 0 : 1, 1), b1 = beltPoint(side, 1.56, .005);
        dloUpper.push([T.MathUtils.lerp(r1[0] + side * .018, b1[0], t) + side * .005,
          T.MathUtils.lerp(r1[1] - .026, b1[1], t), T.MathUtils.lerp(roofZ1, 1.56, t)]);
      }
    }
    satinTrimParts.push(makeRibbon('DLO upper chrome', dloUpper, .008, satin));

    const beltPts: P[] = [];
    for (let i = 0; i <= 8; i++) {
      const z = T.MathUtils.lerp(-.92, 1.58, i / 8);
      const bp = beltPoint(side, z, -.004);
      beltPts.push([bp[0], bp[1] + .004, z]);
    }
    satinTrimParts.push(makeRibbon('Beltline chrome', beltPts, .0075, satin));

    // Lower dark rocker sill skirt along wheelbase (economical 12-tri box!)
    blackTrimParts.push(makeBox([.038, .048, 1.88], [side * .825, .206, 0], black));

    // Sculpted conventional pull door handles (economical crisp geometry)
    for (const hz of [-.02, .96]) {
      const [hw, , hBelt] = sampleStation(hz);
      const hx = side * (hw * .980);
      const hy = hBelt - .112;
      blackTrimParts.push(makeBox([.014, .034, .150], [hx - side * .002, hy, hz], black));
      paintedTrimParts.push(makeBox([.026, .025, .160], [hx + side * .010, hy, hz], paint));
      satinTrimParts.push(makeBox([.010, .006, .132], [hx + side * .020, hy + .007, hz], satin));
    }

    // Dark matte wheel-arch inner liners (extended slightly below axle height to seal lower arch corners)
    for (const wz of [-axleHalf, axleHalf]) {
      const linerGeo = new T.CylinderGeometry(archR - .005, archR - .005, .34, 16, 1, true, -.28, Math.PI + .56);
      linerGeo.rotateZ(Math.PI / 2);
      const liner = new T.Mesh(linerGeo, black);
      liner.position.set(side * .735, c.wheelRadius, wz);
      blackTrimParts.push(liner);
      const wall = new T.Mesh(new T.CircleGeometry(archR - .005, 14, -.28, Math.PI + .56), black);
      wall.rotation.y = side < 0 ? -Math.PI / 2 : Math.PI / 2;
      wall.position.set(side * .565, c.wheelRadius, wz);
      blackTrimParts.push(wall);
    }
  }

  // Shark-fin roof antenna (stays strictly <= 1.5150 m max height!)
  paintedTrimParts.push(makeBox([.028, .040, .135], [0, 1.470, 1.00], paint, [.20, 0, 0]));

  // Underfloor flat battery enclosure (matches ground clearance 0.145 m)
  const underfloor = makeBox([1.34, .095, 2.02], [0, .1925, .08], black);
  underfloor.name = 'Qin flat underfloor battery enclosure';
  underfloor.userData.vehicleBodyPart = 'underfloor';
  root.add(underfloor);

  // ── 2026 FRONT FASCIA (Sleek Curved New Dragon Face — 100% Flush Corners!) ─
  // 1. Wide low-slung inverted-trapezoid Dragon-Scale grille (Atlas Region A)
  const grilleMesh = surfaceGrid('Qin Dragon Face grille', 3, 12, (u, v) => {
    const s = v * 2 - 1;
    const y = T.MathUtils.lerp(.295, .605, u);
    const halfW = T.MathUtils.lerp(.53, .615, u);
    const x = s * halfW;
    return [x, y, frontZ(x, y, -.005)];
  }, atlasMat);
  setUVRegion(grilleMesh, .01, .51, .49, .99, true);
  grilleMesh.userData.vehicleBodyPart = 'body';
  root.add(grilleMesh);

  // Dark gloss grille perimeter surround + lower front splitter lip
  const grilleTop: P[] = [], grilleBot: P[] = [];
  for (let i = 0; i <= 12; i++) {
    const s = (i / 12) * 2 - 1;
    grilleTop.push([s * .63, .616, frontZ(s * .63, .616, -.009)]);
    grilleBot.push([s * .60, .278, frontZ(s * .60, .278, -.011)]);
  }
  glossBlackParts.push(makeRibbon('Grille upper frame', grilleTop, .013, glossBlack, -1));
  blackTrimParts.push(makeRibbon('Front splitter lip', grilleBot, .020, black, -1));

  // 2. Signature Dragon Face sculpted satin-chrome brow bridging the headlamps (100% flush!)
  const browPts: P[] = [];
  for (let i = 0; i <= 14; i++) {
    const s = (i / 14) * 2 - 1;
    const x = s * .725;
    const y = .668 + .028 * (Math.abs(s) ** 1.3);
    browPts.push([x, y, frontZ(x, y, -.010)]);
  }
  satinTrimParts.push(makeRibbon('Dragon Face chrome brow', browPts, .015, satin, -1));

  // 3. Front "秦" Dynasty crest centered on the chrome brow (Atlas Region B)
  const frontBadge = surfaceGrid('Qin dynasty grille badge', 2, 4, (u, v) => {
    const x = (v - .5) * .092;
    const y = .670 + (u - .5) * .054;
    return [x, y, frontZ(x, y, -.014)];
  }, atlasMat);
  setUVRegion(frontBadge, .51, .51, .74, .99, true);
  frontBadge.userData.vehicleBodyPart = 'badge';
  root.add(frontBadge);

  // 4. Front showroom plate centered in lower grille (Atlas Region D)
  const frontPlate = surfaceGrid('Qin front plate', 2, 4, (u, v) => {
    const x = (v - .5) * .42;
    const y = .448 + (u - .5) * .112;
    return [x, y, frontZ(x, y, -.013)];
  }, atlasMat);
  setUVRegion(frontPlate, .01, .02, .49, .48, true);
  frontPlate.userData.vehicleBodyPart = 'body';
  root.add(frontPlate);

  // 5. Left & Right flush C-shaped corner air curtains & 2026 swept LED headlamps
  const markOptic = (mesh: T.Mesh, key: string, masked = false) => {
    mesh.userData.refinedOptics = true;
    mesh.userData.lightingKey = key;
    if (masked) mesh.userData.textureMaskedLight = true;
    mesh.castShadow = false;
    root.add(mesh);
  };

  for (const side of [-1, 1]) {
    const label = side < 0 ? 'Left' : 'Right';
    const signalKey = side < 0 ? 'left' : 'right';

    // Flush C-shaped corner air-curtain recess + satin aerodynamic blade (strictly inside bumper corner!)
    const curtain = surfaceGrid('Front air curtain', 2, 4, (u, v) => {
      const x = side * T.MathUtils.lerp(.60, .725, v);
      const y = T.MathUtils.lerp(.295, .515, u);
      return [x, y, frontZ(x, y, -.005)];
    }, glossBlack);
    glossBlackParts.push(curtain);

    const bladePts: P[] = [
      [side * .605, .500, frontZ(side * .605, .500, -.010)],
      [side * .685, .482, frontZ(side * .685, .482, -.010)],
      [side * .710, .325, frontZ(side * .710, .325, -.010)],
    ];
    satinTrimParts.push(makeRibbon('Air curtain blade', bladePts, .008, satin, -1));

    // Flush swept headlamp dark smoked optical housing (|x| <= 0.750 — ZERO overhang!)
    const housing = surfaceGrid('Headlamp housing', 2, 6, (u, v) => {
      const x = side * T.MathUtils.lerp(.40, .750, v);
      const yBot = .640 + .034 * v;
      const yTop = .696 + .046 * v;
      const y = T.MathUtils.lerp(yBot, yTop, u);
      return [x, y, frontZ(x, y, -.006)];
    }, glossBlack);
    glossBlackParts.push(housing);

    // Clear polycarbonate headlamp cover
    const cover = surfaceGrid('Headlamp cover', 2, 5, (u, v) => {
      const x = side * T.MathUtils.lerp(.395, .755, v);
      const yBot = .636 + .034 * v;
      const yTop = .700 + .046 * v;
      const y = T.MathUtils.lerp(yBot, yTop, u);
      return [x, y, frontZ(x, y, -.013)];
    }, lampCover);
    coverGlassParts.push(cover);

    // Active LED DRL "箭羽" light blade (strictly outward -Z normal for BOTH sides!)
    const drlPts: P[] = [];
    for (let i = 0; i <= 6; i++) {
      const v = i / 6;
      const x = side * T.MathUtils.lerp(.41, .740, v);
      const y = .688 + .042 * v;
      drlPts.push([x, y, frontZ(x, y, -.010)]);
    }
    markOptic(makeRibbon(`${label} Qin LED DRL`, drlPts, .007, optic, -1), 'position');

    // Active dual LED projector modules
    const projParts = [0, 1].map(idx => {
      const v = idx === 0 ? .32 : .66;
      const x = side * T.MathUtils.lerp(.42, .73, v);
      const y = .662 + .034 * v;
      return makeBox([.058, .026, .012], [x, y, frontZ(x, y, -.010)], optic, [0, side * -.22, 0]);
    });
    const projectors = joinMeshes(`${label} Qin LED projectors`, projParts, optic, false);
    projectors.userData.vehicleBodyPart = 'headlamp';
    markOptic(projectors, 'head');

    // Active front amber turn indicator strip (strictly outward -Z normal for BOTH sides!)
    const turnPts: P[] = [];
    for (let i = 0; i <= 4; i++) {
      const v = i / 4;
      const x = side * T.MathUtils.lerp(.42, .66, v);
      const y = .646 + .024 * v;
      turnPts.push([x, y, frontZ(x, y, -.011)]);
    }
    markOptic(makeRibbon(`${label} Qin front turn`, turnPts, .0055, optic, -1), signalKey);
  }

  // ── 2026 REAR FASCIA (Flush Chinese-Knot Taillights & Sculpted Diffuser) ──
  // 1. Smoked full-width taillight housing backing (|x| <= 0.755 — ZERO corner overhang!)
  const tailBacking = surfaceGrid('Qin full-width tail housing', 2, 16, (u, v) => {
    const s = v * 2 - 1;
    const x = s * .755;
    const wing = Math.max(0, (Math.abs(s) - .40) / .60);
    const halfH = .023 + .024 * wing;
    const y = .875 + (u * 2 - 1) * halfH;
    return [x, y, rearZ(x, y, .005)];
  }, atlasMat);
  setUVRegion(tailBacking, .51, .02, .99, .48, false);
  tailBacking.userData.vehicleBodyPart = 'tail-lamp';
  root.add(tailBacking);

  // 2. Active full-width "中国结" (Chinese Knot) glowing LED tail lamp
  const tailKnot = surfaceGrid('Qin Chinese-knot LED tail lamp', 2, 16, (u, v) => {
    const s = v * 2 - 1;
    const x = s * .750;
    const wing = Math.max(0, (Math.abs(s) - .40) / .60);
    const halfH = .021 + .022 * wing;
    const y = .875 + (u * 2 - 1) * halfH;
    return [x, y, rearZ(x, y, .010)];
  }, tailOpticMat);
  markOptic(tailKnot, 'tail', true);

  // 3. Active brake lights (both outer ruby blocks facing +Z + rear-glass CHMSL merged!)
  const brakeParts: T.Mesh[] = [];
  for (const side of [-1, 1]) {
    const bPts: P[] = [];
    for (let i = 0; i <= 4; i++) {
      const x = side * T.MathUtils.lerp(.44, .73, i / 4);
      bPts.push([x, .886, rearZ(x, .886, .012)]);
    }
    brakeParts.push(makeRibbon('Outer brake', bPts, .011, optic, 1));
  }
  brakeParts.push(makeBox([.26, .014, .010], [0, 1.396, 1.28], optic));
  markOptic(joinMeshes('Qin brake lamps', brakeParts, optic, false), 'brake');

  // 4. Active rear amber turn signals (both facing +Z!) & reverse / rear fog lamps
  for (const side of [-1, 1]) {
    const label = side < 0 ? 'Left' : 'Right';
    const signalKey = side < 0 ? 'left' : 'right';
    const rtPts: P[] = [];
    for (let i = 0; i <= 4; i++) {
      const x = side * T.MathUtils.lerp(.45, .72, i / 4);
      rtPts.push([x, .846, rearZ(x, .846, .012)]);
    }
    markOptic(makeRibbon(`${label} Qin rear turn`, rtPts, .0065, optic, 1), signalKey);
  }
  const revParts = [-1, 1].map(side => {
    const x = side * .52;
    return makeBox([.11, .018, .008], [x, .425, rearZ(x, .425, .010)], optic);
  });
  markOptic(joinMeshes('Qin reverse lamps', revParts, optic, false), 'reverse');

  const rearFog = makeBox([.11, .022, .008], [-.30, .370, rearZ(-.30, .370, .011)], optic);
  rearFog.name = 'Qin rear fog lamp';
  markOptic(rearFog, 'fogRear');

  // 5. Modern rear "BYD" emblem centered right below the taillight bar (Atlas Region C)
  const rearBadge = surfaceGrid('Qin rear BYD emblem', 2, 4, (u, v) => {
    const x = (v - .5) * .132;
    const y = .808 + (u - .5) * .033;
    return [x, y, rearZ(x, y, .009)];
  }, atlasMat);
  setUVRegion(rearBadge, .76, .52, .99, .98, false);
  rearBadge.userData.vehicleBodyPart = 'badge';
  root.add(rearBadge);

  // 6. Recessed trapezoidal rear license plate cove & showroom plate (Atlas Region D)
  const plateCove = surfaceGrid('Rear plate cove', 2, 4, (u, v) => {
    const s = v * 2 - 1;
    const halfW = T.MathUtils.lerp(.25, .28, u);
    const x = s * halfW;
    const y = T.MathUtils.lerp(.555, .720, u);
    return [x, y, rearZ(x, y, .006)];
  }, glossBlack);
  glossBlackParts.push(plateCove);

  const rearPlate = surfaceGrid('Qin rear plate', 2, 4, (u, v) => {
    const x = (v - .5) * .43;
    const y = .638 + (u - .5) * .115;
    return [x, y, rearZ(x, y, .011)];
  }, atlasMat);
  setUVRegion(rearPlate, .01, .02, .49, .48, false);
  rearPlate.userData.vehicleBodyPart = 'body';
  root.add(rearPlate);

  // 7. Sculpted lower rear diffuser apron + slim satin accent bar + passive red reflectors
  const diffuser = surfaceGrid('Rear diffuser', 2, 12, (u, v) => {
    const s = v * 2 - 1;
    const x = s * .72;
    const y = T.MathUtils.lerp(.322, .445 - .016 * s * s, u);
    return [x, y, rearZ(x, y, .006)];
  }, black);
  blackTrimParts.push(diffuser);

  const diffTrimPts: P[] = [];
  for (let i = 0; i <= 10; i++) {
    const s = (i / 10) * 2 - 1;
    diffTrimPts.push([s * .64, .358, rearZ(s * .64, .358, .011)]);
  }
  satinTrimParts.push(makeRibbon('Rear diffuser chrome', diffTrimPts, .006, satin, 1));

  const reflParts = [-1, 1].map(side => {
    const x = side * .60;
    return makeBox([.125, .015, .008], [x, .445, rearZ(x, .445, .009)], reflectorRed);
  });
  const reflectors = joinMeshes('Qin rear passive reflectors', reflParts, reflectorRed, false);
  reflectors.userData.vehicleBodyPart = 'body';
  root.add(reflectors);

  // Merge static same-material assemblies to keep draw calls minimal
  const addMerged = (name: string, parts: T.Mesh[], mat: T.Material, partTag = 'body', shadow = true) => {
    if (!parts.length) return;
    const mesh = joinMeshes(name, parts, mat, shadow);
    mesh.userData.vehicleBodyPart = partTag;
    root.add(mesh);
  };
  addMerged('Qin painted greenhouse pillars and handles', paintedTrimParts, paint);
  addMerged('Qin matte black wheel-well liners and trim', blackTrimParts, black);
  addMerged('Qin gloss black B-pillars and lamp housings', glossBlackParts, glossBlack);
  addMerged('Qin satin chrome Dragon Face and DLO trim', satinTrimParts, satin);
  addMerged('Qin curved side glazing', sideGlassParts, glass, 'glass', false);
  addMerged('Qin headlamp polycarbonate covers', coverGlassParts, lampCover, 'glass', false);
}
