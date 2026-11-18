import type { LaneObservation } from '../../world/navigation/LaneObservation';
import type { SteeringConfig } from '../config/VehiclePhysicsConfig';

export interface LKAControllerConfig {
    /** Boundary margins are vehicle-centre clearances in metres, matching LaneObservation. */
    enabled: boolean; minSpeed: number; fullSpeed: number; maxAuthority: number;
    activationMargin: number; strongMargin: number; predictionSeconds: number;
    boundaryGain: number; headingGain: number; yawRateGain: number; inwardSpeedTolerance: number; outwardSpeedFull: number;
    /** LKA feedback gains produce normalized steering demand; velocity gain is demand/(m/s). */
    lateralVelocityGain: number; trendSmoothing: number; recoveryMargin: number; recoveryOffsetTolerance: number;
    recoverySpeedTolerance: number; recoveryHeadingTolerance: number; recoveryYawRateTolerance: number;
    rateLimit: number; smoothing: number; activationSeconds: number; deactivationSeconds: number;
}
export interface LCCControllerConfig {
    enabled: boolean; minSpeed: number; fullSpeed: number; maxSpeed: number; maxAuthority: number;
    centerTolerance: number; lateralGain: number; headingGain: number; lookAheadGain: number;
    /** LCC feedback produces road-wheel radians before existing command sensitivity conversion. */
    lateralVelocityGain: number; previewHeadingWeight: number; trendSmoothing: number;
    lowSpeedGain: number; highSpeedGain: number; gainReferenceSpeed: number; gainFullSpeed: number;
    curvatureFeedForward: number; understeerFeedForward: number; yawRateGain: number; rateLimit: number; highSpeedRateLimit: number;
    smoothing: number; reengagementSeconds: number; releaseDelay: number; laneStableSeconds: number; activationStableSeconds: number;
    reacquireMargin: number; reacquireHeading: number; laneChangeIntent: number;
}
export interface LateralAssistConfig {
  minimumConfidence: number; driverReduceStart: number; driverOverride: number;
  lka: LKAControllerConfig;
  lcc: LCCControllerConfig;
}
/** SI units. Outputs are fractions of full driver steering command. Each vehicle owns a copy. */
export const createLateralAssistConfig = (): LateralAssistConfig => ({
  minimumConfidence: .8, driverReduceStart: .08, driverOverride: .38,
  lka: { enabled: true, minSpeed: 50 / 3.6, fullSpeed: 60 / 3.6, maxAuthority: .12,
    activationMargin: 1.10, strongMargin: .65, predictionSeconds: .85,
    boundaryGain: .045, headingGain: .25, yawRateGain: 1.2, inwardSpeedTolerance: .10, outwardSpeedFull: .4,
    lateralVelocityGain: .065, trendSmoothing: 12, recoveryMargin: .15, recoveryOffsetTolerance: .10,
    recoverySpeedTolerance: .10, recoveryHeadingTolerance: .015, recoveryYawRateTolerance: .015,
    rateLimit: .22, smoothing: 6, activationSeconds: .18, deactivationSeconds: .16 },
  lcc: { enabled: true, minSpeed: 50 / 3.6, fullSpeed: 60 / 3.6, maxSpeed: 180 / 3.6, maxAuthority: .20,
    centerTolerance: .025, lateralGain: .010, headingGain: .30, lookAheadGain: .0035,
    lateralVelocityGain: .006, previewHeadingWeight: .35, trendSmoothing: 12,
    lowSpeedGain: .85, highSpeedGain: 1.2, gainReferenceSpeed: 60/3.6, gainFullSpeed: 120/3.6,
    curvatureFeedForward: 2.0, understeerFeedForward: .00025, yawRateGain: .22, rateLimit: .18, highSpeedRateLimit: .10,
    smoothing: 5, reengagementSeconds: 1, releaseDelay: .7, laneStableSeconds: .65, activationStableSeconds: .15,
    reacquireMargin: .3, reacquireHeading: .12, laneChangeIntent: .10 },
});
export type LKAState = 'OFF' | 'UNAVAILABLE' | 'READY' | 'CORRECTING_LEFT' | 'CORRECTING_RIGHT' | 'OVERRIDDEN';
export type LCCState = 'OFF' | 'UNAVAILABLE' | 'READY' | 'ACTIVE' | 'DRIVER_OVERRIDE' | 'LANE_CHANGE_OVERRIDE' | 'REACQUIRING';
export interface LateralAssistOutput {
  active: boolean; steeringAssist: number; authority: number; state: LKAState | LCCState; controller: 'LKA' | 'LCC' | null;
}
export interface LateralAssistDisplayState {
  laneValid: boolean; leftBoundaryAvailable: boolean; rightBoundaryAvailable: boolean;
  lkaAvailable: boolean; lkaActive: boolean; correctingSide: 'left' | 'right' | null;
  lccAvailable: boolean; lccActive: boolean; driverOverride: boolean; lkaState: LKAState; lccState: LCCState;
}
export interface LateralAssistContext {
  speed: number; lateralVelocity: number; yawRate: number; driverSteering: number; operational: boolean; forwardGear: boolean;
  leftSignal: boolean; rightSignal: boolean; suspended: boolean;
}
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const smooth = (v: number): number => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };
const deadband = (v: number, tolerance: number): number => Math.sign(v) * Math.max(0, Math.abs(v) - tolerance);

