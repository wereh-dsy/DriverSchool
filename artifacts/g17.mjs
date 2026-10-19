import fs from 'node:fs';
const raw=fs.readFileSync('src/world/regional/regional-main.json','utf8').replace(/^\uFEFF/,'');
const map=JSON.parse(raw);
const c=map.editing.corridors.find(c=>c.id==='corridor:G17:expressway'); console.log(JSON.stringify(c,null,2));
console.log('roadNames keys with G17', Object.keys(map.roadNames).filter(k=>k.includes('G17')));
for(const r of map.regional?.routes??[]) if(JSON.stringify(r).includes('G17')) console.log('route',JSON.stringify(r).slice(0,300));
for(const r of map.regional?.highways?.routes??[]) if(JSON.stringify(r).includes('G17')) console.log('hw route',JSON.stringify(r).slice(0,300));
