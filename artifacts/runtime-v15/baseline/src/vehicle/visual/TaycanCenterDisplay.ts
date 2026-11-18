import * as T from 'three';
import { AdaptiveMapZoom } from '../../ui/LocalRoadMap';
import { drawNavigationBanner } from '../../ui/NavigationDisplay';
import type { InstrumentTelemetry } from './InstrumentCluster';
import type { VehicleAssetRegistry } from './VehicleAssetRegistry';
import { TaycanDisplaySurface, text, line, taycanBrightness, TAYCAN_COLORS as C } from './TaycanDisplaySurface';
import { taycanSymbolAtlas, drawTaycanSymbol, drawTaycanPlan } from './TaycanSymbols';
import { tyrePressureReading, tyrePressureWarning, tpmsDisplayKey } from './LuxuryVehicleStatusPage';
import type { TaycanInstrumentPage } from './PremiumEVInstruments';
import { PROXIMITY_COLORS } from '../control/RearParkingProximity';

export type TaycanCenterPage = 'navigation' | 'media' | 'vehicle' | 'parking';
export type TaycanVehiclePage = 'drive' | 'assist' | 'energy' | 'status';
const W = 1200, H = 500;
const APPS = ['home', 'navigation', 'media', 'vehicle', 'parking'] as const;
const TABS = ['drive', 'assist', 'energy', 'status'] as const;
const staticFace = (c: CanvasRenderingContext2D): void => {
  c.fillStyle = '#06080b'; c.fillRect(0, 0, W, H); c.fillStyle = '#0b0e12'; c.fillRect(0, 0, 77, H); c.fillRect(1120, 0, 80, H);
  line(c, 78, 0, 78, H, '#242a30'); line(c, 1120, 0, 1120, H, '#242a30');
};

