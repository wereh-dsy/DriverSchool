import {Mesh} from 'three';
import type {CityMapData,CityRoad} from './CityMapData';
import {newCityMap} from './CityMapData';
import {loadCityMap} from './CityMapLoader';
import {validateMap} from './CityMapValidation';
import {roadPoints,polylineLength,sampleAt,roadEdges} from './geometry';
import {cityGroundHeightAt,cityGroundGeometry} from './CityGroundGeometry';
import {cityElevationProtectedRoad,cityUrbanElevationCrossings,repairCityMainGroundElevation,CITY_GROUND_ROAD_OFFSET} from './maps/CityMainGroundElevation';
import {RoadBuilder} from './RoadBuilder';
import {IntersectionBuilder} from './IntersectionBuilder';
import {RoadEdgeChains} from './RoadEdgeChain';
import {CityGround} from './CityGround';
import {junctionSurfaceHeight} from './JunctionSurface';
import {createSubject3Materials} from '../subject3/materials';
const assert=(v:unknown,m:string)=>{if(!v)throw new Error('City ground elevation: '+m);};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const verticalOnly=(r:CityRoad)=>{const q=structuredClone(r);delete q.elevationMode;delete q.elevation;q.centerline.forEach(p=>delete p.y);return q;};
const yRange=(r:CityRoad):[number,number]=>{const y=roadPoints(r).map(p=>p.y??0);return [Math.min(...y),Math.max(...y)];};
export function runCityGroundElevationSelfTest(before:CityMapData,source:CityMapData){
 assert(source.roads.length===before.roads.length&&source.intersections.length===before.intersections.length,'unchanged road/junction count');
 assert(same(source.signs,before.signs)&&same(source.objects,before.objects)&&same(source.roadNames,before.roadNames),'signs, landscape and registry untouched');
 assert(same(source.roadLinks,before.roadLinks)&&same(source.bounds,before.bounds)&&same(source.environment.spawnPoints,before.environment.spawnPoints),'topology, map bounds and spawn points untouched');
 const map=loadCityMap(source),old=new Map(before.roads.map(r=>[r.id,r]));let protectedCount=0,changed=0;
 for(const r of source.roads){const b=old.get(r.id)!;assert(same(verticalOnly(r),verticalOnly(b)),'only road elevation changes '+r.id);
  if(cityElevationProtectedRoad(b)){assert(same(r,b),'protected road exact '+r.id);protectedCount++;}else if(!same(r.centerline,b.centerline))changed++;
 }
 for(const j of source.intersections){const b=before.intersections.find(k=>k.id===j.id)!;assert(same(j.connections,b.connections)&&j.position.x===b.position.x&&j.position.z===b.position.z&&j.type===b.type&&j.rotation===b.rotation,'junction topology unchanged '+j.id);
  assert(same(j.pavementFootprint?.map(p=>[p.x,p.z]),b.pavementFootprint?.map(p=>[p.x,p.z])),'junction outline unchanged '+j.id);
 }
 const validation=validateMap(map);assert(validation.valid,'valid map');
 const ground=cityGroundHeightAt(0,0),contact=ground+CITY_GROUND_ROAD_OFFSET,ordinary=map.roads.filter(r=>!cityElevationProtectedRoad(r)),groundRoads=ordinary.filter(r=>r.elevationMode==='ground');
 let seed=0x51231,minOffset=Infinity,maxOffset=-Infinity;for(let i=0;i<64;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const r=groundRoads[seed%groundRoads.length]!;const s=sampleAt(roadPoints(r),polylineLength(roadPoints(r))*((seed>>>8)%1000)/1000).point;
  const offset=(s.y??0)+.024-cityGroundHeightAt(s.x,s.z);assert(offset>=.009&&offset<=.065,'ground pavement centimetres '+r.id+' '+offset);minOffset=Math.min(minOffset,offset);maxOffset=Math.max(maxOffset,offset);
 }
 const materials=createSubject3Materials(),builder=new RoadBuilder(materials,map),cases:Record<string,unknown>={};
 for(const [name,predicate] of [
  ['Central Avenue ground',(r:CityRoad)=>r.roadNameId==='central-avenue'],
  ['West Old City local ground',(r:CityRoad)=>r.id.startsWith('v5-west-')&&r.laneCount===2],
  ['East New District arterial ground',(r:CityRoad)=>r.roadNameId==='east-avenue'&&!!r.type?.startsWith('urban')],
 ] as [string,(r:CityRoad)=>boolean][]){const r=groundRoads.find(r=>predicate(r)&&Math.abs((r.elevation??0)-contact)<1e-6)!;assert(r,'selected ground case '+name);
  const root=builder.build(r),pavement=root.children.find(o=>o.name==='road pavement') as Mesh;assert(pavement,'actual road pavement '+name);const a=pavement.geometry.getAttribute('position');for(let i=0;i<a.count;i++)assert(Math.abs(a.getY(i)-ground-.04)<1e-5,'rendered ground road offset '+name);
  assert(!root.children.some(o=>o.name.endsWith(':piers')||o.name==='bridge skirt'),'ground has no bridge underside/piers '+name);cases[name]={road:r.id,beforeY:yRange(old.get(r.id)!),afterY:yRange(r),renderedPavementAboveTerrain:.04};root.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});
 }
 const junction=map.intersections.find(j=>Math.abs((j.position.y??0)-contact)<1e-6&&j.connections.every(c=>map.roads.find(r=>r.id===c.roadId)!.elevationMode==='ground'))!;assert(junction,'ordinary ground junction');
 const jr=new IntersectionBuilder(map,materials).build(junction),jp=jr.children.find(o=>o.name==='junction pavement') as Mesh;jr.updateMatrixWorld(true);const ja=jp.geometry.getAttribute('position');for(let i=0;i<ja.count;i++)assert(Math.abs(ja.getY(i)+jp.position.y+jr.position.y-ground-.04)<1e-5,'ground junction actual mesh offset');
 cases['Ground intersection']={junction:junction.id,y:junction.position.y,renderedPavementAboveTerrain:.04};jr.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});
 const elevated=map.roads.find(r=>r.id.startsWith('ew-eb')&&yRange(r)[0]>=7.9)!;assert(elevated&&same(elevated,old.get(elevated.id)),'elevated expressway preserved');cases['Elevated expressway']={road:elevated.id,y:yRange(elevated),unchanged:true};
 const ramp=map.roads.find(r=>r.gore&&r.presetSource==='urban_side_access'&&yRange(r)[0]<.1&&yRange(r)[1]>5)!;assert(ramp&&same(ramp,old.get(ramp.id)),'ground-elevated ramp exact');
 const rp=roadPoints(ramp);let maxRampStep=0;for(let d=1;d<=polylineLength(rp);d++){const a=sampleAt(rp,d-1).point,b=sampleAt(rp,d).point;maxRampStep=Math.max(maxRampStep,Math.abs((a.y??0)-(b.y??0)));}assert(maxRampStep<.121,'ramp continuous interpolation');cases['Ramp transition']={road:ramp.id,y:yRange(ramp),maxMetreStep:maxRampStep,unchanged:true};
 const depressed=map.roads.find(r=>r.id==='urban-rail-underpass:underpass')!;assert(depressed&&yRange(depressed)[1]<-7&&same(depressed,old.get(depressed.id)),'underpass negative elevation exact');cases['Underpass']={road:depressed.id,y:yRange(depressed),unchanged:true};
 let maxGrade=0;for(const r of ordinary){const p=roadPoints(r);for(let i=1;i<p.length;i++){const distance=Math.hypot(p[i]!.x-p[i-1]!.x,p[i]!.z-p[i-1]!.z);if(distance>1e-6)maxGrade=Math.max(maxGrade,Math.abs((p[i]!.y??0)-(p[i-1]!.y??0))/distance);}}assert(maxGrade<=.10001,'local transition gradient');
 for(const j of map.intersections)for(const c of j.connections){const r=map.roads.find(r=>r.id===c.roadId)!,p=roadPoints(r)[c.end==='start'?0:roadPoints(r).length-1]!,delta=Math.abs((p.y??0)-junctionSurfaceHeight(j,p));assert(delta<.005,'junction mouth vertical seam '+j.id+' '+delta);}
 const chain=new RoadEdgeChains(map);for(const r of ordinary){const p=roadPoints(r);for(const side of [roadEdges(r).left,roadEdges(r).right]){const edge=chain.edge(r,side);for(let i=0;i<p.length;i++)assert(Math.abs((edge[i]!.y??0)-(p[i]!.y??0))<1e-7,'edge follows road '+r.id);}}
 const crossings=cityUrbanElevationCrossings(map);for(const c of crossings){const a=sampleAt(roadPoints(map.roads.find(r=>r.id===c.a)!),c.da).point,b=sampleAt(roadPoints(map.roads.find(r=>r.id===c.b)!),c.db).point;assert(Math.abs((a.y??0)-(b.y??0))>=6.398,'local grade separation '+c.a+'/'+c.b);}
 // A ground/bridge projection is two separate surfaces, never a shared junction.
 const fixture=newCityMap(),road=(id:string,mode:CityRoad['elevationMode'],points:CityRoad['centerline'],elevation?:number):CityRoad=>({id,type:'urban_2lane',laneCount:2,laneWidth:3.5,travelDirection:'two-way',speedLimit:40,elevationMode:mode,elevation,centerline:points,structure:{piersEnabled:true}});
 fixture.roads=[road('ground','custom',[{x:-100,y:14.5,z:0},{x:100,y:14.5,z:0}]),road('bridge','elevated',[{x:0,z:-100},{x:0,z:100}],8),road('depressed','custom',[{x:200,y:-7,z:-100},{x:200,y:-7,z:100}])];
 const bridgeBefore=structuredClone(fixture.roads[1]),depressedBefore=structuredClone(fixture.roads[2]);repairCityMainGroundElevation(fixture);assert(same(fixture.roads[1],bridgeBefore)&&same(fixture.roads[2],depressedBefore)&&!fixture.intersections.length,'designed deck and depression preserved without inferred junction');
 const g=new CityGround(fixture,{editor:true});assert(Math.abs(g.sampleRoadSurface(0,0,{x:1,y:0},contact).height-contact)<1e-5,'ground contact beneath bridge');assert(Math.abs(g.sampleRoadSurface(0,0,{x:0,y:1},8).height-8)<1e-5,'upper deck independent contact');g.dispose();
 const terrain=cityGroundGeometry(map);assert(Math.abs(terrain.getAttribute('position').getY(0)-ground)<1e-7,'shared authoritative ground height');terrain.dispose();Object.values(materials).forEach(m=>m.dispose());
 return{roads:source.roads.length,junctions:source.intersections.length,changedOrdinaryRoads:changed,protectedRoadsUnchanged:protectedCount,randomGroundSamples:64,renderedGroundOffset:{min:minOffset,max:maxOffset},ordinaryMaxGrade:maxGrade,unconnectedCrossingsVerified:crossings.length,cases,signsAndLandscape:'unchanged',topology:'unchanged',groundBridgeContactFixture:'passed'};
}
