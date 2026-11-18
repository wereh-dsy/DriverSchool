import { CatmullRomCurve3, Vector3 } from 'three';
import type { CityMapData, CityPoint, CityRoad } from '../CityMapData';
import { createRoad } from '../MapAPI';
import { roadPoints, polylineLength, sampleAt, syncConnections } from '../geometry';
import { cityElevationProtectedRoad, repairCityMainGroundElevation } from './CityMainGroundElevation';
import { connectUrbanSkeleton, trimCityJunctionApproaches } from './CityMainUrbanConnections';
import { setJunctionPavementFootprint } from '../JunctionSurface';
import { populateIntersectionMarkingMetadata } from '../MarkingOwnership';
import { RoadsidePlacement, cleanRoadsidePlacements } from '../RoadsidePlacement';
import { RoadClearance } from '../RoadClearance';
import { PrefabRegistry } from '../PrefabRegistry';
import { createSubject3Materials } from '../../subject3/materials';

function curve(nodes:[number,number][],spacing:number):CityPoint[] {
  const controls=nodes.map(([x,z])=>new Vector3(x,0,z)),length=polylineLength(controls);
  return new CatmullRomCurve3(controls,false,'centripetal').getPoints(Math.ceil(length/spacing)).map(p=>({x:p.x,y:0,z:p.z}));
}
export function distanceToCityCorridor(p:CityPoint,path:CityPoint[]):number {
  let best=Infinity;
  for(let i=1;i<path.length;i++){const a=path[i-1]!,b=path[i]!,dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));best=Math.min(best,Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t));}return best;
}
export function cityFeatureCrossings(road:CityRoad,path:CityPoint[]):{station:number;point:CityPoint;sin:number}[] {
  const points=roadPoints(road),out:{station:number;point:CityPoint;sin:number}[]=[];let station=0;
  const minX=Math.min(...path.map(p=>p.x)),maxX=Math.max(...path.map(p=>p.x)),minZ=Math.min(...path.map(p=>p.z)),maxZ=Math.max(...path.map(p=>p.z));
  for(let i=1;i<points.length;i++) {
    const a=points[i-1]!,b=points[i]!,ax=b.x-a.x,az=b.z-a.z,length=Math.hypot(ax,az);
    if(Math.max(a.x,b.x)>=minX&&Math.min(a.x,b.x)<=maxX&&Math.max(a.z,b.z)>=minZ&&Math.min(a.z,b.z)<=maxZ)for(let k=1;k<path.length;k++) {
      const c=path[k-1]!,d=path[k]!,bx=d.x-c.x,bz=d.z-c.z,den=ax*bz-az*bx;if(Math.abs(den)<1e-8)continue;
      const t=((c.x-a.x)*bz-(c.z-a.z)*bx)/den,u=((c.x-a.x)*az-(c.z-a.z)*ax)/den;if(t<0||t>1||u<0||u>1)continue;
      const at=station+t*length;if(out.some(p=>Math.abs(p.station-at)<1))continue;
      out.push({station:at,point:{x:a.x+ax*t,y:(a.y??0)+t*((b.y??0)-(a.y??0)),z:a.z+az*t},sin:Math.abs(den)/(length*Math.hypot(bx,bz))});
    }station+=length;
  }return out;
}

