import * as T from 'three';
import { drawNavigationBanner } from '../../ui/NavigationDisplay';
import { drawLaneAssistSelection } from './LaneAssistSelectionDisplay';
import type { InstrumentClusterConfig, InstrumentTelemetry } from './InstrumentCluster';
import { mesh, rounded } from './MercedesE300LGeometry';
import { PROXIMITY_COLORS } from '../control/RearParkingProximity';
import { VehicleAssetRegistry } from './VehicleAssetRegistry';

/** 12.3-inch free-standing instrument panel: two round dials with a centre column. */
export const MERCEDES_INSTRUMENT_CANVAS = { width: 1080, height: 604 } as const;
export const MERCEDES_INSTRUMENT_FACE = { width: .300, height: .168 } as const;

const FONT = '"Segoe UI", "Microsoft YaHei", Arial, sans-serif';
const NUMERAL = '"Segoe UI Light", "Segoe UI", Arial, sans-serif';
const DIAL = { left: 252, right: 828, y: 296, radius: 196 } as const;
/** Gauge sweep: 135° at the bottom left, rising over the top to 405°. */
const SWEEP_START = 135, SWEEP_RANGE = 270;

interface ModeStyle { accent: string; needle: string; redline: string; warm: boolean }

const MODE_STYLES: Record<'COMFORT' | 'ECO' | 'SPORT', ModeStyle> = {
  COMFORT: { accent: '#9db0d8', needle: '#e8916a', redline: '#96535f', warm: false },
  ECO: { accent: '#84bda8', needle: '#8fc3b1', redline: '#6b7d84', warm: false },
  SPORT: { accent: '#e0906a', needle: '#f0553f', redline: '#c4463a', warm: true },
};

const driveModeName = (mode: InstrumentTelemetry['driveMode']): 'COMFORT' | 'ECO' | 'SPORT' =>
  mode === 'SPORT' ? 'SPORT' : mode === 'ECO' ? 'ECO' : 'COMFORT';

/**
 * Mercedes-Benz digital instrument face: analogue-style twin dials around the
 * centre gear/vehicle column, matching the reference cabin's cluster layout.
 * Every value comes from shared telemetry; nothing here invents a reading.
 */
export class MercedesE300LInstruments extends T.Group {
  public readonly canvas = document.createElement('canvas');
  public readonly texture: T.CanvasTexture;
  private readonly faceMaterial: T.MeshPhysicalMaterial;
  private elapsed = Infinity;
  private lastKey = '';
  private lastImmediate = '';

  public constructor(private readonly config: InstrumentClusterConfig,
    private readonly assets = new VehicleAssetRegistry()) {
    super(); this.name = 'Mercedes-Benz digital instrument panel';
    this.canvas.width = MERCEDES_INSTRUMENT_CANVAS.width;
    this.canvas.height = MERCEDES_INSTRUMENT_CANVAS.height;
    this.texture = new T.CanvasTexture(this.canvas);
    this.texture.colorSpace = T.SRGBColorSpace; this.texture.anisotropy = 4;
    const housing = new T.MeshPhysicalMaterial({ color: 0x07090d, roughness: .30, metalness: .18,
      clearcoat: .45, clearcoatRoughness: .22 });
    this.add(rounded('Mercedes instrument bezel', [.326, .194, .022], [0, 0, 0], housing, .010));
    this.faceMaterial = new T.MeshPhysicalMaterial({ color: 0x080d14, map: this.texture,
      emissive: 0xffffff, emissiveMap: this.texture, emissiveIntensity: 1, roughness: .18, metalness: 0,
      specularIntensity: .20, clearcoat: .20, clearcoatRoughness: .20, envMapIntensity: .08, toneMapped: false });
    const face = mesh('Mercedes digital instrument display',
      new T.PlaneGeometry(MERCEDES_INSTRUMENT_FACE.width, MERCEDES_INSTRUMENT_FACE.height), this.faceMaterial);
    face.position.z = .0115; this.add(face);
    this.update({ speedKmh: 0, rpm: 700, gear: 'P', driveMode: 'NORMAL', fuelLevel: .7, coolantTemperatureC: 90 });
  }

