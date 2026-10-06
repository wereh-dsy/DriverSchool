import {
  DEFAULT_KEYBOARD_BINDINGS,
  formatKeyboardCode,
  KEYBOARD_BINDING_DEFINITIONS,
  RESERVED_GAME_KEYS,
  type KeyboardBindings,
  type KeyboardDrivingAction,
  type DriveSelector,
} from '../input';
import type { AdjustableMirrorSide, MirrorAdjustment } from '../camera';
import type { VehicleLightMode } from '../vehicle/visual';

export interface DrivingMapOption {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

export interface DrivingVehicleOption {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}

export class ControlSettingsPanel {
  public onVisibilityChange?: (visible: boolean) => void;
  public onLightModeChange?: (mode: VehicleLightMode) => void;
  public onFogToggle?: () => void;
  public onVibrationChange?: (enabled: boolean) => void;
  public onDriveSelectorChange?: (selector: DriveSelector) => void;
  public onMirrorSideChange?: (side: AdjustableMirrorSide) => void;
  public onMirrorNudge?: (
    side: AdjustableMirrorSide,
    yawDegrees: number,
    pitchDegrees: number,
  ) => void;
  public onMirrorReset?: (side: AdjustableMirrorSide) => void;
  public onBindingChange?: (action: KeyboardDrivingAction, code: string) => void;
  public onBindingReset?: () => void;
  public onMapChange?: (mapId: string) => void;
  public onVehicleChange?: (vehicleId: string) => void;
  public onNotice?: (message: string) => void;

  private readonly toggleButton: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private readonly mirrorValue: HTMLElement;
  private readonly mapButtonsContainer: HTMLElement;
  private readonly vehicleButtonsContainer: HTMLElement;
  private readonly bindingButtons = new Map<KeyboardDrivingAction, HTMLButtonElement>();
  private readonly mapButtons = new Map<string, HTMLButtonElement>();
  private readonly vehicleButtons = new Map<string, HTMLButtonElement>();
  private bindings: KeyboardBindings = { ...DEFAULT_KEYBOARD_BINDINGS };
  private selectedMirror: AdjustableMirrorSide = 'left';
  private awaitingAction: KeyboardDrivingAction | null = null;
  private visible = false;
  private vibrationOn = this.readVibrationPreference();

