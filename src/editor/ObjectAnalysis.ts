import type { CityObject, CityPoint, IntersectionPort } from '../world/city/CityMapData';
import { roadEdges, sampleAt, rotatePoint } from '../world/city/geometry';
import { ROAD_SIGN_POST_Z, signDimensions } from '../world/city/RoadSignTemplates';
import { junctionSurfaceContains } from '../world/city/JunctionSurface';
import { signalApproach } from '../world/city/SignalPlacement';
import { bounds, distance, overlaps, project } from './EditorGeometry';
import { objectSize } from './MapObjectGeometry';
import { angleDelta, issue, MapAnalysisContext, structureType, type MapIssue, type SpatialScope } from './MapAnalysis';
import type { EditorCommand } from './EditorCommands';

export interface EditableObject {
  id:string;kind:'prefab'|'sign'|'trafficLight';type:string;position:CityPoint;rotation:number;
  roadId?:string;intersectionId?:string;approach?:IntersectionPort;derived:boolean;
  size:{width:number;depth:number;height:number;trunkRadius?:number;canopyRadius?:number;approximate:boolean};
}
// Conservative authoring bounds from the existing prefab kit, not collision meshes.
export const isBuilding=(type:string):boolean=>['residential_low','residential_mid','office','commercial','industrial','school','garage','stadium'].includes(type);
export function prefabRecord(o:CityObject):EditableObject {
  return {id:o.id,kind:'prefab',type:o.prefabId,position:o.position,rotation:o.rotation,derived:false,size:objectSize(o)};
}
const objectCaches=new WeakMap<MapAnalysisContext,EditableObject[]>();
const objectMaps=new WeakMap<MapAnalysisContext,Map<string,EditableObject>>();
export function editableObjects(context:MapAnalysisContext):EditableObject[]{
  const cached=objectCaches.get(context);if(cached)return cached;
  const records=context.map.objects.map(prefabRecord);
  for(const s of context.map.signs??[])records.push({id:s.id,kind:'sign',type:'roadSign',position:s.position,rotation:s.heading,roadId:s.roadId,derived:false,size:{width:.5,depth:.5,height:s.mountHeight??5.5,approximate:true}});
  for(const j of context.map.intersections)if(j.signalized)for(const c of j.connections){
    try{const signal=signalApproach(context.map,j,c.port);if(!signal.incoming)continue;records.push({id:`signal:${j.id}:${c.port}`,kind:'trafficLight',type:'trafficLight',position:signal.position,rotation:signal.heading,roadId:c.roadId,intersectionId:j.id,approach:c.port,derived:signal.derived,size:{width:.3,depth:.3,height:signal.height,approximate:true}});}catch{/* An impossible generated pole is reported by inspect/diagnose, not fabricated. */}
  }
  for(const o of records)if(o.kind==='trafficLight')context.spatial.set('object:'+o.id,bounds([o.position],1));
  objectCaches.set(context,records);objectMaps.set(context,new Map(records.map(o=>[o.id,o])));return records;
}
export function objectRecord(context:MapAnalysisContext,id:string):EditableObject {editableObjects(context);const record=objectMaps.get(context)!.get(id);if(!record)throw new Error('Unknown editable object '+id);return record;}
export function nearbyObjects(context:MapAnalysisContext,area:import('./EditorCommands').EditorArea):EditableObject[]{editableObjects(context);return context.spatial.query(area).filter(id=>id.startsWith('object:')).flatMap(id=>{const o=objectMaps.get(context)!.get(id.slice(7));return o?[o]:[];});}
export function deriveAnchor(context:MapAnalysisContext,object:EditableObject,roadId?:string){
  const candidates=context.nearRoads(object.position,100),explicit=roadId??object.roadId;
  const nearest=explicit?{road:context.road(explicit),...project(context.path(explicit),object.position)}:candidates.sort((a,b)=>(a.distance+Math.abs((a.point.y??0)-(object.position.y??0))*2)-(b.distance+Math.abs((b.point.y??0)-(object.position.y??0))*2))[0];
  if(!nearest)return null;
  const lateral=(object.position.x-nearest.point.x)*-nearest.tangent.z+(object.position.z-nearest.point.z)*nearest.tangent.x;
  const sign=context.map.signs?.find(s=>s.id===object.id),reverse=sign?.laneDirection==='reverse'||object.kind==='trafficLight'&&context.junctions.get(object.intersectionId!)?.connections.find(c=>c.port===object.approach)?.end==='start';
  const heading=Math.atan2(-nearest.tangent.x,-nearest.tangent.z)+(reverse?Math.PI:0);
  return {anchorRoadId:nearest.road.id,anchorIntersectionId:object.intersectionId??null,approach:object.approach??null,station:nearest.along,lateralOffset:lateral,verticalOffset:(object.position.y??0)-(nearest.point.y??0),facingDirection:reverse?'reverse':'forward',expectedHeading:heading,structureType:structureType(nearest.road),derived:true};
}
export function inspectObject(context:MapAnalysisContext,id:string){
  const object=objectRecord(context,id),anchor=deriveAnchor(context,object),roads=context.nearRoads(object.position,80);
  const nearestIntersection=context.map.intersections.map(j=>({id:j.id,distance:distance(j.position,object.position)})).sort((a,b)=>a.distance-b.distance)[0]??null;
  const road=anchor&&context.road(anchor.anchorRoadId),nearestLane=road?{roadId:road.id,index:Math.max(0,Math.min(road.laneCount-1,Math.floor((anchor.lateralOffset+road.laneCount*road.laneWidth/2)/road.laneWidth))),approximate:true}:null;
  let signal:ReturnType<typeof signalApproach>|null=null;
  if(object.kind==='trafficLight')signal=signalApproach(context.map,context.map.intersections.find(j=>j.id===object.intersectionId)!,object.approach!);
  return {...object,anchor,distanceToRoad:roads[0]?.distance??null,nearestLane,nearestIntersection,structureContext:roads.map(r=>({roadId:r.road.id,type:structureType(r.road),deckY:r.point.y??0,verticalOffset:(object.position.y??0)-(r.point.y??0)})),signal,visibility:{approximate:true,reviewRequired:true,reason:'Envelope obstruction checks do not implement a renderer visibility test'},issues:objectIssues(context,object)};
}
export function queryObjects(context:MapAnalysisContext,scope:SpatialScope={}){
  const area=context.scopeArea(scope),road=scope.roadId?context.road(scope.roadId):undefined,corridor=scope.corridorId?context.map.editing?.corridors.find(c=>c.id===scope.corridorId):undefined;
  if(!area&&!scope.full&&!scope.type&&!corridor)throw new Error('Object query requires a local scope, type or explicit full:true');
  const spatialIds=area?new Set(context.spatial.query(area).filter(id=>id.startsWith('object:')).map(id=>id.slice(7))):null;
  const rows=editableObjects(context).filter(o=>(!spatialIds||spatialIds.has(o.id)||o.kind==='trafficLight'&&o.position.x>=area!.minX&&o.position.x<=area!.maxX&&o.position.z>=area!.minZ&&o.position.z<=area!.maxZ)&&(!scope.objectId||o.id===scope.objectId)&&(!scope.type||o.type===scope.type||scope.type==='streetlight'&&o.type.startsWith('streetlight'))&&(!scope.district||context.map.objects.find(p=>p.id===o.id)?.district===scope.district)&&(!road||project(context.path(road.id),o.position).distance<=(scope.radius??30))&&(!corridor||corridor.roadIds.some(id=>project(context.path(id),o.position).distance<=(scope.radius??30)))&&(!scope.center||distance(scope.center,o.position)<=(scope.radius??100)));
  const offset=scope.offset??0,limit=scope.limit??100;if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>10000)throw new Error('Object pagination requires offset>=0 and limit 1..10000');
  const exact=area?rows.filter(o=>overlaps(bounds([o.position],Math.hypot(o.size.width,o.size.depth)/2),area)):rows;
  return {objects:exact.slice(offset,offset+limit).map(o=>({...o,anchor:deriveAnchor(context,o)})),pagination:{offset,limit,total:exact.length,nextOffset:offset+limit<exact.length?offset+limit:null}};
}
/** Shared legality core: existing diagnostics and brush candidates call this function. */
export function objectIssues(context:MapAnalysisContext,object:EditableObject):MapIssue[]{
  const result:MapIssue[]=[],entity={objectId:object.id,...(object.roadId?{roadId:object.roadId}:{}),...(object.intersectionId?{intersectionId:object.intersectionId}:{})};
  const prefix=object.kind==='trafficLight'?'trafficLight':object.kind==='sign'?'roadSign':object.type.startsWith('streetlight')?'streetlight':object.type==='tree'?'tree':isBuilding(object.type)?'building':'object';
  const radius=object.size.trunkRadius??Math.hypot(object.size.width,object.size.depth)/2,y=object.position.y??0,top=y+object.size.height;
  const add=(code:string,message:string,metrics:MapIssue['metrics']={},extra:Partial<MapIssue>={})=>result.push(issue(code,entity,message,metrics,{approximate:true,...extra}));
  const nearby=context.nearRoads(object.position,radius+context.limits.objectRoadside+30);
  const authoredSign=object.kind==='sign'?context.map.signs?.find(s=>s.id===object.id):undefined;
  const sign=authoredSign?{...authoredSign,position:object.position,heading:object.rotation}:undefined;
  const signShape=sign&&signDimensions(sign.template,sign.size,sign.postOffset,sign.gantryPosts,sign.mountHeight);
  for(const hit of nearby){
    const nx=-hit.tangent.z,nz=hit.tangent.x,c=Math.cos(object.rotation),s=Math.sin(object.rotation);
    const radius=object.size.trunkRadius??(Math.abs(nx*c-nz*s)*object.size.width+Math.abs(nx*s+nz*c)*object.size.depth)/2;
    const alongRadius=object.size.trunkRadius??(Math.abs(hit.tangent.x*c-hit.tangent.z*s)*object.size.width+Math.abs(hit.tangent.x*s+hit.tangent.z*c)*object.size.depth)/2;
    const road=hit.road,floor=hit.point.y??0,edges=roadEdges(road),half=road.laneCount*road.laneWidth/2,lateral=(object.position.x-hit.point.x)*-hit.tangent.z+(object.position.z-hit.point.z)*hit.tangent.x;
    // A capped projection must not turn the road's endpoint into an infinite lane.
    const overrun=Math.abs((object.position.x-hit.point.x)*hit.tangent.x+(object.position.z-hit.point.z)*hit.tangent.z);
    if(overrun>alongRadius+.3)continue;
    if(sign&&signShape){
      const at=(x:number,z=0)=>{const p=rotatePoint({x,z},sign.heading);return {x:sign.position.x+p.x,z:sign.position.z+p.z};};
      let poleConflict=false,deckConflict=false;
      for(const x of signShape.posts){
        const p=at(x,ROAD_SIGN_POST_Z),q=project(context.path(road.id),p),dy=q.point.y??0;
        const side=(p.x-q.point.x)*-q.tangent.z+(p.z-q.point.z)*q.tangent.x;
        const beyond=Math.abs((p.x-q.point.x)*q.tangent.x+(p.z-q.point.z)*q.tangent.z);
        if(beyond>.5)continue;
        if(Math.abs(side)<half+.2&&(sign.postBaseY??y)<=dy+.3&&y+signShape.poleTop>=dy-.3)poleConflict=true;
        if(side>=edges.left-.2&&side<=edges.right+.2&&(sign.postBaseY??y)<dy-.65&&y+signShape.poleTop>dy-.65)deckConflict=true;
      }
      for(let x=-signShape.width/2;x<=signShape.width/2+.01;x+=Math.min(1,signShape.width/2)){
        const p=at(x),q=project(context.path(road.id),p),dy=q.point.y??0;
        if(q.distance<Math.max(-edges.left,edges.right)&&y+signShape.bottom<dy+.1&&y+signShape.bottom+signShape.height>dy-.65)deckConflict=true;
        if(q.distance<half+.1&&y+signShape.bottom<dy+4.5&&y+signShape.bottom+signShape.height>dy)poleConflict=true;
      }
      if(poleConflict)add('roadSign.insideLane','Sign support intersects carriageway',{roadId:road.id});
      if(deckConflict)add('roadSign.intersectsStructure','Sign support/board crosses a road deck',{roadId:road.id,deckY:floor},{reviewRequired:true});
      continue;
    }
    const intersectsFloor=y<=floor+.4&&top>=floor-context.limits.deckThickness,insidePaved=lateral>=edges.left-radius&&lateral<=edges.right+radius;
    if(intersectsFloor&&Math.abs(lateral)<half+radius){
      const code=isBuilding(object.type)?'building.'+(road.roadClass==='ramp'?'intersectsRamp':'intersectsRoad'):prefix+'.'+(prefix==='trafficLight'?'insideCarriageway':'insideLane');
      add(code,'Object envelope intersects carriageway',{roadId:road.id,distance:hit.distance,roadHalfWidth:half,objectRadius:radius},{repair:{op:'reanchorObject',id:object.id,roadId:road.id,strategy:'moveOutsideCarriageway'}});
    }
    if(insidePaved&&y<floor-context.limits.deckThickness&&top>floor-context.limits.deckThickness){add('object.intersectsRoadStructure','Object crosses elevated deck envelope',{roadId:road.id,deckY:floor,objectTop:top});if(prefix==='roadSign'||prefix==='building')add(prefix+'.intersectsStructure','Object intersects an elevated deck envelope',{roadId:road.id,deckY:floor},{reviewRequired:true});}
    const enclosure=road.structure?.enclosure;
    if(enclosure&&insidePaved&&top>floor&&y<floor+enclosure.clearance){
      if(enclosure.kind!=='cutting'&&(object.type==='tree'||object.type.startsWith('streetlight')))add('structure.surfaceObjectInsideTunnel','Surface vegetation or ordinary pole occupies a covered tunnel',{roadId:road.id,floor,ceiling:floor+enclosure.clearance});
      if(enclosure.kind!=='cutting'&&top>floor+enclosure.clearance)add('object.intersectsRoadStructure','Object crosses tunnel ceiling',{roadId:road.id,objectTop:top,ceiling:floor+enclosure.clearance});
    }
    if(road.structure?.barrierEnabled&&Math.min(Math.abs(lateral-edges.left),Math.abs(lateral-edges.right))<radius+.3&&y<floor+1.1&&top>floor)add('object.intersectsBarrier','Object intersects roadside barrier envelope',{roadId:road.id,lateralOffset:lateral});
    if(object.size.canopyRadius&&intersectsFloor&&hit.distance<half+object.size.canopyRadius&&hit.distance>=half+radius)add('tree.canopyNearRoad','Canopy extends toward carriageway; trunk is clear',{roadId:road.id,canopyRadius:object.size.canopyRadius},{severity:'info',reviewRequired:true});
  }
  const junctionCandidates=new Set(context.spatial.query(bounds([object.position],radius+4)).filter(id=>id.startsWith('junction:')).map(id=>id.slice(9)));
  for(const id of junctionCandidates){const j=context.junctions.get(id)!;if(y<=(j.position.y??0)+.4&&top>=(j.position.y??0)-.3){if(junctionSurfaceContains(j,context.map,object.position,radius))add(prefix==='trafficLight'?'trafficLight.insideJunctionConflict':isBuilding(object.type)?'building.intersectsJunction':prefix+'.insideJunction','Object envelope intersects junction pavement',{intersectionId:j.id});else if(prefix==='roadSign'&&junctionSurfaceContains(j,context.map,object.position,radius+4))add('roadSign.tooCloseToJunction','Sign is immediately beside the junction conflict envelope',{intersectionId:j.id});}}
  const anchor=deriveAnchor(context,object);
  if((object.kind==='sign'||object.kind==='trafficLight')&&!anchor)add(prefix+'.unanchored','No road/approach anchor within query radius');
  if(anchor&&(object.kind==='sign'||object.kind==='trafficLight')){
    const expected=object.kind==='trafficLight'?signalApproach(context.map,context.map.intersections.find(j=>j.id===object.intersectionId)!,object.approach!).expectedHeading:anchor.expectedHeading;
    const delta=Math.abs(angleDelta(object.rotation,expected));if(delta>context.limits.facingTolerance)add(prefix+'.wrongFacing','Facing differs from incoming road tangent',{actual:object.rotation,expected,delta},{repair:{op:'reanchorObject',id:object.id,strategy:'fixFacing'}});
    if(object.kind==='sign'&&sign?.type!=='CHEVRON'&&!['gantry','highway-gantry','ceiling'].includes(sign?.template??'')&&(anchor.lateralOffset<0&&anchor.facingDirection==='forward'||anchor.lateralOffset>0&&anchor.facingDirection==='reverse'))add('roadSign.wrongSide','Sign is on the opposite side of its served travel direction',{lateralOffset:anchor.lateralOffset});
    if(object.kind==='trafficLight'){
      const signal=signalApproach(context.map,context.map.intersections.find(j=>j.id===object.intersectionId)!,object.approach!);
      const side=(object.position.x-signal.mouth.x)*signal.right.x+(object.position.z-signal.mouth.z)*signal.right.z;
      if(side<signal.roadWidth/2)add('trafficLight.wrongSide','Signal pole is not outside the incoming approach right edge',{lateralOffset:side,required:signal.roadWidth/2});
      if(side>=signal.roadWidth/2&&side<signal.roadWidth/2+.75)add('trafficLight.tooCloseToLane','Signal pole has inadequate lane-edge clearance',{actual:side-signal.roadWidth/2,required:.75});
    }
    const served=context.road(anchor.anchorRoadId),path=context.path(served.id),reverse=anchor.facingDirection==='reverse',viewer=sampleAt(path,Math.max(0,anchor.station+(reverse?30:-30))).point;
    let blockedBy:string|undefined;
    for(let i=1;i<12&&!blockedBy;i++){
      const t=i/12,p={x:viewer.x+(object.position.x-viewer.x)*t,y:(viewer.y??0)+1.2+((object.position.y??0)+object.size.height-(viewer.y??0)-1.2)*t,z:viewer.z+(object.position.z-viewer.z)*t};
      for(const hit of context.nearRoads(p,30))if(hit.road.id!==served.id&&hit.distance<hit.road.laneCount*hit.road.laneWidth/2&&Math.abs((hit.point.y??0)-(p.y??0))<context.limits.deckThickness)blockedBy=hit.road.id;
    }
    if(blockedBy)add(prefix==='trafficLight'?'trafficLight.occludedByStructure':'roadSign.occluded','Approximate incoming sight ray intersects another deck',{roadId:blockedBy},{reviewRequired:true});
  }
  return result;
}
export type ObjectRepairStrategy='reanchorRoadside'|'reanchorToApproach'|'moveOppositeSide'|'fixFacing'|'moveToRoadside'|'moveOutsideCarriageway'|'moveOutward';
export function reanchorCommands(context:MapAnalysisContext,id:string,options:{roadId?:string;station?:number;lateralOffset?:number;verticalOffset?:number;strategy?:ObjectRepairStrategy}={}):EditorCommand[]{
  const object=objectRecord(context,id),anchor=deriveAnchor(context,object,options.roadId);if(!anchor)throw new Error('Cannot derive road anchor for '+id);
  const road=context.road(anchor.anchorRoadId),s=sampleAt(context.path(road.id),options.station??anchor.station),radius=object.size.trunkRadius??Math.hypot(object.size.width,object.size.depth)/2;
  const edges=roadEdges(road),sign=object.kind==='sign'?(anchor.facingDirection==='reverse'?-1:1):anchor.lateralOffset<0?-1:1,offset=options.lateralOffset??(sign<0?edges.left-radius-context.limits.objectRoadside:edges.right+radius+context.limits.objectRoadside);
  const position={x:s.point.x-s.tangent.z*offset,y:(s.point.y??0)+(options.verticalOffset??0),z:s.point.z+s.tangent.x*offset},heading=anchor.expectedHeading;
  if(object.kind==='trafficLight'){
    const j=context.map.intersections.find(j=>j.id===object.intersectionId)!,signal=signalApproach(context.map,j,object.approach!);
    return [{op:'setSignalPlacement',intersectionId:j.id,approach:object.approach!,position:options.strategy==='fixFacing'?object.position:signal.expectedPosition,heading:signal.expectedHeading}];
  }
  if(object.kind==='sign')return [{op:'modifySign',id,properties:{position:options.strategy==='fixFacing'?object.position:position,heading,roadId:road.id,stationMetres:options.station??anchor.station}}];
  return [{op:'modifyObject',id,properties:{position:options.strategy==='fixFacing'?object.position:position,rotation:heading}}];
}
