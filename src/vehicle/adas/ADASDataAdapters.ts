import type { StaticCollider } from '../physics/CollisionSystem';
import type { TrafficSignalColor, TrafficSignalMovement } from '../../world/navigation/TrafficSignalState';
import {
  createEmptyTrafficActor,
  type ADASVehicleState,
  type ADASWorldContext,
  type TrafficActorSnapshot,
  type TurnDirection,
  type UpcomingJunctionInfo,
} from './ADASTypes';

export interface ResolvedSignalState {
  valid: boolean;
  controlled: boolean;
  color: TrafficSignalColor | 'none';
  permitted: boolean;
  secondsToChange: number;
  secondsToGreen: number;
  source: 'lane-signal' | 'junction-signal' | 'legacy-signal' | 'none';
}

const MAX_PERCEPTION_ACTORS = 64;

/**
 * Read-only adapter over existing TrafficSignalProvider and optional legacy fallback.
 * Never mutates signal clocks or map loading state; zero per-query allocations.
 */
export class ADASSignalAdapter {
  public readonly result: ResolvedSignalState = {
    valid: false,
    controlled: false,
    color: 'none',
    permitted: true,
    secondsToChange: Infinity,
    secondsToGreen: 0,
    source: 'none',
  };

  public queryUpcomingSignal(
    world: ADASWorldContext,
    junction: UpcomingJunctionInfo,
  ): ResolvedSignalState {
    const out = this.result;
    out.valid = false;
    out.controlled = false;
    out.color = 'none';
    out.permitted = true;
    out.secondsToChange = Infinity;
    out.secondsToGreen = 0;
    out.source = 'none';

    if (!junction.valid || !junction.junctionId) return out;
    const movement: TrafficSignalMovement =
      junction.turnDirection === 'uturn' ? 'left' : junction.turnDirection;

    const provider = world.trafficSignals;
    if (provider) {
      // 1. Prefer exact logical lane signal lookup.
      if (junction.laneId) {
        const laneState = provider.getLaneSignal(junction.laneId);
        if (laneState) {
          const match = this.findMovement(laneState.movements, movement);
          if (match) {
            out.valid = true;
            out.controlled = match.signalControlled !== false;
            out.color = match.color;
            out.permitted = match.permitted;
            out.secondsToChange = Number.isFinite(match.secondsToChange) ? match.secondsToChange : Infinity;
            out.secondsToGreen = Number.isFinite(match.secondsToGreen) ? match.secondsToGreen : 0;
            out.source = 'lane-signal';
            return out;
          }
        }
      }

      // 2. Fallback: look up junction signal and match by roadId + approachLaneIndex or movement.
      const jState = provider.getJunctionSignal(junction.junctionId);
      if (jState && jState.lanes.length > 0) {
        let bestLane = jState.lanes[0];
        let bestScore = Infinity;
        for (let i = 0; i < jState.lanes.length; i++) {
          const l = jState.lanes[i]!;
          if (junction.roadId && l.roadId !== junction.roadId) continue;
          const idxDiff = Math.abs(l.approachLaneIndex - junction.approachLaneIndex);
          const hasMove = l.movements.some(m => m.movement === movement);
          const score = (hasMove ? 0 : 10) + idxDiff;
          if (score < bestScore) {
            bestScore = score;
            bestLane = l;
          }
        }
        if (bestLane && bestScore < Infinity) {
          const match = this.findMovement(bestLane.movements, movement);
          if (match) {
            out.valid = true;
            out.controlled = match.signalControlled !== false;
            out.color = match.color;
            out.permitted = match.permitted;
            out.secondsToChange = Number.isFinite(match.secondsToChange) ? match.secondsToChange : Infinity;
            out.secondsToGreen = Number.isFinite(match.secondsToGreen) ? match.secondsToGreen : 0;
            out.source = 'junction-signal';
            return out;
          }
        }
      }
    }

    // 3. Lightweight fallback for legacy grounds (e.g. Subject 3) via arm controlKind.
    if (world.getLegacyJunctionSignalColor && junction.controlKind) {
      const legacyColor = world.getLegacyJunctionSignalColor(junction.junctionId, junction.controlKind);
      if (legacyColor) {
        out.valid = true;
        out.controlled = movement !== 'right';
        out.color = movement === 'right' ? 'green' : legacyColor;
        out.permitted = movement === 'right' || legacyColor === 'green';
        out.secondsToChange = legacyColor === 'amber' ? 1.5 : 10;
        out.secondsToGreen = legacyColor === 'green' ? 0 : 10;
        out.source = 'legacy-signal';
        return out;
      }
    }

    return out;
  }

