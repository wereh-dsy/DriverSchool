import type { CityMapData,CityPoint,CityRoad } from '../CityMapData';
import { createRoad,connectRoads } from '../MapAPI';
import { point3 } from '../coordinates';
import { roadPoints,polylineLength,sampleAt } from '../geometry';
import { ease,bezierPoints } from '../presets/BackbonePresets';
import { crossingDistance } from '../presets/CompactInterchangePresets';
import { connectUrbanSkeleton,trimCityJunctionApproaches } from './CityMainUrbanConnections';
import { populateIntersectionMarkingMetadata } from '../MarkingOwnership';

const ordinary=(r:CityRoad)=>!['expressway','motorway'].includes(r.district??'')&&!r.gore;
const line=(a:CityPoint,b:CityPoint)=>{const n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/5);return Array.from({length:n+1},(_,i)=>point3(a.x+(b.x-a.x)*i/n,0,a.z+(b.z-a.z)*i/n));};
/** Phase 3: a rounded, offset ordinary boulevard, joined to the retained arterial network. */
export function addCityMainV3UrbanAxes(map:CityMapData):void {
  for(const r of map.roads)if(r.id.startsWith('urban-west-ns')||r.id.startsWith('urban-north-arterial')){r.laneCount=4;r.type='urban_4lane';r.styleId='urban_street_4';r.speedLimit=50;}
  trimCityJunctionApproaches(map);
  const corners=[point3(-1450,0,-850),point3(1120,0,-830),point3(1180,0,500),point3(-1400,0,380)],trim=130,paths:CityPoint[][]=[];
  const before:CityPoint[]=[],after:CityPoint[]=[];
  for(let i=0;i<corners.length;i++) {
    const p=corners[i]!,a=corners[(i+3)%4]!,b=corners[(i+1)%4]!;
    const la=Math.hypot(a.x-p.x,a.z-p.z),lb=Math.hypot(b.x-p.x,b.z-p.z);
    before.push(point3(p.x+(a.x-p.x)*trim/la,0,p.z+(a.z-p.z)*trim/la));after.push(point3(p.x+(b.x-p.x)*trim/lb,0,p.z+(b.z-p.z)*trim/lb));
  }
  for(let i=0;i<4;i++) {
    const p=corners[i]!,a=before[i]!,b=after[i]!;
    paths.push(bezierPoints(a,point3(a.x+(p.x-a.x)*0.552,0,a.z+(p.z-a.z)*0.552),point3(b.x+(p.x-b.x)*0.552,0,b.z+(p.z-b.z)*0.552),b));
    paths.push(line(b,before[(i+1)%4]!));
  }
  const existing=map.roads.filter(ordinary),newRoads:CityRoad[]=[];
  const complete=paths.flatMap((p,i)=>i?p.slice(1):p),totalLength=polylineLength(complete);
  const base=(p:CityPoint)=>p.z<-650?8*ease((380-Math.abs(p.x))/240):0;
  const crossings=existing.flatMap(r=>crossingDistance(complete,roadPoints(r)).map(d=>{const p=sampleAt(complete,d).point,other=roadPoints(r);let best=Infinity,y=0;
    for(let j=1;j<other.length;j++){const a=other[j-1]!,b=other[j]!,dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz))),gap=Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);if(gap<best){best=gap;y=(a.y??0)+t*((b.y??0)-(a.y??0));}}
    return {d,y,base:base(p)};})).filter(c=>Math.abs(c.y-c.base)<5.6);
  let startDistance=0;
  for(let i=0;i<paths.length;i++) {
    const path=paths[i]!,length=polylineLength(path);
    // The north arc crosses the ground N-S expressway on a short ordinary bridge.
    let d=0;
    for(let j=0;j<path.length;j++){if(j)d+=Math.hypot(path[j]!.x-path[j-1]!.x,path[j]!.z-path[j-1]!.z);let y=base(path[j]!);for(const c of crossings){const gap=Math.abs(startDistance+d-c.d),weight=1-ease((Math.min(gap,totalLength-gap)-30)/110);if(weight>0)y=y+(c.y-c.base)*weight;}path[j]!.y=y;}
    startDistance+=length;
    const r=createRoad(map,{id:'inner-boulevard-'+i,groupId:'inner-boulevard',centerline:path,type:i===5?'urban_6lane':'urban_4lane',laneCount:i===5?6:4,laneWidth:3.75,speedLimit:50,travelDirection:'two-way',elevationMode:'custom',styleId:i===5?'urban_boulevard_6':'urban_street_4',district:'central',streetlights:false,structure:{barrierEnabled:false,piersEnabled:true,pierSpacing:50}});newRoads.push(r);
  }
  newRoads.forEach((r,i)=>connectRoads(map,{roadId:r.id,end:'end'},{roadId:newRoads[(i+1)%newRoads.length]!.id,end:'start'}));
  connectUrbanSkeleton(map,[...existing,...newRoads]);
  trimCityJunctionApproaches(map);
  for(const j of map.intersections)delete j.approaches;populateIntersectionMarkingMetadata(map);
  map.environment.metadata!.innerBoulevardLengthMetres=totalLength.toFixed(1);
  map.environment.metadata!.innerBoulevardExtent='2630 x 1350 m; rounded and skewed; ordinary 2+2 with southern 3+3';
}

/** Phase 4: short collectors complete selected blocks without regenerating the V2 street network. */
export function addCityMainV3Collectors(map:CityMapData):void {
  const retained=map.roads.filter(ordinary),paths:{id:string;district:string;points:[number,number][]}[]=[
    {id:'v3-west-block',district:'west',points:[[-1450,450],[-1500,190],[-1330,260]]},
    {id:'v3-central-collector',district:'central',points:[[-450,360],[-450,540],[-700,580]]},
    {id:'v3-north-collector',district:'north',points:[[800,-750],[800,-1000],[1000,-1000],[1000,-750]]},
    {id:'v3-east-collector',district:'east',points:[[875,700],[1010,750],[1010,868]]},
    {id:'v3-south-service',district:'south',points:[[700,1370],[500,1300],[500,1200]]},
  ];
  const added=paths.map(p=>createRoad(map,{id:p.id,centerline:p.points.flatMap((q,i)=>i?line(point3(...[p.points[i-1]![0],0,p.points[i-1]![1]] as [number,number,number]),point3(q[0],0,q[1])).slice(1):[point3(q[0],0,q[1])]),type:'urban_2lane',styleId:'urban_local_2',laneCount:2,laneWidth:3.75,speedLimit:30,travelDirection:'two-way',district:p.district,elevationMode:'custom',streetlights:false}));
  connectUrbanSkeleton(map,[...retained,...added]);
  trimCityJunctionApproaches(map);
  for(const j of map.intersections)delete j.approaches;populateIntersectionMarkingMetadata(map);
}
