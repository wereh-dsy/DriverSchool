import type { CityMapData, CityPoint, CityRoad } from '../CityMapData';
import { loadCityMap } from '../CityMapLoader';
import { buildCityRoadNetwork } from '../CityRoadNetwork';
import { roadPoints, polylineLength, sampleAt, syncConnections, refreshPortPoses, rotatePoint } from '../geometry';
import { ease } from '../presets/BackbonePresets';
import { expandPreset } from '../presets/InfrastructurePresets';
import { deleteObject, connectRoads } from '../MapAPI';
import { attachV62Endpoint } from './CityMainV62Access';
import { setJunctionPavementFootprint } from '../JunctionSurface';
import { populateIntersectionMarkingMetadata } from '../MarkingOwnership';
import { generateTopologySigns } from '../SignPlacementGenerator';
import { styleCityV62Signs, calibrateCityV62SafetySigns } from './CityMainV62Signs';
import { calibrateCityV6SignPosts } from './CityMainV6SignPosts';
import { repairCityMainGroundElevation, cityUrbanElevationCrossings } from './CityMainGroundElevation';
import { cityFeatureCrossings } from './CityMainV6Geography';
import { clearV61RailPiers } from './CityMainV61Rail';
import { placeCityV7Parcels } from './CityMainV7Parcels';
import { cleanCityV7Continuity } from './CityMainV7Continuity';
import { fitCityV62Ramps } from './CityMainV62Profiles';

const regional=(r:CityRoad)=>r.id.startsWith('regional:');
const mainline=(r:CityRoad)=>r.laneCount===3&&!r.gore&&['ring-expressway','east-west-expressway','north-south-expressway','intercity-east-expressway','intercity-expressway'].includes(r.roadNameId??'');
const fixedForm=(r:CityRoad)=>regional(r)||mainline(r)||r.groupId?.startsWith('system-')||r.groupId==='peripheral-interchange'||!!r.structure?.enclosure&&r.centerline.every(p=>(p.y??0)<-6);
const window=(v:number,a:number,b:number,c:number,d:number)=>ease((v-a)/(b-a))*(1-ease((v-c)/(d-c)));
function sampled(points:CityPoint[]):CityPoint[] {
  const result:CityPoint[]=[];
  for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!,count=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/4);for(let k=0;k<count;k++){const t=k/count;result.push({x:a.x+(b.x-a.x)*t,y:(a.y??0)+((b.y??0)-(a.y??0))*t,z:a.z+(b.z-a.z)*t});}}
  result.push({...points.at(-1)!});return result;
}

/** Remove authoring subdivisions only where the final road is effectively straight. */
function compactPaths(map:CityMapData):void {
  const changed=new Set<string>(JSON.parse(map.environment.metadata!.v7ChangedRoads!));
  for(const r of map.roads.filter(r=>changed.has(r.id))) {
    const result:CityPoint[]=[];
    for(const p of r.centerline){
      if(result.length>=2){const a=result.at(-2)!,b=result.at(-1)!,dx=p.x-a.x,dz=p.z-a.z,d=Math.hypot(dx,dz),t=((b.x-a.x)*dx+(b.z-a.z)*dz)/(d*d);
        if(d<=12&&t>0&&t<1&&Math.abs((b.x-a.x)*dz-(b.z-a.z)*dx)/d<.01&&Math.abs((b.y??0)-(a.y??0)-t*((p.y??0)-(a.y??0)))<.002)result.pop();
      }result.push(p);
    }r.centerline=result;
  }
}

/** Local authoring coordinates, with the existing outer motorway junctions pinned. */
function ringExpansion(source:CityMapData):(p:CityPoint)=>CityPoint {
  const protectedSites=source.regional!.structures.filter(s=>s.kind==='interchange'||s.kind==='tunnel'||s.kind==='bridge'&&s.center.x< -2400);
  const fade=(v:number,a:number,b:number)=>Math.max(0,Math.min(1,(b-v)/(b-a)));
  return p=>{
    let weight=1;
    for(const s of protectedSites)weight*=ease((Math.hypot(p.x-s.center.x,p.z-s.center.z)-s.radius-40)/250);
    const x=p.x,z=p.z;
    const dx=(560*ease((x-850)/900)*fade(x,2350,3100)-220*ease((-x-1150)/600)*fade(-x,2200,2750))*window(z,-2200,-1500,1600,2650);
    const north=(225*ease((-z-750)/250)+225*ease((-z-1250)/200))*fade(-z,2000,2750)*window(x,-2300,-1300,700,1350);
    const dz=-north+520*ease((z-700)/850)*fade(z,1850,2550)*window(x,-2700,-1800,2000,2800);
    // The northern arc bends around the park; the southeast arc opens toward
    // the port, while the historic western edge remains relatively straight.
    const eastBend=75*window(x,1300,1650,1900,2350)*window(z,100,550,1100,1500);
    return {...p,x:x+(dx+eastBend)*weight,z:z+dz*weight};
  };
}

