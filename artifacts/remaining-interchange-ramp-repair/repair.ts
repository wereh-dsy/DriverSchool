import fs from 'node:fs';
import assert from 'node:assert/strict';
import {dir,read,write,hash,ramp,central,context,analyze,crossingPairs,pavement,roadPoints,roadEdges,sampleAt,polylineLength,project,rampProfile,len} from './common';
import {stations} from '../../src/editor/MapAnalysis';
import {fitLocalProfile} from '../system-central-ramp-repair/local-profile';
const inventory=read(dir+'interchange-inventory.json'),baseline=read(dir+'baseline-map.json'),map=read(dir+'candidate-map.json'),arg=process.argv.indexOf('--cluster'),clusters=process.argv.includes('--library')?[]:arg<0?inventory.clusters:inventory.clusters.filter((c:any)=>c.id===process.argv[arg+1]);
const plans:any[]=fs.existsSync(dir+'repair-plans.json')?read(dir+'repair-plans.json'):[],deferred:any[]=fs.existsSync(dir+'deferred.json')?read(dir+'deferred.json'):[];
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*t*(10+t*(-15+6*t));};
export function fitRoad(original:any,row:any,clusterBefore:any,clusterMap:any,shift:number){const road=structuredClone(original),base=roadPoints(original),baseS=stations(base),total=baseS.at(-1)!;
 if(shift===0&&road.pavementSurface!=='ribbon'&&!row.profile.gradeBreaks.length&&row.profile.maxGrade<=.1201&&row.profile.minRadius>=35){road.pavementSurface='ribbon';const check=analyze({...clusterMap,roads:clusterMap.roads.map((r:any)=>r.id===road.id?road:r)},[road]).rows[0];if(check.severity==='PASS')return {road,plan:{roadId:road.id,windows:[],shift:0,supportRepresentationOnly:true,maxYChange:0,before:row.profile}};}
 if(shift){const ends=row.interfaces.filter((i:any)=>i.maxSharedDeltaY>.04),balanced=/^(access-|v91-)/.test(road.id)&&ends.length===2;road.centerline=base.map((p,i)=>{const s=baseS[i]!,f=sampleAt(base,s),amount=balanced?shift*Math.sin(2*Math.PI*s/total)*Math.sin(Math.PI*s/total)**2/(3*Math.sqrt(3)/8):ends.reduce((sum:number,e:any)=>{const d=e.end==='start'?s:total-s,span=Math.min(total*.8,240),sign=balanced&&e.end==='end'?-1:1;return sum+sign*shift*smooth(d/(span*.25))*(1-smooth((d-span*.4)/(span*.6)));},0);return {...p,x:p.x-f.tangent.z*amount,z:p.z+f.tangent.x*amount};});}
 const p=roadPoints(road),ss=stations(p),length=ss.at(-1)!,testMap={...clusterMap,roads:clusterMap.roads.map((r:any)=>r.id===road.id?road:r)},iface=analyze(testMap,[road],true).rows[0].interfaces,pv=pavement(context(testMap,[road])),windows:[number,number][]=row.profile.gradeBreaks.map((b:any)=>[Math.max(0,b.station-26),Math.min(length,b.station+26)]);
 const pro=rampProfile(road);for(const s of pro.segments)if(Math.abs(s.grade)>.12)windows.push([Math.max(0,s.station-30),Math.min(length,s.station+s.length+30)]);
 for(const e of iface)if(e.maxSharedDeltaY>.035){const span=Math.min(length*.7,Math.max(e.sharedLength+75,100));windows.push(e.end==='start'?[0,span]:[length-span,length]);}
 if(!windows.length){
  const sharp=pro.breaks.filter((b:any)=>b.radius!==null&&b.radius<35),radius=shift===0?12:Math.abs(shift)+12;
  road.centerline=p.map((q,i)=>{const s=ss[i]!,weight=Math.max(0,...sharp.map((b:any)=>1-smooth(Math.abs(s-b.station)/24)))*smooth(s/25)*smooth((length-s)/25);if(!weight)return {...q};let x=0,z=0,n=0;for(let d=-radius;d<=radius;d+=2){const v=sampleAt(p,Math.max(0,Math.min(length,s+d))).point,w=1-Math.abs(d)/(radius+2);x+=v.x*w;z+=v.z*w;n+=w;}return {...q,x:q.x+(x/n-q.x)*weight,z:q.z+(z/n-q.z)*weight};});
  road.centerline[0]={...p[0]};road.centerline[road.centerline.length-1]={...p.at(-1)};road.pavementSurface='ribbon';
  return {road,plan:{roadId:road.id,windows:sharp.map((b:any)=>[Math.max(0,b.station-24),Math.min(length,b.station+24)]),shift:0,planarFairingRadius:radius,sharpStations:sharp.map((b:any)=>({station:b.station,radius:b.radius})),maxYChange:0,before:row.profile}};
 }
 windows.sort((a,b)=>a[0]-b[0]);const merged:[number,number][]=[];for(const w of windows){const last=merged.at(-1);if(last&&w[0]<=last[1]+6)last[1]=Math.max(last[1],w[1]);else merged.push([...w]);}
 const positions=[...ss];for(const [a,b]of merged){for(let s=a;s<b;s+=2)if(!positions.some(t=>Math.abs(t-s)<.06))positions.push(s);for(const s of [a,b])if(!positions.some(t=>Math.abs(t-s)<.06))positions.push(s);}positions.sort((a,b)=>a-b);
 const points=positions.map(s=>{const i=ss.findIndex(t=>Math.abs(t-s)<1e-8);return i<0?sampleAt(p,s).point:{...p[i]!};}),ys=points.map(q=>q.y??0),fixed=new Map<number,number>(),lower=ys.map(()=>-50),upper=ys.map(()=>100),shared:any[]=[];
 for(let i=0;i<ys.length;i++)if(!merged.some(([a,b])=>positions[i]!>(a<=1e-7?0:a+3)&&positions[i]!<(b>=length-1e-7?length:b-3)))fixed.set(i,ys[i]!);fixed.set(0,ys[0]!);fixed.set(ys.length-1,ys.at(-1)!);
 for(const e of iface){if(e.maxSharedDeltaY<=.035||e.host?.junctionId)continue;const peers=new Set(e.peers),hostRoads=clusterMap.roads.filter((r:any)=>peers.has(r.id));const sharedLength=e.sharedLength+2;
  shared.push({end:e.end,length:sharedLength,peers:e.peers});
  for(let i=1;i<ys.length-1;i++){const d=e.end==='start'?positions[i]!:length-positions[i]!;if(d>sharedLength)continue;const frame=sampleAt(p,positions[i]!),hits=pv.hit(points[i]).filter(h=>peers.has(h.road.id));let target:number;
   if(hits.length)target=hits.map(h=>h.surface.heightAt(points[i]!.x,points[i]!.z)).sort((a,b)=>Math.abs(a-ys[i]!)-Math.abs(b-ys[i]!))[0]!;
   else target=hostRoads.map((r:any)=>project(roadPoints(r),points[i]!)).sort((a:any,b:any)=>a.distance-b.distance)[0]?.point.y??ys[i]!;
   if(fixed.has(i)){if(Math.abs(fixed.get(i)!-target)>.04)throw new Error('Shared layer anchor conflicts with local-window boundary at '+positions[i]);}
   else {lower[i]=Math.max(lower[i]!,target-.012);upper[i]=Math.min(upper[i]!,target+.012);}
  }
 }
 const oldPairs=crossingPairs(clusterBefore,[original]),oldByPair=new Map<string,any>(oldPairs.map((q:any)=>[q.key,q])),constraints:any[]=[];
 for(let i=1;i<ys.length-1;i++)if(!fixed.has(i))for(const offset of [roadEdges(road).left,0,roadEdges(road).right]){const f=sampleAt(p,positions[i]!),q={x:f.point.x-f.tangent.z*offset,z:f.point.z+f.tangent.x*offset};for(const h of pv.hit(q)){if(h.road.id===road.id)continue;const pair=oldByPair.get([road.id,h.road.id].sort().join('|'));if(!pair)continue;const lo=road.id<h.road.id?pair.lo:-pair.hi,hi=road.id<h.road.id?pair.hi:-pair.lo,gap=lo>0?lo:hi<0?-hi:0;if(gap<5.5)continue;const required=Math.min(6.15,gap),y=h.surface.heightAt(q.x,q.z);if(lo>0)lower[i]=Math.max(lower[i]!,y+required);else upper[i]=Math.min(upper[i]!,y-required);constraints.push({station:positions[i],other:h.road.id,originalGap:gap,required});}}
 const lo=lower.map((y,i)=>fixed.get(i)??y),hi=upper.map((y,i)=>fixed.get(i)??y);for(let i=1;i<ys.length;i++){const d=.12*(positions[i]!-positions[i-1]!);lo[i]=Math.max(lo[i]!,lo[i-1]!-d);hi[i]=Math.min(hi[i]!,hi[i-1]!+d);}for(let i=ys.length-2;i>=0;i--){const d=.12*(positions[i+1]!-positions[i]!);lo[i]=Math.max(lo[i]!,lo[i+1]!-d);hi[i]=Math.min(hi[i]!,hi[i+1]!+d);}
 const impossible=positions.flatMap((s,i)=>lo[i]!>hi[i]!+.001?[{station:s,lower:lo[i],upper:hi[i]}]:[]);if(impossible.length){write('infeasible-'+road.id.replace(/[^\w-]/g,'_')+'-'+shift+'.json',{roadId:road.id,shift,length,shared,windows:merged,positions:positions.map((station,i)=>({station,original:ys[i],fixed:fixed.get(i),lower:lower[i],upper:upper[i],feasibleLower:lo[i],feasibleUpper:hi[i]})),crossings:constraints,impossible});throw new Error('12% grade and shared/crossing constraints infeasible: '+JSON.stringify(impossible.slice(0,3)));}
 let fit=fitLocalProfile(positions,ys,fixed,32,{lower,upper},.12);road.centerline=points.map((q,i)=>({...q,y:fit[i]}));road.curve='polyline';road.elevationMode='custom';road.pavementSurface='ribbon';
 // A varying host profile projected to curved wheel/edge traces can differ
 // from the centerline projection. Balance the actual triangle residuals.
 for(let iteration=0;iteration<4;iteration++){
  const trial={...clusterMap,roads:clusterMap.roads.map((r:any)=>r.id===road.id?road:r)},measure=analyze(trial,[road],true).rows[0],surface=pavement(context(trial,[road]));if(measure.interfaces.every((i:any)=>i.maxSharedDeltaY<=.039))break;
  const corrections=new Map<number,number[]>();
  for(const e of measure.interfaces)for(const s of e.samples){if(!s.peers.length)continue;let idx=0;for(let j=1;j<positions.length;j++)if(Math.abs(positions[j]!-s.station)<Math.abs(positions[idx]!-s.station))idx=j;if(!fixed.has(idx)||idx===0||idx===positions.length-1||!shared.some(q=>q.end===e.end&&(e.end==='start'?positions[idx]!:length-positions[idx]!)<=q.length))continue;
   const own=surface.hit(s.point).filter(h=>h.road.id===road.id).map(h=>h.surface.heightAt(s.point.x,s.point.z)).sort((a,b)=>Math.abs(a-s.point.y)-Math.abs(b-s.point.y))[0];if(own===undefined)continue;const values=corrections.get(idx)??[];values.push(...s.peers.map((q:any)=>q.y-own));corrections.set(idx,values);
  }
  if(!corrections.size)break;for(const [i,errors]of corrections)fixed.set(i,fixed.get(i)!+(Math.min(...errors)+Math.max(...errors))/2);
  fit=fitLocalProfile(positions,ys,fixed,32,{lower,upper},.12);road.centerline=points.map((q,i)=>({...q,y:fit[i]}));
 }
 return {road,plan:{roadId:road.id,windows:merged,shift,shared,crossingConstraints:constraints,maxYChange:Math.max(...fit.map((y,i)=>Math.abs(y-ys[i]!))),maxXZShift:Math.abs(shift),before:row.profile}};
}
for(const c of clusters){const rs=map.roads.filter((r:any)=>c.ramps.some((q:any)=>q.id===r.id)),clusterBefore=structuredClone(map),before=analyze(map,rs).rows,clusterPlans:any[]=[],attempts:any[]=[];
 for(const row of before.filter((r:any)=>r.severity!=='PASS')){const source=clusterBefore.roads.find((r:any)=>r.id===row.id),index=map.roads.findIndex((r:any)=>r.id===row.id);let accepted=false;
  for(const shift of (/^(access-|v91-)/.test(row.id)?[0,3,-3,4,-4,5,-5,6,-6,8,-8,12,-12]:[0,6,-6,12,-12])){try{const {road,plan}=fitRoad(source,row,clusterBefore,map,shift);map.roads[index]=road;const after=analyze(map,[road]).rows[0],oldPairs=crossingPairs(clusterBefore,[source]),newPairs=crossingPairs(map,[road]),clearanceProblems=newPairs.filter((n:any)=>{const old=oldPairs.find((o:any)=>o.key===n.key),gap=(p:any)=>p.lo<=0&&p.hi>=0?0:Math.min(Math.abs(p.lo),Math.abs(p.hi));return old?gap(old)>=5.5&&gap(n)<Math.min(gap(old),6.15)-.04:gap(n)<2.5&&Math.max(Math.abs(n.lo),Math.abs(n.hi))>.04;});
    const failures=[...after.interfaces.filter((i:any)=>i.maxSharedDeltaY>.04||i.unsupportedWheelSamples>0||!i.topology||(i.xzGap??999)>.2).map((i:any)=>({end:i.end,dy:i.maxSharedDeltaY,unsupported:i.unsupportedWheelSamples,topology:i.topology})),...(after.profile.maxGrade>.1201||after.profile.gradeBreaks.length?[{grade:after.profile.maxGrade,breaks:after.profile.gradeBreaks.length}]:[]),...(after.profile.minRadius!==null&&after.profile.minRadius<(plan.planarFairingRadius?35:Math.min(35,row.profile.minRadius)-.1)?[{radius:after.profile.minRadius,reason:'Local planar curvature candidate still below the conservative 35m review reference'}]:[]),...clearanceProblems.map((p:any)=>({crossing:p.key,lo:p.lo,hi:p.hi}))];
    attempts.push({roadId:row.id,shift,plan,after:{...after,interfaces:after.interfaces.map(({samples,...i}:any)=>i)},failures});
    if(failures.length)throw new Error(JSON.stringify(failures));
    clusterPlans.push({...plan,after:after.profile});accepted=true;break;
   }catch(e:any){map.roads[index]=structuredClone(source);attempts.push({roadId:row.id,shift,error:e.message});}
  }
  if(!accepted){deferred.push({cluster:c.id,roadId:row.id,severity:row.severity,stations:row.interfaces.filter((i:any)=>i.maxSharedDeltaY>.04).map((i:any)=>({end:i.end,range:i.conflictRange,maxDeltaY:i.maxSharedDeltaY,sharedLength:i.sharedLength})),gradeBreakStations:row.profile.gradeBreaks.map((b:any)=>b.station),sharpStations:rampProfile(source).breaks.filter((b:any)=>b.radius!==null&&b.radius<35).map((b:any)=>({station:b.station,radius:b.radius})),minRadius:row.profile.minRadius,attempts:attempts.filter(a=>a.roadId===row.id),reason:row.profile.minRadius<35&&!row.profile.gradeBreaks.length&&row.interfaces.every((i:any)=>i.maxSharedDeltaY<=.04)?'Existing compact loop: local 12/18/24m planar fairing windows were checked against frozen adjacent ramps and clearance; candidates still violate curvature/shared-layer constraints. Enlarging the complete loop needs a wider structural redesign. No failing candidate has been published.':'Local Y and ±6/±12m throat XZ candidates did not satisfy shared-layer, ≤12% grade and frozen crossing clearance constraints simultaneously. See exact failing stations and constraints.'});}
 }
 const final=analyze(map,map.roads.filter((r:any)=>rs.some((q:any)=>q.id===r.id))).rows;
 assert.equal(hash(map.roads.filter(central)),hash(baseline.roads.filter(central)));
 write('clusters/'+c.file+'-repair.json',{cluster:c.id,plans:clusterPlans,attempts,after:final});
 for(const p of clusterPlans){const j=plans.findIndex(q=>q.roadId===p.roadId);if(j<0)plans.push(p);else plans[j]=p;}
 write('candidate-map.json',map);write('repair-plans.json',plans);write('deferred.json',deferred);
 console.log(JSON.stringify({cluster:c.id,modified:clusterPlans.map(p=>p.roadId),remaining:final.filter((r:any)=>r.severity!=='PASS').map((r:any)=>({id:r.id,severity:r.severity,dy:r.interfaces.map((i:any)=>i.maxSharedDeltaY),breaks:r.profile.gradeBreaks.length,radius:r.profile.minRadius}))}));
}
