import type { CityMapData, CityRoad } from '../CityMapData';
import { loadCityMap } from '../CityMapLoader';
import { buildCityRoadNetwork } from '../CityRoadNetwork';
import { roadPoints, polylineLength, syncConnections } from '../geometry';
import { expandPreset } from '../presets/InfrastructurePresets';
import { deleteObject, connectRoads, createRoad } from '../MapAPI';
import { cityV6Alignment } from './CityMainV6Recipe';
import { ease } from '../presets/BackbonePresets';
import { generateTopologySigns } from '../SignPlacementGenerator';
import { calibrateCityV6SignPosts } from './CityMainV6SignPosts';
import { clearV61RailPiers } from './CityMainV61Rail';
import { fitCityV62Ramps } from './CityMainV62Profiles';
import { addCityV62Access, attachV62Endpoint } from './CityMainV62Access';
import { styleCityV62Signs, calibrateCityV62SafetySigns } from './CityMainV62Signs';
import { styleCityV62Landmarks } from './CityMainV62Landmarks';
import { cleanCityV62Continuity } from './CityMainV62Continuity';

const ew=(r:CityRoad)=>r.roadNameId==='east-west-expressway'&&r.laneCount===3&&!r.gore;
const ns=(r:CityRoad)=>r.roadNameId==='north-south-expressway'&&r.laneCount===3&&!r.gore;
export const cityV62EWHeight=(x:number)=>8*(1-ease((Math.abs(x)-1960)/440));
const eastRingLift=(z:number)=>6.4*(1-ease((Math.abs(z+150)-400)/600));
export const cityV62NSHeight=(z:number,previous:number)=>z<=-1000?0:z< -500?-6.4*ease((z+1000)/500):z<=10?-6.4:z<450?-6.4-1.6*ease((z-10)/440):previous;

