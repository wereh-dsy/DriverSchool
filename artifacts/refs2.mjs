import fs from 'node:fs';
const map=JSON.parse(fs.readFileSync('src/world/regional/regional-main.json','utf8').replace(/^\uFEFF/,''));
const ids=map.roads.filter(r=>r.id.includes('north-roundabout')).map(r=>r.id);
const editing=map.editing??{};
console.log('corridors structure sample', Object.keys(editing.corridors?.[0]??{}));
for(const c of editing.corridors??[]){const hit=(c.roadIds??[]).filter(r=>ids.includes(r)); if(hit.length) console.log('corridor',c.id,hit);}
for(const g of editing.groups??[]){const hit=(g.memberIds??[]).filter(r=>ids.includes(r)); if(hit.length) console.log('group',g.id,hit);}
for(const key of ['routes','structures','exits']){for(const x of map.regional?.[key]??[]){const hit=(x.roadIds??[]).filter(r=>ids.includes(r)); if(hit.length) console.log('regional.'+key,x.id,hit);}}
for(const key of ['routes','junctions','exits','services']){for(const x of map.regional?.highways?.[key]??[]){const hit=(x.roadIds??[]).filter(r=>ids.includes(r)); if(hit.length) console.log('regional.highways.'+key,x.id,hit);}}
