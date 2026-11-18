import { InstancedMesh, Mesh, MeshStandardMaterial } from 'three';
import type { CityMapData } from './CityMapData';
import { loadCityMap } from './CityMapLoader';
import { validateMap } from './CityMapValidation';
import { buildCityRoadNetwork } from './CityRoadNetwork';
import { cityMainCrossingIssues } from './CityMain.selftest';
import { CityGround } from './CityGround';
import { PrefabRegistry } from './PrefabRegistry';
import { createSubject3Materials } from '../subject3/materials';
import { roadPoints, polylineLength, sampleAt } from './geometry';
import { RoadClearance } from './RoadClearance';
import { VehicleCollisionSystem } from '../../vehicle/physics/CollisionSystem';
import { CITY_V6_DECORATION_PROFILES } from './maps/CityMainV6Environment';
import { ROAD_SIGN_POST_Z, signDimensions } from './RoadSignTemplates';
import { rotatePoint } from './geometry';
import { RoadBuilder } from './RoadBuilder';
import { newCityMap } from './CityMapData';
import { cityFeatureCrossings } from './maps/CityMainV6Geography';

const assert=(condition:unknown,message:string)=>{if(!condition)throw new Error('City V6: '+message);};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

export function runCityMainV6SelfTest(source:CityMapData,baseline:CityMapData) {
  const map=loadCityMap(source),validation=validateMap(map),oldIds=new Set(baseline.roads.map(r=>r.id));
  assert(validation.valid,JSON.stringify(validation.errors));
  assert(map.environment.metadata?.cityRefinementVersion==='6','current refinement metadata');
  assert(same(map.regional,baseline.regional),'regional terrain/highway metadata preserved');
  let protectedRecords=0;
  for(const collection of ['roads','intersections','objects','roadLinks','connectionPorts','signs'] as const) {
    const original=baseline[collection]??[],current=map[collection]??[];
    const cityIds=new Set(baseline.roads.filter(r=>!r.id.startsWith('regional:')).map(r=>r.id));
    for(const record of original) {
      const external=collection==='roadLinks'?(!cityIds.has((record as NonNullable<CityMapData['roadLinks']>[number]).from.roadId)||!cityIds.has((record as NonNullable<CityMapData['roadLinks']>[number]).to.roadId)):
        collection==='signs'?!cityIds.has((record as NonNullable<CityMapData['signs']>[number]).roadId):record.id.startsWith('regional:');
      if(external){assert(same(record,current.find(r=>r.id===record.id)),'external record changed '+record.id);protectedRecords++;}
    }
  }
  const roads=map.roads.filter(r=>!r.id.startsWith('regional:')),ids=new Set(roads.map(r=>r.id));
  const city:CityMapData={...map,regional:undefined,roads,intersections:map.intersections.filter(j=>!j.id.startsWith('regional:')),
    objects:map.objects.filter(o=>!o.id.startsWith('regional:')),roadLinks:map.roadLinks!.filter(l=>ids.has(l.from.roadId)&&ids.has(l.to.roadId)),
    connectionPorts:map.connectionPorts!.filter(p=>ids.has(p.endpoint.roadId)),signs:map.signs!.filter(s=>ids.has(s.roadId))};
  // The four city corridors connect through the actual menu map's external
  // motorway links. Cutting those links creates artificial inbound-only roots.
  // Keep the requirement that EVERY city road is reachable, using its real graph.
  const network=buildCityRoadNetwork(map),edges=new Map(map.roads.map(r=>[r.id,new Set<string>()]));
  for(const n of network.connectivity)for(const a of n.incomingRoadIds)for(const b of n.outgoingRoadIds)edges.get(a)!.add(b);
  const reachable=(start:string,allowed=new Set(map.roads.map(r=>r.id)))=>{const seen=new Set([start]),queue=[start];for(let i=0;i<queue.length;i++)for(const next of edges.get(queue[i]!)??[])if(allowed.has(next)&&!seen.has(next)){seen.add(next);queue.push(next);}return seen;};
  const first=roads.find(r=>r.roadNameId==='central-avenue')!,seen=reachable(first.id);
  assert(roads.every(r=>seen.has(r.id)),'every city road direction reachable from the urban network '+roads.filter(r=>seen.has(r.id)).length+'/'+roads.length);
  const newRoads=roads.filter(r=>!oldIds.has(r.id));
  for(const r of newRoads)for(const end of ['start','end'] as const) {
    const p=r.centerline[end==='start'?0:r.centerline.length-1]!;
    // Splitting an existing frontage transfers its explicitly closed future port.
    // It is valid only with the original port identity and a physical end rail.
    const closedFuture=city.connectionPorts!.some(port=>port.endpoint.roadId===r.id&&port.endpoint.end===end&&port.label==='辅路远期接续（封闭预留）'&&baseline.connectionPorts?.some(old=>old.id===port.id))&&city.objects.some(o=>o.prefabId==='guardrail'&&Math.hypot(o.position.x-p.x,o.position.z-p.z)<12);
    assert(closedFuture||city.intersections.some(j=>j.connections.some(c=>c.roadId===r.id&&c.end===end))||city.roadLinks!.some(l=>[l.from,l.to].some(e=>e.roadId===r.id&&e.end===end)),'new dangling endpoint '+r.id+':'+end);
  }
  for(const prefix of ['ring-cw-','ring-ccw-']) {
    const ring=new Set(roads.filter(r=>r.id.startsWith(prefix)||r.id.includes(':feeder-cross-')&&['system-north','system-south'].includes(r.groupId??'')&&Math.sign(r.centerline.at(-1)!.x-r.centerline[0]!.x)===(prefix==='ring-cw-'?1:-1)*(r.groupId==='system-north'?1:-1)).map(r=>r.id));
    assert(reachable([...ring][0]!,ring).size===ring.size,'closed directed ring '+prefix);
  }
  for(const id of ['north-roundabout:entry','north-roundabout:exit','north-roundabout:entry-4','north-roundabout:exit-4'])assert(!ids.has(id),'unused roundabout arm removed '+id);
  const crossings=cityMainCrossingIssues(city);assert(!crossings.length,'unconnected low-clearance crossings\n'+crossings.join('\n'));
  let riverBridges=0,railBridges=0;
  for(const feature of city.environment.corridors??[]) {
    assert(polylineLength(feature.centerline)>3000,'continuous city division corridor '+feature.id);
    for(const r of roads)for(const crossing of cityFeatureCrossings(r,feature.centerline)) {
      assert((crossing.point.y??0)>=(feature.kind==='railway'?6.1:2.9),'feature bridge clearance '+feature.id+' / '+r.id+' '+crossing.point.y);
      if(feature.kind==='railway')railBridges++;else riverBridges++;
    }
    const pieces=city.objects.filter(o=>o.groupId===feature.id),baseLength=feature.kind==='railway'?40:20;
    assert(pieces.length>50,'continuous instanced corridor pieces '+feature.id);
    for(let i=1;i<pieces.length;i++) {
      const a=pieces[i-1]!,b=pieces[i]!,halfA=baseLength*a.scale!.z/2,halfB=baseLength*b.scale!.z/2;
      const endA={x:a.position.x+Math.sin(a.rotation)*halfA,z:a.position.z+Math.cos(a.rotation)*halfA},startB={x:b.position.x-Math.sin(b.rotation)*halfB,z:b.position.z-Math.cos(b.rotation)*halfB};
      assert(Math.hypot(endA.x-startB.x,endA.z-startB.z)<1.6,'no visual corridor seam '+feature.id+' '+i);
    }
  }
  if(city.environment.metadata?.v6DetailPass)assert(!!network.routing?.places?.some(p=>p.id==='west-city-station'&&p.roadIds.length>0),'station landmark in shared navigation places');
  if(city.environment.metadata?.v6DetailPass) {
    assert(!ids.has('urban-diagonal-split-split-split'),'eastern duplicate ribbon removed');
    for(const id of ['urban-junction-13','urban-junction-97']) {
      const j=city.intersections.find(j=>j.id===id)!;
      assert(j.connections.length===3&&j.type==='t_4lane','clear eastern T junction '+id);
      const angles=j.connections.map(c=>j.portAngles![c.port]!);
      for(let a=0;a<angles.length;a++)for(let b=a+1;b<angles.length;b++)assert(Math.acos(Math.cos(angles[a]!-angles[b]!))>=85*Math.PI/180,'no acute eastern road wedge '+id);
    }
  }
  const allClearance=new RoadClearance(map);let signPosts=0;
  for(const sign of city.signs!) {
    const dimensions=signDimensions(sign.template,sign.size,sign.postOffset,sign.gantryPosts,sign.mountHeight),base=sign.postBaseY??sign.position.y??0;
    for(const x of dimensions.posts) {
      const q=rotatePoint({x,z:ROAD_SIGN_POST_Z},sign.heading),p={x:sign.position.x+q.x,z:sign.position.z+q.z};
      assert(!allClearance.roadAt(p,.65,base-.15,(sign.position.y??0)+dimensions.poleTop,undefined,undefined,true),'sign column outside every lane '+sign.id);
      assert(!allClearance.junctionAt(p,.65,base-.15,(sign.position.y??0)+dimensions.poleTop),'sign column outside junction pavement '+sign.id);signPosts++;
    }
  }
  let maxMainlineGrade=0,maxNewGrade=0,minMainlineRadius=Infinity;
  for(const r of roads) {
    assert(r.decorationProfile&&CITY_V6_DECORATION_PROFILES[r.decorationProfile],'configured decoration '+r.id);
    if(r.roadNameId)assert(map.roadNames?.[r.roadNameId],'road name reference '+r.id);
    const points=roadPoints(r),main=r.laneCount===3&&!r.gore;
    for(let i=1;i<points.length;i++) {
      const a=points[i-1]!,b=points[i]!,len=Math.hypot(b.x-a.x,b.z-a.z),grade=Math.abs((b.y??0)-(a.y??0))/len;
      assert(len>=.049,'nondegenerate road '+r.id);
      if(main)maxMainlineGrade=Math.max(maxMainlineGrade,grade);
      if(!oldIds.has(r.id))maxNewGrade=Math.max(maxNewGrade,grade);
      if(main&&i+1<points.length){const c=points[i+1]!,cross=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));if(cross>1e-6)minMainlineRadius=Math.min(minMainlineRadius,len*Math.hypot(c.x-b.x,c.z-b.z)*Math.hypot(c.x-a.x,c.z-a.z)/(2*cross));}
    }
  }
  assert(maxMainlineGrade<.045,'mainline grade <4.5% '+maxMainlineGrade);
  assert(minMainlineRadius>=300,'broad mainline radius >=300m '+minMainlineRadius);
  assert(maxNewGrade<=.1201,'new road grade <=12% '+maxNewGrade);
  const clearance=new RoadClearance(city),materials=createSubject3Materials(),prefabs=new PrefabRegistry(materials),objects=city.objects;
  for(const r of roads.filter(r=>r.structure?.barrierEnabled!==false))assert(r.structure?.barrierOffset===0,'barrier rests on the paved edge '+r.id);
  const fixture=newCityMap();fixture.roads=[{id:'sealed-deck',type:'highway',centerline:[{x:0,y:8,z:0},{x:0,y:8,z:-120}],laneCount:3,laneWidth:3.75,travelDirection:'forward',speedLimit:80,elevationMode:'custom',structure:{barrierEnabled:true,barrierOffset:0,piersEnabled:false}}];
  const built=new RoadBuilder(materials,fixture).build(fixture.roads[0]!);let sealed=0;
  built.traverse(o=>{if(o instanceof Mesh){const p=o.geometry.getAttribute('position');if(o.name==='road barrier'){let bottom=Infinity;for(let i=0;i<p.count;i++)bottom=Math.min(bottom,p.getY(i));assert(Math.abs(bottom-8.024)<1e-5,'barrier base seals to asphalt elevation');sealed++;}o.geometry.dispose();}});
  assert(sealed===2,'both visual deck edges sealed');
  for(const o of objects.filter(o=>o.id.startsWith('v6-')&&!['water','waterway','railway_track','green_strip','hardscape','sports_field'].includes(o.prefabId))) {
    const size=prefabs.entries.get(o.prefabId)!.size,radius=o.prefabId==='tree'?3:Math.hypot(size[0]*(o.scale?.x??1),size[2]*(o.scale?.z??1))/2;
    assert(clearance.permitsProp(o.position,radius,size[1]*(o.scale?.y??1)),'new object road clearance '+o.id);
  }
  assert(objects.filter(o=>o.prefabId==='water').length===1,'one authored lake');
  assert(objects.some(o=>o.prefabId==='sports_field'),'campus sports field');
  assert(objects.length<=baseline.objects.filter(o=>!o.id.startsWith('regional:')).length*1.5,'city object budget');
  const instances=prefabs.buildInstances(objects),textures=new Set(),facades=new Set(),geometries=new Set();let batches=0,instanceCount=0;
  instances.traverse(o=>{if(o instanceof Mesh){assert(o instanceof InstancedMesh,'repeated props are instanced');batches++;instanceCount+=(o as InstancedMesh).count;geometries.add(o.geometry);if(o.material instanceof MeshStandardMaterial&&o.material.map&&o.material.userData.cityFacade){textures.add(o.material.map);facades.add(o.material);}}});
  assert(textures.size===5&&facades.size===5,'five shared facade texture/material pairs');
  assert(batches<160,'bounded prefab draw batches '+batches);
  instances.traverse(o=>{if(o instanceof InstancedMesh)o.dispose();});prefabs.dispose();Object.values(materials).forEach(m=>m.dispose());
  // Actual current menu map constructor and City loading path. Contacts focus on
  // new roads and representative changed corridors, not a vehicle test suite.
  const ground=new CityGround(map,{loadRadius:0}),collision=new VehicleCollisionSystem(ground.colliders);let contacts=0;
  try {
    const chosen=roads.filter(r=>r.id.startsWith('v6-')||r.id==='ring-cw-0-split-split'||r.id==='ring-cw-3-split-2-split'||r.id==='ew-eb-split-4-split');
    for(const r of chosen) {
      const points=roadPoints(r),length=polylineLength(points);
      for(let d=10;d<length-10;d+=30)for(let lane=0;lane<r.laneCount;lane++) {
        const s=sampleAt(points,d),offset=-r.laneCount*r.laneWidth/2+(lane+.5)*r.laneWidth,p={x:s.point.x-s.tangent.z*offset,y:s.point.y??0,z:s.point.z+s.tangent.x*offset,yaw:Math.atan2(-s.tangent.x,-s.tangent.z)};
        for(const across of [-.85,.85])for(const along of [-1.45,1.45]){const surface=ground.sampleRoadSurface(p.x-s.tangent.z*across+s.tangent.x*along,p.z+s.tangent.x*across+s.tangent.z*along,undefined,p.y);assert(surface.surfaceType==='asphalt'&&Math.abs(surface.height-p.y)<.3,'four wheel support '+r.id+' station '+d);}
        const hit=collision.resolve({previousPose:p,pose:p,velocity:{x:0,z:0},dimensions:{width:2.02,length:5.05,height:1.95},dt:1/120});
        assert(!hit.collided,'vehicle corridor '+r.id+' station '+d+': '+hit.contacts.map(c=>c.colliderId).join(', '));contacts++;
      }
    }
  }finally{ground.dispose();}
  return {schemaErrors:validation.errorCount,warnings:validation.warnings,protectedRecords,cityRoads:roads.length,newSegments:newRoads.length,cityObjects:objects.length,crossings:crossings.length,
    maxMainlineGrade,maxNewGrade,minMainlineRadius,signPosts,barrierEdgesSealed:sealed,riverBridges,railBridges,prefabs:{batches,instanceCount,sharedGeometries:geometries.size,facadeTextures:textures.size},contactSamples:contacts,menuMapLoad:'passed'};
}
