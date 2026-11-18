import type { CityMapData } from '../city/CityMapData';
import { RoadStreamCorridor } from './RoadStreamCorridor';

export type StreamingTier='near'|'mid'|'far';
export interface StreamingSelection { currentSector:string; tiers:Map<string,StreamingTier>; lookahead:string[]; preloaded:string[]; structures:string[]; lookaheadMetres:number; corridor?:Map<string,number>; roadIds?:ReadonlySet<string>; preparationSeconds?:number }
class LocalTiers extends Map<string,StreamingTier> {
  constructor(private readonly sectors:ReadonlySet<string>){super();}
  override get(key:string):StreamingTier|undefined{return super.get(key)??(this.sectors.has(key)?'far':undefined);}
}
/** Pure scheduling data; no geometry, collision or navigation graph is destroyed here. */
export class RegionalStreaming {
  readonly sectors=new Set<string>();
  readonly structureSectors=new Map<string,Set<string>>();
  readonly corridor:RoadStreamCorridor;
  constructor(readonly map:CityMapData) {
    const bounds=map.regional!.terrainBounds,size=map.sectorSize;
    const roads = new Map(map.roads.map(road => [road.id, road]));
    this.corridor=new RoadStreamCorridor(map);
    for(let x=Math.floor(bounds.minX/size);x<=Math.floor((bounds.maxX-.001)/size);x++)for(let z=Math.floor(bounds.minZ/size);z<=Math.floor((bounds.maxZ-.001)/size);z++){const key=`${x},${z}`;this.sectors.add(key);}
    for(const structure of map.regional!.structures) {
      const keys=new Set<string>();
      for(const id of structure.roadIds){const road=roads.get(id);if(!road)continue;for(const p of road.centerline)keys.add(this.key(p.x,p.z));}
      const r=structure.radius;
      for(let x=Math.floor((structure.center.x-r)/size);x<=Math.floor((structure.center.x+r)/size);x++)for(let z=Math.floor((structure.center.z-r)/size);z<=Math.floor((structure.center.z+r)/size);z++)keys.add(`${x},${z}`);
      this.structureSectors.set(structure.id,keys);
    }
  }
  key(x:number,z:number){return `${Math.floor(x/this.map.sectorSize)},${Math.floor(z/this.map.sectorSize)}`;}
  select(x:number,z:number,yaw:number,speed:number,height?:number):StreamingSelection {
    const size=this.map.sectorSize,tiers=new LocalTiers(this.sectors),lookahead=new Set<string>(),preloaded=new Set<string>(),structures:string[]=[];
    const forward=speed<0?-1:1,fx=-Math.sin(yaw)*forward,fz=-Math.cos(yaw)*forward;
    const corridor=this.corridor.select(x,z,yaw,speed,height);
    const distance=corridor.horizon;
    const reach=1800+size;
    for(let sx=Math.floor((x-reach)/size);sx<=Math.floor((x+reach)/size);sx++)for(let sz=Math.floor((z-reach)/size);sz<=Math.floor((z+reach)/size);sz++) {
      const key=`${sx},${sz}`;if(!this.sectors.has(key))continue;
      const dx=(sx+.5)*size-x,dz=(sz+.5)*size-z;
      // Minimum distance to the square, not its centre, protects sector boundaries.
      const radial=Math.hypot(Math.max(0,Math.abs(dx)-size/2),Math.max(0,Math.abs(dz)-size/2));
      let tier:StreamingTier=radial<=750?'near':radial<=1800?'mid':'far';
      if(corridor.sectors.has(key)){tier='near';lookahead.add(key);}
      if(tier!=='far')tiers.set(key,tier);
    }
    for(const key of corridor.sectors.keys())if(this.sectors.has(key)){tiers.set(key,'near');lookahead.add(key);}
    for(const structure of this.map.regional!.structures) {
      const dx=structure.center.x-x,dz=structure.center.z-z,along=dx*fx+dz*fz;
      if(Math.hypot(dx,dz)>distance+structure.radius || along < -structure.radius-600)continue;
      if(!structure.roadIds.some(id=>corridor.roadIds.has(id))&&Math.hypot(dx,dz)>1000+structure.radius)continue;
      structures.push(structure.id);
      for(const key of this.structureSectors.get(structure.id)!)if(this.sectors.has(key)){tiers.set(key,'near');preloaded.add(key);}
    }
    return {currentSector:this.key(x,z),tiers,lookahead:[...lookahead],preloaded:[...preloaded],structures,lookaheadMetres:distance,corridor:corridor.sectors,roadIds:corridor.roadIds,preparationSeconds:corridor.preparationSeconds};
  }
}
