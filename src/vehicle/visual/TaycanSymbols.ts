import type { VehicleAssetRegistry } from './VehicleAssetRegistry';
import { text, TAYCAN_COLORS as C } from './TaycanDisplaySurface';

export type TaycanSymbol = 'home' | 'navigation' | 'media' | 'vehicle' | 'parking' | 'lights' | 'high-beam' | 'fog' | 'lane' | 'esc' | 'battery' | 'suspension' | 'defog' | 'fan';
const SYMBOLS: TaycanSymbol[] = ['home', 'navigation', 'media', 'vehicle', 'parking', 'lights', 'high-beam', 'fog', 'lane', 'esc', 'battery', 'suspension', 'defog', 'fan'];
/** One immutable atlas shared by the game asset registry, never a canvas per icon. */
export function taycanSymbolAtlas(assets: VehicleAssetRegistry): HTMLCanvasElement {
  return assets.canvas('taycan-symbol-atlas-v1', 64 * SYMBOLS.length, 64, c => {
    for (let i = 0; i < SYMBOLS.length; i++) { c.save(); c.translate(i * 64, 0); drawSymbol(c, SYMBOLS[i]!, C.white); c.restore(); }
  });
}
export function drawTaycanSymbol(c: CanvasRenderingContext2D, atlas: HTMLCanvasElement, symbol: TaycanSymbol, x: number, y: number, size = 32): void {
  c.drawImage(atlas, SYMBOLS.indexOf(symbol) * 64, 0, 64, 64, x - size / 2, y - size / 2, size, size);
}
export function drawSymbol(c: CanvasRenderingContext2D, s: TaycanSymbol, color: string): void {
  c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 2.3; c.lineCap = 'round'; c.lineJoin = 'round';
  const path = (points: number[]) => { c.beginPath(); points.forEach((v, i) => { if (i % 2 === 0) i ? c.lineTo(v, points[i + 1]!) : c.moveTo(v, points[1]!); }); c.stroke(); };
  if (s === 'home') { path([13, 31, 32, 15, 51, 31]); path([18, 29, 18, 50, 46, 50, 46, 29]); }
  else if (s === 'navigation') { c.beginPath(); c.moveTo(32, 13); c.lineTo(47, 50); c.lineTo(32, 42); c.lineTo(17, 50); c.closePath(); c.stroke(); }
  else if (s === 'media') { path([25, 43, 25, 18, 47, 14, 47, 39]); c.beginPath(); c.ellipse(18, 44, 7, 5, 0, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.ellipse(40, 40, 7, 5, 0, 0, Math.PI * 2); c.stroke(); }
  else if (s === 'vehicle' || s === 'esc') { path([11, 40, 15, 31, 25, 27, 42, 27, 50, 34, 54, 35, 54, 42, 11, 42]); c.beginPath(); c.arc(21, 43, 4, 0, Math.PI * 2); c.arc(44, 43, 4, 0, Math.PI * 2); c.stroke(); if (s === 'esc') path([17, 51, 23, 54, 17, 57, 39, 51, 45, 54, 39, 57]); }
  else if (s === 'parking') { c.beginPath(); c.arc(32, 32, 21, 0, Math.PI * 2); c.stroke(); text(c, 'P', 32, 34, 30, color, 'center', 500); }
  else if (s === 'lane') { path([16, 50, 24, 14]); path([48, 50, 40, 14]); c.strokeRect(28, 32, 8, 14); }
  else if (s === 'battery') { c.strokeRect(19, 15, 26, 37); c.strokeRect(27, 10, 10, 5); path([31, 23, 27, 34, 37, 34, 33, 44]); }
  else if (s === 'suspension') { path([26, 12, 38, 12, 26, 20, 38, 28, 26, 36, 38, 44, 26, 52, 38, 52]); }
  else if (s === 'defog') { c.beginPath(); c.moveTo(12, 47); c.lineTo(18, 20); c.quadraticCurveTo(32, 14, 46, 20); c.lineTo(52, 47); c.closePath(); c.stroke(); for (const x of [24, 32, 40]) path([x, 41, x, 24, x - 3, 29]); }
  else if (s === 'fan') { c.beginPath(); c.arc(32, 32, 4, 0, Math.PI * 2); c.stroke(); for (let a = 0; a < 4; a++) { c.save(); c.translate(32, 32); c.rotate(a * Math.PI / 2); c.beginPath(); c.ellipse(0, -12, 6, 12, -.3, 0, Math.PI * 2); c.stroke(); c.restore(); } }
  else { c.beginPath(); c.ellipse(39, 32, 11, 15, 0, Math.PI / 2, Math.PI * 1.5); c.lineTo(39, 47); c.stroke(); for (let y = 21; y <= 43; y += 7) path([12, y + (s === 'lights' ? 6 : 0), 26, y]); if (s === 'fog') path([20, 17, 17, 29, 22, 37, 19, 49]); }
}

/** Clean fastback plan view, distinct from the Tesla scene renderer. */
export function drawTaycanPlan(c: CanvasRenderingContext2D, x: number, y: number, scale = 1): void {
  c.save(); c.translate(x, y); c.scale(scale, scale);
  c.lineWidth = 1.5; c.strokeStyle = '#a4adb5'; c.fillStyle = '#30373d';
  c.beginPath(); c.moveTo(-20, -58); c.quadraticCurveTo(0, -70, 20, -58); c.quadraticCurveTo(29, -24, 25, 39);
  c.quadraticCurveTo(24, 59, 16, 62); c.lineTo(-16, 62); c.quadraticCurveTo(-29, 57, -25, 39); c.quadraticCurveTo(-29, -24, -20, -58); c.fill(); c.stroke();
  c.fillStyle = '#11171c'; c.beginPath(); c.moveTo(-18, -24); c.lineTo(18, -24); c.lineTo(20, 27); c.lineTo(-20, 27); c.closePath(); c.fill();
  c.strokeStyle = '#bbc8ce'; c.beginPath(); c.moveTo(-17, -25); c.lineTo(17, -25); c.stroke();
  c.strokeStyle = '#a85956'; c.beginPath(); c.moveTo(-18, 52); c.lineTo(18, 52); c.stroke(); c.restore();
}
