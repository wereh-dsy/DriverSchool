import { clamp } from '../physics/math';
import type { VehicleActuatorRequest } from './VehicleActuatorRequest';
import type { BrakeTorqueCoordinator } from '../physics/BrakeTorqueCoordinator';

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
    traction: readonly number[]): void {
    for (let i = 0; i < 4; i++) {
      coordinator.requestWheel(i, 'esc', stability[i] ?? 0);
      coordinator.requestWheel(i, 'traction', traction[i] ?? 0);
    }
  }
  public captureBrakes(coordinator: BrakeTorqueCoordinator): void {
    for (let i = 0; i < 4; i++) this.request.brakeTorques[i] = coordinator.wheelTorques[i]!.appliedBrakeTorque;
  }
}
