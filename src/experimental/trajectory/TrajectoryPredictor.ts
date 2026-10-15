import type { VehicleRuntimeSnapshot } from '../../vehicle/physics/VehicleDynamics';
import { centerOfMassOffsetZ } from '../../vehicle/VehicleDimensions';

export type TrajectoryState = Pick<VehicleRuntimeSnapshot,
  'x' | 'z' | 'yaw' | 'speed' | 'acceleration' | 'lateralVelocity' | 'yawRate' | 'steeringAngle'>;
export interface TrajectoryGeometry {
  readonly wheelBase: number;
  readonly frontWeightBias: number;
  readonly length: number;
}

export const TRAJECTORY_STEP_SECONDS = 0.05;
export const TRAJECTORY_HORIZON_SECONDS = 2;
export const TRAJECTORY_MAX_POINTS = Math.round(TRAJECTORY_HORIZON_SECONDS / TRAJECTORY_STEP_SECONDS) + 1;

/** Borrowed buffer, overwritten by the next prediction. Coordinates are world X/Z, SI units. */
export interface TrajectoryPredictionResult {
  readonly positions: Float64Array;
  readonly headings: Float64Array;
  readonly times: Float64Array;
  readonly speeds: Float64Array;
  readonly horizonSeconds: number;
  readonly stepSeconds: number;
  pointCount: number;
  /** Null unless the observed deceleration reaches rest inside this forecast. */
  stopTimeSeconds: number | null;
}

/**
 * Two-second constant-curvature / acceleration motion extrapolation.
 * Uses the actual acceleration and holds body slip ratio and rack angle constant;
 * slows the predicted turn with speed and terminates at rest, never reversing
 * solely because extrapolated braking crossed zero. No drivetrain/tyre simulation.
 * At parking speeds steering geometry supplements the measured yaw rate;
 * above that, observed turning/sliding dominates (no ideal-grip assumption).
 * Assumes the current acceleration trend continues; does not predict changes of
 * throttle/brakes, collisions, future surfaces or driver actions.
 */
export class TrajectoryPredictor {
  public readonly result: TrajectoryPredictionResult = {
    positions: new Float64Array(TRAJECTORY_MAX_POINTS * 2),
    headings: new Float64Array(TRAJECTORY_MAX_POINTS), times: new Float64Array(TRAJECTORY_MAX_POINTS),
    speeds: new Float64Array(TRAJECTORY_MAX_POINTS),
    horizonSeconds: TRAJECTORY_HORIZON_SECONDS, stepSeconds: TRAJECTORY_STEP_SECONDS,
    pointCount: 0, stopTimeSeconds: null,
  };

  public predict(state: Readonly<TrajectoryState>, geometry: TrajectoryGeometry): TrajectoryPredictionResult {
    const result = this.result;
    result.pointCount = 0;
    result.stopTimeSeconds = null;
    if (!Number.isFinite(state.x) || !Number.isFinite(state.z) || !Number.isFinite(state.yaw) ||
      !Number.isFinite(state.speed) || !Number.isFinite(state.acceleration) || !Number.isFinite(state.lateralVelocity) ||
      !Number.isFinite(state.yawRate) || !Number.isFinite(state.steeringAngle) ||
      !Number.isFinite(geometry.wheelBase) || geometry.wheelBase <= 0 ||
      !Number.isFinite(geometry.frontWeightBias) || Math.abs(state.steeringAngle) >= Math.PI / 2 ||
      Math.hypot(state.speed, state.lateralVelocity) < 0.05) return result;

    // Positive rack = right turn, negative world yaw, also correct in reverse.
    const steeringYawRate = -state.speed * Math.tan(state.steeringAngle) / geometry.wheelBase;
    const motionSpeed = Math.hypot(state.speed, state.lateralVelocity);
    const forwardShare = state.speed * state.speed / (motionSpeed * motionSpeed);
    const steeringWeight = forwardShare / (1 + (motionSpeed / 3) ** 4);
    const yawRate = state.yawRate + steeringWeight * (steeringYawRate - state.yawRate);
    const offsetZ = centerOfMassOffsetZ(geometry);
    const longitudinalMotion = Math.abs(state.speed) >= 0.05;
    const curvature = longitudinalMotion ? yawRate / state.speed : 0;
    const slipRatio = longitudinalMotion ? state.lateralVelocity / state.speed : 0;
    const stopTime = longitudinalMotion && state.speed * state.acceleration < 0 ? -state.speed / state.acceleration : Infinity;
    let yaw = state.yaw;
    let speed = state.speed;
    let time = 0;
    let cgX = state.x + Math.sin(yaw) * offsetZ;
    let cgZ = state.z + Math.cos(yaw) * offsetZ;
    result.positions[0] = state.x;
    result.positions[1] = state.z;
    result.headings[0] = yaw; result.times[0] = 0; result.speeds[0] = speed;
    result.pointCount = 1;
    for (let i = 1; i < TRAJECTORY_MAX_POINTS; i++) {
      const dt = Math.min(result.stepSeconds, Math.max(0, stopTime - time));
      const nextSpeed = longitudinalMotion ? speed + state.acceleration * dt : speed;
      const distance = (speed + nextSpeed) * 0.5 * dt;
      const lateralDistance = longitudinalMotion ? slipRatio * distance : state.lateralVelocity * dt;
      const yawDelta = longitudinalMotion ? curvature * distance : yawRate * dt;
      const middleYaw = yaw + yawDelta * 0.5;
      cgX += -Math.sin(middleYaw) * distance + Math.cos(middleYaw) * lateralDistance;
      cgZ += -Math.cos(middleYaw) * distance - Math.sin(middleYaw) * lateralDistance;
      yaw += yawDelta;
      time += dt;
      speed = nextSpeed;
      result.positions[i * 2] = cgX - Math.sin(yaw) * offsetZ;
      result.positions[i * 2 + 1] = cgZ - Math.cos(yaw) * offsetZ;
      result.headings[i] = yaw; result.times[i] = time; result.speeds[i] = speed;
      result.pointCount = i + 1;
      if (time >= stopTime - 1e-9) {
        result.stopTimeSeconds = stopTime;
        result.speeds[i] = 0;
        break;
      }
    }
    return result;
  }
}
