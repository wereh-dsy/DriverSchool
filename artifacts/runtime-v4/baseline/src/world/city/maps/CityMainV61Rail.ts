import { CatmullRomCurve3, Vector3 } from 'three';
import type { CityMapData, CityPoint, CityRoad } from '../CityMapData';
import { createRoad, deleteObject, splitRoadAtPoint } from '../MapAPI';
import { roadPoints, polylineLength, sampleAt } from '../geometry';
import { cityFeatureCrossings, distanceToCityCorridor } from './CityMainV6Geography';
import { roadPiers } from '../RoadInfrastructure';
import { RoadClearance } from '../RoadClearance';
import { cityElevationProtectedRoad } from './CityMainGroundElevation';
import { cityV61Snap } from './CityMainV61Corridors';

export function moveV61Rail(map:CityMapData):{roadId:string;station:number;height:number;halfLength:number}[] {
  const controls=[[-1830,-2050],[-1550,-1460],[-1270,-960],[-1370,-720],[-1370,100],[-1370,600],[-1490,1100],[-1800,1730],[-1900,2150]].map(([x,z])=>new Vector3(x!,0,z!));
  const length=polylineLength(controls),rail=new CatmullRomCurve3(controls,false,'centripetal').getPoints(Math.ceil(length/8)).map(p=>({x:p.x,y:0,z:p.z}));
  // The reused roofed underpass is an existing piece of the city road network.
  // Pin the railway over it with a broad tangent, rather than moving its roads.
  const feature=map.environment.corridors!.find(c=>c.kind==='railway')!;feature.centerline=rail;feature.name='西兴铁路走廊';
  // This old approach contained a square 90-degree bend. Round its ground-level
  // corner before adding rail-bridge guardrails, keeping both linked endpoints.
  const westLink=map.roads.find(r=>r.id==='urban-underpass-west-link')!,westPath=roadPoints(westLink);
  const controlsLink=[westPath[0]!,{x:-1655,y:0,z:-1100},{x:-1650,y:0,z:-1160},{x:-1605,y:0,z:-1200},westPath.at(-1)!].map(p=>new Vector3(p.x,p.y??0,p.z));
  westLink.centerline=new CatmullRomCurve3(controlsLink,false,'centripetal').getPoints(Math.ceil(polylineLength(controlsLink)/4)).map(p=>({x:p.x,y:0,z:p.z}));westLink.curve='polyline';
  map.objects=map.objects.filter(o=>!['west-city-rail','west-station'].includes(o.groupId??''));
  // The former outer station access now serves a small old-industry precinct.
  map.roadNames!['v6-west-station-road']={primaryText:'西兴机务路',kind:'urban'};
  map.environment.landmarks=[];
  const closures:string[]=[];
  // Two genuinely minor streets end beside the railway; major urban roads keep
  // their established links and acquire bridges only at actual rail crossings.
  for(const family of ['v6-west-warehouse-lane','v6-west-market-street']) {
    const r=map.roads.find(r=>r.id===family)!,cross=cityFeatureCrossings(r,rail)[0];if(!cross)throw new Error('V6.1 missing lane/rail crossing '+family);
    const path=roadPoints(r),a=sampleAt(path,cross.station-20).point,b=sampleAt(path,cross.station+20).point;
    const first=splitRoadAtPoint(map,r.id,a),second=splitRoadAtPoint(map,first.after.id,b);
    deleteObject(map,second.before.id);
    for(const [road,end] of [[first.before,'end'],[second.after,'start']] as const) {
      const p=road.centerline[end==='start'?0:road.centerline.length-1]!,s=sampleAt(roadPoints(road),end==='start'?0:polylineLength(roadPoints(road)));
      map.connectionPorts!.push({id:`v61-rail-stop-${road.id}-${end}`,label:'铁路边街巷尽端（封闭）',endpoint:{roadId:road.id,end}});
      map.objects.push({id:`v61-end-rail-${road.id}`,prefabId:'guardrail',position:{...p},rotation:Math.atan2(s.tangent.x,s.tangent.z),scale:{x:.8,y:1,z:1},groupId:'v61-rail-ends'});closures.push(road.id);
    }
  }
  // Only the two actual ring/rail crossings need a broad local bridge crest.
  const ringCrossings=map.roads.filter(r=>r.roadNameId==='ring-expressway'&&r.laneCount===3&&!r.gore).flatMap(r=>cityFeatureCrossings(r,rail).filter(c=>(c.point.y??0)<6.4).map(c=>c.point));
  const lift=(p:CityPoint)=>Math.max(0,...ringCrossings.map(c=>{const t=Math.hypot(p.x-c.x,p.z-c.z)/450;return t<1?6.45*(1-t*t)**3:0;}));
  for(const r of map.roads.filter(cityElevationProtectedRoad)) {
    const points=roadPoints(r);if(!points.some(p=>lift(p)>0))continue;r.centerline=points.map(p=>({...p,y:(p.y??0)+lift(p)}));r.elevationMode='custom';delete r.elevation;
  }
  for(const j of map.intersections){const delta=lift(j.position);if(delta){j.position.y=(j.position.y??0)+delta;for(const c of j.connections)(j.pavementHeights??={})[c.port]=j.position.y;}}
  const decks:{roadId:string;station:number;height:number;halfLength:number}[]=[];
  const underpasses:string[]=[],overpasses:string[]=[];
  for(const r of map.roads)for(const cross of cityFeatureCrossings(r,rail)) {
    const y=cross.point.y??0;if(y<=-6.1){underpasses.push(r.id);continue;}if(y>=6.1){overpasses.push(r.id);continue;}
    if(cityElevationProtectedRoad(r)&&r.id!=='urban-underpass-west-link')throw new Error('V6.1 railway requires unresolved protected crossing '+r.id+' '+JSON.stringify(cross.point));
    decks.push({roadId:r.id,station:cross.station,height:6.4,halfLength:8/Math.max(.25,cross.sin)});r.structure={...r.structure,barrierEnabled:true,barrierOffset:0};overpasses.push(r.id);
  }
  const railLength=polylineLength(rail);
  for(let d=0,serial=0;d<railLength;d+=40,serial++) {
    const a=sampleAt(rail,d).point,b=sampleAt(rail,Math.min(d+40,railLength)).point;
    map.objects.push({id:'v61-city-rail-'+serial,prefabId:'railway_track',position:{x:(a.x+b.x)/2,y:0,z:(a.z+b.z)/2},rotation:Math.atan2(b.x-a.x,b.z-a.z),scale:{x:1,y:1,z:(Math.hypot(b.x-a.x,b.z-a.z)+.1)/40},groupId:'west-city-rail'});
  }
  map.environment.metadata={...map.environment.metadata,v61Rail:JSON.stringify({lengthMetres:railLength,closedMinorRoads:closures,overpasses,underpasses,station:'城站',railAlignment:'northwest → Xixing interior → southwest'})};
  return decks;
}

