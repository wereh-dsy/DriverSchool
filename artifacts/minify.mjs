import fs from 'node:fs';
const path='src/world/regional/regional-main.json';
const m=JSON.parse(fs.readFileSync(path,'utf8').replace(/^\uFEFF/,''));
fs.writeFileSync(path,JSON.stringify(m)+'\n');
console.log('version',m.version,'roads',m.roads.length,'intersections',m.intersections.length);
