import { roadFunction } from '../city/RoadClassification';
import { Group } from 'three';
import type { CityMapData, CityPoint, CityRoad } from '../city/CityMapData';
import { polylineLength, roadPoints, sampleAt } from '../city/geometry';
import { makeDirectionArrow, makeMarkingRibbon } from '../subject3/geometry';
import type { Subject3Materials } from '../subject3/materials';
import { runtimeRoadClearance } from '../city/RoadClearance';
import { roadEdgeChains } from '../city/RoadEdgeChain';

const pathBetween=(at:(d:number)=>CityPoint,start:number,end:number):CityPoint[]=>{
  const points:CityPoint[]=[];for(let d=start;d<end;d+=1.5)points.push(at(d));points.push(at(end));return points;
};

/** Topology-owned markings for the added, physically drivable auxiliary lanes. */
export function buildHighwayLaneMarkings(road: CityRoad, map: CityMapData, materials: Subject3Materials): Group {
  const root = new Group(), transition = road.highwayTransition!;
  const points=roadPoints(road),length = polylineLength(points), off = transition.kind === 'deceleration', half = road.laneWidth / 2;
  const main=map.roads.find(r=>r.id===transition.mainRoadId)!,chains=roadEdgeChains(map),mainIds=chains.continuations(main.id),clearance=runtimeRoadClearance(map);
  const mainPaths=map.roads.filter(r=>mainIds.has(r.id)).map(r=>({road:r,points:roadPoints(r)}));
  const at = (distance: number, offset = 0): CityPoint => { const s = sampleAt(points, distance); return { x: s.point.x - s.tangent.z * offset, y: s.point.y, z: s.point.z + s.tangent.x * offset }; };
  const paint:Paint = (name, points, width = .15) => { const mesh = makeMarkingRibbon(name, points, width, materials.whitePaint, () => 0, .008); if(mesh){mesh.userData.markingSource=road.id;mesh.userData.markingOwner='merge';root.add(mesh);} };
  // During the taper the auxiliary centreline overlaps the mainline. Its
  // separator follows the existing mainline edge, never cuts across through lanes.
  const inner=(distance:number):CityPoint=>{
    const p=at(distance,-half+.15);let best=Infinity,result=p;
    for(const {road:r,points} of mainPaths)for(let i=1;i<points.length;i++){
      const a=points[i-1]!,b=points[i]!,dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz);if(l<1e-6)continue;
      const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(l*l))),x=a.x+dx*t,z=a.z+dz*t,gap=Math.hypot(p.x-x,p.z-z),edge=r.laneCount*r.laneWidth/2-.15,y=(a.y??0)+t*((b.y??0)-(a.y??0));
      if(gap>=best||Math.abs(y-(p.y??0))>.2)continue;best=gap;
      if((-(p.x-x)*dz+(p.z-z)*dx)/l<edge)result={x:x-dz/l*edge,y,z:z+dx/l*edge};else result=p;
    }
    return result;
  };
  const opens=(distance:number)=>{const p=at(distance,half-.15);return !clearance.roadAt(p,.2,(p.y??0)-.2,(p.y??0)+.2,road.id,id=>mainIds.has(id),true);};
  const separator=(name:string,start:number,end:number,width:number)=>{
    let run:CityPoint[]=[];const flush=()=>{if(run.length>1)paint(name,run,width);run=[];};
    const steps=Math.max(1,Math.ceil((end-start)/1.5));
    for(let i=0;i<=steps;i++){
      const d=start+(end-start)*i/steps;
      if(opens(d))run.push(inner(d));else flush();
    }flush();
  };
  // Dashed access permits entering the auxiliary lane; the final nose is solid.
  const taper=Math.min(length,transition.taperMetres),solidStart=Math.max(taper*.55,length-80),solidEnd=off?0:Math.min(80,length-taper*.55);
  for(let d=off?0:solidEnd;d<(off?solidStart:length);d+=6)separator(off?'deceleration dashed entry':'acceleration dashed merge',d,Math.min(off?solidStart:length,d+3),.45);
  if(off)separator('deceleration solid taper',solidStart,length,.2);
  else separator('acceleration solid nose',0,solidEnd,.2);
  let outer:CityPoint[]=[];const flush=()=>{if(outer.length>1)paint('auxiliary edge',outer);outer=[];};
  for(const p of pathBetween(d=>at(d,half-.15),0,length)){
    if(clearance.roadAt(p,.2,(p.y??0)-.2,(p.y??0)+.2,road.id,undefined,true)||clearance.junctionAt(p,.2,(p.y??0)-.2,(p.y??0)+.2))flush();else outer.push(p);
  }flush();
  paintGore(map.roads.find(r=>r.id===transition.decisionId)!,map,map.roads.find(r=>r.id===transition.mainRoadId)!,off,paint);
  // Mainline arrows share the highway decision, rather than arbitrary world positions.
  const mainPoints=roadPoints(main),mainLength=polylineLength(mainPoints);
  const arrowFrame=sampleAt(mainPoints,mainLength-Math.min(85,mainLength*.65));
  // Nearby decisions can share a mainline station; emit one arrow set there.
  const ownsArrows=off&&!map.roads.some(r=>{
    const other=r.highwayTransition;
    if(r.id.localeCompare(road.id)>=0||other?.kind!=='deceleration'||!mainIds.has(other.mainRoadId))return false;
    const path=roadPoints(map.roads.find(m=>m.id===other.mainRoadId)!),length=polylineLength(path),q=sampleAt(path,length-Math.min(85,length*.65)).point;
    return Math.hypot(q.x-arrowFrame.point.x,q.z-arrowFrame.point.z)<12&&Math.abs((q.y??0)-(arrowFrame.point.y??0))<.2;
  });
  if(ownsArrows)for(let lane=0;lane<main.laneCount;lane++){
    const s=arrowFrame,offset=(lane+.5-main.laneCount/2)*main.laneWidth;
    const center={x:s.point.x-s.tangent.z*offset,z:s.point.z+s.tangent.x*offset};
    if(clearance.junctionAt({...center,y:s.point.y},5,(s.point.y??0)-.2,(s.point.y??0)+.2))continue;
    const turn=off&&lane===main.laneCount-1;
    const arrow=makeDirectionArrow('lane arrow head',center,Math.atan2(-s.tangent.x,-s.tangent.z),turn?'straight-right':'straight',8,2.4,materials.whitePaint,(x,z)=>(s.point.y??0)+(s.tangent.y??0)*((x-s.point.x)*s.tangent.x+(z-s.point.z)*s.tangent.z),.008);
    if(arrow){arrow.userData.markingSource=road.id;arrow.userData.markingOwner='merge';arrow.userData.markingRole='arrow';root.add(arrow);}
  }
  // Repeat an exit-only arrow inside the opened auxiliary lane, so the driver
  // can recognise the actual branch after reading the advance gantry.
  if(off)for(const distance of [Math.max(taper+20,length-125),length-35]){
    if(distance<12||distance>length-12)continue;
    const s=sampleAt(points,distance),e=at(distance,-half+.2);
    if(clearance.roadAt(e,.1,(e.y??0)-.2,(e.y??0)+.2,road.id,id=>mainIds.has(id),true)||clearance.junctionAt(s.point,5,(s.point.y??0)-.2,(s.point.y??0)+.2))continue;
    const arrow=makeDirectionArrow('auxiliary exit arrow',{x:s.point.x,z:s.point.z},Math.atan2(-s.tangent.x,-s.tangent.z),'straight',7,2.2,materials.whitePaint,(x,z)=>(s.point.y??0)+(s.tangent.y??0)*((x-s.point.x)*s.tangent.x+(z-s.point.z)*s.tangent.z),.008);
    if(arrow){arrow.userData.markingSource=road.id;arrow.userData.markingOwner='merge';arrow.userData.markingRole='arrow';root.add(arrow);}
  }
  return root;
}

