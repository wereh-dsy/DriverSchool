import { createNeutralVehicleInputState, type VehicleInputState } from '../input';
import type { PlayerMode } from './PlayerModeController';

/**
 * The vehicle only receives driver controls while the player is in Driving
 * mode. On foot the same keyboard axes instead feed the walker; the parking
 * brake latch is preserved so leaving the car cannot silently release it.
 */
export function vehicleControlsForPlayerMode(
  raw: VehicleInputState,
  mode: PlayerMode,
): VehicleInputState {
  if (mode === 'Driving') return raw;
  const neutral = createNeutralVehicleInputState(raw.controlMode, raw.clutchPedal);
  neutral.handbrake = raw.handbrake;
  neutral.source = raw.source;
  neutral.sourceMetadata = raw.sourceMetadata;
  return neutral;
}
