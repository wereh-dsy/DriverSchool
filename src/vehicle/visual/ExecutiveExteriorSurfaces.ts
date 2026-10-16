import * as T from 'three';
import type { VehicleVisualConfig } from './VehicleVisualConfig';
import type { VehicleAssetRegistry } from './VehicleAssetRegistry';
import { VEHICLE_RENDER_LAYERS } from './VehicleRenderLayers';

type Region = 'front' | 'rear' | 'wheel' | 'front-lamp' | 'rear-lamp';
const regions = { front: [0, 0, 1024, 384], rear: [0, 384, 1024, 384], wheel: [0, 768, 256, 256],
  'front-lamp': [256, 768, 512, 128], 'rear-lamp': [256, 896, 512, 128] } as const;

/** Rounded nose in metres. Shared by paint, trim and the real lamp optics. */
export function executiveNoseZ(config: VehicleVisualConfig, x: number, y: number, z: number): number {
  const halfLength = (config.dimensions.length - .0226) / 2, halfWidth = (config.dimensions.width - .01) / 2;
  const fade = T.MathUtils.clamp((-config.wheelBase / 2 - z) / (halfLength - config.wheelBase / 2), 0, 1);
  const lower = T.MathUtils.clamp((.76 - y) / .51, 0, 1);
  return z + fade * (.22 * (x / halfWidth) ** 2 + .085 * lower * lower);
}

/** One synchronous, mipmapped atlas. Repeated grille cells, badges, bumper
 * recesses and machined wheel faces cost no individual meshes or frame work. */
