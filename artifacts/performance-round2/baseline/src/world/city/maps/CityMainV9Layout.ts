import type {CityMapData,CityPoint} from '../CityMapData';
import {roadPoints,syncConnections} from '../geometry';
import {connectRoads} from '../MapAPI';
import {groundV8,streetV8,snapV8,connectStreetV8,retireV8,finishJunctionsV8} from './CityMainV8Roads';
import {cityTerrainOffsetAt} from '../CityTerrain';
import {connectUrbanSkeleton} from './CityMainUrbanConnections';
import {cityFeatureCrossings} from './CityMainV6Geography';

/** Straight sides and short chamfered corners replace the old undulating oval. */
export function straightenInnerV9(map:CityMapData):void{
 const ring=map.roads.filter(r=>r.roadNameId==='inner-boulevard'),samples=ring.flatMap(roadPoints).map(p=>({angle:Math.atan2(p.z,p.x),radius:Math.hypot(p.x,p.z)})).sort((a,b)=>a.angle-b.angle);
 const polygon=[[-1150,-600],[-900,-850],[950,-850],[1200,-600],[1200,700],[950,950],[-900,950],[-1150,700]];
 const oldRadius=(angle:number)=>{let i=samples.findIndex(p=>p.angle>=angle);if(i<0)i=0;const b=samples[i]!,a=samples[(i+samples.length-1)%samples.length]!,gap=(b.angle-a.angle+Math.PI*2)%(Math.PI*2),t=((angle-a.angle+Math.PI*2)%(Math.PI*2))/gap;return a.radius+(b.radius-a.radius)*t;};
 const warp=(p:CityPoint):CityPoint=>{const angle=Math.atan2(p.z,p.x),r=Math.hypot(p.x,p.z),old=oldRadius(angle),distance=Math.abs(r-old);if(distance>220)return {...p};const dx=Math.cos(angle),dz=Math.sin(angle);let target=Infinity;
  for(let i=0;i<polygon.length;i++){const a=polygon[i]!,b=polygon[(i+1)%polygon.length]!,ex=b[0]!-a[0]!,ez=b[1]!-a[1]!,den=dx*ez-dz*ex;if(Math.abs(den)<1e-8)continue;const t=(a[0]!*ez-a[1]!*ex)/den,u=(a[0]!*dz-a[1]!*dx)/den;if(t>0&&u>=0&&u<=1)target=Math.min(target,t);}
  const w=(1-(distance/220)**2)**2,delta=(target-old)*w;return {...p,x:p.x+dx*delta,z:p.z+dz*delta};};
 const ringIds=new Set(ring.map(r=>r.id));for(const r of ring){r.centerline=roadPoints(r).map(warp);r.curve='polyline';r.elevationMode='custom';delete r.elevation;}
 for(const j of map.intersections.filter(j=>j.connections.some(c=>ringIds.has(c.roadId)))){const before=j.position,next=warp(before),dx=next.x-before.x,dz=next.z-before.z;j.position=next;
  for(const c of j.connections.filter(c=>!ringIds.has(c.roadId))){const r=map.roads.find(r=>r.id===c.roadId)!,path=roadPoints(r),ordered=c.end==='start'?path:[...path].reverse(),original=ordered.map(p=>({...p}));let distance=0;for(let i=0;i<ordered.length;i++){if(i)distance+=Math.hypot(original[i]!.x-original[i-1]!.x,original[i]!.z-original[i-1]!.z);const w=Math.max(0,1-distance/180);ordered[i]!.x+=dx*w;ordered[i]!.z+=dz*w;}r.centerline=c.end==='start'?ordered:ordered.reverse();}
  j.portAngles={};for(const c of j.connections){const r=map.roads.find(r=>r.id===c.roadId)!,p=r.centerline[c.end==='start'?0:r.centerline.length-1]!;j.portAngles[c.port]=Math.atan2(p.x-j.position.x,-(p.z-j.position.z))+j.rotation;}}
 syncConnections(map);finishJunctionsV8(map,true);
}

