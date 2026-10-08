import type { InstrumentClusterConfig } from './InstrumentCluster';
import { EXECUTIVE_AMBIENT_PROFILE, EXECUTIVE_INSTRUMENT_PROFILE, EXECUTIVE_LIGHTING_PROFILE,
  type ExteriorLightingVisualProfile, type InteriorAmbientLightingProfile } from './LuxuryVisualProfile';
import type { SuspensionConfig } from '../config/VehiclePhysicsConfig';
import {
  FAMILY_SEDAN_DIMENSIONS,
  SPORT_COUPE_DIMENSIONS,
  FLOW_6AT_DIMENSIONS,
  FORMAL_DCT_DIMENSIONS,
  COMFORT_CVT_DIMENSIONS,
  EXECUTIVE_LWB_DIMENSIONS,
  ROAD_SUV_DIMENSIONS,
  type VehicleDimensions,
} from '../VehicleDimensions';

/**
 * Vehicle-local coordinate system used by every visual component:
 *
 *   +X right, +Y up, -Z forward, metres.
 *
 * The vehicle origin is on the ground, halfway between the front and rear
 * axles.  This matches Three.js' default camera convention (-Z is forward)
 * and keeps the cockpit, mirrors and exterior in one predictable frame.
 */
export type Vector3Tuple = readonly [x: number, y: number, z: number];
export type EulerTuple = readonly [x: number, y: number, z: number];

export interface VisualTransformConfig {
  readonly position: Vector3Tuple;
  /** XYZ Euler angles, in radians. */
  readonly rotation: EulerTuple;
  /** Optional uniform scale for cockpit fixtures such as the instrument binnacle. */
  readonly scale?: number;
}

export interface MirrorVisualConfig extends VisualTransformConfig {
  /** Door-front sail mounting point, independent of the adjustable optical plane. */
  readonly mountPosition?: Vector3Tuple;
  /** Visible reflective area, in metres. */
  readonly size: readonly [width: number, height: number];
  readonly housingDepth: number;
}

export interface VehicleVisualConfig {
  readonly parkingCamera?: { readonly surroundView: boolean };
  readonly windowGlass?: { readonly color: number; readonly windshieldOpacity: number; readonly windowOpacity: number };
  readonly automaticMirrorFold?: { readonly angleRadians: number; readonly response: number };
  readonly exteriorLighting?: ExteriorLightingVisualProfile;
  readonly interiorAmbientLighting?: InteriorAmbientLightingProfile;
  readonly name: string;
  readonly dimensions: VehicleDimensions;
  readonly vehicleWidth: number;
  readonly vehicleLength: number;
  /** Authored exterior envelope, including bumper fascias but excluding mirrors.
   * Contact geometry uses this independently of drivetrain calibration and
   * never derives a collider from visual triangles. Exterior tests keep it aligned.
   */
  readonly collisionDimensions: VehicleDimensions & {
    readonly groundClearance?: number;
    readonly bodyOffsetY?: number;
  };
  /** Derived from suspension rideHeight and the authored underfloor datum. */
  readonly staticBodyOffsetY?: number;
  readonly wheelBase: number;
  readonly trackWidth: number;
  readonly wheelRadius: number;
  readonly driverEyePosition: Vector3Tuple;
  /** Per-vehicle dial ranges; the cockpit still owns the actual instruments. */
  readonly instrumentCluster: InstrumentClusterConfig;
  readonly instrumentClusterTransform: VisualTransformConfig;
  readonly steeringWheelPosition: Vector3Tuple;
  readonly steeringColumnMountPosition?: Vector3Tuple;
  readonly steeringWheelRotation: EulerTuple;
  /** Torus centreline radius; outside radius also includes the grip tube. */
  readonly steeringWheelRadius: number;
  /** Cross-section radius of the steering-wheel grip. */
  readonly steeringWheelRimTubeRadius: number;
  /** Total steering-wheel travel from full left to full right, in degrees. */
  readonly steeringWheelLockDegrees: number;
  readonly gearLeverPosition: Vector3Tuple;
  readonly gearLeverRotation: EulerTuple;
  readonly leftMirrorTransform: MirrorVisualConfig;
  readonly rightMirrorTransform: MirrorVisualConfig;
  readonly dashboard: {
    readonly position: Vector3Tuple;
    readonly dimensions: Vector3Tuple;
    readonly tiltRadians: number;
  };
  readonly cabin: {
    readonly width: number;
    readonly dashboardTopY: number;
    readonly windshieldBottomY: number;
    readonly windshieldTopY: number;
    readonly windshieldBottomZ: number;
    readonly windshieldTopZ: number;
    readonly roofY: number;
  };
  readonly body: {
    /** Underfloor Y in the authored frame, before the shared chassis transform. */
    readonly groundClearance: number;
    /** Loaded tyre-to-arch gap; stance integration reserves compression travel. */
    readonly wheelArchClearance: number;
    /** Derived wheel centre in the authored body frame. */
    readonly wheelArchCenterY?: number;
    readonly profile: 'sedan' | 'sport-coupe' | 'suv';
    /** Optional saloon shape family; omitted preserves the original MT/GT geometry. */
    readonly design?: 'flow' | 'formal' | 'comfort' | 'executive' | 'road-suv';
    readonly sillY: number;
    readonly hoodTopY: number;
    readonly hoodLength: number;
    readonly trunkDeckY: number;
    readonly trunkLength: number;
    readonly roofWidth: number;
    readonly roofLength: number;
    readonly roofCenterZ: number;
    readonly color: number;
    readonly trimColor: number;
    readonly interiorColor: number;
  };
}

