import fs from 'node:fs';
const d=JSON.parse(fs.readFileSync('artifacts/city-diagnose-baseline/diagnosis-full.json','utf8'));
const codes=new Set(['vertical.wave','vertical.elevationPointOscillation']);
const ids=[...new Set(d.issues.filter(i=>codes.has(i.code)).map(i=>i.roadId))];
fs.writeFileSync('artifacts/vert-ids.txt',ids.join('\n'));
console.log(ids.length, ids.join('\n'));