/** Keep the mainline axes; fit linked ramp heights and necessary approaches. */
export function profileCityV62(map:CityMapData):void {
  const ring=(r:CityRoad)=>r.roadNameId==='ring-expressway'&&r.laneCount===3&&!r.gore&&r.centerline.some(p=>p.x>1600&&Math.abs(p.z+150)<1000);
  const network=buildCityRoadNetwork(map),oldPaths=new Map(map.roads.map(r=>[r.id,roadPoints(r)])),axes=new Set(map.roads.filter(r=>ew(r)||ns(r)||ring(r)).map(r=>r.id));
  for(const r of map.roads.filter(r=>axes.has(r.id))) {
    r.centerline=oldPaths.get(r.id)!.map(p=>({...p,y:ew(r)?cityV62EWHeight(p.x):ns(r)?cityV62NSHeight(p.z,p.y??0):(p.y??0)+eastRingLift(p.z)}));r.curve='polyline';r.elevationMode='custom';delete r.elevation;
    if(ns(r)&&r.centerline.some(p=>(p.y??0)<-.1)&&!r.structure?.enclosure)r.structure={...r.structure,enclosure:{kind:'cutting',clearance:6}};
    // Regional anchors stay at their authored XYZ. These short outer approaches
    // belong to G17/S37 transition, rather than an urban at-grade EW segment.
    if(ew(r)&&r.centerline.some(p=>Math.abs(p.x)>1960))r.corridorSection='boundary-transition';
    else if(ew(r))r.corridorSection='elevated-mainline';
    else r.corridorSection=r.centerline.every(p=>(p.y??0)<-6)?'depressed-mainline':'vertical-transition';
  }
  const target=new Map<string,number>();
  for(const node of network.endpointNodes) {
    const anchor=node.ends.find(e=>axes.has(e.roadId));if(!anchor)continue;
    const r=map.roads.find(r=>r.id===anchor.roadId)!,y=r.centerline[anchor.end==='start'?0:r.centerline.length-1]!.y??0;
    for(const e of node.ends)target.set(e.roadId+':'+e.end,y);
  }
  for(const r of map.roads.filter(r=>!axes.has(r.id))) {
    if(['system-central','system-east'].includes(r.groupId??''))continue;
    const points=oldPaths.get(r.id)!,a=points[0]!,b=points.at(-1)!,da=(target.get(r.id+':start')??a.y??0)-(a.y??0),db=(target.get(r.id+':end')??b.y??0)-(b.y??0);
    if(Math.abs(da)+Math.abs(db)<1e-7)continue;
    const length=polylineLength(points);let d=0;
    r.centerline=points.map((p,i)=>{if(i)d+=Math.hypot(p.x-points[i-1]!.x,p.z-points[i-1]!.z);const t=ease(d/length);return {...p,y:(p.y??0)+da*(1-t)+db*t};});r.curve='polyline';r.elevationMode='custom';delete r.elevation;
    if(r.centerline.some(p=>(p.y??0)<-.1)&&!r.structure?.enclosure)r.structure={...r.structure,enclosure:{kind:'cutting',clearance:6}};
  }
  const systems=map.roads.filter(r=>['system-central','system-east'].includes(r.groupId??''));
  for(const r of systems)deleteObject(map,r.id);
  for(const [group,preset,x,main,approach] of [['system-central','system_compact_x',0,-6.4,500],['system-east','system_compact_turbine',1750,14.4,330]] as const) {
    const old=systems.filter(r=>r.groupId===group),mainProfile=Array.from({length:241},(_,i)=>{const offset=-600+i*5;return {offset,height:group==='system-central'?cityV62NSHeight(offset-150,-8):8+eastRingLift(offset-150)};}),crossProfile=Array.from({length:241},(_,i)=>{const offset=-600+i*5;return {offset,height:cityV62EWHeight(x+offset)};});
    const stamp=expandPreset(preset,{groupId:group,position:{x,y:0,z:-150},mainElevation:main,crossElevation:8,mainApproach:approach,rightApproach:group==='system-central'?260:160,mainProfile,crossProfile});
    for(const previous of old) {
      const r=stamp.roads.find(r=>r.id===previous.id)!;
      r.district=previous.district;r.decorationProfile=previous.decorationProfile;r.roadNameId=previous.roadNameId;
      if(group==='system-central')r.centerline=r.centerline.map(cityV6Alignment);
      map.roads.push(r);
      if(r.centerline.some(p=>(p.y??0)<-.1))r.structure={...r.structure,enclosure:{kind:'cutting',clearance:6}};
      for(const end of ['start','end'] as const) {
        const p=r.centerline[end==='start'?0:r.centerline.length-1]!,peers=attachV62Endpoint(map,p,host=>axes.has(host.id)||ew(host)||ns(host)||host.roadNameId==='ring-expressway'&&host.laneCount===3&&!host.gore);
        for(const peer of peers.filter(e=>e.end===(end==='start'?'end':'start')))connectRoads(map,end==='start'?peer:{roadId:r.id,end},end==='start'?{roadId:r.id,end}:peer);
      }
    }
  }
  syncConnections(map);
}

export function cleanCityV62Names(map:CityMapData):void {
  const unnamed=new Set(Object.entries(map.roadNames!).filter(([,n])=>/高架[南北]路|快速辅路|出口连接路|北连接路/.test(n.primaryText)).map(([id])=>id));
  for(const r of map.roads)if(unnamed.has(r.roadNameId??'')||r.gore||r.type==='ramp_1')r.displayName='';
  map.environment.metadata={...map.environment.metadata,v62UnnamedNames:JSON.stringify([...unnamed].map(id=>({id,oldName:map.roadNames![id]!.primaryText})))};
}

