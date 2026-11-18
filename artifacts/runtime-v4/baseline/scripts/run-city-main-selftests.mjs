import { build } from 'esbuild';
const result=await build({entryPoints:['src/world/city/CityMain.selftest.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const test=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
try{console.log(JSON.stringify(test.runCityMainSelfTest(),null,2));}
catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
