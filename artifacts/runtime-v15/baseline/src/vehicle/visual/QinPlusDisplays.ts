import * as T from 'three';
import type { InstrumentTelemetry } from './InstrumentCluster';
import { drawNavigationBanner } from '../../ui/NavigationDisplay';

/** Every instance owns its canvas, texture and material. Physical EHS telemetry only. */
export class QinPlusDisplay extends T.Group {
  public readonly canvas = document.createElement('canvas');
  public readonly texture: T.CanvasTexture;
  public readonly screen: T.Mesh<T.PlaneGeometry, T.MeshStandardMaterial>;
  private elapsed = 1;
  private navigation = false;
  public cyclePage(): void { this.navigation = !this.navigation; this.elapsed = 1; }
  public constructor(private readonly center = false) {
    super(); this.name = center ? 'Qin DiLink 10.1 energy display' : 'Qin floating 8.8 instruments';
    this.canvas.width = 1000; this.canvas.height = center ? 600 : 340;
    this.texture = new T.CanvasTexture(this.canvas); this.texture.colorSpace = T.SRGBColorSpace;
    const w = center ? .224 : .207, h = center ? .134 : .071;
    const housing = new T.Mesh(new T.BoxGeometry(w + .014, h + .014, .018),
      new T.MeshStandardMaterial({ color: 0x11171c, roughness: .3 }));
    housing.position.z = -.01; this.add(housing);
    this.screen = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({
      map: this.texture, emissiveMap: this.texture, emissive: 0xffffff, emissiveIntensity: .85,
      color: 0x111111, roughness: .5, toneMapped: false }));
    this.screen.position.z = .001; this.add(this.screen);
  }
  public update(t: InstrumentTelemetry, dt: number): void {
    this.elapsed += dt; if (this.elapsed < .1) return; this.elapsed = 0;
    const x = this.canvas.getContext('2d'); if (!x) return;
    const w = this.canvas.width, h = this.canvas.height, e = t.ehs, ev = t.ev;
    x.fillStyle = '#08141d'; x.fillRect(0, 0, w, h);
    if (t.ignitionOn === false) {
      if (this.center && e?.battery.connector) {
        x.fillStyle = '#79e4c4'; x.font = '38px "Microsoft YaHei",sans-serif';
        x.fillText(`外接${e.battery.connector}充电 · ${e.battery.state}`, 55, 180);
        x.fillText(`${(e.battery.gridPowerW / 1000).toFixed(1)} kW · SOC ${(e.battery.soc * 100).toFixed(1)}%`, 55, 260);
      }
      this.texture.needsUpdate = true; return;
    }
    if (this.center && this.navigation) {
      const n = t.sharedVehicle?.navigation;
      if (n?.map.available) n.map.draw(x, { x: 0, y: 0, width: w, height: h }, n.pose.x, n.pose.z, n.pose.yaw, Math.max(400, t.speedKmh * 9));
      drawNavigationBanner(x, n?.guidance, { x: 20, y: 20, width: 530, height: 140 });
      x.fillStyle = '#102332'; x.fillRect(0, h - 54, w, 54); x.fillStyle = '#e3edf5';
      x.font = '26px "Microsoft YaHei",sans-serif'; x.fillText(`${n?.roadName ?? '导航数据不可用'} · 点击返回能量流`, 24, h - 18);
      this.texture.needsUpdate = true; return;
    }
    const text = (s: string, px: number, py: number, size: number, color = '#ecf3f5') => {
      x.fillStyle = color; x.font = `${size}px "Segoe UI", "Microsoft YaHei", sans-serif`; x.fillText(s, px, py);
    };
    text('BYD  秦 PLUS  DM-i', 38, 48, 26, '#9cbdc8');
    text(`${Math.round(t.speedKmh)}`, 48, this.center ? 146 : 170, this.center ? 66 : 108);
    text('km/h', this.center ? 200 : 250, this.center ? 140 : 167, 25, '#9cbdc8');
    text(`${t.gear}  ${e?.state === 'EV' ? 'EV' : 'HEV'} / ${e?.state ?? 'EV'}`, 48, this.center ? 200 : 225, 31, '#79e4c4');
    text(`SOC ${((ev?.stateOfCharge ?? 0) * 100).toFixed(1)}%`, 630, 115, 39, '#79e4c4');
    text(`${(ev?.remainingEnergyKWh ?? 0).toFixed(2)} kWh`, 630, 160, 28);
    text(`${(e?.busPowerW ?? 0) / 1000 >= 0 ? '放电' : '充电'} ${Math.abs((e?.busPowerW ?? 0) / 1000).toFixed(1)} kW`, 630, 205, 25);
    text(`${t.engineRunning ? '发动机运行' : '发动机停止'}  ${Math.round(t.rpm)} rpm`, 48, this.center ? 255 : 298, 27);
    if (this.center) {
      const engineOn = (e?.enginePowerW ?? 0) > 500;
      const generation = (e?.p1GenerationPowerW ?? 0) > 100;
      const motor = Math.abs(e?.p3MechanicalPowerW ?? 0) > 100;
      const direct = (e?.directClutch.torqueNm ?? 0) > 1;
      const node = (label: string, px: number, py: number, active: boolean) => {
        x.strokeStyle = active ? '#79e4c4' : '#354a59'; x.lineWidth = 3;
        x.strokeRect(px, py, 150, 64); text(label, px + 15, py + 42, 25, active ? '#79e4c4' : '#758a96');
      };
      const arrow = (a: number, b: number, y: number, active: boolean, reverse = false) => {
        x.strokeStyle = active ? '#79e4c4' : '#253b49'; x.lineWidth = active ? 5 : 2;
        x.beginPath(); x.moveTo(a, y); x.lineTo(b, y); x.stroke();
        if (active) text(reverse ? '◀' : '▶', (a + b) / 2 - 12, y + 9, 26, '#79e4c4');
      };
      node('发动机', 45, 300, engineOn); node('P1 发电', 280, 300, generation);
      node('HV DC 母线', 515, 300, generation || motor); node('P3 电驱', 750, 300, motor);
      arrow(195, 280, 332, generation); arrow(430, 515, 332, generation);
      arrow(665, 750, 332, motor, (e?.p3MechanicalPowerW ?? 0) < 0);
      text(`电池 ⇄ 母线 ${((e?.busPowerW ?? 0) / 1000).toFixed(1)} kW`, 515, 395, 23, '#79e4c4');
      text(`P1 ${((e?.p1GenerationPowerW ?? 0) / 1000).toFixed(1)} kW    P3 ${((e?.p3MechanicalPowerW ?? 0) / 1000).toFixed(1)} kW`, 48, 420, 28);
      text(`直驱 ${direct ? '接合' : '断开'} · 策略 ${e?.mode ?? 'HEV'} · 保电 ${((e?.holdSOC ?? .5) * 100).toFixed(0)}%`, 48, 470, 27, direct ? '#79e4c4' : '#9cbdc8');
      text(direct ? '发动机 ━ 机械直驱 ━ 前轮' : '发动机机械路径断开', 48, 565, 23, direct ? '#79e4c4' : '#7a99aa');
      text(`电池 ${(e?.battery.temperatureC ?? 20).toFixed(0)}°C    ${e?.battery.state ?? 'DISCONNECTED'}`, 48, 525, 27);
    }
    this.texture.needsUpdate = true;
  }
}
