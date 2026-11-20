import type { PerspectiveCamera } from 'three';
import type { ADASPlanSnapshot, ADASVehicleState, TrafficActorSnapshot } from '../adas/ADASTypes';
import type { ADASRibbonTone } from '../adas/visualization/ADASVisualizationTypes';
import type { StaticCollider } from '../physics/CollisionSystem';
import { isTargetOccludedByCollider, projectWorldPointToScreen } from './HUDProjectionUtils';
import type { VehicleHUDTargetAnnotation } from './VehicleHUDTypes';

/**
 * Evaluates static roadway obstacles (traffic cones, construction barriers, debris,
 * blocking parked objects) and emits concise occluded annotations when relevant.
 */
export function evaluateObjectAnnotations(
  visible: boolean,
  vehicle: Readonly<ADASVehicleState>,
  plan: Readonly<ADASPlanSnapshot>,
  actors: readonly TrafficActorSnapshot[],
  actorCount: number,
  camera: PerspectiveCamera | null,
  viewportW: number,
  viewportH: number,
  colliders?: readonly StaticCollider[],
): VehicleHUDTargetAnnotation[] {
  if (!visible || actorCount <= 0) return [];

  const cosY = Math.cos(vehicle.yaw);
  const sinY = Math.sin(vehicle.yaw);
  const halfLane = Math.max(1.6, plan.currentLaneWidth * 0.5);
  const lcActive = plan.laneChange.active;
  const lcSide = plan.laneChange.direction;
  const out: VehicleHUDTargetAnnotation[] = [];

  for (let i = 0; i < actorCount && i < actors.length; i++) {
    const a = actors[i]!;
    const isStaticObj =
      a.kind === 'static-obstacle' ||
      a.kind === 'road-block' ||
      (a.kind === 'vehicle' && Boolean(a.isStatic));
    if (!isStaticObj || a.isInfrastructure || a.confidence < 0.35) continue;

    const dx = a.x - vehicle.x;
    const dz = a.z - vehicle.z;
    const longDist = -dx * sinY - dz * cosY;
    const latDist = dx * cosY - dz * sinY;
    if (longDist < 1.0 || longDist > 85) continue;

    const absLat = Math.abs(latDist);
    const inEgoCorridor = absLat <= halfLane + a.width * 0.5 + 0.35;
    const inTargetCorridor =
      lcActive &&
      ((lcSide === 'left' && latDist < 0 && latDist >= -halfLane * 3.1) ||
        (lcSide === 'right' && latDist > 0 && latDist <= halfLane * 3.1));

    if (!inEgoCorridor && !inTargetCorridor && !a.corridorConflict) continue;

    const dist = Math.hypot(dx, dz);
    const anchorY = a.y + Math.max(0.85, a.height) + 0.35;
    if (isTargetOccludedByCollider(camera, a.x, a.y + 0.65, a.z, a.id, colliders)) {
      continue;
    }
    const proj = projectWorldPointToScreen(a.x, anchorY, a.z, camera, viewportW, viewportH);
    if (!proj.visible) continue;

    const ttcS = vehicle.speed > 0.5 ? Math.max(0.2, (longDist - vehicle.vehicleLength * 0.5) / vehicle.speed) : Infinity;
    const tone: ADASRibbonTone =
      ttcS < 2.2 || (inEgoCorridor && longDist < 18) ? 'hazard' : 'caution';

    const label = inferStaticObstacleLabel(a);
    const distRounded = Math.max(1, Math.round(dist));

    out.push({
      id: a.id,
      category: 'static-obstacle',
      slot: 'static',
      visible: true,
      screenX: proj.x,
      screenY: proj.y,
      distanceM: dist,
      speedKmh: 0,
      relSpeedKmh: Math.round(-vehicle.speed * 3.6),
      ttcS,
      shortTag: `${label} ${distRounded} m`,
      subTag: inEgoCorridor ? '前方阻挡' : '',
      tone,
      isMoving: false,
      worldX: a.x,
      worldY: a.y,
      worldZ: a.z,
      yaw: a.yaw,
      width: a.width,
      length: a.length,
      height: a.height,
    });
  }

  out.sort((a, b) => a.distanceM - b.distanceM);
  return out.slice(0, 4);
}

function inferStaticObstacleLabel(actor: TrafficActorSnapshot): string {
  const idLower = actor.id.toLowerCase();
  if (idLower.includes('cone') || actor.width <= 0.85) return '锥桶';
  if (idLower.includes('work') || idLower.includes('construct') || actor.kind === 'road-block') return '施工路障';
  if (actor.kind === 'vehicle') return '静止车辆';
  return '道路障碍';
}
