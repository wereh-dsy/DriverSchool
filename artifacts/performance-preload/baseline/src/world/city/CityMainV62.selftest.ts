import { InstancedMesh, Mesh, MeshStandardMaterial, Matrix4, Vector3 } from 'three';
import type { CityMapData } from './CityMapData';
import { loadCityMap } from './CityMapLoader';
import { validateMap } from './CityMapValidation';
import { buildCityRoadNetwork } from './CityRoadNetwork';
import { cityMainCrossingIssues } from './CityMain.selftest';
import { roadPoints, polylineLength, sampleAt, rotatePoint } from './geometry';
import { RoadClearance } from './RoadClearance';
import { signDimensions, ROAD_SIGN_POST_Z } from './RoadSignTemplates';
import { resolveSignContent } from './RoadSignData';
import { CityGround } from './CityGround';
import { VehicleCollisionSystem } from '../../vehicle/physics/CollisionSystem';
import { RoutePlanner, roadLabel } from '../navigation/RoutePlanner';
import { PrefabRegistry } from './PrefabRegistry';
import { createSubject3Materials } from '../subject3/materials';
import { expandPreset } from './presets/InfrastructurePresets';
import { cityFeatureCrossings, distanceToCityCorridor } from './maps/CityMainV6Geography';
import { roadPiers } from './RoadInfrastructure';
import { runCityTrafficSignalsSelfTest } from './CityTrafficSignals.selftest';
import { runMapGeometryConsistencySelfTest } from '../navigation/MapGeometryConsistency.selftest';

