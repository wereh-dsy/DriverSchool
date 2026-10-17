import fs from 'node:fs';
import {build} from 'esbuild';

// Explicit current-source refinement; never invokes historical city generators.
const target='src/world/regional/regional-main.json';
const latest=process.argv.includes('--v62'),minor=process.argv.includes('--v61'),candidate=latest?'.tmp-city-v62-candidate.json':minor?'.tmp-city-v61-candidate.json':'.tmp-city-v6-candidate.json';
const bundle=await build({stdin:{contents:latest?"export {refineCityMainV62 as buildCityMainV6} from './src/world/city/maps/CityMainV62';":minor?"export {refineCityMainV61 as buildCityMainV6} from './src/world/city/maps/CityMainV61';":"export {buildCityMainV6} from './src/world/city/maps/CityMainV6Recipe';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try {
  const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  const sourceIndex=process.argv.indexOf('--source');
  const source=JSON.parse(fs.readFileSync(sourceIndex<0?target:process.argv[sourceIndex+1],'utf8'));
  const baseline=latest?'.tmp-city-v62-baseline.json':minor?'.tmp-city-v61-baseline.json':'.tmp-city-v6-baseline.json';
  if(!fs.existsSync(baseline))fs.writeFileSync(baseline,JSON.stringify(source));
  const refined=api.buildCityMainV6(source);
  fs.writeFileSync(candidate,JSON.stringify(refined,null,2)+'\n');
  if(process.argv.includes('--apply'))fs.writeFileSync(target,JSON.stringify(refined)+'\n');
  console.log(JSON.stringify({output:process.argv.includes('--apply')?target:candidate,version:refined.version,cityRoads:refined.roads.filter(r=>!r.id.startsWith('regional:')).length,environment:JSON.parse(refined.environment.metadata[latest?'v62Environment':minor?'v61Environment':'v6Environment'])},null,2));
}catch(error){console.error(String(error.stack??error).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'<city-v6>'));process.exitCode=1;}
