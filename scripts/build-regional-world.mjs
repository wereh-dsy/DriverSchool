import fs from 'node:fs';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export {buildRegionalWorld} from './src/world/regional/RegionalWorldRecipe';export {validateMap} from './src/world/city/CityMapValidation';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try {
  const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  const base=JSON.parse(fs.readFileSync('src/world/city/maps/city-main.json','utf8')),map=api.buildRegionalWorld(base),validation=api.validateMap(map);
  if(!validation.valid)throw new Error(JSON.stringify(validation.errors.slice(0,20).map(e=>({...e,id:e.path.startsWith('roads[')?map.roads[Number(e.path.match(/\d+/)[0])].id:undefined})))+` (${validation.errors.length} errors)`);
  fs.mkdirSync('artifacts/regional-world',{recursive:true});
  fs.writeFileSync('src/world/regional/regional-main.json',JSON.stringify(map)+'\n');
  const lengths=map.regional.routes.map(r=>({id:r.id,km:r.centerline.slice(1).reduce((s,p,i)=>s+Math.hypot(p.x-r.centerline[i].x,p.z-r.centerline[i].z),0)/1000,lanes:r.lanes*2}));
  fs.writeFileSync('artifacts/regional-world/metadata.json',JSON.stringify({bounds:map.bounds,region:map.regional,lengths,validation},null,2));
  console.log(JSON.stringify({roads:map.roads.length,signs:map.signs.length,lengths,warnings:validation.warnings.map(w=>w.code)}));
}catch(e){console.error(String(e.stack??e).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'<regional-recipe>'));process.exitCode=1;}
