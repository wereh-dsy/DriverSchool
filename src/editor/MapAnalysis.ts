import type { CityMapData, CityPoint, CityRoad } from '../world/city/CityMapData';
import { roadEdges, roadPoints, polylineLength, sampleAt } from '../world/city/geometry';
import { bounds, crossings, distance, EditorSpatialIndex, project } from './EditorGeometry';
import type { EditorArea } from './EditorCommands';
import { objectBounds } from './MapObjectGeometry';
import { invalidateRoadClearance } from '../world/city/RoadClearance';
import { junctionSurfaceContains } from '../world/city/JunctionSurface';

/** Central authoring thresholds, metres/radians/SI grades. Query overrides are explicit. */
export const MAP_REVIEW_LIMITS = {
  clearance: 5.5, deckThickness: 0.65, localExtremumLength: 100,
  localExtremumAmplitude: 0.08, constraintDistance: 20, gradeDelta: 0.04,
  accessLength: 300, accessWidth: 80, interchangeDistance: 80,
  attachmentSpacing: 60, rampDistance: 8, objectRoadside: 2,
  facingTolerance: Math.PI / 4, junctionObjectMargin: 2,
  streetlightSpacing: 8, rampJunctionDistance: 15,
};
export type AnalysisLimits = typeof MAP_REVIEW_LIMITS;
export interface SpatialScope {
  roadId?: string; intersectionId?: string; objectId?: string; corridorId?: string;
  bbox?: EditorArea; center?: CityPoint; radius?: number; full?: boolean;
  type?: string; district?: string; structure?: string; limit?: number; offset?: number;
  codes?: string[]; minSeverity?: 'info'|'warning'|'error';
}
export interface MapIssue {
  id: string; code: string; severity: 'info'|'warning'|'error'; message: string;
  roadId?: string; objectId?: string; intersectionId?: string; station?: number;
  approximate?: boolean; reviewRequired?: boolean; constraintDriven?: boolean;
  metrics: Record<string, number|string|boolean|null>; repair?: Record<string, unknown>;
}
export const angleDelta = (a:number,b:number):number => Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function stations(points:readonly CityPoint[]):number[] {
  const result=[0];for(let i=1;i<points.length;i++)result.push(result[i-1]!+distance(points[i-1]!,points[i]!));return result;
}
export function structureType(road:CityRoad):'at_grade'|'elevated'|'depressed'|'tunnel' {
  if(road.structure?.enclosure)return road.structure.enclosure.kind==='cutting'?'depressed':'tunnel';
  if(road.corridorSection==='GROUND')return 'at_grade';
  if(road.corridorSection==='BRIDGE')return 'elevated';
  const path=roadPoints(road);return path.some(p=>(p.y??0)>2)?'elevated':path.some(p=>(p.y??0)<-1)?'depressed':'at_grade';
}
export function issue(code:string,entity:{roadId?:string;objectId?:string;intersectionId?:string;station?:number},message:string,metrics:MapIssue['metrics']={},extra:Partial<MapIssue>={}):MapIssue {
  return {id:[code,entity.roadId??'',entity.objectId??'',entity.intersectionId??'',entity.station?.toFixed(2)??''].join(':'),code,severity:'warning',...entity,message,metrics,...extra};
}
/** One snapshot, one index/cache. No renderer or per-object full-map geometry scan. */
export class MapAnalysisContext {
  readonly spatial=new EditorSpatialIndex();
  readonly roads=new Map<string,CityRoad>();
  readonly paths=new Map<string,CityPoint[]>();
  readonly junctions=new Map< string,CityMapData['intersections'][number]>();
  private crossingCache=new Map<string,ReturnType<MapAnalysisContext['computeCrossings']>>();
  private overlapCache=new Map<string,{roadId:string;startStation:number;endStation:number;station:number;point:CityPoint;otherY:number;clearance:number;relation:string;approximate:boolean}[]>();
  readonly limits:AnalysisLimits;
  constructor(readonly map:CityMapData,limits:Partial<AnalysisLimits>={}) {
    this.limits={...MAP_REVIEW_LIMITS,...limits};
    for(const r of map.roads){const path=roadPoints(r);this.roads.set(r.id,r);this.paths.set(r.id,path);this.spatial.set('road:'+r.id,bounds(path,Math.max(-roadEdges(r).left,roadEdges(r).right)));}
    for(const j of map.intersections){this.junctions.set(j.id,j);this.spatial.set('junction:'+j.id,bounds([j.position],Math.max(40,...(j.pavementFootprint??[]).map(p=>Math.hypot(p.x,p.z)))));}
    for(const o of map.objects)this.spatial.set('object:'+o.id,objectBounds(o));
    for(const s of map.signs??[])this.spatial.set('object:'+s.id,bounds([s.position],6));
  }
  road(id:string):CityRoad {const r=this.roads.get(id);if(!r)throw new Error('Unknown road '+id);return r;}
  path(id:string):CityPoint[]{this.road(id);return this.paths.get(id)!;}
  roadCandidates(area:EditorArea):CityRoad[]{return this.spatial.query(area).filter(id=>id.startsWith('road:')).map(id=>this.road(id.slice(5)));}
  nearRoads(point:CityPoint,radius=50){return this.roadCandidates(bounds([point],radius)).map(road=>({road,...project(this.path(road.id),point)})).filter(p=>p.distance<=radius).sort((a,b)=>a.distance-b.distance);}
  scopeArea(scope:SpatialScope):EditorArea|undefined {
    if(scope.bbox)return scope.bbox;
    if(scope.center)return bounds([scope.center],scope.radius??100);
    if(scope.roadId)return bounds(this.path(scope.roadId),scope.radius??30);
    if(scope.intersectionId){const j=this.map.intersections.find(j=>j.id===scope.intersectionId);if(!j)throw new Error('Unknown intersection '+scope.intersectionId);return bounds([j.position],scope.radius??50);}
    if(scope.objectId){const o=[...this.map.objects,...this.map.signs??[]].find(o=>o.id===scope.objectId);if(!o)throw new Error('Unknown object '+scope.objectId);return bounds([o.position],scope.radius??50);}
    return undefined;
  }
  selectedRoads(scope:SpatialScope):CityRoad[]{
    const area=this.scopeArea(scope),corridor=scope.corridorId&&this.map.editing?.corridors.find(c=>c.id===scope.corridorId);
    if(scope.corridorId&&!corridor)throw new Error('Unknown corridor '+scope.corridorId);
    if(!area&&!corridor&&!scope.full)throw new Error('A local scope or explicit full:true is required');
    return (area?this.roadCandidates(area):this.map.roads).filter(r=>(!scope.roadId||r.id===scope.roadId)&&(!corridor||corridor.roadIds.includes(r.id))&&(!scope.district||r.district===scope.district)&&(!scope.structure||structureType(r)===scope.structure));
  }
  crossings(id:string){let list=this.crossingCache.get(id);if(!list){list=this.computeCrossings(id);this.crossingCache.set(id,list);}return list;}
  overUnderRoads(id:string){
    const cached=this.overlapCache.get(id);if(cached)return cached;
    const path=this.path(id),length=polylineLength(path),edges=roadEdges(this.road(id)),half=Math.max(-edges.left,edges.right),table=stations(path),result:NonNullable<ReturnType<typeof this.overlapCache.get>>=[];
    const exact=new Set(this.crossings(id).map(c=>c.roadId));
    for(const other of this.roadCandidates(bounds(path,half)))if(other.id!==id&&!exact.has(other.id)){
      const otherPath=this.path(other.id),otherEdges=roadEdges(other),reach=half+Math.max(-otherEdges.left,otherEdges.right),candidates=new Set(table);
      for(let station=0;station<length;station+=Math.max(10,length/10000))candidates.add(station);
      for(const p of otherPath){const hit=project(path,p);if(hit.distance<=reach)candidates.add(hit.along);}
      const hits=[...candidates].sort((a,b)=>a-b).map(station=>{const point=sampleAt(path,station).point,hit=project(otherPath,point);return {station,point,distance:hit.distance,otherY:hit.point.y??0,delta:(point.y??0)-(hit.point.y??0)};}).filter(h=>h.distance<reach&&Math.abs(h.delta)>.5);
      if(hits.length){const worst=hits.reduce((a,b)=>Math.abs(a.delta)<Math.abs(b.delta)?a:b);result.push({roadId:other.id,startStation:hits[0]!.station,endStation:hits.at(-1)!.station,station:worst.station,point:worst.point,otherY:worst.otherY,clearance:Math.abs(worst.delta)-this.limits.deckThickness,relation:worst.delta>0?'above':'below',approximate:true});}
    }
    this.overlapCache.set(id,result);return result;
  }
  private computeCrossings(id:string){
    const path=this.path(id),result:{roadId:string;station:number;point:CityPoint;otherY:number;clearance:number;requiredClearance:number;connected:boolean}[]=[];
    for(const other of this.roadCandidates(bounds(path,1)))if(other.id!==id)for(const hit of crossings(path,this.path(other.id))){
      const gap=Math.abs((hit.point.y??0)-hit.otherY),connected=gap<.2&&((this.map.roadLinks??[]).some(l=>{if(![l.from.roadId,l.to.roadId].includes(id)||![l.from.roadId,l.to.roadId].includes(other.id))return false;const p=this.path(l.from.roadId),end=p[l.from.end==='start'?0:p.length-1]!;return distance(end,hit.point)<.2;})||this.map.intersections.some(j=>j.connections.some(c=>c.roadId===id)&&j.connections.some(c=>c.roadId===other.id)&&junctionSurfaceContains(j,this.map,hit.point,.2)));
      result.push({roadId:other.id,station:project(path,hit.point).along,...hit,clearance:gap-this.limits.deckThickness,requiredClearance:this.limits.clearance,connected});
    }
    return result;
  }
  hardConstraints(id:string){
    const road=this.road(id),path=this.path(id),length=polylineLength(path);
    const result:{kind:string;station:number;elevation:number;roadId?:string;intersectionId?:string;requiredClearance?:number}[]=[{kind:'endpoint',station:0,elevation:path[0]!.y??0},{kind:'endpoint',station:length,elevation:path.at(-1)!.y??0}];
    for(const c of this.crossings(id))if(!c.connected)result.push({kind:'crossing',station:c.station,elevation:c.point.y??0,roadId:c.roadId,requiredClearance:c.requiredClearance});
    for(const overlap of this.overUnderRoads(id))for(const station of new Set([overlap.startStation,overlap.station,overlap.endStation]))result.push({kind:'overUnderEnvelope',station,elevation:sampleAt(path,station).point.y??0,roadId:overlap.roadId,requiredClearance:this.limits.clearance});
    for(const j of this.map.intersections)for(const c of j.connections)if(c.roadId===id)result.push({kind:'intersection',station:c.end==='start'?0:length,elevation:path[c.end==='start'?0:path.length-1]!.y??0,intersectionId:j.id});
    const table=stations(path),kind=structureType(road);
    // Enclosed floor and authored bridge plateaus are constraints, not cosmetic waves.
    for(let i=1;i<path.length-1;i++)if(road.structure?.enclosure||kind==='elevated'&&Math.abs((path[i]!.y??0)-(path[i-1]!.y??0))<0.01&&Math.abs((path[i+1]!.y??0)-(path[i]!.y??0))<0.01)result.push({kind:road.structure?.enclosure?'enclosure':'bridgeDeck',station:table[i]!,elevation:path[i]!.y??0});
    return result.sort((a,b)=>a.station-b.station);
  }
  envelope(id:string){const road=this.road(id),path=this.path(id),edges=roadEdges(road);return {roadId:id,approximate:true,centerline:path,carriagewayWidth:road.laneCount*road.laneWidth,pavedEdges:edges,shoulders:road.shoulders??{left:0,right:0},roadsideStart:{left:edges.left-this.limits.objectRoadside,right:edges.right+this.limits.objectRoadside},bbox:bounds(path,Math.max(-edges.left,edges.right)),structureType:structureType(road),junctions:this.map.intersections.filter(j=>j.connections.some(c=>c.roadId===id)).map(j=>({id:j.id,position:j.position,rotation:j.rotation,pavement:j.pavementFootprint??null,approximate:!j.pavementFootprint}))};}
}
const contexts=new WeakMap<CityMapData,MapAnalysisContext>();
export function analysisContext(map:CityMapData):MapAnalysisContext {let c=contexts.get(map);if(!c){c=new MapAnalysisContext(map);contexts.set(map,c);}return c;}
export function invalidateAnalysis(map:CityMapData):void{contexts.delete(map);invalidateRoadClearance(map);}
