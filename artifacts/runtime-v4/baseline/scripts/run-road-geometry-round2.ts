import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { BufferGeometry,InstancedMesh,Matrix4,Mesh,Raycaster,Vector3,MeshBasicMaterial } from 'three';
import { compileCityRuntimeData } from '../src/world/city/CityRuntimeData';
import { RoadBuilder } from '../src/world/city/RoadBuilder';
import { IntersectionBuilder } from '../src/world/city/IntersectionBuilder';
import { RoadGeometryTrial } from '../src/world/city/RoadGeometryTrial';
import { PavementTriangleIndex,continuousRibbon } from '../src/world/city/ContinuousRoadGeometry';
import { runContinuousRoadGeometrySelfTest } from '../src/world/city/ContinuousRoadGeometry.selftest';
import { RoadGeometryCompilationCache,roadGeometryCompilationCache,registerImmutableRoadGeometry,registerImmutableRoadGeometryView,roadGeometryRevision } from '../src/world/city/RoadGeometryTrialCache';
import { createSubject3Materials } from '../src/world/subject3/materials';
import { newCityMap } from '../src/world/city/CityMapData';
import { roadStructureColliders,roadPiers } from '../src/world/city/RoadInfrastructure';
import { runtimeRoadClearance } from '../src/world/city/RoadClearance';
import { PrefabRegistry } from '../src/world/city/PrefabRegistry';
import { SectorManager } from '../src/world/city/SectorManager';
import { RoadVisualCompiler } from '../src/world/city/RoadVisualCompiler';
import type { CompiledRoadVisual } from '../src/world/city/VisualStreamingData';
import { VehicleCollisionSystem,type StaticCollider } from '../src/vehicle/physics/CollisionSystem';
import { FAMILY_SEDAN_DIMENSIONS } from '../src/vehicle/VehicleDimensions';
import { polylineLength,roadEdges,roadPoints,sampleAt } from '../src/world/city/geometry';
import { ROUND2_CASES,ROUND2_BOUNDARIES,round2Selection } from './road-geometry-round2-data';
import { runVisualStreamingLifecycleSelfTest } from '../src/world/city/VisualStreamingLifecycle.selftest';
import { drain } from '../src/loading/Loading';

