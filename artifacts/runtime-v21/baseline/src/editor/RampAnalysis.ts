import { roadFunction } from '../world/city/RoadClassification';
import { polylineLength, sampleAt } from '../world/city/geometry';
import { bounds, distance, project } from './EditorGeometry';
import { issue, MapAnalysisContext, type MapIssue } from './MapAnalysis';
import { inspectHorizontal, inspectProfile } from './RoadProfileAnalysis';

export function inspectRamp(context:MapAnalysisContext,id:string){
  const metadata=context.map.editing?.ramps.find(r=>r.id===id||r.roadId===id),road=context.road(metadata?.roadId??id),path=context.path(road.id);
  if(roadFunction(road)!=='ramp'&&!metadata)throw new Error('Road is not a ramp: '+id);
  const ends=[path[0]!,path.at(-1)!];
  const connections=(context.map.roadLinks??[]).filter(l=>l.from.roadId===road.id||l.to.roadId===road.id).map(l=>l.from.roadId===road.id?l.to:l.from);
  const sourceId=metadata?.from.roadId??connections[0]?.roadId,targetId=metadata?.to.roadId??connections[1]?.roadId;
  const source=sourceId?context.roads.get(sourceId):undefined,target=targetId?context.roads.get(targetId):undefined;
  const access=[source,target].some(r=>r&&roadFunction(r)==='frontage')&&[source,target].some(r=>r&&roadFunction(r)==='expressway');
  const neighbours=context.roadCandidates(bounds(path,context.limits.interchangeDistance*2)).filter(r=>r.id!==road.id&&roadFunction(r)==='ramp').map(r=>{
    const other=context.path(r.id),crossing=context.crossings(road.id).find(c=>c.roadId===r.id),separation=crossing?0:Math.min(...path.map(p=>project(other,p).distance),...other.map(p=>project(path,p).distance));
    const otherMeta=context.map.editing?.ramps.find(m=>m.roadId===r.id),related=[otherMeta?.from.roadId,otherMeta?.to.roadId].flatMap(key=>key?[context.roads.get(key)]:[]);
    const role=related.some(r=>r&&roadFunction(r)==='frontage')?'frontageAccess':'interchange';
    const closest=path.reduce((a,p)=>project(other,p).distance<project(other,a).distance?p:a,path[0]!);
    return {roadId:r.id,distance:separation,verticalSeparation:crossing?Math.abs((crossing.point.y??0)-crossing.otherY):Math.abs((closest.y??0)-(project(other,closest).point.y??0)),role,approximate:true};
  }).sort((a,b)=>a.distance-b.distance);
  const nearestJunction=context.map.intersections.map(j=>({id:j.id,distance:project(path,j.position).distance})).sort((a,b)=>a.distance-b.distance)[0]??null;
  const mainline=[source,target].find(r=>r&&roadFunction(r)==='expressway');
  const attachments=mainline?context.roadCandidates(bounds(context.path(mainline.id),30)).filter(r=>r.id!==road.id&&roadFunction(r)==='ramp').flatMap(r=>[context.path(r.id)[0]!,context.path(r.id).at(-1)!].map(p=>({roadId:r.id,...project(context.path(mainline.id),p)})).filter(p=>p.distance<25)).map(p=>({roadId:p.roadId,station:p.along,distance:Math.min(...ends.map(e=>Math.abs(project(context.path(mainline.id),e).along-p.along)))})):[];
  return {roadId:road.id,sourceRoadId:sourceId??null,targetRoadId:targetId??null,role:access?'frontageAccess':'interchange',kind:metadata?.kind??null,mergeDiverge:metadata?.kind==='on'?'merge':metadata?.kind==='off'?'diverge':'reviewRequired',length:polylineLength(path),horizontal:inspectHorizontal(context,road.id),profile:inspectProfile(context,road.id),nearestIntersection:nearestJunction,nearestInterchangeRamp:neighbours.find(n=>n.role==='interchange')??null,nearestFrontageAccessRamp:neighbours.find(n=>n.role==='frontageAccess')??null,neighbourRamps:neighbours,crossings:context.crossings(road.id),attachments,metadata:metadata??null,reviewRequired:!metadata};
}
export function rampIssues(context:MapAnalysisContext,id:string):MapIssue[]{
  const ramp=inspectRamp(context,id),path=context.path(ramp.roadId),result:MapIssue[]=[],entity={roadId:ramp.roadId};
  const add=(code:string,message:string,metrics:MapIssue['metrics'])=>result.push(issue(code,entity,message,metrics,{approximate:true,reviewRequired:true}));
  if(ramp.role==='frontageAccess'){
    if(ramp.length>context.limits.accessLength)add('ramp.accessTooLong','Access ramp length exceeds review threshold',{actual:ramp.length,threshold:context.limits.accessLength});
    const span=distance(path[0]!,path.at(-1)!),width=Math.max(...path.map(p=>project([path[0]!,path.at(-1)!],p).distance));
    if(width>context.limits.accessWidth)add('ramp.accessTooWide','Access ramp lateral excursion exceeds review threshold',{actual:width,threshold:context.limits.accessWidth,chordLength:span});
    if(ramp.nearestInterchangeRamp&&ramp.nearestInterchangeRamp.distance<context.limits.interchangeDistance&&ramp.nearestInterchangeRamp.verticalSeparation<context.limits.clearance)add('ramp.tooCloseToInterchange','Access ramp is near an interchange ramp',{otherRoadId:ramp.nearestInterchangeRamp.roadId,actual:ramp.nearestInterchangeRamp.distance,threshold:context.limits.interchangeDistance});
  }
  for(const n of ramp.neighbourRamps)if(n.distance<context.limits.rampDistance&&n.verticalSeparation<context.limits.clearance)add('ramp.overlapsRamp','Ramp envelopes overlap or run close together',{otherRoadId:n.roadId,actual:n.distance,verticalSeparation:n.verticalSeparation,threshold:context.limits.rampDistance});
  for(const a of ramp.attachments)if(a.distance<context.limits.attachmentSpacing)add(ramp.kind==='on'?'ramp.mergeTooClose':'ramp.divergeTooClose','Adjacent attachment spacing requires review',{otherRoadId:a.roadId,actual:a.distance,threshold:context.limits.attachmentSpacing});
  if(ramp.nearestIntersection&&ramp.nearestIntersection.distance<context.limits.rampJunctionDistance&&!context.map.intersections.find(j=>j.id===ramp.nearestIntersection!.id)?.connections.some(c=>c.roadId===ramp.roadId))add('ramp.conflictsWithIntersection','Ramp runs near an unrelated junction',{intersectionId:ramp.nearestIntersection.id,actual:ramp.nearestIntersection.distance,threshold:context.limits.rampJunctionDistance});
  for(const c of ramp.crossings)if(!c.connected&&c.clearance<context.limits.clearance){const other=context.road(c.roadId);if(roadFunction(other)==='frontage')add('ramp.crossesFrontageJunction','Ramp crosses frontage without safe clearance or explicit connection',{otherRoadId:c.roadId,station:c.station,clearance:c.clearance,required:c.requiredClearance});}
  if(ramp.metadata)for(const [end,attachment] of [['start',ramp.metadata.from],['end',ramp.metadata.to]] as const){
    const receiving=context.roads.get(attachment.roadId),point=path[end==='start'?0:path.length-1]!,target=receiving&&context.path(receiving.id)[attachment.end==='start'?0:context.path(receiving.id).length-1]!;
    if(!target||distance(point,target)>.2||Math.abs((point.y??0)-(target.y??0))>.2)add(receiving&&roadFunction(receiving)==='frontage'?'ramp.badFrontageAttachment':'ramp.badMainlineAttachment','Ramp endpoint does not match its explicit XYZ attachment',{attachmentRoadId:attachment.roadId,actual:target?Math.hypot(distance(point,target),(point.y??0)-(target.y??0)):null,threshold:.2});
  }
  return result;
}
export interface AccessWindowQuery { mainline:string;frontage:string;corridorId?:string;direction?:'forward'|'reverse';start?:number;end?:number;minLength?:number;buffer?:number }
export function accessWindows(context:MapAnalysisContext,query:AccessWindowQuery):{[key:string]:unknown;candidateWindows:unknown[];events:unknown[]}{
  if(query.corridorId){
    const corridor=context.map.editing?.corridors.find(c=>c.id===query.corridorId);if(!corridor)throw new Error('Unknown corridor '+query.corridorId);
    const ids=corridor.roadIds.filter(id=>roadFunction(context.road(id))==='expressway'&&(!query.direction||context.road(id).travelDirection==='two-way'||context.road(id).travelDirection===query.direction));
    if(!ids.includes(query.mainline))throw new Error('Mainline is outside requested corridor/direction');
    if(ids.length>1){const segments=ids.map(mainline=>({roadId:mainline,...accessWindows(context,{...query,mainline,corridorId:undefined})}));return {corridorId:query.corridorId,stationReference:'per-road; no artificial concatenation across disconnected segments',segments,events:segments.flatMap(s=>(s.events as unknown[]).map(event=>({roadId:s.roadId,event}))),candidateWindows:segments.flatMap(s=>s.candidateWindows.map(window=>({roadId:s.roadId,window}))),approximate:true,automaticDesign:false};}
  }
  const main=context.road(query.mainline),frontage=context.road(query.frontage),path=context.path(main.id),length=polylineLength(path);
  if(roadFunction(main)!=='expressway'||roadFunction(frontage)!=='frontage')throw new Error('Access windows require expressway mainline and frontage roads');
  if(query.corridorId&&!context.map.editing?.corridors.find(c=>c.id===query.corridorId)?.roadIds.includes(main.id))throw new Error('Mainline is outside requested corridor');
  const start=Math.max(0,query.start??0),end=Math.min(length,query.end??length),buffer=query.buffer??context.limits.interchangeDistance,minLength=query.minLength??80;
  if(!Number.isFinite(buffer)||buffer<0||!Number.isFinite(minLength)||minLength<=0||start>=end)throw new Error('Invalid access-window interval or thresholds');
  if(query.direction&&main.travelDirection!=='two-way'&&main.travelDirection!==query.direction)throw new Error('Requested direction differs from mainline travel direction');
  const events:{station:number;kind:string;id:string;distance:number}[]=[];
  for(const r of context.roadCandidates(bounds(path,buffer)))if(r.id!==main.id&&r.id!==frontage.id){
    if(roadFunction(r)==='ramp')for(const p of [context.path(r.id)[0]!,context.path(r.id).at(-1)!]){const hit=project(path,p);if(hit.distance<=buffer)events.push({station:hit.along,kind:'rampAttachment',id:r.id,distance:hit.distance});}
  }
  for(const c of context.crossings(main.id))events.push({station:c.station,kind:c.clearance>=c.requiredClearance?'gradeSeparatedCrossing':'ordinaryCrossing',id:c.roadId,distance:0});
  for(const j of context.map.intersections){const hit=project(path,j.position);if(hit.distance<=buffer)events.push({station:hit.along,kind:'intersection',id:j.id,distance:hit.distance});}
  const blocks=events.map(e=>({start:Math.max(start,e.station-buffer),end:Math.min(end,e.station+buffer)})).filter(b=>b.end>b.start).sort((a,b)=>a.start-b.start);
  const merged:{start:number;end:number}[]=[];for(const b of blocks){const last=merged.at(-1);if(last&&b.start<=last.end)last.end=Math.max(last.end,b.end);else merged.push({...b});}
  const freeSpans:{start:number;end:number;freeLength:number;nearestInterchangeDistance:number|null;frontageDistance:number;approximate:boolean;reviewRequired:boolean}[]=[];
  let cursor=start;for(const block of [...merged,{start:end,end}]){if(block.start-cursor>=minLength){const point=sampleAt(path,(cursor+block.start)/2).point,interchanges=events.filter(e=>e.kind==='rampAttachment');freeSpans.push({start:cursor,end:block.start,freeLength:block.start-cursor,nearestInterchangeDistance:interchanges.length?Math.min(...interchanges.map(e=>Math.min(Math.abs(e.station-cursor),Math.abs(e.station-block.start)))):null,frontageDistance:project(context.path(frontage.id),point).distance,approximate:true,reviewRequired:true});}cursor=Math.max(cursor,block.end);}
  return {mainline:main.id,frontage:frontage.id,direction:query.direction??main.travelDirection,stationRange:{start,end},thresholds:{buffer,minLength},events,excludedSpans:merged,freeSpans,candidateWindows:freeSpans,structures:[{roadId:main.id,structure:main.structure??null},{roadId:frontage.id,structure:frontage.structure??null}],automaticDesign:false};
}
