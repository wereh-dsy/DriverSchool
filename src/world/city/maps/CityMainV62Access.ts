import type { CityMapData, CityRoad } from '../CityMapData';
import { expandPreset } from '../presets/InfrastructurePresets';
import { createRoad, connectRoads, splitRoadAtPoint } from '../MapAPI';
import { cityV6Alignment } from './CityMainV6Recipe';
import { cityV61Snap, connectV61Street } from './CityMainV61Corridors';
import { trimCityJunctionApproaches } from './CityMainUrbanConnections';
import { bezierPoints } from '../presets/BackbonePresets';
import { roadPoints } from '../geometry';

/** Two directional movements. Existing diamonds serve the other directions. */
export function addCityV62Access(map:CityMapData):void {
  for(const [id,x,z,rotation,part,mainY,name] of [
    ['v62-qinghe-eastbound-on',-600,-150,Math.PI/2,'on--1',8,'east-west-expressway'],
    ['v62-nancheng-southbound-off',0,1250,0,'off--1',-8,'north-south-expressway'],
  ] as const) {
    const stamp=expandPreset('urban_side_access',{groupId:id,position:{x,y:0,z},rotation,mainElevation:mainY,length:700});
    const r=stamp.roads.find(r=>r.id.endsWith(':'+part))!;r.type='ramp_1';r.roadNameId=name;r.displayName='';r.district=id.includes('qinghe')?'qinghe':'nancheng';r.decorationProfile='ramp';
    if(rotation)r.centerline=r.centerline.map(cityV6Alignment);
    if(mainY<0)r.structure={...r.structure,enclosure:{kind:'cutting',clearance:6}};
    map.roads.push(r);
    const on=part.startsWith('on'),end=on?'end':'start',p=r.centerline[on?r.centerline.length-1:0]!;
    for(const e of attachV62Endpoint(map,p,q=>q.roadNameId===name&&q.laneCount===3&&!q.gore).filter(e=>e.end===(on?'start':'end')))connectRoads(map,on?{roadId:r.id,end}:e,on?e:{roadId:r.id,end});
    const terminal=r.centerline[on?0:r.centerline.length-1]!,target=cityV61Snap(map,id.includes('qinghe')?{x:-600,y:0,z:-65}:{x:-215,y:0,z:1150},q=>id.includes('qinghe')?q.roadNameId==='v61-ew-core-west-south':q.roadNameId==='south-avenue');
    const local=createRoad(map,{id:id+'-local',type:'urban_2lane',laneCount:2,laneWidth:3.2,travelDirection:'two-way',speedLimit:30,displayName:'',centerline:bezierPoints(terminal,{x:terminal.x+(target.x-terminal.x)*.4,y:terminal.y,z:terminal.z+(target.z-terminal.z)*.4},{x:terminal.x+(target.x-terminal.x)*.7,y:target.y,z:terminal.z+(target.z-terminal.z)*.7},target),elevationMode:'custom',structure:{barrierEnabled:false,piersEnabled:false},sidewalk:{enabled:true,width:1.8},district:r.district,roadClass:'local',decorationProfile:'collector',streetlights:false});
    connectRoads(map,{roadId:local.id,end:'start'},{roadId:r.id,end:on?'start':'end'});
    connectV61Street(map,local);trimCityJunctionApproaches(map,false);
  }
}

export function attachV62Endpoint(map:CityMapData,p:{x:number;y?:number;z:number},match:(r:CityRoad)=>boolean):{roadId:string;end:'start'|'end'}[] {
  const near=map.roads.filter(match).flatMap(r=>(['start','end'] as const).filter(e=>{const q=r.centerline[e==='start'?0:r.centerline.length-1]!;return Math.hypot(p.x-q.x,p.z-q.z)<.06&&Math.abs((p.y??0)-(q.y??0))<.06;}).map(end=>({roadId:r.id,end})));
  if(near.length)return near;
  for(const r of map.roads.filter(match)) {
    const points=roadPoints(r);for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!,dx=b.x-a.x,dz=b.z-a.z,t=((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz);if(t<0||t>1)continue;const q={x:a.x+t*dx,y:(a.y??0)+t*((b.y??0)-(a.y??0)),z:a.z+t*dz};if(Math.hypot(p.x-q.x,p.z-q.z)>.06||Math.abs((p.y??0)-(q.y??0))>.08)continue;Object.assign(p,q);const split=splitRoadAtPoint(map,r.id,q);return [split.from,split.to];}
  }
  throw new Error('V6.2 endpoint is not on its existing corridor '+JSON.stringify(p));
}

