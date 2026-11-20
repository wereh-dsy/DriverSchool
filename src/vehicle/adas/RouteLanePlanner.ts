import type {
  LogicalLaneData,
  RoadIntersectionData,
  RoadNetworkData,
  RoadPoint,
  RoadSegmentData,
} from '../../world/navigation/RoadNetwork';
import type { LaneGraph } from '../../world/navigation/lanegraph/LaneGraph';
import type { NavigationState } from '../../world/navigation/NavigationController';
import type { PlannedRoute, RouteSection } from '../../world/navigation/RoutePlanner';
import { classifyTurnAngle, resolveRoadSpeedLimit } from './ADASDataAdapters';
import {
  clampADAS,
  createEmptyLocalTrajectoryState,
  createEmptyPathSample,
  createEmptyUpcomingJunction,
  wrapADASAngle,
  type ADASConfig,
  type ADASDriverIntentKind,
  type ADASDrivingMode,
  type ADASObstacleAssessment,
  type ADASPathSample,
  type ADASPlanSnapshot,
  type ADASVehicleState,
  type ADASWorldContext,
  type LaneBoundaryKind,
  type TurnDirection,
  type TurnSignalRequest,
} from './ADASTypes';

const MAX_PATH_SAMPLES = 220;
const SAMPLE_SPACING_M = 1.5;
const LOOK_BEHIND_M = 12;
const LOOK_AHEAD_M = 210;
const MAX_FREE_SECTIONS = 6;

interface LaneDescriptor {
  laneId: string;
  logicalIndex: number;
  approachIndex: number;
  approachCount: number;
  laneWidth: number;
  /** Signed lateral offset right of travel direction from road centerline (m). */
  travelRightOffset: number;
  derived: boolean;
  leftBoundary: LaneBoundaryKind;
  rightBoundary: LaneBoundaryKind;
}

/**
 * Navigation & lane-level local trajectory planner (runs at ~10 Hz).
 * Uses pre-allocated sample buffers (zero per-step allocations).
 * Reads existing NavigationState & RoadNetworkData read-only.
 */
export class RouteLanePlanner {
  public readonly snapshot: ADASPlanSnapshot;

  // State across planning ticks
  private activeSectionIndex = 0;
  private activeApproachLane = -1;
  private samplesApproachLane = -1;
  private activeRoadId = '';
  private lastRouteRef: PlannedRoute | null = null;
  private turnSignalHoldTimer = 0;
  private lastJunctionIdForSignal = '';
  private activeTurnSignalDirection: 'left' | 'right' | null = null;
  private laneChangeAbortCooldown = 0;
  private laneChangeAllowSolid = false;
  private overtakeReturnWaitTimer = 0;
  private overtakePassedDistFallback = 0;
  private activeEntryLatOffsetM = 0;
  private activeEntryTaperLenM = 0;
  private activeEntryStartAlongM = 0;

  // V3.5 Free Driving, Driver Turn-Signal Intent, Map Degradation & Nav Coordination states
  private freeSections: RouteSection[] = [];
  private freeRevPointCache = new Map<string, RoadPoint[]>();
  private readonly freeRouteScratch: PlannedRoute;
  private freeRoadId = '';
  private freeForward = true;
  private freeAwaitingJunctionIntent = false;
  private lastDrivingMode: ADASDrivingMode = 'NAVIGATION';
  private lastValidSampleCount = 0;
  private degradedTraveledM = 0;
  private degradedElapsedS = 0;
  private degradedLastX = NaN;
  private degradedLastZ = NaN;
  private degradedLastYaw = NaN;
  private driverDivergedFromNav = false;
  private driverDivergedOriginRoadId = '';
  private driverTurnOverrideChoice: TurnSignalRequest = null;
  private highwayExitIntentLocked = false;
  private pendingRerouteNotification = false;
  private prevManualSignal: TurnSignalRequest = null;
  private manualSignalConsumedForLc = false;
  private manualLcActive = false;
  private readonly legalSuccessorSegIds = new Set<string>();
  private readonly legalMainlineSegIds = new Set<string>();

  // Pre-allocated scratch buffers (zero heap allocation in update loop)
  private readonly sectionCumDist = new Float64Array(512);
  private readonly currentLaneDesc: LaneDescriptor = {
    laneId: '',
    logicalIndex: 0,
    approachIndex: 0,
    approachCount: 1,
    laneWidth: 3.5,
    travelRightOffset: 0,
    derived: false,
    leftBoundary: 'unavailable',
    rightBoundary: 'unavailable',
  };
  private readonly laneDescScratch: LaneDescriptor = {
    laneId: '',
    logicalIndex: 0,
    approachIndex: 0,
    approachCount: 1,
    laneWidth: 3.5,
    travelRightOffset: 0,
    derived: false,
    leftBoundary: 'unavailable',
    rightBoundary: 'unavailable',
  };
  private readonly nextLaneDescScratch: LaneDescriptor = {
    laneId: '',
    logicalIndex: 0,
    approachIndex: 0,
    approachCount: 1,
    laneWidth: 3.5,
    travelRightOffset: 0,
    derived: false,
    leftBoundary: 'unavailable',
    rightBoundary: 'unavailable',
  };
  private readonly p0 = { x: 0, y: 0, z: 0, yaw: 0 };
  private readonly p3 = { x: 0, y: 0, z: 0, yaw: 0 };
  private readonly tmpA = { x: 0, y: 0, z: 0, yaw: 0 };
  private readonly tmpB = { x: 0, y: 0, z: 0, yaw: 0 };

  public constructor() {
    this.freeRouteScratch = {
      start: { roadId: '', along: 0, point: { x: 0, y: 0, z: 0 }, label: '' },
      destination: { roadId: '', along: 0, point: { x: 0, y: 0, z: 0 }, label: '' },
      sections: this.freeSections,
      points: [],
      distance: 99999,
      seconds: 9999,
      maneuvers: [],
      waypoints: [],
    };
    const samples: ADASPathSample[] = Array.from(
      { length: MAX_PATH_SAMPLES },
      () => createEmptyPathSample(),
    );
    this.snapshot = {
      valid: false,
      degraded: false,
      unavailableReason: '',
      derivedLaneGeometry: false,
      confidence: 0,
      sampleCount: 0,
      samples,
      egoSampleIndex: 0,
      egoS: 0,
      lateralOffsetM: 0,
      headingErrorRad: 0,
      currentRoadId: '',
      currentRoadName: '',
      currentRoadType: undefined,
      currentRoadFunction: undefined,
      currentIsHighwayTransition: false,
      currentLaneId: '',
      currentLaneIndex: 0,
      currentApproachLaneIndex: 0,
      currentApproachLaneCount: 1,
      currentLaneWidth: 3.5,
      leftBoundary: 'unavailable',
      rightBoundary: 'unavailable',
      currentSpeedLimitMps: 40 / 3.6,
      speedLimitEstimated: true,
      remainingRouteDistanceM: 0,
      maneuver: 'FOLLOW_LANE',
      desiredTurnSignal: null,
      inJunction: false,
      nearJunctionSolidZone: false,
      upcomingJunction: createEmptyUpcomingJunction(),
      laneChange: {
        active: false,
        reason: 'none',
        direction: null,
        fromLaneIndex: 0,
        toLaneIndex: 0,
        phase: 'idle',
        elapsedSeconds: 0,
        durationSeconds: 3.5,
        signalLeadSeconds: 0.7,
        lateralDeltaM: 0,
      },
      overtaking: {
        active: false,
        phase: 'none',
        targetActorId: '',
        originalLaneIndex: 0,
        passingLaneIndex: 0,
        elapsedSeconds: 0,
        passedElapsedSeconds: 0,
        leadSpeedSnapshotMps: 0,
        overtakeTargetSpeedMps: 0,
      },
      localTrajectory: createEmptyLocalTrajectoryState(),
      routeVersion: -1,
      drivingMode: 'NAVIGATION',
      degradationLevel: 0,
      awaitingJunctionIntent: false,
      driverPreferredTurn: null,
      activeIntent: 'NONE',
      requestNavReroute: false,
    };
  }

  /** Baseline approach lane index around which `snapshot.samples` is currently centered. */
  public get activeSampleApproachLane(): number {
    return this.samplesApproachLane;
  }

  public reset(): void {
    this.activeSectionIndex = 0;
    this.activeApproachLane = -1;
    this.samplesApproachLane = -1;
    this.activeRoadId = '';
    this.lastRouteRef = null;
    this.turnSignalHoldTimer = 0;
    this.lastJunctionIdForSignal = '';
    this.activeTurnSignalDirection = null;
    this.laneChangeAbortCooldown = 0;
    this.laneChangeAllowSolid = false;
    this.activeEntryLatOffsetM = 0;
    this.activeEntryTaperLenM = 0;
    this.activeEntryStartAlongM = 0;
    const s = this.snapshot;
    if (s.localTrajectory) {
      Object.assign(s.localTrajectory, createEmptyLocalTrajectoryState());
    }
    s.valid = false;
    s.degraded = false;
    s.unavailableReason = '';
    s.derivedLaneGeometry = false;
    s.confidence = 0;
    s.sampleCount = 0;
    s.egoSampleIndex = 0;
    s.egoS = 0;
    s.lateralOffsetM = 0;
    s.headingErrorRad = 0;
    s.maneuver = 'FOLLOW_LANE';
    s.desiredTurnSignal = null;
    s.inJunction = false;
    s.nearJunctionSolidZone = false;
    s.currentRoadType = undefined;
    s.currentRoadFunction = undefined;
    s.currentIsHighwayTransition = false;
    s.upcomingJunction.valid = false;
    s.drivingMode = 'NAVIGATION';
    s.degradationLevel = 0;
    s.awaitingJunctionIntent = false;
    s.driverPreferredTurn = null;
    s.activeIntent = 'NONE';
    s.requestNavReroute = false;
    this.freeSections.length = 0;
    this.freeRevPointCache.clear();
    this.freeRoadId = '';
    this.freeForward = true;
    this.freeAwaitingJunctionIntent = false;
    this.lastDrivingMode = 'NAVIGATION';
    this.lastValidSampleCount = 0;
    this.degradedTraveledM = 0;
    this.degradedElapsedS = 0;
    this.degradedLastX = NaN;
    this.degradedLastZ = NaN;
    this.degradedLastYaw = NaN;
    this.driverDivergedFromNav = false;
    this.driverDivergedOriginRoadId = '';
    this.driverTurnOverrideChoice = null;
    this.highwayExitIntentLocked = false;
    this.pendingRerouteNotification = false;
    this.prevManualSignal = null;
    this.manualSignalConsumedForLc = false;
    this.manualLcActive = false;
    this.cancelLaneChange();
    this.resetOvertaking();
  }

  /** Called when driver finishes manual steering override so ADAS adopts current lane without pulling back. */
  public adoptCurrentLaneFromVehicle(
    vehicle: ADASVehicleState,
    nav: NavigationState | null,
    network?: RoadNetworkData,
  ): void {
    this.cancelLaneChange();
    this.resetOvertaking();
    this.manualLcActive = false;
    this.highwayExitIntentLocked = false;
    // Brief grace window after driver releases steering so ADAS settles on adopted lane without fighting back
    this.laneChangeAbortCooldown = Math.max(this.laneChangeAbortCooldown, 1.5);
    const applySmoothReentry = (_sec: RouteSection, _laneIdx: number) => {
      // Clear forced road-seam taper; LocalTrajectoryPlanner takes over smoothly from live lateral pose.
      this.activeEntryStartAlongM = 0;
      this.activeEntryLatOffsetM = 0;
      this.activeEntryTaperLenM = 0;
    };
    const route = nav?.route;
    if (route && route.sections.length > 0) {
      const secIdx = this.findBestSectionIndex(vehicle, route);
      if (secIdx >= 0) {
        const section = route.sections[secIdx]!;
        this.activeSectionIndex = secIdx;
        this.activeRoadId = section.road.id;
        this.activeApproachLane = this.detectVehicleApproachLane(vehicle, section);
        applySmoothReentry(section, this.activeApproachLane);
        return;
      }
    }
    if (network && network.segments.length > 0) {
      const match = this.matchRoadForFreeDrive(vehicle, network);
      if (match) {
        this.freeRoadId = match.road.id;
        this.freeForward = match.forward;
        const tmpPts = match.forward ? match.road.centerline : this.getReversedPoints(match.road);
        this.freeSections.length = 0;
        this.freeSections.push({
          road: match.road,
          forward: match.forward,
          from: 0,
          to: match.road.length,
          startDistance: 0,
          distance: match.road.length,
          seconds: 1,
          points: tmpPts,
        });
        this.activeSectionIndex = 0;
        this.activeRoadId = match.road.id;
        const sec0 = this.freeSections[0]!;
        this.activeApproachLane = this.detectVehicleApproachLane(vehicle, sec0);
        applySmoothReentry(sec0, this.activeApproachLane);
      }
    }
  }

  /** Advance lane-change timers at physics rate (120 Hz) for smooth continuous lateral S-curve. */
  public stepLaneChangeClock(dt: number, vehicle: ADASVehicleState, obstacle: ADASObstacleAssessment | null): void {
    const ot = this.snapshot.overtaking;
    if (ot.active) {
      ot.elapsedSeconds += dt;
    }

    const lc = this.snapshot.laneChange;
    if (!lc.active) return;

    lc.elapsedSeconds += dt;
    if (lc.phase === 'signaling') {
      // Abort before lateral motion if target lane became genuinely unsafe
      if (obstacle) {
        const clearance = lc.direction === 'left' ? obstacle.leftLane : obstacle.rightLane;
        const solidBypassAllowed = this.laneChangeAllowSolid && clearance.exists && clearance.safe;
        if (!clearance.safe || (!clearance.boundaryCrossable && !solidBypassAllowed)) {
          this.cancelLaneChange();
          this.laneChangeAbortCooldown = 0.7;
          if (ot.active && ot.phase === 'returning') {
            // Delay return retry cleanly while remaining safely in passing lane
            ot.phase = 'passing';
            this.overtakeReturnWaitTimer = 0.4;
          } else {
            this.resetOvertaking();
          }
          return;
        }
      }
      if (lc.elapsedSeconds >= lc.signalLeadSeconds) {
        lc.phase = 'executing';
        lc.elapsedSeconds = 0;
        if (ot.active && ot.phase === 'preparing') {
          ot.phase = 'changing_out';
        }
      }
    } else if (lc.phase === 'executing') {
      const progress = lc.durationSeconds > 0 ? lc.elapsedSeconds / lc.durationSeconds : 1;
      // If early in lane change and adjacent lane becomes genuinely unsafe, abort cleanly with smooth reentry
      if (progress < 0.45 && obstacle) {
        const clearance = lc.direction === 'left' ? obstacle.leftLane : obstacle.rightLane;
        const imminentAbort = progress < 0.30 ? (!clearance.safe && clearance.minTTCSeconds < 2.0) : (!clearance.safe && clearance.minTTCSeconds < 1.25);
        if (imminentAbort) {
          // Smoothly taper current lateral displacement back to origin lane instead of snapping steering wheel
          const curLat = this.snapshot.lateralOffsetM;
          this.cancelLaneChange();
          this.laneChangeAbortCooldown = 1.0;
          if (Math.abs(curLat) > 0.15) {
            this.activeEntryStartAlongM = Math.max(0, this.snapshot.egoS);
            this.activeEntryLatOffsetM = clampADAS(curLat, -2.5, 2.5);
            this.activeEntryTaperLenM = clampADAS(Math.max(16, Math.abs(vehicle.speed) * 1.5, Math.abs(curLat) * 12), 16, 40);
          }
          if (ot.active && ot.phase === 'returning') {
            ot.phase = 'passing';
            this.overtakeReturnWaitTimer = 0.5;
          } else {
            this.resetOvertaking();
          }
          return;
        }
      }
      if (lc.elapsedSeconds >= lc.durationSeconds) {
        this.activeApproachLane = lc.toLaneIndex;
        lc.phase = 'settling';
        lc.elapsedSeconds = 0;
        if (ot.active && ot.phase === 'changing_out') {
          ot.phase = 'passing';
          ot.passedElapsedSeconds = 0;
          this.overtakeReturnWaitTimer = 0;
          this.overtakePassedDistFallback = 0;
        }
      }
    } else if (lc.phase === 'settling') {
      if (
        (lc.elapsedSeconds >= 0.45 && Math.abs(this.snapshot.lateralOffsetM) < 0.45 && Math.abs(vehicle.yawRate) < 0.25) ||
        lc.elapsedSeconds >= 1.2
      ) {
        const wasReturning = ot.active && ot.phase === 'returning';
        const wasManualLc = this.manualLcActive;
        this.manualLcActive = false;
        this.cancelLaneChange();
        if (wasManualLc) {
          this.manualSignalConsumedForLc = true;
        }
        if (wasReturning) {
          this.resetOvertaking();
        }
      }
    }
  }

