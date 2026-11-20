import type { P2HybridPowertrain } from '../vehicle/powertrain/P2HybridPowertrain';
import type { HybridMode, P2TerrainMode, TransferMode } from '../vehicle/config/P2HybridConfig';

/** Runtime commands, distinct from persistent driver-assistance preferences. */
export class HybridControlPanel {
  private readonly root = document.createElement('details');
  private readonly mode = document.createElement('select');
  private readonly terrain = document.createElement('select');
  private readonly transfer = document.createElement('select');
  private readonly hold = document.createElement('input');
  private readonly status = document.createElement('div');
  private readonly message = document.createElement('div');
  private readonly rearLock = document.createElement('input');
  private readonly frontLock = document.createElement('input');
  private elapsed = 1;
  public constructor(private readonly getPowertrain: () => P2HybridPowertrain | undefined,
    private readonly getSpeed: () => number, private readonly getBrake: () => number,
    private readonly onTerrainModeChange?: (mode: P2TerrainMode) => void) {
    this.root.style.cssText = 'position:fixed;left:16px;top:150px;z-index:35;width:278px;padding:10px 12px;background:#0d1927ed;color:#edf2f6;font:13px/1.8 Segoe UI,Microsoft YaHei,sans-serif;border:1px solid #8b7951;border-radius:8px;pointer-events:auto';
    const title = document.createElement('summary'); title.textContent = 'Hi4-T · 动力 / 全地形 / 四驱'; this.root.append(title);
    const line = (label: string, control: HTMLElement) => { const row = document.createElement('label'); row.style.display = 'block'; row.append(label, control); this.root.append(row); };
    for (const [value, label] of [['EV', '纯电 EV'], ['HEV', '混动 HEV'], ['INTELLIGENT', '智能 INTELLIGENT'], ['CHARGE_HOLD', '电量保持'], ['CHARGE', '发动机充电']]) {
      const o = document.createElement('option'); o.value = value!; o.textContent = label!; this.mode.append(o);
    }
    line('动力模式 ', this.mode);
    for (const [value, label] of [['OFF', '公路（关闭）'], ['SNOW', '雪地 SNOW'], ['MUD', '泥地 MUD'], ['SAND', '沙地 SAND']]) {
      const o = document.createElement('option'); o.value = value!; o.textContent = label!; this.terrain.append(o);
    }
    line('全地形模式 ', this.terrain);
    this.terrain.onchange = () => {
      const next = this.terrain.value as P2TerrainMode;
      if (this.onTerrainModeChange) this.onTerrainModeChange(next);
      else this.getPowertrain()?.setTerrainMode(next);
      this.message.textContent = next === 'OFF' ? '已返回公路驾驶模式' : `全地形模式 · ${next}`;
    };
    this.hold.type = 'number'; this.hold.min = '15'; this.hold.max = '85'; this.hold.step = '5'; this.hold.value = '50'; this.hold.style.width = '60px';
    line('保电目标 % ', this.hold);
    const selectMode = () => { this.getPowertrain()?.setHybridMode(this.mode.value as HybridMode, Number(this.hold.value) / 100); };
    this.mode.onchange = selectMode; this.hold.onchange = selectMode;
    for (const value of ['2H', 'AWD', '4H', '4L']) { const o = document.createElement('option'); o.value = o.textContent = value; this.transfer.append(o); }
    line('分动模式 ', this.transfer);
    for (const [axle, checkbox, label] of [['rear', this.rearLock, '后桥差速锁 '], ['front', this.frontLock, '前桥差速锁 ']] as const) {
      checkbox.type = 'checkbox'; line(label, checkbox);
      checkbox.onchange = () => {
        const p = this.getPowertrain(); if (!p) return;
        const ok = p.requestAxleLock(axle, checkbox.checked, this.getSpeed());
        this.message.textContent = ok ? checkbox.checked ? '差速锁已锁止' : '差速锁已解除' : '请低速并同步车轮，在4H/4L操作后锁；前锁需已装备并选择4L';
        checkbox.checked = (axle === 'rear' ? p.transfer.rearLock : p.transfer.frontLock)?.engaged ?? false;
      };
    }
    this.transfer.onchange = () => {
      const p = this.getPowertrain(); if (!p) return;
      const accepted = p.requestTransferMode(this.transfer.value as TransferMode, this.getSpeed(), this.getBrake());
      this.message.textContent = accepted ? '分动模式已切换' : p.transfer.rejectedReason === 'synchronize-front-rear-shafts'
        ? '请收油、停车，使前后传动轴同步后再锁止' : '切换失败：4L需停车、N挡、踩刹车；高速切换需低于80km/h';
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
    const rawMode = p.energyManagement.mode;
    this.mode.value = rawMode === 'HYBRID' ? 'HEV' : rawMode === 'SPORT' ? 'HEV' : rawMode;
    this.terrain.value = p.terrainMode;
    this.transfer.value = p.transfer.mode;
    this.rearLock.disabled = !p.transfer.rearLock; this.frontLock.disabled = !p.transfer.frontLock;
    this.rearLock.checked = p.transfer.rearLock?.engaged ?? false; this.frontLock.checked = p.transfer.frontLock?.engaged ?? false;
    this.frontLock.title = p.transfer.frontLock ? '' : '本车型未安装前桥差速锁';
    if (document.activeElement !== this.hold) this.hold.value = String(Math.round(p.energyManagement.holdSOC * 100));
    const b = p.battery.getSnapshot();
    const fallback = p.energyManagement.evFallbackActive ? ` · 纯电受限(${p.energyManagement.evFallbackReason})` : '';
    this.status.textContent = `实际 ${p.energyManagement.state}${fallback} · SOC ${(b.soc * 100).toFixed(1)}% · ${b.temperatureC.toFixed(0)}°C | ${b.state} ${(b.gridPowerW / 1000).toFixed(1)} kW`;
  }
  public dispose(): void { this.root.remove(); }
}
