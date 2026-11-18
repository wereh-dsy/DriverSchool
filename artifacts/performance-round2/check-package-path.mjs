import { existsSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const realpath = realpathSync.native;
const root = realpath('.');
for (const name of ['.desktop', '.desktop/payload', 'release', 'release/DriverSchool-win32-x64']) {
  if (!existsSync(name)) continue;
  const actual = realpath(name);
  if (actual.toLowerCase() !== resolve(root, name).toLowerCase()) throw Error('Unexpected staging target: ' + actual);
  console.log(actual);
}
const parent = realpath(dirname(process.env.DRIVERSCHOOL_RELEASE_DIR));
if (parent.toLowerCase() !== resolve('D:/DriverSchoolRelease').toLowerCase()) throw Error('Unexpected release parent: ' + parent);
console.log(parent);
