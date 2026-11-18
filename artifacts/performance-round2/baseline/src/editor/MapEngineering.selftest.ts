import { newCityMap } from '../world/city/CityMapData';
import { CityEditingKernel } from './CityEditingKernel';
import { MapAnalysisContext } from './MapAnalysis';
import { profileIssues, repairConstrainedProfile } from './RoadProfileAnalysis';
import { semanticDiff, diagnosticDelta } from './MapReview';
import { objectIssues, objectRecord } from './ObjectAnalysis';
import { brushPosition, placementIssues, type PlacementBrushRequest } from './PlacementBrush';
import { loadCityMap } from '../world/city/CityMapLoader';
import { sampleAt } from '../world/city/geometry';
import { CityEditorScene } from './CityEditorScene';
export {runRoadQualitySelfTest} from './CityEditingKernel.selftest';

export function engineeringFixture(){
  const kernel=new CityEditingKernel(newCityMap());
  kernel.apply([
    {op:'createRoad',id:'local',points:[{x:0,y:0,z:0},{x:600,y:0,z:0}],properties:{curve:'polyline'},crossing:'none'},
    {op:'createRoad',id:'wave',points:[0,1,2,1.8,3,4,5].map((y,i)=>({x:i*40,y,z:300})),properties:{curve:'polyline'},crossing:'none'},
    {op:'createRoad',id:'deck',points:[{x:0,y:12,z:80},{x:600,y:12,z:80}],properties:{curve:'polyline',structure:{piersEnabled:false}},crossing:'none'},
    {op:'createRoad',id:'tunnel',points:[{x:0,y:-6,z:160},{x:600,y:-6,z:160}],properties:{curve:'polyline',structure:{enclosure:{kind:'tunnel',clearance:5}}},crossing:'none'},
    {op:'createRoad',id:'main',preset:'expressway6',points:[{x:0,y:8,z:500},{x:1200,y:8,z:500}],properties:{curve:'polyline',travelDirection:'forward',laneCount:3},crossing:'none'},
    {op:'createRoad',id:'front',preset:'frontage2',points:[{x:0,y:0,z:550},{x:1200,y:0,z:550}],properties:{curve:'polyline'},crossing:'none'},
  ]);
  kernel.apply({op:'createRamp',id:'access',fromRoadId:'main',toRoadId:'front',fromDistance:200,toDistance:300,kind:'off',lanes:1});
  kernel.apply({op:'createRoad',id:'cross',points:[{x:400,y:0,z:-150},{x:400,y:0,z:150}],properties:{curve:'polyline'},crossing:'none'});
  kernel.apply({op:'createIntersection',id:'j',position:{x:400,y:0,z:0},roadIds:['local','cross'],signalized:true});
  kernel.apply({op:'setRoadName',id:'local',nameId:'local-name',entry:{primaryText:'测试路',kind:'urban'}});
  kernel.apply([
    {op:'placeObject',properties:{id:'bad-tree',prefabId:'tree',position:{x:80,y:0,z:0},rotation:0}},
    {op:'placeObject',properties:{id:'good-tree',prefabId:'tree',position:{x:140,y:0,z:15},rotation:0}},
    {op:'placeObject',properties:{id:'under-deck',prefabId:'tree',position:{x:80,y:0,z:80},rotation:0}},
    {op:'placeObject',properties:{id:'tunnel-pole',prefabId:'streetlight',position:{x:80,y:-6,z:160},rotation:0}},
    {op:'placeObject',properties:{id:'building',prefabId:'residential_low',position:{x:220,y:0,z:7},rotation:0}},
    {op:'createSign',id:'sign',roadId:'local',station:200,properties:{heading:0}},
  ]);
  return kernel;
}
export function runMapEngineeringSelfTest(){
  let checks=0;const check=(condition:unknown,message:string)=>{checks++;if(!condition)throw new Error('Engineering: '+message);};
  const kernel=engineeringFixture(),context=new MapAnalysisContext(kernel.data);
  const profile=kernel.inspectProfile('wave');check(profile.samples.length>10&&profile.metrics.extremaCount===2,'profile samples, station, grade and isolated local extrema');
  check(profileIssues(context,'wave').some(i=>i.code==='vertical.localExtremum'&&!i.constraintDriven),'single crest/sag produces structured repair candidate');
  const constrained=structuredClone(kernel.data);constrained.roads.push({id:'crossing-constraint',roadClass:'local',centerline:[{x:80,y:-6,z:270},{x:80,y:-6,z:330}],curve:'polyline',elevationMode:'custom',laneCount:2,laneWidth:3.6,travelDirection:'two-way',speedLimit:30});
  const constrainedContext=new MapAnalysisContext(constrained);
  check(profileIssues(constrainedContext,'wave').some(i=>i.constraintDriven),'crossing-driven extremum is distinguished');
  const repair=repairConstrainedProfile(constrainedContext,'wave',{start:40,end:160,strategy:'smoothLocalExtremum',maxGrade:.08});
  check(repair.points[0]!.y===0&&repair.points.at(-1)!.y===5,'interval exterior elevation retained');
  check(Math.abs((sampleAt(repair.points,80).point.y??0)-2)<1e-8,'crossing hard anchor retained');
  check(kernel.inspectRamp('access').sourceRoadId!==null,'ramp source, target and role inspection');
  const mainId=kernel.inspectRamp('access').sourceRoadId!,frontId=kernel.inspectRamp('access').targetRoadId!;
  const windows=kernel.accessWindows({mainline:mainId,frontage:frontId,minLength:20,buffer:20});check(Array.isArray(windows.events)&&Array.isArray(windows.candidateWindows),'ramp spatial conflict/access windows query');
  check(kernel.queryObjects({roadId:'local',radius:25}).objects.some(o=>o.id==='bad-tree'),'object query near road');
  check(kernel.inspectObject('bad-tree').issues.some(i=>i.code==='tree.insideLane'),'object inside carriageway');
  check(kernel.inspectObject('sign').issues.some(i=>i.code==='roadSign.wrongFacing'),'sign facing uses actual tangent');
  const signal=kernel.queryObjects({intersectionId:'j',type:'trafficLight'}).objects[0]!;check(!!signal,'derived traffic light is queryable');
  const signalMove=kernel.preview({op:'rotateObject',id:signal.id,rotation:signal.rotation+Math.PI});check(signalMove.valid,'traffic light transform preview');
  const signalAfter=new MapAnalysisContext(kernel.previewSnapshot(signalMove.id));check(objectIssues(signalAfter,objectRecord(signalAfter,signal.id)).some(i=>i.code==='trafficLight.wrongFacing'),'traffic light facing regression');kernel.cancelPreview();
  check(kernel.inspectObject('building').issues.some(i=>i.code==='building.intersectsRoad'),'approximate building bounds conflict');
  check(!kernel.inspectObject('under-deck').issues.some(i=>i.code==='object.intersectsRoadStructure'||i.code==='tree.insideLane'),'tree below elevated deck is not an XZ-only conflict');
  check(kernel.inspectObject('tunnel-pole').issues.some(i=>i.code==='structure.surfaceObjectInsideTunnel'),'ordinary streetlight in tunnel is diagnosed');
  check(kernel.inspectStructure('tunnel').ceilingCoverage?.derived,'structure inspection reuses runtime enclosure intent');
  const before=JSON.stringify(kernel.data),batch=kernel.preview([{op:'moveObject',id:'bad-tree',delta:{x:0,y:0,z:14}},{op:'reanchorObject',id:'sign',strategy:'fixFacing'}]);
  check(batch.valid&&JSON.stringify(kernel.data)===before,'batch preview read-only');const review=kernel.reviewPreview(batch.id);check(review.diff.objects.modified.some(o=>o.id==='bad-tree'&&o.displacement===14),'semantic object displacement');
  check(review.issueDiff.resolved.some(i=>i.code==='tree.insideLane'),'diagnostic before/after issue diff');kernel.commit(batch.id);check(kernel.undo()&&JSON.stringify(kernel.data)===before,'batch one atomic undo');
  const beforeData=kernel.data;const brushBase:PlacementBrushRequest={mode:'RANGE',type:'streetlight',roadId:'local',stationStart:30,stationEnd:120,spacing:30,side:'both',lateralOffset:3,seed:42,autoAdjust:'SKIP',minDistanceToIntersection:10};
  const plan=kernel.planBrush(brushBase);check(plan.stats.planned===8&&plan.stats.valid===8,'both-side road-relative spacing and batch planning');
  check(plan.candidates[0]!.position.z<0&&plan.candidates[1]!.position.z>0,'left/right sides');
  const jitter={...brushBase,type:'tree' as const,randomPositionJitter:1,randomRotationJitter:.5,randomScaleJitter:.15};check(JSON.stringify(kernel.planBrush(jitter))===JSON.stringify(kernel.planBrush(jitter)),'deterministic seeded jitter');
  const height=brushPosition(context,{...brushBase,heightMode:'ABSOLUTE',height:10,heightOffset:.25},50,1);check(height.position.y===10.25,'absolute height plus offset');
  check(brushPosition(context,{...brushBase,roadId:'deck',heightMode:'ROAD_DECK',heightOffset:.2},50,1).position.y===12.2,'deck height mode');
  check(brushPosition(context,{...brushBase,heightMode:'SIDEWALK'},50,1).position.y===.15,'sidewalk height mode');
  check(brushPosition(context,{...brushBase,orientation:'FACE_TRAFFIC'},50,1).rotation===-Math.PI/2,'traffic-facing orientation');
  const invalid=kernel.planBrush({...brushBase,mode:'SINGLE',side:'right',stationStart:60,lateralOffset:-3.6,autoAdjust:'STRICT'});check(!invalid.valid&&invalid.candidates[0]!.issues.some(i=>i.code==='streetlight.insideLane'),'strict carriageway rejection');
  const adjusted=kernel.planBrush({...brushBase,mode:'SINGLE',side:'right',stationStart:60,lateralOffset:-1,autoAdjust:'ADJUST',maxAutoMove:5});check(adjusted.stats.adjusted===1&&adjusted.candidates[0]!.autoMove<=5,'bounded lateral auto-adjust');
  const noMove=kernel.planBrush({...brushBase,mode:'SINGLE',side:'right',stationStart:60,lateralOffset:-3.6,autoAdjust:'ADJUST',maxAutoMove:.1});check(noMove.stats.invalid===1,'maxAutoMove respected');
  const brushPreview=kernel.preview({op:'brushObjects',brush:brushBase});check(brushPreview.valid&&kernel.data===beforeData,'brush batch preview does not mutate source');
  check(JSON.stringify((brushPreview.metrics!.brush as any).candidates)===JSON.stringify(plan.candidates),'Editor/kernel/CLI brush command shares candidate legality');
  const scene=new CityEditorScene(kernel);scene.showBrush(invalid.candidates);check(scene.brushGhost.children.some(o=>o.userData.brushCandidate?.state==='INVALID'),'Editor ghost reflects shared legality state');scene.dispose();
  kernel.commit(brushPreview.id);check(kernel.data.objects.length===beforeData.objects.length+8,'brush batch apply');check(kernel.undo()&&kernel.data===beforeData,'brush stroke one undo');
  const repairPlan=kernel.planBrush({mode:'REPAIR',type:'tree',roadId:'local',stationStart:0,stationEnd:200,autoAdjust:'SKIP'});check(repairPlan.candidates.some(c=>c.sourceId==='bad-tree')&&!repairPlan.candidates.some(c=>c.sourceId==='good-tree'),'repair invalid-only leaves valid object untouched');
  const rebrush=kernel.planBrush({mode:'REPLACE',type:'tree',roadId:'local',stationStart:0,stationEnd:200,spacing:25,autoAdjust:'SKIP'});check(rebrush.candidates.length===9&&rebrush.candidates.some(c=>c.sourceId==='bad-tree')&&rebrush.candidates.some(c=>c.sourceId==='good-tree')&&rebrush.stats.added>0,'rebrush resamples spacing while retaining existing identities/variants');
  const sparse=kernel.planBrush({mode:'REPLACE',type:'tree',roadId:'local',stationStart:0,stationEnd:200,spacing:1000});check(sparse.stats.removed===1,'rebrush can remove surplus objects explicitly');
  const rebrushBefore=kernel.data;kernel.apply({op:'brushObjects',brush:{mode:'REPLACE',type:'tree',roadId:'local',stationStart:0,stationEnd:200,spacing:1000}});check(kernel.undo()&&kernel.data===rebrushBefore,'rebrush removals share one transaction/undo');
  const strictBefore=kernel.data,strictPreview=kernel.preview({op:'brushObjects',brush:{...brushBase,mode:'SINGLE',stationStart:60,side:'right',lateralOffset:-3.6,autoAdjust:'STRICT'}});let strictRefused=false;try{kernel.commit(strictPreview.id);}catch{strictRefused=true;}check(!strictPreview.valid&&strictRefused&&kernel.data===strictBefore,'STRICT invalid brush refuses commit atomically');
  const area:PlacementBrushRequest={mode:'AREA',type:'tree',bbox:{minX:20,maxX:40,minZ:25,maxZ:45},density:.01,seed:42};check(JSON.stringify(kernel.planBrush(area))===JSON.stringify(kernel.planBrush(area))&&kernel.planBrush(area).stats.planned===4,'seeded AREA vegetation brush');
  const signalBrush=kernel.planBrush({mode:'SINGLE',type:'trafficLight',intersectionId:'j',orientation:'FACE_TRAFFIC'});check(signalBrush.candidates.length===4&&signalBrush.candidates.every(c=>c.anchor?.anchorIntersectionId==='j'),'semantic signal brush anchors to approaches');
  let freeSignalsRefused=false;try{kernel.planBrush({mode:'LINE',type:'trafficLight',roadId:'local'});}catch{freeSignalsRefused=true;}check(freeSignalsRefused,'traffic lights cannot be freely repeated along roads');
  let unseededRefused=false;try{kernel.planBrush({...brushBase,randomPositionJitter:1,seed:undefined});}catch{unseededRefused=true;}check(unseededRefused,'random brush requires explicit seed');
  let unscopedRefused=false;try{kernel.planBrush({mode:'REPAIR',type:'tree'});}catch{unscopedRefused=true;}check(unscopedRefused,'local repair cannot silently become full-map');
  const nearJunction=kernel.planBrush({...brushBase,mode:'SINGLE',side:'right',stationStart:370,minDistanceToIntersection:50});check(nearJunction.candidates[0]!.issues.some(i=>i.code==='object.intersectionExclusion'),'brush enforces intersection exclusion');
  const beforeAtomic=kernel.data;let batchRefused=false;try{kernel.preview([{op:'moveObject',id:'good-tree',delta:{x:5,z:0}},{op:'moveObject',id:'missing-object',delta:{x:1,z:0}}]);}catch{batchRefused=true;}check(batchRefused&&kernel.data===beforeAtomic,'failed mixed batch keeps source atomic');
  check(semanticDiff(kernel.data,kernel.data,{routes:[{from:'local',to:'cross'}]}).topology.routeChecks[0]!.before,'local directed lane route uses runtime logical network');
  const roundtrip=loadCityMap(JSON.parse(JSON.stringify(kernel.data)));check(semanticDiff(kernel.data,roundtrip).objects.modified.length===0,'portable semantic roundtrip');
  check(diagnosticDelta({issues:[{code:'x',severity:'warning'}]},{issues:[]}).resolved.length===1,'issue comparison resolves removed issue');
  const street=objectRecord(context,'good-tree');check(JSON.stringify(placementIssues(context,street))===JSON.stringify(placementIssues(context,street)),'candidate and existing-object checks use same deterministic legality function');
  const cap={...street,id:'beyond-end',position:{x:-25,y:0,z:300}};
  check(!objectIssues(context,cap).some(i=>i.code==='tree.insideLane'),'finite road endpoint does not extend a fictitious lane behind its cap');
  const closeCrossings=structuredClone(constrained);
  closeCrossings.roads.push({...closeCrossings.roads.find(r=>r.id==='crossing-constraint')!,id:'nearby-crossing',centerline:[{x:80.01,y:-6,z:270},{x:80.01,y:-6,z:330}]});
  const closeRepair=repairConstrainedProfile(new MapAnalysisContext(closeCrossings),'wave',{strategy:'fitBetweenConstraints'});
  check(closeRepair.points.every((p,i,a)=>i===0||Math.hypot(p.x-a[i-1]!.x,p.z-a[i-1]!.z)>=.05),'near-coincident constraints do not create degenerate road nodes');
  check(Math.abs((sampleAt(closeRepair.points,80.01).point.y??0)-(sampleAt(context.path('wave'),80.01).point.y??0))<1e-7,'bracketing constraint nodes preserve the exact crossing elevation');
  const relocated=kernel.preview({op:'modifyRamp',id:'access',from:{roadId:mainId,station:100}});
  const relocatedMap=kernel.previewSnapshot(relocated.id),relocatedMeta=relocatedMap.editing!.ramps.find(r=>r.roadId==='access')!;
  check(relocated.valid&&relocatedMap.roads.filter(r=>r.id==='access').length===1,'station relocation retains the ramp identity without deleting the road');
  const routeDiff=semanticDiff(kernel.data,relocatedMap,{full:true,routes:[{from:mainId,to:frontId}]});
  check(routeDiff.topology.routeChecks[0]!.before&&routeDiff.topology.routeChecks[0]!.after&&!!relocatedMeta.from,'station relocation keeps mainline to frontage directed travel');kernel.cancelPreview();
  kernel.apply({op:'createSign',id:'legal-gantry',roadId:'local',station:150,properties:{template:'gantry',position:{x:150,y:0,z:0},heading:-Math.PI/2,postOffset:16}});
  check(!kernel.inspectObject('legal-gantry').issues.some(i=>i.code==='roadSign.insideLane'),'overhead board centre is legal when its real support clears the lane');
  kernel.apply({op:'modifySign',id:'legal-gantry',properties:{stationMetres:160,position:{x:160,y:0,z:2},heading:-Math.PI/2}});
  check(kernel.getSign('legal-gantry')!.position.z===2&&kernel.getSign('legal-gantry')!.heading===-Math.PI/2,'explicit sign placement and facing survive a simultaneous station update');
  return {passed:true,checks,scenarios:['profile','local extrema','constraints','interval repair','ramps/windows','objects','signals','signs','building bounds','vertical structures','batch/undo','semantic diff','issue diff','brush modes','seed/spacing','height/facing','legality','bounded adjustment','rebrush','invalid-only repair','shared Editor legality']};
}
