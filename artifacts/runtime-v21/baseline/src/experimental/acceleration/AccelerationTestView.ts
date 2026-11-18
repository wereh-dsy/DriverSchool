import './AccelerationTestView.css';
import type { AccelerationMeasurement, AccelerationTarget, AccelerationTestState } from './AccelerationTest';

const time = (measurement: AccelerationMeasurement | null): string => measurement ? `${measurement.elapsedSeconds.toFixed(3)} s` : '—';
const usage = (measurement: AccelerationMeasurement, kind: 'ICE' | 'EV'): string => {
  if (kind === 'ICE') return measurement.fuelUsedL === null ? '用油 —' : `用油 ${(measurement.fuelUsedL * 1_000).toFixed(2)} mL`;
  const used = measurement.energyUsedKWh, recovered = measurement.energyRecoveredKWh;
  return used === null || recovered === null ? '净用电 —' : `净用电 ${((used - recovered) * 1_000).toFixed(2)} Wh`;
};
const peak = (measurement: AccelerationMeasurement): string =>
  `${measurement.peakAcceleration.toFixed(2)} m/s² · ${(measurement.peakAcceleration / 9.81).toFixed(2)} g`;

/** Standalone optional readout; owns its DOM and does not extend vehicle/HUD telemetry. */
export class AccelerationTestView {
  public onArm?: () => void;
  public onStop?: () => void;
  public onExport?: () => string | null;
  public onTargetChange?: (target: AccelerationTarget) => void;
  private readonly root = document.createElement('section');
  private readonly status: HTMLElement;
  private readonly context: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly hundred: HTMLElement;
  private readonly twoHundred: HTMLElement;
  private readonly hundredDetails: HTMLElement;
  private readonly twoHundredDetails: HTMLElement;
  private readonly energy: HTMLElement;
  private readonly energyDetails: HTMLElement;
  private readonly acceleration: HTMLElement;
  private readonly armButton: HTMLButtonElement;
  private readonly stopButton: HTMLButtonElement;
  private readonly exportButton: HTMLButtonElement;
  private readonly targetButtons: HTMLButtonElement[];
  private elapsed = Infinity;
  private phase: AccelerationTestState['phase'] | null = null;
  private notice = '';

  public constructor(host: HTMLElement) {
    this.root.className = 'acceleration-test'; this.root.hidden = true;
    this.root.setAttribute('aria-label', '加速测试');
    this.root.innerHTML = `<header><strong>加速测试</strong><span data-test-timer>0.000 s</span></header>
      <p class="acceleration-test-context" data-test-context></p>
      <div class="acceleration-test-controls"><button type="button" data-target="100">0–100</button><button type="button" data-target="200">0–200</button>
      <button type="button" data-test-arm>待测 / 重测</button><button type="button" data-test-stop>结束</button><button type="button" data-test-export>导出诊断</button></div>
      <p class="acceleration-test-status" data-test-status role="status"></p>
      <dl><div><dt>0–100 km/h</dt><dd data-test-100>—</dd></div><small data-test-100-details></small>
      <div><dt>0–200 km/h</dt><dd data-test-200>—</dd></div><small data-test-200-details></small>
      <div><dt>本轮消耗</dt><dd data-test-energy>—</dd></div><small data-test-energy-details></small>
      <div><dt>峰值纵向加速度</dt><dd data-test-peak>—</dd></div></dl>`;
    this.status = this.root.querySelector('[data-test-status]')!;
    this.context = this.root.querySelector('[data-test-context]')!;
    this.timer = this.root.querySelector('[data-test-timer]')!;
    this.hundred = this.root.querySelector('[data-test-100]')!;
    this.twoHundred = this.root.querySelector('[data-test-200]')!;
    this.hundredDetails = this.root.querySelector('[data-test-100-details]')!;
    this.twoHundredDetails = this.root.querySelector('[data-test-200-details]')!;
    this.energy = this.root.querySelector('[data-test-energy]')!;
    this.energyDetails = this.root.querySelector('[data-test-energy-details]')!;
    this.acceleration = this.root.querySelector('[data-test-peak]')!;
    this.armButton = this.root.querySelector('[data-test-arm]')!;
    this.stopButton = this.root.querySelector('[data-test-stop]')!;
    this.exportButton = this.root.querySelector('[data-test-export]')!;
    this.targetButtons = Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-target]'));
    this.armButton.addEventListener('click', () => { this.onArm?.(); this.elapsed = Infinity; });
    this.stopButton.addEventListener('click', () => { this.onStop?.(); this.elapsed = Infinity; });
    for (const button of this.targetButtons) button.addEventListener('click', () => {
      this.onTargetChange?.(Number(button.dataset.target) as AccelerationTarget); this.elapsed = Infinity;
    });
    this.exportButton.addEventListener('click', () => {
      const json = this.onExport?.();
      if (!json) return;
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'drivergame-acceleration-diagnostic.json';
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    host.append(this.root);
  }

  public setContext(vehicleName: string, groundName: string): void {
    this.context.textContent = `${vehicleName} · ${groundName}`;
    this.context.title = this.context.textContent;
  }

  public update(dt: number, state: Readonly<AccelerationTestState>, active: boolean): void {
    this.root.hidden = !active;
    if (!active) return;
    this.elapsed += dt;
    if (this.elapsed < 0.1 && this.phase === state.phase && this.notice === state.notice) return;
    this.elapsed = 0; this.phase = state.phase; this.notice = state.notice;
    const running = state.phase === 'RUNNING';
    this.root.dataset.phase = state.phase;
    this.timer.textContent = time(state.current);
    this.status.textContent = state.notice || (state.phase === 'ARMED'
      ? state.waitingForRelease ? '先松开油门，再次踩下开始。' : '已待测 · 保持静止，下次踩油门开始。'
      : running ? `计时中 · 目标 ${state.target} km/h` : state.phase === 'COMPLETED' ? '测试完成 · 可停车后重测。' : '停车后点击待测。');
    this.hundred.textContent = time(state.to100);
    this.twoHundred.textContent = state.target === 100 ? '未开启' : time(state.to200);
    this.hundredDetails.textContent = state.to100 ? `${usage(state.to100, state.energyKind)} · 峰值 ${peak(state.to100)}` : '';
    this.twoHundredDetails.textContent = state.to200 ? `${usage(state.to200, state.energyKind)} · 峰值 ${peak(state.to200)}` : '';
    this.energy.textContent = usage(state.current, state.energyKind);
    const used = state.current.energyUsedKWh, recovered = state.current.energyRecoveredKWh;
    this.energyDetails.textContent = state.energyKind === 'EV' && used !== null && recovered !== null
      ? `放电 ${(used * 1_000).toFixed(2)} Wh · 回收 ${(recovered * 1_000).toFixed(2)} Wh` : '仅统计计时区间，待测不计入。';
    this.acceleration.textContent = peak(state.current);
    this.exportButton.disabled = running || state.current.elapsedSeconds === 0;
    this.armButton.disabled = running;
    this.stopButton.disabled = state.phase !== 'ARMED' && !running;
    for (const button of this.targetButtons) {
      button.disabled = running; button.setAttribute('aria-pressed', String(Number(button.dataset.target) === state.target));
    }
  }

  public dispose(): void { this.root.remove(); }
}
