import type { CityFacade, CityMapData, CityObject, CityPoint, PrefabId } from '../CityMapData';
import { PrefabRegistry } from '../PrefabRegistry';
import { createSubject3Materials } from '../../subject3/materials';
import { RoadsidePlacement } from '../RoadsidePlacement';
import { distanceToCityCorridor } from './CityMainV6Geography';
import { addV61Street, cityV61Snap, connectV61Street } from './CityMainV61Corridors';
import { trimCityJunctionApproaches } from './CityMainUrbanConnections';
import { setJunctionPavementFootprint } from '../JunctionSurface';
import { syncConnections, sampleAt, polylineLength, rotatePoint } from '../geometry';

export function districtV61(p:CityPoint):string {
  if(p.z>1050)return p.x>350?'tonggang':'nancheng';
  if(p.x< -850&&p.z> -1500)return 'xixing';
  if(p.z< -800)return 'xinghu';
  if(p.x< -800)return 'xixing';
  if(p.x<80)return 'qinghe';
  if(p.x<850)return 'jincheng';return 'chunhui';
}
export function addV61Extensions(map:CityMapData):void {
  // Continue the existing eastern street end, avoiding a collinear overlap.
  const approach=map.roads.find(r=>r.id==='v4-central-split')!,a={...approach.centerline.at(-1)!},b=cityV61Snap(map,{x:1960,y:0,z:900},r=>r.id.startsWith('east-main-aux:frontage'));
  const east=addV61Street(map,'v61-exhibition-road','会展路',[a,{x:1850,y:0,z:350},{x:2280,y:0,z:350},{x:2290,y:0,z:860},b],4);
  // The university's northern precinct uses existing external frontage access;
  // a modest spur crosses the ring at an actual bridge, not a new interchange.
  const northStart=cityV61Snap(map,{x:750,y:0,z:-1400},r=>r.id.startsWith('direct-north:frontage-1-'));
  const north=addV61Street(map,'v61-university-north','求是路',[northStart,{x:800,y:0,z:-1760},{x:1100,y:0,z:-1760}],2);
  const sportsStart=cityV61Snap(map,{x:1660,y:0,z:938},r=>r.roadNameId==='v6-port-frontage'),sportsEnd=cityV61Snap(map,{x:1410,y:0,z:1320},r=>r.roadNameId==='v6-logistics-one');
  const sports=addV61Street(map,'v61-sports-road','体育路',[sportsStart,{x:1700,y:0,z:1040},{x:1700,y:0,z:1280},sportsEnd],4);
  map.connectionPorts!.push({id:'v61-research-end',label:'科研园尽端（封闭）',endpoint:{roadId:north.id,end:'end'}});
  map.objects.push({id:'v61-research-end-rail',prefabId:'guardrail',position:{...north.centerline.at(-1)!},rotation:Math.PI/2,groupId:'v61-closed-ends'});
  connectV61Street(map,east);connectV61Street(map,north);connectV61Street(map,sports);
  syncConnections(map);trimCityJunctionApproaches(map,false);for(const j of map.intersections)setJunctionPavementFootprint(j,map);
}

