import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import type {CityMapData,CityRoad} from '../src/world/city/CityMapData';
import {roadPoints,refreshPortPoses} from '../src/world/city/geometry';
import {rampOverlaps,rampProfile} from '../src/editor/RampProfileAudit';
import {bounds,overlaps,distance} from '../src/editor/EditorGeometry';
import {localMap,profileSummary} from './InterchangeDesign';
import {buildCityRoadNetwork} from '../src/world/city/CityRoadNetwork';
import {RoutePlanner,type RouteLocation} from '../src/world/navigation/RoutePlanner';
import {validateMap} from '../src/world/city/CityMapValidation';

const dir='artifacts/interchange-integrated-audit/',read=(p:string)=>JSON.parse(fs.readFileSync(dir+p,'utf8')),save=(p:string,v:unknown)=>fs.writeFileSync(dir+p,JSON.stringify(v,null,2)+'\n');
const before:CityMapData=read('baseline-map.json'),after:CityMapData=read('candidate-map.json'),changes=read('geometry-changes.json'),inventory=read('interchange-inventory.json'),decisions=read('design-decisions.json'),assets=read('asset-adjustments.json'),ids=new Set<string>(changes.rows.map((r:any)=>r.roadId)),oldRoads=new Map(before.roads.map(r=>[r.id,r])),roads=new Map(after.roads.map(r=>[r.id,r]));
refreshPortPoses({...after,connectionPorts:after.connectionPorts?.filter(p=>ids.has(p.endpoint.roadId))});save('candidate-map.json',after);
const failures:string[]=[],key=(a:string,b:string)=>[a,b].sort().join('|'),strip=(r:CityRoad)=>({...r,centerline:[],curve:undefined,elevation:undefined,elevationMode:undefined,pavementSurface:undefined});
assert.equal(before.roads.length,after.roads.length);assert.deepEqual(before.roads.map(r=>r.id),after.roads.map(r=>r.id));assert.deepEqual(before.roadLinks,after.roadLinks);assert.deepEqual(before.intersections,after.intersections);
const geometry=changes.rows.map((r:any)=>{
  const b=oldRoads.get(r.roadId)!,a=roads.get(r.roadId)!;assert.deepEqual(strip(b),strip(a),'Only reviewed road geometry changes: '+a.id);
  const p=rampProfile(a),old=rampProfile(b),nonFinite=a.centerline.some(v=>![v.x,v.y??0,v.z].every(Number.isFinite)),newSub5cm=p.segments.some(s=>s.length<.05)&&!old.segments.some(s=>s.length<.05);
  if(nonFinite||newSub5cm||p.maxGrade>Math.max(.12,old.maxGrade)+.001||p.maxGradeBreak>.04)failures.push('profile:'+a.id);
  return {...r,before:profileSummary(b),after:profileSummary(a),insertedNodes:a.centerline.length-b.centerline.length,newSub5cm,finite:!nonFinite,beforeCenterline:b.centerline,afterCenterline:a.centerline};
});
for(const r of after.roads)if(!ids.has(r.id))assert.deepEqual(r,oldRoads.get(r.id),'Unrelated road preserved: '+r.id);
const linkRows=(after.roadLinks??[]).filter(l=>ids.has(l.from.roadId)||ids.has(l.to.roadId)).map(l=>{
  const endpoint=(id:string,end:'start'|'end')=>{const p=roadPoints(roads.get(id)!);return end==='start'?p[0]!:p.at(-1)!;},a=endpoint(l.from.roadId,l.from.end),b=endpoint(l.to.roadId,l.to.end),horizontalGap=distance(a,b),heightGap=Math.abs((a.y??0)-(b.y??0));if(horizontalGap>.2||heightGap>.04)failures.push('link:'+l.id);return {id:l.id,from:l.from,to:l.to,horizontalGap,heightGap};
});
const oldNetwork=buildCityRoadNetwork(before),network=buildCityRoadNetwork(after),signature=(n:typeof network)=>(n.routing?.connections??[]).map(c=>[c.fromRoadId,c.fromEnd,c.toRoadId,c.toEnd].join('|')).sort();assert.deepEqual(signature(oldNetwork),signature(network),'Directed navigation topology preserved');
const planners=[new RoutePlanner(oldNetwork),new RoutePlanner(network)],routeRows:any[]=[];
for(const c of inventory.rows){
  const decision=decisions.find((d:any)=>d.clusterId===c.id);c.status=decision?.status??'DEFER_UNRESOLVED';c.modifiedRoadIds=changes.rows.filter((r:any)=>r.clusterId===c.id).map((r:any)=>r.roadId);
  if(!decision?.geometryApplied)continue;
  const movementRoads=c.modifiedRoadIds.filter((id:string)=>roads.get(id)?.roadClass==='ramp'),selected=movementRoads.length?movementRoads:c.modifiedRoadIds.slice(0,1);
  for(const id of selected){
    const incoming=network.routing?.connections.find(e=>e.toRoadId===id),outgoing=network.routing?.connections.find(e=>e.fromRoadId===id);
    const runs=planners.map(planner=>{const loc=(roadId:string,fraction:number,direction:'forward'|'reverse'):RouteLocation=>{const r=planner.road(roadId)!;return {roadId,along:r.length*fraction,point:planner.pointAt(roadId,r.length*fraction),label:roadId,direction};},road=planner.road(id)!,direction=road.travelDirection==='reverse'?'reverse':'forward',via=loc(id,.5,direction),start=incoming?loc(incoming.fromRoadId,incoming.fromEnd==='end'?.7:.3,incoming.fromEnd==='end'?'forward':'reverse'):loc(id,direction==='forward'?.1:.9,direction),end=outgoing?loc(outgoing.toRoadId,outgoing.toEnd==='start'?.3:.7,outgoing.toEnd==='start'?'forward':'reverse'):loc(id,direction==='forward'?.9:.1,direction),route=planner.planThrough(start,end,[via]);return {found:!!route,distance:route?.distance,viaVisited:route?.sections.some(s=>s.road.id===id),roadIds:route?[...new Set(route.sections.map(s=>s.road.id))]:[]};});
    if(runs[0]!.found&&!runs[1]!.found||runs[1]!.found&&!runs[1]!.viaVisited)failures.push('route:'+id);routeRows.push({clusterId:c.id,roadId:id,before:runs[0],after:runs[1]});
  }
}
save('topology-validation.json',{valid:!failures.some(f=>f.startsWith('link:')||f.startsWith('route:')),roadIdsPreserved:true,laneWidthsCountsAndDirectionsPreserved:true,junctionsPreserved:true,explicitLinksPreserved:true,directedConnectionsPreserved:true,connectionCount:signature(network).length,links:linkRows,routes:routeRows,ports:after.connectionPorts?.filter(p=>ids.has(p.endpoint.roadId))});
const roadBoxes=new Map(after.roads.map(r=>[r.id,bounds(roadPoints(r),Math.max(-r.laneCount*r.laneWidth/2-(r.shoulders?.left??0),r.laneCount*r.laneWidth/2+(r.shoulders?.right??0))+20)])),crossingRows:any[]=[],seen=new Set<string>();
for(const c of inventory.rows){
  const own=new Set<string>(c.modifiedRoadIds);if(!own.size)continue;
  const candidateBoxes=[...own].flatMap(id=>[bounds(roadPoints(roads.get(id)!),20),bounds(roadPoints(oldRoads.get(id)!),20)]),context=after.roads.filter(r=>candidateBoxes.some(b=>overlaps(roadBoxes.get(r.id)!,b))).map(r=>r.id);
  for(const j of after.intersections)if(j.connections.some(e=>context.includes(e.roadId)))for(const e of j.connections)if(!context.includes(e.roadId))context.push(e.roadId);
  const baseline=rampOverlaps(localMap(before,context)),fresh=rampOverlaps(localMap(after,context));
  for(const row of fresh.filter(o=>o.roadIds.some(id=>own.has(id)))){
    const unique=key(...row.roadIds)+'|'+row.stationRanges.flat().map(n=>n.toFixed(2)).join(',');if(seen.has(unique))continue;seen.add(unique);
    const old=baseline.filter(o=>key(...o.roadIds)===key(...row.roadIds)).sort((a,b)=>distance(a.point,row.point)-distance(b.point,row.point))[0],oldMinimum=old?.minGap??0,template=old&&old.minGap>=5.65&&old.maxGap-old.minGap<.03;
    const shared=row.maxGap<=.04,clearance=row.minGap>=((template?old.minGap:6.15)-1e-4),compressed=!!old&&oldMinimum>=5.65&&row.minGap<oldMinimum-.001;
    const valid=(shared||clearance)&&!compressed;if(!valid)failures.push('pavement:'+unique);
    crossingRows.push({...row,clusterId:c.id,before:old??null,valid,classification:shared?'CONTINUOUS_SHARED_PAVEMENT':template?'EXISTING_STRUCTURE_DATUM':clearance?'GRADE_SEPARATED':'UNRESOLVED',compressed});
  }
}
save('clearance-validation.json',{valid:crossingRows.every(r=>r.valid),regions:crossingRows.length,scope:'Full triangle/core-pavement footprint vertices for every modified road, including newly reached neighbours; capsule support replay is separate.',rows:crossingRows,assets:assets.clusters.map((c:any)=>({clusterId:c.clusterId,proposalWithdrawn:c.proposalWithdrawn??false,unresolved:c.unresolved,pierConflicts:c.pierConflicts,roadBuildingConflicts:c.roadBuildingConflicts}))});
const validation=validateMap(after),frozen=read('baseline-evidence.json').physicsFrozen;for(const [p,hash]of Object.entries(frozen))assert.equal(createHash('sha256').update(fs.readFileSync(p)).digest('hex'),hash,'Frozen physics/support/blackbox boundary: '+p);
if(!validation.valid)failures.push(...validation.errors.map(e=>e.code+':'+e.path));
save('geometry-changes.json',{...changes,rows:geometry});save('interchange-inventory.json',inventory);save('changed-region-validation.json',{valid:failures.length===0,baselineVersion:before.version,candidateVersion:after.version,changedRoads:ids.size,profiles:geometry.map(({beforeCenterline,afterCenterline,...r}:any)=>r),frozenSubsystemsVerified:true,basicSchema:validation,failures});
console.log(JSON.stringify({valid:failures.length===0,roads:ids.size,links:linkRows.length,routes:routeRows.length,crossings:crossingRows.length,failures:failures.slice(0,15),schemaErrors:validation.errorCount},null,2));
if(failures.length)process.exitCode=1;