  /** Compute smooth lateral shift (m, positive = right) for active quintic lane-change trajectory. */
  public getActiveLaneChangeLateralShift(): number {
    const lc = this.snapshot.laneChange;
    if (!lc.active) return 0;
    if (lc.phase === 'signaling') return 0;

    // If the path samples are already centered on toLaneIndex, coordinate frame has switched
    if (this.samplesApproachLane === lc.toLaneIndex) {
      if (lc.phase === 'settling') return 0;
      const tau = clampADAS(lc.elapsedSeconds / Math.max(0.5, lc.durationSeconds), 0, 1);
      const sCurve = tau * tau * tau * (10 + tau * (-15 + 6 * tau));
      return (sCurve - 1.0) * lc.lateralDeltaM;
    }

    // Samples are still centered on fromLaneIndex: maintain full shift during settling to avoid coordinate jump
    if (lc.phase === 'settling') {
      return lc.lateralDeltaM;
    }

    const tau = clampADAS(lc.elapsedSeconds / Math.max(0.5, lc.durationSeconds), 0, 1);
    const sCurve = tau * tau * tau * (10 + tau * (-15 + 6 * tau));
    return sCurve * lc.lateralDeltaM;
  }

  /** Compute active lane-change heading offset (rad, positive = right) for feedforward smoothness. */
  public getActiveLaneChangeHeadingShift(speedMps: number): number {
    const lc = this.snapshot.laneChange;
    if (!lc.active || lc.phase !== 'executing') return 0;
    const tau = clampADAS(lc.elapsedSeconds / Math.max(0.5, lc.durationSeconds), 0, 1);
    const dsDtau = 30 * tau * tau * (1 - tau) * (1 - tau);
    const lateralSpeed = (dsDtau * lc.lateralDeltaM) / Math.max(0.5, lc.durationSeconds);
    return Math.atan2(lateralSpeed, Math.max(3.0, speedMps));
  }

  /** Compute exact analytical quintic S-curve path curvature (1/m, positive = turning right). */
  public getActiveLaneChangeCurvature(speedMps: number): number {
    const lc = this.snapshot.laneChange;
    if (!lc.active || lc.phase !== 'executing') return 0;
    const T = Math.max(0.5, lc.durationSeconds);
    const tau = clampADAS(lc.elapsedSeconds / T, 0, 1);
    const d2sDtau2 = 60 * tau - 180 * tau * tau + 120 * tau * tau * tau;
    const latAccel = (d2sDtau2 * lc.lateralDeltaM) / (T * T);
    const vSafe = Math.max(4.5, speedMps);
    return clampADAS(latAccel / (vSafe * vSafe), -0.08, 0.08);
  }

