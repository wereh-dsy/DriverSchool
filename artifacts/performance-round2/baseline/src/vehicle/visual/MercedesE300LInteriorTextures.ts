import * as T from 'three';
import type { VehicleAssetRegistry } from './VehicleAssetRegistry';

/**
 * Painted interior detail for the V214 cabin. Everything here is one small
 * canvas reused by an existing surface (seat leather, open-pore veneer, vent
 * slot, climate bar, turbine vent, seat switch panel), so the reference cabin's
 * fine detail costs textures rather than extra meshes.
 */
export interface MercedesInteriorTextures {
  readonly seatLeather: T.CanvasTexture;
  readonly doorLeather: T.CanvasTexture;
  readonly wood: T.CanvasTexture;
  readonly ventSlot: T.CanvasTexture;
  readonly climateBar: T.CanvasTexture;
  readonly turbineVent: T.CanvasTexture;
  readonly seatControls: T.CanvasTexture;
}

const HEX = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

function canvas(assets: VehicleAssetRegistry | undefined, key: string, width: number, height: number,
  draw: (context: CanvasRenderingContext2D) => void): T.CanvasTexture {
  const source = assets
    ? assets.canvas(`mercedes-interior/${key}`, width, height, draw)
    : (() => {
      const element = document.createElement('canvas');
      element.width = width; element.height = height;
      const context = element.getContext('2d'); if (context) draw(context);
      return element;
    })();
  const texture = new T.CanvasTexture(source);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Vertical pleats and twin stitching, as on the reference comfort seats. */
function leatherPanel(context: CanvasRenderingContext2D, base: string, pleat: string, stitch: string,
  width: number, height: number, spacing: number): void {
  context.fillStyle = base; context.fillRect(0, 0, width, height);
  const grain = context.createLinearGradient(0, 0, width, height);
  grain.addColorStop(0, 'rgba(255,255,255,.055)'); grain.addColorStop(.5, 'rgba(0,0,0,.03)');
  grain.addColorStop(1, 'rgba(255,255,255,.035)');
  context.fillStyle = grain; context.fillRect(0, 0, width, height);
  for (let x = spacing * .5; x < width; x += spacing) {
    // Soft fold between pleats, then a pair of stitch runs either side.
    const shade = context.createLinearGradient(x - spacing * .5, 0, x + spacing * .5, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(.42, pleat);
    shade.addColorStop(.5, 'rgba(0,0,0,.30)'); shade.addColorStop(.58, pleat);
    shade.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = shade; context.fillRect(x - spacing * .5, 0, spacing, height);
    context.strokeStyle = stitch; context.lineWidth = 1.4; context.setLineDash([4, 3.2]);
    context.beginPath(); context.moveTo(x - 3.4, 0); context.lineTo(x - 3.4, height);
    context.moveTo(x + 3.4, 0); context.lineTo(x + 3.4, height); context.stroke();
    context.setLineDash([]);
  }
}

export function createMercedesInteriorTextures(assets?: VehicleAssetRegistry): MercedesInteriorTextures {
  const seatLeather = canvas(assets, 'seat', 256, 256, c => {
    leatherPanel(c, HEX(0xbf9468), 'rgba(255,246,232,.16)', 'rgba(84,60,36,.55)', 256, 256, 42);
    // Perforated centre panels read as texture at cockpit distance.
    c.globalAlpha = .30;
    for (let y = 12; y < 256; y += 13) for (let x = 12; x < 256; x += 13) {
      c.fillStyle = '#5c4326'; c.beginPath(); c.arc(x, y, 1.7, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;
  });
  const doorLeather = canvas(assets, 'door', 256, 256, c => {
    leatherPanel(c, HEX(0xb6895e), 'rgba(255,246,232,.12)', 'rgba(78,55,32,.5)', 256, 256, 64);
  });
  const wood = canvas(assets, 'wood', 512, 128, c => {
    const base = c.createLinearGradient(0, 0, 0, 128);
    base.addColorStop(0, '#5b3d26'); base.addColorStop(.45, '#4a3020'); base.addColorStop(1, '#3f2a1c');
    c.fillStyle = base; c.fillRect(0, 0, 512, 128);
    // Open-pore grain: long irregular lines with slightly lighter edges.
    for (let i = 0; i < 130; i++) {
      const y = Math.random() * 128, length = 60 + Math.random() * 380, x = Math.random() * 512;
      c.strokeStyle = Math.random() > .45 ? 'rgba(28,16,8,.42)' : 'rgba(160,120,78,.20)';
      c.lineWidth = .6 + Math.random() * 1.5;
      c.beginPath(); c.moveTo(x, y);
      c.bezierCurveTo(x + length * .3, y + (Math.random() - .5) * 7, x + length * .7,
        y + (Math.random() - .5) * 7, x + length, y);
      c.stroke();
    }
    c.fillStyle = 'rgba(0,0,0,.20)'; c.fillRect(0, 0, 512, 3); c.fillRect(0, 125, 512, 3);
  });
  const ventSlot = canvas(assets, 'vent-slot', 512, 32, c => {
    const body = c.createLinearGradient(0, 0, 0, 32);
    body.addColorStop(0, '#15181c'); body.addColorStop(.5, '#04060a'); body.addColorStop(1, '#15181c');
    c.fillStyle = body; c.fillRect(0, 0, 512, 32);
    for (let y = 8; y < 26; y += 5) {
      c.strokeStyle = 'rgba(132,146,160,.55)'; c.lineWidth = 1.1;
      c.beginPath(); c.moveTo(6, y); c.lineTo(506, y); c.stroke();
    }
    c.fillStyle = 'rgba(196,206,214,.55)'; c.fillRect(0, 1, 512, 1.6);
  });
  const climateBar = canvas(assets, 'climate', 512, 64, c => {
    c.fillStyle = '#07090c'; c.fillRect(0, 0, 512, 64);
    c.strokeStyle = '#9aa3ab'; c.lineWidth = 2; c.roundRect(3, 3, 506, 58, 7); c.stroke();
    const icon = (x: number, draw: () => void) => {
      c.save(); c.translate(x, 32); c.strokeStyle = '#c6ced6'; c.fillStyle = '#c6ced6';
      c.lineWidth = 1.7; c.lineCap = 'round'; draw(); c.restore();
    };
    icon(40, () => { c.beginPath(); c.moveTo(-5, 9); c.lineTo(-5, -2); c.lineTo(0, -2); c.lineTo(0, 9); c.stroke();
      c.beginPath(); c.arc(0, -6, 5, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(-1, -8); c.lineTo(2, -8); c.stroke(); });
    icon(88, () => { c.beginPath(); c.moveTo(-6, 9); c.lineTo(-6, -1); c.lineTo(0, -1); c.lineTo(0, 9); c.stroke();
      c.beginPath(); c.moveTo(2, 9); c.lineTo(2, -2); c.lineTo(8, -2); c.lineTo(8, 9); c.stroke();
      c.beginPath(); c.moveTo(-9, -6); c.lineTo(9, -6); c.stroke(); });
    icon(140, () => { for (let i = 0; i < 3; i++) { c.beginPath();
      c.moveTo(-7, -8 + i * 4); c.bezierCurveTo(-2, -10 + i * 4, 2, -6 + i * 4, 7, -8 + i * 4); c.stroke(); } });
    icon(196, () => { c.beginPath(); c.moveTo(0, -10); c.lineTo(1.6, -3); c.lineTo(9, -3); c.lineTo(3, 1.6);
      c.lineTo(5, 9); c.lineTo(0, 4.4); c.lineTo(-5, 9); c.lineTo(-3, 1.6); c.lineTo(-9, -3);
      c.lineTo(-1.6, -3); c.closePath(); c.fill(); });
    icon(252, () => { c.beginPath(); c.moveTo(0, -9); c.lineTo(9, 8); c.lineTo(-9, 8); c.closePath(); c.stroke();
      c.beginPath(); c.moveTo(0, -2); c.lineTo(0, 3); c.stroke(); c.fillRect(-1, 5, 2, 2); });
    icon(316, () => { c.beginPath(); c.arc(0, 0, 8, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(0, -5); c.lineTo(0, 0); c.lineTo(4, 2); c.stroke(); });
    icon(366, () => { c.beginPath(); c.roundRect(-8, -6, 16, 13, 3); c.stroke();
      c.beginPath(); c.moveTo(-4, -2); c.lineTo(4, -2); c.stroke(); });
    icon(420, () => { c.beginPath(); c.arc(0, 1, 7, Math.PI * .15, Math.PI * 2.1); c.stroke();
      c.beginPath(); c.moveTo(-2, -4); c.lineTo(0, 4); c.lineTo(2, -4); c.stroke(); });
    icon(474, () => { for (let i = -1; i <= 1; i++) { c.beginPath();
      c.moveTo(i * 6 - 2, -8); c.quadraticCurveTo(i * 6 + 2, 0, i * 6 - 2, 8); c.stroke(); } });
  });
  const turbineVent = canvas(assets, 'turbine', 128, 128, c => {
    c.fillStyle = '#05070a'; c.fillRect(0, 0, 128, 128);
    c.translate(64, 64);
    c.strokeStyle = '#8f989f'; c.lineWidth = 3;
    c.beginPath(); c.arc(0, 0, 54, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 18; i++) {
      c.save(); c.rotate(i * Math.PI * 2 / 18);
      c.fillStyle = i % 2 ? '#3a444d' : '#20272e';
      c.beginPath(); c.moveTo(14, -3.2); c.lineTo(50, -5.4); c.lineTo(50, 5.4); c.lineTo(14, 3.2);
      c.closePath(); c.fill();
      c.restore();
    }
    c.fillStyle = '#0b0f13'; c.beginPath(); c.arc(0, 0, 15, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#b9c2c9'; c.lineWidth = 2.4; c.beginPath(); c.arc(0, 0, 15, 0, Math.PI * 2); c.stroke();
  });
  const seatControls = canvas(assets, 'seat-switch', 128, 96, c => {
    const body = c.createLinearGradient(0, 0, 0, 96);
    body.addColorStop(0, '#b9c1c8'); body.addColorStop(.5, '#8d959c'); body.addColorStop(1, '#aeb6bd');
    c.fillStyle = body; c.fillRect(0, 0, 128, 96);
    c.strokeStyle = '#5e666d'; c.lineWidth = 2; c.roundRect(6, 6, 116, 84, 8); c.stroke();
    // Seat-back outline as on the door-mounted memory/comfort keys.
    c.strokeStyle = '#3d444a'; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(38, 22); c.lineTo(58, 22); c.lineTo(52, 62); c.lineTo(32, 62); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(22, 66); c.lineTo(80, 66); c.stroke();
    c.fillStyle = '#3d444a';
    for (const [x, y] of [[92, 24], [92, 44], [92, 64]] as const) { c.beginPath(); c.arc(x, y, 4.2, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#4a5258'; c.fillRect(96, 76, 20, 5);
  });
  for (const texture of [seatLeather, doorLeather, wood, ventSlot, climateBar, turbineVent, seatControls]) {
    texture.needsUpdate = true;
  }
  return { seatLeather, doorLeather, wood, ventSlot, climateBar, turbineVent, seatControls };
}
