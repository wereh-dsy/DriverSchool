import {build} from 'esbuild';
const output=await build({entryPoints:['scripts/finalize-interchange-integrated.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try{await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));}catch(e){console.error(e.message);process.exitCode=1;}
