import {mkdirSync,writeFileSync} from 'node:fs';
import {runSU7ExteriorSelfTest} from '../src/vehicle/visual/SU7Exterior.selftest';
const result=runSU7ExteriorSelfTest(),out='artifacts/su7-exterior-green-2026-11-05';
mkdirSync(out,{recursive:true});writeFileSync(out+'/selftest.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
