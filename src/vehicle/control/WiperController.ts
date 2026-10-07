export type WiperMode = 'OFF' | 'INTERMITTENT' | 'LOW' | 'HIGH';
export const WIPER_MODES: readonly WiperMode[] = ['OFF', 'INTERMITTENT', 'LOW', 'HIGH'];
export const WIPER_PARK_ANGLE = 0.10;
export const WIPER_SWEEP_ANGLE = 1.95;

/** Render-rate accessory animation. OFF finishes a stroke and parks safely. */
export class WiperController {
  public mode: WiperMode = 'OFF';
  public angle = WIPER_PARK_ANGLE;
  public previousAngle = WIPER_PARK_ANGLE;
  public sweeping = false;
  public sweptMin = WIPER_PARK_ANGLE;
  public sweptMax = WIPER_PARK_ANGLE;
  private phase = 0;
  private wait = 0;

  public cycle(): WiperMode {
    this.setMode(WIPER_MODES[(WIPER_MODES.indexOf(this.mode) + 1) % 4]!);
    return this.mode;
  }

  public setMode(mode: WiperMode): void {
    this.mode = mode;
    this.wait = 0;
  }

  public update(dt: number): void {
    this.previousAngle = this.angle;
    this.sweeping = this.phase > 0;
    this.wait = Math.max(0, this.wait - dt);
    if (this.phase === 0 && this.mode !== 'OFF' && this.wait === 0) this.sweeping = true;
    if (!this.sweeping) return;
    const period = this.mode === 'HIGH' ? 0.65 : 1.25;
    const oldPhase = this.phase;
    this.phase = Math.min(1, this.phase + Math.max(0, dt) / period);
    this.angle = WIPER_PARK_ANGLE + WIPER_SWEEP_ANGLE * Math.sin(Math.PI * this.phase);
    this.sweptMin = Math.min(this.previousAngle, this.angle);
    this.sweptMax = oldPhase <= 0.5 && this.phase >= 0.5
      ? WIPER_PARK_ANGLE + WIPER_SWEEP_ANGLE : Math.max(this.previousAngle, this.angle);
    if (this.phase >= 1) {
      this.phase = 0;
      this.angle = WIPER_PARK_ANGLE;
      this.wait = this.mode === 'INTERMITTENT' ? 3.2 : 0;
    }
  }
}
