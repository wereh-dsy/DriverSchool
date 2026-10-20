import type { SurfaceType } from '../../world/SurfaceMaterial';
import type { GroundNormal, WheelId } from './WheelContact';

/** Final, bounded suspension geometry in the same world frame as the chassis. */
export interface WheelGeometryState {
  readonly attachmentWorldPosition: GroundNormal;
  readonly suspensionAxis: GroundNormal;
  readonly minSuspensionLength: number;
  /** Loaded equilibrium length, rather than the unloaded spring length. */
  readonly restSuspensionLength: number;
  readonly maxSuspensionLength: number;
  readonly suspensionLength: number;
  readonly wheelCenterWorld: GroundNormal;
  readonly surfacePoint: GroundNormal;
  readonly surfaceNormal: GroundNormal;
  /** Sphere/plane penetration remaining after the strut reaches full bump. */
  readonly penetration: number;
}

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
  /** Present on production snapshots; worldPosition aliases this final wheel centre. */
  readonly geometry?: WheelGeometryState;
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
  readonly bumpStopForce?: number;
  readonly antiRollForce?: number;
  /** Normal reaction from the mechanical stop, averaged over the fixed step. */
  readonly contactForce?: number;
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

/** Sprung-body state. Production uses absolute dynamic YXZ pitch/roll. */
export interface ChassisPhysicsState {
  /** Phase 2: pitch/roll are absolute; terrain attitude is diagnostic only. */
  readonly dynamicAttitude?: boolean;
  readonly centerOfMassHeight?: number;
  readonly centerOfMassOffsetZ?: number;
  readonly pitchAngularVelocity?: number;
  readonly rollAngularVelocity?: number;
  readonly pitchAngularAcceleration?: number;
  readonly rollAngularAcceleration?: number;
  readonly pitchTorque?: number;
  readonly rollTorque?: number;
  readonly totalVerticalForce?: number;
  readonly contactMicrosteps?: number;
  readonly safetyInterventions?: number;
  readonly pitchInertia?: number;
  readonly rollInertia?: number;
  /** Mean sampled support plane; diagnostics and map surface selection only. */
  readonly groundHeight: number;
  /**
   * Authoritative sprung-CG heave datum (CG world Y minus authored CG height).
   * Body origin follows from this and pitch/roll through chassisBodyPose.
   */
  readonly chassisY: number;
  /** Diagnostic support-plane reference; used for spawn only, never runtime pose. */
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
export function chassisBodyPose(chassis: ChassisPhysicsState, staticBodyOffsetY = 0, yaw = 0) {
  const pitch = chassis.pitch + (chassis.dynamicAttitude ? 0 : chassis.terrainPitch);
  const roll = chassis.roll + (chassis.dynamicAttitude ? 0 : chassis.terrainRoll);
  // The authored origin offset is chassis-local, just like the wheel mounts.
  // Rotate it with the same YXZ convention before adding the world translation.
  const height = chassis.dynamicAttitude ? chassis.centerOfMassHeight ?? 0 : 0;
  const cgZ = chassis.dynamicAttitude ? chassis.centerOfMassOffsetZ ?? 0 : 0;
  const x = -Math.sin(roll) * (staticBodyOffsetY - height);
  const z = Math.sin(pitch) * Math.cos(roll) * (staticBodyOffsetY - height) - Math.cos(pitch) * cgZ;
  return {
    offsetX: Math.cos(yaw) * x + Math.sin(yaw) * (z + cgZ),
    offsetZ: -Math.sin(yaw) * x + Math.cos(yaw) * (z + cgZ),
    y: chassis.chassisY + height + Math.cos(pitch) * Math.cos(roll) * (staticBodyOffsetY - height) + Math.sin(pitch) * cgZ,
    pitch, roll,
  };
}
