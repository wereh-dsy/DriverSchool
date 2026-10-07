import type { Texture } from 'three';
import type { GamepadThrottleDiagnostics } from '../input/GamepadInput';
import type { VehicleFeedbackState } from '../vehicle/feedback/VehicleFeedbackSystem';
import type { VehicleSnapshot } from '../vehicle/physics/VehicleDynamics';
import type { EngineTurboSnapshot } from '../vehicle/physics/Engine';
import type { TransmissionSnapshot } from '../vehicle/transmission/TransmissionSystem';
import {
  ControlSettingsPanel,
  type DrivingMapOption,
  type DrivingVehicleOption,
} from './ControlSettingsPanel';

export interface HudTelemetry {
  speed: number;
  rpm: number;
  gear: string | number;
  throttle: number;
  brake: number;
  clutchEngagement: number;
  steeringAngle: number;
  bodySlipAngle?: number;
  lateralAcceleration?: number;
  rearLateralGripFactor?: number;
  idleRPM?: number;
  redlineRPM?: number;
  shiftWarningRPM?: number;
  recommendedUpshiftRPM?: number;
  upshiftRecommendationAvailable?: boolean;
  upshiftRecommended?: boolean;
  redlineWarningRPM?: number;
  nearRedline?: boolean;
  onRevLimiter?: boolean;
  clutchPedal?: number;
  handbrake?: number;
  controlMode?: 'normal' | 'manual-clutch';
  inputSource?: string;
  cruiseAvailable?: boolean;
  cruiseActive?: boolean;
  cruiseTargetSpeedKmh?: number | null;
  transmission?: TransmissionSnapshot;
  drivetrainVibrationIntensity?: number;
  triggerDiagnostics?: Readonly<GamepadThrottleDiagnostics>;
  throttleCommand?: number;
  feedback?: Readonly<VehicleFeedbackState>;
  forces?: VehicleSnapshot['forces'];
  wheels?: VehicleSnapshot['wheels'];
  differential?: VehicleSnapshot['differential'];
  driverAssists?: VehicleSnapshot['driverAssists'];
  drivetrainLash?: VehicleSnapshot['drivetrainLash'];
  revHang?: VehicleSnapshot['revHang'];
  turbo?: EngineTurboSnapshot;
}

export class Hud {
  readonly rightMirrorViewport: HTMLElement;
  readonly settings: ControlSettingsPanel;
  private readonly speedValue: HTMLElement;
  private readonly gearValue: HTMLElement;
  private readonly rpmNeedle: HTMLElement;
  private readonly rpmValue: HTMLElement;
  private readonly rpmStrip: HTMLElement;
  private readonly cruiseStatus: HTMLElement;
  private readonly driveReadout: HTMLElement;
  private readonly inputStatus: HTMLElement;
  private readonly clutchMeter: HTMLElement;
  private readonly clutchValue: HTMLElement;
  private readonly clutchModeLabel: HTMLElement;
  private readonly debugPanel: HTMLElement;
  private readonly transmissionDebug: HTMLElement;
  private readonly feedbackDebug: HTMLElement;
  private readonly throttleDebug: HTMLElement;
  private readonly mechanicalDebug: HTMLElement;
  private automaticTransmission = false;
  private readonly debugValues: {
    speed: HTMLElement;
    rpm: HTMLElement;
    gear: HTMLElement;
    throttle: HTMLElement;
    brake: HTMLElement;
    clutch: HTMLElement;
    steering: HTMLElement;
    slip: HTMLElement;
    lateralG: HTMLElement;
    rearGrip: HTMLElement;
    pedal: HTMLElement;
    handbrake: HTMLElement;
    mode: HTMLElement;
    input: HTMLElement;
    shiftTarget: HTMLElement;
  };
  private readonly startOverlay: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly mirrorSideBadge: HTMLElement;
  private readonly mirrorSideLabel: HTMLElement;
  private readonly activeMapLabel: HTMLElement;
  private readonly activeVehicleLabel: HTMLElement;
  private readonly startMapButtons: HTMLElement;
  private readonly startVehicleButtons: HTMLElement;
  private mapOptions: readonly DrivingMapOption[] = [];
  private vehicleOptions: readonly DrivingVehicleOption[] = [];
  private toastTimer = 0;
  private debugVisible = false;
  private started = false;