/** Outlying precincts move further than the ring. Inner edges stay in town. */
function precinctOffset(p:CityPoint):{x:number;z:number} {
  const north=780*ease((-p.z-1250)/500)*ease((p.x+1050)/400);
  const south=450*ease((p.z-850)/650)*Math.max(0,Math.min(1,(2250-p.z)/750))*ease((p.x+1550)/500);
  const east=700*ease((p.x-950)/900)*window(p.z,-1550,-1000,1400,2100);
  return {x:east,z:south-north};
}

function compactSoutheast(map:CityMapData):void {
  const center={x:2380,y:0,z:650};
  const old=map.roads.filter(r=>r.groupId==='peripheral-interchange');
  const host=(r:CityRoad)=>mainline(r)&&(r.roadNameId==='ring-expressway'||r.id.startsWith('intercity-'));
  // Carry the production stamp along the actual curved carriageways, including
  // its merge landings. Moving just the endpoints cuts across the opposite lane.
  const axis=(value:number,ring:boolean)=>{
    const hits:number[]=[];
    for(const r of map.roads.filter(host).filter(r=>(r.roadNameId==='ring-expressway')===ring))for(let i=1;i<r.centerline.length;i++) {
      const a=r.centerline[i-1]!,b=r.centerline[i]!,aa=ring?a.z:a.x,bb=ring?b.z:b.x;
      if(Math.abs(bb-aa)<1e-6||value<Math.min(aa,bb)||value>Math.max(aa,bb))continue;
      const t=(value-aa)/(bb-aa),q=ring?a.x+(b.x-a.x)*t:a.z+(b.z-a.z)*t;
      if(ring&&q<1800||hits.some(h=>Math.abs(h-q)<.1))continue;hits.push(q);
    }
    return hits.length?hits.reduce((s,v)=>s+v,0)/hits.length:ring?center.x:center.z;
  };
  center.x=axis(center.z,true);
  const height=(offset:number,ring:boolean)=>{
    const target=ring?{x:center.x,z:center.z+offset}:{x:center.x+offset,z:center.z};
    let best=Infinity,y=0;
    for(const r of map.roads.filter(host).filter(r=>(r.roadNameId==='ring-expressway')===ring))for(const p of roadPoints(r)) {
      const d=Math.hypot(p.x-target.x,p.z-target.z);if(d<best){best=d;y=p.y??0;}
    }return {offset,height:y};
  };
  const offsets=Array.from({length:241},(_,i)=>-1200+i*10);
  const stamp=expandPreset('peripheral_motorway_junction',{groupId:'peripheral-interchange',position:center,designProfile:'motorway',mainApproach:350,crossApproach:700,crossCarriagewayOffset:14,rampRadius:50,mainElevation:8,crossElevation:-8,mainProfile:offsets.map(d=>height(d,true)),crossProfile:offsets.map(d=>height(d,false)),profileInterpolation:'linear'});
  for(const r of old)deleteObject(map,r.id);
  for(const r of stamp.roads) {
    const previous=old.find(a=>a.id===r.id)!;
    Object.assign(r,{district:previous.district,roadNameId:previous.roadNameId,displayName:'',decorationProfile:'ramp'});
    r.centerline=r.centerline.map(p=>{const x=p.x+axis(p.z,true)-center.x;return {...p,x,z:p.z+axis(x,false)-center.z};});
    map.roads.push(r);
    for(const end of ['start','end'] as const) {
      const path=r.centerline,at=end==='start'?0:path.length-1,p=path[at]!;
      let best=Infinity,target={...p};
      for(const h of map.roads.filter(host))for(let i=1;i<h.centerline.length;i++) {
        const a=h.centerline[i-1]!,b=h.centerline[i]!,dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));
        const q={x:a.x+t*dx,y:(a.y??0)+t*((b.y??0)-(a.y??0)),z:a.z+t*dz},d=Math.hypot(q.x-p.x,q.z-p.z);
        if(d<best){best=d;target=q;}
      }
      const ordered=end==='start'?path:[...path].reverse(),original=ordered.map(q=>({...q})),delta={x:target.x-p.x,y:(target.y??0)-(p.y??0),z:target.z-p.z};let station=0;
      for(let i=0;i<ordered.length;i++){const q=ordered[i]!;if(i)station+=Math.hypot(original[i]!.x-original[i-1]!.x,original[i]!.z-original[i-1]!.z);const w=1-ease(station/100);q.x+=delta.x*w;q.z+=delta.z*w;q.y=(q.y??0)+delta.y*w;}
      Object.assign(path[at]!,target);
      for(const peer of attachV62Endpoint(map,path[at]!,host).filter(e=>e.end===(end==='start'?'end':'start')))connectRoads(map,end==='start'?peer:{roadId:r.id,end},end==='start'?{roadId:r.id,end}:peer);
    }
  }
}

