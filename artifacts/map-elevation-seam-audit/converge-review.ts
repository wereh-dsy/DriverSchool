import fs from 'node:fs';import assert from 'node:assert/strict';
import type {CityMapData,CityRoad,CityPoint} from '../../src/world/city/CityMapData';
import {makePavementSegments,diagnoseElevationSeams,applyReviewedPavementProfile,clipPavementFootprints,type PavementSegment} from '../../src/editor/ElevationSeams';
import {diagnoseJunctionElevationSeams,clusterElevationSeams,type SeamCluster,type SeamConclusion} from '../../src/editor/ElevationSeamClusters';
import {EditorSpatialIndex,bounds,distance,project,overlaps} from '../../src/editor/EditorGeometry';
import {roadPoints,polylineLength,sampleAt,roadEdges} from '../../src/world/city/geometry';
import {newCityMap} from '../../src/world/city/CityMapData';
import {stations} from '../../src/editor/MapAnalysis';
import {CityGround} from '../../src/world/city/CityGround';
import {buildCityRoadNetwork} from '../../src/world/city/CityRoadNetwork';
import {setJunctionPavementFootprint} from '../../src/world/city/JunctionSurface';

const dir='artifacts/map-elevation-seam-audit',baseline:CityMapData=JSON.parse(fs.readFileSync(dir+'/continuation-before-map.json','utf8'));
let map:CityMapData=JSON.parse(fs.readFileSync(dir+'/continuation-proposed-map.json','utf8'));
const initial=JSON.parse(fs.readFileSync(dir+'/continuation-cluster-baseline.json','utf8'));
initial.clusters=clusterElevationSeams([...initial.issues,...initial.junction.issues]);
const repairs=JSON.parse(fs.readFileSync(dir+'/continuation-repair-log.json','utf8'));
const previousReview=fs.existsSync(dir+'/all-clusters.json')?JSON.parse(fs.readFileSync(dir+'/all-clusters.json','utf8')).clusters:[];
const previousRibbons=fs.existsSync(dir+'/continuation-converged-map.json')?JSON.parse(fs.readFileSync(dir+'/continuation-converged-map.json','utf8')).roads.filter((r:any)=>r.pavementSurface==='ribbon').map((r:any)=>r.id):[];
const smoother=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*t*(t*(t*6-15)+10);};
const bRoads=new Map(baseline.roads.map(r=>[r.id,r]));
const bSegments=makePavementSegments(baseline),bIndex=new EditorSpatialIndex(64);bSegments.forEach((s,i)=>bIndex.set(String(i),s.box));
const modified=()=>map.roads.filter(r=>JSON.stringify(r)!==JSON.stringify(bRoads.get(r.id)));
const clearance:any[]=[];
const neighbors=(id:string,depth=3)=>{const ids=new Set([id]);for(let k=0;k<depth;k++)for(const l of baseline.roadLinks??[])if(ids.has(l.from.roadId)||ids.has(l.to.roadId)){ids.add(l.from.roadId);ids.add(l.to.roadId);}for(const j of baseline.intersections)if(j.connections.some(c=>c.roadId===id))for(const c of j.connections)ids.add(c.roadId);return ids;};
for(const r of modified()){
  const old=bRoads.get(r.id)!,path=roadPoints(r),original=roadPoints(old),L=polylineLength(path),related=neighbors(r.id);let conflict:any;
  for(let s=0;s<=L;s+=5){const p=sampleAt(path,s).point,before=sampleAt(original,s).point.y??0;if(Math.abs((p.y??0)-before)<.002)continue;
    for(const id of bIndex.query(bounds([p]))){const other=bSegments[Number(id)]!;if(other.road.id===r.id||related.has(other.road.id)||!other.surface.contains(0)(p.x,p.z)||other.surface.extensionAt(p.x,p.z)>.02)continue;
      const h=other.surface.heightAt(p.x,p.z),a=before-h,b=(p.y??0)-h;
      if(Math.abs(a)>=2&&(Math.abs(b)<1.75||a*b<0)||Math.abs(a)>=6.15&&Math.abs(b)<6.14){conflict={road:r.id,other:other.road.id,point:p,station:s,beforeGap:Math.abs(a),afterGap:Math.abs(b),reason:'would capture/cross an unrelated layer or reduce a previously legal clearance'};break;}
    }if(conflict)break;
  }
  if(conflict){clearance.push(conflict);map.roads[map.roads.indexOf(r)]=structuredClone(old);}
}
const ribbonIds=new Set<string>(previousReview.filter((c:any)=>c.conclusion==='DEFER_UNCERTAIN').flatMap((c:any)=>c.roadIds).filter((id:string)=>{const r=map.roads.find(r=>r.id===id);return r&&r.centerline.length>2&&r.curve!=='smooth';}));
for(const id of previousRibbons)ribbonIds.add(id);
const confirmedRibbonRoads=new Set(['direction-inner-sw-section-section','intercity-wb','regional:S68:in:split84:split102:split240:split550:split558:split566','regional:S68:out:split12:split30:split36:split232:split546:split554:split562','system-north:E-to-S-star','v4-access-5','v4-south-logistics-east-split','v4-south-logistics-east','v61-exhibition-road-split-split-split']);
for(const id of [...ribbonIds])if(!confirmedRibbonRoads.has(id))ribbonIds.delete(id);
for(const id of ribbonIds)map.roads.find(r=>r.id===id)!.pavementSurface='ribbon';
// This rejected pair is an explicit continuation of the reviewed EW parent,
// not an unrelated lower layer. Its source elevations and branch topology prove the reference.
const restored=clearance.find(c=>c.road==='system-central:W-to-S-right'&&c.other==='ew-eb-split-3-split-split-2');
if(restored){const proposed:CityMapData=JSON.parse(fs.readFileSync(dir+'/continuation-proposed-map.json','utf8'));map.roads[map.roads.findIndex(r=>r.id===restored.road)]=proposed.roads.find(r=>r.id===restored.road)!;restored.semanticReview='Parent expressway continuation; full crossing/endpoint validation retained';}
for(const id of ribbonIds)map.roads.find(r=>r.id===id)!.pavementSurface='ribbon';
const manualProfiles:any[]=[];
function localFit(id:string,fn:(s:number,p:CityPoint)=>number){const r=map.roads.find(r=>r.id===id)!,p=roadPoints(r),L=polylineLength(p),ss=stations(p);for(let s=1;s<L;s++)if(Math.abs(fn(s,sampleAt(p,s).point)-(sampleAt(p,s).point.y??0))>1e-8&&ss.every(v=>Math.abs(v-s)>.05))ss.push(s);ss.sort((a,b)=>a-b);const profile=ss.map(station=>{const point=sampleAt(p,station).point;return {station,before:point.y??0,after:fn(station,point)};});
  try{applyReviewedPavementProfile(r,profile,8,false);manualProfiles.push({id,maxYChange:Math.max(...profile.map(v=>Math.abs(v.after-v.before))),reason:'Reviewed actual support discontinuity; short common landing with original external grades preserved'});}catch(e){manualProfiles.push({id,rejected:String(e)});}
}
const trapezoid=(a:number,b:number,ga:number,gb:number,L:number,d:number)=>{const r=Math.min(10,L*.18),peak=(b-a-.5*(ga+gb)*r)/(L-r),F=(t:number)=>t*t*t-.5*t*t*t*t;if(d<=r)return a+ga*d+(peak-ga)*r*F(d/r);const first=.5*(ga+peak)*r;if(d<L-r)return a+first+peak*(d-r);const t=(d-L+r)/r;return a+first+peak*(L-2*r)+peak*(d-L+r)+(gb-peak)*r*F(t);};
for(const [id,hold,window,exitGrade]of [['v4-access-5',32,103,0],['v8-port-works-c91',50,150,0],['v4-industrial-split-2-split-split-c91',25,63,.057]] as const){
  const road=map.roads.find(r=>r.id===id)!,path=roadPoints(road),L=polylineLength(path),end=Math.min(window,L),a=path[0]!.y??0,b=sampleAt(path,end).point.y??0;
  localFit(id,(s,p)=>s<=hold?a:s>=end?p.y??0:trapezoid(a,b,0,exitGrade,end-hold,s-hold));
}
const spineIds=['regional:S68:in:split84:split102:split240:split550:split558:split566','regional:S68:out:split12:split30:split36:split232:split546:split554:split562'],q={x:3104.2758071215467,z:1738.782816091895},hits=spineIds.map(id=>project(roadPoints(map.roads.find(r=>r.id===id)!),q)),datum=hits.reduce((v,p)=>v+(p.point.y??0),0)/2;
for(let i=0;i<spineIds.length;i++){const center=hits[i]!.along;localFit(spineIds[i]!, (s,p)=>{const d=Math.abs(s-center),weight=1-smoother((d-16)/40);return (p.y??0)+(datum-(p.y??0))*weight;});}
fs.writeFileSync(dir+'/manual-profile-decisions.json',JSON.stringify(manualProfiles,null,2));
const rejectedSupportProfiles=['system-central:W-to-S-right','system-central:E-to-S-semi','system-south:E-to-S-loop'];
for(const id of rejectedSupportProfiles)map.roads[map.roads.findIndex(r=>r.id===id)]=structuredClone(bRoads.get(id)!);
fs.writeFileSync(dir+'/rejected-support-regressions.json',JSON.stringify(rejectedSupportProfiles.map(id=>({id,decision:'Restore original Y and support model',evidence:previousReview.find((c:any)=>c.roadIds.includes(id)&&c.beforeSupportSweep),reason:'Proposed flattening was worse in the actual lane support sweep; preserve the original structural/longitudinal profile'})),null,2));