  constructor(private readonly host: HTMLElement) {
    host.innerHTML = `
      <div class="game-ui" aria-label="驾驶界面">
        <div class="brand-chip"><span class="brand-mark"></span><span>DRIVER LAB</span><em>V0.2</em></div>
        <div class="map-chip"><small>当前组合</small><strong data-active-map-label>综合公路练习场</strong><i>·</i><strong data-active-vehicle-label>家用轿车</strong></div>
        <section class="mirror-pod" aria-label="右侧后视镜画面">
          <div class="mirror-label"><span data-mirror-side-badge>R</span><b data-mirror-side-label>RIGHT MIRROR</b><i>LIVE</i></div>
          <div class="mirror-viewport" data-mirror-viewport></div>
          <div class="mirror-glare"></div>
        </section>
        <section class="drive-readout" data-drive-readout aria-label="行驶信息">
          <div class="gear-readout" data-gear>N</div>
          <div class="speed-readout"><strong data-speed>0</strong><span>km/h</span></div>
          <div class="rpm-meta"><span data-rpm-value>0.8</span><small>×1000 RPM</small><em data-cruise-status hidden>CRUISE</em></div>
          <div class="rpm-strip" data-rpm-strip><i data-rpm-needle></i></div>
        </section>
        <section
          class="clutch-meter"
          data-clutch-meter
          role="meter"
          aria-label="离合踏板幅度"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="0"
        >
          <header>
            <span><i></i>离合踏板 <small data-clutch-mode-label>自动</small></span>
            <strong data-clutch-value>0%</strong>
          </header>
          <div class="clutch-track" aria-hidden="true">
            <i class="clutch-fill"></i>
            <span class="clutch-bite-zone"><em>半联动参考</em></span>
            <b class="clutch-position"></b>
          </div>
          <footer><span>结合 · 0</span><span>100 · 踩下</span></footer>
        </section>
        <section class="debug-panel" data-debug hidden>
          <header><span>VEHICLE TELEMETRY</span><kbd>F2</kbd></header>
          <dl>
            <div><dt>SPEED</dt><dd data-debug-speed>0.0 km/h</dd></div>
            <div><dt>ENGINE</dt><dd data-debug-rpm>850 rpm</dd></div>
            <div><dt>SHIFT TARGET</dt><dd data-debug-shift-target>—</dd></div>
            <div><dt>GEAR</dt><dd data-debug-gear>N</dd></div>
            <div><dt>THROTTLE</dt><dd data-debug-throttle>0%</dd></div>
            <div><dt>BRAKE</dt><dd data-debug-brake>0%</dd></div>
            <div><dt>CLUTCH ENG.</dt><dd data-debug-clutch>0%</dd></div>
            <div><dt>CLUTCH PEDAL</dt><dd data-debug-pedal>0%</dd></div>
            <div><dt>HANDBRAKE</dt><dd data-debug-handbrake>0%</dd></div>
            <div><dt>STEERING</dt><dd data-debug-steering>0.0°</dd></div>
            <div><dt>BODY SLIP</dt><dd data-debug-slip>0.0°</dd></div>
            <div><dt>LATERAL</dt><dd data-debug-lateral-g>0.00 g</dd></div>
            <div><dt>REAR GRIP</dt><dd data-debug-rear-grip>100%</dd></div>
            <div><dt>CONTROL</dt><dd data-debug-mode>AUTO CLUTCH</dd></div>
            <div><dt>INPUT</dt><dd data-debug-input>KEYBOARD</dd></div>
            <div class="transmission-debug"><dt>TRANSMISSION</dt><dd data-debug-transmission>MANUAL</dd></div>
            <div class="transmission-debug"><dt>TRIGGER / THROTTLE</dt><dd data-debug-throttle-chain>—</dd></div>
            <div class="transmission-debug"><dt>MECHANICAL FEEDBACK</dt><dd data-debug-feedback>0%</dd></div>
            <div class="transmission-debug"><dt>MECHANICS / TURBO</dt><dd data-debug-mechanical>—</dd></div>
          </dl>
        </section>
        <div class="input-status" data-input-status><i></i><span>键盘 · 自动离合</span></div>
        <div class="control-ribbon" aria-label="键位提示">
          <span><kbd data-key-action="throttle">W</kbd> 油门</span><span><kbd data-key-action="brake">S</kbd> 制动</span>
          <span><kbd data-key-action="steerLeft">A</kbd><kbd data-key-action="steerRight">D</kbd> 转向</span>
          <span><kbd data-key-action="shiftDown">Q</kbd><kbd data-key-action="shiftUp">E</kbd> 换挡</span>
          <span><kbd data-key-action="handbrake">空格</kbd> 手刹开关</span><span><kbd data-key-action="cycleLights">L</kbd> 灯光</span>
          <span><kbd>F2</kbd> 数据</span><span><kbd>F3</kbd> 设置</span><span><kbd>F4</kbd> 场地</span><span><kbd>F5</kbd> 车辆</span>
          <span><kbd data-key-action="toggleClutchMode">M</kbd> 离合模式</span><span><kbd>鼠标</kbd> 观察</span>
        </div>
        <div class="toast" data-toast role="status"></div>
        <section class="start-overlay" data-start-overlay>
          <div class="start-card">
            <div class="eyebrow">DRIVING SYSTEM · V0.2</div>
            <h1>坐进驾驶位。</h1>
            <p>这不是一台会平移的盒子。发动机、离合器、变速箱、制动和转向都在独立工作。</p>
            <section class="start-map-selection" aria-label="选择训练场地">
              <header><span>选择场地</span><small>进入后仍可在 F3 设置中切换</small></header>
              <div data-start-map-buttons></div>
            </section>
            <section class="start-map-selection" aria-label="选择训练车辆">
              <header><span>选择车辆</span><small>F5 可随时切换，手柄不占键</small></header>
              <div data-start-vehicle-buttons></div>
            </section>
            <div class="start-grid">
              <div><small>起步</small><strong>MT 按 <kbd data-key-action="gear1">1</kbd>；AT / DCT 按 RB 选到 D，或在 F3 选 D</strong></div>
              <div><small>换挡</small><strong><kbd data-key-action="shiftUp">E</kbd> 升挡 · <kbd data-key-action="shiftDown">Q</kbd> 降挡</strong></div>
              <div><small>观察 / 调试</small><strong>拖动鼠标转头 · <kbd>C</kbd> 回正 · <kbd>F6</kbd> 接触调试</strong></div>
              <div><small>标准手柄</small><strong>LS 转向 · LT/RT 踏板 · LB/RB：MT 换挡、自动挡 PRND 选挡 · A 手刹 · 跑车 X 巡航</strong></div>
              <div><small>灯光与点火</small><strong>十字键 ←/→ 转向灯 · ↑ 大灯 · ↓ 双闪 · Start 点火/熄火</strong></div>
              <div><small>手动离合 / 附件</small><strong>键盘 M 切换离合模式 · Y 雾灯 · 按住 L3 闪灯 · R3 喇叭</strong></div>
            </div>
            <button type="button" data-start>进入练习场 <span>→</span></button>
            <small class="start-note">右上角画面来自右侧实体镜的同一反射纹理</small>
          </div>
        </section>
        <div class="reticle" aria-hidden="true"><i></i></div>
      </div>`;

    this.rightMirrorViewport = this.require('[data-mirror-viewport]');
    this.speedValue = this.require('[data-speed]');
    this.gearValue = this.require('[data-gear]');
    this.rpmNeedle = this.require('[data-rpm-needle]');
    this.rpmValue = this.require('[data-rpm-value]');
    this.rpmStrip = this.require('[data-rpm-strip]');
    this.cruiseStatus = this.require('[data-cruise-status]');
    this.driveReadout = this.require('[data-drive-readout]');
    this.inputStatus = this.require('[data-input-status]');
    this.clutchMeter = this.require('[data-clutch-meter]');
    this.clutchValue = this.require('[data-clutch-value]');
    this.clutchModeLabel = this.require('[data-clutch-mode-label]');
    this.debugPanel = this.require('[data-debug]');
    this.transmissionDebug = this.require('[data-debug-transmission]');
    this.feedbackDebug = this.require('[data-debug-feedback]');
    this.throttleDebug = this.require('[data-debug-throttle-chain]');
    this.mechanicalDebug = this.require('[data-debug-mechanical]');
    this.startOverlay = this.require('[data-start-overlay]');
    this.toast = this.require('[data-toast]');
    this.mirrorSideBadge = this.require('[data-mirror-side-badge]');
    this.mirrorSideLabel = this.require('[data-mirror-side-label]');
    this.activeMapLabel = this.require('[data-active-map-label]');
    this.activeVehicleLabel = this.require('[data-active-vehicle-label]');
    this.startMapButtons = this.require('[data-start-map-buttons]');
    this.startVehicleButtons = this.require('[data-start-vehicle-buttons]');
    this.debugValues = {
      speed: this.require('[data-debug-speed]'),
      rpm: this.require('[data-debug-rpm]'),
      gear: this.require('[data-debug-gear]'),
      throttle: this.require('[data-debug-throttle]'),
      brake: this.require('[data-debug-brake]'),
      clutch: this.require('[data-debug-clutch]'),
      steering: this.require('[data-debug-steering]'),
      slip: this.require('[data-debug-slip]'),
      lateralG: this.require('[data-debug-lateral-g]'),
      rearGrip: this.require('[data-debug-rear-grip]'),
      pedal: this.require('[data-debug-pedal]'),
      handbrake: this.require('[data-debug-handbrake]'),
      mode: this.require('[data-debug-mode]'),
      input: this.require('[data-debug-input]'),
      shiftTarget: this.require('[data-debug-shift-target]'),
    };

    this.settings = new ControlSettingsPanel(host);
    this.settings.onMapChange = (mapId) => this.onMapChange?.(mapId);
    this.settings.onVehicleChange = (vehicleId) => this.onVehicleChange?.(vehicleId);

    this.require<HTMLButtonElement>('[data-start]').addEventListener('click', () => this.start());
    window.addEventListener('keydown', this.onKeyDown);
  }

