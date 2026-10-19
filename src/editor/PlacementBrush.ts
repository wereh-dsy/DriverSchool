import type { CityObject, CityPoint, IntersectionPort, PrefabId } from '../world/city/CityMapData';
import { PREFAB_IDS } from '../world/city/CityMapData';
import { polylineLength, roadEdges, sampleAt } from '../world/city/geometry';
import { regionalTerrainSampler } from '../world/regional/RegionalTerrain';
import { signalApproach } from '../world/city/SignalPlacement';
import { bounds, distance, project } from './EditorGeometry';
import type { EditorCommand, EditorArea } from './EditorCommands';
import { MapAnalysisContext, structureType, type MapIssue } from './MapAnalysis';
import { deriveAnchor, editableObjects, nearbyObjects, objectIssues, prefabRecord, queryObjects, reanchorCommands, type EditableObject } from './ObjectAnalysis';

export type HeightMode='GROUND'|'ROAD_SURFACE'|'ROAD_DECK'|'SIDEWALK'|'STRUCTURE_DECK'|'ABSOLUTE'|'RELATIVE';
export type OrientationMode='ROAD_FORWARD'|'ROAD_BACKWARD'|'FACE_TRAFFIC'|'FACE_ROAD'|'FACE_INTERSECTION'|'NORMAL_TO_ROAD'|'ABSOLUTE';
export interface PlacementBrushRequest {
  mode:'SINGLE'|'LINE'|'RANGE'|'AREA'|'REPLACE'|'REPAIR';type:PrefabId|'roadSign'|'trafficLight';
  roadId?:string;intersectionId?:string;approaches?:IntersectionPort[];bbox?:EditorArea;polygon?:CityPoint[];
  stationStart?:number;stationEnd?:number;spacing?:number;density?:number;side?:'left'|'right'|'both';
  lateralOffset?:number;longitudinalOffset?:number;heightMode?:HeightMode;height?:number;heightOffset?:number;
  orientation?:OrientationMode;yaw?:number;pitch?:number;roll?:number;scale?:number|{x:number;y:number;z:number};
  randomPositionJitter?:number;randomRotationJitter?:number;randomScaleJitter?:number;seed?:number;
  minDistanceToIntersection?:number;minDistanceToRamp?:number;minDistanceToObject?:number;avoidTypes?:string[];
  autoAdjust?:'STRICT'|'SKIP'|'ADJUST';maxAutoMove?:number;snapMode?:'roadside'|'none';
  arrangement?:'ALIGNED'|'STAGGERED';signalSide?:'near-side'|'opposite-side';limit?:number;
  objectIds?:string[];nameId?:string;direction?:'forward'|'reverse';poleHeight?:number;
}
export interface BrushCandidate {
  id:string;state:'VALID'|'ADJUSTED'|'INVALID';position:CityPoint;rotation:number;
  anchor:ReturnType<typeof deriveAnchor>;issues:MapIssue[];adjustmentReasons:string[];commands:EditorCommand[];
  sourceId?:string;heightMode:HeightMode;autoMove:number;
}
export interface BrushPlan {request:PlacementBrushRequest;candidates:BrushCandidate[];operations:EditorCommand[];stats:{planned:number;valid:number;adjusted:number;invalid:number;skipped:number;added:number;moved:number;removed:number};valid:boolean}
function randomSource(seed:number){let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
function insidePolygon(p:CityPoint,polygon:CityPoint[]):boolean {let inside=false;for(let i=0,k=polygon.length-1;i<polygon.length;k=i++){const a=polygon[i]!,b=polygon[k]!;if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;}return inside;}
export function brushPosition(context:MapAnalysisContext,request:PlacementBrushRequest,station:number,side:number,random:()=>number=()=>.5){
  if(!request.roadId)throw new Error('Road-semantic placement requires roadId');
  const road=context.road(request.roadId),path=context.path(road.id),edges=roadEdges(road),jitter=request.randomPositionJitter??0;
  let s=sampleAt(path,station);
  const offset=side*((side<0?-edges.left:edges.right)+(request.lateralOffset??2));
  let position:CityPoint={x:s.point.x-s.tangent.z*offset+(random()-.5)*2*jitter,y:s.point.y??0,z:s.point.z+s.tangent.x*offset+(random()-.5)*2*jitter};
  if(request.snapMode==='roadside'){const hit=project(path,position);s={point:hit.point,tangent:hit.tangent};position={x:hit.point.x-hit.tangent.z*offset,y:hit.point.y,z:hit.point.z+hit.tangent.x*offset};}
  const mode=request.heightMode??(request.type==='tree'?'GROUND':'ROAD_SURFACE');
  const ground=context.map.regional?regionalTerrainSampler(context.map).heightAt(position.x,position.z):0;
  let y=mode==='GROUND'?ground:mode==='ABSOLUTE'?request.height:mode==='SIDEWALK'?(s.point.y??0)+.15:s.point.y??0;
  if(y===undefined||!Number.isFinite(y))throw new Error('ABSOLUTE height mode requires finite height');
  if(mode==='STRUCTURE_DECK'&&structureType(road)==='at_grade')throw new Error('STRUCTURE_DECK requires a structured road');
  position={...position,y:y+(request.heightOffset??0)};
  const heading=Math.atan2(-s.tangent.x,-s.tangent.z),orientation=request.orientation??(request.type==='roadSign'||request.type==='trafficLight'?'FACE_TRAFFIC':'ROAD_FORWARD');
  let yaw=heading;
  if(orientation==='ROAD_BACKWARD'||orientation==='FACE_TRAFFIC'&&request.direction==='reverse')yaw+=Math.PI;
  if(orientation==='FACE_ROAD'||orientation==='NORMAL_TO_ROAD')yaw=Math.atan2(s.point.x-position.x,-(s.point.z-position.z));
  if(orientation==='FACE_INTERSECTION'){
    const j=context.map.intersections.find(j=>j.id===request.intersectionId);if(!j)throw new Error('FACE_INTERSECTION requires intersectionId');yaw=Math.atan2(j.position.x-position.x,-(j.position.z-position.z));
  }
  if(orientation==='ABSOLUTE')yaw=request.yaw??0;else yaw+=request.yaw??0;
  yaw+=(random()-.5)*2*(request.randomRotationJitter??0);
  return {position,rotation:yaw,heightMode:mode};
}
/** Shared legality extension for candidates and existing-object repair. */
export function placementIssues(context:MapAnalysisContext,object:EditableObject,request:Partial<PlacementBrushRequest>={},planned:EditableObject[]=[],ignoredObjectIds:ReadonlySet<string>=new Set()):MapIssue[]{
  const issues=objectIssues(context,object),anchor=deriveAnchor(context,object),radius=object.size.trunkRadius??Math.hypot(object.size.width,object.size.depth)/2;
  const add=(code:string,message:string,metrics:MapIssue['metrics']={})=>issues.push({id:code+':'+object.id,code,severity:'warning',objectId:object.id,message,metrics,approximate:true});
  const y=object.position.y??0;
  if(request.minDistanceToIntersection!==undefined){
    const ids=context.spatial.query(bounds([object.position],request.minDistanceToIntersection));
    for(const key of ids)if(key.startsWith('junction:')){const j=context.map.intersections.find(j=>j.id===key.slice(9))!;if(j.id!==object.intersectionId&&distance(j.position,object.position)<request.minDistanceToIntersection&&Math.abs((j.position.y??0)-y)<3)add('object.intersectionExclusion','Object is within intersection exclusion radius',{intersectionId:j.id,distance:distance(j.position,object.position)});}
  }
  if(request.minDistanceToRamp)for(const r of context.nearRoads(object.position,request.minDistanceToRamp))if(r.road.roadClass==='ramp'&&Math.abs((r.point.y??0)-y)<3)add('object.rampExclusion','Object is within ramp exclusion radius',{roadId:r.road.id,distance:r.distance});
  for(const other of [...nearbyObjects(context,bounds([object.position],radius+Math.max(request.minDistanceToObject??2,object.type.startsWith('streetlight')?context.limits.streetlightSpacing:object.size.canopyRadius??0))).filter(o=>!ignoredObjectIds.has(o.id)),...planned])if(other.id!==object.id&&Math.abs((other.position.y??0)-y)<Math.max(object.size.height,other.size.height)){
    const gap=distance(object.position,other.position),required=Math.max(request.minDistanceToObject??1,radius+(other.size.trunkRadius??Math.hypot(other.size.width,other.size.depth)/2));
    if(object.size.height>.1&&other.size.height>.1&&gap<required)add('object.tooCloseToObject','Object envelopes overlap or violate spacing',{otherObjectId:other.id,actual:gap,required});
    if(object.type.startsWith('streetlight')&&other.type.startsWith('streetlight')&&gap<context.limits.streetlightSpacing)add('streetlight.tooDense','Streetlight spacing is below review threshold',{otherObjectId:other.id,actual:gap,threshold:context.limits.streetlightSpacing});
    if(object.size.canopyRadius&&(other.kind==='sign'||other.kind==='trafficLight')&&gap<object.size.canopyRadius+1)add('tree.canopyOccludesSign','Canopy may obscure a sign/signal envelope',{otherObjectId:other.id,actual:gap,canopyRadius:object.size.canopyRadius});
    if(request.avoidTypes?.includes(other.type)&&gap<Math.max(5,required))add('object.avoidType','Placement is near an excluded object type',{otherObjectId:other.id,type:other.type});
  }
  if(anchor){
    const road=context.road(anchor.anchorRoadId),mode=request.heightMode??(object.kind==='prefab'&&!['streetlight','streetlight_dual','streetlight_highway','streetlight_small','guardrail','noise_barrier','traffic_sign','guide_sign','parked_car','bus_stop'].includes(object.type)?'GROUND':'ROAD_SURFACE');
    const ground=context.map.regional?regionalTerrainSampler(context.map).heightAt(object.position.x,object.position.z):0;
    const expected=mode==='GROUND'?ground:mode==='ABSOLUTE'?request.height??y:sampleAt(context.path(road.id),anchor.station).point.y??0;
    const target=expected+(request.heightOffset??0)+(mode==='SIDEWALK'?.15:0),delta=y-target;
    if(mode!=='ABSOLUTE'&&Math.abs(delta)>.75)add(delta>0?'object.floating':'object.buried','Base differs from selected support surface',{actual:y,expected:target,delta});
    if(object.kind==='prefab'&&structureType(road)==='elevated'&&mode!=='GROUND'&&mode!=='ABSOLUTE'){
      const edges=roadEdges(road),sidewalk=road.sidewalk?.enabled?road.sidewalk.width:0;
      if(anchor.lateralOffset<edges.left-sidewalk||anchor.lateralOffset>edges.right+sidewalk)add('object.unsupportedOnDeck','Road-level placement lies outside the available deck/sidewalk envelope',{roadId:road.id,lateralOffset:anchor.lateralOffset});
      if(object.type==='tree')add('tree.onBridgeDeck','Vegetation brush must avoid elevated road decks',{roadId:road.id});
    }
    if(road.structure?.enclosure&&mode!=='GROUND'&&mode!=='ABSOLUTE'){
      const edges=roadEdges(road),sidewalk=road.sidewalk?.enabled?road.sidewalk.width:0;
      if((anchor.lateralOffset<edges.left-sidewalk||anchor.lateralOffset>edges.right+sidewalk)&&y<ground-.5)add('object.wrongStructureLevel','Underground placement lies outside the supported floor envelope',{roadId:road.id,groundElevation:ground,actual:y});
    }
  }
  return issues;
}
export function planBrush(context:MapAnalysisContext,request:PlacementBrushRequest):BrushPlan {
  const modes=['SINGLE','LINE','RANGE','AREA','REPLACE','REPAIR'];if(!modes.includes(request.mode))throw new Error('Unknown brush mode');
  if(request.pitch||request.roll)throw new Error('Existing map objects support yaw only; pitch and roll must be zero');
  if((request.randomPositionJitter||request.randomRotationJitter||request.randomScaleJitter)&&!Number.isInteger(request.seed))throw new Error('Randomized brushes require an integer seed');
  const random=randomSource(request.seed??0),policy=request.autoAdjust??(request.mode==='REPAIR'?'ADJUST':'SKIP'),maxMove=request.maxAutoMove??5,limit=request.limit??500;
  for(const key of ['spacing','density','stationStart','stationEnd','lateralOffset','longitudinalOffset','height','heightOffset','yaw','randomPositionJitter','randomRotationJitter','randomScaleJitter','minDistanceToIntersection','minDistanceToRamp','minDistanceToObject'] as const)if(request[key]!==undefined&&!Number.isFinite(request[key]))throw new Error('Brush '+key+' must be finite');
  if(!['STRICT','SKIP','ADJUST'].includes(policy))throw new Error('Unknown autoAdjust policy');
  if(!['left','right','both'].includes(request.side??'right'))throw new Error('Unknown brush side');
  if(request.heightMode&&!['GROUND','ROAD_SURFACE','ROAD_DECK','SIDEWALK','STRUCTURE_DECK','ABSOLUTE','RELATIVE'].includes(request.heightMode))throw new Error('Unknown height mode');
  if(request.orientation&&!['ROAD_FORWARD','ROAD_BACKWARD','FACE_TRAFFIC','FACE_ROAD','FACE_INTERSECTION','NORMAL_TO_ROAD','ABSOLUTE'].includes(request.orientation))throw new Error('Unknown orientation mode');
  if(request.arrangement&&!['ALIGNED','STAGGERED'].includes(request.arrangement))throw new Error('Unknown brush arrangement');
  if(!Number.isFinite(maxMove)||maxMove<0||!Number.isInteger(limit)||limit<1||limit>5000)throw new Error('Brush maxAutoMove must be nonnegative; limit must be 1..5000');
  if(!PREFAB_IDS.includes(request.type as PrefabId)&&!['roadSign','trafficLight'].includes(request.type))throw new Error('Unknown brush object type');
  if(request.type==='roadSign'&&(request.mode==='AREA'||request.randomPositionJitter||request.randomRotationJitter))throw new Error('Directional signs require explicit road stations and deterministic facing');
  if(request.type==='trafficLight'&&(!request.intersectionId||!['SINGLE','REPLACE','REPAIR'].includes(request.mode)||request.randomPositionJitter||request.randomRotationJitter))throw new Error('Traffic light placement requires an intersection and semantic SINGLE/REPLACE/REPAIR mode');
  const candidates:BrushCandidate[]=[],planned:EditableObject[]=[],operations:EditorCommand[]=[],ignored=new Set<string>(),used=new Set([...editableObjects(context).map(o=>o.id),...context.map.roads.map(r=>r.id),...context.map.intersections.map(j=>j.id)]);
  const nextId=()=>{let n=candidates.length+1,id=`brush:${request.type}:${request.roadId??'area'}:${n}`;while(used.has(id))id=`brush:${request.type}:${request.roadId??'area'}:${++n}`;used.add(id);return id;};
  const handle=(record:EditableObject,commands:EditorCommand[],sourceId?:string,sourcePosition?:CityPoint)=>{
    const original={...sourcePosition??record.position};let checks=placementIssues(context,record,request,planned,ignored),reasons:string[]=[];
    if(sourcePosition&&request.mode==='REPAIR'&&Math.hypot(distance(original,record.position),(original.y??0)-(record.position.y??0))>maxMove)checks.push({id:'object.autoMoveExceeded:'+record.id,code:'object.autoMoveExceeded',severity:'warning',objectId:record.id,message:'Repair exceeds maxAutoMove',metrics:{maxAutoMove:maxMove}});
    const errors=()=>checks.filter(i=>i.severity!=='info');
    const adjustmentRoadId=request.roadId??deriveAnchor(context,record)?.anchorRoadId;
    if(errors().length&&policy==='ADJUST'&&adjustmentRoadId){
      const anchor=deriveAnchor(context,record,adjustmentRoadId)!;
      const transforms=[...[1,2,3,5].map(lateral=>({lateral,stationDelta:0})),...[-2,2,-5,5].map(stationDelta=>({lateral:2,stationDelta})),{lateral:0,stationDelta:0}];
      for(const transform of transforms){
        const {lateral,stationDelta}=transform;if(Math.abs(stationDelta)>maxMove)continue;
        const side=anchor.lateralOffset<0?-1:1,road=context.road(adjustmentRoadId),edges=roadEdges(road),offset=(side<0?edges.left:edges.right)+side*((record.size.trunkRadius??.5)+lateral);
        const at=sampleAt(context.path(road.id),Math.max(0,Math.min(polylineLength(context.path(road.id)),anchor.station+stationDelta)));
        const target=brushPosition(context,{...request,roadId:adjustmentRoadId,randomPositionJitter:0,randomRotationJitter:0},anchor.station+stationDelta,side);
        const moved=lateral===0&&stationDelta===0?{...record.position,y:target.position.y}:{x:at.point.x-at.tangent.z*offset,y:target.position.y,z:at.point.z+at.tangent.x*offset},travel=Math.hypot(distance(original,moved),(original.y??0)-(moved.y??0));
        if(travel>maxMove)continue;
        const adjusted={...record,position:moved,rotation:record.kind==='sign'?anchor.expectedHeading:record.rotation},next=placementIssues(context,adjusted,request,planned,ignored);
        if(!next.some(i=>i.severity!=='info')){record=adjusted;checks=next;reasons=['Adjusted roadside/station/support height/facing within maxAutoMove'];break;}
      }
    }
    const invalid=checks.some(i=>i.severity!=='info'),state=invalid?'INVALID':reasons.length?'ADJUSTED':'VALID';
    const signBase=context.map.signs?.find(s=>s.id===record.id)?.postBaseY;
    const finalCommands=commands.map(c=>c.op==='placeObject'?{...c,properties:{...c.properties,position:record.position,rotation:record.rotation}}:c.op==='modifyObject'?{...c,properties:{...c.properties,position:record.position,rotation:record.rotation}}:c.op==='createSign'||c.op==='modifySign'?{...c,properties:{...c.properties,position:record.position,heading:record.rotation,...(signBase===undefined?{}:{postBaseY:Math.min(signBase,record.position.y??0)})}}:c.op==='setSignalPlacement'?{...c,position:record.position,heading:record.rotation}:c);
    candidates.push({id:record.id,state,position:record.position,rotation:record.rotation,anchor:deriveAnchor(context,record,request.roadId),issues:checks,adjustmentReasons:reasons,commands:finalCommands,sourceId,heightMode:request.heightMode??(request.type==='tree'?'GROUND':'ROAD_SURFACE'),autoMove:Math.hypot(distance(original,record.position),(original.y??0)-(record.position.y??0))});
    if(!invalid){operations.push(...finalCommands);planned.push(record);}
  };
  if(request.mode==='REPAIR'||request.mode==='REPLACE'){
    if(!request.roadId&&!request.bbox&&!request.intersectionId&&!request.objectIds?.length)throw new Error('REPAIR/REPLACE require explicit local scope or objectIds');
    const rows=queryObjects(context,{roadId:request.roadId,intersectionId:request.intersectionId,bbox:request.bbox,type:request.type,full:!request.roadId&&!request.intersectionId&&!request.bbox,limit:5000}).objects.filter(o=>!request.objectIds||request.objectIds.includes(o.id));
    if(request.mode==='REPLACE'&&request.roadId&&request.type!=='trafficLight'&&request.type!=='roadSign'&&request.spacing){
      const path=context.path(request.roadId),start=request.stationStart??0,end=request.stationEnd??polylineLength(path),spacing=request.spacing;
      if(spacing<=0||start<0||end<start||end>polylineLength(path))throw new Error('Invalid REPLACE station range/spacing');
      const selected=rows.filter(o=>{const a=deriveAnchor(context,o,request.roadId);return a&&a.station>=start&&a.station<=end;});
      for(const o of selected)ignored.add(o.id);
      const available=selected.map(o=>({object:o,anchor:deriveAnchor(context,o,request.roadId)!})).sort((a,b)=>a.anchor.station-b.anchor.station),assigned=new Set<string>();
      const sides=request.side==='both'?[-1,1]:request.side?[request.side==='left'?-1:1]:[...new Set(available.map(o=>o.anchor.lateralOffset<0?-1:1))];
      for(let station=start;station<=end+1e-6;station+=spacing)for(const side of sides){
        const actual=station+(side===1&&request.arrangement==='STAGGERED'?spacing/2:0)+(request.longitudinalOffset??0);if(actual>end||actual<start)continue;
        if(candidates.length>=limit)throw new Error('Replacement brush exceeds candidate limit');
        const old=available.filter(o=>!assigned.has(o.object.id)&&(o.anchor.lateralOffset<0?-1:1)===side).sort((a,b)=>Math.abs(a.anchor.station-actual)-Math.abs(b.anchor.station-actual))[0]?.object;
        const template=old??available[0]?.object;if(!template)continue;
        if(old)assigned.add(old.id);
        const authored=context.map.objects.find(o=>o.id===template.id)!;
        const placement=brushPosition(context,request,actual,side,random),id=old?.id??nextId(),object:CityObject={...structuredClone(authored),id,position:placement.position,rotation:placement.rotation};
        handle(prefabRecord(object),old?[{op:'modifyObject',id,properties:{position:object.position,rotation:object.rotation}}]:[{op:'placeObject',properties:object}],old?.id);
      }
      if(candidates.some(c=>c.state!=='INVALID'))for(const o of selected)if(!assigned.has(o.id))operations.push({op:'removeObject',id:o.id});
    }else for(const old of rows){
      const anchor=deriveAnchor(context,old,request.roadId);if(!anchor)continue;
      if(anchor.station<(request.stationStart??0)||anchor.station>(request.stationEnd??Infinity))continue;
      if(request.mode==='REPAIR'&&!placementIssues(context,old,request).some(i=>i.severity!=='info'))continue;
      const station=request.mode==='REPLACE'&&request.spacing?Math.round(anchor.station/request.spacing)*request.spacing:anchor.station;
      const commands=reanchorCommands(context,old.id,{roadId:request.roadId,station,verticalOffset:request.heightOffset,strategy:request.mode==='REPAIR'?'reanchorRoadside':undefined}),command=commands[0]!;
      if(command.op==='modifyObject'){
        const roadId=request.roadId??anchor.anchorRoadId,side=anchor.lateralOffset<0?-1:1;
        const placement=brushPosition(context,{...request,roadId,randomPositionJitter:0,randomRotationJitter:0},station,side);
        // REPAIR/REPLACE must honour the same height and facing controls as a new stroke.
        if(request.heightMode||request.type==='tree')command.properties.position={...command.properties.position!,y:placement.position.y};
        if(request.orientation)command.properties.rotation=placement.rotation;
        if(request.lateralOffset!==undefined)command.properties.position={...placement.position};
      }
      const position=command.op==='modifyObject'||command.op==='modifySign'?command.properties.position??old.position:command.op==='setSignalPlacement'?command.position:old.position;
      const rotation=command.op==='modifyObject'?command.properties.rotation??old.rotation:command.op==='modifySign'?command.properties.heading??old.rotation:command.op==='setSignalPlacement'?command.heading:old.rotation;
      handle({...old,position,rotation},commands,old.id,request.mode==='REPAIR'?old.position:undefined);if(candidates.length>limit)throw new Error('Brush limit reached; narrow scope');
    }
  }else if(request.type==='trafficLight'){
    const j=context.map.intersections.find(j=>j.id===request.intersectionId);if(!j)throw new Error('Unknown brush intersection');
    for(const c of j.connections)if(!request.approaches||request.approaches.includes(c.port)){
      const signal=signalApproach(context.map,j,c.port);if(!signal.incoming)continue;
      const current=editableObjects(context).find(o=>o.id===`signal:${j.id}:${c.port}`);
      const position=request.signalSide==='near-side'?{x:signal.mouth.x+signal.outward.x*6+signal.right.x*(signal.roadWidth/2+2),y:j.position.y??0,z:signal.mouth.z+signal.outward.z*6+signal.right.z*(signal.roadWidth/2+2)}:signal.expectedPosition;
      const record:EditableObject={id:`signal:${j.id}:${c.port}`,kind:'trafficLight',type:'trafficLight',position:{...position,y:(position.y??0)+(request.heightOffset??0)},rotation:signal.expectedHeading,roadId:c.roadId,intersectionId:j.id,approach:c.port,derived:false,size:{width:.3,depth:.3,height:request.poleHeight??signal.height,approximate:true}};
      handle(record,[{op:'setSignalPlacement',intersectionId:j.id,approach:c.port,position:record.position,heading:record.rotation,poleHeight:request.poleHeight}],current?.id);
    }
  }else{
    const spots:{station?:number;side:number;point?:CityPoint}[]=[];
    if(request.mode==='AREA'){
      if(request.type!=='tree'&&request.type!=='green_strip')throw new Error('AREA is reserved for vegetation');
      const area=request.bbox??(request.polygon?bounds(request.polygon):undefined);if(!area)throw new Error('AREA requires bbox or polygon');
      const density=request.density??.002;if(!Number.isFinite(density)||density<=0)throw new Error('AREA density must be positive objects/m²');
      const count=Math.ceil((area.maxX-area.minX)*(area.maxZ-area.minZ)*density);if(count>limit)throw new Error('Area brush exceeds limit; reduce density or area');
      for(let i=0;i<count;i++){const point={x:area.minX+random()*(area.maxX-area.minX),z:area.minZ+random()*(area.maxZ-area.minZ)};if(!request.polygon||insidePolygon(point,request.polygon))spots.push({point,side:1});}
    }else{
      if(!request.roadId)throw new Error('Road brush requires roadId');
      const length=polylineLength(context.path(request.roadId)),start=request.stationStart??0,end=request.mode==='SINGLE'?start:request.stationEnd??length,spacing=request.spacing??30;
      if(![start,end,spacing].every(Number.isFinite)||spacing<=0||start<0||end>length||end<start)throw new Error('Invalid brush station interval/spacing');
      const sides=request.side==='both'?[-1,1]:[request.side==='left'?-1:1];
      for(let station=start;station<=end+1e-6;station+=spacing)for(const side of sides){const phase=side===1&&request.arrangement==='STAGGERED'?spacing/2:0,s=station+phase+(request.longitudinalOffset??0);if(s<=end&&s>=0)spots.push({station:s,side});if(spots.length>limit)throw new Error('Brush exceeds candidate limit');}
    }
    for(const spot of spots){
      const id=nextId(),placement=spot.station!==undefined?brushPosition(context,request,spot.station,spot.side,random):{position:{...spot.point!,y:((request.heightMode==='ABSOLUTE'?request.height:context.map.regional?regionalTerrainSampler(context.map).heightAt(spot.point!.x,spot.point!.z):0)??0)+(request.heightOffset??0)},rotation:(request.yaw??0)+(random()-.5)*2*(request.randomRotationJitter??Math.PI),heightMode:'GROUND' as HeightMode};
      const factor=1+(random()-.5)*2*(request.randomScaleJitter??0),s=typeof request.scale==='number'?{x:request.scale,y:request.scale,z:request.scale}:request.scale??{x:1,y:1,z:1},scale={x:s.x*factor,y:s.y*factor,z:s.z*factor};
      if(Math.min(scale.x,scale.y,scale.z)<=0)throw new Error('Brush scale must remain positive');
      if(request.type==='roadSign'){
        if(!request.nameId||!context.map.roadNames?.[request.nameId])throw new Error('Road-sign placement requires an existing registry nameId');
        const record:EditableObject={id,kind:'sign',type:'roadSign',position:placement.position,rotation:placement.rotation,roadId:request.roadId,derived:false,size:{width:.5,depth:.5,height:5.5,approximate:true}};
        handle(record,[{op:'createSign',id,roadId:request.roadId!,station:spot.station!,direction:request.direction,properties:{position:record.position,heading:record.rotation,destinations:[{roadNameId:request.nameId,arrow:'straight'}]}}]);
      }else{
        const object:CityObject={id,prefabId:request.type as PrefabId,position:placement.position,rotation:placement.rotation,scale};handle(prefabRecord(object),[{op:'placeObject',properties:object}]);
      }
    }
  }
  const invalid=candidates.filter(c=>c.state==='INVALID').length;
  return {request,candidates,operations,stats:{planned:candidates.length,valid:candidates.filter(c=>c.state==='VALID').length,adjusted:candidates.filter(c=>c.state==='ADJUSTED').length,invalid,skipped:invalid,added:candidates.filter(c=>c.state!=='INVALID'&&!c.sourceId).length,moved:candidates.filter(c=>c.state!=='INVALID'&&c.sourceId).length,removed:operations.filter(op=>op.op==='removeObject').length},valid:policy!=='STRICT'||invalid===0};
}
