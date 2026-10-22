import fs from 'node:fs';
import type {CityMapData} from '../src/world/city/CityMapData';
import {barrierSections,centralBarrierSections} from '../src/world/city/RoadInfrastructure';
import {RoadClearance} from '../src/world/city/RoadClearance';
import {innerRoadSide} from '../src/world/city/RoadCarriageway';
import {makePavementSegments} from '../src/editor/ElevationSeams';
import {EditorSpatialIndex,bounds} from '../src/editor/EditorGeometry';
const dir='artifacts/interchange-integrated-audit/',map:CityMapData=JSON.parse(fs.readFileSync(dir+'surface-candidate-map.json','utf8')),audit=JSON.parse(fs.readFileSync(dir+'median-and-carriageway-audit.json','utf8')),render={...map,roads:map.roads.map(r=>({...r,pavementSurface:'ribbon' as const}))},segments=makePavementSegments(render),index=new EditorSpatialIndex(32),clearance=new RoadClearance(map),rows:any[]=[];
segments.forEach((s,i)=>index.set(String(i),s.box));
for(const row of audit.rows.filter((r:any)=>r.newSections>0)){
 const road=map.roads.find(r=>r.id===row.roadId)!,sections=[...barrierSections(road,map,clearance).filter(s=>s.kind==='shared-median').map(s=>s.points),...centralBarrierSections(road,map,clearance)],unsupported:any[]=[];let points=0,maxHeightError=0;
 for(const section of sections)for(const p of section){let error=Infinity,chosen:string|undefined;for(const id of index.query(bounds([p],.02))){const s=segments[+id]!;if(s.surface.contains(.001)(p.x,p.z)){const e=Math.abs((p.y??0)-s.surface.heightAt(p.x,p.z));if(e<error){error=e;chosen=s.road.id;}}}points++;maxHeightError=Math.max(maxHeightError,error);if(error>.03)unsupported.push({position:p,heightError:error,supportRoadId:chosen});}
 rows.push({roadId:road.id,points,maxHeightError,unsupported});
}
const result={mapVersion:map.version,valid:rows.every(r=>!r.unsupported.length),protocol:'Every vertex of newly emitted/relocated inner and central barriers checked against full exact rendered ribbon triangles on its actual level; excludes the common 24mm visual lift. Same sections feed rendering and solid colliders.',rows};
fs.writeFileSync(dir+'median-footing-validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify({valid:result.valid,roads:rows.length,unsupported:rows.filter(r=>r.unsupported.length).map(r=>({id:r.roadId,count:r.unsupported.length,max:r.maxHeightError}))}));if(!result.valid)process.exitCode=1;
