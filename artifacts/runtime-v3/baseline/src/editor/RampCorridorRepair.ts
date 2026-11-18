import type {CityMapData,CityRoad} from '../world/city/CityMapData';
import {roadPoints,sampleAt,roadEdges} from '../world/city/geometry';
import {roadFunction} from '../world/city/RoadClassification';
import {bounds,distance,project,overlaps} from './EditorGeometry';
import {stations} from './MapAnalysis';
import {compactRampProfile,fitRampProfile,rampProfile,rampOverlaps,type RampOverlap} from './RampProfileAudit';
import {applyReviewedPavementProfile} from './ElevationSeams';

export function corridorLocalMap(map:CityMapData,road:CityRoad):CityMapData {
  const area=bounds(roadPoints(road),35),ids=new Set(map.roads.filter(r=>r.id===road.id||overlaps(bounds(roadPoints(r),Math.max(-roadEdges(r).left,roadEdges(r).right)),area)).map(r=>r.id));
  for(const l of map.roadLinks??[])if(ids.has(l.from.roadId)||ids.has(l.to.roadId)){ids.add(l.from.roadId);ids.add(l.to.roadId);}
  for(const j of map.intersections)if(j.connections.some(c=>ids.has(c.roadId)))for(const c of j.connections)ids.add(c.roadId);
  return {...map,roads:map.roads.filter(r=>ids.has(r.id)).map(r=>r.id===road.id?road:r),roadLinks:map.roadLinks?.filter(l=>ids.has(l.from.roadId)&&ids.has(l.to.roadId)),intersections:map.intersections.filter(j=>j.connections.every(c=>ids.has(c.roadId))),objects:[],signs:[]};
}
export interface CorridorFitOptions {scale?:number; lateralOffset?:number; offsetRange?:[number,number]; offsetPlateau?:[number,number]; geometryOnly?:boolean; clearanceTarget?:number; clearanceMargin?:number; templateDatums?:boolean}
export function fitCorridorRoad(map:CityMapData,id:string,sourceOverlaps:readonly RampOverlap[],options:CorridorFitOptions={}) {
  const original=map.roads.find(r=>r.id===id);if(!original)throw new Error('Missing corridor road');
  if(original.curve==='smooth')throw new Error('Authored smooth alignment requires a separate local geometry design');
  const road=structuredClone(original),originalPath=roadPoints(original),originalStations=stations(originalPath),originalLength=originalStations.at(-1)!,offset=options.lateralOffset??0;
  if(offset){if(roadFunction(road)!=='ramp')throw new Error('Lateral correction is limited to ramp branches');const range=options.offsetRange??[7,originalLength-7];if(range[0]<7||range[1]>originalLength-7||range[1]-range[0]<30)throw new Error('Horizontal correction must retain the endpoint mouths');const requested=options.offsetPlateau,plateau=requested?[Math.max(range[0]+20,Math.min(range[1]-20,requested[0])),Math.max(range[0]+20,Math.min(range[1]-20,requested[1]))]:undefined;road.centerline=road.centerline.map((p,i)=>{const s=originalStations[i]!;if(s<=range[0]||s>=range[1])return {...p};const t=(s-range[0])/(range[1]-range[0]),a=sampleAt(originalPath,Math.max(0,s-4)).point,b=sampleAt(originalPath,Math.min(originalLength,s+4)).point,norm=Math.hypot(b.x-a.x,b.z-a.z),tangent={x:(b.x-a.x)/norm,z:(b.z-a.z)/norm},u=plateau?Math.max(0,Math.min(1,s<plateau[0]!?(s-range[0])/(plateau[0]!-range[0]):s>plateau[1]!?(range[1]-s)/(range[1]-plateau[1]!):1)):0,shift=offset*(plateau?u*u*u*(10+u*(-15+6*u)):Math.sin(Math.PI*t)**2);return {...p,x:p.x-tangent.z*shift,z:p.z+tangent.x*shift};});}
  if(offset&&road.centerline.some((p,i)=>i>0&&distance(p,road.centerline[i-1]!)<.05))throw new Error('Horizontal correction creates a sub-5cm segment');
  if(options.geometryOnly){const before=rampProfile(original);road.pavementSurface='ribbon';return {road,profile:originalStations.map((station,i)=>({station,before:originalPath[i]!.y??0,after:originalPath[i]!.y??0})),before,after:rampProfile(road),maxY:0,maxXZ:Math.abs(offset),requiredGrade:0,shared:[],constraints:[],datumEvidence:[]};}
  const path=roadPoints(road),table=stations(path),length=table.at(-1)!,local=corridorLocalMap(map,road),own=offset?rampOverlaps(local).filter(o=>o.roadIds.includes(id)):sourceOverlaps.filter(o=>o.roadIds.includes(id));
  const roads=new Map(map.roads.map(r=>[r.id,r])),parents=new Set<string>(),adj=new Map<string,Set<string>>();
  for(const l of map.roadLinks??[])for(const [a,b]of [[l.from.roadId,l.to.roadId],[l.to.roadId,l.from.roadId]]){const set=adj.get(a!)??new Set<string>();set.add(b!);adj.set(a!,set);}
  let frontier=[id];const walked=new Set([id]);
  for(let depth=0;depth<3;depth++){const next:string[]=[];for(const key of frontier)for(const other of adj.get(key)??[]){if(walked.has(other))continue;walked.add(other);const r=roads.get(other)!;if(roadFunction(r)!=='ramp')parents.add(other);else if(r.highwayTransition){parents.add(r.highwayTransition.mainRoadId);next.push(other);}}frontier=next;}
  // Complete receiving road sections, including mainline lane fragments.
  frontier=[...parents];for(let depth=0;depth<4;depth++){const next:string[]=[];for(const key of frontier){const seed=roads.get(key);if(!seed)continue;for(const other of adj.get(key)??[]){const r=roads.get(other)!;if(!parents.has(other)&&roadFunction(r)===roadFunction(seed)&&r.roadNameId===seed.roadNameId){parents.add(other);next.push(other);}}}frontier=next;}
  // Some existing access mouths end in a junction-owned interior section.
  for(const j of map.intersections)if(j.connections.some(c=>c.roadId===id))for(const c of j.connections)if(c.roadId!==id)parents.add(c.roadId);
  const possible=own.filter(o=>{const k=o.roadIds[0]===id?0:1;return o.roadIds[0]!==o.roadIds[1]&&parents.has(o.roadIds[1-k]!)&&o.alignment>.75&&o.area>.05&&(o.stationRanges[k][0]<Math.min(250,length*.4)||o.stationRanges[k][1]>length-Math.min(250,length*.4));});
  const shared:RampOverlap[]=[];let first=0,last=length,changed=true;while(changed){changed=false;for(const o of possible){if(shared.includes(o))continue;const r=o.stationRanges[o.roadIds[0]===id?0:1];if(r[0]<first+12){first=Math.max(first,r[1]);shared.push(o);changed=true;}else if(r[1]>last-12){last=Math.min(last,r[0]);shared.push(o);changed=true;}}}
  const positions=[...table];const insert=(s:number)=>{if(s>=0&&s<=length&&!positions.some(t=>Math.abs(t-s)<.06))positions.push(s);};for(let s=3;s<length;s+=3)insert(s);insert(1);insert(length-1);for(const o of own)if(o.roadIds[0]!==o.roadIds[1])for(const s of o.stationRanges[o.roadIds[0]===id?0:1])insert(s);positions.sort((a,b)=>a-b);
  const points=positions.map(s=>sampleAt(path,s).point),ys=points.map(p=>p.y??0),fixed=new Map<number,number>([[0,ys[0]!],[ys.length-1,ys.at(-1)!]]),lower=ys.map(()=>-50),upper=ys.map(()=>100),conflicts:{station:number;first:number;second:number;reason:string}[]=[];
  const pin=(i:number,y:number,reason:string)=>{if(fixed.has(i)&&Math.abs(fixed.get(i)!-y)>.02){conflicts.push({station:positions[i]!,first:fixed.get(i)!,second:y,reason});return;}fixed.set(i,y);};
  for(let i=1;i<ys.length-1;i++){
    const choices=shared.flatMap(o=>{const k=o.roadIds[0]===id?0:1,r=o.stationRanges[k];if(positions[i]!<r[0]-4||positions[i]!>r[1]+4)return [];const parent=roads.get(o.roadIds[1-k]!)!,hit=project(roadPoints(parent),points[i]!);return [{roadId:parent.id,...hit}];}).sort((a,b)=>a.distance-b.distance);
    if(choices.length)pin(i,choices[0]!.point.y??0,'shared:'+choices[0]!.roadId);
  }
  for(const j of map.intersections)for(const c of j.connections)if(c.roadId===id)for(let i=1;i<ys.length-1;i++)if(c.end==='start'?positions[i]!<8:length-positions[i]!<8)pin(i,ys[i]!,'junction mouth');
  const constraints:{otherRoadId:string;kind:string;stationRange:number[];requiredGap:number}[]=[],datumEvidence:{otherRoadId:string;ownDatum:number;otherDatum:number;gap:number;ownFlatStation:number;otherFlatStation:number}[]=[];
  for(const o of own){if(o.roadIds[0]===o.roadIds[1]||shared.includes(o))continue;const k=o.roadIds[0]===id?0:1,otherId=o.roadIds[1-k]!,other=roads.get(otherId)!;
    if(o.maxGap<.05){for(let i=1;i<ys.length-1;i++)if(!fixed.has(i)&&positions[i]!>=o.stationRanges[k][0]-3&&positions[i]!<=o.stationRanges[k][1]+3)pin(i,ys[i]!,'existing continuous shared pavement');continue;}
    if(o.minGap<2.5)continue;
    const indices=positions.flatMap((s,i)=>s>=o.stationRanges[k][0]-2&&s<=o.stationRanges[k][1]+2?[i]:[]);if(!indices.length)continue;
    const sign=(o.signedMin>0?1:-1)*(k===0?1:-1),otherPath=roadPoints(other),estimated=indices.map(i=>sign*(ys[i]!-(project(otherPath,points[i]!).point.y??0))),estimatedMin=Math.min(...estimated);
    let datum:typeof datumEvidence[number]|undefined;
    if(options.templateDatums&&o.minGap>=3.5&&o.maxGap<=7.5){
      const flat=(p:ReturnType<typeof roadPoints>,range:number[])=>{const s=stations(p),center=(range[0]!+range[1]!)/2;return p.slice(1).flatMap((v,i)=>Math.abs(((v.y??0)-(p[i]!.y??0))/Math.max(.001,s[i+1]!-s[i]!))<.0005&&Math.abs((s[i+1]!+s[i]!)/2-center)<120?[{height:((v.y??0)+(p[i]!.y??0))/2,station:(s[i+1]!+s[i]!)/2}]:[]);};
      const ownFlat=flat(path,o.stationRanges[k]),otherFlat=flat(otherPath,o.stationRanges[1-k]!),center=sampleAt(path,(o.stationRanges[k][0]+o.stationRanges[k][1])/2).point,otherCenter=project(otherPath,center).point;
      const choices=ownFlat.flatMap(a=>otherFlat.filter(b=>Math.abs(sign*(a.height-b.height)-6)<.005&&Math.abs(a.height-(center.y??0))+Math.abs(b.height-(otherCenter.y??0))<2.5).map(b=>({otherRoadId:otherId,ownDatum:a.height,otherDatum:b.height,gap:6,ownFlatStation:a.station,otherFlatStation:b.station}))).sort((a,b)=>Math.abs(a.ownDatum-(center.y??0))+Math.abs(a.otherDatum-(otherCenter.y??0))-Math.abs(b.ownDatum-(center.y??0))-Math.abs(b.otherDatum-(otherCenter.y??0)));
      datum=choices[0];if(datum){datumEvidence.push(datum);for(const i of indices)pin(i,datum.ownDatum,'existing 6m structure datum:'+otherId);}
    }
    const template=o.maxGap-o.minGap<.03&&o.minGap>=5.65,required=Math.max(o.minGap,datum?6:template?o.minGap:options.clearanceTarget??6.15),extra=required-o.minGap+(template||datum?0:options.clearanceMargin??.012);
    for(let j=0;j<indices.length;j++){const i=indices[j]!,delta=extra+estimatedMin-estimated[j]!;if(sign>0)lower[i]=Math.max(lower[i]!,ys[i]!+delta);else upper[i]=Math.min(upper[i]!,ys[i]!-delta);}
    constraints.push({otherRoadId:otherId,kind:sign>0?'over':'under',stationRange:o.stationRanges[k],requiredGap:required});
  }
  for(const end of ['start','end'] as const){const p=end==='start'?path[0]!:path.at(-1)!,neighbours=(map.roadLinks??[]).flatMap(l=>l.from.roadId===id&&l.from.end===end?[l.to]:l.to.roadId===id&&l.to.end===end?[l.from]:[]).map(e=>({e,road:roads.get(e.roadId)!})).sort((a,b)=>+(roadFunction(a.road)==='ramp')-+(roadFunction(b.road)==='ramp'));
    if(!neighbours.length)continue;const {e,road:parent}=neighbours[0]!,pp=roadPoints(parent),pt=e.end==='start'?pp[0]!:pp.at(-1)!,inner=e.end==='start'?pp[1]!:pp.at(-2)!;
    if(distance(p,pt)>.2)continue;const grade=((inner.y??0)-(pt.y??0))/Math.max(.001,distance(inner,pt))*(end==='start'?-1:1),i=end==='start'?1:ys.length-2,target=(p.y??0)+(end==='start'?1:-1)*grade*(end==='start'?positions[i]!:length-positions[i]!);if(!fixed.has(i))pin(i,target,'endpoint tangent');
  }
  if(conflicts.length)throw new Error('Incompatible shared/endpoint heights: '+JSON.stringify(conflicts.slice(0,4)));
  const incompatible=lower.flatMap((v,i)=>v>upper[i]!+1e-8?[{station:positions[i],lower:v,upper:upper[i],crossingRoads:constraints.filter(c=>positions[i]!>=c.stationRange[0]!-2&&positions[i]!<=c.stationRange[1]!+2).map(c=>c.otherRoadId)}]:[]);if(incompatible.length)throw new Error('Incompatible crossing envelopes: '+JSON.stringify(incompatible.slice(0,4)));
  const anchors=[...fixed].sort((a,b)=>a[0]-b[0]);let requiredGrade=0;for(let i=1;i<anchors.length;i++)requiredGrade=Math.max(requiredGrade,Math.abs(anchors[i]![1]-anchors[i-1]![1])/(positions[anchors[i]![0]]!-positions[anchors[i-1]![0]]!));
  if(requiredGrade>.122)throw new Error('Shared/endpoint anchors require at least '+requiredGrade.toFixed(4)+' grade; source length '+length.toFixed(2));
  const fit=fitRampProfile(positions,ys,fixed,options.scale??20,{lower,upper}),profile=compactRampProfile(positions.map((station,i)=>({station,before:ys[i]!,after:fit[i]!})),table),target=structuredClone(road);
  applyReviewedPavementProfile(target,profile,8);const prior=rampProfile(original),fresh=rampProfile(target);
  if(fresh.maxGrade>Math.max(.12,prior.maxGrade)+.001)throw new Error('Fit exceeds unchanged grade limit: '+fresh.maxGrade.toFixed(4));
  if(fresh.maxGradeBreak>Math.max(.04,prior.maxGradeBreak)+.001)throw new Error('Fit worsens grade discontinuity: '+fresh.maxGradeBreak.toFixed(4));
  if(prior.maxGrade>.001&&prior.minRadius!==null)target.pavementSurface='ribbon';
  return {road:target,profile,before:prior,after:rampProfile(target),maxY:Math.max(...fit.map((y,i)=>Math.abs(y-ys[i]!))),maxXZ:Math.abs(offset),requiredGrade,shared:shared.map(o=>({roadIds:o.roadIds,ranges:o.stationRanges})),constraints,datumEvidence};
}
