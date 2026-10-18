import * as T from 'three';

const REGIONS = {
  grille: [0, 0, 512, 256], head: [512, 0, 512, 256],
  tail: [0, 256, 512, 256], wheel: [512, 256, 256, 256],
  intake: [768, 256, 256, 256], side: [0, 512, 1024, 512],
} as const;
export type MercedesAtlasRegion = keyof typeof REGIONS;

/** Painted-modulation masks, fine grille slats and multi-spoke wheel faces. */
export function createMercedesE300LAtlas(): T.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
  const texture = new T.CanvasTexture(canvas);
  texture.name = 'Mercedes-Benz E 300 L static exterior details 1024';
  texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4;
  const c = canvas.getContext('2d'); if (!c) return texture;
  const line = (points: readonly (readonly [number, number])[], color: string, width: number) => {
    c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.strokeStyle = color; c.lineWidth = width; c.stroke();
  };
  const shape = (points: readonly (readonly [number, number])[], color: string) => {
    c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.closePath(); c.fillStyle = color; c.fill();
  };
  const panel = (region: MercedesAtlasRegion, draw: () => void) => {
    const [x, y, w, h] = REGIONS[region]; c.save(); c.translate(x, y);
    c.beginPath(); c.rect(0, 0, w, h); c.clip(); draw(); c.restore();
  };
  panel('grille', () => {
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#1a1e22'); g.addColorStop(.45, '#070a0d'); g.addColorStop(1, '#030507');
    c.fillStyle = g; c.fillRect(0, 0, 512, 256);
    // Horizontal slats are the recessed texture behind the modelled chrome bars.
    for (let y = 16; y < 256; y += 21) {
      line([[0, y], [512, y]], '#39424a', 3);
      line([[0, y + 3], [512, y + 3]], '#0a0e12', 6);
    }
    for (let x = 24; x < 512; x += 42) line([[x, 0], [x - 10, 256]], '#151a1f', 2);
  });
  panel('head', () => {
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#5d6c79'); g.addColorStop(.10, '#141d25'); g.addColorStop(.55, '#05090e'); g.addColorStop(1, '#1d2731');
    c.fillStyle = g; c.fillRect(0, 0, 512, 256);
    // Digital-Light style projector prints: two dark barrels with bright rims.
    for (const x of [148, 316]) {
      c.fillStyle = '#2c3742'; c.beginPath(); c.roundRect(x - 52, 74, 104, 96, 14); c.fill();
      c.fillStyle = '#060a0e'; c.beginPath(); c.roundRect(x - 44, 82, 88, 78, 10); c.fill();
      line([[x - 40, 92], [x + 40, 92]], '#8f9fac', 3);
      for (let i = 0; i < 4; i++) line([[x - 36 + i * 24, 108], [x - 40 + i * 24, 152]], '#3a4a58', 3);
    }
    line([[0, 26], [512, 26]], '#8b98a4', 2);
    for (let x = 20; x < 512; x += 34) line([[x, 6], [x + 6, 22]], '#2c3841', 2);
  });
  panel('tail', () => {
    c.fillStyle = '#0d0508'; c.fillRect(0, 0, 512, 256);
    for (const y of [64, 150]) {
      line([[0, y], [512, y - 6]], '#6d1f28', 16);
      line([[0, y - 4], [512, y - 10]], '#b1484f', 3);
      for (let x = 10; x < 512; x += 22) line([[x, y - 8], [x - 6, y + 8]], '#380f16', 2);
    }
    line([[0, 108], [512, 102]], '#7d858c', 5);
  });
  panel('wheel', () => {
    c.clearRect(0, 0, 256, 256); c.translate(128, 128);
    // Twenty slender luxury spokes in five paired groups, alpha gaps between.
    for (let i = 0; i < 10; i++) {
      c.save(); c.rotate(i * Math.PI / 5);
      for (const offset of [-0.10, 0.10]) {
        c.save(); c.rotate(offset);
        shape([[16, -4.4], [58, -6.6], [118, -8.4], [118, -3.0], [58, -1.6], [16, 1.4]], '#c9d1d6');
        line([[20, -3.4], [60, -5.0], [116, -6.6]], '#f2f6f8', 1.4);
        c.restore();
      }
      c.restore();
    }
    c.strokeStyle = '#aab4bb'; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, 122, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#2f3941'; c.beginPath(); c.arc(0, 0, 32, 0, Math.PI * 2); c.fill();
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * .4; c.fillStyle = '#070a0d';
      c.beginPath(); c.arc(Math.sin(a) * 23, Math.cos(a) * 23, 3.4, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#0b0e12'; c.beginPath(); c.arc(0, 0, 17, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#c3ccd2'; c.beginPath(); c.arc(0, 0, 11, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#12171c';
    c.beginPath();
    for (let i = 0; i < 3; i++) {
      const tip = Math.PI / 2 + i * Math.PI * 2 / 3, valley = tip + Math.PI / 3;
      c.lineTo(Math.cos(tip) * 9, Math.sin(tip) * 9);
      c.lineTo(Math.cos(valley) * 2.4, Math.sin(valley) * 2.4);
    }
    c.closePath(); c.fill();
  });
  panel('intake', () => {
    c.fillStyle = '#04070a'; c.fillRect(0, 0, 256, 256);
    for (let y = 26; y < 256; y += 44) {
      line([[0, y], [256, y]], '#232c33', 4);
      line([[0, y + 5], [256, y + 5]], '#080d12', 8);
    }
    for (let x = 14; x < 256; x += 32) line([[x, 0], [x - 10, 256]], '#141a20', 3);
  });
  panel('side', () => {
    // Neutral paint modulation only: the configured paint colour stays authoritative.
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 1024, 512);
    const px = (z: number) => (z + 2.546) / 5.092 * 1024;
    const py = (y: number) => (1 - (y - .24) / .72) * 512;
    const fall = c.createLinearGradient(0, py(.72), 0, py(.30));
    fall.addColorStop(0, '#ffffff'); fall.addColorStop(.42, '#eeeef0');
    fall.addColorStop(.78, '#b9bbbd'); fall.addColorStop(1, '#ffffff');
    c.fillStyle = fall; c.fillRect(0, py(.72), 1024, py(.30) - py(.72));
    // Four door shut lines plus the front wing/front door break.
    for (const [z, top, bottom] of [[-1.075, .945, .245], [.430, .952, .245], [1.230, .950, .245], [1.960, .946, .300]] as const) {
      line([[px(z), py(top)], [px(z + .012), py(.760)], [px(z + .030), py(bottom)]], '#2c3136', 1.2);
      line([[px(z + .008), py(top)], [px(z + .020), py(.760)], [px(z + .038), py(bottom)]], '#e4e6e8', .8);
    }
    // Flush (half-concealed) door handles sit just under the shoulder line.
    for (const z of [-.700, .800]) {
      const x = px(z), y = py(.885);
      shape([[x - 26, y - 6], [x + 22, y - 6], [x + 26, y], [x + 20, y + 6], [x - 25, y + 6]], '#171c22');
      line([[x - 22, y - 4], [x + 20, y - 4]], '#8d949a', 1.6);
    }
    // Restrained shoulder crease above a fuller lower body side.
    line([[px(-2.30), py(.600)], [px(-1.10), py(.612)], [px(.30), py(.618)], [px(1.55), py(.626)], [px(2.30), py(.640)]], '#4d5155', 2.4);
    line([[px(-2.30), py(.596)], [px(-1.10), py(.608)], [px(.30), py(.614)], [px(1.55), py(.622)], [px(2.30), py(.636)]], '#d6d8da', .9);
    line([[px(-1.05), py(.335)], [px(0), py(.345)], [px(1.15), py(.352)]], '#484c50', 3);
    // Fuel filler flap on the right rear quarter is texture-only here.
    line([[px(1.62), py(.885)], [px(1.90), py(.885)], [px(1.92), py(.760)], [px(1.63), py(.760)], [px(1.62), py(.885)]], '#5e6367', 1);
  });
  return texture;
}

export function mercedesExteriorUV(geometry: T.BufferGeometry, region: MercedesAtlasRegion,
  project: (x: number, y: number, z: number) => readonly [number, number]): void {
  const position = geometry.getAttribute('position'), uv: number[] = [];
  const [x, y, w, h] = REGIONS[region];
  for (let i = 0; i < position.count; i++) {
    const [u, v] = project(position.getX(i), position.getY(i), position.getZ(i));
    // Half-texel insets stop neighbouring atlas regions bleeding into edges.
    uv.push((x + .5 + T.MathUtils.clamp(u, 0, 1) * (w - 1)) / 1024,
      1 - (y + .5 + (1 - T.MathUtils.clamp(v, 0, 1)) * (h - 1)) / 1024);
  }
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
}
