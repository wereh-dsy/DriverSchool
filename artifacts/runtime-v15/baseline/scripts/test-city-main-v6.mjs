import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
const latest=process.argv.includes('--v62'),minor=process.argv.includes('--v61'),args=process.argv.slice(2).filter(a=>!['--v61','--v62'].includes(a)),target=args[0]??'src/world/regional/regional-main.json';
const baseline=args[1]??(latest?'.tmp-city-v62-baseline.json':minor?'.tmp-city-v61-baseline.json':'.tmp-city-v6-baseline.json');
const bundle=await build({stdin:{contents:latest?"export {runCityMainV62SelfTest} from './src/world/city/CityMainV62.selftest';":minor?"export {runCityMainV61SelfTest} from './src/world/city/CityMainV61.selftest';":"export {runCityMainV6SelfTest} from './src/world/city/CityMainV6.selftest';export {runCityTrafficSignalsSelfTest} from './src/world/city/CityTrafficSignals.selftest';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try{
  const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  const original=fs.existsSync(baseline)?fs.readFileSync(baseline,'utf8'):execFileSync('git',['show','HEAD:src/world/regional/regional-main.json'],{encoding:'utf8',maxBuffer:64*1024*1024});
  const map=JSON.parse(fs.readFileSync(target,'utf8'));
  const report=latest?api.runCityMainV62SelfTest(map,JSON.parse(original)):minor?api.runCityMainV61SelfTest(map,JSON.parse(original)):{...api.runCityMainV6SelfTest(map,JSON.parse(original)),trafficSignals:api.runCityTrafficSignalsSelfTest(map)};
  const dir=latest?'artifacts/city-v62':minor?'artifacts/city-v61':'artifacts/city-v6';fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(error){console.error(String(error.stack??error).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'<city-v6-test>'));process.exitCode=1;}