  public update(t: InstrumentTelemetry, deltaTime = 1 / 60): void {
    const on = t.ignitionOn ?? t.engineRunning ?? true;
    this.faceMaterial.emissiveIntensity = on ? .72 + .28 * T.MathUtils.clamp(t.ambientDaylight ?? 1, 0, 1) : 0;
    this.faceMaterial.color.setScalar(on ? .05 : 0);
    this.faceMaterial.envMapIntensity = on ? .08 : 0;
    this.elapsed += Math.max(0, deltaTime);
    const i = t.indicators ?? {};
    const immediate = [t.laneAssist?.version, on, t.gear, t.driveMode, i.positionLights, i.headlights,
      i.highBeam, i.frontFogLights, i.rearFogLights, i.fogLights, i.leftTurn, i.rightTurn, i.parkingBrake,
      i.autoHold, i.absWarning, i.tcsActive, i.escActive, i.tcsOff, i.escOff, i.engineWarning, i.cruise,
      t.tpmsState?.warning, t.startStopState?.state].join('|');
    const key = [Math.round(Math.abs(t.speedKmh)), Math.round(t.rpm / 25), t.driveMode,
      Math.round((t.fuelLevel ?? .7) * 100), Math.round(t.coolantTemperatureC ?? 90),
      Math.round(t.trip?.totalDistanceKm ?? -1), t.cruiseTargetSpeedKmh,
      t.outsideTemperatureC === undefined ? 'x' : t.outsideTemperatureC.toFixed(1),
      t.drivingScene?.version, t.sharedVehicle?.navigation.guidance?.version, immediate].join('|');
    if (key === this.lastKey || (this.elapsed < .05 && immediate === this.lastImmediate)) return;
    this.elapsed = 0; this.lastKey = key; this.lastImmediate = immediate;

    const c = this.canvas.getContext('2d')!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#03060a'; c.fillRect(0, 0, 1080, 604);
    if (!on) { this.texture.needsUpdate = true; return; }
    const mode = driveModeName(t.driveMode);
    const style = MODE_STYLES[mode];
    const text = (value: string, x: number, y: number, size: number, color = '#e6ecf4',
      weight: 300 | 400 | 500 | 600 = 400, align: CanvasTextAlign = 'center', font = FONT) => {
      c.font = `${weight} ${size}px ${font}`; c.fillStyle = color;
      c.textAlign = align; c.textBaseline = 'middle'; c.fillText(value, x, y);
    };
    const polar = (cx: number, cy: number, radius: number, fraction: number): [number, number] => {
      const angle = (SWEEP_START + SWEEP_RANGE * T.MathUtils.clamp(fraction, 0, 1)) * Math.PI / 180;
      return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
    };

    // Static artwork is rasterized once per mode and then shared by every car.
    const artwork = this.assets.canvas(
      `mercedes-instrument/${mode}/${this.config.maximumSpeedKmh}/${this.config.maximumRPM}/${this.config.redlineRPM}`,
      1080, 604, context => {
        const background = context.createLinearGradient(0, 0, 0, 604);
        background.addColorStop(0, style.warm ? '#141019' : '#070f19');
        background.addColorStop(.55, style.warm ? '#0e1119' : '#08121e');
        background.addColorStop(1, '#02050a');
        context.fillStyle = background; context.fillRect(0, 0, 1080, 604);
        const glow = context.createRadialGradient(540, 330, 20, 540, 330, 430);
        glow.addColorStop(0, style.warm ? 'rgba(78,52,56,.42)' : 'rgba(34,54,96,.45)');
        glow.addColorStop(1, 'rgba(3,7,12,0)');
        context.fillStyle = glow; context.fillRect(90, 80, 900, 470);
        // Two inset dial wells, as on the reference cluster.
        for (const centre of [DIAL.left, DIAL.right]) {
          const well = context.createRadialGradient(centre, DIAL.y, 20, centre, DIAL.y, DIAL.radius + 16);
          well.addColorStop(0, style.warm ? 'rgba(46,30,34,.55)' : 'rgba(16,28,48,.60)');
          well.addColorStop(.72, style.warm ? 'rgba(24,18,24,.30)' : 'rgba(9,17,30,.35)');
          well.addColorStop(1, 'rgba(3,7,13,0)');
          context.fillStyle = well; context.beginPath();
          context.arc(centre, DIAL.y, DIAL.radius + 16, 0, Math.PI * 2); context.fill();
          context.strokeStyle = style.warm ? 'rgba(196,146,110,.28)' : 'rgba(150,172,208,.26)';
          context.lineWidth = 2;
          context.beginPath(); context.arc(centre, DIAL.y, DIAL.radius + 10, 0, Math.PI * 2); context.stroke();
        }
        // Diamond weave across the centre column, the marque's cockpit texture.
        context.strokeStyle = style.warm ? 'rgba(148,116,96,.10)' : 'rgba(112,138,190,.11)';
        context.lineWidth = 1;
        for (let n = 0; n < 16; n++) {
          context.beginPath(); context.moveTo(300 + n * 34, 604); context.lineTo(520 + n * 34, 150); context.stroke();
          context.beginPath(); context.moveTo(300 + n * 34, 150); context.lineTo(520 + n * 34, 604); context.stroke();
        }
      });
    c.drawImage(artwork, 0, 0);

    // ---- Speedometer (left) and engine speed (right) ----------------------
    const dial = (centreX: number, maximum: number, value: number, majorStep: number, divisor: number,
      label: string, redlineFraction?: number) => {
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(128,146,172,.30)'; c.lineWidth = 3;
      c.beginPath();
      for (let step = 0; step <= 90; step++) {
        const point = polar(centreX, DIAL.y, DIAL.radius - 6, step / 90);
        if (step === 0) c.moveTo(point[0], point[1]); else c.lineTo(point[0], point[1]);
      }
      c.stroke();
      if (redlineFraction !== undefined) {
        c.strokeStyle = style.redline; c.lineWidth = 5;
        c.beginPath();
        for (let step = 0; step <= 24; step++) {
          const point = polar(centreX, DIAL.y, DIAL.radius - 6,
            redlineFraction + (1 - redlineFraction) * step / 24);
          if (step === 0) c.moveTo(point[0], point[1]); else c.lineTo(point[0], point[1]);
        }
        c.stroke();
      }
      // Lit progress arc follows the real needle value.
      c.strokeStyle = style.accent; c.lineWidth = 6;
      c.beginPath();
      const filled = Math.round(T.MathUtils.clamp(value / maximum, 0, 1) * 90);
      for (let step = 0; step <= filled; step++) {
        const point = polar(centreX, DIAL.y, DIAL.radius - 6, step / 90);
        if (step === 0) c.moveTo(point[0], point[1]); else c.lineTo(point[0], point[1]);
      }
      c.stroke();
      // Ticks and numerals outside the arc.
      for (let number = 0; number <= maximum; number += majorStep / 5) {
        const fraction = number / maximum;
        const major = Math.abs(number / majorStep - Math.round(number / majorStep)) < 1e-6;
        const outer = polar(centreX, DIAL.y, DIAL.radius + 9, fraction);
        const inner = polar(centreX, DIAL.y, DIAL.radius + (major ? -9 : -2), fraction);
        c.strokeStyle = major ? '#cfd9e4' : 'rgba(150,168,190,.60)';
        c.lineWidth = major ? 2.4 : 1.3;
        c.beginPath(); c.moveTo(inner[0], inner[1]); c.lineTo(outer[0], outer[1]); c.stroke();
        if (!major) continue;
        const labelPoint = polar(centreX, DIAL.y, DIAL.radius + 34, fraction);
        text(String(Math.round(number / divisor)), labelPoint[0], labelPoint[1], 21, '#a8b9ca',
          400, 'center', NUMERAL);
      }
      // Needle and hub.
      const tip = polar(centreX, DIAL.y, DIAL.radius - 22, value / maximum);
      const tail = polar(centreX, DIAL.y, -16, value / maximum);
      c.strokeStyle = style.needle; c.lineWidth = 4.4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(tail[0], tail[1]); c.lineTo(tip[0], tip[1]); c.stroke();
      c.fillStyle = '#151b23'; c.beginPath(); c.arc(centreX, DIAL.y, 11, 0, Math.PI * 2); c.fill();
      c.strokeStyle = style.needle; c.lineWidth = 2.4;
      c.beginPath(); c.arc(centreX, DIAL.y, 11, 0, Math.PI * 2); c.stroke();
      text(label, centreX, DIAL.y - 52, 18, '#8496ad', 400, 'center');
    };
    const speed = Math.min(Math.abs(t.speedKmh), this.config.maximumSpeedKmh);
    const rpm = Math.max(0, t.rpm);
    dial(DIAL.left, this.config.maximumSpeedKmh, speed, 20, 1, 'km/h');
    dial(DIAL.right, this.config.maximumRPM, rpm, 1000, 1000, '1/min ×1000',
      this.config.redlineRPM / this.config.maximumRPM);
    // Prominent digital speed inside the left dial, as the reference cluster shows.
    text(String(Math.round(speed)), DIAL.left, DIAL.y + 92, 74, '#f2f6fb', 300, 'center', NUMERAL);
    text(String(Math.round(rpm / 10) * 10), DIAL.right, DIAL.y + 96, 44, style.accent, 300, 'center', NUMERAL);

    // ---- Centre column: mode, PRND, vehicle and status ---------------------
    text(mode, 540, 72, 26, style.accent, 600);
    const gear = typeof t.gear === 'number' ? String(t.gear) : t.gear.replace(/^D/i, '') || 'N';
    text(gear, 540, 236, 128, '#f3f7fb', 300, 'center', NUMERAL);
    text('GEAR', 540, 320, 19, '#7d90a8', 500);
    if (t.cruiseTargetSpeedKmh !== undefined && t.cruiseTargetSpeedKmh > 0 && i.cruise)
      text(`CRUISE  ${Math.round(t.cruiseTargetSpeedKmh)}`, 540, 126, 21, '#8fc0e0', 500);
    if (t.startStopState?.state === 'AUTO_STOPPED') text('AUTO STOP', 540, 372, 20, '#7cc0a4', 500);
    else if (i.autoHold) text('HOLD', 540, 372, 20, '#7cc0a4', 500);
    if (t.outsideTemperatureC !== undefined)
      text(`${t.outsideTemperatureC.toFixed(1)} °C`, 540, 424, 21, '#93a6bc', 400);
    const guidance = t.sharedVehicle?.navigation.guidance;
    if (guidance) drawNavigationBanner(c, guidance, { x: 452, y: 400, width: 300, height: 96 }, true);
    else drawMercedesCar(c, 540, 452, .52);
    // Shared lane geometry and proximity zones only; nothing is sensed here.
    const scene = t.drivingScene;
    if (scene && (scene.lanes.length > 0 || scene.proximity.active)) {
      c.save(); c.beginPath(); c.rect(452, 372, 300, 110); c.clip();
      for (const line of scene.lanes) {
        c.strokeStyle = 'rgba(140,166,196,.40)'; c.lineWidth = 1.6; c.beginPath();
        line.forEach((point, index) => {
          const x = 602 + point.x * 26, y = 486 - point.forward * 1.8;
          if (index) c.lineTo(x, y); else c.moveTo(x, y);
        });
        c.stroke();
      }
      if (scene.proximity.active) scene.proximity.zones.forEach((zone, index) => {
        if (zone.distanceM === null) return;
        const angle = -Math.PI / 2 + index * Math.PI / 4;
        c.strokeStyle = PROXIMITY_COLORS[zone.severity]; c.lineWidth = 2.4;
        c.beginPath(); c.arc(602 + Math.cos(angle) * 86, 448 + Math.sin(angle) * 40, 7, 0, Math.PI * 2);
        c.stroke();
      });
      c.restore();
    }

    // ---- Fuel, coolant, trip and warning row ------------------------------
    const fuel = T.MathUtils.clamp(t.fuelLevel ?? .7, 0, 1);
    drawMercedesSymbol(c, 'fuel', 66, 556, fuel < .12 ? '#d8b073' : '#93a7bd');
    text(`${Math.round(fuel * 100)} %`, 92, 556, 21, '#93a7bd', 400, 'left');
    c.fillStyle = 'rgba(118,136,166,.22)'; c.fillRect(170, 552, 132, 6);
    c.fillStyle = fuel < .12 ? '#d8b073' : style.accent; c.fillRect(170, 552, 132 * fuel, 6);
    drawMercedesSymbol(c, 'temperature', 916, 556, '#93a7bd');
    text(`${Math.round(t.coolantTemperatureC ?? 90)} °C`, 942, 556, 21, '#93a7bd', 400, 'left');
    if (t.trip && Number.isFinite(t.trip.totalDistanceKm))
      text(`${Math.round(t.trip.totalDistanceKm)} km`, 540, 556, 19, '#7f92a8', 400);
    if (t.tpmsState?.warning) text('TPMS', 700, 556, 19, '#d8b073', 500);
    drawMercedesLighting(c, i);
    drawMercedesWarnings(c, i, on && !t.engineRunning && t.startStopState?.state !== 'AUTO_STOPPED');
    for (const [active, x, direction] of [[i.leftTurn, 108, 1], [i.rightTurn, 972, -1]] as const) {
      if (!active) continue;
      c.save(); c.translate(x, 56); c.scale(direction, 1); c.fillStyle = '#6fd0a0';
      c.beginPath(); c.moveTo(-22, 0); c.lineTo(-4, -14); c.lineTo(-4, -5.5); c.lineTo(18, -5.5);
      c.lineTo(18, 5.5); c.lineTo(-4, 5.5); c.lineTo(-4, 14); c.closePath(); c.fill(); c.restore();
    }
    drawLaneAssistSelection(c, t.laneAssist, 'mercedes', 540, 594, .8);
    this.texture.needsUpdate = true;
  }
}

