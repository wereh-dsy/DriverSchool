import type { CityMapData, CityPoint, CityRoad } from '../CityMapData';
import { polylineLength, refreshPortPoses, roadPoints, syncConnections, portDirection } from '../geometry';
import { setJunctionPavementFootprint } from '../JunctionSurface';

/** Local access edits only. Mainline seam relocation preserves the original support profile. */
function moveMergeNode(map:CityMapData,ramp:CityRoad,target:CityPoint):CityPoint {
  const end=/exit|:off-/.test(ramp.id)?'start':'end',old=end==='start'?ramp.centerline[0]!:ramp.centerline.at(-1)!;
  const same=(p:CityPoint)=>Math.hypot(p.x-old.x,p.z-old.z)<.01&&Math.abs((p.y??0)-(old.y??0))<.01;
  const candidates=map.roads.filter(r=>r.groupId!==ramp.groupId&&r.type==='highway'&&!r.gore);
  const before=candidates.find(r=>same(r.centerline.at(-1)!)),after=candidates.find(r=>same(r.centerline[0]!));
  if(!before||!after)throw new Error('Missing mainline merge pair '+ramp.id);
  const path=[...roadPoints(before),...roadPoints(after).slice(1)];
  for(let i=1;i<path.length;i++){
    const a=path[i-1]!,b=path[i]!,dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz;
    if(l2<1e-8)continue;
    const t=((target.x-a.x)*dx+(target.z-a.z)*dz)/l2;
    if(t<0||t>1||Math.hypot(a.x+t*dx-target.x,a.z+t*dz-target.z)>.01)continue;
    const p={x:target.x,y:(a.y??0)+t*((b.y??0)-(a.y??0)),z:target.z};
    const distinct=(points:CityPoint[])=>points.filter((q,k)=>!k||Math.hypot(q.x-points[k-1]!.x,q.z-points[k-1]!.z)>.05);
    before.centerline=distinct([...path.slice(0,i),p]);after.centerline=distinct([p,...path.slice(i)]);
    before.curve=after.curve='polyline';before.elevationMode=after.elevationMode='custom';
    if(end==='start')ramp.centerline[0]=p;else ramp.centerline[ramp.centerline.length-1]=p;
    return p;
  }
  throw new Error('Merge relocation outside existing mainline '+ramp.id);
}
function grade(path:CityPoint[],a:number,b:number):CityPoint[] {
  const length=polylineLength(path);let distance=0;
  return path.map((p,i)=>{if(i)distance+=Math.hypot(p.x-path[i-1]!.x,p.z-path[i-1]!.z);
    const t=Math.max(0,Math.min(1,(distance-12)/(length-24)));
    const integral=(u:number)=>.5*(u-.2/Math.PI*Math.sin(Math.PI*u/.2));
    const blend=(t<.2?integral(t):t>.8?.8-integral(1-t):t-.1)/.8;
    return {...p,y:a+(b-a)*blend};});
}
function bezier(a:CityPoint,b:CityPoint,c:CityPoint,d:CityPoint):CityPoint[] {
  const points=Array.from({length:81},(_,i)=>{const t=i/80,u=1-t;return {x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,z:u*u*u*a.z+3*u*u*t*b.z+3*u*t*t*c.z+t*t*t*d.z};});
  return grade(points,a.y??0,d.y??0);
}
export function buildCityMainV41(source:CityMapData):CityMapData {
  const map=structuredClone(source);
  // Two existing full directional-access diamonds; transverse surface road alignment stays fixed.
  for(const groupId of ['diamond-west','diamond-east']){
    const junctions=map.intersections.filter(j=>j.groupId===groupId);
    for(const j of junctions)j.position.z=-150+(j.position.z>-150?60:-60);
    syncConnections(map);
    for(const r of map.roads.filter(r=>r.groupId===groupId&&r.gore)){
      const exit=r.id.includes('exit'),terminal=exit?r.centerline.at(-1)!:r.centerline[0]!;
      const old=exit?r.centerline[0]!:r.centerline.at(-1)!;
      const axis=junctions[0]!.position.x,side=old.x>axis?1:-1;
      const main=moveMergeNode(map,r,{x:axis+side*110,z:old.z});
      const direction=r.id.includes('northbound')?-1:1;
      const a=exit?main:terminal,d=exit?terminal:main;
      const b={x:a.x+direction*48,z:a.z};
      const c=exit?{x:d.x-direction*38,z:d.z}:{x:d.x-direction*48,z:d.z};
      r.centerline=bezier(a,b,c,d);r.curve='polyline';r.gore!.length=80;
      r.designProfile='urban';r.speedLimit=35;
    }
  }
  // Existing three paired frontage zones: 30m lateral move in two radius-30m bends.
  for(const r of map.roads.filter(r=>r.groupId?.startsWith('direct-')&&/:on-|:off-/.test(r.id))){
    const off=r.id.includes(':off-'),old=off?r.centerline[0]!:r.centerline.at(-1)!,local=off?r.centerline.at(-1)!:r.centerline[0]!;
    const dx=local.x-old.x,dz=local.z-old.z,axis=Math.abs(dx)>Math.abs(dz)?'x':'z';
    const target={...old,[axis]:local[axis]+Math.sign(old[axis]-local[axis])*160};
    const main=moveMergeNode(map,r,target),a=off?main:local,b=off?local:main;
    const direction=axis==='x'?{x:Math.sign(b.x-a.x),z:0}:{x:0,z:Math.sign(b.z-a.z)};
    const normal={x:-direction.z,z:direction.x},lateral=(b.x-a.x)*normal.x+(b.z-a.z)*normal.z;
    const radius=30,theta=Math.acos(1-Math.abs(lateral)/(2*radius)),bend=2*radius*Math.sin(theta);
    const begin=off?60:160-60-bend,points:CityPoint[]=[];
    for(let distance=0;distance<=160;distance+=2){
      let offset=0;
      if(distance>=begin+bend)offset=lateral;
      else if(distance>begin){const s=distance-begin;
        offset=Math.sign(lateral)*(s<=bend/2?radius-Math.sqrt(radius*radius-s*s):Math.abs(lateral)-(radius-Math.sqrt(radius*radius-(bend-s)*(bend-s))));}
      points.push({x:a.x+direction.x*distance+normal.x*offset,z:a.z+direction.z*distance+normal.z*offset});
    }
    r.centerline=grade(points,a.y??0,b.y??0);r.curve='polyline';r.gore!.length=off?60:80;r.designProfile='urban';
  }
  syncConnections(map);refreshPortPoses(map);
  for(const j of map.intersections){
    // A nearly parallel branch is a merge, not a pedestrian crossing/signal terminal.
    const directions=j.connections.map(c=>portDirection(j,c.port));
    if(directions.length>=3&&directions.every(a=>Math.abs(a.x*directions[0]!.z-a.z*directions[0]!.x)<.18)){
      j.signalized=false;j.approaches={};
    }
    setJunctionPavementFootprint(j,map);
  }
  map.version=source.version+1;
  map.environment.metadata={...map.environment.metadata,junctionGeometryVersion:'4.1',urbanAccessVersion:'4.1'};
  return map;
}
