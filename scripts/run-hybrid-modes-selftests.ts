import { mkdirSync, writeFileSync } from 'node:fs';
import { runHybridDriveEnergyModesSelfTest } from '../src/vehicle/HybridDriveEnergyModes.selftest';
import { runVehicleInputSystemSelfTest } from '../src/input/VehicleInputSystem.selftest';
import { runTank500HybridControlSelfTest } from '../src/vehicle/Tank500HybridControl.selftest';
import { runTank500DriveabilitySelfTest } from '../src/vehicle/Tank500Driveability.selftest';
import { runP2HybridSelfTest } from '../src/vehicle/P2Hybrid.selftest';
import { runEhsHybridSelfTests } from '../src/vehicle/EhsHybrid.selftest';
import { runEhsVehicleSelfTests } from '../src/vehicle/EhsVehicle.selftest';
import { runTank500DisplaysSelfTest } from '../src/vehicle/visual/Tank500Displays.selftest';
import { runQinPlusVisualSelfTests } from '../src/vehicle/visual/QinPlusVisual.selftest';

const hybridModes = runHybridDriveEnergyModesSelfTest();
console.log(`HybridDriveEnergyModes 专项通过: ${hybridModes.assertions} 条断言`);

const input = runVehicleInputSystemSelfTest();
console.log(`VehicleInputSystem 专项通过: ${input.assertions} 条断言`);

const tankControl = runTank500HybridControlSelfTest();
console.log(`Tank500HybridControl 回归通过: ${tankControl.assertions} 条断言`);

const tankDriveability = runTank500DriveabilitySelfTest();
console.log(`Tank500Driveability 回归通过: ${tankDriveability.assertions} 条断言`);

const p2 = runP2HybridSelfTest();
console.log(`P2Hybrid 回归通过: ${p2.assertions} 条断言`);

const ehs = runEhsHybridSelfTests();
console.log(`EhsHybrid 回归通过: ${Object.keys(ehs).join(', ')}`);

const ehsVehicle = runEhsVehicleSelfTests();
console.log(`EhsVehicle 回归通过: ${ehsVehicle.assertions} 条断言`);

const tankDisplays = runTank500DisplaysSelfTest();
console.log(`Tank500Displays 回归通过: ${tankDisplays.assertions} 条断言`);

const qinVisual = runQinPlusVisualSelfTests();
console.log(`QinPlusVisual 回归通过: ${qinVisual.assertions} 条断言`);

mkdirSync('artifacts/hybrid-modes', { recursive: true });
writeFileSync(
  'artifacts/hybrid-modes/report.json',
  JSON.stringify({
    timestepHz: 120,
    hybridModes,
    inputAssertions: input.assertions,
    tankControlAssertions: tankControl.assertions,
    tankDriveabilityAssertions: tankDriveability.assertions,
    p2Assertions: p2.assertions,
    ehsVehicleAssertions: ehsVehicle.assertions,
    tankDisplaysAssertions: tankDisplays.assertions,
    qinVisualAssertions: qinVisual.assertions,
  }, null, 2) + '\n',
);
console.log('专项报告已写入 artifacts/hybrid-modes/report.json');
