import type { CityMapData, CityPoint } from '../CityMapData';
import type { MapIssue } from '../CityMapValidation';
import { polylineLength, roadEdges, roadPoints, sampleAt } from '../geometry';
import { RoadClearance } from '../RoadClearance';
import { buildCityRoadNetwork } from '../CityRoadNetwork';
import { roadPiers } from '../RoadInfrastructure';

/** Production recipe checks against sampled geometry, rather than just its graph. */
export function validatePresetGeometry(map: CityMapData): MapIssue[] {
  const issues: MapIssue[] = [], clearance = new RoadClearance(map);
  const error = (code: string, path: string, message: string) => issues.push({severity:'error',code,path,message});
  const branchNodes = buildCityRoadNetwork(map).endpointNodes.filter(n=>n.ends.length>1);
  const paths = map.roads.map(r => ({road:r, points:roadPoints(r)}));
  for (const {road:r,points} of paths) {
    const ramp = r.styleId === 'ramp_1', path = `roads.${r.id}`, edges=roadEdges(r);
    if(r.laneWidth < 3.5) error('geometry.width',path,'Production lanes must be at least 3.5m.');
    if(ramp && (r.laneWidth < 3.8 || edges.width < r.laneCount*r.laneWidth+2.2)) error('geometry.rampWidth',path,'Ramp needs traffic lanes and at least 2.2m of paved shoulders.');
    let grade=0, radius=Infinity;
    for(let i=1;i<points.length;i++) {
      const a=points[i-1]!,b=points[i]!,length=Math.hypot(b.x-a.x,b.z-a.z);
      grade=Math.max(grade,Math.abs((b.y??0)-(a.y??0))/length);
      if(length<0.05) error('geometry.short',path,'Degenerate sampled segment.');
      if(i+1<points.length) {
        const c=points[i+1]!,l2=Math.hypot(c.x-b.x,c.z-b.z), chord=Math.hypot(c.x-a.x,c.z-a.z);
        const cross=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));
        if(cross>1e-6) radius=Math.min(radius,length*l2*chord/(2*cross));
      }
    }
    if(grade>(ramp?0.08:0.06)+1e-5) error('geometry.grade',path,`Sampled grade ${(grade*100).toFixed(2)}% exceeds production limit.`);
    const loop = r.id.endsWith('-loop');
    if(radius < (loop ? r.designProfile==='urban'?29.9:44.9 : ramp && r.speedLimit <=25 ? 12 : r.designProfile==='urban'?30 : ramp || r.presetSource?.startsWith('system_') ? 55 : 100)) error('geometry.curve',path,`Minimum sampled radius ${radius.toFixed(1)}m is too small.`);
    for(let d=6;d<polylineLength(points)-6;d+=6) {
      const p=sampleAt(points,d).point,y=p.y??0;
      if(clearance.roadAt(p,0,y+0.25,y+4.5,r.id,other=>!branchNodes.some(n=>n.ends.some(e=>e.roadId===r.id)&&n.ends.some(e=>e.roadId===other)&&Math.hypot(p.x-n.position.x,p.z-n.position.z)<180))) {
        const other=map.roads.find(o=>clearance.roadAt(p,0,y+0.25,y+4.5,r.id,id=>id===o.id));
        error('geometry.overlapHeight',path,`Deck ${other?.id} overlaps at ${p.x.toFixed(1)},${p.z.toFixed(1)}, Y=${y.toFixed(2)} with insufficient vertical clearance.`);break;
      }
      const overlaps=clearance.roadAt(p,0,y-0.25,y+0.25,r.id,other=> !branchNodes.some(n=>
        n.ends.some(e=>e.roadId===r.id)&&n.ends.some(e=>e.roadId===other)&&Math.hypot(p.x-n.position.x,p.z-n.position.z)<180));
      if(overlaps&&!clearance.junctionAt(p,0,y-0.25,y+0.25)) { error('geometry.overlap',path,'Unconnected paved roads overlap away from a branch throat.');break; }
    }
    for(const pier of roadPiers(r,map,clearance)) if(clearance.roadAt(pier.position,0.65,-Infinity,pier.height,r.id) || clearance.junctionAt(pier.position,0.65,-Infinity,pier.height)) error('geometry.pier',path,'Pier intrudes into a lower paved footprint.');
  }
  for(const o of map.objects) if(['tree','streetlight','traffic_sign'].includes(o.prefabId) && !clearance.permitsProp(o.position,o.prefabId==='tree'?2.1:0.8,o.prefabId==='tree'?6.8:o.prefabId==='streetlight'?7.5:2.85)) error('geometry.prop',`objects.${o.id}`,'Roadside prop enters pavement, an overhead deck or junction clear zone.');
  const tangent = (id: string, end: 'start'|'end'): CityPoint => {
    const pts=paths.find(p=>p.road.id===id)!.points, length=polylineLength(pts);
    return sampleAt(pts,end==='start'?0:length).tangent;
  };
  for(const l of map.roadLinks??[]) {
    const a=paths.find(p=>p.road.id===l.from.roadId)!.road,b=paths.find(p=>p.road.id===l.to.roadId)!.road;
    const incoming=(r:typeof a,e:'start'|'end')=>r.travelDirection==='two-way'||(r.travelDirection==='forward')===(e==='end');
    const outgoing=(r:typeof a,e:'start'|'end')=>r.travelDirection==='two-way'||(r.travelDirection==='forward')===(e==='start');
    if(!(incoming(a,l.from.end)&&outgoing(b,l.to.end)||incoming(b,l.to.end)&&outgoing(a,l.from.end))) error('geometry.direction',`roadLinks.${l.id}`,'Join has no compatible incoming/outgoing carriageway.');
    const ta=tangent(a.id,l.from.end),tb=tangent(b.id,l.to.end);
    const sign=l.from.end===l.to.end?-1:1;
    if((ta.x*tb.x+ta.z*tb.z)*sign<Math.cos(Math.PI/6)) error('geometry.joinHeading',`roadLinks.${l.id}`,'Join turns more than 30 degrees at one node.');
  }
  // Crossing/self-crossing tests deliberately exempt only explicit branch mouths and junctions.
  for(let ri=0;ri<paths.length;ri++) for(let rj=ri;rj<paths.length;rj++) {
    const aPath=paths[ri]!,bPath=paths[rj]!;
    let found=false;
    for(let i=1;i<aPath.points.length&&!found;i++) for(let j=ri===rj?i+2:1;j<bPath.points.length;j++) {
      const a=aPath.points[i-1]!,b=aPath.points[i]!,c=bPath.points[j-1]!,d=bPath.points[j]!;
      if(Math.max(a.x,b.x)<Math.min(c.x,d.x)||Math.max(c.x,d.x)<Math.min(a.x,b.x)||Math.max(a.z,b.z)<Math.min(c.z,d.z)||Math.max(c.z,d.z)<Math.min(a.z,b.z)) continue;
      const ax=b.x-a.x,az=b.z-a.z,bx=d.x-c.x,bz=d.z-c.z,den=ax*bz-az*bx;
      if(Math.abs(den)<1e-5) continue;
      const t=((c.x-a.x)*bz-(c.z-a.z)*bx)/den,u=((c.x-a.x)*az-(c.z-a.z)*ax)/den;
      if(t < -1e-6||t > 1+1e-6||u < -1e-6||u > 1+1e-6) continue;
      const p={x:a.x+ax*t,y:(a.y??0)+((b.y??0)-(a.y??0))*t,z:a.z+az*t};
      const y=(c.y??0)+((d.y??0)-(c.y??0))*u;
      if(Math.abs(p.y-y)>=4.5) continue;
      if(clearance.junctionAt(p,0,p.y-0.2,p.y+0.2)) continue;
      const joined=branchNodes.some(n=>n.ends.some(e=>e.roadId===aPath.road.id)&&n.ends.some(e=>e.roadId===bPath.road.id)&&Math.hypot(p.x-n.position.x,p.z-n.position.z)<20);
      if(joined) continue;
      error('geometry.crossing',`roads.${aPath.road.id}/${bPath.road.id}`,`Unconnected crossing at (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) has ${(Math.abs(p.y-y)).toFixed(2)}m separation, less than 4.5m.`);found=true;break;
    }
  }
  return issues;
}