export function placeV61Anchors(map:CityMapData,context:CityMapData=map):void {
  const materials=createSubject3Materials(),prefabs=new PrefabRegistry(materials),placement=new RoadsidePlacement(context);
  const reserved:{p:CityPoint;r:number}[]=[];
  const place=(id:string,name:string,prefabId:PrefabId,target:CityPoint,scale:{x:number;y:number;z:number},facade?:CityFacade,range=120,rotation=0):CityObject=>{
    const prefab=prefabs.entries.get(prefabId)!,radius=Math.hypot(prefab.size[0]*scale.x,prefab.size[2]*scale.z)/2,height=prefab.size[1]*scale.y;
    let position:CityPoint|undefined;
    const candidates=[{...target}];for(let radius=15;radius<=range;radius+=15)for(let i=0;i<16;i++)candidates.push({x:target.x+Math.cos(i*Math.PI/8)*radius,y:target.y??0,z:target.z+Math.sin(i*Math.PI/8)*radius});
    for(const p of candidates) {
      // Long halls and old-station buildings use their rotated footprint; a
      // bounding circle would reject perfectly usable narrow urban parcels.
      let clear=true;const w=prefab.size[0]*scale.x,d=prefab.size[2]*scale.z;
      for(let x=-w/2;x<=w/2+.001&&clear;x+=Math.min(5,w))for(let z=-d/2;z<=d/2+.001;z+=Math.min(5,d)) {
        const q=rotatePoint({x,z},rotation),sample={x:p.x+q.x,y:p.y??0,z:p.z+q.z};
        if(!placement.permits(sample,.7,height)||map.environment.corridors!.some(c=>distanceToCityCorridor(sample,c.centerline)<c.width/2+2)){clear=false;break;}
      }
      if(!clear)continue;
      if(prefab.solid&&reserved.some(q=>Math.hypot(q.p.x-p.x,q.p.z-p.z)<q.r+radius+8))continue;
      position=p;break;
    }
    if(!position)throw new Error('V6.1 no safe landmark parcel for '+name);
    // A deliberate parcel replaces conflicting old filler, not the whole city.
    map.objects=map.objects.filter(o=>o.id.startsWith('v61-')||o.prefabId==='water'||o.prefabId==='waterway'||o.prefabId==='railway_track'||Math.hypot(o.position.x-position!.x,o.position.z-position!.z)>radius+15);
    const o:CityObject={id,prefabId,position,rotation,scale,facade,label:name,color:facade==='office'?'#d3dce0':'#e5deca',district:districtV61(position),groupId:'v61-landmarks',...(facade?{buildingShape:prefabId==='school'?'courtyard' as const:'chamfered' as const}:{})};map.objects.push(o);
    if(prefab.solid)reserved.push({p:position,r:radius});return o;
  };
  const landmark=(id:string,name:string,o:CityObject,roadIds:string[])=>map.environment.landmarks!.push({id,name,position:{...o.position},roadIds});
  const roads=(key:string)=>map.roads.filter(r=>r.roadNameId===key).map(r=>r.id);
  const station=place('v61-city-station','城站','commercial',{x:-1320,y:0,z:280},{x:1.55,y:1.5,z:.8},'old-town',30,Math.PI/2);
  landmark('west-city-station','城站',station,roads('v61-station-forecourt'));
  place('v61-station-square','城站广场','hardscape',{x:-1308,y:0,z:275},{x:.5,y:1,z:1.5},undefined,70);
  for(const z of [210,350])place('v61-station-dropoff-'+z,'公交 / 出租落客区','parking',{x:-1310,y:0,z},{x:1,y:1,z:1},undefined,50,Math.PI/2);
  place('v61-station-bus','城站公交站','bus_stop',{x:-1295,y:0,z:300},{x:1,y:1,z:1},undefined,35);
  for(const z of [195,275])place('v61-station-shop-'+z,'站前老商业','commercial',{x:-1230,y:0,z},{x:.45,y:1,z:.6},'old-town',45);
  const rail=map.environment.corridors!.find(c=>c.kind==='railway')!.centerline;
  for(const side of [-1,1])for(let z=180;z<=380;z+=20) {
    const p=rail.reduce((best,p)=>Math.abs(p.z-z)<Math.abs(best.z-z)?p:best,rail[0]!);
    map.objects.push({id:`v61-station-platform-${side}-${z}`,prefabId:'station_platform',position:{x:p.x+side*10,y:0,z},rotation:0,groupId:'v61-station-platforms'});
  }
  place('v61-zhongshan-square','中山广场','hardscape',{x:-1170,y:0,z:230},{x:2,y:1,z:1.6},undefined,60);
  const government=place('v61-government','清江市人民政府','school',{x:-370,y:0,z:65},{x:1.9,y:1.7,z:2},'campus',160);
  landmark('qingjiang-government','清江市人民政府',government,roads('v5-civic-block-road'));
  const square=place('v61-people-square','人民广场','hardscape',{x:government.position.x,y:0,z:government.position.z+75},{x:2,y:1,z:2.4},undefined,90);
  landmark('people-square','人民广场',square,roads('v5-civic-middle'));
  const museum=place('v61-museum','清江博物馆','school',{x:-360,y:0,z:290},{x:1.5,y:1.15,z:2.1},'campus',130);
  landmark('qingjiang-museum','清江博物馆',museum,roads('v6-civic-qinghe'));
  for(const side of [-1,1])for(let row=0;row<4;row++)place(`v61-civic-tree-${side}-${row}`,'政务绿地','tree',{x:square.position.x+side*45,y:0,z:square.position.z-25+row*17},{x:1,y:1.1,z:1},undefined,30);
  const university=place('v61-university-library','清江大学图书馆','school',{x:530,y:0,z:-1120},{x:1.5,y:1.6,z:1.8},'campus',170);
  landmark('qingjiang-university','清江大学',university,roads('v5-north-campus'));
  place('v61-university-north-building','清江大学北区教学楼','school',{x:900,y:0,z:-1680},{x:1.5,y:1.1,z:1.8},'campus',90);
  place('v61-university-dorm','清江大学北区宿舍','residential_mid',{x:1040,y:0,z:-1660},{x:1.2,y:1.1,z:1.2},'campus',90);
  const exhibition=place('v61-exhibition','清江国际会展中心','commercial',{x:2070,y:0,z:530},{x:2.8,y:2.1,z:2.6},'office',180);
  landmark('qingjiang-exhibition','清江国际会展中心',exhibition,roads('v61-exhibition-road'));
  place('v61-exhibition-square','会展广场','hardscape',{x:exhibition.position.x,y:0,z:exhibition.position.z+100},{x:2.5,y:1,z:2.3},undefined,100);
  for(const x of [1940,2080,2210])place('v61-exhibition-parking-'+x,'会展停车场','parking',{x,y:0,z:740},{x:2,y:1,z:2},undefined,90);
  const sports=place('v61-stadium','清江体育中心','stadium',{x:1590,y:0,z:1160},{x:1,y:1,z:1},undefined,200);
  landmark('qingjiang-sports','清江体育中心',sports,roads('v61-sports-road'));
  place('v61-sports-hall','清江体育馆','commercial',{x:sports.position.x-160,y:0,z:sports.position.z},{x:1.5,y:2.3,z:1.7},'office',100);
  place('v61-sports-parking','体育中心停车场','parking',{x:sports.position.x,y:0,z:sports.position.z+160},{x:2,y:1,z:2},undefined,100);
  const tower=map.objects.filter(o=>o.groupId==='v6-finance'&&o.prefabId==='office').sort((a,b)=>(b.scale?.y??1)-(a.scale?.y??1))[0]!;
  tower.scale!.y=5.4;tower.label='锦城中心';tower.buildingShape='chamfered';
  landmark('jincheng-center','锦城中心',tower,roads('v5-finance-road'));
  for(const [id,target] of [['west-depot',{x:-1880,y:0,z:820}],['south-workshop',{x:-600,y:0,z:2020}],['port-warehouse',{x:1300,y:0,z:1990}],['east-research',{x:2070,y:0,z:1030}]] as const)place('v61-'+id,id==='east-research'?'春晖科研楼':id==='west-depot'?'西兴机务工坊':id==='port-warehouse'?'通港物流仓库':'南城厂房',id==='east-research'?'office':'industrial',target,{x:1.6,y:id==='east-research'?1.4:1,z:1.6},id==='east-research'?'office':'industrial',100);
  // A few readable ground-level landmark signs; the normal topology signs still
  // own all motorway guidance and post clearance calibration.
  for(const l of map.environment.landmarks!) {
    let best=Infinity,p:CityPoint|undefined;
    for(const road of map.roads.filter(r=>l.roadIds.includes(r.id)))for(let station=5;station<polylineLength(road.centerline);station+=10){const q=sampleAt(road.centerline,station).point,gap=Math.hypot(q.x-l.position.x,q.z-l.position.z);if(gap<best){best=gap;p=q;}}
    if(!p)continue;
    place('v61-guide-'+l.id,l.name,'guide_sign',{x:p.x+22,y:0,z:p.z+25},{x:1,y:1,z:1},undefined,90);
  }
  prefabs.dispose();Object.values(materials).forEach(m=>m.dispose());
}

