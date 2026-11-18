import { CityEditingKernel } from './CityEditingKernel';
import { newCityMap } from '../world/city/CityMapData';
import { loadCityMap } from '../world/city/CityMapLoader';
import { validateMap, saveMap } from '../world/city/MapAPI';
import { buildCityRoadNetwork } from '../world/city/CityRoadNetwork';
import { distance, roadPoints, project, maxGrade } from './EditorGeometry';
import { snapCandidates } from './EditorSnap';
import smallMap from './maps/editor-test.json';
import type { EditorCommand } from './EditorCommands';
import type { CityMapData, CityPoint } from '../world/city/CityMapData';
import { roadFunction } from '../world/city/RoadClassification';
import { CityEditorScene } from './CityEditorScene';
import { InstancedMesh, Mesh, Vector3 } from 'three';
import { resolveSignContent } from '../world/city/RoadSignData';
import { smoothAlignment, repairElevation } from './RoadRepair';
import { sampleAt } from '../world/city/geometry';
import { IntersectionBuilder } from '../world/city/IntersectionBuilder';
import { junctionSurfaceContains } from '../world/city/JunctionSurface';
import { createSubject3Materials } from '../world/subject3/materials';

export function runEditorSelfTest(){
  let checks=0;
  const assert=(condition:unknown,message:string)=>{checks++;if(!condition)throw new Error(`Editor: ${message}`);};
  const kernel=new CityEditingKernel(loadCityMap(smallMap)),before=JSON.stringify(kernel.data),untouched=kernel.data.roads[1];
  const cross:EditorCommand={op:'createRoad',id:'cross',points:[{x:0,y:0,z:-150},{x:0,y:0,z:150}],preset:'local'};
  const preview=kernel.preview(cross,'Crossing');assert(preview.valid,'cross preview valid');assert(JSON.stringify(kernel.data)===before,'preview does not mutate data');
  assert(preview.created.includes('cross')&&kernel.previewData(preview.id).intersections.length===1,'ghost includes road and intersection');
  kernel.commit(preview.id);assert(kernel.data.intersections[0]?.connections.length===4,'one four-arm intersection');
  assert(kernel.data.roads.find(r=>r.id==='expressway')===untouched,'unrelated object reference preserved');
  assert(kernel.getCorridor('avenue-corridor')?.roadIds.length===2,'split retains corridor membership');
  const graph=buildCityRoadNetwork(kernel.data);assert(graph.laneConnections.some(c=>c.intersectionId===kernel.data.intersections[0]!.id),'intersection navigable');
  assert(validateMap(kernel.data).valid,'cross map valid');assert(kernel.undo()&&JSON.stringify(kernel.data)===before,'cross one atomic undo');assert(kernel.redo(),'redo');
  const stale=kernel.preview({op:'moveRoad',id:'cross',delta:{x:10,z:0}});kernel.undo();let rejected=false;try{kernel.commit(stale.id);}catch{rejected=true;}assert(rejected,'stale preview rejected');
  kernel.apply({op:'generateFrontageRoads',id:'expressway-corridor',side:'both',offset:40,preset:'frontage2'},'Frontages');
  assert(kernel.data.editing?.attachments.length===2,'two frontage relationships');
  const attachment=kernel.data.editing!.attachments[0]!,frontage=kernel.getRoad(attachment.roadId)!;
  assert(distance(frontage.centerline[0]!,{x:-450,z:-280})<0.01,'true parallel offset');
  const frontBefore={...frontage.centerline[0]!};kernel.apply({op:'moveCorridor',id:'expressway-corridor',delta:{x:5,y:0,z:10}});
  assert(distance(kernel.getRoad(frontage.id)!.centerline[0]!,{x:frontBefore.x+5,z:frontBefore.z+10})<.01,'attached frontage follows translation');
  kernel.apply({op:'detach',id:frontage.id});kernel.apply({op:'moveCorridor',id:'expressway-corridor',delta:{x:10,z:0}});
  assert(kernel.getRoad(frontage.id)!.centerline[0]!.x===frontBefore.x+5,'detached frontage stays independent');
  const ramp=kernel.preview({op:'createRamp',id:'exit',fromRoadId:'expressway',toRoadId:frontage.id,fromDistance:200,toDistance:550,kind:'off',lanes:2});
  assert(ramp.valid,`ramp preview valid: ${JSON.stringify(ramp.warnings.filter(w=>w.severity==='error'))}`);kernel.commit(ramp.id);
  assert(kernel.getConnectedRoads('exit').length>=2,'ramp linked to both split roads');assert(kernel.data.editing?.ramps.length===1,'ramp stable metadata');
  const handles=kernel.getControlPoints('exit');assert(handles.length===4,'ramp exposes four intentional handles');kernel.apply({op:'editControlPoint',roadId:'exit',index:1,point:{...handles[1]!,x:handles[1]!.x+5}});assert(kernel.getControlPoints('exit')[1]!.x===handles[1]!.x+5,'ramp tangent editable');
  assert(maxGrade(kernel.getRoad('exit')!)<.25,'ramp grade');
  const roundtrip=loadCityMap(JSON.parse(saveMap(kernel.data)));assert(roundtrip.editing?.corridors.length===kernel.data.editing?.corridors.length&&roundtrip.editing?.ramps.length===1,'save/reload relationships');
  const local=kernel.inspectArea({center:{x:0,z:-240},radius:100});assert(!JSON.stringify(local).includes('centerline'),'compact inspection excludes sampled points');
  assert(kernel.findRoads({roadClass:'ramp'}).some(r=>r.id==='exit'),'semantic query');assert(snapCandidates(kernel,{x:-435,y:8,z:-230}).some(c=>c.kind==='endpoint'),'compatible elevation snap');
  const elev=new CityEditingKernel(newCityMap());elev.apply({op:'createRoad',id:'long',points:[{x:-400,y:0,z:0},{x:400,y:0,z:0}]});
  elev.apply({op:'setElevationProfile',id:'long',height:8,start:300,end:500,transition:120});assert(maxGrade(elev.getRoad('long')!)<.12,'elevation transition reasonable');assert(elev.getRoad('long')!.centerline[0]!.y===0,'transition retains untouched endpoint height');
  elev.apply({op:'createGroup',id:'locked',name:'locked interchange',kind:'interchange',memberIds:['long']});elev.apply({op:'setLocked',id:'locked',locked:true});rejected=false;try{elev.apply({op:'moveRoad',id:'long',delta:{x:1,z:0}});}catch{rejected=true;}assert(rejected,'locked group blocks edits');
  elev.apply({op:'setLocked',id:'locked',locked:false});elev.apply({op:'deleteRoad',id:'long'});assert(!elev.getRoad('long'),'delete');elev.undo();assert(!!elev.getRoad('long'),'delete undo');
  const gradeBefore=JSON.stringify(elev.data);const bad=elev.preview({op:'setElevationProfile',id:'long',height:100,start:100,end:105,transition:5});assert(!bad.valid,'impossible grade rejected locally');assert(JSON.stringify(elev.data)===gradeBefore,'failed preview atomic');
  const over=new CityEditingKernel(loadCityMap(smallMap));over.apply({op:'createRoad',id:'over',points:[{x:50,y:0,z:-400},{x:50,y:0,z:400}],crossing:'overpass'});assert(!over.data.intersections.length,'grade separation never creates junction');
  const denied=over.preview({op:'createRoad',id:'illegal',preset:'local',points:[{x:100,y:8,z:-400},{x:100,y:8,z:-100}]});assert(!denied.valid,'same-level expressway crossing requires explicit decision');
  for(const template of ['compact-diamond','diamond','directional-t','ramp-pair'] as const){const k=new CityEditingKernel(newCityMap());const p=k.preview({op:'createInterchange',template,parameters:{position:{x:0,y:0,z:0}}});assert(p.valid,`${template} validates: ${JSON.stringify(p.warnings.filter(w=>w.severity==='error'))}`);k.commit(p.id);assert(loadCityMap(JSON.parse(saveMap(k.data))).roads.length===k.data.roads.length,`${template} portable metadata`);assert(k.data.roads.length>2&&k.data.editing?.groups.length===1,`${template} editable grouped roads`);k.undo();assert(!k.data.roads.length,`${template} atomic undo`);}
  const smooth=new CityEditingKernel(newCityMap());smooth.apply({op:'createRoad',id:'curve',preset:'arterial8',points:[{x:0,y:0,z:0},{x:100,y:0,z:50},{x:200,y:0,z:0}]});assert(roadPoints(smooth.getRoad('curve')!).length>3,'smooth curve and 4+4 preset');smooth.apply({op:'createParallelRoad',id:'curve',side:'right',offset:20,preset:'local'});const generated=smooth.data.roads[1]!;assert(project(roadPoints(smooth.getRoad('curve')!),generated.centerline[10]!).distance>19,'curved parallel geometry');
  const signs=new CityEditingKernel(loadCityMap(smallMap));signs.apply({op:'setRoadName',id:'avenue',nameId:'avenue-name',entry:{primaryText:'人民大道',kind:'urban'}});signs.apply({op:'createSign',id:'name-sign',roadId:'avenue',station:600,properties:{}});const signBefore=signs.getSign('name-sign')!;
  signs.apply({op:'modifyRoad',id:'avenue',properties:{speedLimit:40}});assert(JSON.stringify(signs.getSign('name-sign'))===JSON.stringify(signBefore),'semantic edit preserves sign geometry');
  signs.apply({op:'moveRoad',id:'avenue',delta:{x:10,z:20}});assert(distance(signs.getSign('name-sign')!.position,{x:signBefore.position.x+10,z:signBefore.position.z+20})<.01,'sign follows moved road');
  signs.apply({op:'splitRoad',roadId:'avenue',point:{x:10,y:0,z:20}});assert(signs.getSign('name-sign')!.roadId!=='avenue'&&Math.abs(signs.getSign('name-sign')!.stationMetres!-150)<.01,'split remaps sign ownership and station');
  const newSignRoad=signs.getSign('name-sign')!.roadId;signs.apply({op:'modifySign',id:'name-sign',properties:{stationMetres:100}});assert(signs.getSign('name-sign')!.stationMetres===100,'station edit');
  assert(loadCityMap(JSON.parse(saveMap(signs.data))).signs?.length===1,'sign save/reload');signs.apply({op:'deleteRoad',id:newSignRoad});assert(!signs.getSign('name-sign'),'road deletion removes dependent sign');signs.undo();assert(!!signs.getSign('name-sign'),'sign deletion undo');
  const divided=new CityEditingKernel(newCityMap());divided.apply([{op:'createRoad',id:'pair-a',preset:'frontage2',points:[{x:-300,y:0,z:-10},{x:300,y:0,z:-10}],properties:{travelDirection:'forward',laneCount:2}},{op:'createRoad',id:'pair-b',preset:'frontage2',points:[{x:300,y:0,z:10},{x:-300,y:0,z:10}],properties:{travelDirection:'forward',laneCount:2}}]);
  divided.apply([{op:'setRoadName',id:'pair-a',nameId:'paired',entry:{primaryText:'测试辅路',kind:'urban'}},{op:'setRoadName',id:'pair-b',nameId:'paired',entry:{primaryText:'测试辅路',kind:'urban'}}]);
  divided.apply({op:'createRoad',id:'divided-cross',points:[{x:0,y:0,z:-300},{x:0,y:0,z:300}]});assert(divided.data.intersections.length===1&&divided.data.intersections[0]!.connections.length===6,'paired carriageways share a single six-arm intersection');
  const visual=new CityEditingKernel(loadCityMap(smallMap));visual.apply([{op:'placeObject',properties:{id:'tree-a',prefabId:'tree',position:{x:100,y:0,z:100},rotation:0}},{op:'placeObject',properties:{id:'tree-b',prefabId:'tree',position:{x:120,y:0,z:100},rotation:0}}]);
  const scene=new CityEditorScene(visual);scene.populate(new Vector3(),600);const expresswayRoot=scene.pickTargets.find(r=>r.userData.editorId==='expressway');let batch=false;scene.root.traverse(o=>{if(o instanceof InstancedMesh&&(o.userData.cityObjectIds as string[]|undefined)?.includes('tree-a'))batch=(o.userData.cityObjectIds as string[]).includes('tree-b');});assert(batch,'nearby scenery uses shared instance batches with pick IDs');
  const visualEdit=visual.apply({op:'modifyRoad',id:'avenue',properties:{speedLimit:45}});scene.update(visualEdit);scene.populate(new Vector3(),600);assert(scene.pickTargets.includes(expresswayRoot!),'local scene update retains unrelated road mesh');visual.undo();scene.reconcile();scene.populate(new Vector3(),600);assert(scene.pickTargets.includes(expresswayRoot!),'undo retains unrelated mesh');scene.dispose();
  const extension=new CityEditingKernel(newCityMap());extension.apply({op:'createRoad',id:'extend',points:[{x:0,y:0,z:0},{x:100,y:0,z:0}]});extension.apply({op:'extendRoad',roadId:'extend',end:'end',points:[{x:200,y:0,z:0}]});assert(extension.getRoad('extend')!.centerline.at(-1)!.x===200,'extend retains road ID');extension.apply({op:'splitRoad',roadId:'extend',point:{x:100,y:0,z:0}});extension.apply({op:'mergeRoads',roadIds:['extend','extend-section']});assert(extension.data.roads.length===1&&extension.getRoad('extend')!.centerline.at(-1)!.x===200,'split/merge preserves geometry and original ID');
  return{passed:true,checks,scope:'editor kernel, geometry, topology, agent query, snap, preview/commit, history, frontage/ramp, elevation, group lock, interchanges, portable save'};
}

