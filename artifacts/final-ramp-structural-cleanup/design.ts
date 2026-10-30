import {dir,read,write,hash,analyze,context,pavement,family,hostFor,crossingPairs,roadPoints,roadEdges,sampleAt,polylineLength,project,ramp,rampProfile} from './common';
import {fitLocalProfile} from '../system-central-ramp-repair/local-profile';
import {stations} from '../../src/editor/MapAnalysis';
const base=read(dir+'baseline-map.json'),map=structuredClone(base),targets=read(dir+'targets.json'),plans:any[]=[];
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*t*(10+t*(-15+6*t));};
const road=(id:string)=>map.roads.find((r:any)=>r.id===id);
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
function fitProfile(r:any){const points=roadPoints(r),ss=stations(points),length=ss.at(-1)!,row=analyze(map,[r],true).rows[0],pv=pavement(context(map,[r])),fixed=new Map<number,number>([[0,points[0]!.y!],[points.length-1,points.at(-1)!.y!]]),lower=points.map(()=>-50),upper=points.map(()=>100),start=row.interfaces[0].sharedLength+4,end=length-row.interfaces[1].sharedLength-4;
 const ys=points.map((p,i)=>points[0]!.y!+(points.at(-1)!.y!-points[0]!.y!)*smooth((ss[i]!-start)/(end-start)));
 for(const iface of row.interfaces){const peers=new Set(iface.peers);for(let i=1;i<points.length-1;i++){const d=iface.end==='start'?ss[i]!:length-ss[i]!;if(d>iface.sharedLength+3)continue;const f=sampleAt(points,ss[i]!),hits=pv.hit(points[i]).filter(h=>peers.has(h.road.id));const target=hits.length?hits.map(h=>h.surface.heightAt(points[i]!.x,points[i]!.z)).sort((a,b)=>Math.abs(a-ys[i]!)-Math.abs(b-ys[i]!))[0]!:iface.peers.map((id:string)=>project(roadPoints(road(id)),points[i]!)).sort((a:any,b:any)=>a.distance-b.distance)[0]?.point.y;if(target!==undefined){lower[i]=target-.005;upper[i]=target+.005;ys[i]=target;}}}
 const fit=fitLocalProfile(ss,ys,fixed,24,{lower,upper},.12);r.centerline=points.map((p,i)=>({...p,y:fit[i]}));r.elevationMode='custom';r.curve='polyline';
 return {independentLength:length-row.interfaces[0].sharedLength-row.interfaces[1].sharedLength,sharedLengths:row.interfaces.map((i:any)=>i.sharedLength),profileTransition:[start,end]};
}
function circle(id:string,R:number,kind:number){const r=road(id),old=structuredClone(r);let a:any,b:any,cx:number,cz:number,theta:number;
 if(kind===0){ // ring northbound direction (-Z) -> westbound mainline
  b=relocate(id,'end','x',old.centerline[0].x+R);cx=b.x;cz=b.z-R;a=relocate(id,'start','z',cz);theta=Math.PI;
 }else if(kind===1){ // westbound mainline -> ring southbound (+Z)
  a=relocate(id,'start','x',old.centerline.at(-1).x-R);cx=a.x;cz=a.z-R;b=relocate(id,'end','z',cz);theta=Math.PI/2;
 }else if(kind===2){ // ring southbound (+Z) -> eastbound mainline
  b=relocate(id,'end','x',old.centerline[0].x-R);cx=b.x;cz=b.z+R;a=relocate(id,'start','z',cz);theta=0;
 }else { // eastbound mainline -> ring northbound (-Z)
  a=relocate(id,'start','x',old.centerline.at(-1).x+R);cx=a.x;cz=a.z+R;b=relocate(id,'end','z',cz);theta=-Math.PI/2;
 }
 const n=Math.ceil(R*Math.PI*1.5/1.5);r.centerline=Array.from({length:n+1},(_,i)=>{const angle=theta+Math.PI*1.5*i/n;return{x:cx+R*Math.cos(angle),y:a.y+(b.y-a.y)*smooth(i/n),z:cz+R*Math.sin(angle)};});r.centerline[0]=a;r.centerline[n]=b;
 // The new circular footprint is checked against actual ribbon triangles below.
 r.pavementSurface='ribbon';const profile=fitProfile(r);plans.push({roadId:id,kind:'expanded-loop',radius:R,center:{x:cx,z:cz},beforeRadius:rampProfile(old).minRadius,...profile});
}
const radii=process.argv.includes('--radii')?JSON.parse(process.argv[process.argv.indexOf('--radii')+1]):[45,45,45,45,45,45];
circle('system-west:S-to-W-loop',radii[0],0);circle('system-west:E-to-S-loop',radii[1],1);circle('system-west:N-to-E-loop',radii[2],2);circle('system-west:W-to-N-loop',radii[3],3);
circle('system-south:E-to-S-loop',radii[4],1);circle('system-south:W-to-N-loop',radii[5],3);
map.version=492;
write('candidate-map.json',map);write('repair-plans.json',plans);write('structural-layout.json',{baselineVersion:491,candidateVersion:492,plans});
const seeds=map.roads.filter((r:any)=>targets.includes(r.id)&&r.id.includes('loop')),rows=analyze(map,seeds).rows;
for(const row of rows){const pairs=crossingPairs(map,[road(row.id)]),oldPairs=crossingPairs(base,[base.roads.find((r:any)=>r.id===row.id)]),gap=(p:any)=>p.lo<=0&&p.hi>=0?0:Math.min(Math.abs(p.lo),Math.abs(p.hi));console.log(JSON.stringify({id:row.id,severity:row.severity,radius:row.profile.minRadius,grade:row.profile.maxGrade,breaks:row.profile.gradeBreaks.length,interfaces:row.interfaces.map(({samples,...i}:any)=>i),crossings:pairs.filter((p:any)=>{const old=oldPairs.find((q:any)=>q.key===p.key);return gap(p)<5.5&&(old?gap(old)>=5.5||Math.max(Math.abs(p.lo),Math.abs(p.hi))>Math.max(Math.abs(old.lo),Math.abs(old.hi))+.2:Math.max(Math.abs(p.lo),Math.abs(p.hi))>.04);})}));}
