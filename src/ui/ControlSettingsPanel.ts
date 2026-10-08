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
import type { DriverAssistOptions } from '../vehicle/physics/DriverAssistSystem';
import type { EnvironmentTime, Weather } from '../world/environment/EnvironmentState';
import type { WiperMode } from '../vehicle/control/WiperController';
import type { MinimapPosition } from './Minimap';
import type { FuelSnapshot } from '../vehicle/physics/FuelSystem';
import type { VehicleCapabilities } from '../vehicle/VehicleCapabilities';
import type { TripComputerSnapshot } from '../vehicle/control/TripComputer';

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
  public onMinimapPositionChange?: (position: MinimapPosition) => void;
  public minimapPosition: MinimapPosition = this.readMinimapPosition();
  public onVisibilityChange?: (visible: boolean) => void;
  public onLightModeChange?: (mode: VehicleLightMode) => void;
  public onFogToggle?: () => void;
  public onWeatherChange?: (weather: Weather) => void;
  public onTimeChange?: (time: EnvironmentTime) => void;
  public onWiperModeChange?: (mode: WiperMode) => void;
  public onVibrationChange?: (enabled: boolean) => void;
  public onDriverAssistsChange?: (options: DriverAssistOptions) => void;
  public onAutoHoldChange?: (enabled: boolean) => void;
  public onStartStopChange?: (enabled: boolean) => void;
  public onTripReset?: (trip: 'A' | 'B') => void;
  public autoHoldPreference: boolean | undefined = this.readAssistancePreference('autoHoldEnabled');
  public startStopPreference = this.readAssistancePreference('startStopEnabled') ?? false;
  public readonly driverAssistOptions: DriverAssistOptions = this.readDriverAssistPreferences();
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
  public onFuelChange?: (litres: number) => void;
  public onNotice?: (message: string) => void;

  private readonly toggleButton: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private readonly mirrorValue: HTMLElement;
  private readonly mapButtonsContainer: HTMLElement;
  private readonly vehicleButtonsContainer: HTMLElement;
  private readonly fuelLitresInput: HTMLInputElement;
  private readonly fuelPercentInput: HTMLInputElement;
  private readonly fuelCapacityLabel: HTMLElement;
  private fuelCapacityL = 0;
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
            <div class="settings-group-title"><span>道路小地图 · Minimap</span><small>科目三场地</small></div>
            <div class="settings-segments">
              <button type="button" data-minimap="off">Off · 关闭</button>
              <button type="button" data-minimap="top-left">Top Left · 左上</button>
              <button type="button" data-minimap="top-right">Top Right · 右上</button>
            </div>
          </section>
          <section class="settings-group">
            <div class="settings-group-title"><span>训练场地</span><small>切换后车辆回到该场地起点</small></div>
            <div class="map-selection-list" data-map-buttons></div>
          </section>
          <section class="settings-group">
            <div class="settings-group-title"><span>训练车辆</span><small>切换后以新车回到当前场地起点</small></div>
            <div class="map-selection-list" data-vehicle-buttons></div>
          </section>
          <section class="settings-group">
            <div class="settings-group-title"><span>燃油 · Current Fuel</span><small data-fuel-capacity>Tank Capacity</small></div>
            <div class="fuel-settings-inputs">
              <label>当前油量 (L)<input type="number" min="0" step="0.01" data-fuel-litres aria-label="Current Fuel litres"></label>
              <label>油量百分比 (%)<input type="number" min="0" max="100" step="0.01" data-fuel-percent aria-label="Current Fuel percent"></label>
            </div>
          </section>
          <section class="settings-group">
            <div class="settings-group-title"><span>环境 · Weather / Time</span><small>所有场地通用 · 可自由组合</small></div>
            <div class="settings-segments">
              <button type="button" data-weather="CLEAR">晴天 Clear</button>
              <button type="button" data-weather="LIGHT_RAIN">小雨 Light Rain</button>
              <button type="button" data-weather="HEAVY_RAIN">大雨 Heavy Rain</button>
            </div>
            <div class="settings-segments">
              <button type="button" data-time="DAY">白天 Day</button>
              <button type="button" data-time="DUSK">黄昏 Dusk</button>
              <button type="button" data-time="NIGHT">夜间 Night</button>
            </div>
          </section>
          <section class="settings-group">
            <div class="settings-group-title"><span>前雨刷</span><small><kbd data-key-action="cycleWipers">B</kbd> 关→间歇→低速→高速</small></div>
            <div class="settings-segments">
              <button type="button" data-wiper="OFF">关闭</button>
              <button type="button" data-wiper="INTERMITTENT">间歇</button>
              <button type="button" data-wiper="LOW">低速</button>
              <button type="button" data-wiper="HIGH">高速</button>
            </div>
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
            <div class="settings-group-title"><span>驾驶辅助</span><small>独立开关 · 机械手刹不受 ABS 控制</small></div>
            <div class="settings-segments">
              <button type="button" data-aid="absEnabled">ABS: ON</button>
              <button type="button" data-aid="tractionControlEnabled">TCS: ON</button>
              <button type="button" data-aid="stabilityControlEnabled">ESC: ON</button>
              <button type="button" data-auto-hold hidden aria-pressed="false">AUTO HOLD: OFF</button>
              <button type="button" data-start-stop aria-pressed="false">START/STOP: OFF</button>
            </div>
            <small data-start-stop-state></small>
          </section>
          <section class="settings-group">
            <div class="settings-group-title"><span>里程 / 行程电脑</span><small data-odometer></small></div>
            <p class="settings-note" data-trip-summary></p>
            <div class="settings-segments"><button type="button" data-trip-reset="A">重置 Trip A</button><button type="button" data-trip-reset="B">重置 Trip B</button></div>
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
            <p class="settings-note">左摇杆：方向 · RT/LT：油门/制动<br>RB/LB：MT 升/降挡；AT/DCT/CVT 踩住 LT 后按 P→R→N→D 前后选挡<br>十字键 ←/→：转向灯 · ↑：关→示宽→近光→远光 · ↓：双闪<br>A：驻车制动 · X：GT/自动挡定速巡航（键盘 V） · Y：前后雾灯 · B：驾驶模式 ECO→NORMAL→SPORT（键盘 T，支持车型）<br>L3 按住：闪远光 · R3：喇叭 · Start：点火/熄火<br>右摇杆：观察；键盘 M 进入手动离合后，右摇杆上下控制离合变化速度。</p>
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
    this.fuelLitresInput = this.require(shell, '[data-fuel-litres]');
    this.fuelPercentInput = this.require(shell, '[data-fuel-percent]');
    this.fuelCapacityLabel = this.require(shell, '[data-fuel-capacity]');
    const applyFuel = (input: HTMLInputElement, percent: boolean) => {
      if (input.value === '' || !Number.isFinite(input.valueAsNumber)) return;
      const value = Math.max(0, Math.min(percent ? 100 : this.fuelCapacityL, input.valueAsNumber));
      this.onFuelChange?.(percent ? value / 100 * this.fuelCapacityL : value);
    };
    this.fuelLitresInput.addEventListener('input', () => applyFuel(this.fuelLitresInput, false));
    this.fuelPercentInput.addEventListener('input', () => applyFuel(this.fuelPercentInput, true));
    // Commit the clamped value when an editor loses focus.
    this.fuelLitresInput.addEventListener('change', () => { this.fuelLitresInput.blur(); });
    this.fuelPercentInput.addEventListener('change', () => { this.fuelPercentInput.blur(); });
    this.buildBindingRows(this.require(shell, '[data-binding-grid]'));
    this.setBindings(this.bindings);
    this.setLightMode('off');
    this.setEnvironment('CLEAR', 'DAY');
    this.setWiperMode('OFF');
    this.setMirrorSide('left');
    this.refreshMinimapButtons();
    shell.querySelectorAll<HTMLButtonElement>('[data-minimap]').forEach(button => {
      button.addEventListener('click', () => {
        this.minimapPosition = button.dataset.minimap as MinimapPosition;
        this.refreshMinimapButtons();
        try { localStorage.setItem('drivergame.minimap-position.v1', this.minimapPosition); } catch { /* Optional preference. */ }
        this.onMinimapPositionChange?.(this.minimapPosition);
      });
    });
    this.require<HTMLInputElement>(shell, '[data-vibration]').checked = this.vibrationOn;
    this.require<HTMLButtonElement>(shell, '[data-auto-hold]').addEventListener('click', event => {
      const button = event.currentTarget as HTMLButtonElement;
      this.autoHoldPreference = button.getAttribute('aria-pressed') !== 'true';
      this.saveAssistancePreferences(); this.onAutoHoldChange?.(this.autoHoldPreference);
    });
    this.require<HTMLButtonElement>(shell, '[data-start-stop]').addEventListener('click', () => {
      this.startStopPreference = !this.startStopPreference; this.saveAssistancePreferences();
      this.onStartStopChange?.(this.startStopPreference);
    });
    shell.querySelectorAll<HTMLButtonElement>('[data-trip-reset]').forEach(button =>
      button.addEventListener('click', () => this.onTripReset?.(button.dataset.tripReset as 'A' | 'B')));
    shell.querySelectorAll<HTMLButtonElement>('[data-aid]').forEach(button => {
      const key = button.dataset.aid as keyof DriverAssistOptions;
      const label = key === 'absEnabled' ? 'ABS' : key === 'ebdEnabled' ? 'EBD' : key === 'stabilityControlEnabled' ? 'ESC' : 'TCS';
      const refresh = () => {
        button.textContent = `${label}: ${this.driverAssistOptions[key] ? 'ON' : 'OFF'}`;
        button.classList.toggle('active', this.driverAssistOptions[key]);
        button.setAttribute('aria-pressed', String(this.driverAssistOptions[key]));
      };
      refresh();
      button.addEventListener('click', () => {
        this.driverAssistOptions[key] = !this.driverAssistOptions[key]; refresh();
        this.saveAssistancePreferences();
        this.onDriverAssistsChange?.({ ...this.driverAssistOptions });
      });
    });

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
    shell.querySelectorAll<HTMLButtonElement>('[data-weather]').forEach(button => {
      button.addEventListener('click', () => this.onWeatherChange?.(button.dataset.weather as Weather));
    });
    shell.querySelectorAll<HTMLButtonElement>('[data-time]').forEach(button => {
      button.addEventListener('click', () => this.onTimeChange?.(button.dataset.time as EnvironmentTime));
    });
    shell.querySelectorAll<HTMLButtonElement>('[data-wiper]').forEach(button => {
      button.addEventListener('click', () => this.onWiperModeChange?.(button.dataset.wiper as WiperMode));
    });
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

  public setFuel(fuel: FuelSnapshot): void {
    const capacityChanged = this.fuelCapacityL !== fuel.tankCapacityL;
    this.fuelCapacityL = fuel.tankCapacityL;
    if (capacityChanged) {
      this.fuelLitresInput.max = String(fuel.tankCapacityL);
      this.fuelCapacityLabel.textContent = `Tank Capacity · ${fuel.tankCapacityL} L`;
    }
    // Live consumption refreshes the controls without interrupting an edit.
    if (capacityChanged || document.activeElement !== this.fuelLitresInput) {
      this.fuelLitresInput.value = fuel.currentFuelL.toFixed(2);
    }
    if (capacityChanged || document.activeElement !== this.fuelPercentInput) {
      this.fuelPercentInput.value = fuel.fuelPercent.toFixed(2);
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

  public setAutoHold(available: boolean, enabled: boolean): void {
    const button = this.require<HTMLButtonElement>(this.panel, '[data-auto-hold]');
    button.hidden = false; button.disabled = !available;
    button.textContent = `AUTO HOLD: ${enabled ? 'ON' : 'OFF'}`;
    button.classList.toggle('active', enabled);
    button.setAttribute('aria-pressed', String(enabled));
  }

  public setAssistanceSupport(capabilities: VehicleCapabilities): void {
    const support: Record<string, boolean> = { absEnabled: capabilities.abs,
      tractionControlEnabled: capabilities.tcs, stabilityControlEnabled: capabilities.esc };
    this.panel.querySelectorAll<HTMLButtonElement>('[data-aid]').forEach(button => {
      const key = button.dataset.aid as keyof DriverAssistOptions;
      const enabled = support[key] && this.driverAssistOptions[key];
      button.disabled = !support[key]; button.classList.toggle('active', enabled);
      button.setAttribute('aria-pressed', String(enabled));
      const label = key === 'absEnabled' ? 'ABS' : key === 'stabilityControlEnabled' ? 'ESC' : 'TCS';
      button.textContent = `${label}: ${enabled ? 'ON' : 'OFF'}`;
    });
  }
  public setStartStop(available: boolean, enabled: boolean, state: string): void {
    const button = this.require<HTMLButtonElement>(this.panel, '[data-start-stop]');
    button.disabled = !available; button.textContent = `START/STOP: ${enabled ? 'ON' : 'OFF'}`;
    button.classList.toggle('active', enabled); button.setAttribute('aria-pressed', String(enabled));
    this.require(this.panel, '[data-start-stop-state]').textContent = available ? state : '';
  }
  public setTrip(trip: TripComputerSnapshot): void {
    this.require(this.panel, '[data-odometer]').textContent = `ODO ${trip.totalDistanceKm.toFixed(2)} km`;
    this.require(this.panel, '[data-trip-summary]').textContent = (['A', 'B'] as const).map(id => {
      const data = id === 'A' ? trip.tripA : trip.tripB;
      return `Trip ${id}: ${data.distanceKm.toFixed(2)} km · ${Math.floor(data.operatingTimeSeconds / 60)} min · ` +
        `${data.averageSpeedKmh?.toFixed(1) ?? '--'} km/h · ${data.averageFuelConsumptionLPer100km?.toFixed(1) ?? '--'} L/100km`;
    }).join(' | ');
  }
  private readAssistancePreference(key: string): boolean | undefined {
    try { const saved = JSON.parse(localStorage.getItem('drivergame.driver-assists.v1') ?? '{}');
      return typeof saved?.[key] === 'boolean' ? saved[key] : undefined;
    } catch { return undefined; }
  }
  private saveAssistancePreferences(): void {
    try { localStorage.setItem('drivergame.driver-assists.v1', JSON.stringify({ ...this.driverAssistOptions,
      autoHoldEnabled: this.autoHoldPreference, startStopEnabled: this.startStopPreference })); } catch { /* Optional storage. */ }
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

  private readMinimapPosition(): MinimapPosition {
    try {
      const stored = localStorage.getItem('drivergame.minimap-position.v1');
      if (stored === 'off' || stored === 'top-left' || stored === 'top-right') return stored;
    } catch { /* Optional preference. */ }
    return 'top-right';
  }

  private refreshMinimapButtons(): void {
    this.panel.querySelectorAll<HTMLButtonElement>('[data-minimap]').forEach(button => {
      const active = button.dataset.minimap === this.minimapPosition;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  public setEnvironment(weather: Weather, time: EnvironmentTime): void {
    this.setEnvironmentButtons('weather', weather);
    this.setEnvironmentButtons('time', time);
  }

  public setWiperMode(mode: WiperMode): void {
    this.setEnvironmentButtons('wiper', mode);
  }

  private setEnvironmentButtons(key: string, value: string): void {
    this.panel.querySelectorAll<HTMLButtonElement>(`[data-${key}]`).forEach(button => {
      const active = button.dataset[key] === value;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  private readDriverAssistPreferences(): DriverAssistOptions {
    const defaults: DriverAssistOptions = { absEnabled: true, ebdEnabled: true, tractionControlEnabled: true, stabilityControlEnabled: true };
    try {
      const saved = JSON.parse(localStorage.getItem('drivergame.driver-assists.v1') ?? '{}');
      for (const key of Object.keys(defaults) as (keyof DriverAssistOptions)[]) {
        if (key === 'ebdEnabled') continue; // Ordinary UI leaves installed EBD enabled.
        if (typeof saved?.[key] === 'boolean') defaults[key] = saved[key];
      }
    } catch { /* Defaults apply when unavailable/corrupt. */ }
    return defaults;
  }
}
