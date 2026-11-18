import type {CityMapData,CityPoint,CityObject} from '../src/world/city/CityMapData';
import {RoadSignPlacement,signReadingConflict} from '../src/world/regional/FastRoadSignPlacement';
import type {RoadSignDefinition} from '../src/world/city/RoadSignData';
import {roadPoints,sampleAt,polylineLength,rotatePoint,roadEdges} from '../src/world/city/geometry';
import {project,distance} from '../src/editor/EditorGeometry';
import {objectSize} from '../src/editor/MapObjectGeometry';
import {RoadClearance} from '../src/world/city/RoadClearance';
import {roadPiers,barrierSections,roadLampAnchors} from '../src/world/city/RoadInfrastructure';
import {RoadsidePlacement} from '../src/world/city/RoadsidePlacement';
import {roadSignColliders} from '../src/world/city/RoadSignTemplates';
import {createStaticOBBCollider,type StaticCollider} from '../src/vehicle/physics/CollisionSystem';
import {MarkingOwnership} from '../src/world/city/MarkingOwnership';
import {roadEdgeChains} from '../src/world/city/RoadEdgeChain';
import {makePavementSegments,clipPavementFootprints} from '../src/editor/ElevationSeams';
import {EditorSpatialIndex,bounds} from '../src/editor/EditorGeometry';
import {roadPavementTriangle} from '../src/world/city/RoadPavementSurface';
import {regionalTerrainSampler} from '../src/world/regional/RegionalTerrain';

const clone=<T>(v:T):T=>structuredClone(v);
function overlap(a:StaticCollider,b:StaticCollider){
  if(a.minHeight>=b.maxHeight-.02||b.minHeight>=a.maxHeight-.02)return false;
  for(const box of [a,b])for(const axis of [{x:Math.cos(box.yaw),z:-Math.sin(box.yaw)},{x:Math.sin(box.yaw),z:Math.cos(box.yaw)}]){
    const project=(c:StaticCollider)=>c.corners.map(p=>p.x*axis.x+p.z*axis.z),u=project(a),v=project(b);if(Math.max(...u)<=Math.min(...v)+.02||Math.max(...v)<=Math.min(...u)+.02)return false;
  }return true;
}
function objectBoxes(o:CityObject):StaticCollider[]{
  const s=objectSize(o),y=o.position.y??0,base={id:o.id,x:o.position.x,z:o.position.z,width:s.width,length:s.depth,yaw:o.rotation,minHeight:y,maxHeight:y+s.height,type:'obstacle' as const};
  const boxes=[createStaticOBBCollider(base)];
  if(o.prefabId.startsWith('streetlight')){const reach=o.prefabId==='streetlight_dual'?3.6:o.prefabId==='streetlight_highway'?3:o.prefabId==='streetlight_small'?1:0;for(const side of o.prefabId==='streetlight_dual'?[-1,1]:[1])if(reach){const shift=rotatePoint({x:0,z:-side*reach/2},o.rotation);boxes.push(createStaticOBBCollider({...base,id:o.id+':arm:'+side,x:o.position.x+shift.x,z:o.position.z+shift.z,width:.55,length:reach+.6,minHeight:y+s.height-.6}));}}
  return boxes;
}

/** Scoped authoring transaction. Signs retain their explicit road and lane
 * ownership; unowned legacy props are never assigned to a different layer by
 * a nearest-road guess. Generated furniture is recomputed from final roads. */
