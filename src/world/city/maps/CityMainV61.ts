import type { CityMapData } from '../CityMapData';
import { loadCityMap } from '../CityMapLoader';
import { shapeV61Expressways, addV61Frontages } from './CityMainV61Corridors';
import { moveV61Rail, stationV61Access, clearV61RailPiers } from './CityMainV61Rail';
import { addV61Extensions, placeV61Anchors, nameV61Districts, decorateV61Streets } from './CityMainV61Places';
import { repairCityMainGroundElevation, cityElevationProtectedRoad } from './CityMainGroundElevation';
import { cityFeatureCrossings, distanceToCityCorridor } from './CityMainV6Geography';
import { connectUrbanSkeleton, trimCityJunctionApproaches } from './CityMainUrbanConnections';
import { syncConnections, roadPoints, sampleAt, polylineLength } from '../geometry';
import { setJunctionPavementFootprint } from '../JunctionSurface';
import { populateIntersectionMarkingMetadata } from '../MarkingOwnership';
import { generateTopologySigns } from '../SignPlacementGenerator';
import { calibrateCityV6SignPosts } from './CityMainV6SignPosts';
import { cleanRoadsidePlacements } from '../RoadsidePlacement';
import { PrefabRegistry } from '../PrefabRegistry';
import { createSubject3Materials } from '../../subject3/materials';

