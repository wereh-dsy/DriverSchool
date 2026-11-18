import fs from 'node:fs';import path from 'node:path';
const file='docs/RUNTIME_V2_PHASE4_2026-11-18.md',text=fs.readFileSync(file,'utf8'),links=[...text.matchAll(/\]\(([^)]+)\)/g)].map(m=>m[1]).filter(p=>!p.includes('://')),missing=links.filter(p=>!fs.existsSync(path.resolve(path.dirname(file),p)));
if(missing.length)throw Error('Missing report links: '+missing.join(','));
const d=JSON.parse(fs.readFileSync('artifacts/runtime-v4/targeted.json','utf8')),r=JSON.parse(fs.readFileSync('artifacts/runtime-v4/recovery.json','utf8'));
const summary={linksChecked:links.length,targeted:{passed:d.stage==='done'&&d.cancelled&&d.retried&&!d.errors.length,maps:d.maps.map(x=>x.id),hiddenFrameCountStable:d.visibility.before===d.visibility.hidden,exitRecords:d.lifecycle.resources.renderWorld.records,exitResourceRegistrations:d.lifecycle.resources.graph.residency.registered},recovery:{passed:r.passed,simulationContinues:r.simulationContinues,newRendererReady:r.newRendererReady},build:'pending'};
fs.writeFileSync('artifacts/runtime-v4/functional-summary.json',JSON.stringify(summary,null,2));console.log(summary);
