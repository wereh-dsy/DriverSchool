export type WiperMode = 'OFF' | 'AUTO' | 'INTERMITTENT' | 'LOW' | 'HIGH';
export type WiperEffectiveMode = Exclude<WiperMode, 'AUTO'>;
export const WIPER_MODES: readonly WiperMode[] = ['OFF', 'AUTO', 'INTERMITTENT', 'LOW', 'HIGH'];
export const WIPER_PARK_ANGLE = 0.10;
export const WIPER_SWEEP_ANGLE = 1.95;

/** AUTO maps the continuous rain value to the same four manual speeds. */
export function autoWiperMode(rainIntensity: number): WiperEffectiveMode {
  const rain = Number.isFinite(rainIntensity) ? Math.max(0, rainIntensity) : 0;
  return rain >= .72 ? 'HIGH' : rain >= .38 ? 'LOW' : rain >= .10 ? 'INTERMITTENT' : 'OFF';
}

/** Render-rate accessory animation. OFF finishes a stroke and parks safely. */
export class WiperController {
  /** Driver preference; AUTO keeps a live effective mode from rain intensity. */
  public mode: WiperMode = 'OFF';
  public effectiveMode: WiperEffectiveMode = 'OFF';
  public angle = WIPER_PARK_ANGLE;
  public previousAngle = WIPER_PARK_ANGLE;
  public sweeping = false;
  public sweepStarted = false;
  public sweptMin = WIPER_PARK_ANGLE;
  public sweptMax = WIPER_PARK_ANGLE;
  private phase = 0;
  private wait = 0;

  public cycle(): WiperMode {
    this.setMode(WIPER_MODES[(WIPER_MODES.indexOf(this.mode) + 1) % WIPER_MODES.length]!);
    return this.mode;
  }

  public setMode(mode: WiperMode): void {
    this.mode = mode;
    this.wait = 0;
    if (mode !== 'AUTO') this.effectiveMode = mode;
  }

  public update(dt: number, rainIntensity = 0): void {
    const previousEffective = this.effectiveMode;
    this.effectiveMode = this.mode === 'AUTO' ? autoWiperMode(rainIntensity) : this.mode;
    // A rain-driven AUTO step starts or pauses immediately instead of waiting
    // for the previous stroke interval.
    if (this.effectiveMode !== previousEffective && this.phase === 0) this.wait = 0;
    this.sweepStarted = false;
    this.previousAngle = this.angle;
    this.sweeping = this.phase > 0;
    this.wait = Math.max(0, this.wait - dt);
    if (this.phase === 0 && this.effectiveMode !== 'OFF' && this.wait === 0) {
      this.sweeping = true;
      this.sweepStarted = true;
    }
    if (!this.sweeping) return;
    const period = this.effectiveMode === 'HIGH' ? 0.65 : this.effectiveMode === 'INTERMITTENT' ? 1.45 : 1.25;
    const oldPhase = this.phase;
    this.phase = Math.min(1, this.phase + Math.max(0, dt) / period);
    this.angle = WIPER_PARK_ANGLE + WIPER_SWEEP_ANGLE * Math.sin(Math.PI * this.phase);
    this.sweptMin = Math.min(this.previousAngle, this.angle);
    this.sweptMax = oldPhase <= 0.5 && this.phase >= 0.5
      ? WIPER_PARK_ANGLE + WIPER_SWEEP_ANGLE : Math.max(this.previousAngle, this.angle);
    if (this.phase >= 1) {
      this.phase = 0;
      this.angle = WIPER_PARK_ANGLE;
      this.wait = this.effectiveMode === 'INTERMITTENT' ? 3.2 : 0;
    }
  }
}
