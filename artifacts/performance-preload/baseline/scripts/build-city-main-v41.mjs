import fs from 'node:fs';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export {buildCityMainV41} from './src/world/city/maps/CityMainV41Recipe';export {validateMap} from './src/world/city/CityMapValidation';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try{
  const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  const map=api.buildCityMainV41(JSON.parse(fs.readFileSync('artifacts/city-main-v4.1/v4-base.json','utf8'))),report=api.validateMap(map);
  fs.writeFileSync('artifacts/city-main-v4.1/candidate.json',JSON.stringify(map,null,2)+'\n');
  console.log(JSON.stringify({roads:map.roads.length,junctions:map.intersections.length,footprints:map.intersections.filter(j=>j.pavementFootprint).length,errors:report.errors,warnings:report.warnings.filter(w=>w.code!=='port.unused')},null,2));
  if(!report.valid)process.exitCode=1;else if(!process.argv.includes('--inspect'))fs.writeFileSync('src/world/city/maps/city-main.json',JSON.stringify(map,null,2)+'\n');
}catch(e){console.error(String(e.stack??e).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'<v41-author>'));process.exitCode=1;}
