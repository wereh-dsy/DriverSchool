import type { SurfaceType } from '../../world/SurfaceMaterial';
import type { GroundNormal, WheelId } from './WheelContact';

/** Observable SI-unit state of one tyre and its simple spring/damper. */
export interface WheelPhysicsState {
  /** Normalized alignment: negative camber top inward; positive toe-in on either side. */
  readonly camberAngle?: number;
  readonly toeAngle?: number;
  readonly id: WheelId;
  readonly worldPosition: { readonly x: number; readonly y: number; readonly z: number };
  readonly surfaceType: SurfaceType;
  readonly groundNormal: GroundNormal;
  readonly normalLoad: number;
  readonly steeringAngle: number;
  readonly driveTorque: number;
  /** Torque-equivalent diagnostic, Tdrive/r; not an additional chassis force. */
  readonly driveForce: number;
  readonly brakeTorque: number;
  /** Merged service/ESC hydraulic demand before independent ABS modulation. */
  readonly requestedBrakeTorque: number;
  readonly appliedBrakeTorque: number;
  readonly brakeForce: number;
  readonly handbrakeTorque: number;
  readonly requestedHandbrakeTorque: number;
  readonly appliedHandbrakeTorque: number;
  readonly handbrakeForce: number;
  readonly rollingResistanceForce: number;
  /** Actual slip/static-contact tyre forces in the steered wheel frame. */
  readonly longitudinalForce: number;
  readonly lateralForce: number;
  readonly suspensionCompression: number;
  readonly suspensionVelocity: number;
  readonly suspensionRestCompression: number;
  readonly springForce: number;
  readonly damperForce: number;
  /** Persistent rotational state, rad/s; never reconstructed every step from chassis speed. */
  readonly angularVelocity: number;
  /** Compatibility alias of angularVelocity. */
  readonly wheelAngularVelocity: number;
  /** Persistent visual spin phase, radians. */
  readonly rotationAngle: number;
  /** Contact-point velocity in the steered wheel's coordinates, m/s. */
  readonly longitudinalSpeed: number;
  readonly lateralSpeed: number;
  readonly slipRatio: number;
  readonly slipAngle: number;
  readonly longitudinalUsage: number;
  readonly lateralUsage: number;
  /** Usage of the shared, forgiving per-wheel grip budget. */
  readonly gripUsage: number;
}

export type WheelPhysicsStateSet = Readonly<Record<WheelId, WheelPhysicsState>>;

/** Small local Three.js X/Z rotations on top of the road-plane pose. */
export interface ChassisPhysicsState {
  readonly groundHeight: number;
  /** Four-wheel support plane; separate from spring-induced body attitude. */
  readonly terrainPitch: number;
  readonly terrainRoll: number;
  readonly rideOffset: number;
  /** Positive raises the nose; braking produces a negative angle. */
  readonly pitch: number;
  /** Positive raises the right side; a right turn compresses the left side. */
  readonly roll: number;
  readonly verticalVelocity: number;
}

/** Shared authored-body pose for rendering and the planar collider's vertical envelope. */
export function chassisBodyPose(chassis: ChassisPhysicsState, staticBodyOffsetY = 0) {
  return {
    y: chassis.groundHeight + staticBodyOffsetY + chassis.rideOffset,
    pitch: chassis.terrainPitch + chassis.pitch,
    roll: chassis.terrainRoll + chassis.roll,
  };
}