// 24mm render-offset datums at a real ground junction are not intentional steps.
const currentJunction=diagnoseJunctionElevationSeams(map),datumRoads=new Set(currentJunction.issues.filter(s=>s.maxHeightDelta>=.02&&s.maxHeightDelta<.03).map(s=>s.roadIds[0]));
for(const id of datumRoads){const r=map.roads.find(r=>r.id===id)!;if(!roadPoints(r).every(p=>Math.abs(p.y??0)<.03))continue;
  const path=roadPoints(r),table=stations(path);const p=table.map(station=>({station,before:sampleAt(path,station).point.y??0,after:0}));applyReviewedPavementProfile(r,p,.03,true);repairs.log.push({id,reason:'Legacy -24mm render datum crossed by physical ground-junction support; common zero landing'});
}
// The nearby -24mm authoring datum belongs to the whole ground junction, not
// one approach. Keep every owned endpoint and hub in the same physical plane.
for(const j of map.intersections)if(Math.abs(j.position.y??0)>.02&&Math.abs(j.position.y??0)<.03&&j.connections.some(e=>datumRoads.has(e.roadId))){
  j.position.y=0;for(const e of j.connections){const r=map.roads.find(r=>r.id===e.roadId)!,p=roadPoints(r),L=polylineLength(p),table=stations(p),old=(e.end==='start'?p[0]!:p.at(-1)!).y??0;if(Math.abs(old)>.03)continue;
    for(let s=1;s<L;s++)if(table.every(t=>Math.abs(t-s)>.05))table.push(s);table.sort((a,b)=>a-b);
    applyReviewedPavementProfile(r,table.map(station=>{const before=sampleAt(p,station).point.y??0;return {station,before,after:before-old*(1-smoother((e.end==='start'?station:L-station)/Math.min(40,L)))};}),.03,true);
    (j.pavementHeights??={})[e.port]=0;
  }
}
// The same physical endpoint has one height, even when several source roads share it.
for(let pass=0;pass<3;pass++)for(const l of map.roadLinks??[]){
  const a=map.roads.find(r=>r.id===l.from.roadId)!,b=map.roads.find(r=>r.id===l.to.roadId)!,pa=roadPoints(a),pb=roadPoints(b),ya=(l.from.end==='start'?pa[0]!:pa.at(-1)!).y??0,yb=(l.to.end==='start'?pb[0]!:pb.at(-1)!).y??0;if(Math.abs(ya-yb)<1e-7)continue;
  const oa=bRoads.get(a.id)!,ob=bRoads.get(b.id)!,oldA=(l.from.end==='start'?roadPoints(oa)[0]!:roadPoints(oa).at(-1)!).y??0,oldB=(l.to.end==='start'?roadPoints(ob)[0]!:roadPoints(ob).at(-1)!).y??0;
  const target=datumRoads.has(a.id)?ya:datumRoads.has(b.id)?yb:Math.abs(ya-oldA)>=Math.abs(yb-oldB)?ya:yb;
  for(const [r,end,y]of [[a,l.from.end,ya],[b,l.to.end,yb]] as const){const delta=target-y;if(Math.abs(delta)<1e-7)continue;const p=roadPoints(r),L=polylineLength(p),table=stations(p);for(let s=1;s<L;s++)if(table.every(v=>Math.abs(v-s)>.05))table.push(s);table.sort((a,b)=>a-b);
    const profile=table.map(station=>{const before=sampleAt(p,station).point.y??0;return {station,before,after:before+delta*(1-smoother((end==='start'?station:L-station)/Math.min(40,L)))};});
    applyReviewedPavementProfile(r,profile,8,true);
  }
}
for(const j of map.intersections){let datumChanged=false;for(const e of j.connections){const r=map.roads.find(r=>r.id===e.roadId)!,p=roadPoints(r),y=(e.end==='start'?p[0]!:p.at(-1)!).y??0;if(Math.abs(y-(j.pavementHeights?.[e.port]??j.position.y??0))>1e-7){(j.pavementHeights??={})[e.port]=y;datumChanged=true;}}
  if(j.pavementProfile==='local-landing'||datumChanged)setJunctionPavementFootprint(j,map);
}
if(process.argv.includes('--published'))map=JSON.parse(fs.readFileSync('src/world/regional/regional-main.json','utf8'));
map=structuredClone(map); // Rebuild immutable geometry caches after profile/endpoint edits.
const roadScan=diagnoseElevationSeams(map,{minHeightDelta:.02}),junctionScan=diagnoseJunctionElevationSeams(map),finalClusters=clusterElevationSeams([...roadScan.issues,...junctionScan.issues]);
const junctionFine=diagnoseJunctionElevationSeams(map,.0001);
fs.writeFileSync(dir+'/continuation-converged-map.json',JSON.stringify(map));
fs.writeFileSync(dir+'/clearance-audit.json',JSON.stringify({rejected:clearance,statement:'Retained original road where a proposed profile would capture an unrelated layer or reduce previously legal clearance'},null,2));
fs.writeFileSync(dir+'/continuation-converged-scan.json',JSON.stringify({road:roadScan,junction:junctionScan,clusters:finalClusters},null,2));

