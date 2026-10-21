import fs from 'node:fs';import assert from 'node:assert/strict';
import type {CityMapData,CityRoad,CityPoint} from '../../src/world/city/CityMapData';
import {loadCityMap} from '../../src/world/city/CityMapLoader';
import {roadPoints,roadEdges,sampleAt,polylineLength} from '../../src/world/city/geometry';
import {diagnoseElevationSeams,makePavementSegments,clipPavementFootprints,applyReviewedPavementProfile,type PavementSegment} from '../../src/editor/ElevationSeams';
import {clusterElevationSeams,diagnoseJunctionElevationSeams,type SeamCluster} from '../../src/editor/ElevationSeamClusters';
import {stations,analysisContext,invalidateAnalysis} from '../../src/editor/MapAnalysis';
import {bounds,distance,project,EditorSpatialIndex} from '../../src/editor/EditorGeometry';
import {CityEditingKernel} from '../../src/editor/CityEditingKernel';
import type {EditorCommand} from '../../src/editor/EditorCommands';
import {setJunctionPavementFootprint} from '../../src/world/city/JunctionSurface';

const dir='artifacts/map-elevation-seam-audit',baseline:CityMapData=JSON.parse(fs.readFileSync(dir+'/continuation-before-map.json','utf8'));
const initial=JSON.parse(fs.readFileSync(dir+'/continuation-cluster-baseline.json','utf8'));
let working=loadCityMap(baseline);
const log:any[]=[],failures:any[]=[],linkedChanged=new Set<string>();
const smoother=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*t*(t*(t*6-15)+10);};
const hermite=(a:number,b:number,ga:number,gb:number,L:number,d:number)=>{const t=Math.max(0,Math.min(1,d/L));return (2*t*t*t-3*t*t+1)*a+(t*t*t-2*t*t+t)*L*ga+(-2*t*t*t+3*t*t)*b+(t*t*t-t*t)*L*gb;};
const trapezoid=(a:number,b:number,ga:number,gb:number,L:number,d:number)=>{
  const r=Math.min(10,L*.18),peak=(b-a-.5*(ga+gb)*r)/(L-r),F=(t:number)=>t*t*t-.5*t*t*t*t;
  if(d<=r)return a+ga*d+(peak-ga)*r*F(d/r);
  const first=.5*(ga+peak)*r;if(d<L-r)return a+first+peak*(d-r);
  const t=(d-L+r)/r;return a+first+peak*(L-2*r)+peak*(d-L+r)+(gb-peak)*r*F(t);
};
const metric=(r:CityRoad)=>{const p=roadPoints(r),s=stations(p),g=p.slice(1).map((v,i)=>((v.y??0)-(p[i]!.y??0))/(s[i+1]!-s[i]!));return {maxGrade:Math.max(0,...g.map(Math.abs)),gradeBreak:Math.max(0,...g.slice(1).map((v,i)=>Math.abs(v-g[i]!)))};};
function profile(r:CityRoad,fn:(s:number,p:CityPoint)=>number,step=4){const p=roadPoints(r),length=polylineLength(p),ss=stations(p);for(let s=step;s<length;s+=step){const point=sampleAt(p,s).point;if(Math.abs(fn(s,point)-(point.y??0))<1e-8)continue;if(ss.every(t=>Math.abs(s-t)>.05))ss.push(s);}ss.sort((a,b)=>a-b);return ss.map(station=>{const point=sampleAt(p,station).point;return {station,before:point.y??0,after:fn(station,point)};});}
function install(id:string,p:ReturnType<typeof profile>,reason:string,endpoint=false){
  const r=working.roads.find(r=>r.id===id)!;
  if(!p.some(v=>Math.abs(v.after-v.before)>1e-6))return false;
  const next=structuredClone(r);applyReviewedPavementProfile(next,p,8,endpoint);
  working.roads[working.roads.indexOf(r)]=next;log.push({id,reason,before:metric(r),after:metric(next),maxYChange:Math.max(...p.map(v=>Math.abs(v.after-v.before))),start:p.find(v=>Math.abs(v.after-v.before)>1e-6)?.station,end:p.findLast(v=>Math.abs(v.after-v.before)>1e-6)?.station});
  invalidateAnalysis(working);return true;
}
function scan(map=working){const road=diagnoseElevationSeams(map,{minHeightDelta:.02}),junction=diagnoseJunctionElevationSeams(map);return {road,junction,clusters:clusterElevationSeams([...road.issues,...junction.issues])};}

