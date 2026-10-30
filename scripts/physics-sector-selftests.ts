import assert from 'node:assert/strict';
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { CityGround } from '../src/world/city/CityGround';
import { newCityMap, type CityRoad } from '../src/world/city/CityMapData';
import { compileCityRuntimeData } from '../src/world/city/CityRuntimeData';
import { VehicleContactSystem } from '../src/vehicle/physics/VehicleContactSystem';
import { VehicleCollisionSystem } from '../src/vehicle/physics/CollisionSystem';
import { drain } from '../src/loading/Loading';
import { cityGroundSectorGeometrySteps } from '../src/world/city/CityGroundGeometry';
import { roadStructureColliderSteps } from '../src/world/city/RoadInfrastructure';
import { runtimeRoadClearance } from '../src/world/city/RoadClearance';

// Use the existing visual-worker branch without GPU work. No automated driving.
Object.defineProperty(globalThis,'Worker',{configurable:true,value:class {postMessage(){} terminate(){}}});
const map=newCityMap();map.id='physics-sector-fixture';map.sectorSize=200;
map.bounds={minX:-400,maxX:400,minZ:-400,maxZ:6400};
map.regional={version:1,terrainBounds:map.bounds,cityBounds:{minX:-200,maxX:200,minZ:-200,maxZ:200},routes:[],structures:[],exits:[]};
map.environment.spawnPoints=[{id:'spawn',position:{x:3,z:100,y:8},rotation:Math.PI}];
const road=(id:string,z:number,height=8):CityRoad=>({id,type:'urban_2lane',laneCount:2,laneWidth:3.5,travelDirection:'two-way',speedLimit:80,centerline:[{x:0,z,y:height},{x:0,z:z+200,y:height}],structure:{barrierEnabled:true,piersEnabled:false},elevationMode:'custom'});
map.roads=[road('near',0),road('adjacent',200),road('warm',500),road('forward',800),road('remote',6000),road('lower',0,0)];
const runtime=compileCityRuntimeData(map),ground=new CityGround(runtime.map,{runtime,deferred:true});
// A local cutting must stay open after splitting the visual ground into sectors.
const cutMap=structuredClone(map);cutMap.roads=[road('cut',-180,-4)];
cutMap.roads[0]!.structure={piersEnabled:false,enclosure:{kind:'cutting',clearance:5}};
const patch=drain(cityGroundSectorGeometrySteps(cutMap,'0,0'));
assert.ok(patch.length>0);
const groundMaterial=new MeshBasicMaterial(),groundMesh=new Mesh(patch[0]!,groundMaterial);
groundMesh.updateMatrixWorld(true);
assert.equal(new Raycaster(new Vector3(3,10,10),new Vector3(0,-1,0)).intersectObject(groundMesh).length,0,'cutting stays open');
assert.ok(new Raycaster(new Vector3(50,10,10),new Vector3(0,-1,0)).intersectObject(groundMesh).length>0,'ground outside cutting remains');
patch.forEach(g=>{g.computeBoundingBox();assert.ok(g.boundingBox!.min.x>=0&&g.boundingBox!.max.x<=200);g.dispose();});groundMaterial.dispose();
const farPatch=drain(cityGroundSectorGeometrySteps(cutMap,'0,0',cutMap.sectorSize/8));
assert.ok(farPatch.some(g=>g.getAttribute('position').count>0),'city far background is retained when detailed sectors unload');farPatch.forEach(g=>g.dispose());
const longMap=structuredClone(map);longMap.roads=[road('long',0)];longMap.roads[0]!.centerline[1]!.z=5000;
const longSteps=roadStructureColliderSteps(longMap.roads[0]!,longMap,runtimeRoadClearance(longMap));
let preparationYields=0,primitives=0;
for(const step of longSteps) {if(step)primitives++;else preparationYields++;}
assert.ok(preparationYields>50&&primitives>0,'long-road preparation yields before primitive publication');
await ground.prepare();
assert.equal(ground.sectors.streamsGround,true);
assert.ok(ground.root.children.every(child=>!(child instanceof Mesh)),'streamed ground has no eager whole-map mesh');
const spawn=ground.physicsStatistics!;
assert.equal(spawn.readySectors,spawn.requestedActiveSectors,'spawn active region fully ready');
assert.ok(spawn.cachedRoads<map.roads.length,'does not wait for all roads');
assert.ok(ground.colliders.some(c=>c.id.startsWith('near:')));
assert.ok(!ground.colliders.some(c=>c.id.startsWith('remote:')));
assert.equal(ground.sampleRoadSurface(3,100,undefined,8).height,8);
assert.equal(ground.sampleRoadSurface(3,100,undefined,0).height,0,'vertical support layers remain available');
const spawnRevision=ground.colliderRevision;
for(let batch=0;batch<8;batch++) ground.update(0);
assert.ok(ground.physicsStatistics!.cachedColliders>ground.physicsStatistics!.colliders,'preload retains unregistered warm primitives');
assert.equal(ground.colliderRevision,spawnRevision,'background cache completion does not rebuild the contact index');
const contacts=new VehicleContactSystem(ground,{width:1.8,length:4.5});
const prepare=(x:number,z:number,speed:number,lateral=0)=>
  (contacts as unknown as {preparePhysics(x:number,z:number,yaw:number,speed:number,lateral:number,dt:number):void}).preparePhysics(x,z,Math.PI,speed,lateral,1/120);