/** Explicit V6.2 -> V7 content edit; no runtime or physics changes. */
export function layoutCityMainV7(source:CityMapData):CityMapData {
  const map=structuredClone(source),base=ringExpansion(source);
  map.signs=[];
  // The sports precinct already joins the port boulevard and eastern collector.
  // Retire its redundant parallel west leg rather than retaining a narrow wedge.
  deleteObject(map,'v61-sports-road-split');
  const former=map.intersections.find(j=>j.id==='urban-junction-211')!,a=former.connections.find(c=>c.end==='end')!,b=former.connections.find(c=>c.end==='start')!,ar=map.roads.find(r=>r.id===a.roadId)!,br=map.roads.find(r=>r.id===b.roadId)!;
  ar.centerline=[...roadPoints(ar),{...former.position},...roadPoints(br)];
  for(const j of map.intersections)for(const c of j.connections)if(c.roadId===br.id)c.roadId=ar.id;
  for(const l of map.roadLinks!)for(const e of [l.from,l.to])if(e.roadId===br.id)e.roadId=ar.id;
  for(const p of map.connectionPorts!)if(p.endpoint.roadId===br.id)p.endpoint.roadId=ar.id;
  map.intersections=map.intersections.filter(j=>j!==former);map.roads=map.roads.filter(r=>r!==br);
  for(const l of map.environment.landmarks??[])l.roadIds=l.roadIds.filter(id=>id!=='v61-sports-road-split').map(id=>id===br.id?ar.id:id);
  const roads=new Map(map.roads.map(r=>[r.id,r])),net=buildCityRoadNetwork(map),weights=new Map<string,number>();
  for(const n of net.endpointNodes) {
    const w=n.ends.some(e=>fixedForm(roads.get(e.roadId)!))?0:1;
    for(const e of n.ends)weights.set(e.roadId+':'+e.end,w);
  }
  for(const j of map.intersections){const w=j.connections.some(c=>fixedForm(roads.get(c.roadId)!))?0:1;for(const c of j.connections)weights.set(c.roadId+':'+c.end,w);}
  const warp=(p:CityPoint,w:number)=>{const b=base(p),d=precinctOffset(p),oldTown=220*window(-p.x,1150,1750,2200,2900)*window(p.z,-1450,-1100,1050,1500);return {...b,x:b.x+(d.x+oldTown)*w,z:b.z+d.z*w};};
  const changed:string[]=[];
  for(const r of map.roads) {
    const path=sampled(roadPoints(r)),length=polylineLength(path),wa=weights.get(r.id+':start')??1,wb=weights.get(r.id+':end')??1;let station=0;
    const points=path.map((p,i)=>{if(i)station+=Math.hypot(p.x-path[i-1]!.x,p.z-path[i-1]!.z);const w=fixedForm(r)?0:r.gore||r.type==='ramp_1'?wa+(wb-wa)*ease(station/length):1+(wa-1)*(1-ease(station/Math.min(180,length/2)))+(wb-1)*(1-ease((length-station)/Math.min(180,length/2)));return warp(p,w);});
    if(points.some((p,i)=>Math.hypot(p.x-path[i]!.x,p.z-path[i]!.z)>.001)){changed.push(r.id);r.centerline=sampled(points);r.curve='polyline';}
  }
  for(const j of map.intersections) {
    const old={...j.position},w=j.connections.some(c=>fixedForm(roads.get(c.roadId)!))?0:1;j.position=warp(old,w);j.portAngles??={};
    for(const c of j.connections){const r=roads.get(c.roadId)!,p=r.centerline[c.end==='start'?0:r.centerline.length-1]!;j.portAngles[c.port]=Math.atan2(p.x-j.position.x,-(p.z-j.position.z))+j.rotation;}
  }
  for(const o of map.objects) {
    const p=o.position,w=o.id.startsWith('regional:')?0:1,q=rotatePoint({x:0,z:1},o.rotation),a=warp(p,w),b=warp({...p,x:p.x+q.x,z:p.z+q.z},w);
    o.position=a;o.rotation=Math.atan2(b.x-a.x,b.z-a.z);
    if(['waterway','railway_track','green_strip'].includes(o.prefabId)&&['qinghe-creek','qinghe-bank','west-city-rail'].includes(o.groupId??''))o.scale={x:o.scale?.x??1,y:o.scale?.y??1,z:(o.scale?.z??1)*Math.hypot(b.x-a.x,b.z-a.z)};
  }
  for(const f of map.environment.corridors??[])f.centerline=f.centerline.map(p=>{
    const q=warp(p,1),w=f.kind==='railway'?window(p.z,-1500,-1300,-850,-650):0;
    return {...q,x:q.x+(p.x-q.x)*w,z:q.z+(p.z-225-q.z)*w};
  });
  map.objects=map.objects.filter(o=>o.groupId!=='west-city-rail');
  const rail=map.environment.corridors!.find(f=>f.kind==='railway')!.centerline,railLength=polylineLength(rail);
  for(let station=0,i=0;station<railLength;station+=40,i++) {
    const a=sampleAt(rail,station).point,b=sampleAt(rail,Math.min(railLength,station+40)).point;
    map.objects.push({id:'v7-city-rail-'+i,prefabId:'railway_track',position:{x:(a.x+b.x)/2,y:0,z:(a.z+b.z)/2},rotation:Math.atan2(b.x-a.x,b.z-a.z),scale:{x:1,y:1,z:(Math.hypot(b.x-a.x,b.z-a.z)+.1)/40},groupId:'west-city-rail',district:'xixing'});
  }
  for(const l of map.environment.landmarks??[])l.position=warp(l.position,1);
  for(const s of map.environment.spawnPoints){const p=s.position,q={...p,x:p.x+Math.sin(s.rotation),z:p.z+Math.cos(s.rotation)},a=warp(p,0),b=warp(q,0);s.position=a;s.rotation=Math.atan2(b.x-a.x,b.z-a.z);}
  // Only the approach portions inside the compact displacement field change.
  // Every existing Regional interchange retains its authored center and roads.
  for(const route of map.regional!.routes)route.centerline=route.centerline.map(base);
  for(const group of [map.regional!.highways!.exits,map.regional!.highways!.junctions,map.regional!.highways!.services])for(const item of group)item.position=base(item.position);
  // Preserve the complete railway underpass, including both approach grades.
  // Its adjoining surface streets absorb the move, rather than its tunnel ramp.
  const underpass=new Set(source.roads.filter(r=>r.groupId==='urban-rail-underpass'||r.id.startsWith('urban-underpass-')).map(r=>r.id));
  const offsetZ=-225;
  for(const original of source.roads.filter(r=>underpass.has(r.id))) {
    const road=roads.get(original.id)!;road.centerline=roadPoints(original).map(p=>({...p,z:p.z+offsetZ}));
    road.curve='polyline';road.elevationMode='custom';delete road.elevation;
  }
  for(const node of net.endpointNodes.filter(n=>n.ends.some(e=>underpass.has(e.roadId)))) {
    const anchor=node.ends.find(e=>underpass.has(e.roadId))!,r=roads.get(anchor.roadId)!,p=r.centerline[anchor.end==='start'?0:r.centerline.length-1]!;
    for(const e of node.ends){const peer=roads.get(e.roadId)!;Object.assign(peer.centerline[e.end==='start'?0:peer.centerline.length-1]!,p);}
  }
  for(const original of source.intersections.filter(j=>j.connections.some(c=>underpass.has(c.roadId)))) {
    const j=map.intersections.find(j=>j.id===original.id)!;j.position={...original.position,z:original.position.z+offsetZ};
    j.portAngles=structuredClone(original.portAngles);
  }
  syncConnections(map);refreshPortPoses(map);
  for(const r of map.roads.filter(r=>r.id.startsWith('intercity-'))) {
    r.centerline=r.centerline.map(p=>({...p,y:-8*(1-ease((p.x-2500)/1000))}));r.elevationMode='custom';delete r.elevation;
  }
  compactSoutheast(map);refreshPortPoses(map);
  cleanCityV7Continuity(map);refreshPortPoses(map);
  for(const j of map.intersections)setJunctionPavementFootprint(j,map);
  map.environment.metadata={...map.environment.metadata,v7ChangedRoads:JSON.stringify(changed)};
  return map;
}