  private findMovement(
    movements: readonly {
      readonly movement: TrafficSignalMovement;
      readonly signalControlled?: boolean;
      readonly color: TrafficSignalColor;
      readonly permitted: boolean;
      readonly secondsToChange: number;
      readonly secondsToGreen: number;
    }[],
    target: TrafficSignalMovement,
  ) {
    for (let i = 0; i < movements.length; i++) {
      if (movements[i]!.movement === target) return movements[i]!;
    }
    // If vehicle is in a lane whose authored arrow doesn't list the exact turn,
    // honor straight (most restrictive signal phase for that approach) rather than ignoring red.
    for (let i = 0; i < movements.length; i++) {
      if (movements[i]!.movement === 'straight') return movements[i]!;
    }
    return movements[0];
  }
}

/**
 * Read-only perception adapter that merges local spatial colliders and
 * TrafficActorProvider / dynamic traffic snapshots into a pre-allocated buffer.
 * Zero per-tick heap allocations; never scans whole map.
 */
export class ADASPerceptionAdapter {
  public readonly actors: TrafficActorSnapshot[] = Array.from(
    { length: MAX_PERCEPTION_ACTORS },
    () => createEmptyTrafficActor(),
  );
  public count = 0;
  public dataReliable = true;
  public lastSampleTime = 0;

  private readonly queryPose = { x: 0, z: 0 };

  public reset(): void {
    this.count = 0;
    this.dataReliable = true;
    this.lastSampleTime = 0;
  }

  public sample(
    vehicle: ADASVehicleState,
    world: ADASWorldContext,
    radiusM: number,
    maxDataAgeSeconds: number,
  ): number {
    let count = 0;
    let reliable = true;
    const now = Number.isFinite(world.simulationTime) ? world.simulationTime : 0;
    this.lastSampleTime = now;

    if (world.dataTimestamp !== undefined && Number.isFinite(world.dataTimestamp)) {
      if (now - world.dataTimestamp > maxDataAgeSeconds) {
        reliable = false;
      }
    }

    const rSq = radiusM * radiusM;

    // 1. Future AI traffic provider (bounded spatial query into pre-allocated buffer).
    if (world.trafficActorProvider) {
      const added = world.trafficActorProvider.queryNearbyActors(
        vehicle.x,
        vehicle.y,
        vehicle.z,
        radiusM,
        this.actors,
      );
      count = Math.max(0, Math.min(MAX_PERCEPTION_ACTORS, added));
      for (let i = 0; i < count; i++) {
        const a = this.actors[i]!;
        a.minHeight = undefined;
        a.maxHeight = undefined;
        if (a.confidence < 0.5 || (Number.isFinite(a.timestamp) && a.timestamp > 0 && now - a.timestamp > maxDataAgeSeconds)) {
          reliable = false;
        }
      }
    }

    // 2. Direct actor snapshots (for runtime traffic injectors or deterministic tests).
    if (world.trafficActors && count < MAX_PERCEPTION_ACTORS) {
      const list = world.trafficActors;
      for (let i = 0; i < list.length && count < MAX_PERCEPTION_ACTORS; i++) {
        const src = list[i]!;
        if (!Number.isFinite(src.x) || !Number.isFinite(src.z)) {
          reliable = false;
          continue;
        }
        const dx = src.x - vehicle.x;
        const dz = src.z - vehicle.z;
        if (dx * dx + dz * dz > rSq) continue;
        if (Math.abs(src.y - vehicle.y) > 3.0) continue;

        const dst = this.actors[count]!;
        dst.id = src.id;
        dst.kind = src.kind;
        dst.x = src.x;
        dst.y = src.y;
        dst.z = src.z;
        dst.yaw = Number.isFinite(src.yaw) ? src.yaw : 0;
        dst.speed = Number.isFinite(src.speed) ? src.speed : 0;
        dst.vx = Number.isFinite(src.vx) ? src.vx : -Math.sin(dst.yaw) * dst.speed;
        dst.vz = Number.isFinite(src.vz) ? src.vz : -Math.cos(dst.yaw) * dst.speed;
        dst.length = Math.max(0.4, Number.isFinite(src.length) ? src.length : 4.5);
        dst.width = Math.max(0.4, Number.isFinite(src.width) ? src.width : 1.9);
        dst.height = Math.max(0.4, Number.isFinite(src.height) ? src.height : 1.5);
        dst.minHeight = src.minHeight;
        dst.maxHeight = src.maxHeight;
        dst.laneId = src.laneId;
        dst.roadId = src.roadId;
        dst.accel = src.accel;
        dst.isInfrastructure = src.isInfrastructure;
        dst.predictedTrajectory = src.predictedTrajectory;
        dst.confidence = Number.isFinite(src.confidence) ? src.confidence : 1;
        dst.timestamp = Number.isFinite(src.timestamp) ? src.timestamp : now;

        if (dst.confidence < 0.5 || (dst.timestamp > 0 && now - dst.timestamp > maxDataAgeSeconds)) {
          reliable = false;
        }
        count++;
      }
    }

    // 3. Static roadway obstacles from existing local spatial collision index.
    // Pass A: roadway 'obstacle' colliders (fallen lamp posts, parked cars, construction blocks, intruding piers).
    // Pass B: local 'guardrail' / 'wall' / 'building' colliders (within 45m, e.g. fallen/road-closure guardrails or intruding walls/buildings).
    if (world.queryNearbyColliders && count < MAX_PERCEPTION_ACTORS) {
      this.queryPose.x = vehicle.x;
      this.queryPose.z = vehicle.z;
      const colliders: readonly StaticCollider[] = world.queryNearbyColliders(this.queryPose, radiusM);
      const closeStructRSq = Math.min(radiusM, 45) ** 2;
      for (let pass = 0; pass < 3 && count < MAX_PERCEPTION_ACTORS; pass++) {
        for (let i = 0; i < colliders.length && count < MAX_PERCEPTION_ACTORS; i++) {
          const col = colliders[i]!;
          if (pass === 0 && col.type !== 'obstacle') continue;
          if (pass === 1 && col.type !== 'guardrail' && col.type !== 'wall') continue;
          if (pass === 2 && col.type !== 'building') continue;

          // Prefilter with generous climb/descent envelope; ObstacleAvoidanceController compares
          // [minHeight, maxHeight] against local road sample height sp.y at the collider's position.
          if (col.minHeight > vehicle.y + 18.0 || col.maxHeight < vehicle.y - 14.0) continue;

          const dx = col.center.x - vehicle.x;
          const dz = col.center.z - vehicle.z;
          const distSq = dx * dx + dz * dz;
          if (pass === 0 ? distSq > rSq : distSq > closeStructRSq) continue;

          let alreadyPresent = false;
          for (let k = 0; k < count; k++) {
            if (this.actors[k]!.id === col.id) {
              alreadyPresent = true;
              break;
            }
          }
          if (alreadyPresent) continue;

          const isLinearRoadsideBarrier = col.id.includes(':barrier:') || col.id.includes(':median:');
          const isRoadsidePart =
            isLinearRoadsideBarrier ||
            col.id.includes(':post:') ||
            col.id.includes(':board:') ||
            col.id.includes(':pier:') ||
            col.id.includes(':wall:') ||
            col.type === 'guardrail' ||
            col.type === 'wall' ||
            col.type === 'building';

          const dst = this.actors[count]!;
          dst.id = col.id;
          dst.kind = col.type === 'guardrail' && !isLinearRoadsideBarrier ? 'road-block' : 'static-obstacle';
          dst.isInfrastructure = isRoadsidePart;
          dst.x = col.center.x;
          dst.y = col.minHeight;
          dst.z = col.center.z;
          dst.yaw = col.yaw;
          dst.speed = 0;
          dst.vx = 0;
          dst.vz = 0;
          dst.length = Math.max(0.4, col.halfLength * 2);
          dst.width = Math.max(0.4, col.halfWidth * 2);
          dst.height = Math.max(0.4, col.maxHeight - col.minHeight);
          dst.minHeight = col.minHeight;
          dst.maxHeight = col.maxHeight;
          dst.laneId = undefined;
          dst.roadId = undefined;
          dst.accel = undefined;
          dst.predictedTrajectory = undefined;
          dst.confidence = 1;
          dst.timestamp = now;
          count++;
        }
      }
    }

    this.count = count;
    this.dataReliable = reliable;
    return count;
  }
}