const directory='artifacts/road-geometry-round2';await mkdir(directory,{recursive:true});let assertions=0;
const check=(ok:boolean,message:string)=>{assertions++;if(!ok)throw new Error('Road geometry R2: '+message);};
const raw=await readFile('src/world/regional/regional-main.json'),sourceHash=createHash('sha256').update(raw).digest('hex');
const runtime=compileCityRuntimeData(JSON.parse(raw.toString('utf8'))),map=runtime.map,selection=round2Selection(map);
const materials={...createSubject3Materials(),tunnelLight:new MeshBasicMaterial({color:0xffefd0})},unit=runContinuousRoadGeometrySelfTest();
const hashStarted=performance.now(),revision=roadGeometryRevision(map),fingerprintMs=performance.now()-hashStarted;registerImmutableRoadGeometry(map,revision);
const helper=new RoadGeometryTrial(map,materials,selection),legacy=new RoadBuilder(materials,map),optimized=new RoadBuilder(materials,map,selection);
const baseline=await import(pathToFileURL(resolve('.tmp-road-round1-projection.mjs')).href) as {PavementTriangleIndex:new(g:BufferGeometry[])=>{projectPaint(g:BufferGeometry):BufferGeometry}};
const summary=(values:number[])=>{const a=[...values].sort((a,b)=>a-b);return {count:a.length,median:a[Math.floor(a.length*.5)],p95:a[Math.min(a.length-1,Math.ceil(a.length*.95)-1)],max:Math.max(...a)};};
const area=(g:BufferGeometry)=>{const p=g.getAttribute('position'),index=g.index;let a=0;for(let i=0;i<(index?.count??p.count);i+=3){const x=index?index.getX(i):i,y=index?index.getX(i+1):i+1,z=index?index.getX(i+2):i+2;a+=Math.abs((p.getX(y)-p.getX(x))*(p.getZ(z)-p.getZ(x))-(p.getZ(y)-p.getZ(x))*(p.getX(z)-p.getX(x)))/2;}return a;};
function dispose(root:Mesh|import('three').Group):void{const geometries=new Set<BufferGeometry>();root.traverse(o=>{if(o instanceof Mesh)geometries.add(o.geometry);if(o instanceof InstancedMesh)o.dispose();});for(const g of geometries)g.dispose();}
const projection:unknown[]=[];
for(const test of [...ROUND2_CASES,...ROUND2_BOUNDARIES].filter(t=>t.id!=='island'&&t.id!=='width-merge')){
 const j=map.intersections.find(j=>test.intersectionIds.includes(j.id)),ids=test.roadIds.length?test.roadIds:j!.connections.map(c=>c.roadId);
 const roots=ids.map(id=>legacy.build(map.roads.find(r=>r.id===id)!));
 if(j){const root=new IntersectionBuilder(map,materials).build(j);root.updateMatrixWorld(true);root.traverse(o=>{if(o instanceof Mesh){o.geometry.applyMatrix4(o.matrixWorld);o.position.set(0,0,0);o.rotation.set(0,0,0);}});root.position.set(0,0,0);root.rotation.set(0,0,0);roots.push(root);}
 const surfaces:BufferGeometry[]=[],paint:BufferGeometry[]=[];
 for(const root of roots)root.traverse(o=>{if(o instanceof Mesh){if(o.userData.pavementOwner)surfaces.push(o.geometry);if(o.userData.markingOwner)paint.push(o.geometry);}});
 const first=new baseline.PavementTriangleIndex(surfaces),next=new PavementTriangleIndex(surfaces),oldTimes:number[]=[],newTimes:number[]=[];
 let oldTriangles=0,newTriangles=0,maxAreaError=0;
 for(const p of paint){const old=first.projectPaint(p),output=next.projectPaint(p),oldArea=area(old),error=Math.abs(area(output)-oldArea);maxAreaError=Math.max(maxAreaError,error);check(error<=Math.max(.001,oldArea*.001),'projection preserves owned paint area '+test.id);old.dispose();output.dispose();}
 for(let iteration=0;iteration<5;iteration++)for(const version of iteration%2?['new','old']:['old','new']){
  const start=performance.now();let triangles=0;
  for(const p of paint){const output=(version==='old'?first:next).projectPaint(p);triangles+=output.getAttribute('position').count/3;output.dispose();}
  const elapsed=performance.now()-start;(version==='old'?oldTimes:newTimes).push(elapsed);if(version==='old')oldTriangles=triangles;else newTriangles=triangles;
 }
 projection.push({id:test.id,paintMeshes:paint.length,round1Ms:summary(oldTimes),optimizedMs:summary(newTimes),round1Triangles:oldTriangles,optimizedTriangles:newTriangles,maxAreaError,indexBytes:next.byteLength,statistics:next.statistics});roots.forEach(dispose);
}
// An exact clipped union may coalesce diagonals, but may never fill a hole.
const left=continuousRibbon([{x:-4,y:0,z:0},{x:-4,y:0,z:-8}],[{x:-1,y:0,z:0},{x:-1,y:0,z:-8}],0);
const right=continuousRibbon([{x:1,y:0,z:0},{x:1,y:0,z:-8}],[{x:4,y:0,z:0},{x:4,y:0,z:-8}],0);
const broad=continuousRibbon([{x:-3,y:0,z:-1},{x:-3,y:0,z:-7}],[{x:3,y:0,z:-1},{x:3,y:0,z:-7}],.032);
const clipped=new PavementTriangleIndex([left,right]).projectPaint(broad);check(Math.abs(area(clipped)-24)<1e-6,'coplanar fast path does not bridge an unowned hole');
const duplicated=new PavementTriangleIndex([left,left,right]).projectPaint(broad),dupPositions=duplicated.getAttribute('position');
for(let i=0;i<dupPositions.count;i++)check(Math.abs(dupPositions.getX(i))>=1,'overlapping pavement may not compensate for an unowned hole');
[left,right,broad,clipped,duplicated].forEach(g=>g.dispose());

