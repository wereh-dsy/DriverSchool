import { runMirrorGeometrySelfTest } from '../src/camera/MirrorSystem.selftest';
import { runVehicleInputSystemSelfTest } from '../src/input/VehicleInputSystem.selftest';
import { runVehicleCatalogSelfTest } from '../src/vehicle/VehicleCatalog.selftest';
import { runCruiseControlControllerSelfTest } from '../src/vehicle/control/CruiseControlController.selftest';
import { runVehicleDynamicsSelfTest } from '../src/vehicle/physics/VehicleDynamics.selftest';
import { runMechanicalDetailsSelfTest } from '../src/vehicle/physics/MechanicalDetails.selftest';
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
};

console.log(JSON.stringify(results, null, 2));
