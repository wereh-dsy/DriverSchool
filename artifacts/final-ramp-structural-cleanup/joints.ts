import {ramp,roadPoints,polylineLength} from './common';
import {stations} from '../../src/editor/MapAnalysis';
export function moveJoint(map:any,base:any,plans:any[],id:string,end:string,axis:'x'|'z',value:number){const road=(id:string)=>map.roads.find((r:any)=>r.id===id);
function endpointCluster(id:string,end:string){const queue=[{roadId:id,end}],seen=new Set<string>();for(let i=0;i<queue.length;i++){const a=queue[i]!,key=a.roadId+':'+a.end;if(seen.has(key))continue;seen.add(key);for(const l of map.roadLinks)for(const [x,y]of [[l.from,l.to],[l.to,l.from]])if(x.roadId===a.roadId&&x.end===a.end&&!seen.has(y.roadId+':'+y.end))queue.push(y);}return queue.filter((e,i,a)=>a.findIndex(q=>q.roadId===e.roadId&&q.end===e.end)===i);}
function relocate(id:string,end:string,axis:'x'|'z',value:number){const endpoints=endpointCluster(id,end),mains=endpoints.filter(e=>!ramp(road(e.roadId))),before=mains.find(e=>e.end==='end'),after=mains.find(e=>e.end==='start');if(!before||!after||mains.length!==2)throw Error('Expected an ordinary two-piece mainline joint: '+id+':'+end);
 const a=road(before.roadId),b=road(after.roadId),combined=[...roadPoints(a),...roadPoints(b).slice(1)],ss=stations(combined);let cut=-1,p:any;
 for(let i=1;i<combined.length;i++){const u=combined[i-1]!,v=combined[i]!,den=v[axis]-u[axis];if(Math.abs(den)>1e-8&&(value-u[axis])*(value-v[axis])<=1e-8){const t=(value-u[axis])/den;cut=ss[i-1]!+(ss[i]!-ss[i-1]!)*t;p={x:u.x+(v.x-u.x)*t,y:(u.y??0)+((v.y??0)-(u.y??0))*t,z:u.z+(v.z-u.z)*t};break;}}
 if(!p||cut<1||cut>ss.at(-1)!-1)throw Error('Moved attachment leaves adjacent combined mainline: '+JSON.stringify({id,end,axis,value,cut,length:ss.at(-1),a:a.id,b:b.id,first:combined[0],last:combined.at(-1)}));
 const old=structuredClone(end==='start'?road(id).centerline[0]:road(id).centerline.at(-1));
 a.centerline=[...combined.filter((_:any,i:number)=>ss[i]!<cut-1e-7),p];b.centerline=[p,...combined.filter((_:any,i:number)=>ss[i]!>cut+1e-7)];
 for(const e of endpoints.filter(e=>ramp(road(e.roadId)))){const q=road(e.roadId);q.centerline[e.end==='start'?0:q.centerline.length-1]=structuredClone(p);}
 plans.push({roadId:id,end,kind:'mainline-repartition-only',before:old,after:p,axis,value,adjacentRoadIds:[a.id,b.id],combinedMainlineTraceUnchanged:true,stationBefore:polylineLength(roadPoints(base.roads.find((r:any)=>r.id===a.id))),stationAfter:cut});return p;
}
return relocate(id,end,axis,value);}