type Paint=(name:string,points:CityPoint[],width?:number)=>void;
function paintGore(decision:CityRoad,map:CityMapData,owner:CityRoad,off:boolean,paint:Paint):void {
  // Hatch the shoulder wedge between mainline and ramp edges. Never draw
  // an invented triangle inside the drivable auxiliary lane.
  const decisionPoints=roadPoints(decision),rampLength=polylineLength(decisionPoints),ids=roadEdgeChains(map).continuations(owner.id),clearance=runtimeRoadClearance(map);
  const mainlines=map.roads.filter(r=>ids.has(r.id)||owner.roadNameId!==undefined&&roadFunction(r)==='expressway'&&r.roadNameId===owner.roadNameId).map(r=>({...r,centerline:roadPoints(r)}));
  const wedge:{a:CityPoint;b:CityPoint}[]=[];
  for(let station=6;station<=Math.min(125,rampLength*.4);station+=6){
    const frame=sampleAt(decisionPoints,off?station:rampLength-station),rampEdge={x:frame.point.x+frame.tangent.z*(decision.laneCount*decision.laneWidth/2+.3),y:frame.point.y,z:frame.point.z-frame.tangent.x*(decision.laneCount*decision.laneWidth/2+.3)};
    let best=Infinity,mainEdge:CityPoint|undefined;
    for(const main of mainlines)for(let i=1;i<main.centerline.length;i++){
      const a=main.centerline[i-1]!,b=main.centerline[i]!,dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz);if((dx*frame.tangent.x+dz*frame.tangent.z)/l<.65)continue;
      const t=Math.max(0,Math.min(1,((rampEdge.x-a.x)*dx+(rampEdge.z-a.z)*dz)/(l*l))),half=main.laneCount*main.laneWidth/2;
      const q={x:a.x+dx*t-dz/l*(half+.3),y:(a.y??0)+((b.y??0)-(a.y??0))*t,z:a.z+dz*t+dx/l*(half+.3)},distance=Math.hypot(q.x-rampEdge.x,q.z-rampEdge.z);
      if(distance<best){best=distance;mainEdge=q;}
    }
    if(mainEdge&&best>.6&&best<(owner.shoulders?.right??3)+(decision.shoulders?.left??1)&&Math.abs((mainEdge.y??0)-(rampEdge.y??0))<.6)wedge.push({a:mainEdge,b:rampEdge});
  }
  if(wedge.length>1){
    const safePaint=(name:string,path:CityPoint[],width:number)=>{
      let run:CityPoint[]=[];const flush=()=>{if(run.length>1)paint(name,run,width);run=[];};
      const length=polylineLength(path);
      for(const p of pathBetween(d=>sampleAt(path,d).point,0,length)){
        if(clearance.roadAt(p,width/2+.05,(p.y??0)-.2,(p.y??0)+.2,undefined,undefined,true)||clearance.junctionAt(p,width/2+.05,(p.y??0)-.2,(p.y??0)+.2))flush();else run.push(p);
      }flush();
    };
    safePaint('gore triangle outline',[...wedge.map(v=>v.a),...wedge.map(v=>v.b).reverse(),wedge[0]!.a],.2);
    for(let i=0;i<wedge.length-1;i++)safePaint('gore triangle hatch',[wedge[i]!.a,wedge[i+1]!.b],.45);
  }
}

/** Direct mouths without auxiliary lanes use the same bounded island rule. */
export function buildHighwayGoreMarkings(decision:CityRoad,map:CityMapData,materials:Subject3Materials):Group {
  const root=new Group();
  const paint:Paint=(name,points,width=.2)=>{const mesh=makeMarkingRibbon(name,points,width,materials.whitePaint,()=>0,.008);if(mesh){mesh.userData.markingSource=decision.id;mesh.userData.markingOwner='merge';root.add(mesh);}};
  for(const off of [true,false]){
    if(!(off?decision.gore?.start:decision.gore?.end))continue;
    if(map.roads.some(r=>r.highwayTransition?.decisionId===decision.id&&r.highwayTransition.kind===(off?'deceleration':'acceleration')))continue;
    const link=map.roadLinks!.find(l=>off?l.to.roadId===decision.id&&l.to.end==='start':l.from.roadId===decision.id&&l.from.end==='end');
    const owner=link&&map.roads.find(r=>r.id===(off?link.from:link.to).roadId);
    if(owner&&roadFunction(owner)==='expressway')paintGore(decision,map,owner,off,paint);
  }
  return root;
}
