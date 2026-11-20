import type { ScenarioDebugger } from './ScenarioDebugger';
import {
  SCENARIO_CATEGORY_LABELS,
  SCENARIO_DEBUGGER_PRESETS,
} from './ScenarioDebuggerPresets';
import type {
  DebugActorMotionMode,
  DebugActorType,
  DebugBehaviorType,
  DebugDynamicSpeedMode,
  DebugScenarioCategory,
  DebugTravelDirection,
  ScenarioDebuggerActorStatus,
  SpawnActorConfig,
} from './ScenarioDebuggerTypes';

const DIR_LABELS: Record<DebugTravelDirection, string> = {
  forward: '顺向',
  oncoming: '对向',
  'cross-left': '左穿',
  'cross-right': '右穿',
};

const BEHAVIOR_LABELS: Record<DebugBehaviorType, string> = {
  constant: '匀速',
  'sudden-brake': '急刹',
  'sudden-accel': '急加速',
  'cut-in': '切入',
  random: '随机',
};

interface DimensionOption {
  id: string;
  label: string;
  type: DebugActorType;
  kindOverride?: SpawnActorConfig['kindOverride'];
  length: number;
  width: number;
  height: number;
}

const SIZE_PRESETS: readonly DimensionOption[] = [
  { id: 'car', label: '标准轿车 (4.8×1.9×1.5m)', type: 'vehicle', length: 4.8, width: 1.9, height: 1.5 },
  { id: 'truck', label: '大型货车 (8.5×2.5×3.2m)', type: 'vehicle', length: 8.5, width: 2.5, height: 3.2 },
  { id: 'pedestrian', label: '行人 (0.5×0.5×1.75m)', type: 'pedestrian', kindOverride: 'pedestrian', length: 0.5, width: 0.5, height: 1.75 },
  { id: 'cyclist', label: '非机动车 (1.85×0.68×1.48m)', type: 'pedestrian', kindOverride: 'cyclist', length: 1.85, width: 0.68, height: 1.48 },
  { id: 'cone', label: '施工锥桶 (0.55×0.55×0.85m)', type: 'obstacle', kindOverride: 'static-obstacle', length: 0.55, width: 0.55, height: 0.85 },
  { id: 'barrier', label: '封堵路障 (2.4×2.5×1.1m)', type: 'obstacle', kindOverride: 'road-block', length: 2.4, width: 2.5, height: 1.1 },
  { id: 'debris', label: '掉落物 (0.85×0.95×0.45m)', type: 'obstacle', kindOverride: 'static-obstacle', length: 0.85, width: 0.95, height: 0.45 },
];

/**
 * Shared reusable ScenarioDebugger UI workspace used inside both F10 standalone HUD
 * and Driving Lab HUD without duplicating generation, preset, or editing logic.
 */
export class ScenarioDebuggerPanelView {
  public readonly element: HTMLDivElement;
  private readonly statusSpan: HTMLSpanElement;
  private readonly msgBanner: HTMLDivElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly resetBtn: HTMLButtonElement;
  private readonly tableBody: HTMLTableSectionElement;
  private readonly presetsGrid: HTMLDivElement;
  private readonly catButtons = new Map<DebugScenarioCategory, HTMLButtonElement>();
  private readonly replaceOnPresetCheck: HTMLInputElement;

  private readonly typeEl: HTMLSelectElement;
  private readonly sizePresetEl: HTMLSelectElement;
  private readonly motionEl: HTMLSelectElement;
  private readonly fwdEl: HTMLInputElement;
  private readonly laneEl: HTMLSelectElement;
  private readonly latOffsetEl: HTMLInputElement;
  private readonly dirEl: HTMLSelectElement;
  private readonly dynamicSpeedEl: HTMLSelectElement;
  private readonly speedEl: HTMLInputElement;
  private readonly targetSpeedEl: HTMLInputElement;
  private readonly behaviorEl: HTMLSelectElement;
  private readonly delayEl: HTMLInputElement;
  private readonly seedEl: HTMLInputElement;
  private readonly lenEl: HTMLInputElement;
  private readonly widEl: HTMLInputElement;
  private readonly submitBtn: HTMLButtonElement;
  private readonly cancelEditBtn: HTMLButtonElement;

