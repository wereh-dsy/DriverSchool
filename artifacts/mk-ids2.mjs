import fs from 'node:fs';
const d=JSON.parse(fs.readFileSync('artifacts/city-diagnose-baseline/diagnosis-full.json','utf8'));
const ids=[...new Set(d.issues.filter(i=>i.code==='geometry.sharpBend'||i.code==='geometry.awkwardS').map(i=>i.roadId))];
fs.writeFileSync('artifacts/bend-ids.txt',ids.join('\n')); console.log(ids.length);
