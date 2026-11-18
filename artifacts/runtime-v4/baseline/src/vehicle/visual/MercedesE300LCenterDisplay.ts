import * as T from 'three';
import { AdaptiveMapZoom } from '../../ui/LocalRoadMap';
import { drawNavigationBanner } from '../../ui/NavigationDisplay';
import type { InstrumentTelemetry } from './InstrumentCluster';
import { pressureText, tyrePressureReading, tyrePressureWarning,
  type LuxuryVehicleStatusData } from './LuxuryVehicleStatusPage';

const FONT = '"Segoe UI", "Microsoft YaHei", Arial, sans-serif';
export type MercedesCenterPage = 'home' | 'navigation' | 'vehicle';

interface StatusSources { readonly readings?: LuxuryVehicleStatusData; readonly on: boolean }

/**
 * 14.4-inch centre screen and 12.3-inch passenger screen. Both borrow the
 * existing shared navigation / proximity / TPMS resources: no routing, sensing
 * or per-skin telemetry is created here.
 */
export class MercedesE300LCenterDisplay {
  public readonly canvas = document.createElement('canvas');
  public readonly texture: T.CanvasTexture;
  public readonly passengerCanvas = document.createElement('canvas');
  public readonly passengerTexture: T.CanvasTexture;
  public page: MercedesCenterPage = 'home';
  private readonly mapCanvas = document.createElement('canvas');
  private readonly zoom = new AdaptiveMapZoom();
  private elapsed = Infinity;
  private key = '';
  private passengerKey = '';
  private wasOn = false;

  public constructor(private readonly vehicleName = 'Mercedes-Benz E 300 L') {
    this.canvas.width = this.mapCanvas.width = 960;
    this.canvas.height = this.mapCanvas.height = 400;
    this.texture = new T.CanvasTexture(this.canvas);
    this.texture.colorSpace = T.SRGBColorSpace; this.texture.anisotropy = 4;
    this.passengerCanvas.width = 720; this.passengerCanvas.height = 320;
    this.passengerTexture = new T.CanvasTexture(this.passengerCanvas);
    this.passengerTexture.colorSpace = T.SRGBColorSpace; this.passengerTexture.anisotropy = 4;
  }

  public selectPage(page: MercedesCenterPage): boolean {
    if (this.page === page) return false;
    this.page = page; this.key = ''; this.elapsed = Infinity; return true;
  }
  public cyclePage(): void {
    const order: readonly MercedesCenterPage[] = ['home', 'navigation', 'vehicle'];
    this.selectPage(order[(order.indexOf(this.page) + 1) % order.length]!);
  }
  /** Plane UVs: canvas origin is top-left. Only the three bottom tabs take clicks. */
  public click(uv: T.Vector2): boolean {
    if (!this.wasOn || uv.y < .855 || uv.y > .985) return false;
    const x = uv.x * 960;
    if (x >= 96 && x <= 250) { this.selectPage('home'); return true; }
    if (x >= 280 && x <= 470) { this.selectPage('navigation'); return true; }
    if (x >= 500 && x <= 690) { this.selectPage('vehicle'); return true; }
    return false;
  }

  public update(t: InstrumentTelemetry, dt: number, sources: StatusSources): void {
    this.elapsed += Math.max(0, dt);
    const on = sources.on;
    const status: LuxuryVehicleStatusData = { vehicleName: this.vehicleName,
      fuelLevel: t.fuelLevel, engineTemperatureC: t.coolantTemperatureC, tyres: t.tyres,
      tpmsState: t.tpmsState, ...sources.readings };
    const clock = new Date();
    const time = `${clock.getHours().toString().padStart(2, '0')}:${clock.getMinutes().toString().padStart(2, '0')}`;
    const mode = this.modeName(t.driveMode);
    const temperature = t.outsideTemperatureC === undefined ? '-- °C' : `${t.outsideTemperatureC.toFixed(1)} °C`;
    const scene = t.drivingScene;
    const modeKey = this.page === 'navigation' && scene
      ? [scene.version, scene.map.version, t.sharedVehicle?.navigation.guidance?.version].join(':')
      : this.page === 'vehicle'
        ? ['FL', 'FR', 'RL', 'RR'].map((_, index) => `${pressureText(tyrePressureReading(status, index))}${tyrePressureWarning(status, index) ? '!' : ''}`).join(':')
        : `${mode}:${Math.round((t.fuelLevel ?? 0) * 100)}`;
    const key = [on, this.page, time, temperature, modeKey,
      t.cruiseTargetSpeedKmh ?? 0, String(t.gear)].join('|');
    if (key !== this.key || this.elapsed >= .1) this.drawCenter(t, on, time, temperature, mode, status, key);
    this.wasOn = on;
    const passengerKey = [on, mode, Math.round((t.fuelLevel ?? 0) * 20), time].join('|');
    if (passengerKey !== this.passengerKey) {
      this.passengerKey = passengerKey; this.drawPassenger(on, mode, temperature, time);
      this.passengerTexture.needsUpdate = true;
    }
  }

