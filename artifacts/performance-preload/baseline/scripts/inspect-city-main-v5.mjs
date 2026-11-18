import fs from 'node:fs';import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export {signDecisionNodes,generateTopologySigns} from './src/world/city/SignPlacementGenerator';export {roadPoints,polylineLength} from './src/world/city/geometry';export {cityMainCrossingIssues} from './src/world/city/CityMain.selftest';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
try {
const api=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64')),map=JSON.parse(fs.readFileSync('artifacts/city-main-v5/candidate.json','utf8'));
if(process.argv.includes('--signs')){map.signs=api.generateTopologySigns(map);fs.writeFileSync('artifacts/city-main-v5/candidate.json',JSON.stringify(map,null,2)+'\n');}
const missing=JSON.parse(map.environment.metadata.signMissingRequirements),decisions=api.signDecisionNodes(map);
console.log(JSON.stringify(missing.map(key=>{const d=decisions.find(d=>key.startsWith(d.id+':')),r=map.roads.find(r=>r.id===d.incoming.roadId);return{key,len:api.polylineLength(api.roadPoints(r)),road:r.centerline,ends:map.intersections.filter(j=>j.connections.some(c=>c.roadId===r.id)).map(j=>({id:j.id,p:j.position,c:j.connections})),links:map.roadLinks.filter(l=>[l.from,l.to].some(e=>e.roadId===r.id))};}),null,2));
if(process.argv.includes('--crossings')){const issues=api.cityMainCrossingIssues(map).filter(s=>s.includes('v5-'));fs.writeFileSync('artifacts/city-main-v5/crossing-issues.json',JSON.stringify(issues,null,2));console.log('NEW STREET CROSSINGS',issues);}
const dangling=map.roads.filter(r=>r.id.startsWith('v5-')).flatMap(r=>['start','end'].filter(end=>!map.intersections.some(j=>j.connections.some(c=>c.roadId===r.id&&c.end===end))&&!map.roadLinks.some(l=>[l.from,l.to].some(e=>e.roadId===r.id&&e.end===end))).map(end=>({id:r.id,end,p:r.centerline[end==='start'?0:r.centerline.length-1]})));
console.log('DANGLING',JSON.stringify(dangling));
}catch(e){console.error(String(e.stack??e).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'<v5-inspect>'));process.exitCode=1;}
