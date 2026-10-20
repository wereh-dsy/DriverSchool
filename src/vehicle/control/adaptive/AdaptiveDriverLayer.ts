import { createNeutralDriverProfile, type DriverProfile } from './DriverProfile';
import { DriverProfileStore } from './DriverProfileStore';
import { DriverBehaviorMonitor, type DriverIntent, type ControlInterventions } from './DriverBehaviorMonitor';
import { AdaptiveCalibration } from './AdaptiveCalibration';
import type { VehicleControlState } from '../VehicleStateEstimator';
import { clamp } from '../../physics/math';

/** Shared by game vehicles; standalone dynamics use an in-memory baseline. */
export class AdaptiveDriverLayer {
  public enabled = false;
  public readonly calibration = new AdaptiveCalibration();
  public profile: DriverProfile;
  private readonly monitor = new DriverBehaviorMonitor();
  private dirty = false;
  private checkpoint = 0;
  private smoothedThrottle = 0;
  public constructor(private readonly store?: DriverProfileStore) {
    this.profile = store?.load() ?? createNeutralDriverProfile();
  }
  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled; this.monitor.reset();
    if (!enabled) this.persist();
  }
  public resetProfile(): void {
    this.profile = createNeutralDriverProfile(); this.monitor.reset();
    this.dirty = false; this.checkpoint = 0; this.store?.clear();
    // Keep enabled; applied parameters blend toward baseline in update().
  }
  public resetTransient(): void { this.monitor.reset(); this.smoothedThrottle = 0; }
  public update(dt: number, intent: DriverIntent, state: VehicleControlState,
    interventions: ControlInterventions, eligible: boolean): void {
    this.dirty = this.monitor.update(dt, this.profile, intent, state, interventions,
      this.enabled && eligible) || this.dirty;
    this.calibration.update(dt, this.enabled, this.profile);
    this.checkpoint += dt;
    if (this.checkpoint >= 10) { this.checkpoint = 0; this.persist(); }
  }
  public mapThrottle(dt: number, value: number): number {
    const mapped = clamp(value, 0, 1) ** this.calibration.throttleExponent;
    const tau = this.calibration.torqueSmoothingSeconds;
    // Never retain positive driver demand on lift-off.
    this.smoothedThrottle = mapped <= this.smoothedThrottle || tau < .0001 ? mapped
      : this.smoothedThrottle + (mapped - this.smoothedThrottle) * -Math.expm1(-dt / tau);
    return this.smoothedThrottle;
  }
  public mapBrake(value: number): number { return clamp(value, 0, 1) ** this.calibration.brakeExponent; }
  public persist(): void { if (this.dirty) { this.store?.save(this.profile); this.dirty = false; } }
}
