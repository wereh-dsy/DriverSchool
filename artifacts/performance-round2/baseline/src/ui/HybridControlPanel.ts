import type { P2HybridPowertrain } from '../vehicle/powertrain/P2HybridPowertrain';
import type { HybridMode, TransferMode } from '../vehicle/config/P2HybridConfig';

/** Runtime commands, distinct from persistent driver-assistance preferences. */
export class HybridControlPanel {
  private readonly root = document.createElement('details');
  private readonly mode = document.createElement('select');
  private readonly transfer = document.createElement('select');
  private readonly hold = document.createElement('input');
  private readonly status = document.createElement('div');
  private readonly message = document.createElement('div');
  private elapsed = 1;
  public constructor(private readonly getPowertrain: () => P2HybridPowertrain | undefined,
    private readonly getSpeed: () => number, private readonly getBrake: () => number) {
    this.root.style.cssText = 'position:fixed;left:16px;top:150px;z-index:35;width:278px;padding:10px 12px;background:#0d1927ed;color:#edf2f6;font:13px/1.8 Segoe UI,Microsoft YaHei,sans-serif;border:1px solid #8b7951;border-radius:8px;pointer-events:auto';
    const title = document.createElement('summary'); title.textContent = 'Hi4-T · 混动 / 四驱 / 充电'; this.root.append(title);
    const line = (label: string, control: HTMLElement) => { const row = document.createElement('label'); row.style.display = 'block'; row.append(label, control); this.root.append(row); };
    for (const [value, label] of [['EV', '纯电 EV'], ['HYBRID', '智能混动'], ['SPORT', '运动混动'], ['CHARGE_HOLD', '电量保持'], ['CHARGE', '发动机充电']]) {
      const o = document.createElement('option'); o.value = value!; o.textContent = label!; this.mode.append(o);
    }
    line('混动模式 ', this.mode);
    this.hold.type = 'number'; this.hold.min = '15'; this.hold.max = '85'; this.hold.step = '5'; this.hold.value = '50'; this.hold.style.width = '60px';
    line('保电目标 % ', this.hold);
    const selectMode = () => { this.getPowertrain()?.setHybridMode(this.mode.value as HybridMode, Number(this.hold.value) / 100); };
    this.mode.onchange = selectMode; this.hold.onchange = selectMode;
    for (const value of ['2H', 'AWD', '4H', '4L']) { const o = document.createElement('option'); o.value = o.textContent = value; this.transfer.append(o); }
    line('分动模式 ', this.transfer);
    this.transfer.onchange = () => {
      const p = this.getPowertrain(); if (!p) return;
      const accepted = p.requestTransferMode(this.transfer.value as TransferMode, this.getSpeed(), this.getBrake());
      this.message.textContent = accepted ? '分动模式已切换' : '切换失败：4L需停车、N挡、踩刹车；高速切换需低于80km/h';
      this.transfer.value = p.transfer.mode;
    };
    const buttons = document.createElement('div'); this.root.append(buttons);
    for (const type of ['AC', 'DC', '断开'] as const) {
      const button = document.createElement('button'); button.textContent = type === '断开' ? '断开充电' : `${type}充电`;
      button.onclick = () => { const p = this.getPowertrain(); if (!p) return;
        if (type === '断开') { p.battery.disconnect(); this.message.textContent = '充电已断开'; }
        else this.message.textContent = p.connectCharger(type) ? '已接入充电' : '请停车、挂P挡并关闭车辆电源后充电';
      }; buttons.append(button);
    }
    this.root.append(this.status, this.message);
    this.root.addEventListener('keydown', e => e.stopPropagation());
    this.root.addEventListener('pointerdown', e => e.stopPropagation());
    this.root.addEventListener('click', e => e.stopPropagation());
    this.root.hidden = true; document.body.append(this.root);
  }
  public update(dt: number, visible: boolean): void {
    const p = this.getPowertrain(); this.root.hidden = !p || !visible;
    if (!p || !visible) return;
    this.elapsed += dt; if (this.elapsed < .2) return; this.elapsed = 0;
    this.mode.value = p.energyManagement.mode; this.transfer.value = p.transfer.mode;
    if (document.activeElement !== this.hold) this.hold.value = String(Math.round(p.energyManagement.holdSOC * 100));
    const b = p.battery.getSnapshot();
    this.status.textContent = `SOC ${(b.soc * 100).toFixed(1)}% · ${b.energyKWh.toFixed(2)} kWh · ${b.temperatureC.toFixed(0)}°C | ${b.state} ${(b.gridPowerW / 1000).toFixed(1)} kW`;
  }
  public dispose(): void { this.root.remove(); }
}
