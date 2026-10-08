import { runPowertrainBoundarySelfTest } from '../src/vehicle/powertrain/Powertrain.selftest';
import { runVehicleExperienceSelfTest, runCruiseVehicleExperienceSelfTest } from '../src/vehicle/physics/VehicleExperience.selftest';
import { runVehiclePlatformSelfTest } from '../src/vehicle/physics/VehiclePlatform.selftest';
import { runPowertrainLayoutSelfTest } from '../src/vehicle/PowertrainLayout.selftest';
import { runExecutivePolishSelfTest } from '../src/vehicle/physics/ExecutivePolish.selftest';
import { runExecutiveSedanSelfTest } from '../src/vehicle/physics/ExecutiveSedan.selftest';
import { runMirrorGeometrySelfTest } from '../src/camera/MirrorSystem.selftest';
import { runVehicleInputSystemSelfTest } from '../src/input/VehicleInputSystem.selftest';
import { runVehicleCatalogSelfTest } from '../src/vehicle/VehicleCatalog.selftest';
import { runCruiseControlControllerSelfTest } from '../src/vehicle/control/CruiseControlController.selftest';
import { runVehicleDynamicsSelfTest } from '../src/vehicle/physics/VehicleDynamics.selftest';
import { runMechanicalDetailsSelfTest } from '../src/vehicle/physics/MechanicalDetails.selftest';
import { runEngineTorqueSelfTest } from '../src/vehicle/physics/EngineTorque.selftest';
import { runEngineTurboSelfTest } from '../src/vehicle/physics/EngineTurbo.selftest';
import { runWheelRotationSelfTest } from '../src/vehicle/physics/WheelRotationSystem.selftest';
import { runTyreDifferentialSelfTest } from '../src/vehicle/physics/TyreDifferential.selftest';
import { runDriverAssistSelfTest } from '../src/vehicle/physics/DriverAssistSystem.selftest';
import { runESCAWDSelfTest } from '../src/vehicle/physics/ESCAWD.selftest';
import { runCVTSelfTest } from '../src/vehicle/transmission/cvt/CVTTransmission.selftest';
import { runVehicleStructureSelfTest } from '../src/vehicle/visual/VehicleStructure.selftest';
import { runSuspensionMechanicsSelfTest } from '../src/vehicle/physics/SuspensionMechanics.selftest';
import { runSuspensionStanceSelfTest } from '../src/vehicle/visual/SuspensionStance.selftest';
import { runWheelContactSelfTest } from '../src/vehicle/physics/WheelContact.selftest';
import { runCollisionSystemSelfTest } from '../src/vehicle/physics/CollisionSystem.selftest';
import { runContactDynamicsSelfTest } from '../src/vehicle/physics/ContactDynamics.selftest';
import { runFourWheelPhysicsSelfTest } from '../src/vehicle/physics/FourWheelPhysics.selftest';
import { runVehicleContactSystemSelfTest } from '../src/vehicle/physics/VehicleContactSystem.selftest';
import { runInstrumentClusterLayoutSelfTest } from '../src/vehicle/visual/InstrumentCluster.selftest';
import { runDriverViewSelfTest } from '../src/vehicle/visual/DriverView.selftest';
import { runVehicleExteriorSelfTest } from '../src/vehicle/visual/VehicleExterior.selftest';
import { runVehicleVisualDimensionsSelfTest } from '../src/vehicle/visual/VehicleVisualDimensions.selftest';
import { runDrivingTestTrackSelfTest } from '../src/world/DrivingTestTrack.selftest';
import { runCircuitGroundSelfTest } from '../src/world/circuit/CircuitGround.selftest';
import { runLapTimerSelfTest } from '../src/game/lap/LapTimer.selftest';
import { runSubject2GroundSelfTest } from '../src/world/subject2/Subject2Ground.selftest';
import { runSubject3GroundSelfTest } from '../src/world/subject3/Subject3Ground.selftest';
import { runVehicleFeedbackSelfTest } from '../src/vehicle/feedback/VehicleFeedbackSystem.selftest';
import { runGamepadHapticsSelfTest } from '../src/input/GamepadHaptics.selftest';
import { runSteeringReturnSelfTest } from '../src/vehicle/physics/SteeringSystem.selftest';
import { runTransmissionBackendSelfTest, runTransmissionVehicleSelfTest, runTransmissionShiftSelfTest } from '../src/vehicle/transmission/Transmission.selftest';
import { runAutomaticGroundSelfTest } from '../src/vehicle/transmission/AutomaticGround.selftest';
import { runAutomaticSelectorInputSelfTest } from '../src/vehicle/transmission/AutomaticSelectorInput.selftest';
import { runVehicleLightingSelfTest } from '../src/vehicle/visual/VehicleLighting.selftest';
import { runEnvironmentSelfTest } from '../src/world/environment/Environment.selftest';
import { runCityMapSelfTest } from '../src/world/city/CityMap.selftest';
import { validateAuthoringAPI, validatePresets } from '../src/world/city/CityToolchain.selftest';

