import fs from 'node:fs';
import {build} from 'esbuild';
const task=process.argv[2]??'inventory';
const result=await build({entryPoints:[`artifacts/final-ramp-structural-cleanup/${task}.ts`],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try{await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));}catch(e){console.error(e.stack?.replace(/data:text[^\s)]+/g,'<diagnostic bundle>')??e.message);process.exitCode=1;}
