import fs from 'node:fs';
import { build } from 'esbuild';
const bundle = await build({ stdin: { contents: `export {runFastRoadSignPlacementSelfTest} from './src/world/regional/FastRoadSignPlacement.selftest';export {runRegionalWorldSelfTest} from './src/world/regional/RegionalWorld.selftest';export {runHighwaySystemSelfTest} from './src/world/regional/HighwaySystem.selftest';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
try {
  const api = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  const read = p => JSON.parse(fs.readFileSync(p, 'utf8')), regional = read('src/world/regional/regional-main.json'), city = read('src/world/city/maps/city-main.json');
  const report = { placement: api.runFastRoadSignPlacementSelfTest([regional, city]), regional: api.runRegionalWorldSelfTest(regional, city), highway: api.runHighwaySystemSelfTest(regional, read('artifacts/highway-system/baseline.json')) };
  fs.mkdirSync('artifacts/road-signs-2026-10-16', { recursive: true }); fs.writeFileSync('artifacts/road-signs-2026-10-16/tests.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ assertions: report.placement.assertions, maps: report.placement.maps, regionalChecks: report.regional.checks.length, highwayChecks: report.highway.checks.length }, null, 2));
} catch (error) { console.error(String(error.stack ?? error).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g, '<road-sign-tests>')); process.exitCode = 1; }
