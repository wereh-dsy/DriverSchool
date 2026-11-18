import { MAYBACH_S680_DIMENSIONS as d } from '../VehicleDimensions';
import { DEFAULT_SEDAN_VISUAL_CONFIG, type VehicleVisualConfig } from './VehicleVisualConfig';
import type { ExteriorLightingVisualProfile, InteriorAmbientLightingProfile } from './LuxuryVisualProfile';

const rad = (v: number): number => v * Math.PI / 180;

/**
 * Digital-LED style optics: warm-white low beam, cooler main beam, amber
 * indicators. All free-standing lens meshes are driven by the shared lighting
 * controller through their `lightingKey`; this profile only calibrates output.
 */
export const MAYBACH_S680_LIGHTING_PROFILE: ExteriorLightingVisualProfile = {
  signature: 'authored-led', color: 0xf5f2e9, beamPattern: 'right-hand-traffic-led',
  low: { intensity: 760, distance: 105, angle: .60, targetY: .40, targetZ: -42 },
  high: { intensity: 1480, distance: 180, angle: .26, targetY: .55, targetZ: -118 },
  penumbra: .62, decay: 1.15, retainLowBeamOnHigh: true,
  autoOffWithIgnition: true, welcomeSeconds: .9, sequentialTurnSeconds: .22,
  lowLensIntensity: 1.15, positionLensIntensity: .90, highLensIntensity: 1.65,
  turnLensIntensity: 2.8, turnLensHeight: .020, turnColor: 0xff8b1a, turnSpillIntensity: .85,
};

/** Restrained blue-violet cabin illumination, the marque's night signature. */
export const MAYBACH_S680_AMBIENT_PROFILE: InteriorAmbientLightingProfile = {
  color: 0xb49aef, dayIntensity: .035, nightIntensity: .26, fadeResponse: 4.2,
  footwellIntensity: .046, dashboardFillIntensity: .072, steeringBadge: 'mercedes-star',
};

/** Independent Z223 envelope and cockpit anchors; shared Mercedes light calibration. */
export const MAYBACH_S680_VISUAL_CONFIG: VehicleVisualConfig = {
  ...DEFAULT_SEDAN_VISUAL_CONFIG,
  name: 'Mercedes-Maybach S 680 4MATIC V12',
  dimensions: d, collisionDimensions: d, vehicleWidth: d.width, vehicleLength: d.length,
  wheelBase: d.wheelBase, trackWidth: d.frontTrackWidth, wheelRadius: d.wheelRadius,
  windowGlass: { color: 0x3e4b55, windshieldOpacity: .27, windowOpacity: .48 },
  driverAccess: {
    side: 'left', doorFrontZ: -1.04, doorRearZ: .26, openAngleRadians: rad(-66),
    openSeconds: .72, closeSeconds: 1.05,
    softClose: { captureFraction: .08, latchSeconds: .28 },
    windowTravelSeconds: 2.7, windowTravelDirection: [-.25, -.96824584, 0], windowTravelDistance: .535,
    driverEntryPoint: [-1.34, 0, -.02], driverExitPoint: [-1.67, 0, .12],
    driverInteractionZone: { centerLocal: [-1.40, -.10], radius: 1.05,
      minLocalZ: -1.12, maxLocalZ: .85, sideLimitLocalX: -1.02 },
    doorMountedPartNames: ['Left front continuous sculpted door card', 'Left fitted curved door veneer false',
      'Left ambient upper zone false', 'Left ambient lower zone false', 'Left integrated leather armrest false',
      'Left door veneer ambient bevel false false', 'Left door veneer ambient bevel false true', 'Left concealed armrest indirect light false',
      'Left concealed active door wash',
      'Left flush door release false', 'Left Burmester textured speaker grille', 'Left front seat adjustment controls',
      'Left interior window seal false', 'Left illuminated window switch panel', 'Left door courtesy lamp'],
    doorMountedExteriorPartNames: ['left mirror assembly', 'left mirror stalk', 'left door mirror sail mount', 'left mirror surface', 'Left Maybach mirror indicator'],
  },
  mirrorSystem: { left: true, right: true, interior: 'planar' },
  navigationDisplay: true,
  drivingSceneDisplay: { lanes: true, proximity: true },
  parkingCamera: { surroundView: true },
  exteriorLighting: MAYBACH_S680_LIGHTING_PROFILE,
  interiorAmbientLighting: MAYBACH_S680_AMBIENT_PROFILE,
  lampLayout: { frontHeight: .848, frontIndicatorHeight: .806, frontLateral: .662,
    rearTailHeight: .906, rearBrakeHeight: .878, rearIndicatorHeight: .846,
    rearReverseHeight: .884, mirrorRepeater: true },
  // A relaxed, slightly reclined executive driving position; the eye sits behind
  // a full-size wheel with the hood edge naturally cropped by the cowl.
  driverEyePosition: [-.43, 1.260, .200],
  instrumentCluster: { displayStyle: 'maybach-mbux', maximumSpeedKmh: 260, maximumRPM: 7000,
    redlineRPM: 6200, needleResponse: 12, featureClass: 'advanced' },
  // Independent floating instrument panel above the dash, not a curved screen.
  instrumentClusterTransform: { position: [-.43, 1.000, -.535], rotation: [rad(-6), 0, 0], scale: 1 },
  steeringWheelPosition: [-.43, .808, -.280], steeringColumnMountPosition: [-.43, .808-.350*Math.tan(rad(17)), -.630],
  steeringWheelRotation: [rad(-17), 0, 0],
  steeringWheelRadius: .170, steeringWheelRimTubeRadius: .0186,
  steeringWheelLockDegrees: 34 * 16.8 * 2,
  gearLeverPosition: [.13, .530, .300], gearLeverRotation: [rad(-8), 0, 0],
  dashboard: { position: [0, .850, -.740], dimensions: [1.64, .130, .400], tiltRadians: rad(-4) },
  cabin: { width: 1.70, dashboardTopY: .948, windshieldBottomY: .985, windshieldTopY: 1.470,
    windshieldBottomZ: -1.050, windshieldTopZ: -.400, roofY: 1.510 },
  body: { groundClearance: .145, wheelArchClearance: .045, profile: 'sedan', design: 'maybach-z223',
    sillY: .330, hoodTopY: .985, hoodLength: 1.550, trunkDeckY: .975, trunkLength: .700,
    roofWidth: 1.460, roofLength: 1.840, roofCenterZ: .520,
    color: 0x080c12, trimColor: 0x14181d, interiorColor: 0xd3bfa1 },
  leftMirrorTransform: { position: [-1.075, 1.030, -.960], mountPosition: [-.920, .975, -.980],
    rotation: [rad(-4), rad(17), 0], size: [.235, .115], housingDepth: .062 },
  rightMirrorTransform: { position: [1.075, 1.030, -.960], mountPosition: [.920, .975, -.980],
    rotation: [rad(-2), rad(-30), 0], size: [.235, .115], housingDepth: .062 },
  centerMirrorTransform: { position: [-.020, 1.302, -.348], rotation: [rad(5), rad(-13), 0],
    size: [.245, .070], housingDepth: .028, reflection: 'planar' },
};
