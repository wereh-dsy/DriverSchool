import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
const result=await build({entryPoints:['src/editor/CityEditingKernel.selftest.ts'],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const test=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
console.log(JSON.stringify(process.argv.includes('--city-main')?test.runCityMainEditorSelfTest(JSON.parse(readFileSync('src/world/regional/regional-main.json','utf8'))):test.runEditorSelfTest(),null,2));
