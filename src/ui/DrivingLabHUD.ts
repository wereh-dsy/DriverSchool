import { AccelerationTestView } from '../experimental/acceleration/AccelerationTestView';
import type { AccelerationTarget, AccelerationTestState } from '../experimental/acceleration/AccelerationTest';
import type { EhsDriverMode } from '../vehicle/config/EhsHybridConfig';
import type { HybridMode, P2TerrainMode, TransferMode } from '../vehicle/config/P2HybridConfig';
import { EhsHybridSystem } from '../vehicle/powertrain/EhsHybridSystem';
import { ElectricPowertrain } from '../vehicle/powertrain/ElectricPowertrain';
import { P2HybridPowertrain } from '../vehicle/powertrain/P2HybridPowertrain';
import type { Powertrain, PowertrainSnapshot } from '../vehicle/powertrain/Powertrain';
import type { ScenarioDebugger } from '../vehicle/adas/debugger/ScenarioDebugger';
import { ScenarioDebuggerPanelView } from '../vehicle/adas/debugger/ScenarioDebuggerPanelView';

export type DrivingLabModuleId = 'scenario' | 'trajectory' | 'acceleration' | 'energy';

export interface DrivingLabModuleStates {
  scenario: boolean;
  trajectory: boolean;
  acceleration: boolean;
  energy: boolean;
}

export interface DrivingLabEnergyHost {
  getPowertrain(): Powertrain | undefined;
  getSnapshot(): PowertrainSnapshot;
  getSpeedMps(): number;
  getBrakeInput(): number;
  getSnowModeActive?(): boolean;
  onSnowModeChange?(enabled: boolean): void;
  onP2TerrainModeChange?(mode: P2TerrainMode): void;
}

export interface DrivingLabCallbacks {
  onModuleToggle: (moduleId: DrivingLabModuleId, enabled: boolean) => void;
  onRequestClose: () => void;
  onAccelArm: (target?: AccelerationTarget) => void;
  onAccelStop: () => void;
  onAccelTargetChange: (target: AccelerationTarget) => void;
  onAccelExport: () => string | null;
}

const MODULE_META: ReadonlyArray<{ id: DrivingLabModuleId; label: string; icon: string }> = [
  { id: 'scenario', label: '场景模拟', icon: '🎯' },
  { id: 'trajectory', label: '轨迹预测', icon: '〰' },
  { id: 'acceleration', label: '加速测试', icon: '⏱' },
  { id: 'energy', label: '能量管理', icon: '⚡' },
];

/**
 * Unified, independently lifecycle-managed Driving Lab HUD window.
 * Reuses existing ScenarioDebuggerPanelView, TrajectoryPrediction state,
 * AccelerationTestView, and real EhsHybridSystem/P2HybridPowertrain/ElectricPowertrain APIs.
 */
export class DrivingLabHUD {
  public readonly root: HTMLDivElement;
  public accelView: AccelerationTestView | null = null;

  private readonly bodyWrap: HTMLDivElement;
  private readonly tabButtons = new Map<DrivingLabModuleId, HTMLButtonElement>();
  private readonly moduleSwitches = new Map<DrivingLabModuleId, HTMLInputElement>();
  private readonly panes = new Map<DrivingLabModuleId, HTMLDivElement>();
  private readonly cleanupFns: Array<() => void> = [];

  private readonly scenarioPanelView: ScenarioDebuggerPanelView;
  private readonly scenarioDisabledNotice: HTMLDivElement;

  private readonly trajectoryReadout: HTMLDivElement;
  private readonly accelHost: HTMLDivElement;
  private readonly accelDisabledNotice: HTMLDivElement;

  private readonly energyContent: HTMLDivElement;
  private readonly energyNotice: HTMLDivElement;
  private readonly energyReadout: HTMLDivElement;
  private readonly energyEhsControls: HTMLDivElement;
  private readonly energyP2Controls: HTMLDivElement;
  private readonly energyMsg: HTMLDivElement;

  // Reused EHS controls inside Driving Lab
  private readonly ehsModeSelect: HTMLSelectElement;
  private readonly ehsSnowCheck: HTMLInputElement;
  private readonly ehsHoldInput: HTMLInputElement;

