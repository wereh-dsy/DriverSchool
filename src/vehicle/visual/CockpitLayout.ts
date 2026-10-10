import type { VehicleVisualConfig, Vector3Tuple } from './VehicleVisualConfig';

// Geometry calibration only. Each family keeps its own cross-section, stack
// angle and passenger volume; these are not uniformly scaled cabin meshes.
const STRUCTURES = {
  'electric-fastback': { upperRise: 0, thickness: .04, cowlDepth: .12, consoleWidth: .28, consoleFrontZ: -.12, shoulder: .06, recessLip: .08, pillarRadius: .021 },
  'mid-supercar': { upperRise: .012, thickness: .038, cowlDepth: .13, consoleWidth: .25, consoleFrontZ: -.20, shoulder: .055, recessLip: .118, pillarRadius: .019 },
  executive: { upperRise: .105, thickness: .048, cowlDepth: .23, consoleWidth: .36, consoleFrontZ: -.12, shoulder: .110, recessLip: .094, pillarRadius: .023 },
  'road-suv': { upperRise: .095, thickness: .075, cowlDepth: .26, consoleWidth: .40, consoleFrontZ: -.22, shoulder: .12, recessLip: .130, pillarRadius: .028 },
  traditional: { upperRise: .025, thickness: .055, cowlDepth: .12, consoleWidth: .30, consoleFrontZ: -.10, shoulder: .070, recessLip: .118, pillarRadius: .023 },
  flow: { upperRise: .020, thickness: .045, cowlDepth: .14, consoleWidth: .28, consoleFrontZ: -.12, shoulder: .085, recessLip: .118, pillarRadius: .022 },
  formal: { upperRise: .030, thickness: .058, cowlDepth: .12, consoleWidth: .32, consoleFrontZ: -.10, shoulder: .060, recessLip: .118, pillarRadius: .024 },
  comfort: { upperRise: .035, thickness: .058, cowlDepth: .15, consoleWidth: .34, consoleFrontZ: -.12, shoulder: .100, recessLip: .118, pillarRadius: .023 },
  sport: { upperRise: .020, thickness: .044, cowlDepth: .13, consoleWidth: .28, consoleFrontZ: -.13, shoulder: .060, recessLip: .122, pillarRadius: .022 },
} as const;

// Only the two reference cabins opt into the new visible cross-section.
// Other families retain their current physical layout until visual acceptance.
const DRIVER_VIEW: Readonly<Record<string, {
  cowlRise: number; fasciaDrop: number; stackFlare: number;
  integration: { browThickness: number; browProjection: number; browRearDrop: number; shoulderRise: number; pedestalDrop: number } | null;
}>> = {
  'road-suv': { cowlRise: .140, fasciaDrop: .190, stackFlare: .10,
    integration: { browThickness: .004, browProjection: .016, browRearDrop: .014, shoulderRise: .026, pedestalDrop: .012 } },
  executive: { cowlRise: .115, fasciaDrop: .155, stackFlare: .12,
    integration: { browThickness: .004, browProjection: .024, browRearDrop: .006, shoulderRise: .008, pedestalDrop: .004 } },
};

export function cockpitStructuralAnchors(config: VehicleVisualConfig) {
  const family = config.body.design === 'mid-supercar' ? 'mid-supercar' : config.body.profile === 'sport-coupe' ? 'sport' : config.body.design ?? 'traditional';
  const structure = STRUCTURES[family];
  const driverView = DRIVER_VIEW[family] ?? null;
  const floorHeight = config.body.sillY - .10;
  const rearZ = config.dashboard.position[2] + config.dashboard.dimensions[2] * .5;
  const upperY = config.cabin.dashboardTopY + structure.upperRise;
  const cowlZ = config.cabin.windshieldBottomZ + structure.cowlDepth;
  const cowlY = driverView ? upperY - .015 : config.cabin.windshieldBottomY - .012;
  const boundaryY = config.cabin.windshieldBottomY + (driverView?.cowlRise ?? 0);
  const boundaryZ = config.cabin.windshieldBottomZ + (boundaryY - config.cabin.windshieldBottomY) *
    (config.cabin.windshieldTopZ - config.cabin.windshieldBottomZ) / (config.cabin.windshieldTopY - config.cabin.windshieldBottomY);
  const stackX = config.gearLeverPosition[0];
  const consoleHeight = config.gearLeverPosition[1] - .025;
  const passengerLeft = stackX + (structure.consoleWidth + (driverView?.stackFlare ?? 0)) * .5;
  const passengerRight = config.cabin.width * .5;
  const instrumentPlane = family === 'executive' ? .070 : .080;
  return {
    ...structure,
    driverView,
    windshieldLowerBoundary: [0, boundaryY, boundaryZ] as Vector3Tuple,
    driverEye: config.driverEyePosition,
    steeringWheelCenter: config.steeringWheelPosition,
    steeringColumnAnchor: config.steeringColumnMountPosition ?? [config.steeringWheelPosition[0],
      config.cabin.dashboardTopY - .08, config.dashboard.position[2] + .04] as Vector3Tuple,
    instrumentCenter: config.instrumentClusterTransform.position,
    instrumentPlane,
    instrumentRecessDepth: (structure.recessLip - instrumentPlane) * (config.instrumentClusterTransform.scale ?? 1),
    dashboardUpperFront: [0, cowlY, cowlZ] as Vector3Tuple,
    dashboardUpperRear: [0, upperY, rearZ] as Vector3Tuple,
    windshieldBase: [0, config.cabin.windshieldBottomY, config.cabin.windshieldBottomZ] as Vector3Tuple,
    windshieldTop: [0, config.cabin.windshieldTopY, config.cabin.windshieldTopZ] as Vector3Tuple,
    centerStackAnchor: [stackX, upperY - (driverView ? .020 : structure.thickness), rearZ] as Vector3Tuple,
    centerConsoleFront: [stackX, consoleHeight, structure.consoleFrontZ] as Vector3Tuple,
    centerConsoleHeight: consoleHeight,
    passengerDashAnchor: [(passengerLeft + passengerRight) * .5, upperY, rearZ] as Vector3Tuple,
    passengerDashDepth: rearZ - cowlZ,
    passengerLeft, passengerRight,
    gloveboxAnchor: [(passengerLeft + passengerRight) * .5, floorHeight + .28, rearZ - .05] as Vector3Tuple,
    doorTopHeight: config.cabin.windshieldBottomY + .025,
    floorHeight,
    tunnelCenter: [stackX, floorHeight, .35] as Vector3Tuple,
    tunnelHeight: consoleHeight - floorHeight,
  };
}

export type CockpitStructuralAnchors = ReturnType<typeof cockpitStructuralAnchors>;
