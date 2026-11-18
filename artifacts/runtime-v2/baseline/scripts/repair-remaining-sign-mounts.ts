import fs from 'node:fs';
import {RoadSignPlacement} from '../src/world/regional/FastRoadSignPlacement';
import {RoadClearance} from '../src/world/city/RoadClearance';
import {signDimensions,ROAD_SIGN_POST_Z} from '../src/world/city/RoadSignTemplates';
import {rotatePoint} from '../src/world/city/geometry';
import {makePavementSegments} from '../src/editor/ElevationSeams';
import {bounds,EditorSpatialIndex} from '../src/editor/EditorGeometry';
const dir='artifacts/interchange-integrated-audit/',map=JSON.parse(fs.readFileSync(dir+'surface-candidate-map.json','utf8')),pending=JSON.parse(fs.readFileSync(dir+'global-sign-adjustments.json','utf8')).unresolved,placement=new RoadSignPlacement(map),surfaces=makePavementSegments({...map,roads:map.roads.map((r:any)=>({...r,pavementSurface:'ribbon'}))}),index=new EditorSpatialIndex(64),rows:any[]=[];
surfaces.forEach((s,i)=>index.set(String(i),s.box));
for(const row of pending){
 const old=map.signs.find((s:any)=>s.id===row.id),road=map.roads.find((r:any)=>r.id===old.roadId),proposal={...structuredClone(old),template:'ceiling',size:'medium'};delete proposal.postOffset;delete proposal.gantryPosts;delete proposal.postBaseY;
 const candidate=placement.move(proposal,0);let supported=false,evidence:any[]=[];
 if(candidate){const d=signDimensions(candidate.template,candidate.size,undefined,undefined,candidate.mountHeight),hangers=[-.35,.35].map(v=>{const q=rotatePoint({x:d.width*v,z:ROAD_SIGN_POST_Z},candidate.heading);return {x:candidate.position.x+q.x,z:candidate.position.z+q.z,y:(candidate.position.y??0)+d.poleTop};});
  const enclosure=road.structure?.enclosure;if(enclosure&&enclosure.kind!=='cutting'){supported=true;evidence=hangers.map(p=>({position:p,structure:road.id,ownRoofClearance:enclosure.clearance}));}
  else {const supports=hangers.map(p=>index.query(bounds([p],.01)).map(i=>surfaces[+i]!).filter(s=>s.road.id!==road.id&&s.surface.contains(0)(p.x,p.z)&&Math.abs(s.surface.heightAt(p.x,p.z)-.65-p.y)<.03).map(s=>s.road.id));const shared=supports[0]?.find(id=>supports.every(list=>list.includes(id)));supported=!!shared;evidence=hangers.map(p=>({position:p,upperDeckRoadId:shared??null}));}
 }
 const valid=!!candidate&&supported&&placement.safe(candidate);if(valid)map.signs[map.signs.findIndex((s:any)=>s.id===old.id)]=candidate;
 rows.push({id:old.id,roadId:old.roadId,before:old,after:valid?candidate:old,scheme:'Use existing ceiling-mounted sign geometry only where both hangers have a proven tunnel roof or the same real upper-deck underside. Preserve every destination, arrow, route, station and reading distance.',valid,roofSupport:evidence});
}
fs.writeFileSync(dir+'remaining-sign-mount-adjustments.json',JSON.stringify(rows,null,2));const temp=dir+'surface-candidate-map.next.json';fs.writeFileSync(temp,JSON.stringify(map,null,2)+'\n');fs.renameSync(temp,dir+'surface-candidate-map.json');console.log(JSON.stringify({fixed:rows.filter(r=>r.valid).length,remaining:rows.filter(r=>!r.valid).map(r=>r.id)}));
