import type { CityMapData } from '../city/CityMapData';

export type StreamingTier='near'|'mid'|'far';
export interface StreamingSelection { currentSector:string; tiers:Map<string,StreamingTier>; lookahead:string[]; preloaded:string[]; structures:string[]; lookaheadMetres:number }
/** Pure scheduling data; no geometry, collision or navigation graph is destroyed here. */
export class RegionalStreaming {
  readonly sectors=new Set<string>();
  readonly structureSectors=new Map<string,Set<string>>();
  private readonly coordinates: { key: string; x: number; z: number }[] = [];
  constructor(readonly map:CityMapData) {
    const bounds=map.regional!.terrainBounds,size=map.sectorSize;
    for(let x=Math.floor(bounds.minX/size);x<=Math.floor((bounds.maxX-.001)/size);x++)for(let z=Math.floor(bounds.minZ/size);z<=Math.floor((bounds.maxZ-.001)/size);z++){const key=`${x},${z}`;this.sectors.add(key);this.coordinates.push({key,x:(x+.5)*size,z:(z+.5)*size});}
    for(const structure of map.regional!.structures) {
      const keys=new Set<string>();
      for(const id of structure.roadIds){const road=map.roads.find(r=>r.id===id);if(!road)continue;for(const p of road.centerline)keys.add(this.key(p.x,p.z));}
      const r=structure.radius;
      for(let x=Math.floor((structure.center.x-r)/size);x<=Math.floor((structure.center.x+r)/size);x++)for(let z=Math.floor((structure.center.z-r)/size);z<=Math.floor((structure.center.z+r)/size);z++)keys.add(`${x},${z}`);
      this.structureSectors.set(structure.id,keys);
    }
  }
  key(x:number,z:number){return `${Math.floor(x/this.map.sectorSize)},${Math.floor(z/this.map.sectorSize)}`;}
  select(x:number,z:number,yaw:number,speed:number):StreamingSelection {
    const size=this.map.sectorSize,tiers=new Map<string,StreamingTier>(),lookahead=new Set<string>(),preloaded=new Set<string>(),structures:string[]=[];
    const velocity=Math.abs(speed),forward=speed<0?-1:1,fx=-Math.sin(yaw)*forward,fz=-Math.cos(yaw)*forward;
    const distance=Math.min(2000,750+velocity*37.5);
    for(const sector of this.coordinates) {
      const key=sector.key,dx=sector.x-x,dz=sector.z-z;
      // Minimum distance to the square, not its centre, protects sector boundaries.
      const radial=Math.hypot(Math.max(0,Math.abs(dx)-size/2),Math.max(0,Math.abs(dz)-size/2));
      let tier:StreamingTier=radial<=750?'near':radial<=1800?'mid':'far';
      const along=dx*fx+dz*fz,lateral=Math.abs(dx*fz-dz*fx);
      if(along>=-size/2&&along<=distance+size/2&&lateral<=420+size*.71){tier='near';lookahead.add(key);}
      tiers.set(key,tier);
    }
    for(const structure of this.map.regional!.structures) {
      const dx=structure.center.x-x,dz=structure.center.z-z,along=dx*fx+dz*fz;
      if(Math.hypot(dx,dz)>distance+structure.radius || along < -structure.radius-600)continue;
      structures.push(structure.id);
      for(const key of this.structureSectors.get(structure.id)!)if(this.sectors.has(key)){tiers.set(key,'near');preloaded.add(key);}
    }
    return {currentSector:this.key(x,z),tiers,lookahead:[...lookahead],preloaded:[...preloaded],structures,lookaheadMetres:distance};
  }
}
