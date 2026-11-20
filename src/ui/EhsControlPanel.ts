import type { EhsHybridSystem } from '../vehicle/powertrain/EhsHybridSystem';
import type { EhsDriverMode } from '../vehicle/config/EhsHybridConfig';

/** Driver energy requests and charger interlock, separate from aid preferences. */
export class EhsControlPanel {
  private readonly root = document.createElement('details');
  private readonly mode = document.createElement('select');
  private readonly snowToggle = document.createElement('input');
  private readonly hold = document.createElement('input');
  private readonly status = document.createElement('div');
  private readonly message = document.createElement('div');
  private elapsed = 1;
  public constructor(private readonly getPowertrain: () => EhsHybridSystem | undefined,
    private readonly getSnowActive?: () => boolean,
    private readonly onSnowModeChange?: (enabled: boolean) => void) {
    this.root.style.cssText = 'position:fixed;left:16px;top:150px;z-index:35;width:278px;padding:10px 12px;background:#0c1c26ed;color:#edf7f6;font:13px/1.8 Segoe UI,Microsoft YaHei,sans-serif;border:1px solid #63bba4;border-radius:8px;pointer-events:auto';
    const summary = document.createElement('summary'); summary.textContent = 'DM-i · 能量管理 / 充电'; this.root.append(summary);
    for (const [value, label] of [['EV', 'EV 纯电优先'], ['HEV', 'HEV 混动'], ['HOLD', 'HEV 智能保电']]) {
      const o = document.createElement('option'); o.value = value!; o.textContent = label!; this.mode.append(o);
    }
    const row = (label: string, control: HTMLElement) => { const l = document.createElement('label'); l.style.display = 'block'; l.append(label, control); this.root.append(l); };
    row('动力模式 ', this.mode);
    this.snowToggle.type = 'checkbox';
    this.snowToggle.onchange = () => {
      this.onSnowModeChange?.(this.snowToggle.checked);
      this.message.textContent = this.snowToggle.checked ? '已开启雪地模式 SNOW' : '已退出雪地模式，恢复公路驾驶模式';
    };
    row('雪地模式 (SNOW) ', this.snowToggle);
    this.hold.type = 'number'; this.hold.min = '20'; this.hold.max = '80'; this.hold.step = '5'; this.hold.value = '50'; this.hold.style.width = '60px';
    row('保电目标 % ', this.hold);
    const change = () => this.getPowertrain()?.setHybridMode(this.mode.value as EhsDriverMode, Number(this.hold.value) / 100);
    this.mode.onchange = this.hold.onchange = change;
    const buttons = document.createElement('div'); this.root.append(buttons);
    for (const type of ['AC', 'DC', '断开'] as const) {
      const b = document.createElement('button'); b.textContent = type === '断开' ? '断开充电' : `${type}充电`;
      b.onclick = () => {
        const p = this.getPowertrain(); if (!p) return;
        if (type === '断开') { p.battery.disconnect(); this.message.textContent = '充电已断开'; }
        else this.message.textContent = p.connectCharger(type) ? '已连接外接电源' : '请停车、挂P挡并关闭车辆电源后充电';
      }; buttons.append(b);
    }
    this.root.append(this.status, this.message);
    for (const event of ['keydown', 'keyup', 'pointerdown', 'click']) this.root.addEventListener(event, e => e.stopPropagation());
    this.root.hidden = true; document.body.append(this.root);
  }
  public update(dt: number, visible: boolean): void {
    const p = this.getPowertrain(); this.root.hidden = !visible || !p;
    if (!p || !visible) return;
    this.elapsed += dt; if (this.elapsed < .2) return; this.elapsed = 0;
    const s = p.getSnapshot().ehs, b = s.battery;
    this.mode.value = s.mode === 'SPORT' ? 'HEV' : s.mode;
    if (this.getSnowActive) this.snowToggle.checked = this.getSnowActive();
    if (document.activeElement !== this.hold) this.hold.value = String(Math.round(s.holdSOC * 100));
    const fallback = s.evFallbackActive ? ` · 纯电受限(${s.evFallbackReason})` : '';
    this.status.textContent = `请求 ${s.mode} / 实际 ${s.state}${fallback} · SOC ${(b.soc * 100).toFixed(1)}% | P1 ${(s.p1GenerationPowerW / 1000).toFixed(1)} kW`;
  }
  public dispose(): void { this.root.remove(); }
}
