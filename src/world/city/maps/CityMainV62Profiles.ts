import type { CityMapData, CityRoad } from '../CityMapData';
import { roadPoints, polylineLength } from '../geometry';
import { buildCityRoadNetwork } from '../CityRoadNetwork';
import { cityFeatureCrossings } from './CityMainV6Geography';

/** Authoring-only grade/clearance constraints over existing sampled ramp data. */
export function fitCityV62Ramps(map:CityMapData,ids:ReadonlySet<string>,grade=.0795,fixedObstacleIds?:ReadonlySet<string>):void {
  const clearance=6.05,paths=new Map(map.roads.map(r=>[r.id,roadPoints(r)])),network=buildCityRoadNetwork(map);
  const joined=network.endpointNodes.filter(n=>n.ends.length>1);
  interface Node {y:number;fixed?:number;label:string;edges:{to:number;delta:number}[]}
  const nodes:Node[]=[],indices=new Map<string,number[]>(),stations=new Map<string,number[]>();
  const node=(y:number,label:string,fixed?:number)=>{nodes.push({y:fixed??y,fixed,label,edges:[]});return nodes.length-1;};
  const edge=(a:number,b:number,delta:number)=>nodes[a]!.edges.push({to:b,delta});
  for(const r of map.roads.filter(r=>ids.has(r.id))) {
    const path=paths.get(r.id)!,length=polylineLength(path),distances=[0];for(let i=1;i<path.length;i++)distances.push(distances.at(-1)!+Math.hypot(path[i]!.x-path[i-1]!.x,path[i]!.z-path[i-1]!.z));
    const floor=Math.min(path[0]!.y??0,path.at(-1)!.y??0),ids=path.map((p,i)=>node(floor,r.id+':'+i,i===0||i===path.length-1?p.y??0:undefined));
    indices.set(r.id,ids);stations.set(r.id,distances);
    for(let i=1;i<ids.length;i++){const d=distances[i]!-distances[i-1]!;edge(ids[i-1]!,ids[i]!,-grade*d);edge(ids[i]!,ids[i-1]!,-grade*d);}
    // Keep the existing explicit merge landings, rather than making a ramp
    // climb while it still shares the source lane's pavement.
    for(let i=0;i<ids.length;i++)if(distances[i]!<20||length-distances[i]!<20){nodes[ids[i]!]!.fixed=path[i]!.y??0;nodes[ids[i]!]!.y=path[i]!.y??0;}
  }
  const nearest=(r:CityRoad,station:number)=>{const d=stations.get(r.id)!;let index=0;for(let i=1;i<d.length;i++)if(Math.abs(d[i]!-station)<Math.abs(d[index]!-station))index=i;return indices.get(r.id)![index]!;};
  // A mainline access can cross the retained river before reaching its deck.
  // Hold a real bridge crest across the water, then propagate the same grade
  // constraints into both approaches. Do not change the river or ordinary roads.
  for(const r of map.roads.filter(r=>ids.has(r.id)))for(const feature of map.environment.corridors??[]) {
    if(feature.kind!=='waterway')continue;
    for(const crossing of cityFeatureCrossings(r,feature.centerline)) {
      const half=(feature.width/2+2)/Math.max(.25,crossing.sin),distances=stations.get(r.id)!;
      for(let i=0;i<distances.length;i++) {
        const margin=Math.max(i?distances[i]!-distances[i-1]!:0,i+1<distances.length?distances[i+1]!-distances[i]!:0);
        if(Math.abs(distances[i]!-crossing.station)>half+margin)continue;
        const n=nodes[indices.get(r.id)![i]!]!;
        if(n.fixed!==undefined&&n.fixed<3.2)throw new Error('V6.2 river bridge conflicts with fixed landing '+n.label);
        n.y=Math.max(n.y,3.2);
      }
    }
  }
  const fixed=(y:number,label:string)=>node(y,label,y);
  const seen=new Set<string>();
  for(const r of map.roads.filter(r=>ids.has(r.id)))for(const other of map.roads) {
    if(r===other||fixedObstacleIds&&!fixedObstacleIds.has(other.id))continue;const key=[r.id,other.id].sort().join('|');if(seen.has(key))continue;seen.add(key);
    const a=paths.get(r.id)!,b=paths.get(other.id)!;
    for(const cross of cityFeatureCrossings(r,b)) {
      if(joined.some(n=>n.ends.some(e=>e.roadId===r.id)&&n.ends.some(e=>e.roadId===other.id)&&Math.hypot(n.position.x-cross.point.x,n.position.z-cross.point.z)<180))continue;
      const reverse=cityFeatureCrossings(other,a).find(c=>Math.hypot(c.point.x-cross.point.x,c.point.z-cross.point.z)<.1);if(!reverse)continue;
      const y=cross.point.y??0,yy=reverse.point.y??0,ri=nearest(r,cross.station),oi=ids.has(other.id)?nearest(other,reverse.station):fixed(yy,other.id+' at '+cross.station.toFixed(1));
      let upper=y>=yy;
      if(!ids.has(other.id)) {
        const L=polylineLength(a),minimum=Math.max(Math.min(a[0]!.y??0,a.at(-1)!.y??0),(a[0]!.y??0)-grade*cross.station,(a.at(-1)!.y??0)-grade*(L-cross.station));
        if(!upper&&minimum>yy-clearance)upper=true;
      }
      edge(upper?oi:ri,upper?ri:oi,clearance);
    }
  }
  const queue=nodes.map((_,i)=>i),queued=new Set(queue),changes=new Uint16Array(nodes.length);
  for(let cursor=0;cursor<queue.length;cursor++) {
    const i=queue[cursor]!,n=nodes[i]!;queued.delete(i);
    for(const e of n.edges){const target=nodes[e.to]!,required=n.y+e.delta;if(required<=target.y+1e-7)continue;
      if(target.fixed!==undefined&&required>target.fixed+.025)throw new Error(`V6.2 ramp profile cannot reach ${target.label}: ${required.toFixed(2)} > ${target.fixed.toFixed(2)} from ${n.label}`);
      target.y=required;if(++changes[e.to]!>nodes.length)throw new Error('V6.2 cyclic ramp constraints '+target.label);
      if(!queued.has(e.to)){queued.add(e.to);queue.push(e.to);}
    }
  }
  for(const r of map.roads.filter(r=>ids.has(r.id))) {
    r.centerline=paths.get(r.id)!.map((p,i)=>({...p,y:nodes[indices.get(r.id)![i]!]!.y}));r.curve='polyline';r.elevationMode='custom';delete r.elevation;
    if(r.centerline.some(p=>(p.y??0)<-.1))r.structure={...r.structure,enclosure:{kind:'cutting',clearance:6}};
    else if(r.structure?.enclosure?.kind==='cutting')delete r.structure.enclosure;
  }
}
