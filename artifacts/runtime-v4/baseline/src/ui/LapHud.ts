import { formatLapTime, type LapTimerState } from '../game/lap/LapTimer';

export class LapHud {
  private readonly root = document.createElement('section');
  private readonly lap: HTMLElement;
  private readonly current: HTMLElement;
  private readonly last: HTMLElement;
  private readonly best: HTMLElement;
  private readonly status: HTMLElement;
  private readonly feedback: HTMLElement;

  public constructor(host: HTMLElement) {
    this.root.className = 'lap-hud';
    this.root.hidden = true;
    this.root.setAttribute('aria-label', '赛道圈时');
    this.root.innerHTML = `<header><span>LAP <b data-lap>—</b></span><small data-status>WAITING FOR START</small></header>
      <dl><div><dt>CURRENT</dt><dd data-current>00:00.000</dd></div>
      <div><dt>LAST</dt><dd data-last>--:--.---</dd></div>
      <div><dt>BEST</dt><dd data-best>--:--.---</dd></div></dl>
      <div class="lap-feedback" data-feedback role="status"></div>`;
    this.lap = this.root.querySelector('[data-lap]')!;
    this.current = this.root.querySelector('[data-current]')!;
    this.last = this.root.querySelector('[data-last]')!;
    this.best = this.root.querySelector('[data-best]')!;
    this.status = this.root.querySelector('[data-status]')!;
    this.feedback = this.root.querySelector('[data-feedback]')!;
    host.append(this.root);
  }

  public update(state: Readonly<LapTimerState> | null): void {
    this.root.hidden = state === null;
    if (!state) return;
    this.lap.textContent = state.phase === 'RUNNING' ? String(state.lap) : '—';
    this.current.textContent = formatLapTime(state.currentMs);
    this.last.textContent = formatLapTime(state.lastMs);
    this.best.textContent = formatLapTime(state.bestMs);
    this.status.textContent = state.phase === 'WAITING_FOR_START' ? 'WAITING FOR START' : '';
    const feedback = state.feedback;
    this.feedback.style.opacity = String(Math.min(1, state.feedbackSeconds));
    this.feedback.classList.toggle('new-best', feedback?.newBest ?? false);
    if (feedback) {
      const delta = feedback.deltaMs === null ? '' :
        ` · ${feedback.deltaMs < 0 ? '-' : '+'}${(Math.abs(feedback.deltaMs) / 1_000).toFixed(3)}`;
      this.feedback.textContent = `${formatLapTime(feedback.lapMs)}${feedback.newBest ? ' · NEW BEST' : ''}${delta}`;
    } else this.feedback.textContent = '';
  }
}
