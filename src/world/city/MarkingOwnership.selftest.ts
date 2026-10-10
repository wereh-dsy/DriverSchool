import { Mesh } from 'three';
import { createSubject3Materials } from '../subject3/materials';
import { newCityMap, type CityRoad } from './CityMapData';
import { createRoad, createIntersection, connectRoad } from './MapAPI';
import { loadCityMap } from './CityMapLoader';
import { RoadBuilder } from './RoadBuilder';
import { IntersectionBuilder } from './IntersectionBuilder';
import { insideIntersectionMarkingFootprint, MarkingOwnership } from './MarkingOwnership';
import { expandPreset } from './presets/InfrastructurePresets';

export function runMarkingOwnershipSelfTest() {
  const assert=(ok:unknown,message:string)=>{if(!ok)throw new Error('City paint ownership: '+message);};
  const map=newCityMap(),j=createIntersection(map,{id:'junction',type:'cross_4lane',position:{x:0,z:0},rotation:0,signalized:true});
  for(const [port,x,z] of [['north',0,-150],['east',150,0],['south',0,150],['west',-150,0]] as const) {
    const r=createRoad(map,{id:port,type:'urban_4lane',styleId:'urban_street_4',centerline:[{x,z},{x:0,z:0}]});connectRoad(map,{roadId:r.id,end:'end'},{junctionId:j.id,port});
  }
  const normalized=loadCityMap(map),materials=createSubject3Materials(),roadBuilder=new RoadBuilder(materials,normalized),junctionBuilder=new IntersectionBuilder(normalized,materials);
  let paintVertices=0;
  const checkRoadPaint=(source:CityRoad,candidate:typeof normalized)=>{
    const root=new RoadBuilder(materials,candidate).build(source),ownership=new MarkingOwnership(candidate);
    root.traverse(o=>{
      if(!(o instanceof Mesh)||!o.userData.markingOwner)return;
      assert(o.userData.markingOwner!=='intersection','ordinary roads never emit approach paint');
      const positions=o.geometry.getAttribute('position');
      for(let i=0;i<positions.count;i++) {
        const p={x:positions.getX(i),y:positions.getY(i)-0.032,z:positions.getZ(i)};
        if(o.userData.markingOwner==='road') {
          assert(!candidate.intersections.some(j=>insideIntersectionMarkingFootprint(j,candidate,p)),'lane/edge paint clipped before conflict box');
          assert(ownership.ownerAt(p)?.kind!=='merge','road paint does not enter merge mask');
        }
        paintVertices++;
      }
    });root.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});
  };
  for(const r of normalized.roads)checkRoadPaint(r,normalized);
  const root=junctionBuilder.build(normalized.intersections[0]!);
  const stops=root.children.filter(o=>o.userData.markingRole==='stop line'),arrows=root.children.filter(o=>o.userData.markingRole==='arrow');
  assert(stops.length===4&&new Set(stops.map(o=>o.userData.approachPort)).size===4,'one stop line per incoming approach');
  assert(arrows.length===8&&new Set(arrows.map(o=>o.userData.approachPort+':'+o.userData.approachLane)).size===8,'one arrow per metadata lane');
  normalized.intersections[0]!.approaches={};
  const empty=junctionBuilder.build(normalized.intersections[0]!);assert(!empty.children.some(o=>o.userData.markingRole==='arrow'),'no metadata means no inferred arrows');
  const mergeMap={...newCityMap(),...expandPreset('urban_side_access')};for(const r of mergeMap.roads)checkRoadPaint(r,mergeMap);
  for(const group of [root,empty])group.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});Object.values(materials).forEach(m=>m.dispose());
  // Keep the shared builder exercised as well as the clipping plan.
  assert(roadBuilder.build(normalized.roads[0]!).children.length>0,'pavement remains after suppression');
  return {paintVertices,stopLines:stops.length,metadataArrows:arrows.length,intersectionAndMergeOwnership:'passed'};
}
