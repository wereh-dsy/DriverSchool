import type { CityMapData, CityPoint, CityRoad, RoadEndpoint } from '../CityMapData';
import { loadCityMap } from '../CityMapLoader';
import { createRoad, createIntersection, connectRoad, connectRoads, deleteObject, splitRoadAtPoint } from '../MapAPI';
import { connectionPoint, roadPoints, polylineLength, sampleAt, syncConnections, refreshPortPoses } from '../geometry';
import { expandPreset } from '../presets/InfrastructurePresets';
import { bezierPoints, ease } from '../presets/BackbonePresets';
import { connectUrbanSkeleton, trimCityJunctionApproaches } from './CityMainUrbanConnections';
import { setJunctionPavementFootprint } from '../JunctionSurface';
import { populateIntersectionMarkingMetadata } from '../MarkingOwnership';
import { generateTopologySigns } from '../SignPlacementGenerator';
import { addCityMainV6Environment } from './CityMainV6Environment';
import { repairCityMainGroundElevation } from './CityMainGroundElevation';
import { calibrateCityV6SignPosts } from './CityMainV6SignPosts';

const point=(x:number,y:number,z:number):CityPoint=>({x,y,z});
const distance=(a:CityPoint,b:CityPoint)=>Math.hypot(a.x-b.x,(a.y??0)-(b.y??0),a.z-b.z);
const ordinary=(r:CityRoad)=>r.travelDirection==='two-way'&&!r.structure?.enclosure;

/** Compact C2 offsets: one broad change over several hundred metres. The same
 * field carries adjoining streets/objects, so a merge cannot tear at a split. */
export function cityV6Alignment(p:CityPoint):CityPoint {
  const bump=(v:number,c:number,r:number)=>Math.abs((v-c)/r)>=1?0:(1-((v-c)/r)**2)**3;
  return {...p,
    x:p.x-55*bump(p.x,-1600,700)*bump(p.z,-1080,570)
      +42*bump(p.x,1660,420)*bump(p.z,1140,620)
      +18*bump(p.x,0,160)*bump(p.z,-750,800),
    z:p.z-52*bump(p.x,-740,740)*bump(p.z,-1400,370)
      +24*bump(p.x,-850,750)*bump(p.z,-150,230),
  };
}

function removeUnusedRoundaboutArms(map:CityMapData):string[] {
  const removed=['north-roundabout:entry','north-roundabout:exit','north-roundabout:entry-4','north-roundabout:exit-4'];
  // Two sides really serve the district. Keep the useful ring, close only the
  // north/east dead arms and replace their T pavements with ring continuations.
  const junctions=map.intersections.filter(j=>j.connections.some(c=>removed.includes(c.roadId)));
  for(const id of removed)deleteObject(map,id);
  for(const j of junctions) {
    const arms=j.connections.filter(c=>!removed.includes(c.roadId));
    if(arms.length!==2)throw new Error('V6 roundabout expected two surviving ring arms '+j.id);
    const a=arms.find(c=>c.end==='end')!,b=arms.find(c=>c.end==='start')!;
    const ar=map.roads.find(r=>r.id===a.roadId)!,br=map.roads.find(r=>r.id===b.roadId)!;
    const start=ar.centerline.at(-1)!,end=br.centerline[0]!;
    deleteObject(map,j.id);
    const r=createRoad(map,{id:'v6-ring-continuation-'+j.id,type:'highway',laneCount:2,laneWidth:3.5,
      centerline:bezierPoints(start,point(start.x+(j.position.x-start.x)*.7,0,start.z+(j.position.z-start.z)*.7),point(end.x+(j.position.x-end.x)*.7,0,end.z+(j.position.z-end.z)*.7),end),
      styleId:'urban_auxiliary_2',travelDirection:'forward',speedLimit:25,elevationMode:'ground',elevation:0,
      district:'north',groupId:'north-roundabout',structure:{barrierEnabled:false,piersEnabled:false},streetlights:false});
    connectRoads(map,{roadId:a.roadId,end:'end'},{roadId:r.id,end:'start'});
    connectRoads(map,{roadId:r.id,end:'end'},{roadId:b.roadId,end:'start'});
  }
  return removed;
}

