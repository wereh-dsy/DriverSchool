/** SI shaft boundary. ICE-specific combustion/startup data stays on Engine. */
export interface DriveTorqueSource {
  /** rad/s and kg m² at the source output shaft. */
  readonly shaftAngularVelocity: number;
  readonly rotationalInertia: number;
  /** Nm, including the source's passive shaft drag. */
  readonly availableDriveTorque: number;
  /** Normalized driver/controller propulsion demand, 0..1. */
  readonly requestedDrive: number;
  /** Nm generated at the last source integration step. */
  readonly deliveredDriveTorque: number;
  readonly canDeliverTorque: boolean;
  requestDrive(demand: number, dt: number): void;
  updateState(dt: number, loadTorque: number): void;
}
