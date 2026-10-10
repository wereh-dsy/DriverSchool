import { newCityMap, type CityPoint, type CityRoad, type RoadEndpoint } from '../CityMapData';
import { connectRoads } from '../RoadConnections';
import { applyRoadStyle } from '../RoadStyles';
import { point3, transformPoint3 } from '../coordinates';
import { directionalPortLabel, polylineLength, refreshPortPoses, rotatePoint, sampleAt } from '../geometry';
import { validateMap } from '../CityMapValidation';
import { validatePresetGeometry } from './PresetGeometryValidation';
import type { PresetParameters, PresetStamp } from './InfrastructurePresets';

const SYSTEMS = ['system_cloverleaf', 'system_cloverleaf_cd', 'system_cloverstack_lite', 'system_parclo_cd', 'peripheral_motorway_junction'];
export const isBackbonePreset = (id: string): boolean => [...SYSTEMS, 'urban_side_access', 'divided_tunnel', 'urban_underpass', 'urban_main_aux'].includes(id);
export const ease = (t: number): number => { t = Math.max(0, Math.min(1, t)); return t * t * t * (10 + t * (-15 + 6 * t)); };
export function profileHeight(profile: { offset: number; height: number }[] | undefined, offset: number, fallback: number, interpolation:'smooth'|'linear'='smooth'): number {
  if (!profile?.length) return fallback;
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1]!, b = profile[i]!;
    if (offset <= b.offset) {const t=Math.max(0,Math.min(1,(offset-a.offset)/(b.offset-a.offset)));return a.height+(b.height-a.height)*(interpolation==='linear'?t:ease(t));}
  }
  return profile.at(-1)!.height;
}
/** Sampled curves become normal editable polylines; never run at physics frequency. */
export function bezierPoints(a: CityPoint, b: CityPoint, c: CityPoint, d: CityPoint): CityPoint[] {
  const n = Math.max(12, Math.ceil((Math.hypot(b.x-a.x,b.z-a.z)+Math.hypot(c.x-b.x,c.z-b.z)+Math.hypot(d.x-c.x,d.z-c.z))/4));
  return Array.from({length:n+1},(_,i)=>{const t=i/n,u=1-t;return point3(u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,
    (a.y??0)+((d.y??0)-(a.y??0))*ease(t),u*u*u*a.z+3*u*u*t*b.z+3*u*t*t*c.z+t*t*t*d.z);});
}
const arc = (x: number, z: number, r: number, start: number, sweep: number): CityPoint[] => {
  const n=Math.ceil(Math.abs(sweep)*r/3);
  return Array.from({length:n+1},(_,i)=>point3(x+r*Math.cos(start+sweep*i/n),0,z+r*Math.sin(start+sweep*i/n)));
};
const join = (...paths: CityPoint[][]): CityPoint[] => paths.flatMap((p,i)=>i?p.slice(1):p);
const line = (a: CityPoint,b: CityPoint): CityPoint[] => {
  const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/4));
  return Array.from({length:n+1},(_,i)=>point3(a.x+(b.x-a.x)*i/n,(a.y??0)+((b.y??0)-(a.y??0))*i/n,a.z+(b.z-a.z)*i/n));
};

