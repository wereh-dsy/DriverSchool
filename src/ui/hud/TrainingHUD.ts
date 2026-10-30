import type { DrivingHUDState } from '../state/GameUIState';
export class TrainingHUD {
  private readonly root = document.createElement('section');
  private readonly limit = document.createElement('span');
  private readonly values: HTMLElement[];
  private readonly bars: HTMLElement[];
  private readonly aids: HTMLElement[];
  private elapsed = 0;
  constructor(host: HTMLElement) {
    this.root.className = 'ds-training-hud'; this.root.setAttribute('aria-label', '驾驶辅助实时状态');
    this.root.innerHTML = ['THR','BRK','CLT','STR'].map((label,i)=>`<div class="ds-input"><span>${label}</span><i class="ds-input-track"><i></i></i><b aria-label="${['油门','制动','离合','转向'][i]}"></b></div>`).join('')+
      '<p class="ds-aids"><span>ABS</span><span>TCS</span><span>ESC</span></p>';
    this.values = [...this.root.querySelectorAll<HTMLElement>('b')];
    this.bars = [...this.root.querySelectorAll<HTMLElement>('.ds-input-track > i')];
    this.aids = [...this.root.querySelectorAll<HTMLElement>('.ds-aids > span')];
    this.limit.className = 'ds-speed-limit'; this.limit.setAttribute('aria-label', '当前道路限速'); this.limit.hidden = true;
    host.append(this.root, this.limit);
  }
  update(state: DrivingHUDState, dt: number): void {
    this.elapsed += dt; if (this.elapsed < .1) return; this.elapsed = 0;
    const text = [ `${Math.round(state.throttle * 100)}%`, `${Math.round(state.brake * 100)}%`,
      state.clutch === null ? '—' : `${Math.round(state.clutch * 100)}%`, `${Math.round(state.steering * 100)}%` ];
    text.forEach((value, i) => { if (this.values[i]!.textContent !== value) this.values[i]!.textContent = value; });
    [state.throttle,state.brake,state.clutch??0,Math.abs(state.steering)].forEach((value,i)=>this.bars[i]!.style.setProperty('--input',String(Math.max(0,Math.min(1,value)))));
    [state.abs,state.tcs,state.esc].forEach((active,i)=>{
      this.aids[i]!.classList.toggle('active',active);this.aids[i]!.setAttribute('aria-label',`${['ABS','TCS','ESC'][i]} ${active?'介入':'未介入'}`);
    });
    this.limit.hidden = state.speedLimit === null;
    this.limit.textContent = state.speedLimit === null ? '' : String(state.speedLimit);
  }
}
