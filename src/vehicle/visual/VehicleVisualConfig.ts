import type { InstrumentClusterConfig } from './InstrumentCluster';
import {
  FAMILY_SEDAN_DIMENSIONS,
  SPORT_COUPE_DIMENSIONS,
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
  /** Visible reflective area, in metres. */
  readonly size: readonly [width: number, height: number];
  readonly housingDepth: number;
}

export interface VehicleVisualConfig {
  readonly name: string;
  readonly dimensions: VehicleDimensions;
  readonly vehicleWidth: number;
  readonly vehicleLength: number;
  /** Authored exterior envelope, including bumper fascias but excluding mirrors.
   * Contact geometry uses this independently of drivetrain calibration and
   * never derives a collider from visual triangles. Exterior tests keep it aligned.
   */
  readonly collisionDimensions: VehicleDimensions;
  readonly wheelBase: number;
  readonly trackWidth: number;
  readonly wheelRadius: number;
  readonly driverEyePosition: Vector3Tuple;
  /** Per-vehicle dial ranges; the cockpit still owns the actual instruments. */
  readonly instrumentCluster: InstrumentClusterConfig;
  readonly instrumentClusterTransform: VisualTransformConfig;
  readonly steeringWheelPosition: Vector3Tuple;
  readonly steeringWheelRotation: EulerTuple;
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
    readonly profile: 'sedan' | 'sport-coupe';
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
  steeringWheelPosition: [-0.37, 0.79, -0.28],
  steeringWheelRotation: [degrees(-9), 0, 0],
  steeringWheelRadius: 0.185,
  steeringWheelRimTubeRadius: 0.016,
  steeringWheelLockDegrees: 720,
  gearLeverPosition: [0.12, 0.49, 0.33],
  gearLeverRotation: [degrees(-9), 0, 0],
  leftMirrorTransform: {
    position: [-FAMILY_SEDAN_DIMENSIONS.width * 0.5 - 0.09, 1.02, -0.61],
    // True planar glass, parking-biased: expose the door trailing edge,
    // rear arch and boot-side corner in a narrow ~18% inner reference strip.
    rotation: [degrees(-0.7), degrees(16), 0],
    size: [0.215, 0.112],
    housingDepth: 0.045,
  },
  rightMirrorTransform: {
    position: [FAMILY_SEDAN_DIMENSIONS.width * 0.5 + 0.09, 1.02, -0.61],
    // The far mirror needs its own calibrated pitch, not a copy of the left.
    // ~17% real body reference; the rest shows the adjacent parking ground.
    rotation: [degrees(0.3), degrees(-28), 0],
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
  steeringWheelPosition: [-0.39, 0.72, -0.31],
  steeringWheelRotation: [degrees(-8), 0, 0],
  steeringWheelRadius: 0.18,
  steeringWheelRimTubeRadius: 0.015,
  steeringWheelLockDegrees: 780,
  gearLeverPosition: [0.11, 0.44, 0.3],
  gearLeverRotation: [degrees(-10), 0, 0],
  leftMirrorTransform: {
    position: [-SPORT_COUPE_DIMENSIONS.width * 0.5 - 0.095, 0.96, -0.58],
    rotation: [degrees(-1.7), degrees(18), 0],
    size: [0.22, 0.115],
    housingDepth: 0.043,
  },
  rightMirrorTransform: {
    position: [SPORT_COUPE_DIMENSIONS.width * 0.5 + 0.095, 0.96, -0.58],
    rotation: [degrees(-0.2), degrees(-30), 0],
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
