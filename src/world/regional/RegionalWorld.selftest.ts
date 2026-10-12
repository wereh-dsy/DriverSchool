import type { CityMapData, CityRoad } from '../city/CityMapData';
import { loadCityMap } from '../city/CityMapLoader';
import { buildCityRoadNetwork } from '../city/CityRoadNetwork';
import { polylineLength, sampleAt } from '../city/geometry';
import { RegionalStreaming } from './RegionalStreaming';
import { regionalTerrainSampler } from './RegionalTerrain';
import { roadPiers } from '../city/RoadInfrastructure';
import { resolveSignContent } from '../city/RoadSignData';
import { CityGround } from '../city/CityGround';

const require=(condition:unknown,message:string)=>{if(!condition)throw new Error(message);};
const grade=(r:CityRoad)=>r.centerline.slice(1).reduce((max,b,i)=>{const a=r.centerline[i]!;return Math.max(max,Math.abs((b.y??0)-(a.y??0))/Math.hypot(b.x-a.x,b.z-a.z));},0);
export function runRegionalWorldSelfTest(raw:CityMapData,base:CityMapData) {
  const checks:string[]=[];
  const check=(message:string,callback:()=>void)=>{callback();checks.push(message);};
  let map:CityMapData;
  check('map loading and existing city preservation',()=>{
    for(const key of ['roads','intersections','objects'] as const)for(const old of base[key])require(JSON.stringify(raw[key].find(r=>r.id===old.id))===JSON.stringify(old),`City changed: ${key}/${old.id}`);
    map=loadCityMap(raw);require((map.regional?.routes.length??0)>=7,'Retained regional routes');
  });
  map=map!;const region=map.regional!,network=buildCityRoadNetwork(map),roads=new Map(map.roads.map(r=>[r.id,r]));
  const edges=new Map<string,Set<string>>();
  for(const node of network.connectivity)for(const a of node.incomingRoadIds)for(const b of node.outgoingRoadIds){const bucket=edges.get(a)??new Set();bucket.add(b);edges.set(a,bucket);}
  const reachable=(start:string,end:string,allowed?:Set<string>)=>{const visited=new Set<string>(),queue=[start];while(queue.length){const id=queue.pop()!;if(id===end)return true;if(visited.has(id))continue;visited.add(id);for(const to of edges.get(id)??[])if(!allowed||allowed.has(to))queue.push(to);}return false;};
  for(const route of region.routes)check(`${route.id} continuity, divided lanes, mainline grades`,()=>{
    const out=route.roadIds.filter(id=>id.includes(':out')),incoming=route.roadIds.filter(id=>id.includes(':in')),allowed=new Set(route.roadIds);
    for(const direction of [out,incoming]){const first=direction.find(id=>!direction.some(other=>other!==id&&edges.get(other)?.has(id)))!,last=direction.find(id=>!direction.some(other=>other!==id&&edges.get(id)?.has(other)))!;require(first&&last&&reachable(first,last,allowed),`${route.id} directed chain`);}
    for(const id of route.roadIds){const r=roads.get(id)!;require(r.laneCount===route.lanes&&r.travelDirection==='forward',`${id} lanes`);require(grade(r)<=.05,`${id} mainline grade`);require(r.centerline.every(p=>p.x>=map.bounds.minX&&p.x<=map.bounds.maxX&&p.z>=map.bounds.minZ&&p.z<=map.bounds.maxZ),`${id} bounds`);}
  });
  check('CBD, city ring and regional graph connectivity',()=>{
    require(reachable('ew-eb','regional:G17:out'),'City to G17');
    for(const [route,cityId]of [['G38','ns-sb'],['S26','ns-nb']] as const){const incoming=map.roadLinks!.find(l=>l.to.roadId===cityId&&roads.get(l.from.roadId)?.roadNameId===route)!;require(incoming&&reachable('regional:G17:out',incoming.from.roadId),`G17 via S68 to ${route}`);}
  });
  for(const hub of region.structures.filter(s=>s.kind==='interchange'))check(`${hub.name} directed movements and advance signs`,()=>{
    require(hub.roadIds.length>=4,`${hub.id} movement count`);
    for(const id of hub.roadIds.filter(id=>!roads.get(id)?.highwayTransition)){const r=roads.get(id)!;require(grade(r)<=.06001,`${id} ramp grade ${(grade(r)*100).toFixed(2)}%`);
      const from=map.roadLinks!.find(l=>l.to.roadId===id&&l.to.end==='start'),to=map.roadLinks!.find(l=>l.from.roadId===id&&l.from.end==='end');require(from&&to,`${id} joined at both ends`);
      require(edges.get(from!.from.roadId)?.has(id)&&edges.get(id)?.has(to!.to.roadId),`${id} movement direction`);
      for(const distance of [500,200,35])require(map.signs!.some(s=>s.id===`${id}:sign:${distance}`||s.id.endsWith(':sign:'+distance)&&s.decisionIds?.includes(id)),`${id} sign ${distance}`);
      require(map.signs!.some(s=>s.id===`${id}:confirm`),`${id} confirmation`);
    }
  });
  check('seven ordinary exits and two service areas',()=>{
    require(region.exits.length>=7,'Retained exits');require(region.structures.filter(s=>s.kind==='service').length>=2,'Retained services');
    for(const exit of [...region.exits,...region.structures.filter(s=>s.kind==='service')])for(const id of exit.roadIds)require(edges.has(id),`${id} access links`);
    require(map.objects.some(o=>o.id.includes('fuel-canopy'))&&map.objects.some(o=>o.id.includes('charger')),'Service facilities');
  });
  const terrain=regionalTerrainSampler(map);
  check('mountain interchange ramps remain above earthworks',()=>{
    for(const hub of region.structures.filter(s=>s.kind==='interchange'))for(const id of hub.roadIds){
      const road=roads.get(id)!;
      for(let d=15;d<polylineLength(road.centerline)-15;d+=15){
        const q=sampleAt(road.centerline,d).point;require(terrain.heightAt(q.x,q.z)<=(q.y??0)+.08,`${id} buried ramp at ${d}m`);
        const step=12.5,x=Math.floor(q.x/step)*step,z=Math.floor(q.z/step)*step,u=(q.x-x)/step,v=(q.z-z)/step;
        const a=terrain.heightAt(x,z),b=terrain.heightAt(x,z+step),c=terrain.heightAt(x+step,z+step),e=terrain.heightAt(x+step,z);
        const rendered=u<=v?a*(1-v)+b*(v-u)+c*u:a*(1-u)+c*v+e*(u-v);
        require(rendered<=(q.y??0)+.08,`${id} rendered terrain buries ramp at ${d}m`);
      }
    }
  });
  for(const structure of region.structures.filter(s=>s.kind==='bridge'||s.kind==='tunnel'))check(`${structure.name} support and continuity`,()=>{
    require(structure.roadIds.length>=2,`${structure.id} both directions`);
    if(structure.kind==='bridge')require(structure.roadIds.some(id=>roadPiers(roads.get(id)!,map).length>0),`${structure.id} pier support`);
    for(const id of structure.roadIds){const road=roads.get(id)!;require(grade(road)<=.05,`${id} bridge/tunnel grade`);
      if(structure.kind==='bridge'){const piers=roadPiers(road,map);for(const pier of piers)require(Math.abs(pier.baseY+pier.height+.65-(pier.position.y??0))<1e-5&&pier.height>2,`${id} pier deck support`);
        for(let d=20;d<polylineLength(road.centerline)-20;d+=50){const p=sampleAt(road.centerline,d).point;require(terrain.heightAt(p.x,p.z)<(p.y??0)-.65,`${id} terrain penetration`);}
      }else{require(road.structure?.enclosure?.kind==='tunnel'&&road.structure.enclosure.clearance>=6,`${id} tunnel roof`);const p=sampleAt(road.centerline,polylineLength(road.centerline)/2).point;require(terrain.heightAt(p.x,p.z)>=(p.y??0)+6,`${id} ridge cover`);}
    }
  });
  check('route shields, registry and complete sign content',()=>{
    for(const route of region.routes){require(map.roadNames![route.id]?.routeNumber===(route.number??route.id),`${route.id} shield`);require(map.signs!.some(s=>s.destinations.some(d=>d.roadNameId===route.id)),`${route.id} signed`);}
    for(const s of map.signs!)resolveSignContent(s,map.roadNames!);
  });
  const streaming=new RegionalStreaming(map);
  check('speed and heading lookahead, sector boundary movement and reverse',()=>{
    const slow=streaming.select(6200,-350,-Math.PI/2,0),fast=streaming.select(6200,-350,-Math.PI/2,120/3.6),turn=streaming.select(6200,-350,Math.PI/2,120/3.6);
    require(fast.lookaheadMetres>=1900&&fast.lookahead.length>slow.lookahead.length,'High-speed corridor');require(JSON.stringify(turn.lookahead)!==JSON.stringify(fast.lookahead),'Turn in same sector updates corridor');
    require(JSON.stringify(turn.lookahead)===JSON.stringify(streaming.select(6200,-350,-Math.PI/2,-120/3.6).lookahead),'Reverse follows velocity');
    require(streaming.select(6700,-350,-Math.PI/2,33).currentSector!==fast.currentSector,'Moving sectors');
  });
  check('whole interchange and bridge preload, city detail unload',()=>{
    const hub=region.structures.find(s=>s.id==='regional:dongyuan')!,near=streaming.select(hub.center.x-1200,hub.center.z,-Math.PI/2,33);
    for(const key of streaming.structureSectors.get(hub.id)!)require(near.tiers.get(key)==='near',`${hub.id} preload ${key}`);
    const east=streaming.select(8000,1000,0,33);require(east.tiers.get('0,0')==='far','City detail unload');require(network.segments.length===map.roads.length,'Persistent graph');
  });
  check('runtime streamed resources, surface contacts and reload',()=>{
    const ground=new CityGround(map,{spawnId:'regional-G17'});
    for(const route of region.routes){const r=roads.get(route.roadIds[0]!)!,q=sampleAt(r.centerline,Math.min(100,polylineLength(r.centerline)/2)).point;ground.setSurfaceReferenceHeight(q.y??0);require(ground.sampleRoadSurface(q.x,q.z).surfaceType==='asphalt',`${route.id} shared road contact`);}
    const graph=ground.roadNetwork;
    for(let i=0;i<100;i++)ground.updatePlayerPosition(8000,1000,0,33);
    require(!ground.sectors.active.has('0,0'),'Runtime city detail unloaded');require(ground.sectors.active.size<streaming.sectors.size/2,'Bounded active scene');
    for(let i=0;i<100;i++)ground.updatePlayerPosition(6200,-350,-Math.PI/2,33);
    require(ground.sectors.active.has('12,-1'),'Runtime east reload');require(ground.roadNetwork===graph,'Logical graph remains');
    ground.dispose();
  });
  return {passed:true,checks,routes:region.routes.map(r=>({id:r.id,lengthKm:polylineLength(r.centerline)/1000,lanes:`${r.lanes}+${r.lanes}`,terrain:r.terrain,connected:r.connectedRoutes})),roads:map.roads.length,signs:map.signs!.length,sectors:streaming.sectors.size};
}
