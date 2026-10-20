import { DEFAULT_SEDAN_VISUAL_CONFIG, type VehicleVisualConfig } from './VehicleVisualConfig';
import { EXECUTIVE_LIGHTING_PROFILE } from './LuxuryVisualProfile';
import { TESLA_MODEL_3_DIMENSIONS as d } from '../VehicleDimensions';

/**
 * Independent fastback envelope and centre-screen cabin.  The exterior shape
 * lives in `TeslaModel3Exterior`; this file only carries calibrated anchors,
 * proportions, colours and lighting presentation.
 */
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
  lampLayout: { frontHeight: .705, frontIndicatorHeight: .696, frontLateral: .62,
    rearTailHeight: .866, rearBrakeHeight: .852, rearIndicatorHeight: .874, rearReverseHeight: .850, mirrorRepeater: true },
  leftMirrorTransform: { ...DEFAULT_SEDAN_VISUAL_CONFIG.leftMirrorTransform,
    position: [-1.01, .90, -.63], mountPosition: [-.885, .845, -.665], size: [.19, .095], housingDepth: .05 },
  rightMirrorTransform: { ...DEFAULT_SEDAN_VISUAL_CONFIG.rightMirrorTransform,
    position: [1.01, .90, -.63], mountPosition: [.885, .845, -.665], size: [.19, .095], housingDepth: .05 },
  dashboard: { position: [0, .77, -.65], dimensions: [1.64, .12, .35], tiltRadians: 0 },
  cabin: { width: 1.60, dashboardTopY: .83, windshieldBottomY: .958, windshieldTopY: 1.305,
    windshieldBottomZ: -.90, windshieldTopZ: -.21, roofY: 1.355 },
  body: { ...DEFAULT_SEDAN_VISUAL_CONFIG.body, exterior: 'tesla-model-3', design: 'electric-fastback', profile: 'sedan',
    groundClearance: .138, wheelArchClearance: .042, sillY: .34, hoodTopY: .948,
    hoodLength: 1.40, trunkDeckY: .962, trunkLength: .74, roofWidth: 1.32, roofLength: 1.24,
    roofCenterZ: .20, color: 0xe6eaee, trimColor: 0x0e1216, interiorColor: 0x1f2326 },
  windowGlass: { color: 0x26323b, windshieldOpacity: .16, windowOpacity: .44 },
  exteriorLighting: {
    ...EXECUTIVE_LIGHTING_PROFILE, signature: 'authored-led', color: 0xf2f7ff,
    low: { intensity: 560, distance: 82, angle: .65, targetY: -.24, targetZ: -42 },
    high: { intensity: 1150, distance: 165, angle: .30, targetY: .24, targetZ: -118 },
    penumbra: .58, decay: 1.15, retainLowBeamOnHigh: true,
    autoOffWithIgnition: false, welcomeSeconds: 0, sequentialTurnSeconds: 0,
    lowLensIntensity: 1.55, highLensIntensity: 2.3, positionLensIntensity: 1.15,
    turnLensIntensity: 3, turnColor: 0xffa321,
  },
  parkingCamera: { surroundView: false },
};
