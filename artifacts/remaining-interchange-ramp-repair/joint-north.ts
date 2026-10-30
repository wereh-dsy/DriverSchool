import {dir,read,write,hash,analyze,context,pavement,roadPoints,sampleAt,polylineLength,project,rampProfile,crossingPairs,central} from './common';
import {fitRoad} from './repair';
import {fitLocalProfile} from '../system-central-ramp-repair/local-profile';
import {stations} from '../../src/editor/MapAnalysis';
const map=read(dir+'candidate-map.json'),frozen=structuredClone(map),starId='system-north:E-to-S-star',rampId='access-ns-north-sb-off',star=map.roads.find((r:any)=>r.id===starId),ramp=map.roads.find((r:any)=>r.id===rampId),path=roadPoints(star),ss=stations(path),rp=roadPoints(ramp),affected:number[]=[];
for(let d=0;d<=90;d+=2){const p=sampleAt(rp,d).point,hit=project(path,p);if(hit.distance<18)affected.push(hit.along);}
if(!affected.length)throw new Error('No constrained crossing found');
const min=Math.min(...affected),max=Math.max(...affected),attempts:any[]=[];let accepted=false;
for(const span of [50,80,120]){const a=Math.max(70,min-span),b=Math.min(ss.at(-1)!-80,max+span),positions=[...ss];for(let s=a;s<b;s+=2)if(!positions.some(t=>Math.abs(t-s)<.06))positions.push(s);positions.sort((a,b)=>a-b);const points=positions.map(s=>{const i=ss.findIndex(q=>Math.abs(q-s)<1e-8);return i<0?sampleAt(path,s).point:{...path[i]!};}),ys=points.map(p=>p.y!),fixed=new Map<number,number>(),lower=ys.map(()=>-50),upper=ys.map(()=>100);
 for(let i=0;i<positions.length;i++){if(positions[i]!<a+3||positions[i]!>b-3)fixed.set(i,ys[i]!);if(positions[i]!>=min-10&&positions[i]!<=max+10)lower[i]=6.25;}
 try{const fit=fitLocalProfile(positions,ys,fixed,32,{lower,upper},.12),newStar={...structuredClone(star),centerline:points.map((p,i)=>({...p,y:fit[i]})),pavementSurface:'ribbon'},trial={...map,roads:map.roads.map((r:any)=>r.id===starId?newStar:r)},profile=rampProfile(newStar);
  if(profile.maxGrade>.1201||profile.breaks.some(b=>b.gradeBreak>=.04))throw new Error('Star candidate introduces grade break or excessive grade');
  const row=analyze(trial,[ramp]).rows[0];
  for(const shift of [0,3,-3,4,-4,5,-5,6,-6]){try{const {road,plan}=fitRoad(ramp,row,frozen,trial,shift),joint={...trial,roads:trial.roads.map((r:any)=>r.id===rampId?road:r)},checks=analyze(joint,[newStar,road]).rows,oldPairs=crossingPairs(frozen,[star,ramp]),newPairs=crossingPairs(joint,[newStar,road]),gap=(p:any)=>p.lo<=0&&p.hi>=0?0:Math.min(Math.abs(p.lo),Math.abs(p.hi)),clearance=newPairs.filter((p:any)=>{const old=oldPairs.find((q:any)=>q.key===p.key);return old&&gap(old)>=5.5&&gap(p)<Math.min(6.15,gap(old))-.04||!old&&gap(p)<2.5&&Math.max(Math.abs(p.lo),Math.abs(p.hi))>.04;});
    if(checks.some((r:any)=>r.severity!=='PASS')||clearance.length)throw new Error(JSON.stringify({geometry:checks.map((r:any)=>({id:r.id,severity:r.severity,dy:r.interfaces.map((i:any)=>i.maxSharedDeltaY)})),clearance}));
    if(hash(joint.roads.filter(central))!==hash(frozen.roads.filter(central)))throw new Error('Central scope guard');
    map.roads=joint.roads;const plans=read(dir+'repair-plans.json');for(const p of [{roadId:starId,windows:[[a,b]],jointCrossingWindow:[min,max],maxYChange:Math.max(...fit.map((y,i)=>Math.abs(y-ys[i]!))),after:profile},plan]){const i=plans.findIndex((q:any)=>q.roadId===p.roadId);if(i<0)plans.push(p);else plans[i]=p;}
    write('repair-plans.json',plans);write('candidate-map.json',map);attempts.push({span,shift,accepted:true,window:[a,b],crossingWindow:[min,max],starMaximumYChange:Math.max(...fit.map((y,i)=>Math.abs(y-ys[i]!)))});accepted=true;break;
   }catch(e:any){attempts.push({span,shift,error:e.message});}}
 }catch(e:any){attempts.push({span,error:e.message});}
 if(accepted)break;
}
write('joint-north-attempts.json',{accepted,starId,rampId,crossingWindow:[min,max],attempts});console.log(JSON.stringify({accepted,crossingWindow:[min,max],attempts}));