  onStart?: () => void;
  onMapChange?: (mapId: string) => void;
  onVehicleChange?: (vehicleId: string) => void;

  setMapOptions(options: readonly DrivingMapOption[], activeMapId: string): void {
    this.mapOptions = [...options];
    this.settings.setMapOptions(options, activeMapId);
    this.startMapButtons.replaceChildren();
    for (const option of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.mapId = option.id;
      const title = document.createElement('strong');
      title.textContent = option.label;
      const description = document.createElement('small');
      description.textContent = option.description;
      button.append(title, description);
      button.addEventListener('click', () => this.onMapChange?.(option.id));
      this.startMapButtons.append(button);
    }
    this.setActiveMap(activeMapId);
  }

  setActiveMap(mapId: string): void {
    const option = this.mapOptions.find((candidate) => candidate.id === mapId);
    this.activeMapLabel.textContent = option?.label ?? mapId;
    this.settings.setActiveMap(mapId);
    this.startMapButtons.querySelectorAll<HTMLButtonElement>('[data-map-id]').forEach((button) => {
      button.classList.toggle('active', button.dataset.mapId === mapId);
    });
  }

  setVehicleOptions(
    options: readonly DrivingVehicleOption[],
    activeVehicleId: string,
  ): void {
    this.vehicleOptions = [...options];
    this.settings.setVehicleOptions(options, activeVehicleId);
    this.startVehicleButtons.replaceChildren();
    for (const option of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.vehicleId = option.id;
      const title = document.createElement('strong');
      title.textContent = option.label;
      const description = document.createElement('small');
      description.textContent = option.description;
      button.append(title, description);
      button.addEventListener('click', () => this.onVehicleChange?.(option.id));
      this.startVehicleButtons.append(button);
    }
    this.setActiveVehicle(activeVehicleId);
  }

