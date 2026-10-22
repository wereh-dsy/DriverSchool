import { RoutePlanner, type RouteLocation } from './RoutePlanner';
import { NavigationController } from './NavigationController';
import type { RoadNetworkData, RoadPoint, RoadSegmentData } from './RoadNetwork';
import { projectWorldToRoad } from './RoadNetwork';
import { buildCityRoadNetwork } from '../city/CityRoadNetwork';
import type { CityMapData } from '../city/CityMapData';
import { roadPoints } from '../city/geometry';

export function runNavigationSelfTest(regional?:CityMapData) {
  let assertions=0;
  const assert=(value:unknown,message:string)=>{assertions++;if(!value)throw new Error(`Navigation: ${message}`);};
  const road=(id:string,points:RoadPoint[],direction:RoadSegmentData['travelDirection']='forward'):RoadSegmentData=>({id,name:id,centerline:points,width:8,length:100,laneCountPerDirection:1,laneWidth:4,travelDirection:direction,speedLimit:60,roadType:'urban'});
  const a=road('a',[{x:0,y:0,z:0},{x:0,y:0,z:-100}]);
  const b=road('b',[{x:0,y:0,z:-100},{x:100,y:0,z:-100}]);
  const top=road('top',[{x:-50,y:8,z:-50},{x:50,y:8,z:-50}]);
  const reverse=road('reverse',[{x:100,y:0,z:-100},{x:200,y:0,z:-100}],'reverse');
  const network:RoadNetworkData={mapId:'navigation-test',bounds:{minimumX:-100,maximumX:250,minimumZ:-200,maximumZ:100},segments:[a,b,top,reverse],intersections:[],routing:{connections:[{fromRoadId:'a',fromEnd:'end',toRoadId:'b',toEnd:'start'},{fromRoadId:'reverse',fromEnd:'start',toRoadId:'b',toEnd:'end'}],places:[]}};
  const planner=new RoutePlanner(network);
  const location=(id:string,along:number,direction?:RouteLocation['direction']):RouteLocation=>({roadId:id,along,point:planner.pointAt(id,along),label:id,direction});
  const route=planner.plan(location('a',25),location('b',75));
  assert(route&&Math.abs(route.distance-150)<.001,'partial start/end distance uses the selected stations');
  assert(route?.maneuvers.some(m=>m.text.includes('右转')),'authored right turn produces guidance');
  assert(!planner.plan(location('b',20),location('a',50)),'one-way transition cannot be traversed backwards');
  assert(!planner.plan(location('a',20),location('top',50)),'overlapping upper road never connects geometrically');
  assert(!planner.plan(location('a',80),location('a',20)),'no invented mid-road U-turn on a one-way road');
  assert(planner.plan(location('reverse',90),location('reverse',10))?.distance===80,'reverse-authored road is routable in its legal direction');
  assert(!planner.plan(location('reverse',10),location('reverse',90)),'reverse-authored road rejects illegal direction');
  const upper=planner.locate({x:0,y:8,z:-50,yaw:-Math.PI/2});
  assert(upper?.roadId==='top','map matching respects support height');
  const lower=planner.locate({x:0,y:0,z:-50,yaw:0});
  assert(lower?.roadId==='a','map matching does not jump to the bridge');
  assert(projectWorldToRoad(network,0,-50,8)?.segmentId==='top','shared road-name/speed-limit projection selects the upper layer');
  assert(projectWorldToRoad(network,0,-50,0)?.segmentId==='a','shared road-name projection keeps the lower layer');
  const controller=new NavigationController();controller.configure(network);controller.update(0,{x:0,y:0,z:-25,yaw:0},0);
  assert(controller.start(location('b',75)),'live route starts at vehicle position');
  controller.update(.2,{x:0,y:0,z:-80,yaw:0},15);
  assert(Math.abs(controller.state.remainingDistance-95)<.01,'remaining distance advances along the route');
  controller.update(.2,{x:75,y:0,z:-100,yaw:-Math.PI/2},0);
  assert(controller.state.status==='arrived','arrival requires the destination road/layer and proximity');
  controller.update(0,{x:0,y:0,z:-25,yaw:0},0);controller.start(location('b',75));controller.update(.2,{x:75,y:8,z:-100,yaw:-Math.PI/2},10);
  assert(controller.state.status!=='arrived','passing above the endpoint cannot arrive');
  controller.configure(undefined);assert(!controller.planner&&controller.state.route===null,'leaving supported map clears the session');
  const dual=road('dual',[{x:0,y:0,z:0},{x:0,y:0,z:-100}],'two-way');
  const dualPlanner=new RoutePlanner({...network,segments:[dual],routing:{connections:[],places:[]}});
  assert(dualPlanner.locate({x:0,y:0,z:-50,yaw:Math.PI})?.direction==='reverse','two-way start follows actual vehicle heading');
  const detour=road('detour',[{x:0,y:0,z:-100},{x:-100,y:0,z:-150},{x:0,y:0,z:-200},{x:0,y:0,z:-100}]);
  const rerouteNetwork:RoadNetworkData={...network,segments:[a,b,detour],routing:{places:[],connections:[...network.routing!.connections,{fromRoadId:'a',fromEnd:'end',toRoadId:'detour',toEnd:'start'},{fromRoadId:'detour',fromEnd:'end',toRoadId:'b',toEnd:'start'}]}};
  controller.configure(rerouteNetwork);controller.update(0,{x:0,y:0,z:-25,yaw:0},0);controller.start(location('b',75));
  for(let i=0;i<9;i++)controller.update(.2,{x:-80,y:0,z:-140,yaw:Math.atan2(100,50)},12);
  assert(controller.state.route?.sections[0]?.road.id==='detour','sustained departure replans from the actual directed road');
  const gapB=road('gap-b',[{x:20,y:0,z:-130},{x:100,y:0,z:-130}]);
  const gapNetwork:RoadNetworkData={...network,segments:[a,gapB],intersections:[{id:'gap',center:{x:0,y:0,z:-130},halfExtentX:30,halfExtentZ:35,arms:[]}],routing:{places:[],connections:[{fromRoadId:'a',fromEnd:'end',toRoadId:'gap-b',toEnd:'start',via:{x:0,y:0,z:-130}}]}};
  controller.configure(gapNetwork);controller.update(0,{x:0,y:0,z:-50,yaw:0},0);
  controller.start({roadId:'gap-b',along:60,point:{x:80,y:0,z:-130},label:'gap-b'});
  for(let i=0;i<9;i++)controller.update(.2,{x:0,y:0,z:-115,yaw:0},0);
  assert(controller.state.status==='navigating','authored junction connector does not trigger false rerouting');
  const inJunction=controller.planner!.locate({x:0,y:0,z:-125,yaw:-Math.PI/2});
  assert(inJunction?.roadId==='gap-b'&&inJunction.access?.length,'navigation can start inside junction pavement');
  const through=planner.planThrough(location('a',25),location('b',75),[location('a',50),location('b',20)]);
  assert(through?.distance===150&&through.waypoints.length===2,'multiple waypoints preserve the complete ordered route distance');
  assert(through?.waypoints[0]?.distance===25&&through.waypoints[1]?.distance===95,'waypoint distances include all preceding legs');
  assert(through?.maneuvers.filter(m=>m.text==='到达目的地').length===1&&through.maneuvers.filter(m=>m.text.includes('经过途经点')).length===2,'only the final endpoint is announced as the destination');
  assert(!planner.planThrough(location('a',25),location('b',75),[location('top',50)]),'an unreachable intermediate layer rejects the entire itinerary');
  assert(!planner.planThrough(location('a',25),location('b',75),[location('b',80),location('a',50)]),'waypoints cannot silently be reordered to manufacture a route');
  const dl=(along:number):RouteLocation=>({roadId:'dual',along,point:dualPlanner.pointAt('dual',along),label:'dual'});
  assert(!dualPlanner.planThrough({...dl(20),direction:'forward'},dl(40),[dl(60)]),'a two-way waypoint cannot invent a mid-road direction reversal');
  controller.configure(network);controller.update(0,{x:0,y:0,z:-25,yaw:0},0);
  assert(controller.start(location('b',75),[location('a',60),location('b',30)]),'navigation starts with an ordered itinerary');
  controller.update(.2,{x:0,y:8,z:-60,yaw:0},12);
  assert(controller.state.waypointIndex===0,'passing above a waypoint does not complete it');
  controller.update(.2,{x:0,y:0,z:-60,yaw:0},12);
  assert(controller.state.waypointIndex===1&&controller.state.status==='navigating','passing a waypoint advances without ending navigation or requiring a stop');
  controller.update(.2,{x:30,y:0,z:-100,yaw:-Math.PI/2},12);
  assert(controller.state.waypointIndex===2&&controller.state.status==='navigating','waypoints are completed in their configured order');
  controller.update(.2,{x:75,y:0,z:-100,yaw:-Math.PI/2},0);
  assert(controller.state.status==='arrived','the final destination arrives after every intermediate stop');
  controller.configure(rerouteNetwork);controller.update(0,{x:0,y:0,z:-25,yaw:0},0);controller.start(location('b',75),[location('a',60),location('b',30)]);controller.update(.2,{x:0,y:0,z:-60,yaw:0},12);
  for(let i=0;i<9;i++)controller.update(.2,{x:-80,y:0,z:-140,yaw:Math.atan2(100,50)},12);
  assert(controller.state.route?.sections[0]?.road.id==='detour'&&controller.state.route.waypoints.length===1&&controller.state.route.waypoints[0]?.location.roadId==='b','rerouting retains unvisited stops and omits the already passed waypoint');
  const loop=road('loop',[{x:100,y:0,z:-100},{x:100,y:0,z:0},{x:0,y:0,z:0}]),loopNetwork:RoadNetworkData={...network,segments:[a,b,loop],routing:{places:[],connections:[{fromRoadId:'a',fromEnd:'end',toRoadId:'b',toEnd:'start'},{fromRoadId:'b',fromEnd:'end',toRoadId:'loop',toEnd:'start'},{fromRoadId:'loop',fromEnd:'end',toRoadId:'a',toEnd:'start'}]}};
  controller.configure(loopNetwork);controller.update(0,{x:0,y:0,z:-25,yaw:0},0);controller.start(location('a',30),[location('a',80)]);controller.update(.2,{x:0,y:0,z:-30,yaw:0},0);
  assert(controller.state.status==='navigating'&&controller.state.waypointIndex===0&&controller.state.remainingDistance>300,'a repeated road near the destination cannot bypass an unvisited waypoint');
  controller.clear();assert(controller.state.route===null&&controller.state.waypointIndex===0,'clearing navigation removes the waypoint itinerary');
  const prohibited=buildCityRoadNetwork({id:'junction',name:'junction',version:1,sectorSize:100,bounds:{minX:-200,maxX:200,minZ:-200,maxZ:200},
    roads:[{id:'in',type:'urban_2lane',centerline:[{x:0,y:0,z:100},{x:0,y:0,z:10}],laneCount:2,laneWidth:4,travelDirection:'two-way',speedLimit:40},
      {id:'out',type:'urban_2lane',centerline:[{x:10,y:0,z:0},{x:100,y:0,z:0}],laneCount:2,laneWidth:4,travelDirection:'two-way',speedLimit:40}],
    intersections:[{id:'j',type:'cross_4lane',position:{x:0,y:0,z:0},rotation:0,signalized:false,connections:[{roadId:'in',end:'end',port:'south'},{roadId:'out',end:'start',port:'east'}],approaches:{south:{lanes:['straight']}}}],objects:[],environment:{districts:[],spawnPoints:[{id:'s',position:{x:0,y:0,z:80},rotation:0}]}});
  assert(!prohibited.routing!.connections.some(c=>c.fromRoadId==='in'&&c.toRoadId==='out'),'routing obeys authored approach movements without changing assistance lane connections');
  let regionalRoutes=0;
  if(regional) {
    const n=buildCityRoadNetwork(regional),p=new RoutePlanner(n),spawn=regional.environment.spawnPoints[0]!;
    // CityGround falls back to the first road when an old authored spawn is off pavement.
    const first=n.segments[0]!,a=first.centerline[0]!,b=first.centerline[1]!,dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
    const fallback={x:(a.x+b.x)/2-dz/len*first.laneWidth/2,z:(a.z+b.z)/2+dx/len*first.laneWidth/2,y:((a.y??0)+(b.y??0))/2,yaw:spawn.rotation};
    const start=p.locate({...spawn.position,y:spawn.position.y??0,yaw:spawn.rotation})??p.locate(fallback);
    assert(start,'regional runtime spawn is on a routable road');
    assert(n.segments.some(r=>r.name&&r.routeNumber),'runtime map carries existing highway names and numbers');
    for(const service of regional.regional!.highways!.services) {
      let found=false;
      const roads=regional.roads.filter(r=>service.roadIds.includes(r.id)&&r.type!=='ramp_1');
      for(const r of roads){const points=roadPoints(r),point=points[Math.floor(points.length/2)]!;const dest=p.matches(point.x,point.z,30).find(m=>m.location.roadId===r.id)?.location;if(dest&&start){const planned=p.plan(start,dest);if(planned){regionalRoutes++;found=true;assert(planned.points.every(q=>Number.isFinite(q.x)&&Number.isFinite(q.z)),'regional route geometry finite');for(let i=1;i<planned.sections.length;i++){const prev=planned.sections[i-1]!,next=planned.sections[i]!;assert(n.routing!.connections.some(c=>c.fromRoadId===prev.road.id&&c.fromEnd===(prev.forward?'end':'start')&&c.toRoadId===next.road.id&&c.toEnd===(next.forward?'start':'end')),'every regional transition is authored and directed');}break;}}}
      assert(found,`city spawn can reach service ${service.name}`);
    }
  }
  return {assertions,regionalRoutes};
}
