import {build} from 'esbuild';
import fs from 'node:fs';
const source=fs.readFileSync('scripts/run-core-selftests.ts','utf8');
const start=source.indexOf('const results = {'),end=source.indexOf('\n};',start)+3;
const body=source.slice(start,end).replace(/^(\s+)(\w+):\s*(.+),$/gm,(_,space,key,expression)=>`${space}${key}: await probe('${key}',async()=>${expression}),`);
const code=source.slice(0,start)+`const errors=[];async function probe(name,run){try{return await run();}catch(e){errors.push({name,error:e.message});console.error(name+': '+e.message);return {failed:true};}}\n`+body+`\nconsole.log(JSON.stringify({errors,results},null,2));if(errors.length)process.exitCode=1;`;
await build({stdin:{contents:code,resolveDir:process.cwd()+'/scripts',loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:'artifacts/performance-deep/core-diagnostic.bundle.mjs',logLevel:'silent'});
await import('./core-diagnostic.bundle.mjs');
