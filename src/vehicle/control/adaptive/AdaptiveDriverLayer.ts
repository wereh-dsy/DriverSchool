import { createNeutralDriverProfile, type DriverProfile } from './DriverProfile';
import { DriverProfileStore } from './DriverProfileStore';
import { DriverBehaviorMonitor, type DriverIntent, type ControlInterventions } from './DriverBehaviorMonitor';
import { AdaptiveCalibration } from './AdaptiveCalibration';
import type { VehicleControlState } from '../VehicleStateEstimator';
import { clamp } from '../../physics/math';
import { BaseControlCalibration, type ControlCalibration } from '../BaseControlCalibration';
import { HardSafetyEnvelope } from '../VehicleControlCalibration';

/** One global enable preference, separate learned state for each stable catalog ID. */
export class AdaptiveDriverLayer {
  public enabled = false;
  public readonly calibration = new AdaptiveCalibration();
  public profile: DriverProfile;
  private readonly monitor = new DriverBehaviorMonitor();
  private dirty = false;
  private checkpoint = 0;
  private smoothedThrottle = 0;
  private readonly profiles = new Map<string, DriverProfile>();
  public constructor(private readonly store?: DriverProfileStore, public vehicleId = 'unregistered') {
    this.profile = store?.load(vehicleId) ?? createNeutralDriverProfile();
    this.profiles.set(vehicleId, this.profile);
  }
  public selectVehicle(vehicleId: string): void {
    if (vehicleId === this.vehicleId) return;
    this.persist();
    this.vehicleId = vehicleId;
    this.profile = this.profiles.get(vehicleId) ?? this.store?.load(vehicleId) ?? createNeutralDriverProfile();
    this.profiles.set(vehicleId, this.profile);
    this.dirty = false; this.checkpoint = 0;
    // No residual A calibration or torque smoothing may carry onto vehicle B.
    this.calibration.reset(); this.resetTransient();
  }
  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled; this.monitor.reset();
    if (!enabled) this.persist();
    else this.profile = this.profiles.get(this.vehicleId) ?? this.store?.load(this.vehicleId) ?? createNeutralDriverProfile();
  }
  public resetProfile(): void {
    this.profile = createNeutralDriverProfile(); this.monitor.reset();
    this.profiles.set(this.vehicleId, this.profile);
    this.dirty = false; this.checkpoint = 0; this.store?.clear(this.vehicleId);
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
  public previewThrottle(value: number, baseline: ControlCalibration['throttle'] = BaseControlCalibration.throttle): number {
    const exponent = clamp(baseline.pedalExponent * (1 + (this.calibration.throttleExponent - 1) * baseline.adaptiveAuthority),
      HardSafetyEnvelope.minimumPedalExponent, HardSafetyEnvelope.maximumPedalExponent);
    return clamp(value, 0, 1) ** exponent;
  }
  public mapThrottle(dt: number, value: number, baseline: ControlCalibration['throttle'] = BaseControlCalibration.throttle): number {
    const mapped = this.previewThrottle(value, baseline);
    const tau = clamp(baseline.torqueSmoothingSeconds + this.calibration.torqueSmoothingSeconds * baseline.adaptiveAuthority,
      0, HardSafetyEnvelope.maximumSmoothingSeconds);
    // Never retain positive driver demand on lift-off.
    this.smoothedThrottle = mapped <= this.smoothedThrottle || tau < .0001 ? mapped
      : this.smoothedThrottle + (mapped - this.smoothedThrottle) * -Math.expm1(-dt / tau);
    return this.smoothedThrottle;
  }
  public mapBrake(value: number, baseline: ControlCalibration['throttle'] = BaseControlCalibration.throttle): number {
    const exponent = clamp(baseline.brakeExponent * (1 + (this.calibration.brakeExponent - 1) * baseline.adaptiveAuthority), .85, 1.2);
    return clamp(value, 0, 1) ** exponent;
  }
  public persist(): void { if (this.dirty) { this.store?.save(this.profile, this.vehicleId); this.dirty = false; } }
}
