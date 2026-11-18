import {build} from 'esbuild';
import {readFile,writeFile,access} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const dir=resolve('artifacts/road-geometry-round6');
const exports="export {loadCityMap} from './src/world/city/CityMapLoader';export {compileCityRuntimeData} from './src/world/city/CityRuntimeData';export {roadPiers,enclosureWallSectionSteps,roadStructureColliders} from './src/world/city/RoadInfrastructure';export {RoadClearance} from './src/world/city/RoadClearance';export {roadEdgeChains} from './src/world/city/RoadEdgeChain';export {roadPoints,roadEdges,rotatePoint,polylineLength,sampleAt} from './src/world/city/geometry';export {regionalTerrainSampler} from './src/world/regional/RegionalTerrain';export {PrefabRegistry} from './src/world/city/PrefabRegistry';export {createSubject3Materials} from './src/world/subject3/materials';export {MapAnalysisContext} from './src/editor/MapAnalysis';export {editableObjects,objectIssues,prefabRecord} from './src/editor/ObjectAnalysis';";
await build({stdin:{contents:exports,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:dir+'/audit-lib.mjs',define:{'import.meta.env.DEV':'false'},logLevel:'warning'});
if(process.argv.includes('--lib-only'))process.exit(0);
try{await access(dir+'/round5-visual-baseline.mjs');}catch{await build({stdin:{contents:"export {RoadBuilder} from './src/world/city/RoadBuilder';export {IntersectionBuilder} from './src/world/city/IntersectionBuilder';export {CityTrafficSignals} from './src/world/city/CityTrafficSignals';export {cityGroundSectorGeometrySteps} from './src/world/city/CityGroundGeometry';export {RegionalTerrain} from './src/world/regional/RegionalTerrain';export {RegionalTerrainClearance} from './src/world/regional/RegionalTerrainClearance';export {registerImmutableRoadGeometry} from './src/world/city/RoadGeometryTrialCache';",resolveDir:process.cwd()},bundle:true,platform:'browser',format:'esm',external:['three','three/*'],outfile:dir+'/round5-visual-baseline.mjs',define:{'import.meta.env.DEV':'false'},logLevel:'warning'});}
const lib=await import(pathToFileURL(dir+'/audit-lib.mjs').href),raw=JSON.parse(await readFile(dir+'/baseline/regional-main.json','utf8')),map=lib.loadCityMap(raw),materials=lib.createSubject3Materials(),prefabs=new lib.PrefabRegistry(materials),clearance=new lib.RoadClearance(map);
const original=JSON.parse(await readFile('artifacts/road-geometry-round5/pier-conflicts.json','utf8')),objectIds=[...new Set(original.details.map(p=>p.objectId))];
const nearRoads=map.roads.filter(r=>r.centerline.some(p=>objectIds.some(id=>{const o=map.objects.find(o=>o.id===id);return Math.hypot(p.x-o.position.x,p.z-o.position.z)<550;})));
const piers=nearRoads.flatMap(r=>lib.roadPiers(r,map,clearance).map(p=>({roadId:r.id,x:p.position.x,z:p.position.z,minHeight:p.baseY,maxHeight:p.baseY+p.height,halfWidth:.6,halfLength:.6,yaw:0})));
const flatBox=b=>b?{...b,x:b.center.x,z:b.center.z}:null;
const objects=map.objects.map(o=>({object:o,box:flatBox(prefabs.collider(o))})).filter(o=>o.box);
function overlaps(a,b,pad=0){if(a.maxHeight<=b.minHeight||b.maxHeight<=a.minHeight)return false;const axes=[a.yaw,b.yaw].flatMap(y=>[{x:Math.cos(y),z:-Math.sin(y)},{x:Math.sin(y),z:Math.cos(y)}]);const extent=(box,v)=>Math.abs(v.x*Math.cos(box.yaw)-v.z*Math.sin(box.yaw))*box.halfWidth+Math.abs(v.x*Math.sin(box.yaw)+v.z*Math.cos(box.yaw))*box.halfLength;return axes.every(v=>Math.abs((a.x-b.x)*v.x+(a.z-b.z)*v.z)<extent(a,v)+extent(b,v)+pad);}
const roads=nearRoads.flatMap(r=>{const p=lib.roadPoints(r),e=lib.roadEdges(r),walk=r.sidewalk?.enabled?r.sidewalk.width:0,width=e.right-e.left+2*walk;return p.slice(1).map((b,i)=>{const a=p[i],l=Math.hypot(b.x-a.x,b.z-a.z),mid=(e.left+e.right)/2;return{x:(a.x+b.x)/2-(b.z-a.z)/(l||1)*mid,z:(a.z+b.z)/2+(b.x-a.x)/(l||1)*mid,halfWidth:width/2,halfLength:l/2,yaw:Math.atan2(b.x-a.x,b.z-a.z),minHeight:Math.min(a.y??0,b.y??0)-.65,maxHeight:Math.max(a.y??0,b.y??0)+.3,roadId:r.id};});});
const proposals=[];const terrain=lib.regionalTerrainSampler(map);
for(const id of objectIds){const o=map.objects.find(o=>o.id===id),base=flatBox(prefabs.collider(o));let chosen;
 for(let d=5;d<=250&&!chosen;d+=5)for(let k=0;k<48&&!chosen;k++){const a=k*Math.PI/24,x=o.position.x+Math.cos(a)*d,z=o.position.z+Math.sin(a)*d,y=o.position.y??0,candidate={...base,x,z,minHeight:y,maxHeight:y+(base.maxHeight-base.minHeight)};
  // Do not escape a pier by burying/lowering a building. Keep its authored Y;
  // require support close to that height at the proposed location.
  if(Math.abs(terrain.heightAt(x,z)-y)>1)continue;
  if(piers.some(p=>overlaps(candidate,p,2))||roads.some(r=>overlaps(candidate,r,2))||objects.some(b=>b.object.id!==id&&overlaps(candidate,b.box,3)))continue;
  const transformed={...o,position:{x,y,z}},issues=lib.objectIssues(new lib.MapAnalysisContext(map),lib.prefabRecord(transformed));if(issues.some(i=>i.severity==='error'||/overlap|carriageway|deck|tunnel/.test(i.code)))continue;
  chosen={id,before:o.position,after:{x,y,z},distance:d,issues,op:{op:'moveObject',id,delta:{x:x-o.position.x,y:y-(o.position.y??0),z:z-o.position.z}}};objects.find(b=>b.object.id===id).box=candidate;
 }
 proposals.push(chosen??{id,unresolved:true});
}
// Only offer walls with authored sidewalks; do not invent new footways or alter
// shoulders/traffic surface width. Candidate safety is checked before applying.
const walkCandidates=map.roads.filter(r=>r.sidewalk?.enabled&&r.structure?.enclosure).map(r=>{const e=lib.roadEdges(r),half=r.laneCount*r.laneWidth/2,needed=Math.max(0,r.sidewalk.width+.05-Math.min(-e.left-half,e.right-half)),offset=Math.max(r.structure.barrierOffset??0,needed);return{id:r.id,kind:r.structure.enclosure.kind,authoredWidth:r.sidewalk.width,oldOffset:r.structure.barrierOffset??0,offset,changed:offset>(r.structure.barrierOffset??0)+1e-6};});
await writeFile(dir+'/layout-proposals.json',JSON.stringify({piersInNeighbourhood:piers.length,proposals,walkCandidates},null,2)+'\n');
prefabs.dispose();for(const m of new Set(Object.values(materials)))m?.dispose?.();console.log(JSON.stringify({buildings:proposals.map(p=>({id:p.id,before:p.before,after:p.after,distance:p.distance,unresolved:p.unresolved})),walkCandidates:walkCandidates.length,needWidth:walkCandidates.filter(c=>c.changed).length}));
