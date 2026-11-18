import { CatmullRomCurve3, Vector3 } from 'three';
import type { CityMapData, CityPoint, CityRoad } from '../CityMapData';
import { loadCityMap } from '../CityMapLoader';
import { createRoad,connectRoad } from '../MapAPI';
import { roadPoints, polylineLength, sampleAt, syncConnections } from '../geometry';
import { connectUrbanSkeleton, trimCityJunctionApproaches } from './CityMainUrbanConnections';
import { setJunctionPavementFootprint } from '../JunctionSurface';
import { populateIntersectionMarkingMetadata } from '../MarkingOwnership';
import { generateTopologySigns } from '../SignPlacementGenerator';
import { cleanRoadsidePlacements } from '../RoadsidePlacement';
import {ease} from '../presets/BackbonePresets';
import {cityV4LockedRoad} from './CityMainV4Recipe';
import {crossingDistance} from '../presets/CompactInterchangePresets';
import {junctionExtent} from '../geometry';
import {repairCityMainGroundElevation} from './CityMainGroundElevation';

/** V5 keeps all infrastructure and the established ordinary axes as its input. */
export const cityV5FrozenRoad = (r:CityRoad) => cityV4LockedRoad(r)||r.type==='highway'||r.type==='ramp_1'||!!r.structure?.enclosure||r.id.startsWith('urban-direct-');
type XZ = [number,number];
function sampled(nodes:CityPoint[]):CityPoint[] {
 const result:CityPoint[]=[];
 for(let i=1;i<nodes.length;i++) {const a=nodes[i-1]!,b=nodes[i]!,n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/5));for(let k=0;k<n;k++){const t=k/n;result.push({x:a.x+(b.x-a.x)*t,y:(a.y??0)+((b.y??0)-(a.y??0))*t,z:a.z+(b.z-a.z)*t});}}
 result.push({...nodes.at(-1)!});return result;
}
export function buildCityMainV5(source:unknown):CityMapData {
 const original=loadCityMap(source),map=structuredClone(original);
 if(original.environment.metadata?.junctionGeometryVersion!=='4.1'||original.environment.metadata?.urbanSkeletonVersion==='5')throw new Error('V5 requires the immutable V4.1 baseline');
 const frozen=new Set(original.roads.filter(cityV5FrozenRoad).map(r=>r.id));
 const ordinary=map.roads.filter(r=>!frozen.has(r.id));
 const oldJs=new Set(map.intersections.map(j=>j.id));
 for(const r of ordinary){r.roadLevel=r.laneCount>=6?1:r.laneCount>=4?2:3;
  if(r.roadNameId!=='inner-boulevard')continue;
  const p=roadPoints(r),len=polylineLength(p),margin=Math.min(45,len*.2),a=sampleAt(p,margin).point,b=sampleAt(p,len-margin).point;
  if(len>180)r.centerline=p.map((q,i)=>{let d=0;for(let k=1;k<=i;k++)d+=Math.hypot(p[k]!.x-p[k-1]!.x,p[k]!.z-p[k-1]!.z);const t=(d-margin)/(len-2*margin);if(t<=0||t>=1)return q;const blend=ease(Math.min(t,1-t)*8);return{...q,x:q.x+(a.x+(b.x-a.x)*t-q.x)*blend,z:q.z+(a.z+(b.z-a.z)*t-q.z)*blend};});
  const mid=sampleAt(r.centerline,polylineLength(r.centerline)/2).point,sector=Math.floor(((Math.atan2(mid.z/700,mid.x/1000)+Math.PI*2)%(Math.PI*2))/(Math.PI/3));r.corridorSection='inner-sector-'+sector;
 }
 const paths=ordinary.map(r=>({r,points:roadPoints(r)}));
 // Legacy V4.1 construction levels preserve horizontal junction matching while
 // assembling the network. They are never the final physical road profile:
 // the completed graph is grounded below, with local decks only at real crossings.
 const nearest=(p:CityPoint,filter=(_r:CityRoad)=>true)=>{
  let best=Infinity,q={...p,y:0},road=ordinary[0]!;
  for(const a of paths.filter(a=>filter(a.r)))for(let i=1;i<a.points.length;i++) {
   const u=a.points[i-1]!,v=a.points[i]!,dx=v.x-u.x,dz=v.z-u.z,l2=dx*dx+dz*dz,t=Math.max(0,Math.min(1,((p.x-u.x)*dx+(p.z-u.z)*dz)/l2));
   const d=Math.hypot(p.x-u.x-t*dx,p.z-u.z-t*dz);
   if(d<best){best=d;q={x:u.x+t*dx,y:(u.y??0)+t*((v.y??0)-(u.y??0)),z:u.z+t*dz};road=a.r;}
  }return {point:q,distance:best,road};
 };
 const added:CityRoad[]=[];
 const add=(id:string,text:string,nodes:XZ[],lanes:number,district:string,curved=false)=>{
  let pts=nodes.map(([x,z])=>({x,y:0,z}));
  // Every new street terminates on an established artery/collector, not on grass.
  pts[0]=nearest(pts[0]!).point;pts[pts.length-1]=nearest(pts.at(-1)!).point;
  const raw=curved?new CatmullRomCurve3(pts.map(p=>new Vector3(p.x,0,p.z)),false,'centripetal').getPoints(Math.ceil(polylineLength(pts)/5)).map(p=>({x:p.x,y:0,z:p.z})):sampled(pts);
  const height=(p:CityPoint)=>Math.max(14.5*(1-ease((Math.abs(p.z+150)-240)/400)),p.z< -650||p.z>1700?8*(1-ease((Math.abs(p.x)-60)/230)):0,14.5*ease((p.x-350)/500)*(1-ease((Math.abs(p.z-350)-120)/370)))*ease((Math.hypot(p.x-650,p.z-400)-80)/220);
  const points=raw.map(p=>({...p,y:height(p)})),length=polylineLength(points);
  for(const end of ['start','end'] as const){const ordered=end==='start'?points:[...points].reverse(),y=pts[end==='start'?0:pts.length-1]!.y??0,transition=Math.min(300,length*.45);let d=0;for(let i=0;i<ordered.length;i++){if(i)d+=Math.hypot(ordered[i]!.x-ordered[i-1]!.x,ordered[i]!.z-ordered[i-1]!.z);if(d>transition)break;ordered[i]!.y=y+((ordered[i]!.y??0)-y)*ease(d/transition);}}
  // Mouths are one-level landings. Interior bridge profiles remain SI elevations.
  const name=id;map.roadNames![name]={primaryText:text,kind:'urban'};
  const r=createRoad(map,{id,groupId:'v5-'+district,centerline:points,curve:'polyline',type:lanes===6?'urban_6lane':lanes===4?'urban_4lane':'urban_2lane',styleId:lanes===6?'urban_boulevard_6':lanes===4?'urban_street_4':'urban_local_2',laneCount:lanes,laneWidth:3.5,speedLimit:lanes===2?30:50,travelDirection:'two-way',elevationMode:'custom',district,streetlights:true,structure:{piersEnabled:true,pierSpacing:45,barrierEnabled:false}});r.roadNameId=name;
  r.roadLevel=lanes===6?1:lanes===4?2:district==='west'?4:3;added.push(r);paths.push({r,points:roadPoints(r)});
 };
 // The reference's core is bounded by the irregular inner boulevard. Existing
 // Central Avenue and diagonal New City Avenue form its east-west/diagonal axes.
 add('v5-civic-avenue','市府大道',[[-460,-660],[-460,150],[-460,640]],6,'central');
 add('v5-finance-road','金融路',[[380,-600],[380,130],[380,675]],4,'central');
 add('v5-civic-west','公园西路',[[-700,-540],[-710,160],[-710,625]],2,'central');
 add('v5-civic-block-road','市府街',[[-240,-580],[-240,180],[-240,640]],2,'central');
 add('v5-civic-north','市府北路',[[-870,-450],[-450,-460],[300,-460],[790,-400]],4,'central');
 add('v5-civic-south','市府南路',[[-980,540],[-460,550],[380,550],[780,550]],4,'central');
 add('v5-civic-middle','城中路',[[-1020,150],[-460,150],[400,150],[600,150]],2,'central');
 // West: staggered streets, smaller plots and terminating legs, deliberately
 // unlike the larger regular blocks of the eastern new district.
 add('v5-west-lane','西城里巷',[[-1450,-750],[-1460,-410],[-1420,100],[-1440,760]],2,'west');
 add('v5-west-east-road','老城东路',[[-1110,-730],[-1090,-330],[-1110,200],[-1080,680]],4,'west');
 add('v5-west-workshop','工坊路',[[-1450,-580],[-1330,-610],[-1100,-580],[-930,-440]],2,'west');
 add('v5-west-market-road','西城市场路',[[-1460,160],[-1320,180],[-1110,135],[-1030,80]],2,'west');
 add('v5-west-south-lane','老城南巷',[[-1440,810],[-1280,820],[-1100,780],[-790,750]],2,'west');
 // East: retain the six-lane East Avenue, the actual main/aux boulevard and
 // northern roundabout. Secondary roads enclose larger 250–400 m plots.
 add('v5-east-science','科创路',[[1030,-710],[1040,-380],[1030,80],[1030,710]],4,'east');
 add('v5-east-garden','新区花园路',[[1040,-480],[1200,-480],[1500,-480]],4,'east');
 // North: a large open northern block stays open; two collectors curve around
 // its edges instead of subdividing the park into a rectangular street grid.
 add('v5-north-park','北城公园路',[[-1280,-1130],[-900,-1200],[-500,-1130],[-370,-800]],2,'north',true);
 add('v5-north-campus','学院路',[[250,-800],[440,-1010],[700,-1040],[980,-900]],2,'north',true);
 // South: warehouse-sized blocks, no dense residential grid.
 add('v5-south-west','仓储西路',[[-1000,660],[-1000,900],[-980,1160]],4,'south');
 add('v5-south-east','物流东路',[[450,710],[470,950],[500,1130]],4,'south');
 add('v5-south-logistics','物流支路',[[1300,1130],[1270,1450],[1450,1750]],4,'south');
 const patches:{p:CityPoint;y:number;source:string}[]=[];
 for(const r of added)for(const other of map.roads.filter(a=>frozen.has(a.id))){const path=roadPoints(other);for(const d of crossingDistance(r.centerline,path)){
  if(d<20||d>polylineLength(r.centerline)-20)continue;const p=sampleAt(r.centerline,d).point;
  let gap=Infinity,y=0;for(let i=1;i<path.length;i++){const a=path[i-1]!,b=path[i]!,dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz))),dist=Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);if(dist<gap){gap=dist;y=(a.y??0)+t*((b.y??0)-(a.y??0));}}
  if(Math.abs((p.y??0)-y)<5.65)patches.push({p,y:y+6.4,source:r.id+'/'+other.id});
 }}
 for(const r of added){const len=polylineLength(r.centerline);let d=0;for(let i=0;i<r.centerline.length;i++){const p=r.centerline[i]!;if(i)d+=Math.hypot(p.x-r.centerline[i-1]!.x,p.z-r.centerline[i-1]!.z);const weight=ease(Math.min(d,len-d)/75);p.y=Math.max(p.y??0,...patches.map(a=>a.y*(1-ease((Math.hypot(p.x-a.p.x,p.z-a.p.z)-55)/190))*weight));}}
 // A street anchored at an existing mouth joins that logical junction, rather
 // than leaving a coincident but disconnected endpoint inside its pavement.
 for(const r of added)for(const end of ['start','end'] as const){const p=r.centerline[end==='start'?0:r.centerline.length-1]!,j=map.intersections.find(j=>j.connections.length<5&&Math.abs((j.position.y??0)-(p.y??0))<.2&&j.connections.some(c=>{const a=map.roads.find(r=>r.id===c.roadId)!,q=a.centerline[c.end==='start'?0:a.centerline.length-1]!;return Math.hypot(q.x-p.x,q.z-p.z)<.08;}));if(!j)continue;
  if(j.connections.some(c=>frozen.has(c.roadId))&&r.laneCount*r.laneWidth>junctionExtent(j,map)*2-14)continue;
  const port=(['north','east','south','west','extra'] as const).find(port=>!j.connections.some(c=>c.port===port))!,q=r.centerline[end==='start'?1:r.centerline.length-2]!;
  j.type=j.connections.length===4?'irregular':'cross_6lane';j.portAngles??={};j.portAngles[port]=Math.atan2(q.x-j.position.x,-(q.z-j.position.z));j.pavementHeights??={};j.pavementHeights[port]=j.position.y??0;connectRoad(map,{roadId:r.id,end},{junctionId:j.id,port});
 }
 // Width changes are at existing junction/section boundaries; locked approach
 // widths and geometry stay byte-for-byte unchanged.
 for(const r of ordinary)if((r.roadNameId==='south-avenue'||r.roadNameId==='new-city-avenue'&&Math.abs(r.centerline[0]!.x)>900)&&!map.intersections.some(j=>j.connections.some(c=>c.roadId===r.id)&&j.connections.some(c=>frozen.has(c.roadId)))) {
  r.laneCount=4;r.type='urban_4lane';r.styleId='urban_street_4';
 }
 connectUrbanSkeleton(map,[...ordinary,...added],5.6,(j)=>{j.pavementHeights={};for(const c of j.connections)j.pavementHeights[c.port]=j.position.y??0;});
 const fresh=map.intersections.filter(j=>!oldJs.has(j.id));
 for(const j of fresh){j.pavementHeights={};for(const c of j.connections)j.pavementHeights[c.port]=j.position.y??0;}
 syncConnections(map);trimCityJunctionApproaches({...map,intersections:fresh},false);
 const freshIds=new Set(fresh.map(j=>j.id)),byEnd=new Map<string,typeof fresh[number]>();for(const j of map.intersections)for(const c of j.connections)byEnd.set(c.roadId+':'+c.end,j);
 // Closely spaced landings share a bounded profile. Existing junction levels and
 // every frozen feeder are fixed constraints, rather than averaged/moved.
 for(let pass=0;pass<map.intersections.length;pass++){
  let changed=false;
  for(const r of map.roads.filter(r=>!frozen.has(r.id))){const a=byEnd.get(r.id+':start'),b=byEnd.get(r.id+':end'),ay=a?.position.y??r.centerline[0]!.y??0,by=b?.position.y??r.centerline.at(-1)!.y??0,budget=polylineLength(r.centerline)*.075;
   if(Math.abs(ay-by)<=budget+.001)continue;
   const am=!!a&&freshIds.has(a.id),bm=!!b&&freshIds.has(b.id);if(!am&&!bm)continue;
   if(am&&bm){const middle=(ay+by)/2;a!.position.y=middle+Math.sign(ay-by)*budget/2;b!.position.y=middle-Math.sign(ay-by)*budget/2;}
   else if(am)a!.position.y=by+Math.sign(ay-by)*budget;else b!.position.y=ay+Math.sign(by-ay)*budget;
   changed=true;
  }if(!changed)break;
 }
 for(const j of fresh)for(const c of j.connections)j.pavementHeights![c.port]=j.position.y??0;
 syncConnections(map);
 // New junction ends are flattened over short landings and blended into native
 // profiles, avoiding endpoint spikes when a road has been split at a junction.
 for(const j of fresh)for(const c of j.connections) {
  const r=map.roads.find(r=>r.id===c.roadId)!,pts=c.end==='start'?r.centerline:[...r.centerline].reverse();
  const transition=Math.min(55,polylineLength(pts)*.45);let d=0;
  for(let i=0;i<pts.length;i++){if(i)d+=Math.hypot(pts[i]!.x-pts[i-1]!.x,pts[i]!.z-pts[i-1]!.z);if(d>transition)break;const t=Math.min(1,d/transition),w=t*t*(3-2*t);pts[i]!.y=(j.position.y??0)+((pts[i]!.y??0)-(j.position.y??0))*w;}
 }
 const affectedRoads=new Set(fresh.flatMap(j=>j.connections.map(c=>c.roadId)));
 for(const r of map.roads.filter(r=>affectedRoads.has(r.id))){const p=r.centerline;for(let pass=0;pass<4;pass++)for(const reverse of [false,true]){const q=reverse?[...p].reverse():p;for(let i=1;i<q.length-1;i++){const budget=Math.hypot(q[i]!.x-q[i-1]!.x,q[i]!.z-q[i-1]!.z)*.1199,y=q[i-1]!.y??0;q[i]!.y=Math.max(y-budget,Math.min(y+budget,q[i]!.y??0));}}}
 // Subdivide the authored inner loop into six identity sections without adding
 // another orbital road; its real intersections remain ordinary urban nodes.
 map.environment.metadata={...map.environment.metadata,urbanSkeletonVersion:'5',urbanNetworkVersion:'5',author:'scripts/build-city-main-v5.mjs',v5NewJunctions:String(fresh.length),v5AuthoredStreets:String(added.length),v5BaselineRoadCount:String(original.roads.length),v5RoadCount:String(map.roads.length),innerBoulevardForm:'six urban sectors; west, northwest, north, east, southeast, southwest; ordinary signalized avenue'};
 for(const r of map.roads.filter(r=>!frozen.has(r.id)))if(r.roadNameId==='south-avenue'||r.roadNameId==='new-city-avenue')r.roadLevel=r.laneCount>=6?1:2;
 map.roadNames!['intercity-expressway']={...map.roadNames!['intercity-east-expressway']!};
 const innerRoads=map.roads.filter(r=>r.roadNameId==='inner-boulevard');
 map.environment.metadata.innerBoulevardLengthMetres=(innerRoads.reduce((n,r)=>n+polylineLength(roadPoints(r)),0)+map.intersections.reduce((n,j)=>{const arms=j.connections.filter(c=>innerRoads.some(r=>r.id===c.roadId));if(arms.length!==2)return n;const ends=arms.map(c=>{const p=roadPoints(map.roads.find(r=>r.id===c.roadId)!);return p[c.end==='start'?0:p.length-1]!;});return n+Math.hypot(ends[0]!.x-ends[1]!.x,ends[0]!.z-ends[1]!.z);},0)).toFixed(1);
 for(const j of map.intersections)setJunctionPavementFootprint(j,map);
 repairCityMainGroundElevation(map);
 populateIntersectionMarkingMetadata(map);
 map.signs=[];cleanRoadsidePlacements(map);
 map.signs=generateTopologySigns(map);
 cleanRoadsidePlacements(map);
 map.environment.metadata.landscapeObjects=String(map.objects.length);
 for(const r of original.roads.filter(cityV5FrozenRoad))if(JSON.stringify(r)!==JSON.stringify(map.roads.find(q=>q.id===r.id)))throw new Error('V5 changed frozen infrastructure '+r.id+' '+JSON.stringify({old:[r.centerline[0],r.centerline.at(-1)],now:map.roads.find(q=>q.id===r.id)?.centerline.filter((_,i,a)=>i===0||i===a.length-1)}));
 map.version=original.version+1;
 return loadCityMap(map);
}
