import { Box3,BufferGeometry, Group, InstancedMesh, Matrix4, Mesh, Vector3 } from 'three';
import type { CityIntersection, CityMapData, CityPoint, CityRoad } from './CityMapData';
import type { Subject3Materials } from '../subject3/materials';
import { continuousRibbon, PavementTriangleIndex, ROAD_GEOMETRY_BUDGET, solidifySurface, sweepFrames, sweepSolid, type SweepFrame, type SweepProfilePoint } from './ContinuousRoadGeometry';
import { roadEdgeChains } from './RoadEdgeChain';
import { junctionExtent,roadEdges,roadPoints,rotatePoint } from './geometry';
import { clipRoadJunctionPavement,excludePavement,junctionPavementGeometry,type PavementExclusion } from './JunctionSurface';
import { runtimeRoadClearance } from './RoadClearance';
import { retainingWallHeight } from './RoadInfrastructure';
import { roadGeometryCompilationCache, type RoadGeometryCompilationCache } from './RoadGeometryTrialCache';
import { exportVisualGeometry, importVisualGeometry } from './VisualStreamingData';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Compatibility shape for archived tools. Production has no ID gate. */
export interface RoadGeometryTrialSelection { roadIds: readonly string[]; intersectionIds: readonly string[] }

/** The single load-time road/structure generator used by editor and streaming. */
export class RoadGeometry {
  readonly fallbacks = new Map<string,string>();
  private readonly roadById: Map<string,CityRoad>;
  readonly cache: RoadGeometryCompilationCache;
  constructor(private readonly map: CityMapData, private readonly materials: Subject3Materials, _selection?: RoadGeometryTrialSelection, cache?: RoadGeometryCompilationCache) {
    this.roadById=new Map(map.roads.map(r=>[r.id,r]));
    this.cache=cache ?? roadGeometryCompilationCache(map);
  }
  enabled(_road: CityRoad): boolean {return true;}
  enabledIntersection(_j: CityIntersection): boolean {return true;}
  enclosureEnabled(road:CityRoad):boolean{return !!road.structure?.enclosure;}
  private continued(road:CityRoad,end:'start'|'end',kind:string):boolean{
    const joined=(this.map.roadLinks??[]).flatMap(l=>l.from.roadId===road.id&&l.from.end===end?[l.to]:l.to.roadId===road.id&&l.to.end===end?[l.from]:[]);
    if(joined.length!==1)return false;const other=this.roadById.get(joined[0]!.roadId);if(!other)return false;
    if(!roadEdgeChains(this.map).continuations(road.id).has(other.id))return false;
    const a=roadEdges(road),b=roadEdges(other);
    return Math.abs(a.left-b.left)<.02&&Math.abs(a.right-b.right)<.02&&(kind==='bridge'?!other.structure?.enclosure&&other.centerline.some(p=>(p.y??0)>2):other.structure?.enclosure?.kind===kind);
  }
  private islandMasks(j:CityIntersection,world=false):PavementExclusion[]{
    if(!j.channelized)return [];
    const h=junctionExtent(j,this.map);
    return [-1,1].map(sign=>{const centre=sign*(h-2.5),outline=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>{const p={x:centre+x!,z:centre+z!};if(!world)return p;const q=rotatePoint(p,j.rotation);return {x:j.position.x+q.x,z:j.position.z+q.z};});const base=world?j.position.y??0:0;return {outline,heightAt:()=>base,tolerance:.5,minHeight:base,maxHeight:base+.18};});
  }
  private mergeSurfaceIds(road:CityRoad,bounds?:readonly Box3[]):string[]{
    const ids=new Set([road.id]),transition=road.highwayTransition;
    for(const link of this.map.roadLinks??[]){if(link.from.roadId===road.id)ids.add(link.to.roadId);if(link.to.roadId===road.id)ids.add(link.from.roadId);}
    if(transition){ids.add(transition.mainRoadId);ids.add(transition.decisionId);for(const id of roadEdgeChains(this.map).continuations(transition.mainRoadId))ids.add(id);}
    return [...ids].filter(id=>{const r=this.roadById.get(id);if(!r)return false;if(id===road.id||!bounds)return true;const box=new Box3(),edges=roadEdges(r),margin=Math.max(-edges.left,edges.right)*4;for(const p of roadPoints(r))box.expandByPoint(new Vector3(p.x,p.y??0,p.z));box.min.x-=margin;box.max.x+=margin;box.min.z-=margin;box.max.z+=margin;box.min.y-=.51;box.max.y+=.51;return bounds.some(b=>box.intersectsBox(b));});
  }
  legacySidewalks(_road:CityRoad):boolean{return false;}
  private roadFrames(road: CityRoad): SweepFrame[] {
    const entry=this.cache.entry(road.id);
    let frames = entry.frames;
    if (!frames) {
      const chain = roadEdgeChains(this.map), centre = chain.edge(road, 0), right = chain.edge(road, 1);
      frames = sweepFrames(centre, Infinity);
      frames.forEach((f, i) => {
        f.right.set(right[i]!.x - centre[i]!.x, 0, right[i]!.z - centre[i]!.z);
        f.normal.crossVectors(f.right, f.tangent).normalize();
      });
      entry.frames=frames;this.cache.account(road.id);
    }
    return frames;
  }
  private strip(road: CityRoad, left: number, right: number, height: number): BufferGeometry {
    const chain = roadEdgeChains(this.map);
    return continuousRibbon(chain.edge(road, left), chain.edge(road, right), height);
  }
  pavement(road: CityRoad): BufferGeometry {
    const entry=this.cache.entry(road.id);
    if(entry.pavement){const p=entry.pavement;return importVisualGeometry({...p,position:p.position.slice(),normal:p.normal.slice(),uv:p.uv?.slice(),index:p.index?.slice()});}
    const edges = roadEdges(road);
    let geometry=clipRoadJunctionPavement(this.strip(road, edges.left, edges.right, .024), road, this.map);
    for(const j of this.map.intersections)if(j.channelized&&j.connections.some(c=>c.roadId===road.id))geometry=excludePavement(geometry,this.islandMasks(j,true));
    entry.pavement=exportVisualGeometry(geometry);this.cache.account(road.id);return geometry;
  }
  private add(root: Group, name: string, geometry: BufferGeometry, material: Subject3Materials['curb'], kind: string): Mesh {
    const mesh = new Mesh(geometry, material);
    mesh.name = name; mesh.receiveShadow = true; mesh.castShadow = kind !== 'pavement';
    mesh.userData.roadGeometryTrial = true; mesh.userData.roadStructureKind = kind; root.add(mesh);
    return mesh;
  }
  sidewalks(root: Group, road: CityRoad): void {
    if (!road.sidewalk?.enabled) return;
    const authored = road.sidewalk.width,chain=roadEdgeChains(this.map),centre=chain.edge(road,0),unit=chain.edge(road,1);
    const half=road.laneCount*road.laneWidth/2,enclosure=road.structure?.enclosure;
    for (const side of [-1, 1]) {
      const wall=enclosure?chain.barrierEdge(road,side,true):undefined;
      // Follow the same blended wall chain used by collision and roof, including
      // width transitions at road-ID boundaries; never intrude into traffic.
      const limits=centre.map((p,i)=>{if(!wall)return half+authored;const dx=unit[i]!.x-p.x,dz=unit[i]!.z-p.z,squared=dx*dx+dz*dz;return Math.min(half+authored,Math.max(half,side*((wall[i]!.x-p.x)*dx+(wall[i]!.z-p.z)*dz)/squared-.02));});
      const start=side*half,width=Math.max(...limits.map(l=>l-half));
      if(width<.005){this.fallbacks.set(road.id+':walk-reserve','existing wall collision leaves no accessible sidewalk reserve');continue;}
      const strip = (a: number, curb: boolean, height: number, thickness: number) => {
        const inner=chain.edge(road,a),outer=centre.map((p,i)=>{const offset=side*Math.max(Math.abs(a),curb?Math.min(half+curbWidth,limits[i]!):limits[i]!);return{x:p.x+(unit[i]!.x-p.x)*offset,y:p.y,z:p.z+(unit[i]!.z-p.z)*offset};});
        const top = clipRoadJunctionPavement(continuousRibbon(side<0?outer:inner,side<0?inner:outer,height), road, this.map, height, true);
        if (!top.getAttribute('position').count) { top.dispose(); return; }
        this.add(root, curb ? 'road curb' : 'road sidewalk', solidifySurface(top, thickness), curb ? this.materials.curb : this.materials.sidewalk, curb ? 'curb' : 'sidewalk');
      };
      const curbWidth = road.curb !== false ? Math.min(.22, width) : 0;
      if(width>curbWidth+.01)strip(start+side*curbWidth,false,.15,.15);
      if (curbWidth) strip(start,true,.17,.17);
    }
  }
  deck(root: Group, road: CityRoad): void {
    const edges = roadEdges(road), extra = road.structure?.barrierOffset ?? 0;
    const walk = road.sidewalk?.enabled ? road.sidewalk.width : 0;
    const left = edges.left - Math.max(extra, walk), right = edges.right + Math.max(extra, walk);
    const top=clipRoadJunctionPavement(this.strip(road,left,right,.024),road,this.map),frames=this.roadFrames(road);
    const continuedStart=this.continued(road,'start','bridge'),continuedEnd=this.continued(road,'end','bridge');
    const ends=[{frame:frames[0]!,continued:continuedStart},{frame:frames.at(-1)!,continued:continuedEnd}];
    const skipBoundary=(a:readonly number[],b:readonly number[])=>ends.some(({frame:f,continued})=>continued&&[a,b].every(p=>Math.abs((p[0]!-f.point.x)*f.tangent.x+(p[2]!-f.point.z)*f.tangent.z)<.001));
    this.add(root,'bridge solid deck',solidifySurface(top,.674,{omitTop:true,skipBoundary}),this.materials.curb,'bridge-deck');
  }
  barrier(root: Group, points: CityPoint[], side: number, concrete: boolean, sharedMedian: boolean,
    sharedPost: () => BufferGeometry): void {
    const frames = sweepFrames(simplifyStructurePath(points),Infinity);
    const profile = (values: [number, number][]): SweepProfilePoint[] => values.map(([offset, height]) => ({ offset: offset * side, height }));
    // Profiles fit the existing collision envelope (the eligibility gate requires
    // a shoulder reserve). Shared medians use their explicit inter-lane gap.
    if (concrete) {
      this.add(root, 'road barrier', sweepSolid(frames, () => profile(sharedMedian ? [
        [-.12, .024], [.12, .024], [.12, .32], [.065, .65], [.065, 1.1], [-.065, 1.1], [-.065, .65], [-.12, .32],
      ] : [[-.12, .024], [.12, .024], [.12, 1.1], [.04, 1.1], [.04, .65], [-.12, .32]])), this.materials.curb, 'concrete-barrier');
      return;
    }
    this.add(root, 'road barrier', sweepSolid(frames, () => profile([
      [-.115, .55], [-.04, .60], [-.115, .68], [-.04, .76], [-.115, .84], [-.095, .85], [-.015, .76], [-.09, .68], [-.015, .60], [-.095, .54],
    ])), this.materials.metal, 'metal-rail');
    const length = frames.at(-1)!.station;
    const count = Math.max(1, Math.floor(length / ROAD_GEOMETRY_BUDGET.postSpacing));
    const posts = new InstancedMesh(sharedPost(), this.materials.darkMetal, count);
    posts.name = 'road guardrail posts'; posts.castShadow = true; posts.userData.roadStructureKind = 'guardrail-posts';
    let segment = 0;
    for (let i = 0; i < count; i++) {
      const station = (i + .5) * length / count;
      while (segment + 1 < frames.length - 1 && frames[segment + 1]!.station < station) segment++;
      const a = frames[segment]!, b = frames[segment + 1]!;
      const t = (station - a.station) / Math.max(1e-8, b.station - a.station);
      const right = a.right.clone().lerp(b.right, t).normalize(), up = a.normal.clone().lerp(b.normal, t).normalize();
      const back = new Vector3().crossVectors(right, up).normalize(); up.crossVectors(back, right).normalize();
      const position = a.point.clone().lerp(b.point, t).addScaledVector(up, .55);
      posts.setMatrixAt(i, new Matrix4().makeBasis(right, up, back).setPosition(position));
    }
    posts.computeBoundingSphere(); root.add(posts);
  }
  median(root: Group, points: CityPoint[]): void {
    this.add(root, 'road central barrier', sweepSolid(sweepFrames(simplifyStructurePath(points),Infinity), () => [
      { offset: -.12, height: .024 }, { offset: .12, height: .024 }, { offset: .12, height: .32 },
      { offset: .065, height: .65 }, { offset: .065, height: 1.1 }, { offset: -.065, height: 1.1 },
      { offset: -.065, height: .65 }, { offset: -.12, height: .32 },
    ]), this.materials.curb, 'median');
  }
  enclosureWall(root: Group, road: CityRoad, points: CityPoint[], side: number): void {
    const enclosure = road.structure!.enclosure!, clearance = runtimeRoadClearance(this.map);
    const chain=roadEdgeChains(this.map).barrierEdge(road,side,true),start=points[0]!,end=points.at(-1)!;
    const capStart=!(this.continued(road,'start',enclosure.kind)&&Math.hypot(start.x-chain[0]!.x,start.z-chain[0]!.z)<.06),capEnd=!(this.continued(road,'end',enclosure.kind)&&Math.hypot(end.x-chain.at(-1)!.x,end.z-chain.at(-1)!.z)<.06);
    this.add(root, 'retaining wall', sweepSolid(sweepFrames(points), f => {
      const top = enclosure.kind === 'cutting' ? retainingWallHeight(road, { x: f.point.x, y: f.point.y, z: f.point.z }, clearance) : enclosure.clearance;
      return [{ offset: 0, height: 0 }, { offset: side * .3, height: 0 }, { offset: side * .3, height: top }, { offset: 0, height: top }];
    },{capStart,capEnd}), this.materials.wall, enclosure.kind === 'cutting' ? 'cutting-wall' : 'tunnel-wall');
  }
  roof(root: Group, road: CityRoad): void {
    const enclosure = road.structure!.enclosure!, edges = roadEdges(road);
    // Match the actual wall frames, including any portal barrier-offset blend.
    const chain = roadEdgeChains(this.map), left = chain.barrierEdge(road, -1,true), right = chain.barrierEdge(road, 1,true);
    const frames = this.roadFrames(road);
    let station=0;
    const roof=sweepSolid(frames,f=>{const i=station++,squared=f.right.lengthSq(),offset=(p:CityPoint)=>((p.x-f.point.x)*f.right.x+(p.z-f.point.z)*f.right.z)/squared,a=offset(left[i]!)-.3,b=offset(right[i]!)+.3,y=enclosure.clearance;return [{offset:a,height:y},{offset:b,height:y},{offset:b,height:y+.65},{offset:a,height:y+.65}];},{capStart:!this.continued(road,'start',enclosure.kind),capEnd:!this.continued(road,'end',enclosure.kind)});
    this.add(root, 'tunnel ceiling and portals',roof,this.materials.wall,'tunnel-roof');
    root.userData.tunnelClearWidth = edges.width;
  }
  *finishRoadSteps(root: Group, road: CityRoad, pavement: BufferGeometry): Generator<void> {
    const entry=this.cache.entry(road.id);
    const index = entry.index??=new PavementTriangleIndex([pavement]);this.cache.account(road.id);
    const paints: Mesh[] = [];
    root.traverse(o => { if (o instanceof Mesh && o.userData.markingOwner) paints.push(o); });
    root.updateMatrixWorld(true);const identity=new Matrix4();
    for (const mesh of paints) {
      const indices=[index];
      if(mesh.userData.markingOwner==='merge'){
        mesh.geometry.computeBoundingBox();const ids=this.mergeSurfaceIds(road,[mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld)]);indices.length=0;
        // Large dependency sets are bounded work batches, never a legacy path.
        for(let i=0;i<ids.length;i+=12){yield;const batch=ids.slice(i,i+12),key='merge:'+batch.join('|'),entry=this.cache.entry(key);if(!entry.index){const surfaces=batch.map(id=>this.pavement(this.roadById.get(id)!));entry.index=new PavementTriangleIndex(surfaces);surfaces.forEach(s=>s.dispose());this.cache.account(key);}indices.push(entry.index);}
      }
      const transformed=!mesh.matrixWorld.equals(identity),source=transformed?mesh.geometry.clone().applyMatrix4(mesh.matrixWorld):mesh.geometry;
      const parts:BufferGeometry[]=[];for(const ownerIndex of indices)parts.push(yield* ownerIndex.projectPaintSteps(source));
      const projected=parts.length===1?parts[0]!:mergeGeometries(parts)!;if(parts.length>1)parts.forEach(p=>p.dispose());
      if(transformed){source.dispose();projected.applyMatrix4(mesh.matrixWorld.clone().invert());}
      mesh.geometry.dispose(); mesh.geometry = projected;
      mesh.userData.roadGeometryTrial = true;
    }
  }
  junctionPavement(j: CityIntersection): BufferGeometry | undefined {
    return excludePavement(junctionPavementGeometry(j,this.map),this.islandMasks(j));
  }
  *finishIntersectionSteps(root: Group, j: CityIntersection, pavement: BufferGeometry): Generator<void> {
    root.updateMatrixWorld(true);
    const worldPavement = pavement.clone().applyMatrix4(root.matrixWorld);
    const paints: Mesh[] = [];
    root.traverse(o => { if (o instanceof Mesh && o.userData.markingOwner) paints.push(o); });
    for (const paint of paints) {
      const port = paint.userData.approachPort as string;
      const key='junction:'+j.id+':'+port,entry=this.cache.entry(key);
      let index = entry.index;
      if (!index) {
        const roadId = j.connections.find(c => c.port === port)?.roadId, road = roadId?this.roadById.get(roadId):undefined;
        const surfaces = [worldPavement];
        if (road) surfaces.push(this.pavement(road));
        index = new PavementTriangleIndex(surfaces); entry.index=index;this.cache.account(key);
        surfaces.slice(1).forEach(s => s.dispose());
      }
      const world = paint.geometry.clone().applyMatrix4(root.matrixWorld);
      const projected = (yield* index.projectPaintSteps(world)).applyMatrix4(root.matrixWorld.clone().invert());
      world.dispose(); paint.geometry.dispose(); paint.geometry = projected; paint.userData.roadGeometryTrial = true;
      yield;
    }
    worldPavement.dispose();
  }
}

/** Preserve bends, grades and opening endpoints; straight beams need two rings. */
export function simplifyStructurePath(points:readonly CityPoint[]):CityPoint[]{
  if(points.length<3)return [...points];const result=[points[0]!];
  for(let i=1;i+1<points.length;i++){const a=result.at(-1)!,b=points[i]!,c=points[i+1]!,ux=b.x-a.x,uy=(b.y??0)-(a.y??0),uz=b.z-a.z,vx=c.x-b.x,vy=(c.y??0)-(b.y??0),vz=c.z-b.z,scale=Math.hypot(ux,uy,uz)*Math.hypot(vx,vy,vz);if(ux*vx+uy*vy+uz*vz<=0||Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)>scale*1e-8)result.push(b);}
  result.push(points.at(-1)!);return result;
}
