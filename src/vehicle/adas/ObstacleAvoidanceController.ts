import { ADASPerceptionAdapter } from './ADASDataAdapters';
import {
  clampADAS,
  createEmptyAdjacentClearance,
  evaluateLocalTrajectoryOffsetAtDs,
  wrapADASAngle,
  type ADASConfig,
  type ADASObstacleAssessment,
  type ADASPlanSnapshot,
  type ADASVehicleState,
  type ADASWorldContext,
  type AdjacentLaneClearance,
  type TrafficActorSnapshot,
} from './ADASTypes';

const PREDICTION_HORIZONS_S = [0.4, 0.8, 1.2, 1.6, 2.0, 2.5, 3.0, 3.5] as const;

/**
 * Following, static/dynamic obstacle prediction, cut-in detection, adjacent-lane safety,
 * junction blockage detection, and high-frequency emergency braking (AEB).
 * Full perception runs at ~20 Hz; fast AEB check runs at 120 Hz. Zero per-step allocations.
 */
export class ObstacleAvoidanceController {
  public readonly perception = new ADASPerceptionAdapter();

  public readonly assessment: ADASObstacleAssessment = {
    valid: true,
    dataReliable: true,
    actorCount: 0,
    hasLeadActor: false,
    leadActorId: '',
    leadActorKind: 'none',
    leadIsStatic: false,
    leadIsInfrastructure: false,
    leadX: 0,
    leadY: 0,
    leadZ: 0,
    leadYaw: 0,
    leadWidth: 0,
    leadLength: 0,
    leadHeight: 0,
    leadInCorridor: false,
    leadMotionDirection: 'none',
    leadGapM: Infinity,
    leadSpeedMps: Infinity,
    closingSpeedMps: 0,
    ttcSeconds: Infinity,
    cutInDetected: false,
    junctionBlocked: false,
    roadBlocked: false,
    allowSolidBypass: false,
    targetSpeedMps: Infinity,
    avoidanceTargetSpeedMps: Infinity,
    canEvadeWithoutStopping: false,
    overtakeRecommended: false,
    overtakeDirection: null,
    overtakeActorId: '',
    overtakenActorFound: false,
    overtakenActorBehindGapM: -Infinity,
    overtakenActorX: 0,
    overtakenActorY: 0,
    overtakenActorZ: 0,
    overtakenActorYaw: 0,
    overtakenActorWidth: 0,
    overtakenActorLength: 0,
    overtakenActorHeight: 0,
    overtakenActorKind: 'none',
    stopDistanceM: Infinity,
    emergencyBraking: false,
    emergencyBrakeDemand: 0,
    avoidanceRequest: 'none',
    leftLane: createEmptyAdjacentClearance(),
    rightLane: createEmptyAdjacentClearance(),
    reason: '',
  };

  private timeSinceSample = 0;
  private sampledLeadGapM = Infinity;
  private sampledLeadSpeedMps = Infinity;
  private aebLatched = false;
  private bypassedActorId = '';
  private bypassedUntilTime = -Infinity;

  // Pre-allocated Frenet projection scratch
  private readonly frenet = {
    s: 0,
    d: 0,
    vLong: 0,
    vLat: 0,
    pathYaw: 0,
    pathY: 0,
    atPathBoundary: false,
    usedBodyFallback: false,
    valid: false,
  };

  public reset(): void {
    this.perception.reset();
    this.timeSinceSample = 0;
    this.sampledLeadGapM = Infinity;
    this.sampledLeadSpeedMps = Infinity;
    this.aebLatched = false;
    this.bypassedActorId = '';
    this.bypassedUntilTime = -Infinity;
    this.clearAssessment();
  }

  /**
   * Called synchronously when the driver finishes a manual steering bypass so
   * stale AEB latches or just-bypassed lead obstacles do not trigger repeat braking.
   */
  public notifyDriverBypassReleased(simTime: number): void {
    const out = this.assessment;
    if (out.hasLeadActor && out.leadActorId) {
      this.bypassedActorId = out.leadActorId;
      this.bypassedUntilTime = simTime + 3.0;
    }
    this.aebLatched = false;
    this.sampledLeadGapM = Infinity;
    this.sampledLeadSpeedMps = Infinity;
    out.emergencyBraking = false;
    out.emergencyBrakeDemand = 0;
  }

  private clearAssessment(): void {
    const a = this.assessment;
    a.valid = true;
    a.dataReliable = true;
    a.actorCount = 0;
    a.hasLeadActor = false;
    a.leadActorId = '';
    a.leadActorKind = 'none';
    a.leadIsStatic = false;
    a.leadIsInfrastructure = false;
    a.leadX = 0;
    a.leadY = 0;
    a.leadZ = 0;
    a.leadYaw = 0;
    a.leadWidth = 0;
    a.leadLength = 0;
    a.leadHeight = 0;
    a.leadInCorridor = false;
    a.leadMotionDirection = 'none';
    a.leadGapM = Infinity;
    a.leadSpeedMps = Infinity;
    a.closingSpeedMps = 0;
    a.ttcSeconds = Infinity;
    a.cutInDetected = false;
    a.junctionBlocked = false;
    a.roadBlocked = false;
    a.allowSolidBypass = false;
    a.targetSpeedMps = Infinity;
    a.avoidanceTargetSpeedMps = Infinity;
    a.canEvadeWithoutStopping = false;
    a.overtakeRecommended = false;
    a.overtakeDirection = null;
    a.overtakeActorId = '';
    a.overtakenActorFound = false;
    a.overtakenActorBehindGapM = -Infinity;
    a.overtakenActorX = 0;
    a.overtakenActorY = 0;
    a.overtakenActorZ = 0;
    a.overtakenActorYaw = 0;
    a.overtakenActorWidth = 0;
    a.overtakenActorLength = 0;
    a.overtakenActorHeight = 0;
    a.overtakenActorKind = 'none';
    a.stopDistanceM = Infinity;
    a.emergencyBraking = false;
    a.emergencyBrakeDemand = 0;
    a.avoidanceRequest = 'none';
    a.reason = '';
    this.resetClearance(a.leftLane);
    this.resetClearance(a.rightLane);
  }

  private resetClearance(c: AdjacentLaneClearance): void {
    c.exists = false;
    c.boundaryCrossable = false;
    c.safe = false;
    c.frontGapM = Infinity;
    c.frontSpeedMps = Infinity;
    c.rearGapM = Infinity;
    c.minTTCSeconds = Infinity;
    c.routeCompatible = false;
    c.blockReason = '';
  }

  /**
   * 20 Hz combined perception & obstacle decision pass (preserved for standalone callers).
   */
  public updatePerception(
    vehicle: ADASVehicleState,
    world: ADASWorldContext,
    plan: ADASPlanSnapshot,
    config: Readonly<ADASConfig>,
  ): ADASObstacleAssessment {
    this.collectPerceptionAndAdjacent(vehicle, world, plan, config);
    return this.evaluateCorridorAndAEB(vehicle, world, plan, config);
  }

