import type { CityMapData, CityPoint, CityRoad, RoadEndpoint } from '../city/CityMapData';
import type { RegionalRoute } from './RegionalData';
import { polylineLength, sampleAt, rotatePoint } from '../city/geometry';
import { expandCompactInterchange } from '../city/presets/CompactInterchangePresets';
import { addHighwayTransitions } from './HighwayMarkings';
import { generateHighwaySigns } from './HighwaySigns';

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

/** Revision of the saved V1, preserving city data and actual existing mainline geometry. */
export function reviseHighwayNetwork(input: CityMapData): CityMapData {
  if (input.environment.metadata?.highwayNetworkRevision === '2') throw new Error('Use the saved V1 snapshot to reproduce revision 2.');
  const map = structuredClone(input), region = map.regional!, system = region.highways!, names = map.roadNames!;
  const roads = new Map(map.roads.map(r => [r.id, r]));
  let serial = 0;
  const endpoint = (road: CityRoad, end: 'start' | 'end'): RoadEndpoint => ({ roadId: road.id, end });
  const link = (from: RoadEndpoint, to: RoadEndpoint) => map.roadLinks!.push({ id: `regional:v2:link:${serial++}`, from, to });
  const get = (id: string) => region.routes.find(r => r.id === id)!;
  const merge = (retained: string, continuation: string) => {
    const a = get(retained), b = get(continuation);
    a.centerline.push(...b.centerline.slice(1)); a.roadIds.push(...b.roadIds);
    for (const r of map.roads) if (r.roadNameId === continuation) r.roadNameId = retained;
    for (const s of region.structures) s.routes = [...new Set(s.routes.map(id => id === continuation ? retained : id))];
    for (const e of region.exits) if (e.route === continuation) e.route = retained;
    for (const r of region.routes) r.connectedRoutes = [...new Set(r.connectedRoutes.concat(r === a ? b.connectedRoutes : []).map(id => id === continuation ? retained : id))].filter(id => id !== r.id);
    region.routes = region.routes.filter(r => r !== b);
    for (const e of system.exits) if (e.highway === continuation) e.highway = retained;
    for (const e of system.services) if (e.highway === continuation) e.highway = retained;
    for (const j of system.junctions) j.connectedRoutes = [...new Set(j.connectedRoutes.map(id => id === continuation ? retained : id))];
    system.junctions = system.junctions.filter(j => j.connectedRoutes.length > 1);
    system.routes = system.routes.filter(r => r.id !== continuation);
    delete names[continuation]; delete names[continuation + ':forward']; delete names[continuation + ':reverse'];
  };
  merge('G17', 'G42'); merge('G38', 'G65');
  get('S68').number = 'S28'; names.S68!.routeNumber = 'S28';
  const oldG38Length = polylineLength(input.regional!.routes.find(r => r.id === 'G38')!.centerline);
  const mountainStation=oldG38Length+650;
  const mountain = sampleAt(get('G38').centerline, mountainStation);
  const mt = mountain.tangent, cross = { x: -mt.z, z: mt.x }, mc = mountain.point;
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
        const road: CityRoad = { id: `regional:v2:${id}:${dir === 1 ? 'out' : 'in'}:${Math.floor(start / 1200)}`, type: 'highway', centerline: section, curve: 'polyline', laneCount: lanes, laneWidth: 3.75, speedLimit: speed, travelDirection: 'forward', roadNameId: id, designProfile: 'motorway', elevationMode: 'custom', corridorSection: 'GROUND', shoulders: { left: 1, right: 3 }, structure: { barrierEnabled: true, piersEnabled: false, pierSpacing: 60, medianBarrierStyle: 'concrete' }, streetlights: false };
        map.roads.push(road); roads.set(road.id, road); r.roadIds.push(road.id);
        if (previous) link(endpoint(previous, 'end'), endpoint(road, 'start')); previous = road;
      }
    }
    return r;
  };
  const g42 = makeRoute('G42', '晨江高速', [[-14500,-5500,1,0,18],[-11500,-5500,1,0,18],[-10300,-5500,1,0,18],[-8800,-5500,1,0,18],[-6300,-5500,1,0,36],[-4600,-5500,1,0,30],[-2500,-6900,.7,-.7,35],
    [mc.x-cross.x*1500,mc.z-cross.z*1500,cross.x,cross.z,(mc.y??0)+12], [mc.x,mc.z,cross.x,cross.z,(mc.y??0)+12], [mc.x+cross.x*1500,mc.z+cross.z*1500,cross.x,cross.z,(mc.y??0)+12], [11000,-4300,1,0,25],[14500,-4300,1,0,18]], 2, 120);
  const g65 = makeRoute('G65', '云岭高速', [[-10300,-10000,0,1,28],[-10300,-5500,0,1,28],[-10300,-4300,0,1,28],[-10300,-3000,0,1,28],[-10300,1700,0,1,22],[-10300,2700,0,1,22],[-10300,3800,0,1,22],[-9600,6000,.6,.8,18],[-6600,8200,1,.2,15],[-4300,8500,1,0,15]], 2, 100);

  // Extend S27 across its existing western hub, without changing its identity.
  const west = get('S37'), end = west.centerline.at(-1)!, last = sampleAt(west.centerline,polylineLength(west.centerline)).tangent;
  const extension = makeRoute('S27-extension', west.name, [[end.x,end.z,last.x,last.z,end.y??0],[-7000,2700,-1,0,13],[-10300,2700,-1,0,10],[-12500,2700,-1,0,10],[-14500,3600,-1,0,10]], west.lanes, west.speed);
  const terminal = (route: RegionalRoute, dir: string, finish: boolean) => {
    const list = route.roadIds.map(id => roads.get(id)!).filter(r => r.id.includes(':'+dir));
    return list.find(r => !map.roadLinks!.some(l => (finish ? l.from : l.to).roadId === r.id && list.some(o => o.id === (finish ? l.to : l.from).roadId)))!;
  };
  for(const dir of ['out','in']){
    const a=terminal(west,dir,dir==='out'),b=terminal(extension,dir,dir==='in');
    const source=dir==='out'?a:b,target=dir==='out'?b:a;
    const at=dir==='out'?0:b.centerline.length-1,q=dir==='out'?a.centerline.at(-1)!:a.centerline[0]!,t=b.centerline[at]!,dx=q.x-t.x,dz=q.z-t.z,dy=(q.y??0)-(t.y??0);
    b.centerline.forEach((p,i)=>{const w=Math.max(0,1-Math.abs(i-at)/20);p.x+=dx*w;p.z+=dz*w;p.y=(p.y??0)+dy*w;});
    link(endpoint(source,'end'),endpoint(target,'start'));
  }
  west.centerline.push(...extension.centerline.slice(1)); west.roadIds.push(...extension.roadIds);
  for(const id of extension.roadIds) roads.get(id)!.roadNameId=west.id;
  region.routes=region.routes.filter(r=>r!==extension);delete names[extension.id];

  // Projection returns the actual signed carriageway and station, never a crossing-based connection.
  const projection = (route: RegionalRoute, query: CityPoint) => {
    let best = Infinity, chosen = roads.get(route.roadIds[0]!)!, station = 0;
    for (const id of route.roadIds) { const r = roads.get(id)!; let d = 0;
      for(let i=1;i<r.centerline.length;i++) {const a=r.centerline[i-1]!,b=r.centerline[i]!,dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((query.x-a.x)*dx+(query.z-a.z)*dz)/(l*l))),distance=Math.hypot(query.x-a.x-dx*t,query.z-a.z-dz*t);if(distance<best){best=distance;chosen=r;station=d+t*l;}d+=l;}
    }
    return {road:chosen,station,point:sampleAt(chosen.centerline,station).point};
  };
  const cut = (route: RegionalRoute, query: CityPoint, outgoing: boolean) => {
    const location=projection(route,query),r=location.road,length=polylineLength(r.centerline),q=location.point;
    if(location.station<.05||length-location.station<.05){
      const desired=outgoing?'start':'end';
      const match=route.roadIds.map(id=>roads.get(id)!).find(v=>{const p=desired==='start'?v.centerline[0]!:v.centerline.at(-1)!;return Math.hypot(p.x-q.x,p.z-q.z)<.1;});
      if(!match)throw new Error('Cannot attach route endpoint '+route.id);
      return {point:q,end:endpoint(match,desired)};
    }
    const head:CityPoint[]=[],tail:CityPoint[]=[];let d=0;
    r.centerline.forEach((v,i)=>{if(i)d+=Math.hypot(v.x-r.centerline[i-1]!.x,v.z-r.centerline[i-1]!.z);if(d<location.station-.04)head.push(v);if(d>location.station+.04)tail.push(v);});
    const next:CityRoad={...structuredClone(r),id:`${r.id}:revision${serial++}`,centerline:[q,...tail]};r.centerline=[...head,q];
    for(const l of map.roadLinks!)for(const e of [l.from,l.to])if(e.roadId===r.id&&e.end==='end')e.roadId=next.id;
    for(const s of region.structures)if(s.roadIds.includes(r.id))s.roadIds.push(next.id);
    map.roads.push(next);roads.set(next.id,next);route.roadIds.push(next.id);link(endpoint(r,'end'),endpoint(next,'start'));
    return {point:q,end:outgoing?endpoint(next,'start'):endpoint(r,'end')};
  };
  const hub = (id: string, name: string, main: RegionalRoute, other: RegionalRoute, center: CityPoint, rotation: number) => {
    const mainY=projection(main,center).point.y??0,crossY=projection(other,center).point.y??0;
    const stamp=expandCompactInterchange('system_compact_cloverleaf',{mainRoadLanes:main.lanes*2,crossRoadLanes:other.lanes*2,mainElevation:mainY,crossElevation:crossY,mainApproach:330,groupId:id});
    const structure={id,name,kind:'interchange' as const,center:{...center,y:mainY},roadIds:[] as string[],radius:900,routes:[main.id,other.id],form:'system_compact_cloverleaf',reference:'既有主线连续贯穿；依据实际线路朝向插入完整八向互通'};
    region.structures.push(structure);names[id]={primaryText:name,kind:'interchange'};
    for(const r of stamp.roads){
      r.centerline=r.centerline.map(q=>{
        if(id==='regional:v2:northwest'){const station=mountainStation+q.z*2.4,frame=sampleAt(main.centerline,station),a=sampleAt(main.centerline,station-35).point,b=sampleAt(main.centerline,station+35).point,l=Math.hypot(b.x-a.x,b.z-a.z);return p(frame.point.x+(b.z-a.z)/l*q.x*2.4,frame.point.z-(b.x-a.x)/l*q.x*2.4,q.y);}
        const v=rotatePoint(p(q.x*2.4,q.z*2.4,q.y),rotation);return p(center.x+v.x,center.z+v.z,v.y);
      });
      const source=/:(S|N)-to-/.test(r.id)?main:other,target=/-to-(S|N)-/.test(r.id)?main:other;
      const a=projection(source,r.centerline[0]!).point,b=projection(target,r.centerline.at(-1)!).point;
      const original=structuredClone(r.centerline),length=polylineLength(original),oldA=original[0]!,oldB=original.at(-1)!;let d=0;
      r.centerline.forEach((q,i)=>{if(i)d+=Math.hypot(original[i]!.x-original[i-1]!.x,original[i]!.z-original[i-1]!.z);const u=Math.max(0,1-d/180),v=Math.max(0,1-(length-d)/180);q.x+=(a.x-oldA.x)*u+(b.x-oldB.x)*v;q.z+=(a.z-oldA.z)*u+(b.z-oldB.z)*v;q.y=(q.y??0)+((a.y??0)-(oldA.y??0))*u+((b.y??0)-(oldB.y??0))*v;});
      const from=cut(source,a,false),to=cut(target,b,true);r.centerline[0]=from.point;r.centerline[r.centerline.length-1]=to.point;
      for(let i=1;i<r.centerline.length-1;i++){const a=r.centerline[i-1]!,q=r.centerline[i]!,limit=.055*Math.hypot(q.x-a.x,q.z-a.z);q.y=Math.max((a.y??0)-limit,Math.min((a.y??0)+limit,q.y??0));}
      for(let i=r.centerline.length-2;i>0;i--){const a=r.centerline[i+1]!,q=r.centerline[i]!,limit=.055*Math.hypot(q.x-a.x,q.z-a.z);q.y=Math.max((a.y??0)-limit,Math.min((a.y??0)+limit,q.y??0));}
      r.roadNameId=target.id;r.designProfile='motorway';r.presetSource=undefined;r.corridorSection='RAMP';r.streetlights=false;r.speedLimit=r.id.includes('loop')?50:70;r.shoulders={left:1,right:2};r.structure!.pierSpacing=60;
      map.roads.push(r);roads.set(r.id,r);link(from.end,endpoint(r,'start'));link(endpoint(r,'end'),to.end);structure.roadIds.push(r.id);
    }
    for(const r of [main,other])r.connectedRoutes.push(r===main?other.id:main.id);
  };
  hub('regional:v2:westgate','西岭枢纽',g65,g42,p(-10300,-5500,28),0);
  hub('regional:v2:airport-north','机场北枢纽',get('S18'),g42,p(-6300,-5500,20),0);
  // The mountain hub follows the existing northbound axis rather than forcing an east-west cross.
  hub('regional:v2:northwest','北岭西枢纽',get('G38'),g42,mc,Math.atan2(mt.x,mt.z));
  hub('regional:v2:westlink','西川西枢纽',g65,west,p(-10300,2700,22),0);

  // Each upper crossing is a supported deck. Earthworks must not block the lower mainline.
  for(const [r,center] of [[g65,p(-10300,-5500)],[g65,p(-10300,2700)],[g42,p(-6300,-5500)],[g42,mc]] as const){
    const ids:string[]=[];
    for(const id of r.roadIds){const road=roads.get(id)!;if(!road.centerline.some(q=>Math.hypot(q.x-center.x,q.z-center.z)<950))continue;road.corridorSection='BRIDGE';road.structure!.piersEnabled=true;road.structure!.barrierStyle='concrete';ids.push(id);}
    region.structures.push({id:`regional:v2:deck:${r.id}:${center.x}`,name:'枢纽主线跨线桥',kind:'bridge',center:projection(r,center).point,roadIds:ids,radius:1100,routes:[r.id],form:'through-deck',reference:'上层主线桥面保留；不改变下层主线'});
  }
  // G42 also crosses S31 without an interchange; derive the crossing from actual paths.
  const crossing=(a:RegionalRoute,b:RegionalRoute)=>{
    for(let i=1;i<a.centerline.length;i++)for(let j=1;j<b.centerline.length;j++){
      const u=a.centerline[i-1]!,v=a.centerline[i]!,q=b.centerline[j-1]!,r=b.centerline[j]!,dx=v.x-u.x,dz=v.z-u.z,ex=r.x-q.x,ez=r.z-q.z,det=dx*ez-dz*ex;if(Math.abs(det)<1e-6)continue;
      const t=((q.x-u.x)*ez-(q.z-u.z)*ex)/det,s=((q.x-u.x)*dz-(q.z-u.z)*dx)/det;
      if(t>=0&&t<=1&&s>=0&&s<=1)return p(u.x+dx*t,u.z+dz*t);
    }
    return undefined;
  };
  const riverCross=crossing(g42,get('S31'));
  if(riverCross){
    const lower=projection(get('S31'),riverCross).point.y??0,upper=projection(g42,riverCross).point.y??0;
    const delta=Math.max(0,lower+12-upper);
    for(const points of [g42.centerline,...g42.roadIds.map(id=>roads.get(id)!.centerline)])for(const q of points){const distance=Math.hypot(q.x-riverCross.x,q.z-riverCross.z);q.y=(q.y??0)+delta*ease(Math.max(0,Math.min(1,(1000-distance)/650)));}
    const ids=g42.roadIds.filter(id=>roads.get(id)!.centerline.some(q=>Math.hypot(q.x-riverCross.x,q.z-riverCross.z)<900));
    for(const id of ids){const road=roads.get(id)!;road.corridorSection='BRIDGE';road.structure!.piersEnabled=true;road.structure!.barrierStyle='concrete';}
    region.structures.push({id:'regional:v2:river-cross',name:'晨江沿江跨线桥',kind:'bridge',center:projection(g42,riverCross).point,roadIds:ids,radius:1200,routes:['G42'],form:'unconnected-crossing',reference:'上下层跨越，禁止通过投影交点自动连接'});
  }
  const newRampIds=new Set(region.structures.filter(s=>s.id.startsWith('regional:v2:')&&s.kind==='interchange').flatMap(s=>s.roadIds));
  newRampIds.add('regional:hewan:off:-1');
  addHighwayTransitions(map,newRampIds);
  for(const r of map.roads)roads.set(r.id,r);
  for(const e of system.exits)e.roadIds=[...region.exits.find(v=>v.id===e.id)!.roadIds];
  for(const e of system.services)e.roadIds=[...region.structures.find(v=>v.id===e.id)!.roadIds];
  const directions:Record<string,[string,string]>={G17:['东临 / 晨江','东原 / 市区'],G38:['北岭 / 云岭','青岭 / 市区'],G42:['晨江 / 东部地区','西原 / 西部地区'],G65:['西川 / 南部地区','云岭 / 西北地区'],G4516:['山海 / 东南新区','东原 / 市区'],S26:['南港 / 临港','物流园 / 市区'],S37:['西川 / 西部地区','河湾 / 市区'],S68:['东原 / 南港','青岭 / 北岭'],S89:['东南新区 / 新城','西川 / 机场'],S18:['机场 / T1 T2 航站楼','西川 / 市区'],S36:['新城 / 城际新区','东南新区 / 市区'],S31:['沿江 / 晨江','云岭 / 北岭']};
  const roles:Record<string,'trunk'|'orbital'|'connector'|'branch'>={G17:'trunk',G38:'trunk',G42:'trunk',G65:'trunk',G4516:'connector',S26:'branch',S37:'connector',S68:'orbital',S89:'orbital',S18:'branch',S36:'branch',S31:'orbital'};
  const termini:Record<string,[string,string]>={G17:['城市快速环路','沿江高速'],G38:['城市快速环路','沿江高速'],G42:['西原（区域外）','晨江（区域外）'],G65:['云岭西北（区域外）','南部地区（区域外）'],G4516:['城市外缘','山海方向'],S26:['城市外缘','南港方向'],S37:['城市外缘','西川（区域外）'],S68:['青岭枢纽','临港枢纽'],S89:['机场高速','城际连接高速'],S18:['城市绕城高速','机场 / 航站楼'],S36:['城市绕城高速','新城方向'],S31:['北岭高速','东临高速']};
  system.routes=region.routes.map(r=>({id:r.id,number:r.number??r.id,name:r.name,type:r.id==='G4516'?'connector':r.id.startsWith('G')?'national':'provincial',role:roles[r.id]!,termini:{start:termini[r.id]![0],end:termini[r.id]![1]},direction:{forward:directions[r.id]![0],reverse:directions[r.id]![1]},roadIds:[...r.roadIds]}));
  for(const s of region.structures.filter(s=>s.kind==='interchange'&&s.id.startsWith('regional:v2:')))system.junctions.push({kind:'interchange',id:s.id,name:s.name,connectedRoutes:s.routes,directions:{},position:s.center,roadIds:s.roadIds});
  for(const j of system.junctions){j.directions=Object.fromEntries(j.connectedRoutes.map(id=>[id,system.routes.find(r=>r.id===id)!.direction]));}
  for(const r of region.routes)r.connectedRoutes=[...new Set(r.connectedRoutes)].filter(id=>region.routes.some(v=>v.id===id)&&id!==r.id);
  for(const route of system.routes)for(const dir of ['forward','reverse'] as const)names[route.id+':'+dir]={primaryText:route.direction[dir],kind:'destination'};
  for(const r of [g42,g65]){const s=sampleAt(r.centerline,1100),offset=r.lanes*3.75/2+3;map.environment.spawnPoints.push({id:'regional-west-'+r.id,position:p(s.point.x-s.tangent.z*offset,s.point.z+s.tangent.x*offset,s.point.y),rotation:Math.atan2(-s.tangent.x,-s.tangent.z)});}
  map.bounds={minX:-15000,maxX:15000,minZ:-10500,maxZ:9000};region.terrainBounds={minX:-16000,maxX:16000,minZ:-11500,maxZ:10000};
  map.version++;
  map.environment.metadata={...map.environment.metadata,highwayNetworkRevision:'2',highwaySystemVersion:'2',routeNumbers:system.routes.map(r=>r.number).join(',')};
  for(const road of map.roads.filter(r=>!input.roads.some(old=>old.id===r.id))){
    const cleaned:CityPoint[]=[];for(const q of road.centerline)if(!cleaned.length||Math.hypot(q.x-cleaned.at(-1)!.x,q.z-cleaned.at(-1)!.z)>=.05)cleaned.push(q);
    road.centerline=cleaned;
  }
  generateHighwaySigns(map);return map;
}
