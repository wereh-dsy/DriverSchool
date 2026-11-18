import {build} from 'esbuild';
await build({stdin:{contents:"export {runSuspensionStanceSelfTest} from './artifacts/runtime-v15/baseline/src/vehicle/visual/SuspensionStance.selftest';",resolveDir:process.cwd()},outfile:'artifacts/runtime-v15/stance-baseline.bundle.mjs',bundle:true,platform:'node',format:'esm',define:{'import.meta.env.DEV':'false'},logLevel:'silent'});
const {runSuspensionStanceSelfTest}=await import('./stance-baseline.bundle.mjs');
console.log(runSuspensionStanceSelfTest());
