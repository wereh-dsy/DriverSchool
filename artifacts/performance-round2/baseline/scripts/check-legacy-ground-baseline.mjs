import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
const report={};
for(const mode of ['baseline','current']){
  const plugins=mode==='baseline'?[{name:'read-only-head-validation',setup(builder){builder.onLoad({filter:/(CityMapValidation|PresetGeometryValidation)\.ts$/},args=>({contents:execFileSync('git',['show','HEAD:'+path.relative(process.cwd(),args.path).replaceAll('\\','/')],{encoding:'utf8'}),loader:'ts'}));}}]:[];
  const bundle=await build({stdin:{contents:`export {loadCityMap} from './src/world/city/CityMapLoader';`,resolveDir:process.cwd(),loader:'ts'},plugins,bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
  const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  try{api.loadCityMap(JSON.parse(fs.readFileSync('src/world/city/maps/preset-showcase.json','utf8')));report[mode]={passed:true};}
  catch(error){report[mode]={passed:false,error:String(error.message),location:String(error.stack).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'<validation>').split('\n').slice(0,4)};}
}
fs.writeFileSync('artifacts/highway-system/legacy-ground-baseline.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
