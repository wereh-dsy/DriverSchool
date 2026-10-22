import fs from 'node:fs';
import {RoadSignGeometryAudit} from './RoadSignGeometryAudit';
import {RoadSignPlacement} from '../src/world/regional/FastRoadSignPlacement';
import {roadCarriageways} from '../src/world/city/RoadCarriageway';
const dir='artifacts/interchange-integrated-audit/',map=JSON.parse(fs.readFileSync(dir+'surface-candidate-map.json','utf8')),previous=JSON.parse(fs.readFileSync(dir+'sign-rendered-geometry-validation.json','utf8')),audit=new RoadSignGeometryAudit(map),placement=new RoadSignPlacement(map),footings=roadCarriageways(map),rows:any[]=[];
for(const failure of previous.rows.filter((r:any)=>!r.valid)){
 const old=structuredClone(map.signs.find((s:any)=>s.id===failure.id)),attempts:any[]=[];let found:any;
 for(const delta of [0,-8,8,-16,16,-32,32]){
  const moved=delta?placement.move(old,delta):structuredClone(old);if(!moved)continue;
  const road=map.roads.find((r:any)=>r.id===moved.roadId),fresh=placement.roadside(road,moved.stationMetres!,moved.laneDirection==='reverse',moved.type,moved.id,moved.chevronDirection);if(!fresh)continue;
  const candidate={...moved,...fresh,destinations:old.destinations,speedLimitKmh:old.speedLimitKmh,chevronDirection:old.chevronDirection};delete candidate.postBaseY;
  const height=footings.pavedHeight(candidate.roadId,candidate.position);if(height===undefined)continue;candidate.position.y=height;
  const result=audit.check(candidate),safe=placement.safe(candidate);attempts.push({delta,roadId:candidate.roadId,position:candidate.position,safe,geometry:result});if(safe&&result.valid){found=candidate;break;}
 }
 if(found)map.signs[map.signs.findIndex((s:any)=>s.id===old.id)]=found;
 rows.push({id:old.id,valid:!!found,before:old,after:found??old,rootCause:old.postBaseY!==undefined?'Obsolete ground/post base traverses the owning deck':'Centreline-height mounting on a graded/mitered shoulder',attempts});
}
audit.dispose();fs.writeFileSync(dir+'sign-footing-adjustments.json',JSON.stringify(rows,null,2));const temp=dir+'surface-candidate-map.next.json';fs.writeFileSync(temp,JSON.stringify(map,null,2)+'\n');fs.renameSync(temp,dir+'surface-candidate-map.json');console.log(JSON.stringify({fixed:rows.filter(r=>r.valid).length,remaining:rows.filter(r=>!r.valid).map(r=>r.id)}));
