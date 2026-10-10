import cityMain from './maps/city-main.json';
import { loadCityMap } from './CityMapLoader';
import { buildCityRoadNetwork } from './CityRoadNetwork';
import { validateMap } from './CityMapValidation';
import { roadPoints, polylineLength, sampleAt, junctionExtent } from './geometry';
import type { CityMapData, CityRoad } from './CityMapData';
import { CityGround } from './CityGround';
import { VehicleCollisionSystem } from '../../vehicle/physics/CollisionSystem';
import { PrefabRegistry } from './PrefabRegistry';
import { createSubject3Materials } from '../subject3/materials';
import { InstancedMesh } from 'three';

const assert=(ok:unknown,message:string):void=>{if(!ok)throw new Error('City Main: '+message);};
const mainline=(r:CityRoad)=>['expressway','motorway'].includes(r.district??'')&&r.laneCount===3&&r.speedLimit>=80;
/** Centerline crossings plus deck thickness. Ordinary junction footprints are explicit. */
export function cityMainCrossingIssues(map:CityMapData):string[] {
  const roads=map.roads.map(r=>{const points=roadPoints(r);return {r,points,minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))};}),issues:string[]=[];
  const network=buildCityRoadNetwork(map),nodes=network.endpointNodes.filter(n=>n.ends.length>1);
  for(let ri=0;ri<roads.length;ri++)for(let rj=ri+1;rj<roads.length;rj++) {
    const aa=roads[ri]!,bb=roads[rj]!;
    if(aa.maxX<bb.minX||bb.maxX<aa.minX||aa.maxZ<bb.minZ||bb.maxZ<aa.minZ)continue;
    let found=false;
    for(let i=1;i<aa.points.length&&!found;i++)for(let j=1;j<bb.points.length;j++) {
      const a=aa.points[i-1]!,b=aa.points[i]!,c=bb.points[j-1]!,d=bb.points[j]!;
      if(Math.max(a.x,b.x)<Math.min(c.x,d.x)||Math.max(c.x,d.x)<Math.min(a.x,b.x)||Math.max(a.z,b.z)<Math.min(c.z,d.z)||Math.max(c.z,d.z)<Math.min(a.z,b.z))continue;
      const ax=b.x-a.x,az=b.z-a.z,bx=d.x-c.x,bz=d.z-c.z,den=ax*bz-az*bx;if(Math.abs(den)<1e-7)continue;
      const t=((c.x-a.x)*bz-(c.z-a.z)*bx)/den,u=((c.x-a.x)*az-(c.z-a.z)*ax)/den;if(t<-1e-6||t>1+1e-6||u<-1e-6||u>1+1e-6)continue;
      const x=a.x+t*ax,z=a.z+t*az,y=(a.y??0)+t*((b.y??0)-(a.y??0)),yy=(c.y??0)+u*((d.y??0)-(c.y??0));
      if(Math.abs(y-yy)>=5.65-0.05)continue;
      const joined=nodes.some(n=>n.ends.some(e=>e.roadId===aa.r.id)&&n.ends.some(e=>e.roadId===bb.r.id)&&Math.hypot(x-n.position.x,z-n.position.z)<180);
      const junction=map.intersections.some(k=>k.connections.some(c=>c.roadId===aa.r.id)&&k.connections.some(c=>c.roadId===bb.r.id)&&Math.hypot(k.position.x-x,k.position.z-z)<junctionExtent(k,map)*1.42&&Math.abs((k.position.y??0)-y)<0.2&&Math.abs(y-yy)<0.2);
      if(joined||junction)continue;
      issues.push(`${aa.r.id} / ${bb.r.id} at ${x.toFixed(1)},${z.toFixed(1)}: separation ${Math.abs(y-yy).toFixed(2)}m`);found=true;break;
    }
  }
  return issues;
}
export function runCityMainSelfTest(source:unknown=cityMain,checkContacts=true) {
  const map=loadCityMap(source),report=validateMap(map),network=buildCityRoadNetwork(map);
  const v3=map.environment.metadata?.backboneVersion==='3';
  assert(report.valid,'valid MapAPI data');assert(!report.warnings.some(w=>w.code==='network.sparse'),'all drivable districts join one component');
  assert(!map.intersections.some(j=>j.connections.some(c=>mainline(map.roads.find(r=>r.id===c.roadId)!))),'no mainline at-grade intersections');
  assert(map.roads.filter(r=>/^(ring-(cw|ccw)-|ew-(eb|wb)|ns-(nb|sb))/.test(r.id)||r.groupId==='ns-tunnel'||r.id.includes(':feeder-')).every(r=>r.laneCount===3&&r.travelDirection==='forward'),'three one-way lanes throughout each divided expressway');
  const graph=new Map(map.roads.map(r=>[r.id,new Set<string>()]));
  network.connectivity.forEach(n=>n.incomingRoadIds.forEach(a=>n.outgoingRoadIds.forEach(b=>{if(a!==b)graph.get(a)!.add(b);} )));
  const reachable=(start:string,allowed:Set<string>)=>{const seen=new Set([start]),queue=[start];for(let i=0;i<queue.length;i++)for(const id of graph.get(queue[i]!)!)if(allowed.has(id)&&!seen.has(id)){seen.add(id);queue.push(id);}return seen;};
  for(const prefix of ['ring-cw-','ring-ccw-']) {
    const ids=new Set(map.roads.filter(r=>r.id.startsWith(prefix)||r.id.includes(':feeder-cross-')&&['system-north','system-south'].includes(r.groupId??'')&&Math.sign(r.centerline.at(-1)!.x-r.centerline[0]!.x)===(prefix==='ring-cw-'?1:-1)*(r.groupId==='system-north'?1:-1)).map(r=>r.id)),first=[...ids][0]!;
    assert(reachable(first,ids).size===ids.size,'ring graph closes in '+prefix);
    assert([...ids].every(id=>[...graph.get(id)!].some(next=>ids.has(next))),'ring has no terminal');
  }
  for(const prefix of ['ew-eb','ew-wb','ns-nb','ns-sb']) {
    const northSouth=prefix.startsWith('ns'),forward=prefix.endsWith('eb')||prefix.endsWith('sb');
    const allowed=new Set(map.roads.filter(r=>r.id.startsWith(prefix)||northSouth&&(r.groupId==='ns-tunnel'||r.id.includes(':feeder-')&&!r.id.includes(':feeder-cross-'))&&mainline(r)).map(r=>r.id));
    const roots=[...allowed].filter(id=>!network.connectivity.some(n=>n.outgoingRoadIds.includes(id)&&n.incomingRoadIds.some(i=>allowed.has(i))));
    assert(roots.length>=1,'corridor has external origin '+prefix);
    const seen=reachable(roots[0]!,allowed),direction=forward?1:-1;
    const endCoordinate=(r:CityRoad)=>northSouth?r.centerline.at(-1)!.z:r.centerline.at(-1)!.x;
    const origin=map.roads.find(r=>r.id===roots[0])!,goal=northSouth?(direction>0?2250:-2100):(direction>0?2400:-2400);
    assert([...seen].some(id=>Math.abs(endCoordinate(map.roads.find(r=>r.id===id)!)-goal)<0.1),'continuous '+prefix+' from '+origin.id);
  }
  const gradeLimits={mainline:0,ramp:0,underpass:0};
  for(const r of map.roads) {
    const pts=roadPoints(r);assert(pts.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)),'finite geometry '+r.id);
    let grade=0,radius=Infinity;
    for(let i=1;i<pts.length;i++) {
      const a=pts[i-1]!,b=pts[i]!,l=Math.hypot(b.x-a.x,b.z-a.z);grade=Math.max(grade,Math.abs((b.y??0)-(a.y??0))/l);
      if(i+1<pts.length){const c=pts[i+1]!,l2=Math.hypot(c.x-b.x,c.z-b.z),chord=Math.hypot(c.x-a.x,c.z-a.z),cross=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));if(cross>1e-6)radius=Math.min(radius,l*l2*chord/(2*cross));}
    }
    if(mainline(r)){assert(grade<=0.0401,'mainline <=4% '+r.id+' '+grade);assert(radius>=300,'highway smooth radius '+r.id+' '+radius);gradeLimits.mainline=Math.max(gradeLimits.mainline,grade);}
    if(r.gore){const limit=v3&&r.presetSource?.startsWith('system_compact_')?0.0801:0.0601;assert(grade<=limit,'ramp production grade '+r.id+' '+grade);gradeLimits.ramp=Math.max(gradeLimits.ramp,grade);}
    if(r.id.startsWith('urban-underpass-')){assert(grade<=0.0501,'underpass <=5%');gradeLimits.underpass=Math.max(gradeLimits.underpass,grade);}
    if(r.id.endsWith('-loop'))assert(r.designProfile==='urban'?radius>=29.9&&radius<=45.1:radius>=44.9,'loop curve radius '+r.id+' '+radius);
    if(r.id.endsWith('-semi')||r.id.endsWith('-crossover'))assert(radius>=(r.designProfile==='urban'?54.9:79.9),'semi-directional / crossover curve radius '+r.id+' '+radius);
  }
  for(const id of ['central','west','east','north','south']) {
    const ramps=map.roads.filter(r=>r.groupId==='system-'+id&&r.gore);
    assert(ramps.length===8,'eight turning movements '+id);
    assert(ramps.filter(r=>r.id.endsWith('-loop')).length===(v3?id==='west'?4:id==='south'?2:0:id==='north'||id==='south'?2:4),'correct left-turn variant '+id);
    const directions:{[key:string]:{x:number;z:number}}={N:{x:0,z:-1},S:{x:0,z:1},E:{x:1,z:0},W:{x:-1,z:0}};
    for(const ramp of ramps) {
      const match=ramp.id.match(/:([NSEW])-to-([NSEW])-/)!;assert(match,'movement label');
      const pts=roadPoints(ramp),length=polylineLength(pts),a=sampleAt(pts,0).tangent,b=sampleAt(pts,length).tangent,from=directions[match[1]!]!,to=directions[match[2]!]!;
      assert(a.x*(-from.x)+a.z*(-from.z)>0.995&&b.x*to.x+b.z*to.z>0.995,'intended ramp heading '+ramp.id);
      assert(network.laneConnections.some(l=>l.toLaneId.startsWith(ramp.id+':'))&&network.laneConnections.some(l=>l.fromLaneId.startsWith(ramp.id+':')),'ramp reconnects through lane topology '+ramp.id);
    }
  }
  for(const id of ['east','south'])assert(map.roads.filter(r=>r.groupId==='system-'+id&&r.id.includes(':collector-')).every(r=>r.laneCount===2),'C-D two-lane pair '+id);
  const rampFootprint=(group:string)=>{
    const p=map.roads.filter(r=>r.groupId===group&&r.gore).flatMap(roadPoints);
    const width=Math.max(...p.map(p=>p.x))-Math.min(...p.map(p=>p.x)),depth=Math.max(...p.map(p=>p.z))-Math.min(...p.map(p=>p.z));
    return {width,depth,area:width*depth};
  };
  const peripheralFootprint=rampFootprint('peripheral-interchange'),urbanFootprints=Object.fromEntries(['central','west','east','north','south'].map(id=>[id,rampFootprint('system-'+id)]));
  for(const [id,box] of Object.entries(urbanFootprints)) {
    assert(box.area<peripheralFootprint.area*0.82,'urban footprint distinctly below peripheral '+id);
    assert(box.area<(id==='north'||id==='south'?2040000:1440000)*0.55,'urban footprint reduced from V1 '+id);
  }
  for(const id of ['east','south'])for(const r of map.roads.filter(r=>r.groupId==='system-'+id&&r.id.includes(':collector-'))) {
    const offsets=roadPoints(r).map(p=>Math.abs(id==='east'?p.x-1750:p.z-1550));
    assert(offsets.some(x=>Math.abs(x-22.125)<0.1)&&offsets.every(x=>x<=22.225),'C-D centered 14m from mainline with end taper '+r.id);
  }
  const direct=map.roads.filter(r=>r.presetSource==='urban_side_access'&&r.gore),diamondRamps=map.roads.filter(r=>r.presetSource==='diamond_interchange'&&r.gore);
  assert(direct.length===12&&direct.length>diamondRamps.length,'direct same-direction access is the majority');
  assert(new Set(direct.map(r=>r.groupId)).size===3,'three selected frontage access zones');
  for(const r of direct) {
    const pts=roadPoints(r),a=sampleAt(pts,0).tangent,b=sampleAt(pts,polylineLength(pts)).tangent;
    assert(a.x*b.x+a.z*b.z>0.995,'same direction on/off '+r.id);
    assert(!map.intersections.some(j=>j.signalized&&j.connections.some(c=>c.roadId===r.id)),'direct ramp has no signal terminal '+r.id);
    assert(network.laneConnections.some(l=>l.toLaneId.startsWith(r.id+':'))&&network.laneConnections.some(l=>l.fromLaneId.startsWith(r.id+':')),'direct ramp lane connectivity '+r.id);
  }
  const motorwayLength=Number(map.environment.metadata!.intercityLengthMetres);
  assert(motorwayLength>=1500&&motorwayLength<=2200,'motorway length 1.5–2.2km');
  assert(map.bounds.maxX===3550&&map.bounds.minX===-2450&&map.bounds.minZ===-2100&&map.bounds.maxZ===2250,'only eastern terrain modestly extended');
  for(const prefix of ['intercity-eb','intercity-wb']) {
    const roads=map.roads.filter(r=>r.id.startsWith(prefix)),allowed=new Set(roads.map(r=>r.id));
    assert(roads.every(r=>r.laneCount===3&&r.speedLimit===110&&r.shoulders?.right===3&&r.designProfile==='motorway'),'motorway cross-section '+prefix);
    const first=roads.find(r=>Math.abs(r.centerline[0]!.x-(prefix.endsWith('eb')?1625:3550))<0.1)!;
    assert(first,'motorway origin '+prefix);assert(reachable(first.id,allowed).size===allowed.size,'unbroken motorway '+prefix);
    assert(roads.some(r=>Math.abs(r.centerline.at(-1)!.x-(prefix.endsWith('eb')?3550:1625))<0.1),'motorway reaches edge / ring terminal '+prefix);
  }
  const peripheralRamps=map.roads.filter(r=>r.groupId==='peripheral-interchange'&&r.gore);
  assert(peripheralRamps.length===4&&peripheralRamps.filter(r=>r.id.endsWith('-loop')).length===2,'four-direction motorway T movements');
  assert(peripheralRamps.every(r=>r.gore!.length>=180&&r.designProfile==='motorway'),'longer peripheral acceleration/deceleration geometry');
  for(const r of peripheralRamps)assert(network.laneConnections.some(l=>l.toLaneId.startsWith(r.id+':'))&&network.laneConnections.some(l=>l.fromLaneId.startsWith(r.id+':')),'peripheral ramp lane continuity '+r.id);
  if(v3){for(const id of ['ring-expressway','east-west-expressway','north-south-expressway','intercity-east-expressway'])assert(map.signs?.some(s=>s.destinations.some(d=>d.roadNameId===id)),'data-driven expressway sign '+id);}
  else for(const label of ['Ring','City Center','East','West','North','South','Intercity Expressway'])assert(map.objects.some(o=>o.prefabId==='guide_sign'&&o.label===label),'direction sign '+label);
  for(const prefab of ['tree','noise_barrier','embankment','hardscape','green_strip','office','industrial'])assert(map.objects.some(o=>o.prefabId===prefab),'landscape category '+prefab);
  assert(map.objects.some(o=>o.prefabId==='green_strip'&&(o.scale?.z??0)>10),'reserved park block');
  const materials=createSubject3Materials(),prefabs=new PrefabRegistry(materials),objectRoot=prefabs.buildInstances(map.objects);
  const objectBatches=objectRoot.children.length;
  assert(objectRoot.children.every(o=>o instanceof InstancedMesh)&&objectBatches<90,'prefab parts batch independently of object count');
  const treeBatches=objectRoot.children.filter(o=>o.name==='tree instances') as InstancedMesh[];
  assert(treeBatches.length===2&&treeBatches.every(o=>o.count===map.objects.filter(o=>o.prefabId==='tree').length),'all tree trunks / crowns use two instance batches');
  prefabs.dispose();Object.values(materials).forEach(m=>m.dispose());
  assert(new Set(map.intersections.filter(j=>j.presetSource==='diamond_interchange').map(j=>j.groupId)).size===2,'two meaningful diamonds');
  assert(map.roads.some(r=>r.id.startsWith('urban-diagonal'))&&map.roads.some(r=>r.id.startsWith('urban-regional-diagonal')),'two diagonals');
  assert(map.roads.some(r=>r.groupId==='east-main-aux'&&r.id.includes('transition')),'real main/frontage transitions');
  assert((v3?map.intersections.some(j=>j.type==='irregular'):map.intersections.filter(j=>j.type==='irregular').length===1)&&map.intersections.some(j=>j.type.startsWith('t_')),'five-leg / T junction variation');
  const bores=map.roads.filter(r=>r.groupId==='ns-tunnel');
  assert(bores.length===2&&bores.every(r=>r.structure?.enclosure?.kind==='tunnel'&&r.structure.enclosure.clearance===6&&Math.abs(polylineLength(roadPoints(r))-500)<0.01),'two 500m bores with six metre clear height');
  assert(Number(map.environment.metadata!.diagonalLengthMetres)>=3500&&Number(map.environment.metadata!.diagonalLengthMetres)<=4500,'diagonal avenue length');
  const crossings=cityMainCrossingIssues(map);assert(!crossings.length,'crossing clearances:\n'+crossings.join('\n'));
  let contactSamples=0;
  if(checkContacts) {
  const ground=new CityGround(map,{loadRadius:0}),collision=new VehicleCollisionSystem(ground.colliders);
  try {
    assert(ground.sampleRoadSurface(ground.spawnPose.position.x,ground.spawnPose.position.z,undefined,0).surfaceType==='asphalt','ordinary on-road spawn');
    for(const r of map.roads) {
      const pts=roadPoints(r),length=polylineLength(pts);
      for(let lane=0;lane<r.laneCount;lane++)for(let d=8;d<length-8;d+=10) {
        const s=sampleAt(pts,d),offset=-r.laneCount*r.laneWidth/2+(lane+0.5)*r.laneWidth;
        const p={x:s.point.x-s.tangent.z*offset,y:s.point.y??0,z:s.point.z+s.tangent.x*offset,yaw:Math.atan2(-s.tangent.x,-s.tangent.z)};
        for(const across of [-0.85,0.85])for(const along of [-1.45,1.45]) {
          const surface=ground.sampleRoadSurface(p.x-s.tangent.z*across+s.tangent.x*along,p.z+s.tangent.x*across+s.tangent.z*along,undefined,p.y);
          assert(surface.surfaceType==='asphalt'&&Math.abs(surface.height-p.y)<0.25,'four-wheel support '+r.id+' '+d);
        }
        const result=collision.resolve({previousPose:p,pose:p,velocity:{x:0,z:0},dimensions:{width:2.02,length:5.05,height:1.95},dt:1/120});
        assert(!result.collided,'SUV clearance '+r.id+' '+d+': '+result.contacts.map(c=>c.colliderId).join(', '));contactSamples++;
      }
    }
    assert(ground.colliders.some(c=>c.id.includes('ns-tunnel:')&&c.id.includes(':ceiling:')),'physical tunnel ceilings');
    const bore=bores[0]!,s=sampleAt(roadPoints(bore),250),p={x:s.point.x,y:s.point.y??0,z:s.point.z,yaw:Math.atan2(-s.tangent.x,-s.tangent.z)};
    const roofHit=collision.resolve({previousPose:p,pose:p,velocity:{x:0,z:0},dimensions:{width:2.02,length:5.05,height:7},dt:1/120});
    assert(roofHit.contacts.some(c=>c.colliderId.includes(':ceiling:')),'tunnel roof rejects an overheight envelope');
  }finally{ground.dispose();}
  }
  return {ringLengthMetres:Number(map.environment.metadata!.ringLengthMetres),expressways:'3+3',systems:5,diamonds:2,directAccessRamps:direct.length,motorwayLength,urbanFootprints,peripheralFootprint,tunnelMetres:500,underpassMetres:110,objectBatches,maximumGrades:gradeLimits,contactSamples};
}