  /**
   * Stage 1 (20 Hz): samples actors/colliders and evaluates discrete left/right adjacent lane clearance.
   */
  public collectPerceptionAndAdjacent(
    vehicle: ADASVehicleState,
    world: ADASWorldContext,
    plan: ADASPlanSnapshot,
    config: Readonly<ADASConfig>,
  ): void {
    const out = this.assessment;
    this.clearAssessment();
    this.timeSinceSample = 0;

    const egoSpeed = Math.max(0, vehicle.speed);
    const egoHalfL = vehicle.vehicleLength * 0.5;
    const egoEffHalfW = vehicle.vehicleWidth * 0.5;
    const laneW = plan.valid ? plan.currentLaneWidth : 3.5;

    if (world.simulationTime > this.bypassedUntilTime) {
      this.bypassedActorId = '';
    }

    const effectiveRadius = Math.max(
      config.perceptionRadiusM,
      Math.min(195, Math.max(config.highwayObservationLookaheadM ?? 185, egoSpeed * 5.2 + 40)),
    );
    const count = this.perception.sample(vehicle, world, effectiveRadius, config.maxDataAgeSeconds);
    out.actorCount = count;
    out.dataReliable = this.perception.dataReliable;

    // Initialize adjacent lane clearance descriptors
    this.initAdjacentClearance(out.leftLane, 'left', plan);
    this.initAdjacentClearance(out.rightLane, 'right', plan);

    if (!out.leftLane.exists && !out.rightLane.exists) return;

    const actors = this.perception.actors;
    let egoLatInPlan = 0;
    if (plan.valid && plan.sampleCount >= 2) {
      const spEgo = plan.samples[Math.max(0, Math.min(plan.sampleCount - 1, plan.egoSampleIndex))]!;
      egoLatInPlan = (vehicle.x - spEgo.x) * Math.cos(spEgo.yaw) - (vehicle.z - spEgo.z) * Math.sin(spEgo.yaw);
    }

    const remSigS =
      plan.laneChange.active && plan.laneChange.phase === 'signaling'
        ? Math.max(0, plan.laneChange.signalLeadSeconds - plan.laneChange.elapsedSeconds)
        : plan.laneChange.active
          ? 0
          : config.laneChangeSignalLeadS;

    for (let i = 0; i < count; i++) {
      const actor = actors[i]!;
      this.projectActorToPath(actor, vehicle, plan, this.frenet);
      if (!this.frenet.valid) continue;

      const sRel = this.frenet.s;
      const dRel = this.frenet.d;
      const vLong = this.frenet.vLong;
      const vLat = this.frenet.vLat;
      const pathYaw = this.frenet.pathYaw;
      const pathY = this.frenet.pathY;
      const actorHalfL = actor.length * 0.5;
      const actorHalfW = actor.width * 0.5;

      const actorMinY = Number.isFinite(actor.minHeight) ? actor.minHeight! : actor.y;
      const actorMaxY = Number.isFinite(actor.maxHeight) ? actor.maxHeight! : actor.y + actor.height;
      if (actorMinY > pathY + 1.90 || actorMaxY < pathY + 0.12) continue;

      const isRoadsideFixture =
        actor.isInfrastructure === true ||
        (actor.kind === 'static-obstacle' &&
          (actor.id.includes(':post:') ||
            actor.id.includes(':board:') ||
            actor.id.includes(':pier:') ||
            actor.id.includes(':wall:') ||
            actor.id.includes(':barrier:') ||
            actor.id.includes(':median:')));
      if (isRoadsideFixture && (this.frenet.atPathBoundary || (plan.valid && plan.sampleCount >= 2 && this.frenet.usedBodyFallback))) {
        continue;
      }

      const relYaw = wrapADASAngle(actor.yaw - pathYaw);
      const absCos = Math.abs(Math.cos(relYaw));
      const absSin = Math.abs(Math.sin(relYaw));
      const halfLat = actorHalfW * absCos + actorHalfL * absSin;
      const isLongOBB = actorHalfL > 3.5 || actorHalfW > 3.5;

      const isStatic = actor.kind === 'static-obstacle' || Math.abs(actor.speed) < 0.25;
      const actorMotion: 'same' | 'oncoming' | 'crossing' | 'static' = isStatic
        ? 'static'
        : vLong < -1.5
          ? 'oncoming'
          : Math.abs(vLat) > Math.abs(vLong) * 0.8 && Math.abs(vLat) > 0.6
            ? 'crossing'
            : 'same';

      const intrudesLeftLane =
        out.leftLane.exists &&
        (isLongOBB
          ? this.doesActorOverlapCurvedPath(actor, plan, -laneW, laneW * 0.5 - 0.08, pathY)
          : Math.abs(dRel + laneW) - halfLat < laneW * 0.5 - 0.08);
      const intrudesRightLane =
        out.rightLane.exists &&
        (isLongOBB
          ? this.doesActorOverlapCurvedPath(actor, plan, laneW, laneW * 0.5 - 0.08, pathY)
          : Math.abs(dRel - laneW) - halfLat < laneW * 0.5 - 0.08);

      if (out.leftLane.exists && (!isRoadsideFixture || intrudesLeftLane)) {
        this.evaluateActorAgainstAdjacentLane(
          'left',
          actor,
          world.simulationTime,
          pathYaw,
          relYaw,
          sRel,
          dRel + laneW,
          vLong,
          vLat,
          actor.accel ?? 0,
          actorMotion,
          egoSpeed,
          egoHalfL,
          egoEffHalfW,
          vehicle.wheelBase,
          actorHalfL,
          actorHalfW,
          laneW,
          remSigS,
          out.leftLane,
        );
      }
      if (out.rightLane.exists && (!isRoadsideFixture || intrudesRightLane)) {
        this.evaluateActorAgainstAdjacentLane(
          'right',
          actor,
          world.simulationTime,
          pathYaw,
          relYaw,
          sRel,
          dRel - laneW,
          vLong,
          vLat,
          actor.accel ?? 0,
          actorMotion,
          egoSpeed,
          egoHalfL,
          egoEffHalfW,
          vehicle.wheelBase,
          actorHalfL,
          actorHalfW,
          laneW,
          remSigS,
          out.rightLane,
        );
      }
    }
    void egoLatInPlan;
  }

