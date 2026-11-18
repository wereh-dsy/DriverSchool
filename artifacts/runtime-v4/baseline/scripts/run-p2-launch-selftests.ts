import { mkdirSync, writeFileSync } from 'node:fs';
import { runP2HybridLaunchSelfTest } from '../src/vehicle/P2HybridLaunch.selftest';

const report = runP2HybridLaunchSelfTest();
mkdirSync('artifacts/p2-launch-fix-2026-11-13', { recursive: true });
writeFileSync('artifacts/p2-launch-fix-2026-11-13/launch-results.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
