import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
const output='artifacts/system-central-ramp-audit/.audit.mjs';
await build({entryPoints:['artifacts/system-central-ramp-audit/audit.ts'],bundle:true,platform:'node',format:'esm',outfile:output,logLevel:'silent'});
await import(pathToFileURL(process.cwd()+'/'+output).href);
