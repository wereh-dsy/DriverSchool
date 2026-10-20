import type { SurfaceType } from '../../world/SurfaceMaterial';
import type { GroundNormal, WheelId } from './WheelContact';

/** Observable SI-unit state of one tyre and its simple spring/damper. */
export interface WheelPhysicsState {
  readonly surfaceDepth?: number;
  /** Current load-sensitive longitudinal capacity / normal load, not a sensor. */
  readonly estimatedFriction?: number;
  readonly softSurfaceResistanceForce?: number;
  /** Borrowed latest thermal telemetry; no new thermal objects at physics cadence. */
  readonly tyre?: Readonly<import('./TyreThermalPressureSystem').TyreThermalPressureState>;
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
  /** Geometric suspension reach contact, not the old always-on road sample. */
  readonly grounded?: boolean;
  /** Spring/damper/bump-stop vertical support delivered to the chassis, N. */
  readonly supportForce?: number;
  /** Current strut length in metres; never negative. */
  readonly suspensionLength?: number;
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
  /** Mean sampled support plane; diagnostics and map surface selection only. */
  readonly groundHeight: number;
  /**
   * Authoritative body-origin height (axle-midpoint datum). This is integrated
   * from gravity and suspension support and is never re-snapped to the road.
   */
  readonly chassisY: number;
  /** Four-wheel support plane; separate from spring-induced body attitude. */
  readonly terrainPitch: number;
  readonly terrainRoll: number;
  /**
   * Legacy load-model deflection used by instrumentation. It no longer moves
   * the rendered body, so it cannot add a second, fake heave path.
   */
  readonly rideOffset: number;
  /** Positive raises the nose; braking produces a negative angle. */
  readonly pitch: number;
  /** Positive raises the right side; a right turn compresses the left side. */
  readonly roll: number;
  /** Chassis vertical velocity from the heave integrator, m/s. */
  readonly verticalVelocity: number;
  readonly verticalAcceleration: number;
  readonly groundedWheels: number;
}

/**
 * Shared authored-body pose for rendering and the planar collider's vertical
 * envelope. Physics chassisY is the only vertical authority; staticBodyOffsetY
 * is the authored model-origin offset (normally zero once rideHeight and
 * underfloor clearance are calibrated).
 */
export function chassisBodyPose(chassis: ChassisPhysicsState, staticBodyOffsetY = 0) {
  return {
    y: chassis.chassisY + staticBodyOffsetY,
    pitch: chassis.terrainPitch + chassis.pitch,
    roll: chassis.terrainRoll + chassis.roll,
  };
}
