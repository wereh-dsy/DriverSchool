import { runVehicleInputSystemSelfTest } from '../src/input/VehicleInputSystem.selftest';
import { runVehicleLightingSelfTest } from '../src/vehicle/visual/VehicleLighting.selftest';
import { runLaneAssistStateSelfTest } from '../src/vehicle/control/LaneAssistState.selftest';
import { runLaneAssistSelectionDisplaySelfTest } from '../src/vehicle/visual/LaneAssistSelectionDisplay.selftest';

console.log(JSON.stringify({ input: runVehicleInputSystemSelfTest(), laneAssist: runLaneAssistStateSelfTest(),
  lights: runVehicleLightingSelfTest(), instruments: runLaneAssistSelectionDisplaySelfTest() }, null, 2));
