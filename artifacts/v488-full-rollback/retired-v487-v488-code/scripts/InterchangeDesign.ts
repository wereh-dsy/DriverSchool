import type {CityMapData,CityRoad,CityPoint} from '../src/world/city/CityMapData';
import {roadPoints,sampleAt,roadEdges} from '../src/world/city/geometry';
import {roadEdgeChains} from '../src/world/city/RoadEdgeChain';
import {roadPavementTriangle} from '../src/world/city/RoadPavementSurface';
import {stations} from '../src/editor/MapAnalysis';
import {bounds,overlaps,EditorSpatialIndex,distance,project,slicePath,cubicPath} from '../src/editor/EditorGeometry';
import {rampProfile,rampOverlaps,fitRampProfile} from '../src/editor/RampProfileAudit';
import {makePavementSegments,clipPavementFootprints,type PavementSegment} from '../src/editor/ElevationSeams';

type Row={ids:number[];a:number[];lo:number;hi:number;dual:number;norm:number;label:string};
type Model={road:CityRoad;s:number[];knots:number[];offset:number;original:number[]};
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const key=(a:string,b:string)=>[a,b].sort().join('|');
function extendHighMouth(map:CityMapData,ramp:CityRoad,join:{own:'start'|'end';other:{roadId:string;end:'start'|'end'}},changed:Set<string>,moves:any[]){
  const host=map.roads.find(r=>r.id===join.other.roadId)!;let path=roadPoints(host),L=stations(path).at(-1)!;
  if(rampProfile(host).maxGrade>.005)return;
  const linksAt=(id:string,end:'start'|'end')=>(map.roadLinks??[]).flatMap(l=>l.from.roadId===id&&l.from.end===end?[l.to]:l.to.roadId===id&&l.to.end===end?[l.from]:[]);
  const members=[join.other],seen=new Set([join.other.roadId+':'+join.other.end]);for(let i=0;i<members.length;i++)for(const e of linksAt(members[i]!.roadId,members[i]!.end))if(!seen.has(e.roadId+':'+e.end)){seen.add(e.roadId+':'+e.end);members.push(e);}
  if(members.some(e=>e.roadId!==ramp.id&&map.roads.find(r=>r.id===e.roadId)?.roadClass!=='expressway'))return;
  const outer=join.other.end==='start'?'end':'start',neighbours=linksAt(host.id,outer);
  if(L<120&&neighbours.length===1){const e=neighbours[0]!,next=map.roads.find(r=>r.id===e.roadId)!;if(next.roadClass===host.roadClass&&next.roadNameId===host.roadNameId&&linksAt(next.id,e.end).length===1&&rampProfile(next).maxGrade<.005){const p=roadPoints(next),n=stations(p).at(-1)!,amount=Math.min(120-L,n-20);if(amount>0){const cut=e.end==='end'?n-amount:amount,prefix=e.end==='end'?slicePath(p,cut,n):slicePath(p,0,cut).reverse();next.centerline=e.end==='end'?slicePath(p,0,cut):slicePath(p,cut,n);next.curve='polyline';next.elevationMode='custom';delete next.elevation;host.centerline=outer==='start'?[...prefix,...path.slice(1)]:[...path,...[...prefix].reverse().slice(1)];host.curve='polyline';host.elevationMode='custom';delete host.elevation;changed.add(next.id);changed.add(host.id);moves.push({roadId:host.id,end:outer,parentRoadId:next.id,parentEnd:e.end,before:outer==='start'?path[0]:path.at(-1),after:prefix[0],movedAlongExistingMainline:amount,connectionsPreserved:true,reason:'Retime an unbranched mainline seam; retain its physical alignment'});path=roadPoints(host);L=stations(path).at(-1)!;}}}
  const amount=Math.min(100,L-20);if(amount<15)return;const at=join.other.end==='start'?amount:L-amount,point=sampleAt(path,at).point,prefix=join.other.end==='end'?slicePath(path,at,L):slicePath(path,0,at).reverse();host.centerline=join.other.end==='start'?slicePath(path,at,L):slicePath(path,0,at);host.curve='polyline';host.elevationMode='custom';delete host.elevation;changed.add(host.id);
  for(const e of members){if(e.roadId===host.id)continue;const road=map.roads.find(r=>r.id===e.roadId)!,p=roadPoints(road);if(road.id===ramp.id){road.centerline=p.map(v=>({...v}));road.centerline[e.end==='start'?0:road.centerline.length-1]=point;}else{road.centerline=e.end==='start'?[...prefix,...p.slice(1)]:[...p,...[...prefix].reverse().slice(1)];changed.add(road.id);}road.curve='polyline';road.elevationMode='custom';delete road.elevation;}
  moves.push({roadId:ramp.id,end:join.own,parentRoadId:host.id,parentEnd:join.other.end,before:prefix.at(-1),after:point,movedAlongExistingMainline:amount,connectionsPreserved:true,linkedEndpoints:members,reason:'Move the complete merge/diverge node along the existing flat mainline to provide transition length'});
}
function constrainedProjection(rows:Row[],target:number[]){
  const n=target.length,x=target.slice(),z=new Float64Array(rows.length),u=new Float64Array(rows.length),diagonal=new Float64Array(n),rhs=new Float64Array(n),r=new Float64Array(n),p=new Float64Array(n),ap=new Float64Array(n),v=new Float64Array(n),norms=rows.map(row=>Math.sqrt(row.norm));
  let rho=10000;const dot=(a:ArrayLike<number>,b:ArrayLike<number>)=>{let s=0;for(let i=0;i<n;i++)s+=a[i]!*b[i]!;return s;};
  const product=(input:ArrayLike<number>,out:Float64Array)=>{for(let i=0;i<n;i++)out[i]=input[i]!;for(let j=0;j<rows.length;j++){const row=rows[j]!;let t=0;for(let k=0;k<row.ids.length;k++)t+=row.a[k]!*input[row.ids[k]!]!;t*=rho/row.norm;for(let k=0;k<row.ids.length;k++)out[row.ids[k]!]!+=row.a[k]!*t;}};
  for(let j=0;j<rows.length;j++){const row=rows[j]!,value=row.ids.reduce((s,i,k)=>s+row.a[k]!*x[i]!,0)/norms[j]!;z[j]=clamp(value,row.lo/norms[j]!,row.hi/norms[j]!);}
  let residual=Infinity;
  for(let iteration=0;iteration<600;iteration++){
    diagonal.fill(1);for(let i=0;i<n;i++)rhs[i]=target[i]!;
    for(let j=0;j<rows.length;j++){const row=rows[j]!,t=rho*(z[j]!-u[j]!)/norms[j]!;for(let k=0;k<row.ids.length;k++){const i=row.ids[k]!,a=row.a[k]!;rhs[i]!+=a*t;diagonal[i]!+=rho*a*a/row.norm;}}
    product(x,ap);for(let i=0;i<n;i++){r[i]=rhs[i]!-ap[i]!;v[i]=r[i]!/diagonal[i]!;p[i]=v[i]!;}let rz=dot(r,v);
    for(let k=0;k<65&&rz>1e-16;k++){product(p,ap);const alpha=rz/dot(p,ap);for(let i=0;i<n;i++){x[i]!+=alpha*p[i]!;r[i]!-=alpha*ap[i]!;v[i]=r[i]!/diagonal[i]!;}const next=dot(r,v),beta=next/rz;for(let i=0;i<n;i++)p[i]=v[i]!+beta*p[i]!;rz=next;}
    let primal=0,dual=0;residual=0;
    for(let j=0;j<rows.length;j++){const row=rows[j]!,value=row.ids.reduce((s,i,k)=>s+row.a[k]!*x[i]!,0),t=value/norms[j]!,old=z[j]!;z[j]=clamp(t+u[j]!,row.lo/norms[j]!,row.hi/norms[j]!);u[j]!+=t-z[j]!;primal=Math.max(primal,Math.abs(t-z[j]!));dual=Math.max(dual,rho*Math.abs(z[j]!-old));residual=Math.max(residual,row.lo-value,value-row.hi);}
    if(residual<.00015&&dual<.0002)return {x,iteration,residual};
    if(iteration%100===99){const old=rho;if(primal>dual*8)rho=Math.min(100000,rho*2);else if(dual>primal*8)rho=Math.max(1000,rho/2);if(old!==rho)for(let j=0;j<u.length;j++)u[j]!*=old/rho;}
  }
  // Finish feasibility without retaining the least-squares objective. This is
  // a numerical polish of the same design, not another geometry search.
  for(let iteration=0;iteration<2500;iteration++){
    for(let k=0;k<rows.length;k++){const row=rows[iteration%2?rows.length-1-k:k]!;let value=0;for(let j=0;j<row.ids.length;j++)value+=row.a[j]!*x[row.ids[j]!]!;const correction=(clamp(value,row.lo,row.hi)-value)/row.norm;if(correction)for(let j=0;j<row.ids.length;j++)x[row.ids[j]!]!+=row.a[j]!*correction;}
    if(iteration%50===0){residual=0;for(const row of rows){let value=0;for(let j=0;j<row.ids.length;j++)value+=row.a[j]!*x[row.ids[j]!]!;residual=Math.max(residual,row.lo-value,value-row.hi);}if(residual<.0001)break;}
  }
  return {x,iteration:600,residual};
}
export const profileSummary=(r:CityRoad)=>{const {segments,breaks,...p}=rampProfile(r);return p;};
export function localMap(map:CityMapData,ids:readonly string[]):CityMapData{
  const set=new Set(ids);return {...map,roads:map.roads.filter(r=>set.has(r.id)),roadLinks:map.roadLinks?.filter(l=>set.has(l.from.roadId)&&set.has(l.to.roadId)),intersections:map.intersections.filter(j=>j.connections.every(c=>set.has(c.roadId)))};
}

