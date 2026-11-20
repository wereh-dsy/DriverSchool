import * as T from 'three';
import type { InstrumentTelemetry } from './InstrumentCluster';
import { activeNavigation, drawNavigationBanner } from '../../ui/NavigationDisplay';

interface ThemePalette {
  readonly dark: boolean;
  readonly bg: string;
  readonly bgSubtle: string;
  readonly card: string;
  readonly cardElevated: string;
  readonly border: string;
  readonly divider: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly dockBg: string;
  readonly barTrack: string;
  readonly electric: string;
  readonly electricSoft: string;
  readonly hybrid: string;
  readonly hybridSoft: string;
  readonly inactivePath: string;
}

const DARK_THEME: ThemePalette = {
  dark: true,
  bg: '#0c0f14',
  bgSubtle: '#11151c',
  card: '#181c24',
  cardElevated: '#202631',
  border: 'rgba(255, 255, 255, 0.08)',
  divider: 'rgba(255, 255, 255, 0.09)',
  textPrimary: '#f2f4f7',
  textSecondary: '#a4aebc',
  textMuted: '#636d7c',
  dockBg: '#12161d',
  barTrack: '#262d38',
  electric: '#22b573',
  electricSoft: 'rgba(34, 181, 115, 0.16)',
  hybrid: '#e38b24',
  hybridSoft: 'rgba(227, 139, 36, 0.16)',
  inactivePath: '#323a46',
};

