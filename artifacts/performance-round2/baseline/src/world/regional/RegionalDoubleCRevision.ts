import type { CityMapData, CityPoint, CityRoad, RoadEndpoint } from '../city/CityMapData';
import type { RegionalRoute } from './RegionalData';
import { polylineLength, sampleAt } from '../city/geometry';
import { expandCompactInterchange } from '../city/presets/CompactInterchangePresets';
import { addHighwayTransitions } from './HighwayMarkings';
import { generateHighwaySigns } from './HighwaySigns';
import { RoadClearance } from '../city/RoadClearance';

type Knot = [number, number, number, number, number];
const p = (x: number, z: number, y = 0): CityPoint => ({ x, z, y });
const ease = (t: number) => t * t * (3 - 2 * t);
function curve(knots: Knot[]): CityPoint[] {
  const result: CityPoint[] = [];
  for (let i = 1; i < knots.length; i++) {
    const a = knots[i - 1]!, b = knots[i]!, handle = Math.hypot(b[0] - a[0], b[1] - a[1]) / 3;
    const count = Math.ceil(handle * 3 / 12);
    for (let j = i === 1 ? 0 : 1; j <= count; j++) {
      const t = j / count, u = 1 - t;
      result.push(p(u ** 3 * a[0] + 3 * u * u * t * (a[0] + a[2] * handle) + 3 * u * t * t * (b[0] - b[2] * handle) + t ** 3 * b[0],
        u ** 3 * a[1] + 3 * u * u * t * (a[1] + a[3] * handle) + 3 * u * t * t * (b[1] - b[3] * handle) + t ** 3 * b[1], a[4] + (b[4] - a[4]) * ease(t)));
    }
  }
  return result;
}

