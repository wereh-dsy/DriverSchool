import { AmbientLight, BoxGeometry, BufferGeometry, Color, DirectionalLight, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, PCFSoftShadowMap, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createSubject3Materials } from '../src/world/subject3/materials';
import { PrefabRegistry } from '../src/world/city/PrefabRegistry';
import { SectorManager } from '../src/world/city/SectorManager';
import { VisualStreamingWorker } from '../src/world/city/VisualStreamingWorker';
import type { CityMapData } from '../src/world/city/CityMapData';
import type { CompiledRoadVisual } from '../src/world/city/VisualStreamingData';
import { RoadVisualCompiler } from '../src/world/city/RoadVisualCompiler';
import { ROAD_TRIAL_CASES, roadTrialRegion, type RoadTrialCase } from './road-geometry-trial-data';
import { runContinuousRoadGeometrySelfTest } from '../src/world/city/ContinuousRoadGeometry.selftest';

const host = document.querySelector<HTMLDivElement>('#view')!, status = document.querySelector<HTMLDivElement>('#status')!, stats = document.querySelector<HTMLDivElement>('#stats')!;
const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFSoftShadowMap;
renderer.info.autoReset = false; host.prepend(renderer.domElement);
const camera = new PerspectiveCamera(48, 1, .1, 5000), controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false; controls.addEventListener('change', () => render());
const materials = { ...createSubject3Materials(), tunnelLight: new MeshBasicMaterial({ color: 0xffefd0 }) };
const errors: string[] = [];
window.addEventListener('error', e => errors.push(e.message));
window.addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
let source: CityMapData, test = ROAD_TRIAL_CASES[0]!, pair: ReturnType<typeof makeScene>[] = [], focus = new Vector3(), direction = new Vector3();
let metrics: { variant: string; calls: number; triangles: number }[] = [], busy = false, wireframe = false;

