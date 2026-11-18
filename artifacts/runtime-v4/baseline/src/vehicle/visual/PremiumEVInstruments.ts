import * as T from 'three';
import { activeNavigation, drawNavigationBanner } from '../../ui/NavigationDisplay';
import type { InstrumentTelemetry } from './InstrumentCluster';
import type { VehicleAssetRegistry } from './VehicleAssetRegistry';
import { TaycanDisplaySurface, taycanScreenGeometry, text, line, taycanBrightness, TAYCAN_COLORS as C } from './TaycanDisplaySurface';
import { taycanSymbolAtlas, drawTaycanSymbol, drawTaycanPlan } from './TaycanSymbols';
import { lateralBoundaryColor } from './LateralAssistDisplay';

export type TaycanInstrumentPage = 'auto' | 'driving' | 'assistance' | 'navigation';
const WIDTH = 1536, HEIGHT = 540;
const SCREEN_WIDTH = .680, SCREEN_HEIGHT = SCREEN_WIDTH * HEIGHT / WIDTH;
const ring = (c: CanvasRenderingContext2D, x: number, radius: number): void => {
  c.strokeStyle = '#b1b8bf'; c.lineWidth = 2; c.beginPath(); c.arc(x, 244, radius, .65 * Math.PI, 2.35 * Math.PI); c.stroke();
  c.strokeStyle = '#31373e'; c.lineWidth = 1; c.beginPath(); c.arc(x, 244, radius - 7, .65 * Math.PI, 2.35 * Math.PI); c.stroke();
};
const staticFace = (c: CanvasRenderingContext2D): void => {
  c.fillStyle = C.background; c.fillRect(0, 0, WIDTH, HEIGHT);
  ring(c, 314, 177); ring(c, 1222, 177);
  for (let i = 0; i <= 12; i++) {
    const a = .65 * Math.PI + i / 12 * 1.7 * Math.PI;
    line(c, 314 + Math.cos(a) * 177, 244 + Math.sin(a) * 177, 314 + Math.cos(a) * (i % 3 ? 173 : 167), 244 + Math.sin(a) * (i % 3 ? 173 : 167), '#b1b8bf');
  }
  text(c, 'POWER', 314, 93, 17, C.secondary, 'center');
};

