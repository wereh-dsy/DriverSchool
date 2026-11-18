import { build } from 'esbuild';
const compiled = await build({
  stdin:{contents:"export {runRuntimeCoordinatorSelfTest} from './src/game/runtime/RuntimeCoordinator.selftest';",resolveDir:process.cwd()},
  bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent',
  define:{'import.meta.env.DEV':'false'},
});
const {runRuntimeCoordinatorSelfTest}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
console.log(await runRuntimeCoordinatorSelfTest());
