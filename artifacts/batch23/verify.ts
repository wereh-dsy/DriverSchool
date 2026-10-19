import {readFileSync,writeFileSync} from 'node:fs';
import {runNavigationSelfTest} from '../../src/world/navigation/Navigation.selftest';
import {runNavigationDisplaysSelfTest} from '../../src/vehicle/visual/NavigationDisplays.selftest';
import {runMapGeometryConsistencySelfTest} from '../../src/world/navigation/MapGeometryConsistency.selftest';
import {runRegionalWorldSelfTest} from '../../src/world/regional/RegionalWorld.selftest';
import {buildCityRoadNetwork} from '../../src/world/city/CityRoadNetwork';
import {RoutePlanner} from '../../src/world/navigation/RoutePlanner';
import {roadPoints,polylineLength} from '../../src/world/city/geometry';
import {RoadBuilder} from '../../src/world/city/RoadBuilder';
import {createSubject3Materials} from '../../src/world/subject3/materials';
import {Mesh,Vector3,Raycaster} from 'three';
import {preserveReachability} from './reachability';
import type {CityMapData} from '../../src/world/city/CityMapData';
const before=JSON.parse(readFileSync('artifacts/batch23/before.json','utf8')) as CityMapData,after=JSON.parse(readFileSync('src/world/regional/regional-main.json','utf8')) as CityMapData;
const check=(work:()=>unknown)=>{try{return {passed:true,result:work()};}catch(error){return {passed:false,error:String(error)};}};
function routes(map:CityMapData){
  const network=buildCityRoadNetwork(map),planner=new RoutePlanner(network),results:any[]=[];
  const location=(id:string,near:'start'|'end',entering=false)=>{const road=map.roads.find(r=>r.id===id)!,length=polylineLength(roadPoints(road)),along=near==='start'?Math.min(8,length/3):Math.max(length*2/3,length-8);return {roadId:id,along,point:planner.pointAt(id,along),label:id,direction:road.travelDirection==='reverse'?'reverse' as const:road.travelDirection==='forward'?'forward' as const:near==='start'!==entering?'forward' as const:'reverse' as const};};
  const add=(name:string,from:string,fromEnd:'start'|'end',to:string,toEnd:'start'|'end',access=false)=>{const route=planner.plan(location(from,fromEnd),location(to,toEnd,true));results.push({name,from,to,reachable:!!route,distance:route?.distance,sections:route?.sections.map(s=>s.road.id),access});};
  for(const m of map.editing?.ramps??[])if(/^(v91-ew|v91-ns|access-ew|access-ns)/.test(m.roadId))add(m.roadId,m.from.roadId,m.from.end,m.to.roadId,m.to.end,true);
  for(const [prefix,axis,increasing]of [['ew-eb','x',true],['ew-wb','x',false],['ns-sb','z',true],['ns-nb','z',false]] as const){
    const roads=map.roads.filter(r=>r.id.startsWith(prefix)&&r.roadClass==='expressway').sort((a,b)=>((a.centerline[0]![axis]+a.centerline.at(-1)![axis])-(b.centerline[0]![axis]+b.centerline.at(-1)![axis]))*(increasing?1:-1));
    const from=roads[0]!,to=roads.at(-1)!;add(prefix+' through',from.id,'start',to.id,'end');
  }
  const north=map.intersections.find(j=>j.id==='direction-mingyuan-ne-terminal')!.connections.find(c=>c.roadId.startsWith('direction-mingyuan-main'))!.roadId;
  add('Mingyuan SW-NE','direction-mingyuan-main','start',north,'end');
  add('Mingyuan NE-SW',north,'end','direction-mingyuan-main','start');
  for(const r of map.roads.filter(r=>/^(system-central|system-north|system-south):/.test(r.id)&&r.roadClass==='ramp')){
    const links=map.roadLinks??[],from=links.find(l=>l.from.roadId===r.id&&l.from.end==='start'||l.to.roadId===r.id&&l.to.end==='start'),to=links.find(l=>l.from.roadId===r.id&&l.from.end==='end'||l.to.roadId===r.id&&l.to.end==='end');
    if(!from||!to)continue;const a=from.from.roadId===r.id?from.to:from.from,b=to.from.roadId===r.id?to.to:to.from;add(r.id,a.roadId,a.end,b.roadId,b.end);
  }
  const spawn=map.environment.spawnPoints[0]!,start=planner.locate({...spawn.position,y:spawn.position.y??0,yaw:spawn.rotation})??location('ew-eb','start');
  for(const pattern of [/机场/,/星湖/]){const road=map.roads.find(r=>pattern.test(map.roadNames?.[r.roadNameId??'']?.primaryText??''));if(road&&start){const route=planner.plan(start,location(road.id,'start',true));results.push({name:pattern.source,from:start.roadId,to:road.id,reachable:!!route,distance:route?.distance});}}
  return results;
}
function shellTest(map:CityMapData){
  const materials=createSubject3Materials(),builder=new RoadBuilder(materials,map),results:any[]=[];
  for(const road of map.roads.filter(r=>r.structure?.enclosure)){
    const root=builder.build(road),covered=road.structure!.enclosure!.kind!=='cutting',roof=root.getObjectByName('tunnel ceiling and portals') as Mesh|undefined;
    if(covered){
      if(!(roof instanceof Mesh))throw new Error('Missing ceiling '+road.id);
      const points=roadPoints(road),p=points[Math.floor(points.length/2)]!,ray=new Raycaster(new Vector3(p.x,(p.y??0)+1.2,p.z),new Vector3(0,1,0),0,20);root.updateMatrixWorld(true);
      if(!ray.intersectObject(roof).length)throw new Error('Ceiling invisible from driving volume '+road.id);
      results.push({roadId:road.id,ceilingVisibleFromBelow:true,roofDrawCalls:1});
    }else if(roof)throw new Error('Open cut incorrectly covered '+road.id);
    root.traverse(o=>{if(o instanceof Mesh&&!('isInstancedMesh' in o))o.geometry.dispose();});
  }
  Object.values(materials).forEach(m=>m.dispose());return {tunnels:results.length,results};
}
const city=JSON.parse(readFileSync('src/world/city/maps/city-main.json','utf8'));
const result:any={before:{navigation:check(()=>runNavigationSelfTest(before)),displays:check(runNavigationDisplaysSelfTest),geometry:check(()=>runMapGeometryConsistencySelfTest(before)),regional:check(()=>runRegionalWorldSelfTest(before,city)),routes:routes(before)},after:{navigation:check(()=>runNavigationSelfTest(after)),displays:check(runNavigationDisplaysSelfTest),geometry:check(()=>runMapGeometryConsistencySelfTest(after)),routes:routes(after),shells:check(()=>shellTest(after)),regional:check(()=>runRegionalWorldSelfTest(after,city))},reachability:preserveReachability(before,after)};
result.routeRegressions=result.before.routes.filter((r:any)=>r.reachable&&!result.after.routes.find((a:any)=>a.name===r.name)?.reachable);
writeFileSync('artifacts/batch23/navigation-and-runtime-review.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,before:{...result.before,routes:result.before.routes.map(({sections,...r}:any)=>r)},after:{...result.after,routes:result.after.routes.map(({sections,...r}:any)=>r)}},null,2));
if(result.reachability.losses.length||result.routeRegressions.length||!result.after.shells.passed||!result.after.navigation.passed)process.exitCode=1;