/** Porsche three-zone face: static meters plus independently dirty, rate-limited regions. */
export class PremiumEVInstruments extends T.Group {
  public readonly surface: TaycanDisplaySurface;
  public page: TaycanInstrumentPage = 'auto';
  public rightPage: 'trip' | 'vehicle' = 'trip';
  public visiblePage: Exclude<TaycanInstrumentPage, 'auto'> = 'driving';
  private readonly atlas: HTMLCanvasElement;
  private readonly energy;
  private readonly center;
  private readonly right;
  private readonly edges;
  private readonly mark: T.Mesh;
  private readonly primaryRing: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>;
  private latest: InstrumentTelemetry = { speedKmh: 0, rpm: 0, gear: 'P' };
  private startup = 0;
  private on = false;
  private mode = '';
  private modeHighlight = 0;
  private clockElapsed = Infinity;
  private clockText = '';
  private readonly date = new Date();
  public constructor(assets: VehicleAssetRegistry) {
    super(); this.name = 'Taycan curved three-zone instruments'; this.atlas = taycanSymbolAtlas(assets);
    this.surface = new TaycanDisplaySurface(WIDTH, HEIGHT, SCREEN_WIDTH, SCREEN_HEIGHT, 'Taycan curved instrument', staticFace, assets, true);
    this.add(this.surface);
    const ringCanvas = assets.canvas('taycan-central-ring-v1', 468, 510, c => { c.translate(-534, -15); ring(c, 768, 213); });
    const ringTexture = new T.CanvasTexture(ringCanvas); ringTexture.colorSpace = T.SRGBColorSpace;
    this.primaryRing = new T.Mesh(taycanScreenGeometry(SCREEN_WIDTH, SCREEN_HEIGHT, { x: 534, y: 15, width: 468, height: 510 }, WIDTH, HEIGHT, true),
      new T.MeshBasicMaterial({ map: ringTexture, transparent: true, depthWrite: false, toneMapped: false }));
    this.primaryRing.name = 'Taycan primary static speed ring'; this.primaryRing.position.z = .0003; this.primaryRing.renderOrder = 2; this.add(this.primaryRing);
    this.energy = this.surface.region({ x: 112, y: 40, width: 408, height: 458 }, 'Taycan energy region');
    this.center = this.surface.region({ x: 534, y: 15, width: 468, height: 510 }, 'Taycan primary / assistance / navigation region');
    this.right = this.surface.region({ x: 1018, y: 40, width: 410, height: 458 }, 'Taycan trip / vehicle region');
    this.edges = this.surface.region({ x: 0, y: 0, width: WIDTH, height: HEIGHT }, 'Taycan edge status symbols');
    const startupCanvas = assets.canvas('taycan-startup-mark-v1', 512, 128, c => { text(c, 'P O R S C H E', 256, 52, 32, C.white, 'center', 500); text(c, 'T A Y C A N', 256, 97, 18, C.secondary, 'center'); });
    const startupTexture = new T.CanvasTexture(startupCanvas); startupTexture.colorSpace = T.SRGBColorSpace;
    this.mark = new T.Mesh(new T.PlaneGeometry(.27, .067), new T.MeshBasicMaterial({ map: startupTexture, transparent: true, depthWrite: false, toneMapped: false }));
    this.mark.name = 'Taycan restrained startup mark'; this.mark.position.z = .006; this.mark.renderOrder = 5; this.add(this.mark);
    for (const x of [-.20, .20]) {
      const support = new T.Mesh(new T.BoxGeometry(.047, .040, .035), new T.MeshStandardMaterial({ color: 0x111418, roughness: .6 }));
      support.name = 'Taycan instrument lower mount'; support.position.set(x, -.096, -.055); this.add(support);
    }
  }
  public selectPage(page: TaycanInstrumentPage): void { this.page = page; this.center.invalidate(); }
  public click(uv: T.Vector2): boolean {
    const x = uv.x * WIDTH, y = (1 - uv.y) * HEIGHT;
    if (x > 1018 && x < 1428 && y > 130 && y < 440) { this.rightPage = this.rightPage === 'trip' ? 'vehicle' : 'trip'; this.right.invalidate(); return true; }
    if (x > 590 && x < 945 && y > 445) {
      this.selectPage(x < 705 ? 'driving' : x < 830 ? 'assistance' : 'navigation'); return true;
    }
    return false;
  }
  public update(t: InstrumentTelemetry, dt: number): void {
    this.latest = t; this.surface.advance(dt); this.clockElapsed += dt;
    const on = t.ignitionOn ?? true;
    if (on !== this.on) { this.on = on; this.startup = 0; this.energy.invalidate(); this.center.invalidate(); this.right.invalidate(); this.edges.invalidate(); }
    this.startup = Math.min(1, this.startup + Math.max(0, dt));
    if (this.clockElapsed >= 1) { this.date.setTime(Date.now()); this.clockText = this.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); this.clockElapsed = 0; }
    const a = t.sharedVehicle?.lateralAssist ?? t.drivingScene?.lateralAssist;
    const page = this.page === 'auto' ? activeNavigation(t.sharedVehicle?.navigation.guidance) ? 'navigation' : a?.lkaAvailable || a?.lccAvailable || a?.lccActive || a?.lkaActive ? 'assistance' : 'driving' : this.page;
    if (page !== this.visiblePage) { this.visiblePage = page; this.center.invalidate(); }
    if ((t.driveMode ?? 'NORMAL') !== this.mode) { this.mode = t.driveMode ?? 'NORMAL'; this.modeHighlight = .8; }
    this.modeHighlight = Math.max(0, this.modeHighlight - dt);
    const lamps = !!(t.indicators?.positionLights || t.indicators?.headlights || t.indicators?.highBeam);
    const fade = on ? T.MathUtils.smoothstep(this.startup, .30, .9) : 0;
    this.surface.luminance(taycanBrightness(t.ambientDaylight, lamps, true), dt, fade);
    this.primaryRing.visible = this.visiblePage === 'driving'; this.primaryRing.material.color.setScalar(this.surface.brightness); this.primaryRing.material.opacity = fade;
    const markMaterial = this.mark.material as T.MeshBasicMaterial;
    markMaterial.opacity = on ? Math.max(0, 1 - Math.abs(this.startup - .3) / .28) : 0;
    if (!on) return;
    const e = t.ev, nav = t.sharedVehicle?.navigation;
    this.energy.update(`${e?.stateOfCharge.toFixed(3)}|${Math.round(e?.batteryPowerKw ?? 0)}|${Math.round(e?.estimatedRangeKm ?? 0)}|${Math.round((e?.availableDischargePower ?? 0) / 1000)}|${e?.thermalDerateFraction! > .15}|${e?.batteryTemperature! < 10}|${e?.regenLimitReason}|${this.mode}`, 1 / 30, this.drawEnergy);
    this.center.update(`${Math.round(t.speedKmh)}|${this.visiblePage}|${t.indicators?.cruise}|${t.cruiseTargetSpeedKmh}|${nav?.speedLimit}|${nav?.roadName}|${e?.launchState}|${Math.round(e?.estimatedRangeKm ?? 0)}|${a?.laneValid}|${a?.leftBoundaryAvailable}|${a?.rightBoundaryAvailable}|${a?.lkaAvailable}|${a?.lccAvailable}|${a?.lkaActive}|${a?.lccActive}|${a?.correctingSide}|${t.laneAssist?.mode}|${nav?.guidance?.version}|${nav?.route?.length ?? 0}`, 1 / 30, this.drawCenter);
    this.right.update(`${this.rightPage}|${this.clockText}|${String(t.gear).charAt(0)}|${this.mode}|${this.modeHighlight > 0}|${t.trip?.tripA.distanceKm.toFixed(1)}|${e?.averageConsumptionKWhPer100km?.toFixed(1)}|${e?.tripEnergyConsumedKWh.toFixed(1)}|${t.indicators?.parkingBrake}|${t.indicators?.autoHold}`, 1 / 30, this.drawRight);
    const i = t.indicators;
    this.edges.update(`${i?.positionLights}|${i?.headlights}|${i?.highBeam}|${i?.frontFogLights}|${i?.rearFogLights}|${i?.escOff}|${i?.escActive}|${i?.tcsActive}|${i?.parkingBrake}|${i?.absWarning}|${i?.batteryWarning}|${i?.leftTurn}|${i?.rightTurn}|${(t.tpmsState ?? t.sharedVehicle?.tpmsState)?.warning}`, 1 / 30, this.drawEdges);
  }
  private drawEnergy = (c: CanvasRenderingContext2D): void => {
    const e = this.latest.ev, power = e?.batteryPowerKw ?? 0;
    const fraction = Math.min(1, Math.abs(power) / Math.max(1, power < 0 ? (e?.availableRegenPower ?? 0) / 1000 : (e?.availableDischargePower ?? 0) / 1000));
    c.strokeStyle = power < 0 ? C.green : this.mode === 'SPORT_PLUS' ? C.white : C.blue;
    c.lineWidth = this.mode === 'SPORT_PLUS' ? 3.5 : 2.5; c.beginPath(); c.arc(314, 244, 177, .65 * Math.PI, (.65 + fraction * 1.7) * Math.PI); c.stroke();
    text(c, e ? `${Math.round(e.stateOfCharge * 100)} %` : '--', 314, 153, 38, C.white, 'center', 400);
    c.strokeStyle = '#8c959e'; c.lineWidth = 2; c.strokeRect(292, 203, 44, 97); c.strokeRect(304, 196, 20, 7);
    c.fillStyle = C.green; c.globalAlpha = .75; const fill = 89 * (e?.stateOfCharge ?? 0); c.fillRect(296, 296 - fill, 36, fill); c.globalAlpha = 1;
    text(c, `${power < 0 ? '−' : ''}${Math.abs(power).toFixed(0)}`, 206, 245, 29, power < 0 ? C.green : C.white, 'center');
    text(c, 'kW', 206, 276, 18, C.secondary, 'center');
    text(c, `${Math.round((e?.availableDischargePower ?? 0) / 1000)}`, 416, 245, 24, C.secondary, 'center');
    text(c, 'max kW', 416, 276, 16, C.secondary, 'center');
    text(c, e ? `${Math.round(e.estimatedRangeKm)} km` : '-- km', 314, 363, 26, C.white, 'center');
    const status = (e?.thermalDerateFraction ?? 0) > .15 ? 'Power limited' : (e?.batteryTemperature ?? 20) < 10 ? 'Cold battery' : e?.regenLimitReason === 'high-soc' ? 'Recovery limited' : '';
    if (status) text(c, status, 314, 452, 19, C.amber, 'center');
  };
  private drawCenter = (c: CanvasRenderingContext2D): void => {
    const t = this.latest, nav = t.sharedVehicle?.navigation, a = t.sharedVehicle?.lateralAssist ?? t.drivingScene?.lateralAssist;
    const launch = t.ev?.launchState, launchReady = launch === 'READY' || launch === 'ARMED';
    const speedY = this.visiblePage === 'driving' ? 222 : 96;
    if (!launchReady) {
      text(c, Math.round(Math.abs(t.speedKmh)).toString(), 768, speedY, this.visiblePage === 'driving' ? 134 : 78, C.white, 'center', 400);
      text(c, 'km/h', 768, speedY + (this.visiblePage === 'driving' ? 89 : 57), 22, C.secondary, 'center');
    }
    text(c, t.indicators?.cruise ? `SET ${Math.round(t.cruiseTargetSpeedKmh ?? 0)}` : 'SET  —', 768, this.visiblePage === 'driving' ? 82 : 22, 18, t.indicators?.cruise ? C.white : C.secondary, 'center');
    if (nav?.speedLimit != null) { c.fillStyle = '#e4e7e9'; c.strokeStyle = C.red; c.lineWidth = 4; c.beginPath(); c.arc(935, 60, 26, 0, Math.PI * 2); c.fill(); c.stroke(); text(c, nav.speedLimit.toString(), 935, 60, 21, '#171b20', 'center', 500); }
    if (this.visiblePage === 'assistance') {
      const detected = a?.laneValid ?? false;
      for (let side = 0; side < 2; side++) {
        const available = side === 0 ? a?.leftBoundaryAvailable : a?.rightBoundaryAvailable;
        const color = lateralBoundaryColor(a, side, detected && available ? '#b0b8bf' : '#363c42');
        c.lineWidth = a?.lccActive || a?.lkaActive ? 3 : 2; c.strokeStyle = color;
        c.beginPath(); c.moveTo(side ? 891 : 645, 382); c.lineTo(side ? 807 : 729, 203); c.stroke();
      }
      drawTaycanPlan(c, 768, 308, .72);
      text(c, a?.lccActive ? 'Lane Centering' : a?.lkaActive ? 'Lane Keeping' : a?.lccAvailable || a?.lkaAvailable ? 'Assistance available' : 'Lane assistance', 768, 416, 19, a?.lccActive ? C.blue : C.secondary, 'center');
    } else if (this.visiblePage === 'navigation') {
      if (nav?.route?.length) {
        // Borrow the actual route shape; no invented next-turn manoeuvre or distance.
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const p of nav.route) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
        const scale = Math.min(190 / Math.max(1, maxX - minX), 137 / Math.max(1, maxZ - minZ));
        c.strokeStyle = C.blue; c.lineWidth = 3; c.beginPath();
        nav.route.forEach((p, index) => { const x = 768 + (p.x - (minX + maxX) / 2) * scale, y = 284 + (p.z - (minZ + maxZ) / 2) * scale; index ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
        drawTaycanSymbol(c, this.atlas, 'navigation', 768, 230, 38);
        text(c, 'Route overview', 768, 390, 22, C.white, 'center');
      } else {
        drawTaycanSymbol(c, this.atlas, 'navigation', 768, 252, 44);
        text(c, nav?.roadName ?? 'Driving information', 768, 321, 27, C.white, 'center');
        text(c, nav?.speedLimit != null ? `Road limit  ${nav.speedLimit} km/h` : 'No active route', 768, 366, 21, C.secondary, 'center');
      }
    } else text(c, t.ev ? `${Math.round(t.ev.estimatedRangeKm)} km` : '-- km', 768, 380, 26, C.white, 'center');
    if(this.visiblePage==='navigation'&&!launchReady)drawNavigationBanner(c,nav?.guidance,{x:567,y:350,width:402,height:112});
    if (launchReady) {
      text(c, 'LAUNCH CONTROL', 768, 226, 24, C.white, 'center'); text(c, launch === 'READY' ? 'READY' : 'ARMED', 768, 282, 46, C.blue, 'center', 500);
    }
    for (const [index, label] of ['DRIVE', 'ASSIST', 'NAV'].entries()) {
      text(c, label, 648 + index * 120, 489, 16, ['driving', 'assistance', 'navigation'][index] === this.visiblePage ? C.white : C.faint, 'center');
    }
  };
  private drawRight = (c: CanvasRenderingContext2D): void => {
    const t = this.latest, e = t.ev;
    text(c, this.rightPage.toUpperCase(), 1222, 102, 17, C.secondary, 'center');
    text(c, this.clockText, 1222, 154, 28, C.white, 'center');
    if (this.rightPage === 'trip') {
      text(c, 'Distance', 1100, 218, 19, C.secondary); text(c, t.trip ? `${t.trip.tripA.distanceKm.toFixed(1)} km` : '-- km', 1343, 218, 25, C.white, 'right');
      text(c, 'Consumption', 1100, 271, 19, C.secondary); text(c, e?.averageConsumptionKWhPer100km == null ? '--' : e.averageConsumptionKWhPer100km.toFixed(1), 1343, 271, 27, C.white, 'right');
      text(c, 'kWh / 100 km', 1343, 303, 17, C.secondary, 'right');
      text(c, 'Energy used', 1100, 354, 19, C.secondary); text(c, e ? `${e.tripEnergyConsumedKWh.toFixed(1)} kWh` : '--', 1343, 354, 24, C.white, 'right');
    } else {
      text(c, 'Vehicle', 1222, 216, 28, C.white, 'center');
      text(c, t.indicators?.parkingBrake ? 'Parking brake applied' : 'Parking brake released', 1222, 274, 20, C.secondary, 'center');
      text(c, t.indicators?.autoHold ? 'Auto Hold active' : 'Auto Hold standby', 1222, 326, 20, C.secondary, 'center');
    }
    const selector = String(t.gear).charAt(0);
    for (const [index, letter] of ['R', 'N', 'D', 'P'].entries()) {
      const y = 377 + index * 27;
      text(c, letter, 1400, y, 24, selector === letter ? C.white : '#515a64', 'center', selector === letter ? 500 : 400);
      if (selector === letter) { c.strokeStyle = C.blue; c.lineWidth = 1; c.strokeRect(1386, y - 13, 28, 26); }
    }
    text(c, this.mode.replace('_', ' '), 1222, 460, 26, this.modeHighlight > 0 ? C.blue : C.white, 'center', 500);
  };
  private drawEdges = (c: CanvasRenderingContext2D): void => {
    const i = this.latest.indicators;
    const icon = (name: Parameters<typeof drawTaycanSymbol>[2], x: number, y: number, on: boolean, warning = false) => {
      c.globalAlpha = on ? 1 : .15; drawTaycanSymbol(c, this.atlas, name, x, y, 31); c.globalAlpha = 1;
      if (on && warning) { c.fillStyle = name === 'parking' ? C.red : C.amber; c.beginPath(); c.arc(x + 18, y - 9, 3, 0, Math.PI * 2); c.fill(); }
    };
    icon('lights', 63, 170, !!i?.headlights || !!i?.positionLights); icon('high-beam', 63, 218, !!i?.highBeam); icon('fog', 63, 266, !!i?.frontFogLights || !!i?.rearFogLights);
    icon('esc', 1473, 174, !!i?.escOff || !!i?.escActive || !!i?.tcsActive, true); icon('suspension', 1473, 225, this.mode === 'SPORT' || this.mode === 'SPORT_PLUS');
    icon('battery', 1473, 276, !!i?.batteryWarning, true); icon('parking', 1056, 460, !!i?.parkingBrake, true);
    if (i?.absWarning) text(c, 'ABS', 88, 350, 16, C.amber, 'center');
    if ((this.latest.tpmsState ?? this.latest.sharedVehicle?.tpmsState)?.warning) text(c, 'TPMS', 88, 388, 16, C.amber, 'center');
    if (i?.leftTurn) text(c, '‹', 570, 70, 42, C.green, 'center'); if (i?.rightTurn) text(c, '›', 966, 70, 42, C.green, 'center');
  };
}
