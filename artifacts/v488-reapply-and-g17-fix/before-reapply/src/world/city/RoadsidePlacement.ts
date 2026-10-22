import type {CityMapData,CityPoint} from './CityMapData';
import {RoadClearance} from './RoadClearance';
import {rotatePoint} from './geometry';
import {ROAD_SIGN_POST_Z,signDimensions} from './RoadSignTemplates';
import {roadPiers} from './RoadInfrastructure';
import {PrefabRegistry} from './PrefabRegistry';
import {createSubject3Materials} from '../subject3/materials';

/** Lightweight, shared furniture exclusion, evaluated only during authoring/load. */
export class RoadsidePlacement {
 private readonly clearance:RoadClearance;
 private readonly piers:CityPoint[];
 constructor(private readonly map:CityMapData,clearance=new RoadClearance(map)) {
  this.clearance=clearance;this.piers=map.roads.flatMap(r=>roadPiers(r,map,clearance).map(p=>p.position));
 }
 permits(p:CityPoint,radius:number,height:number):boolean {
  const y=p.y??0;
  if(!this.clearance.permitsProp(p,radius,height))return false;
  if(this.piers.some(q=>(q.y??0)>.5&&Math.hypot(p.x-q.x,p.z-q.z)<radius+.9&&y<(q.y??0)))return false;
  return !(this.map.signs??[]).some(s=>{
   const dims=signDimensions(s.template,s.size,s.postOffset,s.gantryPosts),base=s.position.y??0;if((s.postBaseY??base)>y+height||base+dims.poleTop<y)return false;
   return dims.posts.some(x=>{const q=rotatePoint({x,z:ROAD_SIGN_POST_Z},s.heading);return Math.hypot(p.x-s.position.x-q.x,p.z-s.position.z-q.z)<radius+1;})||Math.hypot(p.x-s.position.x,p.z-s.position.z)<radius+dims.width/2+1&&y+height>base+dims.bottom;
  });
 }
}
/** Existing props only. Green slabs use their rotated footprint rather than a
 * centre-point check, which previously let them intrude into the roadway. */
export function cleanRoadsidePlacements(map:CityMapData):void {
 const clearance=new RoadClearance(map),placement=new RoadsidePlacement(map,clearance),removed:string[]=[],materials=createSubject3Materials(),prefabs=new PrefabRegistry(materials);
 map.objects=map.objects.filter(o=>{
  if(o.prefabId==='hardscape'||o.prefabId==='embankment')return true;
  const sizes:Record<string,[number,number]>={green_strip:[20,8],noise_barrier:[20,.3],guardrail:[10,.2],tree:[4.4,4.4],streetlight:[.4,.4]};
  const prefab=prefabs.entries.get(o.prefabId)!,size=sizes[o.prefabId]??[prefab.size[0],prefab.size[2]];
  const w=size[0]*(o.scale?.x??1),d=size[1]*(o.scale?.z??1),height=prefab.size[1]*(o.scale?.y??1);
  let valid=true;
  if(o.prefabId==='green_strip'||o.prefabId==='noise_barrier'||o.prefabId==='guardrail') {
   for(let x=-w/2;x<=w/2+.001&&valid;x+=Math.min(3,w))for(let z=-d/2;z<=d/2+.001;z+=Math.min(3,d)) {
    const a=rotatePoint({x,z},o.rotation),p={x:o.position.x+a.x,y:o.position.y??0,z:o.position.z+a.z};
    if(clearance.roadAt(p,.4,(p.y??0)-.25,(p.y??0)+height)||clearance.junctionAt(p,.4,(p.y??0)-.25,(p.y??0)+height)){valid=false;break;}
   }
  }else valid=placement.permits(o.position,Math.hypot(w,d)/2,height);
  if(!valid)removed.push(o.id);return valid;
 });
 prefabs.dispose();Object.values(materials).forEach(m=>m.dispose());
 map.environment.metadata={...map.environment.metadata,v5RemovedRoadsideProps:String(Number(map.environment.metadata?.v5RemovedRoadsideProps??0)+removed.length),v5RoadsideCleanup:'existing props only; rotated slab footprint, carriageway, junction, pier and sign exclusions'};
}
