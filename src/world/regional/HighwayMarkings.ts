import type { CityMapData, CityPoint, CityRoad } from '../city/CityMapData';
import { polylineLength, sampleAt } from '../city/geometry';

/** Auxiliary lanes use ordinary roads and the existing contact/collision system. */
export function addHighwayTransitions(map: CityMapData, rampIds?: ReadonlySet<string>, throatMetres = 120): void {
  const roads = new Map(map.roads.map(r => [r.id, r])); let serial = map.roads.length + map.roadLinks!.length;
  const endpoint = (r: CityRoad, end: 'start' | 'end') => ({ roadId: r.id, end });
  const cut = (road: CityRoad, station: number) => {
    const q = sampleAt(road.centerline, station).point, a: CityPoint[] = [], b: CityPoint[] = []; let d = 0;
    road.centerline.forEach((p, i) => { if(i)d += Math.hypot(p.x-road.centerline[i-1]!.x,p.z-road.centerline[i-1]!.z);if(d<station-.06)a.push(p);if(d>station+.06)b.push(p); });
    const tail: CityRoad = {...structuredClone(road),id:`${road.id}:lane${serial++}`,centerline:[q,...b]};road.centerline=[...a,q];map.roads.push(tail);roads.set(tail.id,tail);
    for(const l of map.roadLinks!)for(const e of [l.from,l.to])if(e.roadId===road.id&&e.end==='end')e.roadId=tail.id;
    for(const r of map.regional!.routes)if(r.roadIds.includes(road.id))r.roadIds.push(tail.id);
    for(const s of map.regional!.structures)if(s.roadIds.includes(road.id))s.roadIds.push(tail.id);
    map.roadLinks!.push({id:`regional:lane:continuation:${serial++}`,from:endpoint(road,'end'),to:endpoint(tail,'start')});return tail;
  };
  for(const ramp of map.roads.filter(r=>r.id.startsWith('regional:') && r.gore && (!rampIds || rampIds.has(r.id))))for(const off of [true,false]){
    if(!(off?ramp.gore!.start:ramp.gore!.end))continue;
    if(roads.has(`${ramp.id}:${off?'deceleration':'acceleration'}`))continue;
    const connection=map.roadLinks!.find(l=>off?l.to.roadId===ramp.id&&l.to.end==='start':l.from.roadId===ramp.id&&l.from.end==='end');
    if(!connection)continue;const main=roads.get((off?connection.from:connection.to).roadId)!;
    if(main.laneCount<2||!main.id.startsWith('regional:')||main.structure?.enclosure?.kind==='tunnel')continue;
    const length=polylineLength(main.centerline),span=Math.min(300,length*.8);if(span<100)continue;
    const points=structuredClone(main.centerline),start=off?length-span:0,tail=cut(main,off?start:span);
    const samples:CityPoint[]=[],offset=main.laneCount*main.laneWidth/2+main.laneWidth/2,count=Math.ceil(span/10);
    for(let i=0;i<=count;i++){const d=span*i/count,s=sampleAt(points,start+d),taper=Math.min(150,span),t=off?Math.min(1,d/taper):Math.min(1,(span-d)/taper),w=t*t*(3-2*t)*offset;samples.push({x:s.point.x-s.tangent.z*w,y:s.point.y,z:s.point.z+s.tangent.x*w});}
    const anchor=off?samples.at(-1)!:samples[0]!,original=structuredClone(ramp.centerline),rampLength=polylineLength(original),throat=Math.min(throatMetres,rampLength*.3),stations:number[]=[0];
    for(let i=1;i<original.length;i++)stations.push(stations[i-1]!+Math.hypot(original[i]!.x-original[i-1]!.x,original[i]!.z-original[i-1]!.z));
    const wanted=off?throat:rampLength-throat,joinIndex=stations.reduce((best,d,i)=>Math.abs(d-wanted)<Math.abs(stations[best]!-wanted)?i:best,1),joinPoint=original[joinIndex]!,other=original[joinIndex+(off?1:-1)]!,dx=(other.x-joinPoint.x)*(off?1:-1),dz=(other.z-joinPoint.z)*(off?1:-1),l=Math.hypot(dx,dz),tangent={x:dx/l,z:dz/l},frame=sampleAt(samples,off?polylineLength(samples):0),a=off?anchor:joinPoint,b=off?joinPoint:anchor,ta=off?frame.tangent:tangent,tb=off?tangent:frame.tangent,chord=Math.hypot(b.x-a.x,b.z-a.z)/3;
    const curve:CityPoint[]=[];
    for(let i=0;i<=40;i++){const t=i/40,u=1-t;curve.push({x:u**3*a.x+3*u*u*t*(a.x+ta.x*chord)+3*u*t*t*(b.x-tb.x*chord)+t**3*b.x,y:(a.y??0)+((b.y??0)-(a.y??0))*t,z:u**3*a.z+3*u*u*t*(a.z+ta.z*chord)+3*u*t*t*(b.z-tb.z*chord)+t**3*b.z});}
    const rest=off?original.slice(joinIndex+1):original.slice(0,joinIndex);
    ramp.centerline=off?[...curve,...rest]:[...rest,...curve];
    const lane:CityRoad={id:`${ramp.id}:${off?'deceleration':'acceleration'}`,type:'ramp_1',centerline:samples,curve:'polyline',laneCount:1,laneWidth:main.laneWidth,travelDirection:'forward',speedLimit:main.speedLimit,roadNameId:main.roadNameId,designProfile:'motorway',elevationMode:'custom',shoulders:{left:.5,right:2},corridorSection:main.corridorSection,structure:{...main.structure,enclosure:undefined,medianBarrierStyle:'metal'},markings:false,highwayTransition:{kind:off?'deceleration':'acceleration',taperMetres:Math.min(150,span),mainRoadId:off?tail.id:main.id,decisionId:ramp.id}};
    map.roads.push(lane);roads.set(lane.id,lane);map.roadLinks=map.roadLinks!.filter(l=>l!==connection);
    map.roadLinks.push({id:`regional:lane:entry:${serial++}`,from:off?endpoint(main,'end'):endpoint(ramp,'end'),to:endpoint(lane,'start')},{id:`regional:lane:exit:${serial++}`,from:endpoint(lane,'end'),to:off?endpoint(ramp,'start'):endpoint(tail,'start')});
    for(const s of [...map.regional!.structures,...map.regional!.exits])if(s.roadIds.includes(ramp.id))s.roadIds.push(lane.id);
  }
}

