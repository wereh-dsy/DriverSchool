import type { CityMapData } from '../CityMapData';
import { loadCityMap } from '../CityMapLoader';
import { addCityV6Geography, distanceToCityCorridor } from './CityMainV6Geography';
import { calibrateCityV6SignPosts } from './CityMainV6SignPosts';
import { generateTopologySigns } from '../SignPlacementGenerator';
import { RoadsidePlacement } from '../RoadsidePlacement';
import { PrefabRegistry } from '../PrefabRegistry';
import { createSubject3Materials } from '../../subject3/materials';
import { regularizeCityV6East } from './CityMainV6EastLayout';

/** Append the requested signal, building and corridor details to the current V6
 * city fragment. The regional payload and boundary connections remain exact. */
export function detailCityMainV6(source:CityMapData):CityMapData {
  if(source.environment.metadata?.v6DetailPass)throw new Error('City V6 details already applied');
  const original=structuredClone(source),ids=new Set(source.roads.filter(r=>!r.id.startsWith('regional:')).map(r=>r.id));
  const city:CityMapData={...structuredClone(source),regional:undefined,roads:structuredClone(source.roads.filter(r=>ids.has(r.id))),
    intersections:structuredClone(source.intersections.filter(j=>!j.id.startsWith('regional:'))),objects:structuredClone(source.objects.filter(o=>!o.id.startsWith('regional:'))),
    roadLinks:structuredClone(source.roadLinks!.filter(l=>ids.has(l.from.roadId)&&ids.has(l.to.roadId))),connectionPorts:structuredClone(source.connectionPorts!.filter(p=>ids.has(p.endpoint.roadId))),signs:[]};
  regularizeCityV6East(city);addCityV6Geography(city);
  const materials=createSubject3Materials(),prefabs=new PrefabRegistry(materials),placement=new RoadsidePlacement(city);
  const buildings=city.objects.filter(o=>o.facade),occupied=buildings.map(o=>({o,r:Math.hypot(prefabs.entries.get(o.prefabId)!.size[0]*(o.scale?.x??1),prefabs.entries.get(o.prefabId)!.size[2]*(o.scale?.z??1))/2}));
  let moved=0,tall=0;
  buildings.forEach((o,i)=>{
    if(o.id==='v6-west-station-building')return;
    const originalPose={...o.position},originalRotation=o.rotation,size=prefabs.entries.get(o.prefabId)!.size;
    o.buildingShape=o.facade==='office'?(i%3===0?'chamfered':i%3===1?'slab':'box'):o.facade==='campus'&&i%3===0?'courtyard':i%4===0?'chamfered':'box';
    if(o.groupId==='v6-finance'&&o.prefabId==='office') {o.scale!.y=[2.6,3.4,4.2,1.7,2.1][i%5]!;tall++;}
    else if(o.scale)o.scale.y*=.8+(i%5)*.1;
    const radius=Math.hypot(size[0]*(o.scale?.x??1),size[2]*(o.scale?.z??1))/2;
    for(const factor of [1,.5,0]) {
      const p={...originalPose,x:originalPose.x+Math.sin(i*2.17)*7*factor,z:originalPose.z+Math.cos(i*1.37)*6*factor};
      if(!placement.permits(p,radius,size[1]*(o.scale?.y??1)))continue;
      if(city.environment.corridors!.some(c=>distanceToCityCorridor(p,c.centerline)<c.width/2+radius+3))continue;
      if(occupied.some(b=>b.o!==o&&Math.hypot(p.x-b.o.position.x,p.z-b.o.position.z)<radius+b.r+3))continue;
      o.position=p;o.rotation=originalRotation+(i%3-1)*.055*factor;if(factor)moved++;break;
    }
  });
  prefabs.dispose();Object.values(materials).forEach(m=>m.dispose());
  let advanced=0,standard=0;
  for(const j of city.intersections.filter(j=>j.signalized)) {
    const major=j.connections.filter(c=>{const r=city.roads.find(r=>r.id===c.roadId)!;return r.laneCount>=4&&r.travelDirection==='two-way';}).length;
    const profile=major>=2&&j.connections.length>=3?'lane-countdown':'standard';
    j.signals={...j.signals,profile,...(profile==='lane-countdown'?{headHeight:7.2,throughGreenSeconds:22,leftGreenSeconds:8,amberSeconds:3,allRedSeconds:2}:{})};
    if(profile==='lane-countdown')advanced++;else standard++;
  }
  city.signs=generateTopologySigns(city);
  const result:CityMapData={...original,version:original.version+1,roads:[...city.roads,...original.roads.filter(r=>!ids.has(r.id))],intersections:[...city.intersections,...original.intersections.filter(j=>j.id.startsWith('regional:'))],objects:[...city.objects,...original.objects.filter(o=>o.id.startsWith('regional:'))],
    roadLinks:[...city.roadLinks!,...original.roadLinks!.filter(l=>!ids.has(l.from.roadId)||!ids.has(l.to.roadId))],connectionPorts:[...city.connectionPorts!,...original.connectionPorts!.filter(p=>!ids.has(p.endpoint.roadId))],signs:[...city.signs!,...original.signs!.filter(s=>!ids.has(s.roadId))],roadNames:city.roadNames,environment:city.environment};
  const reserved=new Set(original.roadLinks!.filter(l=>!ids.has(l.from.roadId)||!ids.has(l.to.roadId)).map(l=>l.id));
  for(const l of city.roadLinks!)if(reserved.has(l.id))l.id='v6-detail-'+l.id;
  calibrateCityV6SignPosts(city,result);
  const parcels=JSON.parse(result.environment.metadata!.v6LandUse!) as {id:string;buildingCount:number}[];
  for(const parcel of parcels)parcel.buildingCount=city.objects.filter(o=>o.facade&&o.groupId==='v6-'+parcel.id).length;
  const environment=JSON.parse(result.environment.metadata!.v6Environment!) as Record<string,unknown>;
  Object.assign(environment,{after:city.objects.length,buildings:buildings.length,trees:city.objects.filter(o=>o.prefabId==='tree').length,lamps:city.objects.filter(o=>o.prefabId.startsWith('streetlight')).length,shrubs:city.objects.filter(o=>o.groupId==='v6-shrubs').length,water:'shared opaque lake and river material; no simulation'});
  result.environment.metadata={...result.environment.metadata,v6DetailPass:'1',v6LandUse:JSON.stringify(parcels),v6Environment:JSON.stringify(environment),v6Signals:JSON.stringify({advanced,standard,control:'fixed-time; protected left; amber and all-red; lane/navigation readonly API'}),v6Buildings:JSON.stringify({buildings:buildings.length,moved,tall,shapes:'single extruded box/chamfered/slab/courtyard; shared facade textures'}),landscapeObjects:String(city.objects.length)};
  return loadCityMap(result);
}
