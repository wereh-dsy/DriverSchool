import type { CityMapData, CityPoint, CityRoad } from '../CityMapData';
import { createRoad } from '../MapAPI';
import { roadPoints, polylineLength, sampleAt, syncConnections } from '../geometry';
import { connectUrbanSkeleton, trimCityJunctionApproaches } from './CityMainUrbanConnections';
import { setJunctionPavementFootprint } from '../JunctionSurface';


/** Later user steering explicitly prioritizes the mature V6 vertical layout. */
export function shapeV61Expressways(map:CityMapData):void {
  map.environment.metadata={...map.environment.metadata,v61Expressways:'Existing V6 mainline elevations, tunnel and mature system interchanges preserved by user request; local frontages and partial access only'};
}

export function cityV61Snap(map:CityMapData,p:CityPoint,match:(r:CityRoad)=>boolean):CityPoint {
  let best=Infinity,result:CityPoint|undefined;
  for(const r of map.roads.filter(match)) {
    const points=roadPoints(r),length=polylineLength(points);
    for(let d=22;d<length-22;d+=2) {
      const q=sampleAt(points,d).point;if(map.intersections.some(j=>Math.hypot(j.position.x-q.x,j.position.z-q.z)<45))continue;
      const gap=Math.hypot(p.x-q.x,p.z-q.z);if(gap<best){best=gap;result=q;}
    }
  }
  if(!result)throw new Error('V6.1 no ordinary street landing '+JSON.stringify(p));return {...result};
}
export function addV61Street(map:CityMapData,id:string,name:string,nodes:CityPoint[],lanes=4):CityRoad {
  const points:CityPoint[]=[];
  for(let i=1;i<nodes.length;i++){const a=nodes[i-1]!,b=nodes[i]!,n=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/4);for(let k=0;k<n;k++)points.push({x:a.x+(b.x-a.x)*k/n,y:(a.y??0)+((b.y??0)-(a.y??0))*k/n,z:a.z+(b.z-a.z)*k/n});}points.push({...nodes.at(-1)!});
  const r=createRoad(map,{id,type:lanes===2?'urban_2lane':'urban_4lane',centerline:points,laneCount:lanes,laneWidth:lanes===2?3.2:3.6,travelDirection:'two-way',speedLimit:lanes===2?30:45,elevationMode:'custom',sidewalk:{enabled:true,width:lanes===2?1.8:3},structure:{barrierEnabled:false,barrierOffset:0,piersEnabled:true,pierSpacing:45},streetlights:false});
  r.roadNameId=id;r.roadClass=lanes===2?'collector':'arterial';r.decorationProfile=lanes===2?'collector':'new-district';map.roadNames![id]={primaryText:name,kind:'urban'};return r;
}
const ground=(x:number,z:number):CityPoint=>({x,y:-.024,z});
export function connectV61Street(map:CityMapData,road:CityRoad):void {
  const family=map.roads.filter(r=>r.id===road.id||r.id.startsWith(road.id+'-split')),path=family.flatMap(roadPoints),minX=Math.min(...path.map(p=>p.x))-1,maxX=Math.max(...path.map(p=>p.x))+1,minZ=Math.min(...path.map(p=>p.z))-1,maxZ=Math.max(...path.map(p=>p.z))+1;
  const neighbours=map.roads.filter(r=>!family.includes(r)&&r.travelDirection==='two-way'&&!r.structure?.enclosure&&r.type!=='highway'&&r.centerline.some((p,i,a)=>i>0&&Math.max(p.x,a[i-1]!.x)>=minX&&Math.min(p.x,a[i-1]!.x)<=maxX&&Math.max(p.z,a[i-1]!.z)>=minZ&&Math.min(p.z,a[i-1]!.z)<=maxZ));
  connectUrbanSkeleton(map,[...family,...neighbours],.2);
}
export function addV61Frontages(map:CityMapData):void {
  const route=(id:string,name:string,pts:CityPoint[],lanes:number,from:(r:CityRoad)=>boolean,to:(r:CityRoad)=>boolean)=>{
    pts[0]=cityV61Snap(map,pts[0]!,from);pts[pts.length-1]=cityV61Snap(map,pts.at(-1)!,to);return addV61Street(map,id,name,pts,lanes);
  };
  const added:CityRoad[]=[];
  added.push(route('v61-ew-xixing-frontage','西兴高架南路',[ground(-1450,-75),ground(-1200,-75),ground(-1000,-70)],2,r=>r.roadNameId==='v5-west-lane',r=>r.roadNameId==='v5-west-east-road'));
  for(const [side,z] of [['north',-225],['south',-65]] as const) {
    added.push(route('v61-ew-core-west-'+side,side==='north'?'清和高架北路':'清和高架南路',[ground(-710,z),ground(-460,z),ground(-260,z)],4,r=>r.roadNameId==='v5-civic-west',r=>r.roadNameId==='v5-civic-block-road'));
    added.push(route('v61-ew-core-east-'+side,side==='north'?'锦城高架北路':'锦城高架南路',[ground(380,z),ground(500,z),ground(650,z)],4,r=>r.roadNameId==='v5-finance-road',r=>r.roadNameId==='new-city-avenue'));
  }
  added.push(route('v61-ew-chunhui-frontage','春晖高架南路',[ground(1035,-75),ground(1100,-65),ground(1540,-50)],4,r=>r.roadNameId==='v5-east-science',r=>r.roadNameId==='east-avenue'));
  for(const [side,x] of [['west',-165],['east',55]] as const)added.push(route('v61-ns-'+side,side==='west'?'清和快速辅路':'锦城快速辅路',[ground(x,350),ground(x,650),ground(x,1150)],2,r=>r.roadNameId==='central-avenue',r=>r.roadNameId==='south-avenue'));
  // Existing collector crossings are retained. The authored roads participate in
  // the same ordinary splitting/junction pipeline as V6, never mainline junctions.
  for(const road of added)connectV61Street(map,road);
  syncConnections(map);trimCityJunctionApproaches(map,false);for(const j of map.intersections)setJunctionPavementFootprint(j,map);
}