const degrees = (value: number): number => (value * Math.PI) / 180;

/**
 * A restrained, left-hand-drive C-segment family sedan.  These values are
 * deliberately ordinary rather than sports-car proportions, so the default
 * view gives a useful sense of width and bonnet length.
 */
export const DEFAULT_SEDAN_VISUAL_CONFIG: VehicleVisualConfig = {
  name: 'LHD family sedan',
  dimensions: FAMILY_SEDAN_DIMENSIONS,
  vehicleWidth: FAMILY_SEDAN_DIMENSIONS.width,
  vehicleLength: FAMILY_SEDAN_DIMENSIONS.length,
  collisionDimensions: FAMILY_SEDAN_DIMENSIONS,
  wheelBase: FAMILY_SEDAN_DIMENSIONS.wheelBase,
  trackWidth: FAMILY_SEDAN_DIMENSIONS.frontTrackWidth,
  wheelRadius: FAMILY_SEDAN_DIMENSIONS.wheelRadius,
  // A realistic upright road-car eye point, moved slightly rearward and up
  // from the early prototype so the cowl no longer dominates the view.
  driverEyePosition: [-0.37, 1.245, 0.31],
  instrumentCluster: {
    maximumSpeedKmh: 220,
    maximumRPM: 7_000,
    redlineRPM: 6_000,
    needleResponse: 13,
    displayStyle: 'dual-analog',
  },
  instrumentClusterTransform: {
    // Keep the important readouts above the wheel while the binnacle itself
    // stays below the windscreen sight line.
    position: [-0.37, 0.97, -0.405],
    rotation: [degrees(-7), 0, 0],
  },
  // A 370 mm wheel remains full-sized; visibility comes from a plausible
  // driving position and column placement rather than shrinking the rim.
  steeringWheelPosition: [-0.37, 0.79, -0.245],
  steeringColumnMountPosition: [-0.37, 0.72, -0.52],
  steeringWheelRotation: [degrees(-15), 0, 0],
  // Torus centreline radius + grip radius = 185 mm (370 mm outside diameter).
  steeringWheelRadius: 0.169,
  steeringWheelRimTubeRadius: 0.016,
  steeringWheelLockDegrees: 720,
  gearLeverPosition: [0.12, 0.49, 0.33],
  gearLeverRotation: [degrees(-9), 0, 0],
  leftMirrorTransform: {
    position: [-FAMILY_SEDAN_DIMENSIONS.width * 0.5 - 0.09, 0.94, -0.64],
    mountPosition: [-FAMILY_SEDAN_DIMENSIONS.width * 0.48, 0.875, -0.655],
    // True planar glass, parking-biased: expose the door trailing edge,
    // rear arch and boot-side corner in a narrow ~15% inner reference strip.
    rotation: [degrees(-5.7), degrees(15.8), 0],
    size: [0.215, 0.112],
    housingDepth: 0.045,
  },
  rightMirrorTransform: {
    position: [FAMILY_SEDAN_DIMENSIONS.width * 0.5 + 0.09, 0.94, -0.64],
    mountPosition: [FAMILY_SEDAN_DIMENSIONS.width * 0.48, 0.875, -0.655],
    // The far mirror needs its own calibrated pitch, not a copy of the left.
    // ~19% real body reference; the rest shows the adjacent parking ground.
    rotation: [degrees(-2.7), degrees(-27.5), 0],
    size: [0.215, 0.112],
    housingDepth: 0.045,
  },
  dashboard: {
    position: [0, 0.75, -0.56],
    dimensions: [1.56, 0.075, 0.34],
    tiltRadians: degrees(-5),
  },
  cabin: {
    width: 1.56,
    dashboardTopY: 0.8,
    windshieldBottomY: 0.83,
    windshieldTopY: 1.56,
    windshieldBottomZ: -0.72,
    windshieldTopZ: -0.39,
    roofY: FAMILY_SEDAN_DIMENSIONS.height - 0.035,
  },
  body: {
    groundClearance: .2,
    wheelArchClearance: .075,
    profile: 'sedan',
    sillY: 0.34,
    hoodTopY: 0.79,
    hoodLength: 1.18,
    trunkDeckY: 0.78,
    trunkLength: 0.83,
    roofWidth: 1.43,
    roofLength: 1.46,
    roofCenterZ: 0.34,
    color: 0x315f73,
    trimColor: 0x111820,
    interiorColor: 0x24272b,
  },
};