import { runFuelSystemSelfTest } from '../src/vehicle/physics/FuelSystem.selftest';

const results = {
  vehicleExperience: runVehicleExperienceSelfTest(),
  cruiseVehicleExperience: runCruiseVehicleExperienceSelfTest(),
  powertrainBoundary: runPowertrainBoundarySelfTest(),
  vehiclePlatform: runVehiclePlatformSelfTest(),
  powertrainLayout: runPowertrainLayoutSelfTest(),
  fuel: runFuelSystemSelfTest(),
  cityToolchain: validateAuthoringAPI(),
  cityPresets: validatePresets(),
  cityMap: runCityMapSelfTest(),
  executiveSedan: runExecutiveSedanSelfTest(),
  executivePolish: runExecutivePolishSelfTest(),
  suspensionStance: runSuspensionStanceSelfTest(),
  environment: runEnvironmentSelfTest(),
  input: runVehicleInputSystemSelfTest(),
  feedback: runVehicleFeedbackSelfTest(),
  haptics: await runGamepadHapticsSelfTest(),
  steeringReturn: runSteeringReturnSelfTest(),
  transmissionBackend: runTransmissionBackendSelfTest(),
  transmissionDriving: runTransmissionVehicleSelfTest(),
  transmissionShifts: runTransmissionShiftSelfTest(),
  automaticGround: runAutomaticGroundSelfTest(),
  automaticSelectorInput: runAutomaticSelectorInputSelfTest(),
  lighting: runVehicleLightingSelfTest(),
  physics: runVehicleDynamicsSelfTest(),
  mechanicalDetails: runMechanicalDetailsSelfTest(),
  engineTorque: runEngineTorqueSelfTest(),
  engineTurbo: runEngineTurboSelfTest(),
  wheelRotation: runWheelRotationSelfTest(),
  tyreDifferential: runTyreDifferentialSelfTest(),
  driverAssists: runDriverAssistSelfTest(),
  escAWD: runESCAWDSelfTest(),
  cvt: runCVTSelfTest(),
  vehicleStructure: runVehicleStructureSelfTest(),
  suspensionMechanics: runSuspensionMechanicsSelfTest(),
  wheelContact: runWheelContactSelfTest(),
  staticCollision: runCollisionSystemSelfTest(),
  contactDynamics: runContactDynamicsSelfTest(),
  fourWheelPhysics: runFourWheelPhysicsSelfTest(),
  mapContactAcceptance: runVehicleContactSystemSelfTest(),
  vehicleCatalog: runVehicleCatalogSelfTest(),
  cruiseControl: runCruiseControlControllerSelfTest(),
  mirrors: runMirrorGeometrySelfTest(),
  instruments: runInstrumentClusterLayoutSelfTest(),
  driverView: runDriverViewSelfTest(),
  vehicleExteriors: runVehicleExteriorSelfTest(),
  visualDimensions: runVehicleVisualDimensionsSelfTest(),
  roadCourse: runDrivingTestTrackSelfTest(),
  circuit: runCircuitGroundSelfTest(),
  lapTimer: runLapTimerSelfTest(),
  subject2: runSubject2GroundSelfTest(),
  subject3: runSubject3GroundSelfTest(),
};

console.log(JSON.stringify(results, null, 2));
