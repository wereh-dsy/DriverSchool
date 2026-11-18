import type { CityMapData, CityPoint, CityRoad, RoadEndpoint, PrefabId } from '../city/CityMapData';
import { polylineLength, rotatePoint, sampleAt } from '../city/geometry';
import { expandCompactInterchange, compactRampEase } from '../city/presets/CompactInterchangePresets';
import { bezierPoints } from '../city/presets/BackbonePresets';
import type { RegionalRoute, RegionalStructure } from './RegionalData';
import { RegionalTerrainSampler } from './RegionalTerrain';
import { generateRegionalSigns } from './RegionalSigns';

const p = (x: number, z: number, y = 0): CityPoint => ({ x, y, z });
interface Knot { point: CityPoint; dx: number; dz: number }
const knot = (x: number, z: number, dx: number, dz: number, y = 0): Knot => ({ point: p(x, z, y), dx, dz });
const join = (...paths: CityPoint[][]) => paths.flatMap((path, i) => i ? path.slice(1) : path);
function curve(knots: Knot[]): CityPoint[] {
  return join(...knots.slice(1).map((b, i) => {
    const a = knots[i]!, length = Math.hypot(b.point.x - a.point.x, b.point.z - a.point.z) / 3;
    return bezierPoints(a.point, p(a.point.x + a.dx * length, a.point.z + a.dz * length),
      p(b.point.x - b.dx * length, b.point.z - b.dz * length), b.point).filter((_, j, path) => j % 4 === 0 || j === path.length - 1);
  }));
}
function offset(path: CityPoint[], distance: number): CityPoint[] {
  return path.map((q, i) => {
    const a = path[Math.max(0, i - 1)]!, b = path[Math.min(path.length - 1, i + 1)]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return p(q.x - (b.z - a.z) / length * distance, q.z + (b.x - a.x) / length * distance, q.y);
  });
}