function buffers(root: Group): number {
  const seen = new Set<BufferGeometry>(); let bytes = 0;
  root.traverse(o => {
    if (!(o instanceof Mesh)) return;
    if (!seen.has(o.geometry)) { seen.add(o.geometry); for (const name of Object.keys(o.geometry.attributes)) bytes += o.geometry.getAttribute(name).array.byteLength; bytes += o.geometry.index?.array.byteLength ?? 0; }
    if (o instanceof InstancedMesh) bytes += o.instanceMatrix.array.byteLength;
  });
  return bytes;
}
function makeScene(variant: 'legacy' | 'continuous', region: ReturnType<typeof roadTrialRegion>) {
  const scene = new Scene(); scene.background = new Color(0x899ca9);
  scene.add(new AmbientLight(0xdbe7f1, 2.0));
  const light = new DirectionalLight(0xfff1d8, 3.0); light.position.set(region.focus.x + 90, (region.focus.y ?? 0) + 150, region.focus.z + 60); light.target.position.set(region.focus.x, region.focus.y ?? 0, region.focus.z);
  light.castShadow = true; light.shadow.mapSize.set(2048,2048); light.shadow.camera.left = light.shadow.camera.bottom = -160; light.shadow.camera.right = light.shadow.camera.top = 160; light.shadow.camera.far = 500; light.shadow.bias = -.0002;
  scene.add(light,light.target);
  const prefabs = new PrefabRegistry(materials), start = performance.now();
  const sectors = new SectorManager(region.map,materials,prefabs,{loadRadius:1,roadGeometryTrial:variant==='continuous'?region.selection:undefined});
  sectors.updatePosition(region.focus.x,region.focus.z);
  const generationMs = performance.now() - start;
  scene.add(sectors.root);
  const minimumY = Math.min(...region.map.roads.flatMap(r => r.centerline.map(p => p.y ?? r.elevation ?? 0)));
  const baseGeometry = new BoxGeometry(1800,.3,1800), baseMaterial = new MeshStandardMaterial({color:0x738a72,roughness:1});
  const base = new Mesh(baseGeometry,baseMaterial); base.position.set(region.focus.x,minimumY-.2,region.focus.z); base.receiveShadow = true; scene.add(base);
  return { scene, sectors, prefabs, generationMs, bufferBytes:buffers(sectors.root), variant,
    dispose: () => { sectors.dispose(); prefabs.dispose(); baseGeometry.dispose(); baseMaterial.dispose(); light.shadow.map?.dispose(); light.dispose(); } };
}
function render(): void {
  if (!pair.length) return;
  const width = renderer.domElement.width, height = renderer.domElement.height, half = Math.floor(width/2);
  camera.aspect = half/height; camera.updateProjectionMatrix(); renderer.setScissorTest(true);
  metrics = [];
  pair.forEach((item,i) => {
    renderer.setViewport(i*half,0,half,height);renderer.setScissor(i*half,0,half,height);renderer.info.reset();
    renderer.render(item.scene,camera);
    metrics.push({ variant:item.variant,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles });
  });
  stats.textContent = pair.map((item,i) => `${item.variant.padEnd(10)} Draw Calls ${metrics[i]!.calls} | 提交三角形 ${metrics[i]!.triangles.toLocaleString()} | 几何缓冲 ${(item.bufferBytes/1048576).toFixed(2)} MiB | 扇区生成 ${item.generationMs.toFixed(1)} ms`).join('\n');
}
function resize(): void { const width = Math.max(800,window.innerWidth-44), height=Math.max(430,Math.min(650,window.innerHeight-245));host.style.height=height+'px';renderer.setSize(width,height);render(); }
window.addEventListener('resize',resize);
function view(kind: 'overview'|'detail'|'inside'): void {
  const right = new Vector3(-direction.z,0,direction.x).normalize(), d = kind==='detail'?38:test.distance;
  if(kind==='inside'){
    const eye=focus.clone().addScaledVector(direction,-27);eye.y=(focus.y??0)+1.55;
    camera.position.copy(eye);controls.target.copy(eye).addScaledVector(direction,-65).add(new Vector3(0,2,0));
  }else{
    controls.target.copy(focus).add(new Vector3(0,kind==='detail'?1:0,0));
    camera.position.copy(focus).addScaledVector(right,d*.72).addScaledVector(direction,-d*.75).add(new Vector3(0,d*(kind==='detail'?.2:.65),0));
  }
  controls.update();render();
}
async function select(next: RoadTrialCase): Promise<void> {
  status.textContent='正在生成 '+next.label+'…';await new Promise(requestAnimationFrame);
  pair.forEach(p=>p.dispose());pair=[];test=next;
  const region=roadTrialRegion(source,test);focus.set(region.focus.x,region.focus.y??0,region.focus.z);direction.set(region.direction.x,0,region.direction.z).normalize();
  pair=[makeScene('legacy',region),makeScene('continuous',roadTrialRegion(source,test))];
  for(const button of document.querySelectorAll<HTMLButtonElement>('#regions button'))button.classList.toggle('active',button.dataset.id===test.id);
  resize();view('overview');status.textContent=`${test.label} · ${region.selection.roadIds.length} 条道路 / ${region.selection.intersectionIds.length} 个路口启用试验，周边 ${region.map.roads.length} 条真实道路保留。`;
}
async function post(data: unknown): Promise<void> {const res=await fetch('/__road_trial_capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(!res.ok)throw new Error(await res.text());}
async function capture(name: string): Promise<void> {render();await post({name,image:renderer.domElement.toDataURL('image/png')});}
function signature(data:CompiledRoadVisual){return {surfaces:data.surfaces.map(s=>[s.key,s.material,s.geometry.position.length,s.geometry.normal.length]),instances:data.instances.map(s=>[s.key,s.material,s.matrices.length,s.geometry?.position.length??0])};}
async function workerCheck():Promise<unknown>{
  const region=roadTrialRegion(source,ROAD_TRIAL_CASES.find(t=>t.id==='bridge')!);
  region.map.regional={version:1,cityBounds:region.map.bounds,terrainBounds:region.map.bounds,routes:[],structures:[],exits:[]};
  const compiler=new RoadVisualCompiler(region.map,materials,region.selection), ids=[...region.selection.roadIds];
  const expected=new Map(ids.map(id=>[id,compiler.compile(id)])), received:CompiledRoadVisual[]=[];
  const worker=new VisualStreamingWorker(region.map,data=>received.push(data),()=>{},region.selection), started=performance.now();
  for(const id of ids)worker.request('road:'+id,{kind:'road',id},0);
  try{
    while(received.length<ids.length){if(worker.error)throw worker.error;if(performance.now()-started>30000)throw new Error('Worker trial timeout');worker.advance();await new Promise(resolve=>setTimeout(resolve,10));}
    for(const data of received){
      const old=expected.get(data.id)!;
      if(JSON.stringify(signature(old))!==JSON.stringify(signature(data)))throw new Error('Worker/CPU structure mismatch');
      data.surfaces.forEach((s,i)=>{const p=old.surfaces[i]!.geometry.position;if(p.length!==s.geometry.position.length||p.some((v,k)=>Math.abs(v-s.geometry.position[k]!)>1e-5))throw new Error('Worker/CPU vertex mismatch');});
    }
    return {pass:true,roadIds:ids,cpuWorkerMatch:true,timings:{...worker.timings}};
  }finally{worker.dispose();}
}
async function collect():Promise<void>{
  if(busy)return;busy=true;const results:unknown[]=[];
  try{
    const unit=runContinuousRoadGeometrySelfTest();
    for(const next of ROAD_TRIAL_CASES){
      await select(next);await new Promise(requestAnimationFrame);await capture(next.id);
      results.push({id:next.id,views:metrics.map(m=>({...m})),buffers:pair.map(p=>({variant:p.variant,bytes:p.bufferBytes,generationMs:p.generationMs})),activeSectors:pair.map(p=>p.sectors.active.size)});
      if(['arterial','median','junction','bridge'].includes(next.id)){view('detail');await capture(next.id+'-detail');}
      if(next.id==='underground'){view('inside');await capture('underground-interior');}
    }
    const worker=await workerCheck();
    // Warm repeated selection/unload must return GPU geometry/texture residency
    // to the same count after every disposal/rebuild (renderer tracks real uploads).
    const residency:{geometries:number;textures:number}[]=[];
    for(let i=0;i<3;i++){await select(ROAD_TRIAL_CASES[4]!);render();residency.push({...renderer.info.memory});}
    if(residency.some(r=>r.geometries!==residency[0]!.geometries||r.textures!==residency[0]!.textures))throw new Error('GPU residency grows across trial reloads');
    const report={date:new Date().toISOString(),source:'regional-main.json',mapVersion:source.version,unit,results,worker,gpuReloadResidency:residency,webglErrors:errors,contextLost:renderer.getContext().isContextLost()};
    if(errors.length||report.contextLost)throw new Error('Browser rendering errors: '+errors.join('; '));
    await post({kind:'report',report});status.textContent='全部对比截图、Worker 顶点一致性及 GPU 重载检查已保存。';
  }catch(error){status.textContent='验证失败：'+String(error);console.error(error);await post({kind:'report',report:{error:String(error),results,webglErrors:errors}}).catch(()=>{});}
  finally{busy=false;}
}
document.querySelector('#overview')!.addEventListener('click',()=>view('overview'));
document.querySelector('#detail')!.addEventListener('click',()=>view('detail'));
document.querySelector('#inside')!.addEventListener('click',()=>view('inside'));
document.querySelector('#wire')!.addEventListener('click',()=>{wireframe=!wireframe;for(const m of Object.values(materials))if(m instanceof MeshStandardMaterial||m instanceof MeshBasicMaterial)m.wireframe=wireframe;render();});
document.querySelector('#capture')!.addEventListener('click',()=>void capture(test.id));
document.querySelector('#run')!.addEventListener('click',()=>void collect());
for(const next of ROAD_TRIAL_CASES){const button=document.createElement('button');button.textContent=next.label;button.dataset.id=next.id;button.addEventListener('click',()=>{if(!busy)void select(next);});document.querySelector('#regions')!.append(button);}
try{
  const response=await fetch('/__road_trial_map');if(!response.ok)throw new Error('Map HTTP '+response.status);source=await response.json();
  await select(test);
  if(new URLSearchParams(location.search).get('capture')==='1')await collect();
}catch(error){status.textContent='启动失败：'+String(error);console.error(error);}