  /**
   * Stage 2 (20 Hz): evaluates corridor occupancy along the active local trajectory,
   * IDM following speed, avoidance requests, and AEB triggers.
   */
  public evaluateCorridorAndAEB(
    vehicle: ADASVehicleState,
    world: ADASWorldContext,
    plan: ADASPlanSnapshot,
    config: Readonly<ADASConfig>,
  ): ADASObstacleAssessment {
    const out = this.assessment;
    const egoSpeed = Math.max(0, vehicle.speed);
    const egoHalfL = vehicle.vehicleLength * 0.5;
    const egoHalfW = vehicle.vehicleWidth * 0.5;
    const egoEffHalfW = egoHalfW;
    const laneW = plan.valid ? plan.currentLaneWidth : 3.5;
    const count = out.actorCount;
    const actors = this.perception.actors;
    const upcomingJ = plan.upcomingJunction;

    let bestLeadGap = Infinity;
    let bestLeadSpeed = Infinity;
    let bestLeadId = '';
    let bestLeadKind: TrafficActorSnapshot['kind'] | 'none' = 'none';
    let bestLeadStatic = false;
    let bestLeadInfrastructure = false;
    let bestLeadCutIn = false;
    let bestLeadActor: TrafficActorSnapshot | null = null;
    let bestLeadInCorridor = false;
    let bestLeadMotion: 'same' | 'oncoming' | 'crossing' | 'static' | 'none' = 'none';

    let egoLatInPlan = 0;
    if (plan.valid && plan.sampleCount >= 2) {
      const spEgo = plan.samples[Math.max(0, Math.min(plan.sampleCount - 1, plan.egoSampleIndex))]!;
      const cosE = Math.cos(spEgo.yaw);
      const sinE = Math.sin(spEgo.yaw);
      egoLatInPlan = (vehicle.x - spEgo.x) * cosE - (vehicle.z - spEgo.z) * sinE;
    }

    const lt = plan.localTrajectory;
    const hasLocalOffset = Boolean(
      lt &&
      lt.active &&
      lt.mode !== 'lane_change' &&
      (Math.abs(lt.targetOffsetM) > 0.14 || Math.abs(lt.currentOffsetM) > 0.14),
    );

    for (let i = 0; i < count; i++) {
      const actor = actors[i]!;
      this.projectActorToPath(actor, vehicle, plan, this.frenet);
      if (!this.frenet.valid) continue;

      const sRel = this.frenet.s;
      const dRel = this.frenet.d;
      const dFromEgo = dRel - egoLatInPlan;
      const vLong = this.frenet.vLong;
      const vLat = this.frenet.vLat;
      const pathYaw = this.frenet.pathYaw;
      const pathY = this.frenet.pathY;
      const actorHalfL = actor.length * 0.5;
      const actorHalfW = actor.width * 0.5;

      // Vertical clearance check against local road deck elevation at the projected path sample (not ego's hill/ramp Y!).
      // Eliminates bridge piers underneath elevated decks and upper-deck sign posts overhead.
      const actorMinY = Number.isFinite(actor.minHeight) ? actor.minHeight! : actor.y;
      const actorMaxY = Number.isFinite(actor.maxHeight) ? actor.maxHeight! : actor.y + actor.height;
      if (actorMinY > pathY + 1.90 || actorMaxY < pathY + 0.12) {
        continue;
      }

      // Oriented bounding-box projection into path frame
      const relYaw = wrapADASAngle(actor.yaw - pathYaw);
      const absCos = Math.abs(Math.cos(relYaw));
      const absSin = Math.abs(Math.sin(relYaw));
      const halfLat = actorHalfW * absCos + actorHalfL * absSin;
      const halfLong = actorHalfL * absCos + actorHalfW * absSin;

      // Distinguish normal roadside structures (:post:, :board:, :pier:, :wall:, :barrier:, :median:, buildings)
      // from drivable-road hazards while strictly catching any structure that intrudes into the driving lane!
      const isRoadsideFixture =
        actor.isInfrastructure === true ||
        (actor.kind === 'static-obstacle' &&
          (actor.id.includes(':post:') ||
            actor.id.includes(':board:') ||
            actor.id.includes(':pier:') ||
            actor.id.includes(':wall:') ||
            actor.id.includes(':barrier:') ||
            actor.id.includes(':median:')));

      // Ignore roadside infrastructure that falls outside the planned road corridor (body-frame fallback)
      // or projects purely by straight-tangent extrapolation beyond curved path endpoints
      if (isRoadsideFixture && (this.frenet.atPathBoundary || (plan.valid && plan.sampleCount >= 2 && this.frenet.usedBodyFallback))) {
        continue;
      }

      const isLongOBB = actorHalfL > 3.5 || actorHalfW > 3.5;
      const intrudesCurrentLane = isLongOBB
        ? this.doesActorOverlapCurvedPath(actor, plan, 0, Math.max(laneW * 0.5 - 0.12, egoEffHalfW + 0.08), pathY) ||
          this.doesActorOverlapCurvedPath(actor, plan, egoLatInPlan, egoEffHalfW + 0.08, pathY)
        : this.doesOBBOverlapAxisBox(sRel, dRel, relYaw, actorHalfL, actorHalfW, sRel, 0, Math.max(1.5, actorHalfL), laneW * 0.5 - 0.12) ||
          this.doesOBBOverlapAxisBox(sRel, dFromEgo, relYaw, actorHalfL, actorHalfW, sRel, 0, Math.max(1.5, actorHalfL), egoEffHalfW + 0.08);

      if (plan.overtaking?.active && plan.overtaking.targetActorId && actor.id === plan.overtaking.targetActorId) {
        out.overtakenActorFound = true;
        out.overtakenActorBehindGapM = -sRel - egoHalfL - halfLong;
        out.overtakenActorX = actor.x;
        out.overtakenActorY = actor.y;
        out.overtakenActorZ = actor.z;
        out.overtakenActorYaw = actor.yaw;
        out.overtakenActorWidth = actor.width;
        out.overtakenActorLength = actor.length;
        out.overtakenActorHeight = actor.height;
        out.overtakenActorKind = actor.kind;
      }
      const isStatic = actor.kind === 'static-obstacle' || Math.abs(actor.speed) < 0.25;
      const actorMotion: 'same' | 'oncoming' | 'crossing' | 'static' = isStatic
        ? 'static'
        : vLong < -1.5
          ? 'oncoming'
          : Math.abs(vLat) > Math.abs(vLong) * 0.8 && Math.abs(vLat) > 0.6
            ? 'crossing'
            : 'same';

      // 1. Check upcoming urban junction blockage (skip free-flow highway/ramp seams and non-intruding roadside fixtures)
      if (
        plan.valid &&
        upcomingJ.valid &&
        !upcomingJ.isRampTransition &&
        upcomingJ.distanceToStopLineM < 65 &&
        (isStatic || Math.abs(actor.speed) < 1.2) &&
        (!isRoadsideFixture || intrudesCurrentLane)
      ) {
        if (this.isActorBlockingJunction(actor, upcomingJ, plan, laneW, vehicle.vehicleWidth)) {
          out.junctionBlocked = true;
        }
      }

      const intrudesLeftLane =
        out.leftLane.exists &&
        (isLongOBB
          ? this.doesActorOverlapCurvedPath(actor, plan, -laneW, laneW * 0.5 - 0.08, pathY)
          : Math.abs(dRel + laneW) - halfLat < laneW * 0.5 - 0.08);
      const intrudesRightLane =
        out.rightLane.exists &&
        (isLongOBB
          ? this.doesActorOverlapCurvedPath(actor, plan, laneW, laneW * 0.5 - 0.08, pathY)
          : Math.abs(dRel - laneW) - halfLat < laneW * 0.5 - 0.08);

      // Skip roadside posts/boards/piers/walls located cleanly outside drivable roadway & vehicle corridor
      if (isRoadsideFixture && !intrudesCurrentLane && !intrudesLeftLane && !intrudesRightLane) {
        continue;
      }

      // 2. Check ego's physical swept corridor along planned local trajectory + cut-in prediction
      const plannedCorridorD = hasLocalOffset
        ? evaluateLocalTrajectoryOffsetAtDs(lt, clampADAS(sRel, 0, 55))
        : egoLatInPlan;
      const dFromPlanned = dRel - plannedCorridorD;
      const dFromCorridor =
        hasLocalOffset && sRel < 7.5 && Math.abs(egoLatInPlan - plannedCorridorD) > 0.25
          ? (Math.abs(dFromEgo) < Math.abs(dFromPlanned) ? dFromEgo : dFromPlanned)
          : dFromPlanned;
      const adjacentLaneStatic = isStatic && Math.abs(dRel - (hasLocalOffset ? plannedCorridorD : 0)) > laneW * 0.52;
      const corridorLatPad = isRoadsideFixture ? 0.12 : adjacentLaneStatic ? 0.04 : hasLocalOffset ? 0.14 : 0.26;
      const inLaneCorridor = isLongOBB
        ? (!isRoadsideFixture || intrudesCurrentLane) &&
          this.doesActorOverlapCurvedPath(actor, plan, plannedCorridorD, egoEffHalfW + corridorLatPad, pathY)
        : (!isRoadsideFixture || intrudesCurrentLane) &&
          Math.abs(dFromCorridor) <= egoEffHalfW + halfLat + corridorLatPad &&
          this.doesOBBOverlapAxisBox(
            sRel,
            dFromCorridor,
            relYaw,
            actorHalfL,
            actorHalfW,
            Math.max(0, sRel),
            0,
            Math.max(1.5, actorHalfL + 0.5),
            egoEffHalfW + corridorLatPad,
          );
      const predictedD = dFromCorridor + vLat * 1.4;
      const movingIntoLane = dFromCorridor * vLat < -0.25;
      const isCutIn =
        !inLaneCorridor &&
        !isStatic &&
        movingIntoLane &&
        Math.abs(dFromCorridor) <= laneW + halfLat + 0.6 &&
        Math.abs(predictedD) <= egoEffHalfW + halfLat + 0.35 &&
        sRel > -egoHalfL &&
        sRel < 55;
      const isPedestrianCrossing =
        actor.kind === 'pedestrian' &&
        !inLaneCorridor &&
        Math.abs(dFromCorridor) <= laneW * 1.5 &&
        Math.abs(predictedD) <= egoEffHalfW + halfLat + 0.45 &&
        sRel > -egoHalfL &&
        sRel < Math.max(30, egoSpeed * 3.5);

      const justBypassedClear =
        this.bypassedActorId !== '' &&
        actor.id === this.bypassedActorId &&
        world.simulationTime <= this.bypassedUntilTime &&
        (sRel < egoHalfL || Math.abs(dFromCorridor) > egoEffHalfW + halfLat * 0.4);

      if (!justBypassedClear && (inLaneCorridor || isCutIn || isPedestrianCrossing) && sRel > -egoHalfL * 0.5) {
        const longSpan = isLongOBB ? Math.min(halfLong, 6.0) : halfLong;
        const netGap = sRel - egoHalfL - longSpan;
        if (netGap < bestLeadGap) {
          bestLeadGap = netGap;
          bestLeadSpeed = vLong;
          bestLeadId = actor.id;
          bestLeadKind = actor.kind;
          bestLeadStatic = isStatic;
          bestLeadInfrastructure = isRoadsideFixture;
          bestLeadCutIn = isCutIn || isPedestrianCrossing;
          bestLeadActor = actor;
          bestLeadInCorridor = inLaneCorridor;
          bestLeadMotion = actorMotion;
        }
      }

      // Adjacent lane evaluations already populated in collectPerceptionAndAdjacent()
    }

    // Store lead actor telemetry
    if (bestLeadGap < Infinity) {
      out.hasLeadActor = true;
      out.leadActorId = bestLeadId;
      out.leadActorKind = bestLeadKind;
      out.leadIsStatic = bestLeadStatic;
      out.leadIsInfrastructure = bestLeadInfrastructure;
      if (bestLeadActor) {
        out.leadX = bestLeadActor.x;
        out.leadY = bestLeadActor.y;
        out.leadZ = bestLeadActor.z;
        out.leadYaw = bestLeadActor.yaw;
        out.leadWidth = bestLeadActor.width;
        out.leadLength = bestLeadActor.length;
        out.leadHeight = bestLeadActor.height;
      }
      out.leadInCorridor = bestLeadInCorridor;
      out.leadMotionDirection = bestLeadMotion;
      out.leadGapM = bestLeadGap;
      out.leadSpeedMps = bestLeadSpeed;
      out.closingSpeedMps = egoSpeed - bestLeadSpeed;
      out.cutInDetected = bestLeadCutIn;
      out.ttcSeconds =
        out.closingSpeedMps > 0.15
          ? Math.max(0, bestLeadGap) / out.closingSpeedMps
          : Infinity;
    }

    this.sampledLeadGapM = bestLeadGap;
    this.sampledLeadSpeedMps = bestLeadSpeed;

    // 4. Compute safe following speed & obstacle stop distance
    const reliabilityFactor = out.dataReliable ? 1.0 : 1.5;
    if (out.hasLeadActor) {
      const standstillGap = config.minStandstillGapM * reliabilityFactor;
      const desiredHeadway = config.followTimeHeadwayS * reliabilityFactor;
      const effectiveGap = bestLeadGap - standstillGap;

      if (bestLeadStatic || bestLeadSpeed < 0.35) {
        out.stopDistanceM = Math.max(0, effectiveGap);
        if (effectiveGap <= 0.4) {
          out.targetSpeedMps = 0;
        } else {
          out.targetSpeedMps = Math.sqrt(2 * config.comfortDecelMps2 * effectiveGap);
        }
        out.reason = bestLeadStatic ? '前方静态障碍物' : '前车已停车';
      } else {
        // Intelligent Driver Model (IDM) car-following with smooth long-range damping
        const s0 = Math.max(2.0, standstillGap);
        const T = Math.max(1.2, desiredHeadway);
        const aIdm = 1.8;
        const bIdm = 2.2;
        const closing = egoSpeed - bestLeadSpeed;
        const sStar = s0 + Math.max(0, egoSpeed * T + (egoSpeed * closing) / (2 * Math.sqrt(aIdm * bIdm)));
        const vDesired = Math.max(1.0, plan.currentSpeedLimitMps);
        const ratioFree = Math.pow(egoSpeed / vDesired, 4);
        const ratioInt = Math.pow(sStar / Math.max(0.5, bestLeadGap), 2);
        let idmAccel = clampADAS(aIdm * (1 - ratioFree - ratioInt), -config.maxNormalDecelMps2, aIdm);
        if (bestLeadGap > 55 && idmAccel < -1.2) {
          const distAtten = clampADAS((bestLeadGap - 55) / 55, 0, 1);
          const gentleFloor = -1.2 - (1 - distAtten) * (config.maxNormalDecelMps2 - 1.2);
          idmAccel = Math.max(idmAccel, gentleFloor);
        }
        const followTarget =
          bestLeadGap > 22
            ? Math.max(bestLeadSpeed * 0.9, egoSpeed + idmAccel * 0.85)
            : Math.max(0, egoSpeed + idmAccel * 0.85);

        // Also bound by kinematic braking envelope if closing rapidly
        const kinematicCap =
          effectiveGap <= 0.4
            ? Math.max(0, bestLeadSpeed * 0.5)
            : Math.sqrt(Math.max(0, bestLeadSpeed * bestLeadSpeed + 2 * config.comfortDecelMps2 * effectiveGap));
        out.targetSpeedMps = Math.max(0, Math.min(followTarget, kinematicCap));
        if (effectiveGap < 0.8 && bestLeadSpeed < 1.0) {
          out.stopDistanceM = Math.max(0, effectiveGap);
        }
        out.reason = bestLeadCutIn ? '邻道车辆切入，减速让行' : 'IDM跟车保持安全车距';
      }
    }

    // Conservative speed cap when perception data is degraded/unreliable
    if (!out.dataReliable) {
      out.targetSpeedMps = Math.min(out.targetSpeedMps, 12.0);
      if (!out.reason) out.reason = '感知数据不稳定，保守限速';
    }

    // 5. Compute non-imminent AEB guard for planning decisions (full AEB runs after evasion check below)
    const criticalAebNow =
      out.hasLeadActor &&
      ((egoSpeed > 1.2 && out.leadGapM <= config.aebCriticalGapM && out.closingSpeedMps > 0.2) ||
        (egoSpeed > 1.5 && out.closingSpeedMps > 0.5 && out.ttcSeconds <= config.aebTtcThresholdS));

    // 6. Decide obstacle avoidance / overtaking lane-change request (never cross solid/median/junction)
    const roadLimit = plan.currentSpeedLimitMps;
    const actorAtOrBeyondStopLine =
      plan.upcomingJunction.valid &&
      !plan.upcomingJunction.isRampTransition &&
      bestLeadGap > Math.max(0, plan.upcomingJunction.distanceToStopLineM - 2.0);
    const inHighwayOrRampGore =
      plan.inJunction ||
      (plan.upcomingJunction.valid &&
        plan.upcomingJunction.isRampTransition &&
        plan.upcomingJunction.distanceToJunctionEntryM < 45);
    if (
      plan.valid &&
      out.hasLeadActor &&
      !criticalAebNow &&
      !plan.inJunction &&
      (!plan.nearJunctionSolidZone || (bestLeadStatic && bestLeadGap < 40 && !inHighwayOrRampGore)) &&
      !plan.laneChange.active &&
      !out.junctionBlocked &&
      !actorAtOrBeyondStopLine &&
      out.dataReliable
    ) {
      const slowThreshold = Math.max(2.5, roadLimit - config.overtakingMinSpeedDiffMps);
      const triggerRange = Math.max(bestLeadStatic ? 55 : 48, egoSpeed * 5.0 + 25);
      const shouldAvoid =
        bestLeadGap < triggerRange &&
        bestLeadGap > 4.0 &&
        (bestLeadStatic || bestLeadSpeed < slowThreshold);

      if (shouldAvoid) {
        const leftSolidBypassPossible =
          bestLeadStatic &&
          !inHighwayOrRampGore &&
          bestLeadGap < 40 &&
          out.leftLane.exists &&
          out.leftLane.safe &&
          plan.leftBoundary === 'solid';
        const rightSolidBypassPossible =
          bestLeadStatic &&
          !inHighwayOrRampGore &&
          bestLeadGap < 40 &&
          out.rightLane.exists &&
          out.rightLane.safe &&
          plan.rightBoundary === 'solid';

        if (out.leftLane.safe && out.leftLane.boundaryCrossable && out.leftLane.routeCompatible) {
          out.avoidanceRequest = 'left';
          out.reason = bestLeadStatic ? '向左变道绕行静态障碍物' : '向左变道主动超车';
        } else if (out.rightLane.safe && out.rightLane.boundaryCrossable && out.rightLane.routeCompatible) {
          out.avoidanceRequest = 'right';
          out.reason = bestLeadStatic ? '向右变道绕行静态障碍物' : '向右变道主动超车';
        } else if (leftSolidBypassPossible) {
          out.avoidanceRequest = 'left';
          out.allowSolidBypass = true;
          out.targetSpeedMps = Math.min(out.targetSpeedMps, config.obstacleBypassSpeedCapMps);
          out.reason = '借道跨越实线绕行障碍物';
        } else if (rightSolidBypassPossible) {
          out.avoidanceRequest = 'right';
          out.allowSolidBypass = true;
          out.targetSpeedMps = Math.min(out.targetSpeedMps, config.obstacleBypassSpeedCapMps);
          out.reason = '借道跨越实线绕行障碍物';
        } else {
          out.avoidanceRequest = 'none';
          if (bestLeadStatic) {
            const allLanesBlocked = (!out.leftLane.exists || !out.leftLane.safe) && (!out.rightLane.exists || !out.rightLane.safe);
            if (allLanesBlocked && bestLeadGap < 45) {
              out.roadBlocked = true;
              out.reason = '前方道路完全阻断，减速安全停车';
            } else {
              out.reason = '相邻车道无安全空间，减速跟车/停车';
            }
          } else {
            out.reason = out.leftLane.exists && !out.leftLane.safe && out.leftLane.blockReason
              ? out.leftLane.blockReason
              : out.rightLane.exists && !out.rightLane.safe && out.rightLane.blockReason
                ? out.rightLane.blockReason
                : '邻道暂无安全间隙，保持跟车观察';
          }
        }
      }
    }

    // 7. Compute non-blocking evasion speed envelope when a safe lane change / overtake is confirmed or executing
    const activeEvadeDir: 'left' | 'right' | null =
      plan.laneChange.active && plan.laneChange.direction
        ? plan.laneChange.direction
        : out.avoidanceRequest !== 'none'
          ? out.avoidanceRequest
          : null;

    if (
      activeEvadeDir !== null &&
      out.hasLeadActor &&
      !criticalAebNow &&
      !out.junctionBlocked &&
      !actorAtOrBeyondStopLine &&
      out.dataReliable
    ) {
      const targetClearance = activeEvadeDir === 'left' ? out.leftLane : out.rightLane;
      const allowBypassActive =
        out.allowSolidBypass ||
        (plan.laneChange.active && plan.laneChange.reason === 'obstacle');
      const laneClearedSafe = targetClearance.safe || allowBypassActive;

      let tClear = 0;
      if (plan.laneChange.active) {
        if (plan.laneChange.phase === 'signaling') {
          tClear = Math.max(0, plan.laneChange.signalLeadSeconds - plan.laneChange.elapsedSeconds) + 0.60 * plan.laneChange.durationSeconds;
        } else if (plan.laneChange.phase === 'executing') {
          tClear = Math.max(0, 0.60 * plan.laneChange.durationSeconds - plan.laneChange.elapsedSeconds);
        } else {
          tClear = 0;
        }
      } else {
        const estLcDur = clampADAS(egoSpeed < 8 ? 3.5 : 3.0, 2.6, 4.0);
        const estSigLead = Math.max(0.85, Math.min(2.4, config.laneChangeSignalLeadS));
        tClear = estSigLead + 0.58 * estLcDur;
      }

      // Check forward vehicle speed cap in the TARGET lane so we never rush into a blocker there
      let targetLaneFrontCap = Infinity;
      if (Number.isFinite(targetClearance.frontGapM) && targetClearance.frontGapM < 130) {
        const tlGap = Math.max(0, targetClearance.frontGapM - config.minStandstillGapM);
        const tlFrontV = Number.isFinite(targetClearance.frontSpeedMps) ? Math.max(0, targetClearance.frontSpeedMps) : 0;
        targetLaneFrontCap = Math.sqrt(Math.max(0, tlFrontV * tlFrontV + 2 * config.comfortDecelMps2 * tlGap));
      }

      // Ensure gap at lateral departure stays safely outside AEB TTC envelope so lateral bypass never triggers AEB
      const ttcSafeGap = Math.max(0, egoSpeed - Math.max(0, bestLeadSpeed)) * (config.aebTtcThresholdS + 0.22);
      const evasionMargin = Math.max(bestLeadStatic ? 8.0 : 5.5, ttcSafeGap);
      if (laneClearedSafe) {
        if (tClear <= 0.15) {
          out.canEvadeWithoutStopping = true;
          out.avoidanceTargetSpeedMps = out.allowSolidBypass
            ? Math.min(config.obstacleBypassSpeedCapMps, targetLaneFrontCap)
            : targetLaneFrontCap;
          out.stopDistanceM = Infinity;
        } else if (bestLeadGap > evasionMargin + 1.5) {
          const maxEvadeV = Math.max(0, bestLeadSpeed) + (bestLeadGap - evasionMargin) / tClear;
          if (maxEvadeV > Math.max(bestLeadSpeed + 1.5, 4.0)) {
            out.canEvadeWithoutStopping = true;
            out.avoidanceTargetSpeedMps = out.allowSolidBypass
              ? Math.min(config.obstacleBypassSpeedCapMps, targetLaneFrontCap, maxEvadeV)
              : Math.min(targetLaneFrontCap, maxEvadeV);
            out.stopDistanceM = Infinity;
          }
        } else if (
          plan.laneChange.active &&
          plan.laneChange.phase === 'executing' &&
          bestLeadStatic &&
          bestLeadGap > config.aebCriticalGapM + 0.6
        ) {
          // Low-speed lateral departure crawl when already executing a verified bypass around a stopped obstacle
          const safeCrawlV = clampADAS(
            (bestLeadGap - config.aebCriticalGapM * 0.45) / Math.max(1.2, tClear + 0.35),
            1.6,
            Math.min(config.obstacleBypassSpeedCapMps, 4.5),
          );
          out.canEvadeWithoutStopping = true;
          out.avoidanceTargetSpeedMps = Math.min(targetLaneFrontCap, safeCrawlV);
          out.stopDistanceM = Infinity;
        }
      }
    }

    if (
      config.overtakingEnabled &&
      out.hasLeadActor &&
      !bestLeadStatic &&
      !out.allowSolidBypass &&
      out.avoidanceRequest !== 'none' &&
      roadLimit >= config.overtakingMinRoadLimitMps &&
      bestLeadSpeed < roadLimit - config.overtakingMinSpeedDiffMps
    ) {
      out.overtakeRecommended = true;
      out.overtakeDirection = out.avoidanceRequest;
      out.overtakeActorId = bestLeadId;
    }

    // Apply continuous local trajectory speed & solid-bypass flags when dodging inside drivable corridor
    if (hasLocalOffset && lt) {
      if (Number.isFinite(lt.speedCapMps)) {
        out.targetSpeedMps = Math.min(out.targetSpeedMps, lt.speedCapMps);
      }
      if (lt.boundaryEncroachment === 'left_solid' || lt.boundaryEncroachment === 'right_solid') {
        out.allowSolidBypass = true;
      }
      if (!out.hasLeadActor && lt.mode !== 'driver_offset_hold' && lt.reason) {
        out.reason = lt.reason;
      }
    }

    // 8. Evaluate emergency braking immediately with updated evasion clearance
    this.evaluateAEB(vehicle, config);
    if (out.emergencyBraking) {
      out.canEvadeWithoutStopping = false;
      out.avoidanceRequest = 'none';
    }

    return out;
  }

