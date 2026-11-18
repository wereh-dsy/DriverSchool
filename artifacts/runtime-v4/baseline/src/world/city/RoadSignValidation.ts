import type { CityMapData } from './CityMapData';
import type { MapIssue } from './CityMapValidation';
import { ROAD_SIGN_SIZES,ROAD_SIGN_TEMPLATES } from './RoadSignTemplates';
import {polylineLength,roadPoints} from './geometry';
export function validateRoadSignData(map:CityMapData):MapIssue[] {
  const issues:MapIssue[]=[],error=(path:string,message:string)=>issues.push({severity:'error',code:'sign.invalid',path,message});
  if(map.roadNames!==undefined) {
    if(!map.roadNames||typeof map.roadNames!=='object'||Array.isArray(map.roadNames)){error('roadNames','Expected road-name registry.');return issues;}
    for(const [id,name] of Object.entries(map.roadNames))if(!id||!name||typeof name.primaryText!=='string'||!name.primaryText||name.secondaryText!==undefined&&typeof name.secondaryText!=='string'||!['expressway','urban','interchange','destination'].includes(name.kind))error('roadNames.'+id,'Expected primaryText, optional secondaryText and name category.');
  }
  for(const r of map.roads)if(r.roadNameId&&!map.roadNames?.[r.roadNameId])error('roads.'+r.id,'Unknown roadNameId.');
  if(map.signs===undefined)return issues;
  if(!Array.isArray(map.signs)){error('signs','Expected sign definitions array.');return issues;}
  const ids=new Set([...map.roads,...map.objects,...map.intersections,...map.connectionPorts??[],...map.roadLinks??[]].map(o=>o.id));
  for(let i=0;i<map.signs.length;i++) {
    const s=map.signs[i]!,path='signs['+i+']';
    if(!s||typeof s.id!=='string'||!s.id||ids.has(s.id)){error(path,'Missing/duplicate sign ID.');continue;}ids.add(s.id);
    if(!Object.hasOwn(ROAD_SIGN_TEMPLATES,s.template)||!Object.hasOwn(ROAD_SIGN_SIZES,s.size)||!['EXPRESSWAY_ADVANCE','EXPRESSWAY_DIVERGE','EXPRESSWAY_ENTRY','EXPRESSWAY_DISTANCE','EXPRESSWAY_SERVICE','RAMP_CONFIRMATION','URBAN_DIRECTION','ROAD_NAME','INTERCHANGE_NAME','SPEED_LIMIT','CHEVRON'].includes(s.type))error(path,'Unknown sign type/template/size.');
    if(!map.roads.some(r=>r.id===s.roadId)||!s.position||![s.position.x,s.position.y??0,s.position.z,s.heading].every(Number.isFinite)||!['forward','reverse'].includes(s.laneDirection)||s.language!=='zh-CN')error(path,'Sign needs a road reference, finite pose and valid approach direction/language.');
    if(s.interchangeId&&!map.roadNames?.[s.interchangeId])error(path,'Unknown interchange ID.');
    if(s.approachRoadNameId&&!map.roadNames?.[s.approachRoadNameId])error(path,'Unknown approach road name.');
    if(s.urbanLayout!==undefined&&(s.urbanLayout!=='junction-diagram'||!['ROAD_NAME','URBAN_DIRECTION'].includes(s.type)||s.highwayLayout))error(path,'Urban junction diagrams require an urban direction/name sign.');
    const safety=s.type==='SPEED_LIMIT'||s.type==='CHEVRON';
    if(s.type==='SPEED_LIMIT'&&(s.template!=='speed-limit'||!Number.isInteger(s.speedLimitKmh)||s.speedLimitKmh!<5||s.speedLimitKmh!>160))error(path,'Speed board requires a speed-limit template and a 5–160 km/h integer limit.');
    if(s.type==='CHEVRON'&&(s.template!=='chevron'||!['left','right'].includes(s.chevronDirection!)))error(path,'Chevron board requires its template and a driver-relative turn direction.');
    if((s.template==='speed-limit')!==(s.type==='SPEED_LIMIT')||(s.template==='chevron')!==(s.type==='CHEVRON'))error(path,'Safety templates must match their sign type.');
    if(!Array.isArray(s.destinations)||(safety?s.destinations.length!==0:!s.destinations.length||s.destinations.length>4))error(path,safety?'Safety boards do not contain navigation destinations.':'Expected one to four destinations (including five-leg junctions).');
    else for(const d of s.destinations)if(!d||!map.roadNames?.[d.roadNameId]||d.directionId&&!map.roadNames?.[d.directionId]||!['straight','left','right','exit-right','exit-left'].includes(d.arrow)||d.distanceMetres!==undefined&&(!Number.isFinite(d.distanceMetres)||d.distanceMetres<0))error(path,'Invalid destination reference/arrow/distance.');
    if(s.gantryPosts&& (s.template!=='highway-gantry'||s.gantryPosts.length!==2||!s.gantryPosts.every(Number.isFinite)||s.gantryPosts[0]>=0||s.gantryPosts[1]<=0||s.gantryPosts[1]-s.gantryPosts[0]>40))error(path,'Highway gantry requires two finite shoulder supports.');
    if(s.exitNumber!==undefined&&typeof s.exitNumber!=='string')error(path,'exitNumber must be optional text.');
    if(s.laneArrows&&(!s.laneArrows.length||s.laneArrows.some(a=>!['straight','exit-right','exit-left'].includes(a))))error(path,'Invalid driver-relative lane arrows.');
    if(s.postOffset!==undefined&&(!Number.isFinite(s.postOffset)||Math.abs(s.postOffset)<=0||Math.abs(s.postOffset)>30||s.template!=='gantry'))error(path,'Cantilever post requires a gantry and a finite signed 0–30 m offset.');
    if(s.mountHeight!==undefined&&(!Number.isFinite(s.mountHeight)||s.mountHeight<5.75||s.mountHeight>30||s.template!=='ceiling'))error(path,'Suspended board requires a ceiling template and a finite underside height.');
    if(s.postBaseY!==undefined&&(!Number.isFinite(s.postBaseY)||s.postBaseY>(s.position.y??0)||s.template==='highway-gantry'||s.template==='ceiling'))error(path,'Ground-founded support must end at or below its road anchor; shoulder gantries and ceiling boards remain road-mounted.');
    if(s.stationMetres!==undefined){const road=map.roads.find(r=>r.id===s.roadId);if(!Number.isFinite(s.stationMetres)||s.stationMetres<0||road&&s.stationMetres>polylineLength(roadPoints(road))+.01)error(path,'Sign station must lie on its logical road.');}
    if(s.incomingRoadId&&!map.roads.some(r=>r.id===s.incomingRoadId)||s.outgoingRoadIds?.some(id=>!map.roads.some(r=>r.id===id)))error(path,'Unknown topology provenance road.');
  }
  return issues;
}
