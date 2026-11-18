import type { VehicleControlState } from '../VehicleStateEstimator';
import { clamp } from '../../physics/math';
import { BaseControlCalibration } from '../BaseControlCalibration';
import type { DriverProfile } from './DriverProfile';

export interface DriverIntent { throttle: number; brake: number; steering: number }
export interface ControlInterventions { absActive: boolean; tcsActive: boolean; escActive: boolean }
/** Time-weighted rolling EMAs (180 s), raw driver commands only.
 * Disabled/parked samples break derivative history, avoiding resume spikes. */
export class DriverBehaviorMonitor {
  private previousThrottle = 0;
  private previousBrake = 0;
  private previousSteering = 0;
  private initialized = false;
  public reset(): void { this.initialized = false; }
  public update(dt: number, profile: DriverProfile, intent: DriverIntent,
    state: VehicleControlState, interventions: ControlInterventions, eligible: boolean): boolean {
    if (!eligible || dt <= 0 || !Number.isFinite(dt)) { this.reset(); return false; }
    const h = Math.min(dt, .1), alpha = -Math.expm1(-h / BaseControlCalibration.adaptive.learningSeconds);
    const throttleRate = this.initialized ? Math.abs(intent.throttle - this.previousThrottle) / h : 0;
    const brakeRate = this.initialized ? Math.abs(intent.brake - this.previousBrake) / h : 0;
    const steeringRate = this.initialized ? Math.abs(intent.steering - this.previousSteering) / h : 0;
    this.previousThrottle = intent.throttle; this.previousBrake = intent.brake; this.previousSteering = intent.steering;
    this.initialized = true;
    const ema = (old: number, sample: number): number => old + (clamp(sample, 0, 1) - old) * alpha;
    profile.throttleAggressiveness = ema(profile.throttleAggressiveness, intent.throttle * .7 + throttleRate * .1);
    profile.brakeAggressiveness = ema(profile.brakeAggressiveness, intent.brake * .7 + brakeRate * .1);
    profile.steeringAggressiveness = ema(profile.steeringAggressiveness, Math.abs(intent.steering) * .5 + steeringRate * .15);
    profile.accelerationPreference = ema(profile.accelerationPreference, Math.max(0, state.longitudinalAcceleration) / 4);
    profile.corneringAggressiveness = ema(profile.corneringAggressiveness, Math.abs(state.lateralAcceleration) / 7);
    profile.drivingSmoothness = ema(profile.drivingSmoothness, 1 - (throttleRate + brakeRate + steeringRate) / 6);
    profile.absInterventionFrequency = ema(profile.absInterventionFrequency, Number(interventions.absActive));
    profile.tcsInterventionFrequency = ema(profile.tcsInterventionFrequency, Number(interventions.tcsActive));
    profile.escInterventionFrequency = ema(profile.escInterventionFrequency, Number(interventions.escActive));
    profile.sampleDuration = Math.min(1e9, profile.sampleDuration + h);
    profile.confidence = 1 - Math.exp(-profile.sampleDuration / BaseControlCalibration.adaptive.confidenceSeconds);
    return true;
  }
}
