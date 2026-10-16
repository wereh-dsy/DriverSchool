import * as T from 'three';

const regions = {
  kidney: [0, 0, 256, 256], intake: [256, 0, 256, 256], air: [512, 0, 128, 256],
  head: [640, 0, 384, 128], tail: [640, 128, 384, 128],
  valance: [0, 256, 512, 128], rearPanel: [0, 384, 512, 128],
  wheel: [512, 256, 256, 256], side: [0, 512, 1024, 512],
} as const;
type Region = keyof typeof regions;

/** Drawn once during asset construction, then owned/shared with the exterior.
 * Fine recesses and machined faces need neither separate objects nor frame work. */
export function createBMW530ExteriorAtlas(): T.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
  const texture = new T.CanvasTexture(canvas);
  texture.name = 'BMW static exterior details 1024'; texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4;
  const c = canvas.getContext('2d'); if (!c) return texture;
  const line = (p: readonly (readonly [number, number])[], color: string, width: number) => {
    c.beginPath(); p.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.strokeStyle = color; c.lineWidth = width; c.stroke();
  };
  const polygon = (p: readonly (readonly [number, number])[], color: string) => {
    c.beginPath(); p.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.closePath(); c.fillStyle = color; c.fill();
  };
  const panel = (region: Region, draw: () => void) => {
    const [x, y, w, h] = regions[region]; c.save(); c.translate(x, y);
    c.beginPath(); c.rect(0, 0, w, h); c.clip(); draw(); c.restore();
  };
  panel('kidney', () => {
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#21262b'); g.addColorStop(.3, '#090b0f'); g.addColorStop(1, '#020305');
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 8; i++) {
      const x = 19 + i * 30;
      polygon([[x, 18], [x + 4, 18], [x + 1, 232], [x - 3, 232]], '#58626b');
      line([[x + 1, 20], [x - 2, 230]], '#d4dde1', 1.7);
      line([[x + 5, 21], [x + 2, 228]], '#151b21', 2);
    }
    line([[0, 120], [256, 120]], '#242b31', 2);
  });
  panel('intake', () => {
    c.fillStyle = '#040609'; c.fillRect(0, 0, 256, 256);
    for (let y = 22; y < 256; y += 40) {
      line([[0, y], [256, y]], '#293139', 3);
      line([[0, y + 4], [256, y + 4]], '#0b1016', 7);
    }
    for (let x = 16; x < 256; x += 35) line([[x, 0], [x - 12, 256]], '#192027', 3);
  });
  panel('air', () => {
    const g = c.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, '#070a0f'); g.addColorStop(.55, '#1e252c'); g.addColorStop(1, '#030508');
    c.fillStyle = g; c.fillRect(0, 0, 128, 256);
    line([[18, 248], [36, 47], [109, 14]], '#626d76', 3);
    line([[25, 248], [43, 50], [114, 22]], '#11171e', 6);
  });
  panel('head', () => {
    const g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#667482'); g.addColorStop(.18, '#121b23'); g.addColorStop(.65, '#050a11'); g.addColorStop(1, '#26323e');
    c.fillStyle = g; c.fillRect(0, 0, 384, 128);
    for (const x of [88, 244]) {
      c.fillStyle = '#35434f'; c.fillRect(x - 31, 39, 70, 51);
      c.fillStyle = '#0b131d'; c.fillRect(x - 25, 44, 58, 39);
      line([[x - 25, 47], [x + 27, 47]], '#8c9ba8', 3);
      for (let i = 0; i < 5; i++) line([[x - 26 + i * 13, 57], [x - 28 + i * 13, 79]], '#455867', 2);
    }
    line([[0, 13], [384, 13]], '#8c9aa5', 2);
  });
  panel('tail', () => {
    c.fillStyle = '#10080d'; c.fillRect(0, 0, 384, 128);
    for (const y of [30, 82]) {
      line([[0, y], [384, y - 9]], '#72222c', 12);
      line([[0, y - 3], [384, y - 12]], '#b44a52', 2);
      for (let x = 8; x < 384; x += 18) line([[x, y - 6], [x - 5, y + 5]], '#361019', 2);
    }
    line([[0, 59], [384, 50]], '#76818b', 5);
  });
  panel('valance', () => {
    c.fillStyle = '#070a0e'; c.fillRect(0, 0, 512, 128);
    line([[0, 14], [512, 14]], '#3b454f', 3);
    for (let x = 36; x < 512; x += 63) {
      polygon([[x, 128], [x + 4, 32], [x + 11, 32], [x + 19, 128]], '#151d25');
      line([[x + 4, 35], [x + 1, 121]], '#303b46', 2);
    }
  });
  panel('rearPanel', () => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 512, 128);
    line([[48, 0], [77, 38], [101, 56], [411, 56], [435, 38], [464, 0]], '#383e43', 1.8);
    line([[80, 38], [104, 58], [408, 58], [432, 38]], '#d6d9dc', 1);
    for (const x of [42, 172, 340, 470]) {
      c.strokeStyle = '#777c81'; c.lineWidth = .7;
      c.beginPath(); c.ellipse(x, 81, 2.2, 2.8, 0, 0, Math.PI * 2); c.stroke();
    }
  });
  panel('wheel', () => {
    c.clearRect(0, 0, 256, 256); c.translate(128, 128);
    c.strokeStyle = '#b9c3ca'; c.lineWidth = 5;
    c.beginPath(); c.arc(0, 0, 121, 0, Math.PI * 2); c.stroke();
    // Ten angular, split diamond-cut spokes. Alpha gaps expose the real disc.
    for (let i = 0; i < 10; i++) {
      c.save(); c.rotate(i * Math.PI / 5);
      polygon([[20, -12], [61, -17], [114, -28], [118, -15], [64, -5], [29, 7]], '#313a44');
      polygon([[26, -9], [64, -13], [114, -25], [115, -20], [66, -8], [31, 0]], '#cbd2d7');
      polygon([[34, 5], [73, -1], [119, 0], [118, 6], [75, 5], [39, 12]], '#98a6b1');
      line([[31, -8], [63, -11], [113, -23]], '#eef2f5', 1.5);
      c.restore();
    }
    c.fillStyle = '#343d46'; c.beginPath(); c.arc(0, 0, 29, 0, Math.PI * 2); c.fill();
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * .4; c.fillStyle = '#070a0e';
      c.beginPath(); c.arc(Math.sin(a) * 21, Math.cos(a) * 21, 3.2, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#0a0d12'; c.beginPath(); c.arc(0, 0, 14, 0, Math.PI * 2); c.fill();
    for (let i = 0; i < 4; i++) {
      c.fillStyle = i % 2 ? '#e7eef2' : '#3085c1'; c.beginPath(); c.moveTo(0, 0);
      c.arc(0, 0, 10, i * Math.PI / 2, (i + 1) * Math.PI / 2); c.closePath(); c.fill();
    }
  });
  panel('side', () => {
    // Neutral paint modulation: the configured paint colour remains authoritative.
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 1024, 512);
    const px = (z: number) => (z + 2.553) / 5.106 * 1024;
    const py = (y: number) => (1 - (y - .24) / .72) * 512;
    const crease = c.createLinearGradient(0, py(.70), 0, py(.43));
    crease.addColorStop(0, '#ffffff'); crease.addColorStop(.4, '#ededed'); crease.addColorStop(.75, '#b8b8b8'); crease.addColorStop(1, '#ffffff');
    c.fillStyle = crease; c.fillRect(px(-1.03), py(.70), px(1.22) - px(-1.03), py(.43) - py(.70));
    for (const [z, bottom] of [[-.90, .32], [.44, .29], [1.53, .86]] as const) {
      line([[px(z), py(.952)], [px(z + .015), py(.76)], [px(z + .04), py(bottom)]], '#36393b', 1.15);
      line([[px(z + .009), py(.946)], [px(z + .024), py(.76)], [px(z + .049), py(bottom)]], '#e2e2e2', .7);
    }
    for (const z of [.22, 1.28]) {
      const x = px(z), y = py(.857);
      polygon([[x - 18, y - 7], [x + 16, y - 7], [x + 20, y - 1], [x + 14, y + 6], [x - 17, y + 6]], '#151a20');
      line([[x - 14, y - 5], [x + 14, y - 5]], '#747b81', 1.5);
    }
    line([[px(-1.1), py(.30)], [px(0), py(.325)], [px(1.15), py(.33)]], '#4c5054', 3);
    // Fuel flap and the small rear-quarter character line are texture-only.
    line([[px(1.70), py(.91)], [px(2.00), py(.91)], [px(2.02), py(.77)], [px(1.71), py(.77)], [px(1.70), py(.91)]], '#64696c', 1);
  });
  return texture;
}

export function bmwExteriorUV(geometry: T.BufferGeometry, region: Region,
  project: (x: number, y: number, z: number) => readonly [number, number]): void {
  const p = geometry.getAttribute('position'), uv: number[] = [], [x, y, w, h] = regions[region];
  for (let i = 0; i < p.count; i++) {
    const [u, v] = project(p.getX(i), p.getY(i), p.getZ(i));
    // Half-texel insets avoid neighbouring atlas regions bleeding into edges.
    uv.push((x + .5 + T.MathUtils.clamp(u, 0, 1) * (w - 1)) / 1024,
      1 - (y + .5 + (1 - T.MathUtils.clamp(v, 0, 1)) * (h - 1)) / 1024);
  }
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
}