/** Low, wide two-door proportions for the higher-output vehicle preset. */
export const SPORTS_COUPE_VISUAL_CONFIG: VehicleVisualConfig = {
  name: 'LHD grand-touring sports coupe',
  dimensions: SPORT_COUPE_DIMENSIONS,
  vehicleWidth: SPORT_COUPE_DIMENSIONS.width,
  vehicleLength: SPORT_COUPE_DIMENSIONS.length,
  collisionDimensions: SPORT_COUPE_DIMENSIONS,
  wheelBase: SPORT_COUPE_DIMENSIONS.wheelBase,
  trackWidth: SPORT_COUPE_DIMENSIONS.frontTrackWidth,
  wheelRadius: SPORT_COUPE_DIMENSIONS.wheelRadius,
  // The coupe remains lower than the sedan, but no longer places the camera
  // down behind its cowl as if the seat were fully collapsed.
  driverEyePosition: [-0.39, 1.175, 0.24],
  instrumentCluster: {
    maximumSpeedKmh: 280,
    maximumRPM: 8_000,
    redlineRPM: 7_350,
    needleResponse: 14,
    displayStyle: 'sport-tft',
  },
  instrumentClusterTransform: {
    // The compact TFT is low-set but its primary band still clears the rim.
    position: [-0.39, 0.91, -0.43],
    rotation: [degrees(-7), 0, 0],
    scale: 0.88,
  },
  // The lower adjustable-column setting keeps the upper rim below the GT
  // display's gear, speed and auxiliary readouts at the raised eye point.
  steeringWheelPosition: [-0.39, 0.72, -0.275],
  steeringColumnMountPosition: [-0.39, 0.65, -0.55],
  steeringWheelRotation: [degrees(-14), 0, 0],
  steeringWheelRadius: 0.17,
  steeringWheelRimTubeRadius: 0.015,
  steeringWheelLockDegrees: 780,
  gearLeverPosition: [0.11, 0.44, 0.3],
  gearLeverRotation: [degrees(-10), 0, 0],
  leftMirrorTransform: {
    position: [-SPORT_COUPE_DIMENSIONS.width * 0.5 - 0.095, 0.885, -0.64],
    mountPosition: [-SPORT_COUPE_DIMENSIONS.width * 0.48, 0.83, -0.655],
    rotation: [degrees(-1.7), degrees(16.6), 0],
    size: [0.22, 0.115],
    housingDepth: 0.043,
  },
  rightMirrorTransform: {
    position: [SPORT_COUPE_DIMENSIONS.width * 0.5 + 0.095, 0.885, -0.64],
    mountPosition: [SPORT_COUPE_DIMENSIONS.width * 0.48, 0.83, -0.655],
    rotation: [degrees(-0.2), degrees(-28.6), 0],
    size: [0.22, 0.115],
    housingDepth: 0.043,
  },
  dashboard: {
    position: [0, 0.7, -0.58],
    dimensions: [1.63, 0.075, 0.34],
    tiltRadians: degrees(-6),
  },
  cabin: {
    width: 1.63,
    dashboardTopY: 0.76,
    windshieldBottomY: 0.785,
    windshieldTopY: 1.44,
    windshieldBottomZ: -0.73,
    windshieldTopZ: -0.37,
    roofY: SPORT_COUPE_DIMENSIONS.height - 0.028,
  },
  body: {
    groundClearance: .18,
    wheelArchClearance: .055,
    profile: 'sport-coupe',
    sillY: 0.3,
    hoodTopY: 0.73,
    hoodLength: 1.42,
    trunkDeckY: 0.7,
    trunkLength: 0.67,
    roofWidth: 1.4,
    roofLength: 1.28,
    roofCenterZ: 0.28,
    color: 0xa51f2b,
    trimColor: 0x090b0e,
    interiorColor: 0x17191d,
  },
};