  private modeName(mode: InstrumentTelemetry['driveMode']): string {
    return mode === 'SPORT' ? 'SPORT' : mode === 'ECO' ? 'ECO' : 'COMFORT';
  }

  private drawCenter(t: InstrumentTelemetry, on: boolean, time: string, temperature: string,
    mode: string, status: LuxuryVehicleStatusData, key: string): void {
    const c = this.canvas.getContext('2d')!;
    const text = (value: string, x: number, y: number, size: number, color = '#e5ecf4',
      weight: 400 | 500 | 600 | 300 = 400, align: CanvasTextAlign = 'left') => {
      c.font = `${weight} ${size}px ${FONT}`; c.fillStyle = color;
      c.textAlign = align; c.textBaseline = 'middle'; c.fillText(value, x, y);
    };
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#05080e'; c.fillRect(0, 0, 960, 400);
    this.key = key; this.elapsed = 0;
    if (!on) { this.texture.needsUpdate = true; return; }

    const chrome = () => {
      c.fillStyle = '#0a1220'; c.fillRect(0, 0, 960, 54);
      c.fillStyle = '#1b2a3e'; c.fillRect(0, 53, 960, 1);
      text('Mercedes-Benz', 30, 27, 18, '#9fb0c8', 500);
      text(time, 930, 27, 20, '#c8d6e6', 400, 'right');
      c.fillStyle = 'rgba(8,15,26,.96)'; c.fillRect(0, 344, 960, 56);
      for (const [label, x, active] of [['HOME', 172, this.page === 'home'],
        ['NAVIGATION', 374, this.page === 'navigation'], ['VEHICLE', 594, this.page === 'vehicle']] as const) {
        text(label, x, 372, 18, active ? '#eef4fb' : '#6d829c', active ? 500 : 400, 'center');
        if (active) { c.fillStyle = '#7f9fd6'; c.fillRect(x - 38, 391, 76, 2); }
      }
      text(mode, 930, 372, 18, mode === 'SPORT' ? '#e2a07a' : mode === 'ECO' ? '#84bda8' : '#9db6dc', 500, 'right');
      text(temperature, 30, 372, 17, '#8ba0b8');
    };

    if (this.page === 'navigation') {
      const scene = t.drivingScene;
      if (scene?.map.available) {
        const pose = scene.mapPose, complexity = scene.mapComplexity;
        const metres = Math.max(260, this.zoom.update(Number.isFinite(this.elapsed) ? .2 : .2,
          Math.abs(t.speedKmh) / 3.6, complexity, String(t.gear).charAt(0)) * 2);
        const map = this.mapCanvas.getContext('2d')!;
        scene.map.draw(map, { x: 0, y: 0, width: 960, height: 400 }, pose.x, pose.z, pose.yaw, metres);
        c.drawImage(this.mapCanvas, 0, 0);
        const shade = c.createLinearGradient(0, 54, 0, 400);
        shade.addColorStop(0, 'rgba(12,22,38,.35)'); shade.addColorStop(.55, 'rgba(10,18,32,.16)');
        shade.addColorStop(1, 'rgba(4,9,17,.72)');
        c.fillStyle = shade; c.fillRect(0, 54, 960, 290);
        scene.map.drawNavigation(c, { x: 0, y: 0, width: 960, height: 400 }, pose.x, pose.z, metres, pose.yaw);
        drawNavigationBanner(c, t.sharedVehicle?.navigation.guidance, { x: 26, y: 84, width: 430, height: 118 });
        const scale = 50 / metres * 960;
        c.strokeStyle = '#8fa8c4'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(920 - scale, 322); c.lineTo(920, 322); c.stroke();
        text('50 m', 920, 304, 16, '#9ab0c8', 400, 'right');
      } else {
        const glow = c.createRadialGradient(480, 200, 0, 480, 200, 330);
        glow.addColorStop(0, '#132437'); glow.addColorStop(1, '#050a12');
        c.fillStyle = glow; c.fillRect(0, 54, 960, 290);
        text('Navigation map unavailable', 480, 200, 24, '#a9bccf', 400, 'center');
      }
    } else if (this.page === 'vehicle') {
      const background = c.createLinearGradient(0, 54, 960, 344);
      background.addColorStop(0, '#111d2c'); background.addColorStop(.55, '#0a1220'); background.addColorStop(1, '#05080f');
      c.fillStyle = background; c.fillRect(0, 54, 960, 290);
      text(this.vehicleName, 32, 84, 26, '#eaf0f6', 500);
      c.fillStyle = '#25374c'; c.fillRect(32, 106, 896, 1);
      text('Drive mode', 32, 138, 18, '#8ba0b8');
      text(mode, 32, 172, 30, '#dfe8f2', 500);
      const fuel = T.MathUtils.clamp(status.fuelLevel ?? .7, 0, 1);
      text('Fuel', 32, 222, 18, '#8ba0b8');
      text(`${Math.round(fuel * 100)} %`, 32, 254, 30, '#dfe8f2', 500);
      c.fillStyle = '#22364a'; c.fillRect(32, 276, 240, 4);
      c.fillStyle = fuel < .12 ? '#d8b073' : '#88aad8'; c.fillRect(32, 276, 240 * fuel, 4);
      text('Engine coolant', 32, 306, 17, '#8ba0b8');
      text(`${Math.round(status.engineTemperatureC ?? 90)} °C`, 220, 306, 22, '#dfe8f2', 400, 'right');
      text('Tyre pressure', 560, 138, 19, '#9db1c7', 500, 'center');
      // A plain saloon outline locates the four real sensor readings.
      c.strokeStyle = '#4e6480'; c.lineWidth = 1.6;
      c.beginPath(); c.roundRect(430, 172, 260, 128, 26); c.stroke();
      c.beginPath(); c.moveTo(470, 172); c.lineTo(494, 214); c.lineTo(626, 214); c.lineTo(650, 172); c.stroke();
      for (let i = 0; i < 4; i++) {
        const x = i % 2 === 0 ? 470 : 650, y = i < 2 ? 214 : 258;
        const value = tyrePressureReading(status, i), warning = tyrePressureWarning(status, i);
        text(value === undefined ? '--' : String(value), x, y, 25, warning ? '#d8b073' : '#e2ecf5', 500, 'center');
        text('kPa', x, y + 20, 13, '#7f94ab', 400, 'center');
      }
      text('TPMS', 560, 312, 15, t.tpmsState?.warning ? '#d8b073' : '#7f94ab', 400, 'center');
    } else {
      // Home is the MBUX application grid from the reference cabin. Icons are a
      // launcher only; the right column keeps genuine vehicle readings.
      const background = c.createLinearGradient(0, 54, 0, 344);
      background.addColorStop(0, '#101a34'); background.addColorStop(.45, '#131a30');
      background.addColorStop(1, '#070b16');
      c.fillStyle = background; c.fillRect(0, 54, 960, 290);
      const halo = c.createRadialGradient(360, 250, 20, 360, 250, 420);
      halo.addColorStop(0, 'rgba(96,86,196,.34)'); halo.addColorStop(.55, 'rgba(48,58,128,.20)');
      halo.addColorStop(1, 'rgba(6,10,20,0)');
      c.fillStyle = halo; c.fillRect(0, 54, 660, 290);
      c.strokeStyle = 'rgba(150,170,220,.10)'; c.lineWidth = 1;
      for (let n = 0; n < 14; n++) {
        c.beginPath(); c.moveTo(n * 52, 344); c.lineTo(n * 52 + 150, 54); c.stroke();
      }
      // Five launcher tiles, matching the reference home screen.
      const apps: readonly (readonly [string, string])[] = [
        ['电话', '#48b06a'], ['导航', '#3f8fe0'], ['媒体', '#a854b8'],
        ['MB Apps', '#5c6470'], ['商店', '#4a9ad0'],
      ];
      apps.forEach(([label, tint], index) => {
        const x = 92 + index * 108, y = 168;
        c.fillStyle = 'rgba(236,240,248,.10)';
        c.beginPath(); c.roundRect(x - 30, y - 30, 60, 60, 14); c.fill();
        c.fillStyle = tint;
        c.beginPath(); c.roundRect(x - 24, y - 24, 48, 48, 11); c.fill();
        c.fillStyle = 'rgba(245,248,255,.92)';
        // Simple monochrome glyph per tile: handset, arrow, note, grid, bag.
        if (index === 0) {
          c.beginPath(); c.roundRect(x - 8, y - 12, 16, 24, 4); c.fill();
          c.fillStyle = tint; c.fillRect(x - 5, y - 9, 10, 14);
        } else if (index === 1) {
          c.beginPath(); c.moveTo(x - 2, y + 12); c.lineTo(x - 2, y - 8); c.lineTo(x - 10, y);
          c.moveTo(x - 2, y - 8); c.lineTo(x + 6, y); c.strokeStyle = 'rgba(245,248,255,.92)';
          c.lineWidth = 2.6; c.stroke();
        } else if (index === 2) {
          for (const [dx, h] of [[-8, 14], [0, 20], [8, 10]] as const) c.fillRect(x + dx - 2, y + 10 - h, 4, h);
        } else if (index === 3) {
          for (let r = 0; r < 2; r++) for (let q = 0; q < 2; q++) c.fillRect(x - 12 + q * 14, y - 12 + r * 14, 10, 10);
        } else {
          c.beginPath(); c.roundRect(x - 12, y - 6, 24, 18, 4); c.fill();
          c.beginPath(); c.arc(x, y - 6, 7, Math.PI, Math.PI * 2); c.strokeStyle = 'rgba(245,248,255,.92)';
          c.lineWidth = 2.2; c.stroke();
        }
        text(label, x, y + 40, 15, '#c9d6e8', 400, 'center');
      });
      // Real vehicle readings in the right column.
      c.fillStyle = 'rgba(10,16,30,.72)'; c.beginPath(); c.roundRect(660, 78, 276, 246, 10); c.fill();
      c.strokeStyle = '#26374f'; c.lineWidth = 1.2; c.beginPath(); c.roundRect(660, 78, 276, 246, 10); c.stroke();
      text('Vehicle status', 682, 102, 16, '#9db1c7', 500);
      const fuel = T.MathUtils.clamp(t.fuelLevel ?? .7, 0, 1);
      const rows: readonly (readonly [string, string])[] = [
        ['Drive mode', mode],
        ['Fuel', `${Math.round(fuel * 100)} %`],
        ['Coolant', `${Math.round(t.coolantTemperatureC ?? 90)} °C`],
        ['Gear', String(t.gear).replace(/^D/, 'D ')],
      ];
      rows.forEach(([label, value], index) => {
        const y = 140 + index * 34;
        text(label, 682, y, 15, '#8298b0');
        text(value, 914, y, 18, '#dde7f1', 500, 'right');
      });
      c.fillStyle = '#1d2c40'; c.fillRect(682, 288, 232, 1);
      text('Media', 682, 306, 14, '#8298b0');
      text('no source', 914, 306, 14, '#7d92a9', 400, 'right');
      text('Ambient', 682, 328, 13, '#8298b0');
      c.fillStyle = '#7c86e0'; c.fillRect(760, 323, 154, 3);
    }
    chrome();
    this.texture.needsUpdate = true;
  }