/** Offline, local revision of the saved V2; city geometry is never regenerated. */
export function reviseRegionalDoubleC(input: CityMapData): CityMapData {
  if(input.environment.metadata?.highwayNetworkRevision!=='2')throw new Error('The current saved V2 snapshot is required.');
  const map=structuredClone(input),region=map.regional!,system=region.highways!,names=map.roadNames!;
  const roads=new Map(map.roads.map(r=>[r.id,r]));let serial=0;
  const endpoint=(road:CityRoad,end:'start'|'end'):RoadEndpoint=>({roadId:road.id,end});
  const link=(from:RoadEndpoint,to:RoadEndpoint)=>map.roadLinks!.push({id:`regional:v3:link:${serial++}`,from,to});
  const get=(id:string)=>region.routes.find(r=>r.id===id)!;
  const makeRoute = (id: string, name: string, knots: Knot[], lanes = 2, speed = 100) => {
    const centerline = curve(knots), r: RegionalRoute = { id, number: id, name, lanes, speed, terrain: '区域过境通道；边界接续区外高速', centerline, roadIds: [], connectedRoutes: [] };
    region.routes.push(r); names[id] = { primaryText: name, routeNumber: id, kind: 'expressway' };
    const half = lanes * 3.75 / 2 + 3;
    for (const dir of [1, -1]) {
      const points = centerline.map((q, i) => { const a = centerline[Math.max(0, i - 1)]!, b = centerline[Math.min(centerline.length - 1, i + 1)]!, l = Math.hypot(b.x - a.x, b.z - a.z); return p(q.x - (b.z - a.z) / l * half * dir, q.z + (b.x - a.x) / l * half * dir, q.y); });
      if (dir === -1) points.reverse();
      const length = polylineLength(points); let previous: CityRoad | undefined;
      for (let start = 0; start < length; start += 1200) {
        const end = Math.min(length, start + 1200), section = [sampleAt(points, start).point]; let d = 0;
        for (let i = 1; i < points.length; i++) { d += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z); if (d > start && d < end) section.push(points[i]!); }
        section.push(sampleAt(points, end).point);
        const road: CityRoad = { id: `regional:v3:${id}:${dir === 1 ? 'out' : 'in'}:${Math.floor(start / 1200)}`, type: 'highway', centerline: section, curve: 'polyline', laneCount: lanes, laneWidth: 3.75, speedLimit: speed, travelDirection: 'forward', roadNameId: id, designProfile: 'motorway', elevationMode: 'custom', corridorSection: 'GROUND', shoulders: { left: 1, right: 3 }, structure: { barrierEnabled: true, piersEnabled: false, pierSpacing: 60, medianBarrierStyle: 'concrete' }, streetlights: false };
        map.roads.push(road); roads.set(road.id, road); r.roadIds.push(road.id);
        if (previous) link(endpoint(previous, 'end'), endpoint(road, 'start')); previous = road;
      }
    }
    return r;
  };
  const terminal = (route: RegionalRoute, dir: string, finish: boolean) => {
    const list = route.roadIds.map(id => roads.get(id)!).filter(r => r.id.includes(':'+dir));
    return list.find(r => !map.roadLinks!.some(l => (finish ? l.from : l.to).roadId === r.id && list.some(o => o.id === (finish ? l.to : l.from).roadId)))!;
  };
  const projection = (route: RegionalRoute, query: CityPoint, direction?: string) => {
    let best = Infinity, chosen = roads.get(route.roadIds[0]!)!, station = 0;
    for (const id of route.roadIds) { const r = roads.get(id)!; if(direction && !r.id.includes(':'+direction))continue; let d = 0;
      for(let i=1;i<r.centerline.length;i++) {const a=r.centerline[i-1]!,b=r.centerline[i]!,dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((query.x-a.x)*dx+(query.z-a.z)*dz)/(l*l))),distance=Math.hypot(query.x-a.x-dx*t,query.z-a.z-dz*t);if(distance<best){best=distance;chosen=r;station=d+t*l;}d+=l;}
    }
    return {road:chosen,station,point:sampleAt(chosen.centerline,station).point};
  };
  const cut = (route: RegionalRoute, query: CityPoint, outgoing: boolean, direction?: string) => {
    const location=projection(route,query,direction),r=location.road,length=polylineLength(r.centerline),q=location.point;
    if(location.station<.05||length-location.station<.05){
      const desired=outgoing?'start':'end';
      const match=route.roadIds.map(id=>roads.get(id)!).filter(v=>!direction||v.id.includes(':'+direction)).find(v=>{const p=desired==='start'?v.centerline[0]!:v.centerline.at(-1)!;return Math.hypot(p.x-q.x,p.z-q.z)<.1;});
      if(!match)throw new Error('Cannot attach route endpoint '+route.id);
      return {point:q,end:endpoint(match,desired)};
    }
    const head:CityPoint[]=[],tail:CityPoint[]=[];let d=0;
    r.centerline.forEach((v,i)=>{if(i)d+=Math.hypot(v.x-r.centerline[i-1]!.x,v.z-r.centerline[i-1]!.z);if(d<location.station-.04)head.push(v);if(d>location.station+.04)tail.push(v);});
    const next:CityRoad={...structuredClone(r),id:`${r.id}:revision${serial++}`,centerline:[q,...tail]};r.centerline=[...head,q];
    for(const l of map.roadLinks!)for(const e of [l.from,l.to])if(e.roadId===r.id&&e.end==='end')e.roadId=next.id;
    for(const s of [...region.structures,...region.exits])if(s.roadIds.includes(r.id))s.roadIds.push(next.id);
    map.roads.push(next);roads.set(next.id,next);route.roadIds.push(next.id);link(endpoint(r,'end'),endpoint(next,'start'));
    return {point:q,end:outgoing?endpoint(next,'start'):endpoint(r,'end')};
  };
  const stationOn=(points:CityPoint[],query:CityPoint)=>{
    let best=Infinity,station=0,d=0;
    for(let i=1;i<points.length;i++){const a=points[i-1]!,b=points[i]!,dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((query.x-a.x)*dx+(query.z-a.z)*dz)/(l*l))),distance=Math.hypot(query.x-a.x-dx*t,query.z-a.z-dz*t);if(distance<best){best=distance;station=d+t*l;}d+=l;}
    return station;
  };
  const section=(points:CityPoint[],start:number,end:number)=>{
    let d=0;const result=[sampleAt(points,start).point];
    for(let i=1;i<points.length;i++){d+=Math.hypot(points[i]!.x-points[i-1]!.x,points[i]!.z-points[i-1]!.z);if(d>start+.05&&d<end-.05)result.push(points[i]!);}
    result.push(sampleAt(points,end).point);return result;
  };
  // Remove only declared end reconstruction zones. Retained hub ramps and local
  // access roads keep their geometry; displaced mouths are reattached explicitly.
  const pending:{ramp:CityRoad;route:RegionalRoute;off:boolean;dir:string}[]=[];
  const trim=(route:RegionalRoute,start:number,end:number)=>{
    const old=structuredClone(route.centerline),length=polylineLength(old);
    for(const dir of ['out','in']){
      if(start>0)cut(route,sampleAt(old,start).point,dir==='out',dir);
      if(end<length)cut(route,sampleAt(old,end).point,dir==='in',dir);
    }
    const remove=new Set(route.roadIds.filter(id=>{const r=roads.get(id)!,q=sampleAt(r.centerline,polylineLength(r.centerline)/2).point,s=stationOn(old,q);return s<start-.1||s>end+.1;}));
    for(const ramp of map.roads.filter(r=>r.gore))for(const off of [true,false]){
      if(!(off?ramp.gore!.start:ramp.gore!.end))continue;
      const connection=map.roadLinks!.find(l=>off?l.to.roadId===ramp.id:l.from.roadId===ramp.id);if(!connection)continue;
      const adjacent=roads.get((off?connection.from:connection.to).roadId)!;
      const main=adjacent.highwayTransition?roads.get(adjacent.highwayTransition.mainRoadId)!:adjacent;
      if(!remove.has(main.id))continue;
      if(adjacent.highwayTransition)remove.add(adjacent.id);
      pending.push({ramp,route,off,dir:main.id.includes(':in')?'in':'out'});
    }
    map.roadLinks=map.roadLinks!.filter(l=>!remove.has(l.from.roadId)&&!remove.has(l.to.roadId));
    map.roads=map.roads.filter(r=>!remove.has(r.id));for(const id of remove)roads.delete(id);
    for(const s of [...region.structures,...region.exits])s.roadIds=s.roadIds.filter(id=>!remove.has(id));
    route.roadIds=route.roadIds.filter(id=>!remove.has(id));route.centerline=section(old,start,end);
  };
  const join=(route:RegionalRoute,points:CityPoint[],prepend=false)=>{
    const temporary=makeRoute(route.id+'-extension'+serial++,route.name,[[0,0,1,0,0],[1,0,1,0,0]],route.lanes,route.speed);
    // Replace the temporary one-metre stamp with the actual sampled alignment.
    const tempIds=new Set(temporary.roadIds);map.roads=map.roads.filter(r=>!tempIds.has(r.id));for(const id of tempIds)roads.delete(id);
    map.roadLinks=map.roadLinks!.filter(l=>!tempIds.has(l.from.roadId)&&!tempIds.has(l.to.roadId));
    temporary.roadIds=[];temporary.centerline=points;
    const half=route.lanes*3.75/2+3;
    for(const dir of ['out','in']){
      const sign=dir==='out'?1:-1;
      const offset=points.map((q,i)=>{const a=points[Math.max(0,i-1)]!,b=points[Math.min(points.length-1,i+1)]!,l=Math.hypot(b.x-a.x,b.z-a.z);return p(q.x-(b.z-a.z)/l*half*sign,q.z+(b.x-a.x)/l*half*sign,q.y);});if(dir==='in')offset.reverse();
      const length=polylineLength(offset);let previous:CityRoad|undefined;
      for(let s=0;s<length;s+=1200){const r:CityRoad={id:`regional:v3:${temporary.id}:${dir}:${Math.floor(s/1200)}`,type:'highway',centerline:section(offset,s,Math.min(length,s+1200)),curve:'polyline',laneCount:route.lanes,laneWidth:3.75,speedLimit:route.speed,travelDirection:'forward',roadNameId:route.id,designProfile:'motorway',elevationMode:'custom',corridorSection:'GROUND',shoulders:{left:1,right:3},structure:{barrierEnabled:true,piersEnabled:false,pierSpacing:60,medianBarrierStyle:'concrete'},streetlights:false};
        map.roads.push(r);roads.set(r.id,r);temporary.roadIds.push(r.id);if(previous)link(endpoint(previous,'end'),endpoint(r,'start'));previous=r;
      }
      if(route.roadIds.length){
        const old=terminal(route,dir,(dir==='out')!==prepend),fresh=terminal(temporary,dir,(dir==='in')!==prepend),at=(dir==='out')!==prepend?0:fresh.centerline.length-1;
        const anchor=(dir==='out')!==prepend?old.centerline.at(-1)!:old.centerline[0]!,original=fresh.centerline[at]!,dx=anchor.x-original.x,dz=anchor.z-original.z,dy=(anchor.y??0)-(original.y??0);
        fresh.centerline.forEach((q,i)=>{const w=Math.max(0,1-Math.abs(i-at)/25);q.x+=dx*w;q.z+=dz*w;q.y=(q.y??0)+dy*w;});
        const source=(dir==='out')!==prepend?old:fresh,target=source===old?fresh:old;link(endpoint(source,'end'),endpoint(target,'start'));
      }
    }
    route.centerline=route.roadIds.length?(prepend?[...points.slice(0,-1),...route.centerline]:[...route.centerline,...points.slice(1)]):points;
    route.roadIds.push(...temporary.roadIds);region.routes=region.routes.filter(r=>r!==temporary);delete names[temporary.id];
  };
  const disconnect=new Set(system.junctions.filter(j=>j.kind==='continuation').map(j=>j.id));
  map.roadLinks=map.roadLinks!.filter(l=>{const a=roads.get(l.from.roadId)!,b=roads.get(l.to.roadId)!;return !(a.type==='highway'&&b.type==='highway'&&a.roadNameId!==b.roadNameId&&[...disconnect].some(id=>{const j=system.junctions.find(j=>j.id===id)!;return j.roadIds.includes(a.id)&&j.roadIds.includes(b.id);}));});
  system.junctions=system.junctions.filter(j=>!disconnect.has(j.id));for(const id of disconnect)delete names[id];
  const sw=get('S89'),swEnd=structuredClone(sw.centerline.at(-1)!);trim(sw,1000,polylineLength(sw.centerline));
  sw.name='西南绕城高速';sw.terrain='西南外圈开放 C 形走廊；两端接区域外，机场与城际方向在主线上错开疏解';names.S89!.primaryText=sw.name;
  const swStart=sw.centerline[0]!,swT=sampleAt(sw.centerline,0).tangent;
  const airportCross=sampleAt(get('S18').centerline,1800).point;
  join(sw,curve([[-18000,-600,1,0,20],[-11500,-600,1,0,38],[-8000,-600,1,0,32],[-6400,airportCross.z,1,0,32],[airportCross.x,airportCross.z,1,0,32],[-5000,500,0,1,29],[swStart.x,swStart.z,swT.x,swT.z,swStart.y??0]]),true);
  const swLast=sampleAt(sw.centerline,polylineLength(sw.centerline)).tangent;
  join(sw,curve([[swEnd.x,swEnd.z,swLast.x,swLast.z,swEnd.y??0],[8500,1500,1,0,16],[11000,1400,1,0,16],[18000,1400,1,0,16]]));
  const city=get('S36'),oldCity=structuredClone(city.centerline),cityKeep=section(oldCity,3800,polylineLength(oldCity)),cityJoin=cityKeep[0]!,cityT=sampleAt(cityKeep,0).tangent;
  trim(city,1,1); // existing local access and its eastern mainline alignment remain
  join(city,[...curve([[-18000,-3500,1,0,36],[-11500,-3000,1,.2,44],[-7800,-650,.6,.8,44],[-6500,2600,.3,.95,36],[-4200,5000,1,.1,28],[1500,5100,1,0,20],[6500,3200,1,0,14],[cityJoin.x,cityJoin.z,cityT.x,cityT.z,cityJoin.y??0]]).slice(0,-1),...cityKeep]);
  extendCity();
  function extendCity(){const q=city.centerline.at(-1)!;join(city,curve([[q.x,q.z,1,0,q.y??0],[18000,6100,1,0,4]]));}
  city.terrain='西部外联—机场南组合枢纽—南部外圈—城际新区通道';
  region.structures=region.structures.filter(s=>s.id!=='regional:newcity-overpass');
  const river=get('S31'),oldRiver=structuredClone(river.centerline),foldStart=stationOn(oldRiver,p(14300,3300)),keep=section(oldRiver,1500,foldStart);
  trim(river,1,1);
  const first=keep[0]!,ft=sampleAt(keep,0).tangent,last=keep.at(-1)!,lt=sampleAt(keep,polylineLength(keep)).tangent;
  join(river,[...curve([[7600,-13500,0,1,70],[7600,-10500,0,1,70],[first.x,first.z,ft.x,ft.z,first.y??0]]).slice(0,-1),...keep,
    ...curve([[last.x,last.z,lt.x,lt.z,last.y??0],[13300,4900,-.7,.7,10],[11200,6100,-.35,.936,12],[9500,7800,-.7,.7,12],[7000,11000,-.7,.7,12]]).slice(1)]);
  river.terrain='北部区域外贯通沿江走廊；南端外放，原折返保留为晨江东枢纽回转联络匝道';
  const east=get('G17'),eastAt=stationOn(east.centerline,p(12600,2600));trim(east,0,eastAt);
  const ep=east.centerline.at(-1)!,et=sampleAt(east.centerline,polylineLength(east.centerline)).tangent;join(east,curve([[ep.x,ep.z,et.x,et.z,ep.y??0],[18000,2600,1,0,0]]));
  const north=get('G38'),northAt=stationOn(north.centerline,p(6800,-7900));trim(north,0,northAt);
  const np=north.centerline.at(-1)!,nt=sampleAt(north.centerline,polylineLength(north.centerline)).tangent;join(north,curve([[np.x,np.z,nt.x,nt.z,np.y??0],[8800,-9000,.7,-.7,65],[10500,-11500,.4,-.9,65],[11000,-13500,0,-1,65]]));
  const extend=(id:string,finish:Knot,prepend=false)=>{const r=get(id),s=sampleAt(r.centerline,prepend?0:polylineLength(r.centerline)),k:Knot=[s.point.x,s.point.z,s.tangent.x,s.tangent.z,s.point.y??0];join(r,curve(prepend?[finish,k]:[k,finish]),prepend);};
  extend('G42',[-20000,-5500,1,0,18],true);extend('G42',[20000,-4300,1,0,18]);extend('S37',[-18000,3600,-1,0,10]);
  extend('G65',[-10300,-14500,0,1,28],true);
  extend('G17',[20000,2600,1,0,0]);extend('S36',[20000,6100,1,0,4]);
  extend('G38',[11000,-15000,0,-1,65]);extend('S31',[7600,-15000,0,1,70],true);
  const ne=makeRoute('S29','东北绕城高速',[[-18000,-8500,1,0,42],[-12000,-8500,1,0,42],[-4000,-9500,1,-.2,70],[3000,-11500,1,0,88],[10500,-11000,1,.2,88],[15000,-8500,.6,.8,80],[16500,-4000,0,1,38],[16500,2800,0,1,28],[15500,6000,-.6,.8,24],[12000,8500,-.8,.6,22],[10000,11000,-.5,.9,18]],2,100);
  ne.terrain='北—东北—东侧开放 C 形绕行；与西南绕城错开，不首尾闭环';
  const newRampIds=new Set<string>();
  const crossings=(a:RegionalRoute,b:RegionalRoute)=>{
    const result:CityPoint[]=[];
    for(let i=1;i<a.centerline.length;i++)for(let j=1;j<b.centerline.length;j++){
      const u=a.centerline[i-1]!,v=a.centerline[i]!,q=b.centerline[j-1]!,r=b.centerline[j]!,dx=v.x-u.x,dz=v.z-u.z,ex=r.x-q.x,ez=r.z-q.z,det=dx*ez-dz*ex;if(Math.abs(det)<1e-6)continue;
      const t=((q.x-u.x)*ez-(q.z-u.z)*ex)/det,s=((q.x-u.x)*dz-(q.z-u.z)*dx)/det;
      if(t>=-1e-8&&t<=1+1e-8&&s>=-1e-8&&s<=1+1e-8){const at=p(u.x+dx*t,u.z+dz*t);if(!result.some(p=>Math.hypot(p.x-at.x,p.z-at.z)<10))result.push(at);}
    }
    return result;
  };
  const crossing=(a:RegionalRoute,b:RegionalRoute)=>{const q=crossings(a,b)[0];if(!q)throw new Error(`No actual crossing ${a.id}/${b.id}`);return q;};
  // Grade separation is derived from the new alignments. A geometric crossing
  // alone never creates a graph edge. Upper decks retain supports and clearance.
  for(let i=0;i<region.routes.length;i++)for(let j=i+1;j<region.routes.length;j++){
    const a=region.routes[i]!,b=region.routes[j]!;
    for(const at of crossings(a,b)){
      if(![a,b].some(r=>r.roadIds.some(id=>id.startsWith('regional:v3:')&&roads.get(id)!.centerline.some(q=>Math.hypot(q.x-at.x,q.z-at.z)<80))))continue;
      let upper=(projection(a,at).point.y??0)>=(projection(b,at).point.y??0)?a:b,lower=upper===a?b:a;
      const delta=Math.max(0,(projection(lower,at).point.y??0)+14-(projection(upper,at).point.y??0));
      for(const points of [upper.centerline,...upper.roadIds.map(id=>roads.get(id)!.centerline)])for(const q of points){const distance=Math.hypot(q.x-at.x,q.z-at.z);q.y=(q.y??0)+delta*ease(Math.max(0,Math.min(1,(1400-distance)/1000)));}
      const ids=upper.roadIds.filter(id=>roads.get(id)!.centerline.some(q=>Math.hypot(q.x-at.x,q.z-at.z)<1100));
      for(const id of ids){const road=roads.get(id)!;road.corridorSection='BRIDGE';road.structure!.piersEnabled=true;road.structure!.barrierStyle='concrete';}
      region.structures.push({id:`regional:v3:deck:${upper.id}:${lower.id}:${Math.round(at.x)}`,name:`${upper.number??upper.id} 跨线桥`,kind:'bridge',center:projection(upper,at).point,roadIds:ids,radius:1500,routes:[upper.id],form:'through-deck',reference:'真实主线交点的上下层分离；只有匝道建立路网连接'});
    }
  }
  const hub=(id:string,name:string,main:RegionalRoute,other:RegionalRoute,form='system_compact_turbine',movements?:string[])=>{
    const center=crossing(main,other),ms=stationOn(main.centerline,center),cs=stationOn(other.centerline,center),mt=sampleAt(main.centerline,ms).tangent,ct=sampleAt(other.centerline,cs).tangent;
    const crossSign=ct.x*mt.z-ct.z*mt.x>=0?1:-1,mainY=projection(main,center).point.y??0,crossY=projection(other,center).point.y??0,scale=3.2;
    const stamp=expandCompactInterchange(form,{mainRoadLanes:main.lanes*2,crossRoadLanes:other.lanes*2,mainElevation:mainY,crossElevation:crossY,mainApproach:movements?240:330,groupId:id});
    const structure={id,name,kind:'interchange' as const,center:{...center,y:mainY},roadIds:[] as string[],radius:1350,routes:[main.id,other.id],form,reference:'主线贯穿；按实际曲线与斜交夹角布置定向、半定向及回转匝道'};
    region.structures.push(structure);names[id]={primaryText:name,kind:'interchange'};
    for(const r of stamp.roads){
      if(movements&&!movements.some(m=>r.id.includes(':'+m+'-')))continue;
      const localScale=movements?3:scale;
      r.centerline=r.centerline.map(q=>{const m=sampleAt(main.centerline,ms+q.z*localScale).point,c=sampleAt(other.centerline,cs+q.x*localScale*crossSign).point;return p(m.x+c.x-center.x,m.z+c.z-center.z,q.y);});
      const source=/:(S|N)-to-/.test(r.id)?main:other,target=/-to-(S|N)-/.test(r.id)?main:other;
      const arms=r.id.match(/:([SNEW])-to-([SNEW])-/)!,sourceArm=arms[1]!,targetArm=arms[2]!;
      const sourceDir=source===main?(sourceArm==='S'?'in':'out'):((sourceArm==='E')===(crossSign===1)?'in':'out');
      const targetDir=target===main?(targetArm==='S'?'out':'in'):((targetArm==='E')===(crossSign===1)?'out':'in');
      if(id==='regional:v3:airport-south'&&sourceArm==='E'&&targetArm==='S'){
        const af=projection(source,sampleAt(source.centerline,3900).point,sourceDir),bf=projection(target,p(-4800,1500),targetDir),ta=sampleAt(af.road.centerline,af.station).tangent,tb=sampleAt(bf.road.centerline,bf.station).tangent;
        r.centerline=curve([[af.point.x,af.point.z,ta.x,ta.z,af.point.y??0],[-6700,-1600,0,1,48],[-6150,-400,.7,.7,48],[-5400,700,.6,.8,48],[bf.point.x,bf.point.z,tb.x,tb.z,bf.point.y??0]]);
      }
      if(id==='regional:v3:airport-south'&&sourceArm==='S'&&targetArm==='E'){
        const af=projection(source,p(-4800,1500),sourceDir),bf=projection(target,sampleAt(target.centerline,1500).point,targetDir),ta=sampleAt(af.road.centerline,af.station).tangent,tb=sampleAt(bf.road.centerline,bf.station).tangent;
        r.centerline=curve([[af.point.x,af.point.z,ta.x,ta.z,af.point.y??0],[-4100,800,0,-1,36],[-4400,-100,-.5,-.866,36],[bf.point.x,bf.point.z,tb.x,tb.z,bf.point.y??0]]);
      }
      const a=projection(source,r.centerline[0]!,sourceDir).point,b=projection(target,r.centerline.at(-1)!,targetDir).point,old=structuredClone(r.centerline),length=polylineLength(old);let d=0;
      r.centerline.forEach((q,i)=>{if(i)d+=Math.hypot(old[i]!.x-old[i-1]!.x,old[i]!.z-old[i-1]!.z);const u=ease(Math.max(0,1-d/220)),v=ease(Math.max(0,1-(length-d)/220));q.x+=(a.x-old[0]!.x)*u+(b.x-old.at(-1)!.x)*v;q.z+=(a.z-old[0]!.z)*u+(b.z-old.at(-1)!.z)*v;q.y=(q.y??0)+((a.y??0)-(old[0]!.y??0))*u+((b.y??0)-(old.at(-1)!.y??0))*v;});
      const from=cut(source,a,false,sourceDir),to=cut(target,b,true,targetDir);r.centerline[0]=from.point;r.centerline[r.centerline.length-1]=to.point;
      for(const reverse of [false,true]){const list=reverse?[...r.centerline].reverse():r.centerline;for(let i=1;i<list.length-1;i++){const a=list[i-1]!,q=list[i]!,limit=.055*Math.hypot(q.x-a.x,q.z-a.z);q.y=Math.max((a.y??0)-limit,Math.min((a.y??0)+limit,q.y??0));}}
      r.roadNameId=target.id;r.designProfile='motorway';r.presetSource=undefined;r.corridorSection='RAMP';r.streetlights=false;r.speedLimit=r.id.endsWith('-loop')?50:70;r.shoulders={left:1,right:2};r.structure!.pierSpacing=60;
      map.roads.push(r);roads.set(r.id,r);link(from.end,endpoint(r,'start'));link(endpoint(r,'end'),to.end);structure.roadIds.push(r.id);newRampIds.add(r.id);
    }
    return structure;
  };
  hub('regional:v3:airport-south','机场南枢纽',sw,get('S18'),'system_compact_star',['N-to-E','S-to-E','E-to-N','E-to-S']);
  hub('regional:v3:airport-distributor','机场南城际疏解枢纽',city,sw);
  hub('regional:v3:north-river','北岭沿江枢纽',river,north);
  const eastHub=hub('regional:v3:chenjiang-east','晨江东枢纽',river,east);
  hub('regional:v3:northeast-west','东北绕城西枢纽',get('G65'),ne,'system_compact_cloverleaf');
  hub('regional:v3:northeast-river','沿江北枢纽',river,ne);
  hub('regional:v3:northeast-north','北岭北枢纽',north,ne);
  hub('regional:v3:northeast-chenjiang','晨江东北枢纽',ne,get('G42'));
  hub('regional:v3:northeast-donglin','东临东枢纽',ne,east);
  hub('regional:v3:northeast-newcity','新城东枢纽',ne,city);
  hub('regional:v3:river-newcity','沿江南枢纽',river,city);
  // The former southern U remains playable as an extended S31 -> G17 movement,
  // while both numbered mainlines now continue through the interchange.
  const fold=section(oldRiver,foldStart,polylineLength(oldRiver)),foldEnd=fold.at(-1)!,foldT=sampleAt(fold,polylineLength(fold)).tangent;
  const foldCentre=[...fold,...curve([[foldEnd.x,foldEnd.z,foldT.x,foldT.z,0],[14960,2600,1,0,0]]).slice(1)];
  const foldPath=foldCentre.map((q,i)=>{const a=foldCentre[Math.max(0,i-1)]!,b=foldCentre[Math.min(foldCentre.length-1,i+1)]!,l=Math.hypot(b.x-a.x,b.z-a.z);return p(q.x-(b.z-a.z)/l*18,q.z+(b.x-a.x)/l*18,q.y);});
  const foldLength=polylineLength(foldPath),foldSourceY=projection(river,foldPath[0]!,'out').point.y??0;let fd=0;
  foldPath.forEach((q,i)=>{if(i)fd+=Math.hypot(q.x-foldPath[i-1]!.x,q.z-foldPath[i-1]!.z);q.y=(foldSourceY+(64-foldSourceY)*ease(Math.min(1,fd/1400)))*Math.min(1,(foldLength-fd)/1200);});
  const fa=cut(river,foldPath[0]!,false,'out'),fb=cut(east,foldPath.at(-1)!,true,'out'),foldOriginal=structuredClone(foldPath);let fitDistance=0;
  foldPath.forEach((q,i)=>{if(i)fitDistance+=Math.hypot(foldOriginal[i]!.x-foldOriginal[i-1]!.x,foldOriginal[i]!.z-foldOriginal[i-1]!.z);const a=ease(Math.max(0,1-fitDistance/200)),b=ease(Math.max(0,1-(foldLength-fitDistance)/200));q.x+=(fa.point.x-foldOriginal[0]!.x)*a+(fb.point.x-foldOriginal.at(-1)!.x)*b;q.z+=(fa.point.z-foldOriginal[0]!.z)*a+(fb.point.z-foldOriginal.at(-1)!.z)*b;});
  foldPath[0]=fa.point;foldPath[foldPath.length-1]=fb.point;
  const foldRoad:CityRoad={id:'regional:v3:chenjiang-foldback',type:'ramp_1',centerline:foldPath,curve:'polyline',laneCount:1,laneWidth:3.9,travelDirection:'forward',speedLimit:60,roadNameId:'G17',designProfile:'motorway',elevationMode:'custom',corridorSection:'RAMP',shoulders:{left:1,right:2},structure:{barrierEnabled:true,piersEnabled:true,pierSpacing:60},gore:{start:true,end:true,length:120}};
  map.roads.push(foldRoad);roads.set(foldRoad.id,foldRoad);link(fa.end,endpoint(foldRoad,'start'));link(endpoint(foldRoad,'end'),fb.end);eastHub.roadIds.push(foldRoad.id);newRampIds.add(foldRoad.id);
  for(const pendingMouth of pending){
    const {ramp,route,off,dir}=pendingMouth,q=off?ramp.centerline[0]!:ramp.centerline.at(-1)!,mouth=cut(route,q,!off,dir);
    const length=polylineLength(ramp.centerline),dx=mouth.point.x-q.x,dz=mouth.point.z-q.z,dy=(mouth.point.y??0)-(q.y??0);let d=0;
    const old=structuredClone(ramp.centerline);
    ramp.centerline.forEach((v,i)=>{if(i)d+=Math.hypot(old[i]!.x-old[i-1]!.x,old[i]!.z-old[i-1]!.z);const weight=ease(Math.max(0,1-(off?d:length-d)/100));v.x+=dx*weight;v.z+=dz*weight;v.y=(v.y??0)+dy*weight;});
    if(off)ramp.centerline[0]=mouth.point;else ramp.centerline[ramp.centerline.length-1]=mouth.point;
    link(off?mouth.end:endpoint(ramp,'end'),off?endpoint(ramp,'start'):mouth.end);newRampIds.add(ramp.id);
  }
  addHighwayTransitions(map,newRampIds,200);
  // The extended U and the adjacent right-turn movement share one receiving
  // merge nose. Separate nearby merge noses otherwise overlap at road level.
  const sharedLane=map.roads.find(r=>r.id==='regional:v3:chenjiang-east:S-to-E-right:acceleration')!;
  const sharedExit=map.roadLinks!.find(l=>l.from.roadId===sharedLane.id&&l.from.end==='end')!;
  const sharedPoint=sharedLane.centerline.at(-1)!,foldBefore=structuredClone(foldRoad.centerline),mergeLength=polylineLength(foldBefore),endBefore=foldBefore.at(-1)!;let mergeDistance=0;
  foldRoad.centerline.forEach((q,i)=>{if(i)mergeDistance+=Math.hypot(foldBefore[i]!.x-foldBefore[i-1]!.x,foldBefore[i]!.z-foldBefore[i-1]!.z);const w=ease(Math.max(0,1-(mergeLength-mergeDistance)/400));q.x+=(sharedPoint.x-endBefore.x)*w;q.z+=(sharedPoint.z-endBefore.z)*w;q.y=(q.y??0)+((sharedPoint.y??0)-(endBefore.y??0))*w;});
  foldRoad.centerline[foldRoad.centerline.length-1]=structuredClone(sharedPoint);
  map.roadLinks!.find(l=>l.from.roadId===foldRoad.id&&l.from.end==='end')!.to=structuredClone(sharedExit.to);
  for(const r of map.roads)roads.set(r.id,r);
  for(const r of map.roads){const cleaned:CityPoint[]=[];for(const q of r.centerline)if(!cleaned.length||Math.hypot(q.x-cleaned.at(-1)!.x,q.z-cleaned.at(-1)!.z)>.05)cleaned.push(q);r.centerline=cleaned;
    if(newRampIds.has(r.id))for(const reverse of [false,true]){const list=reverse?[...r.centerline].reverse():r.centerline;for(let i=1;i<list.length-1;i++){const a=list[i-1]!,q=list[i]!,limit=.055*Math.hypot(q.x-a.x,q.z-a.z);q.y=Math.max((a.y??0)-limit,Math.min((a.y??0)+limit,q.y??0));}}
  }
  for(const r of region.routes)r.connectedRoutes=[];
  for(const j of region.structures.filter(s=>s.kind==='interchange'))for(const id of j.routes)get(id).connectedRoutes.push(...j.routes.filter(other=>other!==id));
  const changed:Record<string,{start:string;end:string;forward:string;reverse:string}>= {
    S89:{start:'西原（区域外）',end:'东部地区（区域外）',forward:'物流园 / 东南新区',reverse:'西川 / 西原'},
    S29:{start:'西北地区（区域外）',end:'东南地区（区域外）',forward:'东北新城 / 东临',reverse:'北岭 / 西北地区'},
    S36:{start:'西部新城（区域外）',end:'城际新区（区域外）',forward:'新城 / 城际新区',reverse:'机场南 / 西部新城'},
    S31:{start:'沿江北部（区域外）',end:'沿江南部（区域外）',forward:'沿江南 / 城际新区',reverse:'沿江北 / 北岭'},
    G17:{start:'城市快速环路',end:'东临（区域外）',forward:'东临 / 晨江东',reverse:'东原 / 市区'},
    G38:{start:'城市快速环路',end:'北岭（区域外）',forward:'北岭 / 云岭',reverse:'青岭 / 市区'},
    S18:{start:'机场南城市接入预留',end:'机场 / 航站楼',forward:'机场 / T1 T2 航站楼',reverse:'机场南 / 西川'},
  };
  system.routes=region.routes.map(r=>{const previous=system.routes.find(s=>s.id===r.id),c=changed[r.id];return {id:r.id,number:r.number??r.id,name:r.name,type:previous?.type??'provincial',role:previous?.role??'orbital',termini:c?{start:c.start,end:c.end}:previous!.termini,direction:c?{forward:c.forward,reverse:c.reverse}:previous!.direction,roadIds:[...r.roadIds]};});
  system.junctions=region.structures.filter(s=>s.kind==='interchange').map(s=>({kind:'interchange',id:s.id,name:s.name,connectedRoutes:[...s.routes],directions:Object.fromEntries(s.routes.map(id=>[id,system.routes.find(r=>r.id===id)!.direction])),position:s.center,roadIds:[...s.roadIds]}));
  const airportNode=system.junctions.find(j=>j.id==='regional:v3:airport-south')!;
  airportNode.reservedConnections=[{id:'airport-south-future',direction:'南侧机场配套区',enabled:false,position:structuredClone(get('S18').centerline[0]!)}];
  for(const r of region.routes){r.connectedRoutes=[...new Set(r.connectedRoutes)];names[r.id]!.primaryText=r.name;}
  for(const e of system.exits)e.roadIds=[...region.exits.find(r=>r.id===e.id)!.roadIds];
  for(const s of system.services)s.roadIds=[...region.structures.find(r=>r.id===s.id)!.roadIds];
  map.bounds={minX:-20500,maxX:20500,minZ:-15500,maxZ:11500};region.terrainBounds={minX:-21500,maxX:21500,minZ:-16500,maxZ:12500};
  for(const id of ['S29','S31']){const r=get(id),s=sampleAt(r.centerline,1800),half=r.lanes*3.75/2+3;map.environment.spawnPoints.push({id:'regional-v3-'+id,position:p(s.point.x-s.tangent.z*half,s.point.z+s.tangent.x*half,s.point.y),rotation:Math.atan2(-s.tangent.x,-s.tangent.z)});}
  map.version++;map.environment.metadata={...map.environment.metadata,highwayNetworkRevision:'3',highwaySystemVersion:'3',routeNumbers:system.routes.map(r=>r.number).join(',')};
  const clearance=new RoadClearance(map);
  map.objects=map.objects.filter(o=>!o.id.startsWith('regional:extension-tree:')||clearance.permitsProp(o.position,2.1,6.8));
  generateHighwaySigns(map);return map;
}
