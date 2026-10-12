import { mkdirSync, writeFileSync } from 'node:fs';
import { runTaycanDisplaysSelfTest } from '../src/vehicle/visual/TaycanDisplays.selftest';
const result = { taycanDisplays: runTaycanDisplaysSelfTest() };
mkdirSync('artifacts/taycan-hmi-v1', { recursive: true });
writeFileSync('artifacts/taycan-hmi-v1/test-results.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