  private activeCategory: DebugScenarioCategory = 'lead';
  private editingActorId: string | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private msgTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor(
    private readonly debuggerInstance: ScenarioDebugger,
    private readonly onStatusChanged?: () => void,
  ) {
    const root = document.createElement('div');
    root.style.cssText = 'display:flex;flex-direction:column;gap:10px;color:#f1f5f9;font:12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Microsoft YaHei",sans-serif;';

    // Action Bar
    const actionBar = document.createElement('div');
    actionBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;background:#1e293b;padding:6px 8px;border-radius:6px;border:1px solid #334155;';

    this.statusSpan = document.createElement('span');
    this.statusSpan.style.cssText = 'font-size:11px;color:#38bdf8;font-weight:600;';
    this.statusSpan.textContent = '活动: 0/24';

    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap;';

    this.pauseBtn = this.makeMiniBtn('⏸ 暂停', '#334155', '#e2e8f0');
    this.pauseBtn.onclick = () => {
      this.debuggerInstance.setPaused(!this.debuggerInstance.isPaused);
      this.syncPauseButton();
      this.showMessage(this.debuggerInstance.isPaused ? '场景运动学已暂停（保持感知与碰撞包络）' : '场景已恢复运行', '#38bdf8');
      this.refresh();
    };

    this.resetBtn = this.makeMiniBtn('↻ 重置场景', '#1d4ed8', '#fff');
    this.resetBtn.onclick = () => {
      const res = this.debuggerInstance.resetCurrentScenario();
      if (res.success) {
        this.showMessage(`↻ 已重置当前场景 (${res.count} 个目标)`, '#10b981');
      } else {
        this.showMessage(res.error || '无可重置场景', '#ef4444');
      }
      this.editingActorId = null;
      this.syncEditButtons();
      this.refresh();
    };

    const clearAllBtn = this.makeMiniBtn('🗑️ 清空全部', '#dc2626', '#fff');
    clearAllBtn.onclick = () => {
      this.debuggerInstance.clearAll();
      this.editingActorId = null;
      this.syncEditButtons();
      this.showMessage('已清空全部调试目标', '#10b981');
      this.refresh();
    };

    btnGroup.append(this.pauseBtn, this.resetBtn, clearAllBtn);
    actionBar.append(this.statusSpan, btnGroup);
    root.appendChild(actionBar);

    // Banner
    this.msgBanner = document.createElement('div');
    this.msgBanner.style.cssText = 'display:none;padding:5px 10px;border-radius:5px;font-size:11px;border:1px solid #334155;';
    root.appendChild(this.msgBanner);

    // Presets Section with Category Tabs
    const presetsWrap = document.createElement('div');
    presetsWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

    const presetHeader = document.createElement('div');
    presetHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';
    const presetTitle = document.createElement('div');
    presetTitle.style.cssText = 'font-weight:600;color:#38bdf8;font-size:12px;';
    presetTitle.textContent = '🎯 分类场景预设';

    const replaceLabel = document.createElement('label');
    replaceLabel.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:11px;color:#cbd5e1;cursor:pointer;';
    this.replaceOnPresetCheck = document.createElement('input');
    this.replaceOnPresetCheck.type = 'checkbox';
    this.replaceOnPresetCheck.checked = false;
    replaceLabel.append(this.replaceOnPresetCheck, '切换预设前清空旧目标');
    presetHeader.append(presetTitle, replaceLabel);
    presetsWrap.appendChild(presetHeader);

    const catRow = document.createElement('div');
    catRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;';
    for (const cat of SCENARIO_CATEGORY_LABELS) {
      const tabBtn = document.createElement('button');
      tabBtn.type = 'button';
      tabBtn.textContent = cat.label;
      tabBtn.style.cssText = 'padding:3px 7px;font-size:11px;border-radius:4px;cursor:pointer;border:1px solid #475569;background:#0f172a;color:#cbd5e1;';
      tabBtn.onclick = () => {
        this.activeCategory = cat.id;
        this.renderPresets();
      };
      this.catButtons.set(cat.id, tabBtn);
      catRow.appendChild(tabBtn);
    }
    presetsWrap.appendChild(catRow);

    this.presetsGrid = document.createElement('div');
    this.presetsGrid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(122px,1fr));gap:5px;';
    presetsWrap.appendChild(this.presetsGrid);
    this.renderPresets();
    root.appendChild(presetsWrap);

