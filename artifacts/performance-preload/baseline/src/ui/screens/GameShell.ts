import type { Platform } from '../../platform/Platform';
import type { GameUIController } from '../controller/GameUIController';
import { HUD_PROFILES, type GameUIState, type MapViewModel, type VehicleViewModel } from '../state/GameUIState';

const button = (action: string, label: string, extra = '') => `<button type="button" data-action="${action}" ${extra}>${label}</button>`;
/** Stable screen DOM. Live vehicle state is supplied only as plain view models. */
export class GameShell {
  readonly root = document.createElement('div');
  private previousScreen = '';
  private readonly abort = new AbortController();
  constructor(private readonly host: HTMLElement, private readonly ui: GameUIController, private readonly platform: Platform,
    private readonly vehicles: readonly VehicleViewModel[], maps: readonly MapViewModel[]) {
    this.root.className = 'ds-shell';
    this.root.innerHTML = `
      <section class="ds-screen ds-main" data-screen="main" aria-label="主菜单">
        <header class="ds-brand"><h1>DRIVER<br>SCHOOL</h1></header>
        <nav class="ds-menu" aria-label="主菜单操作">${button('resume', '继续驾驶 <small>CONTINUE</small>')}${button('start', '开始驾驶 <small>DRIVE</small>')}${button('vehicles', '车辆 <small>VEHICLE</small>')}${button('maps', '地图 <small>LOCATION</small>')}${button('training', '驾驶教学 <small>TRAINING</small>')}${button('settings', '设置 <small>SETTINGS</small>')}</nav>
        <aside class="ds-current"><h2 data-current-name></h2><p data-current-spec></p><small data-current-map></small></aside>
      </section>
      <section class="ds-screen ds-vehicles" data-screen="vehicles" aria-label="车辆选择" hidden>
        <header class="ds-page-header">${button('back', '← 返回')}<span class="ds-eyebrow">VEHICLES</span><span data-vehicle-count></span><label class="ds-vehicle-picker"><span>全部车辆</span><select data-vehicle-picker aria-label="选择车辆"></select></label></header>
        <div class="ds-vehicle-heading"><h1 data-vehicle-name></h1></div>
        ${button('previous', '←', 'class="ds-cycle ds-prev" aria-label="上一辆车"')}${button('next', '→', 'class="ds-cycle ds-next" aria-label="下一辆车"')}
        <div class="ds-vehicle-details"><dl data-vehicle-spec></dl><div class="ds-actions">${button('vehicle-settings', '车辆设置')}${button('confirm-vehicle', '选择车辆 →', 'class="ds-primary"')}</div></div>
      </section>
      <section class="ds-screen ds-maps" data-screen="maps" aria-label="地图选择" hidden>
        <header class="ds-page-header">${button('back', '← 返回')}<span class="ds-eyebrow">LOCATIONS</span></header><h1>地图</h1><div class="ds-map-list" data-map-list></div>
      </section>
      <section class="ds-screen ds-training" data-screen="training" aria-label="驾驶教学" hidden>
        <header class="ds-page-header">${button('back', '← 返回')}<span class="ds-eyebrow">TRAINING</span></header><h1>驾驶教学</h1>
        <p>手动挡：挂入一挡，平稳给油。自动挡：踩住制动，在车辆设置中选择 D。</p>
        <dl class="ds-lesson"><div><dt>Xbox</dt><dd>左摇杆转向 · LT 制动 · RT 油门 · 右摇杆视角</dd></div><div><dt>观察</dt><dd>拖动鼠标转头 · 双击锁定鼠标 · C 回正 · Tab 上车 / 下车</dd></div><div><dt>控制</dt><dd>控制页查看当前按键绑定 · F3 设置 · ESC 暂停</dd></div><div><dt>辅助</dt><dd>Training HUD 显示踏板、转向与 ABS / TCS / ESC 实时介入</dd></div></dl>
        <div class="ds-actions">${button('controls', '查看控制')}${button('training-hud', '启用 Training HUD', 'class="ds-primary"')}</div>
      </section>
      <section class="ds-screen ds-pause" data-screen="pause" aria-label="暂停菜单" hidden>
        <h1>暂停驾驶</h1><nav class="ds-menu" aria-label="暂停操作">${button('resume', '继续驾驶 <small>RESUME</small>')}${button('settings', '驾驶设置')}${button('controls', '控制')}${button('vehicle-settings', '车辆设置')}${button('restart', '重新开始')}${button('main', '返回主菜单')}</nav>
        <fieldset class="ds-profile"><legend>DRIVING HUD</legend>${HUD_PROFILES.map(p => button(`hud-${p.id}`, p.label, `title="${p.description}" aria-pressed="false"`)).join('')}</fieldset>
      </section>
      <section class="ds-screen ds-loading" data-screen="loading" aria-label="加载驾驶场景" hidden><span class="ds-eyebrow">DRIVER SCHOOL / LOADING</span><h1 data-loading-title>正在准备驾驶</h1><p data-loading-message role="status"></p>${button('back', '返回主菜单', 'data-loading-back hidden')}</section>
      <footer class="ds-footer"><span data-shell-status role="status"></span>${button('fullscreen', '全屏 / 窗口', 'title="切换显示模式"')}</footer>`;
    host.append(this.root);
    const vehiclePicker=this.find<HTMLSelectElement>('[data-vehicle-picker]');
    for(const vehicle of vehicles) {const option=document.createElement('option');option.value=vehicle.id;option.textContent=vehicle.name;vehiclePicker.append(option);}
    vehiclePicker.addEventListener('change',()=>this.ui.selectVehicle(vehiclePicker.value),{signal:this.abort.signal});
    for (const map of maps) {
      const item = document.createElement('button'); item.type = 'button'; item.dataset.map = map.id;
      const name = document.createElement('strong');
      name.textContent = map.name; item.append(name);
      item.addEventListener('click', () => ui.selectMap(map.id), { signal: this.abort.signal });
      this.find('[data-map-list]').append(item);
    }
    this.root.addEventListener('click', event => {
      const target = (event.target as Element).closest<HTMLButtonElement>('[data-action]');
      if (target && !target.disabled) this.action(target.dataset.action!);
    }, { signal: this.abort.signal });
    window.addEventListener('keydown', this.onKeyDown, { capture: true, signal: this.abort.signal });
    ui.onChange = state => this.render(state); this.render(ui.state);
  }
  private find<T extends HTMLElement = HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)!; }
  private action(action: string): void {
    if (action.startsWith('hud-')) { this.ui.setHudProfile(HUD_PROFILES.find(p => `hud-${p.id}` === action)!.id); return; }
    switch (action) {
      case 'start': this.ui.startDrive(); break;
      case 'resume': this.ui.resume(); break;
      case 'restart': this.ui.restart(); break;
      case 'settings': case 'vehicle-settings': this.ui.openSettings('vehicle'); break;
      case 'controls': this.ui.openSettings('controls'); break;
      case 'previous': this.cycle(-1); break;
      case 'next': this.cycle(1); break;
      case 'training-hud': this.ui.setHudProfile('training'); break;
      case 'back': case 'confirm-vehicle': this.ui.navigate('main'); break;
      case 'main': case 'vehicles': case 'maps': case 'training': this.ui.navigate(action); break;
      case 'fullscreen': void this.platform.isFullscreen().then(full => this.platform.setFullscreen(!full)).catch(() => {
        this.find('[data-shell-status]').textContent = '当前环境无法切换全屏';
      }); break;
    }
  }
  private cycle(direction: number): void {
    const index = this.vehicles.findIndex(v => v.id === this.ui.state.vehicleId);
    const next = this.vehicles[(index + direction + this.vehicles.length) % this.vehicles.length];
    if (next) this.ui.selectVehicle(next.id);
  }
  private render(state: Readonly<GameUIState>): void {
    // Effects follow the actual simulation budget, including live settings.
    this.host.dataset.uiPhase = state.screen === 'loading' ? 'loading' :
      !this.ui.freezesSimulation ? 'driving' : state.screen === 'pause' || state.screen === 'settings' && state.hasSession ? 'paused' : 'menu';
    this.root.hidden = state.screen === 'driving' || state.screen === 'settings';
    this.root.dataset.activeScreen = state.screen;
    this.root.querySelectorAll<HTMLElement>('[data-screen]').forEach(screen => { screen.hidden = screen.dataset.screen !== state.screen; });
    const vehicle = this.vehicles.find(v => v.id === state.vehicleId)!;
    const picker=this.find<HTMLSelectElement>('[data-vehicle-picker]');picker.value=vehicle.id;picker.disabled=state.busy;
    this.find('[data-current-name]').textContent = this.find('[data-vehicle-name]').textContent = vehicle.name;
    this.find('[data-current-spec]').textContent = `${vehicle.powertrain} · ${vehicle.transmission} · ${vehicle.drive}`;
    this.find('[data-vehicle-count]').textContent = `${String(this.vehicles.indexOf(vehicle) + 1).padStart(2, '0')} / ${this.vehicles.length}`;
    const specs = this.find('[data-vehicle-spec]'); specs.replaceChildren();
    for (const [label, value] of [['动力', vehicle.powertrain], ['变速箱', vehicle.transmission], ['驱动', vehicle.drive], ['游戏标定功率', vehicle.power]]) {
      const item = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = label!; dd.textContent = value!; item.append(dt, dd); specs.append(item);
    }
    this.root.querySelectorAll<HTMLButtonElement>('[data-map]').forEach(item => {
      item.setAttribute('aria-pressed', String(item.dataset.map === state.mapId)); item.disabled = state.busy;
      if (item.dataset.map === state.mapId) this.find('[data-current-map]').textContent = item.querySelector('strong')!.textContent;
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(item => {
      const action = item.dataset.action!;
      item.disabled = (['resume', 'start', 'restart', 'next', 'previous', 'confirm-vehicle'].includes(action) && state.busy) || (action === 'resume' && !state.hasSession);
      if (action.startsWith('hud-')) item.setAttribute('aria-pressed', String(action === `hud-${state.hudProfile}`));
    });
    this.find('[data-shell-status]').textContent = '';
    this.find('[data-loading-title]').textContent = state.loading.phase === 'error' ? '暂时无法进入驾驶' : '正在准备驾驶';
    this.find('[data-loading-message]').textContent = state.loading.message || '正在准备场景';
    this.find('[data-loading-back]').hidden = state.loading.phase !== 'error';
    if (this.previousScreen !== state.screen && !this.root.hidden) {
      this.find<HTMLElement>(`[data-screen="${state.screen}"] button:not(:disabled)`)?.focus({ preventScroll: true });
    }
    this.previousScreen = state.screen;
  }
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const screen = this.ui.state.screen;
    if (screen === 'settings') return;
    if(event.target instanceof HTMLSelectElement&&event.code!=='F3'){event.stopImmediatePropagation();return;}
    if (screen === 'loading' && this.ui.state.loading.phase !== 'error') { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (event.code === 'Escape' && !event.repeat) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (screen === 'driving') this.ui.pause(); else if (screen === 'pause') this.ui.resume(); else this.ui.navigate('main');
      return;
    }
    if (screen === 'driving') return;
    if (screen === 'vehicles' && ['ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault(); event.stopImmediatePropagation(); if (!event.repeat) this.cycle(event.code === 'ArrowLeft' ? -1 : 1); return;
    }
    if (event.code === 'Tab') {
      const controls = [...this.root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter(b => b.offsetParent !== null);
      const index = controls.indexOf(document.activeElement as HTMLButtonElement);
      if (controls.length) { event.preventDefault(); controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]!.focus(); }
      event.stopImmediatePropagation();
    } else if (['ArrowUp', 'ArrowDown'].includes(event.code)) {
      const controls = [...this.root.querySelectorAll<HTMLButtonElement>(`[data-screen="${screen}"] button:not(:disabled)`)];
      const index = controls.indexOf(document.activeElement as HTMLButtonElement);
      if (controls.length) { event.preventDefault(); controls[(index + (event.code === 'ArrowUp' ? -1 : 1) + controls.length) % controls.length]!.focus(); }
    }
    if (event.code !== 'F3') event.stopImmediatePropagation();
  };
  dispose(): void { this.abort.abort(); this.ui.onChange = undefined; this.root.remove(); }
}
