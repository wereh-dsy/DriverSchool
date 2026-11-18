import fs from 'node:fs';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

// One focused map-content check. Does not run the core, vehicle or platform suites.
const bundle=await build({stdin:{contents:`
export {loadCityMap} from './src/world/city/CityMapLoader';
export {buildCityRoadNetwork} from './src/world/city/CityRoadNetwork';
export {roadPoints,polylineLength,portDirection,rotatePoint} from './src/world/city/geometry';
export {roadEdgeChains} from './src/world/city/RoadEdgeChain';
export {cityGroundGeometry} from './src/world/city/CityGroundGeometry';
export {runMapGeometryConsistencySelfTest} from './src/world/navigation/MapGeometryConsistency.selftest';
export {cityFeatureCrossings} from './src/world/city/maps/CityMainV6Geography';
export {cityUrbanElevationCrossings} from './src/world/city/maps/CityMainGroundElevation';
export {CityTrafficSignals} from './src/world/city/CityTrafficSignals';
export {junctionApproachExtent} from './src/world/city/JunctionSurface';
export {RoadClearance} from './src/world/city/RoadClearance';
export {signDimensions,ROAD_SIGN_POST_Z} from './src/world/city/RoadSignTemplates';
export {RegionalTerrainSampler} from './src/world/regional/RegionalTerrain';
`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const a=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const input=process.argv[2]??'.tmp-city-v7-candidate.json',m=a.loadCityMap(JSON.parse(fs.readFileSync(input,'utf8'))),before=JSON.parse(fs.readFileSync('.tmp-city-v7-baseline.json','utf8'));
const roads=m.roads.filter(r=>!r.id.startsWith('regional:')),byId=new Map(m.roads.map(r=>[r.id,r])),old=new Map(before.roads.map(r=>[r.id,r])),net=a.buildCityRoadNetwork(m);
const minimum=Math.min(...roads.map(r=>a.polylineLength(a.roadPoints(r))));
assert(minimum>=9.999,'City road fragment below 10 m');
const grade=r=>r.centerline.slice(1).reduce((max,p,i)=>Math.max(max,Math.abs((p.y??0)-(r.centerline[i].y??0))/Math.hypot(p.x-r.centerline[i].x,p.z-r.centerline[i].z)),0);
assert(roads.every(r=>grade(r)<=.1201),'City road grade');
const main=roads.filter(r=>r.laneCount===3&&!r.gore);
assert(main.every(r=>grade(r)<=.0601),'Mainline grade');
const edges=new Map(m.roads.map(r=>[r.id,new Set()]));
for(const n of net.connectivity)for(const from of n.incomingRoadIds)for(const to of n.outgoingRoadIds)edges.get(from).add(to);
const queue=[roads.find(r=>r.roadNameId==='central-avenue').id],seen=new Set(queue);
for(let i=0;i<queue.length;i++)for(const id of edges.get(queue[i]))if(!seen.has(id)){seen.add(id);queue.push(id);}
assert(roads.every(r=>seen.has(r.id)),'Unreachable City road');
for(const f of m.environment.corridors)for(const r of roads)for(const c of a.cityFeatureCrossings(r,f.centerline))assert(f.kind==='railway'?Math.abs(c.point.y)>=6.1:c.point.y>=2.9,'Rail/river clearance: '+r.id);
assert(!a.cityUrbanElevationCrossings(m).some(c=>Math.abs(c.oldA-c.oldB)<5.75),'Unconnected urban crossing');
let southeastCrossings=0;
for(const r of roads.filter(r=>r.groupId==='peripheral-interchange'))for(const other of m.roads.filter(o=>o!==r&&(o.type==='highway'||o.gore||o.type==='ramp_1')))for(const c of a.cityFeatureCrossings(r,other.centerline)){
  if(net.endpointNodes.some(n=>n.ends.some(e=>e.roadId===r.id)&&n.ends.some(e=>e.roadId===other.id)&&Math.hypot(c.point.x-n.position.x,c.point.z-n.position.z)<180))continue;
  const reverse=a.cityFeatureCrossings(other,r.centerline).find(q=>Math.hypot(c.point.x-q.point.x,c.point.z-q.point.z)<.1);
  if(!reverse)continue;
  assert(Math.abs(c.point.y-reverse.point.y)>=5.75,'Southeast motorway crossing '+r.id+' / '+other.id);southeastCrossings++;
}
const ring=main.filter(r=>r.roadNameId==='ring-expressway'),ordered=[ring.find(r=>r.id.startsWith('ring-cw-'))];
while(Math.hypot(ordered.at(-1).centerline.at(-1).x-ordered[0].centerline[0].x,ordered.at(-1).centerline.at(-1).z-ordered[0].centerline[0].z)>.1){const p=ordered.at(-1).centerline.at(-1),next=ring.find(r=>!ordered.includes(r)&&Math.hypot(r.centerline[0].x-p.x,r.centerline[0].z-p.z)<.1);assert(next,'Continuous ring');ordered.push(next);}
const polygon=ordered.flatMap(r=>r.centerline),inside=p=>{let yes=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const aa=polygon[i],bb=polygon[j];if((aa.z>p.z)!==(bb.z>p.z)&&p.x<(bb.x-aa.x)*(p.z-aa.z)/(bb.z-aa.z)+aa.x)yes=!yes;}return yes;};
const buildingIds=['residential_low','residential_mid','office','commercial','industrial','school','garage','stadium'];
const districts={};
for(const d of m.environment.districts){const objects=m.objects.filter(o=>!o.id.startsWith('regional:')&&o.district===d.id&&buildingIds.includes(o.prefabId));districts[d.id]={inside:objects.filter(o=>inside(o.position)).length,outside:objects.filter(o=>!inside(o.position)).length};if(['xixing','qinghe','jincheng'].includes(d.id))assert.equal(districts[d.id].outside,0,d.name+' buildings inside ring');else assert(districts[d.id].inside>0&&districts[d.id].outside>0,d.name+' spans ring');}
const regionalChanged=m.roads.filter(r=>r.id.startsWith('regional:')&&JSON.stringify(r)!==JSON.stringify(old.get(r.id)));
assert(regionalChanged.every(r=>grade(r)<=.0601),'Regional approach grade');
for(const s of before.regional.structures)for(const id of s.roadIds)assert.deepEqual(byId.get(id),old.get(id),'Retained Regional structure '+s.id);
assert.deepEqual(m.regional.structures,before.regional.structures,'Regional structures metadata');
const clearance=new a.RoadClearance(m),signals=new a.CityTrafficSignals(m);let poles=0,posts=0;
for(const [index,j]of m.intersections.entries())if(!j.id.startsWith('regional:')&&j.signalized)for(const c of j.connections){const r=byId.get(c.roadId);if(r.travelDirection!=='two-way'&&(r.travelDirection==='forward')!==(c.end==='end'))continue;const d=a.rotatePoint(a.portDirection(j,c.port),j.rotation);signals.placePole(index,d,{x:d.z,z:-d.x},a.junctionApproachExtent(j,m,c.port),r.laneCount*r.laneWidth,7.2);poles++;}signals.dispose();
for(const s of m.signs.filter(s=>!s.roadId.startsWith('regional:')||regionalChanged.some(r=>r.id===s.roadId))){const dim=a.signDimensions(s.template,s.size,s.postOffset,s.gantryPosts,s.mountHeight),base=s.postBaseY??s.position.y??0;for(const x of dim.posts){const d=a.rotatePoint({x,z:a.ROAD_SIGN_POST_Z},s.heading),p={x:s.position.x+d.x,z:s.position.z+d.z};assert(!clearance.roadAt(p,.65,base-.15,s.position.y+dim.poleTop,undefined,undefined,true)&&!clearance.junctionAt(p,.65,base-.15,s.position.y+dim.poleTop),'Sign support '+s.id);posts++;}}
const terrain=new a.RegionalTerrainSampler(m),oldTerrain=new a.RegionalTerrainSampler(before);
for(const area of m.regional.cityExtensions)assert.equal(terrain.macroHeight((area.minX+area.maxX)/2,(area.minZ+area.maxZ)/2),-.04,'Urban extension terrain');
for(const s of before.regional.structures.filter(s=>s.kind==='tunnel'))assert.equal(terrain.macroHeight(s.center.x,s.center.z),oldTerrain.macroHeight(s.center.x,s.center.z),'Retained tunnel hillside');
let groundVertices=0;
for(const bounds of [m.regional.cityBounds,...m.regional.cityExtensions]){const geometry=a.cityGroundGeometry({...m,bounds}),p=geometry.getAttribute('position');assert(p.count>0&&p.count<2_000_000,'Finite ground clipping result');assert(p.array.every(Number.isFinite),'Ground finite vertices');groundVertices+=p.count;geometry.dispose();}
// Repeated, collinear cut boundaries must produce the same opening as one cut.
const fixture={schemaVersion:2,id:'clip',name:'clip',version:1,sectorSize:100,bounds:{minX:-50,maxX:50,minZ:-50,maxZ:50},roads:Array.from({length:4},(_,i)=>({id:'cut-'+i,type:'urban_2lane',centerline:Array.from({length:41},(_,j)=>({x:0,y:-5,z:-40+j*2})),laneCount:2,laneWidth:3.5,travelDirection:'two-way',speedLimit:30,curve:'polyline',elevationMode:'custom',structure:{barrierOffset:0,enclosure:{kind:'cutting',clearance:6}}})),intersections:[],objects:[],roadLinks:[],connectionPorts:[],environment:{districts:[],spawnPoints:[{id:'start',position:{x:20,y:0,z:20},rotation:0}]}};
const g=a.cityGroundGeometry(fixture),p=g.getAttribute('position');let area=0;
for(let i=0;i<p.count;i+=3)area+=Math.abs((p.getX(i+1)-p.getX(i))*(p.getZ(i+2)-p.getZ(i))-(p.getZ(i+1)-p.getZ(i))*(p.getX(i+2)-p.getX(i)))/2;
const chains=a.roadEdgeChains(fixture),left=chains.barrierEdge(fixture.roads[0],-1)[0],right=chains.barrierEdge(fixture.roads[0],1)[0];
assert(Math.abs(area-(10000-Math.abs(right.x-left.x)*80))<.05,'Repeated cuts preserve ground area and opening');g.dispose();
const report={scope:'City V7 map delta only; no full-core/full-project suites',version:m.version,cityRoads:roads.length,minimumRoadMetres:minimum,maximumGrade:Math.max(...roads.map(grade)),maximumMainlineGrade:Math.max(...main.map(grade)),reachableCityRoads:roads.length,districtBuildings:districts,changedRegionalApproachRoads:regionalChanged.length,retainedRegionalStructures:before.regional.structures.length,signalPoles:poles,signPosts:posts,groundVertices,groundClipRegression:'passed',railRiverCrossings:'passed',urbanCrossings:'passed',southeastCrossings,geometry:a.runMapGeometryConsistencySelfTest(m),parcels:JSON.parse(m.environment.metadata.v7Parcels),continuity:JSON.parse(m.environment.metadata.v7Continuity)};
fs.mkdirSync('artifacts/city-v7',{recursive:true});fs.writeFileSync('artifacts/city-v7/validation.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,parcels:{movedBuildings:report.parcels.movedBuildings.length,adjustedFurniture:report.parcels.adjustedFurniture.length}},null,2));