// Proven landing ownership defects: keep the datum local instead of letting a
// flat junction own a remote graded/depressed approach. Every connected arm is checked.
const landingIds=new Set<string>(initial.junction.issues.filter((s:any)=>s.topologyRelation==='junction-boundary-connected').map((s:any)=>s.roadIds[1].slice(9)));
for(const id of landingIds){
  const j=working.intersections.find(j=>j.id===id)!,datum=j.position.y??0;
  const saved=structuredClone(working),savedLog=log.length;let valid=true;
  for(const connection of j.connections){
    const r=working.roads.find(r=>r.id===connection.roadId)!,path=roadPoints(r),L=polylineLength(path),reverse=connection.end==='end',out=reverse?[...path].reverse():path;
    const oldEndpoint=out[0]!.y??0;let done=false;
    if(out.every(p=>Math.abs((p.y??0)-datum)<.005))continue;
    for(const requested of [40,60,80,100,120,150]){
      const window=Math.min(L,requested),landing=Math.min(16,window*.4),end=sampleAt(out,window),target=end.point.y??0,g=window>=L-.01?0:end.tangent.y??0;
      const fn=(s:number,p:CityPoint)=>{const d=reverse?L-s:s;if(d>=window)return p.y??0;if(d<=landing)return datum;return trapezoid(datum,target,0,g,window-landing,d-landing);};
      const p=profile(r,fn,1);
      try{done=install(r.id,p,'junction landing '+id,Math.abs(oldEndpoint-datum)>1e-8)||true;break;}catch{}
    }
    if(!done){valid=false;failures.push({type:'landing',id,road:r.id,reason:'No endpoint-preserving <=12%/2m local profile fit'});break;}
    if(Math.abs(oldEndpoint-datum)>1e-8)(j.pavementHeights??={})[connection.port]=datum;
  }
  if(!valid){working=saved;log.splice(savedLog);continue;}
  j.pavementProfile='local-landing';setJunctionPavementFootprint(j,working);
  log.push({junction:id,reason:'Explicit local landing ownership; remote descending approaches cannot become a flat junction deck'});
}
fs.writeFileSync(dir+'/landing-preview-map.json',JSON.stringify(working));