const lobes=[{x:-1110,z:-1540,rx:185,rz:145},{x:-890,z:-1550,rx:200,rz:155},{x:-680,z:-1400,rx:190,rz:200},{x:-520,z:-1430,rx:155,rz:145},{x:-990,z:-1540,rx:155,rz:135},{x:-650,z:-1270,rx:145,rz:115}];
/** Trace the outside of the buffered lake union, including its concave bays. */
function lakeShoreLoop():CityPoint[]{
 const field=(p:CityPoint)=>Math.min(...lobes.map(f=>((p.x-f.x)/(f.rx+52))**2+((p.z-f.z)/(f.rz+52))**2-1)),nodes=new Map<string,{point:CityPoint;next:string[]}>(),key=(p:CityPoint)=>p.x.toFixed(4)+','+p.z.toFixed(4);
 const add=(a:CityPoint,b:CityPoint)=>{const aa=key(a),bb=key(b);for(const [k,p,n]of [[aa,a,bb],[bb,b,aa]] as const){let node=nodes.get(k);if(!node){node={point:p,next:[]};nodes.set(k,node);}node.next.push(n);}};
 for(let x=-1400;x<-250;x+=10)for(let z=-1800;z<-1050;z+=10){const corners=[groundV8(x,z),groundV8(x+10,z),groundV8(x+10,z+10),groundV8(x,z+10)],values=corners.map(field),cuts:CityPoint[]=[];
  for(let i=0;i<4;i++){const n=(i+1)%4,a=values[i]!,b=values[n]!;if((a<=0)===(b<=0))continue;const t=a/(a-b),p=corners[i]!,q=corners[n]!;cuts.push(groundV8(p.x+(q.x-p.x)*t,p.z+(q.z-p.z)*t));}
  if(cuts.length===2)add(cuts[0]!,cuts[1]!);else if(cuts.length===4){if((values[0]!<=0)===(field(groundV8(x+5,z+5))<=0)){add(cuts[0]!,cuts[1]!);add(cuts[2]!,cuts[3]!);}else{add(cuts[0]!,cuts[3]!);add(cuts[1]!,cuts[2]!);}}
 }
 const first=nodes.keys().next().value!,points:CityPoint[]=[];let previous='',current=first;
 do{const node=nodes.get(current)!;if(!points.length||Math.hypot(node.point.x-points.at(-1)!.x,node.point.z-points.at(-1)!.z)>.1)points.push(node.point);const next=node.next.find(k=>k!==previous)!;previous=current;current=next;}while(current!==first);
 points.push({...points[0]!});return points;
}
export function lakeV9(map:CityMapData):void{
 retireV8(map,r=>r.roadNameId==='v8-xinghu-loop'||r.roadNameId==='v8-lake-approach'||r.roadNameId==='v8-lake-east'||r.id.startsWith('v4-north-residential')||r.roadNameId==='v5-north-park');
 map.objects=map.objects.filter(o=>o.id!=='v8-xinghu-water'&&!(o.groupId==='v8-visible-landscape'&&o.id.includes('xinghu-loop')));
 const points=lakeShoreLoop(),half=Math.floor(points.length/2);
 const a=streetV8(map,'v9-lake-loop-north','星湖环路',points.slice(0,half+1),2,'xinghu'),b=streetV8(map,'v9-lake-loop-south','星湖环路',points.slice(half),2,'xinghu');a.roadNameId=b.roadNameId='v9-lake-loop';map.roadNames!['v9-lake-loop']={primaryText:'星湖环路',kind:'urban'};
 connectRoads(map,{roadId:a.id,end:'end'},{roadId:b.id,end:'start'});connectRoads(map,{roadId:b.id,end:'end'},{roadId:a.id,end:'start'});
 for(const [id,name,start,end,from,to]of [
  ['v9-lake-west','湖滨路',groundV8(-1320,-1430),groundV8(-1250,-1090),'v9-lake-loop','north-avenue'],
  ['v9-lake-east','星湖东路',groundV8(-380,-1400),groundV8(-240,-1050),'v9-lake-loop','north-avenue'],
 ] as const){const r=streetV8(map,id,name,[snapV8(map,start,from),snapV8(map,end,to)],2,'xinghu');connectStreetV8(map,r);}
 for(const [i,f]of lobes.entries())map.objects.push({id:'v9-lake-water-'+i,prefabId:'water',position:groundV8(f.x,f.z,-.02),rotation:0,scale:{x:f.rx/10,y:1,z:f.rz/10},district:'xinghu',groupId:'v9-xinghu-lake'});
 // End the old northern avenue at the enlarged lake's south shore.
 retireV8(map,r=>r.id==='v8-gongren-street'||r.id==='v8-gongren-street-split');
 const avenue=map.roads.find(r=>r.id==='v8-gongren-street-split-split-3')!,shoreLanding=map.roads.filter(r=>r.roadNameId==='v9-lake-loop').flatMap(r=>cityFeatureCrossings(r,[groundV8(-1001.25,-1850),groundV8(-1001.25,-1100)])).sort((a,b)=>b.point.z-a.point.z)[0]!.point;for(const p of avenue.centerline)p.y=-.024;avenue.centerline[0]={...shoreLanding};const entrance=map.roads.find(r=>r.id==='urban-underpass-start-approach')!;entrance.centerline.splice(1,1);connectUrbanSkeleton(map,[avenue,entrance]);connectStreetV8(map,avenue);
 for(const o of map.objects)if(o.position.x>-1330&&o.position.x<-300&&o.position.z>-1730&&o.position.z<-1090&&o.prefabId!=='water'&&o.prefabId!=='waterway'&&o.prefabId!=='railway_track'){
  if(lobes.some(f=>((o.position.x-f.x)/f.rx)**2+((o.position.z-f.z)/f.rz)**2<1.08))o.position.z-=330;
 }
 map.environment.landmarks!.push({id:'xinghu-waterfront',name:'星湖滨水公园',position:groundV8(-850,-1410,0),roadIds:map.roads.filter(r=>r.roadNameId==='v9-lake-loop').map(r=>r.id)});
}