export function nameV61Districts(map:CityMapData):void {
  map.name='清江市 · City Main';
  map.environment.districts=[{id:'xixing',name:'西兴',description:'老城、城站、传统商业与铁路街巷'},{id:'qinghe',name:'清和',description:'政务文化、人民广场与清和河'},{id:'jincheng',name:'锦城',description:'金融商业、高层核心与锦城中心'},{id:'xinghu',name:'星湖',description:'大学、科研、星湖公园'},{id:'chunhui',name:'春晖',description:'现代新城、科创与会展'},{id:'tonggang',name:'通港',description:'物流、仓储、运输'},{id:'nancheng',name:'南城',description:'工业、中低密度住宅、城市发展空地'}];
  for(const r of map.roads)r.district=districtV61(sampleAt(roadPointsForName(r),polylineLength(roadPointsForName(r))/2).point);
  for(const o of map.objects)o.district=districtV61(o.position);
  Object.assign(map.roadNames!,{'west-avenue':{primaryText:'城站路',kind:'urban'},'v5-west-east-road':{primaryText:'人民路',kind:'urban'},'v5-west-market-road':{primaryText:'解放街',kind:'urban'},'v5-west-lane':{primaryText:'胜利街',kind:'urban'},'v5-west-south-lane':{primaryText:'西兴南街',kind:'urban'},'v5-civic-avenue':{primaryText:'人民大道',kind:'urban'},'v5-civic-north':{primaryText:'府前路',kind:'urban'},'v5-north-campus':{primaryText:'学府路',kind:'urban'},'v6-campus-west':{primaryText:'博学路',kind:'urban'},'east-avenue':{primaryText:'春晖大道',kind:'urban'},'industrial-avenue':{primaryText:'南城工业大道',kind:'urban'}});
  map.roadNames!['v61-zhongshan-road']={primaryText:'中山路',kind:'urban'};
  for(const r of map.roads)if(r.roadNameId==='central-avenue'&&r.district==='xixing')r.roadNameId='v61-zhongshan-road';
  // Distinct authoring profiles also remain visible through the existing kit.
  for(const r of map.roads.filter(r=>r.type!=='highway'&&r.type!=='ramp_1')) {
    if(r.district==='xixing'){r.decorationProfile='old-town';if(r.sidewalk?.enabled)r.sidewalk.width=Math.min(1.8,r.sidewalk.width);}
    else if(r.district==='qinghe')r.decorationProfile='civic-avenue';
    else if(['jincheng','chunhui'].includes(r.district!))r.decorationProfile='new-district';
    else if(r.district==='xinghu')r.decorationProfile='park-edge';
    else r.decorationProfile=r.laneCount>=4?'industrial':'collector';
  }
  for(const o of map.objects.filter(o=>o.prefabId.startsWith('streetlight')))o.prefabId=o.district==='xixing'?'streetlight_small':['qinghe','jincheng','chunhui'].includes(o.district!)?'streetlight_dual':o.district==='tonggang'?'streetlight_highway':'streetlight';
  for(const o of map.objects.filter(o=>o.prefabId==='tree'))o.color=o.district==='xixing'?'#7d886a':o.district==='qinghe'?'#658351':o.district==='xinghu'?'#739865':'#7a9566';
}
function roadPointsForName(r:CityMapData['roads'][number]):CityPoint[]{return r.centerline;}

