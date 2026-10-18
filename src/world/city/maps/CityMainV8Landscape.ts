import type {CityMapData,CityObject,CityPoint} from '../CityMapData';
import {cityTerrainOffsetAt} from '../CityTerrain';
import {RoadClearance} from '../RoadClearance';
import {polylineLength,sampleAt} from '../geometry';

/** Gentle suburban relief, outside the dense core and mainline approach landings. */
export function terrainV8(map:CityMapData):void{
 map.environment.landforms=[
  {id:'chunhui-low-ridge',center:{x:3130,y:0,z:230},radiusX:390,radiusZ:350,height:2.2},
  {id:'campus-low-ridge',center:{x:480,y:0,z:-2780},radiusX:400,radiusZ:390,height:1.8},
  {id:'nancheng-low-ridge',center:{x:-1150,y:0,z:2800},radiusX:370,radiusZ:350,height:1.6},
  {id:'chunhui-pond',center:{x:2930,y:0,z:50},radiusX:100,radiusZ:70,height:-1.8},
  {id:'campus-pond',center:{x:520,y:0,z:-3150},radiusX:120,radiusZ:68,height:-1.8},
  {id:'nancheng-pond',center:{x:-800,y:0,z:2800},radiusX:90,radiusZ:65,height:-1.8},
 ];
 const offset=(p:CityPoint)=>cityTerrainOffsetAt(map.environment.landforms,p.x,p.z);
 for(const r of map.roads.filter(r=>!r.id.startsWith('regional:')&&r.travelDirection==='two-way'&&r.type!=='highway'&&!r.structure?.enclosure)){
  for(const p of r.centerline)p.y=(p.y??0)+offset(p);r.elevationMode='custom';delete r.elevation;
 }
 for(const j of map.intersections.filter(j=>!j.id.startsWith('regional:')))j.position.y=(j.position.y??0)+offset(j.position);
}

/** Visibility-focused planting: keep ground streets rich, remove hidden fast-road trees. */
export function landscapeV8(map:CityMapData):void{
 const offset=(p:CityPoint)=>cityTerrainOffsetAt(map.environment.landforms,p.x,p.z);
 for(const o of map.objects.filter(o=>!o.id.startsWith('regional:')))o.position.y=(o.position.y??0)+offset(o.position);
 const ground=map.roads.filter(r=>r.travelDirection==='two-way'&&r.type!=='highway'&&!r.structure?.enclosure),fast=map.roads.filter(r=>r.type==='highway'||r.laneCount===3);
 const index=(roads:typeof ground)=>{const cells=new Map<string,{a:CityPoint;b:CityPoint}[]>();for(const r of roads)for(let i=1;i<r.centerline.length;i++){const a=r.centerline[i-1]!,b=r.centerline[i]!;for(let x=Math.floor((Math.min(a.x,b.x)-200)/200);x<=Math.floor((Math.max(a.x,b.x)+200)/200);x++)for(let z=Math.floor((Math.min(a.z,b.z)-200)/200);z<=Math.floor((Math.max(a.z,b.z)+200)/200);z++){const k=x+','+z,c=cells.get(k)??[];c.push({a,b});cells.set(k,c);}}return cells;};
 const groundIndex=index(ground),fastIndex=index(fast);
 const near=(p:CityPoint,cells:ReturnType<typeof index>)=>{let distance=Infinity,height=0;for(const {a,b}of cells.get(Math.floor(p.x/200)+','+Math.floor(p.z/200))??[]){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz))),d=Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);if(d<distance){distance=d;height=(a.y??0)+((b.y??0)-(a.y??0))*t;}}return{distance,height};};
 const removed:string[]=[];
 map.objects=map.objects.filter(o=>{
  if(o.prefabId!=='tree')return true;
  const f=near(o.position,fastIndex);if(f.distance>135)return true;
  const g=near(o.position,groundIndex),top=(o.position.y??0)+6.8*(o.scale?.y??1);
  if(g.distance>150&&top<f.height+.2){removed.push(o.id);return false;}return true;
 });
 const clearance=new RoadClearance(map),buildings=map.objects.filter(o=>['residential_low','residential_mid','office','commercial','industrial','school','stadium'].includes(o.prefabId));
 let planted=0,lamps=0;
 const place=(o:CityObject)=>{
  const y=o.position.y??0;if(clearance.roadAt(o.position,2,y-.1,y+8,undefined,undefined,true)||clearance.junctionAt(o.position,2,y-.1,y+8)||buildings.some(b=>Math.hypot(b.position.x-o.position.x,b.position.z-o.position.z)<Math.max(20*(b.scale?.x??1),18*(b.scale?.z??1))))return;
  if(map.environment.landforms!.some(f=>f.height<0&&((o.position.x-f.center.x)/f.radiusX)**2+((o.position.z-f.center.z)/f.radiusZ)**2<.85))return;
  map.objects.push(o);if(o.prefabId==='tree')planted++;else lamps++;
 };
 for(const r of ground.filter(r=>r.groupId==='v8-streets'||r.id.startsWith('v8-ew-frontage')||r.id.startsWith('v8-ns-frontage'))){
  const L=polylineLength(r.centerline);for(let d=38;d<L-35;d+=r.laneCount>=4?52:78){const f=sampleAt(r.centerline,d),right={x:-f.tangent.z,z:f.tangent.x},half=r.laneCount*r.laneWidth/2+(r.sidewalk?.width??0)+4;
   if((f.point.y??0)>3.5)continue;
   for(const side of [-1,1]){const p={x:f.point.x+right.x*half*side,y:0,z:f.point.z+right.z*half*side};p.y=offset(p);place({id:`v8-verge-${r.id}-${Math.round(d)}-${side}`,prefabId:'tree',position:p,rotation:0,scale:{x:.8,y:.85+(Math.round(d)%3)*.08,z:.8},district:r.district,groupId:'v8-visible-landscape'});}
   if(Math.round(d/52)%2===0){const p={x:f.point.x+right.x*(half-2),y:0,z:f.point.z+right.z*(half-2)};p.y=offset(p);place({id:`v8-lamp-${r.id}-${Math.round(d)}`,prefabId:'streetlight_small',position:p,rotation:Math.atan2(right.x,right.z),district:r.district,groupId:'v8-visible-landscape'});}
  }
 }
 for(const [id,name]of [['chunhui-pond','春晖小湖'],['campus-pond','知行塘'],['nancheng-pond','南湾塘']] as const){const f=map.environment.landforms!.find(f=>f.id===id)!;
  // Raised terrain around the southern/eastern ponds stays above the waterline.
  const local=map.environment.landforms!.filter(q=>q!==f),base=cityTerrainOffsetAt(local,f.center.x,f.center.z),level=base-.35;
  map.objects.push({id:'v8-water-'+id,prefabId:'water',position:{...f.center,y:level},rotation:0,scale:{x:f.radiusX*.76/10,y:1,z:f.radiusZ*.76/10},groupId:'v8-water-landscape'});
  map.environment.metadata={...map.environment.metadata,[id]:name};
 }
 map.environment.metadata={...map.environment.metadata,v8Landscape:JSON.stringify({removedHiddenTrees:removed.length,plantedVisibleTrees:planted,addedStreetlights:lamps,landforms:map.environment.landforms!.length})};
}
