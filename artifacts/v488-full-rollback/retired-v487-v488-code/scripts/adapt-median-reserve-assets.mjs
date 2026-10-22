import {build} from 'esbuild';
const output=await build({entryPoints:['scripts/adapt-median-reserve-assets.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try{await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));}catch(e){console.error(String(e.stack??e.message).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'median-assets'));process.exitCode=1;}
