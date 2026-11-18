import type {CityMapData} from '../CityMapData';
import {loadCityMap} from '../CityMapLoader';
import {straightenInnerV9,lakeV9,chunhuiV9} from './CityMainV9Layout';
import {dividedFrontagesV9,frontageAccessV9} from './CityMainV9Frontages';
import {servicesV9} from './CityMainV9Services';
import {repairCityMainGroundElevation,cityUrbanElevationCrossings} from './CityMainGroundElevation';
import {cityFeatureCrossings} from './CityMainV6Geography';
import {fitCityV62Ramps} from './CityMainV62Profiles';
import {simplifyV8,extendEndpointV8} from './CityMainV8Roads';
import {setJunctionPavementFootprint} from '../JunctionSurface';
import {deleteObject,connectRoads} from '../MapAPI';
import {placeCityV7Parcels} from './CityMainV7Parcels';
import {populateIntersectionMarkingMetadata} from '../MarkingOwnership';
import {generateTopologySigns} from '../SignPlacementGenerator';
import {generateHighwaySigns} from '../../regional/HighwaySigns';
import {styleCityV62Signs,calibrateCityV62SafetySigns} from './CityMainV62Signs';
import {calibrateCityV6SignPosts} from './CityMainV6SignPosts';
import {regionalMetadataV8} from './CityMainV8Regional';
import {continuityV8} from './CityMainV8Continuity';

