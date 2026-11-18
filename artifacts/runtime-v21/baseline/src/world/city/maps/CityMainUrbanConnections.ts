import type { CityMapData, CityPoint, CityRoad, RoadEndpoint, IntersectionPort,CityIntersection } from '../CityMapData';
import { createIntersection, connectRoad, connectRoads, splitRoadAtPoint } from '../MapAPI';
import { roadPoints,junctionExtent,rotatePoint,portDirection,polylineLength } from '../geometry';

/** Remove control points behind a snapped junction mouth; surfaces still meet the intersection deck. */
export function trimCityJunctionApproaches(map:CityMapData,blendHeights=true):void {
  for(const j of map.intersections)for(const c of j.connections) {
    const r=map.roads.find(r=>r.id===c.roadId)!,points=roadPoints(r),outward=rotatePoint(portDirection(j,c.port),j.rotation),h=junctionExtent(j,map);
    const outside=(p:CityPoint)=>(p.x-j.position.x)*outward.x+(p.z-j.position.z)*outward.z>h+0.05;
    if(c.end==='start'){while(points.length>2&&!outside(points[1]!))points.splice(1,1);}
    else {while(points.length>2&&!outside(points.at(-2)!))points.splice(points.length-2,1);}
    const transition=Math.min(50,polylineLength(points)/2);
    if(blendHeights&&!r.gore)for(const p of points.slice(1,-1)){const distance=(p.x-j.position.x)*outward.x+(p.z-j.position.z)*outward.z-h;if(distance>=0&&distance<transition){const t=Math.max(0,Math.min(1,distance/transition)),weight=t*t*(3-2*t);p.y=(j.position.y??0)+((p.y??0)-(j.position.y??0))*weight;}}
    r.centerline=points;r.curve='polyline';
  }
}

/** Authoring-only crossing pass for the sparse ordinary City Main skeleton.
 * Its input explicitly excludes expressways and ramps. Uses the existing split/port API. */
export function connectUrbanSkeleton(map:CityMapData,authored:CityRoad[],heightTolerance=.2,prepare?:(j:CityIntersection,arms:{endpoint:RoadEndpoint;port:IntersectionPort}[])=>void):void {
  const families=new Set(authored.map(r=>r.id)),crossings=new Map<string,CityPoint>();
  for(let ai=0;ai<authored.length;ai++)for(let bi=ai+1;bi<authored.length;bi++) {
    const aa=roadPoints(authored[ai]!),bb=roadPoints(authored[bi]!);
    for(const a of [aa[0]!,aa.at(-1)!])for(const b of [bb[0]!,bb.at(-1)!])if(Math.hypot(a.x-b.x,a.z-b.z)<0.04&&Math.abs((a.y??0)-(b.y??0))<0.2)crossings.set(`${a.x.toFixed(2)},${a.z.toFixed(2)}`,{...a});
    for(let i=1;i<aa.length;i++)for(let j=1;j<bb.length;j++) {
      const a=aa[i-1]!,b=aa[i]!,c=bb[j-1]!,d=bb[j]!,ax=b.x-a.x,az=b.z-a.z,bx=d.x-c.x,bz=d.z-c.z,den=ax*bz-az*bx;
      if(Math.abs(den)<1e-7)continue;
      const t=((c.x-a.x)*bz-(c.z-a.z)*bx)/den,v=((c.x-a.x)*az-(c.z-a.z)*ax)/den;
      if(t<-1e-6||t>1+1e-6||v<-1e-6||v>1+1e-6)continue;
      const y=(a.y??0)+t*((b.y??0)-(a.y??0)),y2=(c.y??0)+v*((d.y??0)-(c.y??0));if(Math.abs(y-y2)>heightTolerance)continue;
      const p={x:a.x+t*ax,y:(y+y2)/2,z:a.z+t*az};crossings.set(`${p.x.toFixed(2)},${p.z.toFixed(2)}`,p);
    }
  }
  const near=(a:CityPoint,b:CityPoint)=>Math.hypot(a.x-b.x,a.z-b.z)<0.06&&Math.abs((a.y??0)-(b.y??0))<heightTolerance+.001;
  for(const p of crossings.values()) {
    // A neighbouring junction owns its approach; do not create a second overlapping box.
    if(map.intersections.some(j=>Math.hypot(j.position.x-p.x,j.position.z-p.z)<38&&Math.abs((j.position.y??0)-(p.y??0))<0.1))continue;
    for(const r of [...map.roads.filter(r=>families.has(r.id))]) {
      const points=roadPoints(r);if(near(points[0]!,p)||near(points.at(-1)!,p))continue;
      let cut:CityPoint|undefined;points.some((b,i)=>{if(!i)return false;const a=points[i-1]!,dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz,t=((p.x-a.x)*dx+(p.z-a.z)*dz)/l2,q={x:a.x+t*dx,y:(a.y??0)+t*((b.y??0)-(a.y??0)),z:a.z+t*dz};if(t>=0&&t<=1&&near(q,p)){cut=q;return true;}return false;});
      if(cut){const split=splitRoadAtPoint(map,r.id,cut,{tolerance:0.2});families.add(split.after.id);}
    }
    const arms:{endpoint:RoadEndpoint;angle:number;lanes:number}[]=[];
    for(const r of map.roads.filter(r=>families.has(r.id)))for(const end of ['start','end'] as const) {
      const pts=r.centerline,a=end==='start'?pts[0]!:pts.at(-1)!,b=end==='start'?pts[1]!:pts.at(-2)!;
      if(near(a,p))arms.push({endpoint:{roadId:r.id,end},angle:Math.atan2(b.x-a.x,-(b.z-a.z)),lanes:r.laneCount});
    }
    if(arms.length===2) {
      const a=arms[0]!.endpoint,b=arms[1]!.endpoint;
      const joined=map.roadLinks?.some(l=>[l.from,l.to].some(e=>e.roadId===a.roadId&&e.end===a.end)&&[l.from,l.to].some(e=>e.roadId===b.roadId&&e.end===b.end));
      if(!joined)connectRoads(map,a,b);continue;
    }
    if(arms.length<3)continue;if(arms.length>5)throw new Error(`city-main: urban junction exceeds five legs at ${JSON.stringify(p)}: ${arms.map(a=>a.endpoint.roadId).join(', ')}`);
    // Four ordinary ports remain the default; custom local bearings describe skewed arms
    // without changing either road geometry or the signal/connection architecture.
    const ports:IntersectionPort[]=arms.length===3?['north','east','west']:['north','east','south','west','extra'];
    const angles:Partial<Record<IntersectionPort,number>>={};arms.forEach((a,i)=>angles[ports[i]!]=a.angle);
    const j=createIntersection(map,{baseName:'urban-junction',type:arms.length===5?'irregular':arms.length===3?'t_4lane':'cross_6lane',position:p,rotation:0,signalized:true,portAngles:angles,channelized:arms.length===4&&arms.every(a=>a.lanes>=4&&Math.abs(Math.sin(2*a.angle))<0.1)});
    const mouthArms=arms.map((a,i)=>({endpoint:a.endpoint,port:ports[i]!}));
    for(let i=0;i<arms.length;i++){prepare?.(j,mouthArms);connectRoad(map,arms[i]!.endpoint,{junctionId:j.id,port:ports[i]!});}
  }
}
