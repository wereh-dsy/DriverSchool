import type { LaneObservation } from '../../world/navigation/LaneObservation';
import type { LateralAssistContext } from './LateralAssistController';
import { LaneAssistMode } from './LaneAssistState';

export const DEFAULT_LDW_CONFIG = {
  minSpeed: 50/3.6, minimumConfidence: .8, warningClearance: .65, predictionSeconds: .6,
  outwardSpeed: .1, urgentClearance: .3, rearmClearance: .95, rearmSeconds: .5, cooldownSeconds: 2.5,
  driverOverride: .38,
} as const;
export type DepartureSide = 'left' | 'right';

/** Audible warning edges from the existing logical observation; no independent lane sensing. */
export class LaneDepartureWarningController {
  public warningSide: DepartureSide | null = null;
  private armed = true;
  private cooldown = 0;
  private clearSeconds = 0;
  public reset(): void { this.warningSide = null; this.armed = true; this.cooldown = this.clearSeconds = 0; }
  public update(dt: number, lane: LaneObservation, context: LateralAssistContext,
    mode: LaneAssistMode, available: boolean): DepartureSide | null {
    const c = DEFAULT_LDW_CONFIG;
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(.05, dt)) : 0;
    this.cooldown = Math.max(0, this.cooldown - step);
    const finite = Number.isFinite(context.speed) && Number.isFinite(context.lateralVelocity) && Number.isFinite(context.yawRate) &&
      Number.isFinite(context.driverSteering) && Number.isFinite(lane.headingError) && Number.isFinite(lane.confidence) &&
      Number.isFinite(lane.curvature) && Number.isFinite(lane.distanceToLeftBoundary) && Number.isFinite(lane.distanceToRightBoundary) && Number.isFinite(lane.laneWidth);
    if (!available || mode !== LaneAssistMode.WARNING_ONLY || !finite || !lane.valid || !lane.laneId ||
      lane.confidence < c.minimumConfidence || lane.ambiguous || lane.isIntersection || lane.laneWidth < 2.5 || lane.laneWidth > 4.8 ||
      !context.operational || !context.forwardGear || context.suspended || context.speed < c.minSpeed || Math.abs(context.driverSteering) >= c.driverOverride) {
      this.warningSide = null; this.clearSeconds = 0; return null;
    }
    const drift = context.speed * Math.sin(lane.headingError) + context.lateralVelocity * Math.cos(lane.headingError);
    const right = !context.rightSignal && lane.rightBoundaryType !== 'unavailable' &&
      (drift > c.outwardSpeed || lane.distanceToRightBoundary < c.urgentClearance) &&
      lane.distanceToRightBoundary - Math.max(0, drift * c.predictionSeconds) < c.warningClearance;
    const left = !context.leftSignal && lane.leftBoundaryType !== 'unavailable' &&
      (-drift > c.outwardSpeed || lane.distanceToLeftBoundary < c.urgentClearance) &&
      lane.distanceToLeftBoundary + Math.min(0, drift * c.predictionSeconds) < c.warningClearance;
    this.warningSide = right ? 'right' : left ? 'left' : null;
    const clear = lane.distanceToLeftBoundary > c.rearmClearance && lane.distanceToRightBoundary > c.rearmClearance;
    this.clearSeconds = clear && !this.warningSide ? this.clearSeconds + step : 0;
    if (this.clearSeconds >= c.rearmSeconds && this.cooldown === 0) this.armed = true;
    if (this.warningSide && this.armed && this.cooldown === 0) {
      this.armed = false; this.cooldown = c.cooldownSeconds; return this.warningSide;
    }
    return null;
  }
}
