import cityMain from './maps/city-main.json';
import v2Baseline from '../../../artifacts/city-main-v3/v2-base.json';
import type { CityRoad } from './CityMapData';
import { loadCityMap } from './CityMapLoader';
import { buildCityRoadNetwork } from './CityRoadNetwork';
import { roadPoints,sampleAt,rotatePoint } from './geometry';
import { RoadSignRenderer } from './RoadSignRenderer';
import { resolveSignContent } from './RoadSignData';
import { signDimensions } from './RoadSignTemplates';
import { RoadClearance } from './RoadClearance';
const assert=(ok:unknown,message:string)=>{if(!ok)throw new Error('City Main V3: '+message);};
export function runCityMainV3SelfTest(source:unknown=cityMain) {
  const map=loadCityMap(source);assert(map.environment.metadata?.backboneVersion==='3','V3 playable data');
  const network=buildCityRoadNetwork(map),roadById=new Map(map.roads.map(r=>[r.id,r]));
  const baseline=loadCityMap(v2Baseline),pointKey=(p:{x:number;y?:number;z:number})=>[p.x,p.y??0,p.z].map(n=>n.toFixed(5)).join(','),through=(r:CityRoad)=>r.laneCount===3&&r.speedLimit>=80;
  assert(JSON.stringify(map.bounds)===JSON.stringify(baseline.bounds),'map bounds preserved from V2');
  const throughPoints=new Set(map.roads.filter(through).flatMap(roadPoints).map(pointKey));
  for(const r of baseline.roads.filter(through))assert(roadPoints(r).every(p=>throughPoints.has(pointKey(p))),'retained V2 through geometry '+r.id);
  for(const r of baseline.roads.filter(r=>r.groupId==='ns-tunnel'||r.groupId==='urban-rail-underpass'||r.groupId==='peripheral-interchange'||r.id.startsWith('intercity-')))assert(roadById.has(r.id)&&JSON.stringify(roadPoints(roadById.get(r.id)!))===JSON.stringify(roadPoints(r)),'retained tunnel/underpass/peripheral geometry '+r.id);
  const graph=new Map(map.roads.map(r=>[r.id,new Set<string>()]));
  for(const n of network.connectivity)for(const a of n.incomingRoadIds)for(const b of n.outgoingRoadIds)if(a!==b)graph.get(a)!.add(b);
  const reachable=(start:string,allowed:(r:CityRoad)=>boolean)=>{const seen=new Set([start]),queue=[start];for(let i=0;i<queue.length;i++)for(const id of graph.get(queue[i]!)!)if(allowed(roadById.get(id)!)&&!seen.has(id)){seen.add(id);queue.push(id);}return seen;};
  let movements=0;const semiRadii:number[]=[];
  for(const id of ['central','east','north','west','south']) {
    for(const r of map.roads.filter(r=>r.groupId==='system-'+id&&r.gore)) {
      if(/-(semi|star|turbine)$/.test(r.id)) {
        const pts=roadPoints(r);let radius=Infinity;
        for(let i=1;i+1<pts.length;i++){const a=pts[i-1]!,b=pts[i]!,c=pts[i+1]!,ab=Math.hypot(b.x-a.x,b.z-a.z),bc=Math.hypot(c.x-b.x,c.z-b.z),ac=Math.hypot(c.x-a.x,c.z-a.z),cross=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));if(cross>1e-6)radius=Math.min(radius,ab*bc*ac/(2*cross));}
        assert(radius>=54.9&&radius<=90.1,'urban semi-directional sampled radius 55–90m '+r.id+': '+radius);semiRadii.push(radius);
      }
      const match=r.id.match(/:([NSEW])-to-([NSEW])-/)!;
      const route=(arm:string)=>['N','S'].includes(arm)?['east','west'].includes(id)?'ring-expressway':'north-south-expressway':['north','south'].includes(id)?'ring-expressway':'east-west-expressway';
      const sources=network.connectivity.filter(n=>n.outgoingRoadIds.includes(r.id)).flatMap(n=>n.incomingRoadIds).map(id=>roadById.get(id)!).filter(r=>r.laneCount===3&&r.speedLimit>=80);
      const targets=network.connectivity.filter(n=>n.incomingRoadIds.includes(r.id)).flatMap(n=>n.outgoingRoadIds).map(id=>roadById.get(id)!).filter(r=>r.laneCount===3&&r.speedLimit>=80);
      assert(sources.length&&targets.length&&sources.every(r=>r.roadNameId===route(match[1]!))&&targets.every(r=>r.roadNameId===route(match[2]!)),'actual directional source/target corridors '+r.id);
      assert(network.laneConnections.some(l=>sources.some(s=>l.fromLaneId.startsWith(s.id+':'))&&l.toLaneId.startsWith(r.id+':'))&&network.laneConnections.some(l=>l.fromLaneId.startsWith(r.id+':')&&targets.some(t=>l.toLaneId.startsWith(t.id+':'))),'actual movement lane graph '+r.id);movements++;
    }
  }
  const inner=map.roads.filter(r=>r.roadNameId==='inner-boulevard'),seen=reachable(inner[0]!.id,r=>r.roadNameId==='inner-boulevard');
  assert(inner.length>=8&&seen.size===inner.length,'ordinary boulevard connected loop');
  for(const r of inner)for(const end of ['start','end'] as const)assert(map.intersections.some(j=>j.connections.some(c=>c.roadId===r.id&&c.end===end))||network.endpointNodes.some(n=>n.ends.length>1&&n.ends.some(e=>e.roadId===r.id&&e.end===end)&&n.ends.filter(e=>roadById.get(e.roadId)?.roadNameId==='inner-boulevard').length>=2),'inner boulevard has no loose end '+r.id+':'+end);
  const urban=(r:CityRoad)=>!['expressway','motorway'].includes(r.district??'');
  const urbanSeen=reachable(map.roads.find(r=>r.roadNameId==='central-avenue')!.id,urban);
  for(const name of ['central-avenue','new-city-avenue','north-avenue','south-avenue','west-avenue','east-avenue','industrial-avenue','inner-boulevard']){const missing=map.roads.filter(r=>r.roadNameId===name&&urban(r)&&r.groupId!=='east-main-aux'&&!urbanSeen.has(r.id));assert(!missing.length,'ordinary district route connectivity '+name+': '+missing.map(r=>r.id).join(', '));}
  assert(map.roads.filter(r=>r.groupId==='east-main-aux'&&r.id.includes('transition')).length===6,'six main/aux transitions retained');
  for(const direction of ['1','-1']) {
    const prefix='east-main-aux:main-'+direction+'-',parts=map.roads.filter(r=>r.id.startsWith(prefix)),origin=parts.find(r=>!network.connectivity.some(n=>n.outgoingRoadIds.includes(r.id)&&n.incomingRoadIds.some(id=>id.startsWith(prefix))))!;
    assert(origin&&reachable(origin.id,r=>r.id.startsWith(prefix)).size===parts.length,'continuous directional main/aux boulevard '+direction);
    assert(parts.some(r=>urbanSeen.has(r.id)),'urban streets feed both main carriageways '+direction);
    assert(parts.some(r=>reachable(r.id,urban).has(map.roads.find(r=>r.roadNameId==='central-avenue')!.id)),'main carriageway has urban exit '+direction);
  }
  const clearance=new RoadClearance(map);let gantries=0;
  for(const sign of map.signs??[]) {
    assert(!sign.exitNumber,'exit numbers remain unassigned');
    const road=roadById.get(sign.roadId)!,pts=roadPoints(road);let best=Infinity,t=sampleAt(pts,0).tangent;
    for(let i=1;i<pts.length;i++){const a=pts[i-1]!,b=pts[i]!,dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz),u=Math.max(0,Math.min(1,((sign.position.x-a.x)*dx+(sign.position.z-a.z)*dz)/(l*l))),d=Math.hypot(sign.position.x-a.x-u*dx,sign.position.z-a.z-u*dz);if(d<best){best=d;t={x:dx/l,z:dz/l};}}
    const direction=sign.laneDirection==='forward'?1:-1,front=rotatePoint({x:0,z:1},sign.heading);
    assert(front.x*t.x*direction+front.z*t.z*direction<-.96,'sign readable face opposes actual incoming direction '+sign.id);
    const dims=signDimensions(sign.template,sign.size),y=sign.position.y??0;
    if(sign.template==='gantry'){assert(dims.bottom>=6.5,'overhead board clearance');gantries++;}
    for(const x of dims.posts){const q=rotatePoint({x,z:0},sign.heading),p={x:sign.position.x+q.x,z:sign.position.z+q.z};assert(!clearance.roadAt(p,0.65,y-1,y+dims.poleTop),'sign support avoids every paved carriageway '+sign.id);}
    for(const x of [-dims.width/2,0,dims.width/2]){const q=rotatePoint({x,z:0},sign.heading),p={x:sign.position.x+q.x,z:sign.position.z+q.z};assert(!clearance.roadAt(p,0.1,y+dims.bottom-.3,y+dims.bottom+dims.height+.3),'sign board avoids bridge decks '+sign.id);}
  }
  for(const hub of ['central','east','north','west','south','intercity']) {
    const id=hub==='intercity'?'intercity-hub':hub+'-hub',signs=map.signs!.filter(s=>s.interchangeId===id);
    assert(signs.filter(s=>s.type==='EXPRESSWAY_ADVANCE'&&(s.advanceMetres??0)>=255).length>=(hub==='intercity'?3:4),'advance signs on all approaches '+hub);
    assert(signs.filter(s=>s.type==='EXPRESSWAY_DIVERGE'&&(s.advanceMetres??0)>=55&&(s.advanceMetres??0)<=145).length>=(hub==='intercity'?3:4),'diverge signs on all approaches '+hub);
  }
  const types=new Set(map.signs!.map(s=>s.type));assert(types.size===6,'six sign types present');
  return {directionalMovements:movements,semiDirectionalRadiusRange:[Math.min(...semiRadii),Math.max(...semiRadii)],innerLoopRoadSegments:inner.length,innerLengthMetres:Number(map.environment.metadata!.innerBoulevardLengthMetres),ordinaryDistrictConnectivity:'passed',signs:map.signs!.length,gantries,signTypes:types.size};
}
export function runRoadSignSelfTest() {
  const map=loadCityMap(cityMain),sign=map.signs?.find(s=>s.destinations.some(d=>d.roadNameId==='central-avenue'));assert(sign,'central avenue sign data');
  const names=structuredClone(map.roadNames!),calls:string[]=[],context={fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(text:string){calls.push(text);}} as unknown as CanvasRenderingContext2D;
  const factory=()=>({width:0,height:0,getContext:()=>context} as unknown as HTMLCanvasElement),renderer=new RoadSignRenderer(names,factory),definition=structuredClone(sign!),placement=JSON.stringify(definition),roads=JSON.stringify(map.roads);
  const a=renderer.materialFor(definition),before=JSON.stringify(resolveSignContent(definition,names)),root=renderer.buildInstances(Array.from({length:100},(_,i)=>({...definition,id:'copy-'+i})));
  assert(renderer.materialFor({...definition,id:'another'})===a&&renderer.cacheStats.textures===1,'identical content reuses one texture/material');
  const geometries=root.children.map(o=>(o as {geometry?:unknown}).geometry);
  names['central-avenue']!.primaryText='人民大道';
  const b=renderer.materialFor(definition),after=JSON.stringify(resolveSignContent(definition,names)),renamed=renderer.buildInstances([definition]);
  assert(a!==b&&before!==after&&calls.some(t=>t.includes('人民大道')),'registry-only rename creates changed texture/content');
  assert(JSON.stringify(definition)===placement&&JSON.stringify(map.roads)===roads,'rename preserves sign placement and road geometry');
  assert(renamed.children.every(o=>geometries.includes((o as {geometry?:unknown}).geometry))&&renderer.cacheStats.templates===1,'rename preserves cached mesh geometry');
  assert(renderer.cacheStats.textures===2&&root.children.length<=5,'bounded template batching and cache');
  root.children.forEach(o=>{if('dispose'in o)(o.dispose as ()=>void)();});renamed.children.forEach(o=>{if('dispose'in o)(o.dispose as ()=>void)();});renderer.dispose();
  return {registryRename:'passed',unchangedRoadsAndPlacement:'passed',repeatedSigns:100,texturesCreated:2,templateCount:1};
}
