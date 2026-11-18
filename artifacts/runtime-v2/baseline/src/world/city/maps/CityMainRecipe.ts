import { newCityMap, type CityPoint, type CityRoad, type RoadEndpoint } from '../CityMapData';
import { createRoad, connectRoads, placePreset, placePrefab, roadEndpoint, splitRoadAtPoint, deleteObject, validateMap } from '../MapAPI';
import { point3 } from '../coordinates';
import { polylineLength, roadPoints } from '../geometry';
import { bezierPoints, ease, profileHeight } from '../presets/BackbonePresets';
import type { PresetStamp } from '../presets/InfrastructurePresets';
import { addCityMainLandscape } from './CityMainLandscape';

/** Authored map content only. All roads, joins and structures use the normal City API. */
export function buildCityMain() {
  const map=newCityMap();map.id='city-main';map.name='City Main';map.version=3;map.sectorSize=500;
  map.bounds={minX:-2450,maxX:2450,minZ:-2100,maxZ:2250};
  const Z=-150,W=-1750,E=1750,N=-1400,S=1550,B=8.125;
  const EW=[{offset:-2400,height:0},{offset:-1950,height:8},{offset:1000,height:8},{offset:1700,height:0},{offset:2400,height:0}];
  const NS=[{offset:-2050,height:0},{offset:50,height:0},{offset:450,height:-8},{offset:1550,height:-8},{offset:2200,height:0}];
  const ewY=(x:number)=>profileHeight(EW,x,0),nsY=(z:number)=>profileHeight(NS,z,0);
  const ringY=(x:number,z:number)=>{
    const north=ease((-z-600)/500),east=ease((x-1150)/450)*ease((1550-z)/650);
    const depression=x>-1250&&x<-350?-3*Math.sin(Math.PI*(x+1250)/900)**2*ease((z-1100)/300):0;
    return 8*(1-(1-north)*(1-east))+depression;
  };
  const end=(r:CityRoad,e:'start'|'end'):RoadEndpoint=>({roadId:r.id,end:e});
  const link=(a:RoadEndpoint,b:RoadEndpoint)=>{
    const matches=(x:RoadEndpoint,y:RoadEndpoint)=>x.roadId===y.roadId&&x.end===y.end;
    if(!map.roadLinks?.some(l=>matches(l.from,a)&&matches(l.to,b)||matches(l.from,b)&&matches(l.to,a)))connectRoads(map,a,b);
  };
  const road=(id:string,points:CityPoint[],lanes=3,speed=90,district='expressway',twoWay=false):CityRoad=>createRoad(map,{id,centerline:points,laneCount:lanes,
    type:lanes===1?'ramp_1':twoWay?(lanes===6?'urban_6lane':lanes===4?'urban_4lane':'urban_2lane'):'highway',
    styleId:district==='expressway'?'highway_6':lanes===6?'urban_boulevard_6':lanes===4?'urban_street_4':'urban_local_2',
    laneWidth:lanes===1?3.9:3.75,speedLimit:speed,travelDirection:twoWay?'two-way':'forward',elevationMode:'custom',streetlights:false,district,
    structure:{barrierEnabled:district==='expressway',piersEnabled:true,pierSpacing:60,barrierOffset:0.25},shoulders:district==='expressway'?{left:0.75,right:1.75}:undefined});
  const line=(a:CityPoint,b:CityPoint,height:(x:number,z:number)=>number):CityPoint[]=>{
    const count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/5));
    return Array.from({length:count+1},(_,i)=>{const x=a.x+(b.x-a.x)*i/count,z=a.z+(b.z-a.z)*i/count;return point3(x,height(x,z),z);});
  };

  // 1. Three uninterrupted divided corridors. Ring corners have differing radii.
  const ring:CityPoint[]=[];
  const append=(points:CityPoint[])=>ring.push(...(ring.length?points.slice(1):points));
  const ringLine=(x:number,z:number,xx:number,zz:number)=>append(line(point3(x,0,z),point3(xx,0,zz),()=>0));
  const corner=(x:number,z:number,r:number,a:number)=>{const count=Math.ceil(Math.PI*r/10);append(Array.from({length:count+1},(_,i)=>point3(x+r*Math.cos(a+Math.PI/2*i/count),0,z+r*Math.sin(a+Math.PI/2*i/count))));};
  ringLine(W,Z,W,N+480);corner(W+480,N+480,480,Math.PI);ringLine(W+480,N,E-430,N);corner(E-430,N+430,430,-Math.PI/2);
  ringLine(E,N+430,E,S-510);corner(E-510,S-510,510,0);ringLine(E-510,S,W+460,S);corner(W+460,S-460,460,Math.PI/2);ringLine(W,S-460,W,Z);
  const ringLength=polylineLength(ring);
  for(const sign of [1,-1]) {
    const unique=ring.slice(0,-1),points=unique.map((p,i)=>{const a=unique[(i+unique.length-1)%unique.length]!,b=unique[(i+1)%unique.length]!,l=Math.hypot(b.x-a.x,b.z-a.z);
      const x=p.x-(b.z-a.z)/l*B*sign,z=p.z+(b.x-a.x)/l*B*sign;return point3(x,ringY(x,z),z);});
    points.push({...points[0]!});if(sign<0)points.reverse();
    const cuts=[0,Math.floor(points.length/4),Math.floor(points.length/2),Math.floor(3*points.length/4),points.length-1];
    const roads=cuts.slice(1).map((at,i)=>road(`ring-${sign>0?'cw':'ccw'}-${i}`,points.slice(cuts[i]!,at+1),3,100));
    roads.forEach((r,i)=>link(end(r,'end'),end(roads[(i+1)%roads.length]!,'start')));
    const ew=line(point3(-2400,0,Z+B*sign),point3(2400,0,Z+B*sign),(x)=>ewY(x));if(sign<0)ew.reverse();road(`ew-${sign>0?'eb':'wb'}`,ew);
    const ns=line(point3(B*sign,0,2250),point3(B*sign,0,-2100),(_x,z)=>nsY(z));if(sign<0)ns.reverse();road(`ns-${sign>0?'nb':'sb'}`,ns);
  }
  const mainline=(r:CityRoad)=>/^(ring-(cw|ccw)-|ew-(eb|wb)|ns-(nb|sb))/.test(r.id)||r.district==='expressway'&&r.laneCount===3&&r.speedLimit>=80;
  const near=(a:CityPoint,b:CityPoint)=>Math.hypot(a.x-b.x,a.z-b.z)<0.03&&Math.abs((a.y??0)-(b.y??0))<0.2;
  function cut(p:CityPoint,family:(r:CityRoad)=>boolean) {
    for(const r of [...map.roads.filter(family)]) {
      const pts=roadPoints(r);if(near(pts[0]!,p)||near(pts.at(-1)!,p))continue;
      const on=pts.some((b,i)=>{if(!i)return false;const a=pts[i-1]!,dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz,t=((p.x-a.x)*dx+(p.z-a.z)*dz)/l2;return t>=0&&t<=1&&near(point3(a.x+t*dx,(a.y??0)+t*((b.y??0)-(a.y??0)),a.z+t*dz),p);});
      if(on)splitRoadAtPoint(map,r.id,p,{tolerance:0.2});
    }
    const incoming:RoadEndpoint[]=[],outgoing:RoadEndpoint[]=[];
    for(const r of map.roads.filter(family))for(const e of ['start','end'] as const)if(near(roadEndpoint(map,end(r,e)),p)) {
      if(r.travelDirection==='two-way'||e==='end')incoming.push(end(r,e));if(r.travelDirection==='two-way'||e==='start')outgoing.push(end(r,e));
    }
    return {incoming,outgoing};
  }
  function replace(r:CityRoad):void {
    const a=r.centerline[0]!,b=r.centerline.at(-1)!;cut(a,mainline);cut(b,mainline);
    // A stamped mainline can cover several existing branch splits; keep their references
    // by replacing only the matching small feeder/tunnel interval.
    for(const old of [...map.roads.filter(mainline)])if(near(old.centerline[0]!,a)&&near(old.centerline.at(-1)!,b)) {
      const connections=map.roadLinks!.filter(l=>l.from.roadId===old.id||l.to.roadId===old.id).map(l=>({from:{...l.from},to:{...l.to}}));
      deleteObject(map,old.id);
      for(const l of connections) {
        if(l.from.roadId===old.id)l.from.roadId=r.id;if(l.to.roadId===old.id)l.to.roadId=r.id;link(l.from,l.to);
      }
    }
  }
  function attach(stamp:PresetStamp):void {
    for(const r of stamp.roads.filter(r=>r.laneCount===3&&r.speedLimit>=80))replace(r);
    for(const port of stamp.connectionPorts) {
      const joins=cut(roadEndpoint(map,port.endpoint),mainline),peers=port.endpoint.end==='start'?joins.incoming:joins.outgoing;
      if(!peers.length)throw new Error(`city-main: unattached ${port.id} at ${JSON.stringify(roadEndpoint(map,port.endpoint))}`);
      for(const peer of peers)link(port.endpoint.end==='start'?peer:port.endpoint,port.endpoint.end==='start'?port.endpoint:peer);
    }
    stamp.roads.forEach(r=>r.district='expressway');
  }
  const profile=(center:number,height:(offset:number)=>number)=>Array.from({length:361},(_,i)=>{const offset=-900+i*5;return {offset,height:height(center+offset)};});
  // 2. Full-movement systems; road crossing projections never create graph edges.
  const systems=[
    {id:'central',preset:'system_cloverleaf',x:0,z:Z,r:35,main:0,cross:8},
    {id:'west',preset:'system_cloverleaf',x:W,z:Z,r:32,main:0,cross:8},
    {id:'east',preset:'system_cloverleaf_cd',x:E,z:Z,r:40,main:8,cross:0},
    {id:'north',preset:'system_cloverstack_lite',x:0,z:N,r:35,main:0,cross:8},
    {id:'south',preset:'system_parclo_cd',x:0,z:S,r:35,main:-8,cross:0},
  ];
  for(const s of systems)attach(placePreset(map,s.preset,{position:point3(s.x,0,s.z),groupId:`system-${s.id}`,mainRoadLanes:6,crossRoadLanes:6,
    designProfile:'urban',mainElevation:s.main,crossElevation:s.cross,rampRadius:s.r,profileInterpolation:'linear',mainProfile:profile(s.z,z=>s.x===0?nsY(z):ringY(s.x,z)),crossProfile:profile(s.x,x=>s.id==='north'||s.id==='south'?ringY(x,s.z):ewY(x))}));

  // 3. Access diamonds use the existing production recipe, with mainline intervals
  // retained from the corridor rather than duplicate deck meshes.
  const diamonds:PresetStamp[]=[];
  for(const site of [{x:-875,z:Z,y:0,rotation:Math.PI/2,id:'west'}, {x:875,z:Z,y:0,rotation:Math.PI/2,id:'east'}]) {
    const x=site.x,stamp=placePreset(map,'diamond_interchange',{position:point3(x,site.y,site.z),rotation:site.rotation,groupId:`diamond-${site.id}`,mainElevation:8,mainRoadLanes:6,crossRoadLanes:6,rampRadius:45,rampLaneCount:1,length:750});
    // Stamped mainline ports become joins on the original continuous sampled road.
    const deleted=new Set(stamp.roads.filter(r=>r.laneCount===3).map(r=>r.id));
    const joins=stamp.roadLinks.filter(l=>deleted.has(l.from.roadId)!==deleted.has(l.to.roadId)).map(l=>({
      endpoint:deleted.has(l.from.roadId)?l.to:l.from,point:roadEndpoint(map,deleted.has(l.from.roadId)?l.from:l.to)}));
    deleted.forEach(id=>deleteObject(map,id));
    for(const j of joins) {
      const ramp=map.roads.find(r=>r.id===j.endpoint.roadId)!;j.point.y=site.id==='ring-west'?ringY(j.point.x,j.point.z):ewY(j.point.x);
      ramp.centerline.forEach(v=>v.y=site.y+((v.y??0)-site.y)/8*((j.point.y??0)-site.y));
      ramp.centerline[j.endpoint.end==='start'?0:ramp.centerline.length-1]=j.point;
      const peers=cut(j.point,mainline),selected=j.endpoint.end==='start'?peers.incoming:peers.outgoing;
      if(!selected.length)throw new Error('diamond ramp detached');for(const peer of selected)link(j.endpoint.end==='start'?peer:j.endpoint,j.endpoint.end==='start'?j.endpoint:peer);
    }
    stamp.roads=stamp.roads.filter(r=>!deleted.has(r.id));stamp.connectionPorts=stamp.connectionPorts.filter(p=>!deleted.has(p.endpoint.roadId));
    stamp.roads.forEach(r=>r.district=r.gore?'expressway':x<0?'west':'east');diamonds.push(stamp);
  }
  // 4. Real divided tunnel; roofs and retaining walls are rendered/collided by City.
  attach(placePreset(map,'divided_tunnel',{position:point3(0,-8,700),length:500,groupId:'ns-tunnel'}));
  for(const r of map.roads)if(r.centerline.some(p=>(p.y??0)<-0.1)&&!r.structure?.enclosure)r.structure={...r.structure,enclosure:{kind:'cutting',clearance:8},barrierEnabled:false};

  // 5–6. Sparse arterial/collector skeleton; connected intersections are authored below.
  const streets:CityRoad[]=diamonds.flatMap(d=>d.roads.filter(r=>!r.gore));
  for(const site of [{id:'west',x:W,z:725,rotation:0},{id:'north',x:900,z:N,rotation:Math.PI/2},{id:'south',x:900,z:S,rotation:Math.PI/2}]) {
    const stamp=placePreset(map,'urban_side_access',{position:point3(site.x,0,site.z),rotation:site.rotation,length:900,groupId:'direct-'+site.id,mainProfile:site.rotation?profile(site.x,x=>ringY(x,site.z)):profile(site.z,z=>ringY(site.x,z)),profileInterpolation:'linear'});
    for(const port of stamp.connectionPorts.filter(p=>p.label.startsWith('Expressway'))) {
      const peers=cut(roadEndpoint(map,port.endpoint),mainline),selected=port.endpoint.end==='start'?peers.incoming:peers.outgoing;
      if(!selected.length)throw new Error('direct access mainline port detached: '+port.id);
      selected.forEach(peer=>link(port.endpoint.end==='start'?peer:port.endpoint,port.endpoint.end==='start'?port.endpoint:peer));
    }
    stamp.roads.forEach(r=>{r.district=site.id;if(!r.gore)streets.push(r);});
  }
  function street(id:string,coords:[number,number][],lanes=6,district='central',height:(x:number,z:number)=>number=()=>0,oneWay=false) {
    const points=coords.flatMap((q,i)=>i?line(point3(coords[i-1]![0],0,coords[i-1]![1]),point3(q[0],0,q[1]),height).slice(1):[point3(q[0],height(q[0],q[1]),q[1])]);
    const r=road(id,points,lanes,lanes===6?60:lanes===4?50:30,district,!oneWay);streets.push(r);return r;
  }
  street('urban-north-arterial',[[-1450,-750],[1450,-750]],6,'north',x=>8*ease((650-Math.abs(x))/400));
  street('urban-west-arterial',[[-1500,450],[-900,450],[-650,700],[-250,1100]],6,'west');
  street('urban-south-arterial',[[-1450,1150],[-1000,1150],[-500,1000],[500,1000],[1300,1150]],6,'south',x=>8*ease((1150-Math.abs(x))/650));
  street('urban-cbd-arterial',[[-1400,260],[-600,260],[-380,360],[450,360],[1018,300]]);
  street('urban-east-arterial',[[1200,-850],[1200,868]],6,'east',(_x,z)=>16*ease((z+750)/600)*ease((550-z)/400));
  street('urban-west-ns',[[-1300,-1200],[-1300,-750],[-1200,-650],[-1200,950],[-1300,1050]],6,'west',(_x,z)=>16*ease((z+750)/600)*ease((950-z)/550));street('urban-west-secondary',[[-600,-700],[-600,900]],4,'west');
  street('urban-east-ns',[[650,-900],[650,868]],6,'east');street('urban-institutional',[[950,-1100],[950,-750]],4,'north');
  const diagonal=street('urban-diagonal',[[-1450,1300],[-1100,1050],[-750,850],[-350,750],[250,450],[650,400],[1200,400],[1250,-650],[1100,-950],[1100,-1050]],6,'central',(x,z)=>16*ease((x-600)/600)*ease((z+1050)/600));
  const diagonalLength=polylineLength(diagonal.centerline);
  street('urban-regional-diagonal',[[-1450,-1050],[-1300,-900],[-1100,-850],[-900,-650],[-650,-500]],4,'west');
  street('urban-old-collector',[[-1450,700],[-1000,700],[-1000,920]],2,'west');
  street('urban-old-offset',[[-1200,700],[-1200,520],[-1120,520],[-1120,260]],2,'west');
  street('urban-oneway-east',[[-1350,580],[-700,580]],2,'west',()=>0,true);street('urban-oneway-west',[[-700,650],[-1350,650]],2,'west',()=>0,true);
  street('urban-south-industrial',[[500,1200],[700,1370],[1150,1370]],4,'south');
  street('urban-fiveleg-collector',[[-900,1050],[-600,812.5]],2,'west');
  street('urban-direct-west-collector',[[-1711.875,800],[-1500,800],[-1450,700]],2,'west');
  street('urban-direct-north-in',[[700,-1438.125],[700,-1100],[950,-1100]],4,'north');
  street('urban-direct-north-out',[[1100,-1438.125],[1100,-1250],[650,-1000],[650,-900]],4,'north');
  street('urban-direct-south-in',[[1100,1511.875],[1100,1370]],4,'south');
  street('urban-direct-south-out',[[800,1511.875],[800,1370]],2,'south');
  street('urban-freed-west-block',[[-1500,250],[-1400,350],[-1000,350]],2,'west');
  for(const stamp of diamonds)for(const port of stamp.connectionPorts) {
    const q=roadEndpoint(map,port.endpoint),sign=q.z<Z?-1:1;
    if(stamp.groupId==='diamond-ring-west') {
      const s=q.x<W?-1:1,farX=q.x+s*300;
      const r=street(`urban-ring-access-${s}`,[[q.x,q.z],[farX,q.z]],6,'west',xx=>-8+8*ease((xx-q.x)/(farX-q.x)));link(port.endpoint,end(r,'start'));
      if(s>0)street('urban-ring-access-collector',[[farX,q.z],[-1000,700]],2,'west');
    } else {
      const r=street(`urban-${stamp.groupId}-${sign}`,[[q.x,q.z],[q.x,sign<0?-1050:q.x<0?1000:800]],6,q.x<0?'west':'east');link(port.endpoint,end(r,'start'));
    }
  }
  const boulevard=placePreset(map,'urban_main_aux',{position:point3(1100,0,900),rotation:Math.PI/2,length:1800,groupId:'east-main-aux'});
  boulevard.roads.forEach(r=>{r.district='east';streets.push(r);});
  street('urban-east-frontage-access',[[700,1370],[700,932]],4,'east');
  street('urban-industrial-east-link',[[1150,1370],[1350,1370],[1350,1150],[1300,1150]],4,'east');
  const roundabout=placePreset(map,'roundabout',{position:point3(1400,0,-1050),rampRadius:75,rampLaneCount:2,groupId:'north-roundabout'});
  roundabout.roads.forEach(r=>r.district='north');
  for(const side of ['West','South']) {
    const common=side==='West'?point3(1100,0,-1050):point3(1400,0,-800);
    const approach=street('urban-roundabout-'+side,side==='West'?[[950,-1100],[common.x,common.z]]:[[1400,-750],[common.x,common.z]],4,'north');
    for(const input of [true,false]) {
      const port=roundabout.connectionPorts.find(p=>p.label===side+' '+(input?'In':'Out'))!,q=roadEndpoint(map,port.endpoint);
      const a=input?common:q,b=input?q:common,dx=b.x-a.x,dz=b.z-a.z;
      const r=road('urban-roundabout-'+side+'-'+(input?'entry':'exit'),bezierPoints(a,point3(a.x+dx/3,0,a.z+dz/3),point3(a.x+dx*2/3,0,a.z+dz*2/3),b),2,25,'north');
      link(input?end(approach,'end'):port.endpoint,input?end(r,'start'):end(r,'start'));
      link(end(r,'end'),input?port.endpoint:end(approach,'end'));
    }
  }
  const underpass=placePreset(map,'urban_underpass',{position:point3(-1250,-7.5,-960),rotation:Math.PI/2,length:110,groupId:'urban-rail-underpass'});
  const u=underpass.roads[0]!;streets.push(u);u.district='west';
  for(const e of ['start','end'] as const) {
    const q=roadEndpoint(map,end(u,e)),sign=q.x>-1250?1:-1,far=point3(sign>0?-875:q.x-300,0,q.z);
    const r=road(`urban-underpass-${e}-approach`,line(far,q,x=>-7.5*ease((x-far.x)/(q.x-far.x))),6,40,'west',true);
    r.structure={barrierEnabled:false,piersEnabled:false,enclosure:{kind:'cutting',clearance:6}};streets.push(r);link(end(r,'end'),end(u,e));
    if(sign<0)street('urban-underpass-west-link',[[far.x,far.z],[far.x,-1200],[-1300,-1200]],4,'west');
  }
  // The only new motorway leaves the city at its eastern boundary. A short depressed
  // urban throat passes below the ground frontage roads before opening into embankments.
  const motorwayY=(x:number)=>-8+8*ease((x-2000)/650),motorway:CityPoint[]=[];
  motorway.push(...line(point3(1625,0,650),point3(2700,0,650),motorwayY));
  for(let i=1;i<=147;i++){const a=-Math.PI/2+Math.PI/6*i/147,x=2700+1400*Math.cos(a),z=2050+1400*Math.sin(a);motorway.push(point3(x,motorwayY(x),z));}
  const last=motorway.at(-1)!;motorway.push(...line(last,point3(3600,0,last.z+(3600-last.x)*Math.tan(Math.PI/6)),motorwayY).slice(1));
  map.bounds.maxX=3550;
  for(const sign of [1,-1]) {
    const points=motorway.map((p,i)=>{const a=motorway[Math.max(0,i-1)]!,b=motorway[Math.min(motorway.length-1,i+1)]!,l=Math.hypot(b.x-a.x,b.z-a.z);const x=p.x-(b.z-a.z)/l*14*sign,z=p.z+(b.x-a.x)/l*14*sign;return point3(x,motorwayY(x),z);});
    const at=points.findIndex(p=>p.x>=3550),a=points[at-1]!,b=points[at]!,t=(3550-a.x)/(b.x-a.x);points.splice(at,points.length-at,point3(3550,0,a.z+t*(b.z-a.z)));
    if(sign<0)points.reverse();const r=road('intercity-'+(sign>0?'eb':'wb'),points,3,110,'motorway');r.designProfile='motorway';r.shoulders={left:1.5,right:3};r.structure!.barrierEnabled=true;
  }
  const peripheral=placePreset(map,'peripheral_motorway_junction',{position:point3(E,0,650),groupId:'peripheral-interchange',designProfile:'motorway',mainApproach:350,crossApproach:900,crossCarriagewayOffset:14,rampRadius:60,
    mainElevation:8,crossElevation:-8,mainProfile:profile(650,z=>ringY(E,z)),crossProfile:profile(E,motorwayY),profileInterpolation:'linear'});
  for(const port of peripheral.connectionPorts) {
    const peers=cut(roadEndpoint(map,port.endpoint),r=>mainline(r)||r.id.startsWith('intercity-')),selected=port.endpoint.end==='start'?peers.incoming:peers.outgoing;
    if(!selected.length)throw new Error('peripheral port detached '+port.id);selected.forEach(peer=>link(port.endpoint.end==='start'?peer:port.endpoint,port.endpoint.end==='start'?port.endpoint:peer));
  }
  peripheral.roads.forEach(r=>r.district='motorway');
  for(const r of map.roads)if(r.centerline.some(p=>(p.y??0)<-0.1)&&!r.structure?.enclosure)r.structure={...r.structure,enclosure:{kind:'cutting',clearance:8},barrierEnabled:false};
  // Keep normal junction generation scoped to explicit authored urban corridors.
  connectUrbanSkeleton(map,streets);
  for(const side of [-1,1])for(let z=-1270;z<=-990;z+=70)placePrefab(map,{baseName:'infrastructure-reserve',prefabId:'guardrail',position:point3(-1250+side*7,0,z),rotation:Math.PI/2,scale:{x:7,y:1,z:1},district:'west'});
  for(const [id,x,z,prefab] of [['old-city',-1450,900,'residential_low'],['cbd',500,700,'office'],['new-district',1450,1220,'commercial'],['north-campus',650,-1100,'school'],['south-industry',1450,1300,'industrial']] as const)
    placePrefab(map,{id:`massing-${id}`,prefabId:prefab,position:point3(x,0,z),rotation:0,district:id});
  map.environment.districts=[{id:'central',name:'CBD'},{id:'west',name:'Old City / Industrial Edge'},{id:'east',name:'East New District'},{id:'north',name:'North Institutional'},{id:'south',name:'South Transport District'},{id:'expressway',name:'Expressway Backbone'}];
  map.environment.spawnPoints=[{id:'old-city-boulevard',position:point3(-1150,0,265.625),rotation:-Math.PI/2},{id:'new-district',position:point3(655.625,0,750),rotation:Math.PI}];
  map.environment.metadata={author:'scripts/build-city-main.ts',backboneVersion:'2',ringLengthMetres:ringLength.toFixed(1),eastWestLengthMetres:'4800',northSouthLengthMetres:'4350',diagonalLengthMetres:diagonalLength.toFixed(1),systemInterchanges:'5',diamondInterchanges:String(diamonds.length),tunnelLengthMetres:'500',underpassLengthMetres:'110',intercityLengthMetres:map.roads.filter(r=>r.id.startsWith('intercity-eb')).reduce((sum,r)=>sum+polylineLength(roadPoints(r)),0).toFixed(1),directAccessRamps:'12'};
  map.environment.districts.push({id:'motorway',name:'Peripheral Logistics / Intercity Expressway'});
  addCityMainLandscape(map);
  const report=validateMap(map);if(!report.valid)throw new Error(JSON.stringify(report.errors));return map;
}

import { connectUrbanSkeleton } from './CityMainUrbanConnections';
