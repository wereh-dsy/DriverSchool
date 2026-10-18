import type {CityMapData,CityRoad} from '../CityMapData';
import {loadCityMap} from '../CityMapLoader';
import {deleteObject,connectRoads,createIntersection,connectRoad,detachRoadEndpoint} from '../MapAPI';
import {buildCityRoadNetwork} from '../CityRoadNetwork';
import {sampleAt} from '../geometry';
import {syncConnections} from '../geometry';
import {populateIntersectionMarkingMetadata} from '../MarkingOwnership';
import {generateTopologySigns} from '../SignPlacementGenerator';
import {generateHighwaySigns} from '../../regional/HighwaySigns';
import {styleCityV62Signs,calibrateCityV62SafetySigns} from './CityMainV62Signs';
import {calibrateCityV6SignPosts} from './CityMainV6SignPosts';
import {repairCityMainGroundElevation,cityUrbanElevationCrossings} from './CityMainGroundElevation';
import {cityFeatureCrossings} from './CityMainV6Geography';
import {fitCityV62Ramps} from './CityMainV62Profiles';
import {placeCityV7Parcels} from './CityMainV7Parcels';
import {enlargeCoreV8,nameCoreV8,districtStreetsV8,populateDistrictsV8} from './CityMainV8Districts';
import {retireAccessV8,compactSoutheastV8,frontagesV8,localExpresswayAccessV8,ringAccessV8,plazaClearanceV8} from './CityMainV8Access';
import {continuityV8} from './CityMainV8Continuity';
import {completeNamesV8} from './CityMainV8Names';
import {terrainV8,landscapeV8} from './CityMainV8Landscape';
import {cleanCityV7Continuity} from './CityMainV7Continuity';
import {regionalV8,regionalMetadataV8} from './CityMainV8Regional';
import {finishJunctionsV8,simplifyV8,streetV8,snapV8,connectStreetV8,groundV8,extendEndpointV8,polylineLength} from './CityMainV8Roads';
function diagonalV8(map:CityMapData):void{
 const diagonal=(r:CityRoad)=>r.roadNameId==='new-city-avenue',major=new Set(['inner-boulevard','central-avenue','north-avenue','south-avenue','west-avenue','central-street','v8-ew-frontage-west','v8-ew-frontage-east','v8-ns-frontage-north','v8-ns-frontage-south']);
 const junctions=map.intersections.filter(j=>j.connections.some(c=>diagonal(map.roads.find(r=>r.id===c.roadId)!))),anchors=junctions.filter(j=>j.connections.some(c=>major.has(map.roads.find(r=>r.id===c.roadId)!.roadNameId??'')));
 const removed:string[]=[];
 for(const j of junctions){
  const through=j.connections.filter(c=>diagonal(map.roads.find(r=>r.id===c.roadId)!)),local=j.connections.filter(c=>!through.includes(c));
  if(anchors.includes(j)||through.length!==2||local.length!==2||(j.position.y??0)>.1||anchors.some(a=>Math.hypot(a.position.x-j.position.x,a.position.z-j.position.z)<180))continue;
  deleteObject(map,j.id);removed.push(j.id);
  for(const pair of [through,local]){for(const e of pair)extendEndpointV8(map,e,{...j.position});connectRoads(map,{roadId:pair[0]!.roadId,end:pair[0]!.end},{roadId:pair[1]!.roadId,end:pair[1]!.end});}
 }
 const retained=map.intersections.flatMap(j=>j.connections.filter(c=>diagonal(map.roads.find(r=>r.id===c.roadId)!)).map(c=>{const r=map.roads.find(r=>r.id===c.roadId)!;return {...r.centerline[c.end==='start'?0:r.centerline.length-1]!};}));
 for(const r of map.roads.filter(diagonal)){for(const p of r.centerline)p.y=Math.min(8,...retained.map(a=>(a.y??0)+.055*Math.hypot(a.x-p.x,a.z-p.z)));r.elevationMode='custom';delete r.elevation;r.speedLimit=60;r.structure={...r.structure,piersEnabled:true,pierSpacing:45,barrierEnabled:true};}
 syncConnections(map);map.environment.metadata={...map.environment.metadata,v8DiagonalSeparatedJunctions:JSON.stringify(removed)};
}
function commercialStreetV8(map:CityMapData):void{
 const a=snapV8(map,groundV8(-1260,-350),'v5-west-east-road'),b=snapV8(map,groundV8(-1020,-330),'v8-gongren-street'),r=streetV8(map,'v8-chengan-road','承安路',[a,groundV8(-1150,-345),b],2,'xixing');r.speedLimit=20;r.decorationProfile='old-town';connectStreetV8(map,r);
 map.roadNames!['v8-chengan-road']!.secondaryText='Chengan Rd.';
 map.environment.landmarks!.push({id:'chengan-historic-commercial-street',name:'承安路历史商业街',position:groundV8(-1150,-345,0),roadIds:map.roads.filter(r=>r.roadNameId==='v8-chengan-road').map(r=>r.id)});
 for(let i=0;i<7;i++)for(const side of [-1,1])map.objects.push({id:`v8-chengan-shop-${i}-${side}`,prefabId:i%3?'commercial':'residential_low',position:groundV8(a.x+30+i*28,-345+side*29,0),rotation:side<0?0:Math.PI,scale:{x:.55+(i%2)*.1,y:.8+(i%3)*.12,z:.7},facade:'old-town',buildingShape:i%3===0?'courtyard':'box',color:i%2?'#b9a183':'#b6b0a3',district:'xixing',groupId:'v8-chengan-commercial'});
 map.objects.push({id:'v8-chengan-court',prefabId:'hardscape',position:groundV8(-1150,-405,0),rotation:0,scale:{x:1.2,y:1,z:1.3},district:'xixing',groupId:'v8-chengan-commercial'});
}
function separateScienceCrossingV8(map:CityMapData):void{
 const j=map.intersections.find(j=>j.connections.some(c=>map.roads.find(r=>r.id===c.roadId)!.roadNameId==='v5-east-science')&&j.connections.some(c=>map.roads.find(r=>r.id===c.roadId)!.roadNameId==='v8-ew-frontage-east'))!;
 const over=j.connections.filter(c=>map.roads.find(r=>r.id===c.roadId)!.roadNameId==='v5-east-science'),under=j.connections.filter(c=>!over.includes(c));deleteObject(map,j.id);
 for(const pair of [over,under]){for(const e of pair)extendEndpointV8(map,e,{...j.position,y:pair===over?14.4:j.position.y});connectRoads(map,{roadId:pair[0]!.roadId,end:pair[0]!.end},{roadId:pair[1]!.roadId,end:pair[1]!.end});}
 const scope=new Set(map.roads.filter(r=>r.roadNameId==='v5-east-science').map(r=>r.id)),decks=over.map(e=>{const r=map.roads.find(r=>r.id===e.roadId)!;return {roadId:r.id,station:e.end==='start'?0:polylineLength(r.centerline),height:14.4,halfLength:100};});
 repairCityMainGroundElevation(map,decks,scope,new Set(),scope,[],true);map.environment.metadata={...map.environment.metadata,v8ScienceOverpass:'科创路跨越东西高架及辅路；取消原辅路信号口，出入口保持在相邻道路路口之间。'};
}
function financeJunctionV8(map:CityMapData):void{
 const network=buildCityRoadNetwork(map),ids=['v5-finance-road-split-2','v5-civic-middle-split-split'],ends=network.endpointNodes.filter(n=>n.ends.some(e=>ids.includes(e.roadId)&&e.end==='start')).flatMap(n=>n.ends),ports=['north','east','south','west'] as const;
 const angles=ends.map(e=>{const r=map.roads.find(r=>r.id===e.roadId)!,L=polylineLength(r.centerline),p=sampleAt(r.centerline,e.end==='start'?Math.min(60,L):Math.max(0,L-60)).point;return Math.atan2(p.x-474.95,-(p.z-239.76));});
 for(const e of ends)detachRoadEndpoint(map,e);
 const j=createIntersection(map,{id:'v8-finance-qinghe-junction',type:'cross_4lane',position:groundV8(474.95,239.76),rotation:0,signalized:true,portAngles:Object.fromEntries(ports.map((p,i)=>[p,angles[i]]))});
 for(const [i,e]of ends.entries())connectRoad(map,e,{junctionId:j.id,port:ports[i]!});finishJunctionsV8({...map,intersections:[j]},true);
}
export function restructureCityMainV8(source:CityMapData,progress?:(name:string,map:CityMapData)=>void):CityMapData{
 const map=structuredClone(source);map.signs=[];
 enlargeCoreV8(map);nameCoreV8(map);progress?.('core',map);
 retireAccessV8(map);compactSoutheastV8(map);finishJunctionsV8(map,true);progress?.('retired-access',map);
 frontagesV8(map);progress?.('frontages',map);
 districtStreetsV8(map);commercialStreetV8(map);finishJunctionsV8(map);separateScienceCrossingV8(map);diagonalV8(map);progress?.('district-streets',map);
 localExpresswayAccessV8(map);ringAccessV8(map);cleanCityV7Continuity(map);map.environment.metadata!.v8MainlineContinuity=map.environment.metadata!.v7Continuity!;continuityV8(map);financeJunctionV8(map);finishJunctionsV8(map);progress?.('local-access',map);
 return finishCityMainV8(map,source,progress);
}
export function finishCityMainV8(map:CityMapData,source:CityMapData,progress?:(name:string,map:CityMapData)=>void):CityMapData{
 // These two retained junctions lost an obsolete approach in the road cleanup.
 const civic=map.intersections.find(j=>j.id==='urban-junction-88')!,sports=map.intersections.find(j=>j.id==='urban-junction-210')!;
 civic.type='cross_6lane';sports.type='t_4lane';
 const south=sports.connections.find(c=>c.port==='south')!;south.port='west';sports.portAngles!.west=sports.portAngles!.south;delete sports.portAngles!.south;
 delete sports.approaches;delete sports.pavementHeights;finishJunctionsV8({...map,intersections:[civic,sports]},true);
 terrainV8(map);
 regionalV8(map);regionalMetadataV8(map);progress?.('regional',map);
 plazaClearanceV8(map);
 const ramps=new Set(map.roads.filter(r=>r.gore&&(r.id.startsWith('v8-')||r.groupId==='system-central')).map(r=>r.id));
 // Solve the fixed fast-road layers first. Ordinary streets are adjustable
 // bridge approaches; the full-map solve below then clears them over ramps.
 const fixedIds=new Set(map.roads.filter(r=>r.type==='highway'||r.type==='ramp_1'||!!r.structure?.enclosure||r.id.startsWith('urban-underpass-')||r.centerline.some(p=>Math.hypot(p.x-110,p.z+75)<600)).map(r=>r.id));
 const compressed=new Set(map.roads.filter(r=>!r.id.startsWith('regional:')&&r.type==='ramp_1'&&!ramps.has(r.id)&&r.centerline.some((p,i,a)=>i>0&&Math.abs((p.y??0)-(a[i-1]!.y??0))/Math.hypot(p.x-a[i-1]!.x,p.z-a[i-1]!.z)>.12)).map(r=>r.id));
 fitCityV62Ramps(map,ramps,.0795,fixedIds);
 fitCityV62Ramps(map,compressed,.1195,fixedIds);progress?.('ramp-profiles',map);
 const editable=new Set(map.roads.filter(r=>(!r.id.startsWith('regional:')&&r.type!=='highway'&&r.type!=='ramp_1'&&!r.structure?.enclosure&&(!r.id.startsWith('urban-underpass-')||r.id.startsWith('urban-underpass-west-link'))&&!r.groupId?.startsWith('v8-century'))||r.id.startsWith('regional:v8:airport-city-road')).map(r=>r.id));
 const features=map.roads.filter(r=>editable.has(r.id)).flatMap(r=>(map.environment.corridors??[]).flatMap(f=>cityFeatureCrossings(r,f.centerline).map(c=>({roadId:r.id,station:c.station,height:f.kind==='railway'?6.4:3.2,halfLength:(f.width/2+2)/Math.max(.25,c.sin)}))));
 const inherited=cityUrbanElevationCrossings(source),crossings=cityUrbanElevationCrossings(map).map(c=>{
  const old=inherited.find(q=>q.a===c.a&&q.b===c.b&&Math.abs(q.oldA-q.oldB)>=5.8),fixedFast=[c.a,c.b].some(id=>{const r=map.roads.find(r=>r.id===id)!;return !editable.has(id)&&(r.type==='highway'||r.type==='ramp_1');});
  // Fast-road decks use the existing 5.75m minimum. Do not try to put a
  // ground frontage above a fixed ramp that already has valid clearance.
  return {...c,clearance:fixedFast?5.75:old?Math.min(6.4,Math.abs(old.oldA-old.oldB)):6.4};
 });
 repairCityMainGroundElevation(map,features,editable,new Set(),editable,crossings,true);finishJunctionsV8(map);progress?.('ground-profiles',map);
 populateDistrictsV8(map);placeCityV7Parcels(map);landscapeV8(map);simplifyV8(map);completeNamesV8(map);populateIntersectionMarkingMetadata(map);regionalMetadataV8(map);progress?.('parcels',map);
 const oldJunctions=new Set(source.intersections.map(j=>j.id)),byId=new Map(map.roads.map(r=>[r.id,r]));
 for(const j of map.intersections){
  if(j.id.startsWith('regional:'))continue;
  const major=j.connections.some(c=>byId.get(c.roadId)!.laneCount>=4);
  if(!oldJunctions.has(j.id)&&!major)j.signalized=false;
  if(j.connections.some(c=>byId.get(c.roadId)!.roadNameId?.startsWith('v8-ring-')))j.signalized=false;
  if(j.signalized&&major)j.signals={...j.signals,profile:'lane-countdown',headHeight:7.2};
 }
 const signRoads=map.roads.filter(r=>!r.id.startsWith('regional:')||r.id.startsWith('regional:v8:')),signIds=new Set(signRoads.map(r=>r.id)),squareIds=new Set(map.roads.filter(r=>r.groupId==='v8-century-square').map(r=>r.id));
 const city:CityMapData={...map,regional:undefined,roads:signRoads,intersections:map.intersections.filter(j=>j.connections.every(c=>signIds.has(c.roadId))),objects:map.objects.filter(o=>!o.id.startsWith('regional:')),roadLinks:map.roadLinks!.filter(l=>signIds.has(l.from.roadId)&&signIds.has(l.to.roadId)),connectionPorts:map.connectionPorts!.filter(p=>signIds.has(p.endpoint.roadId)),signs:[]};
 city.signs=generateTopologySigns(city).filter(s=>!squareIds.has(s.roadId));styleCityV62Signs(city);map.signs=city.signs;generateHighwaySigns(map);
 calibrateCityV6SignPosts(map,map,true);calibrateCityV62SafetySigns(map,map);progress?.('signs',map);
 map.version=source.version+1;map.environment.metadata={...map.environment.metadata,cityExpansionVersion:'8',v8Layout:'Continuous two-way frontage streets and New Century Square, compact outward southeast access, old-town/civic/finance arterials, sparse outer districts and airport access',v8CommercialStreet:'承安路历史商业街'};
 return loadCityMap(map);
}
