export {
  DEFAULT_DRIVER_FOV_DEGREES,
  DEFAULT_DRIVER_HEAD_LOOK,
  DriverCamera,
  type DriverCameraOptions,
  type DriverHeadLookOptions,
  type HeadLookState,
  type VehiclePose,
} from './DriverCamera';
export {
  MirrorSystem,
  type MirrorPlaneConfig,
  type MirrorResolution,
  type MirrorSide,
  type MirrorSurfaceMaterialOptions,
  type MirrorSystemOptions,
  type MirrorTransformSpace,
  type MirrorView,
} from './MirrorSystem';
export {
  MirrorAdjustmentController,
  type AdjustableMirrorSide,
  type MirrorAdjustment,
  type MirrorAdjustmentControllerOptions,
  type MirrorAdjustments,
} from './MirrorAdjustmentController';
export {
  computePlanarMirrorView,
  createPlanarMirrorViewComputation,
  makeWorldPlane,
  reflectDirectionAcrossPlane,
  reflectPointAcrossPlane,
  type PlanarMirrorViewComputation,
  type PlanarMirrorViewInput,
} from './MirrorMath';
export {
  runMirrorGeometrySelfTest,
  type MirrorGeometrySelfTestResult,
} from './MirrorSystem.selftest';
export type {
  EulerComponents,
  EulerLike,
  QuaternionComponents,
  QuaternionLike,
  Vector2Like,
  Vector3Like,
  XYLike,
  XYZLike,
} from './types';
