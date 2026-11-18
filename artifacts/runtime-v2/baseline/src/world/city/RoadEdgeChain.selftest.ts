import { newCityMap, type CityRoad } from './CityMapData';
import { RoadEdgeChains } from './RoadEdgeChain';
import { roadEdgeStrip } from './RoadEdgeChain';
import { clipRoadJunctionPavement } from './JunctionSurface';
import { Mesh, MeshBasicMaterial, DoubleSide, Raycaster, Vector3 } from 'three';

export function runRoadEdgeChainSelfTest() {
  let assertions = 0;
  const assert = (ok: boolean, message: string) => { assertions++; if (!ok) throw new Error(`Road edge chain: ${message}`); };
  const road = (id: string, centerline: CityRoad['centerline']): CityRoad => ({ id, centerline, type: 'ramp_1',
    laneCount: 1, laneWidth: 3.9, travelDirection: 'forward', speedLimit: 40, structure: { barrierEnabled: true } });
  const verify = (roads: CityRoad[], pairs: [string, string][]) => {
    const map = { ...newCityMap(), roads, roadLinks: pairs.map(([from, to], i) => ({ id: `link-${i}`,
      from: { roadId: from, end: 'end' as const }, to: { roadId: to, end: 'start' as const } })) };
    const chains = new RoadEdgeChains(map);
    assert(chains.corridors.flatMap(c => c.roadIds).length === roads.length, 'each road belongs to exactly one corridor');
    assert(new Set(chains.corridors.flatMap(c => c.roadIds)).size === roads.length, 'no repeated road ownership');
    for (const r of roads) for (const side of [-1, 1]) {
      const edge = chains.barrierEdge(r, side);
      assert(edge.length === r.centerline.length && edge.every(p => Number.isFinite(p.x + p.z + (p.y ?? 0))), `${r.id}: complete finite frames`);
    }
    return chains;
  };
  const a = road('a', [{ x: -20, z: 0 }, { x: 0, z: 0 }]);
  const b = road('b', [{ x: 0, z: 0 }, { x: 20, z: 0 }]);
  const c = road('c', [{ x: 0, z: 0 }, { x: 20, z: 1 }]);
  assert(verify([b, a], [['a', 'b']]).corridors.length === 1, 'straight continuation is independent of authored order');
  for (const roads of [[a, b, c], [c, b, a], [b, a, c]]) {
    assert(verify(roads, [['a', 'b'], ['a', 'c']]).corridors.length === 3, 'ambiguous fork never joins through a one-way neighbour');
  }
  const ring = Array.from({ length: 4 }, (_, quarter) => road(`ring-${quarter}`, Array.from({ length: 17 }, (_, i) => {
    const angle = (quarter + i / 16) * Math.PI / 2;
    return { x: 100 * Math.cos(angle), z: 100 * Math.sin(angle) };
  })));
  const closed = verify(ring, ring.map((r, i) => [r.id, ring[(i + 1) % ring.length]!.id]));
  assert(closed.corridors.length === 1 && closed.corridors[0]!.roadIds.length === 4, 'closed ring owns every road once');
  const main={...road('main',[{x:0,y:8,z:0},{x:0,y:8,z:-100}]),type:'highway' as const,laneCount:3,laneWidth:3.75};
  const branch={...road('branch',[{x:0,y:8,z:0},{x:5,y:8,z:-30},{x:25,y:8,z:-100}]),gore:{start:true,end:false,length:60}};
  const fork={...newCityMap(),roads:[main,branch],roadLinks:[{id:'fork',from:{roadId:'main',end:'start' as const},to:{roadId:'branch',end:'start' as const}}]};
  const frames=new RoadEdgeChains(fork),aEdge=frames.edge(main,1),bEdge=frames.edge(branch,1);
  assert(Math.hypot(aEdge[0]!.x-bEdge[0]!.x,aEdge[0]!.z-bEdge[0]!.z)<1e-7,'narrow branch inherits exact mainline cross-section');
  const material=new MeshBasicMaterial({side:DoubleSide}),ray=new Raycaster();
  const surfaces=fork.roads.map(r=>new Mesh(clipRoadJunctionPavement(roadEdgeStrip(r,fork,-r.laneCount*r.laneWidth/2,r.laneCount*r.laneWidth/2,.024),r,fork),material));surfaces.forEach(m=>m.updateMatrixWorld(true));
  for(const [x,z]of [[1,-10],[4,-50],[11,-50]]){ray.set(new Vector3(x!,20,z!),new Vector3(0,-1,0));const hits=surfaces.flatMap(m=>ray.intersectObject(m,false));assert(hits.length===1,'one asphalt owner without a hole at fork '+x+','+z);}
  const upper={...branch,id:'upper',centerline:branch.centerline.map(p=>({...p,y:16}))},upperMap={...fork,roads:[main,upper],roadLinks:[{id:'grade-separated',from:{roadId:'main',end:'start' as const},to:{roadId:'upper',end:'start' as const}}]};
  const untouched=clipRoadJunctionPavement(roadEdgeStrip(upper,upperMap,-1.95,1.95,.024),upper,upperMap);assert(untouched.getAttribute('position').count>0,'overlying asphalt is retained');untouched.dispose();surfaces.forEach(m=>m.geometry.dispose());material.dispose();
  return { assertions };
}
