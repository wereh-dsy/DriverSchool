import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
const dirArg=process.argv.indexOf('--dir'),dir=dirArg<0?'artifacts/system-central-ramp-repair/':process.argv[dirArg+1];
fs.mkdirSync(dir+'after',{recursive:true});
let source=fs.readFileSync('artifacts/system-central-ramp-audit/audit.ts','utf8');
source=source.replace("const dir='artifacts/system-central-ramp-audit/'",`const dir='${dir}after/'`).replace("source='src/world/regional/regional-main.json'",`source='${dir}candidate-map.json'`);
const result=await build({stdin:{contents:source,resolveDir:path.resolve('artifacts/system-central-ramp-repair/'),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try{await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));}catch(e){console.error(e.message);process.exitCode=1;}
