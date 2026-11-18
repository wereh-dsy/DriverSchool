import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
await build({stdin:{resolveDir:resolve('.'),loader:'ts',contents:`
import {readFile,writeFile} from 'node:fs/promises';
import {BufferGeometry,Float32BufferAttribute,Mesh} from 'three';
import {compileCityRuntimeData} from './src/world/city/CityRuntimeData';
import {createSubject3Materials} from './src/world/subject3/materials';
import {RoadBuilder} from './src/world/city/RoadBuilder';
import {RoadGeometryTrial} from './src/world/city/RoadGeometryTrial';
import {excludePavement} from './src/world/city/JunctionSurface';
import {RegionalTerrainClearance} from './src/world/regional/RegionalTerrainClearance';
import {round4Selection,ROUND4_CASES} from './scripts/road-geometry-round4-data';
const map=compileCityRuntimeData(JSON.parse(await readFile('src/world/regional/regional-main.json','utf8'))).map,materials=createSubject3Materials(),selection=round4Selection(map),trial=new RoadGeometryTrial(map,materials,selection),builder=new RoadBuilder(materials,map,selection),mergeOnly=process.argv.includes('--merge-only');
let assertions=0;const check=(ok:boolean,message:string)=>{assertions++;if(!ok)throw new Error(message);};const objects=[];
for(const test of ROUND4_CASES){if(!('roadId'in test)||mergeOnly&&test.id!=='merge')continue;const road=map.roads.find(r=>r.id===test.roadId)!,root=builder.build(road);let triangles=0,bytes=0,projectedMergeMeshes=0;const kinds:string[]=[];root.traverse(o=>{if(!(o instanceof Mesh))return;const p=o.geometry.getAttribute('position');if(o.userData.markingOwner==='merge'&&o.userData.roadGeometryTrial)projectedMergeMeshes++;check(Array.from(p.array).every(Number.isFinite),'finite new geometry '+road.id);triangles+=(o.geometry.index?.count??p.count)/3;for(const a of Object.values(o.geometry.attributes))bytes+=a.array.byteLength;if(o.userData.roadStructureKind)kinds.push(o.userData.roadStructureKind);});
if(road.structure?.enclosure){check(kinds.some(k=>k.endsWith('wall')),'new enclosure shell '+road.id);if(road.structure.enclosure.kind!=='cutting'){check(kinds.includes('tunnel-roof'),'closed roof '+road.id);const roof=root.children.find(o=>o instanceof Mesh&&o.userData.roadStructureKind==='tunnel-roof') as Mesh,n=roof.geometry.getAttribute('normal');check(Array.from({length:n.count},(_,i)=>n.getY(i)).some(y=>y<-.5),'interior-facing roof normal');}}
if(road.highwayTransition){check(trial.enabled(road),'bounded real merge eligible');let paint=0;root.traverse(o=>{if(o instanceof Mesh&&o.userData.markingOwner==='merge')paint+=o.geometry.getAttribute('position').count;});check(paint>0,'real merge retains supported paint');}
objects.push({id:road.id,newBody:trial.enabled(road),newEnclosure:trial.enclosureEnabled(road),kinds,triangles,bytes,projectedMergeMeshes});root.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});}
if(mergeOnly){const result={objects,fallbacks:[...(builder as any).trial.fallbacks]};await writeFile('artifacts/road-geometry-round4/merge-ownership.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));process.exit(0);}
const source=new BufferGeometry();source.setAttribute('position',new Float32BufferAttribute([-4,.024,-4,-4,.024,4,4,.024,4,-4,.024,-4,4,.024,4,4,.024,-4],3));const clipped=excludePavement(source,[{outline:[{x:-1,z:-1},{x:1,z:-1},{x:1,z:1},{x:-1,z:1}],heightAt:()=>0,tolerance:.5}]),p=clipped.getAttribute('position');let area=0;for(let i=0;i<p.count;i+=3)area+=Math.abs((p.getX(i+1)-p.getX(i))*(p.getZ(i+2)-p.getZ(i))-(p.getZ(i+1)-p.getZ(i))*(p.getX(i+2)-p.getX(i)))/2;check(Math.abs(area-60)<1e-5,'static island footprint is removed exactly');clipped.dispose();
const tiny=(x:number,y:number,z:number)=>[{x:x-.02,y,z:z-.02},{x:x+.02,y,z:z-.02},{x,y,z:z+.02}];
const roadCut=new RegionalTerrainClearance(map,{roadIds:['v4-south-logistics-west'],intersectionIds:[]});check(roadCut.clip(tiny(-1738.8533,0,1956.8523)).length===0,'actual buried arterial terrain volume opened');
const tunnelCut=new RegionalTerrainClearance(map,{roadIds:['urban-rail-underpass:underpass'],intersectionIds:[]});check(tunnelCut.clip(tiny(-1420,-4,-1264.444444)).length===0,'terrain removed inside existing underpass volume');check(tunnelCut.clip(tiny(-1420,0,-1264.444444)).length>0,'overburden above tunnel roof retained');
const j=map.intersections.find(j=>j.id==='urban-junction-80')!;check(trial.enabledIntersection(j),'flat real traffic-island junction eligible');
await writeFile('artifacts/road-geometry-round4/local-checks.json',JSON.stringify({assertions,objects,fallbacks:[...trial.fallbacks],geometryChecksOnly:true,collisionTestsRun:false,benchmarksRun:false},null,2)+'\\n');console.log(JSON.stringify({assertions,objects,fallbacks:[...trial.fallbacks]}));
`},bundle:true,platform:'node',format:'esm',outfile:'.tmp-road-round4-checks.mjs',define:{'import.meta.env.DEV':'false'},logLevel:'warning'});const run=spawnSync(process.execPath,['.tmp-road-round4-checks.mjs',...process.argv.slice(2)],{stdio:'inherit'});process.exitCode=run.status??1;