export function adaptInterchangeAssets(before:CityMapData,after:CityMapData,cluster:any,changed:ReadonlySet<string>){
  const beforeRoads=new Map(before.roads.map(r=>[r.id,r])),roads=new Map(after.roads.map(r=>[r.id,r])),ids=new Set<string>(cluster.roadIds),signIds=new Set<string>(cluster.signIds),objectIds=new Set<string>(cluster.objectIds);
  const clearance=new RoadClearance(after),oldClearance=new RoadClearance(before),placement=new RoadSignPlacement(after),adjustments:any[]=[],checks:any[]=[],oldPlacement=new RoadSignPlacement(before);
  const objects=after.objects.filter(o=>objectIds.has(o.id));let fixedBoxes=objects.filter(o=>!['parking','water','waterway','green_strip','hardscape','embankment','railway_track','sports_field'].includes(o.prefabId)).flatMap(objectBoxes);
  const objectConflict=(boxes:StaticCollider[],exclude?:string)=>fixedBoxes.filter(b=>!exclude||b.id!==exclude&&!b.id.startsWith(exclude+':')).filter(b=>boxes.some(a=>overlap(a,b))).map(b=>b.id);
  const signSafe=(s:RoadSignDefinition)=>placement.safe(s)&&!objectConflict(roadSignColliders(s)).length;
  for(let i=0;i<(after.signs??[]).length;i++){
    const current=after.signs![i]!;if(!signIds.has(current.id))continue;const old=before.signs!.find(s=>s.id===current.id)!,owned=beforeRoads.get(old.roadId)!,road=roads.get(old.roadId)!,oldPath=roadPoints(owned),path=roadPoints(road),station=old.stationMetres??project(oldPath,old.position).along,frame=sampleAt(oldPath,station),newStation=station/polylineLength(oldPath)*polylineLength(path),fresh=sampleAt(path,newStation),lateral=-(old.position.x-frame.point.x)*frame.tangent.z+(old.position.z-frame.point.z)*frame.tangent.x,vertical=(old.position.y??0)-(frame.point.y??0);
    let next=clone(current);
    if(cluster.signsOnly){const f=sampleAt(path,current.stationMetres??project(path,current.position).along),heading=Math.atan2(-f.tangent.x,-f.tangent.z)+(current.laneDirection==='reverse'?Math.PI:0);if(Math.cos(current.heading-heading)<.985)next.heading=heading;}
    if(changed.has(road.id)){next.stationMetres=newStation;next.position={x:fresh.point.x-fresh.tangent.z*lateral,y:(fresh.point.y??0)+vertical,z:fresh.point.z+fresh.tangent.x*lateral};next.heading=Math.atan2(-fresh.tangent.x,-fresh.tangent.z)+(old.laneDirection==='reverse'?Math.PI:0);if(next.postBaseY!==undefined)next.postBaseY+=(fresh.point.y??0)-(frame.point.y??0);if(next.actualAdvanceMetres!==undefined){const delta=(polylineLength(path)-newStation)-(polylineLength(oldPath)-station);next.actualAdvanceMetres+=delta;next.destinations.forEach(d=>{if(d.distanceMetres!==undefined)d.distanceMetres=Math.round(next.actualAdvanceMetres!);});}}
    const baselineSafe=oldPlacement.safe(old)&&!objectConflict(roadSignColliders(old)).length;
    if(!signSafe(next)){
      let found:RoadSignDefinition|undefined;
      for(const delta of [0,-15,15,-30,30,-60,60,-90,-120]){
        const moved=delta?placement.move(next,delta):clone(next);if(!moved)continue;if((moved.actualAdvanceMetres??Infinity)<30)continue;
        const candidates=[moved];if(moved.type==='SPEED_LIMIT'||moved.type==='CHEVRON'){const safety=placement.roadside(roads.get(moved.roadId)!,moved.stationMetres!,moved.laneDirection==='reverse',moved.type,moved.id,moved.chevronDirection);if(safety)candidates.push({...moved,...safety});}if(moved.template==='highway-gantry'||moved.template==='gantry'){const e=roadEdges(roads.get(moved.roadId)!);for(const side of [e.right+1.5,e.left-1.5]){const c={...moved,template:'gantry' as const,postOffset:side};delete c.gantryPosts;candidates.push(c);}}
        found=candidates.find(c=>signSafe(c)&&!(after.signs??[]).some(s=>s.id!==old.id&&distance(s.position,c.position)<60&&signReadingConflict(s,c,45)));if(found)break;
      }if(found)next=found;
    }
    after.signs![i]=next;const valid=signSafe(next);
    if(JSON.stringify(old)!==JSON.stringify(next))adjustments.push({kind:'sign',id:old.id,roadId:old.roadId,reason:changed.has(road.id)?'Reproject explicit owning-road station, lane-facing heading and reading distance; resolve final-deck/asset envelopes':'Resolve facility envelope inside interchange',before:old,after:next});
    checks.push({kind:'sign',id:old.id,roadId:next.roadId,beforeSafe:baselineSafe,afterSafe:valid,objectConflicts:objectConflict(roadSignColliders(next)),directionDot:Math.cos(next.heading-(Math.atan2(-sampleAt(roadPoints(roads.get(next.roadId)!),next.stationMetres??project(roadPoints(roads.get(next.roadId)!),next.position).along).tangent.x,-sampleAt(roadPoints(roads.get(next.roadId)!),next.stationMetres??0).tangent.z)+(next.laneDirection==='reverse'?Math.PI:0)))});
  }
  if(cluster.signsOnly)return {clusterId:cluster.id,counts:{signs:checks.length,authoredProps:0,roads:ids.size},adjustments,checks,generated:[],roadBuildingConflicts:[],newRoadBuildingConflicts:[],unresolved:checks.filter(c=>!c.afterSafe),pierConflicts:[]};
  // Authored lamps remain on their proven original level. A bounded lateral
  // move clears a newly moved deck; no building or unrelated road is moved.
  const signBoxes=(after.signs??[]).filter(s=>signIds.has(s.id)||objects.some(o=>distance(o.position,s.position)<15)).flatMap(roadSignColliders);
  const sidewalkPlanes:{plane:ReturnType<typeof roadPavementTriangle>;box:ReturnType<typeof bounds>}[]=[],sidewalkIndex=new EditorSpatialIndex(64);
  for(const r of after.roads.filter(r=>r.sidewalk?.enabled)){const half=r.laneCount*r.laneWidth/2;for(const side of [-1,1]){const a=roadEdgeChains(after).edge(r,Math.min(side*half,side*(half+r.sidewalk!.width)),.15),b=roadEdgeChains(after).edge(r,Math.max(side*half,side*(half+r.sidewalk!.width)),.15);for(let i=1;i<a.length;i++)for(const triangle of [[a[i-1]!,b[i-1]!,a[i]!],[b[i-1]!,b[i]!,a[i]!]]){const plane=roadPavementTriangle(triangle[0]!,triangle[1]!,triangle[2]!,1),box=bounds(triangle);sidewalkIndex.set(String(sidewalkPlanes.length),box);sidewalkPlanes.push({plane,box});}}}
  const sidewalkSupport=(p:CityPoint)=>sidewalkIndex.query(bounds([p],.05)).some(id=>{const s=sidewalkPlanes[+id]!.plane;return s.contains(.02)(p.x,p.z)&&Math.abs(s.heightAt(p.x,p.z)-(p.y??0))<.035;});
  for(const object of objects){
    if(cluster.checkObjectIds&&!cluster.checkObjectIds.includes(object.id))continue;
    if(!/^(streetlight|traffic_sign|guardrail|noise_barrier)/.test(object.prefabId))continue;
    const old=clone(object),size=objectSize(object),radius=Math.hypot(size.width,size.depth)/2;
    const originalTerrain=before.regional?regionalTerrainSampler(before).heightAt(old.position.x,old.position.z):-.04;
    if(!cluster.validateOnly&&object.prefabId.startsWith('streetlight')&&Math.abs((old.position.y??0)-originalTerrain)<.6){
      const ground=after.regional?regionalTerrainSampler(after).heightAt(object.position.x,object.position.z):-.04;
      if(Math.abs((object.position.y??0)-ground)>.001){object.position.y=ground;adjustments.push({kind:'authored-prop',id:old.id,ownershipEvidence:{foundation:'ACTUAL_TERRAIN',beforeTerrainHeight:originalTerrain,afterTerrainHeight:ground},before:old,after:clone(object),reason:'Preserve the proven ground foundation as local road earthworks change; do not infer bridge mounting from absolute world Y'});}
    }
    const safe=(p:CityObject)=>{
      const y=p.position.y??0,boxes=objectBoxes(p);if(objectConflict(boxes,p.id).length||boxes.some(b=>signBoxes.some(s=>overlap(b,s))))return false;
      if(p.prefabId.startsWith('streetlight')){
        const terrain=after.regional?regionalTerrainSampler(after).heightAt(p.position.x,p.position.z):-.04,grounded=Math.abs(y-terrain)<.05;
        if(clearance.roadAt(p.position,radius,y-.3,y+size.height+.65,undefined,undefined,true)||clearance.roadAt(p.position,radius,y+.4,y+size.height+.65)||!grounded&&!clearance.roadAt(p.position,.03,y-.5,y+.3)&&!sidewalkSupport(p.position))return false;
      }else{
        const count=Math.max(1,Math.ceil(size.width/2));for(let i=0;i<=count;i++)for(const z of [-size.depth/2,size.depth/2]){const q=rotatePoint({x:-size.width/2+size.width*i/count,z},p.rotation),point={x:p.position.x+q.x,y,z:p.position.z+q.z};if(clearance.roadAt(point,.15,y-.3,y+size.height+.65)||clearance.junctionAt(point,.15,y-.3,y+size.height))return false;}
      }return true;
    };
    const baselineSafe=oldClearance.permitsProp(old.position,radius,size.height);
    if(!safe(object)&&!cluster.validateOnly){
      // Same-level road, aligned pole arm and an exterior verge are required
      // evidence. Ambiguous forks retain the asset and an unresolved check.
      const owners=before.roads.filter(r=>ids.has(r.id)).map(r=>({road:r,hit:project(roadPoints(r),old.position)})).filter(q=>Math.abs((q.hit.point.y??0)-(old.position.y??0))<.6&&q.hit.distance<Math.max(-roadEdges(q.road).left,roadEdges(q.road).right)+12).sort((a,b)=>a.hit.distance-b.hit.distance);
      if(old.prefabId.startsWith('streetlight')&&(old.position.y??0)>2){
        const host=[...owners].sort((a,b)=>b.road.laneCount-a.road.laneCount||a.hit.distance-b.hit.distance)[0];
        if(host){const cohort=after.roads.filter(r=>r.roadClass===host.road.roadClass&&r.roadNameId===host.road.roadNameId&&r.laneCount===host.road.laneCount).map(r=>({road:r,hit:project(roadPoints(r),old.position)})).filter(q=>Math.abs((q.hit.point.y??0)-(old.position.y??0))<.6).sort((a,b)=>a.hit.distance-b.hit.distance);
          const mount=cohort[0];if(mount){const half=mount.road.laneCount*mount.road.laneWidth/2,e=roadEdges(mount.road),walk=mount.road.sidewalk?.enabled?mount.road.sidewalk.width:0,offsets=[{offset:e.right-.45,dy:0},{offset:e.left+.45,dy:0},...(walk>=1?[{offset:half+walk/2,dy:.15},{offset:-half-walk/2,dy:.15}]:[])].filter(p=>Math.abs(p.offset)>half+radius+.05).sort((a,b)=>Math.abs(Math.abs(a.offset)-mount.hit.distance)-Math.abs(Math.abs(b.offset)-mount.hit.distance));
            for(const {offset,dy} of offsets){const p={...old,position:{x:mount.hit.point.x-mount.hit.tangent.z*offset,y:(mount.hit.point.y??0)+dy,z:mount.hit.point.z+mount.hit.tangent.x*offset},rotation:Math.atan2(mount.hit.tangent.z*offset,-mount.hit.tangent.x*offset)};if(safe(p)){object.position=p.position;object.rotation=p.rotation;adjustments.push({kind:'authored-prop',id:old.id,roadId:mount.road.id,ownershipEvidence:{originalRoadId:host.road.id,sameRoadName:mount.road.roadNameId,originalLevelPreserved:true,footingOnPavedDeck:true,allCarriagewaysClear:true},before:old,after:clone(object),reason:'Mount the existing lamp in the real owning carriageway shoulder/sidewalk and face its arm toward the road'});break;}}
          }
        }
      }
      const owner=owners[0],sameCorridor=owner&&owners.filter(o=>o.hit.distance<owner.hit.distance+1).every(o=>o.road.roadClass===owner.road.roadClass&&o.road.roadNameId===owner.road.roadNameId&&o.road.laneCount===owner.road.laneCount&&Math.abs(o.hit.tangent.x*owner.hit.tangent.x+o.hit.tangent.z*owner.hit.tangent.z)>.95);
      if(!safe(object)&&owner&&(!owners[1]||owners[1].hit.distance-owner.hit.distance>1||owner.road.groupId===old.groupId||sameCorridor)){
        const signed=-(old.position.x-owner.hit.point.x)*owner.hit.tangent.z+(old.position.z-owner.hit.point.z)*owner.hit.tangent.x,side=signed>=0?1:-1;
        for(const extra of [2,4,6,9,12]){const p={...old,position:{x:old.position.x-owner.hit.tangent.z*side*extra,y:old.position.y,z:old.position.z+owner.hit.tangent.x*side*extra}};if(safe(p)){object.position=p.position;adjustments.push({kind:'authored-prop',id:old.id,roadId:owner.road.id,ownershipEvidence:{sameOriginalLevel:true,originalLateral:signed,groupId:old.groupId,alternativeOwnerDistance:owners[1]?.hit.distance},before:old,after:clone(object),reason:'Retain original layer and verge; clear final roadway/asset envelope'});break;}}
      }
    }fixedBoxes=fixedBoxes.filter(b=>b.id!==object.id&&!b.id.startsWith(object.id+':'));fixedBoxes.push(...objectBoxes(object));checks.push({kind:'authored-prop',id:object.id,beforeSafe:baselineSafe,afterSafe:safe(object)});
  }
  if(cluster.checkObjectsOnly)return {clusterId:cluster.id,counts:{signs:checks.filter(c=>c.kind==='sign').length,authoredProps:checks.filter(c=>c.kind==='authored-prop').length,roads:ids.size},adjustments,checks,generated:[],roadBuildingConflicts:[],newRoadBuildingConflicts:[],unresolved:checks.filter(c=>!c.afterSafe),pierConflicts:[]};
  const generated:any[]=[],paint=new MarkingOwnership(after),lampPlacement=new RoadsidePlacement(after,clearance);
  for(const road of after.roads.filter(r=>ids.has(r.id))){
    const piers=roadPiers(road,after,clearance),barriers=barrierSections(road,after,clearance),path=roadPoints(road),L=polylineLength(path),half=road.laneCount*road.laneWidth/2;
    const pierConflicts=piers.flatMap((p,i)=>{const c=createStaticOBBCollider({id:road.id+':pier:'+i,x:p.position.x,z:p.position.z,width:1.2,length:1.2,minHeight:p.baseY,maxHeight:p.baseY+p.height,type:'obstacle'});return objectConflict([c]).map(id=>({pier:i,objectId:id}));});
    const lamps=roadLampAnchors(road,after,clearance,(p,r,h,id)=>lampPlacement.permits(p,r,h,id));
    const lineOffsets=road.markings===false?[]:[-half+.15,half-.15,...(road.travelDirection==='two-way'?[-.13,.13]:[])],lineSections=lineOffsets.map(offset=>({offset,sections:paint.sections(path,offset,road,'road',Math.abs(offset)>half-.2).length}));
    generated.push({roadId:road.id,piers:piers.length,pierConflicts,barrierSections:barriers.length,barrierLength:barriers.reduce((v,b)=>v+polylineLength(b.points),0),generatedLamps:lamps.length,lampFootings:lamps,longitudinalMarkings:lineSections,regeneratedFromFinalRoad:true});
  }
  const buildings=objects.filter(o=>['residential_low','residential_mid','office','commercial','industrial','school','garage','stadium','bus_stop','station_platform','parked_car'].includes(o.prefabId)),buildingIndex=new EditorSpatialIndex(64),boxes=buildings.flatMap(objectBoxes);boxes.forEach((b,i)=>buildingIndex.set(String(i),bounds([...b.corners])));
  const roadBuildingConflicts:any[]=[];
  for(const segment of makePavementSegments(after).filter(s=>changed.has(s.road.id)))for(const id of buildingIndex.query(segment.box)){const box=boxes[+id]!,polygon=box.corners.map(p=>({...p})),area=polygon.reduce((v,p,i)=>{const q=polygon[(i+1)%polygon.length]!;return v+p.x*q.z-q.x*p.z;},0),clip=clipPavementFootprints(segment.polygon,area>=0?polygon:polygon.reverse());if(clip.length<3)continue;const heights=clip.map(p=>segment.surface.heightAt(p.x,p.z));if(Math.max(...heights)+2.3>=box.minHeight&&Math.min(...heights)-.65<=box.maxHeight&&!roadBuildingConflicts.some(c=>c.roadId===segment.road.id&&c.objectId===box.id))roadBuildingConflicts.push({roadId:segment.road.id,objectId:box.id,minRoadHeight:Math.min(...heights),maxRoadHeight:Math.max(...heights),objectBottom:box.minHeight,objectTop:box.maxHeight,point:clip[0]});}
  const baselineBuildingPairs=new Set<string>();for(const segment of makePavementSegments(before).filter(s=>changed.has(s.road.id)))for(const id of buildingIndex.query(segment.box)){const box=boxes[+id]!,polygon=box.corners.map(p=>({...p})),area=polygon.reduce((v,p,i)=>{const q=polygon[(i+1)%polygon.length]!;return v+p.x*q.z-q.x*p.z;},0),clip=clipPavementFootprints(segment.polygon,area>=0?polygon:polygon.reverse());if(clip.length<3)continue;const heights=clip.map(p=>segment.surface.heightAt(p.x,p.z));if(Math.max(...heights)+2.3>=box.minHeight&&Math.min(...heights)-.65<=box.maxHeight)baselineBuildingPairs.add(segment.road.id+'|'+box.id);}
  return {clusterId:cluster.id,counts:{signs:checks.filter(c=>c.kind==='sign').length,authoredProps:checks.filter(c=>c.kind==='authored-prop').length,roads:generated.length},adjustments,checks,generated,roadBuildingConflicts,newRoadBuildingConflicts:roadBuildingConflicts.filter(c=>!baselineBuildingPairs.has(c.roadId+'|'+c.objectId)),unresolved:checks.filter(c=>!c.afterSafe),pierConflicts:generated.flatMap(r=>r.pierConflicts.map((p:any)=>({...p,roadId:r.roadId})))};
}
