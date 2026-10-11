import fs from 'node:fs';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export {runRegionalWorldSelfTest} from './src/world/regional/RegionalWorld.selftest';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try {
  const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  const report=api.runRegionalWorldSelfTest(JSON.parse(fs.readFileSync('src/world/regional/regional-main.json','utf8')),JSON.parse(fs.readFileSync('src/world/city/maps/city-main.json','utf8')));
  fs.writeFileSync('artifacts/regional-world/test-results.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(e){console.error(String(e.stack??e).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'<regional-test>'));process.exitCode=1;}