  /**
   * 120 Hz fast safety check: extrapolates latest tracked lead kinematics at physics rate
   * so emergency braking reacts within one physics step (~8.3 ms) without full perception overhead.
   */
  public updateFastSafetyCheck(
    dt: number,
    vehicle: ADASVehicleState,
    config: Readonly<ADASConfig>,
  ): void {
    this.timeSinceSample += dt;
    const out = this.assessment;
    if (!out.hasLeadActor || !Number.isFinite(this.sampledLeadGapM)) {
      this.aebLatched = false;
      out.emergencyBraking = false;
      out.emergencyBrakeDemand = 0;
      return;
    }

    const egoSpeed = Math.max(0, vehicle.speed);
    const closing = egoSpeed - this.sampledLeadSpeedMps;
    const extrapGap = this.sampledLeadGapM - closing * Math.min(this.timeSinceSample, 0.12);
    out.leadGapM = extrapGap;
    out.closingSpeedMps = closing;
    out.ttcSeconds = closing > 0.15 ? Math.max(0, extrapGap) / closing : Infinity;

    this.evaluateAEB(vehicle, config);
  }

  private evaluateAEB(vehicle: ADASVehicleState, config: Readonly<ADASConfig>): void {
    const out = this.assessment;
    const egoSpeed = Math.max(0, vehicle.speed);
    const gap = out.leadGapM;
    const closing = out.closingSpeedMps;
    const ttc = out.ttcSeconds;

    if (!out.hasLeadActor || !Number.isFinite(gap)) {
      this.aebLatched = false;
      out.emergencyBraking = false;
      out.emergencyBrakeDemand = 0;
      return;
    }

    // Physical emergency decel required to avoid collision with 1.4m margin
    const usableGap = Math.max(0.25, gap - 1.4);
    const requiredDecel = closing > 0.4 ? (closing * closing) / (2 * usableGap) : 0;

    const triggerAEB =
      (egoSpeed > 1.2 && gap <= config.aebCriticalGapM && closing > 0.2) ||
      (egoSpeed > 1.5 && closing > 0.5 && ttc <= config.aebTtcThresholdS) ||
      ((!out.canEvadeWithoutStopping || gap < 14.0) &&
        egoSpeed > 2.0 &&
        closing > 1.5 &&
        gap < 42 &&
        requiredDecel >= config.maxNormalDecelMps2 * 1.05);

    const releaseAEB =
      egoSpeed < 0.25 ||
      (closing <= 0.1 && gap > config.aebCriticalGapM + 1.5) ||
      (ttc > config.aebTtcThresholdS + 0.85 && gap > config.aebCriticalGapM + 2.2 && requiredDecel < config.comfortDecelMps2);

    if (triggerAEB) this.aebLatched = true;
    else if (releaseAEB) this.aebLatched = false;

    out.emergencyBraking = this.aebLatched;
    if (this.aebLatched) {
      const severity = clampADAS(
        Math.max(
          (config.aebTtcThresholdS + 0.3 - ttc) / Math.max(0.3, config.aebTtcThresholdS),
          requiredDecel / 7.5,
          gap < config.aebCriticalGapM ? 1.0 : 0.75,
        ),
        0.78,
        1.0,
      );
      out.emergencyBrakeDemand = severity;
      out.targetSpeedMps = 0;
      out.reason = out.cutInDetected ? '前车切入！紧急制动' : '碰撞风险！紧急制动';
    } else {
      out.emergencyBrakeDemand = 0;
    }
  }

