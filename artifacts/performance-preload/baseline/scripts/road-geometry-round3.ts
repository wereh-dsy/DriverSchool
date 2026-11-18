import { ACESFilmicToneMapping, BackSide, BufferGeometry, Color, DirectionalLight, Fog, HemisphereLight, InstancedMesh, Mesh, MeshLambertMaterial, PCFSoftShadowMap, PerspectiveCamera, Raycaster, Scene, ShaderMaterial, SphereGeometry, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import { CityGround } from '../src/world/city/CityGround';
import type { CityRuntimeData } from '../src/world/city/CityRuntimeData';
import { VehicleDynamics } from '../src/vehicle/physics/VehicleDynamics';
import { VehicleContactSystem } from '../src/vehicle/physics/VehicleContactSystem';
import { chassisBodyPose } from '../src/vehicle/physics/WheelPhysicsState';
import { createDefaultVehiclePhysicsConfig } from '../src/vehicle/config/defaultVehiclePhysicsConfig';
import { createNeutralVehicleInputState } from '../src/input/VehicleInputState';
import { VehicleVisual } from '../src/vehicle/visual/VehicleVisual';
import { DEFAULT_SEDAN_VISUAL_CONFIG } from '../src/vehicle/visual/VehicleVisualConfig';
import { VehicleAssetRegistry } from '../src/vehicle/visual/VehicleAssetRegistry';
import { VehicleLighting } from '../src/vehicle/visual/VehicleLighting';
import { VehicleLightingController } from '../src/vehicle/control/VehicleLightingController';
import { EnvironmentVisual } from '../src/world/environment/EnvironmentVisual';
import { WeatherSystem } from '../src/world/environment/WeatherSystem';
import { createStaticEnvironmentMap } from '../src/world/environment/StaticEnvironmentMap';
import { VISUAL_ENVIRONMENT as V } from '../src/world/environment/VisualEnvironmentConfig';
import { ROAD_GEOMETRY_BUDGET } from '../src/world/city/ContinuousRoadGeometry';
import { RoadGeometryTrial } from '../src/world/city/RoadGeometryTrial';
import { registerImmutableRoadGeometry,registerImmutableRoadGeometryView } from '../src/world/city/RoadGeometryTrialCache';
import { createSubject3Materials } from '../src/world/subject3/materials';
import { sampleAt } from '../src/world/city/geometry';
import { ROUND2_CASES, ROUND2_BOUNDARIES, round2Route, round2Selection, type Round2Route } from './road-geometry-round2-data';
import type { RoadTrialCase } from './road-geometry-trial-data';

type Variant='round2'|'round3';
const baselineURL='/artifacts/road-geometry-round3/round2-baseline.browser.mjs';
const baselineLib=await import(/* @vite-ignore */baselineURL) as {CityGround:typeof CityGround;registerImmutableRoadGeometry:typeof registerImmutableRoadGeometry;registerImmutableRoadGeometryView:typeof registerImmutableRoadGeometryView};
const query=new URLSearchParams(location.search),repeat=query.get('reverse')==='1';
const reportPrefix=repeat?'reverse-':'';
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const status=$('status'),label=$('label'),stats=$('stats'),host=$('view');
const renderer=new WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(1200,650);renderer.outputColorSpace=SRGBColorSpace;renderer.toneMapping=ACESFilmicToneMapping;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=PCFSoftShadowMap;renderer.info.autoReset=false;host.prepend(renderer.domElement);
const scene=new Scene();scene.background=new Color(V.fogColor);scene.fog=new Fog(V.fogColor,V.fogNear,V.fogFar);
const camera=new PerspectiveCamera(58,1200/650,.1,2500),sun=new DirectionalLight(V.sunColor,V.sunIntensity),hemi=new HemisphereLight(V.ambientSky,V.ambientGround,V.ambientIntensity);
sun.castShadow=true;sun.shadow.mapSize.set(V.shadowMapSize,V.shadowMapSize);Object.assign(sun.shadow.camera,{left:-V.shadowHalfExtent,right:V.shadowHalfExtent,top:V.shadowHalfExtent,bottom:-V.shadowHalfExtent,near:5,far:320});sun.shadow.bias=-.00007;sun.shadow.normalBias=.018;scene.add(sun,sun.target,hemi);
const skyMaterial=new ShaderMaterial({side:BackSide,depthWrite:false,uniforms:{topColor:{value:new Color(V.skyTop)},horizonColor:{value:new Color(V.skyHorizon)},groundColor:{value:new Color(V.skyGround)}},
 vertexShader:'varying vec3 vWorld; void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
 fragmentShader:'uniform vec3 topColor;uniform vec3 horizonColor;uniform vec3 groundColor;varying vec3 vWorld;void main(){vec3 d=normalize(vWorld-cameraPosition);vec3 c=mix(horizonColor,topColor,smoothstep(-.08,.72,d.y));gl_FragColor=vec4(mix(groundColor,c,smoothstep(-.18,.02,d.y)),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});
const sky=new Mesh(new SphereGeometry(1900,28,16),skyMaterial);sky.frustumCulled=false;scene.add(sky);
const envMap=createStaticEnvironmentMap(renderer);scene.environment=envMap.texture;scene.environmentIntensity=V.environmentIntensity;
const assets=new VehicleAssetRegistry(),vehicle=new VehicleVisual(DEFAULT_SEDAN_VISUAL_CONFIG,assets),lamps=new VehicleLighting(vehicle),lampController=new VehicleLightingController();scene.add(vehicle.root);
const weather=new WeatherSystem(),environment=new EnvironmentVisual(scene,weather,sun,hemi,skyMaterial,v=>renderer.toneMappingExposure=v);
const config=createDefaultVehiclePhysicsConfig(),controls=createNeutralVehicleInputState(),errors:string[]=[],longTasks:{start:number;duration:number}[]=[];
window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
try{new PerformanceObserver(list=>{for(const e of list.getEntries()){longTasks.push({start:e.startTime,duration:e.duration});if(longTasks.length>2048)longTasks.shift();}}).observe({type:'longtask',buffered:true});}catch{/* unavailable is reported through an empty sample set */}
let shadowCalls=0,shadowTriangles=0,uploadedBytes=0;
const originalShadow=renderer.shadowMap.render.bind(renderer.shadowMap);
renderer.shadowMap.render=(...args)=>{const calls=renderer.info.render.calls,triangles=renderer.info.render.triangles;originalShadow(...args);shadowCalls+=renderer.info.render.calls-calls;shadowTriangles+=renderer.info.render.triangles-triangles;};
const gl=renderer.getContext();
const uploadSize=(data:{byteLength:number;BYTES_PER_ELEMENT?:number}|number|null,offset=0,count?:number)=>typeof data==='number'?data:data?(count??(data.byteLength/(data.BYTES_PER_ELEMENT??1)-offset))*(data.BYTES_PER_ELEMENT??1):0;
const liveBuffers=new Map<WebGLBuffer,number>();let liveBufferBytes=0,peakBufferBytes=0;
gl.bufferData=new Proxy(gl.bufferData,{apply(target,self,args){const bytes=uploadSize(args[1],args[3],args[4]);uploadedBytes+=bytes;const result=Reflect.apply(target,self,args),binding=args[0]===gl.ARRAY_BUFFER?gl.ARRAY_BUFFER_BINDING:args[0]===gl.ELEMENT_ARRAY_BUFFER?gl.ELEMENT_ARRAY_BUFFER_BINDING:undefined;if(binding!==undefined){const buffer=gl.getParameter(binding) as WebGLBuffer|null;if(buffer){liveBufferBytes+=bytes-(liveBuffers.get(buffer)??0);liveBuffers.set(buffer,bytes);peakBufferBytes=Math.max(peakBufferBytes,liveBufferBytes);}}return result;}});
gl.deleteBuffer=new Proxy(gl.deleteBuffer,{apply(target,self,args){const buffer=args[0] as WebGLBuffer;liveBufferBytes-=liveBuffers.get(buffer)??0;liveBuffers.delete(buffer);return Reflect.apply(target,self,args);}});
gl.bufferSubData=new Proxy(gl.bufferSubData,{apply(target,self,args){uploadedBytes+=uploadSize(args[2],args[3],args[4]);return Reflect.apply(target,self,args);}});
let runtime:CityRuntimeData,sourceSHA256='',ground:CityGround|undefined,variant:Variant='round2',test=ROUND2_CASES[0]!,route:Round2Route;
let dynamics=new VehicleDynamics(config),contact:VehicleContactSystem|undefined,snapshot=dynamics.getSnapshot(),nearest=0,firstPerson=false,busy=false,night=false;
let lastRender={normalCalls:0,shadowCalls:0,normalTriangles:0,shadowTriangles:0,renderMs:0};
const report:{sourceSHA256:string;mapVersion:number;settings:unknown;initialization:unknown[];results:unknown[];boundaries:unknown[];release:unknown[];errors:string[];longTasks:typeof longTasks}={sourceSHA256:'',mapVersion:0,settings:{width:1200,height:650,pixelRatio:1,shadowMapSize:V.shadowMapSize,fogFar:V.fogFar,fullMap:true,order:repeat?'round3-round2':'round2-round3',sameWhitelist:true},initialization:[],results:[],boundaries:[],release:[],errors,longTasks};
function heap():number|null{return (performance as Performance&{memory?:{usedJSHeapSize:number}}).memory?.usedJSHeapSize??null;}
function percentile(values:number[],p:number):number|null{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.ceil(p*sorted.length)-1)]!;}
function aggregate(values:number[]){return {count:values.length,median:percentile(values,.5),p95:percentile(values,.95),max:values.length?Math.max(...values):null};}
function geometryState(){
 const geometries=new Set<BufferGeometry>(),materials=new Set<unknown>();let bytes=0,instances=0;
 ground?.root.traverse(o=>{if(!(o instanceof Mesh))return;for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);if(!geometries.has(o.geometry)){geometries.add(o.geometry);for(const name of Object.keys(o.geometry.attributes))bytes+=o.geometry.getAttribute(name).array.byteLength;bytes+=o.geometry.index?.array.byteLength??0;}if(o instanceof InstancedMesh){instances+=o.count;bytes+=o.instanceMatrix.array.byteLength;}});
 return {bufferBytes:bytes,geometries:geometries.size,materials:materials.size,instances,gpu:{...renderer.info.memory},gpuBufferBytes:liveBufferBytes,peakGpuBufferBytes:peakBufferBytes,heap:heap()};
}
function updatePose(){
 const body=chassisBodyPose(snapshot.chassis,DEFAULT_SEDAN_VISUAL_CONFIG.staticBodyOffsetY,snapshot.yaw);
 vehicle.setWorldPose(snapshot.x+body.offsetX,body.y,snapshot.z+body.offsetZ,snapshot.yaw,body.pitch,body.roll);vehicle.setWheelWorldPositions({frontLeft:snapshot.wheels.frontLeft.worldPosition,frontRight:snapshot.wheels.frontRight.worldPosition,rearLeft:snapshot.wheels.rearLeft.worldPosition,rearRight:snapshot.wheels.rearRight.worldPosition});vehicle.setSteeringInput(controls.steering);vehicle.root.updateMatrixWorld(true);
 if(firstPerson){camera.layers.set(0);camera.layers.enable(2);camera.position.copy(vehicle.root.localToWorld(new Vector3(...DEFAULT_SEDAN_VISUAL_CONFIG.driverEyePosition)));const forward=new Vector3(0,0,-1).applyQuaternion(vehicle.root.quaternion);camera.lookAt(camera.position.clone().addScaledVector(forward,30));}
 else{camera.layers.set(0);camera.layers.enable(1);camera.position.set(snapshot.x+Math.sin(snapshot.yaw)*13,snapshot.chassis.chassisY+7,snapshot.z+Math.cos(snapshot.yaw)*13);camera.lookAt(snapshot.x,snapshot.chassis.chassisY+1,snapshot.z);}
 sky.position.copy(camera.position);sun.position.set(snapshot.x-95,snapshot.chassis.chassisY+145,snapshot.z+70);sun.target.position.set(snapshot.x,snapshot.chassis.chassisY,snapshot.z-25);sun.target.updateMatrixWorld();
}
function render(dt=1/60){
 updatePose();environment.update(dt,camera.position);lampController.setMainLightMode(night?'low':'off');lamps.applyState(lampController.state,true,dt);
 ground?.updateVisualVisibility(camera.position,(scene.fog as Fog).far,[camera]);
 renderer.info.reset();shadowCalls=shadowTriangles=0;const start=performance.now();renderer.render(scene,camera);
 lastRender={normalCalls:renderer.info.render.calls-shadowCalls,shadowCalls,normalTriangles:renderer.info.render.triangles-shadowTriangles,shadowTriangles,renderMs:performance.now()-start};
 stats.textContent=`${variant} | ${test.label} | ${night?'夜间':'白天'} ${firstPerson?'第一人称':'第三人称'} | 正常/阴影 Calls ${lastRender.normalCalls}/${lastRender.shadowCalls} | 提交三角形 ${lastRender.normalTriangles+lastRender.shadowTriangles} | 活动 Sector ${ground?.sectors.active.size??0}`;
}
async function frame(){await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));}
async function save(name:string,data:unknown){const res=await fetch('/__road_r3_save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'report',name:reportPrefix+name,report:data})});if(!res.ok)throw new Error(await res.text());}
async function capture(name:string){render();const res=await fetch('/__road_r3_save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'image',name:variant+'_'+name,image:renderer.domElement.toDataURL('image/jpeg',.88)})});if(!res.ok)throw new Error(await res.text());}
function resetCar(speed=0){
 const start=sampleAt(route.points,route.start),yaw=Math.atan2(-start.tangent.x,-start.tangent.z);
 ground!.spawnPose.position.set(start.point.x,(start.point.y??0)+.04,start.point.z);ground!.setSurfaceReferenceHeight(start.point.y??0);
 dynamics=new VehicleDynamics(config,{x:start.point.x,z:start.point.z,yaw,speed,driveSelector:'N'});contact=new VehicleContactSystem(ground!,DEFAULT_SEDAN_VISUAL_CONFIG.collisionDimensions);snapshot=contact.synchronize(dynamics);
 controls.steering=controls.throttle=controls.brake=controls.handbrake=0;nearest=0;
 let best=Infinity;for(let i=0;i<route.points.length;i++){const p=route.points[i]!,d=Math.hypot(p.x-snapshot.x,p.z-snapshot.z);if(d<best){best=d;nearest=i;}}
 updatePose();
}
async function warm(){
 const started=performance.now();let stable=0;
 while(stable<12){ground!.update(1/60);ground!.updatePlayerPosition(snapshot.x,snapshot.z,snapshot.yaw,Math.max(14,Math.abs(snapshot.speed)));if(ground!.visualLoadingError)throw ground!.visualLoadingError;render();
  stable=ground!.visualReady&&ground!.sectors.ready?stable+1:0;
  status.textContent=`${variant} ${test.label}：完整近/中景加载 ${((performance.now()-started)/1000).toFixed(1)} s，活动 ${ground!.sectors.active.size} / 待选 ${ground!.sectors.visualStatistics.worker?.queued??0}`;
  if(performance.now()-started>180000)throw new Error('Full near/mid streaming timeout '+test.id);await frame();
 }
 return performance.now()-started;
}
async function createWorld(next:Variant,nextCase:RoadTrialCase){
 await releaseWorld();variant=next;test=nextCase;$<HTMLSelectElement>('case').value=test.id;$<HTMLSelectElement>('variant').value=variant;night=false;weather.setTime('DAY');route=round2Route(runtime.map,test);const p=sampleAt(route.points,route.start),yaw=Math.atan2(-p.tangent.x,-p.tangent.z);
 const map={...runtime.map,environment:{...runtime.map.environment,spawnPoints:[{id:'geometry-r2-review',position:{...p.point},rotation:yaw}]}};
 (variant==='round2'?baselineLib.registerImmutableRoadGeometryView:registerImmutableRoadGeometryView)(runtime.map,map);
 const started=performance.now(),before=heap();ground=new (variant==='round2'?baselineLib.CityGround:CityGround)(map,{runtime:{map,roadNetwork:runtime.roadNetwork},deferred:true,roadGeometryTrial:round2Selection(map),roadGeometryDiagnostics:true});
 scene.add(ground.root);environment.setGround(ground);ground.setVisualObserver((root,added)=>added?environment.addVisualRoot(root):environment.removeVisualRoot(root));
 ground.setVisualResourcePreparation(t=>renderer.initTexture(t),root=>renderer.compileAsync(root,camera,scene));
 await ground.prepare();resetCar();const preparedMs=performance.now()-started;const streamingMs=await warm();
 report.initialization.push({variant,constructorAndPrepareMs:preparedMs,streamingMs,totalMs:performance.now()-started,heapBefore:before,heapAfter:heap(),stages:{...ground.initializationMs},worldCounts:{roads:map.roads.length,intersections:map.intersections.length,objects:map.objects.length,signs:map.signs?.length??0}});
 label.textContent=variant==='round2'?'Round 2 优化前 · 相同局部白名单':'Round 3 优化后 · 相同局部白名单';
}
async function releaseWorld(){
 if(!ground)return;const old=ground;ground=undefined;contact=undefined;scene.remove(old.root);environment.setGround({root:new Scene() as unknown as CityGround['root']});old.dispose();
 const started=performance.now();while(!old.sectors.visualStatistics.resourcesReleased){renderer.render(scene,camera);await frame();if(performance.now()-started>10000)throw new Error('Deferred GPU resource release timeout');}
 for(let i=0;i<15;i++){renderer.info.reset();renderer.render(scene,camera);await frame();}
 report.release.push({variant,resourcesReleased:old.sectors.visualStatistics.resourcesReleased,releaseMs:performance.now()-started,gpuAfterRelease:{...renderer.info.memory},gpuBufferBytes:liveBufferBytes,heap:heap(),remainingQueue:old.sectors.visualStatistics.worker?.queued??null,workerJobs:old.sectors.visualStatistics.worker?.jobs??null});
}
async function moveTo(next:RoadTrialCase){test=next;$<HTMLSelectElement>('case').value=test.id;route=round2Route(runtime.map,test);resetCar();return await warm();}
function steer(){
 let best=Infinity,bestIndex=nearest;
 for(let i=Math.max(0,nearest-4);i<Math.min(route.points.length,nearest+24);i++){const p=route.points[i]!,gap=Math.hypot(p.x-snapshot.x,p.z-snapshot.z);if(gap<best){best=gap;bestIndex=i;}}
 nearest=bestIndex;let distance=0,index=nearest,look=Math.max(8,Math.abs(snapshot.speed)*.6);
 while(index+1<route.points.length&&distance<look){const a=route.points[index]!,b=route.points[++index]!;distance+=Math.hypot(b.x-a.x,b.z-a.z);}
 const target=route.points[index]!,desired=Math.atan2(-(target.x-snapshot.x),-(target.z-snapshot.z)),error=Math.atan2(Math.sin(desired-snapshot.yaw),Math.cos(desired-snapshot.yaw));
 controls.steering=Math.max(-1,Math.min(1,-error*2.5+snapshot.yawRate*.4));
 let lateral=Infinity;for(let i=Math.max(0,nearest-2);i<Math.min(route.points.length-1,nearest+3);i++){const a=route.points[i]!,b=route.points[i+1]!,dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((snapshot.x-a.x)*dx+(snapshot.z-a.z)*dz)/(dx*dx+dz*dz||1)));lateral=Math.min(lateral,Math.hypot(snapshot.x-a.x-dx*t,snapshot.z-a.z-dz*t));}return lateral;
}
async function drive(speed:number,seconds:number){
 resetCar(speed);await warm();const started=performance.now(),frames:number[]=[],blocks:number[]=[],physics:number[]=[],sectors=new Set<string>(),collisions=new Set<string>();
 let previous=performance.now(),accumulator=0,ticks=0,maxLaneError=0,peakBuffers=0,peakHeap=heap()??0,peakGeometries=0,airborneTicks=0,traceHash=2166136261;
 const trajectory:unknown[]=[];
 const initialUploads=uploadedBytes,initialLongTask=longTasks.length;
 while(ticks<Math.round(seconds*120)){
  await frame();const now=performance.now(),dt=Math.min(.12,(now-previous)/1000);frames.push(now-previous);previous=now;accumulator+=dt;const block=performance.now(),phys=performance.now();
  let steps=0;while(accumulator>=1/120&&ticks<Math.round(seconds*120)&&steps<16){maxLaneError=Math.max(maxLaneError,steer());snapshot=contact!.step(1/120,controls,dynamics);if(snapshot.chassis.groundedWheels<4)airborneTicks++;if(contact!.collision?.collided)for(const hit of contact!.collision.contacts)collisions.add(hit.colliderId);for(const value of [snapshot.x,snapshot.z,snapshot.yaw,snapshot.chassis.chassisY,snapshot.speed])traceHash=Math.imul(traceHash^Math.round(value*10000),16777619);accumulator-=1/120;ticks++;steps++;if(ticks%60===0)trajectory.push({tick:ticks,x:snapshot.x,z:snapshot.z,yaw:snapshot.yaw,y:snapshot.chassis.chassisY,speed:snapshot.speed});}
  physics.push(performance.now()-phys);ground!.update(dt);ground!.updatePlayerPosition(snapshot.x,snapshot.z,snapshot.yaw,snapshot.speed);render(dt);blocks.push(performance.now()-block);
  sectors.add(ground!.sectors.sectorKey(snapshot.x,snapshot.z));peakGeometries=Math.max(peakGeometries,renderer.info.memory.geometries);peakHeap=Math.max(peakHeap,heap()??0);
  if(ticks%120<steps){const state=geometryState();peakBuffers=Math.max(peakBuffers,state.bufferBytes);}
  if(performance.now()-started>45000)throw new Error('Driving sample cannot finish in 45 s '+test.id);
 }
 return {targetInitialKph:speed*3.6,actualEndKph:snapshot.speed*3.6,simulationSeconds:ticks/120,frames:frames.length,wallMs:performance.now()-started,meanFPS:frames.length/(performance.now()-started)*1000,frameMs:aggregate(frames),mainFrameWorkMs:aggregate(blocks),physicsFrameMs:aggregate(physics),longTasks:longTasks.slice(initialLongTask),sectorKeys:[...sectors],crossedSector:sectors.size>1,collisions:[...collisions],maxLaneError,airborneTicks,uploadsBytes:uploadedBytes-initialUploads,peakBuffers,peakHeap:peakHeap||null,peakGeometries,trajectoryHash:(traceHash>>>0).toString(16),trajectory,endPose:{x:snapshot.x,z:snapshot.z,yaw:snapshot.yaw,chassisY:snapshot.chassis.chassisY},render:lastRender};
}
function environmentProbe(){
 const results=[];for(const offset of [-20,0,20]){
  const sample=sampleAt(route.points,Math.max(0,Math.min(route.length,route.focusStation+offset))).point,reference=sample.y??0;
  const hits=new Raycaster(new Vector3(sample.x,reference+50,sample.z),new Vector3(0,-1,0),0,51).intersectObject(ground!.root,true);
  const surfaces=hits.filter(h=>{if(!h.face||h.face.normal.y<=.2)return false;for(let node:typeof h.object|null=h.object;node;node=node.parent)if(!node.visible)return false;return true;}).map(h=>{const material=(h.object as Mesh).material,m=Array.isArray(material)?material[0]:material;const color=m&&'color'in m?(m as {color:Color}).color.getHexString():null;return {y:h.point.y,color,terrain:m instanceof MeshLambertMaterial&&m.vertexColors||color==='6b7f52',asphalt:color==='414548',sector:h.object.parent?.name};});
  const road=surfaces.find(h=>h.asphalt&&Math.abs(h.y-reference-.024)<.10),terrain=surfaces.find(h=>h.terrain&&h.y>reference+.04);
  const sourceRoad=runtime.map.roads.find(r=>r.id===test.roadIds[0]);const enclosed=sourceRoad?.structure?.enclosure&&sourceRoad.structure.enclosure.kind!=='cutting';
  results.push({point:sample,asphaltFound:!!road,terrainAboveRoad:!!terrain,terrainOcclusion:!!terrain&&!enclosed,roofOverburdenAllowed:!!enclosed,topSurfaces:surfaces.slice(0,8)});
 }return results;
}
async function staticViews(){
 const views=[];
 const start=route.start;route.start=Math.max(5,route.focusStation-22);resetCar();
 for(const time of [false,true]){night=time;weather.setTime(time?'NIGHT':'DAY');for(const first of [false,true]){firstPerson=first;for(let i=0;i<12;i++){ground!.update(1/60);ground!.updatePlayerPosition(snapshot.x,snapshot.z,snapshot.yaw,0);render();await frame();}if(!repeat&&test.id==='median'&&!time&&!first)await capture(test.id+'_'+(time?'night':'day')+'_'+(first?'first':'third'));views.push({night:time,firstPerson:first,render:{...lastRender}});}}
 route.start=start;
 return views;
}
function streamSummary(){const s=ground!.sectors.visualStatistics;return {cache:{cachedRoads:s.cachedRoads,cachedRoadBytes:s.cachedRoadBytes,cacheBudget:s.cacheBudget,evictions:s.cacheEvictions,terrainEntries:s.terrainEntries,instanceTemplates:s.instanceTemplates,duplicates:s.duplicateReplies},sectorActiveMs:aggregate(s.publications.map(p=>p.activeMs)),sectorWallMs:aggregate(s.publications.map(p=>p.elapsedMs)),sectorMaxStepMs:aggregate(s.publications.map(p=>p.maxStepMs)),workerActiveMs:aggregate((s.worker?.samples??[]).filter(r=>r.kind==='road').map(r=>r.activeMs)),workerWallMs:aggregate((s.worker?.samples??[]).filter(r=>r.kind==='road').map(r=>r.elapsedMs)),workerMaxStepMs:aggregate((s.worker?.samples??[]).filter(r=>r.kind==='road').map(r=>r.maxStepMs)),workerSamples:s.worker?.samples.map(r=>({...r})),maxSectorUpdateMs:s.maxUpdateMs};}
async function run(smoke=false){
 if(busy)return;busy=true;try{
  const cases=smoke?[test]:ROUND2_CASES;
  const variants:Variant[]=smoke?[variant]:repeat?['round3','round2']:['round2','round3'];
  for(const v of variants){
   await createWorld(v,cases[0]!);
   for(let i=0;i<cases.length;i++){
    if(i)await moveTo(cases[i]!);night=false;weather.setTime('DAY');firstPerson=false;
    status.textContent=v+' '+test.label+'：正常速度真实物理驾驶';const normal=await drive(13.9,4);
    firstPerson=true;status.textContent=v+' '+test.label+'：高速跨块';const high=await drive(33.3,4);
    night=true;weather.setTime('NIGHT');status.textContent=v+' '+test.label+'：夜间行驶';const nightDrive=await drive(13.9,2);
    const staticViewsResult=await staticViews();const entry={variant:v,id:test.id,routeRoadIds:route.roadIds,sourceIds:{roads:test.roadIds,junctions:test.intersectionIds},normal,high,night:nightDrive,staticViews:staticViewsResult,environment:environmentProbe(),stable:geometryState(),streaming:streamSummary()};report.results.push(entry);await save('real-environment',report);
   }
   if(!smoke)for(const boundary of ROUND2_BOUNDARIES.filter(c=>c.id==='tunnel')){await moveTo(boundary);route.start=Math.max(5,route.focusStation-18);resetCar();await warm();night=false;weather.setTime('DAY');firstPerson=false;await capture(test.id+'_boundary');firstPerson=true;await capture(test.id+'_boundary_first');report.boundaries.push({variant:v,id:test.id,sourceIds:{roads:test.roadIds,junctions:test.intersectionIds},state:geometryState(),environment:environmentProbe(),render:lastRender});await save('real-environment',report);}
   if(!smoke){const cycles=[];for(let cycle=0;cycle<2;cycle++){await moveTo(ROUND2_CASES.at(-1)!);await moveTo(ROUND2_CASES[0]!);night=false;weather.setTime('DAY');firstPerson=false;render();cycles.push({cycle,state:geometryState(),cache:streamSummary().cache});}await save(v+'-reload-cycles',{variant:v,cycles});}
   await releaseWorld();
  }
  await save('real-environment',report);status.textContent=smoke?'当前场景检查完成；完整对照尚未运行。':'完整环境对照采样完成，截图与指标已保存。';
 }catch(error){errors.push(String(error));status.textContent='验证失败：'+String(error);console.error(error);await save('real-environment',report).catch(()=>{});}finally{busy=false;}
}
for(const c of [...ROUND2_CASES,...ROUND2_BOUNDARIES]){$<HTMLSelectElement>('case').add(new Option(c.label,c.id));}
function selectedCase(){return [...ROUND2_CASES,...ROUND2_BOUNDARIES].find(c=>c.id===$<HTMLSelectElement>('case').value)!;}
$('load').addEventListener('click',()=>{if(!busy)void createWorld($<HTMLSelectElement>('variant').value as Variant,selectedCase());});
$('run').addEventListener('click',()=>void run());$('smoke').addEventListener('click',()=>{test=selectedCase();variant=$<HTMLSelectElement>('variant').value as Variant;void run(true);});
$('first').addEventListener('click',()=>{firstPerson=true;render();});$('third').addEventListener('click',()=>{firstPerson=false;render();});$('night').addEventListener('click',()=>{night=!night;weather.setTime(night?'NIGHT':'DAY');render();});$('snapshot').addEventListener('click',()=>void capture(test.id+'_manual'));
try{
 const resourceStarted=performance.now(),response=await fetch('/__road_r3_runtime');if(!response.ok)throw new Error('Runtime resource '+response.status);const data=await response.json();runtime=data.runtime;sourceSHA256=data.sourceSHA256;report.sourceSHA256=sourceSHA256;report.mapVersion=runtime.map.version;
 const sealingStarted=performance.now();registerImmutableRoadGeometry(runtime.map,data.geometryRevision);baselineLib.registerImmutableRoadGeometry(runtime.map,data.geometryRevision);report.initialization.push({stage:'shared-resource',loadAndParseMs:sealingStarted-resourceStarted,geometrySealMs:performance.now()-sealingStarted,heap:heap()});
 const materials=createSubject3Materials(),eligibility=new RoadGeometryTrial(runtime.map,materials,round2Selection(runtime.map));
 for(const road of runtime.map.roads){if(eligibility.enabled(road))eligibility.legacySidewalks(road);}for(const j of runtime.map.intersections)eligibility.enabledIntersection(j);
 await save('eligibility',{revision:eligibility.cache.revision,selected:round2Selection(runtime.map),fallbacks:[...eligibility.fallbacks],budget:ROAD_GEOMETRY_BUDGET,fullMapCounts:{roads:runtime.map.roads.length,objects:runtime.map.objects.length}});Object.values(materials).forEach(m=>m.dispose());
 status.textContent='完整地图资源已就绪。';variant=query.get('variant')==='round3'?'round3':'round2';test=[...ROUND2_CASES,...ROUND2_BOUNDARIES].find(c=>c.id===query.get('case'))??test;if(query.get('run')==='1')await run();else if(query.get('smoke')==='1')await run(true);else await createWorld(variant,test);
}catch(error){errors.push(String(error));status.textContent='启动失败：'+String(error);console.error(error);}

