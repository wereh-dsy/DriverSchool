import {ACESFilmicToneMapping,Color,DirectionalLight,Fog,Group,HemisphereLight,InstancedMesh,Mesh,PCFSoftShadowMap,PerspectiveCamera,Scene,SRGBColorSpace,WebGLRenderer,BufferGeometry} from 'three';
import {RoadBuilder} from '../src/world/city/RoadBuilder';
import {IntersectionBuilder} from '../src/world/city/IntersectionBuilder';
import {cityGroundSectorGeometrySteps} from '../src/world/city/CityGroundGeometry';
import {RegionalTerrain} from '../src/world/regional/RegionalTerrain';
import {RegionalTerrainClearance} from '../src/world/regional/RegionalTerrainClearance';
import {createSubject3Materials} from '../src/world/subject3/materials';
import {PrefabRegistry} from '../src/world/city/PrefabRegistry';
import {roadPoints} from '../src/world/city/geometry';
import {registerImmutableRoadGeometry} from '../src/world/city/RoadGeometryTrialCache';
import type {CityRuntimeData} from '../src/world/city/CityRuntimeData';
import {drain} from '../src/loading/Loading';
import {ROUND4_CASES,round4Selection} from './road-geometry-round4-data';
const baselineURL='/artifacts/road-geometry-round4/round3-visual-baseline.mjs';
const baseline=await import(/* @vite-ignore */baselineURL) as {RoadBuilder:typeof RoadBuilder;IntersectionBuilder:typeof IntersectionBuilder;cityGroundSectorGeometrySteps:typeof cityGroundSectorGeometrySteps;RegionalTerrain:typeof RegionalTerrain;registerImmutableRoadGeometry:typeof registerImmutableRoadGeometry};
const status=document.getElementById('status')!,select=document.getElementById('case') as HTMLSelectElement;
const renderer=new WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(1200,650);renderer.outputColorSpace=SRGBColorSpace;renderer.toneMapping=ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=PCFSoftShadowMap;document.getElementById('view')!.append(renderer.domElement);
const camera=new PerspectiveCamera(55,1200/650,.1,1800),scene=new Scene();scene.background=new Color(0xb6c8cf);scene.fog=new Fog(0xb6c8cf,400,1200);const sun=new DirectionalLight(0xfff2d4,2.1);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-180,right:180,top:180,bottom:-180,near:1,far:500});scene.add(new HemisphereLight(0xd8ebf4,0x6a705c,2),sun,sun.target);
const data=await(await fetch('/__road_r4_runtime')).json() as {runtime:CityRuntimeData;sourceSHA256:string;geometryRevision:string},map=data.runtime.map,selection=round4Selection(map);registerImmutableRoadGeometry(map,data.geometryRevision);baseline.registerImmutableRoadGeometry(map,data.geometryRevision);
const materials=createSubject3Materials(),report:{sourceSHA256:string;mode:string;captures:unknown[];errors:string[]}={sourceSHA256:data.sourceSHA256,mode:'static geometry screenshots only; no performance sampling',captures:[],errors:[]};let current=0,busy=false,disposeCurrent=()=>{};
for(const c of ROUND4_CASES)select.add(new Option(c.id,c.id));
async function save(name:string,value:unknown){const r=await fetch('/__road_r4_save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'report',name,report:value})});if(!r.ok)throw new Error(await r.text());}
async function show(after:boolean,capture=false){
 disposeCurrent();const test=ROUND4_CASES[current]!,root=new Group(),prefabs=new PrefabRegistry(materials),terrain=after?new RegionalTerrain(map,new RegionalTerrainClearance(map,selection)):new baseline.RegionalTerrain(map),rb=after?new RoadBuilder(materials,map,selection):new baseline.RoadBuilder(materials,map,selection),ib=after?new IntersectionBuilder(map,materials,selection):new baseline.IntersectionBuilder(map,materials,selection);
 status.textContent=(after?'Round 4':'Round 3')+' · '+test.id+' · 生成静态结构';
 const distances=map.roads.map(r=>{const points=roadPoints(r);let distance=Infinity;for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!,dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((test.focus.x-a.x)*dx+(test.focus.z-a.z)*dz)/(dx*dx+dz*dz||1)));distance=Math.min(distance,Math.hypot(test.focus.x-a.x-dx*t,test.focus.z-a.z-dz*t));}return {road:r,distance};}).filter(r=>r.distance<test.radius).sort((a,b)=>a.distance-b.distance).slice(0,32);
 for(const {road}of distances)root.add(rb.build(road));
 for(const j of map.intersections)if(Math.hypot(j.position.x-test.focus.x,j.position.z-test.focus.z)<test.radius)root.add(ib.build(j));
 root.add(prefabs.buildInstances(map.objects.filter(o=>Math.hypot(o.position.x-test.focus.x,o.position.z-test.focus.z)<test.radius+60)));
 const keys=new Set<string>();for(let x=Math.floor((test.focus.x-test.radius)/map.sectorSize);x<=Math.floor((test.focus.x+test.radius)/map.sectorSize);x++)for(let z=Math.floor((test.focus.z-test.radius)/map.sectorSize);z<=Math.floor((test.focus.z+test.radius)/map.sectorSize);z++)keys.add(x+','+z);
 for(const key of keys){root.add(terrain.build(key,'near'));const geometries=after?drain(cityGroundSectorGeometrySteps(map,key,20,terrain.clearance)):drain(baseline.cityGroundSectorGeometrySteps(map,key));for(const g of geometries){const m=new Mesh(g,materials.grass);m.receiveShadow=true;root.add(m);}}
 scene.add(root);camera.position.set(test.eye.x,test.eye.y,test.eye.z);camera.lookAt(test.target.x,test.target.y,test.target.z);sun.position.set(test.focus.x-100,test.focus.y+180,test.focus.z+90);sun.target.position.set(test.focus.x,test.focus.y,test.focus.z);sun.target.updateMatrixWorld();root.updateMatrixWorld(true);renderer.render(scene,camera);
 const geometries=new Set<BufferGeometry>(),materialSet=new Set<unknown>();let meshes=0,triangles=0,bytes=0;root.traverse(o=>{if(!(o instanceof Mesh))return;meshes++;materialSet.add(o.material);triangles+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3*(o instanceof InstancedMesh?o.count:1);if(!geometries.has(o.geometry)){geometries.add(o.geometry);for(const name of Object.keys(o.geometry.attributes))bytes+=o.geometry.getAttribute(name).array.byteLength;bytes+=o.geometry.index?.array.byteLength??0;}});
 if(capture){const name=(after?'after_':'before_')+test.id,r=await fetch('/__road_r4_save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'image',name,image:renderer.domElement.toDataURL('image/jpeg',.9)})});if(!r.ok)throw new Error(await r.text());report.captures.push({id:test.id,variant:after?'after':'before',roadIds:distances.map(r=>r.road.id),meshes,triangles,bytes,materials:materialSet.size});await save('static-captures',report);}
 status.textContent=(after?'Round 4':'Round 3')+' · '+test.id+' · 静态画面已就绪';
 disposeCurrent=()=>{scene.remove(root);root.traverse(o=>{if(o instanceof InstancedMesh)o.dispose();});for(const g of geometries)g.dispose();prefabs.dispose();terrain.dispose();root.clear();};
}
async function pair(){if(busy)return;busy=true;try{await show(false,true);await show(true,true);}catch(e){report.errors.push(String(e));status.textContent=String(e);await save('static-captures',report);}finally{busy=false;}}
document.getElementById('before')!.onclick=()=>{if(!busy)void show(false);};document.getElementById('after')!.onclick=()=>{if(!busy)void show(true);};document.getElementById('capture')!.onclick=()=>void pair();select.onchange=()=>{current=ROUND4_CASES.findIndex(c=>c.id===select.value);if(!busy)void show(true);};
if(new URLSearchParams(location.search).get('capture')==='1'){for(current=0;current<ROUND4_CASES.length;current++){select.value=ROUND4_CASES[current]!.id;await pair();if(report.errors.length)break;}current=ROUND4_CASES.length-1;status.textContent=report.errors.length?'截图中止，查看错误记录':'七类静态新旧截图已保存；未运行驾驶或性能采样';}else await show(true);
