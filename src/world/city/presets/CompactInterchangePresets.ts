import { newCityMap, type CityPoint, type CityRoad } from '../CityMapData';
import { point3, transformPoint3 } from '../coordinates';
import { polylineLength, refreshPortPoses, rotatePoint } from '../geometry';
import { bezierPoints, profileHeight } from './BackbonePresets';
import type { PresetParameters, PresetStamp } from './InfrastructurePresets';

export const COMPACT_INTERCHANGE_IDS=['system_compact_x','system_compact_turbine','system_compact_star','system_compact_cloverleaf','system_compact_hybrid'] as const;
export const compactRampEase=(t:number,blend=0.035)=>{
  t=Math.max(0,Math.min(1,t));return t<blend?t*t/(2*blend*(1-blend)):t>1-blend?1-(1-t)*(1-t)/(2*blend*(1-blend)):(t-blend/2)/(1-blend);
};
const join=(...paths:CityPoint[][])=>paths.flatMap((p,i)=>i?p.slice(1):p);
const line=(a:CityPoint,b:CityPoint)=>{const n=Math.max(2,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/2));return Array.from({length:n+1},(_,i)=>point3(a.x+(b.x-a.x)*i/n,0,a.z+(b.z-a.z)*i/n));};
const arc=(x:number,z:number,r:number,angle:number,sweep:number)=>{const n=Math.ceil(Math.abs(sweep)*r/2);return Array.from({length:n+1},(_,i)=>point3(x+r*Math.cos(angle+sweep*i/n),0,z+r*Math.sin(angle+sweep*i/n)));};
export function crossingDistance(a:CityPoint[],b:CityPoint[]):number[] {
  const result:number[]=[];let distance=0;
  for(let i=1;i<a.length;i++) {
    const aa=a[i-1]!,ab=a[i]!,dx=ab.x-aa.x,dz=ab.z-aa.z,l=Math.hypot(dx,dz);
    for(let j=1;j<b.length;j++) {
      const ba=b[j-1]!,bb=b[j]!,ex=bb.x-ba.x,ez=bb.z-ba.z,den=dx*ez-dz*ex;if(Math.abs(den)<1e-8)continue;
      const t=((ba.x-aa.x)*ez-(ba.z-aa.z)*ex)/den,u=((ba.x-aa.x)*dz-(ba.z-aa.z)*dx)/den;
      if(t>=0&&t<=1&&u>=0&&u<=1)result.push(distance+t*l);
    }
    distance+=l;
  }
  return result;
}