  /**
   * Main 10 Hz planning update: supports Navigation mode, Free Driving (without route),
   * Driver Turn-Signal intent & Navigation Coordination, and Map/Nav Degradation fallback.
   */
  public update(
    dt: number,
    vehicle: ADASVehicleState,
    world: ADASWorldContext,
    config: Readonly<ADASConfig>,
    obstacle: ADASObstacleAssessment | null,
    driverSteeringOverride: boolean,
    manualSignalIntent: TurnSignalRequest = null,
  ): ADASPlanSnapshot {
    const out = this.snapshot;
    const nav = world.navigationState;
    const rawNetwork = world.roadNetwork && world.roadNetwork.segments.length > 0
      ? world.roadNetwork
      : world.nearbyNetwork && world.nearbyNetwork.segments.length > 0
        ? world.nearbyNetwork
        : undefined;

    out.requestNavReroute = false;
    out.awaitingJunctionIntent = false;
    out.driverPreferredTurn = this.driverTurnOverrideChoice;

    if (manualSignalIntent !== this.prevManualSignal) {
      this.prevManualSignal = manualSignalIntent;
      this.manualSignalConsumedForLc = false;
    }

    // 0. If map road network itself is missing/unavailable, execute graceful Map Degradation fallback
    if (!rawNetwork) {
      return this.updateMapDegraded(dt, vehicle, config, obstacle, '未获取到可用地图数据');
    }

    const navHasRoute = Boolean(
      nav &&
      nav.route &&
      nav.route.sections.length > 0 &&
      nav.status !== 'idle' &&
      nav.status !== 'preview' &&
      nav.status !== 'unreachable' &&
      nav.status !== 'rerouting' &&
      nav.status !== 'arrived',
    );

    // Handle explicit destination arrival cleanly
    if (nav && nav.status === 'arrived') {
      out.drivingMode = 'NAVIGATION';
      out.degradationLevel = 0;
      out.valid = false;
      out.unavailableReason = '已到达目的地';
      out.sampleCount = 0;
      out.desiredTurnSignal = null;
      this.cancelLaneChange();
      return out;
    }

    let route: PlannedRoute | null = navHasRoute ? nav!.route! : null;
    let currentMode: ADASDrivingMode = route ? 'NAVIGATION' : 'FREE_DRIVING';

    // Handle driver diverged-branch completion & Navigation reroute trigger (Section V)
    if (this.pendingRerouteNotification && route && nav && nav.status === 'navigating') {
      this.pendingRerouteNotification = false;
      out.requestNavReroute = true;
    }

    // Detect if driver signaled a legal diverging turn/exit while in Navigation mode
    if (route && manualSignalIntent && !this.driverDivergedFromNav && !this.manualSignalConsumedForLc) {
      const navSecIdx = this.findBestSectionIndex(vehicle, route);
      if (navSecIdx >= 0) {
        const curSec = route.sections[navSecIdx]!;
        const overrideCheck = this.canDriverSignalDivergeAtNextNode(
          vehicle,
          curSec,
          navSecIdx + 1 < route.sections.length ? route.sections[navSecIdx + 1] : undefined,
          rawNetwork,
          world.laneGraph,
          manualSignalIntent,
          config,
        );
        if (overrideCheck) {
          this.driverDivergedFromNav = true;
          this.driverDivergedOriginRoadId = curSec.road.id;
          this.driverTurnOverrideChoice = manualSignalIntent;
          this.highwayExitIntentLocked = true;
        }
      }
    }

    // Disambiguate right signal on highway before exit: lane change vs exit ramp
    const resolveFreeTurnPref = (): TurnSignalRequest => {
      if (this.driverTurnOverrideChoice) return this.driverTurnOverrideChoice;
      if (!manualSignalIntent) return null;
      if (manualSignalIntent === 'right') {
        const match = this.matchRoadForFreeDrive(vehicle, rawNetwork);
        if (match) {
          const isHw = match.road.roadType === 'highway' || (match.road.speedLimit ?? 0) >= 70;
          if (isHw) {
            const remM = Math.max(0, match.road.length - match.along);
            const appCount = this.countApproachLanes(match.road, match.forward);
            const appLane = this.activeApproachLane >= 0
              ? clampADAS(this.activeApproachLane, 0, appCount - 1)
              : this.detectVehicleApproachLane(vehicle, {
                  road: match.road,
                  forward: match.forward,
                  from: 0,
                  to: match.road.length,
                  startDistance: 0,
                  distance: match.road.length,
                  seconds: 1,
                  points: match.forward ? match.road.centerline : this.getReversedPoints(match.road),
                });
            this.describeLane(match.road, match.forward, appLane, false, this.tmpLaneDesc);
            const canMoveRightInMainline = appLane < appCount - 1 && this.tmpLaneDesc.rightBoundary === 'dashed';
            const inExitWindow = remM <= Math.min(config.rampExitLookAheadDistanceM ?? 600, 260);
            if (!inExitWindow || (canMoveRightInMainline && !this.manualLcActive && !this.highwayExitIntentLocked)) {
              // Prioritize changing into rightmost lane first; do NOT hijack upstream lane change into ramp exit
              return null;
            }
            if (inExitWindow && appLane >= appCount - 1 && !this.manualSignalConsumedForLc) {
              this.highwayExitIntentLocked = true;
              this.driverTurnOverrideChoice = 'right';
            }
          }
        }
      }
      return this.manualSignalConsumedForLc ? null : manualSignalIntent;
    };

    // If driver diverged from Nav route (or Nav has no route), synthesize Free Driving chain from map topology / LaneGraph
    let isFreeChain = false;
    if (!route || this.driverDivergedFromNav) {
      const turnPref = resolveFreeTurnPref();
      const freeRoute = this.buildFreeDriveRoute(vehicle, rawNetwork, world.laneGraph, turnPref, config);
      if (freeRoute && freeRoute.sections.length > 0) {
        route = freeRoute;
        isFreeChain = true;
        currentMode = navHasRoute && this.driverDivergedFromNav ? 'NAVIGATION' : 'FREE_DRIVING';
      } else if (!route) {
        return this.updateMapDegraded(dt, vehicle, config, obstacle, '未匹配到前方合法道路');
      }
    }

    if (!route) {
      return this.updateMapDegraded(dt, vehicle, config, obstacle, '未获取到可用行驶路径');
    }

    // Recovering from MAP_DEGRADED -> smooth longitudinal taper instead of abrupt path jump
    const recoveringFromDegraded = this.lastDrivingMode === 'MAP_DEGRADED' && this.lastValidSampleCount >= 2;
    this.lastDrivingMode = currentMode;
    this.degradedTraveledM = 0;
    this.degradedElapsedS = 0;
    this.degradedLastX = NaN;
    this.degradedLastZ = NaN;
    out.drivingMode = currentMode;
    out.degradationLevel = 0;
    out.awaitingJunctionIntent = isFreeChain && this.freeAwaitingJunctionIntent;
    out.driverPreferredTurn = this.driverTurnOverrideChoice;

    if (!isFreeChain && route !== this.lastRouteRef) {
      this.lastRouteRef = route;
      this.activeSectionIndex = 0;
      this.activeApproachLane = -1;
      this.activeRoadId = '';
      this.cancelLaneChange();
    } else if (isFreeChain) {
      this.lastRouteRef = null;
    }
    out.routeVersion = nav ? nav.version : 0;

    // 1. Locate vehicle along active route sections
    let bestSecIdx = this.findBestSectionIndex(vehicle, route);
    if (bestSecIdx < 0) {
      if (this.activeSectionIndex >= 0 && this.activeSectionIndex < route.sections.length) {
        const prevSec = route.sections[this.activeSectionIndex]!;
        const prevProj = this.projectOntoPoints(vehicle.x, vehicle.z, prevSec.points);
        if (Math.abs(prevProj.lateralRight) < 35 && Math.abs(vehicle.y - prevProj.y) < 4.0) {
          bestSecIdx = this.activeSectionIndex;
          out.degraded = true;
          out.derivedLaneGeometry = true;
        }
      }
    }
    if (bestSecIdx < 0) {
      if (!isFreeChain && rawNetwork) {
        // Fallback smoothly to Free Driving rather than dropping out when off-nav-route on mapped road
        const turnPref = resolveFreeTurnPref();
        const fallbackFree = this.buildFreeDriveRoute(vehicle, rawNetwork, world.laneGraph, turnPref, config);
        if (fallbackFree && fallbackFree.sections.length > 0) {
          route = fallbackFree;
          bestSecIdx = 0;
          isFreeChain = true;
          currentMode = 'FREE_DRIVING';
          out.drivingMode = 'FREE_DRIVING';
          out.requestNavReroute = navHasRoute;
        }
      }
      if (bestSecIdx < 0) {
        return this.updateMapDegraded(dt, vehicle, config, obstacle, '车辆偏离已知道路，进入降级保持');
      }
    }

    const section = route.sections[bestSecIdx]!;
    const road = section.road;

    // Clear nav divergence flag once settled onto new outgoing road after diverged turn
    if (this.driverDivergedFromNav && road.id !== this.driverDivergedOriginRoadId && !this.isInsideAnyIntersection(vehicle, rawNetwork, out.upcomingJunction)) {
      this.driverDivergedFromNav = false;
      this.driverDivergedOriginRoadId = '';
      this.driverTurnOverrideChoice = null;
      this.highwayExitIntentLocked = false;
      this.pendingRerouteNotification = false;
      out.requestNavReroute = true;
      this.manualSignalConsumedForLc = true;
    }
    if (this.highwayExitIntentLocked && road.id !== this.activeRoadId && road.roadType === 'ramp') {
      this.highwayExitIntentLocked = false;
      this.driverTurnOverrideChoice = null;
      this.manualSignalConsumedForLc = true;
    }

    // Validate road geometry sanity (fallback gracefully instead of failing immediately)
    if (!road || road.centerline.length < 2 || !Number.isFinite(road.width) || road.width < 2.2) {
      return this.updateMapDegraded(dt, vehicle, config, obstacle, '道路几何数据降级');
    }

    if (recoveringFromDegraded && !driverSteeringOverride) {
      this.activeApproachLane = this.detectVehicleApproachLane(vehicle, section);
    }

    const approachCount = this.countApproachLanes(road, section.forward);
    if (approachCount <= 0) {
      return this.updateMapDegraded(dt, vehicle, config, obstacle, '当前道路无可用车道');
    }

    // Track section transitions cleanly
    if (bestSecIdx !== this.activeSectionIndex || road.id !== this.activeRoadId) {
      const prevSec =
        this.activeSectionIndex >= 0 && this.activeSectionIndex < route.sections.length
          ? route.sections[this.activeSectionIndex]
          : undefined;
      const prevLane = this.activeApproachLane;
      if (this.activeApproachLane < 0 || driverSteeringOverride) {
        this.activeApproachLane = this.detectVehicleApproachLane(vehicle, section);
      } else if (prevSec && prevSec.road.roadType === 'ramp' && road.roadType !== 'ramp' && approachCount > 1) {
        // Merge from ramp onto rightmost mainline receiving/acceleration lane (never leftmost passing lane)
        this.activeApproachLane = approachCount - 1;
      } else {
        // Carry over lane index smoothly into the new section
        this.activeApproachLane = clampADAS(this.activeApproachLane, 0, approachCount - 1);
      }

      // Preserve lateral continuity across zero-gap highway <-> ramp / split seams until taper completes
      this.activeEntryLatOffsetM = 0;
      this.activeEntryTaperLenM = 0;
      if (!driverSteeringOverride && prevSec && bestSecIdx === this.activeSectionIndex + 1 && prevLane >= 0) {
        const prevTotalLen = this.fillCumDist(prevSec.points);
        this.describeLane(prevSec.road, prevSec.forward, prevLane, false, this.tmpLaneDesc);
        this.sampleLanePoint(prevSec.points, prevTotalLen, prevTotalLen, this.tmpLaneDesc.travelRightOffset, this.p0);
        const curTotalLen = this.fillCumDist(section.points);
        this.describeLane(road, section.forward, this.activeApproachLane, false, this.nextLaneDescScratch);
        this.sampleLanePoint(section.points, curTotalLen, 0, this.nextLaneDescScratch.travelRightOffset, this.p3);

        const endPtPrev = prevSec.points[prevSec.points.length - 1]!;
        const startPtCur = section.points[0]!;
        const clGap = Math.hypot(startPtCur.x - endPtPrev.x, startPtCur.z - endPtPrev.z);
        const seamDx = this.p0.x - this.p3.x;
        const seamDz = this.p0.z - this.p3.z;
        const seamDist = Math.hypot(seamDx, seamDz);
        const turnAng = Math.abs(wrapADASAngle(this.p3.yaw - this.p0.yaw));
        if (seamDist > 0.35 && clGap < 8.0 && turnAng < 0.45) {
          const rx = Math.cos(this.p3.yaw);
          const rz = -Math.sin(this.p3.yaw);
          const latDeltaAtSeam = seamDx * rx + seamDz * rz;
          if (Math.abs(latDeltaAtSeam) > 0.35) {
            this.activeEntryLatOffsetM = latDeltaAtSeam;
            this.activeEntryTaperLenM = clampADAS(
              Math.max(26, Math.abs(latDeltaAtSeam) * 14.0),
              18,
              Math.max(18, curTotalLen - 2.0),
            );
          }
        }
      }

      this.activeSectionIndex = bestSecIdx;
      this.activeRoadId = road.id;
      if (out.laneChange.active && out.laneChange.phase !== 'settling') {
        const lcState = out.laneChange;
        const execProgress =
          lcState.phase === 'executing' && lcState.durationSeconds > 0
            ? lcState.elapsedSeconds / lcState.durationSeconds
            : 0;
        const seamContinuous =
          this.activeApproachLane >= 0 &&
          this.activeApproachLane < approachCount &&
          lcState.toLaneIndex >= 0 &&
          lcState.toLaneIndex < approachCount &&
          lcState.toLaneIndex !== this.activeApproachLane;
        // Carry active executing lane changes cleanly across tangential road-segment seams
        if (lcState.phase === 'executing' && execProgress >= 0.25 && seamContinuous && !out.inJunction) {
          lcState.fromLaneIndex = this.activeApproachLane;
          lcState.lateralDeltaM = (lcState.toLaneIndex - lcState.fromLaneIndex) * this.nextLaneDescScratch.laneWidth;
        } else {
          this.cancelLaneChange();
        }
      }
    } else if (this.activeApproachLane < 0 || driverSteeringOverride) {
      this.activeApproachLane = this.detectVehicleApproachLane(vehicle, section);
      this.activeEntryLatOffsetM = 0;
      this.activeEntryTaperLenM = 0;
    }

    this.activeApproachLane = clampADAS(this.activeApproachLane, 0, approachCount - 1);

    // 2. Project vehicle onto current section centerline to get longitudinal progress `alongSection`.
    const secProj = this.projectOntoPoints(vehicle.x, vehicle.z, section.points);
    if (this.activeEntryTaperLenM > 0 && secProj.along > this.activeEntryStartAlongM + this.activeEntryTaperLenM + 2.0) {
      this.activeEntryLatOffsetM = 0;
      this.activeEntryTaperLenM = 0;
      this.activeEntryStartAlongM = 0;
    }
    const remainingOnSection = Math.max(0, secProj.totalLength - secProj.along);
    const egoRouteDistance = section.startDistance + secProj.along;
    out.remainingRouteDistanceM = Math.max(0, route.distance - egoRouteDistance);

    // 3. Analyze upcoming junction / transition for turn direction & strategic lane selection.
    const upcoming = out.upcomingJunction;
    this.analyzeUpcomingJunction(
      route,
      bestSecIdx,
      secProj.along,
      secProj.totalLength,
      this.activeApproachLane,
      rawNetwork,
      upcoming,
      config,
    );

    const distToJunctionEntry = upcoming.valid ? upcoming.distanceToJunctionEntryM : Infinity;
    out.nearJunctionSolidZone =
      upcoming.valid && !upcoming.isRampTransition && distToJunctionEntry <= config.preJunctionSolidZoneM;
    out.inJunction = this.isInsideAnyIntersection(vehicle, rawNetwork, upcoming);

    // 4. Describe current lane & check boundaries (dedicated scratch, never overwritten by buildLocalPath).
    this.describeLane(
      road,
      section.forward,
      this.activeApproachLane,
      out.nearJunctionSolidZone || out.inJunction,
      this.currentLaneDesc,
    );

    // 5. Evaluate automated lane change triggers (navigation, lane-drop, obstacle/overtaking, manual turn-signal).
    this.laneChangeAbortCooldown = Math.max(0, this.laneChangeAbortCooldown - dt);
    if (driverSteeringOverride && out.overtaking.active) {
      this.resetOvertaking();
    }

    // Check if manual blinker canceled during early signaling before lateral move started
    if (out.laneChange.active && this.manualLcActive && out.laneChange.phase === 'signaling' && manualSignalIntent === null) {
      this.manualLcActive = false;
      this.cancelLaneChange();
    }

    const strategicLane = this.selectStrategicLane(
      route,
      bestSecIdx,
      approachCount,
      this.activeApproachLane,
      vehicle.speed,
      upcoming,
      world,
      config,
    );

    // Check if current lane ends / drops on next section or in LaneGraph without continuing
    let laneEndingDrop = false;
    if (bestSecIdx + 1 < route.sections.length && !upcoming.valid) {
      const nextCnt = this.countApproachLanes(route.sections[bestSecIdx + 1]!.road, route.sections[bestSecIdx + 1]!.forward);
      if (this.activeApproachLane >= nextCnt && nextCnt > 0) {
        laneEndingDrop = true;
      }
    }
    const graphDeadEndLane = this.detectLaneGraphEndingTarget(world.laneGraph, this.currentLaneDesc.laneId, this.activeApproachLane, approachCount);
    const desiredEndTarget = graphDeadEndLane ?? (laneEndingDrop ? Math.max(0, strategicLane) : this.activeApproachLane);

    const ot = out.overtaking;
    if (ot.active && out.laneChange.active) {
      if (ot.phase === 'preparing' || ot.phase === 'changing_out') {
        ot.phase = out.laneChange.phase === 'signaling' ? 'preparing' : 'changing_out';
      }
    }

    if (
      !driverSteeringOverride &&
      !out.laneChange.active &&
      !out.inJunction &&
      (!out.nearJunctionSolidZone || obstacle?.allowSolidBypass) &&
      this.laneChangeAbortCooldown <= 0
    ) {
      let desiredDir: 'left' | 'right' | null = null;
      let lcReason: 'navigation' | 'obstacle' | 'lane-preference' | 'none' = 'none';
      let explicitTargetLane: number | null = null;

      const requiredLeadM = this.computeStrategicLeadM(
        route,
        bestSecIdx,
        Math.abs(strategicLane - this.activeApproachLane),
        vehicle.speed,
        upcoming,
        config,
      );

      // Priority A: Navigation / Free-Drive Exit / Lane-Ending strategic lane positioning
      if (strategicLane !== this.activeApproachLane && upcoming.valid && upcoming.distanceToJunctionEntryM <= requiredLeadM) {
        desiredDir = strategicLane < this.activeApproachLane ? 'left' : 'right';
        lcReason = 'navigation';
        if (ot.active) this.resetOvertaking();
      } else if (desiredEndTarget !== this.activeApproachLane && remainingOnSection <= Math.max(95, vehicle.speed * 5.0)) {
        desiredDir = desiredEndTarget < this.activeApproachLane ? 'left' : 'right';
        lcReason = 'navigation';
        if (ot.active) this.resetOvertaking();
      }
      // Priority B: Obstacle avoidance / overtaking lane change requested by ObstacleAvoidanceController
      else if (obstacle && obstacle.avoidanceRequest !== 'none') {
        const candidateLane = this.activeApproachLane + (obstacle.avoidanceRequest === 'left' ? -1 : 1);
        const navCompatible =
          !upcoming.valid ||
          upcoming.distanceToJunctionEntryM > config.preJunctionSolidZoneM + 35 ||
          candidateLane === strategicLane ||
          Boolean(obstacle.allowSolidBypass);
        if (candidateLane >= 0 && candidateLane < approachCount && navCompatible) {
          desiredDir = obstacle.avoidanceRequest;
          lcReason = 'obstacle';
        }
      }
      // Priority C: Complete overtaking by safely returning to original cruising lane
      else if (ot.active && ot.phase === 'passing') {
        ot.passedElapsedSeconds += dt;
        ot.originalLaneIndex = clampADAS(ot.originalLaneIndex, 0, approachCount - 1);

        if (strategicLane === this.activeApproachLane && upcoming.valid && upcoming.distanceToJunctionEntryM <= requiredLeadM) {
          this.resetOvertaking();
        } else if (ot.originalLaneIndex !== this.activeApproachLane) {
          let behindGap = -Infinity;
          if (obstacle?.overtakenActorFound) {
            behindGap = obstacle.overtakenActorBehindGapM;
          } else {
            this.overtakePassedDistFallback += Math.max(0, vehicle.speed - ot.leadSpeedSnapshotMps) * dt;
            behindGap = this.overtakePassedDistFallback;
          }

          const requiredRearClearanceM = Math.max(config.overtakingPassClearanceM, vehicle.vehicleLength * 1.5, 7.5);
          if (behindGap >= requiredRearClearanceM) {
            this.overtakeReturnWaitTimer += dt;
          } else if (obstacle?.overtakenActorFound) {
            this.overtakeReturnWaitTimer = 0;
          }

          if (this.overtakeReturnWaitTimer >= config.overtakingReturnDelayS) {
            const returnDir: 'left' | 'right' = ot.originalLaneIndex < this.activeApproachLane ? 'left' : 'right';
            const returnClearance = obstacle ? (returnDir === 'left' ? obstacle.leftLane : obstacle.rightLane) : null;
            const returnFrontClear =
              !returnClearance ||
              !Number.isFinite(returnClearance.frontGapM) ||
              returnClearance.frontGapM > Math.max(55, vehicle.speed * 2.5) ||
              returnClearance.frontSpeedMps >= Math.min(out.currentSpeedLimitMps - 2.0, vehicle.speed - 2.0);
            const returnRearClear =
              !returnClearance ||
              !Number.isFinite(returnClearance.rearGapM) ||
              returnClearance.rearGapM >= requiredRearClearanceM * 0.85;

            if (
              returnClearance &&
              returnClearance.safe &&
              returnClearance.boundaryCrossable &&
              returnClearance.routeCompatible &&
              returnFrontClear &&
              returnRearClear
            ) {
              desiredDir = returnDir;
              lcReason = 'lane-preference';
              explicitTargetLane = this.activeApproachLane + (returnDir === 'left' ? -1 : 1);
            }
          }

          if (ot.passedElapsedSeconds > 20) {
            this.resetOvertaking();
          }
        } else {
          this.resetOvertaking();
        }
      }
      // Priority D: Driver explicit manual turn-signal -> safe legal lane change (never crosses solid/blocked)
      else if (manualSignalIntent !== null && !this.manualSignalConsumedForLc && !this.driverDivergedFromNav) {
        const nearTurnMatch =
          upcoming.valid &&
          upcoming.distanceToJunctionEntryM <= 55 &&
          ((manualSignalIntent === 'left' && upcoming.turnDirection === 'left') ||
            (manualSignalIntent === 'right' && (upcoming.turnDirection === 'right' || upcoming.isRampTransition)));
        if (!nearTurnMatch && !out.nearJunctionSolidZone) {
          desiredDir = manualSignalIntent;
          lcReason = 'lane-preference';
        }
      }

      if (desiredDir !== null && lcReason !== 'none') {
        const targetLaneIdx = explicitTargetLane ?? (this.activeApproachLane + (desiredDir === 'left' ? -1 : 1));
        const boundary = desiredDir === 'left' ? this.currentLaneDesc.leftBoundary : this.currentLaneDesc.rightBoundary;
        const clearance = obstacle ? (desiredDir === 'left' ? obstacle.leftLane : obstacle.rightLane) : null;
        const allowSolid = obstacle?.allowSolidBypass === true;
        const crossable = boundary === 'dashed' || (allowSolid && boundary === 'solid');
        const clearSafe = clearance ? clearance.safe && (clearance.boundaryCrossable || allowSolid) : true;

        if (
          targetLaneIdx >= 0 &&
          targetLaneIdx < approachCount &&
          crossable &&
          clearSafe
        ) {
          this.laneChangeAllowSolid = allowSolid && boundary === 'solid';
          this.manualLcActive = manualSignalIntent !== null && lcReason === 'lane-preference' && !ot.active;
          this.startLaneChange(
            desiredDir,
            this.activeApproachLane,
            targetLaneIdx,
            this.currentLaneDesc.laneWidth,
            lcReason,
            vehicle.speed,
            config,
            vehicle,
          );
          if (this.manualLcActive && out.laneChange.active) {
            // Driver already toggled turn signal -> shorten redundant pre-blink dwell cleanly
            out.laneChange.signalLeadSeconds = Math.min(out.laneChange.signalLeadSeconds, 0.45);
          }
          if (lcReason === 'obstacle' && obstacle && !obstacle.leadIsStatic && !obstacle.allowSolidBypass && config.overtakingEnabled) {
            ot.active = true;
            ot.phase = 'preparing';
            ot.targetActorId = obstacle.overtakeActorId || obstacle.leadActorId;
            ot.originalLaneIndex = this.activeApproachLane;
            ot.passingLaneIndex = targetLaneIdx;
            ot.elapsedSeconds = 0;
            ot.passedElapsedSeconds = 0;
            ot.leadSpeedSnapshotMps = Number.isFinite(obstacle.leadSpeedMps) ? Math.max(0, obstacle.leadSpeedMps) : 0;
            ot.overtakeTargetSpeedMps = out.currentSpeedLimitMps;
            this.overtakeReturnWaitTimer = 0;
            this.overtakePassedDistFallback = 0;
          } else if (lcReason === 'lane-preference' && ot.active) {
            ot.phase = 'returning';
          }
        }
      }
    }

    // 6. Build smoothed continuous local trajectory covering [LOOK_BEHIND_M behind, LOOK_AHEAD_M ahead].
    const sampleCount = this.buildLocalPath(
      route,
      bestSecIdx,
      secProj.along,
      this.activeApproachLane,
      rawNetwork,
      config,
    );
    out.sampleCount = sampleCount;

    if (sampleCount < 2) {
      return this.updateMapDegraded(dt, vehicle, config, obstacle, '前方路径点不足，进入降级保持');
    }

    // Smooth yaw and compute central-difference curvature along built samples.
    this.computeSmoothYawAndCurvature(sampleCount);

    // 7. Project vehicle onto the built smoothed lane trajectory for accurate cross-track & heading error.
    let bestIdx = 0;
    let bestDistSq = Infinity;
    for (let i = 0; i < sampleCount; i++) {
      const sp = out.samples[i]!;
      const dx = vehicle.x - sp.x;
      const dz = vehicle.z - sp.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }

    // Refine projection along segment
    const egoSample = out.samples[bestIdx]!;
    const cosY = Math.cos(egoSample.yaw);
    const sinY = Math.sin(egoSample.yaw);
    const dxE = vehicle.x - egoSample.x;
    const dzE = vehicle.z - egoSample.z;
    const alongDelta = -dxE * sinY - dzE * cosY;
    const rawLateralOffset = dxE * cosY - dzE * sinY;

    // Smooth entry taper when recovering from MAP_DEGRADED to prevent abrupt steering step or road snap
    if (recoveringFromDegraded && Math.abs(rawLateralOffset) > 0.35) {
      this.activeEntryStartAlongM = Math.max(0, secProj.along);
      this.activeEntryLatOffsetM = clampADAS(rawLateralOffset, -2.5, 2.5);
      this.activeEntryTaperLenM = clampADAS(Math.abs(rawLateralOffset) * 14, 18, 42);
    }

    // Incorporate smooth quintic lane-change offset
    const lcShift = this.getActiveLaneChangeLateralShift();
    const lcHeadingShift = this.getActiveLaneChangeHeadingShift(vehicle.speed);

    out.egoSampleIndex = bestIdx;
    out.egoS = egoSample.s + alongDelta;
    out.lateralOffsetM = rawLateralOffset - lcShift;
    out.headingErrorRad = wrapADASAngle((egoSample.yaw - lcHeadingShift) - vehicle.yaw);

    // Check if vehicle has drifted dangerously far off-route / off-road
    const maxAllowedLateralM = Math.max(road.width * 0.75 + 4.5, 9.0);
    if (Math.abs(rawLateralOffset) > maxAllowedLateralM && !driverSteeringOverride) {
      out.valid = false;
      out.unavailableReason = '车辆偏离车道过远，请人工接管';
      out.desiredTurnSignal = null;
      return out;
    }

    // 8. Populate current lane/road metadata & degraded check.
    out.currentRoadId = road.id;
    out.currentRoadName = road.name ?? road.routeNumber ?? road.id;
    out.currentRoadType = road.roadType;
    out.currentRoadFunction = road.roadFunction;
    out.currentIsHighwayTransition = Boolean(road.highwayTransition);
    out.currentLaneId = this.currentLaneDesc.laneId;
    out.currentLaneIndex = this.currentLaneDesc.logicalIndex;
    out.currentApproachLaneIndex = this.activeApproachLane;
    out.currentApproachLaneCount = approachCount;
    out.currentLaneWidth = this.currentLaneDesc.laneWidth;
    out.leftBoundary = this.currentLaneDesc.leftBoundary;
    out.rightBoundary = this.currentLaneDesc.rightBoundary;
    out.currentSpeedLimitMps = egoSample.speedLimitMps;
    out.speedLimitEstimated = egoSample.speedLimitEstimated;
    out.derivedLaneGeometry = this.currentLaneDesc.derived;
    out.degraded = this.currentLaneDesc.derived;
    out.confidence = this.currentLaneDesc.derived ? 0.75 : 1.0;
    out.valid = true;
    out.unavailableReason = '';
    this.lastValidSampleCount = sampleCount;

    // 9. Determine explicit maneuver & maneuver-driven turn signal
    this.resolveManeuverAndTurnSignal(dt, vehicle, upcoming, out.remainingRouteDistanceM, config, out);
    out.activeIntent = this.resolveActiveIntent(out, manualSignalIntent);

    // Keep upcoming junction distances synchronized with egoS
    if (upcoming.valid) {
      upcoming.laneId = this.currentLaneDesc.laneId;
      upcoming.approachLaneIndex = this.activeApproachLane;
      upcoming.approachLaneCount = approachCount;
    }

    void remainingOnSection;
    return out;
  }

