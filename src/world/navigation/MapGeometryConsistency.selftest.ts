import { Mesh, Vector3 } from 'three';
import type { CityMapData, CityRoad, RoadEndpoint } from '../city/CityMapData';
import { loadCityMap } from '../city/CityMapLoader';
import { buildCityRoadNetwork } from '../city/CityRoadNetwork';
import { roadEdges, roadPoints, rotatePoint } from '../city/geometry';
import { RoadEdgeChains } from '../city/RoadEdgeChain';
import { junctionSurfaceContains, junctionSurfaceHeight } from '../city/JunctionSurface';
import { IntersectionBuilder } from '../city/IntersectionBuilder';
import { createSubject3Materials } from '../subject3/materials';

/** Compare the actual normalized 3D pavement source, endpoint frames and 2D projection. */
export function runMapGeometryConsistencySelfTest(source:CityMapData) {
  let assertions=0,maximumEndpointGap=0,maximumEdgeGap=0,continuationChecks=0,approaches=0;
  const assert=(ok:unknown,message:string)=>{assertions++;if(!ok)throw new Error(`Map geometry consistency: ${message}`);};
  const map=loadCityMap(source),network=buildCityRoadNetwork(map),roads=new Map(map.roads.map(r=>[r.id,r]));
  const paths=new Map(map.roads.map(r=>[r.id,roadPoints(r)]));
  const endpoint=(e:RoadEndpoint)=>{const path=paths.get(e.roadId)!;return e.end==='start'?path[0]!:path.at(-1)!;};
  const gap=(a:{x:number;y?:number;z:number},b:{x:number;y?:number;z:number})=>Math.hypot(a.x-b.x,(a.y??0)-(b.y??0),a.z-b.z);
  for(const link of map.roadLinks??[]){const distance=gap(endpoint(link.from),endpoint(link.to));maximumEndpointGap=Math.max(maximumEndpointGap,distance);assert(distance<=.2,`3D linked endpoints meet: ${link.id} (${distance} m)`);}
  const chains=new RoadEdgeChains(map),edgeCache=new Map<string,{left:ReturnType<RoadEdgeChains['edge']>;right:ReturnType<RoadEdgeChains['edge']>}>();
  const edges=(road:CityRoad)=>{let value=edgeCache.get(road.id);if(!value){const e=roadEdges(road);value={left:chains.edge(road,e.left),right:chains.edge(road,e.right)};edgeCache.set(road.id,value);}return value;};
  for(const link of map.roadLinks??[]) {
    const a=roads.get(link.from.roadId)!,b=roads.get(link.to.roadId)!;
    if(!chains.continuations(a.id).has(b.id))continue;
    const ae=edges(a),be=edges(b),at=(path:readonly {x:number;y?:number;z:number}[],end:'start'|'end')=>end==='start'?path[0]!:path.at(-1)!;
    const al=at(ae.left,link.from.end),ar=at(ae.right,link.from.end),bl=at(be.left,link.to.end),br=at(be.right,link.to.end);
    const distance=Math.min(Math.max(gap(al,bl),gap(ar,br)),Math.max(gap(al,br),gap(ar,bl)));
    maximumEdgeGap=Math.max(maximumEdgeGap,distance);continuationChecks++;
    assert(distance<.001,`actual 3D pavement edge frames match: ${link.id} (${distance} m)`);
  }
  const materials=createSubject3Materials(),builder=new IntersectionBuilder(map,materials),vector=new Vector3();
  try {
    for(const j of map.intersections) {
      const logical=network.intersections.find(n=>n.id===j.id)!,outline=j.pavementFootprint!;
      assert(outline?.length>=3&&logical.pavementFootprint?.length===outline.length,`one normalized 2D/3D footprint: ${j.id}`);
      assert(junctionSurfaceContains(j,map,j.position,.0001),`3D fan hub belongs to the shared pavement footprint: ${j.id}`);
      const signed=outline.map((p,i)=>{const q=outline[(i+1)%outline.length]!;return p.x*q.z-q.x*p.z;});
      assert(Math.abs(signed.reduce((sum,value)=>sum+Math.abs(value),0)-Math.abs(signed.reduce((sum,value)=>sum+value,0)))<.0001,`3D fan triangles do not overlap outside the 2D footprint: ${j.id}`);
      const root=builder.build(j);root.updateMatrixWorld(true);
      try {
        const pavement=root.getObjectByName('junction pavement') as Mesh;
        assert(pavement instanceof Mesh,`3D junction pavement exists: ${j.id}`);
        const position=pavement.geometry.getAttribute('position');
        for(let i=0;i<outline.length;i++) {
          vector.set(position.getX(i+1),position.getY(i+1),position.getZ(i+1)).applyMatrix4(pavement.matrixWorld);
          const expected=logical.pavementFootprint![i]!;
          assert(Math.hypot(vector.x-expected.x,vector.z-expected.z)<.001,`2D footprint is the actual 3D projection: ${j.id}`);
        }
        for(const connection of j.connections) {
          const road=roads.get(connection.roadId)!,p=endpoint(connection),boundary=edges(road);
          const left=connection.end==='start'?boundary.left[0]!:boundary.left.at(-1)!,right=connection.end==='start'?boundary.right[0]!:boundary.right.at(-1)!;
          assert(Math.abs((p.y??0)-junctionSurfaceHeight(j,p))<.05,`physical approach/junction height agrees: ${j.id}/${road.id}`);
          for(const t of [.05,.25,.5,.75,.95]) {
            const q={x:left.x+(right.x-left.x)*t,z:left.z+(right.z-left.z)*t};
            assert(junctionSurfaceContains(j,map,q,.05),`3D junction covers the approach mouth: ${j.id}/${road.id}/${t}`);
          }
          approaches++;
        }
        // A rotated/skewed polygon must keep the same world projection as the mesh.
        const p=rotatePoint(outline[0]!,j.rotation);
        assert(Math.hypot(logical.pavementFootprint![0]!.x-j.position.x-p.x,logical.pavementFootprint![0]!.z-j.position.z-p.z)<1e-7,`skewed projection transform: ${j.id}`);
      } finally {root.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});}
    }
  } finally {Object.values(materials).forEach(m=>m.dispose());}
  return {assertions,junctions:map.intersections.length,approaches,links:map.roadLinks?.length??0,continuationChecks,maximumEndpointGap,maximumEdgeGap};
}
