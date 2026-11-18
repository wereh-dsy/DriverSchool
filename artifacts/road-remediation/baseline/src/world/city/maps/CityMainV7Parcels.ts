import type { CityMapData, CityObject, CityPoint } from '../CityMapData';
import { PrefabRegistry } from '../PrefabRegistry';
import { createSubject3Materials } from '../../subject3/materials';
import { RoadClearance } from '../RoadClearance';
import { rotatePoint } from '../geometry';
import { distanceToCityCorridor } from './CityMainV6Geography';

/** Re-seat existing parcels and furniture after the authored road migration. */
export function placeCityV7Parcels(map:CityMapData):void {
  const materials=createSubject3Materials(),registry=new PrefabRegistry(materials),clearance=new RoadClearance(map);
  const buildings=map.objects.filter(o=>!o.id.startsWith('regional:')&&['residential_low','residential_mid','office','commercial','industrial','school','garage','stadium'].includes(o.prefabId));
  const size=(o:CityObject)=>{const s=registry.entries.get(o.prefabId)!.size;return {w:s[0]*(o.scale?.x??1),d:s[2]*(o.scale?.z??1),h:s[1]*(o.scale?.y??1)};};
  const ringRoads=map.roads.filter(r=>r.roadNameId==='ring-expressway'&&r.laneCount===3&&!r.gore),ordered=[ringRoads.find(r=>r.id.startsWith('ring-cw-'))!];
  while(Math.hypot(ordered.at(-1)!.centerline.at(-1)!.x-ordered[0]!.centerline[0]!.x,ordered.at(-1)!.centerline.at(-1)!.z-ordered[0]!.centerline[0]!.z)>.1) {
    const p=ordered.at(-1)!.centerline.at(-1)!;ordered.push(ringRoads.find(r=>!ordered.includes(r)&&Math.hypot(r.centerline[0]!.x-p.x,r.centerline[0]!.z-p.z)<.1)!);
  }
  const polygon=ordered.flatMap(r=>r.centerline);
  const inside=(p:CityPoint)=>{let yes=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i]!,b=polygon[j]!;if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)yes=!yes;}return yes;};
  const clear=(o:CityObject,p:CityPoint)=>{
    const {w,d,h}=size(o);
    for(let x=-w/2;x<=w/2+.01;x+=Math.min(5,w))for(let z=-d/2;z<=d/2+.01;z+=Math.min(5,d)) {
      const offset=rotatePoint({x,z},o.rotation),q={x:p.x+offset.x,z:p.z+offset.z};
      if(clearance.roadAt(q,.6,(p.y??0)-.1,(p.y??0)+h,undefined,undefined,true)||clearance.junctionAt(q,.6,(p.y??0)-.1,(p.y??0)+h))return false;
      if(map.environment.corridors!.some(f=>distanceToCityCorridor(q,f.centerline)<f.width/2+2))return false;
    }return true;
  };
  const overlap=(o:CityObject,p:CityPoint,other:CityObject)=>{
    const a=size(o),b=size(other),dx=other.position.x-p.x,dz=other.position.z-p.z;
    const axes=[o.rotation,o.rotation+Math.PI/2,other.rotation,other.rotation+Math.PI/2];
    return axes.every(angle=>{
      const nx=Math.cos(angle),nz=-Math.sin(angle),project=(r:number,w:number,d:number)=>(Math.abs(nx*Math.cos(r)-nz*Math.sin(r))*w+Math.abs(nx*Math.sin(r)+nz*Math.cos(r))*d)/2;
      return Math.abs(dx*nx+dz*nz)<project(o.rotation,a.w,a.d)+project(other.rotation,b.w,b.d)+2;
    });
  };
  const moved:string[]=[];
  for(const o of buildings) {
    if(clear(o,o.position))continue;
    const original={...o.position},wasInside=inside(original);let placed=false;
    for(let radius=10;radius<=240&&!placed;radius+=10)for(let i=0;i<24;i++) {
      const p={...original,x:original.x+Math.cos(i*Math.PI/12)*radius,z:original.z+Math.sin(i*Math.PI/12)*radius};
      if(inside(p)!==wasInside||!clear(o,p)||buildings.some(other=>other!==o&&overlap(o,p,other)))continue;
      o.position=p;moved.push(o.id);placed=true;break;
    }
    if(!placed)throw new Error('V7 parcel requires a larger block: '+o.id);
  }
  // Keep low roadside details out of every affected carriageway. Reposition
  // small furniture locally instead of adding more objects to fill the expansion.
  const adjusted:string[]=[];
  for(const o of map.objects.filter(o=>!o.id.startsWith('regional:')&&(o.prefabId==='tree'||o.prefabId.startsWith('streetlight')))) {
    const s=size(o),p=o.position;
    if(!clearance.roadAt(p,.6,(p.y??0)-.1,(p.y??0)+s.h,undefined,undefined,true)&&!clearance.junctionAt(p,.6,(p.y??0)-.1,(p.y??0)+s.h))continue;
    let placed=false;
    for(let radius=4;radius<=40&&!placed;radius+=4)for(let i=0;i<12;i++) {
      const q={x:p.x+Math.cos(i*Math.PI/6)*radius,y:0,z:p.z+Math.sin(i*Math.PI/6)*radius};
      if(!clearance.roadAt(q,.8,-.1,s.h,undefined,undefined,true)&&!clearance.junctionAt(q,.8,-.1,s.h)&&!buildings.some(b=>overlap(o,q,b))){o.position=q;adjusted.push(o.id);placed=true;break;}
    }
    if(!placed)throw new Error('V7 furniture requires a free shoulder: '+o.id);
  }
  const landmarkObjects:Record<string,string>={'west-city-station':'v61-city-station','qingjiang-government':'v61-government','qingjiang-museum':'v61-museum','people-square':'v61-people-square','qingjiang-university':'v61-university-library','qingjiang-exhibition':'v61-exhibition','qingjiang-sports':'v61-stadium','jincheng-center':'v6-finance-195'};
  for(const l of map.environment.landmarks??[]){const o=map.objects.find(o=>o.id===landmarkObjects[l.id]);if(o)l.position={...o.position};}
  registry.dispose();Object.values(materials).forEach(m=>m.dispose());
  map.environment.metadata={...map.environment.metadata,v7Parcels:JSON.stringify({movedBuildings:moved,adjustedFurniture:adjusted})};
}
