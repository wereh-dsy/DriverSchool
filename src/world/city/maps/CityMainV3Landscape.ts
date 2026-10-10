import type { CityMapData } from '../CityMapData';
import { RoadClearance } from '../RoadClearance';
import { roadPoints,polylineLength,sampleAt,rotatePoint } from '../geometry';
import { createSubject3Materials } from '../../subject3/materials';
import { PrefabRegistry } from '../PrefabRegistry';
import { placePrefab } from '../MapAPI';
/** A small readability pass; existing district massing is kept wherever the revised roads permit it. */
export function refineCityMainV3Landscape(map:CityMapData):void {
  const clearance=new RoadClearance(map),materials=createSubject3Materials(),prefabs=new PrefabRegistry(materials),before=map.objects.length;
  map.objects=map.objects.filter(o=>{
    if(o.prefabId==='guide_sign')return false;
    const p=prefabs.entries.get(o.prefabId)!;if(!p.solid)return true;
    const width=p.size[0]*(o.scale?.x??1),depth=p.size[2]*(o.scale?.z??1),height=p.size[1]*(o.scale?.y??1);
    if(o.prefabId==='noise_barrier') {
      for(let x=-width/2;x<=width/2+0.01;x+=2)for(const z of [-depth/2,0,depth/2]){const q=rotatePoint({x,z},o.rotation),point={x:o.position.x+q.x,y:o.position.y??0,z:o.position.z+q.z};if(clearance.roadAt(point,0.5,(point.y??0)-1,(point.y??0)+height+0.65)||clearance.junctionAt(point,0.5,(point.y??0)-1,(point.y??0)+height+0.65))return false;}
    } else if(!clearance.permitsProp(o.position,o.prefabId==='tree'?2.6:Math.hypot(width,depth)/2+0.6,height))return false;
    return !(map.signs??[]).some(sign=>Math.hypot(o.position.x-sign.position.x,o.position.z-sign.position.z)<Math.hypot(width,depth)/2+14&&Math.abs((sign.position.y??0)-(o.position.y??0))<height+10);
  });
  prefabs.dispose();Object.values(materials).forEach(m=>m.dispose());
  let added=0;
  for(const r of map.roads.filter(r=>r.groupId==='inner-boulevard')) {
    const points=roadPoints(r),length=polylineLength(points);
    for(let d=40;d<length-40;d+=95) {
      const s=sampleAt(points,d);if(Math.abs(s.point.y??0)>0.1)continue;
      for(const side of [-1,1]) {
        const offset=(r.laneCount*r.laneWidth/2+6)*side,p={x:s.point.x-s.tangent.z*offset,y:0,z:s.point.z+s.tangent.x*offset};
        if(clearance.permitsProp(p,2.6,6.8)&&!(map.signs??[]).some(sign=>Math.hypot(p.x-sign.position.x,p.z-sign.position.z)<18)){placePrefab(map,{baseName:'v3-inner-tree',prefabId:'tree',position:p,rotation:0,district:'central',color:'#779b62'});added++;}
      }
    }
  }
  for(const [x,z] of [[0,-150],[-1750,-150],[1750,-150],[0,-1400],[0,1550]])for(const sign of [-1,1]) {
    const p={x:x!+sign*100,y:0,z:z!+100};
    if(clearance.permitsProp(p,22,0.08)){placePrefab(map,{baseName:'v3-maintenance-ground',prefabId:'hardscape',position:p,rotation:0,scale:{x:0.8,y:1,z:0.8},color:'#b7b7ac'});added++;}
  }
  map.environment.metadata!.landscapePass=`Retained V2 district massing; removed ${before-map.objects.length+added} obsolete/conflicting props; added ${added} tree/maintenance elements`;
  map.environment.metadata!.landscapeObjects=String(map.objects.length);
}
