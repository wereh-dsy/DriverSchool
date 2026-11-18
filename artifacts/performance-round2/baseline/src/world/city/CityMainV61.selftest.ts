import { InstancedMesh, Mesh, MeshStandardMaterial } from 'three';
import type { CityMapData } from './CityMapData';
import { loadCityMap } from './CityMapLoader';
import { validateMap } from './CityMapValidation';
import { buildCityRoadNetwork } from './CityRoadNetwork';
import { cityMainCrossingIssues } from './CityMain.selftest';
import { cityFeatureCrossings, distanceToCityCorridor } from './maps/CityMainV6Geography';
import { roadPiers } from './RoadInfrastructure';
import { roadPoints, polylineLength, sampleAt, rotatePoint } from './geometry';
import { RoadClearance } from './RoadClearance';
import { PrefabRegistry } from './PrefabRegistry';
import { createSubject3Materials } from '../subject3/materials';
import { signDimensions, ROAD_SIGN_POST_Z } from './RoadSignTemplates';
import { CityGround } from './CityGround';
import { VehicleCollisionSystem } from '../../vehicle/physics/CollisionSystem';
import { runCityTrafficSignalsSelfTest } from './CityTrafficSignals.selftest';

const assert=(ok:unknown,message:string)=>{if(!ok)throw new Error('City V6.1: '+message);};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function runCityMainV61SelfTest(input:CityMapData,baseline:CityMapData) {
  const map=loadCityMap(input),validation=validateMap(map),oldIds=new Set(baseline.roads.filter(r=>!r.id.startsWith('regional:')).map(r=>r.id));
  assert(validation.valid,JSON.stringify(validation.errors));assert(map.environment.metadata?.cityRefinementMinor==='1','minor refinement version');
  assert(same(map.regional,baseline.regional),'Regional metadata unchanged');let protectedRecords=0;
  for(const collection of ['roads','intersections','objects','roadLinks','connectionPorts','signs'] as const)for(const record of baseline[collection]??[]) {
    const external=collection==='roadLinks'?(!oldIds.has((record as NonNullable<CityMapData['roadLinks']>[number]).from.roadId)||!oldIds.has((record as NonNullable<CityMapData['roadLinks']>[number]).to.roadId)):collection==='connectionPorts'?!oldIds.has((record as NonNullable<CityMapData['connectionPorts']>[number]).endpoint.roadId):collection==='signs'?!oldIds.has((record as NonNullable<CityMapData['signs']>[number]).roadId):record.id.startsWith('regional:');
    if(external){assert(same(record,(map[collection]??[]).find(r=>r.id===record.id)),'external record '+record.id);protectedRecords++;}
  }
  const roads=map.roads.filter(r=>!r.id.startsWith('regional:')),city={...map,regional:undefined,roads,intersections:map.intersections.filter(j=>!j.id.startsWith('regional:'))};
  let preservedMainlineSegments=0,maxGrade=0,maxMainGrade=0;
  for(const old of baseline.roads.filter(r=>['east-west-expressway','north-south-expressway'].includes(r.roadNameId??'')||r.groupId==='system-central')) {
    assert(same(old.centerline,map.roads.find(r=>r.id===old.id)?.centerline),'preserved V6 axis / central interchange geometry '+old.id);preservedMainlineSegments++;
  }
  const network=buildCityRoadNetwork(map),edges=new Map(map.roads.map(r=>[r.id,new Set<string>()]));for(const n of network.connectivity)for(const from of n.incomingRoadIds)for(const to of n.outgoingRoadIds)edges.get(from)!.add(to);
  const first=roads.find(r=>r.roadNameId==='central-avenue')!,seen=new Set([first.id]),queue=[first.id];for(let i=0;i<queue.length;i++)for(const id of edges.get(queue[i]!)!)if(!seen.has(id)){seen.add(id);queue.push(id);}
  assert(roads.every(r=>seen.has(r.id)),'reachable city roads: '+roads.filter(r=>!seen.has(r.id)).map(r=>r.id).join(', '));
  const districts=new Set(map.environment.districts.map(d=>d.id));assert([...districts].sort().join(',')===['xixing','qinghe','jincheng','xinghu','chunhui','tonggang','nancheng'].sort().join(','),'seven real district definitions');
  for(const r of roads){assert(districts.has(r.district!),'district membership '+r.id);assert(r.decorationProfile,'decoration profile '+r.id);if(r.roadNameId)assert(map.roadNames?.[r.roadNameId],'name reference '+r.id);
    const points=roadPoints(r);for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!,grade=Math.abs((a.y??0)-(b.y??0))/Math.hypot(a.x-b.x,a.z-b.z);maxGrade=Math.max(maxGrade,grade);if(r.laneCount===3&&!r.gore)maxMainGrade=Math.max(maxMainGrade,grade);}
    if(!oldIds.has(r.id)||r.id.startsWith('v61-'))for(const end of ['start','end'] as const)assert(map.intersections.some(j=>j.connections.some(c=>c.roadId===r.id&&c.end===end))||map.roadLinks!.some(l=>[l.from,l.to].some(e=>e.roadId===r.id&&e.end===end))||map.connectionPorts!.some(p=>p.endpoint.roadId===r.id&&p.endpoint.end===end&&p.label.includes('封闭')),'no orphan new endpoint '+r.id+':'+end);
  }
  assert(maxGrade<=.1201,'city grade <=12% '+maxGrade);assert(maxMainGrade<.045,'mainline grade <4.5% '+maxMainGrade);
  const crossings=cityMainCrossingIssues(city);assert(!crossings.length,'road crossing clearance\n'+crossings.join('\n'));
  let railOver=0,railUnder=0,riverCrossings=0;
  for(const feature of map.environment.corridors!)for(const r of roads)for(const c of cityFeatureCrossings(r,feature.centerline)) {
    const y=c.point.y??0;
    if(feature.kind==='railway'){assert(Math.abs(y)>=6.1,'rail crossing '+r.id+' '+y);if(y>0)railOver++;else railUnder++;}
    else {assert(y>=2.9,'river crossing '+r.id+' '+y);riverCrossings++;}
  }
  assert(railUnder>=1&&railOver>=1,'mixed road/rail crossing designs');
  let railEnds=0;
  for(const p of map.connectionPorts!.filter(p=>p.label==='铁路边街巷尽端（封闭）')){const r=map.roads.find(r=>r.id===p.endpoint.roadId)!,q=r.centerline[p.endpoint.end==='start'?0:r.centerline.length-1]!;assert(map.objects.some(o=>o.prefabId==='guardrail'&&Math.hypot(o.position.x-q.x,o.position.z-q.z)<9&&Math.abs((o.position.y??0)-(q.y??0))<.3),'closed rail-side street '+p.id);railEnds++;}
  assert(railEnds===4,'two minor streets terminated at the railway');
  const station=map.environment.landmarks!.find(p=>p.id==='west-city-station')!;assert(station.name==='城站'&&station.position.x> -1500&&station.position.x< -1100,'inner Xixing traditional station');
  for(const name of ['城站','清江市人民政府','清江博物馆','清江大学','清江国际会展中心','清江体育中心','锦城中心'])assert(network.routing?.places?.some(p=>p.name===name&&p.roadIds.length),'shared navigation landmark '+name);
  const material=createSubject3Materials(),prefabs=new PrefabRegistry(material),clearance=new RoadClearance(map);let landmarkSamples=0,signPosts=0;
  const rail=map.environment.corridors!.find(c=>c.kind==='railway')!;let railBridgePiers=0;
  for(const r of roads.filter(r=>cityFeatureCrossings(r,rail.centerline).length))for(const p of roadPiers(r,map,clearance)) {
    assert(distanceToCityCorridor(p.position,rail.centerline)>=7,'bridge pier outside railway envelope '+r.id);railBridgePiers++;
  }
  for(const o of map.objects.filter(o=>o.groupId==='v61-landmarks')) {
    const def=prefabs.entries.get(o.prefabId)!,w=def.size[0]*(o.scale?.x??1),d=def.size[2]*(o.scale?.z??1),h=def.size[1]*(o.scale?.y??1);
    for(let x=-w/2;x<=w/2+.001;x+=Math.min(4,w))for(let z=-d/2;z<=d/2+.001;z+=Math.min(4,d)){const q=rotatePoint({x,z},o.rotation),p={x:o.position.x+q.x,y:o.position.y??0,z:o.position.z+q.z};assert(!clearance.roadAt(p,.3,(p.y??0)-.3,(p.y??0)+h+.3,undefined,undefined,true),'landmark footprint outside lanes '+o.id);landmarkSamples++;}
  }
  for(const sign of map.signs!.filter(s=>oldIds.has(s.roadId)||!s.roadId.startsWith('regional:'))) {
    const dim=signDimensions(sign.template,sign.size,sign.postOffset,sign.gantryPosts,sign.mountHeight),base=sign.postBaseY??sign.position.y??0;
    for(const x of dim.posts){const q=rotatePoint({x,z:ROAD_SIGN_POST_Z},sign.heading),p={x:sign.position.x+q.x,z:sign.position.z+q.z};assert(!clearance.roadAt(p,.65,base-.15,(sign.position.y??0)+dim.poleTop,undefined,undefined,true)&&!clearance.junctionAt(p,.65,base-.15,(sign.position.y??0)+dim.poleTop),'sign column '+sign.id);signPosts++;}
  }
  const instances=prefabs.buildInstances(map.objects.filter(o=>!o.id.startsWith('regional:')));let batches=0,instanceCount=0;const facadeTextures=new Set();instances.traverse(o=>{if(o instanceof Mesh){assert(o instanceof InstancedMesh,'instanced landmark kit');batches++;instanceCount+=(o as InstancedMesh).count;if(o.material instanceof MeshStandardMaterial&&o.material.userData.cityFacade)facadeTextures.add(o.material.map);}});assert(batches<160&&facadeTextures.size===5,'shared low-cost visual kit '+batches);instances.traverse(o=>{if(o instanceof InstancedMesh)o.dispose();});prefabs.dispose();Object.values(material).forEach(m=>m.dispose());
  const ground=new CityGround(map,{loadRadius:0}),collision=new VehicleCollisionSystem(ground.colliders);let contactSamples=0;
  try {
    const changed=roads.filter(r=>!same(baseline.roads.find(old=>old.id===r.id)?.centerline,r.centerline));
    for(const r of changed){const points=roadPoints(r),length=polylineLength(points);for(let d=10;d<length-10;d+=40)for(let lane=0;lane<r.laneCount;lane++){const s=sampleAt(points,d),offset=-r.laneCount*r.laneWidth/2+(lane+.5)*r.laneWidth,p={x:s.point.x-s.tangent.z*offset,y:s.point.y??0,z:s.point.z+s.tangent.x*offset,yaw:Math.atan2(-s.tangent.x,-s.tangent.z)};
      for(const across of [-.85,.85])for(const along of [-1.45,1.45]){const sample=ground.sampleRoadSurface(p.x-s.tangent.z*across+s.tangent.x*along,p.z+s.tangent.x*across+s.tangent.z*along,undefined,p.y);assert(sample.surfaceType==='asphalt'&&Math.abs(sample.height-p.y)<.3,'four-wheel support '+r.id+' '+d+' expected '+p.y+' actual '+sample.height+' at '+JSON.stringify({x:p.x-s.tangent.z*across+s.tangent.x*along,z:p.z+s.tangent.x*across+s.tangent.z*along}));}
      const hit=collision.resolve({previousPose:p,pose:p,velocity:{x:0,z:0},dimensions:{width:2.02,length:5.05,height:1.95},dt:1/120});assert(!hit.collided,'drivable corridor '+r.id+' '+d+': '+hit.contacts.map(c=>c.colliderId).join(', '));contactSamples++;
    }}
  }finally{ground.dispose();}
  return {schemaErrors:validation.errorCount,warnings:validation.warnings,protectedRecords,preservedMainlineSegments,cityRoads:roads.length,cityObjects:map.objects.filter(o=>!o.id.startsWith('regional:')).length,railOver,railUnder,railEnds,railBridgePiers,riverCrossings,maxGrade,maxMainGrade,crossings:crossings.length,landmarkSamples,signPosts,prefabs:{batches,instanceCount,facadeTextures:facadeTextures.size},contactSamples,cityLoad:'passed',signals:runCityTrafficSignalsSelfTest(map)};
}
