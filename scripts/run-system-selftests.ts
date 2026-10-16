import { runVehiclePlatformFoundationSelfTest } from '../src/vehicle/VehiclePlatformFoundation.selftest';
import { runNavigationSelfTest } from '../src/world/navigation/Navigation.selftest';
import { runNavigationDisplaysSelfTest } from '../src/vehicle/visual/NavigationDisplays.selftest';
import { runEVPlatformV2SelfTest } from '../src/vehicle/powertrain/EVPlatformV2.selftest';
import { runTyreThermalPressureSelfTest } from '../src/vehicle/physics/TyreThermalPressure.selftest';
import { runTPMSDisplaysSelfTest } from '../src/vehicle/visual/TPMSDisplays.selftest';
import { runTaycanDisplaysSelfTest } from '../src/vehicle/visual/TaycanDisplays.selftest';
import { runBMW530LiSelfTest } from '../src/vehicle/visual/BMW530Li.selftest';
import { runBMW530FrontCabinSelfTest } from '../src/vehicle/visual/BMW530FrontCabin.selftest';
import { runDrivingSceneDisplaySelfTest } from '../src/vehicle/visual/DrivingSceneDisplayContext.selftest';
import { runHudVehicleLoadingSelfTest } from '../src/ui/HudVehicleLoading.selftest';
import { runLaneObservationSelfTest } from '../src/world/navigation/LaneObservation.selftest';
import { runLateralAssistControllerSelfTest } from '../src/vehicle/control/LateralAssistController.selftest';
import { runLateralAssistDrivingSelfTest } from '../src/vehicle/control/LateralAssistDriving.selftest';
import { runLaneDepartureWarningSelfTest } from '../src/vehicle/control/LaneDepartureWarningController.selftest';
import { runLaneDepartureWarningSoundSelfTest } from '../src/audio/LaneDepartureWarningSound.selftest';
import { runLaneAssistStateSelfTest } from '../src/vehicle/control/LaneAssistState.selftest';
import { runLaneAssistSelectionDisplaySelfTest } from '../src/vehicle/visual/LaneAssistSelectionDisplay.selftest';
import { runRegionalWorldSelfTest } from '../src/world/regional/RegionalWorld.selftest';
import { runHighwaySystemSelfTest } from '../src/world/regional/HighwaySystem.selftest';
import type { CityMapData } from '../src/world/city/CityMapData';
import regional from '../src/world/regional/regional-main.json';
import city from '../src/world/city/maps/city-main.json';
import highwayBaseline from '../artifacts/highway-system/baseline.json';
import { runGolfGTISelfTest } from '../src/vehicle/visual/GolfGTI.selftest';
import { runTractionPerformanceSelfTest } from '../src/vehicle/physics/TractionPerformance.selftest';
import { runSurfaceInteractionSelfTest } from '../src/vehicle/physics/SurfaceInteraction.selftest';
import { runAccelerationTestSelfTest } from '../src/experimental/acceleration/AccelerationTest.selftest';
import { runAccelerationRunDiagnosticsSelfTest } from '../src/experimental/acceleration/AccelerationRunDiagnostics.selftest';
import { runTrajectoryPredictionSelfTest } from '../src/experimental/trajectory/TrajectoryPrediction.selftest';

// Read-only integration runner: historical artifacts and map sources are inputs.
const results = {
  navigation: runNavigationSelfTest(regional as CityMapData),
  navigationDisplays: runNavigationDisplaysSelfTest(),
  platform: await runVehiclePlatformFoundationSelfTest(),
  ev: runEVPlatformV2SelfTest(),
  tyres: runTyreThermalPressureSelfTest(),
  tpms: runTPMSDisplaysSelfTest(),
  taycan: runTaycanDisplaysSelfTest(),
  bmw: runBMW530LiSelfTest(),
  bmwCabin: runBMW530FrontCabinSelfTest(),
  scene: runDrivingSceneDisplaySelfTest(),
  loading: await runHudVehicleLoadingSelfTest(),
  lanes: runLaneObservationSelfTest(),
  lateral: runLateralAssistControllerSelfTest(),
  lateralDriving: runLateralAssistDrivingSelfTest(),
  ldw: runLaneDepartureWarningSelfTest(),
  ldwSound: runLaneDepartureWarningSoundSelfTest(),
  selection: runLaneAssistStateSelfTest(),
  selectionDisplay: runLaneAssistSelectionDisplaySelfTest(),
  regional: runRegionalWorldSelfTest(regional as CityMapData, city as CityMapData),
  highway: runHighwaySystemSelfTest(regional as CityMapData, highwayBaseline),
  golf: runGolfGTISelfTest(),
  traction: runTractionPerformanceSelfTest(),
  surface: runSurfaceInteractionSelfTest(),
  acceleration: runAccelerationTestSelfTest(),
  accelerationDiagnostics: runAccelerationRunDiagnosticsSelfTest(),
  trajectory: runTrajectoryPredictionSelfTest(),
};
console.log(JSON.stringify(results, null, 2));