for(const z of [190,199,201,225]) { prepare(3,z,55);assert.equal(ground.sampleRoadSurface(3,z,undefined,8).height,8);assert.ok(contacts.collisionSystem.getNearbyColliders({x:3,z},15).length>0,'adjacent sector has physical rails before contact'); }
ground.updatePlayerPosition(3,300,Math.PI,55);
assert.ok(ground.physicsStatistics!.forwardMetres>0,'speed adds a forward corridor');
prepare(3,810,70);assert.ok(contacts.collisionSystem.getNearbyColliders({x:3,z:810},15).some(c=>c.id.startsWith('forward:')),'priority fallback refreshes contact index before sweep');
assert.ok(ground.physicsStatistics!.synchronousFallbacks>0);
const revision=ground.colliderRevision;prepare(3,810,70);assert.equal(ground.colliderRevision,revision,'ready guard does not rebuild');
ground.updatePlayerPosition(3,6000,Math.PI,0);prepare(3,6010,-5,10);
assert.ok(contacts.collisionSystem.getNearbyColliders({x:3,z:6010},15).some(c=>c.id.startsWith('remote:')));
ground.update(0);prepare(3,6010,0);
assert.ok(!ground.colliders.some(c=>c.id.startsWith('near:')),'distant road primitives released after hysteresis');
const collision=new VehicleCollisionSystem(ground.colliders);
assert.ok(collision.getNearbyColliders({x:3,z:6010},15).length>0);
ground.dispose();
delete (globalThis as {Worker?:unknown}).Worker;
const {createDrivingGround}=await import('../src/world/DrivingGroundCatalog');
const small=createDrivingGround('road-course');assert.equal(small.preparePhysicsStep,undefined);assert.ok(Number.isFinite(small.getRoadHeightAt(small.spawnPose.position.x,small.spawnPose.position.z)));small.dispose();
console.log('Physics sector spawn / adjacent crossing / priority fallback / multi-level support / hysteresis / small-ground compatibility: PASS');

if(process.argv.includes('--regional-sample')) {
  Object.defineProperty(globalThis,'Worker',{configurable:true,value:class {postMessage(){} terminate(){}}});
  const file=readdirSync('dist/assets').find(f=>/^city-main\.runtime-.*\.json$/.test(f))!;
  const actual=JSON.parse(readFileSync(`dist/assets/${file}`,'utf8'));
  const started=performance.now(),regional=new CityGround(actual.map,{runtime:actual,deferred:true});
  await regional.prepare();
  const physics=regional.physicsStatistics!;
  assert.equal(physics.readySectors,physics.requestedActiveSectors);
  assert.ok(physics.cachedRoads<actual.map.roads.length);
  assert.equal(regional.sampleRoadSurface(regional.spawnPose.position.x,regional.spawnPose.position.z).surfaceType,'asphalt');
  const spawnPhysicsReadyMs=performance.now()-started,groundStarted=performance.now();let groundSteps=0,maxGroundStepMs=0,groundSectors=0;
  const size=actual.map.sectorSize,p=regional.spawnPose.position,radius=size*.6;
  for(let sx=Math.floor((p.x-radius)/size);sx<=Math.floor((p.x+radius)/size);sx++)for(let sz=Math.floor((p.z-radius)/size);sz<=Math.floor((p.z+radius)/size);sz++){
    const task=cityGroundSectorGeometrySteps(actual.map,`${sx},${sz}`);groundSectors++;
    for(;;){const start=performance.now(),step=task.next();maxGroundStepMs=Math.max(maxGroundStepMs,performance.now()-start);groundSteps++;if(step.done){step.value.forEach(g=>g.dispose());break;}}
  }
  const report={label:'Single CPU-only Regional Main sample; no GPU/drive-ready claim',spawnPhysicsReadyMs,spawnGroundBuildMs:performance.now()-groundStarted,groundSectors,groundSteps,maxGroundStepMs,physics,initializationMs:regional.initializationMs,colliders:regional.colliders.length};
  writeFileSync('.tmp-physics-sector-sample.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));regional.dispose();
}
