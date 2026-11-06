import { writeFileSync } from 'node:fs';
import { runP2HybridSelfTest } from '../src/vehicle/P2Hybrid.selftest';
import { runTank500DriveabilitySelfTest } from '../src/vehicle/Tank500Driveability.selftest';
import { runTank500DisplaysSelfTest } from '../src/vehicle/visual/Tank500Displays.selftest';
import { runTank500RefinementSelfTest } from '../src/vehicle/visual/Tank500Refinement.selftest';

const report = { scope: 'P2 / Tank driveability / HMI / driver access and cabin only', p2: runP2HybridSelfTest(),
  driveability: runTank500DriveabilitySelfTest(), displays: runTank500DisplaysSelfTest(), visualAccess: runTank500RefinementSelfTest() };
writeFileSync('artifacts/tank500-refinement-2026-11-06/selftest-results.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ p2Assertions: report.p2.assertions, driveability: report.driveability,
  displays: report.displays, visualAccess: report.visualAccess }, null, 2));