const mutable=newCityMap();mutable.roads=[{id:'cache-a',laneCount:2,laneWidth:3.6,travelDirection:'two-way',speedLimit:40,centerline:[{x:0,y:0,z:0},{x:0,y:0,z:-30}]}];
const firstRevision=roadGeometryCompilationCache(mutable).revision;mutable.roads[0]!.centerline[1]!.y=1;
const secondRevision=roadGeometryCompilationCache(mutable).revision;check(firstRevision!==secondRevision,'same map.version with changed XYZ invalidates cached geometry');
mutable.roads.push({...mutable.roads[0]!,id:'cache-neighbour'});check(roadGeometryCompilationCache(mutable).revision!==secondRevision,'a changed neighbour invalidates geometry dependencies');
const thirdRevision=roadGeometryCompilationCache(mutable).revision;mutable.bounds.maxX+=10;check(roadGeometryCompilationCache(mutable).revision!==thirdRevision,'changed terrain bounds invalidate geometry dependencies');
const fourthRevision=roadGeometryCompilationCache(mutable).revision;mutable.sectorSize+=10;check(roadGeometryCompilationCache(mutable).revision!==fourthRevision,'changed sector size invalidates geometry dependencies');
const shallow=Object.freeze(newCityMap());registerImmutableRoadGeometry(shallow,roadGeometryRevision(shallow));check(Object.isFrozen(shallow.bounds)&&Object.isFrozen(shallow.environment.spawnPoints[0]!.position),'shallow-frozen inputs still seal nested geometry dependencies');
const bounded=new RoadGeometryCompilationCache('budget-test',64*1024,4);
for(let i=0;i<30;i++){const key='road-'+i,entry=bounded.entry(key);entry.pavement={position:new Float32Array(3000),normal:new Float32Array(3000),uv:new Float32Array(2000),bounds:[0,0,0,1,1,1],sphere:[0,0,0,1]};bounded.account(key);check(bounded.state.bytes<=bounded.maxBytes&&bounded.state.entries<=bounded.maxEntries,'CPU cache obeys byte and entry limits');}
check(bounded.state.evictions>0,'bounded CPU cache actually evicts old entries');
let mutationBlocked=false;try{map.roads[0]!.centerline[0]!.x+=1;}catch{mutationBlocked=true;}check(mutationBlocked,'immutable content revision cannot silently become stale');
const view={...map,environment:{...map.environment,spawnPoints:[]}};registerImmutableRoadGeometryView(map,view);check(roadGeometryCompilationCache(view).revision===revision,'spawn override reuses the exact immutable geometry content key');
let wrongViewBlocked=false;try{registerImmutableRoadGeometryView(map,{...view,roads:[...map.roads]});}catch{wrongViewBlocked=true;}check(wrongViewBlocked,'a changed geometry dependency cannot inherit a stale content key');

// Duplicate installation and cold recompile through the actual SectorManager
// plans. Only the development budget is tiny; assertions and work are unchanged.
const small=newCityMap();small.roads=[{id:'residency-road',laneCount:2,laneWidth:3.75,travelDirection:'forward',speedLimit:60,centerline:[{x:10,y:8,z:10},{x:90,y:8,z:10}],elevationMode:'custom',shoulders:{left:.75,right:1.75},structure:{barrierEnabled:true,piersEnabled:false}}];small.bounds={minX:0,maxX:500,minZ:0,maxZ:500};small.regional={version:1,cityBounds:small.bounds,terrainBounds:small.bounds,routes:[],structures:[],exits:[]};
const prefabs=new PrefabRegistry(materials),sectors=new SectorManager(small,materials,prefabs,{visualCache:{maxRoads:0,maxBytes:0}}),compiler=new RoadVisualCompiler(small,materials,{roadIds:['residency-road'],intersectionIds:[]});
const internals=sectors as unknown as {receiveRoad:(data:CompiledRoadVisual)=>Generator<void>;trimRoadResidency:()=>void;compiled:Set<string>};
const data=compiler.compile('residency-road');drain(internals.receiveRoad(data));const bytes=sectors.visualStatistics.cachedRoadBytes;drain(internals.receiveRoad(data));
check(sectors.visualStatistics.duplicateReplies===1&&sectors.visualStatistics.cachedRoadBytes===bytes,'duplicate Worker reply cannot publish geometry twice');
internals.trimRoadResidency();check(sectors.visualStatistics.cachedRoads===0&&!internals.compiled.has('residency-road'),'unloaded CPU plans evict without deleting logical roads');check(sectors.roadsForSector('0,0')?.has(small.roads[0]!)===true,'eviction retains physics/navigation sector membership');
const recompiled=compiler.compile('residency-road');drain(internals.receiveRoad(recompiled));check(sectors.visualStatistics.cachedRoadBytes===bytes,'reloading an evicted road imports existing shared instance templates');internals.trimRoadResidency();sectors.dispose();prefabs.dispose();

