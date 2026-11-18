import {build} from 'esbuild';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const b=await build({stdin:{contents:"export {auditFastRoadSigns} from './src/world/regional/FastRoadSignPlacement';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try {
  const api=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
  const maps={current:JSON.parse(fs.readFileSync('src/world/regional/regional-main.json')),starting:JSON.parse(fs.readFileSync('artifacts/performance-deep/baseline/src/world/regional/regional-main.json')),historical:JSON.parse(execFileSync('git',['show','HEAD:src/world/regional/regional-main.json'],{maxBuffer:50*1024*1024})),city:JSON.parse(fs.readFileSync('src/world/city/maps/city-main.json'))};
  const report=Object.fromEntries(Object.entries(maps).map(([key,map])=>{const audit=api.auditFastRoadSigns(map);return [key,{version:map.version,...audit,objects:audit.conflicts.map(c=>({a:map.signs.find(s=>s.id===c.a),b:map.signs.find(s=>s.id===c.b)}))}];}));
  fs.writeFileSync('artifacts/performance-deep/build-blocker-signs.json',JSON.stringify(report,null,2));
  console.log(Object.fromEntries(Object.entries(report).map(([k,v])=>[k,{version:v.version,conflicts:v.conflicts}])));
} catch(e){console.error(e.message);process.exitCode=1;}