  public constructor(host: HTMLElement) {
    const shell = document.createElement('div');
    shell.className = 'vehicle-settings-shell';
    shell.innerHTML = `
      <button class="vehicle-settings-toggle" type="button" data-settings-toggle
        aria-label="车辆设置" aria-expanded="false"><span>设置</span><kbd>F3</kbd></button>
      <section class="vehicle-settings-panel" data-settings-panel hidden aria-label="车辆与控制设置">
        <header>
          <div><small>DRIVER SETUP</small><strong>车辆与控制</strong></div>
          <button type="button" class="settings-close" data-settings-close aria-label="关闭设置">×</button>
        </header>
        <div class="settings-scroll">
          <section class="settings-group">
            <div class="settings-group-title"><span>训练场地</span><small>切换后车辆回到该场地起点</small></div>
            <div class="map-selection-list" data-map-buttons></div>
          </section>
          <section class="settings-group">
            <div class="settings-group-title"><span>训练车辆</span><small>切换后以新车回到当前场地起点</small></div>
            <div class="map-selection-list" data-vehicle-buttons></div>
          </section>
          <section class="settings-group">
            <div class="settings-group-title"><span>灯光</span><small><kbd data-key-action="cycleLights">L</kbd> 循环切换</small></div>
            <div class="settings-segments" data-light-buttons>
              <button type="button" data-light="off">关闭</button>
              <button type="button" data-light="position">示宽</button>
              <button type="button" data-light="low">近光</button>
              <button type="button" data-light="high">远光</button>
            </div>
            <button type="button" data-fog-toggle aria-pressed="false">前后雾灯 · <kbd data-key-action="fogToggle">F</kbd></button>
          </section>
          <section class="settings-group" data-selector-group hidden>
            <div class="settings-group-title"><span>自动挡选择器</span><small>选挡需踩住 S / LT；进入 R / P 前先停车</small></div>
            <div class="settings-segments" data-selector-buttons>
              <button type="button" data-selector="P">P · 驻车</button>
              <button type="button" data-selector="R">R · 倒车</button>
              <button type="button" data-selector="N">N · 空挡</button>
              <button type="button" data-selector="D">D · 前进</button>
            </div>
          </section>
          <section class="settings-group">
            <div class="settings-group-title"><span>后视镜</span><small data-mirror-value>水平 0.0° · 垂直 0.0°</small></div>
            <div class="settings-segments mirror-selector">
              <button type="button" data-mirror-side="left">左镜</button>
              <button type="button" data-mirror-side="right">右镜</button>
            </div>
            <div class="mirror-adjust-pad" aria-label="后视镜调节">
              <button type="button" data-mirror-yaw="0" data-mirror-pitch="1" aria-label="镜面向上">↑</button>
              <button type="button" data-mirror-yaw="-1" data-mirror-pitch="0" aria-label="镜面向左">←</button>
              <button type="button" class="mirror-reset" data-mirror-reset>复位</button>
              <button type="button" data-mirror-yaw="1" data-mirror-pitch="0" aria-label="镜面向右">→</button>
              <button type="button" data-mirror-yaw="0" data-mirror-pitch="-1" aria-label="镜面向下">↓</button>
            </div>
            <p class="settings-note">调节左镜时，右上预览会临时切换到左镜；关闭面板后恢复右镜。</p>
          </section>
          <section class="settings-group">
            <div class="settings-group-title"><span>标准手柄</span><small>统一车辆输入</small></div>
            <p class="settings-note">左摇杆：方向 · RT/LT：油门/制动<br>RB/LB：MT 升/降挡；AT/DCT 踩住 LT 后按 P→R→N→D 前后选挡<br>十字键 ←/→：转向灯 · ↑：关→示宽→近光→远光 · ↓：双闪<br>A：驻车制动 · X：GT 定速巡航 · Y：前后雾灯 · B：预留<br>L3 按住：闪远光 · R3：喇叭 · Start：点火/熄火<br>右摇杆：观察；键盘 M 进入手动离合后，右摇杆上下控制离合变化速度。</p>
            <label><input type="checkbox" data-vibration aria-label="Controller Vibration"> Controller Vibration · 手柄震动</label>
          </section>
          <section class="settings-group keyboard-settings">
            <div class="settings-group-title"><span>键盘键位</span><button type="button" data-bindings-reset>恢复默认</button></div>
            <div class="binding-grid" data-binding-grid></div>
            <p class="settings-note">点击一个键位，再按新的按键；若已有占用，将自动交换。</p>
          </section>
        </div>
      </section>`;
    host.append(shell);

    this.toggleButton = this.require(shell, '[data-settings-toggle]');
    this.panel = this.require(shell, '[data-settings-panel]');
    this.mirrorValue = this.require(shell, '[data-mirror-value]');
    this.mapButtonsContainer = this.require(shell, '[data-map-buttons]');
    this.vehicleButtonsContainer = this.require(shell, '[data-vehicle-buttons]');
    this.buildBindingRows(this.require(shell, '[data-binding-grid]'));
    this.setBindings(this.bindings);
    this.setLightMode('off');
    this.setMirrorSide('left');
    this.require<HTMLInputElement>(shell, '[data-vibration]').checked = this.vibrationOn;

    this.toggleButton.addEventListener('click', () => this.setVisible(!this.visible));
    this.require<HTMLButtonElement>(shell, '[data-settings-close]')
      .addEventListener('click', () => this.setVisible(false));
    shell.querySelectorAll<HTMLButtonElement>('[data-light]').forEach((button) => {
      button.addEventListener('click', () => {
        const mode = button.dataset.light as VehicleLightMode;
        this.onLightModeChange?.(mode);
      });
    });
    this.require<HTMLButtonElement>(shell, '[data-fog-toggle]').addEventListener('click', () => this.onFogToggle?.());
    this.require<HTMLInputElement>(shell, '[data-vibration]').addEventListener('change', (event) => {
      this.setVibrationEnabled((event.currentTarget as HTMLInputElement).checked);
    });
    shell.querySelectorAll<HTMLButtonElement>('[data-selector]').forEach((button) => {
      button.addEventListener('click', () => this.onDriveSelectorChange?.(button.dataset.selector as DriveSelector));
    });
    shell.querySelectorAll<HTMLButtonElement>('[data-mirror-side]').forEach((button) => {
      button.addEventListener('click', () => {
        const side = button.dataset.mirrorSide as AdjustableMirrorSide;
        this.setMirrorSide(side);
        this.onMirrorSideChange?.(side);
      });
    });
    shell.querySelectorAll<HTMLButtonElement>('[data-mirror-yaw]').forEach((button) => {
      button.addEventListener('click', () => {
        this.onMirrorNudge?.(
          this.selectedMirror,
          Number(button.dataset.mirrorYaw ?? 0),
          Number(button.dataset.mirrorPitch ?? 0),
        );
      });
    });
    this.require<HTMLButtonElement>(shell, '[data-mirror-reset]').addEventListener('click', () => {
      this.onMirrorReset?.(this.selectedMirror);
    });
    this.require<HTMLButtonElement>(shell, '[data-bindings-reset]').addEventListener('click', () => {
      this.cancelBindingCapture();
      this.onBindingReset?.();
    });
    window.addEventListener('keydown', this.onWindowKeyDown, true);
  }