/** Three real neighborhoods, not an exhaustive map/vehicle validation run. */
export function runCityMainEditorSelfTest(source:unknown){
  const kernel=new CityEditingKernel(loadCityMap(source)),before=kernel.data,road=before.roads.find(r=>roadFunction(r)==='arterial'&&before.intersections.some(j=>j.connections.some(c=>c.roadId===r.id)))!;
  const steps:string[]=[];
  const check=(ok:unknown,message:string)=>{if(!ok)throw new Error('City Main editor: '+message);steps.push(message);};
  const p=kernel.preview({op:'modifyRoad',id:road.id,properties:{speedLimit:road.speedLimit}},'Ordinary intersection');check(p.valid,'ordinary intersection local preview');kernel.commit(p.id);
  check(kernel.undo()&&kernel.data===before,'real-map transaction undo preserves source snapshot');
  const frontage=before.roads.find(r=>roadFunction(r)==='frontage')!;
  check(kernel.findRoads({name:before.roadNames?.[frontage.roadNameId??'']?.primaryText,limit:5}).length>0,'existing Qingjiang road-name query');
  const fp=kernel.preview({op:'modifyRoad',id:frontage.id,properties:{speedLimit:frontage.speedLimit}},'Frontage area');check(fp.valid,'existing expressway/frontage local preview');kernel.cancelPreview();
  const ramp=before.roads.find(r=>roadFunction(r)==='ramp'&&r.centerline.length>4)!;const index=Math.floor(ramp.centerline.length/2),point=ramp.centerline[index]!;
  const rp=kernel.preview({op:'editControlPoint',roadId:ramp.id,index,point:{...point,y:(point.y??0)+0.02}},'Ramp area');check(rp.valid,'existing ramp local geometry edit');kernel.commit(rp.id);
  const unrelated=before.roads.find(r=>r.id!==ramp.id&&!rp.modified.includes(r.id))!;check(kernel.data.roads.find(r=>r.id===unrelated.id)===unrelated,'unrelated City Main geometry shared unchanged');
  check(kernel.data.regional===before.regional,'regional terrain/highway metadata retained by local control edit');
  const local=kernel.inspectArea({id:ramp.id,limit:5});check(local.roads.length===1&&local.signs.length<=30,'compact real-map area/sign inspection');
  const adopted=kernel.listCorridors();check(adopted.some(c=>c.name.includes('快速路')),'existing named expressways become stable corridors');
  const saved=JSON.parse(JSON.stringify(kernel.data)) as CityMapData;check(saved.signs?.length===before.signs?.length&&saved.regional?.highways?.routes.length===before.regional?.highways?.routes.length,'serialization preserves route and sign collections');
  return{passed:true,map:before.name,roads:before.roads.length,signs:before.signs?.length,corridors:adopted.length,steps};
}