/** Shared observation in; one bounded demand out. No map queries or physics writes. */
export class LateralAssistController {
  public readonly output: LateralAssistOutput = { active: false, steeringAssist: 0, authority: 0, state: 'OFF', controller: null };
  public readonly display: LateralAssistDisplayState = { laneValid: false, leftBoundaryAvailable: false,
    rightBoundaryAvailable: false, lkaAvailable: false, lkaActive: false, correctingSide: null,
    lccAvailable: false, lccActive: false, driverOverride: false, lkaState: 'OFF', lccState: 'OFF' };
  private config?: LateralAssistConfig;
  private steering?: SteeringConfig;
  private wheelBase = 0;
  private lkaEnabled = true;
  private lccEnabled = true;
  private requested = false;
  private ramp = 0;
  private stableTime = 0;
  private releaseTime = 0;
  private captureSeconds = 0;
  private trackedLane?: string;
  private departureLane?: string;
  /** -1 = protecting the left boundary, +1 = right; zero leaves in-lane positioning to the driver. */
  private recoverySide = 0;
  private recoveryLane?: string;
  private filteredLateralSpeed = 0;
  public configure(config: LateralAssistConfig | undefined, steering: SteeringConfig, wheelBase: number): void {
    this.config = config; this.steering = steering; this.wheelBase = wheelBase; this.reset();
  }
  public setPreferences(lka: boolean, lcc: boolean): void {
    if (!lka && !lcc && (this.lkaEnabled || this.lccEnabled)) this.reset();
    this.lkaEnabled = lka; this.lccEnabled = lcc;
    if (!lcc) this.requested = false;
  }
  public get lccRequested(): boolean { return this.requested; }
  public get laneChangeOverride(): boolean { return this.display.lccState === 'LANE_CHANGE_OVERRIDE'; }
  public toggleLCC(): void {
    this.setLCCRequested(!this.requested);
  }
  public setLCCRequested(requested: boolean): void {
    if (requested && (!this.config?.lcc.enabled || !this.lccEnabled) || requested === this.requested) return;
    this.requested = requested; this.ramp = 0; this.stableTime = 0; this.releaseTime = 0;
    this.captureSeconds = this.config?.lcc.activationStableSeconds ?? 0;
    this.display.lccState = this.requested ? 'REACQUIRING' : 'OFF';
  }
  public reset(): void {
    this.requested = false; this.ramp = this.stableTime = this.releaseTime = 0;
    this.trackedLane = this.departureLane = undefined;
    this.recoverySide = 0; this.recoveryLane = undefined; this.filteredLateralSpeed = 0;
    this.output.active = false; this.output.steeringAssist = this.output.authority = 0;
    this.output.state = 'OFF'; this.output.controller = null;
    this.display.lkaState = this.display.lccState = 'OFF';
    this.display.laneValid = this.display.lkaAvailable = this.display.lccAvailable = false;
    this.display.leftBoundaryAvailable = this.display.rightBoundaryAvailable = false;
    this.display.lkaActive = this.display.lccActive = this.display.driverOverride = false;
    this.display.correctingSide = null;
  }
  public update(dt: number, lane: LaneObservation, context: LateralAssistContext): LateralAssistOutput {
    const c = this.config, d = this.display, out = this.output;
    const step = Number.isFinite(dt) ? clamp(dt, 0, .05) : 0;
    const speed = context.speed, input = context.driverSteering;
    const finite = Number.isFinite(speed) && Number.isFinite(input) && Number.isFinite(context.lateralVelocity) && Number.isFinite(context.yawRate) &&
      Number.isFinite(lane.laneWidth) && Number.isFinite(lane.lateralOffset) && Number.isFinite(lane.headingError) &&
      Number.isFinite(lane.curvature) && Number.isFinite(lane.lookAheadHeadingError) &&
      Number.isFinite(lane.lookAheadLateralOffset) && Number.isFinite(lane.lookAheadDistance) &&
      Number.isFinite(lane.distanceToLeftBoundary) && Number.isFinite(lane.distanceToRightBoundary) && Number.isFinite(lane.confidence);
    const valid = finite && lane.valid && !!lane.laneId && !lane.isIntersection && !lane.ambiguous &&
      lane.confidence >= (c?.minimumConfidence ?? 1) && lane.laneWidth >= 2.5 && lane.laneWidth <= 4.8 &&
      context.operational && context.forwardGear && speed > 0 && !context.suspended;
    d.laneValid = valid; d.leftBoundaryAvailable = valid && lane.leftBoundaryType !== 'unavailable';
    d.rightBoundaryAvailable = valid && lane.rightBoundaryType !== 'unavailable';
    d.lkaAvailable = !!c?.lka.enabled && this.lkaEnabled && valid && speed >= c.lka.minSpeed;
    d.lccAvailable = !!c?.lcc.enabled && this.lccEnabled && valid && speed >= c.lcc.minSpeed && speed <= c.lcc.maxSpeed;
    d.lkaActive = d.lccActive = d.driverOverride = false; d.correctingSide = null;
    // The owning mode retains its slew limit during loss/override fade as well.
    let target = 0, maximum = 0, rate = this.requested && c ? c.lcc.rateLimit +
      (c.lcc.highSpeedRateLimit - c.lcc.rateLimit) * smooth(((Number.isFinite(speed) ? speed : 0) - 20) / 20)
      : c?.lka.rateLimit ?? .3, response = c?.lka.smoothing ?? 6;
    const driverAuthority = c && finite ? 1 - smooth((Math.abs(input) - c.driverReduceStart) / (c.driverOverride - c.driverReduceStart)) : 0;
    // Body-right velocity is not lane-right velocity: heading drift matters even without tyre slip.
    const lateralSpeed = finite ? speed * Math.sin(lane.headingError) + context.lateralVelocity * Math.cos(lane.headingError) : 0;
    const trendResponse = this.requested ? c?.lcc.trendSmoothing : c?.lka.trendSmoothing;
    this.filteredLateralSpeed += (lateralSpeed - this.filteredLateralSpeed) * (1 - Math.exp(-(trendResponse ?? 12) * step));
    if (!valid || !c?.lka.enabled || !this.lkaEnabled || driverAuthority === 0 || this.requested || this.recoveryLane !== lane.laneId ||
      this.recoverySide < 0 && context.leftSignal || this.recoverySide > 0 && context.rightSignal) this.recoverySide = 0;
    d.lkaState = !c?.lka.enabled || !this.lkaEnabled ? 'OFF' : !d.lkaAvailable ? 'UNAVAILABLE' : 'READY';
    out.controller = null;
    if (!c?.lcc.enabled || !this.lccEnabled) d.lccState = 'OFF';
    else if (!d.lccAvailable) { d.lccState = 'UNAVAILABLE'; this.ramp = this.stableTime = this.releaseTime = 0; this.captureSeconds = c.lcc.laneStableSeconds; }
    else if (!this.requested) d.lccState = 'READY';
    else {
      // Signal plus matching intentional steering yields until a new lane is stable.
      const matchingSignal = context.leftSignal && input < -c.lcc.laneChangeIntent ||
        context.rightSignal && input > c.lcc.laneChangeIntent;
      if (matchingSignal && d.lccState !== 'LANE_CHANGE_OVERRIDE') {
        this.departureLane = lane.laneId; this.stableTime = this.ramp = 0;
        this.captureSeconds = c.lcc.laneStableSeconds;
        d.lccState = 'LANE_CHANGE_OVERRIDE';
      } else if (Math.abs(input) >= c.driverOverride && d.lccState !== 'LANE_CHANGE_OVERRIDE') {
        d.lccState = 'DRIVER_OVERRIDE'; this.ramp = this.releaseTime = this.stableTime = 0;
        this.captureSeconds = c.lcc.laneStableSeconds;
      }
      const settled = Math.abs(lane.headingError) <= c.lcc.reacquireHeading &&
        Math.abs(lane.lateralOffset) < lane.laneWidth / 2 - c.lcc.reacquireMargin && Math.abs(input) < c.driverReduceStart;
      if (this.trackedLane !== lane.laneId) {
        if (this.trackedLane !== undefined) this.captureSeconds = c.lcc.laneStableSeconds;
        this.trackedLane = lane.laneId; this.stableTime = this.ramp = 0;
        if (d.lccState !== 'LANE_CHANGE_OVERRIDE' && d.lccState !== 'DRIVER_OVERRIDE') d.lccState = 'REACQUIRING';
      }
      this.stableTime = settled ? this.stableTime + step : 0;
      this.releaseTime = Math.abs(input) < c.driverReduceStart ? this.releaseTime + step : 0;
      if (d.lccState === 'LANE_CHANGE_OVERRIDE') {
        const changed = lane.laneId !== this.departureLane;
        const cancelled = !context.leftSignal && !context.rightSignal && this.releaseTime >= c.lcc.releaseDelay;
        if ((changed || cancelled) && this.stableTime >= c.lcc.laneStableSeconds) d.lccState = 'REACQUIRING';
      } else if (d.lccState === 'DRIVER_OVERRIDE') {
        if (this.releaseTime >= c.lcc.releaseDelay && this.stableTime >= c.lcc.laneStableSeconds) d.lccState = 'REACQUIRING';
      } else if (d.lccState === 'UNAVAILABLE' || d.lccState === 'READY' || d.lccState === 'OFF') d.lccState = 'REACQUIRING';
      if (d.lccState === 'REACQUIRING' && this.stableTime >= this.captureSeconds) {
        this.ramp = Math.min(1, this.ramp + step / c.lcc.reengagementSeconds);
        if (this.ramp >= 1) d.lccState = 'ACTIVE';
      }
      if (d.lccState === 'ACTIVE' || d.lccState === 'REACQUIRING' && this.ramp > 0) {
        const scale = 20 / Math.max(20, speed), look = Math.max(8, lane.lookAheadDistance);
        // Remove the bend's expected chord offset before feedback; curvature owns anticipation.
        const futureError = lane.lookAheadLateralOffset + .5 * lane.curvature * look * look +
          context.lateralVelocity * look / Math.max(1, speed);
        // Future tangent is expressed in the same lane-right sign as current heading.
        // Remove the bend's expected heading change, rather than chasing the bend as an error.
        const previewHeading = lane.lookAheadHeadingError + lane.curvature * look;
        const heading = lane.headingError + c.lcc.previewHeadingWeight * (previewHeading - lane.headingError);
        const gain = c.lcc.lowSpeedGain + (c.lcc.highSpeedGain - c.lcc.lowSpeedGain) *
          smooth((speed - c.lcc.gainReferenceSpeed) / (c.lcc.gainFullSpeed - c.lcc.gainReferenceSpeed));
        const angle = c.lcc.curvatureFeedForward * (Math.atan(this.wheelBase * lane.curvature) +
          c.lcc.understeerFeedForward * speed * speed * lane.curvature) +
          c.lcc.yawRateGain * scale * (speed * lane.curvature + context.yawRate) -
          gain * (c.lcc.lateralGain * scale * scale * deadband(lane.lateralOffset, c.lcc.centerTolerance) +
          c.lcc.headingGain * scale * heading +
          c.lcc.lateralVelocityGain * scale * this.filteredLateralSpeed +
          c.lcc.lookAheadGain * scale * scale * deadband(futureError, c.lcc.centerTolerance));
        const s = this.steering!;
        const sensitivity = (s.highSpeedMinimumAuthority ?? .22) + (1 - (s.highSpeedMinimumAuthority ?? .22)) /
          (1 + (speed / Math.max(1, s.highSpeedReferenceSpeed ?? 18)) ** 2);
        const anglePerCommand = Math.min(s.maxRoadWheelAngle, s.steeringWheelLock * .5 * sensitivity / s.steeringRatio);
        maximum = c.lcc.maxAuthority;
        target = clamp(angle / Math.max(.001, anglePerCommand), -maximum, maximum) * this.ramp * driverAuthority *
          smooth((speed - c.lcc.minSpeed) / (c.lcc.fullSpeed - c.lcc.minSpeed));
        rate = c.lcc.rateLimit + (c.lcc.highSpeedRateLimit - c.lcc.rateLimit) * smooth((speed - 20) / 20);
        response = c.lcc.smoothing * (.65 + .35 * scale);
        out.controller = 'LCC'; d.lccActive = true;
      }
      // Requested LCC owns this channel during overrides/reacquisition too: no LKA double correction.
    }
    if (!this.requested && c?.lka.enabled && this.lkaEnabled && d.lkaAvailable) {
      if (driverAuthority === 0) d.lkaState = 'OVERRIDDEN';
      else {
        const predicted = lateralSpeed * c.lka.predictionSeconds;
        // Look-ahead catches heading departure, with bend chord compensation.
        const lookDeparture = lane.lookAheadLateralOffset + .5 * lane.curvature * lane.lookAheadDistance ** 2 - lane.lateralOffset;
        const rightDistance = lane.distanceToRightBoundary - Math.max(0, predicted, lookDeparture * .35);
        const leftDistance = lane.distanceToLeftBoundary + Math.min(0, predicted, lookDeparture * .35);
        const rightRisk = d.rightBoundaryAvailable && !context.rightSignal ?
          smooth((c.lka.activationMargin - rightDistance) / (c.lka.activationMargin - c.lka.strongMargin)) *
          smooth((lateralSpeed + c.lka.inwardSpeedTolerance) / c.lka.outwardSpeedFull) : 0;
        const leftRisk = d.leftBoundaryAvailable && !context.leftSignal ?
          smooth((c.lka.activationMargin - leftDistance) / (c.lka.activationMargin - c.lka.strongMargin)) *
          smooth((-lateralSpeed + c.lka.inwardSpeedTolerance) / c.lka.outwardSpeedFull) : 0;
        const risk = Math.max(leftRisk, rightRisk);
        maximum = c.lka.maxAuthority;
        if (this.recoverySide === 0 && risk > .03) {
          this.recoverySide = rightRisk > leftRisk ? 1 : -1; this.recoveryLane = lane.laneId;
        }
        if (this.recoverySide !== 0) {
          // Recover to an inner boundary guard, not to lane centre. Keep damping until
          // the course is settled; dropping assistance at the first inward motion causes ping-pong.
          const guard = this.recoverySide * Math.max(0, lane.laneWidth/2 - c.lka.activationMargin - c.lka.recoveryMargin);
          const error = lane.lateralOffset - guard;
          const inside = this.recoverySide * error <= c.lka.recoveryOffsetTolerance;
          if (inside && Math.abs(lateralSpeed) <= c.lka.recoverySpeedTolerance && Math.abs(lane.headingError) <= c.lka.recoveryHeadingTolerance &&
            Math.abs(speed * lane.curvature + context.yawRate) <= c.lka.recoveryYawRateTolerance) {
            this.recoverySide = 0;
          } else {
            const boundaryError = this.recoverySide * Math.max(0, this.recoverySide * error);
            target = -c.lka.boundaryGain * boundaryError - c.lka.headingGain * lane.headingError -
              c.lka.lateralVelocityGain * this.filteredLateralSpeed + c.lka.yawRateGain * (speed * lane.curvature + context.yawRate);
          }
        }
        // A suppressed side must never leak back through the heading term.
        if (context.leftSignal) target = Math.min(0, target);
        if (context.rightSignal) target = Math.max(0, target);
        target = clamp(target, -maximum, maximum) * driverAuthority *
          smooth((speed - c.lka.minSpeed) / (c.lka.fullSpeed - c.lka.minSpeed));
        response = target === 0 ? 1 / c.lka.deactivationSeconds : 1 / c.lka.activationSeconds;
        response = Math.min(response, c.lka.smoothing);
        out.controller = 'LKA';
        if (Math.abs(target) > .001) d.lkaState = this.recoverySide < 0 ? 'CORRECTING_LEFT' : 'CORRECTING_RIGHT';
      }
    }
    if (!Number.isFinite(target)) target = 0;
    if (!Number.isFinite(rate) || rate < 0) rate = .3;
    if (!Number.isFinite(response) || response < 0) response = 6;
    if (!Number.isFinite(maximum) || maximum < 0) maximum = 0;
    if (!Number.isFinite(out.steeringAssist)) out.steeringAssist = 0;
    const smoothed = out.steeringAssist + (target - out.steeringAssist) * (1 - Math.exp(-response * step));
    out.steeringAssist += clamp(smoothed - out.steeringAssist, -rate * step, rate * step);
    if (Math.abs(out.steeringAssist) < .00001 && target === 0) out.steeringAssist = 0;
    out.authority = maximum * driverAuthority;
    // OFF / observation loss fades the previous demand. Explicit intent overrides
    // retain an immediate arbitration gate so residual demand cannot fight the driver.
    if (out.controller === null && !d.driverOverride && d.lccState !== 'DRIVER_OVERRIDE' && d.lccState !== 'LANE_CHANGE_OVERRIDE')
      out.authority = Math.abs(out.steeringAssist) * driverAuthority;
    if (!Number.isFinite(out.authority)) out.authority = 0;
    out.active = valid && out.controller !== null && Math.abs(out.steeringAssist) > .0001;
    out.state = this.requested ? d.lccState : d.lkaState;
    d.lkaActive = out.controller === 'LKA' && out.active;
    // Countersteering during recovery still protects the original departure boundary.
    d.correctingSide = d.lkaActive ? d.lkaState === 'CORRECTING_LEFT' ? 'left' : d.lkaState === 'CORRECTING_RIGHT' ? 'right' : null : null;
    d.driverOverride = driverAuthority === 0 || d.lccState === 'DRIVER_OVERRIDE' || d.lccState === 'LANE_CHANGE_OVERRIDE';
    return out;
  }
}

/** Final authority gate acts immediately on strong driver intent, even during output fade.
 * Positive steering is right. Existing rack response and tyre dynamics remain authoritative. */
export function arbitrateLateralSteering(driver: number, output: LateralAssistOutput): number {
  if (!Number.isFinite(driver)) return 0;
  const assist = Number.isFinite(output.steeringAssist) ? clamp(output.steeringAssist, -output.authority, output.authority) : 0;
  return clamp(driver + assist, -1, 1);
}
