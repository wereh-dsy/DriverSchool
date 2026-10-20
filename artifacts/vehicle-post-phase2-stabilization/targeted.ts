import fs from 'node:fs';
import { runPlanarDirectionSelfTest } from '../../src/vehicle/physics/PlanarDirection.selftest';
import { runVerticalDynamicsSelfTest } from '../../src/vehicle/physics/VerticalDynamics.selftest';
import { runWheelContactSelfTest } from '../../src/vehicle/physics/WheelContact.selftest';
import { runSuspensionMechanicsSelfTest } from '../../src/vehicle/physics/SuspensionMechanics.selftest';

const direction = runPlanarDirectionSelfTest();
console.log(JSON.stringify(direction,null,2));
const vertical = runVerticalDynamicsSelfTest(), contact = runWheelContactSelfTest(), suspension = runSuspensionMechanicsSelfTest();
const result = {direction,vertical,contact,suspension};
fs.writeFileSync('artifacts/vehicle-post-phase2-stabilization/targeted-results.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({direction:direction.assertions,vertical:vertical.assertions,contact:contact.assertions,suspension:suspension.assertions}));
