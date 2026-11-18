import { writeFileSync } from 'node:fs';
import { runP2HybridSelfTest } from '../src/vehicle/P2Hybrid.selftest';
const report = JSON.stringify(runP2HybridSelfTest(), null, 2);
if (process.argv.includes('--report')) writeFileSync('artifacts/p2-hybrid-selftests-2026-11-02.json', report + '\n');
console.log(report);