  public get isVisible(): boolean {
    return this.visible;
  }

  public get vibrationEnabled(): boolean { return this.vibrationOn; }

  public setVibrationEnabled(enabled: boolean): void {
    if (enabled === this.vibrationOn) return;
    this.vibrationOn = enabled;
    this.require<HTMLInputElement>(this.panel, '[data-vibration]').checked = enabled;
    try { localStorage.setItem('drivergame.controller-vibration.v1', JSON.stringify(enabled)); } catch { /* Optional preference. */ }
    this.onVibrationChange?.(enabled);
  }

  public setFogLights(enabled: boolean): void {
    const button = this.require<HTMLButtonElement>(this.panel, '[data-fog-toggle]');
    button.classList.toggle('active', enabled);
    button.setAttribute('aria-pressed', String(enabled));
  }

  public setDriveSelector(selector: DriveSelector, transmissionType: string): void {
    this.require<HTMLElement>(this.panel, '[data-selector-group]').hidden =
      transmissionType === 'MANUAL' || transmissionType === 'MT' || transmissionType === 'manual';
    this.panel.querySelectorAll<HTMLButtonElement>('[data-selector]').forEach((button) => {
      button.classList.toggle('active', button.dataset.selector === selector);
    });
  }

  public setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.panel.hidden = !visible;
    this.toggleButton.setAttribute('aria-expanded', String(visible));
    this.toggleButton.classList.toggle('active', visible);
    if (!visible) this.cancelBindingCapture();
    this.onVisibilityChange?.(visible);
  }

  public setLightMode(mode: VehicleLightMode): void {
    this.panel.querySelectorAll<HTMLButtonElement>('[data-light]').forEach((button) => {
      button.classList.toggle('active', button.dataset.light === mode);
    });
  }

  public setMirrorSide(side: AdjustableMirrorSide): void {
    this.selectedMirror = side;
    this.panel.querySelectorAll<HTMLButtonElement>('[data-mirror-side]').forEach((button) => {
      button.classList.toggle('active', button.dataset.mirrorSide === side);
    });
  }

  public setMirrorAdjustment(adjustment: Readonly<MirrorAdjustment>): void {
    this.mirrorValue.textContent = `水平 ${(adjustment.yaw * 180 / Math.PI).toFixed(1)}° · 垂直 ${(adjustment.pitch * 180 / Math.PI).toFixed(1)}°`;
  }

  public setBindings(bindings: KeyboardBindings): void {
    this.bindings = { ...bindings };
    for (const [action, button] of this.bindingButtons) {
      button.classList.toggle('listening', this.awaitingAction === action);
      if (this.awaitingAction === action) continue;
      button.textContent = formatKeyboardCode(this.bindings[action]);
    }
    document.querySelectorAll<HTMLElement>('[data-key-action]').forEach((element) => {
      const action = element.dataset.keyAction as KeyboardDrivingAction;
      if (action in this.bindings) element.textContent = formatKeyboardCode(this.bindings[action]);
    });
  }

