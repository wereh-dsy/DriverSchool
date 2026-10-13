import type { CityMapData, CityRoad } from './CityMapData';
import type { RoadSignDefinition } from './RoadSignData';
import { polylineLength, roadEdges, roadPoints, rotatePoint, sampleAt } from './geometry';
import { RoadClearance } from './RoadClearance';
import { ROAD_SIGN_POST_Z, signDimensions } from './RoadSignTemplates';

/** Authoring migration: retain sign IDs and destinations, anchor every direction
 * board over its actual roadway, and station away from upper decks/other boards. */
export function placeOverheadDirectionSigns(map:CityMapData):{placed:number;shifted:number;failed:string[]} {
  const roads=new Map(map.roads.map(r=>[r.id,r])),paths=new Map(map.roads.map(r=>[r.id,roadPoints(r)])),clearance=new RoadClearance(map),placed:RoadSignDefinition[]=[],failed:string[]=[];let shifted=0;
  const linked=new Map<string,{roadId:string;end:'start'|'end'}[]>();
  for(const link of map.roadLinks??[])for(const [a,b]of [[link.from,link.to],[link.to,link.from]]){const key=a!.roadId+':'+a!.end,list=linked.get(key)??[];list.push(b!);linked.set(key,list);}
  const locate=(start:CityRoad,station:number,reverse:boolean,move:number)=>{
    let road=start,at=station+(reverse?-move:move),backwards=reverse;const visited=new Set<string>();
    while(at<0||at>polylineLength(paths.get(road.id)!)){
      if(visited.has(road.id))return undefined;visited.add(road.id);
      const path=paths.get(road.id)!,length=polylineLength(path),end=at<0?'start':'end',overflow=at<0?-at:at-length,oldFrame=sampleAt(path,at<0?0:length),travel=backwards?-1:1;
      const candidates=(linked.get(road.id+':'+end)??[]).map(e=>({e,road:roads.get(e.roadId)!})).filter(q=>q.road.laneCount===road.laneCount&&q.road.roadNameId===road.roadNameId&&q.road.highwayTransition===undefined);
      const next=candidates.find(q=>{const p=paths.get(q.road.id)!,s=sampleAt(p,q.e.end==='start'?0:polylineLength(p)),sign=(move<0?q.e.end==='end':q.e.end==='start')?1:-1;return (s.tangent.x*oldFrame.tangent.x+s.tangent.z*oldFrame.tangent.z)*sign*travel>.95;});
      if(!next)return undefined;road=next.road;const nextLength=polylineLength(paths.get(road.id)!);at=next.e.end==='start'?overflow:nextLength-overflow;backwards=move<0?next.e.end==='start':next.e.end==='end';
    }
    return{road,at,reverse:backwards};
  };
  const oldSignOrder=[...(map.signs??[])].sort((a,b)=>Number(b.type==='EXPRESSWAY_DIVERGE')-Number(a.type==='EXPRESSWAY_DIVERGE')||Number(polylineLength(paths.get(b.roadId)!)<35)-Number(polylineLength(paths.get(a.roadId)!)<35)||a.id.localeCompare(b.id));
  const fit=(sign:RoadSignDefinition,road:CityRoad,side=1,suspended=false,cantilever=false,extra=0):RoadSignDefinition=>{
    const result={...sign,position:{...sign.position},destinations:sign.destinations.map(d=>({...d}))},edges=roadEdges(road),half=road.laneCount*road.laneWidth/2;
    delete result.postOffset;delete result.gantryPosts;delete result.postBaseY;delete result.mountHeight;
    const enclosed=road.structure?.enclosure&&road.structure.enclosure.kind!=='cutting';
    if(enclosed||suspended){result.template='ceiling';result.size='medium';result.mountHeight=enclosed?road.structure!.enclosure!.clearance:clearance.lowestDeckHeight(sign.position,(sign.position.y??0)+6.5,(sign.position.y??0)+25,road.id,0)!-.65-(sign.position.y??0);}
    else if(!cantilever&&(road.shoulders?.left??0)>=.75&&(road.shoulders?.right??0)>=.75&&(sign.highwayLayout||sign.type.startsWith('EXPRESSWAY')||sign.type==='RAMP_CONFIRMATION'&&road.id.startsWith('regional:'))){
      result.template='highway-gantry';result.size='large';result.highwayLayout=true;
      const left=sign.laneDirection==='forward'?-edges.left:edges.right,right=sign.laneDirection==='forward'?edges.right:-edges.left;
      result.gantryPosts=[-Math.max(half+.65,left-.35),Math.max(half+.65,right-.35)];
    }else{
      result.template='gantry';result.size=sign.destinations.length>2||sign.highwayLayout?'large':'medium';
      result.postOffset=side*(Math.max(-edges.left,edges.right)+(road.sidewalk?.enabled?road.sidewalk.width:0)+1+extra);
      if((sign.position.y??0)>.5)result.postBaseY=0;
    }
    result.approachRoadNameId=road.roadNameId;
    return result;
  };
  const safe=(sign:RoadSignDefinition):boolean=>{
    const y=sign.position.y??0,dims=signDimensions(sign.template,sign.size,sign.postOffset,sign.gantryPosts,sign.mountHeight),point=(x:number,z=0)=>{const p=rotatePoint({x,z},sign.heading);return{x:sign.position.x+p.x,z:sign.position.z+p.z};};
    if(sign.template==='ceiling'&&(!Number.isFinite(sign.mountHeight)||sign.mountHeight!<5.75))return false;
    for(const x of dims.posts){const p=point(x,ROAD_SIGN_POST_Z);if(clearance.roadAt(p,.45,sign.postBaseY??y,y+dims.poleTop,undefined,undefined,true)||clearance.roadAt(p,.3,sign.postBaseY??y,y+dims.poleTop,sign.roadId)||clearance.junctionAt(p,.6,sign.postBaseY??y,y+dims.poleTop))return false;}
    const road=roads.get(sign.roadId)!;
    for(let i=0;i<=Math.ceil(dims.width);i++)if(clearance.roadAt(point(-dims.width/2+dims.width*i/Math.ceil(dims.width)),.15,y+dims.bottom-.2,y+dims.bottom+dims.height+.2,sign.roadId))return false;
    if(road.structure?.enclosure&&road.structure.enclosure.kind!=='cutting'&&dims.bottom+dims.height>road.structure.enclosure.clearance-.1)return false;
    if(placed.some(other=>Math.abs((other.position.y??0)-y)<4&&Math.hypot(other.position.x-sign.position.x,other.position.z-sign.position.z)<12))return false;
    return true;
  };
  for(const original of oldSignOrder){const road=roads.get(original.roadId)!,path=paths.get(road.id)!;
    let station=original.stationMetres;
    if(station===undefined){let best=Infinity,distance=0;for(let i=1;i<path.length;i++){const a=path[i-1]!,b=path[i]!,dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((original.position.x-a.x)*dx+(original.position.z-a.z)*dz)/(l*l))),gap=Math.hypot(original.position.x-a.x-dx*t,original.position.z-a.z-dz*t);if(gap<best){best=gap;station=distance+t*l;}distance+=l;}}
    let result:RoadSignDefinition|undefined;
    const reverse=original.laneDirection==='reverse';
    for(const move of [0,-12,12,-25,25,-45,45,-70,70,-100,100,-160,160,-240,240]){
      if(original.advanceMetres!==undefined&&move>(original.actualAdvanceMetres??original.advanceMetres))continue;
      const nominalAdvance=original.advanceMetres;
      if(original.highwayLayout&&nominalAdvance!==undefined&&Math.abs((original.actualAdvanceMetres??nominalAdvance)-move-nominalAdvance)>30)continue;
      const location=locate(road,station!,reverse,move);if(!location)continue;
      const frame=sampleAt(paths.get(location.road.id)!,location.at),candidate=fit({...original,roadId:location.road.id,laneDirection:location.reverse?'reverse':'forward',position:frame.point,heading:Math.atan2(-frame.tangent.x,-frame.tangent.z)+(location.reverse?Math.PI:0),stationMetres:location.at},location.road);
      if(candidate.advanceMetres!==undefined&&move!==0){candidate.actualAdvanceMetres=Math.max(0,(original.actualAdvanceMetres??candidate.advanceMetres)-move);candidate.destinations=candidate.destinations.map(d=>({...d,distanceMetres:d.distanceMetres===undefined?undefined:Math.max(0,d.distanceMetres-move)}));}
      const alternatives=[candidate,fit(candidate,location.road,-1)];
      for(const extra of [0,3,6,9,12])for(const side of [1,-1])if(Math.max(-roadEdges(location.road).left,roadEdges(location.road).right)+(location.road.sidewalk?.enabled?location.road.sidewalk.width:0)+1+extra<=30)alternatives.push(fit(candidate,location.road,side,false,true,extra));
      if(clearance.lowestDeckHeight(frame.point,(frame.point.y??0)+6.5,(frame.point.y??0)+25,location.road.id,0)!==undefined)alternatives.push(fit(candidate,location.road,1,true));
      result=alternatives.find(safe);if(!result)continue;if(move!==0)shifted++;break;
    }
    if(result)placed.push(result);else failed.push(original.id);
  }
  const byId=new Map(placed.map(s=>[s.id,s]));map.signs=(map.signs??[]).map(s=>byId.get(s.id)??s);
  return {placed:placed.length,shifted,failed};
}
