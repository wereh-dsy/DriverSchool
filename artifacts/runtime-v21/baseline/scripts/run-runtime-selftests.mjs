import { build } from 'esbuild';
await build({
  stdin:{contents:"export {runRuntimeCoordinatorSelfTest} from './src/game/runtime/RuntimeCoordinator.selftest';export {runRuntimeStreamingSelfTest} from './src/game/runtime/RuntimeStreaming.selftest';",resolveDir:process.cwd()},
  bundle:true,platform:'node',format:'esm',outfile:'.tmp-runtime-selftests.mjs',logLevel:'silent',
  define:{'import.meta.env.DEV':'false'},
});
const {runRuntimeCoordinatorSelfTest,runRuntimeStreamingSelfTest}=await import('../.tmp-runtime-selftests.mjs');
console.log(await runRuntimeCoordinatorSelfTest());
console.log(await runRuntimeStreamingSelfTest());