    // Custom Parameter Form
    const formTitle = document.createElement('div');
    formTitle.style.cssText = 'font-weight:600;color:#38bdf8;font-size:12px;';
    formTitle.textContent = '⚙️ 自定义场景生成与参数编辑';
    root.appendChild(formTitle);

    const form = document.createElement('div');
    form.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;background:#1e293b;padding:8px;border-radius:6px;border:1px solid #334155;';

    const inputCss = 'width:100%;box-sizing:border-box;background:#0f172a;color:#f1f5f9;border:1px solid #475569;border-radius:4px;padding:3px 5px;font-size:11px;';
    const makeField = (label: string, el: HTMLElement) => {
      const box = document.createElement('div');
      const l = document.createElement('label');
      l.style.cssText = 'display:block;color:#94a3b8;font-size:10px;margin-bottom:2px;';
      l.textContent = label;
      box.append(l, el);
      return box;
    };

    this.typeEl = document.createElement('select');
    this.typeEl.style.cssText = inputCss;
    this.typeEl.innerHTML = '<option value="vehicle">车辆 (Vehicle)</option><option value="pedestrian">行人/非机动车</option><option value="obstacle">道路障碍 (Obstacle)</option>';

    this.sizePresetEl = document.createElement('select');
    this.sizePresetEl.style.cssText = inputCss;
    this.sizePresetEl.innerHTML = SIZE_PRESETS.map((s) => `<option value="${s.id}">${s.label}</option>`).join('') + '<option value="custom">自定义尺寸</option>';

    this.motionEl = document.createElement('select');
    this.motionEl.style.cssText = inputCss;
    this.motionEl.innerHTML = '<option value="dynamic">动态 (Dynamic)</option><option value="static">静止 (Static)</option>';

    this.dirEl = document.createElement('select');
    this.dirEl.style.cssText = inputCss;
    this.dirEl.innerHTML = '<option value="forward">顺向 (同向)</option><option value="oncoming">对向 (迎面)</option><option value="cross-left">横向穿行 (向左)</option><option value="cross-right">横向穿行 (向右)</option>';

    this.fwdEl = document.createElement('input');
    this.fwdEl.type = 'number'; this.fwdEl.value = '45'; this.fwdEl.step = '2'; this.fwdEl.style.cssText = inputCss;

    this.laneEl = document.createElement('select');
    this.laneEl.style.cssText = inputCss;
    this.laneEl.innerHTML = '<option value="-1">左车道 (-1)</option><option value="0" selected>本车道 (0)</option><option value="1">右车道 (+1)</option><option value="-2">左二车道 (-2)</option><option value="2">右二车道 (+2)</option>';

    this.latOffsetEl = document.createElement('input');
    this.latOffsetEl.type = 'number'; this.latOffsetEl.value = '0'; this.latOffsetEl.step = '0.15'; this.latOffsetEl.style.cssText = inputCss;

    this.speedEl = document.createElement('input');
    this.speedEl.type = 'number'; this.speedEl.value = '45'; this.speedEl.min = '0'; this.speedEl.step = '5'; this.speedEl.style.cssText = inputCss;

    this.targetSpeedEl = document.createElement('input');
    this.targetSpeedEl.type = 'number'; this.targetSpeedEl.value = '45'; this.targetSpeedEl.min = '0'; this.targetSpeedEl.step = '5'; this.targetSpeedEl.style.cssText = inputCss;

    this.behaviorEl = document.createElement('select');
    this.behaviorEl.style.cssText = inputCss;
    this.behaviorEl.innerHTML = '<option value="constant">匀速保持</option><option value="sudden-brake">紧急刹车</option><option value="sudden-accel">急加速</option><option value="cut-in">变道切入</option><option value="random">随机行为</option>';

    this.delayEl = document.createElement('input');
    this.delayEl.type = 'number'; this.delayEl.value = '1.0'; this.delayEl.min = '0'; this.delayEl.step = '0.2'; this.delayEl.style.cssText = inputCss;

    this.seedEl = document.createElement('input');
    this.seedEl.type = 'number'; this.seedEl.value = '42'; this.seedEl.style.cssText = inputCss;

    this.lenEl = document.createElement('input');
    this.lenEl.type = 'number'; this.lenEl.value = '4.8'; this.lenEl.min = '0.3'; this.lenEl.step = '0.1'; this.lenEl.style.cssText = inputCss;

