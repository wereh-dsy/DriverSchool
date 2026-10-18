import type {CityMapData,CityPoint,CityRoad} from '../CityMapData';
import {expandPreset} from '../presets/InfrastructurePresets';
import {bezierPoints,ease} from '../presets/BackbonePresets';
import {connectRoad,createIntersection,deleteObject} from '../MapAPI';
import {retireV8,attachLaneV8,laneLandingV8,streetV8,groundV8,snapV8,connectStreetV8,polylineLength,sampleAt,finishJunctionsV8} from './CityMainV8Roads';
import {fitCityV62Ramps} from './CityMainV62Profiles';
import {compactRampEase} from '../presets/CompactInterchangePresets';
function stationAt(path:CityPoint[],p:CityPoint):number{let best=Infinity,result=0,d=0;for(let i=1;i<path.length;i++){const a=path[i-1]!,b=path[i]!,dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(l*l))),gap=Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);if(gap<best){best=gap;result=d+t*l;}d+=l;}return result;}
export function regionalV8(map:CityMapData):void{
 // Remove the east service area and the service-like southern access courts.
 const removed=['regional:donglin-service','regional:nangang'];
 retireV8(map,r=>removed.some(id=>r.id.startsWith(id+':')));
 map.objects=map.objects.filter(o=>!removed.some(id=>o.id.startsWith(id+':')));
 map.regional!.structures=map.regional!.structures.filter(s=>!removed.includes(s.id));
 map.regional!.exits=map.regional!.exits.filter(s=>!removed.includes(s.id));
 map.regional!.highways!.services=map.regional!.highways!.services.filter(s=>!removed.includes(s.id));
 map.regional!.highways!.exits=map.regional!.highways!.exits.filter(s=>!removed.includes(s.id));
 regionalMetadataV8(map);
 // Restamp the two airport-side hubs in their real curved highway frames.
 const newRamps=new Set<string>();
 for(const id of ['regional:v3:airport-south','regional:v3:airport-distributor']){
  const structure=map.regional!.structures.find(s=>s.id===id)!,main=map.regional!.routes.find(r=>r.id===structure.routes[0])!,other=map.regional!.routes.find(r=>r.id===structure.routes[1])!,center=structure.center,ms=stationAt(main.centerline,center),cs=stationAt(other.centerline,center),mt=sampleAt(main.centerline,ms).tangent,ct=sampleAt(other.centerline,cs).tangent,crossSign=ct.x*mt.z-ct.z*mt.x>=0?1:-1;
  const highwayNode=map.regional!.highways!.junctions.find(j=>j.id===id)!;
  map.regional!.highways!.junctions=map.regional!.highways!.junctions.filter(j=>j.id!==id);
  retireV8(map,r=>r.id.startsWith(id+':'));structure.roadIds=[];regionalMetadataV8(map);
  const stamp=expandPreset('system_compact_turbine',{groupId:id,mainApproach:420,mainElevation:0,crossElevation:8});
  structure.radius=900;structure.form='compact directional ramps';
  for(const r of stamp.roads){
   if(id.endsWith('airport-south')&&!['N-to-E','S-to-E','E-to-N','E-to-S'].some(m=>r.id.includes(':'+m+'-')))continue;
   const arms=r.id.match(/:([SNEW])-to-([SNEW])-/)!,sourceArm=arms[1]!,targetArm=arms[2]!,source=/[SN]/.test(sourceArm)?main:other,target=/[SN]/.test(targetArm)?main:other;
   const sourceDir=source===main?(sourceArm==='S'?'in':'out'):((sourceArm==='E')===(crossSign===1)?'in':'out'),targetDir=target===main?(targetArm==='S'?'out':'in'):((targetArm==='E')===(crossSign===1)?'out':'in');
   const scale=id.endsWith('airport-south')?1.35:1.6;
   r.centerline=r.centerline.map(q=>{const a=sampleAt(main.centerline,ms+q.z*scale).point,b=sampleAt(other.centerline,cs+q.x*scale*crossSign).point;return {x:a.x+b.x-center.x,y:q.y,z:a.z+b.z-center.z};});
   const match=(route:string,dir:string)=>(q:CityRoad)=>q.id.startsWith('regional:')&&q.roadNameId===route&&q.id.includes(':'+dir)&&q.laneCount>=2&&!q.gore&&!q.highwayTransition;
   const from=laneLandingV8(map,r.centerline[0]!,match(source.id,sourceDir)),to=laneLandingV8(map,r.centerline.at(-1)!,match(target.id,targetDir)),fromDelta=(from.y??0)-(r.centerline[0]!.y??0),toDelta=(to.y??0)-(r.centerline.at(-1)!.y??0),authoredLength=polylineLength(r.centerline);let authoredStation=0;
   for(let i=0;i<r.centerline.length;i++){if(i)authoredStation+=Math.hypot(r.centerline[i]!.x-r.centerline[i-1]!.x,r.centerline[i]!.z-r.centerline[i-1]!.z);const t=authoredStation/authoredLength;r.centerline[i]!.y=(r.centerline[i]!.y??0)+fromDelta*(1-t)+toDelta*t;}
   r.roadNameId=target.id;r.designProfile='motorway';r.speedLimit=50;r.gore!.length=140;r.structure!.pierSpacing=50;r.corridorSection='RAMP';map.roads.push(r);
   attachLaneV8(map,r,'start',match(source.id,sourceDir));attachLaneV8(map,r,'end',match(target.id,targetDir));
   const L=polylineLength(r.centerline),a=r.centerline[0]!.y??0,b=r.centerline.at(-1)!.y??0,peak=Math.max(a,b,sampleAt(main.centerline,ms).point.y??0,sampleAt(other.centerline,cs).point.y??0)+(source===main?6.5:13);let d=0;
   for(let i=0;i<r.centerline.length;i++){if(i)d+=Math.hypot(r.centerline[i]!.x-r.centerline[i-1]!.x,r.centerline[i]!.z-r.centerline[i-1]!.z);r.centerline[i]!.y=r.id.endsWith('-turbine')?(d<L*.5?a+(peak-a)*ease((d-30)/(L*.42)):peak+(b-peak)*ease((d-L*.58)/(L*.42-30))):a+(b-a)*ease((d-30)/(L-60));}
   structure.roadIds.push(r.id);newRamps.add(r.id);
  }
  highwayNode.roadIds=[...structure.roadIds];map.regional!.highways!.junctions.push(highwayNode);regionalMetadataV8(map);
 }
 fitCityV62Ramps(map,newRamps);
 // Bring the southern origin of S18 into the city via an ordinary airport avenue.
 const route=map.regional!.routes.find(r=>r.id==='S18')!,origin=route.centerline[0]!,fork=groundV8(-4380,1410),roadEnd=snapV8(map,groundV8(-1630,1130),'v8-shanghai-road');
 const avenue=streetV8(map,'regional:v8:airport-city-road','机场大道',[fork,groundV8(-3900,1420),groundV8(-3200,1450),groundV8(-2500,1470),roadEnd],4,'xixing');avenue.type='urban_6lane';avenue.laneCount=6;avenue.groupId='v8-airport';connectStreetV8(map,avenue);
 for(const dir of ['out','in']){
  const match=(r:CityRoad)=>r.id.startsWith('regional:S18:'+dir+':')&&r.laneCount>=2&&!r.gore&&!r.highwayTransition,p=laneLandingV8(map,origin,match),near=map.roads.filter(match).find(r=>r.centerline.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<.1))!;
  const frame=sampleAt(near.centerline,dir==='out'?0:polylineLength(near.centerline)),on=dir==='out',L=Math.hypot(origin.x-fork.x,origin.z-fork.z),t={x:(origin.x-fork.x)/L,z:(origin.z-fork.z)/L},side=on?1:-1,right={x:-t.z,z:t.x};
  const start={...fork,x:fork.x+right.x*8.125*side,z:fork.z+right.z*8.125*side},control={...start,x:start.x+t.x*160,z:start.z+t.z*160},sourceControl={...p,x:p.x+frame.tangent.x*150*(on?-1:1),z:p.z+frame.tangent.z*150*(on?-1:1)};
  const forward=bezierPoints(start,control,sourceControl,p),path=on?forward:forward.reverse();
  const r:CityRoad={id:'regional:v8:airport-city-'+dir,type:'highway',centerline:path,laneCount:3,laneWidth:3.75,travelDirection:'forward',speedLimit:60,elevationMode:'custom',structure:{barrierEnabled:true,piersEnabled:true,pierSpacing:45},roadNameId:'S18',groupId:'v8-airport'};map.roads.push(r);
  attachLaneV8(map,r,on?'end':'start',match);
 }
 const bearing=Math.atan2(origin.x-fork.x,-(origin.z-fork.z)),gateway=createIntersection(map,{id:'v8-airport-gateway',type:'t_4lane',position:fork,rotation:0,signalized:false,portAngles:{north:bearing+.45,west:bearing-.45,east:Math.PI/2},groupId:'v8-airport'});
 connectRoad(map,{roadId:avenue.id,end:'start'},{junctionId:gateway.id,port:'east'});connectRoad(map,{roadId:'regional:v8:airport-city-out',end:'start'},{junctionId:gateway.id,port:'north'});connectRoad(map,{roadId:'regional:v8:airport-city-in',end:'end'},{junctionId:gateway.id,port:'west'});finishJunctionsV8({...map,intersections:[gateway]},true);
 // A simple airport: runway, taxiway, apron, long terminal and control tower.
 map.regional!.cityExtensions!.push({minX:-6200,maxX:-4750,minZ:-5200,maxZ:-2850});
 const add=(id:string,prefabId:CityMapData['objects'][number]['prefabId'],x:number,z:number,sx:number,sy:number,sz:number,y=0,color?:string)=>map.objects.push({id:'regional:v8:airport-'+id,prefabId,position:groundV8(x,z,y),rotation:0,scale:{x:sx,y:sy,z:sz},color,groupId:'v8-airport'});
 deleteObject(map,'regional:airport-terminal');map.objects=map.objects.filter(o=>!o.id.startsWith('regional:airport-exit:'));
 for(let i=0;i<4;i++){add('runway-'+i,'hardscape',-4930,-4830+i*540,1.5,1,18,0,'#40464b');add('taxiway-'+i,'hardscape',-5100,-4751.25+i*487.5,.7,1,16.25,0,'#747b7c');}add('apron','hardscape',-5400,-3830,12,1,13,0,'#a7a8a0');
 add('terminal','commercial',-5710,-3830,2.2,1.3,12,0,'#cad6da');add('terminal-roof','hardscape',-5700,-3830,2.5,1,12,12,'#e2e5df');
 add('tower-base','garage',-5860,-3590,1.3,1.4,1.2);add('tower','office',-5860,-3590,.3,.8,.35);add('tower-cab','commercial',-5860,-3590,.5,.5,.65,30,'#8eaab5');
 for(let i=0;i<6;i++){add('bridge-'+i,'hardscape',-5600,-3670-i*65,3,1,.35,4,'#c9cfce');add('gate-'+i,'garage',-5525,-3670-i*65,.8,.8,.7);}
 for(let i=0;i<24;i++)add('runway-line-'+i,'hardscape',-4930,-5100+i*90,.12,1,1,0.08,'#eeeeee');
 for(const end of [-5050,-3000])for(let i=-3;i<=3;i++)add('threshold-'+end+'-'+i,'hardscape',-4930+i*6,end,.075,1,1.5,.08,'#eeeeee');
 const oldAccess=map.roads.find(r=>r.id==='regional:airport-terminal-access')!,a=oldAccess.centerline[0]!,terminal=groundV8(-5820,-3830);oldAccess.centerline=bezierPoints(a,{...a,x:a.x+80},groundV8(-5900,-3830),terminal);oldAccess.roadNameId='v8-airport-terminal-road';oldAccess.type='urban_2lane';oldAccess.laneCount=2;oldAccess.laneWidth=3.5;oldAccess.structure={barrierEnabled:false,piersEnabled:true};
 const terminalLength=polylineLength(oldAccess.centerline);let terminalStation=0;for(let i=0;i<oldAccess.centerline.length;i++){if(i)terminalStation+=Math.hypot(oldAccess.centerline[i]!.x-oldAccess.centerline[i-1]!.x,oldAccess.centerline[i]!.z-oldAccess.centerline[i-1]!.z);oldAccess.centerline[i]!.y=(a.y??0)*(1-compactRampEase((terminalStation-25)/(terminalLength-50)));}
 for(const r of map.roads.filter(r=>r.id.startsWith('regional:airport-exit:local:1')))r.structure={...r.structure,piersEnabled:true,pierSpacing:35};
 map.roadNames!['v8-airport-terminal-road']={primaryText:'航站楼路',secondaryText:'Terminal Rd.',kind:'urban'};
 map.environment.landmarks!.push({id:'airport-terminal',name:'清江机场 T1 / T2 航站区',position:groundV8(-5710,-3830,0),roadIds:[oldAccess.id]});
 map.environment.metadata={...map.environment.metadata,v8RemovedServiceCourts:JSON.stringify(removed),v8Airport:'Compact south/distributor hubs; S18 connected to the urban street network; terminal, apron, taxiway and runway.'};
}
export function regionalMetadataV8(map:CityMapData):void{
 const ids=new Set(map.roads.map(r=>r.id)),region=map.regional!,expand=(list:string[])=>[...new Set(list.flatMap(id=>map.roads.filter(r=>r.id===id||r.id.startsWith(id+'-split')).map(r=>r.id)))];
 for(const r of region.routes){r.roadIds=expand(r.roadIds).filter(id=>map.roads.find(q=>q.id===id)!.roadNameId===r.id);region.highways!.routes.find(q=>q.id===r.id)!.roadIds=[...r.roadIds];}
 for(const s of region.structures)s.roadIds=expand(s.roadIds);
 for(const s of [...region.exits,...region.highways!.exits,...region.highways!.junctions,...region.highways!.services])s.roadIds=expand(s.roadIds).filter(id=>ids.has(id));
 for(const s of region.highways!.junctions){const actual=region.structures.find(q=>q.id===s.id);if(actual)s.roadIds=[...actual.roadIds];}
}
