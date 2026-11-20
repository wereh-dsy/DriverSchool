import type { NavigationState } from '../../world/navigation/NavigationController';
import type { ADASPlanSnapshot } from '../adas/ADASTypes';
import type { VehicleHUDLaneHint, VehicleHUDNavSnapshot } from './VehicleHUDTypes';

const EMPTY_NAV: VehicleHUDNavSnapshot = {
  active: false,
  symbol: '',
  distanceText: '',
  maneuverText: '',
  roadName: '',
  showLanes: false,
  lanes: [],
};

/**
 * Formats compact turn-by-turn navigation cues and junction lane guidance for the forward HUD.
 * Hidden automatically when there is no active navigation task.
 */
export function buildNavigationDisplaySnapshot(
  visible: boolean,
  nav: NavigationState | null,
  plan: Readonly<ADASPlanSnapshot>,
): VehicleHUDNavSnapshot {
  if (!visible || !nav || (nav.status !== 'navigating' && nav.status !== 'rerouting')) {
    return EMPTY_NAV;
  }

  const distM = Number.isFinite(nav.maneuverDistance) ? Math.max(0, nav.maneuverDistance) : 0;
  const distanceText =
    distM >= 1000
      ? `${(distM / 1000).toFixed(1)} km`
      : `${Math.max(10, Math.round(distM / 10) * 10)} m`;

  const symbol = nav.symbol || '↑';
  const roadName = (nav.nextRoad || '').trim();
  const maneuverText = (nav.instruction || '').trim();

  // Provide clean lane guidance only when multi-lane junction or highway exit is approaching
  const up = plan.upcomingJunction;
  const laneCount = Math.max(
    1,
    Math.min(6, up.valid ? up.approachLaneCount : plan.currentApproachLaneCount),
  );
  const activeIdx = Math.max(
    0,
    Math.min(laneCount - 1, up.valid ? up.approachLaneIndex : plan.currentApproachLaneIndex),
  );
  const distJunction = up.valid ? up.distanceToJunctionEntryM : distM;
  const showLanes =
    laneCount > 1 &&
    distJunction <= 320 &&
    ((up.valid && (up.turnDirection !== 'straight' || up.isRampTransition)) ||
      symbol.includes('↰') ||
      symbol.includes('↱') ||
      symbol.includes('←') ||
      symbol.includes('→') ||
      symbol.includes('↗'));

  const lanes: VehicleHUDLaneHint[] = [];
  if (showLanes) {
    let dir: VehicleHUDLaneHint['direction'] = 'straight';
    if (up.valid) {
      dir = up.turnDirection;
    } else if (symbol.includes('←') || symbol.includes('↰') || symbol.includes('↖')) {
      dir = 'left';
    } else if (symbol.includes('→') || symbol.includes('↱') || symbol.includes('↗')) {
      dir = 'right';
    }
    const recIdx =
      dir === 'left' || dir === 'uturn'
        ? 0
        : dir === 'right' || (up.valid && up.isRampTransition)
          ? laneCount - 1
          : activeIdx;
    for (let i = 0; i < laneCount; i++) {
      lanes.push({
        index: i,
        active: i === activeIdx,
        recommended: i === recIdx,
        direction: i === recIdx ? dir : 'straight',
      });
    }
  }

  return {
    active: true,
    symbol,
    distanceText,
    maneuverText,
    roadName,
    showLanes,
    lanes,
  };
}