/** Focused CLI-first road-quality scenarios; no whole-map or vehicle suites. */
export function runRoadQualitySelfTest(source?:unknown){
  let checks=0;
  const check=(condition:unknown,message:string)=>{checks++;if(!condition)throw new Error('Road quality: '+message);};
  const metric=(summary:any,id:string,group:string,key:string)=>summary.metrics?.[id]?.[group]?.[key];
  // Check exact exterior geometry at both vertex-aligned and interpolated cuts.
  const assertLocalRange=(before:CityPoint[],after:CityPoint[],start:number,end:number,label:string)=>{
    const stations=[0];for(let i=1;i<before.length;i++)stations.push(stations[i-1]!+distance(before[i-1]!,before[i]!));
    const prefix=before.filter((_,i)=>stations[i]!<start),suffix=before.filter((_,i)=>stations[i]!>end);
    check(JSON.stringify(after.slice(0,prefix.length))===JSON.stringify(prefix)&&JSON.stringify(after.slice(after.length-suffix.length))===JSON.stringify(suffix),label+' exterior control points unchanged');
    check(JSON.stringify(after[prefix.length])===JSON.stringify(sampleAt(before,start).point)&&JSON.stringify(after[after.length-suffix.length-1])===JSON.stringify(sampleAt(before,end).point),label+' exact boundary XYZ');
  };
  const localGeometry=[{x:0,y:0,z:0},{x:25,y:4,z:0},{x:50,y:4,z:0},{x:100,y:4,z:12},{x:150,y:5,z:-10},{x:200,y:4,z:0},{x:250,y:4,z:0},{x:300,y:0,z:0}];
  const localSnapshot=JSON.stringify(localGeometry);
  for(const range of [{start:70,end:190},{start:50,end:200}]){
    const alignment=smoothAlignment(localGeometry,{...range,preserveEndpoints:false});
    assertLocalRange(localGeometry,alignment.points,range.start,range.end,'middle smooth');
    check(JSON.stringify(alignment.points)!==localSnapshot,'middle smooth changes interior');
    const elevation=repairElevation(localGeometry,{...range,maxGrade:0.04,monotonic:true,preserveEndpoints:false});
    assertLocalRange(localGeometry,elevation.points,range.start,range.end,'middle elevation');
    check(JSON.stringify(elevation.points)!==localSnapshot,'middle elevation changes interior');
  }
  check(JSON.stringify(localGeometry)===localSnapshot,'local repairs leave source immutable');
  for(const curve of ['polyline','smooth'] as const){
    const local=new CityEditingKernel(newCityMap());
    local.apply([{op:'createRoad',id:'local',points:localGeometry,properties:{curve},crossing:'none'},{op:'createRoad',id:'continuation',points:[localGeometry.at(-1)!,{x:400,y:0,z:0}],crossing:'none'}]);
    local.apply({op:'connectRoads',from:{roadId:'local',end:'end'},to:{roadId:'continuation',end:'start'}});
    local.apply({op:'createCorridor',id:'local-corridor',name:'Local',roadIds:['local']});
    const before=JSON.stringify(local.data),path=roadPoints(local.getRoad('local')!),connections=JSON.stringify(local.data.roadLinks),corridor=JSON.stringify(local.getCorridor('local-corridor')),other=local.data.roads.find(r=>r.id==='continuation');
    for(const op of ['smoothRoad','repairElevation'] as const){
      local.apply({op,id:'local',start:70,end:190});
      assertLocalRange(path,roadPoints(local.getRoad('local')!),70,190,curve+' '+op+' runtime geometry');
      check(JSON.stringify(local.data.roadLinks)===connections&&JSON.stringify(local.getCorridor('local-corridor'))===corridor&&local.data.roads.find(r=>r.id==='continuation')===other,op+' preserves endpoint links, corridor and unrelated road');
      check(local.undo()&&JSON.stringify(local.data)===before,op+' local transaction undo is atomic');
    }
  }
  // --- horizontal repair --------------------------------------------------
  const sharp=new CityEditingKernel(newCityMap());
  sharp.apply({op:'createRoad',id:'sharp',preset:'collector',points:[{x:-120,y:0,z:0},{x:-60,y:0,z:0},{x:-50,y:0,z:45}],properties:{curve:'polyline'},crossing:'none'});
  const sharpDiag=sharp.diagnose({roadId:'sharp'});
  check(sharpDiag.issues.some(issue=>issue.code==='geometry.sharpBend'),'sharp bend detected');
  const sharpRepair=sharp.preview({op:'smoothRoad',id:'sharp',strength:1.2},'Smooth sharp');
  check(sharpRepair.valid,'sharp repair preview valid');
  check(metric(sharpRepair,'sharp','smooth','afterMaxTurnDegrees')<metric(sharpRepair,'sharp','smooth','beforeMaxTurnDegrees'),'sharp repair reduces turn angle');
  sharp.commit(sharpRepair.id);
  check(!sharp.diagnose({roadId:'sharp'}).issues.some(issue=>issue.code==='geometry.sharpBend'),'sharp bend cleared');
  check(sharp.undo(),'sharp repair undo');
  // --- vertical wave ------------------------------------------------------
  const waveHeights=[0,0,2,1,4,3,8,8,8,7,6,7,8,8];
  const wave=new CityEditingKernel(newCityMap());
  wave.apply({op:'createRoad',id:'wave',preset:'collector',points:waveHeights.map((y,i)=>({x:i*30,y,z:0})),properties:{curve:'polyline'},crossing:'none'});
  const waveDiag=wave.diagnose({roadId:'wave'});
  check(waveDiag.issues.some(issue=>issue.code==='vertical.wave'),'vertical wave detected');
  check(!wave.validateRoad('wave').some(issue=>issue.severity==='error'),'wave is legal but low quality');
  const waveRepair=wave.preview({op:'repairElevation',id:'wave',strength:2,maxGrade:0.06},'Repair wave');
  check(waveRepair.valid,'wave repair preview valid');
  check(metric(waveRepair,'wave','elevation','afterGradeReversals')<metric(waveRepair,'wave','elevation','beforeGradeReversals'),'wave repair reduces reversals');
  check(metric(waveRepair,'wave','elevation','afterMaxGrade')<=6.01,'wave repair respects grade target');
  wave.commit(waveRepair.id);
  check(wave.undo(),'wave repair undo');
  const waveSaved=loadCityMap(JSON.parse(saveMap(wave.data)));
  check(waveSaved.roads.some(road=>road.id==='wave'),'wave save/reload');
  // --- ramp ---------------------------------------------------------------
  const rampHeights=[0,0.5,1,0.7,1.5,3,2.8,5,7.5,8];
  const rampMap=new CityEditingKernel(newCityMap());
  rampMap.apply({op:'createRoad',id:'wave-ramp',points:rampHeights.map((y,i)=>({x:i*24,y,z:0})),properties:{curve:'polyline',roadClass:'ramp',laneCount:1,laneWidth:3.75,travelDirection:'forward'},crossing:'none'});
  const rampRepair=rampMap.preview({op:'repairRamp',id:'wave-ramp'},'Repair ramp');
  check(rampRepair.valid,'ramp repair preview valid');
  check(metric(rampRepair,'wave-ramp','ramp','afterMaxGrade')<=metric(rampRepair,'wave-ramp','ramp','beforeMaxGrade')+0.1,'ramp grade does not regress');
  rampMap.commit(rampRepair.id);check(rampMap.undo(),'ramp repair undo');
  // --- ordinary / skew / divided intersections ---------------------------
  const ordinary=new CityEditingKernel(newCityMap());
  ordinary.apply([{op:'createRoad',id:'ordinary-a',points:[{x:-200,y:0,z:0},{x:200,y:0,z:0}],crossing:'none'},{op:'createRoad',id:'ordinary-b',points:[{x:0,y:0,z:-200},{x:0,y:0,z:200}],crossing:'none'}]);
  ordinary.apply({op:'createIntersection',id:'ordinary-j',position:{x:0,y:0,z:0},roadIds:['ordinary-a','ordinary-b']});
  check(ordinary.data.intersections.length===1&&ordinary.data.intersections[0]!.connections.length===4,'ordinary four-arm junction');
  const ordinaryRepair=ordinary.preview({op:'repairIntersection',id:'ordinary-j'},'Repair ordinary');
  check(ordinaryRepair.valid,'ordinary intersection repair valid');ordinary.commit(ordinaryRepair.id);check(ordinary.undo(),'ordinary intersection undo');
  const skew=new CityEditingKernel(newCityMap());
  skew.apply([{op:'createRoad',id:'skew-a',points:[{x:-250,y:0,z:0},{x:250,y:0,z:0}],crossing:'none'},{op:'createRoad',id:'skew-b',points:[{x:-216.5,y:0,z:-125},{x:216.5,y:0,z:125}],crossing:'none'}]);
  skew.apply({op:'createIntersection',id:'skew-j',position:{x:0,y:0,z:0},roadIds:['skew-a','skew-b']});
  const skewDiag=skew.diagnose({intersectionId:'skew-j'});
  check(skewDiag.issues.some(issue=>issue.code==='intersection.acuteApproach'||issue.code==='marking.stopLineDisplaced'),'skew junction diagnosed');
  const skewRepair=skew.preview({op:'repairIntersection',id:'skew-j'},'Repair skew');
  check(skewRepair.valid,'skew intersection repair valid');
  check((skewRepair.metrics?.['skew-j'] as any)?.intersection?.arms===4,'skew repair reports four arms');
  skew.commit(skewRepair.id);check(!skew.validateIntersection('skew-j').some(issue=>issue.severity==='error'),'skew junction valid after repair');check(skew.undo(),'skew intersection undo');
  const divided=new CityEditingKernel(newCityMap());
  divided.apply([{op:'createRoad',id:'divided-a',preset:'frontage2',points:[{x:-300,y:0,z:-10},{x:300,y:0,z:-10}],properties:{travelDirection:'forward',laneCount:2},crossing:'none'},{op:'createRoad',id:'divided-b',preset:'frontage2',points:[{x:300,y:0,z:10},{x:-300,y:0,z:10}],properties:{travelDirection:'forward',laneCount:2},crossing:'none'}]);
  divided.apply([{op:'setRoadName',id:'divided-a',nameId:'divided-pair',entry:{primaryText:'分离主路',kind:'urban'}},{op:'setRoadName',id:'divided-b',nameId:'divided-pair',entry:{primaryText:'分离主路',kind:'urban'}}]);
  divided.apply({op:'createRoad',id:'divided-cross',points:[{x:0,y:0,z:-300},{x:0,y:0,z:300}]});
  check(divided.data.intersections.length===1&&divided.data.intersections[0]!.connections.length===6,'divided carriageway stays one logical junction');
  const dividedDiag=divided.diagnose({intersectionId:divided.data.intersections[0]!.id});
  check(!dividedDiag.issues.some(issue=>issue.code==='intersection.duplicate'),'divided junction not duplicated');
  const dividedRepair=divided.preview({op:'repairIntersection',id:divided.data.intersections[0]!.id},'Repair divided');
  check(dividedRepair.valid,'divided intersection repair valid');divided.commit(dividedRepair.id);check(divided.undo(),'divided intersection undo');
  const materials=createSubject3Materials();
  for(const [label,kernel] of [['ordinary',ordinary],['skew',skew],['divided',divided]] as const){
    const j=structuredClone(kernel.data.intersections[0]!);j.signalized=true;
    const root=new IntersectionBuilder(kernel.data,materials).build(j);root.updateMatrixWorld(true);
    let checked=0;
    for(const connection of j.connections){
      const road=kernel.getRoad(connection.roadId)!,path=roadPoints(road),start=connection.end==='start';
      const mouth=start?path[0]!:path.at(-1)!,neighbour=start?path[1]!:path.at(-2)!;
      const length=distance(mouth,neighbour),d={x:(neighbour.x-mouth.x)/length,z:(neighbour.z-mouth.z)/length};
      const meshes=root.children.filter((o):o is Mesh=>o instanceof Mesh&&o.userData.approachPort===connection.port);
      const vertices=(role:string)=>meshes.filter(o=>o.userData.markingRole===role).flatMap(mesh=>{
        const position=mesh.geometry.getAttribute('position');return Array.from({length:position.count},(_,i)=>root.localToWorld(new Vector3().fromBufferAttribute(position,i)));
      });
      const stop=vertices('stop line'),zebra=vertices('crosswalk');
      if(stop.length)check(stop.every(p=>!junctionSurfaceContains(j,kernel.data,p,0)),label+' stop line stays outside pavement');
      if(!zebra.length)continue;
      const along=(p:{x:number;z:number})=>(p.x-mouth.x)*d.x+(p.z-mouth.z)*d.z;
      check(zebra.every(p=>along(p)>0),label+' zebra stays outside mouth toward approach');
      if(stop.length){check(Math.min(...stop.map(along))>Math.max(...zebra.map(along)),label+' entering order is stop line then zebra then junction');checked++;}
    }
    check(checked>=2,label+' marking order checked on incoming approaches');
    // Exact duplicate stripes would share their geometry irrespective of port.
    const zebras=root.children.filter((o):o is Mesh=>o instanceof Mesh&&o.userData.markingRole==='crosswalk');
    const signatures=zebras.map(o=>JSON.stringify(Array.from(o.geometry.getAttribute('position').array)));
    check(new Set(signatures).size===signatures.length,label+' has no duplicate zebra stripes');
    root.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});
  }
  for(const material of Object.values(materials))material.dispose();
  // --- naming registry ----------------------------------------------------
  const crossNames=new CityEditingKernel(newCityMap());
  crossNames.apply([{op:'createRoad',id:'road-a',points:[{x:0,y:0,z:0},{x:200,y:0,z:0}],crossing:'none'},{op:'createRoad',id:'road-b',points:[{x:0,y:0,z:80},{x:200,y:0,z:80}],crossing:'none'}]);
  crossNames.apply([{op:'setRoadName',id:'road-a',nameId:'a-old',entry:{primaryText:'原名',kind:'urban'}},{op:'setRoadName',id:'road-b',nameId:'b-name',entry:{primaryText:'原名',kind:'urban'}}]);
  crossNames.apply({op:'createSign',id:'b-to-a',roadId:'road-b',station:60,properties:{type:'URBAN_DIRECTION',destinations:[{roadNameId:'a-old',directionId:'a-old',arrow:'left'},{roadNameId:'b-name',arrow:'straight'}],approachRoadNameId:'b-name'}});
  crossNames.apply({op:'createCorridor',id:'a-corridor',name:'原名',roadIds:['road-a']});
  const signGeometry=JSON.stringify({...crossNames.getSign('b-to-a')!,destinations:undefined});
  const crossNameBefore=JSON.stringify(crossNames.data);
  for(const command of [{op:'setRoadName',id:'road-a',nameId:'a-renamed',entry:{primaryText:'新路名',kind:'urban'}},{op:'setCorridorName',id:'a-corridor',nameId:'a-corridor-new',name:'新走廊名'}] as const){
    crossNames.apply(command);
    const sign=crossNames.getSign('b-to-a')!;
    check(sign.destinations[0]!.roadNameId===command.nameId&&sign.destinations[0]!.directionId===command.nameId,'cross-road sign name references follow '+command.op);
    check(JSON.stringify({...sign,destinations:undefined})===signGeometry,'cross-road rename preserves sign geometry and unrelated approach name');
    check(crossNames.getRoad('road-b')!.roadNameId==='b-name'&&sign.destinations[1]!.roadNameId==='b-name'&&crossNames.data.roadNames!['b-name']!.primaryText==='原名','cross-road rename leaves unrelated road and name references unchanged');
    check(resolveSignContent(sign,crossNames.data.roadNames!).destinations[0]!.name===crossNames.data.roadNames![command.nameId]!.primaryText,'cross-road sign text comes from renamed registry entry');
    check(crossNames.undo()&&JSON.stringify(crossNames.data)===crossNameBefore,'cross-road rename and references undo atomically');
  }
  const named=new CityEditingKernel(newCityMap());
  named.apply([{op:'createRoad',id:'n1',points:[{x:0,y:0,z:0},{x:100,y:0,z:0}],crossing:'none'},{op:'createRoad',id:'n2',points:[{x:0,y:0,z:40},{x:100,y:0,z:40}],crossing:'none'}]);
  named.apply([{op:'setRoadName',id:'n1',nameId:'old-name',entry:{primaryText:'旧名',kind:'urban'}},{op:'setRoadName',id:'n2',nameId:'old-name',entry:{primaryText:'旧名',kind:'urban'}}]);
  named.apply({op:'createCorridor',id:'renmin',name:'人民大道',roadIds:['n1','n2']});
  named.apply({op:'createSign',id:'name-sign',roadId:'n1',station:50,properties:{type:'ROAD_NAME',template:'urban-name',destinations:[{roadNameId:'old-name',arrow:'straight'}]}});
  named.apply({op:'setCorridorName',id:'renmin',name:'人民大道',nameId:'renmin-name'});
  check(named.getRoad('n1')!.roadNameId==='renmin-name'&&named.getRoad('n2')!.roadNameId==='renmin-name','corridor name applies to every segment');
  check(named.getRoad('n1')!.displayName===undefined,'registry rename clears stale displayName');
  check(named.getSign('name-sign')!.destinations[0]!.roadNameId==='renmin-name','sign destination follows name id');
  check(resolveSignContent(named.getSign('name-sign')!,named.data.roadNames!).destinations[0]!.name==='人民大道','sign text reads registry');
  const namedNetwork=buildCityRoadNetwork(named.data);
  check(namedNetwork.segments.filter(segment=>segment.id==='n1'||segment.id==='n2').every(segment=>segment.name==='人民大道'),'navigation/minimap network reads registry');
  named.apply({op:'splitRoad',roadId:'n1',point:{x:50,y:0,z:0}});
  const splitSection=named.data.roads.find(road=>road.id.startsWith('n1-section'))!;
  check(splitSection.roadNameId==='renmin-name','split inherits the road name');
  named.apply({op:'createParallelRoad',id:'n2',side:'right',offset:20,preset:'local'});
  const parallel=named.data.roads.find(road=>road.id.startsWith('parallel')||road.id.startsWith('road')&&road.id!=='n1'&&road.id!=='n2')!;
  check(parallel&&parallel.roadNameId===undefined,'parallel road does not inherit the main name');
  const mergeMap=new CityEditingKernel(newCityMap());
  mergeMap.apply([{op:'createRoad',id:'m1',points:[{x:0,y:0,z:0},{x:100,y:0,z:0}],crossing:'none'},{op:'createRoad',id:'m2',points:[{x:100,y:0,z:0},{x:200,y:0,z:0}],crossing:'none'}]);
  mergeMap.apply({op:'connectRoads',from:{roadId:'m1',end:'end'},to:{roadId:'m2',end:'start'}});
  mergeMap.apply({op:'setRoadName',id:'m2',nameId:'merged-name',entry:{primaryText:'合并路',kind:'urban'}});
  mergeMap.apply({op:'mergeRoads',roadIds:['m1','m2']});
  check(mergeMap.getRoad('m1')!.roadNameId==='merged-name','merge keeps the surviving logical name');
  formatRampNoName: {
    const rampKernel=new CityEditingKernel(newCityMap());
    rampKernel.apply([{op:'createRoad',id:'main',points:[{x:-200,y:8,z:0},{x:200,y:8,z:0}],properties:{roadClass:'expressway',laneCount:3,laneWidth:3.75,travelDirection:'forward'},crossing:'none'},{op:'createRoad',id:'front',points:[{x:-200,y:0,z:60},{x:200,y:0,z:60}],properties:{roadClass:'frontage',laneCount:2,laneWidth:3.6,travelDirection:'two-way'},crossing:'none'}]);
    rampKernel.apply({op:'createRamp',id:'off-ramp',fromRoadId:'main',toRoadId:'front',fromDistance:100,toDistance:100,kind:'off',lanes:1});
    check(rampKernel.getRoad('off-ramp')!.roadNameId===undefined,'ramp stays unnamed by default');
  }
  // --- compact diagnostics ------------------------------------------------
  const compact=JSON.stringify(waveDiag);
  check(!compact.includes('"centerline":'),'diagnostics stay compact');
  check(wave.diagnose({roadId:'wave',limit:1}).issues.length===1,'diagnose limit is honoured');
  const scene=new CityEditorScene(named);scene.populate(new Vector3(40,0,20),300);
  scene.showGizmo({x:50,y:0,z:20},{x:1,z:0},'x',20);check(scene.gizmo.children.length>0,'3D gizmo handles exist');
  scene.showBefore({roads:[named.getRoad('n2')!],intersections:[]});check(scene.compare.children.length>0,'before ghost exists');scene.dispose();
  // --- real City Main samples --------------------------------------------
  const real:any[]=[];
  if(source){
    const city=new CityEditingKernel(loadCityMap(source));
    const cityWave=city.diagnose({roadId:'v8-nanjing-road'});
    check(cityWave.issues.some(issue=>issue.code==='vertical.wave'),'City Main wave detected');
    const cityWaveRepair=city.preview({op:'repairElevation',id:'v8-nanjing-road',strength:2,maxGrade:0.06},'City wave');
    check(cityWaveRepair.valid,'City Main wave repair valid');
    check(metric(cityWaveRepair,'v8-nanjing-road','elevation','afterGradeReversals')<metric(cityWaveRepair,'v8-nanjing-road','elevation','beforeGradeReversals'),'City Main wave reversals reduced');
    city.commit(cityWaveRepair.id);check(city.undo(),'City Main wave repair undo');
    const citySharp=city.diagnose({roadId:'v4-west'});
    check(citySharp.issues.some(issue=>issue.code==='geometry.sharpBend'),'City Main sharp bend detected');
    const citySharpRepair=city.preview({op:'smoothRoad',id:'v4-west',strength:1.2},'City sharp');
    check(citySharpRepair.valid,'City Main sharp repair valid');
    check(metric(citySharpRepair,'v4-west','smooth','afterMaxTurnDegrees')<metric(citySharpRepair,'v4-west','smooth','beforeMaxTurnDegrees'),'City Main sharp repaired');city.cancelPreview();
    const cityRamp=city.diagnose({roadId:'system-east:S-to-W-turbine'});
    check(cityRamp.issues.some(issue=>issue.code==='vertical.elevationPointOscillation'||issue.code==='vertical.rampReversal'),'City Main ramp diagnosed');
    const cityRampRepair=city.preview({op:'repairRamp',id:'system-east:S-to-W-turbine'},'City ramp');
    check(cityRampRepair.valid,'City Main ramp repair valid');city.cancelPreview();
    const cityJunction=city.diagnose({intersectionId:'urban-junction-19'});
    check(cityJunction.issues.some(issue=>issue.code==='marking.stopLineDisplaced'||issue.code==='intersection.approachKink'),'City Main junction diagnosed');
    const cityJunctionRepair=city.preview({op:'repairIntersection',id:'urban-junction-19'},'City junction');
    check(cityJunctionRepair.valid,'City Main junction repair valid');city.commit(cityJunctionRepair.id);check(city.undo(),'City Main junction undo');
    check(loadCityMap(JSON.parse(saveMap(city.data))).roads.length===city.data.roads.length,'City Main save/reload');
    real.push('v8-nanjing-road wave','v4-west sharp bend','system-east ramp','urban-junction-19 markings');
  }
  return{passed:true,checks,scenarios:{horizontal:true,vertical:true,ramp:true,ordinary:true,skew:true,divided:true,naming:true,gizmo:true},real};
}