function createAtlas(): T.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4;
  texture.name = 'Executive static exterior atlas 1024';
  const c = canvas.getContext('2d');
  // Headless structure checks may provide a canvas without a rendering context.
  if (!c) return texture;
  const path = (points: readonly (readonly [number, number])[], fill: string, stroke?: string, width = 2) => {
    c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
    c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = width; c.stroke(); }
  };
  const line = (points: readonly (readonly [number, number])[], color: string, width: number) => {
    c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.strokeStyle = color; c.lineWidth = width; c.stroke();
  };
  const text = (value: string, x: number, y: number, size: number, color: string) => {
    c.font = `500 ${size}px Arial, sans-serif`; c.textAlign = 'center'; c.fillStyle = color; c.fillText(value, x, y);
  };
  const rings = (x: number, y: number, r: number) => {
    c.strokeStyle = '#c8ced0'; c.lineWidth = 2.6;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(x + (i - 1.5) * r * 1.55, y, r, r * .86, 0, 0, Math.PI * 2); c.stroke(); }
  };
  const plate = (y: number) => {
    c.fillStyle = '#101419'; c.fillRect(403, y - 3, 218, 64);
    c.fillStyle = '#d4dadb'; c.fillRect(410, y + 3, 204, 50);
    text('A6L', 512, y + 39, 31, '#26343f');
  };
  // Front: wide single-frame grille, satin perimeter, staggered metallic inlays.
  const paint = c.createLinearGradient(0, 0, 0, 384);
  paint.addColorStop(0, '#20262b'); paint.addColorStop(.3, '#090c10'); paint.addColorStop(.75, '#11171c'); paint.addColorStop(1, '#030507');
  c.fillStyle = paint; c.fillRect(0, 0, 1024, 384);
  c.beginPath(); c.moveTo(302, 52); c.quadraticCurveTo(512, 31, 722, 52);
  c.quadraticCurveTo(804, 61, 808, 91); c.quadraticCurveTo(797, 235, 758, 297);
  c.quadraticCurveTo(737, 331, 696, 332); c.lineTo(328, 332);
  c.quadraticCurveTo(287, 331, 266, 297); c.quadraticCurveTo(227, 235, 216, 91);
  c.quadraticCurveTo(220, 61, 302, 52); c.closePath();
  c.fillStyle = '#070a0d'; c.fill(); c.strokeStyle = '#a0aaaf'; c.lineWidth = 6; c.stroke();
  c.save(); c.clip();
  for (let row = 0; row < 10; row++) for (let col = 0; col < 15; col++) {
    const x = 220 + col * 43 + (row % 2) * 21.5, y = 56 + row * 32;
    path([[x - 18, y], [x, y - 14], [x + 18, y], [x, y + 14]], '#0a0e12', '#333b40', 1.6);
    path([[x - 6, y - 5], [x + 5, y - 7], [x + 7, y + 2], [x - 4, y + 4]], '#8b959c');
    line([[x - 4, y - 5], [x + 5, y - 6]], '#d3dadd', 1.4);
  }
  c.restore();
  c.fillStyle = '#0a0c0f'; c.fillRect(450, 51, 124, 38); rings(512, 69, 13);
  plate(158); text('quattro', 512, 278, 13, '#89949d');
  for (const side of [-1, 1]) {
    c.save(); c.translate(side < 0 ? 0 : 1024, 0); c.scale(side < 0 ? 1 : -1, 1);
    path([[35, 111], [144, 108], [191, 291], [77, 315], [38, 276]], '#04070a', '#30373d', 3);
    for (let y = 150; y < 276; y += 17) line([[59, y], [143, y - 7]], '#242c32', 3);
    line([[25, 100], [35, 281], [68, 323], [222, 342]], '#9ca6ac', 12);
    line([[28, 104], [39, 280], [71, 318], [214, 336]], '#d1d7d9', 2);
    c.restore();
  }
  line([[75, 365], [949, 365]], '#333d44', 5);
  // Rear: restrained lamp masks, connecting brightwork, numberplate recess,
  // patterned lower valance and the two integrated trapezoidal outlet trims.
  c.save(); c.translate(0, 384);
  c.fillStyle = paint; c.fillRect(0, 0, 1024, 384);
  for (const side of [-1, 1]) {
    c.save(); c.translate(side < 0 ? 0 : 1024, 0); c.scale(side < 0 ? 1 : -1, 1);
    path([[18, 13], [168, 19], [298, 51], [286, 89], [56, 76]], '#260a10', '#4d272c', 2);
    for (let x = 67; x < 281; x += 31) path([[x, 48], [x + 20, 51], [x + 16, 56], [x - 3, 53]], '#82434b');
    c.restore();
  }
  rings(512, 70, 12); line([[58, 98], [966, 98]], '#a0aaaf', 4);
  path([[378, 137], [646, 137], [665, 225], [358, 225]], '#030507', '#283139', 3); plate(151);
  text('A6L', 157, 160, 18, '#b4bdc1'); text('45 TFSI', 862, 160, 16, '#b4bdc1');
  path([[72, 257], [952, 257], [991, 327], [948, 369], [76, 369], [33, 327]], '#05080b', '#9ca6ac', 7);
  for (let row = 0; row < 3; row++) for (let x = 95; x < 947; x += 32) {
    c.fillStyle = '#5c676f'; c.fillRect(x + (row % 2) * 13, 279 + row * 23, 4, 9);
  }
  for (const x of [142, 882]) {
    path([[x - 66, 320], [x + 65, 320], [x + 52, 352], [x - 53, 352]], '#aeb9be');
    path([[x - 53, 326], [x + 51, 326], [x + 42, 346], [x - 44, 346]], '#06090c');
    line([[x - 54, 250], [x + 53, 250]], '#73202a', 6);
  }
  c.restore();
  // Wheel: ten split, diamond-cut spokes with open alpha-tested pockets.
  c.save(); c.translate(128, 896);
  c.clearRect(-128, -128, 256, 256);
  c.fillStyle = '#242a30'; c.beginPath(); c.arc(0, 0, 124, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#b1bdc5'; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 120, 0, Math.PI * 2); c.stroke();
  for (let i = 0; i < 10; i++) {
    c.save(); c.rotate(i * Math.PI / 5);
    c.globalCompositeOperation = 'destination-out';
    path([[29, -8], [108, -22], [105, -48], [30, -17]], '#000');
    c.globalCompositeOperation = 'source-over';
    path([[25, -6], [109, -18], [114, -11], [40, 4]], '#c0c9cf', '#e3e8ea', 1.2);
    path([[30, 3], [114, -9], [111, -3], [39, 10]], '#616e78');
    c.restore();
  }
  c.fillStyle = '#252d34'; c.beginPath(); c.arc(0, 0, 26, 0, Math.PI * 2); c.fill();
  for (let i = 0; i < 5; i++) { const a = i * Math.PI * .4; c.fillStyle = '#090c10'; c.beginPath(); c.arc(Math.sin(a) * 19, Math.cos(a) * 19, 3, 0, Math.PI * 2); c.fill(); }
  rings(0, 0, 3.2); c.restore();
  // Lamp internals occupy previously unused atlas space. The artwork is dark
  // when unpowered; real LED ribbons provide all of the visible light output.
  for (const front of [true, false]) {
    c.save(); c.translate(256, front ? 768 : 896);
    const lens = c.createLinearGradient(0, 0, 0, 128);
    lens.addColorStop(0, front ? '#34414d' : '#541c2b'); lens.addColorStop(.4, front ? '#0b1119' : '#250911');
    lens.addColorStop(1, '#05080d'); c.fillStyle = lens; c.fillRect(0, 0, 512, 128);
    line([[7, 77], [45, 45], [467, 13], [496, 32]], front ? '#7d919f' : '#8f4654', 2);
    if (front) {
      for (let i = 0; i < 4; i++) {
        const x = 106 + i * 87;
        path([[x - 32, 52], [x + 30, 45], [x + 35, 91], [x - 29, 96]], '#060a10', '#536675', 2);
        path([[x - 26, 56], [x + 22, 51], [x + 28, 58], [x - 24, 65]], '#9aaab5');
        path([[x - 23, 89], [x + 29, 84], [x + 24, 91], [x - 25, 96]], '#3c4c5a');
        for (let y = 68; y < 88; y += 5) line([[x - 22, y], [x + 25, y - 4]], '#263746', 1);
      }
      line([[21, 110], [305, 107], [457, 63]], '#526879', 2);
    } else {
      for (let i = 0; i < 6; i++) {
        const x = 77 + i * 61;
        path([[x, 27], [x + 39, 23], [x + 30, 52], [x - 7, 54]], '#47101b', '#803442', 1.5);
        for (let y = 30; y < 52; y += 5) line([[x + 2, y], [x + 28, y - 3]], '#61202e', 1);
      }
      line([[12, 77], [300, 76], [471, 61], [451, 116]], '#813343', 3);
    }
    c.restore();
  }
  return texture;
}

