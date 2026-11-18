import { DEFAULT_SEDAN_VISUAL_CONFIG, type VehicleVisualConfig } from './VehicleVisualConfig';
import { TAYCAN_4S_DIMENSIONS as d } from '../VehicleDimensions';

/** Independent three-zone driver cluster and separate PCM/climate/Chrono surfaces. */
export const TAYCAN_4S_VISUAL_CONFIG: VehicleVisualConfig = {
  ...DEFAULT_SEDAN_VISUAL_CONFIG, name: 'Taycan 4S Performance Battery Plus',
  dimensions: d, collisionDimensions: d, vehicleWidth: d.width, vehicleLength: d.length,
  wheelBase: d.wheelBase, trackWidth: d.frontTrackWidth, wheelRadius: d.wheelRadius,
  driverEyePosition: [-.40, 1.09, .28], steeringWheelPosition: [-.40, .74, -.24],
  steeringColumnMountPosition: [-.40, .67, -.53], steeringWheelLockDegrees: 930,
  instrumentCluster: { displayStyle: 'ev-premium', featureClass: 'advanced', maximumSpeedKmh: 280,
    maximumRPM: 0, redlineRPM: 0, needleResponse: 15 },
  instrumentClusterTransform: { position: [-.40, .905, -.51], rotation: [-.1, 0, 0], scale: .84 },
  drivingSceneDisplay: { lanes: true, proximity: true },
  leftMirrorTransform: { ...DEFAULT_SEDAN_VISUAL_CONFIG.leftMirrorTransform, position: [-1.09, .83, -.69], mountPosition: [-.97, .78, -.73] },
  rightMirrorTransform: { ...DEFAULT_SEDAN_VISUAL_CONFIG.rightMirrorTransform, position: [1.09, .83, -.69], mountPosition: [.97, .78, -.73] },
  dashboard: { position: [0, .74, -.64], dimensions: [1.76, .13, .34], tiltRadians: -.05 },
  cabin: { width: 1.73, dashboardTopY: .81, windshieldBottomY: .82, windshieldTopY: 1.31,
    windshieldBottomZ: -.92, windshieldTopZ: -.37, roofY: 1.344 },
  body: { ...DEFAULT_SEDAN_VISUAL_CONFIG.body, design: 'electric-fastback', profile: 'sedan',
    groundClearance: .128, wheelArchClearance: .04, sillY: .34, hoodTopY: .71,
    hoodLength: 1.52, trunkDeckY: .78, trunkLength: .52, roofWidth: 1.32, roofLength: 1.59,
    roofCenterZ: .36, color: 0x738c82, trimColor: 0x15191c, interiorColor: 0x76232a },
  windowGlass: { color: 0x607383, windshieldOpacity: .13, windowOpacity: .22 },
  automaticMirrorFold: { angleRadians: .85, response: 4 },
};
