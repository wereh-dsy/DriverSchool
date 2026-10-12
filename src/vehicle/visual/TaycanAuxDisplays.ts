import * as T from 'three';
import type { InstrumentTelemetry } from './InstrumentCluster';
import type { VehicleAssetRegistry } from './VehicleAssetRegistry';
import { TaycanDisplaySurface, text, line, taycanBrightness, TAYCAN_COLORS as C } from './TaycanDisplaySurface';
import { drawTaycanSymbol, taycanSymbolAtlas } from './TaycanSymbols';

/** Cockpit UI state only: no cabin-temperature simulation or HVAC power claim. */
export class TaycanClimateDisplay extends T.Group {
  public readonly surface: TaycanDisplaySurface;
  public driverTemperature = 22;
  public passengerTemperature = 22;
  public fan = 2;
  public auto = true;
  public defog = false;
  public onHome?: () => void;
  private readonly controls;
  private readonly atlas;
  private on = true;
  public constructor(assets: VehicleAssetRegistry) {
    super(); this.name = 'Taycan lower climate touch display'; this.atlas = taycanSymbolAtlas(assets);
    this.surface = new TaycanDisplaySurface(640, 800, .231, .288, 'Taycan lower climate', c => {
      c.fillStyle = '#06080a'; c.fillRect(0, 0, 640, 800);
      text(c, 'CLIMATE', 320, 57, 23, C.secondary, 'center');
      text(c, 'Driver', 160, 214, 23, C.secondary, 'center'); text(c, 'Passenger', 480, 214, 23, C.secondary, 'center');
      line(c, 320, 216, 320, 415, '#343a41');
      for (const x of [160, 480]) { text(c, '⌃', x, 285, 42, C.white, 'center'); text(c, '⌄', x, 399, 42, C.white, 'center'); }
      line(c, 52, 447, 588, 447, '#343a41'); line(c, 52, 650, 588, 650, '#343a41');
    }, assets); this.add(this.surface);
    this.controls = this.surface.region({ x: 0, y: 0, width: 640, height: 800 }, 'Taycan climate controls');
  }
  public click(uv: T.Vector2): boolean {
    if (!this.on) return false;
    const x = uv.x * 640, y = (1 - uv.y) * 800;
    if (y > 240 && y < 320 || y > 350 && y < 430) {
      const delta = y < 320 ? .5 : -.5;
      if (x < 320) this.driverTemperature = T.MathUtils.clamp(this.driverTemperature + delta, 16, 30);
      else this.passengerTemperature = T.MathUtils.clamp(this.passengerTemperature + delta, 16, 30);
    } else if (y > 468 && y < 547) { this.fan = (this.fan + 1) % 6; this.auto = false; }
    else if (y > 552 && y < 642) this.auto = !this.auto;
    else if (y > 666 && x < 320) this.defog = !this.defog;
    else if (y > 666 && x >= 320) { this.onHome?.(); return true; }
    else return false;
    this.controls.invalidate(); return true;
  }
  public update(t: InstrumentTelemetry, dt: number): void {
    this.on = t.ignitionOn ?? true; this.surface.advance(dt);
    this.surface.luminance(taycanBrightness(t.ambientDaylight, !!t.indicators?.headlights) * .9, dt, this.on ? 1 : 0);
    if (!this.on) return;
    this.controls.update(`${this.driverTemperature}|${this.passengerTemperature}|${this.fan}|${this.auto}|${this.defog}`, .2, this.draw);
  }
  private draw = (c: CanvasRenderingContext2D): void => {
    text(c, `${this.driverTemperature.toFixed(1)}°`, 160, 141, 64, C.white, 'center'); text(c, `${this.passengerTemperature.toFixed(1)}°`, 480, 141, 64, C.white, 'center');
    drawTaycanSymbol(c, this.atlas, 'fan', 104, 508, 42);
    for (let i = 0; i < 5; i++) { c.fillStyle = i < this.fan ? C.white : '#343b42'; c.fillRect(222 + i * 61, 516 - i * 5, 34, 12 + i * 5); }
    text(c, 'AUTO', 320, 593, 30, this.auto ? C.blue : C.secondary, 'center', 500);
    if (this.auto) line(c, 247, 624, 393, 624, '#84a9bc', 2);
    drawTaycanSymbol(c, this.atlas, 'defog', 160, 707, 43); text(c, 'Defog', 160, 762, 20, this.defog ? C.blue : C.secondary, 'center');
    drawTaycanSymbol(c, this.atlas, 'home', 480, 707, 40); text(c, 'Home', 480, 762, 20, C.secondary, 'center');
  };
}

