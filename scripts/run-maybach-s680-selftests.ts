import { runMaybachS680SelfTest } from '../src/vehicle/MaybachS680.selftest';
import { runMercedesE300LSelfTest } from '../src/vehicle/visual/MercedesE300L.selftest';
import { runTransmissionBackendSelfTest, runTransmissionShiftSelfTest } from '../src/vehicle/transmission/Transmission.selftest';
console.log(JSON.stringify({ maybach: runMaybachS680SelfTest(), e300lRegression: runMercedesE300LSelfTest(),
  transmissionBackend: runTransmissionBackendSelfTest(), transmissionShifts: runTransmissionShiftSelfTest() }, null, 2));
