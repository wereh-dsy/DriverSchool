import fs from 'node:fs';
const out='artifacts/runtime-v4/release/';fs.mkdirSync(out,{recursive:true});
for(const file of ['smoke-release.mjs','verify-package.mjs','hide-startup-window.mjs'])fs.writeFileSync(out+file,fs.readFileSync('artifacts/runtime-v3/release/'+file,'utf8').replaceAll('runtime-v3','runtime-v4').replaceAll('DriverSchool-RuntimeV2-Phase3-20261117','DriverSchool-RuntimeV2-Phase4-20261118').replaceAll('.tmp-runtime-phase3-release-profile','.tmp-runtime-phase4-release-profile'));
fs.writeFileSync('artifacts/runtime-v4/release.ps1',fs.readFileSync('artifacts/runtime-v3/release.ps1','utf8').replaceAll('runtime-v3','runtime-v4').replaceAll('DriverSchool-RuntimeV2-Phase3-20261117','DriverSchool-RuntimeV2-Phase4-20261118'));
