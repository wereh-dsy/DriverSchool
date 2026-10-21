import { clamp } from '../physics/math';
import type { VehicleActuatorRequest } from './VehicleActuatorRequest';
import type { BrakeTorqueCoordinator } from '../physics/BrakeTorqueCoordinator';
import type { VehicleControlState } from './VehicleStateEstimator';
import { WHEEL_IDS } from '../physics/WheelContact';

/** All propulsion limits compose by minimum. The hydraulic coordinator owns
 * base + additive wheel requests, hardware saturation, then final ABS authority. */
export class ControlArbitrator {
  public readonly request: VehicleActuatorRequest = { powertrainTorqueFactor: 1,
    frontTorqueFactor: 1, rearTorqueFactor: 1, brakeTorques: [0, 0, 0, 0] };
  public limitTorque(front: number, rear: number, stability: number, frontShare: number): void {
    const out = this.request;
    out.frontTorqueFactor = clamp(Math.min(front, stability), 0, 1);
    out.rearTorqueFactor = clamp(Math.min(rear, stability), 0, 1);
    out.powertrainTorqueFactor = out.frontTorqueFactor * frontShare + out.rearTorqueFactor * (1 - frontShare);
  }
  public submitBrakes(coordinator: BrakeTorqueCoordinator, stability: readonly number[],
    traction: readonly number[], state?: VehicleControlState): void {
    for (let i = 0; i < 4; i++) {
      if (state) {
        const w = state.wheels[WHEEL_IDS[i]!];
        // A 2x demand reserve preserves real slip/ABS operation and allows tyre
        // force tradeoff in a corner. Airborne/rejected service authority is zero.
        coordinator.setWheelServiceCapacity(i, w.grounded ? 2 * w.rollingRadius *
          Math.min(w.rawLongitudinalCapacity, w.estimatedLongitudinalCapacity) : 0);
      }
      coordinator.requestWheel(i, 'esc', stability[i] ?? 0);
      coordinator.requestWheel(i, 'traction', traction[i] ?? 0);
    }
  }
  public captureBrakes(coordinator: BrakeTorqueCoordinator): void {
    for (let i = 0; i < 4; i++) this.request.brakeTorques[i] = coordinator.wheelTorques[i]!.appliedBrakeTorque;
  }
}
