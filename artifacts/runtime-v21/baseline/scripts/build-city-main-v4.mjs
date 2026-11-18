import fs from 'node:fs';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`import {buildCityMainV4} from './src/world/city/maps/CityMainV4Recipe';import {validateMap} from './src/world/city/CityMapValidation';import {cityMainCrossingIssues} from './src/world/city/CityMain.selftest';export {buildCityMainV4,validateMap,cityMainCrossingIssues};`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try{
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const source=JSON.parse(fs.readFileSync('artifacts/city-main-v4/v3-base.json','utf8')),map=api.buildCityMainV4(source),validation=api.validateMap(map),crossings=api.cityMainCrossingIssues(map);
fs.writeFileSync('artifacts/city-main-v4/candidate.json',JSON.stringify(map,null,2)+'\n');
console.log(JSON.stringify({roads:map.roads.length,junctions:map.intersections.length,signs:map.signs.length,objects:map.objects.length,errors:validation.errors,warnings:validation.warnings.filter(w=>w.code!=='port.unused'),crossings},null,2));
if(!validation.valid||crossings.length)process.exitCode=1;else if(!process.argv.includes('--inspect'))fs.writeFileSync('src/world/city/maps/city-main.json',JSON.stringify(map,null,2)+'\n');
}catch(e){console.error(String(e.stack??e).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'<v4-author>'));process.exitCode=1;}
