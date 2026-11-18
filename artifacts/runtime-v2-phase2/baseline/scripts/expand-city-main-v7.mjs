import fs from 'node:fs';
import {build} from 'esbuild';
const target='src/world/regional/regional-main.json',baseline='.tmp-city-v7-baseline.json';
if(!fs.existsSync(baseline))fs.copyFileSync(target,baseline);
const bundle=await build({stdin:{contents:"export {expandCityMainV7} from './src/world/city/maps/CityMainV7';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try {
  const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  const map=api.expandCityMainV7(JSON.parse(fs.readFileSync(baseline,'utf8')));
  fs.writeFileSync('.tmp-city-v7-candidate.json',JSON.stringify(map)+'\n');
  if(process.argv.includes('--apply'))fs.writeFileSync(target,JSON.stringify(map)+'\n');
  console.log(JSON.stringify({version:map.version,roads:map.roads.filter(r=>!r.id.startsWith('regional:')).length,output:process.argv.includes('--apply')?target:'.tmp-city-v7-candidate.json'}));
}catch(error){console.error(String(error.stack??error).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'<city-v7>'));process.exitCode=1;}