  private cancelLaneChange(): void {
    this.laneChangeAllowSolid = false;
    const lc = this.snapshot.laneChange;
    lc.active = false;
    lc.reason = 'none';
    lc.direction = null;
    lc.phase = 'idle';
    lc.elapsedSeconds = 0;
    lc.lateralDeltaM = 0;
  }

  private resetOvertaking(): void {
    const ot = this.snapshot.overtaking;
    ot.active = false;
    ot.phase = 'none';
    ot.targetActorId = '';
    ot.originalLaneIndex = 0;
    ot.passingLaneIndex = 0;
    ot.elapsedSeconds = 0;
    ot.passedElapsedSeconds = 0;
    ot.leadSpeedSnapshotMps = 0;
    ot.overtakeTargetSpeedMps = 0;
    this.overtakeReturnWaitTimer = 0;
    this.overtakePassedDistFallback = 0;
  }

  private startLaneChange(
    direction: 'left' | 'right',
    fromLane: number,
    toLane: number,
    laneWidth: number,
    reason: 'navigation' | 'obstacle' | 'lane-preference',
    speedMps: number,
    config: Readonly<ADASConfig>,
    vehicle?: ADASVehicleState,
  ): void {
    const lc = this.snapshot.laneChange;
    const deltaM = direction === 'right' ? laneWidth : -laneWidth;
    const grip = clampADAS(vehicle?.roadGripMultiplier ?? 1.0, 0.45, 1.05);
    const wheelbaseScale = clampADAS((vehicle?.wheelBase ?? 2.85) / 2.85, 0.94, 1.15);
    // Quintic polynomial peak lateral accel: a_max = 5.7735 * |delta| / T^2
    const baseMaxLatAccel =
      reason === 'obstacle' && speedMps > 16
        ? Math.max(config.laneChangeMaxLatAccelMps2, config.laneChangeMaxLatAccelMps2 * 1.45)
        : config.laneChangeMaxLatAccelMps2;
    const effectiveMaxLatAccel = baseMaxLatAccel * Math.max(0.55, grip);
    const minDurationForComfort = Math.sqrt((5.7735 * Math.abs(deltaM)) / Math.max(0.45, effectiveMaxLatAccel)) * wheelbaseScale;
    const speedAdjusted = speedMps < 8 ? Math.max(minDurationForComfort, 3.6) : minDurationForComfort;
    lc.active = true;
    lc.reason = reason;
    lc.direction = direction;
    lc.fromLaneIndex = fromLane;
    lc.toLaneIndex = toLane;
    lc.phase = 'signaling';
    lc.elapsedSeconds = 0;
    lc.signalLeadSeconds = Math.max(1.8, Math.min(3.2, config.laneChangeSignalLeadS));
    lc.durationSeconds = clampADAS(speedAdjusted, 2.8, 5.2);
    lc.lateralDeltaM = deltaM;
  }

  private resolveManeuverAndTurnSignal(
    dt: number,
    vehicle: ADASVehicleState,
    upcoming: ADASPlanSnapshot['upcomingJunction'],
    remainingRouteM: number,
    config: Readonly<ADASConfig>,
    out: ADASPlanSnapshot,
  ): void {
    // 1. Active lane change owns maneuver & turn signal (blinks during signaling + executing)
    if (out.laneChange.active) {
      out.maneuver = out.laneChange.direction === 'left' ? 'LANE_CHANGE_LEFT' : 'LANE_CHANGE_RIGHT';
      out.desiredTurnSignal = out.laneChange.phase === 'settling' ? null : out.laneChange.direction;
      this.activeTurnSignalDirection = null;
      this.turnSignalHoldTimer = 0;
      return;
    }

    // 2. Arriving at destination.
    if (remainingRouteM < 30) {
      out.maneuver = 'ARRIVING';
      out.desiredTurnSignal = null;
      this.activeTurnSignalDirection = null;
      return;
    }

    // 2b. Ambiguous T-junction waiting for driver signal -> approach stop without pre-flashing fake blinker
    if (out.awaitingJunctionIntent) {
      out.maneuver = 'APPROACH_STOP';
      out.desiredTurnSignal = null;
      this.activeTurnSignalDirection = null;
      return;
    }

    // 3. Upcoming junction turn, U-turn, or highway ramp transition.
    const isHighwayRoad = out.currentSpeedLimitMps >= 70 / 3.6 || out.currentRoadName.includes('高速') || out.currentRoadName.includes('快速');
    const isRampExitUpcoming =
      upcoming.valid &&
      upcoming.isRampTransition &&
      (upcoming.rampTransitionKind === 'exit' || upcoming.rampTransitionKind === 'deceleration');
    const leadDist = isRampExitUpcoming
      ? Math.max(config.turnSignalLeadM, vehicle.speed * 3.8, 75)
      : Math.max(config.turnSignalLeadM, vehicle.speed * 3.5);
    if (upcoming.valid && upcoming.turnDirection !== 'straight' && upcoming.distanceToJunctionEntryM <= leadDist) {
      if (upcoming.turnDirection === 'uturn' && isHighwayRoad) {
        // High-speed expressway: strictly forbid U-turn! Keep following mainline.
        out.maneuver = 'FOLLOW_LANE';
        out.desiredTurnSignal = null;
        this.activeTurnSignalDirection = null;
        return;
      }
      const dir: 'left' | 'right' = upcoming.turnDirection === 'right' ? 'right' : 'left';
      const isRampExit = upcoming.isRampTransition
        ? upcoming.rampTransitionKind === 'exit' || upcoming.rampTransitionKind === 'deceleration'
        : Boolean(upcoming.roadId && !upcoming.roadId.includes('ramp') && upcoming.junctionId.includes('ramp'));
      const isRampEnter = upcoming.isRampTransition
        ? upcoming.rampTransitionKind === 'merge' || upcoming.rampTransitionKind === 'acceleration'
        : Boolean(upcoming.roadId && upcoming.roadId.includes('ramp') && !upcoming.junctionId.endsWith(':ramp'));
      out.maneuver =
        upcoming.turnDirection === 'uturn'
          ? 'UTURN'
          : isRampExit
            ? 'EXIT_RAMP'
            : isRampEnter
              ? 'MERGE'
              : upcoming.turnDirection === 'right'
                ? 'TURN_RIGHT'
                : 'TURN_LEFT';
      out.desiredTurnSignal = dir;
      this.activeTurnSignalDirection = dir;
      this.lastJunctionIdForSignal = upcoming.junctionId;
      this.turnSignalHoldTimer = 2.0;
      return;
    }

    // 4. Vehicle is currently inside junction -> strictly preserve turn signal throughout entire turn
    if (out.inJunction && this.activeTurnSignalDirection !== null) {
      out.maneuver =
        out.maneuver === 'EXIT_RAMP' || out.maneuver === 'MERGE'
          ? out.maneuver
          : this.activeTurnSignalDirection === 'left'
            ? 'TURN_LEFT'
            : 'TURN_RIGHT';
      out.desiredTurnSignal = this.activeTurnSignalDirection;
      this.turnSignalHoldTimer = 2.0;
      return;
    }

    // 5. Exited junction/ramp: hold turn signal cleanly until heading/yaw stabilize or timer expires
    if (this.activeTurnSignalDirection !== null) {
      this.turnSignalHoldTimer = Math.max(0, this.turnSignalHoldTimer - dt);
      const stabilized =
        Math.abs(out.headingErrorRad) < 0.14 &&
        Math.abs(vehicle.yawRate) < 0.18 &&
        Math.abs(out.lateralOffsetM) < 0.7;
      if (stabilized || this.turnSignalHoldTimer <= 0) {
        this.activeTurnSignalDirection = null;
        this.turnSignalHoldTimer = 0;
        this.lastJunctionIdForSignal = '';
      } else {
        out.maneuver =
          out.maneuver === 'EXIT_RAMP' || out.maneuver === 'MERGE'
            ? out.maneuver
            : this.activeTurnSignalDirection === 'left'
              ? 'TURN_LEFT'
              : 'TURN_RIGHT';
        out.desiredTurnSignal = this.activeTurnSignalDirection;
        return;
      }
    }

    out.maneuver = 'FOLLOW_LANE';
    out.desiredTurnSignal = null;
    void this.lastJunctionIdForSignal;
  }

  private countApproachLanes(road: RoadSegmentData, forward: boolean): number {
    if (road.lanes && road.lanes.length > 0) {
      const targetDir = forward ? 'forward' : 'reverse';
      let count = 0;
      for (let i = 0; i < road.lanes.length; i++) {
        if (road.lanes[i]!.direction === targetDir) count++;
      }
      if (count > 0) return count;
    }
    return Math.max(1, Math.round(road.laneCountPerDirection || 1));
  }

  private describeLane(
    road: RoadSegmentData,
    forward: boolean,
    approachIndex: number,
    solidApproachZone: boolean,
    out: LaneDescriptor,
  ): void {
    const targetDir = forward ? 'forward' : 'reverse';
    const hasAuthoredLanes = Boolean(road.lanes && road.lanes.length > 0);
    let authoredMatch: LogicalLaneData | undefined;
    let approachCount = 0;

    if (hasAuthoredLanes && road.lanes) {
      for (let i = 0; i < road.lanes.length; i++) {
        if (road.lanes[i]!.direction === targetDir) approachCount++;
      }
      if (approachCount > 0) {
        const clamped = clampADAS(approachIndex, 0, approachCount - 1);
        // Find the `clamped`-th lane left-to-right from driver perspective:
        // forward: ascending index; reverse: descending index.
        let seen = 0;
        if (forward) {
          for (let i = 0; i < road.lanes.length; i++) {
            const l = road.lanes[i]!;
            if (l.direction !== targetDir) continue;
            if (seen === clamped) { authoredMatch = l; break; }
            seen++;
          }
        } else {
          for (let i = road.lanes.length - 1; i >= 0; i--) {
            const l = road.lanes[i]!;
            if (l.direction !== targetDir) continue;
            if (seen === clamped) { authoredMatch = l; break; }
            seen++;
          }
        }
      }
    }

    if (authoredMatch && approachCount > 0) {
      const clamped = clampADAS(approachIndex, 0, approachCount - 1);
      const roadRightOffset = -road.width * 0.5 + (authoredMatch.index + 0.5) * authoredMatch.width;
      out.laneId = authoredMatch.id;
      out.logicalIndex = authoredMatch.index;
      out.approachIndex = clamped;
      out.approachCount = approachCount;
      out.laneWidth = authoredMatch.width;
      out.travelRightOffset = forward ? roadRightOffset : -roadRightOffset;
      out.derived = false;
    } else {
      // Derive conservative lane geometry from road-level metadata without inventing connections.
      const count = Math.max(1, Math.round(road.laneCountPerDirection || 1));
      const clamped = clampADAS(approachIndex, 0, count - 1);
      const twoWay = road.travelDirection === 'two-way';
      const totalLanes = twoWay ? count * 2 : count;
      const lw =
        Number.isFinite(road.laneWidth) && road.laneWidth >= 2.4 && road.laneWidth <= 5.0
          ? road.laneWidth
          : road.width / totalLanes;
      const travelRightOffset = twoWay
        ? (clamped + 0.5) * lw
        : -road.width * 0.5 + (clamped + 0.5) * lw;
      out.laneId = `${road.id}:derived:${forward ? 'f' : 'r'}:${clamped}`;
      out.logicalIndex = twoWay ? (forward ? count + clamped : count - 1 - clamped) : (forward ? clamped : count - 1 - clamped);
      out.approachIndex = clamped;
      out.approachCount = count;
      out.laneWidth = lw;
      out.travelRightOffset = travelRightOffset;
      out.derived = true;
    }

    const markingsSolid = road.markingsAvailable === false || solidApproachZone;
    const isTwoWay = road.travelDirection === 'two-way';
    out.leftBoundary =
      out.approachIndex === 0
        ? (isTwoWay ? 'median' : 'road-edge')
        : (markingsSolid ? 'solid' : 'dashed');
    out.rightBoundary =
      out.approachIndex >= out.approachCount - 1
        ? 'road-edge'
        : (markingsSolid ? 'solid' : 'dashed');
  }