  private initAdjacentClearance(
    out: AdjacentLaneClearance,
    side: 'left' | 'right',
    plan: ADASPlanSnapshot,
  ): void {
    this.resetClearance(out);
    if (!plan.valid) {
      out.blockReason = '无有效路线';
      return;
    }
    const targetIdx = plan.currentApproachLaneIndex + (side === 'left' ? -1 : 1);
    out.exists = targetIdx >= 0 && targetIdx < plan.currentApproachLaneCount;
    if (!out.exists) {
      out.blockReason = side === 'left' ? '左侧无同向车道' : '右侧无同向车道';
      return;
    }
    const boundary = side === 'left' ? plan.leftBoundary : plan.rightBoundary;
    out.boundaryCrossable = boundary === 'dashed' && !plan.inJunction && !plan.nearJunctionSolidZone;
    // Continuous solid lines away from junction approach, medians, and road edges prohibit moving lane changes
    if (boundary === 'median' || boundary === 'road-edge' || (boundary === 'solid' && !plan.nearJunctionSolidZone)) {
      out.blockReason =
        boundary === 'median'
          ? '禁止跨越中央隔离带'
          : boundary === 'road-edge'
            ? '道路边界不可跨越'
            : '实线禁止变道';
      return;
    }
    if (!out.boundaryCrossable) {
      out.blockReason = boundary === 'solid' ? '实线禁止常规变道' : '实线/路口禁止变道';
    }

    // Route compatibility check: don't move away from required turn lane right before junction
    const j = plan.upcomingJunction;
    out.routeCompatible = true;
    if (j.valid && j.distanceToJunctionEntryM < 55) {
      if ((j.turnDirection === 'left' || j.turnDirection === 'uturn') && side === 'right') {
        out.routeCompatible = false;
        out.blockReason = '即将左转，不向右变道';
      } else if (j.turnDirection === 'right' && side === 'left') {
        out.routeCompatible = false;
        out.blockReason = '即将右转，不向左变道';
      }
    }
    // Note: solid lane line sets boundaryCrossable=false, while safe still reflects physical corridor freedom for emergency static-obstacle bypass
    out.safe = out.routeCompatible && !plan.inJunction;
  }

