import type { CityMapData } from '../world/city/CityMapData';
import { roadFunction } from '../world/city/RoadClassification';

/** Adopt existing Qingjiang names/stamp groups once on open; preserve geometry and existing IDs. */
export function adoptEditorMetadata(map:CityMapData):CityMapData {
  const metadata=structuredClone(map.editing??{corridors:[],groups:[],attachments:[],ramps:[]});
  const assigned=new Set(metadata.corridors.flatMap(c=>c.roadIds)),named=new Map<string,string[]>(),groups=new Map<string,string[]>();
  for(const road of map.roads)if(road.roadNameId&&!assigned.has(road.id)){const key=`${road.roadNameId}|${roadFunction(road)}`,ids=named.get(key)??[];ids.push(road.id);named.set(key,ids);}
  const used=new Set([...map.roads,...map.intersections,...map.objects,...map.signs??[],...map.roadLinks??[],...map.connectionPorts??[],...metadata.corridors,...metadata.groups].map(e=>e.id));
  const allocate=(base:string)=>{let id=base,n=2;while(used.has(id))id=`${base}-${n++}`;used.add(id);return id;};
  for(const[key,roadIds]of named){const[nameId,kind]=key.split('|'),name=map.roadNames?.[nameId!]?.primaryText??nameId!;metadata.corridors.push({id:allocate(`corridor:${nameId}:${kind}`),name:`${name} · ${kind}`,roadIds});}
  const grouped=new Set(metadata.groups.flatMap(g=>g.memberIds));
  for(const e of [...map.roads,...map.intersections,...map.objects])if(e.groupId&&!grouped.has(e.id)){const ids=groups.get(e.groupId)??[];ids.push(e.id);groups.set(e.groupId,ids);}
  for(const[name,memberIds]of groups)metadata.groups.push({id:allocate(`group:${name}`),name,memberIds,kind:map.roads.some(r=>memberIds.includes(r.id)&&r.presetSource)?'interchange':'corridor',locked:false});
  return{...map,editing:metadata};
}
