import fs from 'node:fs';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export {runHighwaySystemSelfTest} from './src/world/regional/HighwaySystem.selftest';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try{
  const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  const report=api.runHighwaySystemSelfTest(JSON.parse(fs.readFileSync('src/world/regional/regional-main.json','utf8')),JSON.parse(fs.readFileSync('artifacts/highway-system/baseline.json','utf8')));
  fs.writeFileSync('artifacts/highway-system/test-results.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(error){console.error(String(error.stack??error).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'<highway-test>'));process.exitCode=1;}
