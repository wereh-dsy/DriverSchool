import {readFile,writeFile} from 'node:fs/promises';
import {Session} from 'node:inspector';
import * as base from '../artifacts/road-geometry-round3/round2-baseline.mjs';
const raw=await readFile('src/world/regional/regional-main.json','utf8'),runtime=base.compileCityRuntimeData(JSON.parse(raw)),map=runtime.map;
base.registerImmutableRoadGeometry(map,base.roadGeometryRevision(map));
const materials={...base.createSubject3Materials(),tunnelLight:new base.MeshBasicMaterial({color:0xffefd0})},selection=base.round2Selection(map);
const data=JSON.parse(await readFile('artifacts/road-geometry-round2/reverse-real-environment.json','utf8'));
const jobs=new Map();for(const r of data.results)for(const s of r.streaming.workerSamples??[])if(s.kind==='road'&&(!jobs.has(s.id)||jobs.get(s.id).activeMs<s.activeMs))jobs.set(s.id,s);
const slow=[...jobs.values()].sort((a,b)=>b.activeMs-a.activeMs).slice(0,24),ids=[...new Set([...slow.map(s=>s.id.slice(5)),...selection.roadIds])];
const inspector=new Session();inspector.connect();const post=(method,params={})=>new Promise((resolve,reject)=>inspector.post(method,params,(e,r)=>e?reject(e):resolve(r)));
await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:500});await post('Profiler.start');
const compiler=new base.RoadVisualCompiler(map,materials,selection),results=[];
for(const id of ids){const before=process.memoryUsage(),start=performance.now(),output=compiler.compile(id),elapsed=performance.now()-start,after=process.memoryUsage();const road=map.roads.find(r=>r.id===id);results.push({id,selected:selection.roadIds.includes(id),elevation:road.elevationMode,curve:road.curve,lanes:road.laneCount,sourcePoints:road.centerline.length,transition:!!road.highwayTransition,enclosure:road.structure?.enclosure?.kind,activeMs:elapsed,before,after,outputBytes:output.surfaces.reduce((n,s)=>n+s.geometry.position.byteLength+s.geometry.normal.byteLength+(s.geometry.uv?.byteLength??0),0)+output.instances.reduce((n,s)=>n+s.matrices.byteLength,0)});}
const {profile}=await post('Profiler.stop');inspector.disconnect();
const nodes=new Map(profile.nodes.map(n=>[n.id,n])),hot=new Map();for(let i=0;i<(profile.samples?.length??0);i++){const n=nodes.get(profile.samples[i]),key=n.callFrame.functionName+' '+n.callFrame.url+':'+n.callFrame.lineNumber;hot.set(key,(hot.get(key)??0)+(profile.timeDeltas?.[i]??500)/1000);}
await writeFile('artifacts/road-geometry-round3/baseline.cpuprofile',JSON.stringify(profile));
const result={slowRound2:slow,roads:results,hot:[...hot].sort((a,b)=>b[1]-a[1]).slice(0,45)};await writeFile('artifacts/road-geometry-round3/baseline-profile.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({slow:results.toSorted((a,b)=>b.activeMs-a.activeMs).slice(0,8),hot:result.hot.slice(0,16)}));
