import type { CityMapData,CityPoint,CityRoad,RoadEndpoint } from '../CityMapData';
import { loadCityMap } from '../CityMapLoader';
import { deleteObject,splitRoadAtPoint,roadEndpoint,connectRoads } from '../MapAPI';
import { roadPoints } from '../geometry';
import { point3 } from '../coordinates';
import { expandPreset } from '../presets/InfrastructurePresets';

const mainline=(r:CityRoad)=>r.district==='expressway'&&r.laneCount===3&&r.speedLimit>=80;
const near=(a:CityPoint,b:CityPoint)=>Math.hypot(a.x-b.x,a.z-b.z)<0.03&&Math.abs((a.y??0)-(b.y??0))<0.2;
/** Upgrade the saved V2 map in place. Through roads and peripheral infrastructure are retained. */
export function rebuildCityMainInterchanges(source:unknown):CityMapData {
  const map=loadCityMap(source),baseline=map.roads.filter(mainline).map(r=>({r,points:roadPoints(r)}));
  if(map.environment.metadata?.backboneVersion!=='2')throw new Error('City Main V3 requires the saved V2 baseline');
  const systems=[
    {id:'central',form:'system_compact_x',x:0,z:-150,main:0,cross:8},
    {id:'east',form:'system_compact_turbine',x:1750,z:-150,main:8,cross:0},
    {id:'north',form:'system_compact_star',x:0,z:-1400,main:0,cross:8},
    {id:'west',form:'system_compact_cloverleaf',x:-1750,z:-150,main:0,cross:8},
    {id:'south',form:'system_compact_hybrid',x:0,z:1550,main:-8,cross:0},
  ];
  const groups=new Set(systems.map(s=>'system-'+s.id));
  for(const r of [...map.roads])if(groups.has(r.groupId??'')&&(r.gore||r.id.includes(':collector-')))deleteObject(map,r.id);
  function at(x:number,z:number,axis:'x'|'z'):number {
    let best=Infinity,y=0;
    for(const {points} of baseline)for(let i=1;i<points.length;i++) {
      const a=points[i-1]!,b=points[i]!,dx=b.x-a.x,dz=b.z-a.z;
      if(axis==='x'?Math.abs(dx)<Math.abs(dz)*10:Math.abs(dz)<Math.abs(dx)*10)continue;
      const l2=dx*dx+dz*dz,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/l2)),d=Math.hypot(a.x+t*dx-x,a.z+t*dz-z);
      if(d<best){best=d;y=(a.y??0)+t*((b.y??0)-(a.y??0));}
    }
    if(best>25)throw new Error(`Missing retained mainline at ${x},${z}`);return y;
  }
  function peers(p:CityPoint):{incoming:RoadEndpoint[];outgoing:RoadEndpoint[]} {
    for(const r of [...map.roads.filter(mainline)]) {
      const pts=roadPoints(r);if(near(pts[0]!,p)||near(pts.at(-1)!,p))continue;
      const on=pts.some((b,i)=>{if(!i)return false;const a=pts[i-1]!,dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz,t=((p.x-a.x)*dx+(p.z-a.z)*dz)/l2;return t>=0&&t<=1&&near(point3(a.x+t*dx,(a.y??0)+t*((b.y??0)-(a.y??0)),a.z+t*dz),p);});
      if(on)splitRoadAtPoint(map,r.id,p,{tolerance:0.2});
    }
    const incoming:RoadEndpoint[]=[],outgoing:RoadEndpoint[]=[];
    for(const r of map.roads.filter(mainline))for(const end of ['start','end'] as const)if(near(roadEndpoint(map,{roadId:r.id,end}),p))(end==='start'?outgoing:incoming).push({roadId:r.id,end});
    return {incoming,outgoing};
  }
  for(const s of systems) {
    const profile=(axis:'x'|'z')=>Array.from({length:241},(_,i)=>{const offset=-600+i*5;return {offset,height:at(s.x+(axis==='x'?offset:0),s.z+(axis==='z'?offset:0),axis)};});
    const stamp=expandPreset(s.form,{groupId:'system-'+s.id,position:point3(s.x,0,s.z),mainRoadLanes:6,crossRoadLanes:6,mainElevation:s.main,crossElevation:s.cross,mainProfile:profile('z'),crossProfile:profile('x'),profileInterpolation:'linear',rampRadius:38});
    map.roads.push(...stamp.roads);map.connectionPorts!.push(...stamp.connectionPorts);
    for(const r of stamp.roads){r.district='expressway';if(r.centerline.some(p=>(p.y??0)<-0.1))r.structure={...r.structure,barrierEnabled:false,enclosure:{kind:'cutting',clearance:8}};}
    for(const port of stamp.connectionPorts) {
      const selected=peers(roadEndpoint(map,port.endpoint))[port.endpoint.end==='start'?'incoming':'outgoing'];
      if(!selected.length)throw new Error('Unattached compact ramp '+port.id);
      for(const peer of selected)connectRoads(map,port.endpoint.end==='start'?peer:port.endpoint,port.endpoint.end==='start'?port.endpoint:peer);
    }
  }
  map.version=4;map.environment.metadata={...map.environment.metadata,backboneVersion:'3',urbanForms:systems.map(s=>s.id+'='+s.form).join(';')};
  return map;
}