export function executiveSurfaceMap(owner: object, assets?: VehicleAssetRegistry): T.Texture {
  if (!assets) return createAtlas();
  const holder = assets.mesh(owner, 'executive-exterior-atlas', () =>
    new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshStandardMaterial({ map: createAtlas() })));
  const material = holder.material as T.MeshStandardMaterial, map = material.map!;
  material.dispose(); return map;
}

export function executiveUV(geometry: T.BufferGeometry, region: Region, u: readonly number[], v: readonly number[]): void {
  const [x, y, w, h] = regions[region], uv: number[] = [];
  u.forEach((s, i) => uv.push((x + s * w) / 1024, 1 - (y + (1 - v[i]!) * h) / 1024));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
}

export function addExecutiveFascia(root: T.Group, config: VehicleVisualConfig, map: T.Texture): void {
  const halfLength = (config.dimensions.length - .0226) / 2, halfWidth = (config.dimensions.width - .01) / 2;
  const material = new T.MeshStandardMaterial({ map, roughness: .35, metalness: .45 });
  material.name = 'Executive painted fascia and static metallic details';
  for (const front of [true, false]) {
    // Slightly inset from active optics, including the low front fog lamps.
    const z = front ? -halfLength - .0045 : halfLength + .006;
    const geometry = new T.BufferGeometry(), positions: number[] = [], indices: number[] = [], u: number[] = [], v: number[] = [];
    const columns = front ? 16 : 1, rows = front ? 4 : 1;
    for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
      const s = col / columns, t = row / rows, y = T.MathUtils.lerp(.255, .785, t);
      const x = (2 * s - 1) * halfWidth * T.MathUtils.lerp(.86, .94, t);
      positions.push(x, y, front ? executiveNoseZ(config, x, y, z) : z);
      u.push(front ? 1 - s : s); v.push(t);
      if (row < rows && col < columns) {
        const a = row * (columns + 1) + col, b = a + columns + 1;
        indices.push(...(front ? [a, b + 1, a + 1, a, b, b + 1] : [a, a + 1, b + 1, a, b + 1, b]));
      }
    }
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices);
    executiveUV(geometry, front ? 'front' : 'rear', u, v);
    geometry.computeVertexNormals();
    const mesh = new T.Mesh(geometry, material); mesh.name = front ? 'Executive single-frame textured grille and intakes' : 'Executive textured boot and lower valance';
    mesh.userData.vehicleBodyPart = front ? 'grille' : 'rear-trim'; mesh.layers.set(VEHICLE_RENDER_LAYERS.EXTERIOR);
    mesh.receiveShadow = true; root.add(mesh);
  }
}
