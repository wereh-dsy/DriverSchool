import {build} from 'esbuild';
await build({stdin:{contents:"export {runQinPlusVisualSelfTests} from './src/vehicle/visual/QinPlusVisual.selftest';export {runVehicleStructureSelfTest} from './src/vehicle/visual/VehicleStructure.selftest';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:'artifacts/runtime-v2-phase2/check-vehicle-gates.bundle.mjs',define:{'import.meta.env.DEV':'false'},logLevel:'silent'});
const checks=await import('./check-vehicle-gates.bundle.mjs');
console.log('Qin',checks.runQinPlusVisualSelfTests());
console.log('Vehicle structure',checks.runVehicleStructureSelfTest());
