import { runSU7MaxSelfTest } from '../src/vehicle/SU7Max.selftest';
import { mkdirSync, writeFileSync } from 'node:fs';
const result={su7Max:runSU7MaxSelfTest()};
mkdirSync('artifacts/su7-max-2026',{recursive:true});
writeFileSync('artifacts/su7-max-2026/selftest-results.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
