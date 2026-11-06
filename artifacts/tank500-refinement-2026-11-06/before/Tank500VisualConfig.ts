import { TANK500_HI4T_DIMENSIONS as dimensions } from '../config/tank500Hi4TPhysicsConfig';
import { ROAD_SUV_VISUAL_CONFIG, type VehicleVisualConfig } from './VehicleVisualConfig';

export const TANK500_HI4T_VISUAL_CONFIG: VehicleVisualConfig = {
  ...ROAD_SUV_VISUAL_CONFIG, name: 'Tank 500 Hi4-T · body-on-frame P2', dimensions,
  collisionDimensions: { ...dimensions, groundClearance: .224 }, vehicleLength: dimensions.length,
  vehicleWidth: dimensions.width, wheelBase: dimensions.wheelBase, trackWidth: dimensions.frontTrackWidth,
  wheelRadius: dimensions.wheelRadius, driverEyePosition: [-.43, 1.57, .32],
  instrumentCluster: { maximumSpeedKmh: 220, maximumRPM: 7000, redlineRPM: 6400,
    needleResponse: 12, displayStyle: 'tank-hybrid', featureClass: 'advanced' },
  instrumentClusterTransform: { position: [-.43, 1.245, -.62], rotation: [-.12, 0, 0] },
  steeringWheelPosition: [-.43, 1.08, -.27], steeringColumnMountPosition: [-.43, 1.08-.34*Math.tan(Math.PI/12), -.61],
  steeringWheelLockDegrees: 2 * .59 * 18.5 * 180 / Math.PI,
  gearLeverPosition: [.14, .80, .25],
  dashboard: { position: [0, 1.12, -.72], dimensions: [1.76, .14, .40], tiltRadians: -.04 },
  cabin: { width: 1.76, dashboardTopY: 1.24, windshieldBottomY: 1.27, windshieldTopY: 1.79,
    windshieldBottomZ: -1.05, windshieldTopZ: -.68, roofY: 1.835 },
  leftMirrorTransform: { position: [-1.075, 1.29, -.87], mountPosition: [-.95, 1.23, -.90],
    rotation: [0, .18, 0], size: [.23, .16], housingDepth: .11 },
  rightMirrorTransform: { position: [1.075, 1.29, -.87], mountPosition: [.95, 1.23, -.90],
    rotation: [0, -.18, 0], size: [.23, .16], housingDepth: .11 },
  body: { ...ROAD_SUV_VISUAL_CONFIG.body, design: 'tank-500', groundClearance: .224,
    wheelArchClearance: .13, sillY: .48, hoodTopY: 1.22, hoodLength: 1.35,
    trunkDeckY: 1.25, roofWidth: 1.70, roofLength: 2.78, roofCenterZ: .55,
    color: 0xc5b8a2, trimColor: 0x202529, interiorColor: 0x725547 },
};