const clearance=runtimeRoadClearance(map),registry=new PrefabRegistry(materials),buildings=map.objects.map(o=>({object:o,collider:registry.collider(o)})).filter((p):p is {object:typeof map.objects[number];collider:StaticCollider}=>!!p.collider);
const buildingBuckets=new Map<string,typeof buildings>();
for(const b of buildings){const radius=Math.hypot(b.collider.halfLength,b.collider.halfWidth);for(let x=Math.floor((b.collider.center.x-radius)/50);x<=Math.floor((b.collider.center.x+radius)/50);x++)for(let z=Math.floor((b.collider.center.z-radius)/50);z<=Math.floor((b.collider.center.z+radius)/50);z++){const key=x+','+z,list=buildingBuckets.get(key)??[];list.push(b);buildingBuckets.set(key,list);}}
const overlaps=(a:StaticCollider,b:StaticCollider)=>{
 if(a.maxHeight<=b.minHeight||b.maxHeight<=a.minHeight)return false;
 const axes=[{x:Math.cos(a.yaw),z:-Math.sin(a.yaw)},{x:Math.sin(a.yaw),z:Math.cos(a.yaw)},{x:Math.cos(b.yaw),z:-Math.sin(b.yaw)},{x:Math.sin(b.yaw),z:Math.cos(b.yaw)}];
 for(const axis of axes){const pa=a.corners.map(p=>p.x*axis.x+p.z*axis.z),pb=b.corners.map(p=>p.x*axis.x+p.z*axis.z);if(Math.max(...pa)<=Math.min(...pb)||Math.max(...pb)<=Math.min(...pa))return false;}return true;
};
const collisions:unknown[]=[],environmentConflicts:unknown[]=[];
const roadBuckets=new Map<string,{roadId:string;a:Vector3;b:Vector3;halfWidth:number}[]>();
for(const r of map.roads){const p=roadPoints(r),edges=roadEdges(r),halfWidth=Math.max(-edges.left,edges.right);for(let i=1;i<p.length;i++){const a=p[i-1]!,b=p[i]!,segment={roadId:r.id,a:new Vector3(a.x,a.y??0,a.z),b:new Vector3(b.x,b.y??0,b.z),halfWidth};for(let x=Math.floor((Math.min(a.x,b.x)-halfWidth-1)/50);x<=Math.floor((Math.max(a.x,b.x)+halfWidth+1)/50);x++)for(let z=Math.floor((Math.min(a.z,b.z)-halfWidth-1)/50);z<=Math.floor((Math.max(a.z,b.z)+halfWidth+1)/50);z++){const key=x+','+z,list=roadBuckets.get(key)??[];list.push(segment);roadBuckets.set(key,list);}}}
function visualEnvelope(root:import('three').Group,solids:StaticCollider[]){
 const result:{kind:string;vertices:number;outsideTolerance:number;maxHorizontalMiss:number;maxVerticalMiss:number;examples:unknown[]}[]=[];
 root.traverse(o=>{if(!(o instanceof Mesh))return;const kind=o.userData.roadStructureKind as string|undefined,match=kind==='median'?':median:':kind==='metal-rail'||kind==='concrete-barrier'||kind==='guardrail-posts'?':barrier:':kind==='cutting-wall'||kind==='tunnel-wall'?':wall:':undefined;if(!match)return;
  const boxes=solids.filter(s=>s.id.includes(match)),buckets=new Map<string,StaticCollider[]>();for(const b of boxes){const radius=Math.hypot(b.halfLength,b.halfWidth);for(let x=Math.floor((b.center.x-radius-.1)/8);x<=Math.floor((b.center.x+radius+.1)/8);x++)for(let z=Math.floor((b.center.z-radius-.1)/8);z<=Math.floor((b.center.z+radius+.1)/8);z++){const key=x+','+z,list=buckets.get(key)??[];list.push(b);buckets.set(key,list);}}
  const row={kind:kind!,vertices:0,outsideTolerance:0,maxHorizontalMiss:0,maxVerticalMiss:0,examples:[] as unknown[]},p=o.geometry.getAttribute('position'),point=new Vector3(),matrix=new Matrix4();
  for(let instance=0;instance<(o instanceof InstancedMesh?o.count:1);instance++){if(o instanceof InstancedMesh){o.getMatrixAt(instance,matrix);matrix.premultiply(o.matrixWorld);}else matrix.copy(o.matrixWorld);
   for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i).applyMatrix4(matrix);let best=Infinity,horizontal=Infinity,vertical=Infinity;for(const b of buckets.get(Math.floor(point.x/8)+','+Math.floor(point.z/8))??[]){const dx=point.x-b.center.x,dz=point.z-b.center.z,h=Math.hypot(Math.max(0,Math.abs(dx*Math.cos(b.yaw)-dz*Math.sin(b.yaw))-b.halfWidth),Math.max(0,Math.abs(dx*Math.sin(b.yaw)+dz*Math.cos(b.yaw))-b.halfLength)),v=Math.max(0,b.minHeight-point.y,point.y-b.maxHeight);if(Math.hypot(h,v)<best){best=Math.hypot(h,v);horizontal=h;vertical=v;}}
    row.vertices++;row.maxHorizontalMiss=Math.max(row.maxHorizontalMiss,horizontal);row.maxVerticalMiss=Math.max(row.maxVerticalMiss,vertical);if(horizontal>.03||vertical>.06){row.outsideTolerance++;if(row.examples.length<3)row.examples.push({x:point.x,y:point.y,z:point.z,horizontal,vertical});}
   }
  }result.push(row);
 });return result;
}
for(const road of map.roads.filter(r=>selection.roadIds.includes(r.id))){
 const solids=roadStructureColliders(road,map,clearance),root=optimized.build(road);root.updateMatrixWorld(true);
 const enabled=helper.enabled(road);if(enabled)helper.legacySidewalks(road);
 const types=[['median',':median:'],['guardrail',':barrier:'],['wall',':wall:'],['ceiling',':ceiling:']] as const;
 const row:{roadId:string;newGeometry:boolean;probes:unknown[];roofSamples:unknown[];piers:number;visualEnvelope:ReturnType<typeof visualEnvelope>}={roadId:road.id,newGeometry:enabled,probes:[],roofSamples:[],piers:0,visualEnvelope:visualEnvelope(root,solids)};
 for(const [kind,match]of types){
  const choices=solids.filter(s=>s.id.includes(match)),solid=choices[Math.floor(choices.length/2)];if(!solid)continue;
  const right={x:Math.cos(solid.yaw),z:-Math.sin(solid.yaw)},floor=kind==='ceiling'?solid.minHeight-(road.structure?.enclosure?.clearance??6):solid.minHeight-.05;
  const system=new VehicleCollisionSystem([solid]),distance=solid.halfWidth+FAMILY_SEDAN_DIMENSIONS.length/2+2,previousPose={x:solid.center.x+right.x*distance,z:solid.center.z+right.z*distance,y:floor,yaw:Math.atan2(right.x,right.z)},pose={...previousPose,x:solid.center.x-right.x*distance,z:solid.center.z-right.z*distance};
  const result=system.resolve({previousPose,pose,dimensions:{...FAMILY_SEDAN_DIMENSIONS,groundClearance:.12},velocity:{x:-right.x*30,z:-right.z*30},dt:1/60});
  if(kind==='ceiling')check(!result.collided,'normal vehicle roof clears actual ceiling '+road.id);else check(result.collided,'existing collision system stops a swept vehicle at '+kind+' '+road.id);
  row.probes.push({kind,colliderId:solid.id,collided:result.collided,roofClearance:kind==='ceiling'?solid.minHeight-floor-FAMILY_SEDAN_DIMENSIONS.height:undefined});
 }
 const roof=root.children.find(o=>o.name==='tunnel ceiling and portals') as Mesh|undefined;
 if(roof){const points=roadPoints(road),length=polylineLength(points);for(const fraction of [.02,.25,.5,.75,.98]){const p=sampleAt(points,length*fraction).point,hits=new Raycaster(new Vector3(p.x,(p.y??0)+FAMILY_SEDAN_DIMENSIONS.height,p.z),new Vector3(0,1,0),0,20).intersectObject(roof);check(hits.length>0,'front-face roof visible with actual vehicle headroom '+road.id);row.roofSamples.push({fraction,clearance:hits[0]!.distance});}}
 for(const pier of roadPiers(road,map,clearance)){
  row.piers++;const collider=solids.find(s=>s.id.includes(':pier:')&&Math.hypot(s.center.x-pier.position.x,s.center.z-pier.position.z)<.01);if(!collider)continue;
  for(const b of buildingBuckets.get(Math.floor(pier.position.x/50)+','+Math.floor(pier.position.z/50))??[])if(overlaps(collider,b.collider))environmentConflicts.push({type:'existing-pier-object-conflict',roadId:road.id,pier:collider.id,objectId:b.object.id,prefabId:b.object.prefabId});
  const conflicts=new Set<string>();for(const segment of roadBuckets.get(Math.floor(pier.position.x/50)+','+Math.floor(pier.position.z/50))??[]){if(segment.roadId===road.id||conflicts.has(segment.roadId))continue;const dx=segment.b.x-segment.a.x,dz=segment.b.z-segment.a.z,t=Math.max(0,Math.min(1,((pier.position.x-segment.a.x)*dx+(pier.position.z-segment.a.z)*dz)/(dx*dx+dz*dz||1))),y=segment.a.y+(segment.b.y-segment.a.y)*t;if(Math.hypot(pier.position.x-segment.a.x-dx*t,pier.position.z-segment.a.z-dz*t)<segment.halfWidth+.6&&collider.minHeight<y+FAMILY_SEDAN_DIMENSIONS.height&&collider.maxHeight>y+.1){conflicts.add(segment.roadId);environmentConflicts.push({type:'pier-road-vehicle-envelope',roadId:road.id,pier:collider.id,otherRoadId:segment.roadId,roadY:y,pierBase:collider.minHeight,pierTop:collider.maxHeight});}}
 }
 collisions.push(row);dispose(root);
}
// Existing traffic-island collision boxes already exist; leave their renderer
// unchanged while the new boundary/fan combination remains outside this rollout.
for(const j of map.intersections.filter(j=>selection.intersectionIds.includes(j.id)&&j.channelized))collisions.push({junctionId:j.id,status:'legacy-retained',reason:helper.enabledIntersection(j)?null:helper.fallbacks.get(j.id),islandHeight:.18});
registry.dispose();
const lifecycle=await runVisualStreamingLifecycleSelfTest();
check(createHash('sha256').update(await readFile('src/world/regional/regional-main.json')).digest('hex')===sourceHash,'official map bytes unchanged');
const result={sourceSHA256:sourceHash,assertions,unit,lifecycle,fingerprintMs,revision,projection,cache:helper.cache.state,boundedCache:bounded.state,fallbacks:[...helper.fallbacks],collisions,environmentConflicts,notes:{realCrossfall:'No authored bank/variable-width station schema; kernel fixtures only, not claimed as real-map validation',widthMerges:'Legacy retained until multi-owner paint and taper/collision boundary contracts are reviewed'}};
await writeFile(directory+'/targeted-checks.json',JSON.stringify(result,null,2)+'\n');Object.values(materials).forEach(m=>m.dispose());
console.log(JSON.stringify({assertions,unit,lifecycle,projectionCases:projection.length,collisionRoads:collisions.length,environmentConflicts:environmentConflicts.length,report:directory+'/targeted-checks.json'}));