/** Reusable ramp-only system stamps attach to authored continuous corridors via endpoint ports. */
export function expandBackbonePreset(id: string, p: PresetParameters): PresetStamp {
  const designProfile=p.designProfile??(id==='peripheral_motorway_junction'?'motorway':id==='urban_side_access'?'urban':undefined);
  const m=newCityMap(), groupId=p.groupId??id, meta={groupId,presetSource:id,designProfile};
  const compact=designProfile==='urban';
  const position=p.position??point3(0,0,0), rotation=p.rotation??0;
  const lanes=p.mainRoadLanes??6, crossLanes=p.crossRoadLanes??6, mainY=p.mainElevation??8, crossY=p.crossElevation??0;
  const radius=Math.max(compact?30:id==='peripheral_motorway_junction'?50:45,p.rampRadius??(compact?35:60)), length=p.length??(id==='urban_underpass'?110:id==='urban_main_aux'?1800:id==='urban_side_access'?900:550);
  const mainApproach=p.mainApproach??(compact?420:600),crossApproach=p.crossApproach??(compact?420:600),cdOffset=compact?14:22,mouth=compact?65:125,lead=compact?100:designProfile==='motorway'?220:150;
  if(p.designProfile!==undefined&&!['urban','motorway'].includes(p.designProfile)||![mainApproach,crossApproach].every(v=>Number.isFinite(v)&&v>=300&&v<=1000)||compact&&radius>45)throw new Error('preset.parameters: invalid expressway design profile');
  if (![4,6].includes(lanes)||![4,6].includes(crossLanes)||!Number.isFinite(radius)||radius>100||!Number.isFinite(length)||length<80||length>3000||
      ![position.x,position.y??0,position.z,rotation,mainY,crossY].every(Number.isFinite)) throw new Error('preset.parameters: invalid backbone dimensions');
  if(p.profileInterpolation!==undefined&&p.profileInterpolation!=='smooth'&&p.profileInterpolation!=='linear')throw new Error('preset.parameters: invalid profile interpolation');
  for (const profile of [p.mainProfile,p.crossProfile]) if(profile && (profile.length<2||profile.some((q,i)=>!Number.isFinite(q.offset)||!Number.isFinite(q.height)||i>0&&q.offset<=profile[i-1]!.offset))) throw new Error('preset.parameters: ordered finite height profile required');
  const endpoint=(r:CityRoad,end:'start'|'end'):RoadEndpoint=>({roadId:r.id,end});
  const link=(a:RoadEndpoint,b:RoadEndpoint)=>connectRoads(m,a,b,{id:`${groupId}:link-${m.roadLinks!.length}`});
  const port=(label:string,e:RoadEndpoint)=>m.connectionPorts!.push({id:`${groupId}:port-${m.connectionPorts!.length}`,label,endpoint:e,groupId});
  const road=(label:string,points:CityPoint[],count=1,speed=45,urban=false):CityRoad=>{
    const r:CityRoad={id:`${groupId}:${label}`,...meta,type:'highway',centerline:[],laneCount:count,laneWidth:3.9,travelDirection:'forward',speedLimit:speed};
    applyRoadStyle(r,urban?'urban_boulevard_6':'ramp_1');
    Object.assign(r,{type:urban?'urban_6lane':'highway',centerline:points,laneCount:count,laneWidth:urban?3.75:count===3?3.75:3.9,
      travelDirection:urban?'two-way':'forward',speedLimit:speed,elevationMode:'custom',streetlights:false});
    r.structure={barrierEnabled:!urban,piersEnabled:true,pierSpacing:55,barrierOffset:0.25};
    if (!urban) r.shoulders={left:0.75,right:1.75};
    m.roads.push(r);return r;
  };
  const bm=lanes/2*3.75/2+2.5, bc=p.crossCarriagewayOffset??crossLanes/2*3.75/2+2.5;
  if(!Number.isFinite(bc)||bc<6||bc>30)throw new Error('preset.parameters: invalid cross carriageway separation');
  const mainHeight=(offset:number)=>profileHeight(p.mainProfile,offset,mainY,p.profileInterpolation);
  const crossHeight=(offset:number)=>profileHeight(p.crossProfile,offset,crossY,p.profileInterpolation);
  if (SYSTEMS.includes(id)) {
    const collector = id.endsWith('_cd') ? (p.collectorAxis??(id==='system_parclo_cd'?'cross':'main')) : undefined;
    const sideOffset=(axis:'main'|'cross')=>(axis==='main'?bm:bc)+(collector===axis?cdOffset:0);
    const height=(q:CityPoint)=>Math.abs(q.x)<Math.abs(q.z)?mainHeight(q.z):crossHeight(q.x);
    const drape=(path:CityPoint[],entry:number,exit:number)=>{
      const length=polylineLength(path),from=entry,to=length-exit,span=to-from;
      const at=(distance:number)=>height(sampleAt(path,distance).point);
      const a=at(from),b=at(to),ga=(at(from+1)-at(from-1))/2,gb=(at(to+1)-at(to-1))/2;let d=0;
      path.forEach((q,i)=>{if(i)d+=Math.hypot(q.x-path[i-1]!.x,q.z-path[i-1]!.z);const t=(d-from)/span;
        // Follow the actual mainline grade while pavement overlaps the throat;
        // the middle Hermite interval keeps both vertical tangents continuous.
        q.y=d<=from||d>=to?at(d):(2*t*t*t-3*t*t+1)*a+(t*t*t-2*t*t+t)*ga*span+(-2*t*t*t+3*t*t)*b+(t*t*t-t*t)*gb*span;
      });
    };
    const nodes=new Map<string,{incoming:RoadEndpoint;outgoing?:RoadEndpoint}>();
    const key=(q:CityPoint)=>`${q.x.toFixed(3)},${q.z.toFixed(3)}`;
    if(id==='system_cloverstack_lite'||id==='system_parclo_cd') for(const sign of [1,-1]) {
      const distance=compact?550:mainApproach;
      const a=point3(sign*bm,mainHeight(sign*(distance+50)),sign*(distance+50)),b=point3(sign*bm,mainHeight(sign*distance),sign*distance);
      const r=road(`feeder-${sign}`,line(a,b),lanes/2,80);r.styleId='highway_6';
      nodes.set(key(b),{incoming:endpoint(r,'end')});port('Mainline In',endpoint(r,'start'));port('Mainline Out',endpoint(r,'end'));
      if(compact) {
        const c=point3(sign*420,crossHeight(sign*420),sign*bc),d=point3(sign*470,crossHeight(sign*470),sign*bc);
        const feeder=road(`feeder-cross-${sign}`,line(c,d),crossLanes/2,80);feeder.styleId='highway_6';
        nodes.set(key(c),{incoming:endpoint(feeder,'start'),outgoing:endpoint(feeder,'start')});port('Crossline In',endpoint(feeder,'start'));port('Crossline Out',endpoint(feeder,'end'));
      }
    }
    if (collector) for(const sign of [1,-1]) {
      const b=collector==='main'?bm:bc, offsets=(compact?[300,190,mouth,-mouth,-190,-300]:[450,350,mouth,-mouth,-350,-450]).map(t=>t*sign);
      // Positive side carries north/east traffic; cross axis reverses the longitudinal sign.
      const values=collector==='main'?offsets:offsets.map(v=>-v);
      let previous:CityRoad|undefined;
      for(let i=1;i<values.length;i++) {
        const a=values[i-1]!,z=values[i]!,side=b+cdOffset;
        const point=(v:number,offset:number)=>collector==='main'?point3(sign*offset,mainHeight(v),v):point3(v,crossHeight(v),sign*offset);
        const start=point(a,i===1?b:side), finish=point(z,i===values.length-1?b:side);
        const points=i===1||i===values.length-1?bezierPoints(start,point(a+(z-a)/3,i===1?b:side),point(a+2*(z-a)/3,i===values.length-1?b:side),finish):line(start,finish);
        const r=road(`collector-${sign}-${i}`,points,2,70);r.styleId='collector_distributor_2';
        if(previous) {link(endpoint(previous,'end'),endpoint(r,'start'));nodes.set(key(start),{incoming:endpoint(previous,'end'),outgoing:endpoint(r,'start')});}
        else port('Collector In',endpoint(r,'start'));
        if(i===values.length-1)port('Collector Out',endpoint(r,'end'));previous=r;
      }
    }
    const attach=(r:CityRoad)=>{
      for(const end of ['start','end'] as const) {
        const q=end==='start'?r.centerline[0]!:r.centerline.at(-1)!,node=nodes.get(key(q));
        if(node && (end==='start'||node.outgoing))link(end==='start'?node.incoming:endpoint(r,'end'),end==='start'?endpoint(r,'start'):node.outgoing!);
        else port(`${r.id.split(':').at(-1)} ${end==='start'?'In':'Out'}`,endpoint(r,end));
      }
    };
    const leftNames=['S-to-W','E-to-S','N-to-E','W-to-N'],rightNames=['S-to-E','E-to-N','N-to-W','W-to-S'];
    for(let q=0;q<4;q++) {
      const rot=q*Math.PI/2, sourceAxis=q%2?'cross':'main',destAxis=q%2?'main':'cross';
      const bs=sideOffset(sourceAxis), bd=sideOffset(destAxis), box=mouth+lead+radius+(compact?15:30);
      const start=point3(bs,0,-mouth), a=point3(bs+10,0,-mouth-lead);
      const tail=point3(mouth+lead,0,-bd-10), finish=point3(mouth,0,-bd);
      const handle=compact?30:35;
      const path=join(bezierPoints(start,point3(bs,0,-mouth-handle),point3(bs+10,0,-mouth-lead+handle),a),
        line(a,point3(bs+10,0,-box+radius)),arc(bs+10+radius,-box+radius,radius,Math.PI,Math.PI/2),
        line(point3(bs+10+radius,0,-box),point3(box-radius,0,-box)),arc(box-radius,-box+radius,radius,-Math.PI/2,Math.PI/2),
        line(point3(box,0,-box+radius),point3(box,0,-bd-10-radius)),arc(box-radius,-bd-10-radius,radius,0,Math.PI/2),
        line(point3(box-radius,0,-bd-10),tail),bezierPoints(tail,point3(mouth+lead-handle,0,-bd-10),point3(mouth+handle,0,-bd),finish)).map(v=>rotatePoint(v,rot));
      drape(path,lead,lead);
      if(id==='peripheral_motorway_junction'&&q===2) {
        const startY=height(path[0]!),endY=height(path.at(-1)!),total=polylineLength(path),fall=Math.abs(endY-startY)*1.875/0.06,exit=80;let d=0;
        path.forEach((v,i)=>{if(i)d+=Math.hypot(v.x-path[i-1]!.x,v.z-path[i-1]!.z);v.y=startY+(endY-startY)*ease((d-(total-exit-fall))/fall);});
      }
      const directional=(id==='system_cloverstack_lite'||id==='system_parclo_cd')&&q%2===0;
      if(id!=='peripheral_motorway_junction'||q===1||q===2) {
      if(directional) {
        if(compact) {
          const sy=height(rotatePoint(point3(bm,0,550),rot)),ey=height(rotatePoint(point3(-420,0,-bc),rot)),peak=Math.max(mainY,crossY)+6;
          const entrance=bezierPoints(point3(bm,sy,550),point3(bm,sy,480),point3(82,sy,430),point3(82,sy,300));
          const rise=join(entrance,line(point3(82,sy,300),point3(82,peak,-330)));let d=0;
          const run=Math.max(300,(peak-sy)*1.875/0.06);
          rise.forEach((v,i)=>{if(i)d+=Math.hypot(v.x-rise[i-1]!.x,v.z-rise[i-1]!.z);v.y=d<=100?sy:sy+(peak-sy)*ease((d-100)/run);});
          const turn=arc(12,-330,70,0,-Math.PI/2).map(v=>({...v,y:peak}));
          const merge=bezierPoints(point3(-150,peak,-400),point3(-340,peak,-400),point3(-260,ey,-bc),point3(-420,ey,-bc));
          const mergeLength=polylineLength(merge),fall=Math.max(200,(peak-ey)*1.875/0.06);let md=0;
          merge.forEach((v,i)=>{if(i)md+=Math.hypot(v.x-merge[i-1]!.x,v.z-merge[i-1]!.z);v.y=peak+(ey-peak)*ease((md-(mergeLength-fall))/fall);});
          const r=road(`${leftNames[q]}-${id==='system_parclo_cd'?'crossover':'semi'}`,join(rise,turn,line(point3(12,peak,-400),point3(-150,peak,-400)),merge).map(v=>rotatePoint(v,rot)),1,50);
          r.gore={start:true,end:true,length:120};attach(r);
        } else {
        // The opposing directional arcs occupy opposite quadrants. The high transverse
        // legs pass above the still-low entrance of the other arc, rather than crossing at one height.
        const sy=height(rotatePoint(point3(bm,0,600),rot)),ey=height(rotatePoint(point3(-850,0,-bc),rot)),peak=Math.max(mainY,crossY)+8;
        const rise=join(bezierPoints(point3(bm,sy,600),point3(bm,sy,500),point3(150,peak,400),point3(150,peak,300)),line(point3(150,peak,300),point3(150,peak,-380)));
        let riseDistance=0;const verticalRun=Math.max(350,(peak-sy)*1.875/0.06);
        rise.forEach((v,i)=>{if(i)riseDistance+=Math.hypot(v.x-rise[i-1]!.x,v.z-rise[i-1]!.z);v.y=sy+(peak-sy)*ease(riseDistance/verticalRun);});
        const turn=arc(30,-380,120,0,-Math.PI/2).map(v=>({...v,y:peak}));
        const transverse=line(point3(30,peak,-500),point3(-300,peak,-500));
        const merge=bezierPoints(point3(-300,peak,-500),point3(-500,peak,-500),point3(-650,ey,-bc),point3(-850,ey,-bc));
        const r=road(`${leftNames[q]}-${id==='system_parclo_cd'?'crossover':'semi'}`,join(rise,turn,transverse,merge).map(v=>rotatePoint(v,rot)),1,60);
        r.gore={start:true,end:true,length:180};attach(r);
        }
      } else {const r=road(`${leftNames[q]}-loop`,path,1,compact?35:45);r.gore={start:true,end:true,length:compact?100:id==='peripheral_motorway_junction'?200:150};attach(r);}
      }
      if(id==='peripheral_motorway_junction'&&q!==0&&q!==1)continue;
      const rb=sourceAxis==='main'?bm:bc, db=destAxis==='main'?bm:bc;
      const source=sourceAxis==='main'?mainApproach:crossApproach,dest=destAxis==='main'?mainApproach:crossApproach,entry=compact?120:150,rr=compact?55:70,cornerZ=source-entry,tailX=dest-200;
      const outer=(id==='peripheral_motorway_junction'?bezierPoints(point3(rb,0,source),point3(rb,0,source*0.45),point3(dest*0.45,0,db),point3(dest,0,db)):join(bezierPoints(point3(rb,0,source),point3(rb,0,source-entry/3),point3(rb+10,0,source-entry*2/3),point3(rb+10,0,cornerZ)),
        arc(rb+10+rr,cornerZ,rr,Math.PI,Math.PI/2),line(point3(rb+10+rr,0,cornerZ-rr),point3(tailX,0,cornerZ-rr)),
        bezierPoints(point3(tailX,0,cornerZ-rr),point3(tailX+160,0,cornerZ-rr),point3(dest-160,0,db),point3(dest,0,db)))).map(v=>rotatePoint(v,rot));
      drape(outer,entry,compact?140:180);
      const r=road(`${rightNames[q]}-right`,outer,1,compact?50:55);r.gore={start:true,end:true,length:compact?120:id==='peripheral_motorway_junction'?220:180};attach(r);
    }
  } else if(id==='urban_side_access') {
    for(const sign of [1,-1]) {
      const side=sign*(bm+30),cuts=[length/2,100,0,-100,-length/2].sort((a,b)=>b-a);let previous:CityRoad|undefined;
      const nodes=new Map<number,{incoming:RoadEndpoint;outgoing:RoadEndpoint}>();
      for(let i=1;i<cuts.length;i++) {
        const r=road(`frontage-${sign}-${i}`,line(point3(side,0,sign*cuts[i-1]!),point3(side,0,sign*cuts[i]!)),2,40);
        r.styleId='urban_auxiliary_2';r.laneWidth=3.75;r.shoulders={left:0,right:0};r.sidewalk={enabled:true,width:3};r.curb=true;r.structure!.barrierEnabled=false;
        if(previous){link(endpoint(previous,'end'),endpoint(r,'start'));nodes.set(cuts[i-1]!,{incoming:endpoint(previous,'end'),outgoing:endpoint(r,'start')});}
        else port('Frontage In',endpoint(r,'start'));if(i===cuts.length-1)port('Frontage Out',endpoint(r,'end'));previous=r;
      }
      for(const on of [false,true]) {
        const a=on?point3(side,0,0):point3(sign*bm,mainHeight(sign*300),sign*300),b=on?point3(sign*bm,mainHeight(-sign*300),-sign*300):point3(side,0,0);
        const r=road(`${on?'on':'off'}-${sign}`,bezierPoints(a,point3(a.x,a.y??0,a.z-sign*100),point3(b.x,b.y??0,b.z+sign*100),b),1,45);
        r.designProfile='urban';r.gore={start:true,end:true,length:on?120:100};
        link(on?nodes.get(0)!.incoming:endpoint(r,'end'),on?endpoint(r,'start'):nodes.get(0)!.outgoing);
        port(on?'Expressway On':'Expressway Off',endpoint(r,on?'end':'start'));
      }
    }
  } else if(id==='divided_tunnel'||id==='urban_underpass') {
    for(const sign of id==='divided_tunnel'?[1,-1]:[0]) {
      const r=road(sign===0?'underpass':sign>0?'northbound':'southbound',line(point3(sign*bm,0,sign<0?-length/2:length/2),point3(sign*bm,0,sign<0?length/2:-length/2)),sign===0?6:lanes/2,sign===0?40:80,sign===0);
      r.structure!.enclosure={kind:sign===0?'underpass':'tunnel',clearance:6};r.structure!.piersEnabled=false;r.structure!.barrierEnabled=false;
      if(sign!==0)r.styleId='highway_6';
      port(sign<0?'North In':'South In',endpoint(r,'start'));port(sign<0?'South Out':'North Out',endpoint(r,'end'));
    }
  } else if(id==='urban_main_aux') {
    for(const sign of [1,-1]) {
      const positions=[length/2,...[600,400,0,-200,-600,-800].filter(z=>Math.abs(z)<length/2),-length/2].sort((a,b)=>b-a);
      const mainNodes=new Map<number,{incoming:RoadEndpoint;outgoing:RoadEndpoint}>(),auxNodes=new Map<number,{incoming:RoadEndpoint;outgoing:RoadEndpoint}>();
      for(const [label,side,count,nodes] of [['main',sign*bm,3,mainNodes],['frontage',sign*32,2,auxNodes]] as const) {
        let previous:CityRoad|undefined;
        for(let i=1;i<positions.length;i++) {
          const r=road(`${label}-${sign}-${i}`,line(point3(side,0,sign*positions[i-1]!),point3(side,0,sign*positions[i]!)),count,label==='main'?60:40);
          r.styleId=label==='main'?'urban_boulevard_6':'urban_auxiliary_2';
          if(label==='frontage'){r.structure!.barrierEnabled=false;r.shoulders={left:0,right:0};r.sidewalk={enabled:true,width:3};r.curb=true;}
          if(previous){link(endpoint(previous,'end'),endpoint(r,'start'));nodes.set(positions[i-1]!,{incoming:endpoint(previous,'end'),outgoing:endpoint(r,'start')});}
          else port(label==='main'?'Main In':'Frontage In',endpoint(r,'start'));
          if(i===positions.length-1)port(label==='main'?'Main Out':'Frontage Out',endpoint(r,'end'));previous=r;
        }
      }
      for(const [at,to,exit] of [[600,400,true],[0,-200,false],[-600,-800,true]] as const) {
        const source=exit?mainNodes:auxNodes,dest=exit?auxNodes:mainNodes;if(!source.has(at)||!dest.has(to))continue;
        const a=point3(sign*(exit?bm:32),0,sign*at),b=point3(sign*(exit?32:bm),0,sign*to);
        const r=road(`transition-${sign}-${at}`,bezierPoints(a,point3(a.x,0,a.z-sign*70),point3(b.x,0,b.z+sign*70),b),1,35);r.structure!.barrierEnabled=false;r.gore={start:true,end:true,length:150};
        link(source.get(at)!.incoming,endpoint(r,'start'));link(endpoint(r,'end'),dest.get(to)!.outgoing);
      }
    }
  }
  m.roads.forEach(r=>r.centerline=r.centerline.map(v=>transformPoint3(v,position,rotation)));
  refreshPortPoses(m);
  for(const port of m.connectionPorts!)port.label=directionalPortLabel(port.label,port.heading??0);
  const report=validateMap(m);if(!report.valid)throw new Error(`preset.output ${id}: ${JSON.stringify(report.errors)}`);
  const issues=validatePresetGeometry(m);if(issues.length)throw new Error(`preset.geometry ${id}: ${JSON.stringify(issues)}`);
  return {...m,groupId,roadLinks:m.roadLinks!,connectionPorts:m.connectionPorts!};
}