/** Small rear-view saloon, the reference cluster's centre illustration. */
function drawMercedesCar(c: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  c.save(); c.translate(x, y); c.scale(scale, scale);
  const paint = c.createLinearGradient(-46, 0, 46, 0);
  paint.addColorStop(0, '#2f3f4e'); paint.addColorStop(.45, '#586d7e'); paint.addColorStop(1, '#2a3846');
  c.fillStyle = paint; c.beginPath();
  c.moveTo(-34, -22); c.lineTo(-40, -6); c.lineTo(-44, 12); c.lineTo(-40, 26);
  c.lineTo(40, 26); c.lineTo(44, 12); c.lineTo(40, -6); c.lineTo(34, -22);
  c.quadraticCurveTo(0, -28, -34, -22); c.closePath(); c.fill();
  c.fillStyle = '#101b26'; c.beginPath();
  c.moveTo(-30, -18); c.lineTo(-24, -34); c.lineTo(24, -34); c.lineTo(30, -18); c.closePath(); c.fill();
  c.strokeStyle = '#7d8f9e'; c.lineWidth = 1.4;
  c.beginPath(); c.moveTo(-30, -18); c.lineTo(-24, -34); c.lineTo(24, -34); c.lineTo(30, -18);
  c.closePath(); c.stroke();
  c.strokeStyle = '#a2474c'; c.lineWidth = 2.2;
  c.beginPath(); c.moveTo(-44, 8); c.lineTo(-14, 6); c.moveTo(44, 8); c.lineTo(14, 6); c.stroke();
  c.strokeStyle = '#4d5b68'; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(-44, 20); c.lineTo(44, 20); c.stroke();
  c.fillStyle = '#0b1219'; c.fillRect(-40, 8, 9, 9); c.fillRect(31, 8, 9, 9);
  c.restore();
}