/** Friendly camel-case alias for application code. */
export const defaultSedanVisualConfig = DEFAULT_SEDAN_VISUAL_CONFIG;
export const sportsCoupeVisualConfig = SPORTS_COUPE_VISUAL_CONFIG;

/** Share construction, not dimensions or anchors, between the three automatics. */
const automaticEnvelope = (dimensions: VehicleDimensions): Pick<VehicleVisualConfig,
  'dimensions' | 'collisionDimensions' | 'vehicleWidth' | 'vehicleLength' | 'wheelBase' | 'trackWidth' | 'wheelRadius'> => ({
  dimensions, collisionDimensions: dimensions, vehicleWidth: dimensions.width, vehicleLength: dimensions.length,
  wheelBase: dimensions.wheelBase, trackWidth: dimensions.frontTrackWidth, wheelRadius: dimensions.wheelRadius,
});

const automaticMirrors = (dimensions: VehicleDimensions, y: number, z: number): Pick<VehicleVisualConfig,
  'leftMirrorTransform' | 'rightMirrorTransform'> => ({
  leftMirrorTransform: { ...DEFAULT_SEDAN_VISUAL_CONFIG.leftMirrorTransform,
    position: [-dimensions.width * .5 - .09, y, z], mountPosition: [-dimensions.width * .46, y - .075, z] },
  rightMirrorTransform: { ...DEFAULT_SEDAN_VISUAL_CONFIG.rightMirrorTransform,
    position: [dimensions.width * .5 + .09, y, z], mountPosition: [dimensions.width * .46, y - .075, z] },
});

/** Low nose, swept glass, supported chassis; retain the central-tachometer face. */
export const TEST_6AT_VISUAL_CONFIG: VehicleVisualConfig = {
  ...DEFAULT_SEDAN_VISUAL_CONFIG,
  ...automaticEnvelope(FLOW_6AT_DIMENSIONS), ...automaticMirrors(FLOW_6AT_DIMENSIONS, .905, -.68),
  name: 'Flow 2.0 / 6AT sedan',
  driverEyePosition: [-.37, 1.205, .31],
  instrumentClusterTransform: { position: [-.37, .93, -.415], rotation: [degrees(-7), 0, 0] },
  steeringWheelPosition: [-.37, .775, -.245], steeringColumnMountPosition: [-.37, .70, -.52],
  steeringWheelRadius: .166, steeringWheelLockDegrees: 33 * 15.2 * 2,
  gearLeverPosition: [.13, .455, .30],
  dashboard: { position: [0, .73, -.565], dimensions: [1.54, .065, .32], tiltRadians: degrees(-6) },
  cabin: { width: 1.54, dashboardTopY: .78, windshieldBottomY: .815, windshieldTopY: 1.415,
    windshieldBottomZ: -.76, windshieldTopZ: -.42, roofY: FLOW_6AT_DIMENSIONS.height - .035 },
  instrumentCluster: {
    maximumSpeedKmh: 220,
    maximumRPM: 7_000,
    redlineRPM: 6_500,
    needleResponse: 11,
    displayStyle: 'cx4-tach-wing',
  },
  body: { ...DEFAULT_SEDAN_VISUAL_CONFIG.body, design: 'flow', wheelArchClearance: .078, sillY: .32, hoodTopY: .765,
    hoodLength: 1.30, trunkDeckY: .755, trunkLength: 1.03, roofWidth: 1.35,
    roofLength: 1.42, roofCenterZ: .14, color: 0x9e2733, interiorColor: 0x20232a },
};

