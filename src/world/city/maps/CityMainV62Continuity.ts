import type { CityMapData, CityIntersection, CityPoint, IntersectionPort, RoadEndpoint } from '../CityMapData';
import { deleteObject } from '../MapAPI';
import { roadPoints, polylineLength, sampleAt, syncConnections, rotatePoint, portDirection, junctionExtent } from '../geometry';
import { setJunctionPavementFootprint } from '../JunctionSurface';

/** Local repairs to the observed V6.1 fragments, not a new road generator. */
export function cleanCityV62Continuity(map:CityMapData):void {
  const changed=new Set<CityIntersection>(),removed:string[]=[];
  const absorb=(tinyId:string,keepId:string)=>{
    const tiny=map.roads.find(r=>r.id===tinyId)!,keep=map.roads.find(r=>r.id===keepId)!,link=map.roadLinks!.find(l=>[l.from,l.to].some(e=>e.roadId===tinyId)&&[l.from,l.to].some(e=>e.roadId===keepId))!;
    const a=link.from.roadId===tinyId?link.from:link.to,b=link.from.roadId===keepId?link.from:link.to,free=a.end==='start'?'end':'start';
    const p=roadPoints(tiny),q=roadPoints(keep);if(a.end===b.end)p.reverse();
    keep.centerline=b.end==='start'?[...p,...q.slice(1)]:[...q,...p.slice(1)];keep.curve='polyline';keep.elevationMode='custom';delete keep.elevation;
    const remap=(e:RoadEndpoint)=>{if(e.roadId===tinyId&&e.end===free){e.roadId=keepId;e.end=b.end;}};
    for(const j of map.intersections)for(const c of j.connections){if(c.roadId===tinyId)changed.add(j);remap(c);}
    map.roadLinks=map.roadLinks!.filter(l=>l!==link);for(const l of map.roadLinks){remap(l.from);remap(l.to);}for(const p of map.connectionPorts!)remap(p.endpoint);
    deleteObject(map,tinyId);removed.push(tinyId);
  };
  absorb('urban-east-frontage-access','v4-access-5');absorb('urban-direct-south-out-split','v4-access-4');
  // Remove an unused nine-metre dead-end at the duplicate civic junction.
  deleteObject(map,'v4-civic-collector');removed.push('v4-civic-collector');
  const merge=(ids:string[],internal:string[])=>{
    const old=map.intersections.filter(j=>ids.includes(j.id)),j=old[0]!,arms=old.flatMap(j=>j.connections.filter(c=>!internal.includes(c.roadId)).map(c=>({c,approach:j.approaches?.[c.port]})));
    j.position={x:old.reduce((s,j)=>s+j.position.x,0)/old.length,y:j.position.y??0,z:old.reduce((s,j)=>s+j.position.z,0)/old.length};j.rotation=0;j.type='irregular';j.channelized=false;j.connections=[];j.portAngles={};j.approaches={};delete j.pavementHeights;delete j.pavementFootprint;
    const ports:IntersectionPort[]=['north','east','south','west','extra'];
    arms.forEach(({c,approach},i)=>{const r=map.roads.find(r=>r.id===c.roadId)!,path=roadPoints(r);if(c.end==='end')path.reverse();const p=sampleAt(path,Math.min(30,polylineLength(path))).point,port=ports[i]!;j.portAngles![port]=Math.atan2(p.x-j.position.x,-(p.z-j.position.z));j.connections.push({...c,port});if(approach)j.approaches![port]=approach;});
    map.intersections=map.intersections.filter(a=>!ids.includes(a.id)||a===j);internal.forEach(id=>{deleteObject(map,id);removed.push(id);});changed.add(j);
  };
  merge(['urban-junction-88','urban-junction-90','urban-junction-104'],['v5-civic-west','v4-civic-collector-split-2','v4-inner-0-split-split-2']);
  merge(['urban-junction-97','urban-junction-98'],['v5-east-garden-split-2']);
  // Move the four/six-lane transition out of a five-metre junction mouth.
  const access=map.roads.find(r=>r.id==='v4-access-2')!,arterial=map.roads.find(r=>r.id==='urban-diagonal-split-split')!,path=roadPoints(arterial),cut=sampleAt(path,25).point;
  let distance=0,at=1;for(;at<path.length;at++){distance+=Math.hypot(path[at]!.x-path[at-1]!.x,path[at]!.z-path[at-1]!.z);if(distance>=25)break;}
  access.centerline=[cut,...path.slice(0,at).reverse(),...roadPoints(access).slice(1)];access.curve='polyline';arterial.centerline=[cut,...path.slice(at)];arterial.curve='polyline';
  syncConnections(map);
  const moved:string[]=[];
  for(const [roadId,junctionId]of [
    ['v4-west-residential-split-3','urban-junction-62'],
    ['v4-diagonal-split-2-split-split-2-split','urban-junction-190'],
    ['v5-west-market-road','urban-junction-147'],
    ['v5-civic-west-split','urban-junction-140'],
  ]) {
    const r=map.roads.find(r=>r.id===roadId)!,length=polylineLength(roadPoints(r));if(length>=12)continue;
    const j=map.intersections.find(j=>j.id===junctionId)!,c=j.connections.find(c=>c.roadId===roadId)!,a=r.centerline[c.end==='start'?0:r.centerline.length-1]!,b=r.centerline[c.end==='start'?r.centerline.length-1:0]!,L=Math.hypot(a.x-b.x,a.z-b.z),shift=12-length;
    j.position.x+=(a.x-b.x)/L*shift;j.position.z+=(a.z-b.z)/L*shift;changed.add(j);moved.push(j.id);syncConnections(map);
  }
  const changedRoads=new Set<string>();
  for(const j of changed)for(const c of j.connections) {
    const r=map.roads.find(r=>r.id===c.roadId)!,p=roadPoints(r),d=rotatePoint(portDirection(j,c.port),j.rotation),h=junctionExtent(j,map),outside=(q:CityPoint)=>(q.x-j.position.x)*d.x+(q.z-j.position.z)*d.z>h+.05;
    if(c.end==='start'){while(p.length>2&&!outside(p[1]!))p.splice(1,1);}else while(p.length>2&&!outside(p.at(-2)!))p.splice(p.length-2,1);
    // Moving a bridge mouth can leave an old high vertex immediately beside
    // the new endpoint. Fit that existing approach back within its 12% grade.
    const total=polylineLength(p),first=p[0]!.y??0,last=p.at(-1)!.y??0;let station=0;
    r.centerline=p.map((q,i)=>{if(i)station+=Math.hypot(q.x-p[i-1]!.x,q.z-p[i-1]!.z);const lower=Math.max(first-.1199*station,last-.1199*(total-station)),upper=Math.min(first+.1199*station,last+.1199*(total-station));return {...q,y:Math.max(lower,Math.min(upper,q.y??0))};});r.curve='polyline';r.elevationMode='custom';delete r.elevation;changedRoads.add(r.id);
  }
  for(const j of changed)setJunctionPavementFootprint(j,map);
  map.environment.metadata={...map.environment.metadata,v62Continuity:JSON.stringify({removed,movedJunctions:moved,mergedJunctions:3,changedRoads:[...changedRoads],minimumRoadMetres:Math.min(...map.roads.map(r=>polylineLength(roadPoints(r))))})};
}