function endpointPeers(map:CityMapData,p:CityPoint,match:(r:CityRoad)=>boolean):RoadEndpoint[] {
  let peers=map.roads.filter(match).flatMap(r=>(['start','end'] as const).filter(end=>distance(roadPoints(r)[end==='start'?0:roadPoints(r).length-1]!,p)<.05).map(end=>({roadId:r.id,end})));
  if(peers.length)return peers;
  for(const r of map.roads.filter(match)) {
    const path=roadPoints(r);
    for(let i=1;i<path.length;i++) {
      const a=path[i-1]!,b=path[i]!,dx=b.x-a.x,dz=b.z-a.z,t=((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz);
      if(t<0||t>1)continue;
      const q=point(a.x+t*dx,(a.y??0)+t*((b.y??0)-(a.y??0)),a.z+t*dz);
      if(distance(q,p)>.05)continue;
      const split=splitRoadAtPoint(map,r.id,q,{baseName:r.id+'-v6'});return [split.from,split.to];
    }
  }
  throw new Error('V6 attachment not on an existing mainline '+JSON.stringify(p));
}

function addAccess(map:CityMapData):void {
  map.roadNames!['v6-campus-frontage']={primaryText:'学院西路',kind:'urban'};
  const addStamp=(x:number,z:number,rotation:number,id:string,keep:(r:CityRoad)=>boolean)=>{
    // Validate the production recipe before pruning optional directions. No new
    // interchange algorithm or duplicate mainline is introduced.
    const stamp=expandPreset('urban_side_access',{position:point(x,0,z),rotation,length:700,mainElevation:id==='v6-civic-access'?8:0,groupId:id});
    const roads=stamp.roads.filter(keep),ids=new Set(roads.map(r=>r.id));
    roads.forEach(r=>{r.district=id==='v6-civic-access'?'central':'north';r.streetlights=false;});
    if(id==='v6-campus-access') {
      const on=roads.find(r=>r.id.endsWith(':on-1'))!,a=on.centerline[0]!,b=point(8.125,0,-1000);
      // Finish the merge before the northern hub's existing left-turn branch.
      on.centerline=bezierPoints(a,point(a.x,0,a.z-50),point(b.x,0,b.z+50),b);
    }
    map.roads.push(...roads);map.roadLinks!.push(...stamp.roadLinks.filter(l=>ids.has(l.from.roadId)&&ids.has(l.to.roadId)));
    map.connectionPorts!.push(...stamp.connectionPorts.filter(p=>ids.has(p.endpoint.roadId)));
    for(const r of roads.filter(r=>r.gore)) {
      const end=r.id.includes(':off-')?'start':'end',p=r.centerline[end==='start'?0:r.centerline.length-1]!;
      const peers=endpointPeers(map,p,a=>a.laneCount===3&&!a.gore&&a.roadNameId===(rotation?'east-west-expressway':'north-south-expressway'));
      for(const peer of peers.filter(e=>e.end===(end==='start'?'end':'start')))connectRoads(map,end==='start'?peer:{roadId:r.id,end},end==='start'?{roadId:r.id,end}:peer);
    }
    return roads;
  };
  // One northbound half interchange. West/southbound travel uses existing ring
  // access rather than duplicating four movements near the northern hub.
  addStamp(0,-850,0,'v6-campus-access',r=>r.id.includes(':off-1')||r.id.includes(':on-1')||r.id.includes(':frontage-1-'));
  for(const r of map.roads.filter(r=>r.groupId==='v6-campus-access')) {
    r.roadNameId=r.gore?'north-south-expressway':'v6-campus-frontage';
    if(!r.gore){r.type='urban_2lane';r.travelDirection='two-way';r.laneCount=2;r.speedLimit=40;}
  }
  // CBD westbound exit only; the existing diamonds provide the return movement.
  const civic=addStamp(-700,-150,Math.PI/2,'v6-civic-access',r=>r.id.endsWith(':off-1'));
  // Remain on the EW deck while crossing City Hall Avenue; descend on the
  // perpendicular collector beyond its footprint, not across the avenue lanes.
  for(const r of civic){r.centerline.forEach(p=>p.y=8);r.roadNameId='east-west-expressway';}
}

function completeFrontageAccess(map:CityMapData):void {
  // These two-lane local frontages had inbound-only loose ends. Treat them as
  // two-way collectors so their existing urban junctions serve both directions.
  for(const r of map.roads.filter(r=>r.laneCount===2&&(r.id.startsWith('direct-')&&r.id.includes(':frontage-')||r.groupId==='east-main-aux'&&r.id.includes(':frontage-')))) {
    r.type='urban_2lane';r.travelDirection='two-way';r.speedLimit=35;r.styleId='urban_local_2';
  }
  map.roadNames!['v6-port-avenue']={primaryText:'通港大道',kind:'urban'};
  map.roadNames!['v6-port-frontage']={primaryText:'通港辅路',kind:'urban'};
  for(const r of map.roads.filter(r=>r.groupId==='east-main-aux'))r.roadNameId=r.id.includes(':frontage-')?'v6-port-frontage':'v6-port-avenue';
  // Ordinary terminal junctions, not new interchanges: the divided boulevard's
  // previously inaccessible beginnings now connect to the two-way frontages.
  for(const east of [false,true]) {
    const id=east?'v6-port-east-terminal':'v6-port-west-terminal',x=east?2010:190;
    const upper=map.roads.find(r=>r.id===`east-main-aux:main-1-${east?1:7}`)!,lower=map.roads.find(r=>r.id===`east-main-aux:main--1-${east?7:1}`)!;
    const upperEnd=east?'start':'end',lowerEnd=east?'end':'start';
    const u=upper.centerline[upperEnd==='start'?0:upper.centerline.length-1]!,l=lower.centerline[lowerEnd==='start'?0:lower.centerline.length-1]!;
    const approaches=[{road:upper,end:upperEnd,path:roadPoints(upper)},{road:lower,end:lowerEnd,path:roadPoints(lower)}];
    const j=createIntersection(map,{id,type:'cross_4lane',position:point(x,0,900),rotation:0,signalized:true,
      portAngles:{north:0,south:Math.PI,east:Math.atan2(u.x-x,-(u.z-900)),west:Math.atan2(l.x-x,-(l.z-900))},
      connections:[{roadId:upper.id,end:upperEnd,port:'east'},{roadId:lower.id,end:lowerEnd,port:'west'}]});
    for(const approach of approaches) {
      const original=approach.path,index=approach.end==='start'?0:original.length-1,target=approach.road.centerline[index]!,old=original[index]!,span=Math.min(120,polylineLength(original)*.85),delta={x:target.x-old.x,z:target.z-old.z};
      let d=0;const ordered=approach.end==='start'?original:[...original].reverse();
      for(let i=0;i<ordered.length;i++){const p=ordered[i]!;if(i)d+=Math.hypot(p.x-ordered[i-1]!.x,p.z-ordered[i-1]!.z);const w=1-ease(d/span);p.x+=delta.x*w;p.z+=delta.z*w;}
      approach.road.centerline=original;
    }
    for(const north of [true,false]) {
      const target=map.roads.find(r=>r.id===`east-main-aux:frontage-${north?'1':'-1'}-${east?(north?1:7):(north?7:1)}`)!,end=east?(north?'start':'end'):(north?'end':'start');
      const a=target.centerline[end==='start'?0:target.centerline.length-1]!,b=connectionPoint(j,north?'north':'south',map);
      const r=createRoad(map,{id:id+(north?'-north':'-south'),type:'urban_2lane',laneCount:2,laneWidth:3.75,styleId:'urban_local_2',centerline:[{...a},{...b}],speedLimit:25,travelDirection:'two-way',elevationMode:'ground',elevation:0,district:'south',streetlights:false,structure:{barrierEnabled:false,piersEnabled:false}});
      r.roadNameId='v6-port-frontage';
      connectRoads(map,{roadId:r.id,end:'start'},{roadId:target.id,end});connectRoad(map,{roadId:r.id,end:'end'},{junctionId:j.id,port:north?'north':'south'});
    }
  }
}

function snap(map:CityMapData,p:CityPoint,name:string):CityPoint {
  let best=Infinity,result:CityPoint|undefined;
  for(const r of map.roads.filter(r=>r.roadNameId===name&&ordinary(r))) {
    const path=roadPoints(r),length=polylineLength(path);
    for(let d=35;d<length-35;d+=3) {
      const q=sampleAt(path,d).point;
      if(map.intersections.some(j=>Math.hypot(q.x-j.position.x,q.z-j.position.z)<48))continue;
      const gap=Math.hypot(p.x-q.x,p.z-q.z);if(gap<best){best=gap;result=q;}
    }
  }
  if(!result)throw new Error('V6 no safe ordinary landing on '+name);return {...result};
}

function addStreets(map:CityMapData):void {
  map.roadNames!['v6-campus-frontage']={primaryText:'学院西路',kind:'urban'};
  const added:CityRoad[]=[];
  const street=(id:string,text:string,nodes:CityPoint[],lanes:number,district:string)=>{
    map.roadNames![id]={primaryText:text,kind:'urban'};
    const pts:CityPoint[]=[];
    for(let i=1;i<nodes.length;i++) {
      const a=nodes[i-1]!,b=nodes[i]!,n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/4));
      for(let k=0;k<n;k++)pts.push(point(a.x+(b.x-a.x)*k/n,(a.y??0)+((b.y??0)-(a.y??0))*ease(k/n),a.z+(b.z-a.z)*k/n));
    }pts.push({...nodes.at(-1)!});
    const r=createRoad(map,{id,groupId:'v6-'+district,type:lanes===4?'urban_4lane':'urban_2lane',laneCount:lanes,laneWidth:district==='south'?3.9:lanes===4?3.6:district==='west'?3:3.5,
      styleId:lanes===4?'urban_street_4':'urban_local_2',travelDirection:'two-way',speedLimit:district==='west'?25:lanes===4?50:30,
      centerline:pts,elevationMode:'custom',district,streetlights:false,sidewalk:{enabled:true,width:district==='west'?1.4:2.5},structure:{barrierEnabled:false,piersEnabled:true,pierSpacing:55}});
    r.roadNameId=id;added.push(r);return r;
  };
  const route=(id:string,text:string,nodes:[number,number][],from:string,to:string,lanes:number,district:string)=>{
    const points=nodes.map(([x,z])=>point(x,0,z));points[0]=snap(map,points[0]!,from);points[points.length-1]=snap(map,points.at(-1)!,to);
    return street(id,text,points,lanes,district);
  };
  const off=map.roads.find(r=>r.id==='v6-civic-access:off-1')!;
  const civic=street('v6-civic-exit-road','市府快速路出口连接路',[{...off.centerline.at(-1)!},point(-625,8,-260),snap(map,point(-550,0,-460),'v5-civic-north')],2,'central');
  civic.travelDirection='forward';civic.type='highway';civic.laneCount=2;civic.speedLimit=40;civic.sidewalk={enabled:false,width:1};civic.structure!.barrierEnabled=true;
  connectRoads(map,{roadId:off.id,end:'end'},{roadId:civic.id,end:'start'});
  const frontage=map.roads.filter(r=>r.groupId==='v6-campus-access'&&!r.gore);
  const first=frontage[0]!,last=frontage.at(-1)!;
  const north=street('v6-campus-west','博学西路',[{...last.centerline.at(-1)!},point(180,0,-1200),snap(map,point(380,0,-980),'v5-north-campus')],4,'north');
  const south=street('v6-civic-north-link','市府北连接路',[{...first.centerline[0]!},point(165,0,-500),snap(map,point(280,0,-450),'v5-civic-north')],4,'central');
  connectRoads(map,{roadId:north.id,end:'start'},{roadId:last.id,end:'end'});
  connectRoads(map,{roadId:south.id,end:'start'},{roadId:first.id,end:'start'});
  route('v6-west-warehouse-lane','仓桥巷',[[-1450,-350],[-1320,-365],[-1110,-340]],'v5-west-lane','v5-west-east-road',2,'west');
  route('v6-west-market-street','集市街',[[-1450,420],[-1300,405],[-1110,430]],'v5-west-lane','v5-west-east-road',2,'west');
  route('v6-west-inner-lane','西城二巷',[[-1330,-610],[-1295,-420],[-1300,-350]],'v5-west-workshop','v6-west-warehouse-lane',2,'west');
  route('v6-civic-qinghe','清和街',[[-710,280],[-550,290],[-240,300]],'v5-civic-west','v5-civic-block-road',2,'central');
  route('v6-science-one','科创一路',[[1040,-620],[1200,-600]],'v5-east-science','east-avenue',4,'east');
  route('v6-logistics-one','物流一路',[[500,1320],[820,1320],[1250,1320]],'v5-south-east','v5-south-logistics',4,'south');
  const yard=route('v6-logistics-yard','仓储东支路',[[1050,1320],[1050,1550],[1050,1800]],'v6-logistics-one','industrial-avenue',2,'south');
  // One justified bridge across both the southern ring and its frontage road.
  const yardStart=yard.centerline[0]!,yardEnd=yard.centerline.at(-1)!;
  yard.centerline.forEach(p=>{p.y=p.z<=1480?6.4*ease((p.z-yardStart.z)/(1480-yardStart.z)):p.z>=1620?6.4*(1-ease((p.z-1620)/(yardEnd.z-1620))):6.4;});
  route('v6-residential-east','新城二街',[[1040,580],[1200,600]],'v5-east-science','east-avenue',2,'east');
  // Ordinary intersections only. Ramps and mainlines are never fed to this pass.
  connectUrbanSkeleton(map,map.roads.filter(r=>ordinary(r)||r.id==='v6-civic-exit-road'),.2);
  // A crossing pass may already have placed a junction beside an endpoint. Give
  // that authored landing the approach rather than leaving a short loose end.
  for(const r of map.roads.filter(r=>r.id.startsWith('v6-')&&!r.gore))for(const end of ['start','end'] as const) {
    if(map.roadLinks!.some(l=>[l.from,l.to].some(e=>e.roadId===r.id&&e.end===end))||map.intersections.some(j=>j.connections.some(c=>c.roadId===r.id&&c.end===end)))continue;
    const p=r.centerline[end==='start'?0:r.centerline.length-1]!,q=r.centerline[end==='start'?1:r.centerline.length-2]!;
    const j=map.intersections.filter(j=>j.connections.length<5&&Math.abs((j.position.y??0)-(p.y??0))<.2&&Math.hypot(j.position.x-p.x,j.position.z-p.z)<48).sort((a,b)=>Math.hypot(a.position.x-p.x,a.position.z-p.z)-Math.hypot(b.position.x-p.x,b.position.z-p.z))[0];
    if(!j)throw new Error('V6 new street has no landing '+r.id+':'+end);
    const port=(['north','east','south','west','extra'] as const).find(port=>!j.connections.some(c=>c.port===port))!;
    j.type=j.connections.length===4?'irregular':'cross_6lane';j.portAngles??={};j.portAngles[port]=Math.atan2(q.x-j.position.x,-(q.z-j.position.z))+j.rotation;
    (j.pavementHeights??={})[port]=j.position.y??0;connectRoad(map,{roadId:r.id,end},{junctionId:j.id,port});
  }
  syncConnections(map);trimCityJunctionApproaches(map,false);
  for(const j of map.intersections)setJunctionPavementFootprint(j,map);
  repairCityMainGroundElevation(map);
}

