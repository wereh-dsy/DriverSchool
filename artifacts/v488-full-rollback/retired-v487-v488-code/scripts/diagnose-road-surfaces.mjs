import {build} from 'esbuild';
const output=await build({entryPoints:['scripts/diagnose-road-surfaces.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
