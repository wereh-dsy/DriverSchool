import fs from 'node:fs';
import {dir,read,write,hash,central,analyze,context,pavement} from './common';
import {roadCarriageways} from '../../src/world/city/RoadCarriageway';
const map=read(dir+'candidate-map.json'),base=read(dir+'baseline-map.json'),inventory=read(dir+'interchange-inventory.json'),plans:any[]=[],preview=process.argv.includes('--preview'),arg=process.argv.indexOf('--cluster'),clusters=arg<0?inventory.clusters:inventory.clusters.filter((c:any)=>c.id===process.argv[arg+1]);
for(const c of clusters){const seeds=map.roads.filter((r:any)=>c.ramps.some((q:any)=>q.id===r.id)),before=analyze(map,seeds,true).rows,local=context(map,seeds),visual=roadCarriageways(local),pv=pavement(local),proofs=new Map<string,any[]>();
 for(const row of before)for(const iface of row.interfaces)for(const s of iface.samples){if(s.dy<=.04)continue;for(const h of pv.hit(s.point)){if(h.road.pavementSurface==='ribbon'||central(h.road))continue;const y=h.surface.heightAt(s.point.x,s.point.z),vy=visual.pavedHeight(h.road.id,s.point);if(vy!==undefined&&Math.abs(y-vy)<=.04)continue;const proof=proofs.get(h.road.id)??[];if(proof.length<12)proof.push({rampId:row.id,end:iface.end,station:s.station,point:s.point,physicalY:y,visualY:vy??null,physicalOutsideVisualFootprint:vy===undefined,difference:vy===undefined?null:y-vy});proofs.set(h.road.id,proof);}}
 if(!proofs.size){write('clusters/'+c.file+'-representation.json',{cluster:c.id,changed:[],proofs:[],note:'No >4cm visual/physical mismatch requiring representation changes.'});continue;}
 const trial=structuredClone(map),changes:any[]=[];
 for(const [id,proof]of proofs){const r=trial.roads.find((r:any)=>r.id===id),old=structuredClone(r);r.pavementSurface='ribbon';changes.push({roadId:id,before:old.pavementSurface??null,after:'ribbon',centerlineUnchanged:true,proof});}
 // Recheck locally fitted small-height patches against the corrected host.
 // If that patch fitted a spurious capsule plane, restore its original shape.
 let after=analyze(trial,trial.roads.filter((r:any)=>seeds.some((q:any)=>q.id===r.id))).rows;
 const restored:any[]=[];
 for(const row of after.filter((r:any)=>r.severity!=='PASS')){const original=base.roads.find((r:any)=>r.id===row.id),initial=c.ramps.find((r:any)=>r.id===row.id);if(!original||initial.severity==='P0'||initial.profile.gradeBreaks.length||initial.profile.maxGrade>.12||initial.profile.minRadius<35)continue;
  const idx=trial.roads.findIndex((r:any)=>r.id===row.id),old=structuredClone(trial.roads[idx]),r={...structuredClone(original),pavementSurface:'ribbon'};if(old.gore?.clipToPavement)r.gore.clipToPavement=true;trial.roads[idx]=r;const check=analyze(trial,[r]).rows[0];if(check.severity==='PASS'){restored.push({roadId:r.id,reason:'Original authored profile matches corrected host triangles; removed candidate fit to stale capsule plane.'});changes.push({roadId:r.id,before:old.pavementSurface??null,after:'ribbon',restoredOriginalGeometry:true});}else trial.roads[idx]=old;
 }
 after=analyze(trial,trial.roads.filter((r:any)=>seeds.some((q:any)=>q.id===r.id))).rows;
 const regressions=after.filter((r:any)=>{const old=before.find((q:any)=>q.id===r.id);return old.severity==='PASS'&&r.severity!=='PASS'||r.severity==='P0'&&old.severity!=='P0';});
 if(regressions.length){write('clusters/'+c.file+'-representation.json',{cluster:c.id,changed:[],rejectedChanges:changes,regressions:regressions.map((r:any)=>r.id)});continue;}
 for(const change of changes){const i=map.roads.findIndex((r:any)=>r.id===change.roadId);map.roads[i]=trial.roads[i];}
 const result={cluster:c.id,changed:changes,restored,before:before.map((r:any)=>({id:r.id,severity:r.severity,shared:r.interfaces.map((i:any)=>i.maxSharedDeltaY)})),after:after.map((r:any)=>({id:r.id,severity:r.severity,shared:r.interfaces.map((i:any)=>i.maxSharedDeltaY)}))};plans.push(result);write('clusters/'+c.file+'-representation.json',result);if(!preview)write('candidate-map.json',map);
 console.log(JSON.stringify({cluster:c.id,changed:changes.map(r=>r.roadId),beforeIssues:before.filter((r:any)=>r.severity!=='PASS').length,afterIssues:after.filter((r:any)=>r.severity!=='PASS').length}));
}
if(!preview)write('support-representation-plans.json',plans);
