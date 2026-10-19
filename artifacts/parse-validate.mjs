import fs from 'node:fs';
const raw=fs.readFileSync('artifacts/validate-final.json','utf8');
const start=raw.indexOf('{'); const v=JSON.parse(raw.slice(start));
console.log(JSON.stringify({valid:v.valid,full:v.full,errorCount:v.errorCount,warningCount:v.warningCount,issues:v.issues.length}));
const by={}; for(const i of v.issues) by[i.code]=(by[i.code]??0)+1;
console.log(JSON.stringify(by,null,2));
console.log(v.issues.filter(i=>i.severity==='error').slice(0,10));
