import { mkdirSync, writeFileSync } from 'node:fs';
import { runEhsHybridSelfTests } from '../src/vehicle/EhsHybrid.selftest';
import { runEhsVehicleSelfTests } from '../src/vehicle/EhsVehicle.selftest';
import { runQinPlusVisualSelfTests } from '../src/vehicle/visual/QinPlusVisual.selftest';

const results = runEhsHybridSelfTests();
mkdirSync('artifacts/qin-plus-ehs', { recursive: true });
writeFileSync('artifacts/qin-plus-ehs/powertrain.json', JSON.stringify({ timestepHz: 120, results }, null, 2) + '\n');
console.log('EHS专项测试通过:', Object.keys(results).join(', '));
const vehicle = runEhsVehicleSelfTests();
writeFileSync('artifacts/qin-plus-ehs/vehicle.json', JSON.stringify(vehicle, null, 2) + '\n');
console.log('秦PLUS车辆接入专项通过:', vehicle.assertions);
const visual = runQinPlusVisualSelfTests();
writeFileSync('artifacts/qin-plus-ehs/visual.json', JSON.stringify(visual, null, 2) + '\n');
console.log('秦PLUS几何、材质与HMI专项通过:', visual.assertions);
