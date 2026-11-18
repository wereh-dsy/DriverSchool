import type { CityPoint, RoadEndpoint } from '../world/city/CityMapData';
import { connectionPoint, portsFor } from '../world/city/geometry';
import { roadFunction } from '../world/city/RoadClassification';
import type { CityEditingKernel } from './CityEditingKernel';
import { distance, project, roadPoints } from './EditorGeometry';

export interface SnapCandidate { point: CityPoint; kind: string; roadId?: string; endpoint?: RoadEndpoint; junctionId?: string; port?: ReturnType<typeof portsFor>[number]; score: number }
/** Same candidate service for interactive tools and agents. Elevation is part of compatibility. */
export function snapCandidates(kernel: CityEditingKernel, point: CityPoint, options: { tolerance?: number; anchor?: CityPoint; excludeRoadId?: string; grid?: number; elevation?: number } = {}): SnapCandidate[] {
  const tolerance = options.tolerance ?? 10, y = options.elevation ?? point.y ?? 0, result: SnapCandidate[] = [];
  const add = (candidate: Omit<SnapCandidate, 'score'>, bias = 0) => { const d = distance(candidate.point, point); if (d <= tolerance) result.push({ ...candidate, score: d + bias }); };
  const roads = kernel.findRoads({ center: point, radius: tolerance + 30, limit: 100 });
  for (const brief of roads) {
    if (brief.id === options.excludeRoadId) continue; const road = kernel.getRoad(brief.id)!, pts = roadPoints(road), p = project(pts, point);
    const compatible = Math.abs((p.point.y ?? 0) - y) < 1;
    for (const end of ['start','end'] as const) { const p = end === 'start' ? pts[0]! : pts.at(-1)!; if (Math.abs((p.y ?? 0) - y) < 1) add({point:p,kind:'endpoint',roadId:road.id,endpoint:{roadId:road.id,end}},-5); }
    if (compatible) {
      add({point:p.point,kind:roadFunction(road)==='expressway'?'controlled access · ramp required':'centerline / T intersection',roadId:road.id},-2);
      const half=road.laneCount*road.laneWidth/2; for(const side of [-1,1]) add({point:{x:p.point.x-p.tangent.z*half*side,y:p.point.y,z:p.point.z+p.tangent.x*half*side},kind:'road edge',roadId:road.id},1);
      if(options.anchor){const a=project(pts,options.anchor),offset=(options.anchor.x-a.point.x)*-a.tangent.z+(options.anchor.z-a.point.z)*a.tangent.x;
        add({point:{x:p.point.x-p.tangent.z*offset,y:p.point.y,z:p.point.z+p.tangent.x*offset},kind:'parallel / corridor',roadId:road.id},0.5);
        const t=((point.x-options.anchor.x)*-a.tangent.z+(point.z-options.anchor.z)*a.tangent.x);add({point:{x:options.anchor.x-a.tangent.z*t,y,z:options.anchor.z+a.tangent.x*t},kind:'perpendicular',roadId:road.id},1);
      }
    }
  }
  const localIds=new Set(roads.map(r=>r.id));
  for(const j of kernel.data.intersections)if(j.connections.some(c=>localIds.has(c.roadId))&&Math.abs((j.position.y??0)-y)<1){
    add({point:j.position,kind:'intersection center',junctionId:j.id},-3);
    for(const port of portsFor(j))if(!j.connections.some(c=>c.port===port))add({point:connectionPoint(j,port,kernel.data),kind:'intersection port',junctionId:j.id,port},-5);
  }
  if(options.anchor){const dx=point.x-options.anchor.x,dz=point.z-options.anchor.z,length=Math.hypot(dx,dz),angle=Math.round(Math.atan2(dz,dx)/(Math.PI/4))*Math.PI/4;
    add({point:{x:options.anchor.x+Math.cos(angle)*length,y,z:options.anchor.z+Math.sin(angle)*length},kind:'common angle / same elevation'},2);
  }
  if(options.grid){const g=options.grid;result.push({point:{x:Math.round(point.x/g)*g,y,z:Math.round(point.z/g)*g},kind:'grid',score:tolerance+2});}
  result.sort((a,b)=>a.score-b.score);return result;
}
