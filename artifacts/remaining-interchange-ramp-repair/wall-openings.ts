import {dir,read,write,hash,central} from './common';
import assert from 'node:assert/strict';
const map=read(dir+'candidate-map.json'),baseline=read(dir+'baseline-map.json'),updates=[];
for(const [id,branch] of [['ns-tunnel:southbound','v91-ns-sb-off'],['ns-tunnel:northbound-split','v91-ns-nb-on']]){
 const road=map.roads.find((r:any)=>r.id===id),before=structuredClone(road.structure);
 assert.equal(road.structure.enclosure.kind,'tunnel');
 road.structure.enclosure.branchOpenings=[branch];updates.push({roadId:id,branchRoadId:branch,before,after:road.structure,reason:'Verified side wall crosses the explicit NS main/frontage ramp around z=633–644m; render and collision use shared clipped wall sections.'});
}
assert.equal(hash(map.roads.filter(central)),hash(baseline.roads.filter(central)));
write('candidate-map.json',map);write('tunnel-wall-openings.json',{updates,mainlineCenterlinesUnchanged:true,centralGeometryUnchanged:true});
console.log(JSON.stringify({opened:updates.map(u=>u.roadId)}));
