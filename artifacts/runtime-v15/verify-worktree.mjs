import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const output=new URL('./',import.meta.url),before=JSON.parse(fs.readFileSync(new URL('starting-worktree.json',output)));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const changed=before.files.filter(row=>!fs.existsSync(row.path)||hash(row.path)!==row.sha256).map(row=>row.path);
const releases=before.releases.map(row=>({...row,unchanged:hash(row.path)===row.sha256}));
const map=before.files.find(row=>row.path==='src/world/regional/regional-main.json');
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const result={head,headUnchanged:head===before.head,mapUnchanged:hash(map.path)===map.sha256,releases,changedExistingFiles:changed,
  newTaskFiles:['src/world/regional/RoadStreamCorridor.ts','src/world/city/RoadVisualCompleteness.ts','src/game/runtime/RuntimeStreaming.selftest.ts'],
  vehicleFilesUnchanged:!changed.some(p=>p.startsWith('src/vehicle/'))};
fs.writeFileSync(new URL('worktree-verification.json',output),JSON.stringify(result,null,2));
console.log(result);
