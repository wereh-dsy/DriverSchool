import type { SurfaceType } from '../../world/SurfaceMaterial';
import type { GroundNormal, WheelId } from './WheelContact';

/** Observable SI-unit state of one tyre and its simple spring/damper. */
export interface WheelPhysicsState {
  readonly id: WheelId;
  readonly worldPosition: { readonly x: number; readonly y: number; readonly z: number };
  readonly surfaceType: SurfaceType;
  readonly groundNormal: GroundNormal;
  readonly normalLoad: number;
  readonly steeringAngle: number;
  readonly driveTorque: number;
  readonly driveForce: number;
  readonly brakeTorque: number;
  readonly brakeForce: number;
  readonly handbrakeTorque: number;
  readonly handbrakeForce: number;
  readonly rollingResistanceForce: number;
  readonly longitudinalForce: number;
  readonly lateralForce: number;
  readonly suspensionCompression: number;
  readonly suspensionVelocity: number;
  readonly suspensionRestCompression: number;
  readonly springForce: number;
  readonly damperForce: number;
  readonly wheelAngularVelocity: number;
  readonly slipAngle: number;
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