    this.widEl = document.createElement('input');
    this.widEl.type = 'number'; this.widEl.value = '1.9'; this.widEl.min = '0.3'; this.widEl.step = '0.1'; this.widEl.style.cssText = inputCss;

    this.dynamicSpeedEl = document.createElement('select');
    this.dynamicSpeedEl.style.cssText = inputCss;
    this.dynamicSpeedEl.innerHTML = [
      '<option value="traffic-cruise">动态: 道路正常车流 (限速/自车)</option>',
      '<option value="lead-slow">动态: 慢于自车与限速</option>',
      '<option value="traffic-fast">动态: 较快车流 (+14 km/h)</option>',
      '<option value="rear-fast-approach">动态: 后方高速逼近</option>',
      '<option value="lead-sudden-brake">动态: 巡航转急刹停</option>',
      '<option value="lead-sudden-accel">动态: 低速转道路巡航</option>',
      '<option value="fixed">手动固定数值 (km/h)</option>',
    ].join('');

    this.sizePresetEl.onchange = () => {
      const opt = SIZE_PRESETS.find((s) => s.id === this.sizePresetEl.value);
      if (opt) {
        this.typeEl.value = opt.type;
        this.lenEl.value = String(opt.length);
        this.widEl.value = String(opt.width);
      }
    };
    this.typeEl.onchange = () => {
      const match = SIZE_PRESETS.find((s) => s.type === this.typeEl.value);
      if (match) {
        this.sizePresetEl.value = match.id;
        this.lenEl.value = String(match.length);
        this.widEl.value = String(match.width);
      }
      if (this.typeEl.value === 'obstacle') {
        this.motionEl.value = 'static';
        this.dynamicSpeedEl.value = 'fixed';
        this.speedEl.value = '0';
        this.targetSpeedEl.value = '0';
      } else if (this.typeEl.value === 'pedestrian') {
        this.dynamicSpeedEl.value = 'fixed';
        this.speedEl.value = '6';
        this.targetSpeedEl.value = '6';
      } else {
        this.dynamicSpeedEl.value = 'traffic-cruise';
      }
    };
    this.speedEl.oninput = this.targetSpeedEl.oninput = () => {
      this.dynamicSpeedEl.value = 'fixed';
    };
    this.lenEl.oninput = this.widEl.oninput = () => { this.sizePresetEl.value = 'custom'; };

    form.append(
      makeField('目标类型', this.typeEl),
      makeField('目标尺寸规格', this.sizePresetEl),
      makeField('静/动态模式', this.motionEl),
      makeField('行驶方向', this.dirEl),
      makeField('相对纵向距离 (m)', this.fwdEl),
      makeField('车道选择', this.laneEl),
      makeField('精确横向偏移 (m)', this.latOffsetEl),
      makeField('目标长度 / 宽度 (m)', (() => {
        const pair = document.createElement('div');
        pair.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:4px;';
        pair.append(this.lenEl, this.widEl);
        return pair;
      })()),
      makeField('车速策略 (随路况/自车)', this.dynamicSpeedEl),
      makeField('行为类型', this.behaviorEl),
      makeField('初速度 (手动 km/h)', this.speedEl),
      makeField('目标速度 (手动 km/h)', this.targetSpeedEl),
      makeField('触发延迟 (s)', this.delayEl),
      makeField('随机种子 (Seed)', this.seedEl),
    );

    const submitRow = document.createElement('div');
    submitRow.style.cssText = 'grid-column:span 2;display:flex;gap:6px;margin-top:2px;';
    this.submitBtn = document.createElement('button');
    this.submitBtn.type = 'button';
    this.submitBtn.textContent = '➕ 生成自定义目标';
    this.submitBtn.style.cssText = 'flex:1;background:#0284c7;color:#fff;font-weight:600;border:none;border-radius:4px;padding:6px;cursor:pointer;font-size:11px;';
    this.submitBtn.onclick = () => this.submitForm();

    this.cancelEditBtn = document.createElement('button');
    this.cancelEditBtn.type = 'button';
    this.cancelEditBtn.textContent = '取消修改';
    this.cancelEditBtn.style.cssText = 'display:none;background:#475569;color:#fff;border:none;border-radius:4px;padding:6px 10px;cursor:pointer;font-size:11px;';
    this.cancelEditBtn.onclick = () => {
      this.editingActorId = null;
      this.syncEditButtons();
    };
    submitRow.append(this.submitBtn, this.cancelEditBtn);
    form.appendChild(submitRow);
    root.appendChild(form);