  private evaluateActorAgainstAdjacentLane(
    side: 'left' | 'right',
    actor: TrafficActorSnapshot,
    simTime: number,
    pathYaw: number,
    relYaw: number,
    sRel: number,
    dFromTargetLane: number,
    actorVLong: number,
    actorVLat: number,
    actorAccel: number,
    actorMotion: 'same' | 'oncoming' | 'crossing' | 'static',
    egoSpeed: number,
    egoHalfL: number,
    egoEffHalfW: number,
    wheelBase: number,
    actorHalfL: number,
    actorHalfW: number,
    laneW: number,
    remSigS: number,
    out: AdjacentLaneClearance,
  ): void {
    const absCosA = Math.abs(Math.cos(relYaw));
    const absSinA = Math.abs(Math.sin(relYaw));
    const actorProjHalfW = actorHalfW * absCosA + actorHalfL * absSinA;
    const actorProjHalfL = actorHalfL * absCosA + actorHalfW * absSinA;

    // 1. Direct oncoming vehicle check in target lane corridor
    if (Math.abs(dFromTargetLane) <= laneW * 0.55 + actorProjHalfW) {
      if (actorMotion === 'oncoming' || actorVLong < -1.5) {
        out.safe = false;
        out.blockReason = '目标车道有对向来车';
        return;
      }
    }

    const egoStartOffsetInTarget = side === 'left' ? laneW : -laneW;
    // Skip actors centered wholly inside ego's origin lane that are NOT moving toward the target lane:
    // otherwise ego's own lead vehicle would falsely trigger spatio-temporal overlap during the S-curve start (t=0.4s)
    // and cancel overtaking against an empty adjacent lane.
    const centeredInOriginLane = Math.abs(dFromTargetLane - egoStartOffsetInTarget) < laneW * 0.42;
    const movingTowardTarget = side === 'left' ? actorVLat < -0.22 : actorVLat > 0.22;
    const traj = actor.predictedTrajectory;
    const hasTraj = traj !== undefined && traj.length > 0;
    if (centeredInOriginLane && !movingTowardTarget && actorMotion !== 'crossing' && !hasTraj) {
      return;
    }

    // 2. Full Spatio-Temporal Trajectory Occupancy Prediction with 2D SAT & wheel-swing envelope
    const lcDurationS = clampADAS(egoSpeed < 8 ? 3.6 : 2.9, 2.6, 4.3);
    const cosY = Math.cos(pathYaw);
    const sinY = Math.sin(pathYaw);
    const fx = -sinY, fz = -cosY;
    const rx = cosY, rz = -sinY;

    for (let h = 0; h < PREDICTION_HORIZONS_S.length; h++) {
      const tExec = PREDICTION_HORIZONS_S[h]!;
      if (tExec > lcDurationS + 0.4) break;
      const tAbs = remSigS + tExec;

      // Ego's quintic S-curve transition & tangent yaw in target lane coordinate frame
      const tau = Math.min(1.0, tExec / lcDurationS);
      const sCurve = tau * tau * tau * (10 + tau * (-15 + 6 * tau));
      const dCurveDTau = 30 * tau * tau * (1 - tau) * (1 - tau);
      const vLatEgo = -(dCurveDTau / lcDurationS) * egoStartOffsetInTarget;
      const egoRelYaw = Math.atan2(vLatEgo, Math.max(2.0, egoSpeed));
      const swingMargin = Math.min(0.30, Math.abs(egoRelYaw) * wheelBase * 0.22);
      const egoD = (1.0 - sCurve) * egoStartOffsetInTarget;
      const egoS = egoSpeed * tAbs;

      // Actor predicted position at tAbs (uses valid future predictedTrajectory when supplied, else constant-accel/damped-lat fallback)
      let actS: number;
      let actD: number;
      const actorTs = Number.isFinite(actor.timestamp) ? actor.timestamp : 0;
      const trajIsAbsolute = hasTraj && actorTs > 0 && traj[0]!.timestamp >= actorTs - 0.5;
      const useTrajNow =
        hasTraj &&
        (trajIsAbsolute
          ? simTime <= traj[traj.length - 1]!.timestamp
          : simTime <= traj[traj.length - 1]!.timestamp);
      if (useTrajNow && hasTraj) {
        const firstTs = traj[0]!.timestamp;
        const baseT = simTime;
        const targetT = baseT + tAbs;
        let px = actor.x;
        let pz = actor.z;
        if (targetT <= firstTs) {
          const spanT = firstTs - baseT;
          const u = spanT > 1e-4 ? clampADAS((targetT - baseT) / spanT, 0, 1) : 1;
          px = actor.x + (traj[0]!.x - actor.x) * u;
          pz = actor.z + (traj[0]!.z - actor.z) * u;
        } else {
          const lastPt = traj[traj.length - 1]!;
          if (targetT >= lastPt.timestamp) {
            const extraT = targetT - lastPt.timestamp;
            px = lastPt.x + actor.vx * extraT;
            pz = lastPt.z + actor.vz * extraT;
          } else {
            for (let k = 0; k < traj.length - 1; k++) {
              const pA = traj[k]!;
              const pB = traj[k + 1]!;
              if (targetT >= pA.timestamp && targetT <= pB.timestamp) {
                const spanT = pB.timestamp - pA.timestamp;
                const u = spanT > 1e-4 ? clampADAS((targetT - pA.timestamp) / spanT, 0, 1) : 0;
                px = pA.x + (pB.x - pA.x) * u;
                pz = pA.z + (pB.z - pA.z) * u;
                break;
              }
            }
          }
        }
        const dxTraj = px - actor.x;
        const dzTraj = pz - actor.z;
        actS = sRel + dxTraj * fx + dzTraj * fz;
        actD = dFromTargetLane + dxTraj * rx + dzTraj * rz;
      } else {
        const latDamp = tAbs < 1.2 ? tAbs : 1.2 + (tAbs - 1.2) * 0.45;
        actD = dFromTargetLane + actorVLat * latDamp;
        const clampedVLong = Math.max(-5, actorVLong + clampADAS(actorAccel, -4, 3) * tAbs);
        actS = sRel + 0.5 * (actorVLong + clampedVLong) * tAbs;
      }

      // Ignore origin-lane lateral adjacency before ego starts moving into the corridor
      if (Math.abs(actD - egoStartOffsetInTarget) < 0.7 && Math.abs(egoD - egoStartOffsetInTarget) < 0.5 && tExec < 0.8 && !movingTowardTarget) {
        continue;
      }

      const deltaS = actS - egoS;
      const frontHeadway = deltaS >= 0 ? Math.max(4.0, egoSpeed * 0.95) : Math.max(4.5, Math.max(0, actorVLong) * 1.0);

      // Exact rotated 2D SAT check with full ego width, wheelbase corner swing, and predicted headway buffer
      const satConflict = this.doesOBBOverlapOBB(
        egoS,
        egoD,
        egoRelYaw,
        egoHalfL + frontHeadway * 0.5,
        egoEffHalfW + swingMargin + 0.25,
        actS,
        actD,
        relYaw,
        actorHalfL + frontHeadway * 0.5,
        actorHalfW + 0.12,
      );

      if (satConflict) {
        out.safe = false;
        if (sRel > 0 && (Math.abs(actorVLat) > 0.2 || hasTraj)) {
          out.blockReason = `时空轨迹冲突：目标在 ${tAbs.toFixed(1)}s 后侵占变道走廊`;
        } else if (sRel < 0) {
          out.blockReason = `时空轨迹冲突：后车在 ${tAbs.toFixed(1)}s 后逼近变道走廊`;
        } else {
          out.blockReason = `时空轨迹冲突：预测在 ${tAbs.toFixed(1)}s 发生空间干涉`;
        }
        return;
      }
    }

    // 3. Static / quasi-static target lane occupancy and gap tracking
    if (Math.abs(dFromTargetLane) > laneW * 0.48 + actorProjHalfW + 0.15) return;

    const totalHorizonS = remSigS + lcDurationS;
    if (sRel >= 0) {
      const frontGap = sRel - egoHalfL - actorProjHalfL;
      if (frontGap < out.frontGapM) {
        out.frontGapM = frontGap;
        out.frontSpeedMps = actorVLong;
      }
      const closing = egoSpeed - actorVLong;
      const predictedGap = frontGap - closing * totalHorizonS;
      const ttc = closing > 0.15 ? Math.max(0, frontGap) / closing : Infinity;
      if (ttc < out.minTTCSeconds) out.minTTCSeconds = ttc;

      const minFrontReq = Math.max(7.5, egoSpeed * 1.0);
      if (frontGap < minFrontReq || predictedGap < 4.5 || ttc < Math.max(3.6, totalHorizonS * 0.85)) {
        out.safe = false;
        out.blockReason = '目标车道前方安全车距不足';
      }
    } else {
      const rearGap = -sRel - egoHalfL - actorProjHalfL;
      if (rearGap < out.rearGapM) out.rearGapM = rearGap;
      const rearClosing = actorVLong - egoSpeed;
      const predictedRearGap = rearGap - rearClosing * totalHorizonS;
      const rearTTC = rearClosing > 0.15 ? Math.max(0, rearGap) / rearClosing : Infinity;
      if (rearTTC < out.minTTCSeconds) out.minTTCSeconds = rearTTC;

      const minRearReq = Math.max(7.5, actorVLong * 0.95);
      const safeMergeRearGap = Math.max(5.5, actorVLong * 0.55);
      if (
        rearGap < minRearReq ||
        predictedRearGap < safeMergeRearGap ||
        rearTTC < Math.max(3.8, totalHorizonS + 0.6)
      ) {
        out.safe = false;
        out.blockReason = rearClosing > 2.0 ? '目标车道后方车辆快速接近，等待安全间隙' : '目标车道后方来车风险';
      }
    }
  }