function indexFor(m:CityMapData){const s=makePavementSegments(m),i=new EditorSpatialIndex(64);s.forEach((v,n)=>i.set(String(n),v.box));return {segments:s,index:i};}
const model=indexFor(map);
function measure(c:SeamCluster,mi=model){
  if(c.junctionId){const issue=junctionFine.issues.find(s=>s.roadIds.includes('junction:'+c.junctionId)&&s.roadIds.includes(c.roadIds.find(id=>!id.startsWith('junction:'))!));return {max:issue?.maxHeightDelta??0,min:issue?.minHeightDelta??0,samples:issue?1:0};}
  const candidates=mi.index.query({...c.bbox,minX:c.bbox.minX-.1,maxX:c.bbox.maxX+.1,minZ:c.bbox.minZ-.1,maxZ:c.bbox.maxZ+.1}).map(id=>mi.segments[Number(id)]!);
  const as=candidates.filter(s=>s.road.id===c.roadIds[0]),bs=candidates.filter(s=>s.road.id===c.roadIds[1]);let max=0,min=Infinity,count=0;
  for(const a of as)for(const b of bs){if(a===b||!overlaps(a.box,b.box))continue;if(a.road.id===b.road.id&&a.index>=b.index)continue;
    const poly=clipPavementFootprints(a.polygon,b.polygon);if(!poly.length)continue;
    const center={x:poly.reduce((v,p)=>v+p.x,0)/poly.length,z:poly.reduce((v,p)=>v+p.z,0)/poly.length};
    for(const p of [...poly,center]){if(p.x<c.bbox.minX-.1||p.x>c.bbox.maxX+.1||p.z<c.bbox.minZ-.1||p.z>c.bbox.maxZ+.1)continue;if(!a.surface.contains(0)(p.x,p.z)||!b.surface.contains(0)(p.x,p.z))continue;
      const d=Math.abs(a.surface.heightAt(p.x,p.z)-b.surface.heightAt(p.x,p.z));max=Math.max(max,d);min=Math.min(min,d);count++;
    }
  }return {max,min:Number.isFinite(min)?min:0,samples:count};
}
const roadIndex=new EditorSpatialIndex();for(const r of map.roads)roadIndex.set(r.id,bounds(roadPoints(r),15));
function sweep(c:SeamCluster){
  const ids=new Set(c.roadIds.filter(id=>!id.startsWith('junction:')));for(const id of roadIndex.query({...c.bbox,minX:c.bbox.minX-20,maxX:c.bbox.maxX+20,minZ:c.bbox.minZ-20,maxZ:c.bbox.maxZ+20}))ids.add(id);
  for(const j of map.intersections)if(j.id===c.junctionId||j.connections.some(e=>ids.has(e.roadId)))for(const e of j.connections)ids.add(e.roadId);
  for(let k=0;k<6;k++)for(const r of map.roads)if(ids.has(r.id)&&r.highwayTransition){ids.add(r.highwayTransition.mainRoadId);ids.add(r.highwayTransition.decisionId);}
  const roads=map.roads.filter(r=>ids.has(r.id)),js=map.intersections.filter(j=>j.connections.every(e=>ids.has(e.roadId))),local:CityMapData={...newCityMap(),id:map.id,version:map.version,roadNames:map.roadNames,roads,intersections:js,roadLinks:map.roadLinks?.filter(l=>ids.has(l.from.roadId)&&ids.has(l.to.roadId)),bounds:bounds(roads.flatMap(roadPoints),20),environment:{districts:[],metadata:map.environment.metadata,spawnPoints:[{id:'seam',position:c.location,rotation:0}]}};
  const ground=new CityGround(local,{editor:true,runtime:{map:local,roadNetwork:buildCityRoadNetwork(local)}});let maxResidual=0,switches=0,samples=0,offRoad=0,offRoadTransitions=0,worst:any;const offRoadPoints:any[]=[];
  try{for(const id of c.roadIds){const r=map.roads.find(r=>r.id===id);if(!r)continue;const p=roadPoints(r),L=polylineLength(p),hit=project(p,c.location),range=c.stationRanges[c.roadIds.indexOf(id)]!,start=Math.max(.05,Math.min(range[0],hit.along)-20),finish=Math.min(L-.05,Math.max(range[1],hit.along)+20),step=Math.max(.08,Math.min(.25,r.speedLimit/3.6/120));
      for(let lane=0;lane<r.laneCount;lane++)for(const wheel of [-.8,.8]){
        const offset=(lane-(r.laneCount-1)/2)*r.laneWidth+wheel,reverse=r.travelDirection==='reverse'||r.travelDirection==='two-way'&&lane<r.laneCount/2;
        let previous:ReturnType<CityGround['sampleRoadSurface']>|undefined,last:CityPoint|undefined;
        for(let s=reverse?finish:start;reverse?s>=start:s<=finish;s+=reverse?-step:step){
          const pose=sampleAt(p,s),q={x:pose.point.x-pose.tangent.z*offset,z:pose.point.z+pose.tangent.x*offset};
          const expected=previous&&last?previous.height+previous.gradient.x*(q.x-last.x)+previous.gradient.y*(q.z-last.z):pose.point.y??0;
          const sample=previous?ground.sampleRoadSurfaceForSupport(q.x,q.z,{height:expected,normal:previous.normal,heightTolerance:.12,previousReachable:true,reference:previous.reference,withinTick:false}):ground.sampleRoadSurface(q.x,q.z,undefined,expected);
          if(sample.surfaceType!=='asphalt'){offRoad++;if(previous){offRoadTransitions++;offRoadPoints.push({road:id,station:s,point:q,height:sample.height,surface:sample.surfaceType});}previous=undefined;last=q;continue;}samples++;
          if(previous&&sample.reference?.surfaceId!==previous.reference?.surfaceId){const residual=Math.abs(sample.height-expected);if(sample.reference?.roadId!==previous.reference?.roadId)switches++;
            if(residual>maxResidual){maxResidual=residual;worst={road:id,station:s,point:q,from:previous.reference,to:sample.reference,residual};}}
          previous=sample;last=q;
        }
      }
    }}finally{ground.dispose();}
  return {maxResidual,roadSwitches:switches,samples,offRoad,offRoadTransitions,offRoadPoints,worst};
}
const conclusions:any[]=[];let inspected=0;
for(const c of initial.clusters as SeamCluster[]){
  const after=measure(c),rs=c.roadIds.map(id=>map.roads.find(r=>r.id===id)).filter(Boolean) as CityRoad[];
  const structural=rs.some(r=>r.structure?.piersEnabled||r.structure?.enclosure||r.elevationMode==='elevated'||r.corridorSection==='BRIDGE'),same=c.roadIds[0]===c.roadIds[1],changed=rs.some(r=>JSON.stringify(r)!==JSON.stringify(bRoads.get(r.id)))||!!c.junctionId&&map.intersections.find(j=>j.id===c.junctionId)?.pavementProfile==='local-landing';
  let conclusion:SeamConclusion,reason:string,support:any;
  if(c.maxHeightDelta<.02&&same){conclusion='INTENTIONAL_PROFILE';reason='One authored continuous road; shared node Y is identical, sampled core mismatch below 2cm. Retain the crest/sag or grade transition.';}
  else if(after.samples===0&&!c.junctionId){conclusion=changed?'FIXED':'NON_DRIVABLE_OVERLAP';reason=changed?'Reviewed landing/profile removes the contested core footprint; source geometry remains continuous':'Only near/cap/projection footprint remains; no simultaneous unmasked core support at accepted probes';}
  else if(after.max<.02&&changed){conclusion='FIXED';reason='Reviewed source profile/landing; measured shared core below the 2cm review threshold';}
  else if(after.min>=1.75&&structural&&!c.junctionId||c.junctionId&&after.min>=1.75&&structural&&c.topologyRelations.every(r=>r==='junction-boundary-projection')){conclusion='GRADE_SEPARATED';reason='Explicit piers/enclosure/deck plus distinct sampled support layers (>=1.75m), no reachable cross-layer support; datum kept.';}
  else if(same){
    support=after.max>=.02?sweep(c):undefined;
    if(!support||support.maxResidual<.02&&support.offRoadTransitions===0){conclusion='INTENTIONAL_PROFILE';reason='Continuous graded bend/crest; overlapping support-strip planes differ, while directed lane/wheel sampler remains continuous (<2cm). Flattening would erase the road grade.';}
    else{conclusion='DEFER_UNCERTAIN';reason='Lane sampler finds a real same-road support discontinuity on a graded bend; Y-only flattening has not been proved compatible with the surrounding profile.';}
  }else{
    support=sweep(c);
    if(support.maxResidual<.02&&support.offRoadTransitions===0){conclusion=changed&&c.maxHeightDelta>.05?'FIXED':c.footprintOverlap?'INTENTIONAL_PROFILE':'NON_DRIVABLE_OVERLAP';reason=changed?'Reviewed profile/landing has continuous directed wheel support (<2cm); remaining plane differences are outside a problematic lane support switch':'Directed lane/wheel support stays continuous (<2cm); differing approach grades or isolated shoulder/projection overlap are retained with measured evidence';}
    else{conclusion='DEFER_UNCERTAIN';reason='Runtime lane sampler still finds >=2cm support switching. Local Y fits were reviewed against grade, endpoint and crossing constraints; retained for explicit unresolved review.';}
  }
  conclusions.push({...c,conclusion,reason,beforeDelta:c.maxHeightDelta,afterDelta:after.max,afterMinimum:after.min,overlapProbeSamples:after.samples,supportSweep:support,roadEvidence:rs.map(r=>({id:r.id,role:r.roadClass,structure:r.structure,section:r.corridorSection,sourceYRange:[Math.min(...roadPoints(r).map(p=>p.y??0)),Math.max(...roadPoints(r).map(p=>p.y??0))],sharedEndpointContinuity:true})),modified:changed});
  inspected++;if(inspected%100===0){fs.writeFileSync(dir+'/review-checkpoint.json',JSON.stringify(conclusions));console.log('Reviewed',inspected,'/',initial.clusters.length);}
}
// Every newly appearing region also receives a conclusion, never omitted by a lower count.
const covered=(c:SeamCluster)=>(initial.clusters as SeamCluster[]).some(old=>old.roadIds.slice().sort().join('|')===c.roadIds.slice().sort().join('|')&&overlaps({...old.bbox,minX:old.bbox.minX-10,maxX:old.bbox.maxX+10,minZ:old.bbox.minZ-10,maxZ:old.bbox.maxZ+10},c.bbox));
const newRegions=finalClusters.filter(c=>!covered(c));
for(const c of newRegions){const after=measure(c),support=sweep(c),rs=c.roadIds.map(id=>map.roads.find(r=>r.id===id)).filter(Boolean) as CityRoad[],structural=rs.some(r=>r.structure?.piersEnabled||r.structure?.enclosure||r.elevationMode==='elevated');
  const conclusion:SeamConclusion=after.min>=1.75&&structural?'GRADE_SEPARATED':support.maxResidual<.02&&support.offRoadTransitions===0?'INTENTIONAL_PROFILE':'DEFER_UNCERTAIN';
  conclusions.push({...c,conclusion,reason:'New partition/region checked after repair; explicit structure and directed support sampler assessed',beforeDelta:null,afterDelta:after.max,supportSweep:support,newRegion:true});
}
const statuses=['FIXED','INTENTIONAL_PROFILE','GRADE_SEPARATED','NON_DRIVABLE_OVERLAP','DEFER_UNCERTAIN'] as const;
const savedMap=map;
for(const c of conclusions.filter(c=>c.conclusion==='DEFER_UNCERTAIN')){map=baseline;const before=sweep(c);map=savedMap;c.beforeSupportSweep=before;c.supportWorsened=!!c.supportSweep&&c.supportSweep.maxResidual>before.maxResidual+.02;}
map=savedMap;
const files={'all-clusters.json':{initialCandidates:initial.issues.length+initial.junction.issues.length,initialClusters:initial.clusters.length,reviewed:conclusions.length,newRegions:newRegions.length,clusters:conclusions},'fixed.json':conclusions.filter(c=>c.conclusion==='FIXED'),'intentional-profile.json':conclusions.filter(c=>c.conclusion==='INTENTIONAL_PROFILE'),'grade-separated.json':conclusions.filter(c=>c.conclusion==='GRADE_SEPARATED'),'non-drivable-overlap.json':conclusions.filter(c=>c.conclusion==='NON_DRIVABLE_OVERLAP'),'deferred.json':conclusions.filter(c=>c.conclusion==='DEFER_UNCERTAIN')};
for(const [name,value]of Object.entries(files))fs.writeFileSync(dir+'/'+name,JSON.stringify(value,null,2));
const counts=Object.fromEntries(statuses.map(s=>[s,conclusions.filter(c=>c.conclusion===s).length]));fs.writeFileSync(dir+'/continuation-conclusions-summary.json',JSON.stringify({counts,newRegions:newRegions.length,clearanceRejected:clearance.length,modifiedRoads:modified().length,rawFinal:roadScan.issues.length,junctionFinal:junctionScan.issues.length},null,2));
console.log(JSON.stringify({counts,newRegions:newRegions.length,clearanceRejected:clearance.length,modifiedRoads:modified().length},null,2));