/** Offline extension of the current city. Existing roads, junctions and objects are copied verbatim. */
export function buildRegionalWorld(city: CityMapData): CityMapData {
  const map = structuredClone(city);
  map.name = 'City Main · Regional World'; map.version += 1;
  map.bounds = { minX: -5200, maxX: 8800, minZ: -5300, maxZ: 4700 };
  map.regional = { version: 1, cityBounds: { ...city.bounds }, terrainBounds: { minX: -6200, maxX: 9800, minZ: -6300, maxZ: 5700 }, routes: [], structures: [], exits: [] };
  map.roadNames ??= {}; map.signs ??= []; map.roadLinks ??= [];
  let serial = 0;
  const endpoint = (r: CityRoad, end: 'start' | 'end'): RoadEndpoint => ({ roadId: r.id, end });
  const link = (from: RoadEndpoint, to: RoadEndpoint) => map.roadLinks!.push({ id: `regional:link:${serial++}`, from, to });
  const add = (id: string, path: CityPoint[], lanes = 3, speed = 120, route?: string, section = 'GROUND'): CityRoad => {
    const r: CityRoad = { id, type: lanes === 1 ? 'ramp_1' : 'highway', roadClass: lanes === 1 ? 'ramp' : 'expressway', crossSection: 'shouldered', centerline: path, curve: 'polyline',
      laneCount: lanes, laneWidth: 3.75, travelDirection: 'forward', speedLimit: speed, elevationMode: 'custom',
      designProfile: 'motorway', roadNameId: route, corridorSection: section, shoulders: { left: 1, right: 3 },
      structure: { barrierEnabled: true, piersEnabled: section === 'BRIDGE' || section === 'RAMP', pierSpacing: 60, barrierOffset: .2, medianBarrierStyle:lanes>1?'concrete':'metal' }, streetlights: false };
    map.roads.push(r); return r;
  };
  const makeRoute = (id: string, name: string, terrain: string, knots: Knot[], lanes = 3, speed = 120) => {
    const centerline = curve(knots), route: RegionalRoute = { id, name, lanes, speed, terrain, centerline, roadIds: [], connectedRoutes: [] };
    // City ends have an 8.125m carriageway offset; the countryside median widens smoothly.
    const length = polylineLength(centerline); let distance = 0;
    const forward = offset(centerline, 8.125), reverse = offset(centerline, -8.125).reverse();
    for (let i = 0; i < centerline.length; i++) {
      if (i) distance += Math.hypot(centerline[i]!.x - centerline[i - 1]!.x, centerline[i]!.z - centerline[i - 1]!.z);
      const extra = Math.min(1, distance / 350, (length - distance) / 350) * .5;
      const a = centerline[Math.max(0, i - 1)]!, b = centerline[Math.min(centerline.length - 1, i + 1)]!, l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      forward[i]!.x -= (b.z - a.z) / l * extra; forward[i]!.z += (b.x - a.x) / l * extra;
      const q = reverse[reverse.length - 1 - i]!; q.x += (b.z - a.z) / l * extra; q.z -= (b.x - a.x) / l * extra;
    }
    route.roadIds.push(add(`regional:${id}:out`, forward, lanes, speed, id).id, add(`regional:${id}:in`, reverse, lanes, speed, id).id);
    map.regional!.routes.push(route); map.roadNames![id] = { primaryText: name, kind: 'expressway', routeNumber: id };
    return route;
  };
  // Long tangent runs at hubs keep motorway curves outside the ramp cores.
  const g17 = makeRoute('G17', '东临高速', '东郊—平原—大河—农田', [knot(2400,-150,1,0),knot(3100,-350,1,0),knot(3350,-350,1,0),knot(4000,-350,1,0),knot(4650,-350,1,0),knot(6550,-350,1,0),knot(8050,650,.7,.7),knot(8550,1800,0,1)]);
  const g38 = makeRoute('G38', '北岭高速', '缓丘—林区—山谷—隧道—山岭', [knot(0,-2100,0,-1),knot(2100,-2750,0,-1,24),knot(2100,-3400,0,-1,24),knot(2100,-4050,0,-1,24),knot(2800,-4900,.8,-.6,50),knot(3600,-5000,1,0,48)],2,100);
  const g4516 = makeRoute('G4516', '山海高速', '河谷和平原交界的东南放射通道', [knot(3550,924,1,.3),knot(4400,1600,.8,.6,3),knot(5100,2150,.8,.6,4),knot(5700,2600,.8,.6,4),knot(6300,3050,.8,.6,4),knot(7550,3950,.8,.6,2),knot(8350,4400,1,0,0)]);
  const s26 = makeRoute('S26', '南港高速', '工业物流平原；2.0 km连续直线', [knot(0,2250,0,1),knot(0,2900,0,1),knot(0,3650,0,1),knot(0,4250,0,1),knot(400,4650,1,0),knot(800,4650,1,0),knot(1200,4250,0,-1),knot(1200,4100,0,-1),knot(1600,3700,1,0),knot(2200,3700,1,0),knot(2750,3700,1,0)],3,100);
  const s37 = makeRoute('S37', '西川高速', '河湾—低丘—老工业河谷', [knot(-2400,-150,-1,0),knot(-3400,850,0,1,5),knot(-3400,2050,0,1,5),knot(-4050,2700,-1,0,5),knot(-4700,2700,-1,0,5)],2,100);
  const s68 = makeRoute('S68', '山海联络高速', '青岭—东原—临港，曲线外围联络', [knot(2100,-3400,1,0,32),knot(2750,-3400,1,0,32),knot(4000,-1100,0,1,8),knot(4000,-350,0,1,8),knot(4000,400,0,1,8),knot(2200,3050,0,1,20),knot(2200,3700,0,1,20)],3,100);
  const s89 = makeRoute('S89', '外围绕城高速', '西南—南部—东南，非闭合绕行线', [knot(-4700,800,0,1,13),knot(-4700,2700,0,1,13),knot(-4700,3200,0,1,13),knot(-3300,3400,1,0,8),knot(-1200,3400,1,0,8),knot(0,3400,1,0,8),knot(1200,3400,1,0,8),knot(4900,2800,1,-.25,12),knot(5700,2600,1,-.25,12),knot(6500,2400,1,-.25,12)],3,100);
  // Join only the pre-existing outer endpoints, preserving every city element.
  for (const [route, outId, inId] of [[g17,'ew-eb-split-split','ew-wb'],[g38,'ns-nb-split-split-split-split-split-split','ns-sb'],[s26,'ns-sb-split-split-split-split-split-split-split','ns-nb'],[s37,'ew-wb-split-split-split-split-split-split','ew-eb'],[g4516,'intercity-eb-split','intercity-wb']] as const) {
    const out = map.roads.find(r => r.id === route.roadIds[0])!, incoming = map.roads.find(r => r.id === route.roadIds[1])!;
    out.centerline[0] = { ...map.roads.find(r => r.id === outId)!.centerline.at(-1)! };
    incoming.centerline[incoming.centerline.length - 1] = { ...map.roads.find(r => r.id === inId)!.centerline[0]! };
    link({roadId:outId,end:'end'}, endpoint(out,'start')); link(endpoint(incoming,'end'),{roadId:inId,end:'start'});
  }
  // Split at a projected point once, remapping all downstream endpoint references.
  const cut = (route: RegionalRoute, query: CityPoint, outgoing: boolean): { point: CityPoint; end: RoadEndpoint } => {
    let best: { road: CityRoad; index: number; point: CityPoint; distance: number } | undefined;
    for (const id of route.roadIds) {
      const r = map.roads.find(r => r.id === id)!;
      // Opposing carriageways must never be inferred as the same connection.
      for (let i = 1; i < r.centerline.length; i++) {
        const a = r.centerline[i-1]!, b = r.centerline[i]!, dx = b.x-a.x, dz = b.z-a.z, l2 = dx*dx+dz*dz;
        const t = Math.max(0,Math.min(1,((query.x-a.x)*dx+(query.z-a.z)*dz)/l2));
        const q = p(a.x+dx*t,a.z+dz*t,(a.y??0)+((b.y??0)-(a.y??0))*t), d = Math.hypot(q.x-query.x,q.z-query.z);
        if (!best || d < best.distance) best = {road:r,index:i,point:q,distance:d};
      }
    }
    if (!best || best.distance > 30) throw new Error(`regional attach ${route.id}: ${best?.distance}`);
    const {road:r,index,point:q} = best;
    const existing=(point:CityPoint,end:'start'|'end')=>{const desired=outgoing?'start':'end';if(end!==desired)for(const id of route.roadIds){const road=map.roads.find(v=>v.id===id)!,other=desired==='start'?road.centerline[0]!:road.centerline.at(-1)!;if(Math.hypot(other.x-point.x,other.z-point.z)<.1)return {point,end:endpoint(road,desired)};}return {point,end:endpoint(r,end)};};
    if (Math.hypot(q.x-r.centerline[0]!.x,q.z-r.centerline[0]!.z)<.1) return existing(r.centerline[0]!,'start');
    if (Math.hypot(q.x-r.centerline.at(-1)!.x,q.z-r.centerline.at(-1)!.z)<.1) return existing(r.centerline.at(-1)!,'end');
    const tail: CityRoad = { ...structuredClone(r), id: `${r.id}:split${serial++}`, centerline: [q,...r.centerline.slice(index).filter(v => Math.hypot(v.x-q.x,v.z-q.z)>.05)] };
    const remap=(e:RoadEndpoint)=>{if(e.roadId===r.id&&e.end==='end')e.roadId=tail.id;};
    for(const l of map.roadLinks!){remap(l.from);remap(l.to);}
    for(const s of map.regional!.structures) {if(s.roadIds.includes(r.id))s.roadIds.push(tail.id);}
    r.centerline=[...r.centerline.slice(0,index).filter(v=>Math.hypot(v.x-q.x,v.z-q.z)>.05),q];
    map.roads.push(tail);route.roadIds.push(tail.id);link(endpoint(r,'end'),endpoint(tail,'start'));
    return {point:q,end:outgoing?endpoint(tail,'start'):endpoint(r,'end')};
  };
  const system = (id: string,name: string,main: RegionalRoute,cross: RegionalRoute,center: CityPoint,rotation: number,form: string,reference: string,arms?: string[],skew=0) => {
    const scale=1.65, mainY=center.y??0;
    const crossY=cross.centerline.reduce((a,b)=>Math.hypot(a.x-center.x,a.z-center.z)<Math.hypot(b.x-center.x,b.z-center.z)?a:b).y??0;
    const stamp=expandCompactInterchange(form,{mainRoadLanes:main.lanes*2,crossRoadLanes:cross.lanes*2,mainElevation:mainY,crossElevation:crossY,mainApproach:330,groupId:id});
    const roads=stamp.roads.filter(r=>!arms||arms.some(a=>r.id.includes(':'+a+'-')));
    const structure: RegionalStructure={id,name,kind:'interchange',center,roadIds:[],radius:650,routes:[main.id,cross.id],form,reference};
    map.regional!.structures.push(structure);map.roadNames![id]={primaryText:name,kind:'interchange'};
    const transform=(q:CityPoint)=>{const local=p(q.x*scale,q.z*scale,q.y);local.z+=local.x*skew;const v=rotatePoint(local,rotation);return p(v.x+center.x,v.z+center.z,v.y);};
    for(const r of roads) {
      r.centerline=r.centerline.map(transform);r.designProfile='motorway';r.speedLimit=r.id.includes('loop')?50:70;r.streetlights=true;r.presetSource=undefined;r.corridorSection='RAMP';
      r.shoulders={left:1,right:2};r.structure!.pierSpacing=60;
      const sourceMain=/:(S|N)-to-/.test(r.id),targetMain=/-to-(S|N)-/.test(r.id);
      const source=sourceMain?main:cross,target=targetMain?main:cross;
      // Preset offsets scale too. Move ramp mouths to the wider rural carriageway centre.
      const nearest=(route:RegionalRoute,q:CityPoint)=>{
        let best=q,d=Infinity;
        for(const rid of route.roadIds){const road=map.roads.find(v=>v.id===rid)!;for(let i=1;i<road.centerline.length;i++){const a=road.centerline[i-1]!,b=road.centerline[i]!,dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz,t=Math.max(0,Math.min(1,((q.x-a.x)*dx+(q.z-a.z)*dz)/l)),v=p(a.x+dx*t,a.z+dz*t,(a.y??0)+((b.y??0)-(a.y??0))*t),dist=Math.hypot(q.x-v.x,q.z-v.z);if(dist<d){d=dist;best=v;}}}return best;
      };
      const a=nearest(source,r.centerline[0]!),b=nearest(target,r.centerline.at(-1)!);
      // Preserve tangent continuity across a 70m throat, then retain reference core geometry.
      const original=r.centerline.map(q=>({...q})),length=polylineLength(original),oldA=original[0]!,oldB=original.at(-1)!;let d=0;
      r.centerline.forEach((q,i)=>{if(i)d+=Math.hypot(original[i]!.x-original[i-1]!.x,original[i]!.z-original[i-1]!.z);const u=Math.max(0,1-d/100),v=Math.max(0,1-(length-d)/100);q.x+=(a.x-oldA.x)*u+(b.x-oldB.x)*v;q.z+=(a.z-oldA.z)*u+(b.z-oldB.z)*v;q.y=(q.y??0)+((a.y??0)-(oldA.y??0))*u+((b.y??0)-(oldB.y??0))*v;});
      r.centerline[0]=a;r.centerline[r.centerline.length-1]=b;
      const from=cut(source,a,false),to=cut(target,b,true);r.centerline[0]=from.point;r.centerline[r.centerline.length-1]=to.point;
      const rampGrade=id==='regional:lingang'&&r.id.includes('N-to-E')?.059:.055;
      if(rampGrade===.059){const length=polylineLength(r.centerline);let d=0;for(let i=0;i<r.centerline.length;i++){const q=r.centerline[i]!;if(i)d+=Math.hypot(q.x-r.centerline[i-1]!.x,q.z-r.centerline[i-1]!.z);q.y=Math.max(q.y??0,Math.min(32,Math.max(0,.059*(d-35)),20+.059*Math.max(0,length-35-d)));}}
      // Projection onto curved approaches can shorten a transition. Retain the
      // reference deck profile while enforcing the regional ramp grade envelope.
      for(let i=1;i<r.centerline.length-1;i++){const previous=r.centerline[i-1]!,q=r.centerline[i]!,limit=rampGrade*Math.hypot(q.x-previous.x,q.z-previous.z);q.y=Math.max((previous.y??0)-limit,Math.min((previous.y??0)+limit,q.y??0));}
      for(let i=r.centerline.length-2;i>0;i--){const next=r.centerline[i+1]!,q=r.centerline[i]!,limit=rampGrade*Math.hypot(q.x-next.x,q.z-next.z);q.y=Math.max((next.y??0)-limit,Math.min((next.y??0)+limit,q.y??0));}
      map.roads.push(r);link(from.end,endpoint(r,'start'));link(endpoint(r,'end'),to.end);structure.roadIds.push(r.id);
    }
    for(const route of [main,cross]){const other=route===main?cross:main;if(!route.connectedRoutes.includes(other.id))route.connectedRoutes.push(other.id);}
  };
  system('regional:qingling','青岭枢纽',g38,s68,p(2100,-3400,24),0,'system_compact_turbine','三向定向 T；仅南、北、东三个方向',['S-to-E','E-to-S','N-to-E','E-to-N']);
  system('regional:dongyuan','东原枢纽',g17,s68,p(4000,-350,0),Math.PI/2,'system_compact_turbine','用户涡轮式立交参考（图 4）');
  system('regional:lingang','临港枢纽',s26,s68,p(2200,3700,0),Math.PI/2,'system_compact_star','错位不对称定向 T；港区通道和北侧联络', ['S-to-E','E-to-S','N-to-E','E-to-N']);
  system('regional:xichuan','西川枢纽',s89,s37,p(-4700,2700,13),0,'system_compact_turbine','三向定向 T；河谷高速终止于外围绕行线',['S-to-E','E-to-S','N-to-E','E-to-N']);
  system('regional:logistics','物流枢纽',s26,s89,p(0,3400,0),0,'system_compact_star','用户四星式参考（图 5、8）');
  // X form in the actual oblique road frame; the second axis is sheared, not made orthogonal.
  system('regional:dongnan','东南枢纽',g4516,s89,p(5700,2600,4),Math.atan2(.8,.6),'system_compact_x','用户 X 形立交参考（图 6），斜交适配',undefined,.8125);

  // A crossing's upper through deck is a bridge, never a terrain embankment
  // across the lower motorway. This also keeps terrain sampling out of its floor.
  for(const hub of map.regional.structures.filter(s=>s.kind==='interchange')){
    const routes=hub.routes.map(id=>map.regional!.routes.find(r=>r.id===id)!);
    const station=(route:RegionalRoute)=>{let nearest=Infinity,result=0,d=0;for(let i=0;i<route.centerline.length;i++){if(i)d+=Math.hypot(route.centerline[i]!.x-route.centerline[i-1]!.x,route.centerline[i]!.z-route.centerline[i-1]!.z);const distance=Math.hypot(route.centerline[i]!.x-hub.center.x,route.centerline[i]!.z-hub.center.z);if(distance<nearest){nearest=distance;result=d;}}return result;};
    const high=routes.reduce((a,b)=>(sampleAt(a.centerline,station(a)).point.y??0)>(sampleAt(b.centerline,station(b)).point.y??0)?a:b),at=station(high),length=polylineLength(high.centerline),start=Math.max(0,at-700),finish=Math.min(length,at+700);
    for(const direction of [1,-1])for(const d of [start,finish]){const s=sampleAt(high.centerline,d);cut(high,p(s.point.x-s.tangent.z*8.625*direction,s.point.z+s.tangent.x*8.625*direction,s.point.y),true);}
    for(const rid of high.roadIds){const r=map.roads.find(v=>v.id===rid)!,q=r.centerline[Math.floor(r.centerline.length/2)]!;if(Math.hypot(q.x-hub.center.x,q.z-hub.center.z)>700)continue;r.corridorSection='BRIDGE';r.structure!.piersEnabled=true;r.structure!.pierSpacing=60;r.structure!.barrierStyle='concrete';}
  }

  // Structure boundaries become road endpoints before enclosure/pier flags are applied.
  const section=(route:RegionalRoute,id:string,name:string,start:number,end:number,kind:'bridge'|'tunnel')=>{
    const structure:RegionalStructure={id,name,kind,center:sampleAt(route.centerline,(start+end)/2).point,roadIds:[],radius:(end-start)/2+200,routes:[route.id],form:kind,reference:'共享 RoadBuilder / RoadInfrastructure'};
    const stations=(q:CityPoint)=>{let best=Infinity,station=0,result=0;for(let i=1;i<route.centerline.length;i++){const a=route.centerline[i-1]!,b=route.centerline[i]!,dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((q.x-a.x)*dx+(q.z-a.z)*dz)/(l*l))),d=Math.hypot(q.x-a.x-dx*t,q.z-a.z-dz*t);if(d<best){best=d;result=station+l*t;}station+=l;}return result;};
    for(const direction of [1,-1])for(const station of [start,end]){const s=sampleAt(route.centerline,station),q=p(s.point.x-s.tangent.z*8.625*direction,s.point.z+s.tangent.x*8.625*direction,s.point.y);cut(route,q,true);}
    for(const rid of route.roadIds){const r=map.roads.find(r=>r.id===rid)!,s=stations(r.centerline[Math.floor(r.centerline.length/2)]!);if(s<start-.5||s>end+.5)continue;r.corridorSection=kind==='bridge'?'BRIDGE':'TUNNEL';r.structure!.piersEnabled=kind==='bridge';r.structure!.pierSpacing=60;r.structure!.barrierStyle='concrete';if(kind==='tunnel'){r.structure!.enclosure={kind:'tunnel',clearance:6};r.streetlights=false;}structure.roadIds.push(rid);}
    map.regional!.structures.push(structure);
  };
  // G17 deck rises gently before the wide river; earthworks support the approaches.
  for(const rid of g17.roadIds){const r=map.roads.find(r=>r.id===rid)!;for(const q of r.centerline){q.y=Math.max(q.y??0,18*Math.max(0,Math.min(1,(q.x-5400)/600,(7000-q.x)/500)));}}
  for(const q of g17.centerline)q.y=18*Math.max(0,Math.min(1,(q.x-5400)/600,(7000-q.x)/500));
  section(g17,'regional:river-bridge','东临大河桥',polylineLength(g17.centerline.slice(0,g17.centerline.findIndex(q=>q.x>=5900))),polylineLength(g17.centerline.slice(0,g17.centerline.findIndex(q=>q.x>=6600))),'bridge');
  section(g38,'regional:north-tunnel','青岭隧道',1750,2330,'tunnel');
  section(g38,'regional:valley-bridge','北岭谷桥',3100,3570,'bridge');
  section(s37,'regional:west-bridge-1','河湾一桥',700,890,'bridge');section(s37,'regional:west-bridge-2','河湾二桥',1930,2110,'bridge');

  const object=(id:string,prefabId:PrefabId,position:CityPoint,sx=1,sy=1,sz=1,rotation=0,color?:string)=>map.objects.push({id,prefabId,position,rotation,scale:{x:sx,y:sy,z:sz},color});
  const access=(route:RegionalRoute,id:string,name:string,station:number,service=false)=>{
    const s=sampleAt(route.centerline,station),y=s.point.y??0,center=p(s.point.x-s.tangent.z*110,s.point.z+s.tangent.x*110,y),angle=Math.atan2(s.tangent.x,s.tangent.z);
    const pose=(along:number,lateral:number)=>p(s.point.x+s.tangent.x*along-s.tangent.z*lateral,s.point.z+s.tangent.z*along+s.tangent.x*lateral,y);
    const roads:string[]=[];
    // Two direction pairs, ordinary compact access, separated from motorway traffic by earthworks.
    for(const dir of [1,-1]) {
      const mouth=(at:number)=>{const q=sampleAt(route.centerline,at);return p(q.point.x-q.tangent.z*8.625*dir,q.point.z+q.tangent.x*8.625*dir,q.point.y);};
      const a=mouth(station-dir*280),b=mouth(station+dir*280),c=pose(-dir*60,dir*105),d=pose(dir*60,dir*105);
      const from=cut(route,a,false),to=cut(route,b,true);
      const off=add(`${id}:off:${dir}`,bezierPoints(from.point,pose(-dir*200,dir*8.625),pose(-dir*130,dir*105),c),1,50,route.id,'GROUND');
      const local=add(`${id}:local:${dir}`,[c,d],2,30,undefined,'GROUND');local.roadClass='local';
      const on=add(`${id}:on:${dir}`,bezierPoints(d,pose(dir*130,dir*105),pose(dir*200,dir*8.625),to.point),1,50,route.id,'GROUND');
      for(const road of [off,on]){const length=polylineLength(road.centerline),sy=road.centerline[0]!.y??0,ey=road.centerline.at(-1)!.y??0;let distance=0;for(let i=0;i<road.centerline.length;i++){if(i)distance+=Math.hypot(road.centerline[i]!.x-road.centerline[i-1]!.x,road.centerline[i]!.z-road.centerline[i-1]!.z);road.centerline[i]!.y=sy+(ey-sy)*compactRampEase(distance/length);}}
      off.gore={start:true,end:false,length:100};on.gore={start:false,end:true,length:100};
      link(from.end,endpoint(off,'start'));link(endpoint(off,'end'),endpoint(local,'start'));link(endpoint(local,'end'),endpoint(on,'start'));link(endpoint(on,'end'),to.end);roads.push(off.id,local.id,on.id);
      object(`${id}:parking:${dir}`,'parking',pose(0,dir*125),4,1,2,angle);
      object(`${id}:building:${dir}`,service?'commercial':'industrial',pose(0,dir*165),service?1.2:1,service?.6:.8,1,angle);
      for(const along of [-65,65])object(`${id}:lamp:${dir}:${along}`,'streetlight',pose(along,dir*140));
      if(service&&id.includes('donglin')) {
        object(`${id}:fuel-canopy:${dir}`,'bus_stop',pose(-45,dir*145),3,1.5,3,angle);
        object(`${id}:toilet:${dir}`,'garage',pose(60,dir*165),.5,.6,.5,angle);
        for(let i=0;i<4;i++)object(`${id}:charger:${dir}:${i}`,'traffic_sign',pose(10+i*5,dir*138),.3,.6,.4,angle,'#e8f5f0');
      }
    }
    map.roadNames![id]={primaryText:name,kind:service?'destination':'interchange'};
    if(service)map.regional!.structures.push({id,name,kind:'service',center,roadIds:roads,radius:420,routes:[route.id],form:'paired access and parking',reference:'普通出口和共享 prefab'});
    else map.regional!.exits.push({id,name,route:route.id,roadIds:roads});
  };
  access(g17,'regional:dongjiao','东郊互通',850);access(g17,'regional:binhe','滨河互通',4700);
  access(g38,'regional:beilu','北麓互通',650);access(g38,'regional:shangu','山谷互通',4200);
  access(s26,'regional:nangang','南港互通',450);access(s37,'regional:hewan','河湾互通',1200);
  access(g4516,'regional:wuliuyuan','物流园互通',4000);
  access(g17,'regional:donglin-service','东临服务区',3400,true);access(g38,'regional:beiling-parking','北岭停车区',4800,true);

  const terrain=new RegionalTerrainSampler(map);
  // Seeded fields, forest belts and large industrial plots; prefabs are sector-instanced.
  for(let x=-5000;x<8600;x+=160)for(let z=-5100;z<4600;z+=160){
    if(x>city.bounds.minX-160&&x<city.bounds.maxX+160&&z>city.bounds.minZ-160&&z<city.bounds.maxZ+160)continue;
    const hash=Math.abs(Math.sin(x*12.9898+z*78.233)*43758.5453)%1;
    const px=x+(hash-.5)*110,pz=z+(Math.abs(Math.sin(z*4.123+x*9.21)*15743.1)%1-.5)*110;
    if(terrain.nearRoad(px,pz,55)||terrain.waterAt(px,pz))continue;
    const y=terrain.heightAt(px,pz);
    if(z < -2400 || x < -3000 || x>4200&&hash>.6)object(`regional:tree:${x}:${z}`,'tree',p(px,pz,y),1.6,1.3,1.6,hash*6.28,'#72915a');
    else if(z>2500&&hash>.85)object(`regional:warehouse:${x}:${z}`,'industrial',p(px,pz,y),2+hash,1,2.5,0,'#adb1ac');
    else if(x>4100&&z<1800&&hash>.94)object(`regional:village:${x}:${z}`,'residential_low',p(px,pz,y),1,.7,1,0,'#c9c0ad');
  }
  // Bound streamed construction work to 500m authoring spans, while keeping the road graph linked.
  for(const route of map.regional.routes)for(let i=0;i<route.roadIds.length;i++){const road=map.roads.find(r=>r.id===route.roadIds[i])!;if(polylineLength(road.centerline)>600)cut(route,sampleAt(road.centerline,500).point,true);}
  for(const id of s37.roadIds){const road=map.roads.find(r=>r.id===id)!;if(road.corridorSection==='GROUND'&&road.centerline.some(p=>p.z>900&&p.z<1800)){road.corridorSection='DEPRESSED';road.structure!.enclosure={kind:'cutting',clearance:6};}}
  generateRegionalSigns(map);
  for(const route of map.regional.routes){const s=sampleAt(route.centerline,Math.min(600,polylineLength(route.centerline)/3));map.environment.spawnPoints.push({id:`regional-${route.id}`,position:p(s.point.x-s.tangent.z*8.625,s.point.z+s.tangent.x*8.625,s.point.y),rotation:Math.atan2(-s.tangent.x,-s.tangent.z)});}
  map.environment.metadata={...map.environment.metadata,regionalVersion:'1',regionalAuthor:'scripts/build-regional-world.mjs',routeNumbers:'fictional G17 G38 G4516 S26 S37 S68 S89'};
  return map;
}
