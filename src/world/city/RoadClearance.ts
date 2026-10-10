import type { CityMapData, CityPoint, CityRoad } from './CityMapData';
import { roadEdges, roadPoints } from './geometry';
import {junctionSurfaceContains,junctionSurfaceHeight} from './JunctionSurface';

interface FootprintSegment { roadId: string; a: CityPoint; b: CityPoint; left: number; right: number }
/** Authoring/load-time index. No queries or allocations in the 120 Hz vehicle loop. */
export class RoadClearance {
  private readonly buckets = new Map<string, FootprintSegment[]>();
  constructor(private readonly map: CityMapData) {
    for (const road of map.roads) {
      const points = roadPoints(road), edges = roadEdges(road), margin = Math.max(-edges.left, edges.right) + 6;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]!, b = points[i]!, segment = { roadId: road.id, a, b, ...edges };
        for (let x = Math.floor((Math.min(a.x, b.x) - margin) / 50); x <= Math.floor((Math.max(a.x, b.x) + margin) / 50); x++)
          for (let z = Math.floor((Math.min(a.z, b.z) - margin) / 50); z <= Math.floor((Math.max(a.z, b.z) + margin) / 50); z++) {
            const key = `${x},${z}`, bucket = this.buckets.get(key) ?? [];
            bucket.push(segment); this.buckets.set(key, bucket);
          }
      }
    }
  }
  roadAt(p: CityPoint, margin = 0, minY = -Infinity, maxY = Infinity, exclude?: string, match?: (roadId: string) => boolean): boolean {
    for(let bx=Math.floor((p.x-margin)/50);bx<=Math.floor((p.x+margin)/50);bx++)for(let bz=Math.floor((p.z-margin)/50);bz<=Math.floor((p.z+margin)/50);bz++)for (const s of this.buckets.get(`${bx},${bz}`) ?? []) {
      if (s.roadId === exclude || match && !match(s.roadId)) continue;
      const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, length = Math.hypot(dx, dz);
      if (length < 0.01) continue;
      const along = ((p.x - s.a.x) * dx + (p.z - s.a.z) * dz) / length;
      if (along < -margin || along > length + margin) continue;
      const t = Math.max(0, Math.min(1, along / length));
      const y = (s.a.y ?? 0) + ((s.b.y ?? 0) - (s.a.y ?? 0)) * t;
      const offset = (-(p.x - s.a.x) * dz + (p.z - s.a.z) * dx) / length;
      if (y >= minY && y <= maxY && offset >= s.left - margin && offset <= s.right + margin) return true;
    }
    return false;
  }
  /** Lowest overlying support plane, used to terminate retaining walls below decks. */
  lowestDeckHeight(p:CityPoint,minY:number,maxY:number,exclude:string,margin=3):number|undefined {
    let result=Infinity;
    for(const s of this.buckets.get(`${Math.floor(p.x/50)},${Math.floor(p.z/50)}`)??[]) {
      if(s.roadId===exclude)continue;
      const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,l=Math.hypot(dx,dz);if(l<0.01)continue;
      const along=((p.x-s.a.x)*dx+(p.z-s.a.z)*dz)/l;if(along<-margin||along>l+margin)continue;
      const t=Math.max(0,Math.min(1,along/l)),y=(s.a.y??0)+((s.b.y??0)-(s.a.y??0))*t,offset=(-(p.x-s.a.x)*dz+(p.z-s.a.z)*dx)/l;
      if(y>=minY&&y<=maxY&&offset>=s.left-margin&&offset<=s.right+margin)result=Math.min(result,y);
    }
    return Number.isFinite(result)?result:undefined;
  }
  junctionAt(p: CityPoint, margin = 0, minY = -Infinity, maxY = Infinity): boolean {
    return this.map.intersections.some(j => {
      const y = junctionSurfaceHeight(j,p);
      if (y < minY || y > maxY) return false;
      return junctionSurfaceContains(j,this.map,p,margin);
    });
  }
  /** Includes shoulders, junction crossings and signal sight space. */
  permitsProp(p: CityPoint, radius = 1, height = 2): boolean {
    const y = p.y ?? 0;
    return !this.roadAt(p, radius, y - 2, y + height + 0.65) && !this.junctionAt(p, radius + 8, y - 2, y + height + 0.65);
  }
}

export function barrierOffset(road: CityRoad, side: number): number {
  const edges = roadEdges(road);
  return (side < 0 ? edges.left : edges.right) + side * (road.structure?.barrierOffset ?? 0);
}
