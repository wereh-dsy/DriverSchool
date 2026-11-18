import fs from 'node:fs';
import {rampProfile} from '../src/editor/RampProfileAudit';
import {roadPoints} from '../src/world/city/geometry';
import type {CityMapData} from '../src/world/city/CityMapData';
const root='artifacts/interchange-integrated-audit/',dir=root+'surface-replays/',before:CityMapData=JSON.parse(fs.readFileSync(root+'road-surface-baseline-map.json','utf8')),after=JSON.parse(fs.readFileSync(root+'surface-candidate-map.json','utf8')),sampling=JSON.parse(fs.readFileSync(root+'road-surface-baseline-sampling.json','utf8')),diagnostics=JSON.parse(fs.readFileSync(root+'surface-root-cause-diagnostics.json','utf8')),plans:any[]=[];
fs.mkdirSync(dir,{recursive:true});
const add=(id:string,category:string,station?:number,lane?:number,speed=80)=>{const r=before.roads.find(r=>r.id===id)!,profile=rampProfile(r);plans.push({roadId:id,category,before:profile,focusFraction:station===undefined?.5:station/profile.length,laneOffset:lane===undefined?0:(lane+.5-r.laneCount/2)*r.laneWidth,speedKph:speed});};
for(const id of ['regional:wuliuyuan:on:-1','regional:airport-service:on:1','regional:dongnan:S-to-E-right','ring-cw-1-split-split-2-split']){const r=sampling.rows.find((r:any)=>r.roadId===id),w=r.worst[0];add(id,r.flatCandidate?'FLAT_ELEVATED_SUPPORT_SEAM':'RIBBON_CONTACT_MISMATCH',w.station,w.lane,60);}
for(const id of ['regional:S68:out:split12:split30:split36:split232:split546:split554:split562','regional:hewan:on:-1','ring-cw-2-split-4-split']){const f=diagnostics.folds.find((r:any)=>r.roadId===id);add(id,id.startsWith('ring-')?'BIDIRECTIONAL_SHARED_SEPARATED_TRANSITION':'INVERTED_SHORT_STRIP',f.station,0,50);}
const control=sampling.rows.filter((r:any)=>r.categories[0]==='PASS'&&r.flatCandidate&&r.length>500&&Math.min(...roadPoints(before.roads.find(q=>q.id===r.roadId)!).map(p=>p.y??0))>5).sort((a:any,b:any)=>b.length-a.length)[0];
if(!control)throw new Error('No elevated flat control corridor found');add(control.roadId,'LONG_STRAIGHT_ELEVATED_CONTROL',control.length*.5,1,90);
fs.writeFileSync(dir+'before-map.json',JSON.stringify(before));fs.writeFileSync(dir+'candidate-map.json',JSON.stringify(after));fs.writeFileSync(dir+'repair-plans.json',JSON.stringify(plans,null,2));console.log(JSON.stringify({plans:plans.map(p=>({road:p.roadId,kind:p.category,speed:p.speedKph})),mapVersion:after.version}));
