import {build} from 'esbuild';
await build({stdin:{contents:"export {runWorldRenderingSelfTest} from './src/world/render/WorldRendering.selftest';export {runRuntimeFirstRenderingSelfTest} from './src/world/render/RuntimeFirstRendering.selftest';export {runSuspensionStanceSelfTest} from './src/vehicle/visual/SuspensionStance.selftest';export {runNavigationDisplaysSelfTest} from './src/vehicle/visual/NavigationDisplays.selftest';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:'.tmp-world-render-selftests.mjs',define:{'import.meta.env.DEV':'false'},logLevel:'silent'});
const tests=await import('../.tmp-world-render-selftests.mjs');
console.log('World rendering',tests.runWorldRenderingSelfTest());
console.log('Runtime first rendering',tests.runRuntimeFirstRenderingSelfTest());
console.log('Suspension stance',tests.runSuspensionStanceSelfTest());
console.log('Navigation displays',tests.runNavigationDisplaysSelfTest());
await build({stdin:{contents:"export {runRenderWorldSelfTest} from './src/world/render/RenderWorld.selftest';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:'.tmp-render-world-selftests.mjs',logLevel:'silent'});
console.log('RenderWorld', (await import('../.tmp-render-world-selftests.mjs')).runRenderWorldSelfTest());