/** Add a normal, low-speed station forecourt using the existing old-city avenue. */
export function stationV61Access(map:CityMapData):CityRoad {
  const match=(r:CityRoad)=>r.roadNameId==='west-avenue';
  const a=cityV61Snap(map,{x:-1259,y:0,z:225},match),b=cityV61Snap(map,{x:-1263,y:0,z:300},match);
  const r=createRoad(map,{id:'v61-station-forecourt',type:'urban_2lane',laneCount:2,laneWidth:3.1,speedLimit:20,travelDirection:'two-way',centerline:[a,{x:-1288,y:a.y,z:240},{x:-1288,y:b.y,z:290},b],elevationMode:'custom',sidewalk:{enabled:true,width:2},structure:{barrierEnabled:false,piersEnabled:false,barrierOffset:0},streetlights:false});
  r.roadNameId='v61-station-forecourt';r.roadClass='local';r.decorationProfile='old-town';map.roadNames![r.roadNameId]={primaryText:'城站广场路',kind:'urban'};return r;
}

/** Keep actual bridge columns outside the rail envelope using existing span data. */
export function clearV61RailPiers(map:CityMapData):void {
  const rail=map.environment.corridors!.find(c=>c.kind==='railway')!,clearance=new RoadClearance(map);
  for(const road of map.roads.filter(r=>cityFeatureCrossings(r,rail.centerline).length)) {
    const safe=()=>roadPiers(road,map,clearance).every(p=>distanceToCityCorridor(p.position,rail.centerline)>=7);
    if(safe())continue;
    const previous=road.structure?.pierSpacing??30;
    const spacings=Array.from({length:41},(_,i)=>i+20).sort((a,b)=>Math.abs(a-previous)-Math.abs(b-previous));
    const found=spacings.some(spacing=>{
      road.structure={...road.structure,pierSpacing:spacing};
      return roadPiers(road,map,clearance).length>0&&safe();
    });
    if(!found)throw new Error('V6.1 unresolved rail bridge support '+road.id);
  }
}
