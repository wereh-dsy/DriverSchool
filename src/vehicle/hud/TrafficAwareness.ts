import type { PerspectiveCamera } from 'three';
import type { ADASObstacleAssessment, ADASPlanSnapshot, ADASVehicleState, TrafficActorSnapshot } from '../adas/ADASTypes';
import type { ADASRibbonTone } from '../adas/visualization/ADASVisualizationTypes';
import type { StaticCollider } from '../physics/CollisionSystem';
import { isTargetOccludedByCollider, projectWorldPointToScreen } from './HUDProjectionUtils';
import type { VehicleHUDTargetAnnotation, VehicleHUDTargetSlot } from './VehicleHUDTypes';

/**
 * Evaluates surrounding vehicles in ego-relative coordinates and returns ONLY
 * risk-relevant / maneuver-interfering targets (strictly zero clutter on empty or calm traffic).
 */
export function evaluateTrafficAwareness(
  visible: boolean,
  vehicle: Readonly<ADASVehicleState>,
  plan: Readonly<ADASPlanSnapshot>,
  obstacle: Readonly<ADASObstacleAssessment>,
  actors: readonly TrafficActorSnapshot[],
  actorCount: number,
  camera: PerspectiveCamera | null,
  viewportW: number,
  viewportH: number,
  colliders?: readonly StaticCollider[],
): VehicleHUDTargetAnnotation[] {
  if (!visible || actorCount <= 0) return [];

  // Ego forward is (-sin(yaw), -cos(yaw)), right is (cos(yaw), -sin(yaw))
  const cosY = Math.cos(vehicle.yaw);
  const sinY = Math.sin(vehicle.yaw);
  const halfLane = Math.max(1.6, plan.currentLaneWidth * 0.5);
  const lcDir = plan.laneChange.active ? plan.laneChange.direction : plan.desiredTurnSignal;
  const maxLongFrontM = 115;
  const maxLongRearM = 42;

  const out: VehicleHUDTargetAnnotation[] = [];

  for (let i = 0; i < actorCount && i < actors.length; i++) {
    const a = actors[i]!;
    if (a.kind !== 'vehicle' || a.isStatic || a.confidence < 0.35) continue;

    const dx = a.x - vehicle.x;
    const dz = a.z - vehicle.z;
    const longDist = -dx * sinY - dz * cosY;
    const latDist = dx * cosY - dz * sinY;
    if (longDist > maxLongFrontM || longDist < -maxLongRearM) continue;

    const absLat = Math.abs(latDist);
    if (absLat > 6.2) continue;

    // Velocity projection along ego forward direction (+ = moving away, - = ego closing on target / rear approaching)
    const targetFwdV = -a.vx * sinY - a.vz * cosY;
    const relAlongSpeed = targetFwdV - vehicle.speed; // negative = gap closing when target is ahead; positive = rear approaching
    const dist = Math.hypot(dx, dz);
    const gap = Math.max(0.5, Math.abs(longDist) - (vehicle.vehicleLength + a.length) * 0.5);

    let slot: VehicleHUDTargetSlot | null = null;
    let tone: ADASRibbonTone = 'normal';
    let ttcS = Infinity;
    let relevant = false;

    const isLeadId = obstacle.hasLeadActor && a.id === obstacle.leadActorId;
    if (isLeadId || (longDist > 0.5 && absLat <= halfLane + a.width * 0.35)) {
      slot = 'front';
      const closingSpeed = Math.max(0, vehicle.speed - targetFwdV);
      ttcS = closingSpeed > 0.3 ? gap / closingSpeed : Infinity;
      const thw = vehicle.speed > 2.5 ? gap / vehicle.speed : Infinity;
      relevant =
        isLeadId ||
        obstacle.emergencyBraking ||
        ttcS < 5.5 ||
        thw < 2.8 ||
        gap < 48;
      if (obstacle.emergencyBraking || ttcS < 2.2 || (gap < 11 && closingSpeed > 1.0)) {
        tone = 'hazard';
      } else if (ttcS < 4.0 || thw < 1.35 || gap < 22) {
        tone = 'caution';
      } else {
        tone = 'normal';
      }
    } else if (absLat >= 1.8 && absLat <= 5.8) {
      const side: 'left' | 'right' = latDist < 0 ? 'left' : 'right';
      const isFront = longDist >= -1.5;
      slot =
        side === 'left'
          ? isFront
            ? 'LF'
            : 'LR'
          : isFront
            ? 'RF'
            : 'RR';

      if (!isFront) {
        // Rear approaching vehicle on adjacent lane
        const rearClosing = targetFwdV - vehicle.speed;
        ttcS = rearClosing > 0.4 ? gap / rearClosing : Infinity;
        const fastApproacher = rearClosing > 2.4 && ttcS < 4.5 && gap < 38;
        const blindSpotOverlap = Math.abs(longDist) < 7.5;
        relevant =
          fastApproacher ||
          ((lcDir === side || blindSpotOverlap) && gap < 26);
        tone = fastApproacher && ttcS < 2.2 ? 'hazard' : 'caution';
      } else {
        // Adjacent front vehicle: show only when maneuvering into that lane or cutting close
        const closingSpeed = Math.max(0, vehicle.speed - targetFwdV);
        ttcS = closingSpeed > 0.4 ? gap / closingSpeed : Infinity;
        const tightCut = gap < 14 && absLat < 3.4;
        relevant =
          lcDir === side ||
          tightCut ||
          (ttcS < 3.8 && gap < 35);
        tone = tightCut || ttcS < 2.0 ? 'hazard' : 'caution';
      }
    }

    if (!relevant || !slot) continue;

    // For rear side targets not visible in forward camera frustum, omit screen anchor cleanly
    const anchorY = a.y + Math.max(1.2, a.height) + 0.45;
    if (isTargetOccludedByCollider(camera, a.x, a.y + 0.85, a.z, a.id, colliders)) {
      continue;
    }
    const proj = projectWorldPointToScreen(a.x, anchorY, a.z, camera, viewportW, viewportH);
    if (!proj.visible && slot !== 'LR' && slot !== 'RR') continue;

    const speedKmh = Math.round(Math.abs(a.speed) * 3.6);
    const relKmh = Math.round(relAlongSpeed * 3.6);
    const distRounded = Math.max(1, Math.round(dist));
    const slotTag =
      slot === 'front'
        ? `${distRounded} m`
        : slot === 'LR' || slot === 'RR'
          ? `${slot === 'LR' ? '左后' : '右后'} ${distRounded} m`
          : `${distRounded} m`;
    const subTag =
      slot === 'front'
        ? relKmh <= -12
          ? `${speedKmh} km/h ↓`
          : `${speedKmh} km/h`
        : relKmh > 6
          ? `+${relKmh} km/h`
          : `${speedKmh} km/h`;

    out.push({
      id: a.id,
      category: slot === 'front' ? 'lead' : 'adjacent',
      slot,
      visible: proj.visible,
      screenX: proj.x,
      screenY: proj.y,
      distanceM: dist,
      speedKmh,
      relSpeedKmh: relKmh,
      ttcS,
      shortTag: slotTag,
      subTag,
      tone,
      isMoving: Math.abs(a.speed) > 0.4,
      worldX: a.x,
      worldY: a.y,
      worldZ: a.z,
      yaw: a.yaw,
      width: a.width,
      length: a.length,
      height: a.height,
    });
  }

  // Sort closest / highest urgency first and cap to avoid clutter
  out.sort((a, b) => a.distanceM - b.distanceM);
  return out.slice(0, 5);
}