  public setMapOptions(options: readonly DrivingMapOption[], activeMapId: string): void {
    this.mapButtons.clear();
    this.mapButtonsContainer.replaceChildren();
    for (const option of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.mapId = option.id;
      button.innerHTML = `<strong>${this.escapeHtml(option.label)}</strong><small>${this.escapeHtml(option.description)}</small>`;
      button.classList.toggle('active', option.id === activeMapId);
      button.addEventListener('click', () => this.onMapChange?.(option.id));
      this.mapButtons.set(option.id, button);
      this.mapButtonsContainer.append(button);
    }
  }

  public setActiveMap(mapId: string): void {
    for (const [id, button] of this.mapButtons) {
      button.classList.toggle('active', id === mapId);
    }
  }

  public setVehicleOptions(
    options: readonly DrivingVehicleOption[],
    activeVehicleId: string,
  ): void {
    this.vehicleButtons.clear();
    this.vehicleButtonsContainer.replaceChildren();
    for (const option of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.vehicleId = option.id;
      button.innerHTML = `<strong>${this.escapeHtml(option.label)}</strong><small>${this.escapeHtml(option.description)}</small>`;
      button.classList.toggle('active', option.id === activeVehicleId);
      button.addEventListener('click', () => this.onVehicleChange?.(option.id));
      this.vehicleButtons.set(option.id, button);
      this.vehicleButtonsContainer.append(button);
    }
  }

  public setActiveVehicle(vehicleId: string): void {
    for (const [id, button] of this.vehicleButtons) {
      button.classList.toggle('active', id === vehicleId);
    }
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onWindowKeyDown, true);
    this.toggleButton.closest('.vehicle-settings-shell')?.remove();
  }

  private buildBindingRows(container: HTMLElement): void {
    let previousGroup = '';
    for (const definition of KEYBOARD_BINDING_DEFINITIONS) {
      if (definition.group !== previousGroup) {
        const group = document.createElement('h4');
        group.textContent = definition.group;
        container.append(group);
        previousGroup = definition.group;
      }
      const label = document.createElement('label');
      label.textContent = definition.label;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.bindingAction = definition.action;
      button.addEventListener('click', () => this.beginBindingCapture(definition.action));
      label.append(button);
      container.append(label);
      this.bindingButtons.set(definition.action, button);
    }
  }

  private beginBindingCapture(action: KeyboardDrivingAction): void {
    this.cancelBindingCapture();
    this.awaitingAction = action;
    const button = this.bindingButtons.get(action);
    if (button !== undefined) {
      button.classList.add('listening');
      button.textContent = '请按键…';
    }
  }

  private cancelBindingCapture(): void {
    if (this.awaitingAction === null) return;
    const action = this.awaitingAction;
    this.awaitingAction = null;
    const button = this.bindingButtons.get(action);
    if (button !== undefined) {
      button.classList.remove('listening');
      button.textContent = formatKeyboardCode(this.bindings[action]);
    }
  }

  private readonly onWindowKeyDown = (event: KeyboardEvent): void => {
    if (this.awaitingAction !== null) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.code === 'Escape') {
        this.cancelBindingCapture();
        return;
      }
      if (RESERVED_GAME_KEYS.has(event.code) || event.code.startsWith('F')) {
        this.onNotice?.('这个按键由游戏界面保留，请换一个按键');
        return;
      }
      const action = this.awaitingAction;
      this.awaitingAction = null;
      this.onBindingChange?.(action, event.code);
      this.setBindings(this.bindings);
      return;
    }

    if (event.code === 'F3' && !event.repeat) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.setVisible(!this.visible);
      return;
    }
    if (event.code === 'Escape' && this.visible) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.setVisible(false);
    }
  };

  private require<T extends HTMLElement>(root: ParentNode, selector: string): T {
    const element = root.querySelector<T>(selector);
    if (element === null) throw new Error(`Settings element not found: ${selector}`);
    return element;
  }

  private escapeHtml(value: string): string {
    const element = document.createElement('span');
    element.textContent = value;
    return element.innerHTML;
  }

  private readVibrationPreference(): boolean {
    try {
      const value = localStorage.getItem('drivergame.controller-vibration.v1');
      return value === null || value !== 'false';
    } catch { return true; }
  }
}
