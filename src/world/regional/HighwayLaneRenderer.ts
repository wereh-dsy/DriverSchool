import { Group } from 'three';
import type { CityMapData, CityPoint, CityRoad } from '../city/CityMapData';
import { polylineLength, sampleAt } from '../city/geometry';
import { makeMarkingRibbon } from '../subject3/geometry';
import type { Subject3Materials } from '../subject3/materials';

/** Topology-owned markings for the added, physically drivable auxiliary lanes. */
export function buildHighwayLaneMarkings(road: CityRoad, map: CityMapData, materials: Subject3Materials): Group {
  const root = new Group(), transition = road.highwayTransition!;
  const length = polylineLength(road.centerline), off = transition.kind === 'deceleration', half = road.laneWidth / 2;
  const at = (distance: number, offset = 0): CityPoint => { const s = sampleAt(road.centerline, distance); return { x: s.point.x - s.tangent.z * offset, y: s.point.y, z: s.point.z + s.tangent.x * offset }; };
  const paint = (name: string, points: CityPoint[], width = .18) => { const mesh = makeMarkingRibbon(name, points, width, materials.whitePaint, () => 0, .034); if(mesh){mesh.userData.markingSource=road.id;mesh.userData.markingOwner='merge';root.add(mesh);} };
  // Dashed access permits entering the auxiliary lane; the final nose is solid.
  const taper=transition.taperMetres,edgeStart=off?taper*.55:0,edgeEnd=off?length:length-taper*.55;
  const solidStart=Math.max(taper*.55,length-80),dashEnd=off?solidStart:length-taper*.3;
  for(let d=off?taper*.55:0;d<dashEnd;d+=9)paint(off?'deceleration dashed entry':'acceleration dashed merge',[at(d,-half+.15),at(Math.min(dashEnd,d+3),-half+.15)]);
  if(off)for(let d=solidStart;d<length;d+=8)paint('deceleration solid taper',[at(d,-half+.15),at(Math.min(length,d+8),-half+.15)]);
  for(let d=edgeStart;d<edgeEnd;d+=12)paint('auxiliary edge',[at(d,half-.15),at(Math.min(edgeEnd,d+12),half-.15)]);
  paintGore(map.roads.find(r=>r.id===transition.decisionId)!,map,map.roads.find(r=>r.id===transition.mainRoadId)!,off,paint);
  // Mainline arrows share the highway decision, rather than arbitrary world positions.
  const main=map.roads.find(r=>r.id===transition.mainRoadId)!;
  const mainLength=polylineLength(main.centerline);
  for(const distance of off?[Math.min(85,mainLength*.65)]:[])for(let lane=0;lane<main.laneCount;lane++){
    const s=sampleAt(main.centerline,off?Math.max(0,mainLength-distance):distance),offset=(lane+.5-main.laneCount/2)*main.laneWidth;
    const local=(x:number,z:number):CityPoint=>({x:s.point.x-s.tangent.z*(offset+x)+s.tangent.x*z,y:s.point.y,z:s.point.z+s.tangent.x*(offset+x)+s.tangent.z*z});
    const turn=off&&lane===main.laneCount-1;
    paint(turn?'lane arrow exit':'lane arrow straight',[local(0,-5),local(0,1),local(turn?1.2:0,4)],.28);
    paint('lane arrow head',[local(turn?.1:-1.1,2.5),local(turn?1.2:0,4),local(turn?1.5:1.1,2.5)],.28);
  }
  return root;
}

type Paint=(name:string,points:CityPoint[],width?:number)=>void;
function paintGore(decision:CityRoad,map:CityMapData,owner:CityRoad,off:boolean,paint:Paint):void {
  // Hatch the actual unpaved wedge between mainline and ramp edges. Never draw
  // an invented triangle inside the drivable auxiliary lane.
  const rampLength=polylineLength(decision.centerline);
  const mainlines=map.roads.filter(r=>r.type==='highway'&&r.roadNameId===owner.roadNameId);
  const wedge:{a:CityPoint;b:CityPoint}[]=[];
  for(let station=6;station<=Math.min(125,rampLength*.4);station+=6){
    const frame=sampleAt(decision.centerline,off?station:rampLength-station),rampEdge={x:frame.point.x+frame.tangent.z*(decision.laneWidth/2+.3),y:frame.point.y,z:frame.point.z-frame.tangent.x*(decision.laneWidth/2+.3)};
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
    paint('gore triangle outline',[...wedge.map(v=>v.a),...wedge.map(v=>v.b).reverse(),wedge[0]!.a],.22);
    for(let i=0;i<wedge.length-1;i++)paint('gore triangle hatch',[wedge[i]!.a,wedge[i+1]!.b],.32);
  }
}

/** Direct mouths without auxiliary lanes use the same bounded island rule. */
export function buildHighwayGoreMarkings(decision:CityRoad,map:CityMapData,materials:Subject3Materials):Group {
  const root=new Group();
  const paint:Paint=(name,points,width=.22)=>{const mesh=makeMarkingRibbon(name,points,width,materials.whitePaint,()=>0,.034);if(mesh){mesh.userData.markingSource=decision.id;mesh.userData.markingOwner='merge';root.add(mesh);}};
  for(const off of [true,false]){
    if(!(off?decision.gore?.start:decision.gore?.end))continue;
    if(map.roads.some(r=>r.highwayTransition?.decisionId===decision.id&&r.highwayTransition.kind===(off?'deceleration':'acceleration')))continue;
    const link=map.roadLinks!.find(l=>off?l.to.roadId===decision.id&&l.to.end==='start':l.from.roadId===decision.id&&l.from.end==='end');
    const owner=link&&map.roads.find(r=>r.id===(off?link.from:link.to).roadId);
    if(owner?.type==='highway')paintGore(decision,map,owner,off,paint);
  }
  return root;
}