  private drawPassenger(on: boolean, mode: string, temperature: string, time: string): void {
    const c = this.passengerCanvas.getContext('2d')!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#05080e'; c.fillRect(0, 0, 720, 320);
    if (!on) return;
    const glow = c.createRadialGradient(150, 300, 10, 150, 300, 520);
    glow.addColorStop(0, 'rgba(96,110,196,.42)'); glow.addColorStop(.55, 'rgba(44,56,108,.22)');
    glow.addColorStop(1, 'rgba(5,8,14,0)');
    c.fillStyle = glow; c.fillRect(0, 0, 720, 320);
    const stripe = c.createLinearGradient(0, 0, 720, 320);
    stripe.addColorStop(0, 'rgba(126,140,214,.16)'); stripe.addColorStop(1, 'rgba(12,18,30,0)');
    c.fillStyle = stripe; c.fillRect(0, 0, 720, 320);
    c.strokeStyle = 'rgba(150,168,214,.22)'; c.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      c.beginPath(); c.moveTo(i * 44, 320); c.lineTo(i * 44 + 130, 0); c.stroke();
    }
    const text = (value: string, x: number, y: number, size: number, color: string,
      weight: 300 | 400 | 500 | 600 = 400, align: CanvasTextAlign = 'left') => {
      c.font = `${weight} ${size}px ${FONT}`; c.fillStyle = color;
      c.textAlign = align; c.textBaseline = 'middle'; c.fillText(value, x, y);
    };
    text('Mercedes-Benz', 42, 56, 24, '#dfe7f3', 500);
    text('PASSENGER DISPLAY', 678, 56, 13, '#8296b8', 400, 'right');
    text('Welcome', 42, 138, 44, '#eef3fa', 300);
    text('E 300 L · 尊贵型', 42, 186, 20, '#a8b8d4', 400);
    c.fillStyle = 'rgba(150,168,214,.28)'; c.fillRect(42, 214, 636, 1);
    text('Ambient', 42, 248, 15, '#7f93b3');
    const swatches = ['#7c86e0', '#8fb6d6', '#c8a6a0', '#96c0ae'];
    swatches.forEach((color, index) => {
      c.fillStyle = color; c.globalAlpha = index === 0 ? .95 : .34;
      c.beginPath(); c.arc(120 + index * 34, 248, 9, 0, Math.PI * 2); c.fill();
    });
    c.globalAlpha = 1;
    text(mode, 678, 248, 16, '#a8b8d4', 500, 'right');
    text(time, 678, 278, 15, '#7f93b3', 400, 'right');
    text(temperature, 42, 278, 15, '#7f93b3');
    c.strokeStyle = 'rgba(150,168,214,.20)'; c.lineWidth = 1.4;
    c.beginPath(); c.roundRect(1, 1, 718, 318, 8); c.stroke();
  }
}