  private projectActorToPath(
    actor: TrafficActorSnapshot,
    vehicle: ADASVehicleState,
    plan: ADASPlanSnapshot,
    out: {
      s: number;
      d: number;
      vLong: number;
      vLat: number;
      pathYaw: number;
      pathY: number;
      atPathBoundary: boolean;
      usedBodyFallback: boolean;
      valid: boolean;
    },
  ): void {
    if (plan.valid && plan.sampleCount >= 2) {
      // Find nearest sample along local path (bounded <= 220 samples)
      let bestIdx = -1;
      let bestDistSq = Infinity;
      const samples = plan.samples;
      for (let i = 0; i < plan.sampleCount; i++) {
        const sp = samples[i]!;
        const dx = actor.x - sp.x;
        const dz = actor.z - sp.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0 && bestDistSq < 18 * 18) {
        const sp = samples[bestIdx]!;
        const cosY = Math.cos(sp.yaw);
        const sinY = Math.sin(sp.yaw);
        const fx = -sinY, fz = -cosY;
        const rx = cosY, rz = -sinY;
        const dx = actor.x - sp.x;
        const dz = actor.z - sp.z;
        const alongDelta = dx * fx + dz * fz;
        out.s = sp.s + alongDelta - plan.egoS;
        out.d = dx * rx + dz * rz;
        out.vLong = actor.vx * fx + actor.vz * fz;
        out.vLat = actor.vx * rx + actor.vz * rz;
        out.pathYaw = sp.yaw;
        out.pathY = sp.y;
        out.atPathBoundary =
          (bestIdx === plan.sampleCount - 1 && alongDelta > 3.5) ||
          (bestIdx === 0 && alongDelta < -3.5);
        out.usedBodyFallback = false;
        out.valid = true;
        return;
      }
    }

    // Fallback to vehicle body frame when off-plan or straight ahead
    const cosY = Math.cos(vehicle.yaw);
    const sinY = Math.sin(vehicle.yaw);
    const fx = -sinY, fz = -cosY;
    const rx = cosY, rz = -sinY;
    const dx = actor.x - vehicle.x;
    const dz = actor.z - vehicle.z;
    out.s = dx * fx + dz * fz;
    out.d = dx * rx + dz * rz;
    out.vLong = actor.vx * fx + actor.vz * fz;
    out.vLat = actor.vx * rx + actor.vz * rz;
    out.pathYaw = vehicle.yaw;
    out.pathY = vehicle.y;
    out.atPathBoundary = false;
    out.usedBodyFallback = true;
    out.valid = true;
  }

