import type { CityMapData, CityPoint } from '../CityMapData';
import type { MapIssue } from '../CityMapValidation';
import { polylineLength, roadEdges, roadPoints, sampleAt } from '../geometry';
import { RoadClearance } from '../RoadClearance';
import { buildCityRoadNetwork } from '../CityRoadNetwork';
import { roadPiers } from '../RoadInfrastructure';
import { roadEdgeChains } from '../RoadEdgeChain';

/** Production recipe checks against sampled geometry, rather than just its graph. */
export function validatePresetGeometry(map: CityMapData, targets?: ReadonlySet<string>): MapIssue[] {
  const issues: MapIssue[] = [], clearance = new RoadClearance(map);
  const error = (code: string, path: string, message: string) => issues.push({severity:'error',code,path,message});
  const branchNodes = buildCityRoadNetwork(map).endpointNodes.filter(n=>n.ends.length>1);
  const chains=roadEdgeChains(map);
  const auxiliary=map.roads.filter(r=>r.highwayTransition).map(r=>({road:r,members:new Set([r.id,r.highwayTransition!.decisionId,...chains.continuations(r.highwayTransition!.mainRoadId)])}));
  const corridorForRoad=new Map(chains.corridors.flatMap(c=>c.roadIds.map(id=>[id,c.id] as const)));
  const auxiliaryByRoad=new Map<string,typeof auxiliary>();
  for(const lane of auxiliary)for(const id of lane.members){const list=auxiliaryByRoad.get(id)??[];list.push(lane);auxiliaryByRoad.set(id,list);}
  const branchCells=new Map<string,{node:typeof branchNodes[number];corridors:Set<string|undefined>}[]>();
  for(const node of branchNodes){const key=Math.floor(node.position.x/256)+','+Math.floor(node.position.z/256),list=branchCells.get(key)??[];list.push({node,corridors:new Set(node.ends.map(e=>corridorForRoad.get(e.roadId)))});branchCells.set(key,list);}
  const sharedBranch=(a:string,b:string,p:CityPoint,radius:number)=>{
    if((auxiliaryByRoad.get(a)??[]).some(l=>l.members.has(b)&&l.road.centerline.some(q=>Math.hypot(p.x-q.x,p.z-q.z)<radius+12)))return true;
    const ac=corridorForRoad.get(a),bc=corridorForRoad.get(b);
    for(let x=Math.floor((p.x-radius)/256);x<=Math.floor((p.x+radius)/256);x++)for(let z=Math.floor((p.z-radius)/256);z<=Math.floor((p.z+radius)/256);z++)
      if((branchCells.get(x+','+z)??[]).some(({node,corridors})=>corridors.has(ac)&&corridors.has(bc)&&Math.hypot(p.x-node.position.x,p.z-node.position.z)<radius))return true;
    return false;
  };
  // Authoring cuts insert collinear vertices. Measure curvature on the whole
  // continued ribbon after removing those cuts, so a short split does not
  // invent a tighter curve at an unchanged original corner.
  const radii=new Map<string,number>();
  const corridorRadius=(id:string)=>{
    const corridor=chains.corridors.find(c=>c.roadIds.includes(id))!,cached=radii.get(corridor.id);if(cached!==undefined)return cached;
    const points=corridor.points.filter((b,i,p)=>{if(!i||i===p.length-1)return true;const a=p[i-1]!,c=p[i+1]!;return Math.abs((b.x-a.x)*(c.z-b.z)-(b.z-a.z)*(c.x-b.x))>1e-6;});let radius=Infinity;
    for(let i=1;i<points.length-1;i++){const a=points[i-1]!,b=points[i]!,c=points[i+1]!,cross=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));if(cross>1e-6)radius=Math.min(radius,Math.hypot(b.x-a.x,b.z-a.z)*Math.hypot(c.x-b.x,c.z-b.z)*Math.hypot(c.x-a.x,c.z-a.z)/(2*cross));}
    radii.set(corridor.id,radius);return radius;
  };
  const paths = map.roads.map(r => {const points=roadPoints(r);return {road:r,points,bounds:{minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))}};});
  for (const {road:r,points} of paths) {
    if(targets&&!targets.has(r.id))continue;
    const regionalRamp=r.id.startsWith('regional:')&&r.type==='ramp_1';
    const ramp = r.styleId === 'ramp_1' || regionalRamp, path = `roads.${r.id}`, edges=roadEdges(r);
    if(r.laneWidth < 3.5) error('geometry.width',path,'Production lanes must be at least 3.5m.');
    if(ramp && !r.highwayTransition && (r.laneWidth < (regionalRamp?3.5:3.8) || edges.width < r.laneCount*r.laneWidth+2.2)) error('geometry.rampWidth',path,'Ramp needs traffic lanes and at least 2.2m of paved shoulders.');
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
    if(r.id.startsWith('regional:')&&!r.gore)radius=corridorRadius(r.id);
    if(radius < (loop ? r.designProfile==='urban'?29.9:44.9 : ramp && r.speedLimit <=25 ? 12 : r.designProfile==='urban'?30 : ramp || r.presetSource?.startsWith('system_') ? 55 : 100)) error('geometry.curve',path,`Minimum sampled radius ${radius.toFixed(1)}m is too small.`);
    for(let d=6;d<polylineLength(points)-6;d+=6) {
      const p=sampleAt(points,d).point,y=p.y??0;
      if(clearance.roadAt(p,0,y+0.25,y+4.5,r.id,other=>!sharedBranch(r.id,other,p,180))) {
        const other=map.roads.find(o=>clearance.roadAt(p,0,y+0.25,y+4.5,r.id,id=>id===o.id));
        error('geometry.overlapHeight',path,`Deck ${other?.id} overlaps at ${p.x.toFixed(1)},${p.z.toFixed(1)}, Y=${y.toFixed(2)} with insufficient vertical clearance.`);break;
      }
      const overlaps=clearance.roadAt(p,0,y-0.25,y+0.25,r.id,other=> !sharedBranch(r.id,other,p,180));
      if(overlaps&&!clearance.junctionAt(p,0,y-0.25,y+0.25)) { const other=map.roads.find(o=>clearance.roadAt(p,0,y-0.25,y+0.25,r.id,id=>id===o.id&&!sharedBranch(r.id,id,p,180)));error('geometry.overlap',path,`Unconnected paved road ${other?.id} overlaps away from a branch throat at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}, Y=${y.toFixed(2)}.`);break; }
    }
    for(const pier of roadPiers(r,map,clearance)) if(clearance.roadAt(pier.position,0.65,pier.baseY,pier.baseY+pier.height,r.id) || clearance.junctionAt(pier.position,0.65,pier.baseY,pier.baseY+pier.height)) error('geometry.pier',path,'Pier intrudes into a lower paved footprint.');
  }
  for(const o of map.objects) if(['tree','streetlight','traffic_sign'].includes(o.prefabId) && !clearance.permitsProp(o.position,o.prefabId==='tree'?2.1:0.8,o.prefabId==='tree'?6.8:o.prefabId==='streetlight'?7.5:2.85)) error('geometry.prop',`objects.${o.id}`,'Roadside prop enters pavement, an overhead deck or junction clear zone.');
  const tangent = (id: string, end: 'start'|'end'): CityPoint => {
    const pts=paths.find(p=>p.road.id===id)!.points, length=polylineLength(pts);
    return sampleAt(pts,end==='start'?0:length).tangent;
  };
  for(const l of map.roadLinks??[]) {
    if(targets&&!targets.has(l.from.roadId)&&!targets.has(l.to.roadId))continue;
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
    if(targets&&!targets.has(aPath.road.id)&&!targets.has(bPath.road.id))continue;
    // Exact broad phase: disjoint road bounds cannot contain segment crossings.
    // Regional authoring now has thousands of sections; avoid comparing every
    // vertex pair of distant roads without changing any clearance rule.
    const ab=aPath.bounds,bb=bPath.bounds;
    if(ab.maxX<bb.minX||bb.maxX<ab.minX||ab.maxZ<bb.minZ||bb.maxZ<ab.minZ)continue;
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
      const joined=sharedBranch(aPath.road.id,bPath.road.id,p,20);
      if(joined) continue;
      error('geometry.crossing',`roads.${aPath.road.id}/${bPath.road.id}`,`Unconnected crossing at (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) has ${(Math.abs(p.y-y)).toFixed(2)}m separation, less than 4.5m.`);found=true;break;
    }
  }
  return issues;
}