  // Reused P2 Hi4-T controls inside Driving Lab
  private readonly p2ModeSelect: HTMLSelectElement;
  private readonly p2TerrainSelect: HTMLSelectElement;
  private readonly p2HoldInput: HTMLInputElement;
  private readonly p2TransferSelect: HTMLSelectElement;
  private readonly p2RearLockCheck: HTMLInputElement;
  private readonly p2FrontLockCheck: HTMLInputElement;

  private activeTab: DrivingLabModuleId = 'scenario';
  private folded = false;
  private states: DrivingLabModuleStates;
  private telemetryElapsed = 0.25;

  public constructor(
    scenarioDebugger: ScenarioDebugger,
    private readonly energyHost: DrivingLabEnergyHost,
    private readonly callbacks: DrivingLabCallbacks,
    initialStates: DrivingLabModuleStates,
    host: HTMLElement = document.body,
  ) {
    this.states = { ...initialStates };

    const root = document.createElement('div');
    root.id = 'driving-lab-hud';
    root.className = 'driving-lab-hud';
    root.style.cssText = `
      position: fixed;
      top: 56px;
      left: 16px;
      width: 472px;
      max-width: calc(100vw - 32px);
      max-height: calc(100vh - 80px);
      background: rgba(11, 19, 32, 0.94);
      backdrop-filter: blur(10px);
      color: #e2e8f0;
      font: 12px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif;
      border: 1px solid #38bdf866;
      border-radius: 10px;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.58);
      z-index: 9800;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      pointer-events: auto;
      user-select: none;
    `;

    // Scoped CSS so embedded AccelerationTestView renders statically inside the tab pane
    const scopedStyle = document.createElement('style');
    scopedStyle.textContent = `
      .driving-lab-accel-host .acceleration-test {
        position: static !important;
        right: auto !important;
        bottom: auto !important;
        width: 100% !important;
        max-width: none !important;
        box-sizing: border-box;
        pointer-events: auto !important;
        background: rgba(15, 23, 42, 0.78);
        border: 1px solid #334155;
      }
    `;
    root.appendChild(scopedStyle);

    // Header (Draggable + Collapse + Independent Close)
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 9px 14px;
      background: rgba(20, 34, 54, 0.95);
      border-bottom: 1px solid #334155;
      cursor: move;
    `;
    const title = document.createElement('div');
    title.innerHTML = '<strong style="color:#38bdf8;letter-spacing:.04em;">🧪 驾驶实验室 · Driving Lab</strong> <span style="font-size:10px;color:#94a3b8;">独立控制台</span>';

    const headerActions = document.createElement('div');
    headerActions.style.cssText = 'display:flex;align-items:center;gap:6px;';

    const foldBtn = document.createElement('button');
    foldBtn.type = 'button';
    foldBtn.textContent = '▾';
    foldBtn.title = '折叠 / 展开';
    foldBtn.style.cssText = 'background:transparent;border:none;color:#cbd5e1;font-size:14px;cursor:pointer;padding:2px 6px;';
    foldBtn.onclick = (e) => {
      e.stopPropagation();
      this.folded = !this.folded;
      this.bodyWrap.style.display = this.folded ? 'none' : 'flex';
      foldBtn.textContent = this.folded ? '▸' : '▾';
      this.syncPaneVisibility();
    };

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.title = '关闭驾驶实验室';
    closeBtn.style.cssText = 'background:transparent;border:none;color:#94a3b8;font-size:15px;cursor:pointer;padding:2px 6px;line-height:1;';
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      this.callbacks.onRequestClose();
    };

    headerActions.append(foldBtn, closeBtn);
    header.append(title, headerActions);
    root.appendChild(header);

    // Body Container
    const bodyWrap = document.createElement('div');
    bodyWrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:10px 12px;overflow-y:auto;max-height:calc(100vh - 130px);';

    // Module Master Strip (4 switches + 4 view tabs)
    const tabGrid = document.createElement('div');
    tabGrid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:5px;';

    for (const m of MODULE_META) {
      const card = document.createElement('div');
      card.style.cssText = 'display:flex;flex-direction:column;gap:4px;background:#0f172a;border:1px solid #334155;border-radius:6px;padding:5px 6px;';

      const switchRow = document.createElement('label');
      switchRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;font-size:10px;color:#94a3b8;cursor:pointer;';
      const swLabel = document.createElement('span');
      swLabel.textContent = `${m.icon} ${m.label}`;
      const sw = document.createElement('input');
      sw.type = 'checkbox';
      sw.checked = this.states[m.id];
      sw.setAttribute('aria-label', `${m.label}开关`);
      sw.onchange = () => {
        this.states[m.id] = sw.checked;
        this.callbacks.onModuleToggle(m.id, sw.checked);
        if (sw.checked) this.setActiveTab(m.id);
        this.syncPaneVisibility();
      };
      switchRow.append(swLabel, sw);
      this.moduleSwitches.set(m.id, sw);

      const tabBtn = document.createElement('button');
      tabBtn.type = 'button';
      tabBtn.textContent = '查看面板';
      tabBtn.style.cssText = 'padding:3px 4px;font-size:10px;border-radius:4px;border:1px solid #334155;background:#1e293b;color:#cbd5e1;cursor:pointer;';
      tabBtn.onclick = () => this.setActiveTab(m.id);
      this.tabButtons.set(m.id, tabBtn);

      card.append(switchRow, tabBtn);
      tabGrid.appendChild(card);
    }
    bodyWrap.appendChild(tabGrid);

    // 1. Scenario Pane
    const scenarioPane = document.createElement('div');
    scenarioPane.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    this.scenarioDisabledNotice = this.makeNotice('场景模拟模块当前已关闭，请在上方打开开关以生成并管理动态交通测试场景。');
    this.scenarioPanelView = new ScenarioDebuggerPanelView(scenarioDebugger);
    scenarioPane.append(this.scenarioDisabledNotice, this.scenarioPanelView.element);
    this.panes.set('scenario', scenarioPane);
    bodyWrap.appendChild(scenarioPane);

    // 2. Trajectory Prediction Pane
    const trajPane = document.createElement('div');
    trajPane.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    this.trajectoryReadout = document.createElement('div');
    this.trajectoryReadout.style.cssText = 'padding:10px;background:#0f172a;border:1px solid #334155;border-radius:6px;line-height:1.7;color:#cbd5e1;';
    trajPane.appendChild(this.trajectoryReadout);
    this.panes.set('trajectory', trajPane);
    bodyWrap.appendChild(trajPane);

    // 3. Acceleration Test Pane (reuses real AccelerationTestView)
    const accelPane = document.createElement('div');
    accelPane.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    this.accelDisabledNotice = this.makeNotice('加速测试模块当前已关闭，请在上方打开开关以启用百公里/二百公里性能计时与诊断导出。');
    this.accelHost = document.createElement('div');
    this.accelHost.className = 'driving-lab-accel-host';
    this.accelView = new AccelerationTestView(this.accelHost);
    this.accelView.onArm = () => this.callbacks.onAccelArm();
    this.accelView.onStop = () => this.callbacks.onAccelStop();
    this.accelView.onTargetChange = (t) => this.callbacks.onAccelTargetChange(t);
    this.accelView.onExport = () => this.callbacks.onAccelExport();
    accelPane.append(this.accelDisabledNotice, this.accelHost);
    this.panes.set('acceleration', accelPane);
    bodyWrap.appendChild(accelPane);

    // 4. Energy Management Pane (reuses live powertrain instances)
    const energyPane = document.createElement('div');
    energyPane.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    this.energyNotice = this.makeNotice('');
    this.energyContent = document.createElement('div');
    this.energyContent.style.cssText = 'display:flex;flex-direction:column;gap:8px;background:#0f172a;border:1px solid #334155;border-radius:6px;padding:10px;';
    this.energyReadout = document.createElement('div');
    this.energyReadout.style.cssText = 'font-family:Consolas,monospace;font-size:11px;color:#7dd3fc;line-height:1.6;';
    this.energyMsg = document.createElement('div');
    this.energyMsg.style.cssText = 'font-size:11px;color:#94a3b8;min-height:16px;';

    // EHS Controls
    this.energyEhsControls = document.createElement('div');
    this.energyEhsControls.style.cssText = 'display:none;flex-direction:column;gap:6px;';
    this.ehsModeSelect = document.createElement('select');
    for (const [v, l] of [['EV', 'EV 纯电优先'], ['HEV', 'HEV 混动'], ['HOLD', 'HEV 智能保电']]) {
      const o = document.createElement('option'); o.value = v!; o.textContent = l!; this.ehsModeSelect.append(o);
    }
    this.ehsSnowCheck = document.createElement('input');
    this.ehsSnowCheck.type = 'checkbox';
    this.ehsHoldInput = document.createElement('input');
    this.ehsHoldInput.type = 'number'; this.ehsHoldInput.min = '20'; this.ehsHoldInput.max = '80'; this.ehsHoldInput.step = '5'; this.ehsHoldInput.value = '50';

    this.ehsModeSelect.onchange = this.ehsHoldInput.onchange = () => {
      const p = this.energyHost.getPowertrain();
      if (p instanceof EhsHybridSystem) {
        p.setHybridMode(this.ehsModeSelect.value as EhsDriverMode, Number(this.ehsHoldInput.value) / 100);
      }
    };
    this.ehsSnowCheck.onchange = () => {
      this.energyHost.onSnowModeChange?.(this.ehsSnowCheck.checked);
      this.energyMsg.textContent = this.ehsSnowCheck.checked ? '已开启雪地模式 SNOW' : '已恢复公路模式';
    };
    this.energyEhsControls.append(
      this.makeRow('动力模式', this.ehsModeSelect),
      this.makeRow('雪地模式 (SNOW)', this.ehsSnowCheck),
      this.makeRow('保电目标 (%)', this.ehsHoldInput),
      this.makeChargerButtons(() => this.energyHost.getPowertrain()),
    );

    // P2 Hi4-T Controls
    this.energyP2Controls = document.createElement('div');
    this.energyP2Controls.style.cssText = 'display:none;flex-direction:column;gap:6px;';
    this.p2ModeSelect = document.createElement('select');
    for (const [v, l] of [['EV', '纯电 EV'], ['HEV', '混动 HEV'], ['INTELLIGENT', '智能 INTELLIGENT'], ['CHARGE_HOLD', '电量保持'], ['CHARGE', '发动机充电']]) {
      const o = document.createElement('option'); o.value = v!; o.textContent = l!; this.p2ModeSelect.append(o);
    }
    this.p2TerrainSelect = document.createElement('select');
    for (const [v, l] of [['OFF', '公路（关闭）'], ['SNOW', '雪地 SNOW'], ['MUD', '泥地 MUD'], ['SAND', '沙地 SAND']]) {
      const o = document.createElement('option'); o.value = v!; o.textContent = l!; this.p2TerrainSelect.append(o);
    }
    this.p2HoldInput = document.createElement('input');
    this.p2HoldInput.type = 'number'; this.p2HoldInput.min = '15'; this.p2HoldInput.max = '85'; this.p2HoldInput.step = '5'; this.p2HoldInput.value = '50';
    this.p2TransferSelect = document.createElement('select');
    for (const v of ['2H', 'AWD', '4H', '4L']) {
      const o = document.createElement('option'); o.value = o.textContent = v; this.p2TransferSelect.append(o);
    }
    this.p2RearLockCheck = document.createElement('input'); this.p2RearLockCheck.type = 'checkbox';
    this.p2FrontLockCheck = document.createElement('input'); this.p2FrontLockCheck.type = 'checkbox';

    const applyP2Mode = () => {
      const p = this.energyHost.getPowertrain();
      if (p instanceof P2HybridPowertrain) {
        p.setHybridMode(this.p2ModeSelect.value as HybridMode, Number(this.p2HoldInput.value) / 100);
      }
    };
    this.p2ModeSelect.onchange = this.p2HoldInput.onchange = applyP2Mode;
    this.p2TerrainSelect.onchange = () => {
      const mode = this.p2TerrainSelect.value as P2TerrainMode;
      if (this.energyHost.onP2TerrainModeChange) this.energyHost.onP2TerrainModeChange(mode);
      else if (this.energyHost.getPowertrain() instanceof P2HybridPowertrain) {
        (this.energyHost.getPowertrain() as P2HybridPowertrain).setTerrainMode(mode);
      }
      this.energyMsg.textContent = mode === 'OFF' ? '已返回公路模式' : `全地形模式 · ${mode}`;
    };
    this.p2TransferSelect.onchange = () => {
      const p = this.energyHost.getPowertrain();
      if (!(p instanceof P2HybridPowertrain)) return;
      const ok = p.requestTransferMode(
        this.p2TransferSelect.value as TransferMode,
        this.energyHost.getSpeedMps(),
        this.energyHost.getBrakeInput(),
      );
      this.energyMsg.textContent = ok
        ? '分动模式已切换'
        : p.transfer.rejectedReason === 'synchronize-front-rear-shafts'
          ? '请收油、停车，使前后传动轴同步后再操作'
          : '切换失败：4L需停车、N挡、踩刹车；高速切换需低于80km/h';
      this.p2TransferSelect.value = p.transfer.mode;
    };
    for (const [axle, cb] of [['rear', this.p2RearLockCheck], ['front', this.p2FrontLockCheck]] as const) {
      cb.onchange = () => {
        const p = this.energyHost.getPowertrain();
        if (!(p instanceof P2HybridPowertrain)) return;
        const ok = p.requestAxleLock(axle, cb.checked, this.energyHost.getSpeedMps());
        this.energyMsg.textContent = ok
          ? cb.checked ? '差速锁已锁止' : '差速锁已解除'
          : '请低速在 4H/4L 操作后锁；前锁需已装备并选择 4L';
        cb.checked = (axle === 'rear' ? p.transfer.rearLock : p.transfer.frontLock)?.engaged ?? false;
      };
    }

    this.energyP2Controls.append(
      this.makeRow('动力模式', this.p2ModeSelect),
      this.makeRow('全地形模式', this.p2TerrainSelect),
      this.makeRow('保电目标 (%)', this.p2HoldInput),
      this.makeRow('分动模式', this.p2TransferSelect),
      this.makeRow('后桥差速锁', this.p2RearLockCheck),
      this.makeRow('前桥差速锁', this.p2FrontLockCheck),
      this.makeChargerButtons(() => this.energyHost.getPowertrain()),
    );

    this.energyContent.append(this.energyReadout, this.energyEhsControls, this.energyP2Controls, this.energyMsg);
    energyPane.append(this.energyNotice, this.energyContent);
    this.panes.set('energy', energyPane);
    bodyWrap.appendChild(energyPane);

    root.appendChild(bodyWrap);

    for (const evt of ['keydown', 'keyup', 'pointerdown']) {
      const stop = (e: Event) => e.stopPropagation();
      root.addEventListener(evt, stop);
      this.cleanupFns.push(() => root.removeEventListener(evt, stop));
    }

    // Window dragging
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'BUTTON') return;
      dragging = true;
      const rect = root.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      e.stopPropagation();
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const nx = Math.max(8, Math.min(window.innerWidth - 140, startLeft + (e.clientX - startX)));
      const ny = Math.max(8, Math.min(window.innerHeight - 50, startTop + (e.clientY - startY)));
      root.style.left = `${nx}px`;
      root.style.top = `${ny}px`;
    };
    const onUp = () => { dragging = false; };
    header.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    this.cleanupFns.push(() => {
      header.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    });

    host.appendChild(root);
    this.bodyWrap = bodyWrap;
    this.root = root;

    this.setActiveTab('scenario');
    this.syncPaneVisibility();
  }

  public setModuleStates(next: DrivingLabModuleStates): void {
    this.states = { ...next };
    for (const [id, sw] of this.moduleSwitches) {
      sw.checked = this.states[id];
    }
    this.syncPaneVisibility();
  }

  public setActiveTab(tab: DrivingLabModuleId): void {
    this.activeTab = tab;
    this.syncPaneVisibility();
  }

  public setContext(vehicleName: string, groundName: string): void {
    this.accelView?.setContext(vehicleName, groundName);
  }

  public update(
    dt: number,
    accelState: Readonly<AccelerationTestState> | null,
    accelActive: boolean,
    steeringRad: number,
    speedMps: number,
  ): void {
    if (this.states.acceleration && accelState) {
      this.accelView?.update(dt, accelState, accelActive && this.activeTab === 'acceleration');
    } else {
      this.accelHost.hidden = true;
    }

    this.telemetryElapsed += dt;
    if (this.telemetryElapsed < 0.2) return;
    this.telemetryElapsed = 0;

    if (this.activeTab === 'trajectory') {
      const enabled = this.states.trajectory;
      this.trajectoryReadout.innerHTML = enabled
        ? `<div><strong style="color:#38bdf8;">轨迹预测可视化：已开启</strong></div>
           <div>车速：${(Math.abs(speedMps) * 3.6).toFixed(1)} km/h · 前轮转角参考：${(steeringRad * 57.2958).toFixed(1)}°</div>
           <div style="color:#94a3b8;font-size:11px;">复用车辆运动学与 Ackermann/轨迹预测通道，直接投影车辆实时前向轮迹带。</div>`
        : '<div style="color:#94a3b8;">轨迹预测模块当前已关闭，请在上方开启开关。开启后将实时渲染前瞻轮迹曲线。</div>';
    }

    if (this.activeTab === 'energy') {
      this.refreshEnergyPane();
    }
  }

  private syncPaneVisibility(): void {
    for (const [id, pane] of this.panes) {
      pane.style.display = id === this.activeTab ? 'flex' : 'none';
    }
    for (const [id, btn] of this.tabButtons) {
      const active = id === this.activeTab;
      btn.style.background = active ? '#0284c7' : '#1e293b';
      btn.style.color = active ? '#fff' : '#cbd5e1';
      btn.style.borderColor = active ? '#38bdf8' : '#334155';
      btn.textContent = active ? '当前查看' : '查看面板';
    }

    const scenarioOn = this.states.scenario;
    this.scenarioDisabledNotice.style.display = scenarioOn ? 'none' : 'block';
    this.scenarioPanelView.element.style.display = scenarioOn ? 'flex' : 'none';
    this.scenarioPanelView.setRefreshActive(scenarioOn && this.activeTab === 'scenario' && !this.folded);

    const accelOn = this.states.acceleration;
    this.accelDisabledNotice.style.display = accelOn ? 'none' : 'block';
    this.accelHost.style.display = accelOn ? 'block' : 'none';

    if (this.activeTab === 'energy') {
      this.refreshEnergyPane();
    }
  }

  private refreshEnergyPane(): void {
    if (!this.states.energy) {
      this.energyNotice.style.display = 'block';
      this.energyNotice.textContent = '能量管理模块当前已关闭，请在上方开启开关以查看当前车型的混动 / 电驱能量状态。';
      this.energyContent.style.display = 'none';
      return;
    }

    const p = this.energyHost.getPowertrain();
    const snap = this.energyHost.getSnapshot();

    if (p instanceof EhsHybridSystem && snap.ehs) {
      this.energyNotice.style.display = 'none';
      this.energyContent.style.display = 'flex';
      this.energyEhsControls.style.display = 'flex';
      this.energyP2Controls.style.display = 'none';
      const s = snap.ehs;
      const b = s.battery;
      this.ehsModeSelect.value = s.mode === 'SPORT' ? 'HEV' : s.mode;
      if (this.energyHost.getSnowModeActive) this.ehsSnowCheck.checked = this.energyHost.getSnowModeActive();
      if (document.activeElement !== this.ehsHoldInput) this.ehsHoldInput.value = String(Math.round(s.holdSOC * 100));
      const fallback = s.evFallbackActive ? ` · 纯电受限(${s.evFallbackReason})` : '';
      this.energyReadout.innerHTML =
        `<div>车型系统：<strong>DM-i 串并联混动 (EHS)</strong></div>` +
        `<div>运行状态：请求 ${s.mode} / 实际 ${s.state}${fallback}</div>` +
        `<div>电池 SOC：${(b.soc * 100).toFixed(1)}% · 温度 ${b.temperatureC.toFixed(0)}°C · 电网 ${(b.gridPowerW / 1000).toFixed(1)} kW</div>` +
        `<div>P1 发电功率：${(s.p1GenerationPowerW / 1000).toFixed(1)} kW · 引擎转速 ${snap.ice ? snap.ice.rpm.toFixed(0) : 0} rpm</div>`;
      return;
    }

    if (p instanceof P2HybridPowertrain && snap.hybrid) {
      this.energyNotice.style.display = 'none';
      this.energyContent.style.display = 'flex';
      this.energyEhsControls.style.display = 'none';
      this.energyP2Controls.style.display = 'flex';
      const b = p.battery.getSnapshot();
      const rawMode = p.energyManagement.mode;
      this.p2ModeSelect.value = rawMode === 'HYBRID' || rawMode === 'SPORT' ? 'HEV' : rawMode;
      this.p2TerrainSelect.value = p.terrainMode;
      this.p2TransferSelect.value = p.transfer.mode;
      this.p2RearLockCheck.disabled = !p.transfer.rearLock;
      this.p2FrontLockCheck.disabled = !p.transfer.frontLock;
      this.p2RearLockCheck.checked = p.transfer.rearLock?.engaged ?? false;
      this.p2FrontLockCheck.checked = p.transfer.frontLock?.engaged ?? false;
      if (document.activeElement !== this.p2HoldInput) {
        this.p2HoldInput.value = String(Math.round(p.energyManagement.holdSOC * 100));
      }
      const fallback = p.energyManagement.evFallbackActive ? ` · 纯电受限(${p.energyManagement.evFallbackReason})` : '';
      this.energyReadout.innerHTML =
        `<div>车型系统：<strong>P2 混动四驱 (Hi4-T)</strong></div>` +
        `<div>运行状态：实际 ${p.energyManagement.state}${fallback} · 地形 ${p.terrainMode} · 分动 ${p.transfer.mode}</div>` +
        `<div>电池 SOC：${(b.soc * 100).toFixed(1)}% · ${b.temperatureC.toFixed(0)}°C · ${b.state} ${(b.gridPowerW / 1000).toFixed(1)} kW</div>`;
      return;
    }

    if (p instanceof ElectricPowertrain && snap.ev) {
      this.energyNotice.style.display = 'block';
      this.energyNotice.textContent = '当前车型为纯电动（EV）：不适用混动多模能量策略切换，以下直接展示实时电驱与能量回收状态。';
      this.energyContent.style.display = 'flex';
      this.energyEhsControls.style.display = 'none';
      this.energyP2Controls.style.display = 'none';
      const ev = snap.ev;
      this.energyReadout.innerHTML =
        `<div>车型系统：<strong>纯电动平台 (EV)</strong></div>` +
        `<div>电池 SOC：${(ev.stateOfCharge * 100).toFixed(1)}% · 剩余能量 ${ev.remainingEnergyKWh.toFixed(1)} kWh · 续航 ${ev.estimatedRangeKm.toFixed(0)} km</div>` +
        `<div>驱动功率：${ev.drivePowerKw.toFixed(1)} kW · 动能回收：${ev.regenPowerKw.toFixed(1)} kW${ev.regenLimited ? ` (受限: ${ev.regenLimitReason ?? 'MAX'})` : ''}</div>` +
        `<div>累计消耗：${ev.tripEnergyConsumedKWh.toFixed(3)} kWh · 累计回收 ${ev.tripEnergyRecoveredKWh.toFixed(3)} kWh</div>`;
      return;
    }

    this.energyNotice.style.display = 'block';
    this.energyNotice.textContent = '当前车型为纯燃油驱动（ICE）：不适用混动 / 电驱能量管理功能。';
    this.energyContent.style.display = 'none';
  }

  private makeNotice(text: string): HTMLDivElement {
    const d = document.createElement('div');
    d.style.cssText = 'padding:10px;border-radius:6px;background:#1e293b;border:1px solid #475569;color:#cbd5e1;font-size:11px;line-height:1.5;';
    d.textContent = text;
    return d;
  }

  private makeRow(label: string, control: HTMLElement): HTMLLabelElement {
    const l = document.createElement('label');
    l.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;color:#cbd5e1;';
    const s = document.createElement('span');
    s.textContent = label;
    l.append(s, control);
    return l;
  }

  private makeChargerButtons(getPowertrain: () => Powertrain | undefined): HTMLDivElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;margin-top:2px;';
    for (const type of ['AC', 'DC', '断开'] as const) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = type === '断开' ? '断开充电' : `${type}充电`;
      b.style.cssText = 'flex:1;padding:4px 6px;border-radius:4px;border:1px solid #475569;background:#1e293b;color:#e2e8f0;font-size:11px;cursor:pointer;';
      b.onclick = () => {
        const p = getPowertrain();
        if (p instanceof EhsHybridSystem || p instanceof P2HybridPowertrain) {
          if (type === '断开') {
            p.battery.disconnect();
            this.energyMsg.textContent = '充电已断开';
          } else {
            this.energyMsg.textContent = p.connectCharger(type)
              ? `已连接 ${type} 外接电源`
              : '请停车、挂 P 挡并关闭车辆电源后充电';
          }
        }
      };
      row.appendChild(b);
    }
    return row;
  }

  public dispose(): void {
    for (const fn of this.cleanupFns) fn();
    this.cleanupFns.length = 0;
    this.scenarioPanelView.dispose();
    this.accelView?.dispose();
    this.accelView = null;
    this.root.remove();
  }
}
