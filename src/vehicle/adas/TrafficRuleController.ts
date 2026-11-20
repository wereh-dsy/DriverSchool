import { ADASSignalAdapter } from './ADASDataAdapters';
import {
  clampADAS,
  type ADASConfig,
  type ADASObstacleAssessment,
  type ADASPlanSnapshot,
  type ADASTrafficRuleDecision,
  type ADASVehicleState,
  type ADASWorldContext,
} from './ADASTypes';

/**
 * Traffic signal, stop-line, road speed-limit, curve speed preview, and junction blockage rules.
 * Runs at ~20 Hz; zero per-tick allocations.
 */
export class TrafficRuleController {
  public readonly decision: ADASTrafficRuleDecision = {
    signalDecision: 'NONE',
    signalColor: 'none',
    mustStop: false,
    stopDistanceM: Infinity,
    speedLimitMps: 40 / 3.6,
    speedLimitEstimated: true,
    curveAndTurnSpeedCapMps: 40 / 3.6,
    rampSpeedCapMps: Infinity,
    arrivalSpeedCapMps: Infinity,
    targetSpeedMps: 40 / 3.6,
    reason: '',
  };

  private readonly signalAdapter = new ADASSignalAdapter();
  private smoothedSpeedLimitMps = -1;
  /** Sticky amber decision per junction so vehicle doesn't oscillate between stop/go mid-amber. */
  private committedAmberJunctionId = '';
  private committedAmberGo = false;

  public reset(): void {
    this.smoothedSpeedLimitMps = -1;
    this.committedAmberJunctionId = '';
    this.committedAmberGo = false;
    const d = this.decision;
    d.signalDecision = 'NONE';
    d.signalColor = 'none';
    d.mustStop = false;
    d.stopDistanceM = Infinity;
    d.speedLimitMps = 40 / 3.6;
    d.speedLimitEstimated = true;
    d.curveAndTurnSpeedCapMps = 40 / 3.6;
    d.rampSpeedCapMps = Infinity;
    d.arrivalSpeedCapMps = Infinity;
    d.targetSpeedMps = 40 / 3.6;
    d.reason = '';
  }