const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const assert=(ok:unknown,message:string)=>{if(!ok)throw new Error('City V6.2: '+message);};
export function runCityMainV62SelfTest(input:CityMapData,baseline:CityMapData) {
  const map=loadCityMap(input),validation=validateMap(map),roads=map.roads.filter(r=>!r.id.startsWith('regional:')),ids=new Set(baseline.roads.filter(r=>!r.id.startsWith('regional:')).map(r=>r.id));
  assert(validation.valid,JSON.stringify(validation.errors));assert(map.environment.metadata?.cityRefinementMinor==='2','V6.2 marker');
  assert(same(map.regional,baseline.regional),'Regional metadata frozen');let externalRecords=0;
  for(const collection of ['roads','objects','intersections','roadLinks','connectionPorts','signs'] as const)for(const r of baseline[collection]??[]) {
    const external=collection==='roadLinks'?!(r as NonNullable<CityMapData['roadLinks']>[number]).from.roadId.startsWith('regional:')? !ids.has((r as NonNullable<CityMapData['roadLinks']>[number]).to.roadId):true:collection==='connectionPorts'?!ids.has((r as NonNullable<CityMapData['connectionPorts']>[number]).endpoint.roadId):collection==='signs'?!ids.has((r as NonNullable<CityMapData['signs']>[number]).roadId):r.id.startsWith('regional:');
    if(external){assert(same(r,(map[collection]??[]).find(a=>a.id===r.id)),'preserved external '+r.id);externalRecords++;}
  }
  assert(map.objects.length===baseline.objects.length,'no extra buildings/props');
  for(const o of map.objects)assert(same({...o,landmarkModel:undefined},baseline.objects.find(b=>b.id===o.id)),'all authored placements/props preserved '+o.id);
  for(const key of ['districts','corridors','landmarks'] as const)assert(same(map.environment[key],baseline.environment[key]),'frozen '+key);
  let elevatedSamples=0,depressedSamples=0,maxMainGrade=0,maxChangedRampGrade=0;
  const changed=roads.filter(r=>!same(r.centerline,baseline.roads.find(a=>a.id===r.id)?.centerline));
  for(const r of roads) {
    const path=roadPoints(r);for(let i=0;i<path.length;i++) {
      const p=path[i]!;if(r.roadNameId==='east-west-expressway'&&r.laneCount===3&&!r.gore&&Math.abs(p.x)<=1960){assert(Math.abs((p.y??0)-8)<.001,'continuous elevated EW '+r.id);elevatedSamples++;}
      if(r.roadNameId==='north-south-expressway'&&r.laneCount===3&&!r.gore&&p.z>=-500&&p.z<=10){assert(Math.abs((p.y??0)+6.4)<.001,'continuous depressed NS core '+r.id);depressedSamples++;}
      if(i){const a=path[i-1]!,g=Math.abs((p.y??0)-(a.y??0))/Math.hypot(p.x-a.x,p.z-a.z);if(r.laneCount===3&&!r.gore)maxMainGrade=Math.max(maxMainGrade,g);if(changed.includes(r)&&(r.gore||r.type==='ramp_1'))maxChangedRampGrade=Math.max(maxChangedRampGrade,g);}
    }
  }
  assert(elevatedSamples>100&&depressedSamples>100,'both corridor contracts sampled');assert(maxMainGrade<=.0451,'mainline grade '+maxMainGrade);assert(maxChangedRampGrade<=.0801,'changed ramp grade '+maxChangedRampGrade);
  const city={...map,regional:undefined,roads,intersections:map.intersections.filter(j=>!j.id.startsWith('regional:'))};
  const crossings=cityMainCrossingIssues(city);assert(!crossings.length,'clearance\n'+crossings.join('\n'));
  const network=buildCityRoadNetwork(map),graph=new Map(map.roads.map(r=>[r.id,new Set<string>()]));for(const n of network.connectivity)for(const a of n.incomingRoadIds)for(const b of n.outgoingRoadIds)graph.get(a)!.add(b);
  const first=roads.find(r=>r.roadNameId==='central-avenue')!,seen=new Set([first.id]),queue=[first.id];for(let i=0;i<queue.length;i++)for(const id of graph.get(queue[i]!)!)if(!seen.has(id)){seen.add(id);queue.push(id);}
  assert(roads.every(r=>seen.has(r.id)),'all city roads reachable: '+roads.filter(r=>!seen.has(r.id)).map(r=>r.id));
  const additions=roads.filter(r=>r.id.startsWith('v62-')&&r.type==='ramp_1');assert(additions.length===2,'two new directional mainline accesses');
  for(const r of additions){assert(polylineLength(roadPoints(r))>=280,'long access '+r.id);assert(network.laneConnections.some(c=>c.toLaneId.startsWith(r.id+':'))&&network.laneConnections.some(c=>c.fromLaneId.startsWith(r.id+':')),'lane connectivity '+r.id);}
  assert(roads.filter(r=>r.groupId==='system-central').length===8,'eight central turning movements retained');
  const engineering=/高架[南北]路|快速辅路|出口连接路|北连接路/;let unnamed=0,rampLabels=0;
  for(const r of network.segments.filter(r=>!r.id.startsWith('regional:'))){const label=roadLabel(r);assert(!engineering.test(label),'clean display '+r.id+' '+label);if(label==='未命名道路')unnamed++;if(label==='匝道')rampLabels++;}
  assert(unnamed>=10&&rampLabels>=40,'unnamed and ramp fallbacks');
  for(const s of map.signs!.filter(s=>!s.roadId.startsWith('regional:')))assert(!engineering.test(JSON.stringify(resolveSignContent(s,map.roadNames!))),'clean sign text '+s.id);
  const urbanBoards=map.signs!.filter(s=>s.urbanLayout);assert(urbanBoards.length>100&&urbanBoards.every(s=>s.size==='large'&&!s.roadId.startsWith('regional:')),'City-only large junction diagram boards');
  let rampSafetySigns=0;
  for(const s of map.signs!.filter(s=>!s.roadId.startsWith('regional:')&&['SPEED_LIMIT','CHEVRON'].includes(s.type))) {
    const r=roads.find(r=>r.id===s.roadId)!;if(!(r.gore||r.type==='ramp_1'))continue;
    const sample=sampleAt(roadPoints(r),s.stationMetres!),direction=s.laneDirection==='reverse'?-1:1,tangent={x:sample.tangent.x*direction,z:sample.tangent.z*direction},dx=s.position.x-sample.point.x,dz=s.position.z-sample.point.z;
    assert(Math.abs(dx*tangent.x+dz*tangent.z)<.001,'ramp board anchored at actual station '+s.id);
    assert(Math.cos(s.heading-Math.atan2(-tangent.x,-tangent.z))>.9999,'ramp board faces approaching travel '+s.id);
    assert(Math.abs((s.position.y??0)-(sample.point.y??0))<.001,'ramp board follows deck height '+s.id);rampSafetySigns++;
  }
  const planner=new RoutePlanner(network),from=planner.matches(-600,-130,80,{x:-600,y:8,z:-130,yaw:-Math.PI/2})[0],to=planner.matches(1000,-142,80,{x:1000,y:8,z:-142,yaw:-Math.PI/2})[0];
  assert(from&&to,'route test anchors');const route=planner.plan(from!.location,to!.location),renamed=new RoutePlanner({...network,segments:network.segments.map(r=>({...r,name:'任意显示名称'}))}).plan(from!.location,to!.location);
  assert(route&&renamed&&same(route.sections.map(s=>s.road.id),renamed.sections.map(s=>s.road.id))&&route.distance===renamed.distance,'routing independent of player labels');
  const clearance=new RoadClearance(map);let signPosts=0;
  for(const s of urbanBoards){const dim=signDimensions(s.template,s.size,s.postOffset),y=s.position.y??0;for(let x=-dim.width/2;x<=dim.width/2+.01;x+=1){const q=rotatePoint({x,z:0},s.heading);assert(!clearance.roadAt({x:s.position.x+q.x,z:s.position.z+q.z},.2,y+dim.bottom-4.5,y+dim.bottom+dim.height+.2),'urban board leaves traffic clearance on every layer '+s.id);}}
  let railOver=0,railUnder=0,riverCrossings=0,railBridgePiers=0;
  for(const feature of map.environment.corridors!)for(const r of roads) {
    const crossings=cityFeatureCrossings(r,feature.centerline);
    for(const c of crossings) {
      const y=c.point.y??0;
      if(feature.kind==='railway'){assert(Math.abs(y)>=6.1,'rail clearance '+r.id);if(y>0)railOver++;else railUnder++;}
      else {assert(y>=2.9,'river clearance '+r.id);riverCrossings++;}
    }
    if(feature.kind==='railway'&&crossings.length)for(const p of roadPiers(r,map,clearance)) {
      assert(distanceToCityCorridor(p.position,feature.centerline)>=7,'pier outside railway '+r.id);railBridgePiers++;
    }
  }
  assert(railOver>0&&railUnder>0&&riverCrossings>0,'retained rail/river crossings');
  for(const s of map.signs!.filter(s=>!s.roadId.startsWith('regional:'))){const dim=signDimensions(s.template,s.size,s.postOffset,s.gantryPosts,s.mountHeight),base=s.postBaseY??s.position.y??0;for(const x of dim.posts){const q=rotatePoint({x,z:ROAD_SIGN_POST_Z},s.heading),p={x:s.position.x+q.x,z:s.position.z+q.z};assert(!clearance.roadAt(p,.65,base-.15,(s.position.y??0)+dim.poleTop,undefined,undefined,true)&&!clearance.junctionAt(p,.65,base-.15,(s.position.y??0)+dim.poleTop),'sign post '+s.id);signPosts++;}}
  const materials=createSubject3Materials(),registry=new PrefabRegistry(materials),trees=map.objects.filter(o=>!o.id.startsWith('regional:')&&o.prefabId==='tree'),lamps=map.objects.filter(o=>!o.id.startsWith('regional:')&&o.prefabId.startsWith('streetlight'));
  const root=registry.buildInstances([...trees,...lamps]);let batches=0,lampBatches=0,treeBatches=0;const lampHeights:number[]=[],matrix=new Matrix4(),position=new Vector3();
  const landmarks=map.objects.filter(o=>o.landmarkModel);assert(landmarks.length===8&&new Set(landmarks.map(o=>o.landmarkModel)).size===8,'eight distinct existing landmark silhouettes');
  const landmarkRoot=registry.buildInstances(landmarks);let landmarkBatches=0;
  landmarkRoot.traverse(o=>{if(o instanceof Mesh){assert(o instanceof InstancedMesh,'landmark static batching');landmarkBatches++;const logical=landmarks.find(p=>p.id===o.userData.cityObjectIds[0])!,size=registry.entries.get(logical.prefabId)!.size;o.geometry.computeBoundingBox();const bounds=o.geometry.boundingBox!;assert(bounds.min.x>=-size[0]/2-.1&&bounds.max.x<=size[0]/2+.1&&bounds.min.z>=-size[2]/2-.1&&bounds.max.z<=size[2]/2+.1&&bounds.min.y>=-.1&&bounds.max.y<=size[1]+.1,'landmark within existing collision envelope '+logical.id);}});
  landmarkRoot.traverse(o=>{if(o instanceof InstancedMesh)o.dispose();});
  root.traverse(o=>{if(o instanceof Mesh){assert(o instanceof InstancedMesh,'no per-object tree/lamp hierarchy');batches++;if(o.name==='tree instances'){treeBatches++;assert(o.geometry.hasAttribute('color')&&o.material instanceof MeshStandardMaterial&&o.material.vertexColors,'one shared colored tree geometry');}if(o.userData.environmentLamp){lampBatches++;for(let i=0;i<(o as InstancedMesh).count;i++){(o as InstancedMesh).getMatrixAt(i,matrix);const logical=lamps.find(p=>p.id===o.userData.cityObjectIds[i])!,head=logical.prefabId==='streetlight'?7.16:logical.prefabId==='streetlight_dual'?9.65:logical.prefabId==='streetlight_highway'?11.65:4.65;lampHeights.push(Math.abs(position.setFromMatrixPosition(matrix).y-((logical.position.y??0)+head*(logical.scale?.y??1))));}}}});
  assert(treeBatches===1&&batches<=9&&lampBatches<=4,'consolidated tree/lamp kit');assert(lampHeights.every(error=>error<.001),'emissive/lamp sampling stays at head height');root.traverse(o=>{if(o instanceof InstancedMesh)o.dispose();});registry.dispose();Object.values(materials).forEach(m=>m.dispose());
  const defaults=expandPreset('system_compact_x'),explicit=expandPreset('system_compact_x',{rightApproach:160});assert(same(defaults,explicit),'default preset geometry unchanged');
  const ground=new CityGround(map,{loadRadius:0}),collision=new VehicleCollisionSystem(ground.colliders);let contactSamples=0;
  try{for(const r of changed){const path=roadPoints(r),L=polylineLength(path);for(let d=10;d<L-10;d+=30)for(let lane=0;lane<r.laneCount;lane++){const s=sampleAt(path,d),offset=-r.laneCount*r.laneWidth/2+(lane+.5)*r.laneWidth,p={x:s.point.x-s.tangent.z*offset,y:s.point.y??0,z:s.point.z+s.tangent.x*offset,yaw:Math.atan2(-s.tangent.x,-s.tangent.z)};
    for(const across of [-.85,.85])for(const along of [-1.45,1.45]){const q=ground.sampleRoadSurface(p.x-s.tangent.z*across+s.tangent.x*along,p.z+s.tangent.x*across+s.tangent.z*along,undefined,p.y);assert(q.surfaceType==='asphalt'&&Math.abs(q.height-p.y)<.3,'four-wheel support '+r.id+' '+d+' '+p.y+'/'+q.height);}
    const hit=collision.resolve({previousPose:p,pose:p,velocity:{x:0,z:0},dimensions:{width:2.02,length:5.05,height:1.95},dt:1/120});assert(!hit.collided,'vehicle corridor '+r.id+' '+d+': '+hit.contacts.map(c=>c.colliderId).join(', '));contactSamples++;
  }}}finally{ground.dispose();}
  return {schemaErrors:validation.errorCount,warnings:validation.warningCount,externalRecords,preservedObjectPlacements:map.objects.length,landmarkModels:landmarks.length,landmarkBatches,elevatedSamples,depressedSamples,maxMainGrade,maxChangedRampGrade,crossingIssues:crossings.length,railOver,railUnder,riverCrossings,railBridgePiers,newAccess:additions.map(r=>r.id),unnamed,rampLabels,signPosts,urbanBoards:urbanBoards.length,rampSafetySigns,staticKit:{batches,treeBatches,lampBatches},contactSamples,cityLoadRelease:'passed',signals:runCityTrafficSignalsSelfTest(map),geometry:runMapGeometryConsistencySelfTest(map)};
}