export function decorateV61Streets(map:CityMapData,context:CityMapData):void {
  const placement=new RoadsidePlacement(context);let serial=0;
  for(const r of map.roads.filter(r=>r.id.startsWith('v61-'))) {
    const length=polylineLength(r.centerline),spacing=r.district==='tonggang'?125:r.district==='xixing'?85:95;
    for(let station=30;station<length-25;station+=spacing)for(const side of [-1,1]) {
      const s=sampleAt(r.centerline,station),offset=(r.laneCount*r.laneWidth/2+(r.sidewalk?.width??0)+.7)*side;
      const p={x:s.point.x-s.tangent.z*offset,y:0,z:s.point.z+s.tangent.x*offset};
      if(!placement.permits(p,.6,11))continue;
      if(map.objects.some(o=>o.prefabId.startsWith('streetlight')&&Math.hypot(o.position.x-p.x,o.position.z-p.z)<25))continue;
      map.objects.push({id:'v61-road-lamp-'+serial++,prefabId:r.district==='xixing'?'streetlight_small':r.district==='tonggang'?'streetlight_highway':'streetlight_dual',position:p,rotation:Math.atan2(s.tangent.x,s.tangent.z)+(side===1?0:Math.PI),district:r.district,groupId:'v61-road-lamps'});
    }
  }
}