/** Incremental V6.1 continuation. All external records are merged back exactly. */
export function refineCityMainV62(source:CityMapData):CityMapData {
  if(source.environment.metadata?.cityRefinementMinor!=='1')throw new Error('V6.2 requires the current V6.1 source');
  const original=structuredClone(source),ids=new Set(source.roads.filter(r=>!r.id.startsWith('regional:')).map(r=>r.id));
  const city:CityMapData={...structuredClone(source),regional:undefined,roads:structuredClone(source.roads.filter(r=>ids.has(r.id))),intersections:structuredClone(source.intersections.filter(j=>!j.id.startsWith('regional:'))),objects:structuredClone(source.objects.filter(o=>!o.id.startsWith('regional:'))),roadLinks:structuredClone(source.roadLinks!.filter(l=>ids.has(l.from.roadId)&&ids.has(l.to.roadId))),connectionPorts:structuredClone(source.connectionPorts!.filter(p=>ids.has(p.endpoint.roadId))),signs:[]};
  for(const r of city.roads.filter(r=>r.id==='v6-campus-access:off-1'||r.id==='v6-civic-access:off-1'||r.roadNameId==='v6-civic-exit-road'))deleteObject(city,r.id);
  const formerExit=city.intersections.find(j=>j.id==='urban-junction-167');
  if(formerExit&&formerExit.connections.length===2) {
    const a=formerExit.connections.find(c=>c.end==='end')!,b=formerExit.connections.find(c=>c.end==='start')!,ar=city.roads.find(r=>r.id===a.roadId)!,br=city.roads.find(r=>r.id===b.roadId)!;
    deleteObject(city,formerExit.id);
    const r=createRoad(city,{...ar,roadNameId:undefined,id:'v62-civic-continuation',centerline:[{...ar.centerline.at(-1)!},{...br.centerline[0]!}],elevationMode:'custom'});
    r.roadNameId=ar.roadNameId;connectRoads(city,{roadId:ar.id,end:'end'},{roadId:r.id,end:'start'});connectRoads(city,{roadId:r.id,end:'end'},{roadId:br.id,end:'start'});
  }
  profileCityV62(city);
  styleCityV62Landmarks(city);
  for(const r of city.roads.filter(r=>r.id.startsWith('v4-east-new-district'))) {
    r.centerline=roadPoints(r).map(p=>({...p,y:-.024}));r.elevationMode='ground';r.elevation=-.024;
  }
  const ramps=new Set(city.roads.filter(r=>(r.gore||r.type==='ramp_1')&&JSON.stringify(original.roads.find(a=>a.id===r.id)?.centerline)!==JSON.stringify(r.centerline)).map(r=>r.id));
  addCityV62Access(city);for(const r of city.roads.filter(r=>r.type==='ramp_1'&&r.id.startsWith('v62-')))ramps.add(r.id);
  fitCityV62Ramps(city,ramps);syncConnections(city);cleanCityV62Continuity(city);clearV61RailPiers(city);cleanCityV62Names(city);
  city.signs=generateTopologySigns(city);
  styleCityV62Signs(city);
  const reservedLinks=new Set(original.roadLinks!.filter(l=>!ids.has(l.from.roadId)||!ids.has(l.to.roadId)).map(l=>l.id));
  for(const l of city.roadLinks!)if(reservedLinks.has(l.id))l.id='v62-city-'+l.id;
  const result:CityMapData={...original,version:original.version+1,roads:[...city.roads,...original.roads.filter(r=>!ids.has(r.id))],intersections:[...city.intersections,...original.intersections.filter(j=>j.id.startsWith('regional:'))],roadLinks:[...city.roadLinks!,...original.roadLinks!.filter(l=>!ids.has(l.from.roadId)||!ids.has(l.to.roadId))],connectionPorts:[...city.connectionPorts!,...original.connectionPorts!.filter(p=>!ids.has(p.endpoint.roadId))],signs:[...city.signs,...original.signs!.filter(s=>!ids.has(s.roadId))],environment:city.environment};
  result.roadNames=city.roadNames;
  result.objects=[...city.objects,...original.objects.filter(o=>o.id.startsWith('regional:'))];
  calibrateCityV6SignPosts(city,result,true);calibrateCityV62SafetySigns(city,result);
  result.environment.metadata={...result.environment.metadata,cityRefinementMinor:'2',v62Expressways:'EW urban deck +8m, fixed Regional anchor transitions outside |X|=1960. NS north 0m, descent Z=-1000..-500, core -6.4m, connection to existing -8m southern tunnel and southern rise retained.',v62Environment:JSON.stringify({objects:city.objects.length,trees:city.objects.filter(o=>o.prefabId==='tree').length,lamps:city.objects.filter(o=>o.prefabId.startsWith('streetlight')).length,buildings:city.objects.filter(o=>o.facade).length})};
  return loadCityMap(result);
}
