import * as T from 'three';
import type { VehicleAssetRegistry } from './VehicleAssetRegistry';

export const EXECUTIVE_CABIN_CELLS = {
  vent: [0, 0, 1024, 160], leftKeys: [0, 160, 256, 192], rightKeys: [256, 160, 256, 192],
  hub: [512, 160, 256, 256], spoke: [768, 160, 256, 256], wood: [0, 352, 512, 64],
  console: [0, 416, 512, 608], glass: [512, 416, 256, 192], climate: [512, 608, 256, 144],
  bezel: [512, 752, 256, 192], controls: [512, 944, 256, 80], door: [768, 416, 256, 432],
  selectorTop: [768, 848, 256, 80], selectorFront: [768, 928, 256, 96],
} as const;
export type ExecutiveCabinCell = keyof typeof EXECUTIVE_CABIN_CELLS;

const noise = (x: number, y: number): number => {
  let n = Math.imul(x + 1931, 374761393) ^ Math.imul(y + 437, 668265263);
  n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967295;
};

/** Original reference-matched artwork. These are unlit engravings and material
 * details, not invented temperature, gear, radio or assistance telemetry. */
function drawAtlas(c: CanvasRenderingContext2D, mode: 'color' | 'relief' | 'roughness'): void {
  const color = mode === 'color', relief = mode === 'relief';
  const fill = (value: string, height = '#808080', rough = '#d4d4d4') => color ? value : relief ? height : rough;
  const path = (points: readonly (readonly [number, number])[], stroke: string, width = 2, close = false) => {
    c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    if (close) c.closePath(); c.strokeStyle = fill(stroke, '#969696', '#777777'); c.lineWidth = width; c.stroke();
  };
  const text = (value: string, x: number, y: number, size = 22, tone = '#c1c8cd') => {
    c.font = `500 ${size}px Arial, Microsoft YaHei, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = fill(tone, '#959595', '#888888'); c.fillText(value, x, y);
  };
  const rect = (x: number, y: number, w: number, h: number, tone: string, r = '#808080', rough = '#cccccc') => {
    c.fillStyle = fill(tone, r, rough); c.fillRect(x, y, w, h);
  };
  const border = (x: number, y: number, w: number, h: number, r: number, tone: string, width = 2) => {
    c.beginPath(); c.roundRect(x, y, w, h, r); c.strokeStyle = fill(tone, '#969696', '#6a6a6a'); c.lineWidth = width; c.stroke();
  };
  const wood = (x: number, y: number, w: number, h: number, vertical: boolean) => {
    rect(x, y, w, h, '#2b2a28', '#808080', '#b9b9b9');
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    for (let i = 0; i < (vertical ? w : h); i += 2) {
      const n = noise(i, 7), v = 27 + Math.round(n * 11);
      c.strokeStyle = fill(`rgb(${v + 2},${v + 1},${v})`, n > .6 ? '#848484' : '#7c7c7c', '#bcbcbc');
      c.lineWidth = n > .7 ? 1.2 : .6; c.beginPath();
      for (let j = 0; j <= 16; j++) {
        const t = j / 16, wave = Math.sin(t * 5 + n * 17) * (1 + n * 3) + Math.sin(t * 17 + i) * .8;
        const px = vertical ? x + i + wave : x + t * w, py = vertical ? y + t * h : y + i + wave;
        j ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.stroke();
    }
    c.restore();
  };
  rect(0, 0, 1024, 1024, '#15191d');
  // Concealed vertical vanes, four horizontal blades, bright adjustment tabs.
  rect(0, 0, 1024, 160, '#03070b', '#555555', '#999999');
  for (let x = 34; x < 1024; x += 55) {
    rect(x, 16, 4, 129, '#263039', '#888888', '#bbbbbb');
    rect(x + 4, 16, 4, 129, '#070c12', '#707070', '#aaaaaa');
  }
  for (const y of [26, 58, 91, 124]) {
    rect(8, y, 1008, 6, '#46515a', '#999999', '#737373');
    rect(8, y, 1008, 1.5, '#8c979f', '#a1a1a1', '#666666');
    rect(8, y + 6, 1008, 6, '#04080c', '#656565', '#aaaaaa');
  }
  for (const x of [254, 757]) { rect(x, 48, 69, 17, '#11181e', '#a2a2a2', '#666666'); rect(x + 3, 48, 63, 3, '#b6c0c7'); }
  border(2, 3, 1020, 151, 9, '#59656e', 2);
  // Glossy multifunction pads; the original steering/input paths are retained.
  for (const left of [true, false]) {
    const x = left ? 0 : 256;
    rect(x, 160, 256, 192, '#0a0f14', '#808080', '#454545');
    border(x + 6, 166, 244, 180, 15, '#a5afb7', 3);
    path([[x + 13, 246], [x + 243, 246]], '#414b54', 2);
    text(left ? '◁' : '☎', x + 57, 205, 30); text(left ? '▷' : '♪', x + 195, 205, 30);
    border(x + 108, 190, 40, 71, 8, '#707d87');
    for (let y = 198; y < 258; y += 7) path([[x + 111, y], [x + 144, y]], '#89949c', 2);
    text(left ? 'VIEW' : '＋', x + 66, 296, 20); text(left ? '↩' : '−', x + 193, 296, 25);
  }
  wood(0, 352, 512, 64, false);
  // Stitched trapezoidal airbag pad; the existing four-ring badge stays 3D.
  rect(512, 160, 256, 256, '#282b2e', '#808080', '#d7d7d7');
  const hub = [[532, 190], [551, 173], [730, 173], [750, 190], [717, 376], [696, 395], [584, 395], [562, 376]] as const;
  path(hub, '#11171c', 5, true); c.setLineDash([3, 5]); path(hub, '#777d80', 1, true); c.setLineDash([]);
  path([[557, 203], [575, 191], [705, 191], [725, 203], [707, 315], [573, 315]], '#aeb7bd', 3, true);
  text('AIRBAG', 640, 353, 12, '#626a70');
  rect(768, 160, 256, 256, '#10161b', '#808080', '#515151');
  const spokeOutline = (points: readonly (readonly [number, number])[]) => points.map(([x, y]) =>
    [769 + (x + .0595) / .119 * 254, 161 + (1 - (y + .1575) / .119) * 254] as const);
  path(spokeOutline([[-.058, -.040], [.058, -.040], [.037, -.156], [-.037, -.156]]), '#aab4bb', 4, true);
  path(spokeOutline([[-.030, -.068], [-.019, -.141], [.019, -.141], [.030, -.068]]), '#aab4bb', 4, true);
  // One continuous ash-wood console with printed switch islands and panel gaps.
  wood(0, 416, 512, 608, true);
  border(9, 423, 494, 592, 18, '#9da6ae', 5); border(19, 433, 474, 572, 14, '#080d12', 3);
  path([[30, 594], [482, 594]], '#11171b', 5); path([[200, 580], [312, 580]], '#7f888f', 2);
  rect(353, 659, 126, 173, '#10171e', '#868686', '#6c6c6c'); border(357, 663, 118, 165, 7, '#a0aab2', 2);
  for (const [value, y] of [['R', 687], ['N', 727], ['D/S', 768], ['＋  −', 803]] as const) text(value, 416, y, value === 'D/S' ? 19 : 22);
  // The markings describe switches, without fabricating a selected state.
  rect(100, 775, 230, 62, '#171e24', '#8a8a8a', '#656565'); border(104, 779, 222, 54, 5, '#a8b0b6', 3);
  path([[213, 782], [213, 830]], '#46525c', 2); text('Ⓟ', 157, 806, 28); text('AUTO', 269, 796, 13); text('HOLD', 269, 816, 13);
  // Dark screen glass and understated reflections; no mock radio/temperature UI.
  for (const [y, h] of [[416, 192], [608, 144]] as const) {
    rect(512, y, 256, h, '#060b10', '#808080', '#252525');
    path([[515, y + 3], [763, y + 3]], '#68717a', 1);
    if (color) {
      const sheen = c.createLinearGradient(512, y, 768, y + h);
      sheen.addColorStop(0, 'rgba(133,154,174,.10)'); sheen.addColorStop(.43, 'rgba(48,64,82,.01)'); sheen.addColorStop(1, 'rgba(123,144,166,.05)');
      c.fillStyle = sheen; c.fillRect(512, y, 256, h);
    }
  }
  // Piano-black surround with a continuous chamfered satin perimeter.
  rect(512, 752, 256, 192, '#11171e', '#808080', '#424242');
  path([[529, 759], [750, 759], [762, 775], [752, 926], [737, 937], [543, 937], [526, 920], [517, 779]], '#a4afb9', 3, true);
  path([[534, 767], [746, 767], [754, 779], [745, 919], [733, 928], [546, 928], [534, 915], [525, 782]], '#505e69', 2, true);
  rect(512, 944, 256, 80, '#141a20', '#808080', '#686868');
  text('drive select', 556, 983, 12); text('△', 639, 980, 27, '#a4434c'); text('START', 717, 970, 11); text('STOP', 717, 989, 11);
  // Door veneer and lower leather/speaker grille, all within the original card.
  rect(768, 416, 256, 432, '#20252a', '#808080', '#d1d1d1');
  wood(768, 422, 256, 119, false); path([[768, 548], [1024, 548]], '#abb7bf', 3);
  path([[774, 576], [1017, 576]], '#080e13', 3); c.setLineDash([3, 5]); path([[774, 582], [1017, 582]], '#6d7479', 1); c.setLineDash([]);
  for (let y = 700; y < 835; y += 7) for (let x = 791; x < 1009; x += 7) rect(x, y, 2, 2, '#0c1218', '#6d6d6d', '#dddddd');
  // Compact palm selector: top stitching, satin cap and one P button face.
  rect(768, 848, 256, 80, '#2d3034', '#808080', '#c7c7c7');
  border(774, 853, 244, 69, 16, '#aab6bf', 3); c.setLineDash([3, 4]); border(784, 859, 224, 57, 12, '#757b80', 1); c.setLineDash([]);
  rect(768, 928, 256, 96, '#141b22', '#808080', '#676767');
  border(773, 932, 246, 88, 16, '#b4c0c8', 5); border(850, 942, 92, 67, 9, '#71808c', 3); text('P', 896, 976, 36);
}

function atlas(mode: 'color' | 'relief' | 'roughness'): T.CanvasTexture {
  const canvas = document.createElement('canvas'), size = mode === 'color' ? 1024 : 512;
  canvas.width = canvas.height = size; const c = canvas.getContext('2d');
  if (c) { c.save(); c.scale(size / 1024, size / 1024); drawAtlas(c, mode); c.restore(); }
  const t = new T.CanvasTexture(canvas); if (mode === 'color') t.colorSpace = T.SRGBColorSpace;
  t.name = `Executive cabin ${mode} atlas`; t.anisotropy = 4; return t;
}

function leatherMaps(): { color: T.CanvasTexture; bump: T.DataTexture; roughness: T.DataTexture } {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const c = canvas.getContext('2d'), height = new Uint8Array(256 * 256 * 4), rough = new Uint8Array(height.length);
  if (c) {
    c.fillStyle = '#1d2023'; c.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 10000; i++) {
      const x = Math.floor(noise(i, 1) * 512), y = Math.floor(noise(i, 2) * 256), v = 23 + Math.floor(noise(i, 3) * 11);
      c.fillStyle = `rgb(${v},${v + 2},${v + 4})`; c.fillRect(x, y, 1.5, 1);
    }
    c.strokeStyle = '#0e1419'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 92); c.lineTo(512, 92); c.stroke();
    c.setLineDash([3, 5]); c.strokeStyle = '#858c92'; c.lineWidth = .8; c.beginPath(); c.moveTo(0, 94); c.lineTo(512, 94); c.stroke(); c.setLineDash([]);
  }
  for (let i = 0; i < 256 * 256; i++) {
    const value = 118 + Math.round(noise(i % 256, i >>> 8) * 19), offset = i * 4;
    height[offset] = height[offset + 1] = height[offset + 2] = value; height[offset + 3] = 255;
    rough[offset] = rough[offset + 1] = rough[offset + 2] = 204 + value % 17; rough[offset + 3] = 255;
  }
  const color = new T.CanvasTexture(canvas); color.colorSpace = T.SRGBColorSpace; color.name = 'Executive stitched wheel leather';
  const bump = new T.DataTexture(height, 256, 256), roughness = new T.DataTexture(rough, 256, 256);
  for (const t of [color, bump, roughness]) {
    t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4;
    t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  }
  return { color, bump, roughness };
}

export interface ExecutiveCabinMaterials {
  readonly leather: T.MeshStandardMaterial; readonly soft: T.MeshStandardMaterial;
  readonly veneer: T.MeshStandardMaterial; readonly gloss: T.MeshPhysicalMaterial; readonly trim: T.MeshStandardMaterial;
}

export function executiveCabinMaterials(owner: object, assets?: VehicleAssetRegistry): ExecutiveCabinMaterials {
  const names = ['leather', 'soft', 'veneer', 'gloss', 'trim'] as const;
  const build = () => {
    const map = atlas('color'), bumpMap = atlas('relief'), roughnessMap = atlas('roughness'), grain = leatherMaps();
    const leather = new T.MeshStandardMaterial({ map: grain.color, bumpMap: grain.bump, bumpScale: .00030, roughnessMap: grain.roughness, roughness: 1, metalness: .02, side: T.DoubleSide });
    const soft = new T.MeshStandardMaterial({ color: 0x111419, bumpMap: grain.bump, bumpScale: .00022, roughnessMap: grain.roughness, roughness: 1, side: T.DoubleSide });
    const veneer = new T.MeshStandardMaterial({ map, bumpMap, bumpScale: .00020, roughnessMap, roughness: 1, metalness: .13, side: T.DoubleSide });
    const gloss = new T.MeshPhysicalMaterial({ map, bumpMap, bumpScale: .00009, roughnessMap, roughness: 1, metalness: .25, clearcoat: .32, clearcoatRoughness: .18, side: T.DoubleSide });
    const trim = new T.MeshStandardMaterial({ color: 0x7e8993, roughness: .31, metalness: .78 });
    const materials = [leather, soft, veneer, gloss, trim]; materials.forEach((m, i) => { m.name = 'Executive cabin ' + names[i]; });
    return new T.Mesh(new T.PlaneGeometry(1, 1), materials);
  };
  const holder = assets ? assets.mesh(owner, 'executive-cabin-surfaces-v1', build) : build();
  if (!assets) holder.geometry.dispose();
  const palette = holder.material as T.Material[], result = {} as Record<typeof names[number], T.Material>;
  names.forEach((name, i) => { result[name] = palette[i]!; });
  return result as unknown as ExecutiveCabinMaterials;
}

export function executiveCabinUV(geometry: T.BufferGeometry, cell: ExecutiveCabinCell | undefined, axis: 'xy' | 'xz' | 'zy' = 'xy',
  bounds?: T.Box3): void {
  if (!bounds) { geometry.computeBoundingBox(); bounds = geometry.boundingBox!; }
  const a = axis === 'zy' ? 'z' : 'x', b = axis === 'xz' ? 'z' : 'y';
  const p = geometry.getAttribute('position'), uv: number[] = [], [x, y, w, h] = cell ? EXECUTIVE_CABIN_CELLS[cell] : [0, 0, 1024, 1024];
  for (let i = 0; i < p.count; i++) {
    const s = (a === 'x' ? p.getX(i) : p.getZ(i)) - bounds.min[a];
    const t = (b === 'y' ? p.getY(i) : p.getZ(i)) - bounds.min[b];
    const u = s / Math.max(.0001, bounds.max[a] - bounds.min[a]);
    const v = t / Math.max(.0001, bounds.max[b] - bounds.min[b]);
    uv.push((x + 1 + u * (w - 2)) / 1024, 1 - (y + 1 + (axis === 'xz' ? v : 1 - v) * (h - 2)) / 1024);
  }
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
}

export function executiveCabinBoxUV(geometry: T.BoxGeometry, front: ExecutiveCabinCell, top?: ExecutiveCabinCell,
  blank: ExecutiveCabinCell = 'glass'): void {
  const uv = geometry.getAttribute('uv'), source = uv.clone(), index = geometry.getIndex()!;
  for (const group of geometry.groups) {
    const cell = group.materialIndex === 4 ? front : group.materialIndex === 2 && top ? top : blank;
    const [x, y, w, h] = EXECUTIVE_CABIN_CELLS[cell], seen = new Set<number>();
    for (let k = group.start; k < group.start + group.count; k++) {
      const i = index.getX(k); if (seen.has(i)) continue; seen.add(i);
      uv.setXY(i, (x + 1 + source.getX(i) * (w - 2)) / 1024, 1 - (y + 1 + (1 - source.getY(i)) * (h - 2)) / 1024);
    }
  }
}