/** Porsche PCM skin borrowing shared map/proximity/status, with no sensor or route ownership. */
export class TaycanCenterDisplay extends T.Group {
  public readonly surface: TaycanDisplaySurface;
  public page: TaycanCenterPage = 'navigation';
  public vehiclePage: TaycanVehiclePage = 'drive';
  public onInstrumentPage?: (page: TaycanInstrumentPage) => void;
  private readonly chrome;
  private readonly content;
  private readonly atlas: HTMLCanvasElement;
  private readonly mapCanvas = document.createElement('canvas');
  private readonly zoom = new AdaptiveMapZoom();
  private latest: InstrumentTelemetry = { speedKmh: 0, rpm: 0, gear: 'P' };
  private priorPage: TaycanCenterPage = 'navigation';
  private reverse = false;
  private parkingExit = 0;
  private on = true;
  private startup = 0;
  private pageFade = 1;
  private clockElapsed = Infinity;
  private time = '';
  private readonly date = new Date();
  public mapDraws = 0;
  public constructor(assets: VehicleAssetRegistry) {
    super(); this.name = 'Taycan center infotainment'; this.atlas = taycanSymbolAtlas(assets);
    this.surface = new TaycanDisplaySurface(W, H, .425, .177, 'Taycan PCM', staticFace, assets); this.add(this.surface);
    this.chrome = this.surface.region({ x: 0, y: 0, width: W, height: H }, 'Taycan PCM chrome');
    this.content = this.surface.region({ x: 93, y: 84, width: 1010, height: 398 }, 'Taycan PCM current page');
    this.mapCanvas.width = 1010; this.mapCanvas.height = 398;
  }
  public selectPage(page: TaycanCenterPage): void {
    if (this.page === page) return;
    this.page = page; this.pageFade = .5; this.chrome.invalidate(); this.content.invalidate();
  }
  public selectVehiclePage(page: TaycanVehiclePage): void {
    if (this.vehiclePage === page) return;
    this.vehiclePage = page; this.selectPage('vehicle'); this.chrome.invalidate(); this.content.invalidate();
  }
  public cyclePage(): void {
    const order: TaycanCenterPage[] = ['navigation', 'vehicle', 'media'];
    if (!this.reverse) this.selectPage(order[(order.indexOf(this.page) + 1) % order.length]!);
  }
  public click(uv: T.Vector2): boolean {
    if (!this.on) return false;
    const x = uv.x * W, y = (1 - uv.y) * H;
    if (x < 77) {
      const app = APPS[Math.max(0, Math.min(4, Math.floor((y - 5) / 100)))];
      if (this.reverse && app !== 'parking') return false;
      if (app === 'parking' && String(this.latest.gear).charAt(0) !== 'P' && !this.reverse) return false;
      this.selectPage(app === 'home' ? 'navigation' : app!); return true;
    }
    if (this.page === 'vehicle' && y < 80 && x > 100 && x < 1100) { this.selectVehiclePage(TABS[Math.min(3, Math.floor((x - 100) / 250))]!); return true; }
    if (this.page === 'vehicle' && this.vehiclePage === 'drive' && y > 420 && x > 220 && x < 920) {
      this.onInstrumentPage?.(x < 455 ? 'driving' : x < 690 ? 'assistance' : 'navigation'); return true;
    }
    return false;
  }
  public update(t: InstrumentTelemetry, dt: number): void {
    this.latest = t; this.surface.advance(dt); this.clockElapsed += dt;
    const selector = String(t.gear).charAt(0), reverse = selector === 'R';
    if (reverse && !this.reverse) { this.priorPage = this.page === 'parking' ? 'navigation' : this.page; this.selectPage('parking'); this.parkingExit = 0; }
    if (!reverse && this.reverse) this.parkingExit = 1.2;
    this.reverse = reverse;
    if (!reverse && this.parkingExit > 0) { this.parkingExit = Math.max(0, this.parkingExit - dt); if (this.parkingExit === 0) this.selectPage(this.priorPage); }
    if (reverse && this.page !== 'parking') this.selectPage('parking');
    const on = t.ignitionOn ?? true;
    if (on !== this.on) { this.on = on; this.startup = 0; }
    this.startup = Math.min(1, this.startup + dt); this.pageFade = Math.min(1, this.pageFade + dt * 4);
    this.surface.luminance(taycanBrightness(t.ambientDaylight, !!t.indicators?.headlights), dt, on ? T.MathUtils.smoothstep(this.startup, .25, .8) : 0);
    this.content.material.opacity *= this.pageFade;
    if (!on) return;
    if (this.clockElapsed >= 1) { this.date.setTime(Date.now()); this.time = this.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); this.clockElapsed = 0; }
    this.chrome.update(`${this.page}|${this.vehiclePage}|${this.time}|${t.ev?.stateOfCharge.toFixed(2)}|${selector}`, .1, this.drawChrome);
    const n = t.sharedVehicle?.navigation;
    if (this.page === 'navigation') {
      const view = this.zoom.update(dt, t.speedKmh / 3.6, n?.complexity ?? 0, selector);
      const mapKey = n?.map.available ? `${n.map.version}|${n.pose.x.toFixed(1)}|${n.pose.z.toFixed(1)}|${n.pose.yaw.toFixed(2)}|${view.toFixed(0)}|${n.roadName}|${n.speedLimit}` : 'navigation-empty';
      this.content.update(mapKey+'|'+n?.guidance?.version, .1, this.drawMap);
    } else if (this.page === 'parking') {
      const p = t.sharedVehicle?.parking, r = t.sharedVehicle?.rearParking;
      this.content.update(`${p?.active}|${p?.zones.map(z => `${z.severity}:${z.distanceM?.toFixed(2)}`).join(',')}|${r?.zones.map(z => `${z.severity}:${z.distanceM?.toFixed(2)}`).join(',')}|${selector}`, .1, this.drawParking);
    } else if (this.page === 'vehicle') {
      const e = t.ev, a = t.sharedVehicle?.lateralAssist, chassis = t.chassisStatus;
      let key: string;
      if (this.vehiclePage === 'energy') key = `${e?.stateOfCharge.toFixed(3)}|${Math.round(e?.estimatedRangeKm ?? 0)}|${Math.round(e?.batteryPowerKw ?? 0)}|${Math.round(e?.regenPowerKw ?? 0)}|${e?.averageConsumptionKWhPer100km?.toFixed(1)}|${e?.tripEnergyConsumedKWh.toFixed(2)}|${e?.tripEnergyRecoveredKWh.toFixed(2)}`;
      else if (this.vehiclePage === 'status') key = `${tpmsDisplayKey(t.tpmsState ?? t.sharedVehicle?.tpmsState, t.tyres)}|${t.indicators?.parkingBrake}|${t.indicators?.headlights}|${t.indicators?.batteryWarning}|${t.indicators?.absWarning}|${e?.thermalDerateFraction! > .15}`;
      else if (this.vehiclePage === 'assist') key = `${t.assistCapabilities?.lka}|${t.assistCapabilities?.lcc}|${a?.lkaState}|${a?.lccState}|${a?.laneValid}|${a?.correctingSide}`;
      else key = `${t.driveMode}|${chassis?.dampingMode}|${chassis?.rideHeight.toFixed(3)}|${chassis?.targetHeight.toFixed(3)}|${chassis?.electricSoundPresence}`;
      this.content.update(this.vehiclePage + key, this.vehiclePage === 'energy' ? 1 / 30 : this.vehiclePage === 'status' ? .5 : .1, this.drawVehicle);
    } else this.content.update('media-empty', .5, this.drawMedia);
  }
  private drawChrome = (c: CanvasRenderingContext2D): void => {
    for (const [index, app] of APPS.entries()) {
      const y = 48 + index * 100, active = this.page === app;
      c.globalAlpha = active ? 1 : .56; drawTaycanSymbol(c, this.atlas, app, 39, y, 34); c.globalAlpha = 1;
      if (active) { c.fillStyle = C.blue; c.fillRect(73, y - 25, 2, 50); }
    }
    text(c, this.time, 1160, 38, 23, C.white, 'center');
    text(c, this.latest.ev ? `${Math.round(this.latest.ev.stateOfCharge * 100)}%` : '--', 1160, 459, 23, C.secondary, 'center');
    if (this.page === 'vehicle') for (const [index, tab] of TABS.entries()) {
      text(c, tab === 'status' ? 'Status' : tab.charAt(0).toUpperCase() + tab.slice(1), 225 + index * 250, 46, 27, this.vehiclePage === tab ? C.white : C.secondary, 'center');
      if (this.vehiclePage === tab) { c.fillStyle = '#1a303f'; c.fillRect(130 + index * 250, 72, 190, 2); }
    } else text(c, this.page === 'navigation' ? 'Navigation' : this.page === 'parking' ? 'Surround / Rear' : 'Media', 110, 46, 29, C.white);
    line(c, 105, 77, 1100, 77, '#30363d');
  };
  private drawMap = (c: CanvasRenderingContext2D): void => {
    const nav = this.latest.sharedVehicle?.navigation;
    if (!nav?.map.available) { text(c, 'Navigation', 600, 236, 35, C.white, 'center'); text(c, 'Road information not available', 600, 292, 25, C.secondary, 'center'); return; }
    const m = this.mapCanvas.getContext('2d'); if (!m) return;
    nav.map.draw(m, { x: 0, y: 0, width: 1010, height: 398 }, nav.pose.x, nav.pose.z, nav.pose.yaw, this.zoom.viewMetres);
    this.mapDraws++;
    c.save(); c.filter = 'invert(1) grayscale(1) brightness(1.65)'; c.drawImage(this.mapCanvas, 93, 84); c.restore();
    const road = nav.currentRoad, bounds = nav.nearbyNetwork?.bounds;
    if (road && bounds) {
      const scale = 1010 / this.zoom.viewMetres;
      c.save(); c.beginPath(); c.rect(93, 84, 1010, 398); c.clip(); c.strokeStyle = '#64899b'; c.globalAlpha = .6; c.lineWidth = 3;
      c.beginPath(); road.centerline.forEach((p, index) => {
        const x = 598 + (p.x - nav.pose.x) * scale, y = 283 + (p.z - nav.pose.z) * scale;
        index ? c.lineTo(x, y) : c.moveTo(x, y);
      }); c.stroke(); c.restore();
    }
    c.save(); c.translate(598, 283); c.rotate(-nav.pose.yaw); c.fillStyle = '#dbe8ee'; c.strokeStyle = '#0c171e'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -18); c.lineTo(11, 12); c.lineTo(0, 7); c.lineTo(-11, 12); c.closePath(); c.fill(); c.stroke(); c.restore();
    c.fillStyle = '#0b1015'; c.fillRect(110, 416, 420, 51);
    text(c, nav.roadName ?? 'Current road', 129, 441, 25, C.white);
    if (nav.speedLimit != null) text(c, `${nav.speedLimit} km/h`, 507, 441, 24, C.secondary, 'right');
    text(c, 'N', 1068, 112, 22, C.secondary, 'center');
    nav.map.drawNavigation(c,{x:93,y:84,width:1010,height:398},nav.pose.x,nav.pose.z,this.zoom.viewMetres,nav.pose.yaw);
    drawNavigationBanner(c,nav.guidance,{x:112,y:100,width:510,height:118});
    line(c, 975, 446, 1078, 446, '#b1bdc7'); text(c, `${Math.round(this.zoom.viewMetres * 103 / 1010)} m`, 1078, 425, 18, C.secondary, 'right');
  };
  private drawVehicle = (c: CanvasRenderingContext2D): void => {
    const t = this.latest, e = t.ev, chassis = t.chassisStatus;
    if (this.vehiclePage === 'drive') {
      const entries = [ ['Driving mode', (t.driveMode ?? 'NORMAL').replace('_', ' ')], ['Chassis', (chassis?.dampingMode ?? '--').replace('_', ' ')],
        ['Ride height', chassis ? chassis.targetHeight < chassis.nominalHeight - .004 ? 'LOW' : 'NORMAL' : '--'],
        ['Electronic sound', chassis ? chassis.electricSoundPresence > 1 ? 'Performance' : 'Standard' : '--'] ];
      for (const [index, row] of entries.entries()) {
        text(c, row[0]!, 128, 135 + index * 69, 26, C.white); text(c, row[1]!, 616, 135 + index * 69, 24, C.secondary, 'right'); line(c, 124, 169 + index * 69, 620, 169 + index * 69);
      }
      this.frontGraphic(c, 862, 247);
      text(c, 'Instrument view', 129, 442, 20, C.secondary);
      for (const [index, label] of ['Driving', 'Assistance', 'Navigation'].entries()) text(c, label, 337 + index * 232, 442, 22, C.white, 'center');
    } else if (this.vehiclePage === 'assist') {
      const a = t.sharedVehicle?.lateralAssist;
      const state = (supported: boolean | undefined, value: string | undefined): string => !supported ? 'Not equipped' : value === 'ACTIVE' || value?.startsWith('CORRECTING') ? 'ACTIVE' : value === 'READY' ? 'AVAILABLE' : value === 'OFF' ? 'OFF' : 'UNAVAILABLE';
      const lka = state(t.assistCapabilities?.lka, a?.lkaState), lcc = state(t.assistCapabilities?.lcc, a?.lccState);
      text(c, 'Lane Keeping Assist', 133, 153, 30); text(c, lka, 616, 153, 25, lka === 'ACTIVE' ? C.blue : C.secondary, 'right'); line(c, 128, 192, 622, 192);
      text(c, 'Lane Centering', 133, 239, 30); text(c, lcc, 616, 239, 25, lcc === 'ACTIVE' ? C.blue : C.secondary, 'right'); line(c, 128, 278, 622, 278);
      drawTaycanPlan(c, 862, 263, 1.55);
      c.strokeStyle = a?.lccActive ? C.blue : a?.laneValid ? '#b0b8c0' : C.faint; c.lineWidth = 2;
      for (const x of [756, 968]) { c.beginPath(); c.moveTo(x, 386); c.lineTo(x < 800 ? 816 : 908, 129); c.stroke(); }
    } else if (this.vehiclePage === 'energy') {
      text(c, e ? `${Math.round(e.stateOfCharge * 100)} %` : '--', 225, 151, 57, C.white, 'center');
      c.strokeStyle = '#71818c'; c.lineWidth = 2; c.strokeRect(184, 211, 83, 149); c.strokeRect(208, 200, 35, 11);
      c.fillStyle = '#7fa99a'; const filled = (e?.stateOfCharge ?? 0) * 135; c.fillRect(191, 353 - filled, 69, filled);
      text(c, e ? `${Math.round(e.estimatedRangeKm)} km` : '-- km', 225, 413, 31, C.white, 'center');
      const rows = [['Power', e ? `${e.batteryPowerKw.toFixed(0)} kW` : '--'], ['Recovery', e ? `${e.regenPowerKw.toFixed(0)} kW` : '--'],
        ['Consumption', e?.averageConsumptionKWhPer100km == null ? '-- kWh/100 km' : `${e.averageConsumptionKWhPer100km.toFixed(1)} kWh/100 km`],
        ['Energy used', e ? `${e.tripEnergyConsumedKWh.toFixed(2)} kWh` : '--'], ['Recovered', e ? `${e.tripEnergyRecoveredKWh.toFixed(2)} kWh` : '--']];
      rows.forEach((row, index) => { text(c, row[0]!, 396, 133 + index * 68, 27, C.secondary); text(c, row[1]!, 1057, 133 + index * 68, 30, index === 1 ? C.green : C.white, 'right'); if (index < 4) line(c, 396, 169 + index * 68, 1059, 169 + index * 68); });
    } else {
      const tyres = t.sharedVehicle?.tyres ?? t.tyres;
      const tpmsState = t.tpmsState ?? t.sharedVehicle?.tpmsState;
      const tyreStatus = { vehicleName: 'Taycan 4S', tpmsState, tyres, tyrePressureKPa: t.vehicleStatus?.tyrePressureKPa };
      text(c, 'Tyre pressure', 340, 116, 28, C.white, 'center'); drawTaycanPlan(c, 340, 276, 1.6);
      ['FL', 'FR', 'RL', 'RR'].forEach((label, index) => {
        const x = index % 2 ? 504 : 175, y = index < 2 ? 218 : 352;
        const p = tyrePressureReading(tyreStatus, index);
        text(c, label, x, y - 30, 19, C.secondary, 'center'); text(c, p === undefined ? '--' : Math.round(p).toString(), x, y + 3, 34, tyrePressureWarning(tyreStatus, index) ? C.amber : C.white, 'center'); text(c, 'kPa', x, y + 34, 17, C.secondary, 'center');
      });
      const i = t.indicators;
      const rows = [['Parking brake', i?.parkingBrake ? 'Applied' : 'Released'], ['Exterior lights', i?.headlights ? 'Low beam' : i?.positionLights ? 'Position' : 'Off'],
        ['Doors', '--'], ['Vehicle status', tpmsState?.warning ? 'Tyre pressure warning' : i?.batteryWarning ? 'Low battery' : i?.absWarning ? 'Brake system' : (e?.thermalDerateFraction ?? 0) > .15 ? 'Power limited' : 'No active warnings']];
      rows.forEach((row, index) => { text(c, row[0]!, 647, 151 + index * 81, 24, C.secondary); text(c, row[1]!, 1070, 182 + index * 81, 25, C.white, 'right'); line(c, 647, 214 + index * 81, 1070, 214 + index * 81); });
    }
  };
  private frontGraphic(c: CanvasRenderingContext2D, x: number, y: number): void {
    c.save(); c.translate(x, y); c.strokeStyle = '#939da6'; c.fillStyle = '#282f36'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-159, 71); c.quadraticCurveTo(-167, 14, -119, -10); c.lineTo(-83, -69); c.quadraticCurveTo(34, -104, 91, -69); c.lineTo(132, -17); c.quadraticCurveTo(167, 1, 170, 69); c.lineTo(144, 88); c.lineTo(-132, 96); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#0c1218'; c.beginPath(); c.moveTo(-100, -10); c.lineTo(-72, -59); c.quadraticCurveTo(22, -83, 79, -58); c.lineTo(112, -12); c.closePath(); c.fill(); c.stroke();
    line(c, -126, 35, -76, 30, '#d6e5eb', 3); line(c, 89, 27, 143, 34, '#d6e5eb', 3);
    line(c, -85, 68, 102, 68, '#68717a', 2); line(c, -124, 11, 126, 8, '#545f69', 1);
    c.fillStyle = '#101417'; for (const tx of [-133, 146]) { c.beginPath(); c.ellipse(tx, 81, 17, 32, 0, 0, Math.PI * 2); c.fill(); c.stroke(); }
    c.restore();
  }
  private drawParking = (c: CanvasRenderingContext2D): void => {
    const p = this.latest.sharedVehicle?.parking, rear = this.latest.sharedVehicle?.rearParking;
    line(c, 480, 97, 480, 455, '#3a4149'); drawTaycanPlan(c, 300, 263, 1.65);
    const positions = [[236, 125], [300, 121], [364, 125], [391, 269], [368, 400], [300, 407], [232, 400], [207, 269]];
    for (let i = 0; i < 8; i++) {
      const zone = p?.zones[i], [x, y] = positions[i]!;
      c.strokeStyle = zone && zone.severity !== 'NONE' ? PROXIMITY_COLORS[zone.severity] : '#353d45'; c.lineWidth = zone?.severity === 'CRITICAL' ? 4 : 2;
      c.beginPath(); c.arc(x!, y!, 25, i === 3 || i === 7 ? -.4 : 0, i === 3 || i === 7 ? .4 : Math.PI); c.stroke();
    }
    text(c, p?.nearestDistanceM != null ? `${p.nearestDistanceM.toFixed(2)} m` : p?.active ? 'Clear surroundings' : 'Sensors unavailable', 300, 461, 23, p?.nearestDistanceM != null && p.nearestDistanceM < .4 ? C.amber : C.secondary, 'center');
    // A clean synthetic rear-distance view; never presented as photographic camera video.
    text(c, 'Rear proximity', 790, 119, 27, C.white, 'center');
    c.strokeStyle = '#43515d'; c.lineWidth = 2;
    for (const side of [-1, 1]) { c.beginPath(); c.moveTo(790 + side * 85, 179); c.lineTo(790 + side * 239, 405); c.stroke(); }
    for (const [index, zone] of (rear?.zones ?? []).entries()) {
      const x = 600 + index * 93;
      c.strokeStyle = zone.severity === 'NONE' ? '#59656f' : PROXIMITY_COLORS[zone.severity]; c.lineWidth = 4;
      c.beginPath(); c.moveTo(x, 359); c.lineTo(x + 73, 359); c.stroke();
      if (zone.distanceM != null) text(c, zone.distanceM.toFixed(1), x + 36, 312, 25, C.white, 'center');
    }
    line(c, 563, 399, 1016, 399, '#a75e58', 3);
    text(c, rear?.active ? 'Check surroundings' : 'Rear sensing standby', 790, 453, 21, C.secondary, 'center');
  };
  private drawMedia = (c: CanvasRenderingContext2D): void => {
    drawTaycanSymbol(c, this.atlas, 'media', 600, 223, 57);
    text(c, 'No source connected', 600, 312, 29, C.white, 'center');
  };
}
