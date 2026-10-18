import { CityEditingKernel } from './CityEditingKernel';
import { newCityMap } from '../world/city/CityMapData';
import { loadCityMap } from '../world/city/CityMapLoader';
import { validateMap, saveMap } from '../world/city/MapAPI';
import { buildCityRoadNetwork } from '../world/city/CityRoadNetwork';
import { distance, roadPoints, project, maxGrade } from './EditorGeometry';
import { snapCandidates } from './EditorSnap';
import smallMap from './maps/editor-test.json';
import type { EditorCommand } from './EditorCommands';
import type { CityMapData } from '../world/city/CityMapData';
import { roadFunction } from '../world/city/RoadClassification';
import { CityEditorScene } from './CityEditorScene';
import { InstancedMesh, Vector3 } from 'three';

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
