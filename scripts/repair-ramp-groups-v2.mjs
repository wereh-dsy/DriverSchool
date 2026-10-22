import {build} from 'esbuild';
const result=await build({entryPoints:['scripts/repair-ramp-groups-v2.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try{await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));}catch(error){console.error(error.message);process.exitCode=1;}
