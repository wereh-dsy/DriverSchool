import fs from 'node:fs';import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export {runCityMainV41SelfTest} from './src/world/city/CityMainV41.selftest';export {runMarkingOwnershipSelfTest} from './src/world/city/MarkingOwnership.selftest';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try{
const {runCityMainV41SelfTest,runMarkingOwnershipSelfTest}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const report=runCityMainV41SelfTest(JSON.parse(fs.readFileSync('artifacts/city-main-v4.1/candidate.json','utf8')),JSON.parse(fs.readFileSync('artifacts/city-main-v4.1/v4-base.json','utf8')));
report.markingOwnership=runMarkingOwnershipSelfTest();
fs.writeFileSync('artifacts/city-main-v4.1/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(e){console.error(String(e.stack??e).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'<v41-test>'));process.exitCode=1;}