  setActiveVehicle(vehicleId: string): void {
    const option = this.vehicleOptions.find((candidate) => candidate.id === vehicleId);
    this.activeVehicleLabel.textContent = option?.label ?? vehicleId;
    this.settings.setActiveVehicle(vehicleId);
    this.startVehicleButtons
      .querySelectorAll<HTMLButtonElement>('[data-vehicle-id]')
      .forEach((button) => {
        button.classList.toggle('active', button.dataset.vehicleId === vehicleId);
      });
  }

  update(data: HudTelemetry, dt: number): void {
    const speedKmh = Math.abs(data.speed) * 3.6;
    const transmission = data.transmission;
    this.automaticTransmission = transmission !== undefined && transmission.type !== 'MANUAL';
    const gearLabel = this.automaticTransmission && transmission
      ? transmission.selectedMode === 'D' && transmission.type !== 'CVT' ? `D${transmission.currentPhysicalGear}` : String(transmission.selectedMode)
      : String(data.gear);
    this.speedValue.textContent = Math.round(speedKmh).toString().padStart(2, '0');
    this.gearValue.textContent = gearLabel;
    const redlineRPM = data.redlineRPM ?? 6_100;
    const recommendedUpshiftRPM = data.recommendedUpshiftRPM ?? data.shiftWarningRPM ?? 2_200;
    const redlineWarningRPM = data.redlineWarningRPM ?? redlineRPM - 450;
    const rpmFraction = Math.min(1, Math.max(0, data.rpm / Math.max(1, redlineRPM)));
    const recommendationAvailable = data.upshiftRecommendationAvailable ??
      (typeof data.gear === 'number' && data.gear >= 1 && data.gear < 5);
    const critical = data.nearRedline ?? data.rpm >= redlineWarningRPM;
    this.rpmNeedle.style.setProperty('--rpm', rpmFraction.toFixed(3));
    this.rpmStrip.style.setProperty(
      '--redline-warning',
      `${(Math.min(1, Math.max(0, redlineWarningRPM / Math.max(1, redlineRPM))) * 100).toFixed(1)}%`,
    );
    this.rpmValue.textContent = (data.rpm / 1_000).toFixed(1);
    this.rpmStrip.classList.toggle('critical', critical);
    const cruiseAvailable = data.cruiseAvailable === true;
    const cruiseActive = data.cruiseActive === true;
    this.cruiseStatus.hidden = !cruiseAvailable;
    this.cruiseStatus.classList.toggle('active', cruiseActive);
    this.cruiseStatus.textContent = cruiseActive
      ? `巡航 ${Math.round(data.cruiseTargetSpeedKmh ?? speedKmh)}`
      : 'X · CRUISE';
    this.debugValues.speed.textContent = `${speedKmh.toFixed(1)} km/h`;
    this.debugValues.rpm.textContent = `${Math.round(data.rpm)} rpm`;
    this.debugValues.shiftTarget.textContent = recommendationAvailable
      ? `${Math.round(recommendedUpshiftRPM)} rpm`
      : '—';
    this.debugValues.gear.textContent = gearLabel;
    this.clutchMeter.hidden = this.automaticTransmission;
    // Developer diagnostics stay inside the initially hidden F2 panel.
    if (this.debugVisible) {
      const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;
      const trigger = data.triggerDiagnostics;
      this.throttleDebug.textContent = [
        `RT RAW ${trigger ? percent(trigger.rtRaw) : '—'}`,
        `RT NORMALIZED ${trigger ? percent(trigger.rtNormalized) : '—'}`,
        `RT COMMAND ${trigger ? percent(trigger.throttleCommand) : '—'}`,
        `THROTTLE COMMAND ${percent(data.throttleCommand ?? data.throttle)}`,
        `ACTUAL ENGINE THROTTLE ${percent(data.throttle)}`,
      ].join('\n');
      const feedback = data.feedback;
      const factors = feedback?.factors;
      this.feedbackDebug.textContent = [
        `CLUTCH ENGAGEMENT ${percent(data.clutchEngagement)}`,
        `CLUTCH SLIP ${((data.forces?.clutchSlipAngularVelocity ?? 0) * 60 / (2 * Math.PI)).toFixed(0)} rpm`,
        `CLUTCH LOAD ${(data.forces?.clutchTorque ?? transmission?.engineLoadTorque ?? 0).toFixed(1)} Nm`,
        ...(factors ? [
          `PARTIAL ${percent(factors.partialClutchFactor)} · SLIP ${percent(factors.slipFactor)}`,
          `LOAD ${percent(factors.clutchLoadFactor)} · LOW RPM ${percent(factors.lowRPMFactor)}`,
          `NEAR STALL FACTOR ${percent(factors.nearStallFactor)}`,
        ] : []),
        `JUDDER ${percent(feedback?.clutchJudderIntensity ?? 0)} · NEAR STALL ${percent(feedback?.nearStallVibrationIntensity ?? 0)}`,
        `SHARED VIBRATION ${percent(data.drivetrainVibrationIntensity ?? 0)} · JOLT ${percent(feedback?.drivetrainJoltIntensity ?? 0)}`,
        `HAPTIC WEAK ${percent(feedback?.continuousRumble.weak ?? 0)} · STRONG ${percent(feedback?.continuousRumble.strong ?? 0)}`,
      ].join('\n');
      const lash = data.drivetrainLash;
      const hang = data.revHang;
      const wheels = data.wheels;
      const differential = data.differential;
      const aids = data.driverAssists;
      const turbo = data.turbo?.enabled ? data.turbo : undefined;
      this.mechanicalDebug.textContent = [
        ...(aids ? [`ABS ${aids.absEnabled ? aids.absActive ? 'ACTIVE' : 'ON' : 'OFF'} · EBD ${aids.ebdEnabled ? 'ON' : 'OFF'} ${Math.round(aids.frontBrakeBias * 100)}% FRONT · TCS ${aids.tractionControlEnabled ? aids.tcsActive ? 'ACTIVE' : 'ON' : 'OFF'} · TORQUE ${percent(aids.engineTorqueFactor)}`] : []),
        ...(turbo ? [
          `TURBO ${percent(turbo.turboSpeed)} · BOOST ${turbo.boostPressureBar.toFixed(2)} bar · MANIFOLD ${turbo.manifoldPressureBar.toFixed(2)} bar abs`,
          `WASTEGATE ${percent(turbo.wastegateOpening)} · BASE ${turbo.baseTorquePotential.toFixed(1)} Nm · AIR LIMITED ${turbo.availableTorque.toFixed(1)} Nm`,
        ] : []),
        ...(lash ? [`LASH ${lash.state.toFixed(2)} → ${lash.target} · TORQUE FACTOR ${lash.effectiveTorqueFactor.toFixed(2)}`] : []),
        ...(hang ? [`REV HANG ${hang.active ? 'ACTIVE' : 'OFF'} · ${hang.residualTorque.toFixed(1)} Nm · ${percent(hang.factor)}`] : []),
        ...(wheels ? [
          `DRIVE FL ${wheels.frontLeft.driveTorque.toFixed(1)} · FR ${wheels.frontRight.driveTorque.toFixed(1)} Nm`,
          `DRIVE RL ${wheels.rearLeft.driveTorque.toFixed(1)} · RR ${wheels.rearRight.driveTorque.toFixed(1)} Nm`,
          ...(['frontLeft', 'frontRight', 'rearLeft', 'rearRight'] as const).map((id, index) => {
            const w = wheels[id];
            return `${['FL', 'FR', 'RL', 'RR'][index]} SLIP ${w.slipRatio.toFixed(3)} · α ${(w.slipAngle * 180 / Math.PI).toFixed(1)}° · ω ${w.angularVelocity.toFixed(1)} rad/s\n` +
              `   Fx ${w.longitudinalForce.toFixed(0)} · Fy ${w.lateralForce.toFixed(0)} · Fz ${w.normalLoad.toFixed(0)} N · GRIP ${percent(w.gripUsage)}`;
          }),
        ] : []),
        ...(differential ? [
          `OPEN DIFF ${differential.axle.toUpperCase()} · CARRIER ${differential.carrierAngularVelocity.toFixed(1)} rad/s`,
          `L / R ${differential.leftAngularVelocity.toFixed(1)} / ${differential.rightAngularVelocity.toFixed(1)} rad/s · TORQUE ${differential.leftTorque.toFixed(1)} / ${differential.rightTorque.toFixed(1)} Nm`,
        ] : []),
      ].join('\n') || '—';
    }
    if (transmission) {
      const tc = transmission.torqueConverter;
      const dct = transmission.dct;
      this.transmissionDebug.textContent = [
        transmission.type,
        `SELECTOR ${transmission.selectedMode ?? '—'} · GEAR ${transmission.currentPhysicalGear ?? 'CONTINUOUS'}`,
        ...(transmission.cvt ? [`RATIO ${transmission.cvt.ratio.toFixed(3)} → ${transmission.cvt.targetRatio.toFixed(3)} · TARGET ${Math.round(transmission.cvt.targetRPM)} rpm`] : []),
        `${transmission.shiftState} · LOAD ${transmission.engineLoadTorque.toFixed(1)} Nm`,
        ...(tc ? [`SLIP ${Math.round(tc.slipRPM)} rpm · RATIO ${tc.torqueRatio.toFixed(2)} · LOCK ${Math.round(tc.lockupEngagement * 100)}%`] : []),
        ...(dct ? [`A ${Math.round(dct.clutchAEngagement * 100)}% · B ${Math.round(dct.clutchBEngagement * 100)}%`, `SHAFT ${dct.activeShaft ?? '—'} · PRESELECT ${dct.preselectedGear ?? '—'}`] : []),
        ...(transmission.selectorRejectedReason ? [`BLOCKED · ${transmission.selectorRejectedReason}`] : []),
      ].join('\n');
    } else this.transmissionDebug.textContent = 'MANUAL';
    this.debugValues.throttle.textContent = `${Math.round(data.throttle * 100)}%`;
    this.debugValues.brake.textContent = `${Math.round(data.brake * 100)}%`;
    this.debugValues.clutch.textContent = `${Math.round(data.clutchEngagement * 100)}%`;
    this.debugValues.pedal.textContent = `${Math.round((data.clutchPedal ?? 1 - data.clutchEngagement) * 100)}%`;
    this.debugValues.handbrake.textContent = `${Math.round((data.handbrake ?? 0) * 100)}%`;
    this.debugValues.steering.textContent = `${(data.steeringAngle * 180 / Math.PI).toFixed(1)}°`;
    this.debugValues.slip.textContent = `${((data.bodySlipAngle ?? 0) * 180 / Math.PI).toFixed(1)}°`;
    this.debugValues.lateralG.textContent = `${((data.lateralAcceleration ?? 0) / 9.81).toFixed(2)} g`;
    this.debugValues.rearGrip.textContent = `${Math.round((data.rearLateralGripFactor ?? 1) * 100)}%`;
    this.debugValues.mode.textContent = this.automaticTransmission ? 'AUTOMATIC' : data.controlMode === 'manual-clutch' ? 'MANUAL CLUTCH' : 'AUTO CLUTCH';
    this.debugValues.input.textContent = (data.inputSource ?? 'keyboard').toUpperCase();

    const clutchPedal = Math.min(1, Math.max(0, data.clutchPedal ?? 1 - data.clutchEngagement));
    const manualClutch = data.controlMode === 'manual-clutch';
    const clutchPercent = Math.round(clutchPedal * 100);
    this.clutchMeter.style.setProperty('--clutch-pedal', `${(clutchPedal * 100).toFixed(1)}%`);
    this.clutchMeter.setAttribute('aria-valuenow', String(clutchPercent));
    this.clutchMeter.setAttribute(
      'aria-valuetext',
      `${manualClutch ? '手动' : '自动'}离合，踏板${clutchPercent}%`,
    );
    this.clutchMeter.classList.toggle('manual', manualClutch);
    this.clutchValue.textContent = `${clutchPercent}%`;
    this.clutchModeLabel.textContent = manualClutch ? '手动' : '自动';

    const sourceLabel = data.inputSource === 'gamepad' ? '手柄' : data.inputSource === 'wheel' ? '方向盘' : '键盘';
    const modeLabel = this.automaticTransmission ? (transmission?.type === 'DCT' ? '双离合自动挡' : transmission?.type === 'CVT' ? '无级变速 CVT' : '液力自动挡') : data.controlMode === 'manual-clutch' ? '手动离合' : '自动离合';
    this.inputStatus.querySelector('span')!.textContent = `${sourceLabel} · ${modeLabel}`;
    this.inputStatus.classList.toggle('manual', data.controlMode === 'manual-clutch');

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('visible');
    }
  }

  showMessage(message: string, duration = 2): void {
    this.toast.textContent = message;
    this.toast.classList.add('visible');
    this.toastTimer = duration;
  }

  getMirrorRect(): DOMRect {
    return this.rightMirrorViewport.getBoundingClientRect();
  }

  setMirrorPreviewSide(side: 'left' | 'right'): void {
    const left = side === 'left';
    this.mirrorSideBadge.textContent = left ? 'L' : 'R';
    this.mirrorSideLabel.textContent = left ? 'LEFT MIRROR' : 'RIGHT MIRROR';
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.settings.dispose();
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    this.startOverlay.classList.add('leaving');
    window.setTimeout(() => this.startOverlay.remove(), 550);
    this.onStart?.();
    this.showMessage(this.automaticTransmission ? '踩住制动，在 F3 设置中选 D，再松刹车起步' : '按 1 挂入一挡，然后平稳给油', 4);
  }

  /** Allows optional engine diagnostics to allocate only while F2 is open. */
  public get isDebugOpen(): boolean { return this.debugVisible; }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'F2') {
      event.preventDefault();
      this.debugVisible = !this.debugVisible;
      this.debugPanel.hidden = !this.debugVisible;
      this.driveReadout.classList.toggle('debug-open', this.debugVisible);
      this.clutchMeter.classList.toggle('debug-open', this.debugVisible);
    }
    if (!this.started && (event.code === 'Enter' || event.code === 'Space')) {
      event.preventDefault();
      this.start();
    }
  };

  private require<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.host.querySelector<T>(selector);
    if (!element) throw new Error(`HUD element not found: ${selector}`);
    return element;
  }
}

// Keeps the type import live in generated declarations and documents the data
// source expected by the WebGL overlay without coupling HUD DOM to Three.js.
export type MirrorTexture = Texture;
