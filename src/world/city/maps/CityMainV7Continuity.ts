import type { CityMapData } from '../CityMapData';
import { buildCityRoadNetwork } from '../CityRoadNetwork';
import { connectRoads, deleteObject } from '../MapAPI';
import { polylineLength, roadPoints, syncConnections } from '../geometry';
import { ease } from '../presets/BackbonePresets';

/** Absorb small merge intervals created when re-stamping the southeast hub. */
export function cleanCityV7Continuity(map:CityMapData):void {
  const removed:string[]=[];
  // The restamped loops define the western ends of the intercity throat.
  // Retire the old landing stubs beyond them rather than leaving dead ends.
  const landings=buildCityRoadNetwork(map);
  const retiredLandings=map.roads.filter(r=>r.id.startsWith('intercity-')&&landings.endpointNodes.some(n=>n.ends.length===1&&n.ends[0]!.roadId===r.id&&n.position.x<2400)).map(r=>r.id);
  for(const id of retiredLandings)deleteObject(map,id);
  for(const r of [...map.roads.filter(r=>!r.id.startsWith('regional:')&&r.laneCount===3&&!r.gore&&polylineLength(roadPoints(r))<10)]) {
    const network=buildCityRoadNetwork(map),nodes=network.endpointNodes.filter(n=>n.ends.some(e=>e.roadId===r.id)),peers=nodes.flatMap(n=>n.ends).filter(e=>e.roadId!==r.id),a=r.centerline[0]!,b=r.centerline.at(-1)!,target={x:(a.x+b.x)/2,y:((a.y??0)+(b.y??0))/2,z:(a.z+b.z)/2};
    deleteObject(map,r.id);removed.push(r.id);
    for(const e of peers) {
      const road=map.roads.find(road=>road.id===e.roadId)!,path=roadPoints(road),ordered=e.end==='start'?path:[...path].reverse(),original=ordered.map(p=>({...p})),delta={x:target.x-original[0]!.x,y:target.y-(original[0]!.y??0),z:target.z-original[0]!.z};let station=0;
      for(let i=0;i<ordered.length;i++){if(i)station+=Math.hypot(original[i]!.x-original[i-1]!.x,original[i]!.z-original[i-1]!.z);const w=1-ease(station/Math.min(50,polylineLength(path)*.45)),p=ordered[i]!;p.x+=delta.x*w;p.y=(p.y??0)+delta.y*w;p.z+=delta.z*w;}
      road.centerline=path;road.elevationMode='custom';delete road.elevation;
    }
    const incoming=peers.filter(e=>e.end==='end'),outgoing=peers.filter(e=>e.end==='start');
    for(const from of incoming)for(const to of outgoing)if(from.roadId!==to.roadId&&!map.roadLinks!.some(l=>l.from.roadId===from.roadId&&l.from.end===from.end&&l.to.roadId===to.roadId&&l.to.end===to.end))connectRoads(map,from,to);
  }
  // This inherited ten-metre spur doubles back inside its own junction and has
  // no destination, port or onward link. It is not a useful urban street.
  deleteObject(map,'v4-access-6-split');syncConnections(map);
  map.environment.metadata={...map.environment.metadata,v7Continuity:JSON.stringify({absorbedMergeIntervals:removed,retiredLandings,removedUnusedSpur:'v4-access-6-split'})};
}