// Symmetric nearby-carriageway reference, evaluated on the same immutable pass.
const pairClusters:SeamCluster[]=initial.clusters.filter((c:SeamCluster)=>!c.junctionId&&c.roadIds[0]!==c.roadIds[1]&&c.maxHeightDelta<=.35&&c.normalDot>.995&&c.roadIds.every(id=>{const r=working.roads.find(r=>r.id===id);return r?.roadClass==='expressway'&&r.travelDirection!=='two-way';}));
const peerMap=new Map<string,Set<string>>(),areas=new Map<string,ReturnType<typeof bounds>[]>();
for(const c of pairClusters)for(const id of c.roadIds){const peers=peerMap.get(id)??new Set();peers.add(c.roadIds.find(v=>v!==id)!);peerMap.set(id,peers);const list=areas.get(id)??[];list.push({...c.bbox,minX:c.bbox.minX-60,maxX:c.bbox.maxX+60,minZ:c.bbox.minZ-60,maxZ:c.bbox.maxZ+60});areas.set(id,list);}
// Include immediate continuations at changed source endpoints, so splits cannot create steps.
for(let pass=0;pass<2;pass++)for(const link of working.roadLinks??[])for(const [a,b]of [[link.from,link.to],[link.to,link.from]])if(peerMap.has(a!.roadId)){
  const ar=working.roads.find(r=>r.id===a!.roadId)!,br=working.roads.find(r=>r.id===b!.roadId)!;
  if(br.roadClass!=='expressway'||br.roadNameId!==ar.roadNameId)continue;
  if(!peerMap.has(br.id))peerMap.set(br.id,new Set(peerMap.get(ar.id)));areas.set(br.id,[...(areas.get(br.id)??[]),...(areas.get(ar.id)??[])]);
}
const snapshot=structuredClone(working),sourceRoads=new Map(snapshot.roads.map(r=>[r.id,r]));
const pending:{id:string;p:ReturnType<typeof profile>}[]=[];
for(const [id,peers]of peerMap){
  const r=sourceRoads.get(id)!,path=roadPoints(r),L=polylineLength(path);
  const fn=(s:number,p:CityPoint)=>{
    if(!(areas.get(id)??[]).some(a=>p.x>=a.minX&&p.x<=a.maxX&&p.z>=a.minZ&&p.z<=a.maxZ))return p.y??0;
    const matches=[...peers].map(id=>sourceRoads.get(id)!).filter(Boolean).map(other=>({other,hit:project(roadPoints(other),p)})).filter(v=>v.hit.distance<=Math.max(-roadEdges(r).left,roadEdges(r).right)+Math.max(-roadEdges(v.other).left,roadEdges(v.other).right)+.1&&Math.abs((v.hit.point.y??0)-(p.y??0))<.4).sort((a,b)=>a.hit.distance-b.hit.distance);
    if(!matches.length)return p.y??0;const {other,hit}=matches[0]!,own=sampleAt(path,s),alignment=Math.abs(own.tangent.x*hit.tangent.x+own.tangent.z*hit.tangent.z);if(alignment<.97)return p.y??0;
    const g0=own.tangent.y??0,g1=hit.tangent.y??0,gx=.5*(g0*own.tangent.x+g1*hit.tangent.x),gz=.5*(g0*own.tangent.z+g1*hit.tangent.z),reference=.5*((p.y??0)+(hit.point.y??0))+.5*(gx*(p.x-hit.point.x)+gz*(p.z-hit.point.z));
    const endpointWeight=Math.min(smoother(s/30),smoother((L-s)/30));
    // A source split with a continuation shares the same reference at its node.
    const linkedStart=(snapshot.roadLinks??[]).some(l=>[l.from,l.to].some(e=>e.roadId===id&&e.end==='start')&&[l.from,l.to].some(e=>e.roadId!==id&&peerMap.has(e.roadId))),linkedEnd=(snapshot.roadLinks??[]).some(l=>[l.from,l.to].some(e=>e.roadId===id&&e.end==='end')&&[l.from,l.to].some(e=>e.roadId!==id&&peerMap.has(e.roadId)));
    const weight=Math.min(linkedStart?1:smoother(s/30),linkedEnd?1:smoother((L-s)/30));void endpointWeight;void other;
    return (p.y??0)+(reference-(p.y??0))*weight;
  };
  const p=profile(r,fn),smooth=p.map(v=>{let sum=0,w=0;for(const u of p){const t=Math.abs(u.station-v.station)/20;if(t>1)continue;const weight=(1-t*t)**2;sum+=(u.after-u.before)*weight;w+=weight;}return {...v,after:v.before+sum/w};});
  for(const i of [0,smooth.length-1])smooth[i]!.after=p[i]!.after;
  pending.push({id,p:smooth});
}
for(const {id,p}of pending){try{if(install(id,p,'paired carriageway common longitudinal plane',true))linkedChanged.add(id);}catch(e){failures.push({type:'parallel',id,reason:String(e)});}}
// Restore exact link groups and extend small endpoint corrections into their immediate neighbours.
for(let pass=0;pass<2;pass++)for(const link of working.roadLinks??[]){
  const ar=working.roads.find(r=>r.id===link.from.roadId)!,br=working.roads.find(r=>r.id===link.to.roadId)!,a=roadPoints(ar)[link.from.end==='start'?0:ar.centerline.length-1]!,b=roadPoints(br)[link.to.end==='start'?0:br.centerline.length-1]!;
  if(Math.abs((a.y??0)-(b.y??0))<1e-7)continue;
  const baseA=baseline.roads.find(r=>r.id===ar.id)!,baseB=baseline.roads.find(r=>r.id===br.id)!,deltaA=(a.y??0)-(roadPoints(baseA)[link.from.end==='start'?0:baseA.centerline.length-1]!.y??0),deltaB=(b.y??0)-(roadPoints(baseB)[link.to.end==='start'?0:baseB.centerline.length-1]!.y??0);
  const chosen=Math.abs(deltaA)>Math.abs(deltaB)?a.y??0:b.y??0;
  for(const [r,end]of [[ar,link.from.end],[br,link.to.end]] as const){const L=polylineLength(roadPoints(r)),v=roadPoints(r)[end==='start'?0:r.centerline.length-1]!.y??0,d=chosen-v;if(Math.abs(d)<1e-8)continue;
    try{install(r.id,profile(r,(s,p)=>(p.y??0)+d*(1-smoother((end==='start'?s:L-s)/Math.min(40,L)))),'exact linked endpoint continuation',true);linkedChanged.add(r.id);}catch(e){failures.push({type:'linked',id:r.id,reason:String(e)});}
  }
}
fs.writeFileSync(dir+'/parallel-preview-map.json',JSON.stringify(working));