function alignCity(map:CityMapData):void {
  // Remove the inherited SW -3m dip: it crossed no terrain or infrastructure.
  const changed=new Map<string,{start:number;end:number}>();
  for(const r of map.roads.filter(r=>r.laneCount===3&&r.roadNameId==='ring-expressway')) {
    const old=[r.centerline[0]!.y??0,r.centerline.at(-1)!.y??0];
    for(const p of r.centerline)if(p.x< -300&&p.z>1450&&(p.y??0)<0)p.y=0;
    changed.set(r.id,{start:(r.centerline[0]!.y??0)-old[0]!,end:(r.centerline.at(-1)!.y??0)-old[1]!});
  }
  for(const l of map.roadLinks!)for(const [a,b] of [[l.from,l.to],[l.to,l.from]]) {
    const delta=changed.get(a!.roadId)?.[a!.end]??0;if(!delta||changed.has(b!.roadId))continue;
    const r=map.roads.find(r=>r.id===b!.roadId)!,path=b!.end==='start'?r.centerline:[...r.centerline].reverse();let d=0;
    path.forEach((p,i)=>{if(i)d+=Math.hypot(p.x-path[i-1]!.x,p.z-path[i-1]!.z);p.y=(p.y??0)+delta*(1-ease(d/110));});
  }
  for(const r of map.roads){r.centerline=roadPoints(r).map(cityV6Alignment);r.curve='polyline';}
  for(const j of map.intersections) {
    const old={...j.position};j.position=cityV6Alignment(old);j.portAngles??={};
    for(const c of j.connections) {
      const r=map.roads.find(r=>r.id===c.roadId)!,p=r.centerline[c.end==='start'?0:r.centerline.length-1]!;
      j.portAngles[c.port]=Math.atan2(p.x-j.position.x,-(p.z-j.position.z))+j.rotation;
    }
  }
  for(const o of map.objects)o.position=cityV6Alignment(o.position);
  for(const spawn of map.environment.spawnPoints)spawn.position=cityV6Alignment(spawn.position);
  const dividedApproaches=new Map(map.roads.filter(r=>r.laneCount===3&&map.intersections.some(j=>j.connections.some(c=>c.roadId===r.id))).map(r=>[r.id,structuredClone(r.centerline)]));
  syncConnections(map);trimCityJunctionApproaches(map,false);refreshPortPoses(map);
  for(const r of map.roads) {
    const old=dividedApproaches.get(r.id);if(!old)continue;
    const path=r.centerline,stations=[0];for(let i=1;i<path.length;i++)stations.push(stations.at(-1)!+Math.hypot(path[i]!.x-path[i-1]!.x,path[i]!.z-path[i-1]!.z));
    const length=stations.at(-1)!,span=Math.min(120,length*.45),a={x:path[0]!.x-old[0]!.x,z:path[0]!.z-old[0]!.z},b={x:path.at(-1)!.x-old.at(-1)!.x,z:path.at(-1)!.z-old.at(-1)!.z};
    for(let i=1;i<path.length-1;i++){const wa=1-ease(stations[i]!/span),wb=1-ease((length-stations[i]!)/span);path[i]!.x+=a.x*wa+b.x*wb;path[i]!.z+=a.z*wa+b.z*wb;}
  }
  // Small horizontal shifts must not steepen the inherited 11.99% compact ramp
  // calibrations. Keep every shared endpoint fixed and settle only interior Y.
  let settled=0;
  for(const r of map.roads) {
    const points=r.centerline,old=points.map(p=>p.y??0);
    for(let pass=0;pass<4;pass++)for(const reverse of [false,true]) {
      const path=reverse?[...points].reverse():points;
      for(let i=1;i<path.length-1;i++) {
        const a=path[i-1]!,b=path[i]!,limit=Math.hypot(b.x-a.x,b.z-a.z)*.1199;
        b.y=Math.max((a.y??0)-limit,Math.min((a.y??0)+limit,b.y??0));
      }
    }
    if(points.some((p,i)=>Math.abs((p.y??0)-old[i]!)>1e-8)){r.elevationMode='custom';settled++;}
  }
  map.environment.metadata={...map.environment.metadata,v6SettledGradeRoads:String(settled)};
  for(const j of map.intersections)setJunctionPavementFootprint(j,map);
  populateIntersectionMarkingMetadata(map);
}

