import {readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {CityEditingKernel} from '../../src/editor/CityEditingKernel';
import {analysisContext,structureType} from '../../src/editor/MapAnalysis';
import {inspectProfile,repairConstrainedProfile} from '../../src/editor/RoadProfileAnalysis';
import {roadFunction} from '../../src/world/city/RoadClassification';
import {roadPoints,polylineLength,sampleAt,roadEdges} from '../../src/world/city/geometry';
import {project,bounds} from '../../src/editor/EditorGeometry';
import {validateMap} from '../../src/world/city/CityMapValidation';
import {editableObjects,deriveAnchor,isBuilding,objectIssues,nearbyObjects} from '../../src/editor/ObjectAnalysis';
import {placementIssues,brushPosition} from '../../src/editor/PlacementBrush';
import {regionalTerrainSampler} from '../../src/world/regional/RegionalTerrain';
import {semanticDiff} from '../../src/editor/MapReview';
import type {CityMapData,CityRoad} from '../../src/world/city/CityMapData';
import type {EditorCommand} from '../../src/editor/EditorCommands';
import {preserveReachability} from './reachability';
import {diagnoseMap} from '../../src/editor/RoadDiagnostics';
import {signalApproach} from '../../src/world/city/SignalPlacement';
import {auditFastRoadSigns,signReadingConflict,isSafetySign} from '../../src/world/regional/FastRoadSignPlacement';
import {RoadClearance} from '../../src/world/city/RoadClearance';
import {signDimensions} from '../../src/world/city/RoadSignTemplates';
import {rotatePoint} from '../../src/world/city/geometry';
const source='src/world/regional/regional-main.json',dir='artifacts/batch23';
const save=(name:string,data:unknown)=>writeFileSync(`${dir}/${name}.json`,JSON.stringify(data,null,2));
let k=new CityEditingKernel(JSON.parse(readFileSync(source,'utf8')) as CityMapData);
const mode=process.argv[2];
function tx(name:string,operations:EditorCommand[],inspection:unknown){
  if(!operations.length)return;
  const summary=k.preview(operations,name);save(name+'-preview',{inspection,operations,summary});
  if(!summary.valid)throw new Error(name+': '+JSON.stringify(summary.warnings.filter(i=>i.severity==='error')));
  const diff=k.diffPreview(summary.id);save(name+'-diff',diff);
  if(diff.topology.changed){
    const reachability=preserveReachability(k.data,k.previewSnapshot(summary.id));save(name+'-reachability',reachability);
    if(reachability.losses.length)throw new Error(name+': directed route regression '+JSON.stringify(reachability.losses.slice(0,5)));
  }else if(diff.topology.componentDelta>0||diff.topology.newDeadEnds.length||diff.topology.laneConnectionsRemoved.length)throw new Error(name+': topology regression');
  const validation=validateMap(k.previewSnapshot(summary.id));save(name+'-validation',validation);
  if(!validation.valid)throw new Error(name+': invalid map');
  if(diff.roads.modified.length||diff.roads.added.length){
    const scope={bbox:diff.affectedBbox!,limit:1000000};
    save(name+'-local-diagnose',{before:diagnoseMap(k.data,scope,{retainAllIssues:true}),after:diagnoseMap(k.previewSnapshot(summary.id),scope,{retainAllIssues:true})});
  }
  k.commit(summary.id);writeFileSync(source+'.batch23-tmp',JSON.stringify(k.data)+'\n');renameSync(source+'.batch23-tmp',source);
  console.log(name,JSON.stringify({modified:summary.modified.length,created:summary.created.length,deleted:summary.deleted.length,errors:validation.errorCount,warning:validation.warningCount}));
  k=new CityEditingKernel(k.data);
}
if(mode==='access'){
  const specifications=[
    ['v91-ew-east-eb-off',1285,undefined],['v91-ew-east-wb-on',undefined,1285],
    ['v91-ew-west-eb-off',-1620,undefined],['v91-ew-west-wb-on',undefined,-1620],
    ['access-ew-west-eb-on',undefined,-650],['access-ew-west-wb-off',-650,undefined],
    ['v91-ew-east-eb-on',undefined,1875],['v91-ew-east-wb-off',1875,undefined],
    ['access-ns-north-sb-off',-1760,undefined],['access-ns-north-nb-on',undefined,-1760],
    ['access-ns-north-sb-on',-1320,-1150],['access-ns-north-nb-off',-1150,-1320],
    ['v91-ns-sb-on',undefined,1560],['v91-ns-nb-off',1560,undefined],
    ['v91-ns-sb-off',600,730],['v91-ns-nb-on',730,600],
  ] as const;
  for(const [id,fromAxis,toAxis]of specifications){
    const c=analysisContext(k.data),meta=k.data.editing!.ramps.find(m=>m.roadId===id)!,r=c.road(id),ns=id.includes('-ns-'),axis=ns?'z':'x';
    const locate=(ref:typeof meta.from,value:number|undefined)=>{
      if(value===undefined)return undefined;
      const old=c.road(ref.roadId),path=c.path(old.id),p=path[ref.end==='start'?0:path.length-1]!,target={...p,[axis]:value};
      const candidates=c.nearRoads(target,120).filter(h=>roadFunction(h.road)===roadFunction(old)&&h.road.roadNameId===old.roadNameId&&h.road.travelDirection===old.travelDirection&&!h.road.highwayTransition);
      if(!candidates.length)throw new Error('No attachment road '+id);
      return {roadId:candidates[0]!.road.id,station:candidates[0]!.along};
    };
    const from=locate(meta.from,fromAxis),to=locate(meta.to,toAxis),before=k.inspectRamp(id);
    save('window-'+id,k.accessWindows({mainline:roadFunction(c.road(meta.from.roadId))==='expressway'?meta.from.roadId:meta.to.roadId,frontage:roadFunction(c.road(meta.from.roadId))==='frontage'?meta.from.roadId:meta.to.roadId,minLength:30,buffer:60}));
    const ops:EditorCommand[]=[{op:'modifyRamp',id,from,to},{op:'modifyRoad',id,properties:{speedLimit:40,streetlights:false,structure:{...r.structure,piersEnabled:!ns,enclosure:ns?{kind:'cutting',clearance:6}:undefined}}}];
    tx('access-'+id,ops,{before,from,to});
  }
}
if(mode==='profiles'){
  const c=analysisContext(k.data),regions=new Map<string,{ops:EditorCommand[];review:unknown[]}>(),audit:unknown[]=[];
  for(const r of k.data.roads.filter(r=>roadFunction(r)==='ramp')){
    const p=inspectProfile(c,r.id);audit.push({id:r.id,metrics:p.metrics,extrema:p.extrema,constraints:p.constraints});
    if(!p.extrema.length)continue;
    let result:ReturnType<typeof repairConstrainedProfile>;
    try{result=repairConstrainedProfile(c,r.id,{strategy:'fitBetweenConstraints'});}catch(error){console.log('profile retained',r.id,String(error));continue;}
    const before=p.metrics,after=result.metrics.after;
    if(after.extremaCount>=before.extremaCount||after.maxGrade>before.maxGrade+1e-6)continue;
    const center=sampleAt(c.path(r.id),p.length/2).point;
    const region=r.id.startsWith('regional:')?'regional':center.z<-600?'north':center.z>1000?'south':center.x<-800?'west':center.x>800?'east':'central';
    const g=regions.get(region)??{ops:[],review:[]};
    g.ops.push({op:'repairRamp',id:r.id,strategy:'fitBetweenConstraints'});g.review.push({id:r.id,before,after,constraints:p.constraints});regions.set(region,g);
  }
  save('all-ramp-profile-audit',audit);
  for(const [region,g]of regions)tx('profile-'+region,g.ops,g.review);
}
if(mode==='detail'){
  const c=analysisContext(k.data),ids=k.data.roads.filter(r=>r.roadNameId==='direction-mingyuan'||k.data.roadNames?.[r.roadNameId??'']?.primaryText==='明远快速路').map(r=>r.id);
  const endRoads=[k.data.roads.find(r=>r.id==='direction-mingyuan-main')!,k.data.roads.find(r=>r.id==='direction-mingyuan-main-section-section-section-section')!];
  save('mingyuan-end-detail',endRoads.map((r,i)=>{const p=c.path(r.id),e=p[i===0?0:p.length-1]!;return {road:r,profile:inspectProfile(c,r.id),nearRoads:c.nearRoads(e,150).map(h=>({id:h.road.id,name:k.data.roadNames?.[h.road.roadNameId??'']?.primaryText,lanes:h.road.laneCount,points:h.road.centerline,distance:h.distance})),junctions:k.data.intersections.filter(j=>j.connections.some(a=>a.roadId===r.id))};}));
  const access=k.data.editing!.ramps.filter(m=>/^(v91-ew|v91-ns|access-ew|access-ns)/.test(m.roadId));
  save('access-review',access.map(m=>{const r=c.road(m.roadId),p=c.path(r.id);return {id:r.id,metadata:m,points:r.centerline,length:polylineLength(p),inspection:k.inspectRamp(r.id),ends:[m.from,m.to].map(e=>({endpoint:e,road:c.road(e.roadId),connected:k.getConnectedRoads(e.roadId)}))};}));
  console.log('details saved',ids.length,access.length);
}
if(mode==='mingyuan'){
  for(const [id,end,junction]of [['direction-mingyuan-main','start','urban-junction-56'],['direction-mingyuan-main-section-section-section-section','end','direction-mingyuan-ne-terminal']] as const){
    if(end==='start'&&k.data.roads.find(r=>r.id===id)?.roadClass==='arterial')continue;
    const p=roadPoints(k.data.roads.find(r=>r.id===id)!),length=polylineLength(p),start=end==='start'?0:length-180,finish=end==='start'?180:length;
    tx('mingyuan-'+end+'-alignment',[{op:'smoothRoad',id,start,end:finish,strength:1.4,tolerance:.15},{op:'repairElevation',id,start,end:finish,strategy:'smoothGradeBreak'},{op:'repairIntersection',id:junction}],{geometry:k.inspectGeometry(id),profile:k.inspectProfile(id)});
    const path=roadPoints(k.data.roads.find(r=>r.id===id)!),cut=end==='start'?180:polylineLength(path)-180;
    const preview=k.preview({op:'splitRoad',roadId:id,point:sampleAt(path,cut).point});
    const added=k.previewSnapshot(preview.id).roads.find(r=>!k.data.roads.some(old=>old.id===r.id))!.id;k.cancelPreview();
    const terminal=end==='start'?id:added;
    tx('mingyuan-'+end+'-transition',[{op:'splitRoad',roadId:id,point:sampleAt(path,cut).point},{op:'modifyRoad',id:terminal,properties:{roadClass:'arterial',speedLimit:40,structure:{barrierEnabled:false,piersEnabled:false},streetlights:false,markings:true}},{op:'repairIntersection',id:junction}],{terminal,reason:'180m terminal approach, six lanes retained; lane turns at junction absorb receiving-road width change'});
    const j=k.data.intersections.find(j=>j.id===junction)!,connection=j.connections.find(c=>c.roadId===terminal)!;
    const approaches={...j.approaches,[connection.port]:{lanes:end==='start'?['left','straight','straight-right']:['left','left-right','right'],arrowDistance:35}};
    tx('mingyuan-'+end+'-markings',[{op:'modifyIntersection',id:junction,properties:{approaches:approaches as any}}],{servedRoad:terminal,lanes:approaches[connection.port]});
  }
}
if(mode==='tunnels'){
  const ops:EditorCommand[]=[],inspection:unknown[]=[];
  for(const r of k.data.roads){
    if(r.id.startsWith('ns-tunnel:')&&r.structure?.enclosure?.kind==='cutting'){
      inspection.push(k.inspectStructure(r.id));ops.push({op:'modifyRoad',id:r.id,properties:{corridorSection:'tunnel-mainline',streetlights:false,structure:{...r.structure,enclosure:{kind:'tunnel',clearance:6},piersEnabled:false,barrierEnabled:false}}});
    }else if(structureType(r)==='depressed'&&!r.structure?.enclosure){
      inspection.push(k.inspectStructure(r.id));ops.push({op:'modifyRoad',id:r.id,properties:{structure:{...r.structure,enclosure:{kind:'cutting',clearance:6},piersEnabled:false}}});
    }
  }
  tx('tunnel-shells-and-open-cuts',ops,inspection);
}
if(mode==='objects'||mode==='signals'){
  const pass=process.argv[3]??'3';
  const c=analysisContext(k.data),terrain=regionalTerrainSampler(k.data),groups=new Map<string,string[]>();
  const solid=(type:string)=>!['parking','water','waterway','railway_track','sports_field','green_strip','hardscape','embankment'].includes(type);
  const meaningful=(issues:any[],building=false)=>issues.filter(i=>i.severity!=='info'&&!['object.tooCloseToObject','streetlight.tooDense','roadSign.wrongSide'].includes(i.code)&&(!building||i.code.startsWith('building.')||i.code==='object.intersectsRoadStructure'));
  for(const o of editableObjects(c)){
    if(mode==='signals'&&o.kind!=='trafficLight')continue;
    if(!solid(o.type)&&!['green_strip','hardscape'].includes(o.type))continue;
    const anchor=deriveAnchor(c,o);if(!anchor)continue;
    const ground=terrain.heightAt(o.position.x,o.position.z),roadY=sampleAt(c.path(anchor.anchorRoadId),anchor.station).point.y??0;
    const heightMode=o.kind==='prefab'&&(o.type==='tree'||isBuilding(o.type)||Math.abs((o.position.y??0)-ground)<Math.abs((o.position.y??0)-roadY)+.1)?'GROUND':'ROAD_SURFACE';
    if(!meaningful(placementIssues(c,o,{heightMode}),isBuilding(o.type)).length)continue;
    const key=[Math.floor(o.position.x/2000),Math.floor(o.position.z/2000),o.type,heightMode].join(':');
    const ids=groups.get(key)??[];ids.push(o.id);groups.set(key,ids);
  }
  save('object-repair-selection',[...groups].map(([scope,ids])=>({scope,ids})));
  let index=0;
  for(const [key,ids]of groups){
    const context=analysisContext(k.data),records=editableObjects(context).filter(o=>ids.includes(o.id));
    if(!records.length)continue;
    const type=records[0]!.type,heightMode=key.endsWith('GROUND')?'GROUND':'ROAD_SURFACE',area=bounds(records.map(o=>o.position),1);
    const request:any={mode:'REPAIR',type,objectIds:ids,bbox:area,heightMode,heightOffset:0,orientation:records[0]!.kind==='sign'||records[0]!.kind==='trafficLight'?'FACE_TRAFFIC':'ROAD_FORWARD',autoAdjust:'ADJUST',maxAutoMove:isBuilding(type)?60:35,limit:5000,minDistanceToObject:.6};
    if(type==='trafficLight')request.intersectionId=records[0]!.intersectionId;
    const plan=k.planBrush(request);save('brush-pass'+pass+'-plan-'+index,plan);
    const ops:EditorCommand[]=[...plan.operations],done=new Set(plan.candidates.filter(o=>o.state!=='INVALID').map(o=>o.id));
    const unresolved:any[]=[];
    const rectOverlap=(a:any,b:any)=>{
      const ay=a.position.y??0,by=b.position.y??0;if(ay>=by+b.size.height||by>=ay+a.size.height)return false;
      const axes=(yaw:number)=>[{x:Math.cos(yaw),z:-Math.sin(yaw)},{x:Math.sin(yaw),z:Math.cos(yaw)}],aa=axes(a.rotation),bb=axes(b.rotation);
      return [...aa,...bb].every(axis=>{const radius=(o:any,axes:any[])=>Math.abs(axis.x*axes[0].x+axis.z*axes[0].z)*o.size.width/2+Math.abs(axis.x*axes[1].x+axis.z*axes[1].z)*o.size.depth/2;return Math.abs((a.position.x-b.position.x)*axis.x+(a.position.z-b.position.z)*axis.z)<radius(a,aa)+radius(b,bb)+.3;});
    };
    for(const old of records){
      if(done.has(old.id))continue;
      const anchor=deriveAnchor(context,old);if(!anchor)continue;
      const illegal=meaningful(placementIssues(context,old,{heightMode}),isBuilding(old.type));if(!illegal.length)continue;
      if(old.kind==='trafficLight'){unresolved.push({id:old.id,issues:illegal});continue;}
      const road=context.road(anchor.anchorRoadId),path=context.path(road.id),length=polylineLength(path),sign=k.data.signs?.find(s=>s.id===old.id),overhead=sign&&['gantry','highway-gantry','ceiling'].includes(sign.template);
      const candidates:any[]=[];
      for(const delta of [0,-5,5,-12,12,-25,25,-45,45])for(const gap of (overhead?[0]:isBuilding(old.type)?[2,6,12,20,30,45]:[1,2,4,7,12])){
        const station=Math.max(0,Math.min(length,anchor.station+delta)),side=sign?(sign.laneDirection==='reverse'?-1:1):anchor.lateralOffset<0?-1:1;
        const radius=old.size.trunkRadius??Math.hypot(old.size.width,old.size.depth)/2;
        const placement=brushPosition(context,{mode:'SINGLE',type:type as any,roadId:road.id,heightMode:heightMode as any,heightOffset:0,lateralOffset:overhead?-Math.max(-roadEdges(road).left,roadEdges(road).right):radius+gap,orientation:sign?'FACE_TRAFFIC':'ROAD_FORWARD',direction:sign?.laneDirection??(road.travelDirection==='reverse'?'reverse':'forward')},station,side);
        if(overhead)placement.position={...sampleAt(path,station).point};
        const candidate={...old,position:placement.position,rotation:placement.rotation},travel=Math.hypot(candidate.position.x-old.position.x,candidate.position.z-old.position.z,(candidate.position.y??0)-(old.position.y??0));
        if(travel>(isBuilding(type)?65:55))continue;
        const issues=placementIssues(context,candidate,{heightMode:heightMode as any,minDistanceToObject:.6});
        if(meaningful(issues,isBuilding(type)).length)continue;
        if(isBuilding(type)&&nearbyObjects(context,bounds([candidate.position],radius+5)).some(other=>other.id!==old.id&&solid(other.type)&&other.kind==='prefab'&&rectOverlap(candidate,other)))continue;
        if(!isBuilding(type)&&issues.some(i=>i.code==='object.tooCloseToObject'||i.code==='tree.canopyOccludesSign'))continue;
        candidates.push({candidate,travel,station});
      }
      const best=candidates.sort((a,b)=>a.travel-b.travel)[0];
      if(best){ops.push(old.kind==='sign'?{op:'modifySign',id:old.id,properties:{position:best.candidate.position,heading:best.candidate.rotation,stationMetres:best.station,...(sign?.postBaseY===undefined?{}:{postBaseY:Math.min(sign.postBaseY,best.candidate.position.y??0)})}}:{op:'modifyObject',id:old.id,properties:{position:best.candidate.position,rotation:best.candidate.rotation}});}
      else if(old.type==='tree'||old.type.startsWith('streetlight'))ops.push({op:'removeObject',id:old.id});
      else unresolved.push({id:old.id,issues:illegal});
    }
    tx('objects-pass'+pass+'-'+index++,ops,{key,request,brushStats:plan.stats,unresolved});
  }
}
if(mode==='finish-objects'){
  const initial=analysisContext(k.data),terrain=regionalTerrainSampler(k.data),records=editableObjects(initial),groups=new Map<string,EditorCommand[]>(),review:any[]=[];
  const append=(o:any,op:EditorCommand)=>{const key=(o.position.z<0?'north':'south')+(o.position.x<0?'-west':'-east'),list=groups.get(key)??[];list.push(op);groups.set(key,list);};
  const bad=(issues:any[])=>issues.filter(i=>i.severity!=='info'&&!['object.tooCloseToObject','object.unsupportedOnDeck','object.wrongStructureLevel','object.floating','object.buried','roadSign.wrongSide','streetlight.tooDense'].includes(i.code));
  for(const o of records){
    const issues=bad(objectIssues(initial,o));if(!issues.length)continue;
    if(o.kind==='trafficLight'){
      const j=k.data.intersections.find(j=>j.id===o.intersectionId)!,signal=signalApproach(k.data,j,o.approach!),candidates:any[]=[];
      for(const along of [6,10,16,24,32,45])for(const gap of [1,2,4,7,12]){
        const position={x:signal.mouth.x+signal.outward.x*along+signal.right.x*(signal.roadWidth/2+gap),y:j.position.y??0,z:signal.mouth.z+signal.outward.z*along+signal.right.z*(signal.roadWidth/2+gap)};
        const candidate={...o,position,rotation:signal.expectedHeading};
        if(!bad(objectIssues(initial,candidate)).length)candidates.push({position,travel:Math.hypot(position.x-o.position.x,position.z-o.position.z)});
      }
      const best=candidates.sort((a,b)=>a.travel-b.travel)[0];
      if(best)append(o,{op:'setSignalPlacement',intersectionId:j.id,approach:o.approach!,position:best.position,heading:signal.expectedHeading});
      else review.push({id:o.id,unresolved:issues});
    }else if(o.kind==='sign'){
      const s=k.data.signs!.find(s=>s.id===o.id)!,road=initial.road(s.roadId),path=initial.path(road.id),length=polylineLength(path),anchor=deriveAnchor(initial,o)!,edges=roadEdges(road),forward=s.laneDirection!=='reverse',overhead=['gantry','highway-gantry','ceiling'].includes(s.template),candidates:any[]=[];
      for(const delta of [0,-5,5,-15,15,-30,30,-60,60,-100,100])for(const gap of [1,2,4,7,12,18])for(const side of [1,-1]){
        const station=Math.max(0,Math.min(length,anchor.station+delta)),frame=sampleAt(path,station),placement=brushPosition(initial,{mode:'SINGLE',type:'roadSign',roadId:road.id,heightMode:'ROAD_SURFACE',orientation:'FACE_TRAFFIC',direction:s.laneDirection,lateralOffset:gap},station,forward?side:-side);
        const next={...s,position:overhead?frame.point:placement.position,heading:placement.rotation,stationMetres:station};
        const half=road.laneCount*road.laneWidth/2,shoulder=forward?road.shoulders?.right??0:road.shoulders?.left??0;
        if(s.template==='gantry')next.postOffset=side*(half+(shoulder>=1?Math.min(shoulder-.4,gap):gap));
        if(s.template==='highway-gantry')next.gantryPosts=[-half-Math.min(road.shoulders?.left??1,.8),half+Math.min(road.shoulders?.right??1,.8)];
        const ground=terrain.heightAt(next.position.x,next.position.z),base=next.position.y??0;
        if(s.postBaseY!==undefined)next.postBaseY=Math.min(base,ground);
        const overlay=Object.create(initial);Object.defineProperty(overlay,'map',{value:{...k.data,signs:[next]}});
        const checks=bad(objectIssues(overlay,{...o,position:next.position,rotation:next.heading}));
        if(checks.length)continue;
        const travel=Math.hypot(next.position.x-o.position.x,next.position.z-o.position.z);
        candidates.push({next,score:travel+Math.abs((next.postOffset??0)-(s.postOffset??0))*.15});
      }
      const best=candidates.sort((a,b)=>a.score-b.score)[0];
      if(best){const {id,...properties}=best.next;append(o,{op:'modifySign',id,properties});}else review.push({id:o.id,unresolved:issues});
    }else if(isBuilding(o.type)){
      const anchor=deriveAnchor(initial,o)!;if(!anchor)continue;
      const path=initial.path(anchor.anchorRoadId),length=polylineLength(path),radius=Math.hypot(o.size.width,o.size.depth)/2,candidates:any[]=[];
      for(const delta of [0,-30,30,-60,60,-100,100])for(const gap of [1,8,20,35])for(const side of [anchor.lateralOffset<0?-1:1]){
        const placement=brushPosition(initial,{mode:'SINGLE',type:o.type as any,roadId:anchor.anchorRoadId,heightMode:'GROUND',lateralOffset:radius+gap,orientation:'ROAD_FORWARD'},Math.max(0,Math.min(length,anchor.station+delta)),side);
        const candidate={...o,position:placement.position,rotation:placement.rotation},travel=Math.hypot(candidate.position.x-o.position.x,candidate.position.z-o.position.z);
        if(travel>160||bad(objectIssues(initial,candidate)).length)continue;
        if(nearbyObjects(initial,bounds([candidate.position],radius+5)).some(other=>other.id!==o.id&&isBuilding(other.type)&&Math.abs((candidate.position.y??0)-(other.position.y??0))<Math.max(candidate.size.height,other.size.height)&&Math.hypot(other.position.x-candidate.position.x,other.position.z-candidate.position.z)<radius+Math.hypot(other.size.width,other.size.depth)/2+1))continue;
        candidates.push({candidate,travel});
      }
      const best=candidates.sort((a,b)=>a.travel-b.travel)[0];
      if(best)append(o,{op:'modifyObject',id:o.id,properties:{position:best.candidate.position,rotation:best.candidate.rotation}});
      else if(o.type!=='stadium')append(o,{op:'removeObject',id:o.id});else review.push({id:o.id,unresolved:issues});
    }else if(['guardrail','noise_barrier','traffic_sign','guide_sign','green_strip','hardscape'].includes(o.type))append(o,{op:'removeObject',id:o.id});
  }
  save('final-object-reviews',review);
  for(const [region,ops]of groups)tx('object-'+(process.argv[3]??'conflicts')+'-'+region,ops,{review,reason:'Remaining physical supports, structures and obstructing surface props after brush repair'});
}
if(mode==='replay-signs'){
  for(const region of ['north-west','south-east','south-west','north-east']){
    const previous=JSON.parse(readFileSync(`${dir}/object-conflicts-${region}-preview.json`,'utf8'));
    tx('sign-explicit-transform-'+region,previous.operations.filter((op:any)=>op.op==='modifySign'),{reason:'Replay exact reviewed transforms after station override bug fix'});
  }
}
if(mode==='reading'){
  const c=analysisContext(k.data),audit=auditFastRoadSigns(k.data),badIds=new Set(audit.conflicts.flatMap(pair=>[pair.a,pair.b])),ops:EditorCommand[]=[],planned=[...k.data.signs!],unresolved:any[]=[];
  save('reading-before',audit);
  for(const s of k.data.signs!){
    const road=c.road(s.roadId),path=c.path(road.id),length=polylineLength(path),anchor=deriveAnchor(c,editableObjects(c).find(o=>o.id===s.id)!)!;
    if(s.type==='SPEED_LIMIT'&&s.speedLimitKmh!==road.speedLimit)ops.push({op:'modifySign',id:s.id,properties:{speedLimitKmh:road.speedLimit}});
    if(!badIds.has(s.id))continue;
    const conflict=(candidate:any)=>planned.some(other=>other.id!==s.id&&!isSafetySign(other)&&signReadingConflict(candidate,other,Math.max(45,Math.min(120,Math.max(road.speedLimit,c.road(other.roadId).speedLimit)*.9))));
    if(!conflict(s))continue;
    let selected:any;
    for(const delta of [-10,10,-25,25,-50,50,-80,80,-120,120,-180,180]){
      const station=anchor.station+delta;if(station<5||station>length-5)continue;
      const frame=sampleAt(path,station),position={x:frame.point.x-frame.tangent.z*anchor.lateralOffset,y:frame.point.y,z:frame.point.z+frame.tangent.x*anchor.lateralOffset},heading=Math.atan2(-frame.tangent.x,-frame.tangent.z)+(s.laneDirection==='reverse'?Math.PI:0),next={...s,position,heading,stationMetres:station};
      if(s.postBaseY!==undefined)next.postBaseY=Math.min(s.postBaseY,position.y??0);
      const overlay=Object.create(c);Object.defineProperty(overlay,'map',{value:{...k.data,signs:[next]}});
      if(objectIssues(overlay,{...editableObjects(c).find(o=>o.id===s.id)!,position,rotation:heading}).some(i=>i.severity!=='info'&&i.code!=='roadSign.wrongSide')||conflict(next))continue;
      selected=next;break;
    }
    if(selected){
      if(s.advanceMetres!==undefined){const move=(selected.stationMetres-anchor.station)*(s.laneDirection==='reverse'?-1:1);selected.actualAdvanceMetres=(s.actualAdvanceMetres??s.advanceMetres)-move;selected.destinations=s.destinations.map(d=>d.distanceMetres===undefined?d:{...d,distanceMetres:Math.round(selected.actualAdvanceMetres)});}
      const {id,...properties}=selected;ops.push({op:'modifySign',id,properties});planned[planned.findIndex(o=>o.id===id)]=selected;
    }else unresolved.push(s.id);
  }
  save('reading-unresolved',unresolved);tx('reading-band-separation',ops,{audit,unresolved});
}
if(mode==='safety'||mode==='safety-min'){
  const c=analysisContext(k.data),clearance=new RoadClearance(k.data),ops:EditorCommand[]=[],unresolved:any[]=[];
  const safe=(s:any)=>{const d=signDimensions(s.template,s.size);return [-d.width/2,0,d.width/2].every(x=>{const q=rotatePoint({x,z:0},s.heading);return !clearance.roadAt({x:s.position.x+q.x,z:s.position.z+q.z},.1,(s.position.y??0)-.3,(s.position.y??0)+d.bottom+d.height,undefined,undefined,true);});};
  const safetySource=mode==='safety-min'?JSON.parse(readFileSync(`${dir}/safety-sign-clearances-diff.json`,'utf8')).signs.modified.map((s:any)=>s.before):k.data.signs!.filter(isSafetySign);
  for(const s of safetySource){
    const path=c.path(s.roadId),road=c.road(s.roadId),length=polylineLength(path),station=s.stationMetres!,frame=sampleAt(path,station),heading=Math.atan2(-frame.tangent.x,-frame.tangent.z)+(s.laneDirection==='reverse'?Math.PI:0);
    const current={...s,position:{...s.position,y:frame.point.y},heading},o=editableObjects(c).find(o=>o.id===s.id)!;
    const illegal=(candidate:any)=>{const overlay=Object.create(c);Object.defineProperty(overlay,'map',{value:{...k.data,signs:[candidate]}});return objectIssues(overlay,{...o,position:candidate.position,rotation:candidate.heading}).some(i=>i.severity!=='info'&&i.code!=='roadSign.wrongSide');};
    if(safe(current)&&!illegal(current)&&Math.abs((s.position.y??0)-(frame.point.y??0))<1e-7&&Math.abs(Math.atan2(Math.sin(s.heading-heading),Math.cos(s.heading-heading)))<1e-7)continue;
    let selected:any;
    for(const delta of [0,-5,5,-12,12,-25,25,-45,45,-80,80,-120,120,-180,180])for(const gap of [-.45,.8,1.5,3,5,8])for(const side of [1,-1]){
      const station=Math.max(2,Math.min(length-2,(s.stationMetres??0)+delta));
      if(gap<0&&(s.laneDirection==='reverse'?road.shoulders?.left??0:road.shoulders?.right??0)<1.2)continue;
      const placement=brushPosition(c,{mode:'SINGLE',type:'roadSign',roadId:road.id,heightMode:'ROAD_SURFACE',orientation:'FACE_TRAFFIC',direction:s.laneDirection,lateralOffset:gap},station,(s.laneDirection==='reverse'?-1:1)*side),next={...s,position:placement.position,heading:placement.rotation,stationMetres:station};
      if(s.postBaseY!==undefined)next.postBaseY=placement.position.y;
      const a=sampleAt(path,Math.max(0,station-25)).tangent,b=sampleAt(path,Math.min(length,station+25)).tangent,turn=(a.x*b.z-a.z*b.x)*(s.laneDirection==='reverse'?-1:1);
      if(s.type==='CHEVRON'&&Math.abs(turn)>=.001)next.chevronDirection=turn>0?'right':'left';
      if(safe(next)&&!illegal(next)){
        const score=Math.hypot(next.position.x-s.position.x,next.position.z-s.position.z);
        if(!selected||score<selected.score)selected={...next,score};
      }
    }
    if(selected){const {id,score,...properties}=selected;ops.push({op:'modifySign',id,properties});}else unresolved.push(s.id);
  }
  save(mode+'-unresolved',unresolved);tx(mode==='safety-min'?'safety-minimal-displacement':'safety-sign-clearances',ops,{unresolved});
}
if(mode==='last-signals'){
  const id='urban-junction-234',j=k.data.intersections.find(j=>j.id===id)!,c=analysisContext(k.data),signal=signalApproach(k.data,j,'east'),o=editableObjects(c).find(o=>o.id===`signal:${id}:east`)!;
  save('last-signal-detail',k.inspectObject(o.id));
  const candidates:any[]=[];
  for(const along of [3,6,10,16,24,32,45,60,80])for(const gap of [1,2,4,7,12,18])for(const height of [signal.height,5.8,4.8]){
    if(j.signals?.profile&&height<7.2)continue;
    const position={x:signal.mouth.x+signal.outward.x*along+signal.right.x*(signal.roadWidth/2+gap),y:j.position.y??0,z:signal.mouth.z+signal.outward.z*along+signal.right.z*(signal.roadWidth/2+gap)},candidate={...o,position,rotation:signal.expectedHeading,size:{...o.size,height}};
    if(!objectIssues(c,candidate).some(i=>i.severity!=='info'))candidates.push({position,height,score:along+gap+Math.abs(height-signal.height)*5});
  }
  const selected=candidates.sort((a,b)=>a.score-b.score)[0];if(selected)tx('signal-port-works-visible',[{op:'setSignalPlacement',intersectionId:id,approach:'east',position:selected.position,heading:signal.expectedHeading,poleHeight:selected.height}],{signal,selected});
  const badSign='topology-sign:urban-junction-127|v4-diagonal-split-split-2-split|start:URBAN_DIRECTION';
  tx('remove-redundant-obstructing-sign',[{op:'removeObject',id:badSign}],k.inspectObject(badSign));
}
if(mode==='supports'){
  const c=analysisContext(k.data),terrain=regionalTerrainSampler(k.data),groups=new Map<string,string[]>();
  for(const o of editableObjects(c)){
    if(o.kind!=='prefab'||!['streetlight','streetlight_small','streetlight_dual','streetlight_highway','guardrail','noise_barrier','guide_sign','traffic_sign','station_platform'].includes(o.type))continue;
    const ground=terrain.heightAt(o.position.x,o.position.z),y=o.position.y??0;if(Math.abs(y-ground)<.4)continue;
    const supported=c.nearRoads(o.position,60).some(hit=>{
      if(Math.abs((hit.point.y??0)-y)>.35)return false;
      const road=hit.road,edges=roadEdges(road),sidewalk=road.sidewalk?.enabled?road.sidewalk.width:0,lateral=(o.position.x-hit.point.x)*-hit.tangent.z+(o.position.z-hit.point.z)*hit.tangent.x,along=Math.abs((o.position.x-hit.point.x)*hit.tangent.x+(o.position.z-hit.point.z)*hit.tangent.z);
      return along<.4&&lateral>edges.left-sidewalk-.5&&lateral<edges.right+sidewalk+.5;
    });
    if(supported)continue;
    const key=[Math.floor(o.position.x/2500),Math.floor(o.position.z/2500),o.type].join(':'),ids=groups.get(key)??[];ids.push(o.id);groups.set(key,ids);
  }
  let index=0;
  for(const [key,ids]of groups){
    const context=analysisContext(k.data),objects=editableObjects(context).filter(o=>ids.includes(o.id)),request:any={mode:'REPAIR',type:objects[0]!.type,bbox:bounds(objects.map(o=>o.position),1),objectIds:ids,heightMode:'GROUND',heightOffset:0,orientation:'ROAD_FORWARD',autoAdjust:'ADJUST',maxAutoMove:45,limit:5000},plan=k.planBrush(request),ops=[...plan.operations];
    const repaired=new Set(plan.candidates.filter(o=>o.state!=='INVALID').map(o=>o.id));
    for(const o of objects)if(!repaired.has(o.id))ops.push({op:'removeObject',id:o.id});
    tx('support-foundations-'+index++,ops,{key,request,plan});
  }
  const platform=k.data.objects.find(o=>o.id==='v61-station-platform--1-340');if(platform){
    const plan=k.planBrush({mode:'REPAIR',type:'station_platform',objectIds:[platform.id],bbox:bounds([platform.position],1),heightMode:'GROUND',autoAdjust:'ADJUST',maxAutoMove:45});
    tx('station-platform-carriageway',plan.operations,{plan});
  }
}
if(mode==='compact-boards'){
  const c=analysisContext(k.data),ids=['topology-sign:urban-junction-133|v5-civic-south|start:URBAN_DIRECTION','topology-sign:urban-junction-180|v5-civic-south-split-4|start:URBAN_DIRECTION'],ops:EditorCommand[]=[],review:any[]=[];
  for(const id of ids){
    const s=k.data.signs!.find(s=>s.id===id);if(!s)continue;
    const record=editableObjects(c).find(o=>o.id===id)!,anchor=deriveAnchor(c,record)!,road=c.road(s.roadId),length=polylineLength(c.path(road.id)),candidates:any[]=[];
    for(const delta of [0,-5,5,-15,15,-30,30,-60,60])for(const gap of [2,3,5,8])for(const side of [1,-1]){
      const station=Math.max(2,Math.min(length-2,anchor.station+delta)),placement=brushPosition(c,{mode:'SINGLE',type:'roadSign',roadId:road.id,heightMode:'ROAD_SURFACE',orientation:'FACE_TRAFFIC',direction:s.laneDirection,lateralOffset:gap},station,(s.laneDirection==='reverse'?-1:1)*side),next={...s,template:'ramp-confirmation' as const,size:'small' as const,position:placement.position,heading:placement.rotation,stationMetres:station,postOffset:undefined,gantryPosts:undefined,postBaseY:undefined};
      const overlay=Object.create(c);Object.defineProperty(overlay,'map',{value:{...k.data,signs:[next]}});
      if(objectIssues(overlay,{...record,position:next.position,rotation:next.heading}).some(i=>i.severity!=='info'&&i.code!=='roadSign.wrongSide'))continue;
      candidates.push({next,score:Math.hypot(next.position.x-s.position.x,next.position.z-s.position.z)});
    }
    const best=candidates.sort((a,b)=>a.score-b.score)[0];review.push({id,before:s,selected:best});
    if(best){const {id,...properties}=best.next;ops.push({op:'modifySign',id,properties});}else ops.push({op:'removeObject',id});
  }
  tx('compact-roadside-guides-under-bridge',ops,review);
  const platform=k.data.objects.find(o=>o.id==='v61-station-platform--1-340');if(platform){
    const context=analysisContext(k.data),record=editableObjects(context).find(o=>o.id===platform.id)!,anchor=deriveAnchor(context,record)!,length=polylineLength(context.path(anchor.anchorRoadId)),candidates:any[]=[];
    for(const delta of [0,-5,5,-15,15,-30,30])for(const gap of [12,16,22,30]){
      const at=brushPosition(context,{mode:'SINGLE',type:'station_platform',roadId:anchor.anchorRoadId,heightMode:'GROUND',orientation:'ROAD_FORWARD',lateralOffset:gap},Math.max(0,Math.min(length,anchor.station+delta)),anchor.lateralOffset<0?-1:1),candidate={...record,position:at.position,rotation:at.rotation};
      if(objectIssues(context,candidate).some(i=>i.severity!=='info'))continue;
      candidates.push({candidate,score:Math.hypot(candidate.position.x-record.position.x,candidate.position.z-record.position.z)});
    }
    const best=candidates.sort((a,b)=>a.score-b.score)[0];if(best)tx('station-roof-clearance',[{op:'modifyObject',id:platform.id,properties:{position:best.candidate.position,rotation:best.candidate.rotation}}],{record,best});
  }
}
