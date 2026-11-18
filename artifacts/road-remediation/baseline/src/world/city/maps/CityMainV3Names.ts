import type { CityMapData } from '../CityMapData';
import names from './CityMainRoadNames.json';
export function assignCityMainRoadNames(map:CityMapData):void {
  map.roadNames=structuredClone(names) as NonNullable<CityMapData['roadNames']>;
  const axes:[string,string][]=[['urban-cbd-arterial','central-avenue'],['urban-diagonal','new-city-avenue'],['urban-north-arterial','north-avenue'],['urban-south-arterial','south-avenue'],['urban-west-ns','west-avenue'],['urban-east-arterial','east-avenue'],['urban-south-industrial','industrial-avenue'],['urban-east-ns','central-street'],['urban-west-secondary','west-cross-street']];
  for(const r of map.roads) {
    if(r.id.startsWith('ring-'))r.roadNameId='ring-expressway';
    else if(r.id.startsWith('ew-'))r.roadNameId='east-west-expressway';
    else if(r.id.startsWith('ns-')||r.groupId==='ns-tunnel')r.roadNameId='north-south-expressway';
    else if(r.id.startsWith('intercity-'))r.roadNameId='intercity-east-expressway';
    else if(r.id.includes(':feeder-'))r.roadNameId=r.id.includes(':feeder-cross-')?'ring-expressway':'north-south-expressway';
    else if(r.groupId==='inner-boulevard')r.roadNameId='inner-boulevard';
    else if(r.groupId==='east-main-aux')r.roadNameId='east-avenue';
    else {const axis=axes.find(([prefix])=>r.id.startsWith(prefix));if(axis)r.roadNameId=axis[1];}
  }
}