/** Local ramp rebuilding only; continuous through carriageways are supplied by the map. */
export function expandCompactInterchange(id:string,p:PresetParameters={}):PresetStamp {
  const map=newCityMap(),groupId=p.groupId??id,mainY=p.mainElevation??0,crossY=p.crossElevation??8;
  const bm=(p.mainRoadLanes??6)/2*3.75/2+2.5,bc=(p.crossRoadLanes??6)/2*3.75/2+2.5;
  const radius=Math.min(40,Math.max(38,p.rampRadius??38)),delta=Math.abs(mainY-crossY),approach=p.mainApproach??((id==='system_compact_star'?370:330)+Math.max(0,delta-8)*20);
  if(!COMPACT_INTERCHANGE_IDS.includes(id as never)||![mainY,crossY,bm,bc,radius,approach].every(Number.isFinite)||approach<240||approach>600)throw new Error('preset.parameters: invalid compact system dimensions');
  const main=(offset:number)=>profileHeight(p.mainProfile,offset,mainY,p.profileInterpolation),cross=(offset:number)=>profileHeight(p.crossProfile,offset,crossY,p.profileInterpolation);
  const height=(q:CityPoint)=>Math.abs(q.x)<Math.abs(q.z)?main(q.z):cross(q.x);
  const port=(label:string,r:CityRoad,end:'start'|'end')=>map.connectionPorts!.push({id:`${r.id}:port-${end}`,label,endpoint:{roadId:r.id,end},groupId,position:r.centerline[end==='start'?0:r.centerline.length-1],heading:0});
  const road=(movement:string,path:CityPoint[],speed:number)=>{
    const r:CityRoad={id:`${groupId}:${movement}`,groupId,presetSource:id,designProfile:'urban',type:'ramp_1',styleId:'ramp_1',centerline:path,laneCount:1,laneWidth:3.9,travelDirection:'forward',speedLimit:speed,elevationMode:'custom',shoulders:{left:0.75,right:1.75},structure:{barrierEnabled:true,piersEnabled:true,pierSpacing:45,barrierOffset:0.25},gore:{start:true,end:true,length:100}};
    map.roads.push(r);port('Movement In',r,'start');port('Movement Out',r,'end');return r;
  };
  const leftNames=['S-to-W','E-to-S','N-to-E','W-to-N'],rightNames=['S-to-E','E-to-N','N-to-W','W-to-S'];
  const semi: {r:CityRoad;q:number}[]=[];
  for(let q=0;q<4;q++) {
    const rot=q*Math.PI/2,sourceB=q%2?bc:bm,destB=q%2?bm:bc;
    const loop=id==='system_compact_cloverleaf'||id==='system_compact_hybrid'&&q%2===1;
    if(loop) {
      const path=arc(sourceB+radius,-destB-radius,radius,Math.PI,Math.PI*1.5).map(v=>rotatePoint(v,rot)),len=polylineLength(path),sy=height(path[0]!),ey=height(path.at(-1)!);let d=0;
      // Delay the climb until the loop has separated from its input pavement.
      for(let i=0;i<path.length;i++){if(i)d+=Math.hypot(path[i]!.x-path[i-1]!.x,path[i]!.z-path[i-1]!.z);path[i]!.y=sy+(ey-sy)*compactRampEase((d-25)/(len-38));}
      road(`${leftNames[q]}-loop`,path,35);
    } else {
      let entrance:CityPoint[],core:CityPoint[],merge:CityPoint[];
      if(id==='system_compact_turbine') {
        entrance=bezierPoints(point3(sourceB,0,approach),point3(sourceB,0,approach-90),point3(80,0,105),point3(80,0,15));
        core=join(arc(0,15,80,0,-Math.PI/2),line(point3(0,0,-65),point3(-130,0,-65)));
      } else if(id==='system_compact_star') {
        entrance=bezierPoints(point3(sourceB,0,approach),point3(sourceB,0,approach-70),point3(50,0,210),point3(50,0,120));
        core=bezierPoints(point3(50,0,120),point3(50,0,50),point3(-50,0,-50),point3(-120,0,-50));
      } else {
        entrance=bezierPoints(point3(sourceB,0,approach),point3(sourceB,0,approach-90),point3(50,0,200),point3(50,0,110));
        core=bezierPoints(point3(50,0,110),point3(50,0,45),point3(-45,0,-50),point3(-110,0,-50));
      }
      const end=core.at(-1)!;
      merge=bezierPoints(end,point3(end.x-80,0,end.z),point3(-approach+80,0,-destB),point3(-approach,0,-destB));
      const r=road(`${leftNames[q]}-${id==='system_compact_turbine'?'turbine':id==='system_compact_star'?'star':'semi'}`,join(entrance,core,merge).map(v=>rotatePoint(v,rot)),45);
      r.gore!.length=120;semi.push({r,q});
    }
    const rightApproach=id==='system_compact_cloverleaf'||id==='system_compact_hybrid'?270:160;
    const a=rightApproach,path=bezierPoints(point3(sourceB,0,a),point3(sourceB,0,a*0.45),point3(a*0.45,0,destB),point3(a,0,destB)).map(v=>rotatePoint(v,rot));
    const len=polylineLength(path),sy=height(path[0]!),ey=height(path.at(-1)!);let d=0;
    for(let i=0;i<path.length;i++){if(i)d+=Math.hypot(path[i]!.x-path[i-1]!.x,path[i]!.z-path[i-1]!.z);path[i]!.y=sy+(ey-sy)*compactRampEase((d-55)/(len-110));}
    road(`${rightNames[q]}-right`,path,45);
  }
  for(const {r,q} of semi) {
    const path=r.centerline,len=polylineLength(path),events=semi.filter(other=>other.q%2!==q%2).flatMap(other=>crossingDistance(path,other.r.centerline));
    const sy=height(path[0]!),ey=height(path.at(-1)!),sourceHigh=mainY===crossY?q%2===0:(q%2?crossY:mainY)>(q%2?mainY:crossY),peak=Math.max(mainY,crossY)+(id==='system_compact_hybrid'||sourceHigh?6:12);
    const first=events.length?Math.min(...events)-8:len*0.43,last=events.length?Math.max(...events)+12:len*0.62;
    const same=semi.filter(other=>other.q!==q&&other.q%2===q%2).flatMap(other=>crossingDistance(path,other.r.centerline));
    const early=same.length?Math.min(...same)+10:undefined,late=same.length?Math.max(...same)+10:undefined;
    const knots:[number,number][]=[[35,sy],...(early!==undefined&&early<first?[[early,peak-6] as [number,number]]:[]),[first,peak],[last,peak],...(late!==undefined&&late>last?[[late,peak] as [number,number]]:[]),[len-35,ey]];let d=0;
    for(let i=0;i<path.length;i++) {
      if(i)d+=Math.hypot(path[i]!.x-path[i-1]!.x,path[i]!.z-path[i-1]!.z);
      const k=knots.findIndex(k=>k[0]>=d);
      if(k===0)path[i]!.y=sy;else if(k<0)path[i]!.y=ey;else{const a=knots[k-1]!,b=knots[k]!;path[i]!.y=a[1]+(b[1]-a[1])*compactRampEase((d-a[0])/(b[0]-a[0]));}
    }
  }
  for(const r of map.roads)r.centerline=r.centerline.map(q=>transformPoint3(q,p.position??point3(0,0,0),p.rotation??0));
  for(const port of map.connectionPorts!)port.position=map.roads.find(r=>r.id===port.endpoint.roadId)!.centerline[port.endpoint.end==='start'?0:map.roads.find(r=>r.id===port.endpoint.roadId)!.centerline.length-1];
  refreshPortPoses(map);
  return {...map,roadLinks:map.roadLinks!,connectionPorts:map.connectionPorts!,groupId};
}
