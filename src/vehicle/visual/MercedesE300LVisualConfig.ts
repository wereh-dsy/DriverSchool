import { MERCEDES_E300L_DIMENSIONS as d } from '../VehicleDimensions';
import { DEFAULT_SEDAN_VISUAL_CONFIG, type VehicleVisualConfig } from './VehicleVisualConfig';
import type { ExteriorLightingVisualProfile, InteriorAmbientLightingProfile } from './LuxuryVisualProfile';

const rad = (v: number): number => v * Math.PI / 180;

/**
 * Digital-LED style optics: warm-white low beam, cooler main beam, amber
 * indicators. All free-standing lens meshes are driven by the shared lighting
 * controller through their `lightingKey`; this profile only calibrates output.
 */
export const MERCEDES_E300L_LIGHTING_PROFILE: ExteriorLightingVisualProfile = {
  signature: 'authored-led', color: 0xeff4ff,
  low: { intensity: 620, distance: 88, angle: .60, targetY: -.30, targetZ: -42 },
  high: { intensity: 1260, distance: 168, angle: .26, targetY: .26, targetZ: -118 },
  penumbra: .62, decay: 1.15, retainLowBeamOnHigh: true,
  autoOffWithIgnition: true, welcomeSeconds: .9, sequentialTurnSeconds: .22,
  lowLensIntensity: 1.0, positionLensIntensity: 1.15, highLensIntensity: 1.45,
  turnLensIntensity: 2.8, turnLensHeight: .020, turnColor: 0xff8b1a, turnSpillIntensity: .85,
};

/** Restrained blue-violet cabin illumination, the marque's night signature. */
export const MERCEDES_E300L_AMBIENT_PROFILE: InteriorAmbientLightingProfile = {
  color: 0x7c86e0, dayIntensity: .010, nightIntensity: .30, fadeResponse: 4.4,
  footwellIntensity: .050, dashboardFillIntensity: .060, steeringBadge: 'mercedes-star',
};

/**
 * Visual datum for the 2026 V214 E 300 L. Every anchor below is derived from the
 * shared MERCEDES_E300L_DIMENSIONS envelope: wheel arches, wheel centres, the
 * cockpit, mirrors and the collision body all read from the same numbers.
 */
export const MERCEDES_E300L_VISUAL_CONFIG: VehicleVisualConfig = {
  ...DEFAULT_SEDAN_VISUAL_CONFIG,
  name: 'Mercedes-Benz E 300 L V214',
  dimensions: d, collisionDimensions: d, vehicleWidth: d.width, vehicleLength: d.length,
  wheelBase: d.wheelBase, trackWidth: d.frontTrackWidth, wheelRadius: d.wheelRadius,
  windowGlass: { color: 0x5b6a73, windshieldOpacity: .21, windowOpacity: .30 },
  mirrorSystem: { left: true, right: true, interior: 'planar' },
  navigationDisplay: true,
  drivingSceneDisplay: { lanes: true, proximity: true },
  parkingCamera: { surroundView: true },
  exteriorLighting: MERCEDES_E300L_LIGHTING_PROFILE,
  interiorAmbientLighting: MERCEDES_E300L_AMBIENT_PROFILE,
  lampLayout: { frontHeight: .848, frontIndicatorHeight: .806, frontLateral: .662,
    rearTailHeight: .906, rearBrakeHeight: .878, rearIndicatorHeight: .846,
    rearReverseHeight: .884, mirrorRepeater: true },
  // A relaxed, slightly reclined executive driving position; the eye sits behind
  // a full-size wheel with the hood edge naturally cropped by the cowl.
  driverEyePosition: [-.42, 1.243, .300],
  instrumentCluster: { displayStyle: 'mercedes-mbux', maximumSpeedKmh: 260, maximumRPM: 7000,
    redlineRPM: 6250, needleResponse: 12, featureClass: 'advanced' },
  // Independent floating instrument panel above the dash, not a curved screen.
  instrumentClusterTransform: { position: [-.40, .905, -.638], rotation: [rad(5), 0, 0], scale: 1 },
  steeringWheelPosition: [-.40, .772, -.300], steeringColumnMountPosition: [-.40, .688, -.660],
  steeringWheelRotation: [rad(-17), 0, 0],
  steeringWheelRadius: .170, steeringWheelRimTubeRadius: .0186,
  steeringWheelLockDegrees: 34 * 15.9 * 2,
  gearLeverPosition: [.13, .530, .300], gearLeverRotation: [rad(-8), 0, 0],
  dashboard: { position: [0, .850, -.740], dimensions: [1.64, .130, .400], tiltRadians: rad(-4) },
  cabin: { width: 1.64, dashboardTopY: .948, windshieldBottomY: .955, windshieldTopY: 1.440,
    windshieldBottomZ: -.925, windshieldTopZ: -.325, roofY: 1.478 },
  body: { groundClearance: .148, wheelArchClearance: .045, profile: 'sedan', design: 'mercedes-v214',
    sillY: .330, hoodTopY: .945, hoodLength: 1.550, trunkDeckY: .945, trunkLength: .700,
    roofWidth: 1.420, roofLength: 1.460, roofCenterZ: .400,
    color: 0x1d252e, trimColor: 0x14181d, interiorColor: 0xbf9468 },
  leftMirrorTransform: { position: [-1.030, 1.006, -.860], mountPosition: [-.884, .946, -.872],
    rotation: [rad(-4), rad(17), 0], size: [.235, .115], housingDepth: .062 },
  rightMirrorTransform: { position: [1.030, 1.006, -.860], mountPosition: [.884, .946, -.872],
    rotation: [rad(-2), rad(-30), 0], size: [.235, .115], housingDepth: .062 },
  centerMirrorTransform: { position: [-.020, 1.302, -.348], rotation: [rad(5), rad(-13), 0],
    size: [.245, .070], housingDepth: .028, reflection: 'planar' },
};