// Terminal ramps: reference the actual parent continuation chain, preserve all
// unrelated crossing heights, and reconnect to the original interior profile.
const rampIds=new Set<string>(initial.clusters.filter((c:SeamCluster)=>c.maxHeightDelta>=.02&&c.minHeightDelta<1).flatMap((c:SeamCluster)=>c.roadIds).filter((id:string)=>working.roads.find(r=>r.id===id)?.roadClass==='ramp'));
for(const id of rampIds){
  for(const end of ['start','end'] as const){
    const r=working.roads.find(r=>r.id===id)!,path=roadPoints(r),L=polylineLength(path),out=end==='start'?path:[...path].reverse(),ep=out[0]!;
    const links=(working.roadLinks??[]).flatMap(l=>l.from.roadId===id&&l.from.end===end?[l.to]:l.to.roadId===id&&l.to.end===end?[l.from]:[]),root=links.map(e=>working.roads.find(r=>r.id===e.roadId)!).find(r=>r&&r.roadClass!=='ramp');
    if(!root)continue;
    const parentIds=new Set([root.id]);
    for(let k=0;k<4;k++)for(const l of working.roadLinks??[])for(const [a,b]of [[l.from,l.to],[l.to,l.from]])if(parentIds.has(a!.roadId)&&!parentIds.has(b!.roadId)){
      const next=working.roads.find(r=>r.id===b!.roadId)!;if(!next||next.roadClass!==root.roadClass||next.roadNameId!==root.roadNameId)continue;
      const points=roadPoints(next);if(project(points,ep).distance>250)continue;parentIds.add(next.id);
    }
    const parents=makePavementSegments({...working,roads:working.roads.filter(r=>parentIds.has(r.id)),intersections:working.intersections.filter(j=>j.connections.every(c=>parentIds.has(c.roadId)))}),ramp=makePavementSegments({...working,roads:[r],intersections:[]});
    const overlap:number[]=[];
    for(const a of ramp)for(const b of parents){if(a.box.minX>b.box.maxX||a.box.maxX<b.box.minX||a.box.minZ>b.box.maxZ||a.box.maxZ<b.box.minZ)continue;for(const p of clipPavementFootprints(a.polygon,b.polygon))if(a.surface.contains(0)(p.x,p.z)&&b.surface.contains(0)(p.x,p.z)){const s=a.start+Math.max(0,Math.min(a.length,(p.x-a.a.x)*a.tx+(p.z-a.a.z)*a.tz));overlap.push(end==='start'?s:L-s);}}
    const sorted=overlap.filter(s=>s<L/2).sort((a,b)=>a-b);let last=0;for(const s of sorted){if(s-last>12)break;last=s;}
    const hold=last+2;if(hold<2||hold>L*.4)continue;
    const near=(p:CityPoint)=>{let best:PavementSegment|undefined,bestD=Infinity;for(const s of parents){const d=project([s.a,s.b],p).distance;if(d<bestD){bestD=d;best=s;}}return best!;};
    const ref=(s:number)=>{const p=sampleAt(out,s).point,b=near(p);return b.surface.heightAt(p.x,p.z);};
    const terminalGap=Math.max(...sorted.map(s=>Math.abs((sampleAt(out,s).point.y??0)-ref(s))),0);if(terminalGap<.015)continue;
    const context=analysisContext(working),cross=context.crossings(id).filter(c=>!parentIds.has(c.roadId)&&!c.connected&&Math.abs((c.point.y??0)-c.otherY)>2).map(c=>end==='start'?c.station:L-c.station).filter(s=>s>hold+.1),maximum=Math.min(L*.7,320,cross.length?Math.min(...cross)-3:Infinity);
    const current=structuredClone(r);let done=false;
    for(const extra of [20,35,50,70,90,120,150,200,250,300]){
      const window=Math.min(maximum,hold+extra);if(window<=hold+6)continue;
      const startPoint=sampleAt(out,hold),refSegment=near(startPoint.point),g0=refSegment.surface.gx*startPoint.tangent.x+refSegment.surface.gz*startPoint.tangent.z,finish=sampleAt(out,window),g1=finish.tangent.y??0;
      const p=profile(current,(s,point)=>{const d=end==='start'?s:L-s;if(d>=window)return point.y??0;if(d<=hold)return ref(d);return trapezoid(ref(hold),finish.point.y??0,g0,g1,window-hold,d-hold);},1);
      try{done=install(id,p,'ramp '+end+' parent '+root.id+' shared-footprint landing');if(done)break;}catch{}
    }
    if(!done)failures.push({type:'ramp',id,end,parent:root.id,terminalGap,hold,maxWindow:maximum,reason:'No <=12%/2m smooth local fit before the next protected crossing'});
  }
}

const after=scan();fs.writeFileSync(dir+'/continuation-proposed-map.json',JSON.stringify(working));
fs.writeFileSync(dir+'/continuation-repair-log.json',JSON.stringify({log,failures},null,2));
fs.writeFileSync(dir+'/continuation-proposed-scan.json',JSON.stringify(after,null,2));
console.log(JSON.stringify({initial:{raw:initial.issues.length,junction:initial.junction.issues.length,clusters:initial.clusters.length},after:{raw:after.road.issues.length,junction:after.junction.issues.length,clusters:after.clusters.length},repairs:log.length,modifiedRoads:new Set(log.filter(v=>v.id).map(v=>v.id)).size,junctions:landingIds.size,failures:failures.length},null,2));

if(process.argv.includes('--apply'))throw new Error('Inspect convergence and build final invariant-checked transaction before publishing');