export function expandCityMainV7(source:CityMapData):CityMapData {
  const map=layoutCityMainV7(source),base=ringExpansion(source);
  fitCityV62Ramps(map,new Set(['regional:beilu:off:1','regional:beilu:on:1','regional:beilu:on:-1']),.06);
  // Refit the southern rise in its new available length. Keep the tunnel and
  // the Regional landing fixed, and carry only endpoint deltas into its ramps.
  const southern=map.roads.filter(r=>r.roadNameId==='north-south-expressway'&&r.laneCount===3&&!r.gore),southernIds=new Set(southern.map(r=>r.id)),endZ=Math.max(...southern.flatMap(r=>r.centerline.map(p=>p.z))),network=buildCityRoadNetwork(map),deltas=new Map<string,number>();
  for(const node of network.endpointNodes) {
    const anchor=node.ends.find(e=>southernIds.has(e.roadId));if(!anchor||node.position.z<=2000)continue;
    const y=-8*(1-ease((node.position.z-2000)/(endZ-2000))),delta=y-(node.position.y??0);
    for(const e of node.ends)deltas.set(e.roadId+':'+e.end,delta);
  }
  for(const r of map.roads) {
    const da=deltas.get(r.id+':start')??0,db=deltas.get(r.id+':end')??0;
    if(southernIds.has(r.id)){for(const p of r.centerline)if(p.z>2000)p.y=-8*(1-ease((p.z-2000)/(endZ-2000)));}
    else if(Math.abs(da)+Math.abs(db)>1e-7){const path=roadPoints(r),length=polylineLength(path),span=Math.min(200,length*.45);let d=0;r.centerline=path.map((p,i)=>{if(i)d+=Math.hypot(p.x-path[i-1]!.x,p.z-path[i-1]!.z);return {...p,y:(p.y??0)+da*(1-ease(d/span))+db*(1-ease((length-d)/span))};});r.elevationMode='custom';delete r.elevation;}
  }
  map.regional!.cityExtensions=[
    {minX:-2450,maxX:1350,minZ:-3150,maxZ:-2100},
    {minX:-2450,maxX:3550,minZ:2250,maxZ:2750},
    {minX:3550,maxX:3950,minZ:-1500,maxZ:2250},
  ];
  const city:CityMapData={...map,regional:undefined,roads:map.roads.filter(r=>!regional(r)),intersections:map.intersections.filter(j=>!j.id.startsWith('regional:')),objects:map.objects.filter(o=>!o.id.startsWith('regional:')),roadLinks:map.roadLinks!.filter(l=>!l.from.roadId.startsWith('regional:')&&!l.to.roadId.startsWith('regional:')),connectionPorts:map.connectionPorts!.filter(p=>!p.endpoint.roadId.startsWith('regional:')),signs:[]};
  const editable=new Set(city.roads.filter(r=>!fixedForm(r)&&!r.id.startsWith('urban-underpass-')&&(!r.gore&&r.type!=='ramp_1'||r.centerline.every(p=>(p.y??0)>=-.1)||r.id==='v62-nancheng-southbound-off:off--1')).map(r=>r.id));
  const features=city.roads.filter(r=>editable.has(r.id)).flatMap(r=>(city.environment.corridors??[]).flatMap(f=>cityFeatureCrossings(r,f.centerline).map(c=>({roadId:r.id,station:c.station,height:f.kind==='railway'?6.4:3.2,halfLength:(f.width/2+2)/Math.max(.25,c.sin)}))));
  const inherited=cityUrbanElevationCrossings(source),crossings=cityUrbanElevationCrossings(map).map(c=>{
    const old=inherited.find(old=>old.a===c.a&&old.b===c.b&&Math.abs(old.oldA-old.oldB)>=5.8);
    return old?{...c,clearance:Math.min(6.4,Math.abs(old.oldA-old.oldB))}:c;
  });
  repairCityMainGroundElevation(map,features,editable,new Set(),editable,crossings,true);city.environment=map.environment;syncConnections(map);
  compactPaths(map);placeCityV7Parcels(map);
  for(const j of map.intersections)setJunctionPavementFootprint(j,map);populateIntersectionMarkingMetadata(map);clearV61RailPiers(city);
  city.signs=generateTopologySigns(city);styleCityV62Signs(city);
  const oldRoads=new Map(source.roads.map(r=>[r.id,r])),newRoads=new Map(map.roads.map(r=>[r.id,r]));
  map.signs=[...city.signs,...source.signs!.filter(s=>s.roadId.startsWith('regional:')).map(s=>{
    const old=roadPoints(oldRoads.get(s.roadId)!),path=roadPoints(newRoads.get(s.roadId)!),station=(s.stationMetres??0)*polylineLength(path)/polylineLength(old),a=sampleAt(old,s.stationMetres??0),b=sampleAt(path,station),q=base(s.position),heading=s.heading+Math.atan2(-b.tangent.x,-b.tangent.z)-Math.atan2(-a.tangent.x,-a.tangent.z);
    return {...s,stationMetres:station,heading,position:{x:b.point.x+q.x-base(a.point).x,y:(b.point.y??0)+(s.position.y??0)-(a.point.y??0),z:b.point.z+q.z-base(a.point).z}};
  })];
  calibrateCityV6SignPosts(city,map,true);calibrateCityV62SafetySigns(city,map);
  const changedRoads=new Set<string>(JSON.parse(map.environment.metadata!.v7ChangedRoads!)),affectedSigns=map.signs.filter(s=>s.roadId.startsWith('regional:')&&changedRoads.has(s.roadId));
  for(const sign of affectedSigns.filter(s=>s.type==='EXPRESSWAY_ADVANCE')) {
    const road=newRoads.get(sign.roadId)!,length=polylineLength(roadPoints(road));
    if(length>=150||(sign.stationMetres??0)>=35)continue;
    const link=map.roadLinks!.find(l=>l.to.roadId===road.id&&l.to.end==='start'&&l.from.end==='end'&&newRoads.get(l.from.roadId)!.laneCount>=3&&!newRoads.get(l.from.roadId)!.gore)!;
    const previous=newRoads.get(link.from.roadId)!,path=roadPoints(previous),station=Math.max(2,polylineLength(path)-70),frame=sampleAt(path,station),old=sampleAt(roadPoints(road),sign.stationMetres??0),offset=Math.hypot(sign.position.x-old.point.x,sign.position.z-old.point.z),heading=Math.atan2(-frame.tangent.x,-frame.tangent.z),q=rotatePoint({x:offset,z:0},heading);
    sign.actualAdvanceMetres=(sign.actualAdvanceMetres??sign.advanceMetres??0)+(sign.stationMetres??0)+polylineLength(path)-station;
    sign.roadId=previous.id;sign.incomingRoadId=previous.id;sign.stationMetres=station;sign.position={x:frame.point.x+q.x,y:frame.point.y??0,z:frame.point.z+q.z};sign.heading=heading;
  }
  const regionalSigns:CityMapData={...map,signs:affectedSigns};
  calibrateCityV6SignPosts(regionalSigns,map,true);calibrateCityV62SafetySigns(regionalSigns,map);
  map.version=source.version+1;map.environment.metadata={...city.environment.metadata,cityRefinementMinor:'3',cityExpansionVersion:'7',v7Layout:'Expanded asymmetric ring; three complete core districts; university, new-town, port and industrial precincts span the ring. Compact southeast motorway interface.'};
  return loadCityMap(map);
}
