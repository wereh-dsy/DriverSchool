import { DEFAULT_SEDAN_VISUAL_CONFIG, type VehicleVisualConfig } from './VehicleVisualConfig';
import { TESLA_MODEL_3_DIMENSIONS as d } from '../VehicleDimensions';

/** Independent fastback envelope and centre-screen cabin; shared primitive builders only. */
export const TESLA_MODEL_3_VISUAL_CONFIG: VehicleVisualConfig = {
  ...DEFAULT_SEDAN_VISUAL_CONFIG, name: 'Model 3 RWD electric fastback',
  dimensions: d, collisionDimensions: d, vehicleWidth: d.width, vehicleLength: d.length,
  wheelBase: d.wheelBase, trackWidth: d.frontTrackWidth, wheelRadius: d.wheelRadius,
  driverEyePosition: [-.37, 1.13, .28],
  instrumentCluster: { displayStyle: 'ev-center', featureClass: 'advanced', maximumSpeedKmh: 220,
    maximumRPM: 0, redlineRPM: 0, needleResponse: 12 },
  instrumentClusterTransform: { position: [.10, .96, -.48], rotation: [-.08, -.04, 0] },
  steeringWheelPosition: [-.37, .78, -.22], steeringColumnMountPosition: [-.37, .70, -.53],
  steeringWheelLockDegrees: 720,
  lampLayout: { frontHeight: .68, frontIndicatorHeight: .62, frontLateral: .58,
    rearTailHeight: .735, rearBrakeHeight: .705, rearIndicatorHeight: .665, rearReverseHeight: .615, mirrorRepeater: true },
  leftMirrorTransform: { ...DEFAULT_SEDAN_VISUAL_CONFIG.leftMirrorTransform, position: [-1.02, .88, -.62], mountPosition: [-.88, .82, -.66] },
  rightMirrorTransform: { ...DEFAULT_SEDAN_VISUAL_CONFIG.rightMirrorTransform, position: [1.02, .88, -.62], mountPosition: [.88, .82, -.66] },
  dashboard: { position: [0, .77, -.65], dimensions: [1.64, .12, .35], tiltRadians: 0 },
  cabin: { width: 1.60, dashboardTopY: .83, windshieldBottomY: .83, windshieldTopY: 1.36,
    windshieldBottomZ: -.91, windshieldTopZ: -.34, roofY: 1.405 },
  body: { ...DEFAULT_SEDAN_VISUAL_CONFIG.body, design: 'electric-fastback', profile: 'sedan',
    groundClearance: .138, wheelArchClearance: .042, sillY: .35, hoodTopY: .76,
    hoodLength: 1.42, trunkDeckY: .83, trunkLength: .53, roofWidth: 1.28, roofLength: 1.60,
    roofCenterZ: .36, color: 0xdce1e6, trimColor: 0x12161c, interiorColor: 0x202327 },
  windowGlass: { color: 0x647b8d, windshieldOpacity: .12, windowOpacity: .21 },
  parkingCamera: { surroundView: false }, automaticMirrorFold: { angleRadians: .85, response: 4 },
};
