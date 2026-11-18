import type { LateralAssistDisplayState } from '../control/LateralAssistController';
/** Skin-independent semantics; existing instrument geometry remains unchanged. */
export function lateralBoundaryColor(state: LateralAssistDisplayState | undefined, boundary: number, fallback: string): string {
  if (!state?.laneValid) return fallback;
  if (state.lkaActive && state.correctingSide === (boundary === 0 ? 'left' : 'right')) return '#e8be66';
  if (state.lccActive) return '#53b6d5';
  if (state.lccAvailable) return '#72a68d';
  return fallback;
}
