import { runP2HybridSelfTest } from './P2Hybrid.selftest';
import { runMaybachS680SelfTest } from './MaybachS680.selftest';
import { runMaybachS680AccessSelfTest } from './MaybachS680Access.selftest';
import { runSU7PresentationSelfTest } from './SU7Presentation.selftest';
import { runSU7ExteriorSelfTest } from './visual/SU7Exterior.selftest';
import { runGolfGTIAccessSelfTest } from './visual/GolfGTIAccess.selftest';
import { runTank500DisplaysSelfTest } from './visual/Tank500Displays.selftest';

/** Shared by the normal build and systems runner; never rewrites historical reports. */
export function runRecentVehicleSystemsSelfTest() {
  return {
    p2: runP2HybridSelfTest(),
    maybach: runMaybachS680SelfTest(),
    maybachAccess: runMaybachS680AccessSelfTest(),
    su7Presentation: runSU7PresentationSelfTest(),
    su7Exterior: runSU7ExteriorSelfTest(),
    golfAccess: runGolfGTIAccessSelfTest(),
    tankDisplays: runTank500DisplaysSelfTest(),
  };
}
