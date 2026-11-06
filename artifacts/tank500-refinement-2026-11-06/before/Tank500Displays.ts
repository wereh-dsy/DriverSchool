import * as T from 'three';
import type { InstrumentTelemetry } from './InstrumentCluster';
import { WHEEL_IDS } from '../physics/WheelContact';

/** Physical displays borrow one powertrain snapshot. Never infer SOC or four-wheel drive from artwork. */
export class Tank500Display extends T.Group {
  public readonly canvas = document.createElement('canvas');
  public readonly texture: T.CanvasTexture;
  private elapsed = 1;
  private lastStatus = '';
  public constructor(private readonly center = false) {
    super(); this.name = center ? 'Tank Hi4-T centre energy / off-road display' : 'Tank Hi4-T digital instruments';
    this.canvas.width = 1200; this.canvas.height = center ? 650 : 420;
    this.texture = new T.CanvasTexture(this.canvas); this.texture.colorSpace = T.SRGBColorSpace;
    const width = center ? .343 : .47, height = center ? .186 : .164;
    const housing = new T.Mesh(new T.BoxGeometry(width + .025, height + .025, .025), new T.MeshStandardMaterial({ color: 0x111719, roughness: .35 }));
    housing.position.z = -.016; this.add(housing);
    const face = new T.Mesh(new T.PlaneGeometry(width, height), new T.MeshBasicMaterial({ map: this.texture, toneMapped: false }));
    face.name = center ? 'Tank centre screen' : 'Tank instrument screen'; this.add(face);
  }
  public update(t: InstrumentTelemetry, dt: number): void {
    const powered = t.ignitionOn ?? true;
    const charging = t.hybrid?.battery.connector != null;
    const status = `${powered}|${charging}|${t.driveAvailable}|${t.tpmsState?.warning}|${(t.fuelLevel ?? 1) <= .1}`;
    this.elapsed += dt; if (this.elapsed < .1 && status === this.lastStatus) return;
    this.elapsed = 0; this.lastStatus = status;
    const c = this.canvas.getContext('2d')!; const h = this.canvas.height, hybrid = t.hybrid;
    c.fillStyle = powered ? '#091319' : '#000000'; c.fillRect(0, 0, 1200, h);
    this.texture.needsUpdate = true;
    const text = (s: string, x: number, y: number, size = 30, color = '#e4edf0') => {
      c.font = `500 ${size}px Segoe UI, Microsoft YaHei, sans-serif`; c.fillStyle = color; c.textAlign = 'center'; c.fillText(s, x, y);
    };
    if (!hybrid) return;
    const battery = hybrid.battery;
    if (!powered) {
      if (this.center && charging) {
        text('外接充电 · 车辆电源关闭', 600, 150, 38, '#d5ba89');
        text(`SOC ${Math.round(battery.soc * 100)}%`, 600, 280, 70, '#6fe0bb');
        text(`${battery.connector} · ${battery.state} · ${(battery.gridPowerW / 1000).toFixed(1)} kW`, 600, 390, 32);
      }
      return;
    }
    text('TANK 500  ·  Hi4-T', 600, 49, 30, '#d5ba89');
    text(t.driveAvailable ? 'READY' : '驱动暂不可用', 1020, 49, 25, t.driveAvailable ? '#6fe0bb' : '#edbc69');
    text(`${Math.round(Math.abs(t.speedKmh))}`, this.center ? 170 : 260, 205, this.center ? 84 : 118);
    text(`km/h   ${t.gear}`, this.center ? 170 : 260, 255, 29);
    text(`${Math.round(battery.soc * 100)}%`, this.center ? 1020 : 950, 205, 70, '#6fe0bb');
    text('高压电池 SOC', this.center ? 1020 : 950, 255, 27, '#8cacae');
    text(`${hybrid.mode}  ·  ${hybrid.state}`, 600, 105, 29);
    text(`${t.engineRunning ? '发动机运行' : '发动机停止'}  ${Math.round(t.rpm)} rpm`, 600, 155, 25);
    text(`发动机 ${Math.round(hybrid.enginePowerW / 1000)} kW`, 480, 213, 26, '#e8bd81');
    text(`P2 ${Math.round(hybrid.motorPowerW / 1000)} kW`, 710, 213, 26, '#6fe0bb');
    const flow = hybrid.generationPowerW > 500 ? '发动机 / 车轮 → P2 → 电池' : hybrid.motorPowerW > 500 ? '电池 → P2 → 9HAT → 车轮' : '机械动力链待机';
    text(flow, 600, 295, 26, '#a8cdc5');
    const fuel = t.fuelLevel;
    text(fuel === undefined ? '燃油 —' : `燃油 ${Math.round(fuel * 100)}%${fuel <= .1 ? ' · 低油量' : ''}`,
      170, 310, 25, fuel !== undefined && fuel <= .1 ? '#edbc69' : '#e4edf0');
    text(t.tpmsState?.available ? t.tpmsState.warning ? '胎压告警' : '胎压正常' : '胎压不可用', 1020, 310, 25,
      t.tpmsState?.warning ? '#edbc69' : '#8cacae');
    text(`${hybrid.transfer.mode}  ·  ${hybrid.transfer.ratio.toFixed(2)}:1   前/后 ${Math.round(hybrid.transfer.frontShare * 100)}/${Math.round(hybrid.transfer.rearShare * 100)}`, 600, 350, 28, '#d5ba89');
    text(`ABS ${t.indicators?.absWarning ? '故障' : '就绪'}   TCS ${t.indicators?.tcsActive ? '介入' : '待命'}   ${t.indicators?.parkingBrake ? 'EPB' : ''}`, 600, 397, 24);
    if (this.center) {
      text(`驾驶模式 ${t.driveMode === 'WET' ? '越野低速' : t.driveMode ?? 'NORMAL'}   保电目标 ${Math.round(hybrid.holdSOC * 100)}%`, 600, 445, 28);
      text(`电池 ${battery.temperatureC.toFixed(1)} °C   ${Math.round(battery.voltage)} V   ${Math.round(battery.current)} A`, 600, 485, 26);
      text(`可放电 ${(battery.dischargePowerW / 1000).toFixed(0)} kW   可充电 ${(battery.chargePowerW / 1000).toFixed(0)} kW`, 600, 525, 26);
      text(`外接充电 ${battery.state}  ${(battery.gridPowerW / 1000).toFixed(1)} kW`, 600, 565, 26, '#6fe0bb');
      for (let i = 0; i < WHEEL_IDS.length; i++) {
        const tyre = t.tpmsState?.[WHEEL_IDS[i]!];
        text(`${['左前', '右前', '左后', '右后'][i]} ${tyre?.valid && tyre.pressureKPa !== null ? tyre.pressureKPa + ' kPa' : '—'}`,
          180 + i * 280, 615, 25, tyre?.valid && tyre.pressureState !== 'NORMAL' ? '#edbc69' : '#8cacae');
      }
    }
    this.texture.needsUpdate = true;
  }
}
