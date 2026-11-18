import fs from 'node:fs';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export {reviseRegionalDoubleC} from './src/world/regional/RegionalDoubleCRevision';export {validateMap} from './src/world/city/CityMapValidation';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try {
 const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
 const map=api.reviseRegionalDoubleC(JSON.parse(fs.readFileSync('artifacts/highway-system/v2-baseline.json','utf8')));
 const validation=api.validateMap(map);
 if(!validation.valid)throw new Error(JSON.stringify(validation.errors.slice(0,15))+' ('+validation.errors.length+' errors)');
 fs.writeFileSync('src/world/regional/regional-main.json',JSON.stringify(map)+'\n');
 fs.writeFileSync('artifacts/highway-system/v3-metadata.json',JSON.stringify({routes:map.regional.highways.routes,junctions:map.regional.highways.junctions,roads:map.roads.length,signs:map.signs.length,validation},null,2));
 console.log(JSON.stringify({roads:map.roads.length,signs:map.signs.length,junctions:map.regional.highways.junctions.length}));
} catch(e) {console.error(String(e.stack??e).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'<double-c-revision>'));process.exitCode=1;}
