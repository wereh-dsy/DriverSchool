import fs from 'node:fs';
const map=JSON.parse(fs.readFileSync('src/world/regional/regional-main.json','utf8').replace(/^\uFEFF/,''));
for(const id of ['corridor:G17:expressway','corridor:north-avenue:arterial','corridor:v9-chengjing-road:frontage-2']){
 const c=map.editing.corridors.find(c=>c.id===id); console.log(id, 'roadIds', c.roadIds.length, c.roadIds.slice(0,10)); }
