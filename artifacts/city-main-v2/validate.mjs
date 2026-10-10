import { build } from 'esbuild';
const result=await build({stdin:{contents:`import {runCityMainSelfTest} from './src/world/city/CityMain.selftest';
import {validateAuthoringAPI} from './src/world/city/CityToolchain.selftest';
console.log(JSON.stringify({cityMain:runCityMainSelfTest(),authoring:validateAuthoringAPI()},null,2));`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try{await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));}
catch(error){console.error(String(error.stack??error).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'<city-validation>'));process.exitCode=1;}
