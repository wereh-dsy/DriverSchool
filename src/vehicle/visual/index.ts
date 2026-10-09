export { Cockpit } from './Cockpit';
export {
  CX4_INSTRUMENT_CLUSTER_LAYOUT,
  formatInstrumentGear,
  INSTRUMENT_CLUSTER_HOUSING_LAYOUT,
  INSTRUMENT_CLUSTER_LAYOUT,
  JETTA_INSTRUMENT_CLUSTER_LAYOUT,
  SPORT_INSTRUMENT_INDICATOR_IDS,
  SPORT_INSTRUMENT_CLUSTER_LAYOUT,
  InstrumentCluster,
} from './InstrumentCluster';
export { runInstrumentClusterLayoutSelfTest } from './InstrumentCluster.selftest';
export type { InstrumentClusterLayoutSelfTestResult } from './InstrumentCluster.selftest';
export { runDriverViewSelfTest } from './DriverView.selftest';
export type {
  DriverViewSelfTestResult,
  VehicleDriverViewMetrics,
} from './DriverView.selftest';
export type {
  InstrumentClusterConfig,
  InstrumentDisplayStyle,
  InstrumentGear,
  InstrumentIndicatorState,
  InstrumentTelemetry,
} from './InstrumentCluster';
export {
  DEFAULT_SEDAN_VISUAL_CONFIG,
  SPORTS_COUPE_VISUAL_CONFIG,
  TEST_6AT_VISUAL_CONFIG,
  TEST_7DCT_VISUAL_CONFIG,
  CVT_SEDAN_VISUAL_CONFIG,
  EXECUTIVE_SEDAN_VISUAL_CONFIG,
  defaultSedanVisualConfig,
  sportsCoupeVisualConfig,
} from './VehicleVisualConfig';
export type {
  EulerTuple,
  MirrorVisualConfig,
  VehicleVisualConfig,
  Vector3Tuple,
  VisualTransformConfig,
} from './VehicleVisualConfig';
export { VehicleVisual } from './VehicleVisual';
export { VehicleLighting, type VehicleLightMode } from './VehicleLighting';
export type {
  MirrorSide,
  MirrorSurfaceMesh,
  MirrorWorldTransform,
  VehicleVisualPose,
} from './VehicleVisual';

export { ROAD_SUV_VISUAL_CONFIG } from './VehicleVisualConfig';
export { FERRARI_458_VISUAL_CONFIG } from './Ferrari458VisualConfig';
