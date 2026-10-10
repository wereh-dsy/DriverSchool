import type { CityMapData } from './CityMapData';
import type { MapIssue } from './CityMapValidation';
import { ROAD_SIGN_SIZES,ROAD_SIGN_TEMPLATES } from './RoadSignTemplates';
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
    if(!Object.hasOwn(ROAD_SIGN_TEMPLATES,s.template)||!Object.hasOwn(ROAD_SIGN_SIZES,s.size)||!['EXPRESSWAY_ADVANCE','EXPRESSWAY_DIVERGE','RAMP_CONFIRMATION','URBAN_DIRECTION','ROAD_NAME','INTERCHANGE_NAME'].includes(s.type))error(path,'Unknown sign type/template/size.');
    if(!map.roads.some(r=>r.id===s.roadId)||!s.position||![s.position.x,s.position.y??0,s.position.z,s.heading].every(Number.isFinite)||!['forward','reverse'].includes(s.laneDirection)||s.language!=='zh-CN')error(path,'Sign needs a road reference, finite pose and valid approach direction/language.');
    if(s.interchangeId&&!map.roadNames?.[s.interchangeId])error(path,'Unknown interchange ID.');
    if(!Array.isArray(s.destinations)||!s.destinations.length||s.destinations.length>3)error(path,'Expected one to three destinations.');
    else for(const d of s.destinations)if(!d||!map.roadNames?.[d.roadNameId]||d.directionId&&!map.roadNames?.[d.directionId]||!['straight','left','right','exit-right'].includes(d.arrow)||d.distanceMetres!==undefined&&(!Number.isFinite(d.distanceMetres)||d.distanceMetres<0))error(path,'Invalid destination reference/arrow/distance.');
    if(s.exitNumber!==undefined&&typeof s.exitNumber!=='string')error(path,'exitNumber must be optional text.');
  }
  return issues;
}
