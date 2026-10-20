/** Allocation-free actuator boundary, SI torque in Nm, factors in [0,1].
 * Brake values reflect the coordinator's final ABS resolve. */
export interface VehicleActuatorRequest {
  powertrainTorqueFactor: number;
  frontTorqueFactor: number;
  rearTorqueFactor: number;
  frontAxleTorqueRatio?: number;
  rearAxleTorqueRatio?: number;
  /** Interface reservation only; advanced torque vectoring currently requests zero. */
  additionalYawTorqueRequest?: number;
  /** frontLeft, frontRight, rearLeft, rearRight, in the solver's WHEEL_IDS order. */
  readonly brakeTorques: [number, number, number, number];
}
