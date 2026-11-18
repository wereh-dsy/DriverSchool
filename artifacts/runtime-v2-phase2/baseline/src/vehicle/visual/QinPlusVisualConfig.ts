import { QIN_PLUS_DMI_DIMENSIONS as d } from '../config/qinPlusDmiPhysicsConfig';
import { DEFAULT_SEDAN_VISUAL_CONFIG, type VehicleVisualConfig } from './VehicleVisualConfig';

export const QIN_PLUS_DMI_VISUAL_CONFIG: VehicleVisualConfig = {
  ...DEFAULT_SEDAN_VISUAL_CONFIG, name: '2026 Qin PLUS DM-i 210KM 进取型', dimensions: d,
  vehicleLength: d.length, vehicleWidth: d.width, collisionDimensions: { ...d, groundClearance: .145 },
  wheelBase: d.wheelBase, trackWidth: d.frontTrackWidth, wheelRadius: d.wheelRadius,
  driverEyePosition: [-.37, 1.19, .32], navigationDisplay: false,
  instrumentCluster: { maximumSpeedKmh: 200, maximumRPM: 6500, redlineRPM: 6200,
    needleResponse: 12, displayStyle: 'qin-ehs', featureClass: 'advanced' },
  instrumentClusterTransform: { position: [-.37, 1.075, -.53], rotation: [-.10, 0, 0] },
  steeringWheelPosition: [-.37, .89, -.16], steeringWheelRadius: .174, steeringWheelRimTubeRadius: .016,
  steeringWheelLockDegrees: 900, gearLeverPosition: [.05, .66, .18],
  dashboard: { position: [0, .90, -.69], dimensions: [1.58, .17, .40], tiltRadians: -.03 },
  cabin: { width: 1.60, dashboardTopY: 1.01, windshieldBottomY: 1.045, windshieldTopY: 1.43,
    windshieldBottomZ: -.98, windshieldTopZ: -.50, roofY: 1.49 },
  leftMirrorTransform: { position: [-1.006, 1.025, -.78], mountPosition: [-.88, 1.005, -.81],
    rotation: [0, .18, 0], size: [.19, .115], housingDepth: .085 },
  rightMirrorTransform: { position: [1.006, 1.025, -.78], mountPosition: [.88, 1.005, -.81],
    rotation: [0, -.18, 0], size: [.19, .115], housingDepth: .085 },
  windowGlass: { color: 0x889ca0, windshieldOpacity: .12, windowOpacity: .20 },
  lampLayout: { frontHeight: .80, frontIndicatorHeight: .765, frontLateral: .70,
    rearTailHeight: .91, rearBrakeHeight: .91, rearIndicatorHeight: .86, rearReverseHeight: .54 },
  body: { ...DEFAULT_SEDAN_VISUAL_CONFIG.body, design: 'qin-plus', groundClearance: .145,
    wheelArchClearance: .07, sillY: .37, hoodTopY: .89, hoodLength: 1.38,
    trunkDeckY: .97, trunkLength: .61, roofWidth: 1.37, roofLength: 1.88, roofCenterZ: .43,
    color: 0x7d938b, trimColor: 0x172428, interiorColor: 0xd1c7b4 },
};
