import fs from 'node:fs';
const b=JSON.parse(fs.readFileSync('artifacts/city-diagnose-baseline/diagnosis-full.json','utf8'));
const a=JSON.parse(fs.readFileSync('artifacts/city-diagnose-final.json','utf8'));
const codes=['geometry.sharpBend','geometry.awkwardS','vertical.wave','vertical.elevationPointOscillation','vertical.abruptGradeChange','geometry.shortSegments','topology.tinyFragment','topology.lowClearance','topology.expresswayCrossing'];
for(const c of codes){const bc=b.issues.filter(i=>i.code===c).length,ac=a.issues.filter(i=>i.code===c).length;console.log(`${c}: ${bc} -> ${ac}`);}
const fixedWave=[...new Set(b.issues.filter(i=>i.code==='vertical.wave').map(i=>i.roadId))].filter(id=>!a.issues.some(i=>i.code==='vertical.wave'&&i.roadId===id));
console.log('fixed waves',fixedWave);
const fixedOsc=[...new Set(b.issues.filter(i=>i.code==='vertical.elevationPointOscillation').map(i=>i.roadId))].filter(id=>!a.issues.some(i=>i.code==='vertical.elevationPointOscillation'&&i.roadId===id));
console.log('fixed osc',fixedOsc);
const fixedBend=[...new Set(b.issues.filter(i=>i.code==='geometry.sharpBend').map(i=>i.roadId))].filter(id=>!a.issues.some(i=>i.code==='geometry.sharpBend'&&i.roadId===id));
console.log('fixed bends',fixedBend);
const sel=['v4-industrial-split-2-split','system-south:S-to-E-right','system-south:W-to-S-right','system-south:S-to-W-semi','system-central:W-to-S-right','v61-exhibition-road-split-split-split','system-west:W-to-N-loop','system-central:S-to-W-semi','system-central:N-to-E-semi','system-central:E-to-S-semi','system-west:E-to-N-right','system-west:N-to-E-loop','system-east:S-to-W-turbine','system-east:N-to-E-turbine','system-north:S-to-W-star'];
console.log('abrupt selected before->after');
for(const id of sel){const f=d=>d.issues.find(i=>i.code==='vertical.abruptGradeChange'&&i.roadId===id)?.metrics.gradeChangePercent;const bv=f(b),av=f(a);if(bv!==av)console.log(`${id}: ${bv} -> ${av}`);}
