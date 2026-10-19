import fs from 'node:fs';
const map=JSON.parse(fs.readFileSync('src/world/regional/regional-main.json','utf8').replace(/^\uFEFF/,''));
const match=id=>id.includes('north-roundabout');
const roads=map.roads.filter(r=>match(r.id)).map(r=>r.id);
const out={roads, links:(map.roadLinks??[]).filter(l=>match(l.from.roadId)||match(l.to.roadId)), ports:(map.connectionPorts??[]).filter(p=>match(p.endpoint.roadId)), junctions:map.intersections.filter(j=>j.connections.some(c=>match(c.roadId))||match(j.id)).map(j=>j.id), corridors:map.editing?.corridors?.filter(c=>c.roadIds?.some(match)).map(c=>c.id), groups:map.editing?.groups?.filter(g=>g.memberIds?.some(match)).map(g=>g.id), signs:(map.signs??[]).filter(s=>match(s.roadId)).map(s=>s.id), objects:map.objects.filter(o=>o.roadIds?.some(match)).map(o=>o.id), landmarks:(map.environment?.landmarks??[]).filter(l=>l.roadIds?.some(match)).map(l=>l.id)};
console.log(JSON.stringify(out,null,2));
