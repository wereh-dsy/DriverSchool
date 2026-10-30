import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {roadPoints,roadEdges,sampleAt,polylineLength} from '../../src/world/city/geometry';
import {rampProfile} from '../../src/editor/RampProfileAudit';
import {makePavementSegments,clipPavementFootprints} from '../../src/editor/ElevationSeams';
import {EditorSpatialIndex,bounds,project} from '../../src/editor/EditorGeometry';
import {buildCityRoadNetwork} from '../../src/world/city/CityRoadNetwork';
export {roadPoints,roadEdges,sampleAt,polylineLength,rampProfile,makePavementSegments,clipPavementFootprints,EditorSpatialIndex,bounds,project,buildCityRoadNetwork};
export const dir='artifacts/final-ramp-structural-cleanup/',source='src/world/regional/regional-main.json';
function io<T>(fn:()=>T):T{for(let i=0;;i++){try{return fn();}catch(e){if(i===3)throw e;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100);}}}
export const read=(f:string)=>io(()=>JSON.parse(fs.readFileSync(f,'utf8'))),write=(f:string,v:any)=>{const data=JSON.stringify(v,null,2)+'\n';io(()=>fs.writeFileSync(dir+f+'.tmp',data));io(()=>fs.renameSync(dir+f+'.tmp',dir+f));};
export const hash=(v:any)=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
export const ramp=(r:any)=>r.type==='ramp_1'||r.roadClass==='ramp'||!!r.highwayTransition;
export const central=(r:any)=>r.groupId==='system-central'||r.id.startsWith('system-central:');
export const len=(r:any)=>polylineLength(roadPoints(r));
export const clusterName=(r:any):string=>r.highwayTransition?clusterName({id:r.highwayTransition.decisionId}):r.groupId??(r.id.includes(':')?r.id.split(':').slice(0,/^regional:v[23]:/.test(r.id)?3:2).join(':'):r.id.replace(/-(?:eb|wb|nb|sb|inner|outer|on|off).*$/,'').replace(/^access-/,'v91-'));
export function context(map:any,seeds:any[]){const area=bounds(seeds.flatMap(roadPoints),100),inside=(r:any)=>{const b=bounds(roadPoints(r),20);return b.minX<=area.maxX&&b.maxX>=area.minX&&b.minZ<=area.maxZ&&b.maxZ>=area.minZ;},ids=new Set<string>(map.roads.filter(inside).map((r:any)=>r.id));
 for(const l of map.roadLinks)if(ids.has(l.from.roadId)||ids.has(l.to.roadId)){ids.add(l.from.roadId);ids.add(l.to.roadId);}
 for(const r of map.roads)if(ids.has(r.id)&&r.highwayTransition){ids.add(r.highwayTransition.mainRoadId);ids.add(r.highwayTransition.decisionId);}
 return {...map,roads:map.roads.filter((r:any)=>ids.has(r.id)),roadLinks:map.roadLinks.filter((l:any)=>ids.has(l.from.roadId)&&ids.has(l.to.roadId)),intersections:map.intersections.filter((j:any)=>j.connections.every((e:any)=>ids.has(e.roadId)))};
}
export function pavement(map:any){const segments=makePavementSegments(map),index=new EditorSpatialIndex(24);segments.forEach((s,i)=>index.set(String(i),s.box));return {segments,index,hit:(p:any)=>index.query({minX:p.x-.001,maxX:p.x+.001,minZ:p.z-.001,maxZ:p.z+.001}).map(i=>segments[Number(i)]!).filter(s=>s.surface.contains(0)(p.x,p.z))};}
export function hostFor(map:any,r:any,end:string,network?:ReturnType<typeof buildCityRoadNetwork>){const candidates=map.roadLinks.filter((l:any)=>[l.from,l.to].some(e=>e.roadId===r.id&&e.end===end)).map((l:any)=>l.from.roadId===r.id?l.to:l.from),roads=new Map<string,any>(map.roads.map((r:any)=>[r.id,r]));
 const expected=end==='start'?'end':'start';const direct=candidates.sort((a:any,b:any)=>(a.end===expected?-10:0)+(ramp(roads.get(a.roadId))?1:0)-((b.end===expected?-10:0)+(ramp(roads.get(b.roadId))?1:0)))[0];
 if(direct){const path=roadPoints(r),u=sampleAt(path,end==='start'?0:polylineLength(path)).tangent,score=(e:any)=>{const q=roadPoints(roads.get(e.roadId)),v=sampleAt(q,e.end==='start'?0:polylineLength(q)).tangent;return (e.end===end?-1:1)*(u.x*v.x+u.z*v.z);};
  if(score(direct)<Math.cos(15*Math.PI/180)&&network){const ends:any[]=[{roadId:r.id,end}],seen=new Set<string>();for(let i=0;i<ends.length;i++){const e=ends[i],key=e.roadId+':'+e.end;if(seen.has(key))continue;seen.add(key);for(const l of map.roadLinks)for(const [a,b]of [[l.from,l.to],[l.to,l.from]])if(a.roadId===e.roadId&&a.end===e.end&&!seen.has(b.roadId+':'+b.end))ends.push(b);}
   const alternatives=ends.filter(e=>e.roadId!==r.id&&roads.has(e.roadId)&&!ramp(roads.get(e.roadId))&&network.routing!.connections.some(c=>end==='start'?c.fromRoadId===e.roadId&&c.fromEnd===e.end&&c.toRoadId===r.id&&c.toEnd===end:c.fromRoadId===r.id&&c.fromEnd===end&&c.toRoadId===e.roadId&&c.toEnd===e.end)).sort((a,b)=>score(b)-score(a));
   if(alternatives[0]&&score(alternatives[0])>score(direct))return {...alternatives[0],selection:'Existing directed endpoint-cluster continuation; direct listed link approaches the opposite side of a two-way road',directListedEndpoint:direct};
  }return direct;
 }
 const junction=map.intersections.find((j:any)=>j.connections.some((e:any)=>e.roadId===r.id&&e.end===end));const other=junction?.connections.find((e:any)=>e.roadId!==r.id);return other?{roadId:other.roadId,end:other.end,junctionId:junction.id}:null;
}
export function family(map:any,host:any,exclude:string){if(!host)return new Set<string>();const roads=new Map<string,any>(map.roads.map((r:any)=>[r.id,r])),ids=new Set<string>([host.roadId]),queue=[host.roadId];
 const tr=roads.get(host.roadId)?.highwayTransition;if(tr&&roads.has(tr.mainRoadId)){ids.add(tr.mainRoadId);queue.push(tr.mainRoadId);}
 for(let k=0;k<queue.length&&k<90;k++){const id=queue[k]!,r=roads.get(id);if(!r)continue;for(const l of map.roadLinks){if(l.from.roadId!==id&&l.to.roadId!==id)continue;const a=l.from.roadId===id?l.from:l.to,b=l.from.roadId===id?l.to:l.from,q=roads.get(b.roadId);if(!q||q.id===exclude||ids.has(q.id)||ramp(q)&&!q.highwayTransition)continue;
  const p=roadPoints(r),v=roadPoints(q),t=sampleAt(p,a.end==='start'?0:polylineLength(p)).tangent,u=sampleAt(v,b.end==='start'?0:polylineLength(v)).tangent;
  if(t.x*u.x+t.z*u.z<.94||a.end===b.end||r.roadNameId&&q.roadNameId&&r.roadNameId!==q.roadNameId)continue;
  ids.add(q.id);queue.push(q.id);
 }}return ids;
}
export function analyze(map:any,seeds:any[],details=false){const local=context(map,seeds),pv=pavement(local),roads=new Map<string,any>(map.roads.map((r:any)=>[r.id,r])),network=buildCityRoadNetwork(local),rows:any[]=[];
 for(const r of seeds){const p=roadPoints(r),length=polylineLength(p),profile=rampProfile(r),interfaces:any[]=[];
  for(const end of ['start','end']){const host=hostFor(map,r,end,network),peers=family(local,host,r.id),samples:any[]=[];let lastTouch=0,maxDY=0,unsupported=0;const hostRoad=host?roads.get(host.roadId):null;
   for(let d=0;d<=Math.min(length,r.highwayTransition?length:600);d+=1){if(d>lastTouch+8)break;const station=end==='start'?d:length-d,f=sampleAt(p,station);for(const offset of [roadEdges(r).left,-r.laneWidth/2,-.835,0,.835,r.laneWidth/2,roadEdges(r).right]){const q={x:f.point.x-f.tangent.z*offset,y:f.point.y!,z:f.point.z+f.tangent.x*offset},hits=pv.hit(q),shared=hits.filter(h=>peers.has(h.road.id)),own=hits.filter(h=>h.road.id===r.id).map(h=>h.surface.heightAt(q.x,q.z)),ownY=own.sort((a,b)=>Math.abs(a-q.y)-Math.abs(b-q.y))[0]??q.y,dy=Math.max(0,...shared.map(h=>Math.abs(h.surface.heightAt(q.x,q.z)-ownY)));if(shared.length)lastTouch=d;maxDY=Math.max(maxDY,dy);if(!host?.junctionId&&Math.abs(offset)===.835&&!hits.some(h=>Math.abs(h.surface.heightAt(q.x,q.z)-q.y)<.04))unsupported++;if(details||dy>.04)samples.push({d,station,offset,dy,point:q,peers:shared.map(h=>({roadId:h.road.id,y:h.surface.heightAt(q.x,q.z)}))});}}
   const ep=end==='start'?p[0]!:p.at(-1)!,hp=hostRoad?roadPoints(hostRoad):[],q=host?(host.end==='start'?hp[0]:hp.at(-1)):null,t=sampleAt(p,end==='start'?0:length).tangent,u=hostRoad?sampleAt(hp,host.end==='start'?0:polylineLength(hp)).tangent:null,conflicts=samples.filter(s=>s.dy>.04);
   const sign=host?.end===end?-1:1;
   interfaces.push({end,host,peers:[...peers],sharedLength:lastTouch,maxSharedDeltaY:maxDY,conflictRange:conflicts.length?[Math.min(...conflicts.map(s=>s.d)),Math.max(...conflicts.map(s=>s.d))]:null,unsupportedWheelSamples:unsupported,xzGap:host?.junctionId?0:q?Math.hypot(ep.x-q.x,ep.z-q.z):null,deltaY:host?.junctionId?0:q?ep.y!-q.y!:null,tangentDegrees:host?.junctionId?0:u?Math.acos(Math.max(-1,Math.min(1,sign*(t.x*u.x+t.z*u.z))))*180/Math.PI:null,topology:!!host&&network.routing!.connections.some(c=>end==='start'?c.toRoadId===r.id&&c.fromRoadId===host.roadId:c.fromRoadId===r.id&&c.toRoadId===host.roadId),samples});
  }
  rows.push({id:r.id,cluster:clusterName(r),length,transition:r.highwayTransition??null,interfaces,profile:{maxGrade:profile.maxGrade,gradeBreaks:profile.breaks.filter(b=>b.gradeBreak>=.04),minRadius:profile.minRadius,shortSegments:profile.shortSegments},severity:interfaces.some(i=>i.maxSharedDeltaY>=.5||i.xzGap===null||i.xzGap>.2||!i.topology)?'P0':interfaces.some(i=>i.maxSharedDeltaY>.04||i.unsupportedWheelSamples>0||i.tangentDegrees>15)||profile.breaks.some(b=>b.gradeBreak>=.04)||profile.maxGrade>.1201||profile.minRadius!==null&&profile.minRadius<35?'P1':'PASS'});
 }return {rows,local,pv};
}
export function crossingPairs(map:any,seeds:any[]){const pv=pavement(context(map,seeds)),ids=new Set(seeds.map(r=>r.id)),pairs=new Map<string,any>();for(const a of pv.segments)if(ids.has(a.road.id))for(const j of pv.index.query(a.box)){const b=pv.segments[Number(j)]!;if(a.road.id===b.road.id||ids.has(b.road.id)&&a.road.id>b.road.id)continue;const poly=clipPavementFootprints(a.polygon,b.polygon);if(poly.length<3)continue;const area=Math.abs(poly.reduce((v,p,i)=>{const q=poly[(i+1)%poly.length]!;return v+p.x*q.z-q.x*p.z;},0))/2;if(area<.01)continue;const key=[a.road.id,b.road.id].sort().join('|'),sgn=a.road.id<b.road.id?1:-1,dy=poly.map(p=>sgn*(a.surface.heightAt(p.x,p.z)-b.surface.heightAt(p.x,p.z))),lo=Math.min(...dy),hi=Math.max(...dy),row=pairs.get(key)??{key,lo:Infinity,hi:-Infinity,stationMin:a.start,stationMax:a.start+a.length,area:0};row.lo=Math.min(row.lo,lo);row.hi=Math.max(row.hi,hi);row.stationMin=Math.min(row.stationMin,a.start);row.stationMax=Math.max(row.stationMax,a.start+a.length);row.area+=area;pairs.set(key,row);}return [...pairs.values()];}
