import {buildCityRoadNetwork} from '../../src/world/city/CityRoadNetwork';
import type {CityMapData} from '../../src/world/city/CityMapData';
/** Compare every original directed road pair; split descendants retain their lineage. */
export function preserveReachability(before:CityMapData,after:CityMapData){
  const graph=(map:CityMapData)=>{
    const network=buildCityRoadNetwork(map),nodes=new Map<string,Set<string>>(),laneNode=new Map<string,string>();
    for(const r of network.segments)for(const lane of r.lanes){const key=r.id+'|'+lane.direction;nodes.set(key,nodes.get(key)??new Set());laneNode.set(lane.id,key);}
    for(const link of network.laneConnections){const a=laneNode.get(link.fromLaneId),b=laneNode.get(link.toLaneId);if(a&&b)nodes.get(a)!.add(b);}
    return nodes;
  };
  const a=graph(before),b=graph(after),oldIds=before.roads.map(r=>r.id).sort((a,b)=>b.length-a.length),lineage=new Map<string,string[]>();
  for(const id of b.keys()){
    const cut=id.lastIndexOf('|'),road=id.slice(0,cut),direction=id.slice(cut);
    const original=oldIds.find(old=>road===old||road.startsWith(old+'-section'));
    if(original){const key=original+direction,list=lineage.get(key)??[];list.push(id);lineage.set(key,list);}
  }
  const reached=(graph:Map<string,Set<string>>,seeds:string[])=>{const seen=new Set<string>(),queue=[...seeds];while(queue.length){const n=queue.pop()!;if(seen.has(n))continue;seen.add(n);for(const to of graph.get(n)??[])if(!seen.has(to))queue.push(to);}return seen;};
  const losses:{from:string;to:string}[]=[];let pairs=0;
  for(const from of a.keys()){
    const old=reached(a,[from]),next=reached(b,lineage.get(from)??[]);
    for(const to of old){pairs++;if(!(lineage.get(to)??[]).some(id=>next.has(id)))losses.push({from,to});}
  }
  return {sources:a.size,verifiedPairs:pairs,losses};
}
