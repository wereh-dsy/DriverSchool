import { runCruiseControlControllerSelfTest } from '../src/vehicle/control/CruiseControlController.selftest';
import { runRearParkingProximitySelfTest } from '../src/vehicle/control/RearParkingProximity.selftest';
import { runCruiseVehicleExperienceSelfTest } from '../src/vehicle/physics/VehicleExperience.selftest';
import { runSuvInstrumentClusterSelfTest } from '../src/vehicle/visual/SuvInstrumentCluster.selftest';
console.log(JSON.stringify({ cruiseControl: runCruiseControlControllerSelfTest(), rearParking: runRearParkingProximitySelfTest(),
  parkingDisplay: runSuvInstrumentClusterSelfTest(), cruiseVehicle: runCruiseVehicleExperienceSelfTest() }, null, 2));
