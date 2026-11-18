import fs from 'node:fs';import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`
export {loadCityMap} from './src/world/city/CityMapLoader';
export {validateMap} from './src/world/city/CityMapValidation';
export {buildCityRoadNetwork} from './src/world/city/CityRoadNetwork';
export {roadPoints,polylineLength,portDirection,rotatePoint,sampleAt} from './src/world/city/geometry';
export {cityGroundGeometry} from './src/world/city/CityGroundGeometry';
export {cityTerrainOffsetAt} from './src/world/city/CityTerrain';
export {runMapGeometryConsistencySelfTest} from './src/world/navigation/MapGeometryConsistency.selftest';
export {cityFeatureCrossings} from './src/world/city/maps/CityMainV6Geography';
export {cityUrbanElevationCrossings} from './src/world/city/maps/CityMainGroundElevation';
export {runCityTrafficSignalsSelfTest} from './src/world/city/CityTrafficSignals.selftest';
export {RoadClearance} from './src/world/city/RoadClearance';
export {signDimensions,ROAD_SIGN_POST_Z} from './src/world/city/RoadSignTemplates';
export {RegionalTerrainSampler} from './src/world/regional/RegionalTerrain';
`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
fs.writeFileSync('.tmp-city-v8-check-api.mjs',bundle.outputFiles[0].text);const a=await import('../.tmp-city-v8-check-api.mjs?'+Date.now());
const m=a.loadCityMap(JSON.parse(fs.readFileSync(process.argv[2]??'.tmp-city-v8-candidate.json','utf8'))),before=JSON.parse(fs.readFileSync('.tmp-city-v8-baseline.json','utf8')),validation=a.validateMap(m),failures=[];
const check=(ok,message)=>{if(!ok)failures.push(message)},grade=r=>r.centerline.slice(1).reduce((n,p,i)=>Math.max(n,Math.abs(p.y-r.centerline[i].y)/Math.hypot(p.x-r.centerline[i].x,p.z-r.centerline[i].z)),0),roads=m.roads.filter(r=>!r.id.startsWith('regional:')||r.id.startsWith('regional:v8:')),byId=new Map(m.roads.map(r=>[r.id,r])),net=a.buildCityRoadNetwork(m);
const minimum=Math.min(...roads.map(r=>a.polylineLength(a.roadPoints(r))));check(minimum>=9.999,'City segment shorter than 10m');
for(const r of roads){check(grade(r)<=.1201,'Road grade '+r.id+' '+grade(r));if(r.laneCount===3&&!r.gore)check(grade(r)<=.0601,'Mainline grade '+r.id);if(r.type==='ramp_1'&&r.id.startsWith('v8-')&&r.groupId!=='v8-century-square')check(grade(r)<=.0801,'New access ramp grade '+r.id);}
const edges=new Map(m.roads.map(r=>[r.id,new Set()]));for(const n of net.connectivity)for(const f of n.incomingRoadIds)for(const t of n.outgoingRoadIds)edges.get(f).add(t);
const queue=[roads.find(r=>r.roadNameId==='central-avenue').id],seen=new Set(queue);for(let i=0;i<queue.length;i++)for(const id of edges.get(queue[i]))if(!seen.has(id)){seen.add(id);queue.push(id);}check(roads.every(r=>seen.has(r.id)),'Unreachable City roads '+roads.filter(r=>!seen.has(r.id)).map(r=>r.id).join(','));
const urban=a.cityUrbanElevationCrossings(m);for(const c of urban)check(Math.abs(c.oldA-c.oldB)>=5.749,'Urban clearance '+c.a+' / '+c.b+' '+Math.abs(c.oldA-c.oldB));
let rampCrossings=0;const scoped=m.roads.filter(r=>(r.id.startsWith('v8-')||r.groupId==='peripheral-interchange'||r.id.startsWith('regional:v8:'))&&(r.type==='ramp_1'||r.type==='highway'));
for(const r of scoped)for(const other of m.roads.filter(o=>o!==r&&(o.type==='highway'||o.type==='ramp_1')))for(const c of a.cityFeatureCrossings(r,other.centerline)){
 if(net.endpointNodes.some(n=>n.ends.some(e=>e.roadId===r.id)&&n.ends.some(e=>e.roadId===other.id)&&Math.hypot(c.point.x-n.position.x,c.point.z-n.position.z)<180))continue;
 const rev=a.cityFeatureCrossings(other,r.centerline).find(q=>Math.hypot(c.point.x-q.point.x,c.point.z-q.point.z)<.1);if(!rev)continue;
 check(Math.abs(c.point.y-rev.point.y)>=5.749,'Ramp clearance '+r.id+' / '+other.id+' '+Math.abs(c.point.y-rev.point.y));rampCrossings++;
}
let geographyCrossings=0;for(const f of m.environment.corridors??[])for(const r of roads)for(const c of a.cityFeatureCrossings(r,f.centerline)){check(f.kind==='railway'?Math.abs(c.point.y)>=6.1:c.point.y>=2.9,'Rail / river clearance '+r.id);geographyCrossings++;}
check(!m.roads.some(r=>r.groupId==='peripheral-interchange'&&r.id.endsWith('-loop')),'Southeast inward loop retained');check(!m.regional.structures.some(s=>s.id==='regional:nangang'||s.id==='regional:donglin-service'),'Retired service court retained');
check(!roads.some(r=>r.travelDirection==='two-way'&&r.type!=='highway'&&!r.roadNameId),'Unnamed ordinary road');
for(const j of m.intersections)if(j.connections.some(c=>byId.get(c.roadId).roadNameId?.startsWith('v8-ring-')))check(!j.signalized,'Signal at ring access landing '+j.id);
const terrain=new a.RegionalTerrainSampler(m);let vertices=0;for(const area of [m.regional.cityBounds,...m.regional.cityExtensions]){const g=a.cityGroundGeometry({...m,bounds:area}),p=g.getAttribute('position');check(p.array.every(Number.isFinite),'Nonfinite terrain');vertices+=p.count;g.dispose();}
for(const f of m.environment.landforms)check(Math.abs(terrain.macroHeight(f.center.x,f.center.z)-(-.04+a.cityTerrainOffsetAt(m.environment.landforms,f.center.x,f.center.z)))<1e-6,'Landform contact / mesh height '+f.id);
const clearance=new a.RoadClearance(m);let posts=0;for(const s of m.signs.filter(s=>!s.roadId.startsWith('regional:')||s.roadId.startsWith('regional:v8:'))){const dim=a.signDimensions(s.template,s.size,s.postOffset,s.gantryPosts,s.mountHeight),base=s.postBaseY??s.position.y??0;for(const x of dim.posts){const d=a.rotatePoint({x,z:a.ROAD_SIGN_POST_Z},s.heading),p={x:s.position.x+d.x,z:s.position.z+d.z};check(!clearance.roadAt(p,.65,base-.15,s.position.y+dim.poleTop,undefined,undefined,true)&&!clearance.junctionAt(p,.65,base-.15,s.position.y+dim.poleTop),'Sign support '+s.id);posts++;}}
let geometry,signals;try{geometry=a.runMapGeometryConsistencySelfTest(m)}catch(e){failures.push(e.message)}try{signals=a.runCityTrafficSignalsSelfTest(m)}catch(e){failures.push(e.message)}
const report={scope:'City V8 map content, terrain and changed signal behavior only; no full core / vehicle / platform suite',version:m.version,schema:{errors:validation.errorCount,warnings:validation.warnings},cityRoads:roads.length,reachableRoads:roads.filter(r=>seen.has(r.id)).length,minimumRoadMetres:minimum,maximumCityGrade:Math.max(...roads.map(grade)),rampCrossings,geographyCrossings,urbanCrossings:urban.length,signPosts:posts,groundVertices:vertices,geometry,signals,landscape:JSON.parse(m.environment.metadata.v8Landscape),failures};fs.mkdirSync('artifacts/city-v8',{recursive:true});fs.writeFileSync('artifacts/city-v8/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(failures.length)process.exitCode=1;