  private detectVehicleApproachLane(vehicle: ADASVehicleState, section: RouteSection): number {
    const road = section.road;
    const proj = this.projectOntoPoints(vehicle.x, vehicle.z, section.points);
    const count = this.countApproachLanes(road, section.forward);
    let bestLane = 0;
    let bestErr = Infinity;
    for (let idx = 0; idx < count; idx++) {
      this.describeLane(road, section.forward, idx, false, this.tmpLaneDesc);
      const err = Math.abs(proj.lateralRight - this.tmpLaneDesc.travelRightOffset);
      if (err < bestErr) {
        bestErr = err;
        bestLane = idx;
      }
    }
    return bestLane;
  }

  private readonly tmpLaneDesc: LaneDescriptor = {
    laneId: '',
    logicalIndex: 0,
    approachIndex: 0,
    approachCount: 1,
    laneWidth: 3.5,
    travelRightOffset: 0,
    derived: false,
    leftBoundary: 'unavailable',
    rightBoundary: 'unavailable',
  };

  private findBestSectionIndex(vehicle: ADASVehicleState, route: PlannedRoute): number {
    const sections = route.sections;
    const n = sections.length;
    if (n === 0) return -1;

    // Search a local window around activeSectionIndex first, then fallback to full route sections (usually < 40).
    let bestIdx = -1;
    let bestScore = Infinity;

    // Pre-compute whether ego is still cleanly inside activeSectionIndex for mainline<->ramp hysteresis
    let activeSecStillValid = false;
    if (this.activeSectionIndex >= 0 && this.activeSectionIndex < n) {
      const curProj = this.projectOntoPoints(vehicle.x, vehicle.z, sections[this.activeSectionIndex]!.points);
      activeSecStillValid = curProj.along <= curProj.totalLength + 2.0 && curProj.endDist < 5.0;
    }

    const evaluateSection = (i: number) => {
      const sec = sections[i]!;
      const proj = this.projectOntoPoints(vehicle.x, vehicle.z, sec.points);
      const heightErr = Math.abs(vehicle.y - proj.y);
      if (heightErr > 3.2) return;
      const headingErr = Math.abs(wrapADASAngle(proj.yaw - vehicle.yaw));
      if (headingErr > 1.1) return;
      const maxLat = Math.max(sec.road.width * 0.8 + 8, 14);
      if (Math.abs(proj.lateralRight) > maxLat && proj.endDist > 16) return;
      // Progression hysteresis prevents mainline <-> ramp flip-flopping on overlapping segments
      const backwardPenalty = activeSecStillValid ? 28 : 8;
      const orderPenalty = i < this.activeSectionIndex ? backwardPenalty : i > this.activeSectionIndex + 2 ? 3 : 0;
      const score = Math.abs(proj.lateralRight) + proj.endDist * 1.4 + headingErr * 6 + heightErr * 8 + orderPenalty;
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    };

    const start = Math.max(0, this.activeSectionIndex - 1);
    const end = Math.min(n - 1, this.activeSectionIndex + 4);
    for (let i = start; i <= end; i++) evaluateSection(i);

    if (bestIdx < 0 || bestScore > 20) {
      for (let i = 0; i < n; i++) {
        if (i >= start && i <= end) continue;
        evaluateSection(i);
      }
    }
    return bestIdx;
  }

  private analyzeUpcomingJunction(
    route: PlannedRoute,
    currentSecIdx: number,
    alongCurrent: number,
    currentTotalLen: number,
    currentApproachLane: number,
    network: RoadNetworkData | undefined,
    out: ADASPlanSnapshot['upcomingJunction'],
    config: Readonly<ADASConfig>,
  ): void {
    out.valid = false;
    out.junctionId = '';
    out.roadId = '';
    out.laneId = '';
    out.turnDirection = 'straight';
    out.distanceToStopLineM = Infinity;
    out.distanceToJunctionEntryM = Infinity;
    out.distanceToJunctionExitM = Infinity;
    out.controlKind = undefined;
    out.isRampTransition = false;
    out.rampTransitionKind = 'none';

    const maxLookahead = Math.max(LOOK_AHEAD_M, config.rampExitLookAheadDistanceM ?? 600);
    let distAccum = Math.max(0, currentTotalLen - alongCurrent);
    for (let i = currentSecIdx; i < route.sections.length - 1 && distAccum <= maxLookahead; i++) {
      const fromSec = route.sections[i]!;
      const toSec = route.sections[i + 1]!;

      const turnAngle = this.computeSectionTurnAngle(fromSec, toSec);
      const turnDir = classifyTurnAngle(turnAngle);
      const connector = toSec.connector;
      const via = connector && connector.length >= 3 ? connector[1] : undefined;
      const fromEndPt = fromSec.points[fromSec.points.length - 1]!;
      const toStartPt = toSec.points[0]!;
      const intersection = this.findMatchingIntersection(network, via ?? fromEndPt);

      const fromIsRamp = fromSec.road.roadType === 'ramp';
      const toIsRamp = toSec.road.roadType === 'ramp';
      const isDirectRampTransition = (!fromIsRamp && toIsRamp) || (fromIsRamp && !toIsRamp);
      const isSplitToRamp =
        !intersection &&
        fromSec.road.roadType === 'highway' &&
        toSec.road.roadType === 'highway' &&
        route.sections[i + 2]?.road.roadType === 'ramp';
      const isRampTransition = isDirectRampTransition || isSplitToRamp;

      const isSignificant =
        intersection !== undefined ||
        turnDir !== 'straight' ||
        (connector !== undefined && connector.length >= 3) ||
        isDirectRampTransition;
      if (isSignificant) {
        const stopBackOffset = isRampTransition
          ? 0
          : this.computeStopLineBackOffset(fromSec, intersection, toSec);
        const connectorLen = this.computeConnectorLength(fromEndPt, via, toStartPt);
        const exitYaw = this.sectionStartYaw(toSec);

        let effectiveTurnDir = turnDir;
        if (effectiveTurnDir === 'straight' && isRampTransition) {
          if (!fromIsRamp && (toIsRamp || isSplitToRamp)) {
            effectiveTurnDir = turnAngle < -0.04 ? 'left' : 'right';
          } else {
            effectiveTurnDir = turnAngle > 0.04 ? 'right' : 'left';
          }
        }

        out.valid = true;
        out.junctionId = intersection?.id ?? `junction:${fromSec.road.id}:${toSec.road.id}`;
        out.roadId = fromSec.road.id;
        this.describeLane(fromSec.road, fromSec.forward, currentApproachLane, false, this.tmpLaneDesc);
        out.laneId = this.tmpLaneDesc.laneId;
        out.approachLaneIndex = this.tmpLaneDesc.approachIndex;
        out.approachLaneCount = this.tmpLaneDesc.approachCount;
        out.turnDirection = effectiveTurnDir;
        out.isRampTransition = isRampTransition;
        out.rampTransitionKind = isSplitToRamp
          ? 'deceleration'
          : !fromIsRamp && toIsRamp
            ? fromSec.road.roadType === 'highway'
              ? 'exit'
              : 'deceleration'
            : fromIsRamp && !toIsRamp
              ? 'merge'
              : 'none';
        out.distanceToJunctionEntryM = distAccum;
        out.distanceToStopLineM = distAccum - stopBackOffset;
        out.distanceToJunctionExitM = distAccum + connectorLen;
        out.centerX = intersection?.center.x ?? via?.x ?? (fromEndPt.x + toStartPt.x) * 0.5;
        out.centerY = intersection?.center.y ?? via?.y ?? (fromEndPt.y ?? 0);
        out.centerZ = intersection?.center.z ?? via?.z ?? (fromEndPt.z + toStartPt.z) * 0.5;
        out.halfExtentX = intersection?.halfExtentX ?? 10;
        out.halfExtentZ = intersection?.halfExtentZ ?? 10;
        out.exitX = toStartPt.x;
        out.exitZ = toStartPt.z;
        out.exitYaw = exitYaw;

        if (intersection) {
          for (let a = 0; a < intersection.arms.length; a++) {
            const arm = intersection.arms[a]!;
            if (arm.segmentId === fromSec.road.id && arm.trafficSignal) {
              out.controlKind = arm.trafficSignal.controlKind;
              break;
            }
          }
        }
        return;
      }

      distAccum += toSec.distance;
    }
  }

  private computeStrategicLeadM(
    route: PlannedRoute,
    currentSecIdx: number,
    lanesToShift: number,
    vehicleSpeedMps: number,
    upcoming: ADASPlanSnapshot['upcomingJunction'],
    config: Readonly<ADASConfig>,
  ): number {
    const nextSec = route.sections[currentSecIdx + 1];
    const currentSec = route.sections[currentSecIdx]!;
    const isHighway = (currentSec.road.speedLimit && currentSec.road.speedLimit >= 70) || currentSec.road.roadType === 'highway';
    const isRampExit =
      (nextSec && nextSec.road.roadType === 'ramp' && currentSec.road.roadType !== 'ramp') ||
      (upcoming.isRampTransition === true && (upcoming.rampTransitionKind === 'exit' || upcoming.rampTransitionKind === 'deceleration'));
    if (!isRampExit && !isHighway) {
      return config.strategicLaneChangeLeadM;
    }
    const perLaneM = Math.max(config.perLaneChangeLeadDistanceM, vehicleSpeedMps * 6.8);
    const marginM = isRampExit ? 95 : 0;
    return Math.min(
      config.rampExitLookAheadDistanceM ?? 600,
      Math.max(config.strategicLaneChangeLeadM, Math.max(1, lanesToShift) * perLaneM + marginM),
    );
  }

  private selectStrategicLane(
    route: PlannedRoute,
    currentSecIdx: number,
    approachCount: number,
    currentLane: number,
    vehicleSpeedMps: number,
    upcoming: ADASPlanSnapshot['upcomingJunction'],
    world: ADASWorldContext,
    config: Readonly<ADASConfig>,
  ): number {
    if (approachCount <= 1 || !upcoming.valid) return currentLane;
    const nextSec = route.sections[currentSecIdx + 1];
    const currentSec = route.sections[currentSecIdx]!;
    const isHighway = (currentSec.road.speedLimit && currentSec.road.speedLimit >= 70) || currentSec.road.roadType === 'highway';
    const isRampExit =
      (nextSec && nextSec.road.roadType === 'ramp' && currentSec.road.roadType !== 'ramp') ||
      (upcoming.isRampTransition === true && (upcoming.rampTransitionKind === 'exit' || upcoming.rampTransitionKind === 'deceleration'));
    const requiredLead = this.computeStrategicLeadM(
      route,
      currentSecIdx,
      Math.max(1, approachCount - 1 - currentLane),
      vehicleSpeedMps,
      upcoming,
      config,
    );

    if (upcoming.distanceToJunctionEntryM > requiredLead) return currentLane;

    if (isRampExit) {
      return approachCount - 1;
    }

    if (upcoming.turnDirection === 'uturn') {
      if (isHighway) {
        // Highway: U-turn strictly forbidden! Keep straight in current lane.
        return currentLane;
      }
      return 0;
    }
    if (upcoming.turnDirection === 'left') return 0;
    if (upcoming.turnDirection === 'right') return approachCount - 1;

    // For straight movement, check if traffic signal lane metadata indicates current lane is turn-only
    if (world.trafficSignals && upcoming.roadId === currentSec.road.id) {
      const jSig = world.trafficSignals.getJunctionSignal(upcoming.junctionId);
      if (jSig) {
        let bestLane = currentLane;
        let bestDist = Infinity;
        for (let i = 0; i < jSig.lanes.length; i++) {
          const l = jSig.lanes[i]!;
          if (l.roadId !== currentSec.road.id) continue;
          if (!l.movements.some(m => m.movement === 'straight')) continue;
          const d = Math.abs(l.approachLaneIndex - currentLane);
          if (d < bestDist) {
            bestDist = d;
            bestLane = clampADAS(l.approachLaneIndex, 0, approachCount - 1);
          }
        }
        if (bestDist < Infinity) return bestLane;
      }
    }

    return currentLane;
  }

