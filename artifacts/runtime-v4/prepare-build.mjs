import fs from 'node:fs';
fs.writeFileSync('artifacts/runtime-v4/build.ps1',fs.readFileSync('artifacts/runtime-v3/build.ps1','utf8').replaceAll('runtime-v3','runtime-v4').replaceAll('phase3Exit','phase4Exit'));
fs.writeFileSync('artifacts/runtime-v4/verify-build.mjs',fs.readFileSync('artifacts/runtime-v3/verify-build.mjs','utf8').replaceAll('runtime-v3','runtime-v4'));