/** Standard lamp pictograms; only controller state selects which are drawn. */
function drawMercedesLighting(c: CanvasRenderingContext2D,
  i: NonNullable<InstrumentTelemetry['indicators']>): void {
  const lamp = (x: number, y: number, color: string, dipped: boolean, fog = false, rear = false) => {
    c.save(); c.translate(x, y); c.scale(rear ? -.66 : .66, .66);
    c.strokeStyle = color; c.lineWidth = 3.4; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.arc(0, 0, 15, Math.PI * .30, Math.PI * 1.70); c.stroke();
    for (let ray = 0; ray < 4; ray++) {
      const py = -11 + ray * 7.4;
      c.beginPath(); c.moveTo(-19, py); c.lineTo(-40, py + (dipped ? 7 : 0)); c.stroke();
    }
    if (fog) { c.beginPath(); c.moveTo(-14, -22); c.bezierCurveTo(-24, -12, -6, -6, -16, 4);
      c.bezierCurveTo(-26, 14, -8, 20, -18, 26); c.stroke(); }
    c.restore();
  };
  if (i.positionLights) {
    c.save(); c.translate(304, 56); c.scale(.66, .66); c.strokeStyle = '#6fd0a0';
    c.lineWidth = 2.6; c.lineCap = 'round';
    for (const sign of [-1, 1]) {
      c.beginPath(); c.moveTo(sign * 6, -11); c.lineTo(sign * 6, 11);
      c.bezierCurveTo(sign * 21, 11, sign * 21, -11, sign * 6, -11); c.stroke();
      for (let ray = 0; ray < 3; ray++) {
        const py = (ray - 1) * 9;
        c.beginPath(); c.moveTo(sign * 23, py); c.lineTo(sign * 33, py); c.stroke();
      }
    }
    c.restore();
  }
  if (i.headlights) lamp(252, 56, '#6fd0a0', true);
  if (i.highBeam) lamp(200, 56, '#5aa0ff', false);
  if (i.frontFogLights ?? i.fogLights) lamp(150, 56, '#6fd0a0', true, true);
  if (i.rearFogLights ?? i.fogLights) lamp(104, 56, '#d8b073', false, true, true);
}