  private buildLocalPath(
    route: PlannedRoute,
    startSecIdx: number,
    egoAlongStartSec: number,
    startApproachLane: number,
    network: RoadNetworkData | undefined,
    config: Readonly<ADASConfig>,
  ): number {
    this.samplesApproachLane = startApproachLane;
    const samples = this.snapshot.samples;
    let count = 0;
    let sCursor = 0;
    let laneForSection = startApproachLane;
    let pendingSeamLatOffsetM = this.activeEntryLatOffsetM;
    let pendingSeamTaperLenM = this.activeEntryTaperLenM;

    for (let secIdx = startSecIdx; secIdx < route.sections.length && count < MAX_PATH_SAMPLES && sCursor < LOOK_AHEAD_M + LOOK_BEHIND_M; secIdx++) {
      const sec = route.sections[secIdx]!;
      const road = sec.road;
      const secApproachCount = this.countApproachLanes(road, sec.forward);
      laneForSection = clampADAS(laneForSection, 0, secApproachCount - 1);

      const speedInfo = resolveRoadSpeedLimit(
        road.speedLimit,
        road.roadType,
        road.roadFunction,
        config.defaultSpeedLimitKmh,
      );

      this.describeLane(road, sec.forward, laneForSection, false, this.laneDescScratch);
      const pts = sec.points;
      const totalLen = this.fillCumDist(pts);
      const fromS = secIdx === startSecIdx ? Math.max(0, egoAlongStartSec - LOOK_BEHIND_M) : 0;
      const taperStartAlong = secIdx === startSecIdx ? this.activeEntryStartAlongM : 0;
      const hasTaper = Math.abs(pendingSeamLatOffsetM) > 0.05 && pendingSeamTaperLenM > 0.5;

      // Sample section smoothly at SAMPLE_SPACING_M intervals (applying C2 quintic longitudinal seam taper if entering shifted seam)
      for (let along = fromS; along <= totalLen + 0.01 && count < MAX_PATH_SAMPLES; along += SAMPLE_SPACING_M) {
        const clampedAlong = Math.min(totalLen, along);
        let rightOffset = this.laneDescScratch.travelRightOffset;
        if (hasTaper) {
          const taperRelAlong = clampedAlong - taperStartAlong;
          if (taperRelAlong < 0) {
            rightOffset += pendingSeamLatOffsetM;
          } else if (taperRelAlong < pendingSeamTaperLenM) {
            const u = clampADAS(taperRelAlong / pendingSeamTaperLenM, 0, 1);
            const quintic = u * u * u * (10 + u * (-15 + 6 * u));
            rightOffset += pendingSeamLatOffsetM * (1 - quintic);
          }
        }
        this.sampleLanePoint(pts, totalLen, clampedAlong, rightOffset, this.tmpA);

        const sp = samples[count]!;
        if (count > 0) {
          const prev = samples[count - 1]!;
          const stepDist = Math.hypot(this.tmpA.x - prev.x, this.tmpA.z - prev.z);
          if (stepDist < 0.15) continue;
          sCursor += stepDist;
        }
        sp.s = sCursor;
        sp.x = this.tmpA.x;
        sp.y = this.tmpA.y;
        sp.z = this.tmpA.z;
        sp.yaw = this.tmpA.yaw;
        sp.curvature = 0;
        sp.speedLimitMps = speedInfo.speedMps;
        sp.speedLimitEstimated = speedInfo.estimated;
        sp.roadId = road.id;
        sp.laneId = this.laneDescScratch.laneId;
        sp.laneIndex = this.laneDescScratch.logicalIndex;
        sp.approachLaneIndex = this.laneDescScratch.approachIndex;
        sp.approachLaneCount = this.laneDescScratch.approachCount;
        sp.laneWidth = this.laneDescScratch.laneWidth;
        sp.leftBoundary = this.laneDescScratch.leftBoundary;
        sp.rightBoundary = this.laneDescScratch.rightBoundary;
        sp.isJunction = false;
        sp.junctionId = '';
        sp.sectionIndex = secIdx;
        count++;

        if (clampedAlong >= totalLen) break;
        if (sCursor >= LOOK_AHEAD_M + LOOK_BEHIND_M) break;
      }

      pendingSeamLatOffsetM = 0;
      pendingSeamTaperLenM = 0;

      // If there is a next section, select transition strategy:
      //  - Zero-gap tangential highway/ramp/split seam -> C2 quintic longitudinal taper along outgoing section
      //  - Urban junction / large-angle / gap intersection -> smooth cubic Bezier transition arc
      if (secIdx + 1 < route.sections.length && count < MAX_PATH_SAMPLES && sCursor < LOOK_AHEAD_M + LOOK_BEHIND_M) {
        const nextSec = route.sections[secIdx + 1]!;
        const nextApproachCount = this.countApproachLanes(nextSec.road, nextSec.forward);
        const turnAngle = this.computeSectionTurnAngle(sec, nextSec);
        const turnDir = classifyTurnAngle(turnAngle);

        // Select receiving lane on outgoing road cleanly (ramp merge lands in rightmost receiving lane)
        let targetNextLane = clampADAS(laneForSection, 0, nextApproachCount - 1);
        if (sec.road.roadType === 'ramp' && nextSec.road.roadType !== 'ramp' && nextApproachCount > 1) {
          targetNextLane = nextApproachCount - 1;
        } else if (turnDir === 'left') {
          targetNextLane = 0;
        } else if (turnDir === 'right' || turnDir === 'uturn') {
          targetNextLane = nextApproachCount - 1;
        }

        this.describeLane(nextSec.road, nextSec.forward, targetNextLane, false, this.nextLaneDescScratch);
        const nextTotalLen = this.fillCumDist(nextSec.points);
        this.sampleLanePoint(nextSec.points, nextTotalLen, 0, this.nextLaneDescScratch.travelRightOffset, this.p3);

        // Re-sample end of current section into p0
        const curTotalLen = this.fillCumDist(pts);
        this.sampleLanePoint(pts, curTotalLen, curTotalLen, this.laneDescScratch.travelRightOffset, this.p0);

        const endPtSec = pts[pts.length - 1]!;
        const startPtNext = nextSec.points[0]!;
        const clGap = Math.hypot(startPtNext.x - endPtSec.x, startPtNext.z - endPtSec.z);
        const seamDx = this.p3.x - this.p0.x;
        const seamDz = this.p3.z - this.p0.z;
        const gap = Math.hypot(seamDx, seamDz);
        const f0x = -Math.sin(this.p0.yaw);
        const f0z = -Math.cos(this.p0.yaw);
        const r0x = Math.cos(this.p0.yaw);
        const r0z = -Math.sin(this.p0.yaw);
        const alongGap = seamDx * f0x + seamDz * f0z;
        const latGap = seamDx * r0x + seamDz * r0z;
        const yawDiff = Math.abs(wrapADASAngle(this.p3.yaw - this.p0.yaw));

        const isZeroGapTangentialSeam =
          turnDir !== 'uturn' &&
          clGap < 8.0 &&
          yawDiff < 0.45 &&
          alongGap < Math.max(8.0, Math.abs(latGap) * 2.2);

        if (isZeroGapTangentialSeam) {
          if (gap > 0.35 && nextTotalLen > 4.0) {
            const r3x = Math.cos(this.p3.yaw);
            const r3z = -Math.sin(this.p3.yaw);
            pendingSeamLatOffsetM = (this.p0.x - this.p3.x) * r3x + (this.p0.z - this.p3.z) * r3z;
            pendingSeamTaperLenM = clampADAS(
              Math.max(26, Math.abs(pendingSeamLatOffsetM) * 14.0),
              18,
              Math.max(18, nextTotalLen - 2.0),
            );
          }
        } else if (gap > 0.6 || turnDir === 'uturn') {
          const connector = nextSec.connector;
          const via = connector && connector.length >= 3 ? connector[1] : undefined;
          const intersection = this.findMatchingIntersection(network, via ?? pts[pts.length - 1]!);
          const junctionId = intersection?.id ?? `junction:${road.id}:${nextSec.road.id}`;

          // Compute cubic Bezier control points tangent to approach lane and receiving lane
          const t0x = -Math.sin(this.p0.yaw);
          const t0z = -Math.cos(this.p0.yaw);
          const t3x = -Math.sin(this.p3.yaw);
          const t3z = -Math.cos(this.p3.yaw);

          let h1 = gap * 0.4;
          let h2 = gap * 0.4;
          if (turnDir === 'uturn') {
            // Semicircular U-turn loop wide enough for real vehicle minimum turning radius (~5.5-6m)
            const minRadius = Math.max(7.5, gap * 0.75);
            h1 = minRadius * 1.33;
            h2 = minRadius * 1.33;
          } else if (turnDir === 'left' || turnDir === 'right') {
            // Solve intersection of approach ray (p0 + a*t0) and reverse exit ray (p3 - b*t3)
            const det = t0x * t3z - t0z * t3x;
            if (Math.abs(det) > 0.15) {
              const rx = this.p3.x - this.p0.x;
              const rz = this.p3.z - this.p0.z;
              const alpha = (rx * t3z - rz * t3x) / det;
              const beta = (rx * t0z - rz * t0x) / det;
              if (alpha > 1.0 && beta > 1.0 && alpha < gap * 1.65 && beta < gap * 1.65) {
                // 0.5523 approximates a circular arc for 90-deg turns cleanly without corner-cutting
                h1 = alpha * 0.56;
                h2 = beta * 0.56;
              }
            }
          }

          const c1x = this.p0.x + t0x * h1;
          const c1z = this.p0.z + t0z * h1;
          const c2x = this.p3.x - t3x * h2;
          const c2z = this.p3.z - t3z * h2;

          const approxArcLen = turnDir === 'uturn' ? Math.max(24, gap * 2.5) : gap * (turnDir === 'straight' ? 1.02 : 1.25);
          const steps = Math.max(3, Math.min(36, Math.ceil(approxArcLen / SAMPLE_SPACING_M)));
          const nextSpeed = resolveRoadSpeedLimit(
            nextSec.road.speedLimit,
            nextSec.road.roadType,
            nextSec.road.roadFunction,
            config.defaultSpeedLimitKmh,
          );
          const junctionSpeedMps = Math.min(speedInfo.speedMps, nextSpeed.speedMps);

          for (let k = 1; k < steps && count < MAX_PATH_SAMPLES; k++) {
            const u = k / steps;
            const om = 1 - u;
            const b0 = om * om * om;
            const b1 = 3 * om * om * u;
            const b2 = 3 * om * u * u;
            const b3 = u * u * u;

            const bx = b0 * this.p0.x + b1 * c1x + b2 * c2x + b3 * this.p3.x;
            const bz = b0 * this.p0.z + b1 * c1z + b2 * c2z + b3 * this.p3.z;
            const by = this.p0.y + (this.p3.y - this.p0.y) * u;

            const prev = samples[count - 1]!;
            const stepDist = Math.hypot(bx - prev.x, bz - prev.z);
            if (stepDist < 0.15) continue;
            sCursor += stepDist;

            const sp = samples[count]!;
            sp.s = sCursor;
            sp.x = bx;
            sp.y = by;
            sp.z = bz;
            sp.yaw = Math.atan2(-(bx - prev.x), -(bz - prev.z));
            sp.curvature = 0;
            sp.speedLimitMps = junctionSpeedMps;
            sp.speedLimitEstimated = speedInfo.estimated && nextSpeed.estimated;
            sp.roadId = road.id;
            sp.laneId = this.laneDescScratch.laneId;
            sp.laneIndex = this.laneDescScratch.logicalIndex;
            sp.approachLaneIndex = laneForSection;
            sp.approachLaneCount = secApproachCount;
            sp.laneWidth = this.laneDescScratch.laneWidth;
            sp.leftBoundary = 'solid';
            sp.rightBoundary = 'solid';
            sp.isJunction = true;
            sp.junctionId = junctionId;
            sp.sectionIndex = secIdx;
            count++;
          }
        }

        laneForSection = targetNextLane;
      }
    }

    return count;
  }

  private computeSmoothYawAndCurvature(count: number): void {
    const samples = this.snapshot.samples;
    if (count < 2) return;

    // 1. Central-difference tangent yaw
    for (let i = 0; i < count; i++) {
      const prev = samples[Math.max(0, i - 1)]!;
      const next = samples[Math.min(count - 1, i + 1)]!;
      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      if (dx * dx + dz * dz > 1e-6) {
        samples[i]!.yaw = Math.atan2(-dx, -dz);
      }
    }

    // 2. Smooth curvature over a +/- 2 sample window (~6 m span) to avoid vertex noise
    for (let i = 0; i < count; i++) {
      const i0 = Math.max(0, i - 2);
      const i1 = Math.min(count - 1, i + 2);
      const ds = samples[i1]!.s - samples[i0]!.s;
      if (ds > 0.25) {
        // Positive curvature = road turns right (yaw decreases)
        const dYaw = wrapADASAngle(samples[i1]!.yaw - samples[i0]!.yaw);
        samples[i]!.curvature = clampADAS(-dYaw / ds, -0.25, 0.25);
      } else {
        samples[i]!.curvature = 0;
      }
    }
  }

  private fillCumDist(points: readonly RoadPoint[]): number {
    const n = Math.min(points.length, this.sectionCumDist.length);
    this.sectionCumDist[0] = 0;
    let total = 0;
    for (let i = 1; i < n; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      total += Math.hypot(b.x - a.x, b.z - a.z);
      this.sectionCumDist[i] = total;
    }
    return total;
  }

  private sampleCenterlinePoint(
    points: readonly RoadPoint[],
    totalLen: number,
    s: number,
    out: { x: number; y: number; z: number; yaw: number },
  ): void {
    const n = Math.min(points.length, this.sectionCumDist.length);
    const clamped = clampADAS(s, 0, totalLen);
    for (let i = 1; i < n; i++) {
      const d1 = this.sectionCumDist[i]!;
      if (clamped <= d1 || i === n - 1) {
        const d0 = this.sectionCumDist[i - 1]!;
        const segLen = d1 - d0;
        const a = points[i - 1]!;
        const b = points[i]!;
        const t = segLen > 1e-6 ? clampADAS((clamped - d0) / segLen, 0, 1) : 0;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dy = (b.y ?? 0) - (a.y ?? 0);

        if (segLen > 1e-4 && n >= 3) {
          const ux = dx / segLen;
          const uz = dz / segLen;

          // Unit tangent at vertex `a` (C1 continuous when corner angle < ~30 deg)
          let t0x = ux;
          let t0z = uz;
          if (i >= 2) {
            const pPrev = points[i - 2]!;
            const inDx = a.x - pPrev.x;
            const inDz = a.z - pPrev.z;
            const inLen = Math.hypot(inDx, inDz);
            if (inLen > 1e-4 && (inDx * ux + inDz * uz) / inLen > 0.86) {
              const bx = inDx / inLen + ux;
              const bz = inDz / inLen + uz;
              const bLen = Math.hypot(bx, bz);
              if (bLen > 1e-4) {
                t0x = bx / bLen;
                t0z = bz / bLen;
              }
            }
          }

          // Unit tangent at vertex `b` (matches next segment's `t0` verbatim -> exact C1 continuity!)
          let t1x = ux;
          let t1z = uz;
          if (i + 1 < n) {
            const pNext = points[i + 1]!;
            const outDx = pNext.x - b.x;
            const outDz = pNext.z - b.z;
            const outLen = Math.hypot(outDx, outDz);
            if (outLen > 1e-4 && (outDx * ux + outDz * uz) / outLen > 0.86) {
              const bx = ux + outDx / outLen;
              const bz = uz + outDz / outLen;
              const bLen = Math.hypot(bx, bz);
              if (bLen > 1e-4) {
                t1x = bx / bLen;
                t1z = bz / bLen;
              }
            }
          }

          const t2 = t * t;
          const t3 = t2 * t;
          const h00 = 2 * t3 - 3 * t2 + 1;
          const h10 = t3 - 2 * t2 + t;
          const h01 = -2 * t3 + 3 * t2;
          const h11 = t3 - t2;

          out.x = h00 * a.x + h10 * (t0x * segLen) + h01 * b.x + h11 * (t1x * segLen);
          out.y = (a.y ?? 0) + dy * t;
          out.z = h00 * a.z + h10 * (t0z * segLen) + h01 * b.z + h11 * (t1z * segLen);

          // Analytical derivative along parameter `t`
          const dh00 = 6 * t2 - 6 * t;
          const dh10 = 3 * t2 - 4 * t + 1;
          const dh01 = -6 * t2 + 6 * t;
          const dh11 = 3 * t2 - 2 * t;
          const vx = dh00 * a.x + dh10 * (t0x * segLen) + dh01 * b.x + dh11 * (t1x * segLen);
          const vz = dh00 * a.z + dh10 * (t0z * segLen) + dh01 * b.z + dh11 * (t1z * segLen);
          out.yaw = Math.hypot(vx, vz) > 1e-4 ? Math.atan2(-vx, -vz) : Math.atan2(-dx, -dz);
          return;
        }

        out.x = a.x + dx * t;
        out.y = (a.y ?? 0) + dy * t;
        out.z = a.z + dz * t;
        out.yaw = Math.atan2(-dx, -dz);
        return;
      }
    }
    const p = points[0]!;
    out.x = p.x; out.y = p.y ?? 0; out.z = p.z; out.yaw = 0;
  }

  private sampleLanePoint(
    points: readonly RoadPoint[],
    totalLen: number,
    s: number,
    travelRightOffset: number,
    out: { x: number; y: number; z: number; yaw: number },
  ): void {
    this.sampleCenterlinePoint(points, totalLen, s, out);
    // Smooth tangent across a short +/- 3m secant so polyline corners don't kink lane offsets
    const sBack = Math.max(0, s - 3);
    const sFwd = Math.min(totalLen, s + 3);
    if (sFwd - sBack > 0.2) {
      this.sampleCenterlinePoint(points, totalLen, sBack, this.tmpB);
      const bx = this.tmpB.x, bz = this.tmpB.z;
      this.sampleCenterlinePoint(points, totalLen, sFwd, this.tmpB);
      const dx = this.tmpB.x - bx;
      const dz = this.tmpB.z - bz;
      if (dx * dx + dz * dz > 1e-6) {
        out.yaw = Math.atan2(-dx, -dz);
      }
    }
    // Right vector in travel frame is (cos(yaw), -sin(yaw))
    out.x += Math.cos(out.yaw) * travelRightOffset;
    out.z -= Math.sin(out.yaw) * travelRightOffset;
  }