/** Refine only the city payload of the *current* menu map. Regional records and
 * cross-boundary links are copied untouched, with stable external endpoints. */
export function buildCityMainV6(source:CityMapData):CityMapData {
  if(source.environment.metadata?.cityRefinementVersion==='6')throw new Error('City V6 is already applied');
  const original=structuredClone(source),cityIds=new Set(source.roads.filter(r=>!r.id.startsWith('regional:')).map(r=>r.id));
  const map:CityMapData={...structuredClone(source),regional:undefined,
    roads:structuredClone(source.roads.filter(r=>cityIds.has(r.id))),intersections:structuredClone(source.intersections.filter(j=>!j.id.startsWith('regional:'))),
    objects:structuredClone(source.objects.filter(o=>!o.id.startsWith('regional:'))),
    roadLinks:structuredClone(source.roadLinks!.filter(l=>cityIds.has(l.from.roadId)&&cityIds.has(l.to.roadId))),
    connectionPorts:structuredClone(source.connectionPorts!.filter(p=>cityIds.has(p.endpoint.roadId))),signs:[],
  };
  const removed=removeUnusedRoundaboutArms(map);addAccess(map);completeFrontageAccess(map);addStreets(map);alignCity(map);
  // Names keep stable keys used by displays/signs; the suffix expresses hierarchy.
  Object.assign(map.roadNames!,{
    'central-avenue':{primaryText:'锦城大道',kind:'urban'},'new-city-avenue':{primaryText:'明远大道',kind:'urban'},
    'central-street':{primaryText:'中央大街',kind:'urban'},'v5-civic-middle':{primaryText:'清和路',kind:'urban'},
    'v5-west-market-road':{primaryText:'西城市场街',kind:'urban'},'west-cross-street':{primaryText:'老城街',kind:'urban'},
    'v5-west-lane':{primaryText:'西城里街',kind:'urban'},'v5-west-south-lane':{primaryText:'老城南街',kind:'urban'},
    'v5-north-park':{primaryText:'星湖路',kind:'urban'},'v5-east-garden':{primaryText:'春晖路',kind:'urban'},
    'v5-south-logistics':{primaryText:'物流东路',kind:'urban'},'v5-south-east':{primaryText:'物流西路',kind:'urban'},
  });
  map.signs=generateTopologySigns(map);
  calibrateCityV6SignPosts(map,{...original,roads:[...map.roads,...original.roads.filter(r=>!cityIds.has(r.id))],intersections:[...map.intersections,...original.intersections.filter(j=>j.id.startsWith('regional:'))]});
  addCityMainV6Environment(map,cityV6Alignment);
  map.environment.metadata={...map.environment.metadata,cityRefinementVersion:'6',cityRefinementSource:'current menu City Main; regional records preserved',
    v6RemovedStructures:JSON.stringify(removed),v6RemovedVerticalProfile:'unexplained southwest ring -3m depression',
    v6Access:'NS northbound paired on/off at campus; EW westbound exit only at civic quarter',
    v6Alignment:'northwest lake/greenbelt bypass; northern park arc; southeast logistics edge; broad EW/NS shifts',landscapeObjects:String(map.objects.length)};
  // The city API allocates within the edited fragment. Reserve the enclosing
  // map's external link IDs when rejoining that fragment.
  const externalLinks=original.roadLinks!.filter(l=>!cityIds.has(l.from.roadId)||!cityIds.has(l.to.roadId));
  const reservedLinks=new Set(externalLinks.map(l=>l.id));
  for(const l of map.roadLinks!)if(reservedLinks.has(l.id))l.id='v6-city-'+l.id;
  const result:CityMapData={...original,version:original.version+1,roads:[...map.roads,...original.roads.filter(r=>!cityIds.has(r.id))],
    intersections:[...map.intersections,...original.intersections.filter(j=>j.id.startsWith('regional:'))],
    objects:[...map.objects,...original.objects.filter(o=>o.id.startsWith('regional:'))],
    roadLinks:[...map.roadLinks!,...externalLinks],
    connectionPorts:[...map.connectionPorts!,...original.connectionPorts!.filter(p=>!cityIds.has(p.endpoint.roadId))],
    signs:[...map.signs!,...original.signs!.filter(s=>!cityIds.has(s.roadId))],roadNames:map.roadNames,environment:map.environment};
  return loadCityMap(result);
}