    // Active Actors List
    const listTitle = document.createElement('div');
    listTitle.style.cssText = 'font-weight:600;color:#38bdf8;font-size:12px;';
    listTitle.textContent = '📋 场景目标实时状态';
    root.appendChild(listTitle);

    const tableWrap = document.createElement('div');
    tableWrap.style.cssText = 'max-height:170px;overflow-y:auto;border:1px solid #334155;border-radius:5px;background:#0f172a;';
    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:11px;text-align:left;';
    table.innerHTML = `
      <thead>
        <tr style="background:#1e293b;color:#94a3b8;border-bottom:1px solid #334155;">
          <th style="padding:4px 6px;">目标</th>
          <th style="padding:4px 6px;">距离</th>
          <th style="padding:4px 6px;">速度/方向</th>
          <th style="padding:4px 6px;">行为</th>
          <th style="padding:4px 6px;text-align:right;">操作</th>
        </tr>
      </thead>
    `;
    this.tableBody = document.createElement('tbody');
    table.appendChild(this.tableBody);
    tableWrap.appendChild(table);
    root.appendChild(tableWrap);

    // Prevent driving keystrokes / clicks inside editor from leaking into canvas steering/controls
    for (const evt of ['keydown', 'keyup', 'pointerdown']) {
      root.addEventListener(evt, (e) => e.stopPropagation());
    }