export class TaycanSportChrono extends T.Group {
  public readonly surface: TaycanDisplaySurface;
  private readonly hands;
  private readonly date = new Date();
  public constructor(assets: VehicleAssetRegistry) {
    super(); this.name = 'Taycan Sport Chrono';
    const mount = new T.Mesh(new T.BoxGeometry(.072, .050, .058), new T.MeshStandardMaterial({ color: 0x15191d, roughness: .55 }));
    mount.position.set(0, -.077, -.02); this.add(mount);
    const pod = new T.Mesh(new T.CylinderGeometry(.049, .052, .032, 48), new T.MeshStandardMaterial({ color: 0x16191d, roughness: .32, metalness: .16 }));
    pod.rotation.x = Math.PI / 2; pod.position.z = -.017; this.add(pod);
    this.surface = new TaycanDisplaySurface(256, 256, .086, .086, 'Taycan Sport Chrono dial', c => {
      c.fillStyle = '#080b0f'; c.beginPath(); c.arc(128, 128, 128, 0, Math.PI * 2); c.fill();
      for (let i = 0; i < 60; i++) {
        const a = i * Math.PI / 30 - Math.PI / 2, outer = 117, inner = i % 5 ? 112 : 102;
        line(c, 128 + Math.cos(a) * inner, 128 + Math.sin(a) * inner, 128 + Math.cos(a) * outer, 128 + Math.sin(a) * outer, i % 5 ? '#606a74' : C.white, i % 5 ? 1 : 2);
      }
      text(c, '12', 128, 45, 20, C.white, 'center'); text(c, '3', 211, 128, 20, C.white, 'center'); text(c, '6', 128, 211, 20, C.white, 'center'); text(c, '9', 45, 128, 20, C.white, 'center');
      text(c, 'SPORT', 128, 170, 11, C.secondary, 'center'); text(c, 'CHRONO', 128, 186, 11, C.secondary, 'center');
    }, assets, false, true); this.add(this.surface);
    this.hands = this.surface.region({ x: 0, y: 0, width: 256, height: 256 }, 'Taycan Chrono clock hands', true);
  }
  public update(t: InstrumentTelemetry, dt: number): void {
    this.surface.advance(dt); this.surface.luminance(taycanBrightness(t.ambientDaylight, !!t.indicators?.headlights, true) * .85, dt, t.ignitionOn === false ? 0 : 1);
    this.hands.update(Math.floor(Date.now() / 1000).toString(), 1, this.draw);
  }
  private draw = (c: CanvasRenderingContext2D): void => {
    this.date.setTime(Date.now());
    const second = this.date.getSeconds(), minute = this.date.getMinutes() + second / 60, hour = this.date.getHours() % 12 + minute / 60;
    const hand = (value: number, max: number, length: number, width: number, color: string) => {
      const a = value / max * Math.PI * 2 - Math.PI / 2; line(c, 128, 128, 128 + Math.cos(a) * length, 128 + Math.sin(a) * length, color, width);
    };
    hand(hour, 12, 61, 5, C.white); hand(minute, 60, 88, 3, C.white); hand(second, 60, 95, 1.3, C.secondary);
    c.fillStyle = '#c6cbd1'; c.beginPath(); c.arc(128, 128, 5, 0, Math.PI * 2); c.fill();
  };
}
