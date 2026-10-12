import type { CityMapData } from '../city/CityMapData';
import { CityGround } from '../city/CityGround';
import { RoadBuilder } from '../city/RoadBuilder';
import { RoadSignRenderer,highwayArrowRotation } from '../city/RoadSignRenderer';
import { roadSignColliders, signDimensions } from '../city/RoadSignTemplates';
import { resolveSignContent } from '../city/RoadSignData';
import { createSubject3Materials } from '../subject3/materials';
import { buildHighwayLaneMarkings } from './HighwayLaneRenderer';
import { polylineLength, sampleAt } from '../city/geometry';
import { BoxGeometry, InstancedMesh, Mesh } from 'three';
import { validateHighwayData } from './HighwayValidation';
import { RoadClearance } from '../city/RoadClearance';
import { junctionSurfaceContains,junctionSurfaceHeight } from '../city/JunctionSurface';

const assert=(ok:unknown,message:string)=>{if(!ok)throw new Error(message);};
export function runHighwaySystemSelfTest(map:CityMapData,baseline:CityMapData){
  const checks:string[]=[],check=(name:string,run:()=>void)=>{run();checks.push(name);};
  const system=map.regional!.highways!,roads=new Map(map.roads.map(r=>[r.id,r]));
  const transitions=map.roads.filter(r=>r.highwayTransition);
  check('retained highway skeleton and existing city data',()=>{
    for(const r of baseline.roads)if(!r.id.startsWith('regional:S89:'))assert(roads.has(r.id),'Removed retained road '+r.id);
    for(const route of baseline.regional!.routes){const next=map.regional!.routes.find(r=>r.id===route.id)!;
      // Only S12's former airport endpoint (first kilometre) is reconstructed.
      // Its western/southern corridor and all other original mainlines stay.
      const kept=route.id==='S89'?route.centerline.filter(p=>p.z>=1800):route.centerline;
      assert(next&&kept.every(p=>next.centerline.some(q=>Math.hypot(p.x-q.x,p.z-q.z, (p.y??0)-(q.y??0))<1e-6)),'Rebuilt retained route '+route.id);
    }
    for(const key of ['roads','intersections','objects'] as const)for(const old of baseline[key].filter(e=>!e.id.startsWith('regional:')))assert(JSON.stringify(map[key].find(e=>e.id===old.id))===JSON.stringify(old),'Changed city '+old.id);
  });
  check('thirteen routes and stable internal IDs with approved display numbers',()=>{
    assert(system.routes.length===13,'Route count');
    for(const [id,number]of [['S37','S27'],['S89','S12'],['S26','S26'],['S68','S28']])assert(system.routes.find(r=>r.id===id)?.number===number,'Display number '+id);
    for(const id of ['G42','G65','S18','S36','S31','S29'])assert(system.routes.some(r=>r.id===id),'Missing '+id);
    assert(system.routes.find(r=>r.id==='G4516')!.type==='connector','G4516 connector');
    for(const r of system.routes)assert(r.roadIds.every(id=>roads.has(id))&&r.direction.forward&&r.direction.reverse,'Incomplete '+r.id);
  });
  check('airport, service, exit and continuation node metadata',()=>{
    assert(!validateHighwayData(map).length,'Highway data validation');
    assert(system.exits.length===12&&system.services.length===4&&system.junctions.length===21,'Node counts');
    assert(system.exits.find(e=>e.highway==='S18')!.destinations.some(d=>d.includes('航站楼')),'Terminal directions');
    assert(map.roadLinks!.some(l=>l.to.roadId==='regional:airport-terminal-access'),'Airport terminal road');
    for(const s of system.services.filter(s=>s.id.includes('chenjiang')||s.id.includes('airport')))assert(s.facilities.includes('fuel')&&s.facilities.includes('charging')&&s.facilities.includes('toilet'),'Facilities');
    assert(map.regional!.structures.some(s=>s.routes.includes('G38')&&s.kind==='tunnel')&&map.regional!.structures.some(s=>s.routes.includes('G38')&&s.kind==='bridge'),'Mountain structures');
    const g17=map.regional!.routes.find(r=>r.id==='G17')!;assert(g17.centerline.some((p,i)=>i>0&&p.x-g17.centerline[i-1]!.x>5&&Math.abs(p.z-2600)<.01),'Retained east-west straight');
  });
  check('open staggered double C, through hubs and retained southern foldback',()=>{
    const sw=map.regional!.routes.find(r=>r.id==='S89')!,ne=map.regional!.routes.find(r=>r.id==='S29')!;
    assert(sw.name==='西南绕城高速'&&ne.name==='东北绕城高速','Bypass names');
    for(const route of [sw,ne]){const a=route.centerline[0]!,b=route.centerline.at(-1)!;assert(Math.hypot(a.x-b.x,a.z-b.z)>10000,'Closed bypass');}
    assert(!system.junctions.some(j=>j.connectedRoutes.includes(sw.id)&&j.connectedRoutes.includes(ne.id)),'Bypasses meet end to end');
    assert(!system.junctions.some(j=>j.kind==='continuation'),'Old head-to-head nodes remain');
    for(const l of map.roadLinks!){const a=roads.get(l.from.roadId)!,b=roads.get(l.to.roadId)!;if(a.id.startsWith('regional:')&&b.id.startsWith('regional:')&&a.type==='highway'&&b.type==='highway')assert(a.roadNameId===b.roadNameId,'Artificial route switch '+l.id);}
    for(const id of ['S89','S29','S31','S36','G17','G38']){const r=map.regional!.routes.find(r=>r.id===id)!;
      const ends=['S89','S29','S31','S36'].includes(id)?[r.centerline[0]!,r.centerline.at(-1)!]:[r.centerline.at(-1)!];
      for(const q of ends)for(const hub of system.junctions.filter(j=>j.connectedRoutes.includes(id)))assert(Math.hypot(q.x-hub.position.x,q.z-hub.position.z)>850,'Mainline ends in a hub '+id);
    }
    const airport=system.junctions.find(j=>j.id==='regional:v3:airport-south')!,city=system.junctions.find(j=>j.id==='regional:v3:airport-distributor')!;
    assert(airport.connectedRoutes.includes('S18')&&airport.connectedRoutes.includes('S89')&&city.connectedRoutes.includes('S36')&&city.connectedRoutes.includes('S89'),'Airport/mainline/city branch organization');
    assert(airport.reservedConnections?.some(c=>!c.enabled&&c.direction),'No reserved interface');
    const fold=roads.get('regional:v3:chenjiang-foldback')!;
    assert(fold?.centerline.some(p=>p.x>14200&&p.z>3750)&&fold.centerline.some(p=>p.x<13600&&p.z>4500),'Deleted interesting U');
    assert(map.roadLinks!.some(l=>l.to.roadId===fold.id||l.to.roadId===fold.id+':deceleration')&&map.roadLinks!.some(l=>l.from.roadId===fold.id||l.from.roadId===fold.id+':acceleration'),'Foldback is not playable');
  });
  check('continuous G17/G38 ownership, west trunks and explicit network roles',()=>{
    for(const [oldId,owner] of [['G42','G17'],['G65','G38']])for(const road of map.roads.filter(r=>r.id.startsWith(`regional:${oldId}:`)))assert(road.roadNameId===owner,'Artificial mainline renumbering '+road.id);
    for(const id of ['G42','G65']){const route=system.routes.find(r=>r.id===id)!;assert(route.roadIds.some(id=>roads.get(id)!.centerline.some(p=>p.x<-10000)),'West corridor '+id);assert(route.role==='trunk'&&route.termini?.start.includes('区域外')&&route.termini.end.includes('区域外'),'Unexplained trunk terminal '+id);}
    assert(system.routes.filter(r=>r.role==='trunk').length>=3&&system.routes.filter(r=>r.role==='orbital').length>=1,'Network hierarchy');
    assert(system.routes.filter(r=>r.type==='provincial').every(r=>Number(r.number.slice(1))<=40),'Provincial numbering');
    for(const suffix of ['westgate','airport-north','northwest','westlink']){const hub=system.junctions.find(j=>j.id==='regional:v2:'+suffix)!;assert(hub?.kind==='interchange'&&hub.roadIds.filter(id=>roads.get(id)?.gore?.start).length===8,'Full interchange movements '+suffix);}
    const west=map.regional!.routes.find(r=>r.id==='S37')!;assert(west.centerline.at(-1)!.x<=-14500,'S27 stops at old hub');
  });
  check('every exit has 2km / 1km / 500m and destination diverge boards',()=>{
    for(const exit of system.exits)for(const id of exit.roadIds.filter(id=>roads.get(id)?.gore?.start)){
      for(const distance of [2000,1000,500,35]){
        const sign=map.signs!.find(s=>s.decisionIds?.includes(id)&&s.advanceMetres===distance);assert(sign,`${id} ${distance}m`);
        assert(sign!.exitNumber===exit.exitNumber&&sign!.destinations.some(d=>d.directionId===exit.id+':destinations'&&d.arrow.startsWith('exit-')),'Destination board '+id);
        assert(Math.abs((sign!.actualAdvanceMetres??distance)-distance)<=30,'Advance placement '+id);
      }
    }
  });
  check('green freeway content, direction shields and two shoulder supports',()=>{
    for(const sign of map.signs!.filter(s=>s.template==='highway-gantry')){
      const c=resolveSignContent(sign,map.roadNames!),road=roads.get(sign.roadId)!,dims=signDimensions(sign.template,sign.size,sign.postOffset,sign.gantryPosts);
      assert(c.color==='#087747'&&dims.posts.length===2&&dims.bottom>=6.5&&dims.height>=4.5,'Gantry presentation');
      const half=road.laneCount*road.laneWidth/2;assert(dims.posts[0]! < -half && dims.posts[1]! > half,'Support on carriageway');
      assert(dims.posts[0]! > -half-(road.shoulders?.left??0) && dims.posts[1]! < half+(road.shoulders?.right??0),'Support outside paved deck');
      assert(roadSignColliders(sign).length===3,'Support collision geometry');
      if(sign.type!=='EXPRESSWAY_DISTANCE')assert(c.destinations.some(d=>d.routeNumber),'Route shield');
      if(sign.interchangeId&&system.junctions.some(h=>h.id===sign.interchangeId)&&sign.decisionIds?.length)assert(c.destinations.some(d=>d.direction&&d.name!==c.destinations[0]!.name),'Hub target direction');
    }
  });
  check('right-exit semantics, lane assignments, entries and measured mileage',()=>{
    assert(Math.sin(highwayArrowRotation('exit-right'))>0&&Math.sin(highwayArrowRotation('exit-left'))<0,'Canvas arrow rotation is reversed');
    for(const lane of transitions.filter(r=>r.highwayTransition!.kind==='deceleration')){
      const signs=map.signs!.filter(s=>s.decisionIds?.includes(lane.highwayTransition!.decisionId));assert(signs.length>0,'Unsigned departure '+lane.id);
      for(const sign of signs)assert(sign.destinations.filter(d=>d.arrow!=='straight').every(d=>d.arrow==='exit-right'),'Geographic left used for a right departure '+lane.id);
    }
    for(const sign of map.signs!.filter(s=>s.laneArrows)){assert(sign.type==='EXPRESSWAY_DIVERGE'&&sign.laneArrows!.length===roads.get(sign.roadId)!.laneCount,'Lane board coverage');assert(sign.laneArrows!.slice(0,-1).every(a=>a==='straight'),'Main lanes lost straight arrows');}
    assert(map.signs!.some(s=>s.type==='EXPRESSWAY_ENTRY')&&map.signs!.some(s=>s.type==='EXPRESSWAY_SERVICE'),'Missing entry/facility board');
    const mileage=map.signs!.filter(s=>s.type==='EXPRESSWAY_DISTANCE');assert(mileage.length>=6&&mileage.every(s=>s.destinations.every(d=>d.arrow==='straight'&&(d.distanceMetres??0)>0)),'Missing measured mileage');
  });
  check('regular larger highway fonts and all board layouts paint within bounds',()=>{
    const fonts:string[]=[],widths:number[]=[],rotations:number[]=[];
    const context=new Proxy({font:''},{get:(target,key)=>key==='font'?target.font:key==='fillText'?(_t:string,_x:number,_y:number,width:number)=>{fonts.push(target.font);widths.push(width);}:key==='rotate'?(angle:number)=>rotations.push(angle):()=>{},set:(target,key,value)=>{if(key==='font')target.font=value;return true;}});
    const renderer=new RoadSignRenderer(map.roadNames!,()=>({getContext:()=>context} as unknown as HTMLCanvasElement));
    for(const sign of map.signs!.filter(s=>s.highwayLayout))renderer.materialFor(sign);
    assert(fonts.length>100&&fonts.every(f=>f.startsWith('400 ')),'Highway font relies on bold');assert(widths.every(w=>Number.isFinite(w)&&w>0),'Clipped or negative text region');assert(fonts.some(f=>f.startsWith('400 116px'))&&fonts.some(f=>f.startsWith('400 136px')),'Destinations/distances were not enlarged');assert(rotations.some(r=>r===Math.PI/4),'No right arrow was painted');renderer.dispose();
  });
  const materials=createSubject3Materials();
  check('physical auxiliary lanes joined at both ends',()=>{
    assert(transitions.length>=80,'Transition count');
    for(const r of transitions){const incoming=map.roadLinks!.find(l=>l.to.roadId===r.id),outgoing=map.roadLinks!.find(l=>l.from.roadId===r.id);assert(incoming&&outgoing&&polylineLength(r.centerline)>100,'Transition links '+r.id);assert(r.highwayTransition!.taperMetres>=100,'Taper '+r.id);}
  });
  check('junction spatial index preserves existing clearance predicates',()=>{
    const clearance=new RoadClearance(map);
    for(const junction of map.intersections.slice(0,24))for(const offset of [-75,-25,0,25,75])for(const margin of [0,.5,10]){
      const p={x:junction.position.x+offset,z:junction.position.z+offset*.7},expected=map.intersections.some(j=>{const y=junctionSurfaceHeight(j,p);return y>=-10&&y<=40&&junctionSurfaceContains(j,map,p,margin);});assert(clearance.junctionAt(p,margin,-10,40)===expected,'Spatial clearance changed');
    }
  });
  check('triangular hatching, acceleration dashes and lane arrows',()=>{
    for(const kind of ['deceleration','acceleration'] as const){const names:string[]=[];for(const road of transitions.filter(r=>r.highwayTransition!.kind===kind).slice(0,12)){const group=buildHighwayLaneMarkings(road,map,materials);group.traverse(o=>{if(o instanceof Mesh){names.push(o.name);o.geometry.dispose();}});}assert(names.includes('gore triangle outline')&&names.includes('gore triangle hatch'),'Gore markings');if(kind==='deceleration')assert(names.includes('lane arrow head')&&names.includes('deceleration dashed entry'),'Driver-relative arrows and dashed access');assert(names.includes(kind==='acceleration'?'acceleration dashed merge':'deceleration solid taper'),'Lane paint');}
  });
  check('shared streetlight geometry across roads and sign support templates',()=>{
    const builder=new RoadBuilder(materials),road=transitions[0]!,a=builder.build({...road,streetlights:true}),b=builder.build({...road,streetlights:true}),geometry=(root:typeof a)=>{const found:unknown[]=[];root.traverse(o=>{if(o instanceof InstancedMesh)found.push(o.geometry);});return found;};
    const ga=geometry(a),gb=geometry(b);assert(ga.length&&ga.every(g=>gb.includes(g)),'Repeated infrastructure geometry');
    const renderer=new RoadSignRenderer(map.roadNames!,()=>null),signs=map.signs!.filter(s=>s.highwayLayout).slice(0,2),root=renderer.buildInstances(signs),supports=new Set<unknown>();root.traverse(o=>{if(o instanceof InstancedMesh&&o.geometry instanceof BoxGeometry)supports.add(o.geometry);});assert(supports.size===1,'Unit support geometry');renderer.dispose();
    for(const root of [a,b])root.traverse(o=>{if(o instanceof InstancedMesh)o.dispose();else if(o instanceof Mesh)o.geometry.dispose();});for(const g of ga)if(g&&typeof g==='object'&&'dispose'in g)(g as {dispose():void}).dispose();
  });
  const ground=new CityGround(map,{spawnId:'regional-G42'}),initial=ground.loadStatistics;
  check('startup defers remote signs, roads and background geometry',()=>{
    assert(initial.compiledRoadCount<map.roads.length/4,'Eager roads');assert(initial.signCount<map.signs!.length/4,'Eager signs');assert(initial.backgroundSectors<initial.totalSectors/10,'Eager terrain');
  });
  check('auxiliary lanes use existing asphalt contact queries',()=>{
    for(const r of transitions)for(const fraction of [.2,.65,.95]){const p=sampleAt(r.centerline,polylineLength(r.centerline)*fraction).point;ground.setSurfaceReferenceHeight(p.y??0);assert(ground.sampleRoadSurface(p.x,p.z).surfaceType==='asphalt','Auxiliary contact '+r.id);}
  });
  check('bounded streaming and first-load statistics',()=>{
    const spawn=map.environment.spawnPoints.find(s=>s.id==='regional-G42')!;
    for(let i=0;i<220&&!ground.sectors.ready;i++)ground.updatePlayerPosition(spawn.position.x,spawn.position.z,spawn.rotation,0);
    const stats=ground.loadStatistics;assert(ground.sectors.ready&&stats.firstLoadMs!==undefined&&stats.firstLoadMs>0,'First-load timing');assert(stats.sectorCount<stats.totalSectors/4&&stats.roadCount>0&&stats.signCount>0&&stats.barrierCount>0,'Loading counters');
  });
  check('western sectors stream, unload old sectors and retain road contact',()=>{
    const spawn=map.environment.spawnPoints.find(s=>s.id==='regional-west-G65')!;
    for(let i=0;i<160;i++)ground.updatePlayerPosition(spawn.position.x,spawn.position.z,spawn.rotation,25);
    const key=Math.floor(spawn.position.x/map.sectorSize)+','+Math.floor(spawn.position.z/map.sectorSize);
    assert(ground.sectors.active.has(key)&&!ground.sectors.active.has('0,0'),'Western streaming tier');
    ground.setSurfaceReferenceHeight(spawn.position.y??0);assert(ground.sampleRoadSurface(spawn.position.x,spawn.position.z).surfaceType==='asphalt','Western mainline asphalt');
  });
  const loaded=ground.loadStatistics;ground.dispose();for(const material of Object.values(materials))material.dispose();
  return {passed:true,checks,routes:system.routes.length,exits:system.exits.length,junctions:system.junctions.length,services:system.services.length,auxiliaryLanes:transitions.length,initial,loaded};
}