export function chunhuiV9(map:CityMapData):void{
 retireV8(map,r=>r.id.startsWith('v8-newcity-')||r.id.startsWith('v4-east-new-district'));
 map.objects=map.objects.filter(o=>!o.id.startsWith('v8-newcity-building-')&&!(o.groupId==='v8-visible-landscape'&&o.id.includes('newcity-')));
 const add=(id:string,name:string,points:CityPoint[],lanes=2)=>{const r=streetV8(map,id,name,points,lanes,'chunhui');for(const p of r.centerline)p.y=Math.max(p.y??0,-.024+cityTerrainOffsetAt(map.environment.landforms,p.x,p.z));connectStreetV8(map,r);return r;};
 const rows=[['one','新城一街',-720],['three','新城三街',-440],['four','新城四街',160],['seven','新城七街',430],['eight','新城八街',700]] as const;
 add('v9-chunhui-east','迎宾路',[groundV8(3430,-800),groundV8(3430,400),snapV8(map,groundV8(3430,850),'v61-exhibition-road')],4);
 for(const [id,name,z]of rows)add('v9-newcity-'+id,name,[snapV8(map,groundV8(1680,z),'east-avenue',65),groundV8(3430,z)],id==='four'?4:2);
 for(const [id,name,x,through]of [['two','新城二街',1950,true],['six','新城六街',2300,false],['five','新城五街',2520,false],['nine','新城九街',2810,false],['ten','新城十街',3110,true]] as const){
  if(through)add('v9-newcity-'+id,name,[groundV8(x,-720),groundV8(x,700)],2);
  else {add('v9-newcity-'+id+'-north',name,[groundV8(x,-720),groundV8(x,-440)],2);add('v9-newcity-'+id+'-south',name,[groundV8(x,160),groundV8(x,700)],2);}
 }
 // A civic square and larger rectangular parcels give the new town a clear center.
 map.objects.push({id:'v9-chunhui-square',prefabId:'hardscape',position:groundV8(2640,295,0),rotation:0,scale:{x:3,y:1,z:3},district:'chunhui',groupId:'v9-chunhui-parcels'});
 for(const [row,z]of [-610,285,565].entries())for(const [col,x]of [1830,2075,2350,2670,2950,3260].entries()){
  for(const side of [-1,1])map.objects.push({id:`v9-chunhui-${row}-${col}-${side}`,prefabId:row===0&&col===4?'school':col%3===0?'commercial':'residential_mid',position:groundV8(x+side*42,z,0),rotation:0,scale:{x:1.1+(col%2)*.2,y:1.15+(col%4)*.16,z:1.3},buildingShape:col%2?'slab':'chamfered',facade:'residential',district:'chunhui',groupId:'v9-chunhui-parcels'});
 }
}
