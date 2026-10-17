import { Group, InstancedMesh, Matrix4, Raycaster, Vector3 } from 'three';
import { newCityMap, type CityMapData, type IntersectionPort } from './CityMapData';
import { CityTrafficSignals } from './CityTrafficSignals';
import { createSubject3Materials } from '../subject3/materials';
import { IntersectionBuilder } from './IntersectionBuilder';
import { Subject3TrafficSignals } from '../subject3/trafficSignals';
import { RoadClearance } from './RoadClearance';
import { portDirection, rotatePoint, junctionExtent } from './geometry';
import { SectorManager } from './SectorManager';
import { PrefabRegistry } from './PrefabRegistry';

const assert=(ok:unknown,message:string)=>{if(!ok)throw new Error('City signals: '+message);};
export function runCityTrafficSignalsSelfTest(actual:CityMapData) {
  const map=newCityMap(),ports:IntersectionPort[]=['north','east','south','west'];
  map.intersections=[{id:'test-junction',type:'cross_6lane',position:{x:0,y:0,z:0},rotation:0,signalized:true,signals:{profile:'lane-countdown',headHeight:7.2},connections:[],approaches:{}}];
  const j=map.intersections[0]!;
  for(const [i,port] of ports.entries()) {
    const angle=i*Math.PI/2,d={x:Math.sin(angle),z:-Math.cos(angle)},road={id:port,type:'urban_6lane' as const,centerline:[{x:d.x*100,y:0,z:d.z*100},{x:d.x*20,y:0,z:d.z*20}],laneCount:6,laneWidth:3.6,travelDirection:'two-way' as const,speedLimit:50};
    map.roads.push(road);j.connections.push({roadId:port,end:'end',port});j.approaches![port]={lanes:['left','straight','straight-right'],arrowDistance:30};
  }
  const signals=new CityTrafficSignals(map),materials=createSubject3Materials(),builder=new IntersectionBuilder(map,materials);
  const movement=(road:string,lane:number,m:string)=>signals.getLaneSignal(`${road}:lane:${lane+3}`)!.movements.find(x=>x.movement===m)!;
  assert(signals.getJunctionSignal(j.id)?.cycleSeconds===80,'fixed 80-second protected turn cycle');
  assert(movement('north',1,'straight').color==='green'&&movement('north',0,'left').color==='red','separate lane movements at initial green');
  assert(movement('east',1,'straight').secondsToGreen===40&&movement('north',0,'left').secondsToGreen===27,'exact per movement red countdown');
  let samples=0;
  for(let n=0;n<640;n++) {
    const state=signals.getJunctionSignal(j.id)!;
    const active=state.lanes.flatMap(l=>l.movements.filter(m=>m.color!=='red').map(m=>({axis:l.roadId==='north'||l.roadId==='south'?'NS':'EW',turn:m.movement==='left'?'left':'through'})));
    assert(new Set(active.map(a=>a.axis+':'+a.turn)).size<=1,'no conflicting through / protected left phases');
    for(const lane of state.lanes)for(const m of lane.movements)assert(m.secondsToChange>=0&&m.secondsToChange<=80&&m.permitted===(m.color==='green'),'exact nonnegative API timers and permission');
    if(n===176)assert(movement('north',1,'straight').color==='amber','amber after green');
    if(n===200)assert(state.lanes.every(l=>l.movements.every(m=>m.color==='red')),'all-red clearance');
    if(n===216)assert(movement('north',0,'left').color==='green'&&movement('north',1,'straight').color==='red','protected left phase');
    signals.update(.125);samples++;
  }
  const before=JSON.stringify(signals.getJunctionSignal(j.id));signals.update(NaN);signals.update(-1);assert(JSON.stringify(signals.getJunctionSignal(j.id))===before,'invalid delta cannot advance clock');
  const pavement=builder.build(j,signals,0);assert(signals.getHeadCount()===4,'one gantry per incoming approach');
  signals.root.updateMatrixWorld(true);
  const north=signals.root.children[0] as Group,arrow=north.children.find(o=>o.name==='Signal straight arrows') as InstancedMesh;
  const matrix=new Matrix4();arrow.getMatrixAt(0,matrix);const point=new Vector3().setFromMatrixPosition(matrix).applyMatrix4(north.matrixWorld);
  assert(Math.abs(point.x+5.4)<.31,'overhead head aligned above its actual lane '+JSON.stringify(point));
  const left=north.children.find(o=>o.name==='Signal left arrows') as InstancedMesh;left.geometry.computeBoundingBox();assert(left.geometry.boundingBox!.max.x>Math.abs(left.geometry.boundingBox!.min.x),'left arrow points left as viewed from the approaching vehicle');
  let readableApproaches=0;
  for(const head of signals.root.children as Group[]) {
    const facing=head.userData.signalFacing as {x:number;z:number},right=new Vector3(facing.z,0,-facing.x),digits=head.children.find(o=>o.name==='Signal countdown segments') as InstancedMesh;
    const at=(i:number)=>{digits.getMatrixAt(i,matrix);return new Vector3().setFromMatrixPosition(matrix).applyMatrix4(head.matrixWorld).dot(right);};
    assert(at(6)<at(13),'tens are viewer-left of ones on every approach');
    assert(at(1)>at(5)&&at(2)>at(4),'upper/lower right segments appear on viewer-right, not mirrored');
    const panels=head.userData.signalPanels as {laneId:string;movements:string[];x:number}[];
    assert(panels.length===3&&panels.some(p=>p.movements.join('-')==='straight-right'),'one combined through/right head per lane');
    const lens=head.children.find(o=>o.name==='Signal straight arrows') as InstancedMesh;lens.getMatrixAt(0,matrix);
    const target=new Vector3(0,.08,0).applyMatrix4(matrix).applyMatrix4(head.matrixWorld),eye=target.clone().add(new Vector3(facing.x*50,0,facing.z*50));eye.y=1.35;
    const ray=new Raycaster(eye,target.clone().sub(eye).normalize()),hit=ray.intersectObjects(head.children,false)[0];
    assert(hit?.object===lens,'visor does not cover the directional arrow from driver eye height');
    assert(head.userData.signalLowestHeight>=5.1,'over-lane head clearance');readableApproaches++;
  }
  const surviving=signals.root.children[1]!,owner=new Group();owner.add(north);let sharedDisposals=0;arrow.geometry.addEventListener('dispose',()=>sharedDisposals++);
  signals.removeHeadsForJunction(0,owner);assert(signals.getHeadCount()===3&&surviving.parent===signals.root&&sharedDisposals===0,'sector unload releases instances and preserves shared primitives');
  signals.update(1);assert(signals.getJunctionSignal(j.id)!.secondsInPhase===1,'logical clock survives visual unload');
  signals.removeHeadsForJunction(0);builder.build(j,signals,0);assert(signals.getHeadCount()===4&&signals.getJunctionSignal(j.id)!.secondsInPhase===1,'reload keeps the current phase');
  const basicMap=structuredClone(map);basicMap.intersections[0]!.signals={profile:'standard'};
  const basic=new CityTrafficSignals(basicMap),legacy=new Subject3TrafficSignals(1,[0],{greenSeconds:25,amberSeconds:3,allRedSeconds:2});
  for(let i=0;i<121;i++){assert(JSON.stringify(basic.getStateForJunction(0))===JSON.stringify(legacy.getStateForJunction(0)),'legacy circular signal timing unchanged');basic.update(.5);legacy.update(.5);}
  basic.dispose();legacy.dispose();signals.dispose();assert(sharedDisposals===1,'shared arrow disposed exactly once at final shutdown');
  const prefabs=new PrefabRegistry(materials),sectors=new SectorManager(map,materials,prefabs,{loadRadius:0});
  sectors.updatePosition(0,0);let sectorResourceDisposals=0;
  const sectorHead=sectors.signals.root.children[0] as Group;
  assert(!!sectorHead,'sector publishes advanced heads');
  const sharedArrow=sectorHead.children.find(o=>o.name==='Signal straight arrows') as InstancedMesh;
  sharedArrow.geometry.addEventListener('dispose',()=>sectorResourceDisposals++);
  sectors.dispose();prefabs.dispose();assert(sectorResourceDisposals===1,'sector owner releases shared signal resources on shutdown');
  pavement.traverse(o=>{if('geometry' in o)(o.geometry as {dispose():void}).dispose();});
  const actualSignals=new CityTrafficSignals(actual),clearance=new RoadClearance(actual);let poles=0,advanced=0;
  for(const [index,junction] of actual.intersections.entries())if(junction.signalized&&junction.signals?.profile) {
    if(junction.signals.profile==='lane-countdown')advanced++;
    for(const c of junction.connections) {
      const r=actual.roads.find(r=>r.id===c.roadId)!;if(r.travelDirection!=='two-way'&&(r.travelDirection==='forward')!==(c.end==='end'))continue;
      const d=rotatePoint(portDirection(junction,c.port),junction.rotation),right={x:d.z,z:-d.x},height=Math.max(7.2,junction.signals.headHeight??7.2),p=actualSignals.placePole(index,d,right,junctionExtent(junction,actual),r.laneCount*r.laneWidth,height),base=Math.min(0,junction.position.y??0);
      assert(!clearance.roadAt(p,.55,base-.2,(junction.position.y??0)+height+.5,undefined,undefined,true)&&!clearance.junctionAt(p,.55,base-.2,(junction.position.y??0)+height+.5),'every city signal pole clears all traffic layers');poles++;
    }
    for(const lane of actualSignals.getJunctionSignal(junction.id)!.lanes)assert(actual.roads.some(r=>r.id===lane.roadId&&lane.laneId.startsWith(r.id+':lane:')),'stable navigation lane identifiers');
  }
  actualSignals.dispose();Object.values(materials).forEach(m=>m.dispose());
  return {phaseSamples:samples,advancedJunctions:advanced,checkedPoles:poles,readableApproaches,streamingLifecycle:'passed',legacyTiming:'passed',navigationLaneAPI:'passed'};
}
