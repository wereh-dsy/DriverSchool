import type { PerspectiveCamera } from 'three';
import type { DrivingGround } from '../../world/DrivingGround';
import type { ADASVehicleState, TrafficActorSnapshot } from '../adas/ADASTypes';
import type { StaticCollider } from '../physics/CollisionSystem';
import { isTargetOccludedByCollider, projectWorldPointToScreen } from './HUDProjectionUtils';
import type { VehicleHUDPedestrianTrajectory, VehicleHUDTargetAnnotation } from './VehicleHUDTypes';

const PREDICTION_HORIZON_S = 1.6;
const PREDICTION_STEPS = 5;

/**
 * Evaluates pedestrians & cyclists around ego corridor and builds strictly honest,
 * short ground-projected dashed predicted trajectories when motion is confident.
 * Never fabricates a trajectory line when target is static or motion data is uncertain.
 */
export function evaluatePedestrianPredictions(
  visible: boolean,
  vehicle: Readonly<ADASVehicleState>,
  actors: readonly TrafficActorSnapshot[],
  actorCount: number,
  ground: DrivingGround | null,
  camera: PerspectiveCamera | null,
  viewportW: number,
  viewportH: number,
  colliders?: readonly StaticCollider[],
): {
  annotations: VehicleHUDTargetAnnotation[];
  trajectories: VehicleHUDPedestrianTrajectory[];
} {
  if (!visible || actorCount <= 0) {
    return { annotations: [], trajectories: [] };
  }

  const cosY = Math.cos(vehicle.yaw);
  const sinY = Math.sin(vehicle.yaw);
  const fwdX = -sinY;
  const fwdZ = -cosY;
  const rightX = cosY;
  const rightZ = -sinY;
  const egoHalfWidth = vehicle.vehicleWidth * 0.5 + 0.55;
  const egoHorizonDist = Math.max(12, Math.abs(vehicle.speed) * 2.2);

  const annotations: VehicleHUDTargetAnnotation[] = [];
  const trajectories: VehicleHUDPedestrianTrajectory[] = [];

  for (let i = 0; i < actorCount && i < actors.length; i++) {
    const a = actors[i]!;
    if (a.kind !== 'pedestrian' && a.kind !== 'cyclist') continue;

    const dx = a.x - vehicle.x;
    const dz = a.z - vehicle.z;
    const longDist = dx * fwdX + dz * fwdZ;
    const latDist = dx * rightX + dz * rightZ;
    if (longDist < -2.0 || longDist > 75 || Math.abs(latDist) > 18) continue;

    const dist = Math.hypot(dx, dz);
    const speed = Math.hypot(a.vx, a.vz);
    const hasReliableMotion =
      (a.confidence >= 0.45 && speed >= 0.28) ||
      (a.predictedTrajectory !== undefined && a.predictedTrajectory.length >= 2 && a.confidence >= 0.4);

    // Check predicted collision conflict with ego corridor over the short lookahead horizon
    let hasConflict = Math.abs(latDist) <= egoHalfWidth + a.width * 0.5 && longDist <= egoHorizonDist;
    let conflictT = Infinity;
    let conflictPt: { x: number; y: number; z: number } | null = null;
    const trajPoints: number[] = [];

    if (hasReliableMotion) {
      if (a.predictedTrajectory && a.predictedTrajectory.length >= 2) {
        const limit = Math.min(PREDICTION_STEPS + 1, a.predictedTrajectory.length);
        for (let k = 0; k < limit; k++) {
          const tp = a.predictedTrajectory[k]!;
          const py = ground ? ground.getRoadHeightAt(tp.x, tp.z) : tp.y;
          trajPoints.push(tp.x, (Number.isFinite(py) ? py : tp.y) + 0.05, tp.z);
          const relDx = tp.x - vehicle.x;
          const relDz = tp.z - vehicle.z;
          const pLong = relDx * fwdX + relDz * fwdZ;
          const pLat = relDx * rightX + relDz * rightZ;
          if (Math.abs(pLat) <= egoHalfWidth + a.width * 0.45 && pLong >= 0 && pLong <= egoHorizonDist) {
            hasConflict = true;
            const tEst = Math.max(0.1, tp.timestamp - a.timestamp);
            if (!conflictPt || tEst < conflictT) {
              conflictT = tEst;
              conflictPt = { x: tp.x, y: Number.isFinite(py) ? py : tp.y, z: tp.z };
            }
          }
        }
      } else {
        for (let k = 0; k <= PREDICTION_STEPS; k++) {
          const t = (k / PREDICTION_STEPS) * PREDICTION_HORIZON_S;
          const px = a.x + a.vx * t;
          const pz = a.z + a.vz * t;
          const py = ground ? ground.getRoadHeightAt(px, pz) : a.y;
          const safeY = Number.isFinite(py) ? py : a.y;
          trajPoints.push(px, safeY + 0.05, pz);

          const egoXAtT = vehicle.x + fwdX * Math.max(0, vehicle.speed) * t;
          const egoZAtT = vehicle.z + fwdZ * Math.max(0, vehicle.speed) * t;
          const rDx = px - vehicle.x;
          const rDz = pz - vehicle.z;
          const pLong = rDx * fwdX + rDz * fwdZ;
          const pLat = rDx * rightX + rDz * rightZ;
          const proxAtT = Math.hypot(px - egoXAtT, pz - egoZAtT);
          const entersCorridor =
            Math.abs(pLat) <= egoHalfWidth + a.width * 0.45 &&
            pLong >= 0 &&
            pLong <= egoHorizonDist;

          if (entersCorridor && (proxAtT < 9.5 || longDist < 28)) {
            hasConflict = true;
            if (!conflictPt || t < conflictT) {
              conflictT = t;
              conflictPt = { x: px, y: safeY, z: pz };
            }
          }
        }
      }
    }

    const relevanceGate = hasConflict || hasReliableMotion || Math.abs(latDist) <= 4.0;
    if (!relevanceGate) continue;

    if (isTargetOccludedByCollider(camera, a.x, a.y + 0.9, a.z, a.id, colliders)) {
      continue;
    }

    const anchorY = a.y + Math.max(1.45, a.height) + 0.22;
    const proj = projectWorldPointToScreen(a.x, anchorY, a.z, camera, viewportW, viewportH);
    const ttcS = vehicle.speed > 0.4 && hasConflict ? Math.max(0.2, Math.min(conflictT, dist / Math.max(0.5, vehicle.speed))) : Infinity;
    const urgentDanger = hasConflict && (ttcS < 2.4 || dist < 18);
    const tone = urgentDanger ? 'hazard' : 'caution';

    if (proj.visible) {
      const distRounded = Math.max(1, Math.round(dist));
      const kindName = a.kind === 'cyclist' ? '骑行' : '行人';
      annotations.push({
        id: a.id,
        category: a.kind,
        slot: 'vru',
        visible: true,
        screenX: proj.x,
        screenY: proj.y,
        distanceM: dist,
        speedKmh: hasReliableMotion ? Math.round(speed * 3.6) : 0,
        relSpeedKmh: null,
        ttcS,
        shortTag: `${kindName} ${distRounded} m`,
        subTag: hasConflict ? '横穿风险' : hasReliableMotion ? `${Math.max(1, Math.round(speed * 3.6))} km/h` : '',
        tone,
        isMoving: hasReliableMotion,
        worldX: a.x,
        worldY: a.y,
        worldZ: a.z,
        yaw: a.yaw,
        width: Math.max(0.55, a.width),
        length: Math.max(0.55, a.length),
        height: Math.max(1.65, a.height),
      });
    }

    if (hasReliableMotion && trajPoints.length >= 6) {
      trajectories.push({
        actorId: a.id,
        moving: true,
        hasConflict,
        tone: urgentDanger ? 'hazard' : 'caution',
        pointCount: trajPoints.length / 3,
        points: trajPoints,
        conflictPoint: conflictPt,
        distanceM: dist,
      });
    }
  }

  annotations.sort((a, b) => a.distanceM - b.distanceM);
  trajectories.sort((a, b) => a.distanceM - b.distanceM);
  return {
    annotations: annotations.slice(0, 4),
    trajectories: trajectories.slice(0, 4),
  };
}