  public update(
    dt: number,
    vehicle: ADASVehicleState,
    world: ADASWorldContext,
    plan: ADASPlanSnapshot,
    obstacle: ADASObstacleAssessment,
    config: Readonly<ADASConfig>,
  ): ADASTrafficRuleDecision {
    const out = this.decision;
    out.signalDecision = 'NONE';
    out.signalColor = 'none';
    out.mustStop = false;
    out.stopDistanceM = Infinity;
    out.reason = '';

    if (!plan.valid || plan.sampleCount < 2) {
      out.targetSpeedMps = 0;
      return out;
    }

    const v = Math.max(0, vehicle.speed);
    const frontOverhang = vehicle.vehicleLength * 0.5;
    const roadGrip = clampADAS(world.roadGripMultiplier ?? 1.0, 0.45, 1.0);
    const wetness = clampADAS(world.wetness ?? 0.0, 0.0, 1.0);
    const visibility = clampADAS(world.visibilityFactor ?? 1.0, 0.3, 1.0);
    const j = plan.upcomingJunction;

    // 1. Separate mainline speed limit from distant exit ramp limit so mainline never slows down prematurely
    const onRampNow = plan.currentRoadId.includes('ramp') || plan.currentRoadName.includes('匝道');
    let previewLimit = plan.currentSpeedLimitMps;
    let rampCapPreview = Infinity;
    const egoS = plan.egoS;
    const decelRate = Math.max(1.2, config.comfortDecelMps2 * 0.85);
    const rampEntryDecel = Math.max(1.9, config.comfortDecelMps2 * 1.15 * clampADAS(0.65 + 0.35 * roadGrip, 0.55, 1.0));

    for (let i = plan.egoSampleIndex; i < plan.sampleCount; i++) {
      const sp = plan.samples[i]!;
      const ds = sp.s - egoS;
      if (ds <= 0) continue;
      const isRampSample =
        !onRampNow &&
        (sp.roadId.includes('ramp') ||
          (j.valid && j.isRampTransition && ds >= Math.max(0, j.distanceToJunctionEntryM - 2)));

      if (isRampSample) {
        if (ds > 190) break;
        if (sp.speedLimitMps < previewLimit) {
          const brakeZoneDs = Math.max(0, ds - 6.0);
          const rampApproachV =
            brakeZoneDs > 0.5
              ? Math.sqrt(sp.speedLimitMps * sp.speedLimitMps + 2 * rampEntryDecel * brakeZoneDs)
              : sp.speedLimitMps;
          if (rampApproachV < rampCapPreview) rampCapPreview = rampApproachV;
        }
        continue;
      }

      if (ds > 140) continue;
      if (sp.speedLimitMps < previewLimit) {
        const entrySpeed = Math.sqrt(sp.speedLimitMps * sp.speedLimitMps + 2 * decelRate * ds);
        if (entrySpeed < previewLimit) previewLimit = entrySpeed;
      }
    }

    if (this.smoothedSpeedLimitMps < 0) {
      this.smoothedSpeedLimitMps = previewLimit;
    } else {
      const maxRise = 2.8 * Math.max(0.01, dt);
      const maxDrop = (onRampNow ? 7.5 : 4.5) * Math.max(0.01, dt);
      const delta = clampADAS(previewLimit - this.smoothedSpeedLimitMps, -maxDrop, maxRise);
      this.smoothedSpeedLimitMps = Math.max(2.0, this.smoothedSpeedLimitMps + delta);
    }
    out.speedLimitMps = this.smoothedSpeedLimitMps;
    out.speedLimitEstimated = plan.speedLimitEstimated;
    out.rampSpeedCapMps =
      rampCapPreview < out.speedLimitMps - 0.25 ? Math.max(3.0, rampCapPreview) : Infinity;

    // 2. Curvature, road grip, weather visibility & junction turn speed profiling
    let curveCap = out.speedLimitMps;
    const maxLatA = Math.max(0.8, config.maxComfortLateralAccelMps2 * clampADAS(roadGrip, 0.55, 1.0));
    const curveDecel = Math.max(1.2, config.comfortDecelMps2 * clampADAS(0.65 + 0.35 * roadGrip, 0.55, 1.0));
    for (let i = plan.egoSampleIndex; i < plan.sampleCount; i++) {
      const sp = plan.samples[i]!;
      const ds = Math.max(0, sp.s - egoS);
      if (ds > 130) break;
      const absK = Math.abs(sp.curvature);
      if (absK > 0.0025) {
        const cornerV = Math.sqrt(maxLatA / absK);
        const approachV = ds > 0.5
          ? Math.sqrt(cornerV * cornerV + 2 * curveDecel * ds)
          : cornerV;
        if (approachV < curveCap) curveCap = approachV;
      }
    }

    // Wetness / reduced friction / poor visibility weather safety derating
    if (wetness > 0.25 || roadGrip < 0.90 || visibility < 0.80) {
      const gripCapRatio = 0.38 + 0.62 * roadGrip;
      const wetCapRatio = 1.0 - wetness * 0.18;
      const visCapRatio = 0.45 + 0.55 * visibility;
      const weatherRatio = clampADAS(Math.min(gripCapRatio, wetCapRatio, visCapRatio), 0.55, 1.0);
      curveCap = Math.min(curveCap, out.speedLimitMps * weatherRatio);
    }

    // Explicit speed cap before tight urban junction turns / U-turns (never apply 23.4 km/h urban cap to highway ramps!)
    if (j.valid && !j.isRampTransition && j.turnDirection !== 'straight' && j.distanceToJunctionEntryM < 110) {
      const turnTarget = j.turnDirection === 'uturn' ? config.uturnSpeedMps : config.junctionTurnSpeedMps;
      const ds = Math.max(0, j.distanceToJunctionEntryM - 3);
      const approachV = ds > 0.5
        ? Math.sqrt(turnTarget * turnTarget + 2 * config.comfortDecelMps2 * ds)
        : turnTarget;
      if (approachV < curveCap) curveCap = approachV;
    }
    // Progressive speed reduction under degraded / derived-lane / missing map data
    if (plan.drivingMode === 'MAP_DEGRADED') {
      const deg = clampADAS(plan.degradationLevel ?? 0.35, 0.15, 1.0);
      const minDegV = config.degradedMinSpeedMps ?? 5.0;
      const maxDegV = Math.min(out.speedLimitMps * 0.78, 13.5);
      const scaledDegCap = minDegV + Math.max(0, maxDegV - minDegV) * (1 - deg);
      curveCap = Math.min(curveCap, scaledDegCap);
    } else if (plan.degraded) {
      curveCap = Math.min(curveCap, out.speedLimitMps * 0.85, 16.5);
    }
    if (!obstacle.dataReliable) {
      curveCap = Math.min(curveCap, Math.max(4.5, out.speedLimitMps * 0.62));
    }
    out.curveAndTurnSpeedCapMps = clampADAS(curveCap, 3.0, out.speedLimitMps);

    // 3. Destination arrival speed cap
    if (plan.remainingRouteDistanceM < 55) {
      const stopDist = Math.max(0, plan.remainingRouteDistanceM - 3.0);
      out.arrivalSpeedCapMps = stopDist <= 0.5 ? 0 : Math.sqrt(2 * config.comfortDecelMps2 * 0.75 * stopDist);
      if (stopDist <= 1.5) {
        out.mustStop = true;
        out.stopDistanceM = stopDist;
        out.reason = '即将到达目的地';
      }
    } else {
      out.arrivalSpeedCapMps = Infinity;
    }

    // 4. Traffic Signal & Blocked Junction Evaluation (urban intersections only, never free-flow highway seams)
    if (j.valid && !j.isRampTransition && j.distanceToStopLineM < 120 && j.distanceToJunctionExitM > 0) {
      // Exact front-bumper clearance to stop line (never treat nav waypoint / junction center as stop point)
      const bumperDistToStopLine = j.distanceToStopLineM - frontOverhang - config.stopLineBufferM;
      const sig = this.signalAdapter.queryUpcomingSignal(world, j);

      if (sig.valid) {
        out.signalColor = sig.color;

        if (!sig.controlled) {
          // Unprotected right turn: still check junction blockage
          if (obstacle.junctionBlocked && bumperDistToStopLine > -1.0) {
            out.signalDecision = 'STOP_BLOCKED_JUNCTION';
            out.mustStop = true;
            out.stopDistanceM = Math.max(0, bumperDistToStopLine);
            out.reason = '前方路口堵塞，等待清空';
          } else {
            out.signalDecision = 'PROCEED';
          }
        } else if (sig.color === 'red') {
          this.committedAmberJunctionId = '';
          // Stop before stop line unless front bumper has already clearly crossed into the junction
          if (bumperDistToStopLine > -1.5) {
            out.signalDecision = 'STOP_RED';
            out.mustStop = true;
            out.stopDistanceM = Math.max(0, bumperDistToStopLine);
            out.reason = '红灯停车等待';
          } else {
            // Already committed inside intersection; clear safely
            out.signalDecision = 'PROCEED';
          }
        } else if (sig.color === 'amber') {
          if (bumperDistToStopLine <= -0.5) {
            // Already past stop line -> clear intersection
            out.signalDecision = 'PROCEED_AMBER';
            this.committedAmberJunctionId = j.junctionId;
            this.committedAmberGo = true;
          } else {
            // Dilemma zone calculation: stopping distance vs remaining amber clearance time
            const reactionM = v * 0.25;
            const safeStopDist = reactionM + (v * v) / (2 * 3.2);
            const hardStopDist = v * 0.12 + (v * v) / (2 * 4.8);
            const timeToCrossLine = Math.max(0, j.distanceToStopLineM) / Math.max(v, 0.5);

            let shouldGo = false;
            if (this.committedAmberJunctionId === j.junctionId) {
              shouldGo = this.committedAmberGo;
            } else {
              if (bumperDistToStopLine >= safeStopDist) {
                shouldGo = false;
              } else if (bumperDistToStopLine < hardStopDist && timeToCrossLine <= sig.secondsToChange + 0.35) {
                shouldGo = true;
              } else if (bumperDistToStopLine < safeStopDist && timeToCrossLine <= sig.secondsToChange) {
                shouldGo = true;
              } else {
                shouldGo = false;
              }
              this.committedAmberJunctionId = j.junctionId;
              this.committedAmberGo = shouldGo;
            }

            if (shouldGo && !obstacle.junctionBlocked) {
              out.signalDecision = 'PROCEED_AMBER';
              out.reason = '黄灯安全通过';
            } else {
              out.signalDecision = obstacle.junctionBlocked ? 'STOP_BLOCKED_JUNCTION' : 'STOP_AMBER';
              out.mustStop = true;
              out.stopDistanceM = Math.max(0, bumperDistToStopLine);
              out.reason = obstacle.junctionBlocked ? '前方路口堵塞，停车等待' : '黄灯减速停车';
            }
          }
        } else if (sig.color === 'green') {
          this.committedAmberJunctionId = '';
          // Green light: DO NOT enter a blocked junction!
          if (obstacle.junctionBlocked && bumperDistToStopLine > -1.0) {
            out.signalDecision = 'STOP_BLOCKED_JUNCTION';
            out.mustStop = true;
            out.stopDistanceM = Math.max(0, bumperDistToStopLine);
            out.reason = '绿灯但路口堵塞，停车等待清空';
          } else {
            out.signalDecision = 'PROCEED';
          }
        }
      } else {
        // Unsignalized junction: still never enter if blocked
        if (obstacle.junctionBlocked && bumperDistToStopLine > -1.0 && j.distanceToStopLineM < 60) {
          out.signalDecision = 'STOP_BLOCKED_JUNCTION';
          out.mustStop = true;
          out.stopDistanceM = Math.max(0, bumperDistToStopLine);
          out.reason = '前方路口堵塞，等待通行';
        }
      }
    } else {
      this.committedAmberJunctionId = '';
    }

    // 4b. T-junction / ambiguous fork in Free Driving without driver signal: decelerate & wait cleanly before turning
    if (plan.awaitingJunctionIntent && j.valid && j.distanceToStopLineM < 95 && j.distanceToJunctionExitM > 0) {
      const bumperDistToStopLine = j.distanceToStopLineM - frontOverhang - config.stopLineBufferM;
      if (bumperDistToStopLine > -0.5) {
        const safeStop = Math.max(0, bumperDistToStopLine);
        if (!out.mustStop || safeStop < out.stopDistanceM) {
          out.mustStop = true;
          out.stopDistanceM = safeStop;
          out.reason = 'T字路口请打转向灯选择方向 · 减速等待';
        }
      }
    }

    // 5. Combine speed caps
    let targetSpeed = Math.min(
      out.speedLimitMps,
      out.curveAndTurnSpeedCapMps,
      out.rampSpeedCapMps,
      out.arrivalSpeedCapMps,
    );
    if (out.mustStop && Number.isFinite(out.stopDistanceM)) {
      const stopApproachSpeed =
        out.stopDistanceM <= 0.35
          ? 0
          : Math.sqrt(2 * config.comfortDecelMps2 * Math.max(0, out.stopDistanceM));
      targetSpeed = Math.min(targetSpeed, stopApproachSpeed);
    }

    out.targetSpeedMps = Math.max(0, targetSpeed);
    return out;
  }
}
