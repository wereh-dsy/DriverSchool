import type {CityRoad} from './CityMapData';
import {newCityMap} from './CityMapData';
import {loadCityMap} from './CityMapLoader';
import {validateMap} from './CityMapValidation';
import {buildCityRoadNetwork} from './CityRoadNetwork';
import {cityV5FrozenRoad} from './maps/CityMainV5Recipe';
import {signDecisionNodes} from './SignPlacementGenerator';
import {resolveSignContent} from './RoadSignData';
import {ROAD_SIGN_POST_Z,signDimensions,roadSignColliders} from './RoadSignTemplates';
import {RoadSignRenderer} from './RoadSignRenderer';
import {roadPoints,polylineLength,sampleAt,rotatePoint,roadEdges} from './geometry';
import {RoadClearance,barrierOffset} from './RoadClearance';
import {RoadEdgeChains,roadEdgeStrip} from './RoadEdgeChain';
import {barrierSections,roadStructureColliders} from './RoadInfrastructure';
import {junctionSurfaceContains, junctionSurfaceHeight} from './JunctionSurface';
import {RoadBuilder} from './RoadBuilder';
import {createSubject3Materials} from '../subject3/materials';
import {Mesh,InstancedMesh,Matrix4} from 'three';
import {cityMainCrossingIssues} from './CityMain.selftest';
import {matchesApprovedCityGeometry} from './maps/CityGeometryRepair.selftest';
const assert=(v:unknown,m:string)=>{if(!v)throw new Error('City V5: '+m);};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function runCityMainV5SelfTest(source:unknown,baseline:unknown) {
 const map=loadCityMap(source),old=loadCityMap(baseline),report=validateMap(map);assert(report.valid,'map schema '+JSON.stringify(report.errors));
 assert(map.roads.length>=450&&map.roads.length<=650,'road budget '+map.roads.length);
 const frozen=old.roads.filter(cityV5FrozenRoad);for(const r of frozen)assert(matchesApprovedCityGeometry(r,map.roads.find(a=>a.id===r.id)!,old.roads),'frozen or exact approved geometry '+r.id);
 const network=buildCityRoadNetwork(map),edges=new Map<string,Set<string>>();
 for(const n of network.connectivity)for(const id of n.incomingRoadIds){const e=edges.get(id)??new Set<string>();for(const o of n.outgoingRoadIds)if(o!==id)e.add(o);edges.set(id,e);}
 const reachable=(start:string)=>{const seen=new Set([start]),todo=[start];while(todo.length){for(const id of edges.get(todo.pop()!)??[]){if(!seen.has(id)){seen.add(id);todo.push(id);}}}return seen;};
 const newRoads=map.roads.filter(r=>r.id.startsWith('v5-'));
 const entry=map.roads.find(r=>r.roadNameId==='central-avenue')!,seen=reachable(entry.id);
 for(const r of newRoads)assert(seen.has(r.id),'new road reachable '+r.id);
 const newCrossings=cityMainCrossingIssues(map).filter(s=>s.includes('v5-'));assert(!newCrossings.length,'new street crossing clearance/connectivity '+JSON.stringify(newCrossings));
 for(const r of newRoads)for(const end of ['start','end'] as const)assert(map.intersections.some(j=>j.connections.some(c=>c.roadId===r.id&&c.end===end))||map.roadLinks!.some(l=>[l.from,l.to].some(e=>e.roadId===r.id&&e.end===end)),'no dangling new street '+r.id+':'+end);
 for(const name of ['west-avenue','new-city-avenue','east-avenue','ring-expressway','east-west-expressway','intercity-east-expressway'])assert(map.roads.some(r=>r.roadNameId===name&&seen.has(r.id)),'signed driving corridor '+name);
 const fresh=map.intersections.filter(j=>!old.intersections.some(a=>a.id===j.id));
 for(const j of fresh){assert(j.pavementFootprint&&j.markingFootprint?.kind==='polygon'&&same(j.pavementFootprint,j.markingFootprint.points),'one footprint '+j.id);for(const c of j.connections){const r=map.roads.find(r=>r.id===c.roadId)!,p=roadPoints(r)[c.end==='start'?0:roadPoints(r).length-1]!,delta=Math.abs((p.y??0)-junctionSurfaceHeight(j,p));assert(delta<.5,'junction mouth elevation '+j.id+' delta '+delta);}}
 const decisions=signDecisionNodes(map);let expressway=0,urban=0;
 for(const d of decisions){const signs=map.signs!.filter(s=>s.decisionIds?.includes(d.id));if(d.expressway){expressway++;assert(signs.some(s=>s.type==='EXPRESSWAY_ADVANCE')&&signs.some(s=>s.type==='EXPRESSWAY_DIVERGE'),'advance + diverge '+d.id);}else{urban++;assert(signs.length>0,'urban decision sign '+d.id);}}
 const clearance=new RoadClearance(map);
 for(const s of map.signs!){resolveSignContent(s,map.roadNames!);const road=map.roads.find(r=>r.id===s.roadId)!,p=roadPoints(road);let nearest=Infinity,bearing=0,y=0;
  for(let d=0;d<=polylineLength(p);d+=2){const a=sampleAt(p,d),gap=Math.hypot(s.position.x-a.point.x,s.position.z-a.point.z);if(gap<nearest){nearest=gap;bearing=Math.atan2(-a.tangent.x,-a.tangent.z)+(s.laneDirection==='reverse'?Math.PI:0);y=a.point.y??0;}}
  if(s.stationMetres!==undefined){const a=sampleAt(p,s.stationMetres);bearing=Math.atan2(-a.tangent.x,-a.tangent.z)+(s.laneDirection==='reverse'?Math.PI:0);y=a.point.y??0;}
  assert(Math.abs(Math.atan2(Math.sin(s.heading-bearing),Math.cos(s.heading-bearing)))<.001,'sign faces traffic '+s.id);
  assert(Math.abs((s.position.y??0)-y)<.3,'sign height follows road '+s.id);
  assert(['gantry','highway-gantry','ceiling'].includes(s.template),'all guide boards overhead '+s.id);
  const anchor=sampleAt(p,s.stationMetres!).point;assert(Math.hypot(anchor.x-s.position.x,anchor.z-s.position.z)<1e-6,'guide board centred on road '+s.id);
  const dims=signDimensions(s.template,s.size,s.postOffset,s.gantryPosts,s.mountHeight);assert(dims.bottom>=4.5,'overhead board clearance '+s.id);for(const x of dims.posts){const q=rotatePoint({x,z:ROAD_SIGN_POST_Z},s.heading),a={x:s.position.x+q.x,z:s.position.z+q.z};assert(!clearance.roadAt(a,.44,(s.postBaseY??s.position.y??0)-.3,(s.position.y??0)+dims.poleTop,undefined,undefined,true)&&!clearance.roadAt(a,.3,s.postBaseY??s.position.y??0,(s.position.y??0)+dims.poleTop,s.roadId),'sign post excludes traffic and other decks '+s.id);}
  if(s.postBaseY!==undefined){assert(s.postBaseY===0,'ground foundation '+s.id);assert(roadSignColliders(s)[0]!.minHeight===0,'matching post foundation collision '+s.id);}
 }
 const supported=map.signs!.find(s=>s.postBaseY===0)!;assert(supported,'ground-supported elevated roadside sign');
 const signRenderer=new RoadSignRenderer(map.roadNames!,()=>null),signGroup=signRenderer.buildInstances([{...supported,position:{x:0,y:8,z:0},heading:0}]);
 for(const object of signGroup.children){const m=object as InstancedMesh,g=m.geometry;g.computeBoundingBox();if(g.boundingBox!.max.y-g.boundingBox!.min.y>8){const pose=new Matrix4();m.getMatrixAt(0,pose);const b=g.boundingBox!.clone().applyMatrix4(pose);assert(Math.abs(b.min.y)<1e-6&&b.max.z<.101,'post reaches ground behind readable face');}}
 signRenderer.dispose();
 const chain=new RoadEdgeChains(map);let joinedSeams=0,anchoredSamples=0;
 for(const corridor of chain.corridors)if(corridor.roadIds.length>1){joinedSeams+=corridor.roadIds.length-1;}
 for(const r of map.roads){const p=roadPoints(r);for(const side of [-1,1]){const edge=chain.edge(r,barrierOffset(r,side));for(let i=0;i<edge.length;i++){assert(Math.abs((edge[i]!.y??0)-(p[i]!.y??0))<1e-6,'actual deck anchoring '+r.id);anchoredSamples++;}}}
 const corridorFor=new Map(chain.corridors.flatMap(c=>c.roadIds.map(id=>[id,c.id] as const)));let verifiedSeams=0;
 for(const link of map.roadLinks!){if(corridorFor.get(link.from.roadId)!==corridorFor.get(link.to.roadId))continue;const a=map.roads.find(r=>r.id===link.from.roadId)!,b=map.roads.find(r=>r.id===link.to.roadId)!;for(const side of [-1,1])for(const barrier of [false,true]){const otherSide=link.from.end===link.to.end?-side:side,ea=barrier?chain.barrierEdge(a,side):chain.edge(a,side<0?roadEdges(a).left:roadEdges(a).right),eb=barrier?chain.barrierEdge(b,otherSide):chain.edge(b,otherSide<0?roadEdges(b).left:roadEdges(b).right),p=ea[link.from.end==='start'?0:ea.length-1]!,q=eb[link.to.end==='start'?0:eb.length-1]!;assert(Math.hypot(p.x-q.x,p.z-q.z, (p.y??0)-(q.y??0))<1e-6,'actual continuous edge seam '+link.id);verifiedSeams++;}}
 // Regression: two graded, curved bridge sections share exact rail and curb ends.
 const fixture=newCityMap();const a:CityRoad={id:'a',type:'highway',laneCount:6,laneWidth:3.5,travelDirection:'forward',speedLimit:80,elevationMode:'custom',structure:{barrierEnabled:true},centerline:[{x:0,y:6,z:100},{x:0,y:8,z:0}]};
 const b:CityRoad={...structuredClone(a),id:'b',centerline:[{x:0,y:8,z:0},{x:3,y:10,z:-100}]};fixture.roads.push(a,b);fixture.roadLinks!.push({id:'link',from:{roadId:'a',end:'end'},to:{roadId:'b',end:'start'}});
 const fc=new RoadEdgeChains(fixture);for(const offset of [-10.5,10.5]){assert(same(fc.edge(a,offset).at(-1),fc.edge(b,offset)[0]),'shared exact curb/rail seam');}
 const railsA=barrierSections(a,fixture),railsB=barrierSections(b,fixture);assert(railsA.length===2&&railsB.length===2,'continuous bridge rails');for(const side of [-1,1])assert(same(railsA.find(s=>s.side===side)!.points.at(-1),railsB.find(s=>s.side===side)!.points[0]),'no end-trim gap');
 const strip=roadEdgeStrip(a,fixture,roadEdges(a).left,roadEdges(a).right,.17);assert(strip.getAttribute('normal').getY(0)>.9,'upward curb/pavement faces');strip.dispose();assert(roadStructureColliders(a,fixture).length>0,'matching physical barriers');
 // Actual new junctions: curbs/pavement are clipped by the same boundary and
 // generated barriers do not cross the same-height authoritative footprint.
 const materials=createSubject3Materials(),builder=new RoadBuilder(materials,map);let triangles=0;
 for(const r of newRoads){const root=builder.build(r),js=fresh.filter(j=>j.connections.some(c=>c.roadId===r.id));root.traverse(o=>{if(!(o instanceof Mesh))return;if(['road curb','road pavement','road sidewalk'].includes(o.name)){const p=o.geometry.getAttribute('position'),index=o.geometry.index,offset=o.name==='road curb'?.17:o.name==='road pavement'?.024:.15;for(let i=0;i<(index?.count??p.count);i+=3){let x=0,y=0,z=0;for(let k=0;k<3;k++){const n=index?index.getX(i+k):i+k;x+=p.getX(n)/3;y+=p.getY(n)/3;z+=p.getZ(n)/3;}for(const j of js)if(Math.abs(y-offset-junctionSurfaceHeight(j,{x,z}))<.2)assert(!junctionSurfaceContains(j,map,{x,z},-.001),'junction surface/curb suppression '+r.id);triangles++;}}o.geometry.dispose();});}
 Object.values(materials).forEach(m=>m.dispose());
 return{roads:{before:old.roads.length,after:map.roads.length,newStreetSegments:newRoads.length,frozen:frozen.length},junctions:fresh.length,signs:{locations:map.signs!.length,expresswayDecisions:expressway,urbanDecisions:urban,coverage:'100% requirements'},edges:{corridors:chain.corridors.length,continuedSeams:joinedSeams,verifiedEdgeSeams:verifiedSeams,anchoredSamples,fixture:'graded curved bridge: exact shared rail/curb endpoints'},junctionTriangles:triangles};
}
