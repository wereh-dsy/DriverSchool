import {dir,read,write,analyze,crossingPairs,family,roadPoints,sampleAt,polylineLength,rampProfile} from './common';
import {moveJoint} from './joints';
import {fitProfile} from './profile';
import {stations} from '../../src/editor/MapAnalysis';
const map=read(dir+'candidate-map.json'),base=read(dir+'baseline-map.json'),plans=read(dir+'repair-plans.json'),id='system-south:W-to-N-loop',r=map.roads.find((r:any)=>r.id===id),R=36;
const a=moveJoint(map,base,plans,id,'start','x',8.125+R),cz=a.z+R,b=moveJoint(map,base,plans,id,'end','z',cz);
const originalFamily=base.roads.filter((q:any)=>q.id.startsWith('ns-nb')||q.id==='ns-tunnel:northbound');const baselineHeight=(z:number)=>{for(const q of originalFamily){const ps=roadPoints(q);for(let i=1;i<ps.length;i++){const a=ps[i-1],b=ps[i];if((z-a.z)*(z-b.z)<=1e-8&&Math.abs(b.z-a.z)>1e-8)return a.y!+(b.y!-a.y!)*(z-a.z)/(b.z-a.z);}}throw Error('Missing baseline northbound height '+z);};
const host=map.roadLinks.find((l:any)=>l.from.roadId===id&&l.from.end==='end').to,ids=family(map,host,id),smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*t*(10+t*(-15+6*t));},changes:any[]=[];
// A local constant-height receiving platform removes cross-slope disagreement
// between the curved ramp ribbon and the sloping northbound carriageway.
for(const q of map.roads.filter((q:any)=>ids.has(q.id)&&roadPoints(q).some(p=>p.z>2130&&p.z<2290))){const p=roadPoints(q),ss=stations(p),L=ss.at(-1)!,positions=[...ss];for(let s=0;s<L;s+=1.5){const pt=sampleAt(p,s).point;if(pt.z>2130&&pt.z<2290&&!positions.some(t=>Math.abs(t-s)<.1))positions.push(s);}positions.sort((a,b)=>a-b);
 q.centerline=positions.map(s=>{const i=ss.findIndex(t=>Math.abs(t-s)<1e-8),pt=i<0?sampleAt(p,s).point:structuredClone(p[i]),w=smooth((pt.z-2130)/20)*(1-smooth((pt.z-2195)/60));const oldY=baselineHeight(pt.z);return {...pt,y:oldY+(-7.25-oldY)*w};});
 const profile=rampProfile(q);changes.push({roadId:q.id,stationWindow:[2130,2290],axis:'z',platformY:-7.25,maxYChange:Math.max(...q.centerline.map((pt:any)=>Math.abs(pt.y-sampleAt(p,Math.max(0,Math.min(L,positions[q.centerline.indexOf(pt)]))).point.y!))),maxGrade:profile.maxGrade,maxGradeBreak:profile.maxGradeBreak});
}
const receiving=map.roads.find((q:any)=>q.id===host.roadId).centerline[0];
const n=114;r.centerline=Array.from({length:n+1},(_,i)=>{const angle=-Math.PI/2+Math.PI*1.5*i/n;return{x:a.x+R*Math.cos(angle),y:a.y+(receiving.y-a.y)*smooth(i/n),z:cz+R*Math.sin(angle)};});r.centerline[0]=a;r.centerline[n]=structuredClone(receiving);fitProfile(map,r);
plans.push({roadId:id,kind:'local-receiving-platform',platformChanges:changes,previousParallelAlignmentRejected:'Crossed unchanged adjacent S-to-E right-turn pavement; not retained',mainlineXZUnchanged:true});
const row=analyze(map,[r]).rows[0],pairs=crossingPairs(map,[r]);write('candidate-map.json',map);write('repair-plans.json',plans);write('south-platform.json',{row,pairs,changes});
console.log(JSON.stringify({id,status:row.severity,radius:row.profile.minRadius,grade:row.profile.maxGrade,breaks:row.profile.gradeBreaks.length,shared:row.interfaces.map((i:any)=>({end:i.end,length:i.sharedLength,dy:i.maxSharedDeltaY})),changes,pairs:pairs.filter((p:any)=>!row.interfaces.some((i:any)=>i.peers.some((id:string)=>p.key.includes(id))))}));
