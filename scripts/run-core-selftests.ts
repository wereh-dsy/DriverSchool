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
import { runCVTSelfTest } from '../src/vehicle/transmission/cvt/CVTTransmission.selftest';
import { runVehicleStructureSelfTest } from '../src/vehicle/visual/VehicleStructure.selftest';
import { runSuspensionMechanicsSelfTest } from '../src/vehicle/physics/SuspensionMechanics.selftest';
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
import { runSubject2GroundSelfTest } from '../src/world/subject2/Subject2Ground.selftest';
import { runSubject3GroundSelfTest } from '../src/world/subject3/Subject3Ground.selftest';
import { runVehicleFeedbackSelfTest } from '../src/vehicle/feedback/VehicleFeedbackSystem.selftest';
import { runGamepadHapticsSelfTest } from '../src/input/GamepadHaptics.selftest';
import { runSteeringReturnSelfTest } from '../src/vehicle/physics/SteeringSystem.selftest';
import { runTransmissionBackendSelfTest, runTransmissionVehicleSelfTest, runTransmissionShiftSelfTest } from '../src/vehicle/transmission/Transmission.selftest';
import { runAutomaticGroundSelfTest } from '../src/vehicle/transmission/AutomaticGround.selftest';
import { runAutomaticSelectorInputSelfTest } from '../src/vehicle/transmission/AutomaticSelectorInput.selftest';
import { runVehicleLightingSelfTest } from '../src/vehicle/visual/VehicleLighting.selftest';

const results = {
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
  subject2: runSubject2GroundSelfTest(),
  subject3: runSubject3GroundSelfTest(),
};

console.log(JSON.stringify(results, null, 2));
