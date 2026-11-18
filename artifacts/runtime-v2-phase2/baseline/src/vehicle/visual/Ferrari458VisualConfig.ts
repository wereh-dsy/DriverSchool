import { FERRARI_458_DIMENSIONS as dimensions } from '../VehicleDimensions';
import type { VehicleVisualConfig } from './VehicleVisualConfig';

const degrees = (n: number) => n * Math.PI / 180;
export const FERRARI_458_VISUAL_CONFIG: VehicleVisualConfig = {
  name: 'Ferrari 458 Italia', dimensions, collisionDimensions: dimensions,
  vehicleWidth: dimensions.width, vehicleLength: dimensions.length, wheelBase: dimensions.wheelBase,
  trackWidth: dimensions.frontTrackWidth, wheelRadius: dimensions.wheelRadius,
  driverEyePosition: [-.38, .99, -.03],
  instrumentCluster: { displayStyle: 'supercar-tach', featureClass: 'advanced', maximumRPM: 10000,
    redlineRPM: 9000, maximumSpeedKmh: 340, needleResponse: 18 },
  instrumentClusterTransform: { position: [-.38, .80, -.77], rotation: [degrees(-6), 0, 0], scale: .94 },
  steeringWheelPosition: [-.38, .615, -.465], steeringColumnMountPosition: [-.38, .55, -.755],
  steeringWheelRotation: [degrees(-13), 0, 0], steeringWheelRadius: .160, steeringWheelRimTubeRadius: .015,
  steeringWheelLockDegrees: 714, gearLeverPosition: [.12, .49, .12], gearLeverRotation: [0, 0, 0],
  leftMirrorTransform: { position: [-1.03, .83, -1.04], mountPosition: [-.91, .765, -1.055],
    rotation: [degrees(-6), degrees(16), 0], size: [.20, .105], housingDepth: .04 },
  rightMirrorTransform: { position: [1.03, .83, -1.04], mountPosition: [.91, .765, -1.055],
    rotation: [degrees(-3), degrees(-27), 0], size: [.20, .105], housingDepth: .04 },
  dashboard: { position: [0, .65, -.87], dimensions: [1.50, .055, .24], tiltRadians: degrees(-5) },
  cabin: { width: 1.50, dashboardTopY: .695, windshieldBottomY: .735, windshieldTopY: 1.17,
    windshieldBottomZ: -1.12, windshieldTopZ: -.48, roofY: 1.178 },
  body: { profile: 'sport-coupe', design: 'mid-supercar', groundClearance: .115, wheelArchClearance: .045,
    sillY: .28, hoodTopY: .66, hoodLength: 1.0, trunkDeckY: .77, trunkLength: 1.06,
    roofWidth: 1.24, roofLength: 1.02, roofCenterZ: -.04, color: 0xbc1820, trimColor: 0x121417,
    interiorColor: 0x242227 },
};
