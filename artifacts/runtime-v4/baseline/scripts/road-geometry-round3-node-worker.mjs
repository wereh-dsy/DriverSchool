import {parentPort,workerData} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const lib=await import(workerData.module),runtime=lib.compileCityRuntimeData(JSON.parse(await readFile('src/world/regional/regional-main.json','utf8'))),map=runtime.map;
lib.registerImmutableRoadGeometry(map,lib.roadGeometryRevision(map));
const materials={...lib.createSubject3Materials(),tunnelLight:new lib.MeshBasicMaterial()},selection=lib.round2Selection(map),compiler=new lib.RoadVisualCompiler(map,materials,selection,true),templates=new Map();
const memory=()=>{const m=process.memoryUsage();return {heapUsed:m.heapUsed,arrayBuffers:m.arrayBuffers,external:m.external};};
let peak=memory();const sample=()=>{const m=memory();for(const key of Object.keys(peak))peak[key]=Math.max(peak[key],m[key]);return m;};
function geometry(g){const h=createHash('sha256');for(const key of ['position','normal','uv','color','index'])if(g[key])h.update(Buffer.from(g[key].buffer,g[key].byteOffset,g[key].byteLength));h.update(JSON.stringify([g.bounds,g.sphere]));return h.digest('hex');}
const jobs=[];
for(const id of workerData.ids){
 const before=sample(),task=compiler.compileSteps(id);let activeMs=0,maxStepMs=0,steps=0,output;
 for(;;){const start=performance.now(),step=task.next(),elapsed=performance.now()-start;activeMs+=elapsed;maxStepMs=Math.max(maxStepMs,elapsed);if(++steps%512===0)sample();if(step.done){output=step.value;break;}}
 const after=sample(),surfaces=output.surfaces.map(p=>[p.key,p.material,p.barrierTriangles,geometry(p.geometry)]),instances=output.instances.map(p=>{if(p.geometry)templates.set(p.geometryId,geometry(p.geometry));const h=createHash('sha256').update(Buffer.from(p.matrices.buffer,p.matrices.byteOffset,p.matrices.byteLength)).digest('hex');return [p.key,p.material,p.lamp,templates.get(p.geometryId),h];});
 const road=map.roads.find(r=>r.id===id),colliders=lib.roadStructureColliders(road,map);
 jobs.push({id,activeMs,maxStepMs,steps,before,after,geometrySHA256:createHash('sha256').update(JSON.stringify([surfaces,instances])).digest('hex'),colliderSHA256:createHash('sha256').update(JSON.stringify(colliders)).digest('hex'),metrics:compiler.lastMetrics??null});output=undefined;
}
const junctions=[];for(const id of selection.intersectionIds){const j=map.intersections.find(j=>j.id===id),builder=new lib.IntersectionBuilder(map,materials,selection),task=builder.buildSteps(j);let activeMs=0,maxStepMs=0,root;for(;;){const start=performance.now(),step=task.next(),elapsed=performance.now()-start;activeMs+=elapsed;maxStepMs=Math.max(maxStepMs,elapsed);if(step.done){root=step.value;break;}}
 const meshes=[];root.traverse(o=>{if(!o.isMesh)return;const g=o.geometry,attrs={};for(const key of ['position','normal','uv','color'])if(g.getAttribute(key))attrs[key]=g.getAttribute(key).array;attrs.index=g.index?.array;attrs.bounds=[];attrs.sphere=[];meshes.push([o.name,o.userData,geometry(attrs)]);g.dispose();});junctions.push({id,activeMs,maxStepMs,geometrySHA256:createHash('sha256').update(JSON.stringify(meshes)).digest('hex')});root.clear();}
sample();parentPort.postMessage({variant:workerData.variant,scope:'Node Worker isolate; not browser Worker heap',jobs,junctions,peak,final:memory(),cache:compiler.builder?.trial?.cache.state??null,forcedGC:false});parentPort.close();
