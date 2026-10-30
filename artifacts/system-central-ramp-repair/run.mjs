import {build} from 'esbuild';
const task=process.argv.includes('--validate')?'validate':process.argv.includes('--facilities')?'facilities':'repair';
const result=await build({entryPoints:[`artifacts/system-central-ramp-repair/${task}.ts`],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try{await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));}catch(e){console.error(e.message);process.exitCode=1;}