  private readonly projResult = { along: 0, totalLength: 0, lateralRight: 0, y: 0, yaw: 0, endDist: 0 };

  private projectOntoPoints(x: number, z: number, points: readonly RoadPoint[]) {
    const out = this.projResult;
    let travelled = 0;
    let bestDistSq = Infinity;
    let bestAlong = 0;
    let bestLat = 0;
    let bestY = 0;
    let bestYaw = 0;
    let bestEndDist = 0;

    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-4) continue;
      const rawT = ((x - a.x) * dx + (z - a.z) * dz) / (len * len);
      const t = clampADAS(rawT, 0, 1);
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      const dSq = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestAlong = travelled + len * t;
        bestYaw = Math.atan2(-dx, -dz);
        bestLat = (x - px) * Math.cos(bestYaw) - (z - pz) * Math.sin(bestYaw);
        bestY = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t;
        bestEndDist = rawT < 0 ? -rawT * len : rawT > 1 ? (rawT - 1) * len : 0;
      }
      travelled += len;
    }

    out.along = bestAlong;
    out.totalLength = travelled;
    out.lateralRight = bestLat;
    out.y = bestY;
    out.yaw = bestYaw;
    out.endDist = bestEndDist;
    return out;
  }

  private computeSectionTurnAngle(fromSec: RouteSection, toSec: RouteSection): number {
    const fp = fromSec.points;
    const tp = toSec.points;
    if (fp.length < 2 || tp.length < 2) return 0;
    const a = fp[fp.length - 2]!;
    const b = fp[fp.length - 1]!;
    const c = tp[0]!;
    const d = tp[1]!;
    const v1x = b.x - a.x, v1z = b.z - a.z;
    const v2x = d.x - c.x, v2z = d.z - c.z;
    // Cross & dot in XZ plane (matches RoutePlanner.ts line 167: positive = right turn)
    return Math.atan2(v1x * v2z - v1z * v2x, v1x * v2x + v1z * v2z);
  }

  private sectionStartYaw(sec: RouteSection): number {
    if (sec.points.length < 2) return 0;
    const a = sec.points[0]!;
    const b = sec.points[1]!;
    return Math.atan2(-(b.x - a.x), -(b.z - a.z));
  }

  private computeConnectorLength(a: RoadPoint, via: RoadPoint | undefined, b: RoadPoint): number {
    if (via) return Math.hypot(via.x - a.x, via.z - a.z) + Math.hypot(b.x - via.x, b.z - via.z);
    return Math.hypot(b.x - a.x, b.z - a.z);
  }

  private findMatchingIntersection(
    network: RoadNetworkData | undefined,
    refPoint: RoadPoint,
  ): RoadIntersectionData | undefined {
    if (!network) return undefined;
    let best: RoadIntersectionData | undefined;
    let bestDist = Infinity;
    for (let i = 0; i < network.intersections.length; i++) {
      const j = network.intersections[i]!;
      const dx = j.center.x - refPoint.x;
      const dz = j.center.z - refPoint.z;
      const dy = Math.abs((j.center.y ?? 0) - (refPoint.y ?? 0));
      if (dy > 3.0) continue;
      const d = Math.hypot(dx, dz);
      const threshold = Math.max(j.halfExtentX, j.halfExtentZ) + 6;
      if (d <= threshold && d < bestDist) {
        bestDist = d;
        best = j;
      }
    }
    return best;
  }

  private computeStopLineBackOffset(
    fromSec: RouteSection,
    intersection: RoadIntersectionData | undefined,
    toSec?: RouteSection,
  ): number {
    if (!intersection || fromSec.points.length < 2) {
      // Even without explicit intersection polygon (e.g., synthetic T-junction), set stop line back past cross-road edge
      const crossHalf = toSec ? Math.max(4.4, toSec.road.width * 0.5 + 3.4) : 4.4;
      return clampADAS(crossHalf, 4.4, Math.max(4.4, fromSec.distance * 0.65));
    }
    // Measure backward from road endpoint until outside intersection footprint, then add 4.4m (matches SignalPlacement.ts)
    const fp = fromSec.points;
    const end = fp[fp.length - 1]!;
    const prev = fp[fp.length - 2]!;
    const dx = prev.x - end.x;
    const dz = prev.z - end.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return 4.4;
    const ox = dx / len;
    const oz = dz / len;

    let boundaryOffset = 0.8;
    while (boundaryOffset < 22) {
      const px = end.x + ox * boundaryOffset;
      const pz = end.z + oz * boundaryOffset;
      const insideBox =
        Math.abs(px - intersection.center.x) <= intersection.halfExtentX + 0.15 &&
        Math.abs(pz - intersection.center.z) <= intersection.halfExtentZ + 0.15;
      const insideFootprint = intersection.pavementFootprint
        ? insideBox && this.pointInPolygon(px, pz, intersection.pavementFootprint)
        : insideBox;
      if (!insideFootprint) break;
      boundaryOffset += 0.5;
    }

    return clampADAS(boundaryOffset + 4.4, 4.4, Math.max(4.4, fromSec.distance * 0.65));
  }

  private isInsideAnyIntersection(
    vehicle: ADASVehicleState,
    network: RoadNetworkData | undefined,
    upcoming: ADASPlanSnapshot['upcomingJunction'],
  ): boolean {
    if (upcoming.valid && upcoming.distanceToJunctionEntryM <= 1.0 && upcoming.distanceToJunctionExitM >= -1.0) {
      return true;
    }
    if (!network) return false;
    for (let i = 0; i < network.intersections.length; i++) {
      const j = network.intersections[i]!;
      if (Math.abs(vehicle.y - (j.center.y ?? 0)) > 2.5) continue;
      if (
        Math.abs(vehicle.x - j.center.x) <= j.halfExtentX + 1.0 &&
        Math.abs(vehicle.z - j.center.z) <= j.halfExtentZ + 1.0
      ) {
        if (!j.pavementFootprint || this.pointInPolygon(vehicle.x, vehicle.z, j.pavementFootprint)) {
          return true;
        }
      }
    }
    return false;
  }

  private pointInPolygon(x: number, z: number, polygon: readonly RoadPoint[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i]!;
      const b = polygon[j]!;
      if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) {
        inside = !inside;
      }
    }
    return inside;
  }

  /** Gracefully hold & degrade last valid local trajectory during sudden map/road loss (strictly short-term). */
  private updateMapDegraded(
    dt: number,
    vehicle: ADASVehicleState,
    config: Readonly<ADASConfig>,
    obstacle: ADASObstacleAssessment | null,
    reason: string,
  ): ADASPlanSnapshot {
    const out = this.snapshot;
    this.lastDrivingMode = 'MAP_DEGRADED';
    out.drivingMode = 'MAP_DEGRADED';
    out.awaitingJunctionIntent = false;
    this.degradedElapsedS += Math.max(0, dt);

    const cachedCount = this.lastValidSampleCount;
    if (cachedCount < 2) {
      out.valid = false;
      out.degraded = true;
      out.degradationLevel = 1;
      out.unavailableReason = reason;
      out.sampleCount = 0;
      out.desiredTurnSignal = null;
      this.cancelLaneChange();
      return out;
    }

    if (Number.isFinite(this.degradedLastX)) {
      this.degradedTraveledM += Math.hypot(vehicle.x - this.degradedLastX, vehicle.z - this.degradedLastZ);
    }
    this.degradedLastX = vehicle.x;
    this.degradedLastZ = vehicle.z;

    let bestIdx = 0;
    let bestDistSq = Infinity;
    for (let i = 0; i < cachedCount; i++) {
      const sp = out.samples[i]!;
      const dx = vehicle.x - sp.x;
      const dz = vehicle.z - sp.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestIdx = i;
      }
    }

    const egoSample = out.samples[bestIdx]!;
    this.degradedLastYaw = egoSample.yaw;
    const cosY = Math.cos(egoSample.yaw);
    const sinY = Math.sin(egoSample.yaw);
    const dxE = vehicle.x - egoSample.x;
    const dzE = vehicle.z - egoSample.z;
    const alongDelta = -dxE * sinY - dzE * cosY;
    const rawLateralOffset = dxE * cosY - dzE * sinY;

    // Abort lane change during map degradation unless nearly settled
    const lc = out.laneChange;
    if (lc.active) {
      if (lc.phase === 'signaling') {
        this.cancelLaneChange();
        this.manualLcActive = false;
      } else if (lc.phase === 'executing') {
        const tau = lc.durationSeconds > 0 ? lc.elapsedSeconds / lc.durationSeconds : 0;
        const sideClr = obstacle ? (lc.direction === 'left' ? obstacle.leftLane : obstacle.rightLane) : null;
        if (tau < 0.65 || (sideClr && !sideClr.safe)) {
          this.cancelLaneChange();
          this.manualLcActive = false;
        }
      }
    }

    const lcShift = this.getActiveLaneChangeLateralShift();
    const lcHeadingShift = this.getActiveLaneChangeHeadingShift(vehicle.speed);
    out.sampleCount = cachedCount;
    out.egoSampleIndex = bestIdx;
    out.egoS = egoSample.s + alongDelta;
    out.lateralOffsetM = rawLateralOffset - lcShift;
    out.headingErrorRad = wrapADASAngle((egoSample.yaw - lcHeadingShift) - vehicle.yaw);
    out.inJunction = egoSample.isJunction;

    const remainingCachedM = out.samples[cachedCount - 1]!.s - out.egoS;
    const maxHoldM = clampADAS(config.degradedHoldMaxDistanceM ?? 40, 16, 42);
    const maxHoldTimeS = 2.6;
    const aheadCurvIdx = Math.min(cachedCount - 1, bestIdx + 6);
    const curvDiverge = Math.abs(out.samples[aheadCurvIdx]!.curvature - egoSample.curvature) > 0.045;
    const degLevel = clampADAS(
      Math.max(
        this.degradedTraveledM / maxHoldM,
        this.degradedElapsedS / maxHoldTimeS,
        remainingCachedM < 24 ? (24 - remainingCachedM) / 20 : 0.25,
      ),
      0.25,
      1.0,
    );
    out.degradationLevel = degLevel;
    out.degraded = true;
    out.confidence = Math.max(0.15, 0.72 * (1 - degLevel));

    // Strictly bounded fallback: abort promptly on time/distance exhaustion or sharp heading/geometry divergence
    const exhausted =
      !out.inJunction &&
      (this.degradedTraveledM >= maxHoldM || this.degradedElapsedS >= maxHoldTimeS || remainingCachedM <= 8.0);
    const geomDiverged = Math.abs(rawLateralOffset) > 3.2 || Math.abs(out.headingErrorRad) > 0.38 || curvDiverge;
    if (exhausted || geomDiverged) {
      out.valid = false;
      out.unavailableReason = `${reason} · 请接管`;
      out.desiredTurnSignal = null;
      this.cancelLaneChange();
      return out;
    }

    out.valid = true;
    out.unavailableReason = '';
    out.activeIntent = this.resolveActiveIntent(out, null);
    return out;
  }

  private getReversedPoints(road: RoadSegmentData): RoadPoint[] {
    let rev = this.freeRevPointCache.get(road.id);
    if (!rev) {
      rev = [...road.centerline].reverse();
      this.freeRevPointCache.set(road.id, rev);
    }
    return rev;
  }

  private readonly freeMatchOut: { road: RoadSegmentData | null; forward: boolean; along: number; score: number } = {
    road: null,
    forward: true,
    along: 0,
    score: Infinity,
  };

  private matchRoadForFreeDrive(
    vehicle: ADASVehicleState,
    network: RoadNetworkData,
  ): { road: RoadSegmentData; forward: boolean; along: number } | null {
    let bestRoad: RoadSegmentData | null = null;
    let bestForward = true;
    let bestAlong = 0;
    let bestScore = Infinity;

    for (let i = 0; i < network.segments.length; i++) {
      const road = network.segments[i]!;
      if (!road.centerline || road.centerline.length < 2) continue;
      const proj = this.projectOntoPoints(vehicle.x, vehicle.z, road.centerline);
      const heightErr = Math.abs(vehicle.y - proj.y);
      if (heightErr > 3.0) continue;

      const maxLat = Math.max(road.width * 0.75 + 6, 12);
      if (Math.abs(proj.lateralRight) > maxLat && proj.endDist > 14) continue;

      for (let pass = 0; pass < 2; pass++) {
        const fwd = pass === 0;
        if (fwd && road.travelDirection === 'reverse') continue;
        if (!fwd && road.travelDirection === 'forward') continue;

        const dirYaw = fwd ? proj.yaw : wrapADASAngle(proj.yaw + Math.PI);
        const headingErr = Math.abs(wrapADASAngle(dirYaw - vehicle.yaw));
        if (headingErr > 1.25) continue;

        const nextPlannedSec = this.freeSections.length > 1 ? this.freeSections[1] : undefined;
        const isCurrentFreeRoad = road.id === this.freeRoadId && fwd === this.freeForward;
        const isPlannedContinuation = Boolean(
          nextPlannedSec && road.id === nextPlannedSec.road.id && fwd === nextPlannedSec.forward && proj.endDist < 8.0,
        );
        const sameHysteresis = isCurrentFreeRoad ? -4.5 : isPlannedContinuation ? -6.0 : 0;
        const recoveryPenalty =
          this.lastDrivingMode === 'MAP_DEGRADED' && Number.isFinite(this.degradedLastYaw)
            ? Math.abs(wrapADASAngle(dirYaw - this.degradedLastYaw)) * 10
            : 0;
        const score = Math.abs(proj.lateralRight) + proj.endDist * 1.4 + headingErr * 7 + heightErr * 9 + sameHysteresis + recoveryPenalty;
        if (score < bestScore) {
          bestScore = score;
          bestRoad = road;
          bestForward = fwd;
          bestAlong = fwd ? proj.along : Math.max(0, proj.totalLength - proj.along);
        }
      }
    }

    if (!bestRoad) return null;
    this.freeMatchOut.road = bestRoad;
    this.freeMatchOut.forward = bestForward;
    this.freeMatchOut.along = bestAlong;
    this.freeMatchOut.score = bestScore;
    return this.freeMatchOut as { road: RoadSegmentData; forward: boolean; along: number };
  }

  /** Synthesize forward local route chain without a navigation route (strictly respects topology & driver intent). */
  private buildFreeDriveRoute(
    vehicle: ADASVehicleState,
    network: RoadNetworkData,
    laneGraph: LaneGraph | undefined,
    manualTurnPref: TurnSignalRequest,
    config: Readonly<ADASConfig>,
  ): PlannedRoute | null {
    this.freeAwaitingJunctionIntent = false;
    const startMatch = this.matchRoadForFreeDrive(vehicle, network);
    if (!startMatch) return null;

    this.freeRoadId = startMatch.road.id;
    this.freeForward = startMatch.forward;
    this.freeSections.length = 0;

    let curRoad = startMatch.road;
    let curFwd = startMatch.forward;
    let distAccum = 0;

    for (let step = 0; step < MAX_FREE_SECTIONS; step++) {
      const pts = curFwd ? curRoad.centerline : this.getReversedPoints(curRoad);
      const totalLen = this.fillCumDist(pts);
      const secSpeed = Math.max(5, (curRoad.speedLimit ?? 40) / 3.6);
      this.freeSections.push({
        road: curRoad,
        forward: curFwd,
        from: 0,
        to: totalLen,
        startDistance: distAccum,
        distance: totalLen,
        seconds: totalLen / secSpeed,
        points: pts,
      });
      distAccum += totalLen;

      if (step > 0 && distAccum - startMatch.along > 450) break;

      const nextChoice = this.selectFreeBranchConnection(
        curRoad,
        curFwd,
        pts,
        network,
        laneGraph,
        step === 0 ? manualTurnPref : null,
        step === 0,
      );
      if (!nextChoice) break;

      // Avoid cyclic infinite loops in local preview
      let alreadyVisited = false;
      for (let v = 0; v < this.freeSections.length; v++) {
        if (this.freeSections[v]!.road.id === nextChoice.toRoad.id) {
          alreadyVisited = true;
          break;
        }
      }
      if (alreadyVisited) break;

      curRoad = nextChoice.toRoad;
      curFwd = nextChoice.toForward;
    }

    void config;
    return this.freeRouteScratch;
  }

  private selectFreeBranchConnection(
    fromRoad: RoadSegmentData,
    fromFwd: boolean,
    fromPts: readonly RoadPoint[],
    network: RoadNetworkData,
    laneGraph: LaneGraph | undefined,
    turnPref: TurnSignalRequest,
    isFirstNode: boolean,
  ): { toRoad: RoadSegmentData; toForward: boolean } | null {
    const endKind: 'start' | 'end' = fromFwd ? 'end' : 'start';
    const conns = network.routing?.connections ?? [];
    if (fromPts.length < 2) return null;
    const pA = fromPts[fromPts.length - 2]!;
    const pB = fromPts[fromPts.length - 1]!;
    const v1x = pB.x - pA.x;
    const v1z = pB.z - pA.z;

    // Collect legal lane-level reachable outgoing road IDs from LaneGraph (if available)
    this.legalSuccessorSegIds.clear();
    this.legalMainlineSegIds.clear();
    if (laneGraph) {
      const appCnt = this.countApproachLanes(fromRoad, fromFwd);
      for (let lIdx = 0; lIdx < appCnt; lIdx++) {
        this.describeLane(fromRoad, fromFwd, lIdx, false, this.tmpLaneDesc);
        const lane = laneGraph.getLane(this.tmpLaneDesc.laneId);
        if (!lane || lane.isVirtual) continue;
        for (let s = 0; s < lane.successors.length; s++) {
          const succ = laneGraph.getLane(lane.successors[s]!);
          if (!succ) continue;
          if (!succ.isVirtual) {
            if (succ.roadId !== fromRoad.id) {
              this.legalSuccessorSegIds.add(succ.roadId);
              if (lane.turnDirection === 'straight' || lane.allowedManeuvers.includes('straight')) {
                this.legalMainlineSegIds.add(succ.roadId);
              }
            }
          } else {
            for (let vs = 0; vs < succ.successors.length; vs++) {
              const outLane = laneGraph.getLane(succ.successors[vs]!);
              if (outLane && outLane.roadId !== fromRoad.id) {
                this.legalSuccessorSegIds.add(outLane.roadId);
                if (succ.turnDirection === 'straight' || succ.allowedManeuvers.includes('straight')) {
                  this.legalMainlineSegIds.add(outLane.roadId);
                }
              }
            }
          }
        }
      }
    }
    const enforceLegalGraph = this.legalSuccessorSegIds.size > 0;

    let bestMainlineCont: { toRoad: RoadSegmentData; toForward: boolean; score: number } | null = null;
    let bestStraight: { toRoad: RoadSegmentData; toForward: boolean; score: number } | null = null;
    let bestLeft: { toRoad: RoadSegmentData; toForward: boolean; angle: number } | null = null;
    let bestRight: { toRoad: RoadSegmentData; toForward: boolean; angle: number; isRamp: boolean } | null = null;
    let bestFork: { toRoad: RoadSegmentData; toForward: boolean; absAngle: number } | null = null;
    let anyCandidate: { toRoad: RoadSegmentData; toForward: boolean } | null = null;
    let candidateCount = 0;

    for (let i = 0; i < conns.length; i++) {
      const c = conns[i]!;
      if (c.fromRoadId !== fromRoad.id || c.fromEnd !== endKind) continue;
      let toRoad: RoadSegmentData | undefined;
      for (let sIdx = 0; sIdx < network.segments.length; sIdx++) {
        if (network.segments[sIdx]!.id === c.toRoadId) {
          toRoad = network.segments[sIdx]!;
          break;
        }
      }
      if (!toRoad || toRoad.centerline.length < 2 || toRoad.id === fromRoad.id) continue;
      const toForward = c.toEnd === 'start';
      if (toForward && toRoad.travelDirection === 'reverse') continue;
      if (!toForward && toRoad.travelDirection === 'forward') continue;
      // Verify physical lane-level legality when LaneGraph has valid outgoing links for this road
      if (enforceLegalGraph && !this.legalSuccessorSegIds.has(toRoad.id)) continue;

      const toPts = toForward ? toRoad.centerline : this.getReversedPoints(toRoad);
      const q0 = toPts[0]!;
      const q1 = toPts[1]!;
      const turnAngle = Math.atan2(v1x * (q1.z - q0.z) - v1z * (q1.x - q0.x), v1x * (q1.x - q0.x) + v1z * (q1.z - q0.z));
      const turnDir = classifyTurnAngle(turnAngle);
      if (turnDir === 'uturn' && turnPref !== 'left') continue;

      candidateCount++;
      if (!anyCandidate) anyCandidate = { toRoad, toForward };

      const absA = Math.abs(turnAngle);
      const isRamp = toRoad.roadType === 'ramp';
      const sameName = Boolean(fromRoad.name && toRoad.name && fromRoad.name === toRoad.name);
      const sameRoute = Boolean(fromRoad.routeNumber && toRoad.routeNumber && fromRoad.routeNumber === toRoad.routeNumber);
      const sameRoadType = Boolean(fromRoad.roadType && toRoad.roadType && fromRoad.roadType === toRoad.roadType);
      const sameFunction = Boolean(fromRoad.roadFunction && toRoad.roadFunction && fromRoad.roadFunction === toRoad.roadFunction);
      const isLegalStraight = this.legalMainlineSegIds.has(toRoad.id);
      const isMainlineContinue =
        (fromRoad.roadType === 'highway' && !isRamp) ||
        sameName ||
        sameRoute ||
        (sameRoadType && !isRamp && (toRoad.roadFunction === 'arterial' || toRoad.roadType === 'highway'));

      // Score natural curved mainline continuation separately so straighter side streets cannot hijack curved arterial/highway
      if (!isRamp && absA <= 0.78 && (sameName || sameRoute || (sameFunction && (toRoad.roadFunction === 'arterial' || toRoad.roadType === 'highway')) || (isLegalStraight && sameRoadType))) {
        const contScore =
          absA -
          (sameName ? 1.6 : 0) -
          (sameRoute ? 1.4 : 0) -
          (sameFunction ? 1.0 : 0) -
          (sameRoadType ? 0.8 : 0) -
          (isLegalStraight ? 0.5 : 0);
        if (!bestMainlineCont || contScore < bestMainlineCont.score) {
          bestMainlineCont = { toRoad, toForward, score: contScore };
        }
      }

      const forkScore =
        absA +
        (fromRoad.roadType === 'highway' && isRamp ? 1.5 : 0) -
        (sameName ? 0.45 : 0) -
        (sameRoadType && !isRamp ? 0.3 : 0);

      if (!bestFork || forkScore < bestFork.absAngle) {
        bestFork = { toRoad, toForward, absAngle: forkScore };
      }

      if (turnDir === 'straight') {
        const straightBonus =
          (isMainlineContinue ? -2.0 : 0) +
          (sameName ? -0.9 : 0) +
          (sameRoute ? -0.7 : 0) +
          (sameRoadType ? -0.4 : 0) +
          (isLegalStraight ? -0.35 : 0);
        const sScore = absA + straightBonus + (isRamp && fromRoad.roadType !== 'ramp' ? 2.5 : 0);
        if (!bestStraight || sScore < bestStraight.score) {
          bestStraight = { toRoad, toForward, score: sScore };
        }
      }

      if (turnAngle < -0.20) {
        if (!bestLeft || turnAngle < bestLeft.angle) {
          bestLeft = { toRoad, toForward, angle: turnAngle };
        }
      }

      if (turnAngle > 0.20 || (isRamp && fromRoad.roadType === 'highway')) {
        if (!bestRight || (isRamp && !bestRight.isRamp) || (isRamp === bestRight.isRamp && turnAngle > bestRight.angle)) {
          bestRight = { toRoad, toForward, angle: turnAngle, isRamp };
        }
      }
    }

    if (candidateCount === 0) return null;

    // 1. Honor explicit legal driver turn / exit signal preference
    if (turnPref === 'left' && bestLeft) return bestLeft;
    if (turnPref === 'right' && bestRight) return bestRight;

    // 2. Highway exit rule: stay on mainline unless driver explicitly confirmed exit
    if (fromRoad.roadType === 'highway') {
      if (bestMainlineCont) return bestMainlineCont;
      if (bestStraight) return bestStraight;
    }

    // 3. Curved mainline priority: if a straight candidate is an unnamed/minor cross street while named/same-class mainline curves gently
    if (bestMainlineCont && bestStraight) {
      const straightIsSameRoad =
        (fromRoad.name && bestStraight.toRoad.name === fromRoad.name) ||
        (fromRoad.routeNumber && bestStraight.toRoad.routeNumber === fromRoad.routeNumber) ||
        (fromRoad.roadFunction && bestStraight.toRoad.roadFunction === fromRoad.roadFunction);
      if (!straightIsSameRoad || bestMainlineCont.score < bestStraight.score) {
        return bestMainlineCont;
      }
    }

    // 4. Crossroads or Y-fork: follow straight or closest natural road continuation
    if (bestStraight) return bestStraight;
    if (bestMainlineCont) return bestMainlineCont;
    if (candidateCount === 1 && anyCandidate) return anyCandidate;

    // 5. Gentle Y-fork (both branches moderately forward, absAngle < 0.90) -> natural continuation
    if (bestFork && bestFork.absAngle < 0.90) {
      return bestFork;
    }

    // 6. True ambiguous T-junction (no straight option, sharp left AND sharp right branches exist, no driver signal)
    if (isFirstNode && bestLeft && bestRight && fromRoad.roadType !== 'ramp') {
      this.freeAwaitingJunctionIntent = true;
      return bestRight;
    }

    return bestFork ?? anyCandidate;
  }

  private canDriverSignalDivergeAtNextNode(
    vehicle: ADASVehicleState,
    curSec: RouteSection,
    nextSec: RouteSection | undefined,
    network: RoadNetworkData,
    laneGraph: LaneGraph | undefined,
    signalDir: 'left' | 'right',
    config: Readonly<ADASConfig>,
  ): boolean {
    if (!signalDir || !curSec) return false;
    const proj = this.projectOntoPoints(vehicle.x, vehicle.z, curSec.points);
    const remSecM = Math.max(0, proj.totalLength - proj.along);
    const isHw = curSec.road.roadType === 'highway' || (curSec.road.speedLimit ?? 0) >= 70;
    const lookWindowM = isHw
      ? Math.min(config.rampExitLookAheadDistanceM ?? 600, 260)
      : clampADAS(vehicle.speed * 4.5 + 35, 55, 160);
    if (remSecM > lookWindowM) return false;

    const plannedTurn: TurnDirection = nextSec
      ? classifyTurnAngle(this.computeSectionTurnAngle(curSec, nextSec))
      : 'straight';
    const plannedIsRightExit = Boolean(isHw && nextSec && nextSec.road.roadType === 'ramp');
    if (signalDir === 'left' && plannedTurn === 'left') return false;
    if (signalDir === 'right' && (plannedTurn === 'right' || plannedIsRightExit)) return false;

    // On multi-lane highways, only interpret right blinker as an immediate exit divergence when in (or adjacent without inner lane change needed / already moved right to) the rightmost lane
    if (isHw && signalDir === 'right') {
      const appCount = this.countApproachLanes(curSec.road, curSec.forward);
      const appLane = this.activeApproachLane >= 0
        ? clampADAS(this.activeApproachLane, 0, appCount - 1)
        : this.detectVehicleApproachLane(vehicle, curSec);
      this.describeLane(curSec.road, curSec.forward, appLane, false, this.tmpLaneDesc);
      if (appLane < appCount - 1 && this.tmpLaneDesc.rightBoundary === 'dashed') {
        return false;
      }
    }

    const match = this.selectFreeBranchConnection(
      curSec.road,
      curSec.forward,
      curSec.points,
      network,
      laneGraph,
      signalDir,
      false,
    );
    if (!match) return false;
    const chosenTurn = classifyTurnAngle(
      this.computeSectionTurnAngle(curSec, {
        road: match.toRoad,
        forward: match.toForward,
        from: 0,
        to: match.toRoad.length,
        startDistance: 0,
        distance: match.toRoad.length,
        seconds: 1,
        points: match.toForward ? match.toRoad.centerline : this.getReversedPoints(match.toRoad),
      }),
    );
    if (signalDir === 'left') return chosenTurn === 'left' || chosenTurn === 'uturn';
    return chosenTurn === 'right' || (isHw && match.toRoad.roadType === 'ramp');
  }

  private detectLaneGraphEndingTarget(
    laneGraph: LaneGraph | undefined,
    laneId: string,
    approachLane: number,
    approachCount: number,
  ): number | null {
    if (!laneGraph || !laneId || approachCount <= 1) return null;
    const lane = laneGraph.getLane(laneId);
    if (!lane || lane.isVirtual) return null;
    if (lane.successors.length > 0) return null;

    // Current lane drops/ends cleanly -> prefer right-or-left adjacent lane that continues into a successor
    const adj = laneGraph.getAdjacentLanes(laneId);
    if (adj.canChangeLeft && adj.left && adj.left.successors.length > 0 && approachLane > 0) {
      return approachLane - 1;
    }
    if (adj.canChangeRight && adj.right && adj.right.successors.length > 0 && approachLane < approachCount - 1) {
      return approachLane + 1;
    }
    return null;
  }

  private resolveActiveIntent(
    plan: Readonly<ADASPlanSnapshot>,
    manualSignalIntent: TurnSignalRequest,
  ): ADASDriverIntentKind {
    if (plan.laneChange.active) {
      return plan.laneChange.direction === 'left' ? 'LANE_CHANGE_LEFT' : 'LANE_CHANGE_RIGHT';
    }
    if (plan.maneuver === 'EXIT_RAMP') return 'EXIT_RAMP';
    if (plan.maneuver === 'TURN_LEFT') return 'TURN_LEFT';
    if (plan.maneuver === 'TURN_RIGHT') return 'TURN_RIGHT';
    if (manualSignalIntent === 'left') return 'LANE_CHANGE_LEFT';
    if (manualSignalIntent === 'right') return 'LANE_CHANGE_RIGHT';
    return 'NONE';
  }
}
