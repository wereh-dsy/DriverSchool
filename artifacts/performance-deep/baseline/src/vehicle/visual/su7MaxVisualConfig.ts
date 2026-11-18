import { DEFAULT_SEDAN_VISUAL_CONFIG, type VehicleVisualConfig } from './VehicleVisualConfig';
import { EXECUTIVE_LIGHTING_PROFILE } from './LuxuryVisualProfile';
import { SU7_MAX_DIMENSIONS as d } from '../su7MaxDimensions';

export const SU7_MAX_VISUAL_CONFIG: VehicleVisualConfig = {
  ...DEFAULT_SEDAN_VISUAL_CONFIG, name: '2026 Xiaomi SU7 Max',
  dimensions: d, collisionDimensions: d, vehicleWidth: d.width, vehicleLength: d.length,
  wheelBase: d.wheelBase, trackWidth: d.frontTrackWidth, wheelRadius: d.wheelRadius,
  driverEyePosition: [-.40, 1.13, .28], steeringWheelPosition: [-.40, .845, -.28],
  steeringColumnMountPosition: [-.40, .775, -.54], steeringWheelLockDegrees: 870.4,
  instrumentCluster: { displayStyle: 'su7-digital', featureClass: 'advanced', maximumSpeedKmh: 280,
    maximumRPM: 0, redlineRPM: 0, needleResponse: 14 },
  // Game adaptation: raise the larger display above the steering rim at the default eye point.
  instrumentClusterTransform: { position: [-.40, 1.025, -.55], rotation: [-.08, 0, 0] },
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
    // Game-calibrated mineral green, referenced to the 2026 green photographs;
    // RGB is an appearance approximation, not an OEM paint/lab specification.
    color: 0x406858, trimColor: 0x131a20, interiorColor: 0xcfc5b1 },
  windowGlass: { color: 0x9caaa3, windshieldOpacity: .16, windowOpacity: .35 },
  automaticMirrorFold: { angleRadians: .85, response: 4 },
  driverAccess: { side:'left',doorFrontZ:-.94,doorRearZ:.30,
    openAngleRadians:-1.02,openSeconds:.62,closeSeconds:.82,softClose:{captureFraction:.10,latchSeconds:.30},
    windowTravelSeconds:2.2,windowTravelDirection:[.10,-.9949874371,0],windowTravelDistance:.46,
    driverEntryPoint:[-1.55,0,-.12],driverExitPoint:[-1.55,0,-.12],
    driverInteractionZone:{centerLocal:[-1.55,-.12],radius:1.25,minLocalZ:-1.55,maxLocalZ:1.0,sideLimitLocalX:-.75},
    doorMountedPartNames:['SU7 driver door card','SU7 driver door pull','SU7 driver door armrest','SU7 driver window switches','SU7 driver door speaker'],
    doorMountedExteriorPartNames:['left mirror folding hinge','left mirror optical folding hinge','left door mirror sail mount','Left SU7 mirror repeater'],
    doorAmbientTrimName:'SU7 driver ambient door ribbon',stationarySpeedEpsilon:.25 },
  exteriorLighting: { ...EXECUTIVE_LIGHTING_PROFILE, signature: 'authored-led', color: 0xeef7ff },
  interiorAmbientLighting: { color: 0x6597ca, dayIntensity: .055, nightIntensity: .30,
    fadeResponse: 4, footwellIntensity: .018, steeringBadge: 'xiaomi' },
};
