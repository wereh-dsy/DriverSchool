import fs from 'node:fs';
import {build} from 'esbuild';
const file='src/world/regional/regional-main.json',baseline='artifacts/highway-system/v1-baseline.json';
const current=JSON.parse(fs.readFileSync(file,'utf8'));
if(current.environment.metadata.highwayNetworkRevision!=='2'&&!fs.existsSync(baseline))fs.writeFileSync(baseline,JSON.stringify(current));
if(!fs.existsSync(baseline))throw new Error('Saved V1 snapshot is required.');
const bundle=await build({stdin:{contents:`export {reviseHighwayNetwork} from './src/world/regional/HighwayNetworkRevision';export {validateMap} from './src/world/city/CityMapValidation';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try{
 const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
 const map=api.reviseHighwayNetwork(JSON.parse(fs.readFileSync(baseline,'utf8'))),report=api.validateMap(map);
 if(!report.valid)throw new Error(JSON.stringify(report.errors.slice(0,15))+' ('+report.errors.length+' errors)');
 fs.writeFileSync(file,JSON.stringify(map)+'\n');
 fs.writeFileSync('artifacts/highway-system/v2-metadata.json',JSON.stringify({routes:map.regional.highways.routes, junctions:map.regional.highways.junctions,roads:map.roads.length,signs:map.signs.length,validation:report},null,2));
 console.log(JSON.stringify({roads:map.roads.length,signs:map.signs.length,junctions:map.regional.highways.junctions.length}));
}catch(e){console.error(String(e.stack??e).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'<regional-revision>'));process.exitCode=1;}
