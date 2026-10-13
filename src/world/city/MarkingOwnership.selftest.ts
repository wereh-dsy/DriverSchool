import { Mesh } from 'three';
import { createSubject3Materials } from '../subject3/materials';
import { newCityMap, type CityRoad } from './CityMapData';
import { createRoad, createIntersection, connectRoad } from './MapAPI';
import { loadCityMap } from './CityMapLoader';
import { RoadBuilder } from './RoadBuilder';
import { IntersectionBuilder } from './IntersectionBuilder';
import { insideIntersectionMarkingFootprint, MarkingOwnership } from './MarkingOwnership';
import { expandPreset } from './presets/InfrastructurePresets';
import { buildHighwayLaneMarkings } from '../regional/HighwayLaneRenderer';

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
  const freeway=newCityMap();
  const main:CityRoad={id:'main',type:'highway',laneCount:3,laneWidth:3.75,travelDirection:'forward',speedLimit:100,elevationMode:'custom',centerline:[{x:0,y:0,z:300},{x:0,y:0,z:0}],shoulders:{left:1,right:3},structure:{barrierEnabled:false,piersEnabled:false}};
  const ramp:CityRoad={...main,id:'ramp',type:'ramp_1',laneCount:1,centerline:[{x:7.5,y:0,z:0},{x:70,y:0,z:-150}],shoulders:{left:1,right:2},gore:{start:true,end:false,length:120}};
  const auxiliary:CityRoad={...ramp,id:'auxiliary',gore:undefined,markings:true,centerline:Array.from({length:31},(_,i)=>{const t=Math.min(1,i*10/150),u=t*t*(3-2*t);return{x:u*7.5,y:0,z:300-i*10};}),highwayTransition:{kind:'deceleration',taperMetres:150,mainRoadId:main.id,decisionId:ramp.id}};
  freeway.roads=[main,ramp,auxiliary];freeway.roadLinks=[{id:'exit',from:{roadId:auxiliary.id,end:'end'},to:{roadId:ramp.id,end:'start'}}];
  const auxiliaryPaint=buildHighwayLaneMarkings(auxiliary,freeway,materials);let separatorVertices=0,outerVertices=0;
  auxiliaryPaint.traverse(o=>{
    if(!(o instanceof Mesh))return;const positions=o.geometry.getAttribute('position');
    if(o.name==='deceleration dashed entry'||o.name==='deceleration solid taper')for(let i=0;i<positions.count;i++){
      assert(positions.getX(i)>=3*3.75/2-.4,'taper separator cannot cut across mainline lanes');separatorVertices++;
      assert(Math.abs(positions.getY(i)-.032)<1e-6,'auxiliary paint shares ordinary road paint height');
    }
    if(o.name==='auxiliary edge')for(let i=0;i<positions.count;i++){assert(positions.getX(i)>3*3.75/2,'auxiliary outer edge only appears outside through lanes');outerVertices++;}
  });
  assert(separatorVertices>0&&outerVertices>0,'exit has both access separator and outer edge');
  const auxiliaryRoad=new RoadBuilder(materials,freeway).build(auxiliary);
  assert(!auxiliaryRoad.children.some(o=>o.name==='road paint'||o.name==='merge divider'),'auxiliary lane never receives a second generic marking pass');
  const duplicateMap=newCityMap();duplicateMap.roads=[{...main,id:'a'},{...main,id:'b'}];
  const duplicateRoad=new RoadBuilder(materials,duplicateMap).build(duplicateMap.roads[1]!);
  assert(!duplicateRoad.children.some(o=>o.userData.markingOwner),'coincident parallel paint belongs to one road');
  for(const group of [auxiliaryPaint,auxiliaryRoad,duplicateRoad])group.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});
  for(const group of [root,empty])group.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});Object.values(materials).forEach(m=>m.dispose());
  // Keep the shared builder exercised as well as the clipping plan.
  assert(roadBuilder.build(normalized.roads[0]!).children.length>0,'pavement remains after suppression');
  return {paintVertices,stopLines:stops.length,metadataArrows:arrows.length,separatorVertices,outerVertices,intersectionAndMergeOwnership:'passed',exitTaperAndDuplicatePaint:'passed'};
}