/** Square three-box saloon; retain twin mechanical dials / dark centre screen. */
export const TEST_7DCT_VISUAL_CONFIG: VehicleVisualConfig = {
  ...DEFAULT_SEDAN_VISUAL_CONFIG,
  ...automaticEnvelope(FORMAL_DCT_DIMENSIONS), ...automaticMirrors(FORMAL_DCT_DIMENSIONS, .925, -.64),
  name: 'Formal 1.4T / 7DCT sedan',
  driverEyePosition: [-.37, 1.215, .31],
  instrumentClusterTransform: { position: [-.37, .94, -.405], rotation: [degrees(-7), 0, 0] },
  steeringWheelPosition: [-.37, .78, -.245], steeringColumnMountPosition: [-.37, .71, -.52],
  steeringWheelRadius: .174,
  steeringWheelLockDegrees: 32 * 16.6 * 2, gearLeverPosition: [.12, .465, .32],
  dashboard: { position: [0, .74, -.57], dimensions: [1.56, .085, .35], tiltRadians: degrees(-3) },
  cabin: { width: 1.56, dashboardTopY: .80, windshieldBottomY: .84, windshieldTopY: 1.44,
    windshieldBottomZ: -.72, windshieldTopZ: -.43, roofY: FORMAL_DCT_DIMENSIONS.height - .035 },
  instrumentCluster: {
    maximumSpeedKmh: 240,
    maximumRPM: 7_000,
    redlineRPM: 6_200,
    needleResponse: 12,
    displayStyle: 'jetta-twin-dial',
  },
  body: { ...DEFAULT_SEDAN_VISUAL_CONFIG.body, design: 'formal', wheelArchClearance: .08, sillY: .34, hoodTopY: .805,
    hoodLength: 1.29, trunkDeckY: .80, trunkLength: 1.04, roofWidth: 1.43,
    roofLength: 1.50, roofCenterZ: .17, color: 0x607786, interiorColor: 0x292b2e },
};

export const CVT_SEDAN_VISUAL_CONFIG: VehicleVisualConfig = {
  ...DEFAULT_SEDAN_VISUAL_CONFIG, name: '2.0 belt CVT family sedan',
  ...automaticEnvelope(COMFORT_CVT_DIMENSIONS), ...automaticMirrors(COMFORT_CVT_DIMENSIONS, .94, -.67),
  driverEyePosition: [-.37, 1.225, .31],
  instrumentClusterTransform: { position: [-.37, .95, -.415], rotation: [degrees(-7), 0, 0] },
  steeringWheelPosition: [-.37, .79, -.245], steeringColumnMountPosition: [-.37, .72, -.53],
  steeringWheelRadius: .176, steeringWheelLockDegrees: 33 * 17.1 * 2,
  gearLeverPosition: [.12, .46, .30],
  dashboard: { position: [0, .745, -.58], dimensions: [1.58, .08, .37], tiltRadians: degrees(-5) },
  cabin: { width: 1.58, dashboardTopY: .81, windshieldBottomY: .85, windshieldTopY: 1.45,
    windshieldBottomZ: -.75, windshieldTopZ: -.48, roofY: COMFORT_CVT_DIMENSIONS.height - .035 },
  body: { ...DEFAULT_SEDAN_VISUAL_CONFIG.body, design: 'comfort', wheelArchClearance: .095, sillY: .35, hoodTopY: .825,
    hoodLength: 1.23, trunkDeckY: .79, trunkLength: .98, roofWidth: 1.45,
    roofLength: 1.66, roofCenterZ: .13, color: 0xc7c9c4, interiorColor: 0x3c3935 },
  instrumentCluster: { ...DEFAULT_SEDAN_VISUAL_CONFIG.instrumentCluster, maximumRPM: 7000, redlineRPM: 6250 },
};

/** Calibrate the existing authored body once; dimensions and wheel anchors stay intact. */
export function withSuspensionStance(config: VehicleVisualConfig, suspension: SuspensionConfig): VehicleVisualConfig {
  const staticBodyOffsetY = suspension.rideHeight - config.body.groundClearance;
  return {
    ...config,
    staticBodyOffsetY,
    collisionDimensions: { ...config.collisionDimensions,
      groundClearance: config.body.groundClearance, bodyOffsetY: staticBodyOffsetY },
    body: { ...config.body,
      wheelArchCenterY: config.dimensions.wheelRadius - staticBodyOffsetY,
      wheelArchClearance: Math.max(config.body.wheelArchClearance, suspension.suspensionTravel * .5 + .005) },
  };
}

