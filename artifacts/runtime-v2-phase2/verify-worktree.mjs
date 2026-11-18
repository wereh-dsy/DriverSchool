import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const output=new URL('./',import.meta.url),before=JSON.parse(fs.readFileSync(new URL('starting-worktree.json',output)));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const changed=before.files.filter(row=>!fs.existsSync(row.path)||hash(row.path)!==row.sha256).map(row=>row.path);
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src','scripts','docs'],{encoding:'utf8'}).trim().split('\n'),original=new Set(before.files.map(row=>row.path));
const qin=new Set(['src/vehicle/visual/QinPlusExterior.ts','src/vehicle/visual/QinPlusDisplays.ts','src/vehicle/visual/QinPlusVisualConfig.ts','src/vehicle/visual/QinPlusCabin.ts','src/vehicle/visual/QinPlusVisual.selftest.ts','src/vehicle/visual/VehicleStructure.selftest.ts','src/vehicle/VehicleCatalog.selftest.ts']);
const map=before.files.find(row=>row.path==='src/world/regional/regional-main.json'),head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const result={head,headUnchanged:head===before.head,mapSHA256:hash(map.path),mapUnchanged:hash(map.path)===map.sha256,
 changedExistingFiles:changed,newFiles:files.filter(file=>!original.has(file)),
 vehicleChanges:changed.filter(file=>file.startsWith('src/vehicle/')),unrelatedVehicleChanges:changed.filter(file=>file.startsWith('src/vehicle/')&&!qin.has(file)),
 releases:before.releases.map(row=>({path:row.path,unchanged:hash(row.path)===row.sha256}))};
fs.writeFileSync(new URL('worktree-verification.json',output),JSON.stringify(result,null,2));console.log(result);