export function reviseCityMainV9(source:CityMapData,progress?:(name:string,map:CityMapData)=>void):CityMapData{
 const map=structuredClone(source);map.signs=[];
 straightenInnerV9(map);progress?.('inner',map);
 lakeV9(map);progress?.('lake',map);
 chunhuiV9(map);continuityV8(map);progress?.('chunhui',map);
 dividedFrontagesV9(map);progress?.('frontages',map);
 frontageAccessV9(map);progress?.('access',map);
 servicesV9(map);regionalMetadataV8(map);progress?.('services',map);
 return finishCityMainV9(map,source,progress);
}
export function finishCityMainV9(map:CityMapData,source:CityMapData,progress?:(name:string,map:CityMapData)=>void):CityMapData{
 // The diagonal distributor passes over the frontage corridor. Keeping a
 // second nearby signal junction would join its bridge back to the lower road.
 const frontageJunctions=map.intersections.filter(j=>!!j.approachOffsets),separated=[];
 for(const j of frontageJunctions){const through=j.connections.filter(c=>map.roads.find(r=>r.id===c.roadId)!.roadNameId==='new-city-avenue'),local=j.connections.filter(c=>!through.includes(c));if(through.length!==2||local.length!==4)continue;const groups=[through,...(['forward','reverse'] as const).map(direction=>local.filter(c=>map.roads.find(r=>r.id===c.roadId)!.travelDirection===direction))];deleteObject(map,j.id);for(const pair of groups){const p=pair===through?{...j.position}:pair.reduce((p,c)=>{const r=map.roads.find(r=>r.id===c.roadId)!,q=r.centerline[c.end==='start'?0:r.centerline.length-1]!;return{x:p.x+q.x/2,y:j.position.y,z:p.z+q.z/2};},{x:0,y:j.position.y,z:0});for(const e of pair)extendEndpointV8(map,e,{...p});connectRoads(map,{roadId:pair[0]!.roadId,end:pair[0]!.end},{roadId:pair[1]!.roadId,end:pair[1]!.end});}separated.push(j.id);}
 for(const j of [...map.intersections]){if(j.approachOffsets||!frontageJunctions.some(q=>Math.hypot(q.position.x-j.position.x,q.position.z-j.position.z)<400))continue;const through=j.connections.filter(c=>map.roads.find(r=>r.id===c.roadId)!.roadNameId==='new-city-avenue'),local=j.connections.filter(c=>!through.includes(c));if(through.length!==2||local.length!==2)continue;deleteObject(map,j.id);for(const pair of [through,local]){for(const e of pair)extendEndpointV8(map,e,{...j.position});connectRoads(map,{roadId:pair[0]!.roadId,end:pair[0]!.end},{roadId:pair[1]!.roadId,end:pair[1]!.end});}separated.push(j.id);}
 map.environment.metadata={...map.environment.metadata,v9DiagonalSeparatedJunctions:JSON.stringify(separated)};
 const ramps=new Set(map.roads.filter(r=>r.groupId==='v9-frontage-access').map(r=>r.id));
 const fixed=new Set(map.roads.filter(r=>r.type==='highway'||r.type==='ramp_1'||!!r.structure?.enclosure).map(r=>r.id));
 fitCityV62Ramps(map,ramps,.0795,fixed);progress?.('ramp-profiles',map);
 const editable=new Set(map.roads.filter(r=>!r.id.startsWith('regional:')&&r.type!=='highway'&&r.type!=='ramp_1'&&!r.structure?.enclosure&&!r.id.startsWith('urban-underpass-')).map(r=>r.id));
 // Old flat spans may have only their endpoints after V8 simplification. Grade
 // crests need actual samples around the newly moved crossing positions.
 for(const r of map.roads.filter(r=>editable.has(r.id))){const points=r.centerline;r.centerline=points.flatMap((p,i)=>{if(!i)return [p];const a=points[i-1]!,n=Math.ceil(Math.hypot(p.x-a.x,p.z-a.z)/8);return Array.from({length:n},(_,k)=>{const t=(k+1)/n;return{x:a.x+(p.x-a.x)*t,y:(a.y??0)+((p.y??0)-(a.y??0))*t,z:a.z+(p.z-a.z)*t};});});}
 const features=map.roads.filter(r=>editable.has(r.id)).flatMap(r=>(map.environment.corridors??[]).flatMap(f=>cityFeatureCrossings(r,f.centerline).map(c=>({roadId:r.id,station:c.station,height:f.kind==='railway'?6.4:3.2,halfLength:(f.width/2+2)/Math.max(.25,c.sin)}))));
 const inherited=cityUrbanElevationCrossings(source),crossings=cityUrbanElevationCrossings(map).map(c=>{const old=inherited.find(q=>q.a===c.a&&q.b===c.b&&Math.abs(q.oldA-q.oldB)>=5.8);const diagonal=[c.a,c.b].find(id=>map.roads.find(r=>r.id===id)!.roadNameId==='new-city-avenue');return {...c,upperRoadId:diagonal,clearance:[c.a,c.b].some(id=>!editable.has(id))?5.75:old?Math.min(6.4,Math.abs(old.oldA-old.oldB)):6.4};});
 repairCityMainGroundElevation(map,features,editable,new Set(),editable,crossings,true);for(const j of map.intersections)setJunctionPavementFootprint(j,map);progress?.('ground-profiles',map);
 placeCityV7Parcels(map);
 const lake=map.objects.filter(o=>o.groupId==='v9-xinghu-lake');map.objects=map.objects.filter(o=>o.prefabId==='water'||!lake.some(w=>((o.position.x-w.position.x)/(w.scale!.x*10))**2+((o.position.z-w.position.z)/(w.scale!.z*10))**2<1));
 simplifyV8(map);
 const existingJunctions=new Set(source.intersections.map(j=>j.id));for(const j of map.intersections.filter(j=>!existingJunctions.has(j.id))){const major=j.connections.some(c=>map.roads.find(r=>r.id===c.roadId)!.laneCount>=4);if(!major)j.signalized=false;else if(j.signalized)j.signals={profile:'lane-countdown',headHeight:7.2};}
 populateIntersectionMarkingMetadata(map);progress?.('parcels',map);
 const cityRoads=map.roads.filter(r=>!r.id.startsWith('regional:')),ids=new Set(cityRoads.map(r=>r.id)),city:CityMapData={...map,regional:undefined,roads:cityRoads,intersections:map.intersections.filter(j=>j.connections.every(c=>ids.has(c.roadId))),roadLinks:map.roadLinks!.filter(l=>ids.has(l.from.roadId)&&ids.has(l.to.roadId)),connectionPorts:map.connectionPorts!.filter(p=>ids.has(p.endpoint.roadId)),objects:[],signs:[]};
 const squareRoads=new Set(cityRoads.filter(r=>r.groupId==='v8-century-square').map(r=>r.id));city.signs=generateTopologySigns(city).filter(s=>!squareRoads.has(s.roadId));styleCityV62Signs(city);map.signs=city.signs;generateHighwaySigns(map);calibrateCityV6SignPosts(map,map,true);calibrateCityV62SafetySigns(map,map);progress?.('signs',map);
 map.version=source.version+1;map.environment.metadata={...map.environment.metadata,cityExpansionVersion:'9',v9Layout:'Divided frontage streets attached to the expressway corridor; one junction across the median; larger irregular Xinghu lake; straighter inner ring; compact Chunhui blocks.'};return loadCityMap(map);
}
