import { DEFAULT_SEDAN_VISUAL_CONFIG, type VehicleVisualConfig } from './VehicleVisualConfig';
import { EXECUTIVE_LIGHTING_PROFILE } from './LuxuryVisualProfile';
import { SU7_MAX_DIMENSIONS as d } from '../su7MaxDimensions';

export const SU7_MAX_VISUAL_CONFIG: VehicleVisualConfig = {
  ...DEFAULT_SEDAN_VISUAL_CONFIG, name: '2026 Xiaomi SU7 Max',
  dimensions: d, collisionDimensions: d, vehicleWidth: d.width, vehicleLength: d.length,
  wheelBase: d.wheelBase, trackWidth: d.frontTrackWidth, wheelRadius: d.wheelRadius,
  driverEyePosition: [-.40, 1.13, .28], steeringWheelPosition: [-.40, .78, -.22],
  steeringColumnMountPosition: [-.40, .72, -.54], steeringWheelLockDegrees: 870.4,
  instrumentCluster: { displayStyle: 'su7-digital', featureClass: 'advanced', maximumSpeedKmh: 280,
    maximumRPM: 0, redlineRPM: 0, needleResponse: 14 },
  instrumentClusterTransform: { position: [-.40, .965, -.57], rotation: [-.08, 0, 0] },
  drivingSceneDisplay: { lanes: true, proximity: true },
  dashboard: { position: [0, .80, -.70], dimensions: [1.74, .14, .32], tiltRadians: 0 },
  cabin: { width: 1.73, dashboardTopY: .87, windshieldBottomY: .943, windshieldTopY: 1.335,
    windshieldBottomZ: -1.02, windshieldTopZ: -.33, roofY: 1.41 },
  leftMirrorTransform: { ...DEFAULT_SEDAN_VISUAL_CONFIG.leftMirrorTransform,
    position: [-1.055, .94, -.70], mountPosition: [-.953, .88, -.74], size: [.19, .10], housingDepth: .055 },
  rightMirrorTransform: { ...DEFAULT_SEDAN_VISUAL_CONFIG.rightMirrorTransform,
    position: [1.055, .94, -.70], mountPosition: [.953, .88, -.74], size: [.19, .10], housingDepth: .055 },
  body: { ...DEFAULT_SEDAN_VISUAL_CONFIG.body, exterior: 'xiaomi-su7', design: 'electric-fastback', profile: 'sedan',
    groundClearance: .134, wheelArchClearance: .065, sillY: .29, hoodTopY: .943, hoodLength: 1.49,
    trunkDeckY: .91, trunkLength: .65, roofWidth: 1.36, roofLength: 1.25, roofCenterZ: .295,
    color: 0x24899e, trimColor: 0x131a20, interiorColor: 0xb7a99b },
  windowGlass: { color: 0x253c4b, windshieldOpacity: .15, windowOpacity: .52 },
  automaticMirrorFold: { angleRadians: .85, response: 4 },
  exteriorLighting: { ...EXECUTIVE_LIGHTING_PROFILE, signature: 'authored-led', color: 0xeef7ff },
  interiorAmbientLighting: { color: 0x75cbd3, dayIntensity: .01, nightIntensity: .24,
    fadeResponse: 4, footwellIntensity: .018, steeringBadge: 'xiaomi' },
};