    this.element = root;
    this.syncPauseButton();
  }

  public setRefreshActive(active: boolean): void {
    if (active) {
      this.refresh();
      if (!this.refreshTimer) {
        this.refreshTimer = setInterval(() => this.refresh(), 350);
      }
    } else if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  public refresh(): void {
    const status = this.debuggerInstance.getStatus();
    const speedCtx = this.debuggerInstance.getDynamicSpeedContext();
    this.statusSpan.textContent = `活动: ${status.activeActorCount}/${this.debuggerInstance.maxSimultaneousActors} · 路况限速 ${speedCtx.roadLimitKmh.toFixed(0)} / 自车 ${speedCtx.egoKmh.toFixed(0)} km/h${status.lastScenarioName ? ` · ${status.lastScenarioName}` : ''}`;
    this.syncPauseButton();

    this.tableBody.innerHTML = '';
    if (status.actors.length === 0) {
      const empty = document.createElement('tr');
      empty.innerHTML = '<td colspan="5" style="padding:12px;text-align:center;color:#64748b;">暂无活动场景目标（可上方一键生成预设或自定义）</td>';
      this.tableBody.appendChild(empty);
      return;
    }

    for (const a of status.actors) {
      const tr = document.createElement('tr');
      tr.style.cssText = 'border-bottom:1px solid #1e293b;';
      const icon = a.kind === 'cyclist' ? '🚲' : a.type === 'vehicle' ? '🚗' : a.type === 'pedestrian' ? '🚶' : '🚧';
      const title = `${icon} ${a.label || a.id}`;
      const speedText = a.motionMode === 'static'
        ? '静止'
        : `${a.speedKmh.toFixed(0)}→${a.targetSpeedKmh.toFixed(0)} km/h · ${DIR_LABELS[a.direction]}`;
      const behText = a.motionMode === 'static'
        ? `${a.length.toFixed(1)}×${a.width.toFixed(1)}m`
        : `${BEHAVIOR_LABELS[a.behavior]}${a.behaviorTriggered ? '✓' : `(${a.behaviorDelayS.toFixed(1)}s)`}`;

      tr.innerHTML = `
        <td style="padding:4px 6px;color:#e2e8f0;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${a.id} (${a.length.toFixed(1)}×${a.width.toFixed(1)}m)">${title}</td>
        <td style="padding:4px 6px;color:#38bdf8;">${a.distanceToEgoM.toFixed(1)}m</td>
        <td style="padding:4px 6px;">${speedText}</td>
        <td style="padding:4px 6px;color:#94a3b8;font-size:10px;">${behText}</td>
        <td style="padding:4px 6px;text-align:right;white-space:nowrap;"></td>
      `;

      const editBtn = this.makeMiniBtn('✎', '#1e293b', '#38bdf8');
      editBtn.title = '载入并修改参数';
      editBtn.style.marginRight = '4px';
      editBtn.onclick = () => this.loadActorForEdit(a);

      const delBtn = this.makeMiniBtn('✕', 'transparent', '#f87171');
      delBtn.title = '删除该目标';
      delBtn.style.border = '1px solid #ef4444';
      delBtn.onclick = () => {
        if (this.editingActorId === a.id) {
          this.editingActorId = null;
          this.syncEditButtons();
        }
        this.debuggerInstance.deleteActor(a.id);
        this.refresh();
      };

      tr.querySelector('td:last-child')?.append(editBtn, delBtn);
      this.tableBody.appendChild(tr);
    }
    this.onStatusChanged?.();
  }

  public dispose(): void {
    this.setRefreshActive(false);
    if (this.msgTimer) {
      clearTimeout(this.msgTimer);
      this.msgTimer = null;
    }
    this.element.remove();
  }

  private renderPresets(): void {
    for (const [catId, btn] of this.catButtons) {
      const active = catId === this.activeCategory;
      btn.style.background = active ? '#0284c7' : '#0f172a';
      btn.style.color = active ? '#ffffff' : '#cbd5e1';
      btn.style.borderColor = active ? '#38bdf8' : '#475569';
    }
    this.presetsGrid.innerHTML = '';
    const filtered = SCENARIO_DEBUGGER_PRESETS.filter((p) => p.category === this.activeCategory);
    for (const p of filtered) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = p.name;
      btn.title = p.desc;
      btn.style.cssText = 'background:#1e293b;color:#e2e8f0;border:1px solid #475569;border-radius:5px;padding:6px 8px;font-size:11px;cursor:pointer;text-align:left;';
      btn.onclick = () => {
        const res = this.debuggerInstance.spawnPresetById(p.id, this.replaceOnPresetCheck.checked);
        if (res.successCount > 0) {
          this.showMessage(`✅ 已生成 [${p.name}] (${res.successCount} 个目标)`, '#10b981');
        } else {
          this.showMessage(`❌ 生成失败: ${res.errors[0] || '位置重叠或达到上限'}`, '#ef4444');
        }
        this.refresh();
      };
      this.presetsGrid.appendChild(btn);
    }
  }

  private buildConfigFromForm(): SpawnActorConfig {
    const type = (this.typeEl.value || 'vehicle') as DebugActorType;
    const motionMode = (this.motionEl.value || 'dynamic') as DebugActorMotionMode;
    const direction = (this.dirEl.value || 'forward') as DebugTravelDirection;
    const sizeOpt = SIZE_PRESETS.find((s) => s.id === this.sizePresetEl.value);
    const fwd = parseFloat(this.fwdEl.value);
    const laneOffset = parseFloat(this.laneEl.value);
    const latOffset = parseFloat(this.latOffsetEl.value);
    const speedKmh = parseFloat(this.speedEl.value);
    const targetSpeedKmh = parseFloat(this.targetSpeedEl.value);
    const behavior = (this.behaviorEl.value || 'constant') as DebugBehaviorType;
    const delayS = parseFloat(this.delayEl.value);
    const seed = parseInt(this.seedEl.value, 10);
    const length = Math.max(0.3, parseFloat(this.lenEl.value) || 4.8);
    const width = Math.max(0.3, parseFloat(this.widEl.value) || 1.9);
    const height = sizeOpt ? sizeOpt.height : type === 'pedestrian' ? 1.75 : type === 'obstacle' ? 1.0 : 1.5;

    const dynamicMode = (this.dynamicSpeedEl.value || 'fixed') as DebugDynamicSpeedMode;
    const useDynamicPolicy =
      dynamicMode !== 'fixed' &&
      motionMode === 'dynamic' &&
      type === 'vehicle' &&
      !this.editingActorId;

    return {
      type,
      kindOverride: sizeOpt?.kindOverride,
      motionMode,
      positionMode: 'road-relative',
      forwardDistanceM: Number.isFinite(fwd) ? fwd : 45,
      laneOffset: Number.isFinite(laneOffset) ? laneOffset : 0,
      lateralOffsetM: Number.isFinite(latOffset) ? latOffset : 0,
      direction,
      speedKmh: motionMode === 'static' ? 0 : Number.isFinite(speedKmh) ? Math.max(0, speedKmh) : 45,
      targetSpeedKmh: motionMode === 'static' ? 0 : Number.isFinite(targetSpeedKmh) ? Math.max(0, targetSpeedKmh) : 45,
      speedPolicy: useDynamicPolicy ? { mode: dynamicMode } : undefined,
      behavior,
      behaviorDelayS: Number.isFinite(delayS) ? Math.max(0, delayS) : 0,
      targetLaneChange: behavior === 'cut-in' ? ((Number.isFinite(laneOffset) ? laneOffset : 0) > 0 ? 'left' : 'right') : 'none',
      randomSeed: Number.isFinite(seed) ? seed : 42,
      dimensions: { length, width, height },
    };
  }

  private submitForm(): void {
    const cfg = this.buildConfigFromForm();
    if (this.editingActorId) {
      const res = this.debuggerInstance.updateActor(this.editingActorId, cfg);
      if (res.success) {
        this.showMessage(`✅ 已更新目标 [${this.editingActorId}] 参数`, '#10b981');
        this.editingActorId = null;
        this.syncEditButtons();
      } else {
        this.showMessage(`❌ 修改失败: ${res.error || '未知错误'}`, '#ef4444');
      }
      this.refresh();
      return;
    }
    const res = this.debuggerInstance.spawn(cfg);
    if (res.success) {
      this.showMessage(`✅ 已生成自定义目标 [${res.actor?.id}]`, '#10b981');
      this.refresh();
    } else {
      this.showMessage(`❌ 生成失败: ${res.error || '位置冲突'}`, '#ef4444');
    }
  }

  private loadActorForEdit(a: ScenarioDebuggerActorStatus): void {
    this.editingActorId = a.id;
    this.dynamicSpeedEl.value = 'fixed';
    this.typeEl.value = a.type;
    this.sizePresetEl.value = 'custom';
    this.motionEl.value = a.motionMode;
    this.dirEl.value = a.direction;
    this.laneEl.value = String(a.laneOffset);
    this.latOffsetEl.value = a.lateralOffsetM.toFixed(2);
    this.speedEl.value = a.speedKmh.toFixed(0);
    this.targetSpeedEl.value = a.targetSpeedKmh.toFixed(0);
    this.behaviorEl.value = a.behavior;
    this.delayEl.value = a.behaviorDelayS.toFixed(1);
    this.seedEl.value = String(a.randomSeed);
    this.lenEl.value = a.length.toFixed(2);
    this.widEl.value = a.width.toFixed(2);
    this.syncEditButtons();
    this.showMessage(`正在编辑 [${a.id}]，修改上方参数后点击保存`, '#38bdf8');
  }

  private syncEditButtons(): void {
    if (this.editingActorId) {
      this.submitBtn.textContent = `✔ 保存修改 (${this.editingActorId})`;
      this.submitBtn.style.background = '#059669';
      this.cancelEditBtn.style.display = 'inline-block';
    } else {
      this.submitBtn.textContent = '➕ 生成自定义目标';
      this.submitBtn.style.background = '#0284c7';
      this.cancelEditBtn.style.display = 'none';
    }
  }

  private syncPauseButton(): void {
    if (this.debuggerInstance.isPaused) {
      this.pauseBtn.textContent = '▶ 恢复';
      this.pauseBtn.style.background = '#059669';
      this.pauseBtn.style.color = '#fff';
    } else {
      this.pauseBtn.textContent = '⏸ 暂停';
      this.pauseBtn.style.background = '#334155';
      this.pauseBtn.style.color = '#e2e8f0';
    }
  }

  private showMessage(text: string, color: string): void {
    this.msgBanner.style.display = 'block';
    this.msgBanner.style.background = color === '#ef4444' ? 'rgba(239,68,68,0.2)' : color === '#38bdf8' ? 'rgba(56,189,248,0.16)' : 'rgba(16,185,129,0.2)';
    this.msgBanner.style.color = color;
    this.msgBanner.textContent = text;
    if (this.msgTimer) clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => {
      this.msgBanner.style.display = 'none';
    }, 3500);
  }

  private makeMiniBtn(label: string, bg: string, color: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = `background:${bg};color:${color};border:1px solid #475569;border-radius:4px;padding:3px 7px;font-size:11px;cursor:pointer;`;
    return b;
  }
}
