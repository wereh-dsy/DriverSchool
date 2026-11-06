import * as T from 'three';
import type { InstrumentTelemetry } from './InstrumentCluster';
import { WHEEL_IDS } from '../physics/WheelContact';

const GOLD = '#d9bc88', GREEN = '#72d9bb', WHITE = '#ebf0ee', MUTED = '#8eaaa9';
type Page = 'ENERGY' | 'OFFROAD' | 'STATUS';
/** Render-only animation; statuses and flow directions come from physical telemetry. */
export class Tank500Display extends T.Group {
  public readonly canvas = document.createElement('canvas');
  public readonly texture: T.CanvasTexture;
  public readonly screen: T.Mesh<T.PlaneGeometry, T.MeshStandardMaterial>;
  public page: Page = 'ENERGY';
  private elapsed = 1;
  private lastStatus = '';
  private speed = 0;
  private rpm = 0;
  private power = 0;
  private age = 0;
  private bootAge = 10;
  private wasOn = false;
  public constructor(private readonly center = false) {
    super(); this.name = center ? 'Tank Hi4-T centre energy / off-road display' : 'Tank Hi4-T digital instruments';
    this.canvas.width = 1200; this.canvas.height = center ? 650 : 420;
    this.texture = new T.CanvasTexture(this.canvas); this.texture.colorSpace = T.SRGBColorSpace; this.texture.anisotropy = 4;
    const width = center ? .325 : .300, height = center ? .183 : .112;
    const housing = new T.Mesh(new T.BoxGeometry(width + .022, height + .021, .024), new T.MeshStandardMaterial({ color: 0x101719, roughness: .30 }));
    housing.position.z = -.014; this.add(housing);
    this.screen = new T.Mesh(new T.PlaneGeometry(width, height), new T.MeshStandardMaterial({ color: 0, emissive: 0xffffff,
      emissiveMap: this.texture, emissiveIntensity: 0, roughness: .20, metalness: 0, toneMapped: false }));
    this.screen.name = center ? 'Tank centre screen' : 'Tank instrument screen'; this.add(this.screen);
  }
  public cyclePage(): void { const pages: Page[] = ['ENERGY', 'OFFROAD', 'STATUS']; this.page = pages[(pages.indexOf(this.page) + 1) % 3]!; this.elapsed = 1; }
  public click(ray: T.Raycaster): boolean {
    const hit = ray.intersectObject(this.screen, false)[0]; if (!hit?.uv || !this.center) return false;
    if (hit.uv.y < .14) { this.page = (['ENERGY', 'OFFROAD', 'STATUS'] as Page[])[Math.min(2, Math.floor(hit.uv.x * 3))]!; this.elapsed = 1; }
    else this.cyclePage(); return true;
  }
  private text(c: CanvasRenderingContext2D, s: string, x: number, y: number, size = 28, color = WHITE): void {
    c.font = `500 ${size}px Segoe UI, Microsoft YaHei, sans-serif`; c.fillStyle = color; c.textAlign = 'center'; c.fillText(s, x, y);
  }
  private car(c: CanvasRenderingContext2D, x: number, y: number, scale = 1): void {
    c.save(); c.translate(x, y); c.scale(scale, scale); c.fillStyle = '#050b0f';
    for (const side of [-1, 1]) { c.fillRect(side < 0 ? -63 : 47, -80, 17, 39); c.fillRect(side < 0 ? -63 : 47, 49, 17, 39); }
    const paint = c.createLinearGradient(-50, 0, 50, 0); paint.addColorStop(0, '#7e8581'); paint.addColorStop(.4, '#d3cbb9'); paint.addColorStop(1, '#868d87');
    c.fillStyle = paint; c.fillRect(-48, -115, 96, 225); c.fillStyle = '#162e38'; c.fillRect(-38, -44, 76, 102);
    c.strokeStyle = '#9bacad'; c.lineWidth = 3; c.strokeRect(-38, -44, 76, 102); c.fillStyle = '#859d9f'; c.fillRect(-37, 67, 74, 25);
    c.fillStyle = '#3c4a4c'; c.beginPath(); c.arc(0, 111, 28, 0, Math.PI * 2); c.fill(); c.restore();
  }
  private arc(c: CanvasRenderingContext2D, x: number, y: number, value: number, maximum: number, color: string): void {
    c.lineWidth = 9; c.strokeStyle = '#23353b'; c.beginPath(); c.arc(x, y, 139, .77 * Math.PI, 2.23 * Math.PI); c.stroke();
    c.strokeStyle = color; c.beginPath(); c.arc(x, y, 139, .77 * Math.PI, (.77 + T.MathUtils.clamp(value / maximum, 0, 1) * 1.46) * Math.PI); c.stroke();
    for (let n = 0; n <= 6; n++) { const a = (.77 + n / 6 * 1.46) * Math.PI; c.strokeStyle = '#71898d'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x + Math.cos(a) * 151, y + Math.sin(a) * 151); c.lineTo(x + Math.cos(a) * 160, y + Math.sin(a) * 160); c.stroke(); }
  }
  private flow(c: CanvasRenderingContext2D, t: InstrumentTelemetry, y: number): void {
    const h = t.hybrid!, engine = h.clutchEngagement > .02 && h.enginePowerW > 500, motor = Math.abs(h.motorPowerW) > 500;
    const line = (from: number, to: number, active: boolean, color: string, reverse = false) => {
      c.strokeStyle = active ? color : '#263c42'; c.lineWidth = 3; c.beginPath(); c.moveTo(from, y); c.lineTo(to, y); c.stroke();
      if (active) for (let n = 0; n < 3; n++) { const p = (this.age * .65 + n / 3) % 1;
        c.fillStyle = color; c.beginPath(); c.arc(T.MathUtils.lerp(from, to, reverse ? 1 - p : p), y, 4, 0, Math.PI * 2); c.fill(); }
    };
    this.text(c, '发动机', 405, y - 24, 24, engine ? GOLD : MUTED); this.text(c, `${Math.round(h.enginePowerW / 1000)} kW`, 405, y + 38, 29, GOLD);
    this.text(c, 'P2 / 电池', 805, y - 24, 24, GREEN); this.text(c, `${Math.round(h.motorPowerW / 1000)} kW`, 805, y + 38, 29, GREEN);
    line(452, 551, engine, GOLD); line(749, 649, motor, GREEN, h.motorPowerW < 0);
  }
  public update(t: InstrumentTelemetry, dt: number): void {
    const powered = t.ignitionOn ?? true, charging = t.hybrid?.battery.connector != null;
    if (powered && !this.wasOn) this.bootAge = 0;
    this.wasOn = powered; this.bootAge += dt; this.age += dt;
    this.speed = T.MathUtils.damp(this.speed, Math.abs(t.speedKmh), 14, dt); this.rpm = T.MathUtils.damp(this.rpm, t.rpm, 12, dt);
    this.power = T.MathUtils.damp(this.power, ((t.hybrid?.enginePowerW ?? 0) + (t.hybrid?.motorPowerW ?? 0)) / 1000, 9, dt);
    const day = T.MathUtils.clamp(t.ambientDaylight ?? 1, 0, 1);
    this.screen.material.emissiveIntensity = T.MathUtils.damp(this.screen.material.emissiveIntensity, powered || charging ? .47 + .45 * day : 0, 8, dt);
    const status = `${powered}|${charging}|${t.driveAvailable}|${t.tpmsState?.warning}|${(t.fuelLevel ?? 1) <= .1}|${this.page}|${JSON.stringify(t.indicators)}`;
    this.elapsed += dt; if (this.elapsed < .05 && status === this.lastStatus) return; this.elapsed = 0; this.lastStatus = status;
    const c = this.canvas.getContext('2d')!, hybrid = t.hybrid; c.globalAlpha = 1;
    c.fillStyle = powered ? '#081218' : '#000000'; c.fillRect(0, 0, 1200, this.canvas.height); this.texture.needsUpdate = true;
    const text = (s: string, x: number, y: number, size = 28, color = WHITE) => this.text(c, s, x, y, size, color);
    if (!hybrid) return; const battery = hybrid.battery;
    if (!powered) {
      if (this.center && charging) { text('外接充电 · 车辆电源关闭', 600, 150, 38, GOLD); text(`SOC ${Math.round(battery.soc * 100)}%`, 600, 280, 70, GREEN);
        text(`${battery.connector} · ${battery.state} · ${(battery.gridPowerW / 1000).toFixed(1)} kW`, 600, 390, 32); }
      return;
    }
    const header = c.createLinearGradient(0, 0, 0, 70); header.addColorStop(0, '#233135'); header.addColorStop(1, '#081218'); c.fillStyle = header; c.fillRect(0, 0, 1200, 70);
    text('TANK 500 · Hi4-T', 205, 43, 27, GOLD); text(`${hybrid.mode} · ${t.driveMode ?? 'NORMAL'}`, 600, 43, 25);
    text(t.driveAvailable ? 'READY' : '驱动暂不可用', 1030, 43, 25, t.driveAvailable ? GREEN : '#edbc69');
    if (!this.center) {
      this.arc(c, 220, 212, this.rpm, 6400, GOLD); this.arc(c, 980, 212, Math.abs(this.power), this.power < 0 ? 65 : 300, this.power < 0 ? GREEN : GOLD);
      text(String(Math.round(this.speed)), 220, 245, 100); text(`km/h  ·  ${t.gear}`, 220, 293, 27);
      text(`${Math.round(this.power)}`, 980, 242, 78, this.power < 0 ? GREEN : WHITE); text(this.power < 0 ? 'kW · 回收' : 'kW · 动力', 980, 289, 27);
      this.car(c, 600, 210, .60); this.flow(c, t, 195);
      text(t.engineRunning ? '发动机运行' : '发动机停止', 600, 108, 26, t.engineRunning ? GOLD : MUTED);
      text(`${hybrid.transfer.mode}   前/后 ${Math.round(hybrid.transfer.frontShare * 100)}/${Math.round(hybrid.transfer.rearShare * 100)}`, 600, 319, 25, GOLD);
      text(`SOC ${Math.round(battery.soc * 100)}%`, 1000, 361, 28, GREEN);
    } else {
      text({ ENERGY: '能量流', OFFROAD: '越野信息', STATUS: '车辆状态' }[this.page], 600, 105, 32, GOLD);
      if (this.page === 'ENERGY') {
        this.car(c, 600, 270, .9); this.flow(c, t, 245);
        text(`${t.engineRunning ? '发动机运行' : '发动机停止'} · ${Math.round(t.rpm)} rpm`, 600, 421, 27);
        text(`SOC ${Math.round(battery.soc * 100)}%   保电目标 ${Math.round(hybrid.holdSOC * 100)}%`, 600, 466, 31, GREEN);
        text('实际能量流向 · ' + (hybrid.motorPowerW < -500 ? 'P2 → 电池' : hybrid.motorPowerW > 500 ? '电池 → P2' : '待机'), 600, 515, 25, MUTED);
      } else if (this.page === 'OFFROAD') {
        this.car(c, 345, 285, 1.15); text(`${hybrid.transfer.mode}   ${hybrid.transfer.ratio.toFixed(2)} : 1`, 820, 198, 43, GOLD);
        text(`前轴 ${Math.round(hybrid.transfer.frontShare * 100)}% / 后轴 ${Math.round(hybrid.transfer.rearShare * 100)}%`, 820, 267, 31);
        text(`K0 ${Math.round(hybrid.clutchEngagement * 100)}%   ${Math.round(hybrid.clutchSlipRPM)} rpm滑差`, 820, 326, 27);
        text(`TCS ${t.indicators?.tcsOff ? '关闭' : t.indicators?.tcsActive ? '介入' : '待命'}`, 820, 384, 29, GREEN);
        text('机械四驱 · 中央耦合等效模型', 600, 466, 27, MUTED);
      } else {
        text(`电池 ${battery.temperatureC.toFixed(1)} °C   ${Math.round(battery.voltage)} V   ${Math.round(battery.current)} A`, 600, 205, 30);
        text(`可放电 ${(battery.dischargePowerW / 1000).toFixed(0)} kW   可充电 ${(battery.chargePowerW / 1000).toFixed(0)} kW`, 600, 270, 28);
        text(`车门 ${Math.round((t.driverAccess?.doorOpen ?? 0) * 100)}%   车窗 ${Math.round((t.driverAccess?.windowOpen ?? 0) * 100)}%`, 600, 335, 30);
        text(`外接充电 ${battery.state}  ${(battery.gridPowerW / 1000).toFixed(1)} kW`, 600, 400, 27, GREEN);
      }
      WHEEL_IDS.forEach((id, i) => { const tyre = t.tpmsState?.[id]; text(`${['左前', '右前', '左后', '右后'][i]} ${tyre?.valid && tyre.pressureKPa !== null ? tyre.pressureKPa + ' kPa' : '—'}`,
        160 + i * 290, 555, 25, tyre?.valid && tyre.pressureState !== 'NORMAL' ? '#edbc69' : MUTED); });
      ['ENERGY', 'OFFROAD', 'STATUS'].forEach((p, i) => { c.fillStyle = this.page === p ? '#324643' : '#14232a'; c.fillRect(i * 400 + 4, 593, 392, 53);
        text(['能量', '越野', '车况'][i]!, 200 + i * 400, 628, 26, this.page === p ? GOLD : MUTED); });
    }
    text(t.fuelLevel === undefined ? '燃油 —' : `燃油 ${Math.round(t.fuelLevel * 100)}%${t.fuelLevel <= .1 ? ' · 低油量' : ''}`, 205, this.center ? 152 : 361, 25, (t.fuelLevel ?? 1) <= .1 ? '#edbc69' : WHITE);
    text(t.tpmsState?.available ? t.tpmsState.warning ? '胎压告警' : '胎压正常' : '胎压不可用', 1010, this.center ? 152 : 396, 24, t.tpmsState?.warning ? '#edbc69' : MUTED);
    if (!this.center) {
      const i = t.indicators; text(`${i?.parkingBrake ? 'EPB' : ''}  ABS ${i?.absWarning ? '故障' : '就绪'}  ${i?.tcsActive ? 'TCS介入' : ''}`, 530, 396, 23, i?.absWarning ? '#edbc69' : MUTED);
      if (i?.leftTurn) text('◀', 65, 82, 34, GREEN); if (i?.rightTurn) text('▶', 1135, 82, 34, GREEN);
    }
    if (this.bootAge < .65 && Math.abs(t.speedKmh) < .1 && !t.indicators?.absWarning && !t.tpmsState?.warning) {
      c.globalAlpha = .70 * (1 - this.bootAge / .65); c.fillStyle = '#091319'; c.fillRect(0, 72, 1200, this.center ? 475 : 250);
      text('T A N K', 600, this.center ? 290 : 225, 65, GOLD); c.globalAlpha = 1;
    }
  }
}
