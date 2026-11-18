import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runTank500DrivelineSelfTest } from '../src/vehicle/Tank500Driveline.selftest';
import { runTank500PowerThermalSelfTest } from '../src/vehicle/Tank500PowerThermal.selftest';
import { runP2HybridSelfTest } from '../src/vehicle/P2Hybrid.selftest';
import { runP2HybridLaunchSelfTest } from '../src/vehicle/P2HybridLaunch.selftest';
import { runTank500DisplaysSelfTest } from '../src/vehicle/visual/Tank500Displays.selftest';
import { runTank500HybridControlSelfTest } from '../src/vehicle/Tank500HybridControl.selftest';
import { runTank500DriveabilitySelfTest } from '../src/vehicle/Tank500Driveability.selftest';

const out = 'artifacts/tank500-driveline-2026-11-14'; mkdirSync(out, { recursive: true });
const write = (name: string, report: unknown) => writeFileSync(`${out}/${name}.json`, JSON.stringify(report, null, 2) + '\n');
const driveline = runTank500DrivelineSelfTest(); write('driveline', driveline); console.log('driveline', driveline.assertions);
const thermal = runTank500PowerThermalSelfTest(); write('power-thermal', thermal); console.log('power-thermal', thermal.assertions);
const hybrid = runTank500HybridControlSelfTest(); write('hybrid-control', hybrid); console.log('hybrid-control', hybrid.assertions);
const p2 = runP2HybridSelfTest(); write('p2', p2);
const launch = runP2HybridLaunchSelfTest(); write('launch', launch);
const displays = runTank500DisplaysSelfTest();
const driveability = runTank500DriveabilitySelfTest(); write('driveability', driveability);
const before = JSON.parse(readFileSync('artifacts/p2-launch-fix-2026-11-13/p2-results.json', 'utf8').replace(/^\uFEFF/, ''));
const fleet: Record<string, unknown> = {};
for (const id of ['mercedes-e300l-v214', 'tesla-model-3-rwd', 'porsche-taycan-4s', 'xiaomi-su7-max-2026']) {
  if (JSON.stringify(before.results[id]) !== JSON.stringify(p2.results[id])) throw Error('Unrelated fleet sample changed: ' + id);
  fleet[id] = p2.results[id];
}
const report = { assertions: driveline.assertions + thermal.assertions + hybrid.assertions + p2.assertions + launch.assertions + displays.assertions + driveability.assertions,
  suites: { driveline: driveline.assertions, thermal: thermal.assertions, hybrid: hybrid.assertions, p2: p2.assertions, launch: launch.assertions, displays: displays.assertions, driveability: driveability.assertions }, fleet };
write('summary', report); console.log(JSON.stringify(report, null, 2));
