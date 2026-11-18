import fs from 'node:fs';import {build} from 'esbuild';
const selected=process.argv[2];
const bundle=await build({stdin:{contents:`export {validatePresetGeometry} from './src/world/city/presets/PresetGeometryValidation';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try{
 const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64')),map=JSON.parse(fs.readFileSync('src/world/regional/regional-main.json','utf8'));
 const report={};
 for(const hub of map.regional.structures.filter(s=>s.kind==='interchange'&&(!selected||s.id===selected))){
  const ids=new Set(map.roads.filter(r=>hub.roadIds.includes(r.id)||r.id.startsWith('regional:')&&r.laneCount>1&&r.centerline.some(p=>Math.hypot(p.x-hub.center.x,p.z-hub.center.z)<hub.radius+600)).map(r=>r.id));
  for(const structure of map.regional.structures.filter(s=>s.kind==='interchange'&&s.roadIds.some(id=>ids.has(id))))for(const id of structure.roadIds)ids.add(id);
  for(const r of map.roads)if(ids.has(r.id)&&r.highwayTransition){ids.add(r.highwayTransition.mainRoadId);ids.add(r.highwayTransition.decisionId);}
  for(const l of map.roadLinks)if(ids.has(l.from.roadId)||ids.has(l.to.roadId)){ids.add(l.from.roadId);ids.add(l.to.roadId);}
  const roads=map.roads.filter(r=>ids.has(r.id));
  const sample={...map,roads,intersections:[],objects:[],signs:[],connectionPorts:[],roadLinks:map.roadLinks.filter(l=>ids.has(l.from.roadId)&&ids.has(l.to.roadId))};
  report[hub.name]=api.validatePresetGeometry(sample);
  console.log(hub.name,JSON.stringify(report[hub.name]));
 }
 if(map.regional.highways&&!selected){
  const numbers=new Set(['G42','G65','S18','S36','S31','S29','S89']);
  const added=map.roads.filter(r=>numbers.has(r.roadNameId)||r.id.includes('-extension:'));
  const boxes=added.map(r=>({minX:Math.min(...r.centerline.map(p=>p.x))-100,maxX:Math.max(...r.centerline.map(p=>p.x))+100,minZ:Math.min(...r.centerline.map(p=>p.z))-100,maxZ:Math.max(...r.centerline.map(p=>p.z))+100}));
  const nearby=map.roads.filter(r=>r.id.startsWith('regional:')&&r.centerline.some(p=>boxes.some(b=>p.x>=b.minX&&p.x<=b.maxX&&p.z>=b.minZ&&p.z<=b.maxZ))),ids=new Set(nearby.map(r=>r.id));
  // Include complete touched hubs and auxiliary provenance so cropped samples
  // retain their real branch context rather than inventing disconnected ribbons.
  for(const hub of map.regional.structures.filter(s=>s.kind==='interchange'&&s.roadIds.some(id=>ids.has(id))))for(const id of hub.roadIds)ids.add(id);
  for(const r of map.roads)if(ids.has(r.id)&&r.highwayTransition){ids.add(r.highwayTransition.mainRoadId);ids.add(r.highwayTransition.decisionId);}
  for(const l of map.roadLinks)if(ids.has(l.from.roadId)&&ids.has(l.to.roadId))continue;else if(ids.has(l.from.roadId)||ids.has(l.to.roadId)){const other=ids.has(l.from.roadId)?l.to.roadId:l.from.roadId;if(other.startsWith('regional:'))ids.add(other);}
  const roads=map.roads.filter(r=>ids.has(r.id));
  const sample={...map,roads,intersections:[],objects:map.objects.filter(o=>o.id.startsWith('regional:extension-tree:')),signs:[],connectionPorts:[],roadLinks:map.roadLinks.filter(l=>ids.has(l.from.roadId)&&ids.has(l.to.roadId))};
  report['新增外围高速']=api.validatePresetGeometry(sample);
 }
 fs.writeFileSync(selected?'artifacts/highway-system/selected-geometry.json':'artifacts/regional-world/interchange-geometry.json',JSON.stringify(report,null,2));
 for(const [name,issues]of Object.entries(report))console.log(name,issues.map(i=>i.code+' '+i.path+' '+i.message).join('\n'));
 if(Object.values(report).some(issues=>issues.length))process.exitCode=1;
}catch(e){console.error(String(e.stack??e).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'<regional-geometry>'));process.exitCode=1;}
