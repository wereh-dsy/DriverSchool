import fs from'node:fs';import{createHash}from'node:crypto';
const file='src/world/regional/regional-main.json',raw=fs.readFileSync(file),digest=createHash('sha256').update(raw).digest('hex'),map=JSON.parse(raw),receipt=JSON.parse(fs.readFileSync('artifacts/performance-deep/signs-mapctl-preview.json')),candidate=JSON.parse(fs.readFileSync('artifacts/performance-deep/signs-mapctl-applied-map.json')),review=JSON.parse(fs.readFileSync('artifacts/performance-deep/signs-fix-review.json'));
if(!receipt.summary.valid||receipt.mapDigest!==digest||map.version!==505)throw Error('Map or validated preview changed');
const before=structuredClone(map),ids=new Set(review.changes.map(c=>c.id));
// mapctl loads a normalized editing copy. Transfer only the reviewed signs back
// to the original source so authoring normalization cannot touch road contracts.
map.signs=map.signs.map(s=>ids.has(s.id)?candidate.signs.find(c=>c.id===s.id):s);map.version=506;
if(map.signs.some(s=>!s))throw Error('Missing reviewed sign');
const changed=Object.keys(map).filter(k=>JSON.stringify(map[k])!==JSON.stringify(before[k]));if(changed.some(k=>!['signs','version'].includes(k)))throw Error('Unrelated source field changed');
if(!fs.readFileSync(file).equals(raw))throw Error('Source changed during apply');fs.writeFileSync(file+'.signs-next',JSON.stringify(map,null,2)+'\n');fs.renameSync(file+'.signs-next',file);
fs.writeFileSync('artifacts/performance-deep/signs-applied.json',JSON.stringify({version:506,changedFields:changed,changedSigns:ids.size,ids:[...ids],topologyUnchanged:true,sourceBeforeSHA256:digest,sourceAfterSHA256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')},null,2));console.log({version:506,changedFields:changed,changedSigns:ids.size});
