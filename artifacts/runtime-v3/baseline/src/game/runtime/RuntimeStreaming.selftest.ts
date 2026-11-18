import { PerspectiveCamera, PlaneGeometry, Vector3 } from 'three';
import { newCityMap } from '../../world/city/CityMapData';
import { RegionalStreaming } from '../../world/regional/RegionalStreaming';
import { SectorManager } from '../../world/city/SectorManager';
import { PrefabRegistry } from '../../world/city/PrefabRegistry';
import { RoadVisualCompiler } from '../../world/city/RoadVisualCompiler';
import { exportVisualGeometry, type VisualWorkerRequest } from '../../world/city/VisualStreamingData';
import { createSubject3Materials } from '../../world/subject3/materials';
import { MeshBasicMaterial } from 'three';
import { RuntimeCoordinator } from './RuntimeCoordinator';

export async function runRuntimeStreamingSelfTest(){
  let assertions=0;
  const check=(ok:boolean,label:string)=>{assertions++;if(!ok)throw Error('Runtime streaming: '+label);};
  const map=newCityMap();map.sectorSize=200;
  map.bounds={minX:-1000,maxX:5000,minZ:-1000,maxZ:2000};
  map.regional={version:1,terrainBounds:map.bounds,cityBounds:map.bounds,routes:[],structures:[],exits:[]};
  const road=(id:string,start:number,end:number,z=0)=>({id,type:'urban_2lane' as const,laneCount:2,laneWidth:3.5,travelDirection:'two-way' as const,speedLimit:60,centerline:[{x:start,y:0,z},{x:end,y:0,z}]});
  map.roads=[road('a',0,1000),road('b',1000,2000),road('c',2000,3500),road('parallel',0,3500,150)];
  map.roadLinks=[{id:'ab',from:{roadId:'a',end:'end'},to:{roadId:'b',end:'start'}},{id:'bc',from:{roadId:'b',end:'end'},to:{roadId:'c',end:'start'}}];
  const streaming=new RegionalStreaming(map);
  const slow=streaming.select(400,0,-Math.PI/2,0,0),fast=streaming.select(400,0,-Math.PI/2,55,0);
  check(fast.lookaheadMetres>slow.lookaheadMetres,'speed adapts graph corridor length');
  check(fast.roadIds!.has('b')&&fast.roadIds!.has('c'),'explicit continuations are prepared');
  check(!fast.roadIds!.has('parallel'),'unconnected parallel road cannot hijack the corridor');
  const returning=streaming.select(1800,0,Math.PI/2,55,0);
  check(returning.roadIds!.has('a'),'turning back prepares the return connection');
  streaming.corridor.observePreparation(30000);
  check(streaming.select(400,0,-Math.PI/2,55,0).lookaheadMetres>fast.lookaheadMetres,'observed preparation latency expands the horizon');
  check(fast.tiers.get('20,5')==='far'&&fast.tiers.size<streaming.sectors.size,'local selection preserves implicit far tiers without cloning the map');

  const fixture=newCityMap();fixture.sectorSize=200;fixture.bounds={minX:0,maxX:1600,minZ:0,maxZ:200};
  fixture.regional={version:1,terrainBounds:fixture.bounds,cityBounds:fixture.bounds,routes:[],structures:[],exits:[]};
  fixture.roads=[road('street',20,180,80),road('visible-mid',1020,1180,80)];
  fixture.objects=[
    {id:'safety-light',prefabId:'streetlight',position:{x:80,z:95},rotation:0},
    {id:'office-decoration',prefabId:'office',position:{x:120,z:140},rotation:0},
    {id:'distant-safety-light',prefabId:'streetlight',position:{x:1080,z:95},rotation:0},
  ];
  const materials={...createSubject3Materials(),tunnelLight:new MeshBasicMaterial()};
  const compiler=new RoadVisualCompiler(fixture,materials),geometry=new PlaneGeometry(1,1),data=exportVisualGeometry(geometry);
  geometry.dispose();
  const terrainData=(key:string,tier:string)=>{
    const[x,z]=key.split(',').map(Number),plane=new PlaneGeometry(180,8);
    plane.rotateX(-Math.PI/2);plane.translate(x!*200+100,0,z!*200+80);
    const geometry=exportVisualGeometry(plane);plane.dispose();
    return{key,tier,geometries:[geometry],roadSurface:geometry};
  };
  const workerDescriptor=Object.getOwnPropertyDescriptor(globalThis,'Worker');
  const rafDescriptor=Object.getOwnPropertyDescriptor(globalThis,'requestAnimationFrame');
  const cancelDescriptor=Object.getOwnPropertyDescriptor(globalThis,'cancelAnimationFrame');
  let callback:FrameRequestCallback|undefined;
  Object.defineProperty(globalThis,'requestAnimationFrame',{configurable:true,value:(cb:FrameRequestCallback)=>{callback=cb;return 1;}});
  Object.defineProperty(globalThis,'cancelAnimationFrame',{configurable:true,value:()=>{callback=undefined;}});
  Object.defineProperty(globalThis,'Worker',{configurable:true,value:class{
    onmessage?: (event:{data:unknown})=>void;
    postMessage(request:VisualWorkerRequest){
      if(request.kind==='init')this.onmessage?.({data:{kind:'ready'}});
      if(request.kind==='road')this.onmessage?.({data:{kind:'road',data:compiler.compile(request.id)}});
      if(request.kind==='terrain')this.onmessage?.({data:{kind:'terrain',data:terrainData(request.key,request.tier)}});
      if(request.kind==='background')this.onmessage?.({data:{kind:'background',data:request.keys.map(key=>({key,tier:'far',geometries:[data]}))}});
    }
    terminate(){}
  }});
  const runtime=new RuntimeCoordinator(),prefabs=new PrefabRegistry(materials),sectors=new SectorManager(fixture,materials,prefabs);
  const decorations:(()=>void)[]=[];
  sectors.setRuntimeCoordinator(runtime);
  sectors.setResourcePreparation(()=>{},root=>root.name.startsWith('City decoration')?new Promise<void>(resolve=>decorations.push(resolve)):Promise.resolve());
  const eye=new Vector3(60,2,80),camera=new PerspectiveCamera(60,16/9,.1,2000);camera.position.copy(eye);camera.lookAt(1100,0,80);camera.updateMatrixWorld();
  let playerX=60;
  runtime.start(()=>{
    sectors.updateVisibility(eye,1100,[camera]);
    runtime.enqueue({id:'fixture-world',phase:'streaming',priority:()=> 'visible',valid:()=>true,step:()=>{sectors.updatePosition(playerX,80,-Math.PI/2,0);return true;}});
  });
  let time=0;
  const frame=async()=>{const cb=callback!;callback=undefined;cb(time+=16);for(let i=0;i<12;i++)await Promise.resolve();};
  try{
    for(let i=0;i<400&&!sectors.active.get('0,0')?.userData.roadManifest?.complete;i++)await frame();
    const root=sectors.active.get('0,0')!;
    check(root?.userData.roadManifest?.complete===true,'Tier 1 becomes complete before decoration is released');
    check(root.userData.roadManifest.markingBatches>0,'real compiled marking batches publish with the road');
    check(root.userData.roadManifest.criticalObjects===1&&root.userData.roadManifest.signs===0,'manifest reflects authored safety objects and absent signs');
    let office=false,light=false;
    root.traverse(object=>{office ||= object.name==='office instances';light ||= object.name==='streetlight instances';});
    check(light&&!office,'streetlight is ready while office decoration is held');
    let mid=sectors.active.get('5,0');
    for(let i=0;i<200&&!sectors.active.get('5,0')?.userData.roadManifest?.complete;i++){
      await frame();mid??=sectors.active.get('5,0');
    }
    check(mid!==undefined&&sectors.active.get('5,0')===mid&&mid.userData.roadManifest?.complete,'visible mid surface receives Tier 1 without replacing its terrain or base mesh');
    check(mid!.userData.roadManifest.markingBatches>0&&mid!.userData.roadManifest.criticalObjects===1,'the mid supplement includes actual markings and safety objects');
    for(let i=0;i<80&&!office;i++){
      for(const resolve of decorations.splice(0))resolve();
      await frame();root.traverse(object=>{office ||= object.name==='office instances';});
    }
    check(office,'decoration eventually publishes without replacing the road');
    const safety=root.children.filter(child=>child.userData.roadCritical);
    playerX=1100;eye.set(playerX,2,80);camera.position.copy(eye);camera.lookAt(2100,0,80);camera.updateMatrixWorld();
    (sectors as any).visibleRoadDemand.set('0,0',-Infinity);
    (sectors as any).nearDowngradeAt.set('0,0',-Infinity);
    for(let i=0;i<300&&sectors.active.get('0,0')===root;i++)await frame();
    const downgraded=sectors.active.get('0,0');
    check(downgraded!==root&&downgraded?.userData.roadManifest?.complete,'distance downgrade retains a complete road');
    check(safety.length>0&&safety.every(child=>child.parent===downgraded),'downgrade transfers the same warmed safety resources without rebuilding');
    sectors.dispose();runtime.dispose();
    for(const resolve of decorations.splice(0))resolve();
    for(let i=0;i<30;i++)await Promise.resolve();
    check(sectors.visualStatistics.resourcesReleased,'pending preparation and geometry ownership are released on exit');
  }finally{
    sectors.dispose();runtime.dispose();
    for(const resolve of decorations.splice(0))resolve();
    for(let i=0;i<30;i++)await Promise.resolve();
    prefabs.dispose();for(const material of Object.values(materials))material.dispose();
    for(const[name,descriptor]of [['Worker',workerDescriptor],['requestAnimationFrame',rafDescriptor],['cancelAnimationFrame',cancelDescriptor]] as const){
      if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);
    }
  }
  return{passed:true,assertions};
}