/** Authoring only. All ramps in a physical interchange participate in one
 * sparse projection; crossing inequalities act on both decks simultaneously.
 * The solve never changes a topology reference or a fixed approach endpoint. */
export function designInterchange(map:CityMapData,cluster:any,plan:'coupled'|'outboard'|'access-extended'|'structural'|'junction-realignment'|'frontage-shift'='coupled'){
  const local=structuredClone(localMap(map,cluster.roadIds)),original=new Map(local.roads.map(r=>[r.id,structuredClone(r)]));
  const seeds=new Set<string>(cluster.seedRoadIds),problem=new Set<string>(cluster.ownedProblemRoadIds??cluster.problemRoadIds);
  const mutableIds=new Set(local.roads.filter(r=>r.groupId===cluster.primaryGroup&&r.roadClass==='ramp'||(problem.has(r.id)||seeds.has(r.id))&&(!cluster.primaryGroup||r.roadClass==='ramp')).map(r=>r.id));
  const baseline=rampOverlaps(localMap(map,cluster.roadIds));
  const geometricRoads=new Set<string>(),endpointMoves:any[]=[];
  if(plan==='frontage-shift'){
    for(const o of baseline){const own=o.roadIds.find(id=>mutableIds.has(id)&&original.get(id)?.roadClass!=='expressway'),hostId=o.roadIds.find(id=>id!==own&&original.get(id)?.roadClass==='frontage');if(!own||!hostId||o.alignment>.75||o.relation!=='unlinked')continue;
      const k=o.roadIds[0]===own?0:1,range=o.stationRanges[k],path=roadPoints(original.get(own)!),L=stations(path).at(-1)!,shared=baseline.filter(s=>s.roadIds.includes(own)&&s.relation==='junction-related'),nearStart=(range[0]+range[1])/2<L/2,landing=shared.flatMap(s=>{const r=s.stationRanges[s.roadIds[0]===own?0:1];return nearStart&&r[1]<range[0]?[r[1]]:!nearStart&&r[0]>range[1]?[r[0]]:[];});if(!landing.length)continue;const distanceToLanding=nearStart?range[0]-Math.max(...landing):Math.min(...landing)-range[1];if(distanceToLanding>70)continue;
      const host=local.roads.find(r=>r.id===hostId)!,hp=roadPoints(host),hs=stations(hp),HL=hs.at(-1)!,direction=sampleAt(path,(range[0]+range[1])/2).tangent,sgn=nearStart?1:-1,positions=[...hs];for(let s=4;s<HL;s+=4)if(!positions.some(t=>Math.abs(t-s)<.1))positions.push(s);positions.sort((a,b)=>a-b);host.centerline=positions.map(s=>{const p=sampleAt(hp,s).point,t=clamp((s-12)/(HL-24),0,1),shift=35*Math.sin(Math.PI*t)**2;return {...p,x:p.x+direction.x*sgn*shift,z:p.z+direction.z*sgn*shift};});host.curve='polyline';host.elevationMode='custom';delete host.elevation;geometricRoads.add(host.id);endpointMoves.push({roadId:host.id,reason:'Move the local crossing away from the shared landing to provide the measured missing vertical transition distance; preserve all endpoint connections',crossingRoadId:own,beforeDistanceToLanding:distanceToLanding,maximumLocalShift:35,endpointsPreserved:true});break;
    }
  }
  if(plan==='junction-realignment')for(const authored of local.roadLinks??[]){
    const link=authored.from.end==='end'?authored:{...authored,from:authored.to,to:authored.from};
    if(link.from.end!=='end'||link.to.end!=='start'||!mutableIds.has(link.from.roadId)||!mutableIds.has(link.to.roadId))continue;
    const a=local.roads.find(r=>r.id===link.from.roadId)!,b=local.roads.find(r=>r.id===link.to.roadId)!,pa=roadPoints(a),pb=roadPoints(b),fa=sampleAt(pa,stations(pa).at(-1)!),fb=sampleAt(pb,0);
    if(fa.tangent.x*fb.tangent.x+fa.tangent.z*fb.tangent.z>-.8)continue;
    const center={x:(pa[0]!.x+pb.at(-1)!.x)/2,z:(pa[0]!.z+pb.at(-1)!.z)/2},old=pa.at(-1)!,dx=old.x-center.x,dz=old.z-center.z,n=Math.hypot(dx,dz),joint={x:old.x+dx/n*90,y:old.y,z:old.z+dz/n*90},t={x:dz/n,z:-dx/n};
    const curve=(path:CityPoint[],start:CityPoint,end:CityPoint,ts:CityPoint,te:CityPoint)=>{const handle=Math.min(100,distance(start,end)*.4),p=cubicPath([start,{x:start.x+ts.x*handle,y:start.y,z:start.z+ts.z*handle},{x:end.x-te.x*handle,y:end.y,z:end.z-te.z*handle},end]);return p.map((v,i)=>({...v,y:sampleAt(path,stations(path).at(-1)!*i/(p.length-1)).point.y}));};
    a.centerline=curve(pa,pa[0]!,joint,sampleAt(pa,0).tangent,t);b.centerline=curve(pb,joint,pb.at(-1)!,t,sampleAt(pb,stations(pb).at(-1)!).tangent);a.curve=b.curve='polyline';a.elevationMode=b.elevationMode='custom';
    geometricRoads.add(a.id);geometricRoads.add(b.id);
    endpointMoves.push({roadId:a.id,end:'end',parentRoadId:b.id,parentEnd:'start',before:old,after:joint,reason:'Replace the overlapping reversing throat with one C1 paired alignment, preserving both stable junction mouths and the link',connectionsPreserved:true});break;
  }
  if(plan==='access-extended'||plan==='structural')for(const ramp of local.roads.filter(r=>mutableIds.has(r.id)&&r.roadClass==='ramp')){
    const ends=(local.roadLinks??[]).flatMap(l=>l.from.roadId===ramp.id?[{own:l.from.end,other:l.to}]:l.to.roadId===ramp.id?[{own:l.to.end,other:l.from}]:[]),ground=ends.find(e=>{const r=original.get(e.other.roadId)!;return r&&['frontage','arterial','avenue','collector','local'].includes(r.roadClass??'');}),high=ends.find(e=>e!==ground&&original.get(e.other.roadId)?.roadClass==='expressway');
    if(!ground||!high)continue;
    extendHighMouth(local,ramp,high,geometricRoads,endpointMoves);const path=roadPoints(ramp);
    const parent=local.roads.find(r=>r.id===ground.other.roadId)!;let parentPath=roadPoints(parent),L=stations(parentPath).at(-1)!;
    if(L<140){
      const outer=ground.other.end==='end'?'start':'end',outerLinks=(local.roadLinks??[]).flatMap(l=>l.from.roadId===parent.id&&l.from.end===outer?[l.to]:l.to.roadId===parent.id&&l.to.end===outer?[l.from]:[]),edge=outerLinks.length===1?outerLinks[0]:undefined,neighbour=edge?local.roads.find(r=>r.id===edge.roadId):undefined;
      if(edge&&neighbour&&neighbour.roadClass===parent.roadClass&&neighbour.roadNameId===parent.roadNameId&&!local.intersections.some(j=>j.connections.some(c=>c.roadId===parent.id&&c.end===outer))){
        const np=roadPoints(neighbour),nl=stations(np).at(-1)!,amount=Math.min(140-L,nl-20),farLinks=(local.roadLinks??[]).filter(l=>[l.from,l.to].some(e=>e.roadId===neighbour.id&&e.end===edge.end));
        if(amount>1&&farLinks.length===1&&rampProfile(neighbour).maxGrade<.005){const cut=edge.end==='end'?nl-amount:amount,prefix=edge.end==='end'?slicePath(np,cut,nl):slicePath(np,0,cut).reverse();neighbour.centerline=edge.end==='end'?slicePath(np,0,cut):slicePath(np,cut,nl);neighbour.curve='polyline';neighbour.elevationMode='custom';delete neighbour.elevation;parent.centerline=outer==='start'?[...prefix,...parentPath.slice(1)]:[...parentPath,...[...prefix].reverse().slice(1)];parent.curve='polyline';parent.elevationMode='custom';delete parent.elevation;geometricRoads.add(neighbour.id);geometricRoads.add(parent.id);endpointMoves.push({roadId:parent.id,end:outer,parentRoadId:neighbour.id,parentEnd:edge.end,before:outer==='start'?parentPath[0]:parentPath.at(-1),after:prefix[0],movedAlongExistingFrontage:amount,remainingFrontageLength:nl-amount,connectionsPreserved:true,reason:'Retime an unbranched frontage seam to provide transition length without changing its physical corridor'});parentPath=roadPoints(parent);L=stations(parentPath).at(-1)!;}
      }
    }
    const distanceBudget=Math.min(120,L-20);if(distanceBudget<15)continue;
    const members=[ground.other],memberKeys=new Set([ground.other.roadId+':'+ground.other.end]);
    for(let cursor=0;cursor<members.length;cursor++){const member=members[cursor]!;for(const link of local.roadLinks??[]){const other=link.from.roadId===member.roadId&&link.from.end===member.end?link.to:link.to.roadId===member.roadId&&link.to.end===member.end?link.from:undefined;if(other&&!memberKeys.has(other.roadId+':'+other.end)){memberKeys.add(other.roadId+':'+other.end);members.push(other);}}}
    if(members.some(e=>e.roadId!==ramp.id&&e.roadId!==parent.id&&(original.get(e.roadId)?.roadClass==='ramp'||local.intersections.some(j=>j.connections.some(c=>c.roadId===e.roadId&&c.end===e.end)))))continue;
    const at=ground.other.end==='end'?L-distanceBudget:distanceBudget,newPoint=sampleAt(parentPath,at),a=ground.own==='start'?newPoint.point:path[0]!,d=ground.own==='end'?newPoint.point:path.at(-1)!;
    const highRoad=original.get(high.other.roadId)!,hp=roadPoints(highRoad),hf=sampleAt(hp,high.other.end==='start'?0:stations(hp).at(-1)!),hs=high.other.end===high.own?-1:1,gs=ground.other.end===ground.own?-1:1;
    const startT=ground.own==='start'?{x:newPoint.tangent.x*gs,z:newPoint.tangent.z*gs}:{x:hf.tangent.x*hs,z:hf.tangent.z*hs},endT=ground.own==='end'?{x:newPoint.tangent.x*gs,z:newPoint.tangent.z*gs}:{x:hf.tangent.x*hs,z:hf.tangent.z*hs},handle=distance(a,d)/3;
    ramp.centerline=cubicPath([a,{x:a.x+startT.x*handle,y:a.y,z:a.z+startT.z*handle},{x:d.x-endT.x*handle,y:d.y,z:d.z-endT.z*handle},d]);ramp.curve='polyline';ramp.elevationMode='custom';
    parent.centerline=ground.other.end==='end'?slicePath(parentPath,0,at):slicePath(parentPath,at,L);parent.curve='polyline';parent.elevationMode='custom';delete parent.elevation;geometricRoads.add(parent.id);
    const prefix=ground.other.end==='end'?slicePath(parentPath,at,L):slicePath(parentPath,0,at).reverse();
    for(const member of members.filter(e=>e.roadId!==parent.id&&e.roadId!==ramp.id)){const other=local.roads.find(r=>r.id===member.roadId)!,p=roadPoints(other);other.centerline=member.end==='start'?[...prefix,...p.slice(1)]:[...p,...[...prefix].reverse().slice(1)];other.curve='polyline';other.elevationMode='custom';delete other.elevation;geometricRoads.add(other.id);}
    endpointMoves.push({roadId:ramp.id,end:ground.own,parentRoadId:parent.id,parentEnd:ground.other.end,before:ground.own==='start'?path[0]:path.at(-1),after:newPoint.point,movedAlongExistingFrontage:distanceBudget,remainingFrontageLength:L-distanceBudget,connectionsPreserved:true,linkedEndpoints:members});
  }
  // A graded mainline and a diverging ramp cannot share an extended flat-width
  // ribbon while keeping incompatible tangential planes. Include the shared
  // approach section in the design rather than pinning every ramp to it.
  for(const o of baseline)if(o.minGap<.15&&o.maxGap>.04&&o.alignment>.75&&o.roadIds.some(id=>mutableIds.has(id)))for(const id of o.roadIds)mutableIds.add(id);
  const mutable=local.roads.filter(r=>mutableIds.has(r.id)&&(r.roadClass==='ramp'||rampProfile(r).maxGrade>=.005));
  for(const id of [...mutableIds])if(!mutable.some(r=>r.id===id))mutableIds.delete(id);
  if(!mutable.length)return {accepted:false,reason:'No independently editable branch in this cluster',roadIds:[],plan};
  const models=new Map<string,Model>(),values:number[]=[],weights:number[]=[],rows:Row[]=[],impossible:any[]=[];
  const add=(terms:[number,number][],lo:number,hi:number,label:string)=>{
    const coefficients=new Map<number,number>();for(const [i,a]of terms)coefficients.set(i,(coefficients.get(i)??0)+a);
    const ids:number[]=[],a:number[]=[];let constant=0;
    for(const [i,c]of coefficients){if(Math.abs(c)<1e-10)continue;if(weights[i]===0)constant+=c*values[i]!;else{ids.push(i);a.push(c);}}
    lo-=constant;hi-=constant;const norm=a.reduce((v,c,k)=>v+c*c*weights[ids[k]!]!,0);
    if(!norm){
      // The 12mm numerical clearance reserve is optional at an immutable
      // endpoint. The independent final footprint check still enforces the
      // original minimum and the structural floor, without that reserve.
      if(label.startsWith('clearance:')&&lo<=.01201&&hi>=-.01201)return;
      if(label.startsWith('mouth-grade:'))return;
      if(lo>1e-5||hi< -1e-5)impossible.push({label,lo,hi});return;
    }
    rows.push({ids,a,lo,hi,norm,dual:0,label});
  };
  for(const road of mutable){
    const old=roadPoints(road),table=stations(old),length=table.at(-1)!;
    // Preserve every authored horizontal corner; smoothing changes Y only.
    road.centerline=old.map(p=>({...p}));road.curve='polyline';road.elevationMode='custom';delete road.elevation;road.pavementSurface='ribbon';
    if((plan==='outboard'||plan==='structural'&&road.id.includes('-loop'))){
      let turn=0;for(let i=2;i<old.length;i++){const a=old[i-2]!,b=old[i-1]!,c=old[i]!;turn+=Math.atan2((b.x-a.x)*(c.z-b.z)-(b.z-a.z)*(c.x-b.x),(b.x-a.x)*(c.x-b.x)+(b.z-a.z)*(c.z-b.z));}
      let side=-(Math.sign(turn)||1);
      if(road.roadClass!=='ramp'){
        const shared=baseline.filter(o=>o.roadIds.includes(road.id)&&o.relation==='junction-related'&&o.alignment>.75).sort((a,b)=>b.area-a.area)[0];if(shared){const k=shared.roadIds[0]===road.id?0:1,range=shared.stationRanges[k],s=(range[0]+range[1])/2<length/2?Math.min(length*.4,range[1]+20):Math.max(length*.6,range[0]-20),frame=sampleAt(old,s),other=project(roadPoints(original.get(shared.roadIds[1-k]!)!),frame.point),signed=-(frame.point.x-other.point.x)*frame.tangent.z+(frame.point.z-other.point.z)*frame.tangent.x;if(Math.abs(signed)>.1)side=Math.sign(signed);}
      }
      const offset=road.roadClass!=='ramp'?side*Math.min(35,length*.15):road.id.includes('-loop')?-45:/semi|turbine/.test(road.id)?road.id.includes('turbine')?45:35:road.id.startsWith('regional:')?40:8;
      if(road.roadClass!=='expressway')
      road.centerline=old.map((p,i)=>{const s=table[i]!,t=clamp((s-12)/(length-24),0,1),u=sampleAt(old,Math.max(0,s-4)).point,v=sampleAt(old,Math.min(length,s+4)).point,d=distance(u,v),shift=offset*Math.sin(Math.PI*t)**2;return {...p,x:p.x-(v.z-u.z)/d*shift,z:p.z+(v.x-u.x)/d*shift};});
    }
    const authored=road.centerline,authoredStations=stations(authored),L=authoredStations.at(-1)!,knots=[0];for(let t=4;t<L-2;t+=L<500||t<200||L-t<200?4:8){const near=authoredStations.find(s=>Math.abs(s-t)<.25);knots.push(near??t);}knots.push(L);
    const positions=[...new Set([...authoredStations,...knots])].sort((a,b)=>a-b);road.centerline=positions.map(s=>sampleAt(authored,s).point);const s=stations(road.centerline);
    const ys=knots.map(t=>sampleAt(road.centerline,t).point.y??0),fixed=new Map([[0,ys[0]!],[ys.length-1,ys.at(-1)!]]),target=fitRampProfile(knots,ys,fixed,18),offset=values.length;
    values.push(...target);weights.push(...target.map((_,i)=>{
      if(road.roadClass!=='ramp'&&rampProfile(original.get(road.id)!).maxGrade<.005){values[offset+i]=ys[i]!;return 0;}
      if(road.roadClass!=='ramp'&&!geometricRoads.has(road.id)){const p=sampleAt(road.centerline,knots[i]!).point,b=cluster.boundary;if(p.x<b.minX+8||p.x>b.maxX-8||p.z<b.minZ+8||p.z>b.maxZ-8){values[offset+i]=ys[i]!;return 0;}}
      if(i!==0&&i!==target.length-1)return 1;
      const end=i===0?'start':'end',neighbours=(map.roadLinks??[]).flatMap(l=>l.from.roadId===road.id&&l.from.end===end?[l.to]:l.to.roadId===road.id&&l.to.end===end?[l.from]:[]);
      return neighbours.length&&neighbours.every(e=>mutableIds.has(e.roadId))&&!map.intersections.some(j=>j.connections.some(c=>c.roadId===road.id&&c.end===end))?1:0;
    }));
    models.set(road.id,{road,s,knots,offset,original:ys});
    if(road.roadClass==='expressway'){
      const originalY=roadPoints(original.get(road.id)!).map(p=>p.y??0),low=Math.min(...originalY),high=Math.max(...originalY),monotone=high-low<=Math.abs(originalY.at(-1)!-originalY[0]!)+.02,sign=Math.sign(originalY.at(-1)!-originalY[0]!);
      for(let i=0;i<knots.length;i++)add([[offset+i,1]],low-.005,high+.005,'mainline-height-envelope:'+road.id);
      if(monotone&&sign)for(let i=1;i<knots.length;i++)add([[offset+i,sign],[offset+i-1,-sign]],0,Infinity,'monotone-mainline:'+road.id);
    }
    if(road.roadClass!=='ramp'&&rampProfile(original.get(road.id)!).maxGrade<.005)for(let i=0;i<knots.length;i++)add([[offset+i,1]],ys[i]!-.03,ys[i]!+.03,'stable-mainline:'+road.id+':'+knots[i]);
    for(let i=1;i<knots.length;i++){const d=knots[i]!-knots[i-1]!;add([[offset+i,1/d],[offset+i-1,-1/d]],-.119,.119,'grade:'+road.id+':'+knots[i]);}
    for(let i=1;i<knots.length-1;i++){const l=knots[i]!-knots[i-1]!,r=knots[i+1]!-knots[i]!,limit=.025*Math.min(1,(l+r)/16);add([[offset+i-1,1/l],[offset+i,-1/l-1/r],[offset+i+1,1/r]],-limit,limit,'curvature:'+road.id+':'+knots[i]);}
  }
  const termsAt=(m:Model,s:number):[number,number][]=>{let i=Math.min(m.knots.length-2,Math.max(0,Math.floor(s/8)));while(i>0&&s<m.knots[i]!)i--;while(i<m.knots.length-2&&s>m.knots[i+1]!)i++;const t=(s-m.knots[i]!)/(m.knots[i+1]!-m.knots[i]!);return [[m.offset+i,1-t],[m.offset+i+1,t]];};
  for(const link of local.roadLinks??[]){const a=models.get(link.from.roadId),b=models.get(link.to.roadId);if(!a||!b)continue;const ia=a.offset+(link.from.end==='start'?0:a.knots.length-1),ib=b.offset+(link.to.end==='start'?0:b.knots.length-1);add([[ia,1],[ib,-1]],0,0,'link:'+link.id);}
  // Preserve the entry/exit grade supplied by the connected stable approach.
  for(const m of models.values())for(const end of ['start','end']as const){
    const adjacent=(local.roadLinks??[]).flatMap(l=>l.from.roadId===m.road.id&&l.from.end===end?[l.to]:l.to.roadId===m.road.id&&l.to.end===end?[l.from]:[]).filter(e=>!models.has(e.roadId));
    if(!adjacent.length)continue;const e=adjacent[0]!,r=original.get(e.roadId)!,p=roadPoints(r),outer=e.end==='start'?p[0]!:p.at(-1)!,inner=e.end==='start'?p[1]!:p.at(-2)!,g=((inner.y??0)-(outer.y??0))/Math.max(.001,distance(outer,inner))*(end==='start'?-1:1),L=m.knots.at(-1)!,s=end==='start'?m.knots[1]!:m.knots.at(-2)!,y=(end==='start'?m.original[0]!:m.original.at(-1)!)+g*(s-(end==='start'?0:L));add(termsAt(m,s),y-.001,y+.001,'mouth-grade:'+m.road.id+':'+end);
  }
  const segments=makePavementSegments(local),spatial=new EditorSpatialIndex(64);segments.forEach((s,i)=>spatial.set(String(i),s.box));
  const parents=new Map<string,Set<string>>();
  for(const m of models.values()){
    const set=new Set<string>(),queue=(local.roadLinks??[]).flatMap(l=>l.from.roadId===m.road.id?[l.to.roadId]:l.to.roadId===m.road.id?[l.from.roadId]:[]).filter(id=>original.get(id)?.roadClass!=='ramp');queue.forEach(id=>set.add(id));
    for(let cursor=0;cursor<queue.length&&cursor<100;cursor++){const id=queue[cursor]!,r=original.get(id)!;for(const l of local.roadLinks??[]){const next=l.from.roadId===id?l.to.roadId:l.to.roadId===id?l.from.roadId:undefined;if(!next||set.has(next))continue;const other=original.get(next)!;if(other.roadClass===r.roadClass&&other.roadNameId===r.roadNameId){set.add(next);queue.push(next);}}}parents.set(m.road.id,set);
  }
  // A station-valued ribbon provides exact affine longitudinal coordinates at
  // each footprint vertex, including the inside/outside edges of a bend.
  const coordinates=new Map<string,ReturnType<typeof roadPavementTriangle>>();
  for(const m of models.values()){const edges=roadEdges(m.road),left=roadEdgeChains(local).edge(m.road,edges.left),right=roadEdgeChains(local).edge(m.road,edges.right);for(let i=0;i<left.length-1;i++){const a={...left[i]!,y:m.s[i]!},b={...right[i]!,y:m.s[i]!},c={...left[i+1]!,y:m.s[i+1]!},d={...right[i+1]!,y:m.s[i+1]!};coordinates.set(m.road.id+':'+(2*i),roadPavementTriangle(a,b,c,1));coordinates.set(m.road.id+':'+(2*i+1),roadPavementTriangle(b,d,c,1));}}
  const expression=(s:PavementSegment,p:CityPoint):{terms:[number,number][];constant:number}=>{const m=models.get(s.road.id);if(!m)return {terms:[],constant:s.surface.heightAt(p.x,p.z)};const coordinate=coordinates.get(s.road.id+':'+s.index)!.heightAt(p.x,p.z);const segment=Math.floor(s.index/2),u=(coordinate-m.s[segment]!)/(m.s[segment+1]!-m.s[segment]!);return {terms:[...termsAt(m,m.s[segment]!).map(([i,c])=>[i,c*(1-u)]as[number,number]),...termsAt(m,m.s[segment+1]!).map(([i,c])=>[i,c*u]as[number,number])],constant:0};};
  const kinds:any[]=[];
  for(let i=0;i<segments.length;i++){
    const a=segments[i]!;for(const id of spatial.query(a.box)){const j=+id;if(j<=i)continue;const b=segments[j]!;if(!models.has(a.road.id)&&!models.has(b.road.id))continue;if(a.road.id===b.road.id&&Math.abs(a.index-b.index)<=3)continue;
      const poly=clipPavementFootprints(a.polygon,b.polygon);if(poly.length<3)continue;const area=Math.abs(poly.reduce((v,p,k)=>{const q=poly[(k+1)%poly.length]!;return v+p.x*q.z-q.x*p.z;},0))/2;if(area<1e-4)continue;
      const point={x:poly.reduce((v,p)=>v+p.x,0)/poly.length,z:poly.reduce((v,p)=>v+p.z,0)/poly.length},pair=key(a.road.id,b.road.id),old=baseline.filter(o=>key(...o.roadIds)===pair).sort((u,v)=>distance(u.point,point)-distance(v.point,point))[0];
      const delta=a.surface.heightAt(point.x,point.z)-b.surface.heightAt(point.x,point.z),alignment=Math.abs(a.tx*b.tx+a.tz*b.tz),same=a.road.id===b.road.id;
      const sa=a.start+a.length/2,sb=b.start+b.length/2,la=stations(roadPoints(a.road)).at(-1)!,lb=stations(roadPoints(b.road)).at(-1)!;
      const nearMouth=Math.min(sa,la-sa)<Math.min(250,la*.4)||Math.min(sb,lb-sb)<Math.min(250,lb*.4);
      const related=old?.relation==='endpoint-linked'||old?.relation==='junction-related'||parents.get(a.road.id)?.has(b.road.id)||parents.get(b.road.id)?.has(a.road.id);
      const junctionLanding=old?.relation==='junction-related'&&local.intersections.some(j=>j.connections.some(c=>c.roadId===a.road.id)&&j.connections.some(c=>c.roadId===b.road.id)&&distance(j.position,point)<180);
      const shared=same||junctionLanding||old&&old.maxGap<.04||old&&old.maxGap<.5&&alignment>.95||old&&old.minGap<.15&&(old.relation==='endpoint-linked'||alignment>.75&&nearMouth&&related);
      const sign=old?(old.signedMin+old.signedMax>=0?1:-1):Math.sign(delta)||1;
      // When road order differs from the baseline overlap order, invert it.
      let orientation=old&&old.roadIds[0]!==a.road.id?-sign:sign;
      if(plan==='structural'&&old&&old.minGap<6.15&&!shared){
        const branch=a.road.roadClass==='ramp'&&b.road.roadClass!=='ramp'?{road:a.road,station:sa,length:la,other:b.road,sign:1}:b.road.roadClass==='ramp'&&a.road.roadClass!=='ramp'?{road:b.road,station:sb,length:lb,other:a.road,sign:-1}:undefined;
        if(branch){const points=roadPoints(branch.road),range=old.stationRanges[old.roadIds[0]===branch.road.id?0:1],fraction=(range[0]+range[1])/2/stations(roadPoints(original.get(branch.road.id)!)).at(-1)!,otherY=(branch.other===a.road?a:b).surface.heightAt(point.x,point.z),datum=fraction<.4?points[0]!.y:fraction>.6?points.at(-1)!.y:undefined;if(datum!==undefined&&Math.abs(datum-otherY)>3.5)orientation=Math.sign(datum-otherY)*branch.sign;}
      }
      const minimum=(old&&old.minGap>=5.65&&old.maxGap-old.minGap<.03?old.minGap:Math.max(6.15,old?.minGap??0))+.012;
      kinds.push({roadIds:[a.road.id,b.road.id],shared,minimum,point});
      for(const p of poly){if(!a.surface.contains(.00001)(p.x,p.z)||!b.surface.contains(.00001)(p.x,p.z))continue;const ea=expression(a,p),eb=expression(b,p),constant=ea.constant-eb.constant,terms=[...ea.terms,...eb.terms.map(([i,c])=>[i,-c]as[number,number])];if(shared)add(terms,-.025-constant,.025-constant,'shared:'+pair);else add(terms,orientation>0?minimum-constant:-Infinity,orientation>0?Infinity:-minimum-constant,'clearance:'+pair);}
    }
  }
  const unique=new Set<string>();for(let i=rows.length-1;i>=0;i--){const r=rows[i]!,signature=r.ids.map((id,k)=>id+':'+r.a[k]!.toFixed(7)).join(',')+'|'+r.lo.toFixed(6)+'|'+r.hi.toFixed(6);if(unique.has(signature))rows.splice(i,1);else unique.add(signature);}
  let residual=Infinity,iteration=0,worst:unknown[]=[];const convergence:{iteration:number;residual:number}[]=[];
  if(!impossible.length){const solve=constrainedProjection(rows,values);values.splice(0,values.length,...solve.x);residual=solve.residual;iteration=solve.iteration;worst=rows.map(r=>{const v=r.ids.reduce((n,i,k)=>n+r.a[k]!*values[i]!,0);return {residual:Math.max(0,r.lo-v,v-r.hi),label:r.label};}).sort((a,b)=>b.residual-a.residual).slice(0,12);}
  // Endpoint links are exact geometry anchors, not soft numerical tolerances.
  // Publishing a residual above the edge-chain's 20mm join tolerance could
  // change the miter frame and invalidate the solved footprint itself.
  const endpointParent=new Map<number,number>(),find=(i:number):number=>endpointParent.has(i)?endpointParent.get(i)===i?i:find(endpointParent.get(i)!):i;
  for(const link of local.roadLinks??[]){const a=models.get(link.from.roadId),b=models.get(link.to.roadId);if(!a||!b)continue;const i=a.offset+(link.from.end==='start'?0:a.knots.length-1),j=b.offset+(link.to.end==='start'?0:b.knots.length-1);if(!endpointParent.has(i))endpointParent.set(i,i);if(!endpointParent.has(j))endpointParent.set(j,j);endpointParent.set(find(j),find(i));}
  const endpointGroups=new Map<number,number[]>();for(const i of endpointParent.keys()){const root=find(i),group=endpointGroups.get(root)??[];group.push(i);endpointGroups.set(root,group);}for(const group of endpointGroups.values()){const fixed=group.filter(i=>weights[i]===0),height=fixed.length?values[fixed[0]!]!:group.reduce((v,i)=>v+values[i]!,0)/group.length;for(const i of group)values[i]=height;}
  for(const m of models.values())m.road.centerline=m.road.centerline.map((p,i)=>({...p,y:termsAt(m,m.s[i]!).reduce((v,[index,c])=>v+c*values[index]!,0)}));
  const resultRoads=local.roads.filter(r=>models.has(r.id)||geometricRoads.has(r.id)),changes=resultRoads.map(r=>{const old=roadPoints(original.get(r.id)!);return {roadId:r.id,before:profileSummary(original.get(r.id)!),after:profileSummary(r),maxYChange:Math.max(...r.centerline.map(p=>Math.abs((p.y??0)-(project(old,p).point.y??0)))),maxXZChange:Math.max(...r.centerline.map(p=>project(old,p).distance))};});
  const validation=rampOverlaps({...local,roads:[...local.roads]}).filter(o=>o.roadIds.some(id=>models.has(id))).map(o=>{const candidates=kinds.filter(k=>key(...k.roadIds)===key(...o.roadIds)).sort((a,b)=>distance(a.point,o.point)-distance(b.point,o.point)),design=candidates[0],old=baseline.filter(k=>key(...k.roadIds)===key(...o.roadIds)).sort((a,b)=>distance(a.point,o.point)-distance(b.point,o.point))[0];const shared=design?.shared??o.maxGap<.04;return {...o,expectedShared:shared,valid:shared?o.maxGap<=.04:o.minGap>=Math.max((design?.minimum??6.162)-.012,(old?.minGap??0)-.001)-1e-5};});
  return {designVersion:4,accepted:impossible.length===0&&changes.every(c=>c.after.maxGrade<=Math.max(.12,c.before.maxGrade)+.001&&c.after.maxGradeBreak<=.04&&(c.after.minRadius===null||c.after.minRadius>=Math.min(c.before.minRadius??Infinity,(original.get(c.roadId)!.speedLimit/3.6)**2/3.5)-.1))&&validation.every(v=>v.valid),plan,roadIds:resultRoads.map(r=>r.id),variables:values.length,constraints:rows.length,iterations:iteration,residual,worst,impossible:impossible.slice(0,15),roads:resultRoads,changes,endpointMoves,overlapConstraints:kinds,validation};
}
