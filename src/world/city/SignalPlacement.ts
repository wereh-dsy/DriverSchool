import type { CityIntersection, CityMapData, CityPoint, IntersectionPort } from './CityMapData';
import { junctionApproachExtent, junctionSurfaceContains } from './JunctionSurface';
import { roadPoints, rotatePoint } from './geometry';
import { runtimeRoadClearance } from './RoadClearance';

export function approachPaintOffsets(map:CityMapData,j:CityIntersection,mouth:CityPoint,outward:CityPoint){
  let boundaryOffset=.8;while(boundaryOffset<30&&junctionSurfaceContains(j,map,{x:mouth.x+outward.x*boundaryOffset,y:mouth.y,z:mouth.z+outward.z*boundaryOffset},.15))boundaryOffset+=.4;
  return {boundaryOffset,crossOffset:boundaryOffset+2.2,stopOffset:boundaryOffset+4.4,paintApproach:boundaryOffset<30};
}

/** Shared data-only placement used by renderer and authoring inspection. */
export function findSignalPole(map:CityMapData,j:CityIntersection,outward:CityPoint,right:CityPoint,h:number,width:number,height:number,origin:CityPoint=j.position):CityPoint {
  const clearance=runtimeRoadClearance(map),base=Math.min(0,j.position.y??0);
  for(const side of [-1,1])for(const extra of [1,4,8,14])for(let lateral=width/2+1;lateral<=width/2+24;lateral+=1){
    const p={x:origin.x+side*outward.x*(h+extra)+right.x*lateral,y:base,z:origin.z+side*outward.z*(h+extra)+right.z*lateral};
    if(!clearance.roadAt(p,.55,base-.2,(j.position.y??0)+height+.5,undefined,undefined,true)&&!clearance.junctionAt(p,.55,base-.2,(j.position.y??0)+height+.5))return p;
  }
  throw new Error('No signal pole clear of traffic at '+j.id);
}
export function signalApproach(map:CityMapData,j:CityIntersection,port:IntersectionPort){
  const connection=j.connections.find(c=>c.port===port),road=map.roads.find(r=>r.id===connection?.roadId);
  if(!connection||!road)throw new Error('Unknown signal approach '+j.id+':'+port);
  const path=roadPoints(road),start=connection.end==='start',mouth=start?path[0]!:path.at(-1)!,neighbour=start?path[1]!:path.at(-2)!;
  const length=Math.hypot(neighbour.x-mouth.x,neighbour.z-mouth.z)||1,outward={x:(neighbour.x-mouth.x)/length,z:(neighbour.z-mouth.z)/length},right={x:outward.z,z:-outward.x};
  const incoming=road.travelDirection==='two-way'||(road.travelDirection==='forward')===(connection.end==='end');
  const localMouth=j.approachOffsets?.[port]??rotatePoint({x:mouth.x-j.position.x,z:mouth.z-j.position.z},-j.rotation),reach=Math.max(junctionApproachExtent(j,map,port),Math.hypot(localMouth.x,localMouth.z));
  const override=j.signals?.placements?.[port];
  const width=road.laneCount*road.laneWidth,height=override?.headHeight??(j.signals?.profile?Math.max(7.2,j.signals.headHeight??7.2):j.signals?.headHeight??5.8);
  const base=rotatePoint(localMouth,j.rotation),origin={x:j.position.x+base.x,y:j.position.y??0,z:j.position.z+base.z};
  const legacy={x:origin.x-outward.x*(reach+1)+right.x*(width/2+1),y:j.position.y??0,z:origin.z-outward.z*(reach+1)+right.z*(width/2+1)};
  const pole=findSignalPole(map,j,outward,right,reach,width,height,origin);
  const expectedPosition={...pole,y:j.position.y??0},expectedHeading=Math.atan2(-outward.x,-outward.z);
  const paint=approachPaintOffsets(map,j,origin,outward),lateral=road.travelDirection==='two-way'?width/4:0;
  const stopLine={position:{x:origin.x+outward.x*paint.stopOffset+right.x*lateral,y:origin.y,z:origin.z+outward.z*paint.stopOffset+right.z*lateral},width:(road.travelDirection==='two-way'?width/2:width)-.25,depth:.35,derived:true,enabled:j.signalized&&incoming&&paint.paintApproach};
  return {intersectionId:j.id,approach:port,roadId:road.id,incoming,mouth,outward,incomingTangent:{x:-outward.x,z:-outward.z},right,roadWidth:width,height,divided:j.type==='divided_cross',expectedPosition,expectedHeading,position:override?.position??(j.signals?.profile?expectedPosition:legacy),heading:override?.heading??expectedHeading,derived:!override,oppositeSideCandidate:expectedPosition,stopLine,paintOffsets:paint};
}
