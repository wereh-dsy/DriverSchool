import {dir,read,write,analyze,context,pavement,roadPoints,sampleAt,polylineLength} from './common';
import {stations} from '../../src/editor/MapAnalysis';
import {fitLocalProfile} from '../system-central-ramp-repair/local-profile';
const map=read(dir+'candidate-map.json'),plans=read(dir+'repair-plans.json'),evidence:any[]=[];
for(const id of ['system-south:W-to-N-loop','regional:shangu:on:1']){const r=map.roads.find((r:any)=>r.id===id),original=structuredClone(r),p=roadPoints(r),ss=stations(p),L=ss.at(-1)!,window=id.includes('shangu')?82:46;
 const positions=[...ss];for(let s=L-window;s<L;s+=1.5)if(!positions.some(t=>Math.abs(t-s)<.1))positions.push(s);positions.sort((a,b)=>a-b);
 r.centerline=positions.map(s=>{const i=ss.findIndex(t=>Math.abs(t-s)<1e-8);return i<0?sampleAt(p,s).point:structuredClone(p[i]);});
 const start=r.centerline.map((p:any)=>p.y),fixed=new Map<number,number>();for(let i=0;i<positions.length;i++)if(positions[i]<=L-window+4||i===positions.length-1)fixed.set(i,start[i]);
 for(let iteration=0;iteration<20;iteration++){const row=analyze(map,[r],true).rows[0],surface=pavement(context(map,[r])),samples=row.interfaces[1].samples.filter((s:any)=>s.peers.length),buckets=new Map<number,number[]>(),errors:any[]=[];
  for(const s of samples){const own=surface.hit(s.point).filter(h=>h.road.id===r.id).map(h=>h.surface.heightAt(s.point.x,s.point.z)).sort((a,b)=>Math.abs(a-s.point.y)-Math.abs(b-s.point.y))[0];if(own===undefined)continue;let nearest=0;for(let i=1;i<positions.length;i++)if(Math.abs(positions[i]-s.station)<Math.abs(positions[nearest]-s.station))nearest=i;for(const peer of s.peers){const error=peer.y-own;errors.push({station:s.station,offset:s.offset,error});if(!fixed.has(nearest)){const list=buckets.get(nearest)??[];list.push(error);buckets.set(nearest,list);}}}
  evidence.push({roadId:id,iteration,maxSharedDeltaY:row.interfaces[1].maxSharedDeltaY,grade:row.profile.maxGrade,breaks:row.profile.gradeBreaks.length,worst:errors.sort((a,b)=>Math.abs(b.error)-Math.abs(a.error)).slice(0,5)});
  if(row.interfaces[1].maxSharedDeltaY<.025)break;
  const target=r.centerline.map((p:any,i:number)=>{const es=buckets.get(i);return p.y+(es?(Math.min(...es)+Math.max(...es))/2:0);});
  const lower=target.map((_:number,i:number)=>fixed.get(i)??start[i]-.12),upper=target.map((_:number,i:number)=>fixed.get(i)??start[i]+.12);
  const fitted=fitLocalProfile(positions,target,fixed,7,{lower,upper},.12);for(let i=0;i<fitted.length;i++)r.centerline[i].y=fitted[i];
 }
 const after=analyze(map,[r]).rows[0];plans.push({roadId:id,kind:'shared-triangle-height-balance',window:[L-window,L],XZUnchanged:true,maxYChange:Math.max(...r.centerline.map((p:any,i:number)=>Math.abs(p.y-start[i]))),afterSharedDeltaY:after.interfaces[1].maxSharedDeltaY});
 console.log(JSON.stringify({id,status:after.severity,dy:after.interfaces.map((i:any)=>i.maxSharedDeltaY),grade:after.profile.maxGrade,breaks:after.profile.gradeBreaks.length,evidence:evidence.filter(e=>e.roadId===id).map(({worst,...e})=>e),worst:evidence.at(-1).worst}));
}
write('shared-refinement.json',evidence);write('candidate-map.json',map);write('repair-plans.json',plans);