/** Small status pictograms; numeric values remain live telemetry. */
function drawMercedesSymbol(c: CanvasRenderingContext2D, kind: 'fuel' | 'temperature',
  x: number, y: number, color: string): void {
  c.save(); c.translate(x, y); c.strokeStyle = color; c.fillStyle = color;
  c.lineWidth = 2; c.lineCap = 'round'; c.lineJoin = 'round';
  if (kind === 'fuel') {
    c.beginPath(); c.roundRect(-8, -13, 14, 25, 2); c.stroke();
    c.beginPath(); c.rect(-5, -9, 8, 7); c.stroke();
    c.beginPath(); c.moveTo(-11, 12); c.lineTo(8, 12); c.moveTo(5, -3); c.lineTo(8, -3);
    c.quadraticCurveTo(11, -3, 11, 1); c.lineTo(11, 5); c.quadraticCurveTo(11, 10, 15, 10);
    c.quadraticCurveTo(19, 10, 19, 5); c.lineTo(19, -6); c.lineTo(14, -11);
    c.moveTo(15, -9); c.lineTo(15, -4); c.lineTo(19, -2); c.stroke();
  } else {
    c.beginPath(); c.moveTo(-3, 2); c.lineTo(-3, -10); c.quadraticCurveTo(0, -16, 3, -10);
    c.lineTo(3, 2); c.arc(0, 6, 5.2, -Math.PI / 4, Math.PI * 1.25); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(0, -6); c.lineTo(0, 6); c.moveTo(4, -7); c.lineTo(9, -7); c.stroke();
    c.beginPath(); c.arc(0, 6, 2.1, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}

function drawMercedesWarnings(c: CanvasRenderingContext2D,
  i: NonNullable<InstrumentTelemetry['indicators']>, engineStopped: boolean): void {
  const round = (x: number, y: number, label: string, color: string) => {
    c.save(); c.translate(x, y); c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 2.2;
    c.beginPath(); c.arc(0, 0, 14, 0, Math.PI * 2); c.stroke();
    for (const sign of [-1, 1]) {
      c.beginPath(); c.moveTo(sign * 20, -15); c.quadraticCurveTo(sign * 29, 0, sign * 20, 15); c.stroke();
    }
    c.font = `500 ${label.length > 2 ? 10 : 18}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(label, 0, 1); c.restore();
  };
  if (i.parkingBrake) round(900, 56, 'P', '#e2787c');
  if (i.absWarning) round(948, 56, 'ABS', '#d8b073');
  if (i.engineWarning || engineStopped) {
    c.save(); c.translate(996, 56); c.strokeStyle = '#d8b073'; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(-20, -6); c.lineTo(-11, -6); c.lineTo(-7, -12); c.lineTo(10, -12);
    c.lineTo(15, -5); c.lineTo(21, -5); c.lineTo(21, 11); c.lineTo(15, 11); c.lineTo(11, 16);
    c.lineTo(-14, 16); c.lineTo(-20, 7); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(-5, -19); c.lineTo(7, -19); c.moveTo(1, -19); c.lineTo(1, -12); c.stroke();
    c.restore();
  }
  if (i.tcsActive || i.escActive || i.tcsOff || i.escOff) {
    c.save(); c.translate(840, 56); c.strokeStyle = '#d8b073'; c.lineWidth = 2.1;
    c.beginPath(); c.moveTo(-16, 5); c.lineTo(-13, -7); c.lineTo(-7, -15); c.lineTo(7, -15);
    c.lineTo(13, -7); c.lineTo(16, 5); c.closePath(); c.stroke();
    for (const x of [-10, 10]) {
      c.beginPath(); c.moveTo(x, 10); c.bezierCurveTo(x - 8, 15, x + 9, 20, x, 27); c.stroke();
    }
    c.restore();
  }
}