/**
 * Resolve conservative fallback speed limit (m/s) when road.speedLimit is missing.
 */
export function resolveRoadSpeedLimit(
  speedLimitKmh: number | undefined,
  roadType: 'highway' | 'urban' | 'ramp' | 'circuit' | undefined,
  roadFunction: string | undefined,
  defaults: Readonly<{ highway: number; urban: number; ramp: number; circuit: number; unknown: number }>,
): { speedMps: number; estimated: boolean } {
  if (speedLimitKmh !== undefined && Number.isFinite(speedLimitKmh) && speedLimitKmh > 0) {
    return { speedMps: speedLimitKmh / 3.6, estimated: false };
  }
  let kmh = defaults.unknown;
  if (roadType === 'highway' || roadFunction === 'expressway') kmh = defaults.highway;
  else if (roadType === 'ramp' || roadFunction === 'ramp') kmh = defaults.ramp;
  else if (roadType === 'circuit') kmh = defaults.circuit;
  else if (roadType === 'urban' || roadFunction === 'arterial' || roadFunction === 'collector' || roadFunction === 'local') {
    kmh = roadFunction === 'arterial' || roadFunction === 'connector' ? Math.min(60, defaults.urban + 20) : defaults.urban;
  }
  return { speedMps: kmh / 3.6, estimated: true };
}

/** Classify turn angle (radians, positive = right, negative = left). */
export function classifyTurnAngle(turnRad: number): TurnDirection {
  const abs = Math.abs(turnRad);
  if (abs > 2.35) return 'uturn';
  if (abs < 0.42) return 'straight';
  return turnRad > 0 ? 'right' : 'left';
}
