import type { CityMapData } from '../world/city/CityMapData';
import { roadFunction } from '../world/city/RoadClassification';
import { sampleAt, polylineLength } from '../world/city/geometry';
import { bounds, distance, project, union } from './EditorGeometry';
import { angleDelta, analysisContext, issue, MapAnalysisContext, structureType, type MapIssue, type SpatialScope } from './MapAnalysis';
import { inspectHorizontal, profileIssues } from './RoadProfileAnalysis';
import { rampIssues } from './RampAnalysis';
import { editableObjects, deriveAnchor, queryObjects } from './ObjectAnalysis';
import { placementIssues } from './PlacementBrush';
import { structureIssues } from './StructureAnalysis';
import { diagnoseMap } from './RoadDiagnostics';
import { buildCityRoadNetwork } from '../world/city/CityRoadNetwork';

export function diagnoseEngineering(context:MapAnalysisContext,scope:SpatialScope,domain:'all'|'objects'|'profile'|'ramps'|'structures'='all'){
  const roads=domain==='objects'?[]:context.selectedRoads(scope),issues:MapIssue[]=[];
  for(const road of roads){
    if(domain==='all'||domain==='profile')issues.push(...profileIssues(context,road.id));
    if((domain==='all'||domain==='ramps')&&roadFunction(road)==='ramp')issues.push(...rampIssues(context,road.id));
    if(domain==='all'||domain==='structures')issues.push(...structureIssues(context,road.id));
  }
  let objectsChecked=0;
  if(domain==='all'||domain==='objects'){
    let offset=0;do{const page=queryObjects(context,{...scope,limit:1000,offset});for(const o of page.objects){issues.push(...placementIssues(context,o));objectsChecked++;}if(page.pagination.nextOffset===null)break;offset=page.pagination.nextOffset;}while(true);
    // A failed generated signal pole is an inspectable issue, never a ghost object.
    for(const j of context.map.intersections)if(j.signalized&&(scope.full||scope.intersectionId===j.id||roads.some(r=>j.connections.some(c=>c.roadId===r.id))))for(const c of j.connections)if(!editableObjects(context).some(o=>o.id===`signal:${j.id}:${c.port}`)){
      const r=context.road(c.roadId);if(r.travelDirection==='two-way'||(r.travelDirection==='forward')===(c.end==='end'))issues.push(issue('trafficLight.unanchored',{intersectionId:j.id,roadId:r.id},'Generated approach has no legal signal pole',{approach:c.port},{reviewRequired:true}));
    }
  }
  const rank={info:0,warning:1,error:2};
  const filtered=issues.filter(i=>(!scope.codes?.length||scope.codes.some(c=>i.code.startsWith(c)))&&rank[i.severity]>=rank[scope.minSeverity??'info']);
  const limit=scope.limit??200,offset=scope.offset??0;
  return {schemaVersion:1,domain,scope,coverage:{roads:roads.length,objects:objectsChecked},counts:{total:filtered.length,error:filtered.filter(i=>i.severity==='error').length,warning:filtered.filter(i=>i.severity==='warning').length,info:filtered.filter(i=>i.severity==='info').length},issues:filtered.slice(offset,offset+limit),pagination:{offset,limit,total:filtered.length,nextOffset:offset+limit<filtered.length?offset+limit:null}};
}
export function diagnosticDelta(before:{issues:{id?:string;code:string;roadId?:string;intersectionId?:string;objectId?:string;station?:number;severity:string}[]},after:typeof before){
  const key=(i:typeof before.issues[number])=>[i.id??[i.code,i.roadId??'',i.intersectionId??'',i.objectId??'',i.station?.toFixed(2)??''].join(':'),i.severity].join(':');
  const a=new Map(before.issues.map(i=>[key(i),i])),b=new Map(after.issues.map(i=>[key(i),i]));
  return {resolved:[...a].filter(([k])=>!b.has(k)).map(([,v])=>v),new:[...b].filter(([k])=>!a.has(k)).map(([,v])=>v),unchanged:[...b].filter(([k])=>a.has(k)).map(([,v])=>v)};
}
function collectionDiff<T extends {id:string}>(before:T[],after:T[]){const a=new Map(before.map(v=>[v.id,v])),b=new Map(after.map(v=>[v.id,v]));return {added:after.filter(v=>!a.has(v.id)),removed:before.filter(v=>!b.has(v.id)),modified:after.filter(v=>a.has(v.id)&&JSON.stringify(a.get(v.id))!==JSON.stringify(v)).map(v=>({before:a.get(v.id)!,after:v}))};}
function topology(context:MapAnalysisContext,ids:Set<string>){
  const graph=new Map([...ids].map(id=>[id,new Set<string>()]));
  const join=(a:string,b:string)=>{if(ids.has(a)&&ids.has(b)){graph.get(a)!.add(b);graph.get(b)!.add(a);}};
  for(const l of context.map.roadLinks??[])join(l.from.roadId,l.to.roadId);
  for(const j of context.map.intersections)for(const a of j.connections)for(const b of j.connections)if(a.roadId!==b.roadId)join(a.roadId,b.roadId);
  const seen=new Set<string>();let components=0;for(const id of ids)if(!seen.has(id)){components++;const queue=[id];while(queue.length){const next=queue.pop()!;if(seen.has(next))continue;seen.add(next);queue.push(...graph.get(next)??[]);}}
  return {components,deadEnds:[...graph].filter(([,v])=>v.size<=1).map(([id])=>id),adjacency:[...graph].map(([id,links])=>({id,links:[...links]}))};
}
function laneTopology(context:MapAnalysisContext,ids:Set<string>){
  if(!ids.size)return {connections:[] as string[],reachable:(_from:string,_to:string)=>false};
  const network=buildCityRoadNetwork({...context.map,roads:context.map.roads.filter(r=>ids.has(r.id)),intersections:context.map.intersections.filter(j=>j.connections.every(c=>ids.has(c.roadId))),roadLinks:(context.map.roadLinks??[]).filter(l=>ids.has(l.from.roadId)&&ids.has(l.to.roadId))});
  const adjacency=new Map<string,Set<string>>();
  for(const road of network.segments)for(const lane of road.lanes)adjacency.set(lane.id,new Set(road.lanes.filter(other=>other.direction===lane.direction).map(other=>other.id)));
  for(const c of network.laneConnections)adjacency.get(c.fromLaneId)?.add(c.toLaneId);
  return {connections:network.laneConnections.map(c=>[c.intersectionId,c.fromLaneId,c.toLaneId].join('|')),reachable:(from:string,to:string)=>{
    const queue=network.segments.find(r=>r.id===from)?.lanes.map(l=>l.id)??[],targets=new Set(network.segments.find(r=>r.id===to)?.lanes.map(l=>l.id)??[]),seen=new Set<string>();
    while(queue.length){const id=queue.pop()!;if(targets.has(id))return true;if(seen.has(id))continue;seen.add(id);queue.push(...adjacency.get(id)??[]);}return false;
  }};
}
export function semanticDiff(before:CityMapData,after:CityMapData,options:{full?:boolean;routes?:{from:string;to:string}[]}={}){
  const a=analysisContext(before),b=analysisContext(after),roads=collectionDiff(before.roads,after.roads),junctions=collectionDiff(before.intersections,after.intersections),objects=collectionDiff(editableObjects(a),editableObjects(b));
  const geometry=roads.modified.map(({before:r,after:s})=>{
    const p=a.path(r.id),q=b.path(s.id),l=polylineLength(p),m=polylineLength(q);
    const maxDisplacement=Math.max(...p.map(v=>project(q,v).distance),...q.map(v=>project(p,v).distance));
    let elevationDelta=0;for(let i=0;i<=100;i++)elevationDelta=Math.max(elevationDelta,Math.abs((sampleAt(p,l*i/100).point.y??0)-(sampleAt(q,m*i/100).point.y??0)));
    const endpointsChanged=JSON.stringify([p[0],p.at(-1)])!==JSON.stringify([q[0],q.at(-1)]),controlPointsChanged=Math.max(r.centerline.length,s.centerline.length)-r.centerline.filter((v,i)=>JSON.stringify(v)===JSON.stringify(s.centerline[i])).length;
    const endpointChanges={start:{before:p[0],after:q[0]},end:{before:p.at(-1),after:q.at(-1)}};
    return {id:r.id,approximate:true,metricMethod:'symmetric path projection; 100 normalized elevation samples',horizontalGeometryChanged:maxDisplacement>1e-6,elevationOnly:maxDisplacement<=1e-6&&elevationDelta>1e-6,maxDisplacement,elevationDelta,controlPointsChanged,endpointsChanged,endpointChanges,beforeMaxHeadingDelta:inspectHorizontal(a,r.id).maxHeadingDelta,afterMaxHeadingDelta:inspectHorizontal(b,r.id).maxHeadingDelta,crossingElevationsPreserved:a.crossings(r.id).every(c=>Math.abs((project(q,c.point).point.y??0)-(c.point.y??0))<1e-6)};
  });
  const links=collectionDiff(before.roadLinks??[],after.roadLinks??[]),ids=new Set([...roads.added,...roads.removed,...roads.modified.map(r=>r.after)].map(r=>r.id));
  for(const l of [...links.added,...links.removed,...links.modified.flatMap(l=>[l.before,l.after])]){ids.add(l.from.roadId);ids.add(l.to.roadId);}
  for(const j of [...junctions.added,...junctions.removed,...junctions.modified.flatMap(j=>[j.before,j.after])])for(const c of j.connections)ids.add(c.roadId);
  const topologyChanged=!!(links.added.length||links.removed.length||links.modified.length||junctions.added.length||junctions.removed.length||junctions.modified.some(j=>JSON.stringify(j.before.connections)!==JSON.stringify(j.after.connections))||roads.added.length||roads.removed.length);
  for(const route of options.routes??[]){ids.add(route.from);ids.add(route.to);}
  const seeds=new Set(ids);
  const expand=(context:MapAnalysisContext)=>{for(const l of context.map.roadLinks??[])if(seeds.has(l.from.roadId)||seeds.has(l.to.roadId)){ids.add(l.from.roadId);ids.add(l.to.roadId);}for(const j of context.map.intersections)if(j.connections.some(c=>seeds.has(c.roadId)))for(const c of j.connections)ids.add(c.roadId);};
  if(options.full){for(const r of [...before.roads,...after.roads])ids.add(r.id);}else{expand(a);expand(b);}
  const oldGraph=topology(a,new Set([...ids].filter(id=>a.roads.has(id)))),newGraph=topology(b,new Set([...ids].filter(id=>b.roads.has(id))));
  const oldLanes=laneTopology(a,new Set([...ids].filter(id=>a.roads.has(id)))),newLanes=laneTopology(b,new Set([...ids].filter(id=>b.roads.has(id))));
  const routeChecks=(options.routes??[]).map(route=>({...route,before:oldLanes.reachable(route.from,route.to),after:newLanes.reachable(route.from,route.to),method:'logical lane reachability; same-direction lane changes allowed',scope:options.full?'full':'localDependency',reviewRequired:!options.full}));
  const affected=[...roads.added,...roads.removed,...roads.modified.flatMap(r=>[r.before,r.after])].map(r=>bounds((a.roads.get(r.id)===r?a:b).path(r.id),r.laneCount*r.laneWidth/2+Math.max(r.shoulders?.left??0,r.shoulders?.right??0)+(r.sidewalk?.enabled?r.sidewalk.width:0)));
  for(const o of [...objects.added,...objects.removed,...objects.modified.flatMap(o=>[o.before,o.after])])affected.push(bounds([o.position],Math.max(o.size.width,o.size.depth)/2));
  for(const j of [...junctions.added,...junctions.removed,...junctions.modified.flatMap(j=>[j.before,j.after])])affected.push(bounds([j.position],40));
  return {schemaVersion:1,signs:collectionDiff(before.signs??[],after.signs??[]),roads:{added:roads.added.map(r=>r.id),removed:roads.removed.map(r=>r.id),modified:geometry},intersections:{added:junctions.added.map(j=>j.id),removed:junctions.removed.map(j=>j.id),modified:junctions.modified.map(j=>({id:j.after.id,armsBefore:j.before.connections,armsAfter:j.after.connections,markingsRegenerated:JSON.stringify([j.before.markingFootprint,j.before.approaches])!==JSON.stringify([j.after.markingFootprint,j.after.approaches])}))},objects:{added:objects.added.map(o=>o.id),removed:objects.removed.map(o=>o.id),modified:objects.modified.map(o=>({id:o.after.id,type:o.after.type,displacement:Math.hypot(distance(o.before.position,o.after.position),(o.before.position.y??0)-(o.after.position.y??0)),heightDelta:(o.after.position.y??0)-(o.before.position.y??0),rotationDelta:angleDelta(o.after.rotation,o.before.rotation),anchorBefore:deriveAnchor(a,o.before),anchorAfter:deriveAnchor(b,o.after),anchorRoadUnchanged:deriveAnchor(a,o.before)?.anchorRoadId===deriveAnchor(b,o.after)?.anchorRoadId,anchorApproachUnchanged:o.before.approach===o.after.approach}))},structures:roads.modified.filter(r=>JSON.stringify(r.before.structure)!==JSON.stringify(r.after.structure)||structureType(r.before)!==structureType(r.after)||(structureType(r.before)!=='at_grade'||structureType(r.after)!=='at_grade')&&geometry.some(g=>g.id===r.after.id&&(g.elevationDelta>1e-6||g.maxDisplacement>1e-6))).map(r=>({roadId:r.after.id,before:r.before.structure??null,after:r.after.structure??null,beforeType:structureType(r.before),afterType:structureType(r.after)})),roadLinks:links,affectedBbox:union(affected),maxRoadDisplacement:Math.max(0,...geometry.map(r=>r.maxDisplacement)),maxElevationDelta:Math.max(0,...geometry.map(r=>r.elevationDelta)),topology:{changed:topologyChanged,scope:options.full?'full':'localDependency',componentDelta:newGraph.components-oldGraph.components,newDeadEnds:newGraph.deadEnds.filter(id=>!oldGraph.deadEnds.includes(id)),before:oldGraph,after:newGraph,routeChecks,laneConnectionsAdded:newLanes.connections.filter(c=>!oldLanes.connections.includes(c)),laneConnectionsRemoved:oldLanes.connections.filter(c=>!newLanes.connections.includes(c)),directedLaneRouteVerified:true}};
}
export function reviewMaps(before:CityMapData,after:CityMapData,options:{full?:boolean;routes?:{from:string;to:string}[]}={}){
  const diff=semanticDiff(before,after,options),scope:SpatialScope=options.full?{full:true,limit:1000000}:diff.affectedBbox?{bbox:diff.affectedBbox,limit:1000000}:{bbox:{minX:0,maxX:0,minZ:0,maxZ:0},limit:1000000};
  const baseline=diagnoseEngineering(analysisContext(before),scope),afterReport=diagnoseEngineering(analysisContext(after),scope);
  const legacyScope={...scope,limit:1000000};
  const legacyBefore=diagnoseMap(before,legacyScope,{retainAllIssues:true}),legacyAfter=diagnoseMap(after,legacyScope,{retainAllIssues:true});
  const diagnosticsBefore={...baseline,issues:[...baseline.issues,...legacyBefore.issues]},diagnosticsAfter={...afterReport,issues:[...afterReport.issues,...legacyAfter.issues]};
  return {diff,diagnosticsBefore,diagnosticsAfter,issueDiff:diagnosticDelta(diagnosticsBefore,diagnosticsAfter)};
}
