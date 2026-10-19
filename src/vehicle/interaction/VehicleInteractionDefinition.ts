import type { Object3D, Plane } from 'three';

import type { VehicleCabinAcousticsProfile } from '../../audio/VehicleCabinAcoustics';

/** Shared local-frame tuple aliases; no dependency on a vehicle visual config. */
export type InteractionVector3Tuple = readonly [x: number, y: number, z: number];
export type InteractionEulerTuple = readonly [x: number, y: number, z: number];

/** A local transform on a door/window node, relative to its parent. */
export interface VehicleInteractionTransform {
  readonly position: InteractionVector3Tuple;
  readonly rotation: InteractionEulerTuple;
}

/** Vehicle-provided driver-door visual and animation definition. */
export interface DriverDoorDefinition {
  /** The moving door assembly (a child of the hinge). */
  readonly doorNode: Object3D;
  /** The actual A-pillar hinge; only the shared controller rotates this. */
  readonly hingeNode: Object3D;
  readonly closedTransform: VehicleInteractionTransform;
  readonly openTransform: VehicleInteractionTransform;
  readonly openSeconds: number;
  readonly closeSeconds: number;
}

/** Vehicle-provided driver-window visual and travel definition. */
export interface DriverWindowDefinition {
  readonly node: Object3D;
  readonly closedTransform: VehicleInteractionTransform;
  /** Unit direction of glass travel in the door's local frame. */
  readonly localTravelDirection: InteractionVector3Tuple;
  readonly travelDistance: number;
  readonly movementSeconds: number;
  /** Optional belt-plane clip owned by the vehicle visual. */
  readonly beltClipPlane?: Plane;
  readonly beltClipPlaneLocal?: Plane;
}

/** Vehicle-provided driver-door approach/exit zone in local X/Z metres. */
export interface DriverInteractionZone {
  readonly centerLocal: readonly [x: number, z: number];
  readonly radius: number;
  readonly minLocalZ: number;
  readonly maxLocalZ: number;
  /** Signed local X limit; left-hand drive vehicles use a negative value. */
  readonly sideLimitLocalX: number;
}

/**
 * The complete minimal data contract between one vehicle and the shared
 * interaction controller. Vehicles supply nodes, local transforms, anchors and
 * calibration; no vehicle identity or model-specific branch is required.
 */
export interface VehicleInteractionDefinition {
  /** Diagnostic label only; shared behavior must not branch on it. */
  readonly id: string;
  readonly driverDoor: DriverDoorDefinition;
  readonly driverWindow: DriverWindowDefinition;
  readonly driverEyePoint: InteractionVector3Tuple;
  readonly driverEntryPoint: InteractionVector3Tuple;
  readonly driverExitPoint: InteractionVector3Tuple;
  readonly driverInteractionZone: DriverInteractionZone;
  readonly cabinAcoustics?: VehicleCabinAcousticsProfile;
  readonly stationarySpeedEpsilon?: number;
}

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;

/**
 * Shared transform application. The runtime fractions live in
 * VehicleInteractionController; this function only maps them onto the
 * vehicle-provided nodes. No vehicle-specific code executes here.
 */
export function applyVehicleInteractionVisual(
  definition: VehicleInteractionDefinition,
  driverDoorOpenFraction: number,
  driverWindowOpenFraction: number,
): void {
  const doorFraction = clamp01(driverDoorOpenFraction);
  const door = definition.driverDoor;
  door.hingeNode.position.set(
    lerp(door.closedTransform.position[0], door.openTransform.position[0], doorFraction),
    lerp(door.closedTransform.position[1], door.openTransform.position[1], doorFraction),
    lerp(door.closedTransform.position[2], door.openTransform.position[2], doorFraction),
  );
  door.hingeNode.rotation.set(
    lerp(door.closedTransform.rotation[0], door.openTransform.rotation[0], doorFraction),
    lerp(door.closedTransform.rotation[1], door.openTransform.rotation[1], doorFraction),
    lerp(door.closedTransform.rotation[2], door.openTransform.rotation[2], doorFraction),
  );

  const windowFraction = clamp01(driverWindowOpenFraction);
  const window = definition.driverWindow;
  window.node.position.set(
    window.closedTransform.position[0] + window.localTravelDirection[0] * window.travelDistance * windowFraction,
    window.closedTransform.position[1] + window.localTravelDirection[1] * window.travelDistance * windowFraction,
    window.closedTransform.position[2] + window.localTravelDirection[2] * window.travelDistance * windowFraction,
  );
  window.node.rotation.set(
    window.closedTransform.rotation[0],
    window.closedTransform.rotation[1],
    window.closedTransform.rotation[2],
  );

  // Optional visual detail: transform the belt-plane clip with the door so the
  // hidden lower glass cannot enter the door card/armrest while it slides.
  if (window.beltClipPlane !== undefined && window.beltClipPlaneLocal !== undefined) {
    door.hingeNode.updateWorldMatrix(true, false);
    window.beltClipPlane.copy(window.beltClipPlaneLocal)
      .applyMatrix4(door.hingeNode.matrixWorld);
  }
}
