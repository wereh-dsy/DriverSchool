import type { VehicleFogMode } from '../vehicle/control/VehicleLightingController';
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
  public onStateOfChargeChange?: (soc: number) => void;
  private readonly batterySOCInput: HTMLInputElement;
  private readonly batteryReadout: HTMLElement;
  public onMinimapPositionChange?: (position: MinimapPosition) => void;
  public onImmersiveModeChange?: (enabled: boolean) => void;
  public minimapPosition: MinimapPosition = this.readMinimapPosition();
  public onVisibilityChange?: (visible: boolean) => void;
  public onLightModeChange?: (mode: VehicleLightMode) => void;
  public onFogToggle?: () => void;
  public onWeatherChange?: (weather: Weather) => void;
  public onTimeChange?: (time: EnvironmentTime) => void;
  public onWiperModeChange?: (mode: WiperMode) => void;
  public onVibrationChange?: (enabled: boolean) => void;
  public onTrajectoryPredictionChange?: (enabled: boolean) => void;
  public onAccelerationTestChange?: (enabled: boolean) => void;
  public onDriverAssistsChange?: (options: DriverAssistOptions) => void;
  public onAutoHoldChange?: (enabled: boolean) => void;
  public onStartStopChange?: (enabled: boolean) => void;
  public onLateralPreferencesChange?: () => void;
  public onLCCToggle?: () => void;
  public lkaPreference = this.readAssistancePreference('lkaEnabled') ?? true;
  public lccPreference = this.readAssistancePreference('lccEnabled') ?? true;
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
  private batteryTelemetry: import('../vehicle/powertrain/Powertrain').EVTelemetry | undefined;
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
          <div><small>DRIVER SETUP</small><strong>驾驶设置</strong><p>调整车辆、环境与操作偏好</p></div>
          <button type="button" class="settings-close" data-settings-close aria-label="关闭设置">×</button>
        </header>
        <nav class="settings-tabs" role="tablist" aria-label="设置分类">
          <button type="button" id="settings-tab-vehicle" data-settings-tab="vehicle" role="tab" aria-controls="settings-page-vehicle" aria-selected="true">车辆</button>
          <button type="button" id="settings-tab-world" data-settings-tab="world" role="tab" aria-controls="settings-page-world" aria-selected="false" tabindex="-1">场地</button>
          <button type="button" id="settings-tab-controls" data-settings-tab="controls" role="tab" aria-controls="settings-page-controls" aria-selected="false" tabindex="-1">控制</button>
          <button type="button" id="settings-tab-experimental" data-settings-tab="experimental" role="tab" aria-controls="settings-page-experimental" aria-selected="false" tabindex="-1">实验</button>
        </nav>
        <div class="settings-scroll">
          <div id="settings-page-vehicle" class="settings-page" data-settings-page="vehicle" role="tabpanel" aria-labelledby="settings-tab-vehicle" tabindex="0">
            <section class="settings-group">
              <div class="settings-group-title"><span>训练车辆</span><small>切换后以新车回到当前场地起点</small></div>
              <details class="settings-catalog">
                <summary><span data-current-vehicle>选择车辆</span><small>切换车型</small></summary>
                <div class="map-selection-list" data-vehicle-buttons></div>
              </details>
            </section>
            <section class="settings-group" data-fuel-group>
              <div class="settings-group-title"><span>燃油</span><small data-fuel-capacity>油箱容量</small></div>
              <div class="fuel-settings-inputs">
                <label>当前油量 (L)<input type="number" min="0" step="0.01" data-fuel-litres aria-label="Current Fuel litres"></label>
                <label>油量百分比 (%)<input type="number" min="0" max="100" step="0.01" data-fuel-percent aria-label="Current Fuel percent"></label>
              </div>
            </section>
            <section class="settings-group" data-battery-group hidden>
              <div class="settings-group-title"><span>电池</span><small data-battery-readout></small></div>
              <label>训练电量 (%)<input type="number" min="0" max="100" step="1" data-battery-soc aria-label="Battery state of charge percent"></label>
            </section>
            <section class="settings-group" data-selector-group hidden>
              <div class="settings-group-title"><span>自动挡选择器</span><small>选挡需踩住 S / LT；进入 R / P 前先停车</small></div>
              <div class="settings-segments settings-segments-four" data-selector-buttons>
                <button type="button" data-selector="P">P · 驻车</button>
                <button type="button" data-selector="R">R · 倒车</button>
                <button type="button" data-selector="N">N · 空挡</button>
                <button type="button" data-selector="D">D · 前进</button>
              </div>
            </section>
            <section class="settings-group">
              <div class="settings-group-title"><span>驾驶辅助</span><small>独立开关 · 机械手刹不受 ABS 控制</small></div>
              <div class="settings-segments settings-aids">
                <button type="button" data-aid="absEnabled">ABS: ON</button>
                <button type="button" data-aid="tractionControlEnabled">TCS: ON</button>
                <button type="button" data-aid="stabilityControlEnabled">ESC: ON</button>
                <button type="button" data-auto-hold hidden aria-pressed="false">AUTO HOLD: OFF</button>
                <button type="button" data-start-stop aria-pressed="false">START/STOP: OFF</button>
                <button type="button" data-lka> LKA: ON</button>
                <button type="button" data-lcc-enabled>LCC: ON</button>
                <button type="button" data-lcc-toggle>LCC SET / CANCEL · G</button>
              </div>
              <small data-start-stop-state></small>
              <small data-lateral-state></small>
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
          </div>
          <div id="settings-page-world" class="settings-page" data-settings-page="world" role="tabpanel" aria-labelledby="settings-tab-world" tabindex="0" hidden>
            <section class="settings-group">
              <div class="settings-group-title"><span>界面显示</span><small><kbd>F1</kbd> 快速切换</small></div>
              <label class="settings-switch"><span>沉浸模式</span><input type="checkbox" data-immersive-mode aria-label="沉浸模式"></label>
              <p class="settings-note">隐藏全部驾驶界面叠加信息与实验可视化，保留车内仪表、实体后视镜和车载屏幕。按 F1 恢复界面；F3 仍可打开设置。</p>
            </section>
            <section class="settings-group">
              <div class="settings-group-title"><span>训练场地</span><small>切换后车辆回到该场地起点</small></div>
              <details class="settings-catalog">
                <summary><span data-current-map>选择场地</span><small>切换场地</small></summary>
                <div class="map-selection-list" data-map-buttons></div>
              </details>
            </section>
            <section class="settings-group">
              <div class="settings-group-title"><span>天气与时间</span><small>所有场地通用 · 可自由组合</small></div>
              <div class="settings-segments">
                <button type="button" data-weather="CLEAR">晴天</button>
                <button type="button" data-weather="LIGHT_RAIN">小雨</button>
                <button type="button" data-weather="HEAVY_RAIN">大雨</button>
              </div>
              <div class="settings-segments">
                <button type="button" data-time="DAY">白天</button>
                <button type="button" data-time="DUSK">黄昏</button>
                <button type="button" data-time="NIGHT">夜间</button>
              </div>
            </section>
            <section class="settings-group">
              <div class="settings-group-title"><span>前雨刷</span><small><kbd data-key-action="cycleWipers">B</kbd> 关→间歇→低速→高速</small></div>
              <div class="settings-segments settings-segments-four">
                <button type="button" data-wiper="OFF">关闭</button>
                <button type="button" data-wiper="INTERMITTENT">间歇</button>
                <button type="button" data-wiper="LOW">低速</button>
                <button type="button" data-wiper="HIGH">高速</button>
              </div>
            </section>
            <section class="settings-group">
              <div class="settings-group-title"><span>灯光</span><small><kbd data-key-action="cycleLights">L</kbd> 循环切换</small></div>
              <div class="settings-segments settings-segments-four" data-light-buttons>
                <button type="button" data-light="off">关闭</button>
                <button type="button" data-light="position">示宽</button>
                <button type="button" data-light="low">近光</button>
                <button type="button" data-light="high">远光</button>
              </div>
              <button type="button" data-fog-toggle aria-pressed="false">雾灯循环 · <span data-fog-state>OFF</span> · <kbd data-key-action="fogToggle">F</kbd></button>
            </section>
            <section class="settings-group">
              <div class="settings-group-title"><span>道路小地图</span><small>显示位置</small></div>
              <div class="settings-segments">
                <button type="button" data-minimap="off">关闭</button>
                <button type="button" data-minimap="top-left">左上角</button>
                <button type="button" data-minimap="top-right">右上角</button>
              </div>
            </section>
          </div>
          <div id="settings-page-controls" class="settings-page" data-settings-page="controls" role="tabpanel" aria-labelledby="settings-tab-controls" tabindex="0" hidden>
            <section class="settings-group">
              <div class="settings-group-title"><span>标准手柄</span><small>统一车辆输入</small></div>
              <p class="settings-note">左摇杆：方向 · RT/LT：油门/制动<br>RB/LB：MT 升/降挡；AT/DCT/CVT 踩住 LT 后按 P→R→N→D 前后选挡<br>十字键 ←/→：转向灯 · ↑ 短按：关→示宽→近光→远光 · ↑ 长按：雾灯 OFF→前→前后 · ↓：双闪<br>A：驻车制动 · X：GT/自动挡定速巡航（键盘 V） · Y：Lane Assist OFF→LDW→LKA→LCC · B：驾驶模式 ECO→NORMAL→SPORT（键盘 T，支持车型）<br>L3 按住：闪远光 · R3：喇叭 · Start：点火/熄火<br>右摇杆：观察；键盘 M 进入手动离合后，右摇杆上下控制离合变化速度。</p>
              <label class="settings-switch"><span>手柄震动</span><input type="checkbox" data-vibration aria-label="手柄震动"></label>
            </section>
            <section class="settings-group keyboard-settings">
              <div class="settings-group-title"><span>键盘键位</span><button type="button" data-bindings-reset>恢复默认</button></div>
              <div class="binding-grid" data-binding-grid></div>
              <p class="settings-note">点击一个键位，再按新的按键；若已有占用，将自动交换。</p>
              <p class="settings-note"><kbd>F1</kbd> 沉浸模式 · <kbd>F2</kbd> 车辆数据 · <kbd>F3</kbd> 设置 · <kbd>F4</kbd> 切换场地 · <kbd>F5</kbd> 切换车辆<br><kbd>C</kbd> 视角回正 · <kbd>U</kbd> 车载屏幕切页（支持车型） · <kbd>Backspace</kbd> 回到起点</p>
            </section>
          </div>
          <div id="settings-page-experimental" class="settings-page" data-settings-page="experimental" role="tabpanel" aria-labelledby="settings-tab-experimental" tabindex="0" hidden>
            <section class="settings-group">
              <div class="settings-group-title"><span>实验功能</span><small>按需开启</small></div>
              <label class="settings-switch"><span>轨迹预测</span><input type="checkbox" data-trajectory-prediction aria-label="轨迹预测"></label>
              <p class="settings-note">按当前转向、运动与加减速趋势外推未来 2 秒。单条加粗轨迹由青色经黄色渐变至橙色，表示由近及远的预测时间。默认关闭；不预测碰撞或未来操作。</p>
              <label class="settings-switch"><span>百公里加速测试</span><input type="checkbox" data-acceleration-test aria-label="百公里加速测试"></label>
              <p class="settings-note">停稳后开启，下次踩油门开始计时。面板可选择 0–100 或继续测到 200 km/h，同时记录本轮能耗和峰值纵向加速度；200 模式保留独立的 0–100 分段。</p>
            </section>
          </div>
        </div>
        <footer class="settings-footer"><span>调整即时生效</span><span><kbd>F3</kbd> / <kbd>Esc</kbd> 关闭</span></footer>
      </section>`;
    host.append(shell);

    this.toggleButton = this.require(shell, '[data-settings-toggle]');
    this.panel = this.require(shell, '[data-settings-panel]');
    this.require<HTMLInputElement>(shell, '[data-immersive-mode]').addEventListener('change', event => {
      this.onImmersiveModeChange?.((event.currentTarget as HTMLInputElement).checked);
    });
    const tabs = [...shell.querySelectorAll<HTMLButtonElement>('[data-settings-tab]')];
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => this.selectSettingsTab(tab));
      tab.addEventListener('keydown', event => {
        let next = index;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else return;
        event.preventDefault();
        event.stopPropagation();
        const nextTab = tabs[next];
        if (nextTab === undefined) return;
        this.selectSettingsTab(nextTab);
        nextTab.focus();
      });
    });
    this.mirrorValue = this.require(shell, '[data-mirror-value]');
    this.mapButtonsContainer = this.require(shell, '[data-map-buttons]');
    this.vehicleButtonsContainer = this.require(shell, '[data-vehicle-buttons]');
    this.fuelLitresInput = this.require(shell, '[data-fuel-litres]');
    this.fuelPercentInput = this.require(shell, '[data-fuel-percent]');
    this.fuelCapacityLabel = this.require(shell, '[data-fuel-capacity]');
    this.batterySOCInput = this.require(shell, '[data-battery-soc]');
    this.batteryReadout = this.require(shell, '[data-battery-readout]');
    this.batterySOCInput.addEventListener('input', () => {
      if (Number.isFinite(this.batterySOCInput.valueAsNumber)) this.onStateOfChargeChange?.(Math.max(0, Math.min(100, this.batterySOCInput.valueAsNumber)) / 100);
    });
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
    this.require<HTMLInputElement>(shell, '[data-trajectory-prediction]').addEventListener('change', event => {
      this.onTrajectoryPredictionChange?.((event.currentTarget as HTMLInputElement).checked);
    });
    this.require<HTMLInputElement>(shell, '[data-acceleration-test]').addEventListener('change', event => {
      this.onAccelerationTestChange?.((event.currentTarget as HTMLInputElement).checked);
    });
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
    this.require<HTMLButtonElement>(shell, '[data-lka]').addEventListener('click', () => {
      this.lkaPreference = !this.lkaPreference; this.saveAssistancePreferences(); this.onLateralPreferencesChange?.();
    });
    this.require<HTMLButtonElement>(shell, '[data-lcc-enabled]').addEventListener('click', () => {
      this.lccPreference = !this.lccPreference; this.saveAssistancePreferences(); this.onLateralPreferencesChange?.();
    });
    this.require<HTMLButtonElement>(shell, '[data-lcc-toggle]').addEventListener('click', () => this.onLCCToggle?.());
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

  public setImmersiveMode(enabled: boolean): void {
    this.require<HTMLInputElement>(this.panel, '[data-immersive-mode]').checked = enabled;
  }

  private selectSettingsTab(selected: HTMLButtonElement): void {
    this.cancelBindingCapture();
    this.panel.querySelectorAll<HTMLButtonElement>('[data-settings-tab]').forEach(tab => {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    this.panel.querySelectorAll<HTMLElement>('[data-settings-page]').forEach(page => {
      page.hidden = page.dataset.settingsPage !== selected.dataset.settingsTab;
    });
    this.require(this.panel, '.settings-scroll').scrollTop = 0;
  }

  public get vibrationEnabled(): boolean { return this.vibrationOn; }

  public setVibrationEnabled(enabled: boolean): void {
    if (enabled === this.vibrationOn) return;
    this.vibrationOn = enabled;
    this.require<HTMLInputElement>(this.panel, '[data-vibration]').checked = enabled;
    try { localStorage.setItem('drivergame.controller-vibration.v1', JSON.stringify(enabled)); } catch { /* Optional preference. */ }
    this.onVibrationChange?.(enabled);
  }

  public setFogLights(mode: VehicleFogMode): void {
    const enabled = mode !== 'off';
    this.require<HTMLElement>(this.panel, '[data-fog-state]').textContent = mode === 'off' ? 'OFF' : mode === 'front' ? '前' : '前后';
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
    if (visible) this.require(this.panel, '[data-settings-tab][aria-selected="true"]').focus({ preventScroll: true });
    else this.toggleButton.focus({ preventScroll: true });
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
    this.setActiveMap(activeMapId);
  }

  public setActiveMap(mapId: string): void {
    for (const [id, button] of this.mapButtons) {
      button.classList.toggle('active', id === mapId);
    }
    this.require(this.panel, '[data-current-map]').textContent =
      this.mapButtons.get(mapId)?.querySelector('strong')?.textContent ?? '选择场地';
  }

  public setBattery(ev: import('../vehicle/powertrain/Powertrain').EVTelemetry | undefined): void {
    this.batteryTelemetry = ev;
    this.batterySOCInput.closest<HTMLElement>('[data-battery-group]')!.hidden = !ev;
    if (!ev) return;
    if (document.activeElement !== this.batterySOCInput) this.batterySOCInput.value = (ev.stateOfCharge * 100).toFixed(1);
    this.batteryReadout.textContent = `${ev.remainingEnergyKWh.toFixed(1)} kWh · ${ev.estimatedRangeKm.toFixed(0)} km`;
  }
  public setFuel(fuel: FuelSnapshot | undefined): void {
    this.fuelLitresInput.closest<HTMLElement>('[data-fuel-group]')!.hidden = !fuel;
    if (!fuel) return;
    const capacityChanged = this.fuelCapacityL !== fuel.tankCapacityL;
    this.fuelCapacityL = fuel.tankCapacityL;
    if (capacityChanged) {
      this.fuelLitresInput.max = String(fuel.tankCapacityL);
      this.fuelCapacityLabel.textContent = `油箱容量 ${fuel.tankCapacityL} L`;
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
    this.setActiveVehicle(activeVehicleId);
  }

  public setAutoHold(available: boolean, enabled: boolean): void {
    const button = this.require<HTMLButtonElement>(this.panel, '[data-auto-hold]');
    button.hidden = false; button.disabled = !available;
    button.textContent = `AUTO HOLD: ${enabled ? 'ON' : 'OFF'}`;
    button.classList.toggle('active', enabled);
    button.setAttribute('aria-pressed', String(enabled));
  }

  public setAssistanceSupport(capabilities: VehicleCapabilities): void {
    this.setLateralAssistance(capabilities.lka, capabilities.lcc, 'OFF', 'OFF', false);
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
  public setLateralAssistance(lka: boolean, lcc: boolean, lkaState: string, lccState: string, requested: boolean, mode = 'OFF'): void {
    const ka = this.require<HTMLButtonElement>(this.panel, '[data-lka]');
    const cc = this.require<HTMLButtonElement>(this.panel, '[data-lcc-enabled]');
    const toggle = this.require<HTMLButtonElement>(this.panel, '[data-lcc-toggle]');
    ka.disabled = !lka; cc.disabled = !lcc; toggle.disabled = !lcc || !this.lccPreference;
    ka.textContent = `允许 LKA: ${lka && this.lkaPreference ? 'ON' : 'OFF'}`;
    cc.textContent = `允许 LCC: ${lcc && this.lccPreference ? 'ON' : 'OFF'}`;
    ka.setAttribute('aria-pressed', String(lka && this.lkaPreference));
    cc.setAttribute('aria-pressed', String(lcc && this.lccPreference));
    toggle.setAttribute('aria-pressed', String(requested));
    toggle.textContent = `LCC ${requested ? 'CANCEL' : 'SET'} · ${formatKeyboardCode(this.bindings.lccToggle)}`;
    this.require(this.panel, '[data-lateral-state]').textContent = `模式 ${mode} · LKA ${lkaState} · LCC ${lccState}`;
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
        `${data.averageSpeedKmh?.toFixed(1) ?? '--'} km/h` +
        (this.batteryTelemetry ? '' : ` · ${data.averageFuelConsumptionLPer100km?.toFixed(1) ?? '--'} L/100km`);
    }).join(' | ') + (this.batteryTelemetry ? ` | EV session: ${this.batteryTelemetry.tripEnergyConsumedKWh.toFixed(2)} kWh used · ${this.batteryTelemetry.tripEnergyRecoveredKWh.toFixed(2)} recovered · ${this.batteryTelemetry.averageConsumptionKWhPer100km?.toFixed(1) ?? '--'} kWh/100km` : '');
  }
  private readAssistancePreference(key: string): boolean | undefined {
    try { const saved = JSON.parse(localStorage.getItem('drivergame.driver-assists.v1') ?? '{}');
      return typeof saved?.[key] === 'boolean' ? saved[key] : undefined;
    } catch { return undefined; }
  }
  private saveAssistancePreferences(): void {
    try { localStorage.setItem('drivergame.driver-assists.v1', JSON.stringify({ ...this.driverAssistOptions,
      autoHoldEnabled: this.autoHoldPreference, startStopEnabled: this.startStopPreference,
      lkaEnabled: this.lkaPreference, lccEnabled: this.lccPreference })); } catch { /* Optional storage. */ }
  }

  public setActiveVehicle(vehicleId: string): void {
    for (const [id, button] of this.vehicleButtons) {
      button.classList.toggle('active', id === vehicleId);
    }
    this.require(this.panel, '[data-current-vehicle]').textContent =
      this.vehicleButtons.get(vehicleId)?.querySelector('strong')?.textContent ?? '选择车辆';
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
