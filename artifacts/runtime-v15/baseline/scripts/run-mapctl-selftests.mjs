import { build } from 'esbuild';
try {
  const bundle=await build({entryPoints:['src/editor/MapEngineering.selftest.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
  const suite=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  console.log(JSON.stringify({engineering:suite.runMapEngineeringSelfTest(),...(!process.argv.includes('--focused')?{legacySyntheticRoadQuality:suite.runRoadQualitySelfTest()}:{})},null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
