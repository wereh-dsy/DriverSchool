import { clamp, damp } from './math';
import type { DriverAidConfig } from '../config';

/** Axle slip feedback. The integral learns usable torque instead of requiring
 * sustained excessive slip to hold a reduction. All state is local to an axle. */
export class TractionController {
  public factor = 1;
  private reserve = 1;
  private filteredError = 0;
  private active = false;
  public reset(): void { this.factor = this.reserve = 1; this.filteredError = 0; this.active = false; }
  public update(dt: number, error: number, enabled: boolean, tune?: DriverAidConfig['tcs']): number {
    if (!enabled) { this.reset(); return 1; }
    const h = Math.max(0, dt);
    this.filteredError = damp(this.filteredError, error, 40, h);
    // Small Schmitt window prevents repeated engagement at the useful-slip edge.
    if (this.filteredError > .012) this.active = true;
    if (this.filteredError < -.012 && this.factor > .995) this.active = false;
    const minimum = 1 - (tune?.maximumTorqueReduction ?? .95);
    if (this.active) {
      const e = this.filteredError;
      const deadband = .006;
      const correction = e > deadband ? e - deadband : e < -deadband ? e + deadband : 0;
      // Under-slip restores torque promptly, including after a clean upshift.
      const gain = correction > 0 ? (tune?.response ?? 7) * .4 : (tune?.recoveryResponse ?? 1.8) * 8;
      this.reserve = clamp(this.reserve - clamp(correction, -.3, .2) * gain * h, minimum, 1);
    } else this.reserve = 1;
    const target = this.active ? clamp(this.reserve - Math.max(0, this.filteredError) * .8, minimum, 1) : 1;
    const rate = target < this.factor ? (tune?.response ?? 7) * 2 : (tune?.recoveryResponse ?? 1.8) * 3;
    const smooth = damp(this.factor, target, rate, h);
    this.factor += clamp(smooth - this.factor, -6 * h, 2.5 * h);
    return this.factor;
  }
}
