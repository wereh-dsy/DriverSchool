import type {CityMapData,CityPoint,CityObject} from '../CityMapData';
import {ease} from '../presets/BackbonePresets';
import {rotatePoint,roadPoints,syncConnections} from '../geometry';
import {streetV8,snapV8,connectStreetV8,groundV8} from './CityMainV8Roads';
import {RoadClearance} from '../RoadClearance';
import {connectRoad} from '../MapAPI';
import {retireV8} from './CityMainV8Roads';
const interpolate=(v:number,knots:number[][])=>{for(let i=1;i<knots.length;i++){const a=knots[i-1]!,b=knots[i]!;if(v<=b[0]!)return a[1]!+(b[1]!-a[1]!)*Math.max(0,(v-a[0]!)/(b[0]!-a[0]!));}return v;};
/** A modest enlargement of existing blocks, with Regional boundary anchors fixed. */
export function enlargeCoreV8(map:CityMapData):void{
 const warp=(p:CityPoint):CityPoint=>{
  const fx=interpolate(p.x,[[-3000,-3000],[-2000,-2000],[-1600,-1740],[-1100,-1260],[-700,-800],[0,0],[800,1000],[1400,1600],[2450,2450],[4000,4000]]);
  const fz=interpolate(p.z,[[-3300,-3300],[-1900,-1900],[-1000,-1100],[-740,-900],[-140,-140],[700,960],[1450,1650],[2300,2300],[3500,3500]]);
  const w=1-ease((Math.abs(p.x)-1800)/650),port=250*ease((p.x-150)/350)*(1-ease((p.x-2000)/450))*ease((p.z-700)/600)*(1-ease((p.z-2700)/500));
  return {...p,x:p.x+(fx-p.x)*ease((Math.abs(p.x)-60)/100),z:p.z+(fz-p.z)*w+port};
 };
 for(const r of map.roads.filter(r=>!r.id.startsWith('regional:'))){
  const path=roadPoints(r),dense:CityPoint[]=[];for(const [i,p]of path.entries()){
   if(i){const a=path[i-1]!,n=Math.ceil(Math.hypot(p.x-a.x,p.z-a.z)/6);for(let k=1;k<n;k++)dense.push({x:a.x+(p.x-a.x)*k/n,y:(a.y??0)+((p.y??0)-(a.y??0))*k/n,z:a.z+(p.z-a.z)*k/n});}dense.push(p);
  }r.centerline=dense.map(warp);r.curve='polyline';
 }
 for(const j of map.intersections.filter(j=>!j.id.startsWith('regional:'))){const before={...j.position};j.position=warp(j.position);j.portAngles??={};for(const c of j.connections){const r=map.roads.find(r=>r.id===c.roadId)!,p=r.centerline[c.end==='start'?0:r.centerline.length-1]!;j.portAngles[c.port]=Math.atan2(p.x-j.position.x,-(p.z-j.position.z))+j.rotation;}void before;}
 for(const o of map.objects.filter(o=>!o.id.startsWith('regional:'))){const a=warp(o.position),d=rotatePoint({x:0,z:1},o.rotation),b=warp({...o.position,x:o.position.x+d.x,z:o.position.z+d.z});o.position=a;o.rotation=Math.atan2(b.x-a.x,b.z-a.z);if(['waterway','railway_track','green_strip'].includes(o.prefabId))o.scale={x:o.scale?.x??1,y:o.scale?.y??1,z:(o.scale?.z??1)*Math.hypot(b.x-a.x,b.z-a.z)};}
 for(const f of map.environment.corridors??[])f.centerline=f.centerline.map(warp);
 for(const l of map.environment.landmarks??[])l.position=warp(l.position);
 for(const s of map.environment.spawnPoints){const d=rotatePoint({x:0,z:1},s.rotation),a=warp(s.position),b=warp({...s.position,x:s.position.x+d.x,z:s.position.z+d.z});s.position=a;s.rotation=Math.atan2(b.x-a.x,b.z-a.z);}
 syncConnections(map);
}
export function nameCoreV8(map:CityMapData):void{
 const rename=(id:string,name:string,latin:string)=>map.roadNames![id]={...map.roadNames![id],primaryText:name,secondaryText:latin,kind:'urban'};
 rename('west-avenue','解放大街','Jiefang St.');rename('v5-west-east-road','人民大街','Renmin St.');rename('v5-civic-avenue','市府大街','Shifu St.');rename('v5-civic-block-road','政和街','Zhenghe St.');
 rename('central-avenue','中山大道','Zhongshan Ave.');rename('v61-zhongshan-road','中山大道','Zhongshan Ave.');
 for(const r of map.roads.filter(r=>r.roadNameId==='v61-zhongshan-road'))r.roadNameId='central-avenue';
 delete map.roadNames!['v61-zhongshan-road'];rename('v5-civic-south','锦城大道','Jincheng Ave.');rename('east-avenue','春晖大街','Chunhui St.');
 rename('v6-port-avenue','通港大道','Tonggang Ave.');rename('new-city-avenue','明远快速路','Mingyuan Expressway');
 map.roadNames!['new-city-avenue']!.kind='expressway';
}
/** Sparse, asymmetric additions. Existing cross streets provide the connections. */
export function districtStreetsV8(map:CityMapData):void{
 const add=(id:string,name:string,pts:CityPoint[],lanes:number,district:string)=>{const r=streetV8(map,id,name,pts,lanes,district);connectStreetV8(map,r);return r;};
 const link=(id:string,name:string,pts:CityPoint[],from:string,to:string,lanes:number,district:string)=>{pts[0]=snapV8(map,pts[0]!,from);pts[pts.length-1]=snapV8(map,pts.at(-1)!,to);return add(id,name,pts,lanes,district);};
 // The old town uses parallel geographic street names west of its station axis.
 link('v8-beijing-road','北京路',[groundV8(-1510,-1500),groundV8(-1870,-1250),groundV8(-1900,-450),groundV8(-1880,600),groundV8(-1800,1400),groundV8(-1510,1740)],'west-avenue','south-avenue',2,'xixing');
 link('v8-shanghai-road','上海路',[groundV8(-1630,-950),groundV8(-1680,-500),groundV8(-1660,400),groundV8(-1620,1280),groundV8(-1200,1660)],'north-avenue','south-avenue',2,'xixing');
 link('v8-nanjing-road','南京路',[groundV8(-1900,-550),groundV8(-1770,-550),groundV8(-1500,-550)],'v8-beijing-road','west-avenue',2,'xixing');
 link('v8-hankou-road','汉口路',[groundV8(-1880,740),groundV8(-1710,760),groundV8(-1490,800)],'v8-beijing-road','west-avenue',2,'xixing');
 // One extra north/south civic boundary spine, rather than another full grid.
 const oldAxis=-1001.25;
 add('v8-gongren-street','工人大街',[groundV8(oldAxis,-1490),groundV8(oldAxis,-700),groundV8(oldAxis,400),snapV8(map,groundV8(-1060,1000),'v5-civic-south')],4,'qinghe');
 // Reuse the existing curved northern collector as the central street spine.
 for(const r of map.roads.filter(r=>r.id.startsWith('v4-cbd-east-collector'))){r.roadNameId='central-street';r.roadClass='arterial';}
 // Continue Jincheng Avenue through existing junctions, avoiding parallel
 // cross streets forty metres apart on either side of the inner ring.
 const inner=map.intersections.find(j=>j.id==='urban-junction-27')!,oldPort=inner.connections.find(c=>c.roadId.startsWith('v4-access-12'))!.port,east=map.intersections.find(j=>j.id==='urban-junction-162')!;
 retireV8(map,r=>r.id.startsWith('v4-access-12'));
 inner.portAngles![oldPort]=Math.PI/2;east.type='cross_4lane';east.portAngles!.south=-Math.PI/2;
 for(const r of map.roads.filter(r=>r.id.startsWith('v6-residential-east'))){r.roadNameId='v5-civic-south';r.type='urban_4lane';r.laneCount=4;r.laneWidth=3.6;}
 const jincheng=streetV8(map,'v8-jincheng-east','锦城大道',[{...inner.position},{x:(inner.position.x+east.position.x)/2,y:inner.position.y,z:east.position.z},{...east.position}],4,'jincheng');jincheng.roadNameId='v5-civic-south';
 connectRoad(map,{roadId:jincheng.id,end:'start'},{junctionId:inner.id,port:oldPort});connectRoad(map,{roadId:jincheng.id,end:'end'},{junctionId:east.id,port:'south'});connectStreetV8(map,jincheng);
 // Chunhui: longer blocks and fewer through streets than the central districts.
 link('v8-newcity-three','新城三街',[groundV8(1780,-650),groundV8(2070,-620),groundV8(2750,-520),groundV8(3300,-430)],'east-avenue','v61-exhibition-road',2,'chunhui');
 link('v8-newcity-four','新城四街',[groundV8(1740,250),groundV8(2320,240),groundV8(2930,280),groundV8(3440,380)],'east-avenue','v61-exhibition-road',2,'chunhui');
 link('v8-newcity-five','新城五街',[groundV8(2740,-510),groundV8(2760,-160),groundV8(2820,260)],'v8-newcity-three','v8-newcity-four',2,'chunhui');
 link('v8-newcity-six','新城六街',[groundV8(2190,-600),groundV8(2250,-170),groundV8(2310,240)],'v8-newcity-three','v8-newcity-four',2,'chunhui');
 // Xinghu lake loop is a real closed drivable street with two district access points.
 const lake={x:-850,z:-1390},pts=Array.from({length:49},(_,i)=>{const t=i*Math.PI/24;return groundV8(lake.x+390*Math.cos(t),lake.z+210*Math.sin(t));});
 add('v8-xinghu-loop','星湖环路',pts.slice(0,25),2,'xinghu');
 add('v8-xinghu-loop-south','星湖环路',pts.slice(24),2,'xinghu');for(const r of map.roads.filter(r=>r.id.startsWith('v8-xinghu-loop-south')))r.roadNameId='v8-xinghu-loop';
 link('v8-lake-approach','湖滨路',[groundV8(-1220,-1390),groundV8(-1450,-1280)],'v8-xinghu-loop','west-avenue',2,'xinghu');
 link('v8-lake-east','星湖东路',[groundV8(-490,-1380),groundV8(-280,-1050)],'v8-xinghu-loop','north-avenue',2,'xinghu');
 link('v8-campus-avenue','大学城大道',[groundV8(700,-2620),groundV8(350,-2680),groundV8(-250,-2660),groundV8(-600,-2420)],'v61-university-north','v8-ns-frontage-north',4,'xinghu');
 link('v8-campus-south','致知路',[groundV8(810,-2220),groundV8(300,-2210),groundV8(-300,-2260),groundV8(-580,-2390)],'v61-university-north','v8-campus-avenue',2,'xinghu');
 link('v8-campus-north','格物路',[groundV8(960,-2920),groundV8(350,-3000),groundV8(-180,-2880),groundV8(-280,-2670)],'v61-university-north','v8-campus-avenue',2,'xinghu');
 // Southern industry is routed around large factory plots, without a rigid grid.
 link('v8-nancheng-ring','南城园区路',[groundV8(-1300,1810),groundV8(-1590,2250),groundV8(-1490,2720),groundV8(-830,2930),groundV8(-350,2680)],'south-avenue','industrial-avenue',2,'nancheng');
 link('v8-industrial-west','机修路',[groundV8(-1440,2550),groundV8(-1100,2490),groundV8(-760,2600)],'v8-nancheng-ring','industrial-avenue',2,'nancheng');
 link('v8-port-south','港兴大道',[groundV8(650,2390),groundV8(1000,2760),groundV8(1710,3000),groundV8(2180,2690)],'v6-logistics-one','v5-south-logistics',4,'tonggang');
 link('v8-port-yard','临港路',[groundV8(1000,2760),groundV8(1180,3180),groundV8(1750,3220),groundV8(1890,2880)],'v8-port-south','v8-port-south',2,'tonggang');
 link('v8-port-works','船坞路',[groundV8(600,2220),groundV8(850,2460),groundV8(1150,2440),groundV8(1390,2840)],'v6-logistics-one','v8-port-south',2,'tonggang');
 map.regional!.cityExtensions!.find(a=>a.minZ===2250)!.maxZ=3350;
 map.regional!.cityExtensions!.find(a=>a.maxZ===-2100)!.minZ=-3300;
}
export function populateDistrictsV8(map:CityMapData):void{
 const clearance=new RoadClearance(map),objects:CityObject[]=[];
 const building=(id:string,prefabId:CityObject['prefabId'],x:number,z:number,sx:number,sy:number,sz:number,district:string,shape:CityObject['buildingShape']='box')=>{
  const w=(prefabId==='school'?42:prefabId==='industrial'?46:26)*sx,d=(prefabId==='school'?18:prefabId==='industrial'?30:22)*sz,h=(prefabId==='school'?14:prefabId==='industrial'?11:38)*sy;
  for(let dx=-w/2;dx<=w/2;dx+=8)for(let dz=-d/2;dz<=d/2;dz+=8)if(clearance.roadAt({x:x+dx,z:z+dz},3,-.1,h,undefined,undefined,true)||clearance.junctionAt({x:x+dx,z:z+dz},3,-.1,h))return;
  objects.push({id,prefabId,position:groundV8(x,z,0),rotation:0,scale:{x:sx,y:sy,z:sz},district,facade:district==='xinghu'?'campus':district==='tonggang'||district==='nancheng'?'industrial':'office',buildingShape:shape,groupId:'v8-district-buildings'});
 };
 for(const [campus,x,z]of [['engineering',180,-2860],['medical',500,-2390],['arts',-320,-2500]] as const){
  for(let i=0;i<5;i++)building(`v8-campus-${campus}-${i}`,'school',x+(i%3)*95,z+Math.floor(i/3)*105,1.5,.75+(i%3)*.22,1.65,'xinghu',i%2?'slab':'courtyard');
  objects.push({id:'v8-campus-field-'+campus,prefabId:'sports_field',position:groundV8(campus==='arts'?-520:x+100,campus==='arts'?-2500:z+235,0),rotation:0,district:'xinghu',groupId:'v8-district-buildings'});
 }
 for(let i=0;i<12;i++)building('v8-newcity-building-'+i,i%3?'office':'school',2000+(i%4)*280,-380+Math.floor(i/4)*210,1.1+(i%3)*.3,.55+(i%4)*.14,1.4,'chunhui',i%2?'slab':'chamfered');
 for(const [area,x,z]of [['nancheng',-1280,2640],['tonggang',1290,2880]] as const)for(let i=0;i<7;i++)building(`v8-industrial-${area}-${i}`,'industrial',x+(i%3)*155,z+Math.floor(i/3)*145,2.2,.8+(i%2)*.3,2.5,area,'slab');
 objects.push({id:'v8-xinghu-water',prefabId:'water',position:groundV8(-850,-1390,-.02),rotation:0,scale:{x:20,y:1,z:12},district:'xinghu',groupId:'v8-lake'});
 map.objects.push(...objects);
 for(const [id,name,x,z]of [['v8-engineering-campus','清江理工园区',180,-2860],['v8-medical-campus','星湖医学园区',500,-2390],['v8-arts-campus','星湖艺术园区',-320,-2500]] as const)map.environment.landmarks!.push({id,name,position:groundV8(x,z,0),roadIds:map.roads.filter(r=>r.roadNameId?.startsWith('v8-campus-')).map(r=>r.id)});
}
