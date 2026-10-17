import fs from 'node:fs';
import {build} from 'esbuild';
const target='src/world/regional/regional-main.json',candidate='.tmp-city-v6-details.json';
const bundle=await build({stdin:{contents:"export {detailCityMainV6} from './src/world/city/maps/CityMainV6Details';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try {
  const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  const sourceIndex=process.argv.indexOf('--source');
  const source=JSON.parse(fs.readFileSync(sourceIndex<0?target:process.argv[sourceIndex+1],'utf8'));
  if(!fs.existsSync('.tmp-city-v6-before-details.json'))fs.writeFileSync('.tmp-city-v6-before-details.json',JSON.stringify(source));
  const result=api.detailCityMainV6(source);fs.writeFileSync(candidate,JSON.stringify(result,null,2)+'\n');
  if(process.argv.includes('--apply'))fs.writeFileSync(target,JSON.stringify(result)+'\n');
  const m=result.environment.metadata;
  console.log(JSON.stringify({output:process.argv.includes('--apply')?target:candidate,version:result.version,environment:JSON.parse(m.v6Environment),geography:JSON.parse(m.v6Geography),signals:JSON.parse(m.v6Signals),buildings:JSON.parse(m.v6Buildings)},null,2));
}catch(e){console.error(String(e.stack??e).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'<city-v6-details>'));process.exitCode=1;}
