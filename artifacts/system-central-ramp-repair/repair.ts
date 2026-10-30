import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {roadPoints,roadEdges,polylineLength,sampleAt} from '../../src/world/city/geometry';
import {stations} from '../../src/editor/MapAnalysis';
import {fitRampProfile,rampProfile,rampOverlaps} from '../../src/editor/RampProfileAudit';
import {makePavementSegments,clipPavementFootprints} from '../../src/editor/ElevationSeams';
import {bounds,project,EditorSpatialIndex} from '../../src/editor/EditorGeometry';
import {fitLocalProfile} from './local-profile';
const dirArg=process.argv.indexOf('--dir'),dir=dirArg<0?'artifacts/system-central-ramp-repair/':process.argv[dirArg+1]!,audit='artifacts/system-central-ramp-audit/',source='src/world/regional/regional-main.json';
fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(dir+'after',{recursive:true});
const read=(f:string)=>JSON.parse(fs.readFileSync(f,'utf8')),write=(f:string,v:any)=>fs.writeFileSync(dir+f,JSON.stringify(v,null,2)+'\n'),digest=(v:any)=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const current=read(source),inventory=read(audit+'ramp-inventory.json'),beforeProfiles=read(audit+'elevation-audit.json').profiles;
if(!fs.existsSync(dir+'baseline.json')){
 assert.equal(digest(fs.readFileSync(source,'utf8')),inventory.hash,'Source changed since the supplied audit');
 write('baseline.json',{source,hash:inventory.hash,version:current.version,roads:current.roads.filter((r:any)=>r.groupId==='system-central'),signs:current.signs.filter((s:any)=>inventory.ramps.some((r:any)=>r.id===s.roadId)),otherRoadsHash:digest(current.roads.filter((r:any)=>r.groupId!=='system-central')),topologyHash:digest([current.roadLinks,current.connectionPorts,current.intersections]),objectsHash:digest(current.objects),otherFieldsHash:digest(Object.fromEntries(Object.entries(current).filter(([k])=>!['roads','signs','version'].includes(k))))});
}
const baseline=read(dir+'baseline.json'),map=structuredClone(current);for(const original of baseline.roads)map.roads[map.roads.findIndex((r:any)=>r.id===original.id)]=structuredClone(original);
for(const s of baseline.signs)map.signs[map.signs.findIndex((q:any)=>q.id===s.id)]=structuredClone(s);
map.version=baseline.version+1;
const original=structuredClone(map),roadById=new Map<string,any>(map.roads.map((r:any)=>[r.id,r])),seedIds=new Set<string>(baseline.roads.map((r:any)=>r.id));
const families=new Map<string,string>();for(const f of inventory.mainlines)for(const r of f.children)families.set(r.id,f.family);
const contextIds=new Set<string>([...families.keys(),...seedIds,...inventory.nearbySurfaceRoads.map((r:any)=>r.id)]);for(const l of map.roadLinks)if(contextIds.has(l.from.roadId)||contextIds.has(l.to.roadId)){contextIds.add(l.from.roadId);contextIds.add(l.to.roadId);}
const local=(m:any)=>({...m,roads:m.roads.filter((r:any)=>contextIds.has(r.id)),roadLinks:m.roadLinks.filter((l:any)=>contextIds.has(l.from.roadId)&&contextIds.has(l.to.roadId)),intersections:m.intersections.filter((j:any)=>j.connections.every((e:any)=>contextIds.has(e.roadId)))});
const originalLocal=local(original),planes=makePavementSegments(originalLocal),index=new EditorSpatialIndex(24);planes.forEach((p,i)=>index.set(String(i),p.box));
const hits=(p:any)=>index.query({minX:p.x-.001,maxX:p.x+.001,minZ:p.z-.001,maxZ:p.z+.001}).map(i=>planes[Number(i)]).filter(p0=>p0.surface.contains(0)(p.x,p.z));
const pairMeta=new Map<string,any>();
for(const a of planes)if(seedIds.has(a.road.id))for(const j of index.query(a.box)){const b=planes[Number(j)]!;if(b.road.id===a.road.id||seedIds.has(b.road.id)&&a.road.id>b.road.id)continue;const poly=clipPavementFootprints(a.polygon,b.polygon);if(poly.length<3)continue;const area=Math.abs(poly.reduce((s,p,i)=>{const q=poly[(i+1)%poly.length];return s+p.x*q.z-q.x*p.z;},0))/2;if(area<.01)continue;const key=[a.road.id,b.road.id].sort().join('|'),sign=a.road.id<b.road.id?1:-1,values=poly.map(p=>sign*(a.surface.heightAt(p.x,p.z)-b.surface.heightAt(p.x,p.z))),lo=Math.min(...values),hi=Math.max(...values),row=pairMeta.get(key)??{lo:Infinity,hi:-Infinity};row.lo=Math.min(row.lo,lo);row.hi=Math.max(row.hi,hi);pairMeta.set(key,row);}
let constraintMap=originalLocal;
if(process.argv.includes('--refine')&&fs.existsSync(dir+'candidate-map.json')){const previous=read(dir+'candidate-map.json');constraintMap=local(previous);}
const constraintPlanes=makePavementSegments(constraintMap),constraintIndex=new EditorSpatialIndex(24);constraintPlanes.forEach((p,i)=>constraintIndex.set(String(i),p.box));
const constraintHits=(p:any)=>constraintIndex.query({minX:p.x-.001,maxX:p.x+.001,minZ:p.z-.001,maxZ:p.z+.001}).map(i=>constraintPlanes[Number(i)]).filter(q=>q.surface.contains(0)(p.x,p.z));
const config:any={
 'S-to-W-semi':{},
 'E-to-S-semi':{startWindow:360,endWindow:300},
 'E-to-N-right':{startWindow:300,shiftStart:8,sharedBuffer:2},
 'N-to-E-semi':{startWindow:200},
 'N-to-W-right':{endWindow:290,shiftEnd:8,sBend:true},
 'W-to-N-semi':{endWindow:285},
 'W-to-S-right':{startWindow:300,endWindow:180,shiftStart:8},
};
const plans:any[]=[];
for(const sourceRoad of baseline.roads){
 const key=sourceRoad.id.split(':')[1];if(key==='S-to-E-right')continue;
 const r=roadById.get(sourceRoad.id),basePath=roadPoints(sourceRoad),baseStations=stations(basePath),cal=config[key];
 if(cal.shiftStart||cal.shiftEnd){const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*t*(10+t*(-15+6*t));},total=polylineLength(basePath);r.centerline=basePath.map((q,i)=>{const s=baseStations[i]!,d=cal.shiftStart?s:total-s,amount=cal.sBend?(process.argv.includes('--wide-bend')?8*smooth(d/65)*(1-smooth((d-75)/70))-18*smooth((d-90)/80)*(1-smooth((d-190)/95)):8*smooth(d/65)*(1-smooth((d-75)/55))-12*smooth((d-110)/35)*(1-smooth((d-185)/65))):(cal.shiftStart??cal.shiftEnd)*smooth(d/65)*(1-smooth((d-150)/120)),a=sampleAt(basePath,Math.max(0,s-4)).point,b=sampleAt(basePath,Math.min(total,s+4)).point,n=Math.hypot(b.x-a.x,b.z-a.z);return {...q,x:q.x-(b.z-a.z)/n*amount,z:q.z+(b.x-a.x)/n*amount};});}
 const p=roadPoints(r),table=stations(p),length=table.at(-1)!,profile=rampProfile(r);
 const windows:[number,number][]=profile.breaks.filter((b:any)=>b.gradeBreak>=.04).map((b:any)=>[Math.max(0,b.station-24),Math.min(length,b.station+24)]);
 if(cal.startWindow)windows.push([0,cal.startWindow]);if(cal.endWindow)windows.push([length-cal.endWindow,length]);
 windows.sort((a,b)=>a[0]-b[0]);const merged:[number,number][]=[];for(const w of windows){const last=merged.at(-1);if(last&&w[0]<=last[1]+6)last[1]=Math.max(last[1],w[1]);else merged.push([...w]);}
 const positions=[...table];for(const [a,b]of merged){for(let s=a;s<b;s+=2)if(!positions.some(t=>Math.abs(t-s)<.06))positions.push(s);for(const s of [a,b])if(!positions.some(t=>Math.abs(t-s)<.06))positions.push(s);}positions.sort((a,b)=>a-b);
 const points=positions.map(s=>{const i=table.findIndex(t=>Math.abs(t-s)<1e-8);return i>=0?{...p[i]!}:sampleAt(p,s).point;}),ys=points.map(p=>p.y??0),fixed=new Map<number,number>(),lower=ys.map(()=>-50),upper=ys.map(()=>100),shared:any[]=[];
 const livePlanes=makePavementSegments(local(map)),liveIndex=new EditorSpatialIndex(24);livePlanes.forEach((q,i)=>liveIndex.set(String(i),q.box));
 const liveHits=(q:any)=>liveIndex.query({minX:q.x-.001,maxX:q.x+.001,minZ:q.z-.001,maxZ:q.z+.001}).map(i=>livePlanes[Number(i)]).filter(h=>h.surface.contains(0)(q.x,q.z));
 for(let i=0;i<positions.length;i++)if(!merged.some(([a,b])=>positions[i]!>a+3&&positions[i]!<b-3))fixed.set(i,ys[i]!);
 // Preserve every endpoint, including the original sub-millimetre authored value.
 fixed.set(0,ys[0]!);fixed.set(ys.length-1,ys.at(-1)!);
 for(const end of ['start','end'] as const){if(!(end==='start'?cal.startWindow:cal.endWindow))continue;
  const endpoint=inventory.ramps.find((q:any)=>q.id===r.id)[end==='start'?'from':'to'],family=families.get(endpoint.roadId),hosts=original.roads.filter((q:any)=>families.get(q.id)===family).map((q:any)=>({id:q.id,path:roadPoints(q)}));
  const extent= Math.min(250,length*.4),touch:number[]=[];
  for(let d=0;d<=extent;d+=1){const s=end==='start'?d:length-d,frame=sampleAt(p,s),e=roadEdges(r);if([e.left,-r.laneWidth/2,-.835,0,.835,r.laneWidth/2,e.right].some(offset=>{const q={x:frame.point.x-frame.tangent.z*offset,z:frame.point.z+frame.tangent.x*offset};return hits(q).some(h=>families.get(h.road.id)===family);}))touch.push(d);}
  const sharedLength=Math.max(...touch)+(cal.sharedBuffer??8);
  shared.push({end,family,sharedLength,window:end==='start'?cal.startWindow:cal.endWindow});
  for(let i=1;i<positions.length-1;i++)if((end==='start'?positions[i]!:length-positions[i]!)<=sharedLength){const choices=hosts.map(h=>({id:h.id,...project(h.path,points[i]!)})).sort((a,b)=>a.distance-b.distance);fixed.set(i,choices[0]!.point.y??0);}
 }
 // Existing grade-separated crossings remain on the same side of the frozen
 // structural baseline. Do not trade a valid over/underpass for a smooth fit.
 let crossingBounds=0;const crossingDetails:any[]=[];
 for(let i=1;i<points.length-1;i++)if(!fixed.has(i))for(const offset of [roadEdges(r).left,-r.laneWidth/2,0,r.laneWidth/2,roadEdges(r).right]){const f=sampleAt(p,positions[i]!),query={x:f.point.x-f.tangent.z*offset,z:f.point.z+f.tangent.x*offset};for(const h of liveHits(query)){
  if(h.road.id===r.id)continue;
  const pair=pairMeta.get([r.id,h.road.id].sort().join('|'));if(!pair)continue;const lo=r.id<h.road.id?pair.lo:-pair.hi,hi=r.id<h.road.id?pair.hi:-pair.lo,minimum=lo>0?lo:hi<0?-hi:0;
  if(minimum<5.5)continue;
  const gap=lo>0?minimum:-minimum,required=Math.min(6.15,minimum)+.30;
  if(gap>0)lower[i]=Math.max(lower[i]!,h.surface.heightAt(query.x,query.z)+required);else upper[i]=Math.min(upper[i]!,h.surface.heightAt(query.x,query.z)-required);crossingBounds++;crossingDetails.push({station:positions[i],otherRoad:h.road.id,gap,required,offset});
 }}
 const feasibleLo=lower.map((y,i)=>fixed.get(i)??y),feasibleHi=upper.map((y,i)=>fixed.get(i)??y);
 for(let i=1;i<positions.length;i++){const span=.12*(positions[i]!-positions[i-1]!);feasibleLo[i]=Math.max(feasibleLo[i]!,feasibleLo[i-1]!-span);feasibleHi[i]=Math.min(feasibleHi[i]!,feasibleHi[i-1]!+span);}
 for(let i=positions.length-2;i>=0;i--){const span=.12*(positions[i+1]!-positions[i]!);feasibleLo[i]=Math.max(feasibleLo[i]!,feasibleLo[i+1]!-span);feasibleHi[i]=Math.min(feasibleHi[i]!,feasibleHi[i+1]!+span);}
 const impossible=positions.flatMap((station,i)=>feasibleLo[i]!>feasibleHi[i]!+.001?[{station,lower:feasibleLo[i],upper:feasibleHi[i],constraints:crossingDetails.filter(c=>Math.abs(c.station-station)<2.1)}]:[]);
 if(impossible.length){write('infeasible-'+key+'.json',{roadId:r.id,shared,impossible});throw new Error(r.id+' constrained grade infeasible '+JSON.stringify(impossible.slice(0,2)));}
 const fit=fitLocalProfile(positions,ys,fixed,32,{lower,upper},.12);
 r.centerline=points.map((q,i)=>({...q,y:fit[i]}));r.curve='polyline';r.elevationMode='custom';
 // Geometry and physical support use the same authored triangles on edited
 // ramps, rather than independent clamped capsule planes across coarse nodes.
 r.pavementSurface='ribbon';
 const fresh=rampProfile(r),before=beforeProfiles.find((q:any)=>q.roadId===r.id),plan={roadId:r.id,windows:merged,shared,crossingBounds,crossingDetails,before:{maxGrade:before.maxGrade,maxGradeBreak:before.maxGradeBreak,gradeBreakCount:before.breaks.filter((b:any)=>b.gradeBreak>=.04).length},after:{maxGrade:fresh.maxGrade,maxGradeBreak:fresh.maxGradeBreak,gradeBreakCount:fresh.breaks.filter(b=>b.gradeBreak>=.04).length},maxYChange:Math.max(...fit.map((y,i)=>Math.abs(y-ys[i]!))),xzChange:cal.shiftStart??cal.shiftEnd??0,positions:positions.map((station,i)=>({station,before:ys[i],after:fit[i]}))};plans.push(plan);
 console.log(JSON.stringify({...plan,positions:undefined,crossingDetails:undefined}));
}
assert.equal(digest(map.roads.filter((r:any)=>r.groupId!=='system-central')),baseline.otherRoadsHash,'Mainline/unrelated road changed');
assert.deepEqual(roadById.get('system-central:S-to-E-right'),baseline.roads.find((r:any)=>r.id==='system-central:S-to-E-right'));
assert.equal(digest([map.roadLinks,map.connectionPorts,map.intersections]),baseline.topologyHash);
write('repair-plans.json',plans);write('candidate-map.json',map);
write('scope-guard.json',{passRampUnchanged:true,mainlinesAndOtherRoadsUnchanged:true,topologyUnchanged:true,sourceMapUntouched:fs.readFileSync(source,'utf8')===JSON.stringify(current,null,2)+'\n'||digest(fs.readFileSync(source,'utf8'))===baseline.hash,baselineHash:baseline.hash,candidateHash:digest(fs.readFileSync(dir+'candidate-map.json','utf8'))});