/** Broad, restrained executive cabin on a true long-wheelbase envelope. */
export const EXECUTIVE_SEDAN_VISUAL_CONFIG: VehicleVisualConfig = {
  parkingCamera: { surroundView: true },
  ...DEFAULT_SEDAN_VISUAL_CONFIG,
  ...automaticEnvelope(EXECUTIVE_LWB_DIMENSIONS), ...automaticMirrors(EXECUTIVE_LWB_DIMENSIONS, .955, -.81),
  name: 'A6L-inspired long-wheelbase executive sedan',
  windowGlass: { color: 0x737d85, windshieldOpacity: .18, windowOpacity: .32 },
  automaticMirrorFold: { angleRadians: degrees(60), response: 4.8 },
  exteriorLighting: EXECUTIVE_LIGHTING_PROFILE,
  interiorAmbientLighting: EXECUTIVE_AMBIENT_PROFILE,
  driverEyePosition: [-.40, 1.235, .30],
  // Keep the broad display behind the visor lip and naturally ahead of the wheel.
  instrumentClusterTransform: { position: [-.40, .96, -.485], rotation: [degrees(-7), 0, 0], scale: 1.22 },
  instrumentCluster: { maximumSpeedKmh: 280, maximumRPM: 7000, redlineRPM: 6400,
    needleResponse: 12, displayStyle: 'executive-virtual', featureClass: 'advanced', visualProfile: EXECUTIVE_INSTRUMENT_PROFILE },
  steeringWheelPosition: [-.40, .755, -.245], steeringColumnMountPosition: [-.40, .668, -.57],
  steeringWheelRadius: .17, steeringWheelRimTubeRadius: .019,
  steeringWheelLockDegrees: 32 * 17.5 * 2,
  gearLeverPosition: [.13, .47, .34],
  dashboard: { position: [0, .75, -.64], dimensions: [1.67, .075, .39], tiltRadians: degrees(-3) },
  cabin: { width: 1.67, dashboardTopY: .81, windshieldBottomY: .85, windshieldTopY: 1.44,
    windshieldBottomZ: -.91, windshieldTopZ: -.57, roofY: EXECUTIVE_LWB_DIMENSIONS.height - .035 },
  body: { ...DEFAULT_SEDAN_VISUAL_CONFIG.body, design: 'executive', groundClearance: .20,
    wheelArchClearance: .095, sillY: .34, hoodTopY: .80, hoodLength: 1.60,
    trunkDeckY: .81, trunkLength: 1.12, roofWidth: 1.46,
    roofLength: 1.72, roofCenterZ: .29, color: 0x27313f, trimColor: 0x12171f, interiorColor: 0x242326 },
};

/** Upright SUV cabin with basic analog instruments and existing cockpit fixtures. */
export const ROAD_SUV_VISUAL_CONFIG: VehicleVisualConfig = {
  ...DEFAULT_SEDAN_VISUAL_CONFIG,
  ...automaticEnvelope(ROAD_SUV_DIMENSIONS), ...automaticMirrors(ROAD_SUV_DIMENSIONS, 1.18, -.89),
  name: 'Touareg-like 3.0T V6 / 8AT road SUV',
  driverEyePosition: [-.42, 1.49, .36],
  instrumentCluster: { maximumSpeedKmh: 260, maximumRPM: 7000, redlineRPM: 6400,
    needleResponse: 11, displayStyle: 'dual-analog' },
  instrumentClusterTransform: { position: [-.42, 1.20, -.46], rotation: [degrees(-7), 0, 0] },
  steeringWheelPosition: [-.42, 1.02, -.255], steeringColumnMountPosition: [-.42, .935, -.57],
  steeringWheelRadius: .173, steeringWheelRimTubeRadius: .018,
  steeringWheelLockDegrees: 33 * 17.8 * 2,
  gearLeverPosition: [.14, .70, .32],
  dashboard: { position: [0, .99, -.67], dimensions: [1.73, .09, .39], tiltRadians: degrees(-4) },
  cabin: { width: 1.73, dashboardTopY: 1.06, windshieldBottomY: 1.10, windshieldTopY: 1.66,
    windshieldBottomZ: -.96, windshieldTopZ: -.60, roofY: 1.705 },
  body: { ...DEFAULT_SEDAN_VISUAL_CONFIG.body, profile: 'suv', design: 'road-suv',
    groundClearance: .215, wheelArchClearance: .115, sillY: .47,
    hoodTopY: 1.06, hoodLength: 1.34, trunkDeckY: 1.10, trunkLength: .18,
    roofWidth: 1.58, roofLength: 2.66, roofCenterZ: .71,
    color: 0x566575, trimColor: 0x161c23, interiorColor: 0x2d3033 },
};