/** One controlled continuation of the V6 authoring recipe, not a city rebuild. */
export function refineCityMainV61(source:CityMapData):CityMapData {
  if(source.environment.metadata?.cityRefinementVersion!=='6'||source.environment.metadata?.cityRefinementMinor==='1')throw new Error('V6.1 requires the current V6 map, once');
  const original=structuredClone(source),ids=new Set(source.roads.filter(r=>!r.id.startsWith('regional:')).map(r=>r.id));
  const city:CityMapData={...structuredClone(source),regional:undefined,roads:structuredClone(source.roads.filter(r=>ids.has(r.id))),intersections:structuredClone(source.intersections.filter(j=>!j.id.startsWith('regional:'))),objects:structuredClone(source.objects.filter(o=>!o.id.startsWith('regional:'))),roadLinks:structuredClone(source.roadLinks!.filter(l=>ids.has(l.from.roadId)&&ids.has(l.to.roadId))),connectionPorts:structuredClone(source.connectionPorts!.filter(p=>ids.has(p.endpoint.roadId))),signs:[]};
  shapeV61Expressways(city);moveV61Rail(city);
  const featureDecks=()=>city.roads.filter(r=>!cityElevationProtectedRoad(r)||r.id==='urban-underpass-west-link').flatMap(r=>city.environment.corridors!.flatMap(c=>cityFeatureCrossings(r,c.centerline).map(x=>({roadId:r.id,station:x.station,height:c.kind==='railway'?6.4:3.2,halfLength:8/Math.max(.25,x.sin)}))));
  const editable=new Set(['urban-underpass-west-link']);
  repairCityMainGroundElevation(city,featureDecks(),editable);syncConnections(city);
  addV61Frontages(city);repairCityMainGroundElevation(city,featureDecks(),editable);syncConnections(city);
  const station=stationV61Access(city);
  connectUrbanSkeleton(city,[station,...city.roads.filter(r=>r.roadNameId==='west-avenue')],.2);syncConnections(city);trimCityJunctionApproaches(city,false);
  addV61Extensions(city);
  // Splits remap feature stations. Recompute from the final centerlines.
  const decks=city.roads.filter(r=>!cityElevationProtectedRoad(r)||editable.has(r.id)).flatMap(r=>city.environment.corridors!.flatMap(c=>cityFeatureCrossings(r,c.centerline).map(x=>({roadId:r.id,station:x.station,height:c.kind==='railway'?6.4:3.2,halfLength:8/Math.max(.25,x.sin)}))));
  const flatLandings=new Set(city.intersections.filter(j=>j.id==='urban-junction-89'||j.connections.some(c=>c.roadId.startsWith('v61-'))).map(j=>j.id));
  repairCityMainGroundElevation(city,decks,editable,flatLandings);syncConnections(city);for(const j of city.intersections)setJunctionPavementFootprint(j,city);
  clearV61RailPiers(city);
  populateIntersectionMarkingMetadata(city);
  for(const port of city.connectionPorts!.filter(p=>p.id.startsWith('v61-')&&p.label.includes('封闭'))) {
    const r=city.roads.find(r=>r.id===port.endpoint.roadId)!,path=roadPoints(r),s=sampleAt(path,port.endpoint.end==='start'?0:polylineLength(path)),direction=port.endpoint.end==='start'?-1:1;
    const cap=city.objects.find(o=>o.prefabId==='guardrail'&&o.id.startsWith('v61-')&&Math.hypot(o.position.x-s.point.x,o.position.z-s.point.z)<2);
    if(cap)cap.position={x:s.point.x+s.tangent.x*direction*7,y:s.point.y??0,z:s.point.z+s.tangent.z*direction*7};
  }
  nameV61Districts(city);city.signs=generateTopologySigns(city);
  const context:CityMapData={...original,roads:[...city.roads,...original.roads.filter(r=>!ids.has(r.id))],intersections:[...city.intersections,...original.intersections.filter(j=>j.id.startsWith('regional:'))],signs:[...city.signs,...original.signs!.filter(s=>!ids.has(s.roadId))]};
  calibrateCityV6SignPosts(city,context);placeV61Anchors(city,context);decorateV61Streets(city,context);
  const materials=createSubject3Materials(),prefabs=new PrefabRegistry(materials),rail=city.environment.corridors!.find(c=>c.kind==='railway')!;
  city.objects=city.objects.filter(o=>o.id.startsWith('v61-')||['water','waterway','railway_track'].includes(o.prefabId)||distanceToCityCorridor(o.position,rail.centerline)>rail.width/2+Math.hypot(prefabs.entries.get(o.prefabId)!.size[0]*(o.scale?.x??1),prefabs.entries.get(o.prefabId)!.size[2]*(o.scale?.z??1))/2+3);
  prefabs.dispose();Object.values(materials).forEach(m=>m.dispose());
  const protectedSurfaces=city.objects.filter(o=>o.groupId==='v61-landmarks'||['water','waterway','railway_track','sports_field'].includes(o.prefabId));city.objects=city.objects.filter(o=>!protectedSurfaces.includes(o));cleanRoadsidePlacements(city);city.objects.push(...protectedSurfaces);
  for(const j of city.intersections.filter(j=>j.signalized&&!j.signals?.profile))j.signals={profile:j.connections.filter(c=>city.roads.find(r=>r.id===c.roadId)!.laneCount>=4).length>=2?'lane-countdown':'standard',headHeight:7.2};
  const externalLinks=original.roadLinks!.filter(l=>!ids.has(l.from.roadId)||!ids.has(l.to.roadId)),reservedLinks=new Set(externalLinks.map(l=>l.id));
  for(const l of city.roadLinks!)if(reservedLinks.has(l.id))l.id='v61-city-'+l.id;
  const result:CityMapData={...original,name:city.name,version:original.version+1,roads:[...city.roads,...original.roads.filter(r=>!ids.has(r.id))],intersections:[...city.intersections,...original.intersections.filter(j=>j.id.startsWith('regional:'))],objects:[...city.objects,...original.objects.filter(o=>o.id.startsWith('regional:'))],roadLinks:[...city.roadLinks!,...externalLinks],connectionPorts:[...city.connectionPorts!,...original.connectionPorts!.filter(p=>!ids.has(p.endpoint.roadId))],signs:[...city.signs!,...original.signs!.filter(s=>!ids.has(s.roadId))],roadNames:city.roadNames,environment:city.environment};
  calibrateCityV6SignPosts(city,result);
  result.environment.metadata={...result.environment.metadata,cityRefinementMinor:'1',v61Source:'incremental current V6 refinement; original mainline vertical forms retained by explicit user steering',v61Access:'No new mainline interchange; reuse V6 campus northbound on/off, civic westbound exit and mature diamonds. New frontage/city-road junctions only.',v61Environment:JSON.stringify({objects:city.objects.length,landmarks:city.environment.landmarks!.length,trees:city.objects.filter(o=>o.prefabId==='tree').length,lamps:city.objects.filter(o=>o.prefabId.startsWith('streetlight')).length,buildings:city.objects.filter(o=>o.facade).length}),landscapeObjects:String(city.objects.length)};
  return loadCityMap(result);
}
