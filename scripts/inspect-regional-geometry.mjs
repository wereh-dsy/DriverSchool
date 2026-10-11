import fs from 'node:fs';import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export {validatePresetGeometry} from './src/world/city/presets/PresetGeometryValidation';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try{
 const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64')),map=JSON.parse(fs.readFileSync('src/world/regional/regional-main.json','utf8'));
 const report={};
 for(const hub of map.regional.structures.filter(s=>s.kind==='interchange')){
  const roads=map.roads.filter(r=>hub.roadIds.includes(r.id)||r.id.startsWith('regional:')&&r.laneCount>1&&r.centerline.some(p=>Math.hypot(p.x-hub.center.x,p.z-hub.center.z)<800)),ids=new Set(roads.map(r=>r.id));
  const sample={...map,roads,intersections:[],objects:[],signs:[],connectionPorts:[],roadLinks:map.roadLinks.filter(l=>ids.has(l.from.roadId)&&ids.has(l.to.roadId))};
  report[hub.name]=api.validatePresetGeometry(sample);
 }
 fs.writeFileSync('artifacts/regional-world/interchange-geometry.json',JSON.stringify(report,null,2));
 for(const [name,issues]of Object.entries(report))console.log(name,issues.map(i=>i.code+' '+i.path+' '+i.message).join('\n'));
 if(Object.values(report).some(issues=>issues.length))process.exitCode=1;
}catch(e){console.error(String(e.stack??e).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'<regional-geometry>'));process.exitCode=1;}