  /**
   * Zero-allocation 2D Separating Axis Theorem (SAT) overlap test between an oriented actor OBB
   * and an axis-aligned box in path coordinates.
   */
  private doesOBBOverlapAxisBox(
    obbS: number,
    obbD: number,
    obbYaw: number,
    obbHalfL: number,
    obbHalfW: number,
    boxS: number,
    boxD: number,
    boxHalfS: number,
    boxHalfD: number,
  ): boolean {
    const ds = obbS - boxS;
    const dd = obbD - boxD;
    const c = Math.cos(obbYaw);
    const s = Math.sin(obbYaw);
    const ac = Math.abs(c);
    const as = Math.abs(s);
    if (Math.abs(ds) > boxHalfS + obbHalfL * ac + obbHalfW * as) return false;
    if (Math.abs(dd) > boxHalfD + obbHalfL * as + obbHalfW * ac) return false;
    if (Math.abs(ds * c + dd * s) > obbHalfL + boxHalfS * ac + boxHalfD * as) return false;
    if (Math.abs(-ds * s + dd * c) > obbHalfW + boxHalfS * as + boxHalfD * ac) return false;
    return true;
  }

  /**
   * Zero-allocation 2D SAT overlap test between two arbitrary rotated OBBs in Frenet (s, d) space.
   */
  private doesOBBOverlapOBB(
    sA: number,
    dA: number,
    yawA: number,
    halfLA: number,
    halfWA: number,
    sB: number,
    dB: number,
    yawB: number,
    halfLB: number,
    halfWB: number,
  ): boolean {
    const ds = sB - sA;
    const dd = dB - dA;
    const cA = Math.cos(yawA), sA_sin = Math.sin(yawA);
    const cB = Math.cos(yawB), sB_sin = Math.sin(yawB);
    const dc = Math.abs(cA * cB + sA_sin * sB_sin);
    const dsin = Math.abs(-sA_sin * cB + cA * sB_sin);

    // Axis A_u (cA, sA_sin)
    if (Math.abs(ds * cA + dd * sA_sin) > halfLA + halfLB * dc + halfWB * dsin) return false;
    // Axis A_v (-sA_sin, cA)
    if (Math.abs(-ds * sA_sin + dd * cA) > halfWA + halfLB * dsin + halfWB * dc) return false;
    // Axis B_u (cB, sB_sin)
    if (Math.abs(ds * cB + dd * sB_sin) > halfLB + halfLA * dc + halfWA * dsin) return false;
    // Axis B_v (-sB_sin, cB)
    if (Math.abs(-ds * sB_sin + dd * cB) > halfWB + halfLA * dsin + halfWA * dc) return false;
    return true;
  }

  /**
   * Exact curved-path polyline test in the actor/barrier's own local (u, v) frame:
   * prevents long highway/ramp guardrails along curved ramps from triggering straight-tangent false overlaps.
   */
  private doesActorOverlapCurvedPath(
    actor: TrafficActorSnapshot,
    plan: ADASPlanSnapshot,
    laneLatOffsetM: number,
    corridorHalfW: number,
    fallbackY: number,
  ): boolean {
    if (!plan.valid || plan.sampleCount < 2) {
      return false;
    }
    const actorHalfL = actor.length * 0.5;
    const actorHalfW = actor.width * 0.5;
    const actorMinY = Number.isFinite(actor.minHeight) ? actor.minHeight! : actor.y;
    const actorMaxY = Number.isFinite(actor.maxHeight) ? actor.maxHeight! : actor.y + actor.height;
    const cosY = Math.cos(actor.yaw);
    const sinY = Math.sin(actor.yaw);
    const fxA = -sinY, fzA = -cosY;
    const rxA = cosY, rzA = -sinY;

    const samples = plan.samples;
    const count = plan.sampleCount;
    const maxRangeSq = (actorHalfL + corridorHalfW + 8.0) ** 2;

    for (let i = 0; i < count; i++) {
      const sp = samples[i]!;
      const spCos = Math.cos(sp.yaw);
      const spSin = Math.sin(sp.yaw);
      const cx = sp.x + laneLatOffsetM * spCos;
      const cz = sp.z - laneLatOffsetM * spSin;
      const dx = cx - actor.x;
      const dz = cz - actor.z;
      if (dx * dx + dz * dz > maxRangeSq) continue;

      const spY = Number.isFinite(sp.y) ? sp.y : fallbackY;
      if (actorMinY > spY + 1.90 || actorMaxY < spY + 0.12) continue;

      const u = dx * fxA + dz * fzA;
      const v = dx * rxA + dz * rzA;
      // Compute path sample corridor projection along actor axes u, v
      const rel = wrapADASAngle(sp.yaw - actor.yaw);
      const ac = Math.abs(Math.cos(rel));
      const as = Math.abs(Math.sin(rel));
      const padU = corridorHalfW * as + 2.0 * ac;
      const padV = corridorHalfW * ac + 2.0 * as;
      if (Math.abs(u) <= actorHalfL + padU && Math.abs(v) <= actorHalfW + padV) {
        return true;
      }
    }
    return false;
  }

  private isActorBlockingJunction(
    actor: TrafficActorSnapshot,
    j: ADASPlanSnapshot['upcomingJunction'],
    plan: ADASPlanSnapshot,
    _laneW: number,
    vehicleWidth: number,
  ): boolean {
    if (Math.abs(actor.y - j.centerY) > 2.5) return false;

    const egoHalfW = vehicleWidth * 0.5;
    const corridorHalfW = egoHalfW + Math.min(actor.width * 0.5, 0.85) + 0.35;
    const corridorHalfWSq = corridorHalfW * corridorHalfW;

    // 1. Check if actor lies within ego's planned turning/crossing corridor through junction
    if (plan.valid && plan.sampleCount >= 2) {
      const startS = plan.egoS + Math.max(0, j.distanceToJunctionEntryM - 2.0);
      const endS = plan.egoS + j.distanceToJunctionExitM + 12.0;
      const samples = plan.samples;
      const count = plan.sampleCount;
      for (let i = 0; i < count; i++) {
        const sp = samples[i]!;
        if (sp.s < startS) continue;
        if (sp.s > endS) break;
        const dx = actor.x - sp.x;
        const dz = actor.z - sp.z;
        if (dx * dx + dz * dz <= corridorHalfWSq) {
          if (Math.abs(actor.y - sp.y) < 2.0) {
            return true;
          }
        }
      }
    }

    // 2. Check if actor is blocking our immediate exit corridor (first 16m past junction exit along exit heading)
    if (j.distanceToJunctionExitM < 45) {
      const fx = -Math.sin(j.exitYaw);
      const fz = -Math.cos(j.exitYaw);
      const rx = Math.cos(j.exitYaw);
      const rz = -Math.sin(j.exitYaw);
      const dx = actor.x - j.exitX;
      const dz = actor.z - j.exitZ;
      const alongExit = dx * fx + dz * fz;
      const latExit = Math.abs(dx * rx + dz * rz);
      if (alongExit >= -1.0 && alongExit <= 16.0 && latExit <= corridorHalfW) {
        return true;
      }
    }

    return false;
  }
}
