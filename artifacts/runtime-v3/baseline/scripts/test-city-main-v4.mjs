import fs from 'node:fs';
import {build} from 'esbuild';
const result=await build({stdin:{contents:`import {runCityMainV4SelfTest} from './src/world/city/CityMainV4.selftest';export {runCityMainV4SelfTest};`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try{
  const {runCityMainV4SelfTest}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
  const candidate=process.argv.includes('--candidate'),map=JSON.parse(fs.readFileSync(candidate?'artifacts/city-main-v4/candidate.json':'src/world/city/maps/city-main.json','utf8'));
  const report=runCityMainV4SelfTest(map,!process.argv.includes('--structural-only'));
  fs.writeFileSync('artifacts/city-main-v4/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(e){console.error(String(e.stack??e).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'<v4-test>'));process.exitCode=1;}