export function addCityV6Geography(map:CityMapData):void {
  const river=curve([[-650,-1085],[-570,-970],[-480,-760],[-470,-560],[-470,-340],[-510,-60],[-575,230],[-630,480],[-760,760],[-830,1000],[-970,1250],[-1030,1550],[-990,2100]],8);
  const rail=curve([[-2040,-2100],[-2070,-1550],[-2050,-800],[-2020,-100],[-2040,550],[-2050,1100],[-1990,1700],[-2010,2250]],10);
  map.environment.corridors=[{id:'qinghe-creek',name:'清和河',kind:'waterway',width:12,bankWidth:32,centerline:river},{id:'west-city-rail',name:'西城铁路走廊',kind:'railway',width:10,centerline:rail}];
  // A long, low crest at a REAL water crossing replaces an arbitrary profile.
  for(const r of map.roads.filter(r=>r.roadNameId==='ring-expressway'&&r.laneCount===3&&!r.gore)) {
    for(const p of r.centerline)if(p.z>1400&&Math.abs(p.x+1030)<380){const t=(p.x+1030)/380;p.y=Math.max(p.y??0,3.2*(1-t*t)**3);}
    r.elevationMode='custom';
  }
  // Station access is a curved collector between two real frontage junctions.
  const frontage=map.roads.filter(r=>r.id.startsWith('direct-west:frontage--1-'));
  const nearest=(z:number)=>{let best=Infinity,result:CityPoint|undefined;for(const r of frontage){const points=roadPoints(r),length=polylineLength(points);for(let d=10;d<length-10;d+=2){const p=sampleAt(points,d).point,gap=Math.abs(p.z-z);if(gap<best){best=gap;result=p;}}}return {...result!};};
  const a=nearest(670),b=nearest(985),accessPath=curve([[a.x,a.z],[-1860,735],[-1885,850],[-1860,940],[b.x,b.z]],3);
  accessPath[0]=a;accessPath[accessPath.length-1]=b;
  const access=createRoad(map,{id:'v6-west-station-access',type:'urban_2lane',styleId:'urban_local_2',centerline:accessPath,laneCount:2,laneWidth:3.6,travelDirection:'two-way',speedLimit:30,elevationMode:'ground',elevation:0,sidewalk:{enabled:true,width:2.5},district:'west',streetlights:true,structure:{barrierEnabled:false,piersEnabled:false}});
  map.roadNames!['v6-west-station-road']={primaryText:'西站路',kind:'urban'};access.roadNameId='v6-west-station-road';access.roadClass='collector';access.decorationProfile='collector';
  connectUrbanSkeleton(map,[access,...frontage],.2);syncConnections(map);trimCityJunctionApproaches(map,false);
  for(const j of map.intersections)setJunctionPavementFootprint(j,map);
  const decks:{roadId:string;station:number;height:number;halfLength:number}[]=[];let bridgeCrossings=0;
  for(const r of map.roads)for(const feature of map.environment.corridors)for(const crossing of cityFeatureCrossings(r,feature.centerline)) {
    const height=feature.kind==='railway'?6.4:3.2;if((crossing.point.y??0)>=height-.05)continue;
    if(cityElevationProtectedRoad(r))throw new Error(`City feature crosses protected road ${r.id} at ${JSON.stringify(crossing.point)}`);
    decks.push({roadId:r.id,station:crossing.station,height,halfLength:(feature.width/2+2)/Math.max(.25,crossing.sin)});bridgeCrossings++;
    r.structure={...r.structure,barrierEnabled:true,barrierOffset:0,piersEnabled:true,pierSpacing:30};
  }
  repairCityMainGroundElevation(map,decks);syncConnections(map);populateIntersectionMarkingMetadata(map);
  for(const j of map.intersections)setJunctionPavementFootprint(j,map);
  const materials=createSubject3Materials(),prefabs=new PrefabRegistry(materials),clearance=new RoadClearance(map),placement=new RoadsidePlacement(map,clearance);
  const oldCount=map.objects.length;
  map.objects=map.objects.filter(o=>{
    // Replace some tiny uniform shrub tiles with the continuous green banks.
    if(o.groupId==='v6-shrubs'&&Number(o.id.match(/\d+$/)?.[0]??0)%3===0)return false;
    if(o.groupId==='v6-star-lake'&&o.prefabId==='water')return true;
    const prefab=prefabs.entries.get(o.prefabId)!,radius=Math.hypot(prefab.size[0]*(o.scale?.x??1),prefab.size[2]*(o.scale?.z??1))/2;
    if(['green_strip','hardscape'].includes(o.prefabId))return distanceToCityCorridor(o.position,river)>8+radius;
    if(distanceToCityCorridor(o.position,river)<16+radius||distanceToCityCorridor(o.position,rail)<7+radius)return false;
    return true;
  });
  // New bridge approaches also move the exclusion volume vertically. Recheck
  // existing furniture, preserving the exact footprint checks for long barriers.
  const flatLandscapes=map.objects.filter(o=>o.prefabId==='water'||o.prefabId==='sports_field');
  map.objects=map.objects.filter(o=>!flatLandscapes.includes(o));
  cleanRoadsidePlacements(map);map.objects.push(...flatLandscapes);
  let serial=0;
  for(const feature of map.environment.corridors) {
    const length=polylineLength(feature.centerline),step=feature.kind==='railway'?40:30;
    for(let station=0;station<length;station+=step) {
      const end=Math.min(length,station+step),a=sampleAt(feature.centerline,station).point,b=sampleAt(feature.centerline,end).point,span=Math.hypot(b.x-a.x,b.z-a.z),position={x:(a.x+b.x)/2,y:feature.kind==='railway'?0:.075,z:(a.z+b.z)/2},rotation=Math.atan2(b.x-a.x,b.z-a.z);
      map.objects.push({id:`v6-${feature.id}-${serial++}`,prefabId:feature.kind==='railway'?'railway_track':'waterway',position,rotation,scale:{x:1,y:1,z:(span+(feature.kind==='railway'?.1:1.5))/(feature.kind==='railway'?40:20)},groupId:feature.id});
      if(feature.kind==='waterway')map.objects.push({id:`v6-river-bank-${serial++}`,prefabId:'green_strip',position:{...position,y:.012},rotation,scale:{x:1.6,y:1,z:(span+2)/8},color:'#a2bb82',groupId:'qinghe-bank'});
    }
  }
  const stationPosition={x:-1960,y:0,z:850},stationRadius=50;
  if(!placement.permits(stationPosition,stationRadius,24))throw new Error('West station building conflicts with a road');
  map.objects.push({id:'v6-west-station-building',prefabId:'commercial',position:stationPosition,rotation:Math.PI/2,scale:{x:2.1,y:2.1,z:1.3},facade:'office',buildingShape:'chamfered',color:'#e3e1d2',label:'西城站',district:'west',groupId:'west-station'});
  for(const side of [-1,1])for(let z=740;z<=960;z+=20) {
    const onRail=rail.reduce((best,p)=>Math.abs(p.z-z)<Math.abs(best.z-z)?p:best,rail[0]!);
    // Platforms remain beside the visual railway, away from the road forecourt.
    map.objects.push({id:`v6-station-platform-${side}-${z}`,prefabId:'station_platform',position:{x:onRail.x+side*10,y:0,z},rotation:0,groupId:'west-station'});
  }
  for(const z of [780,920])map.objects.push({id:'v6-station-parking-'+z,prefabId:'parking',position:{x:-1935,y:0,z},rotation:Math.PI/2,groupId:'west-station'});
  map.objects.push({id:'v6-west-station-sign',prefabId:'guide_sign',position:{x:-1900,y:0,z:850},rotation:-Math.PI/2,label:'西城站',groupId:'west-station'});
  map.environment.landmarks=[{id:'west-city-station',name:'西城站',position:{x:-1900,y:0,z:850},roadIds:map.roads.filter(r=>r.roadNameId==='v6-west-station-road').map(r=>r.id)}];
  map.environment.metadata={...map.environment.metadata,v6Geography:JSON.stringify({riverLength:polylineLength(river),railLength:polylineLength(rail),bridgeCrossings,removedProps:oldCount-map.objects.filter(o=>!['qinghe-creek','qinghe-bank','west-city-rail','west-station'].includes(o.groupId??'')).length,station:'西城站',stationAccess:'西站路 → 西侧双向辅路'} )};
  prefabs.dispose();Object.values(materials).forEach(m=>m.dispose());
}
