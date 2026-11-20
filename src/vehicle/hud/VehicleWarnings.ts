import type { ADASObstacleAssessment, ADASPlanSnapshot, ADASStatusSnapshot } from '../adas/ADASTypes';
import type { VehicleHUDManeuverBanner, VehicleHUDWarning } from './VehicleHUDTypes';

/**
 * Emits ONLY genuine safety warnings, takeover demands, and urgent maneuver alerts.
 * Redundant "ADAS ON", "ADAS OFF", "ACC", and "LKA" labels are intentionally omitted.
 */
export function buildVehicleWarnings(
  visible: boolean,
  adasEnabled: boolean,
  status: Readonly<ADASStatusSnapshot>,
  plan: Readonly<ADASPlanSnapshot>,
  obstacle: Readonly<ADASObstacleAssessment>,
  maneuverPhrase: string,
  maneuverDirection: 'left' | 'right' | 'uturn' | null,
  maneuverTone: 'normal' | 'caution' | 'hazard',
): { warning: VehicleHUDWarning | null; maneuver: VehicleHUDManeuverBanner } {
  if (!visible) {
    return {
      warning: null,
      maneuver: { visible: false, phrase: '', direction: null, tone: 'normal' },
    };
  }

  const state = status.state;

  // 1. Collision emergency & handover alerts take top priority (even after ADAS disarms itself)
  if (state === 'COLLISION_STOPPING' || state === 'COLLISION_HOLD' || state === 'COLLISION_HANDOVER' || status.collisionLocked) {
    return {
      warning: {
        id: 'collision-handover',
        severity: 'hazard',
        title: state === 'COLLISION_HANDOVER' ? '碰撞保护 · 请接管车辆' : '检测到碰撞 · 自动紧急驻停',
        detail: status.collisionTargetLabel ? `碰撞对象：${status.collisionTargetLabel}` : '请确认周边安全后接管驾驶',
      },
      maneuver: { visible: false, phrase: '', direction: null, tone: 'hazard' },
    };
  }

  // 2. Physical emergency braking (FCW/AEB) regardless of ADAS state
  if (obstacle.emergencyBraking) {
    return {
      warning: {
        id: 'aeb-active',
        severity: 'hazard',
        title: '前方碰撞风险 · 紧急制动',
        detail: Number.isFinite(obstacle.leadGapM)
          ? `距目标 ${Math.max(1, Math.round(obstacle.leadGapM))} m`
          : '请立即接管制动',
      },
      maneuver: { visible: false, phrase: '', direction: null, tone: 'hazard' },
    };
  }

  // 3. When ADAS is OFF (without locked collision handover), keep forward HUD serene with zero ADAS spam
  if (!adasEnabled) {
    return {
      warning: null,
      maneuver: { visible: false, phrase: '', direction: null, tone: 'normal' },
    };
  }

  // 4. Genuine ADAS fault, blocked recovery, map degradation, or takeover request
  if (state === 'SAFE_STOP' || state === 'UNAVAILABLE') {
    return {
      warning: {
        id: 'takeover-required',
        severity: 'hazard',
        title: state === 'SAFE_STOP' ? '请接管控制' : '辅助驾驶受限 · 暂不可用',
        detail: plan.unavailableReason || status.reason || '当前路况无法继续自动规划',
      },
      maneuver: { visible: false, phrase: '', direction: null, tone: 'hazard' },
    };
  }

  if (state === 'BLOCKED_REVERSE' || state === 'BLOCKED_REVERSE_STOP' || state === 'BLOCKED_RECOVERY_CHECK' || state === 'BLOCKED_FORWARD_AVOIDANCE') {
    return {
      warning: {
        id: 'blocked-recovery',
        severity: 'caution',
        title: state === 'BLOCKED_REVERSE' ? '前方受阻 · 低速倒车脱困' : '前方受阻 · 正在规划脱困',
        detail: status.reason || '请留意周边安全，随时可轻踩刹车或打方向接管',
      },
      maneuver: { visible: false, phrase: '', direction: null, tone: 'caution' },
    };
  }

  if (state === 'BLOCKED_RECOVERY_FAILED' || state === 'ROAD_BLOCKED') {
    return {
      warning: {
        id: 'road-blocked',
        severity: 'hazard',
        title: '前方道路受阻 · 请接管',
        detail: status.reason || '无安全绕行/倒车空间',
      },
      maneuver: { visible: false, phrase: '', direction: null, tone: 'hazard' },
    };
  }

  if (plan.drivingMode === 'MAP_DEGRADED') {
    return {
      warning: {
        id: 'map-degraded',
        severity: 'caution',
        title: '高精地图降级 · 保持短程循迹',
        detail: '请准备随时人工接管方向',
      },
      maneuver: { visible: false, phrase: '', direction: null, tone: 'caution' },
    };
  }

  if (plan.awaitingJunctionIntent && plan.drivingMode === 'FREE_DRIVING') {
    return {
      warning: {
        id: 'junction-intent',
        severity: 'caution',
        title: '前方路口请打转向灯确认方向',
        detail: '默认减速礼让等待确认',
      },
      maneuver: { visible: false, phrase: '', direction: null, tone: 'caution' },
    };
  }

  const showManeuver = maneuverPhrase.length > 0;
  return {
    warning: null,
    maneuver: {
      visible: showManeuver,
      phrase: maneuverPhrase,
      direction: maneuverDirection,
      tone: maneuverTone,
    },
  };
}