const LIGHT_THEME: ThemePalette = {
  dark: false,
  bg: '#edf0f5',
  bgSubtle: '#e4e8ef',
  card: '#ffffff',
  cardElevated: '#f4f6f9',
  border: 'rgba(18, 28, 42, 0.08)',
  divider: 'rgba(18, 28, 42, 0.09)',
  textPrimary: '#141923',
  textSecondary: '#586475',
  textMuted: '#8d97a6',
  dockBg: '#f8f9fb',
  barTrack: '#dce2ea',
  electric: '#199d62',
  electricSoft: 'rgba(25, 157, 98, 0.12)',
  hybrid: '#d97a16',
  hybridSoft: 'rgba(217, 122, 22, 0.13)',
  inactivePath: '#cfd6e0',
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function drawLightingTelltale(
  ctx: CanvasRenderingContext2D,
  kind: 'position' | 'lowBeam' | 'highBeam' | 'frontFog' | 'rearFog',
  cx: number,
  cy: number,
  scale = 1,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.0;

  if (kind === 'position') {
    ctx.strokeStyle = '#32e078';
    // Twin back-to-back clearance lamps
    ctx.beginPath();
    ctx.arc(-3, 0, 5.5, Math.PI * 0.5, Math.PI * 1.5);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(3, 0, 5.5, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.closePath();
    ctx.stroke();
    for (const dy of [-4.2, 0, 4.2]) {
      ctx.beginPath(); ctx.moveTo(-11.5, dy * 1.15); ctx.lineTo(-15.5, dy * 1.35); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(11.5, dy * 1.15); ctx.lineTo(15.5, dy * 1.35); ctx.stroke();
    }
  } else if (kind === 'lowBeam') {
    ctx.strokeStyle = '#32e078';
    // D-shaped lamp body on right, 4 downward-slanted rays on left
    ctx.beginPath();
    ctx.moveTo(2, -7.5);
    ctx.quadraticCurveTo(12, -7, 12, 0);
    ctx.quadraticCurveTo(12, 7, 2, 7.5);
    ctx.closePath();
    ctx.stroke();
    for (const dy of [-5.5, -1.8, 1.9, 5.6]) {
      ctx.beginPath(); ctx.moveTo(-1.5, dy); ctx.lineTo(-11.5, dy + 3.2); ctx.stroke();
    }
  } else if (kind === 'highBeam') {
    ctx.strokeStyle = '#3c96ff';
    // D-shaped lamp body on right, 4 horizontal rays on left (ISO blue)
    ctx.beginPath();
    ctx.moveTo(2, -7.5);
    ctx.quadraticCurveTo(12, -7, 12, 0);
    ctx.quadraticCurveTo(12, 7, 2, 7.5);
    ctx.closePath();
    ctx.stroke();
    for (const dy of [-5.4, -1.8, 1.8, 5.4]) {
      ctx.beginPath(); ctx.moveTo(-1.5, dy); ctx.lineTo(-12.5, dy); ctx.stroke();
    }
  } else if (kind === 'frontFog') {
    ctx.strokeStyle = '#32e078';
    ctx.beginPath();
    ctx.moveTo(2.5, -7.5);
    ctx.quadraticCurveTo(12, -7, 12, 0);
    ctx.quadraticCurveTo(12, 7, 2.5, 7.5);
    ctx.closePath();
    ctx.stroke();
    for (const dy of [-4.5, 0, 4.5]) {
      ctx.beginPath(); ctx.moveTo(-1, dy); ctx.lineTo(-12, dy + 3.0); ctx.stroke();
    }
    // Vertical wavy fog line crossing rays
    ctx.beginPath();
    ctx.moveTo(-6.5, -7.5);
    ctx.quadraticCurveTo(-4, -3.8, -6.5, 0);
    ctx.quadraticCurveTo(-9, 3.8, -6.5, 7.5);
    ctx.stroke();
  } else {
    // Rear fog (ISO amber/orange, facing right)
    ctx.strokeStyle = '#f5a828';
    ctx.beginPath();
    ctx.moveTo(-2.5, -7.5);
    ctx.quadraticCurveTo(-12, -7, -12, 0);
    ctx.quadraticCurveTo(-12, 7, -2.5, 7.5);
    ctx.closePath();
    ctx.stroke();
    for (const dy of [-4.5, 0, 4.5]) {
      ctx.beginPath(); ctx.moveTo(1, dy); ctx.lineTo(12, dy); ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(6.5, -7.5);
    ctx.quadraticCurveTo(9, -3.8, 6.5, 0);
    ctx.quadraticCurveTo(4, 3.8, 6.5, 7.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawText(
  ctx: CanvasRenderingContext2D,
  s: string, x: number, y: number, size: number, color: string,
  weight = 'normal', align: CanvasTextAlign = 'left',
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "Segoe UI", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = align;
  ctx.fillText(s, x, y);
  ctx.restore();
}

// ── Authentic BYD 8.8" Cluster Chamfered 7-Segment LCD Digit Renderer ───────
// Segment bitmask: a=top, b=top-right, c=bot-right, d=bot, e=bot-left, f=top-left, g=mid
const SEG_MAP: Record<string, number> = {
  '0': 0b0111111, '1': 0b0000110, '2': 0b1011011, '3': 0b1001111,
  '4': 0b1100110, '5': 0b1101101, '6': 0b1111101, '7': 0b0000111,
  '8': 0b1111111, '9': 0b1101111, '-': 0b1000000,
  'P': 0b1110011, 'N': 0b0110111, 'D': 0b0111111, 'R': 0b1110111,
};

function drawChamferBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, horizontal: boolean): void {
  const c = Math.min(w, h) * .45;
  ctx.beginPath();
  if (horizontal) {
    ctx.moveTo(x + c, y); ctx.lineTo(x + w - c, y);
    ctx.lineTo(x + w, y + h / 2); ctx.lineTo(x + w - c, y + h);
    ctx.lineTo(x + c, y + h); ctx.lineTo(x, y + h / 2);
  } else {
    ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + c);
    ctx.lineTo(x + w, y + h - c); ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x, y + h - c); ctx.lineTo(x, y + c);
  }
  ctx.closePath();
  ctx.fill();
}

function drawSevenSegString(
  ctx: CanvasRenderingContext2D,
  str: string,
  cx: number,
  cy: number,
  digitH: number,
  color: string,
  align: 'center' | 'left' | 'right' = 'center',
  slant = 0,
): void {
  const digitW = digitH * .64;
  const thick = Math.max(2.6, digitH * .145);
  const gap = Math.max(1.2, digitH * .045);
  const spacing = digitW + digitH * .18;
  const chars = [...str];
  let totalW = 0;
  for (const ch of chars) totalW += ch === ':' ? digitH * .24 : spacing;
  totalW -= digitH * .18;

  let curX = align === 'center' ? cx - totalW / 2 : align === 'right' ? cx - totalW : cx;
  const topY = cy - digitH / 2;

  ctx.save();
  ctx.fillStyle = color;
  if (slant) { ctx.translate(cx, cy); ctx.transform(1, 0, slant, 1, 0, 0); ctx.translate(-cx, -cy); }

  for (const ch of chars) {
    if (ch === ':') {
      const r = thick * .55;
      ctx.beginPath();
      ctx.arc(curX + digitH * .08, cy - digitH * .20, r, 0, Math.PI * 2);
      ctx.arc(curX + digitH * .08, cy + digitH * .20, r, 0, Math.PI * 2);
      ctx.fill();
      curX += digitH * .24;
      continue;
    }
    const mask = SEG_MAP[ch] ?? 0;
    const hw = digitW - thick - gap * 2;
    const vh = (digitH - thick * 1.5 - gap * 4) / 2;
    const x0 = curX;
    // a: top
    if (mask & 0b0000001) drawChamferBar(ctx, x0 + thick / 2 + gap, topY, hw, thick, true);
    // b: top-right
    if (mask & 0b0000010) drawChamferBar(ctx, x0 + digitW - thick, topY + thick / 2 + gap, thick, vh, false);
    // c: bot-right
    if (mask & 0b0000100) drawChamferBar(ctx, x0 + digitW - thick, cy + gap, thick, vh, false);
    // d: bottom
    if (mask & 0b0001000) drawChamferBar(ctx, x0 + thick / 2 + gap, topY + digitH - thick, hw, thick, true);
    // e: bot-left
    if (mask & 0b0010000) drawChamferBar(ctx, x0, cy + gap, thick, vh, false);
    // f: top-left
    if (mask & 0b0100000) drawChamferBar(ctx, x0, topY + thick / 2 + gap, thick, vh, false);
    // g: middle
    if (mask & 0b1000000) drawChamferBar(ctx, x0 + thick / 2 + gap, cy - thick / 2, hw, thick, true);
    curX += spacing;
  }
  ctx.restore();
}

/** Replicates the real 2026 Qin PLUS DM-i 8.8" cluster central top-down energy-flow car (photo #2). */
function drawClusterTopDownCar(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  soc: number,
  engineOn: boolean,
  generation: boolean,
  motorActive: boolean,
  regen: boolean,
  directDrive: boolean,
  phase: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);

  // Subtle dark grey city-bar reflection silhouette directly above roof (as seen in photo #2)
  ctx.fillStyle = 'rgba(130, 158, 185, 0.14)';
  const bars = [-58, -46, -34, -22, -8, 12, 24, 34, 48];
  const heights = [10, 16, 8, 12, 6, 14, 18, 9, 11];
  bars.forEach((bx, i) => ctx.fillRect(bx, -68 - heights[i]!, 5, heights[i]!));
  ctx.fillStyle = 'rgba(130, 158, 185, 0.16)';
  ctx.fillRect(-74, -68, 148, 1);

  // 4 metallic silver-blue rounded tyres (matching photo #2!)
  for (const [wx, wy] of [[-78, -44], [-78, 44], [74, -44], [74, 44]] as const) {
    const tg = ctx.createLinearGradient(wx - 22, wy - 7, wx + 22, wy + 7);
    tg.addColorStop(0, '#5a7284'); tg.addColorStop(0.5, '#a8c2d4'); tg.addColorStop(1, '#587082');
    ctx.fillStyle = tg;
    roundRect(ctx, wx - 22, wy - 7.5, 44, 15, 6); ctx.fill();
  }

  // Dark glossy top-down sedan body shell (exact proportions of photo #2)
  const shell = ctx.createLinearGradient(0, -48, 0, 48);
  shell.addColorStop(0, '#1e2730');
  shell.addColorStop(0.5, '#0b1016');
  shell.addColorStop(1, '#1d262f');
  ctx.fillStyle = shell;
  ctx.beginPath();
  ctx.moveTo(-132, -24);
  ctx.quadraticCurveTo(-139, 0, -132, 24);
  ctx.quadraticCurveTo(-120, 46, -88, 48);
  ctx.lineTo(94, 47);
  ctx.quadraticCurveTo(122, 43, 130, 24);
  ctx.quadraticCurveTo(136, 0, 130, -24);
  ctx.quadraticCurveTo(122, -43, 94, -47);
  ctx.lineTo(-88, -48);
  ctx.quadraticCurveTo(-120, -46, -132, -24);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(138, 162, 182, 0.42)'; ctx.lineWidth = 1.4; ctx.stroke();

  // Side mirrors
  ctx.fillStyle = '#24303a';
  roundRect(ctx, -56, -54, 11, 7, 2); ctx.fill();
  roundRect(ctx, -56, 47, 11, 7, 2); ctx.fill();

  // Subtle animated energy lines inside the mini cluster car
  const drawMiniFlow = (x0: number, y0: number, x1: number, y1: number, active: boolean, color: string) => {
    if (!active) return;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.setLineDash([7, 6]); ctx.lineDashOffset = -((phase * 38) % 13);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.restore();
  };
  const batActive = motorActive || generation;
  if (regen || (generation && !motorActive)) {
    drawMiniFlow(-72, 0, -18, 0, batActive, generation && !motorActive ? '#e89830' : '#40d884');
  } else {
    drawMiniFlow(-18, 0, -72, 0, batActive, '#5ca8f8');
  }
  drawMiniFlow(-106, 0, -82, 0, engineOn && (generation || directDrive), '#e89830');
  if (motorActive || directDrive) {
    const wc = regen ? '#40d884' : directDrive && !motorActive ? '#e89830' : '#5ca8f8';
    drawMiniFlow(-78, regen ? -36 : -14, -78, regen ? -14 : -36, true, wc);
    drawMiniFlow(-78, regen ? 36 : 14, -78, regen ? 14 : 36, true, wc);
  }

  // 1. Engine icon (front-left inside nose, silver-ice-blue idle / warm amber active)
  ctx.fillStyle = engineOn ? '#f0a642' : '#9bb5ca';
  roundRect(ctx, -118, -12, 18, 24, 4); ctx.fill();
  ctx.fillStyle = '#0c1218';
  ctx.fillRect(-114, -7, 10, 3); ctx.fillRect(-114, 0, 10, 3); ctx.fillRect(-114, 6, 10, 3);

  // 2. Front Electric Drive Unit cylinder (right behind engine, as in photo #2)
  ctx.fillStyle = motorActive ? (regen ? '#4ae08c' : '#80c2ff') : '#9eb8cc';
  roundRect(ctx, -84, -14, 12, 28, 4); ctx.fill();

  // 3. Center Battery Pack (exact horizontal block with cyan-blue vertical segments from photo #2!)
  const bx = -16, by = -17, bw = 68, bh = 34;
  roundRect(ctx, bx, by, bw, bh, 4);
  ctx.fillStyle = '#364452'; ctx.fill();
  const segs = 10;
  const filled = Math.round(segs * soc);
  const sw = (bw - 8) / segs;
  for (let i = 0; i < filled; i++) {
    ctx.fillStyle = soc > .22 ? '#78b8d4' : '#e69432';
    ctx.fillRect(bx + 4 + i * sw + 1, by + 3.5, sw - 2, bh - 7);
  }
  ctx.restore();
}

/** Realistic solid-shaded top-down BYD Qin PLUS DM-i energy-flow car for 10.1" DiLink center screen. */
function drawOemEnergyFlowCar(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  th: ThemePalette,
  soc: number,
  engineOn: boolean,
  generation: boolean,
  motorActive: boolean,
  regen: boolean,
  directDrive: boolean,
  phase: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);

  const groundShadow = ctx.createRadialGradient(0, 4, 24, 0, 4, 210);
  groundShadow.addColorStop(0, th.dark ? 'rgba(0, 0, 0, 0.55)' : 'rgba(20, 32, 48, 0.14)');
  groundShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = groundShadow;
  ctx.beginPath(); ctx.ellipse(0, 6, 212, 108, 0, 0, Math.PI * 2); ctx.fill();

  for (const [wx, wy] of [[-126, -82], [-126, 82], [120, -82], [120, 82]] as const) {
    ctx.fillStyle = th.dark ? '#1b2028' : '#2b323b';
    roundRect(ctx, wx - 27, wy - 12, 54, 24, 6); ctx.fill();
    ctx.strokeStyle = th.dark ? '#38414e' : '#586270'; ctx.lineWidth = 1.2; ctx.stroke();
  }

  const bodyGrad = ctx.createLinearGradient(0, -88, 0, 88);
  if (th.dark) {
    bodyGrad.addColorStop(0, 'rgba(138, 152, 162, 0.34)');
    bodyGrad.addColorStop(0.5, 'rgba(92, 106, 116, 0.24)');
    bodyGrad.addColorStop(1, 'rgba(54, 64, 74, 0.36)');
  } else {
    bodyGrad.addColorStop(0, 'rgba(196, 206, 214, 0.65)');
    bodyGrad.addColorStop(0.5, 'rgba(222, 229, 236, 0.52)');
    bodyGrad.addColorStop(1, 'rgba(176, 188, 198, 0.65)');
  }
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.moveTo(-204, -40);
  ctx.quadraticCurveTo(-212, 0, -204, 40);
  ctx.quadraticCurveTo(-188, 82, -144, 86);
  ctx.lineTo(146, 84);
  ctx.quadraticCurveTo(190, 78, 202, 42);
  ctx.quadraticCurveTo(208, 0, 202, -42);
  ctx.quadraticCurveTo(190, -78, 146, -84);
  ctx.lineTo(-144, -86);
  ctx.quadraticCurveTo(-188, -82, -204, -40);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = th.dark ? 'rgba(200, 212, 222, 0.28)' : 'rgba(84, 98, 114, 0.32)';
  ctx.lineWidth = 1.6; ctx.stroke();

  ctx.fillStyle = th.dark ? 'rgba(16, 22, 30, 0.36)' : 'rgba(65, 80, 96, 0.14)';
  ctx.beginPath();
  ctx.moveTo(-76, -58); ctx.quadraticCurveTo(-48, -64, 72, -58);
  ctx.lineTo(116, -50); ctx.quadraticCurveTo(128, 0, 116, 50);
  ctx.lineTo(72, 58); ctx.quadraticCurveTo(-48, 64, -76, 58);
  ctx.quadraticCurveTo(-92, 0, -76, -58);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = th.dark ? 'rgba(120, 134, 146, 0.36)' : 'rgba(140, 152, 166, 0.45)';
  roundRect(ctx, -82, -97, 17, 11, 3); ctx.fill();
  roundRect(ctx, -82, 86, 17, 11, 3); ctx.fill();

  ctx.fillStyle = th.dark ? 'rgba(235, 242, 250, 0.55)' : 'rgba(100, 116, 134, 0.45)';
  roundRect(ctx, -203, -64, 8, 20, 3); ctx.fill();
  roundRect(ctx, -203, 44, 8, 20, 3); ctx.fill();
  ctx.fillStyle = 'rgba(205, 42, 54, 0.72)';
  roundRect(ctx, 197, -46, 5, 92, 2.5); ctx.fill();

  const drawChevronFlow = (x0: number, y0: number, x1: number, y1: number, active: boolean, color: string) => {
    ctx.save();
    ctx.strokeStyle = active ? color : th.inactivePath;
    ctx.globalAlpha = active ? 0.30 : 0.65;
    ctx.lineWidth = active ? 6 : 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();

    if (active) {
      ctx.globalAlpha = 0.96;
      const dx = x1 - x0, dy = y1 - y0;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const spacing = 22;
      const offset = (phase * 48) % spacing;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let d = offset; d < dist - 4; d += spacing) {
        const px = x0 + (dx / dist) * d;
        const py = y0 + (dy / dist) * d;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(-4.5, -5); ctx.lineTo(2, 0); ctx.lineTo(-4.5, 5);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  };

  const batActive = motorActive || generation;
  const batColor = generation && !motorActive ? th.hybrid : th.electric;
  if (regen || (generation && !motorActive)) {
    drawChevronFlow(-104, 0, -34, 0, batActive, batColor);
  } else {
    drawChevronFlow(-34, 0, -104, 0, batActive, th.electric);
  }
  drawChevronFlow(-160, -34, -126, -12, engineOn && (generation || directDrive), th.hybrid);

  const wheelFlowActive = motorActive || directDrive;
  const wheelColor = regen ? th.electric : directDrive && !motorActive ? th.hybrid : th.electric;
  if (regen) {
    drawChevronFlow(-126, -70, -126, -22, wheelFlowActive, wheelColor);
    drawChevronFlow(-126, 70, -126, 22, wheelFlowActive, wheelColor);
  } else {
    drawChevronFlow(-126, -22, -126, -70, wheelFlowActive, wheelColor);
    drawChevronFlow(-126, 22, -126, 70, wheelFlowActive, wheelColor);
  }

  roundRect(ctx, -184, -52, 44, 34, 6);
  ctx.fillStyle = engineOn ? th.hybridSoft : (th.dark ? '#232934' : '#e2e7ef');
  ctx.fill();
  ctx.strokeStyle = engineOn ? th.hybrid : (th.dark ? '#495363' : '#aeb8c6');
  ctx.lineWidth = engineOn ? 2 : 1.4; ctx.stroke();
  ctx.strokeStyle = engineOn ? th.hybrid : (th.dark ? '#677385' : '#8591a2');
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo(-174 + i * 12, -44); ctx.lineTo(-174 + i * 12, -26); ctx.stroke();
  }

  roundRect(ctx, -148, -22, 44, 44, 8);
  ctx.fillStyle = motorActive || generation ? th.electricSoft : (th.dark ? '#232934' : '#e2e7ef');
  ctx.fill();
  ctx.strokeStyle = motorActive || generation ? th.electric : (th.dark ? '#495363' : '#aeb8c6');
  ctx.lineWidth = motorActive || generation ? 2 : 1.4; ctx.stroke();
  ctx.fillStyle = motorActive || generation ? th.electric : (th.dark ? '#7a8698' : '#7b8798');
  ctx.beginPath();
  ctx.moveTo(-123, -10); ctx.lineTo(-131, 1); ctx.lineTo(-125, 1);
  ctx.lineTo(-130, 11); ctx.lineTo(-120, -1); ctx.lineTo(-126, -1);
  ctx.closePath(); ctx.fill();

  const bx = -34, by = -40, bw = 132, bh = 80;
  roundRect(ctx, bx, by, bw, bh, 8);
  ctx.fillStyle = th.dark ? '#171c24' : '#edf1f6'; ctx.fill();
  ctx.strokeStyle = soc > .22 ? th.electric : th.hybrid;
  ctx.lineWidth = 1.8; ctx.stroke();
  const cells = 10;
  const activeCells = Math.round(cells * soc);
  const cellW = (bw - 16) / cells;
  for (let i = 0; i < cells; i++) {
    const cx0 = bx + 8 + i * cellW;
    ctx.fillStyle = i < activeCells
      ? (soc > .22 ? th.electric : th.hybrid)
      : (th.dark ? '#28303c' : '#d5dde7');
    roundRect(ctx, cx0 + 1.5, by + 9, cellW - 3, bh - 18, 2); ctx.fill();
  }

  roundRect(ctx, 114, -30, 38, 60, 7);
  ctx.fillStyle = th.dark ? 'rgba(38, 46, 58, 0.78)' : 'rgba(218, 224, 232, 0.85)';
  ctx.fill();
  ctx.strokeStyle = th.dark ? 'rgba(130, 144, 162, 0.35)' : 'rgba(110, 124, 140, 0.38)';
  ctx.lineWidth = 1.3; ctx.stroke();

  ctx.restore();
}

/** Every instance owns its canvas, texture and material. Physical EHS telemetry only. */
export class QinPlusDisplay extends T.Group {
  public readonly canvas = document.createElement('canvas');
  public readonly texture: T.CanvasTexture;
  public readonly screen: T.Mesh<T.PlaneGeometry, T.MeshStandardMaterial>;
  private elapsed = 1;
  private lastModeKey = '';
  private animPhase = 0;
  private smoothSpeed = 0;
  private smoothPower = 0;
  private navigation = false;

  public cyclePage(): void { this.navigation = !this.navigation; this.elapsed = 1; }

  public constructor(private readonly center = false) {
    super();
    this.name = center ? 'Qin DiLink 10.1 energy display' : 'Qin floating 8.8 instruments';
    this.canvas.width = 1024;
    this.canvas.height = center ? 620 : 352;
    this.texture = new T.CanvasTexture(this.canvas);
    this.texture.colorSpace = T.SRGBColorSpace;
    this.texture.anisotropy = 4;

    const w = center ? .236 : .216, h = center ? .143 : .074;
    const bezelW = center ? .012 : .010, bezelH = center ? .012 : .010;
    const housingMat = new T.MeshStandardMaterial({ color: 0x0d1217, roughness: .22, metalness: .28 });
    const housing = new T.Mesh(new T.BoxGeometry(w + bezelW, h + bezelH, .013), housingMat);
    housing.name = center ? 'Qin DiLink bezel housing' : 'Qin 8.8 cluster bezel housing';
    housing.position.z = -.0075;
    this.add(housing);

    this.screen = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({
      map: this.texture, emissiveMap: this.texture, emissive: 0xffffff, emissiveIntensity: .88,
      color: 0x0a0d10, roughness: .22, metalness: .04, toneMapped: false,
    }));
    this.screen.name = center ? 'Qin DiLink active glass' : 'Qin 8.8 cluster active glass';
    this.screen.position.z = .0006;
    this.add(this.screen);
  }

  public update(t: InstrumentTelemetry, dt: number): void {
    const safeDt = Math.min(.2, Math.max(0, dt));
    this.animPhase += safeDt;

    const daylight = T.MathUtils.clamp(t.ambientDaylight ?? 1, 0, 1);
    const lampsOn = !!(t.indicators?.headlights || t.indicators?.positionLights || t.indicators?.highBeam);
    // Center DiLink follows automatic day/night theme; 8.8" cluster stays authentic deep obsidian black.
    const useDarkTheme = !this.center || daylight < .45 || lampsOn;
    const th = useDarkTheme ? DARK_THEME : LIGHT_THEME;

    this.smoothSpeed = dt >= .5 ? t.speedKmh : T.MathUtils.damp(this.smoothSpeed, t.speedKmh, 14, safeDt);
    const rawPowerKw = ((t.ehs?.p3MechanicalPowerW ?? 0) + ((t.ehs?.directClutch.torqueNm ?? 0) > 1 ? (t.ehs?.enginePowerW ?? 0) : 0)) / 1000;
    this.smoothPower = dt >= .5 ? rawPowerKw : T.MathUtils.damp(this.smoothPower, rawPowerKw, 12, safeDt);

    const screenMat = this.screen.material;
    if (t.ignitionOn === false && !(this.center && t.ehs?.battery.connector)) {
      screenMat.emissiveIntensity = .04;
    } else if (!this.center) {
      screenMat.emissiveIntensity = T.MathUtils.lerp(.82, 1.0, daylight);
    } else {
      screenMat.emissiveIntensity = useDarkTheme
        ? T.MathUtils.lerp(.70, .86, daylight)
        : T.MathUtils.lerp(.72, .80, daylight);
    }

    const modeKey = `${t.driveMode}|${t.ehs?.mode}|${t.ehs?.state}|${t.ehs?.evFallbackReason}|${t.ignitionOn}|${t.indicators?.positionLights}|${t.indicators?.headlights}|${t.indicators?.highBeam}|${t.indicators?.frontFogLights}|${t.indicators?.rearFogLights}|${t.indicators?.leftTurn}|${t.indicators?.rightTurn}`;
    this.elapsed += safeDt;
    if (this.elapsed < .05 && modeKey === this.lastModeKey) return;
    this.elapsed = 0;
    this.lastModeKey = modeKey;

    const x = this.canvas.getContext('2d'); if (!x) return;
    const w = this.canvas.width, h = this.canvas.height, e = t.ehs, ev = t.ev;

    // ── POWERED-OFF STATE ───────────────────────────────────────────────────
    if (t.ignitionOn === false) {
      x.fillStyle = '#030508'; x.fillRect(0, 0, w, h);
      if (this.center && e?.battery.connector) {
        const soc = T.MathUtils.clamp(e.battery.soc, 0, 1);
        x.fillStyle = '#0b0e14'; x.fillRect(0, 0, w, h);
        drawOemEnergyFlowCar(x, 305, 310, DARK_THEME, soc, false, false, false, true, false, this.animPhase);

        x.save();
        x.strokeStyle = DARK_THEME.electric; x.lineWidth = 4.5; x.lineCap = 'round';
        x.setLineDash([10, 8]); x.lineDashOffset = -((this.animPhase * 42) % 18);
        x.beginPath(); x.moveTo(438, 515); x.quadraticCurveTo(454, 445, 445, 395); x.stroke();
        x.setLineDash([]);
        x.fillStyle = DARK_THEME.electric;
        x.beginPath(); x.arc(445, 395, 6, 0, Math.PI * 2); x.fill();
        x.restore();

        drawText(x, `外接${e.battery.connector}充电 · ${e.battery.state}`, 605, 196, 26, DARK_THEME.electric, 'bold');
        drawText(x, `${Math.round(soc * 100)}%`, 605, 304, 92, '#f4f6f9', '600');
        drawText(x, `${(e.battery.gridPowerW / 1000).toFixed(1)} kW · SOC ${(soc * 100).toFixed(1)}%`, 605, 362, 24, '#aeb8c6');
        roundRect(x, 605, 396, 355, 12, 6); x.fillStyle = '#202630'; x.fill();
        roundRect(x, 605, 396, Math.max(12, 355 * soc), 12, 6); x.fillStyle = DARK_THEME.electric; x.fill();
        drawText(x, `电池温度 ${(e.battery.temperatureC ?? 20).toFixed(0)}°C`, 605, 448, 20, '#747f90');
      }
      this.texture.needsUpdate = true; return;
    }

    const soc = T.MathUtils.clamp(ev?.stateOfCharge ?? 0, 0, 1);
    const busKw = (e?.busPowerW ?? 0) / 1000;
    const p1Kw = (e?.p1GenerationPowerW ?? 0) / 1000;
    const p3Kw = (e?.p3MechanicalPowerW ?? 0) / 1000;
    const engKw = (e?.enginePowerW ?? 0) / 1000;
    const isEv = (e?.state ?? 'EV') === 'EV';
    const engineOn = engKw > .5 || !!t.engineRunning;
    const generation = p1Kw > .1;
    const motorActive = Math.abs(p3Kw) > .1;
    const regen = p3Kw < -.15 || busKw < -.2;
    const directDrive = (e?.directClutch.torqueNm ?? 0) > 1;

    // ════════════════════════════════════════════════════════════════════════
    // 1. EXACT REPLICA: 2026 BYD 秦 PLUS DM-i 8.8-INCH INSTRUMENT CLUSTER
    //    Pure obsidian black, thin left POWER/ECO/CHARGE '(' arc + 7-seg kW,
    //    top clock / NORMAL / 7-seg gear + royal-blue hairline / temp,
    //    center top-down energy-flow car, bottom battery % & fuel range bars,
    //    thin right ice-blue ')' arc + 7-seg km/h + ODO!
    // ════════════════════════════════════════════════════════════════════════
    if (!this.center) {
      // Pure deep obsidian black screen (exact match to real instrument photos)
      x.fillStyle = '#020407'; x.fillRect(0, 0, w, h);

      // ── TOP HEADER BAR (Authentic 2026 Qin PLUS DM-i OEM Layout) ──────────
      // Left digital clock (7-segment style, e.g. 15:18)
      drawSevenSegString(x, '15:18', 168, 52, 22, '#dce8ff', 'center', -.06);

      // Driving mode label (NORMAL green / ECO cyan-green / SPORT red-orange / SNOW ice-blue)
      const rawMode = String(t.driveMode ?? 'NORMAL').toUpperCase();
      const modeText = rawMode === 'SPORT' ? 'SPORT' : rawMode === 'ECO' ? 'ECO' : rawMode === 'SNOW' ? 'SNOW' : 'NORMAL';
      const modeColor = modeText === 'SPORT' ? '#ef5244' : modeText === 'SNOW' ? '#62c8ff' : modeText === 'ECO' ? '#38d4b0' : '#40d87c';
      drawText(x, modeText, 326, 61, 24, modeColor, '500', 'center');

      // Energy mode right beside driving mode & gear (OEM: "NORMAL  HEV  P" / "NORMAL  EV  D")
      const energyTag = e?.mode === 'EV' ? (e.evFallbackActive ? 'HEV' : 'EV') : 'HEV';
      const energyColor = e?.evFallbackActive ? '#f5a828' : energyTag === 'EV' ? '#4be096' : '#dce6f2';
      drawText(x, energyTag, 434, 61, 23, energyColor, '500', 'center');

      // Large Center Geometric Gear Letter (P / R / N / D) with subtle BYD diagonal LCD texture
      const gearChar = String(t.gear).charAt(0).toUpperCase() || 'P';
      x.save();
      x.font = 'bold 44px "Segoe UI", "Arial", sans-serif';
      x.textAlign = 'center';
      x.fillStyle = '#d4e2ff';
      x.fillText(gearChar, 512, 70);
      // Subtle diagonal dark micro-lines across gear glyph matching the real LCD gear segment texture
      x.strokeStyle = 'rgba(4, 8, 16, 0.45)'; x.lineWidth = 1.6;
      for (let d = -30; d <= 30; d += 7) {
        x.beginPath(); x.moveTo(490 + d, 32); x.lineTo(476 + d, 74); x.stroke();
      }
      x.restore();

      // Right-of-gear ISO Lighting Telltale Strip (Position / Low Beam / High Beam / Front Fog / Rear Fog)
      const activeLamps: Array<'position' | 'lowBeam' | 'highBeam' | 'frontFog' | 'rearFog'> = [];
      if (t.indicators?.positionLights) activeLamps.push('position');
      if (t.indicators?.headlights) activeLamps.push('lowBeam');
      if (t.indicators?.highBeam) activeLamps.push('highBeam');
      if (t.indicators?.frontFogLights || (t.indicators?.fogLights && !t.indicators?.rearFogLights)) activeLamps.push('frontFog');
      if (t.indicators?.rearFogLights) activeLamps.push('rearFog');
      activeLamps.forEach((lamp, idx) => {
        drawLightingTelltale(x, lamp, 578 + idx * 36, 52, 0.92);
      });

      // Signature thin glowing royal-blue horizontal hairline under NORMAL / HEV / Gear
      const lineGrad = x.createLinearGradient(256, 86, 768, 86);
      lineGrad.addColorStop(0, 'rgba(62, 108, 255, 0)');
      lineGrad.addColorStop(0.22, 'rgba(72, 122, 255, 0.72)');
      lineGrad.addColorStop(0.5, 'rgba(130, 172, 255, 0.95)');
      lineGrad.addColorStop(0.78, 'rgba(72, 122, 255, 0.72)');
      lineGrad.addColorStop(1, 'rgba(62, 108, 255, 0)');
      x.fillStyle = lineGrad; x.fillRect(256, 84, 512, 2.4);

      // Right-top ambient temperature (e.g. 20°C or real outsideTemperatureC)
      const tempC = Math.round(t.outsideTemperatureC ?? 20);
      drawSevenSegString(x, `${tempC}`, 838, 52, 22, '#dce8ff', 'right', -.06);
      drawText(x, '℃', 844, 60, 18, '#b8cde6', 'normal', 'left');

      // Turn signal green arrows (flanking header bar when active)
      if (t.indicators?.leftTurn) {
        x.fillStyle = '#28d868';
        x.beginPath(); x.moveTo(226, 52); x.lineTo(244, 42); x.lineTo(244, 62); x.closePath(); x.fill();
      }
      if (t.indicators?.rightTurn) {
        x.fillStyle = '#28d868';
        x.beginPath(); x.moveTo(790, 52); x.lineTo(772, 42); x.lineTo(772, 62); x.closePath(); x.fill();
      }

      // ── LEFT CURVED BRACKET '(' : POWER (Red) / ECO (Blue) / CHARGE (Green) ─
      const drawLeftArcCurve = (t0: number, t1: number, strokeStyle: string | CanvasGradient, lw: number) => {
        x.save();
        x.strokeStyle = strokeStyle; x.lineWidth = lw; x.lineCap = 'round';
        x.beginPath();
        const steps = 24;
        for (let i = 0; i <= steps; i++) {
          const f = T.MathUtils.lerp(t0, t1, i / steps); // 0 = top, 1 = bottom
          const dy = (f - .5) * 2; // -1..+1
          const px = 70 + 48 * (dy * dy * dy * dy) + 18 * (dy * dy);
          const py = T.MathUtils.lerp(56, 304, f);
          if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
        }
        x.stroke();
        x.restore();
      };

      // Base thin 3-zone colored parenthesis '(' (exact match to all 3 photos!)
      const pwrGrad = x.createLinearGradient(0, 56, 0, 148);
      pwrGrad.addColorStop(0, 'rgba(185, 36, 48, 0.25)');
      pwrGrad.addColorStop(0.35, '#c2303c');
      pwrGrad.addColorStop(1, '#d23b46');
      drawLeftArcCurve(0.00, 0.40, pwrGrad, 2.6);
      drawLeftArcCurve(0.40, 0.78, '#66a4ff', 2.8);
      const chgGrad = x.createLinearGradient(0, 245, 0, 304);
      chgGrad.addColorStop(0, '#44cc82');
      chgGrad.addColorStop(1, 'rgba(58, 198, 120, 0.85)');
      drawLeftArcCurve(0.78, 1.00, chgGrad, 3.0);

      // Subtle bottom green CHARGE glow flare (just like the photos!)
      const chgFlare = x.createRadialGradient(112, 294, 2, 112, 294, 34);
      chgFlare.addColorStop(0, regen ? 'rgba(66, 224, 134, 0.65)' : 'rgba(66, 200, 124, 0.26)');
      chgFlare.addColorStop(1, 'rgba(0, 0, 0, 0)');
      x.fillStyle = chgFlare;
      x.beginPath(); x.arc(112, 294, 34, 0, Math.PI * 2); x.fill();

      // Dynamic power/regen active fill bar hugging inside the left '(' arc!
      const pwrNorm = T.MathUtils.clamp(this.smoothPower / 110, -.45, 1);
      if (pwrNorm > .02) {
        const topF = T.MathUtils.lerp(.78, .04, pwrNorm);
        drawLeftArcCurve(topF, .78, pwrNorm > .55 ? '#df404c' : '#6aaaff', 5.5);
      } else if (pwrNorm < -.02) {
        const botF = T.MathUtils.lerp(.78, 1.0, Math.min(1, -pwrNorm / .45));
        drawLeftArcCurve(.78, botF, '#48e08c', 5.5);
      }

      // Subtle zone captions along inside of left arc: POWER / ECO / CHARGE
      x.save();
      x.translate(88, 126); x.rotate(-Math.PI / 2 + .18);
      drawText(x, 'POWER', 0, 0, 11, 'rgba(186, 52, 62, 0.62)', '600', 'center');
      x.restore();
      x.save();
      x.translate(82, 206); x.rotate(-Math.PI / 2);
      drawText(x, 'ECO', 0, 0, 11, 'rgba(104, 160, 245, 0.78)', '600', 'center');
      x.restore();
      drawText(x, 'CHARGE', 98, 276, 11, 'rgba(84, 178, 122, 0.72)', '600', 'left');

      // Left interior: clean status indicator above + 7-segment kW readout + 'kW'
      if (e?.evFallbackActive) {
        drawText(x, 'EV受限', 176, 132, 14, '#f5a828', '600', 'center');
      } else if (t.indicators?.cruise) {
        drawText(x, 'CRUISE', 176, 132, 13, '#46d884', '600', 'center');
      }
      const kwInt = Math.round(this.smoothPower);
      drawSevenSegString(x, `${kwInt}`, 176, 182, 42, '#f0f5fc', 'center', -.06);
      drawText(x, 'kW', 176, 224, 16, '#b8c8d8', 'normal', 'center');

      // ── RIGHT CURVED BRACKET ')' : Ice-Blue Speedometer Arc ───────────────
      const drawRightArcCurve = (t0: number, t1: number, strokeStyle: string | CanvasGradient, lw: number) => {
        x.save();
        x.strokeStyle = strokeStyle; x.lineWidth = lw; x.lineCap = 'round';
        x.beginPath();
        const steps = 24;
        for (let i = 0; i <= steps; i++) {
          const f = T.MathUtils.lerp(t0, t1, i / steps);
          const dy = (f - .5) * 2;
          const px = 954 - 48 * (dy * dy * dy * dy) - 18 * (dy * dy);
          const py = T.MathUtils.lerp(56, 304, f);
          if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
        }
        x.stroke();
        x.restore();
      };

      const spdArcGrad = x.createLinearGradient(0, 56, 0, 304);
      spdArcGrad.addColorStop(0, 'rgba(72, 118, 225, 0.35)');
      spdArcGrad.addColorStop(0.25, '#86b8ff');
      spdArcGrad.addColorStop(0.75, '#d4e8ff');
      spdArcGrad.addColorStop(1, '#68b4ff');
      drawRightArcCurve(0.00, 1.00, spdArcGrad, 2.8);

      // Subtle ice-blue glow flare at bottom-right tip (as seen in all 3 photos!)
      const spdFlare = x.createRadialGradient(910, 294, 2, 910, 294, 34);
      spdFlare.addColorStop(0, 'rgba(96, 174, 255, 0.42)');
      spdFlare.addColorStop(1, 'rgba(0, 0, 0, 0)');
      x.fillStyle = spdFlare;
      x.beginPath(); x.arc(910, 294, 34, 0, Math.PI * 2); x.fill();

      // Dynamic speed progress highlight rising along the right ')' arc
      const spdFrac = T.MathUtils.clamp(this.smoothSpeed / 200, 0, 1);
      if (spdFrac > .01) {
        drawRightArcCurve(1.0 - spdFrac * .96, 1.0, '#7cc0ff', 5.5);
      }

      // Right interior: (P) / HOLD icon above + 7-segment km/h readout + 'km/h'
      if (t.indicators?.parkingBrake || gearChar === 'P') {
        x.strokeStyle = '#d62e3a'; x.lineWidth = 2;
        x.beginPath(); x.arc(848, 126, 10, 0, Math.PI * 2); x.stroke();
        x.beginPath(); x.arc(848, 126, 14, -Math.PI * .35, Math.PI * .35); x.stroke();
        x.beginPath(); x.arc(848, 126, 14, Math.PI * .65, Math.PI * 1.35); x.stroke();
        drawText(x, 'P', 848, 132, 14, '#d62e3a', 'bold', 'center');
      } else if (t.indicators?.autoHold) {
        drawText(x, 'HOLD', 848, 132, 13, '#46d884', 'bold', 'center');
      }
      drawSevenSegString(x, `${Math.round(this.smoothSpeed)}`, 848, 182, 42, '#f0f5fc', 'center', -.06);
      drawText(x, 'km/h', 848, 224, 16, '#b8c8d8', 'normal', 'center');

      // ── CENTER STAGE: Compass + Top-Down Energy-Flow Car (Exact Photo #2!) ──
      // Small compass arrow & cardinal direction at upper-right of center stage
      const yaw = t.sharedVehicle?.navigation.pose.yaw ?? 0;
      const dirs = ['北', '东', '南', '西'];
      const dirIdx = ((Math.round(-yaw / (Math.PI / 2)) % 4) + 4) % 4;
      x.fillStyle = '#c4d4e4';
      x.beginPath(); x.moveTo(656, 126); x.lineTo(663, 142); x.lineTo(656, 138); x.lineTo(649, 142); x.closePath(); x.fill();
      drawText(x, dirs[dirIdx]!, 668, 142, 18, '#c8d6e4', 'normal', 'left');

      if (activeNavigation(t.sharedVehicle?.navigation.guidance)) {
        drawNavigationBanner(x, t.sharedVehicle?.navigation.guidance, { x: 340, y: 120, width: 344, height: 112 });
      } else {
        drawClusterTopDownCar(x, 512, 198, soc, engineOn, generation, motorActive, regen, directDrive, this.animPhase);
      }

      // ── BOTTOM STATUS BAR (Authentic 2026 Qin PLUS DM-i: Battery | OK | Fuel) ─
      // Subtle top framing bracket line above the battery & fuel pills
      x.strokeStyle = 'rgba(170, 186, 204, 0.28)'; x.lineWidth = 1.2;
      x.beginPath();
      x.moveTo(298, 294); x.lineTo(314, 278); x.lineTo(710, 278); x.lineTo(726, 294);
      x.stroke();

      // Left Pill: Battery icon + SOC % + thin green progress bar (red reserve tip)
      x.strokeStyle = '#cad8e6'; x.lineWidth = 1.6;
      roundRect(x, 326, 286, 22, 13, 2); x.stroke();
      x.fillStyle = '#cad8e6'; x.fillRect(330, 283, 4, 3); x.fillRect(340, 283, 4, 3);
      drawText(x, `${Math.round(soc * 100)}`, 442, 300, 24, '#edf4fc', '500', 'right');
      drawText(x, '%', 446, 300, 14, '#9eb2c6', 'normal', 'left');
      x.fillStyle = '#2c3642'; x.fillRect(322, 309, 150, 4);
      x.fillStyle = '#d64444'; x.fillRect(322, 309, 16, 4);
      if (soc > 0.1) {
        x.fillStyle = soc > .22 ? '#44d682' : '#e69432';
        x.fillRect(338, 309, Math.max(2, 134 * ((soc - 0.1) / 0.9)), 4);
      }

      // Center OEM READY indicator: green "OK" right between battery & fuel bars!
      if (t.driveAvailable !== false) {
        drawText(x, 'OK', 512, 312, 22, '#3cd878', '600', 'center');
      }

      // Right Pill: Fuel pump icon + estimated fuel range km + thin white/grey bar
      const fuelFrac = T.MathUtils.clamp(t.fuelLevel ?? .72, 0, 1);
      const estRangeKm = Math.round(fuelFrac * 65 * 22); // Honest 65 L tank reference range
      const lowFuelColor = fuelFrac <= 0.15 ? '#e6c238' : '#cad8e6';
      x.strokeStyle = lowFuelColor; x.lineWidth = 1.6;
      roundRect(x, 558, 285, 13, 16, 2); x.stroke();
      x.beginPath(); x.moveTo(571, 289); x.lineTo(576, 293); x.lineTo(576, 300); x.stroke();
      drawText(x, `${estRangeKm}`, 664, 300, 24, '#edf4fc', '500', 'right');
      drawText(x, 'km', 668, 300, 14, '#9eb2c6', 'normal', 'left');
      x.fillStyle = '#2c3642'; x.fillRect(552, 309, 150, 4);
      x.fillStyle = '#c4d2e0'; x.fillRect(552, 309, Math.max(4, 150 * fuelFrac), 4);

      // Bottom-Right ODO readout (cleanly spaced left of right arc bottom flare)
      const odoKm = Math.round(t.trip?.totalDistanceKm ?? 8);
      drawText(x, 'ODO', 738, 314, 13, '#889ab0', '600', 'left');
      drawSevenSegString(x, `${odoKm}`, 846, 309, 19, '#e4eef8', 'right', -.06);
      drawText(x, 'km', 852, 317, 13, '#9cb0c4', 'normal', 'left');

      this.texture.needsUpdate = true; return;
    }

    // ════════════════════════════════════════════════════════════════════════
    // 2. 10.1" DILINK NAVIGATION PAGE
    // ════════════════════════════════════════════════════════════════════════
    if (this.navigation) {
      x.fillStyle = th.bg; x.fillRect(0, 0, w, h);
      const n = t.sharedVehicle?.navigation;
      if (n?.map.available) {
        n.map.draw(x, { x: 0, y: 40, width: w, height: h - 106 }, n.pose.x, n.pose.z, n.pose.yaw, Math.max(400, t.speedKmh * 9));
      } else {
        x.strokeStyle = th.border; x.lineWidth = 1;
        for (let gx = 0; gx < w; gx += 52) { x.beginPath(); x.moveTo(gx, 40); x.lineTo(gx, h - 66); x.stroke(); }
        for (let gy = 40; gy < h - 66; gy += 52) { x.beginPath(); x.moveTo(0, gy); x.lineTo(w, gy); x.stroke(); }
        roundRect(x, 312, 232, 400, 118, 18);
        x.fillStyle = th.card; x.fill();
        x.strokeStyle = th.border; x.lineWidth = 1.2; x.stroke();
        drawText(x, '高德地图', 512, 282, 28, th.textPrimary, '600', 'center');
        drawText(x, '当前地图未接入导航路网', 512, 320, 19, th.textSecondary, 'normal', 'center');
      }
      drawNavigationBanner(x, n?.guidance, { x: 20, y: 54, width: 510, height: 132 });
      roundRect(x, 20, h - 122, 560, 44, 22);
      x.fillStyle = th.card; x.fill();
      x.strokeStyle = th.border; x.lineWidth = 1.2; x.stroke();
      drawText(x, `${n?.roadName ?? '导航数据不可用'} · 点击返回能量流`, 42, h - 94, 20, th.textPrimary);
      this.drawDiLinkChrome(x, w, h, th, soc, isEv, true);
      this.texture.needsUpdate = true; return;
    }

    // ════════════════════════════════════════════════════════════════════════
    // 3. 2026 BYD DiLink 100 — 10.1-INCH INFOTAINMENT (OEM ENERGY FLOW)
    // ════════════════════════════════════════════════════════════════════════
    x.fillStyle = th.bg; x.fillRect(0, 0, w, h);

    roundRect(x, 20, 56, 636, 480, 18);
    x.fillStyle = th.card; x.fill();
    x.strokeStyle = th.border; x.lineWidth = 1; x.stroke();

    const flowTitle = e?.evFallbackActive ? '纯电受限 · 混动介入' : regen ? '能量回收' : e?.state === 'DIRECT' ? '发动机直驱' : e?.state === 'PARALLEL' ? '并联协同驱动' : generation ? '串联发电驱动' : isEv ? 'EV 纯电驱动' : 'HEV 混动驱动';
    drawText(x, '能量流', 44, 96, 24, th.textPrimary, '600');
    roundRect(x, 134, 72, 210, 30, 15);
    x.fillStyle = regen || (isEv && !e?.evFallbackActive) ? th.electricSoft : th.hybridSoft; x.fill();
    drawText(x, flowTitle, 239, 93, 15, regen || (isEv && !e?.evFallbackActive) ? th.electric : th.hybrid, '600', 'center');
    drawText(x, `${t.driveMode ?? 'NORMAL'} · ${Math.round(this.smoothSpeed)} km/h · ${t.gear}`, 632, 94, 17, th.textSecondary, '600', 'right');

    drawOemEnergyFlowCar(x, 338, 286, th, soc, engineOn, generation, motorActive, regen, directDrive, this.animPhase);

    x.fillStyle = th.divider; x.fillRect(42, 444, 592, 1);
    const cols: readonly [number, string, string, string][] = [
      [44, t.engineRunning ? '发动机运行' : '发动机停止', `${engKw.toFixed(1)} kW · ${Math.round(t.rpm)} rpm`, engineOn ? th.hybrid : th.textSecondary],
      [252, 'P1 发电 / P3 电驱', `${p1Kw.toFixed(1)} / ${p3Kw.toFixed(1)} kW`, motorActive ? th.electric : th.textSecondary],
      [472, '直驱离合器', directDrive ? '已接合 · 直驱' : '已断开', directDrive ? th.hybrid : th.textSecondary],
    ];
    for (const [cx0, label, val, accent] of cols) {
      drawText(x, label, cx0, 476, 15, th.textMuted);
      drawText(x, val, cx0, 508, 18, accent, '600');
    }

    roundRect(x, 674, 56, 330, 178, 18);
    x.fillStyle = th.card; x.fill();
    x.strokeStyle = th.border; x.lineWidth = 1; x.stroke();
    drawText(x, '动力电池', 698, 92, 18, th.textSecondary, '600');
    drawText(x, `${(ev?.remainingEnergyKWh ?? 0).toFixed(2)} kWh`, 980, 92, 17, th.textSecondary, 'normal', 'right');
    drawText(x, `SOC ${(soc * 100).toFixed(1)}%`, 698, 144, 34, th.textPrimary, '600');
    roundRect(x, 698, 162, 282, 10, 5); x.fillStyle = th.barTrack; x.fill();
    roundRect(x, 698, 162, Math.max(10, 282 * soc), 10, 5);
    x.fillStyle = soc > .22 ? th.electric : th.hybrid; x.fill();
    const batStateCn = e?.battery.state === 'CHARGING' ? '充电中' : e?.battery.state === 'INHIBITED' ? '温控保护' : '正常';
    drawText(x, `${busKw >= 0 ? '放电' : '充电'} ${Math.abs(busKw).toFixed(1)} kW`, 698, 208, 18, th.textPrimary, '600');
    drawText(x, `${(e?.battery.temperatureC ?? 20).toFixed(0)}°C · ${batStateCn}`, 980, 208, 16, th.textSecondary, 'normal', 'right');

    roundRect(x, 674, 250, 330, 178, 18);
    x.fillStyle = th.card; x.fill();
    x.strokeStyle = th.border; x.lineWidth = 1; x.stroke();
    drawText(x, '能量管理', 698, 286, 18, th.textSecondary, '600');
    const actualStateCn = e?.state === 'DIRECT' ? '直驱' : e?.state === 'PARALLEL' ? '并联' : e?.state === 'SERIES' ? '串联' : '纯电';
    drawText(x, `请求 ${e?.mode ?? 'HEV'} · 实际 ${actualStateCn}`, 980, 286, 15, e?.evFallbackActive ? th.hybrid : th.textMuted, '600', 'right');

    roundRect(x, 698, 304, 282, 38, 10); x.fillStyle = th.cardElevated; x.fill();
    const modes: readonly [string, boolean][] = [
      ['EV', e?.mode === 'EV'],
      ['HEV', e?.mode === 'HEV' || !e?.mode],
      ['智能保电', e?.mode === 'HOLD' || e?.mode === 'SPORT'],
    ];
    modes.forEach(([label, active], idx) => {
      const mx = 702 + idx * 92;
      if (active) {
        roundRect(x, mx, 308, 90, 30, 8);
        x.fillStyle = th.dark ? '#313a48' : '#ffffff'; x.fill();
      }
      drawText(x, label, mx + 45, 329, 15, active ? th.textPrimary : th.textSecondary, active ? '600' : 'normal', 'center');
    });

    const holdSoc = T.MathUtils.clamp(e?.holdSOC ?? .5, 0, 1);
    drawText(x, 'SOC 保电目标', 698, 376, 16, th.textSecondary);
    drawText(x, `${Math.round(holdSoc * 100)}%`, 980, 376, 17, th.textPrimary, '600', 'right');
    roundRect(x, 698, 392, 282, 7, 3.5); x.fillStyle = th.barTrack; x.fill();
    roundRect(x, 698, 392, Math.max(10, 282 * holdSoc), 7, 3.5); x.fillStyle = th.electric; x.fill();
    x.fillStyle = '#ffffff';
    x.beginPath(); x.arc(698 + 282 * holdSoc, 395.5, 9, 0, Math.PI * 2); x.fill();
    x.strokeStyle = th.border; x.lineWidth = 1.5; x.stroke();

    roundRect(x, 674, 444, 330, 92, 18);
    x.fillStyle = th.card; x.fill();
    x.strokeStyle = th.border; x.lineWidth = 1; x.stroke();
    x.fillStyle = '#2f7df6';
    x.beginPath(); x.arc(722, 490, 22, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffffff';
    x.beginPath(); x.moveTo(722, 477); x.lineTo(732, 500); x.lineTo(722, 494); x.lineTo(712, 500); x.closePath(); x.fill();
    drawText(x, '高德地图导航', 758, 485, 20, th.textPrimary, '600');
    drawText(x, '点击屏幕切换实时地图', 758, 512, 15, th.textSecondary);

    this.drawDiLinkChrome(x, w, h, th, soc, isEv, false);
    this.texture.needsUpdate = true;
  }

  /** Clean, understated BYD DiLink 100 top status bar & bottom climate/navigation dock. */
  private drawDiLinkChrome(
    ctx: CanvasRenderingContext2D, w: number, h: number,
    th: ThemePalette, soc: number, isEv: boolean, navActive: boolean,
  ): void {
    ctx.fillStyle = th.dockBg; ctx.fillRect(0, 0, w, 40);
    ctx.fillStyle = th.divider; ctx.fillRect(0, 39, w, 1);

    drawText(ctx, '秦 PLUS DM-i', 24, 26, 16, th.textPrimary, '600');
    drawText(ctx, '能量流', 466, 26, 16, !navActive ? th.textPrimary : th.textMuted, !navActive ? '600' : 'normal', 'center');
    drawText(ctx, '导航', 558, 26, 16, navActive ? th.textPrimary : th.textMuted, navActive ? '600' : 'normal', 'center');
    ctx.fillStyle = th.textPrimary;
    roundRect(ctx, (!navActive ? 466 : 558) - 18, 35, 36, 3, 1.5); ctx.fill();

    ctx.fillStyle = th.textSecondary;
    for (let i = 0; i < 4; i++) ctx.fillRect(816 + i * 5.5, 26 - (i + 1) * 3, 3.5, (i + 1) * 3);
    drawText(ctx, '5G', 844, 26, 13, th.textSecondary, '600');
    drawText(ctx, isEv ? 'EV' : 'HEV', 878, 26, 13, isEv ? th.electric : th.hybrid, 'bold');
    drawText(ctx, `${Math.round(soc * 100)}%`, 922, 26, 15, th.textPrimary, '600');

    const dy = h - 66;
    ctx.fillStyle = th.dockBg; ctx.fillRect(0, dy, w, 66);
    ctx.fillStyle = th.divider; ctx.fillRect(0, dy, w, 1);

    ctx.save();
    ctx.strokeStyle = th.textPrimary; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(46, dy + 31); ctx.lineTo(60, dy + 19); ctx.lineTo(74, dy + 31);
    ctx.moveTo(50, dy + 29); ctx.lineTo(50, dy + 44); ctx.lineTo(70, dy + 44); ctx.lineTo(70, dy + 29); ctx.stroke();

    roundRect(ctx, 114, dy + 24, 34, 17, 5); ctx.stroke();
    ctx.fillStyle = th.textPrimary;
    ctx.beginPath(); ctx.arc(122, dy + 43, 3.5, 0, Math.PI * 2); ctx.arc(140, dy + 43, 3.5, 0, Math.PI * 2); ctx.fill();

    drawText(ctx, '24.0°', 230, dy + 38, 23, th.textPrimary, '600', 'center');
    drawText(ctx, 'AUTO', 230, dy + 54, 11, th.textMuted, '600', 'center');
    roundRect(ctx, 286, dy + 19, 48, 28, 14);
    ctx.fillStyle = th.cardElevated; ctx.fill();
    drawText(ctx, 'A/C', 310, dy + 38, 14, th.textPrimary, '600', 'center');

    const apps: readonly [number, string, boolean][] = [
      [424, '能量流', !navActive],
      [512, '导航', navActive],
      [598, '音乐', false],
      [682, '应用', false],
    ];
    for (const [ax, label, active] of apps) {
      drawText(ctx, label, ax, dy + 38, 16, active ? th.textPrimary : th.textSecondary, active ? '600' : 'normal', 'center');
      if (active) {
        ctx.fillStyle = th.electric;
        ctx.beginPath(); ctx.arc(ax, dy + 51, 3, 0, Math.PI * 2); ctx.fill();
      }
    }

    drawText(ctx, '24.0°', 792, dy + 38, 23, th.textPrimary, '600', 'center');
    drawText(ctx, '同步', 792, dy + 54, 11, th.textMuted, 'normal', 'center');

    ctx.strokeStyle = th.textSecondary; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(878, dy + 28); ctx.lineTo(887, dy + 28); ctx.lineTo(896, dy + 20);
    ctx.lineTo(896, dy + 46); ctx.lineTo(887, dy + 38); ctx.lineTo(878, dy + 38); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(954, dy + 33); ctx.lineTo(970, dy + 23); ctx.lineTo(970, dy + 43); ctx.closePath(); ctx.stroke();
    ctx.restore();
  }
}
