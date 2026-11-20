import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');

const releaseBase = 'D:/DriverSchoolRelease/DriverSchool-RuntimeV2-LaneGraph-ADAS-20261119/DriverSchool-win32-x64';
const newExeHash = hash(`${releaseBase}/DriverSchool.exe`);
const newAsarHash = hash(`${releaseBase}/resources/app.asar`);

const previousReleases = [
  {
    name: 'formal-release',
    path: 'D:/DriverSchoolRelease/DriverSchool-win32-x64/resources/app.asar',
    expected: 'bcbb042ec363df0525d0ad13df41f8ce771e3c52d771650bcb54cf33ed0f3526',
  },
  {
    name: 'phase-2.1',
    path: 'D:/DriverSchoolRelease/DriverSchool-RuntimeV2-Phase21-20261117/DriverSchool-win32-x64/resources/app.asar',
    expected: 'd89a61564a6f5b964deaa8e69777855b79a07eb708b16421d8ddfd1cdb10d67c',
  },
  {
    name: 'phase-3',
    path: 'D:/DriverSchoolRelease/DriverSchool-RuntimeV2-Phase3-20261117/DriverSchool-win32-x64/resources/app.asar',
    expected: 'a915e457d0c634d6e0713d7b0725f35739c94e667fb473bab553ec600525e923',
  },
].map(r => {
  const actual = hash(r.path);
  return { ...r, actual, untouched: actual === r.expected };
});

const result = {
  releaseTimestamp: new Date().toISOString(),
  targetDirectory: releaseBase,
  newRelease: {
    exeSHA256: newExeHash,
    asarSHA256: newAsarHash,
  },
  previousReleasesUntouched: previousReleases.every(r => r.untouched),
  previousReleases,
};

writeFileSync('artifacts/release-receipt/package-verification.json', JSON.stringify(result, null, 2), 'utf8');
console.log(JSON.stringify(result, null, 2));
