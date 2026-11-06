import {mkdirSync,writeFileSync} from 'node:fs';
import {runSU7PresentationSelfTest} from '../src/vehicle/SU7Presentation.selftest';
const result=runSU7PresentationSelfTest();mkdirSync('artifacts/su7-presentation-2026-10-31',{recursive:true});
writeFileSync('artifacts/su7-presentation-2026-10-31/basic-selftest.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
