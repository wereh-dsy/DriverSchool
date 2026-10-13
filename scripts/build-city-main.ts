/** Rebuild City Main through the existing checked City pipeline; invalid output is never saved. */
import { readFileSync,writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCityMainV3 } from '../src/world/city/maps/CityMainV3Recipe';
import { saveMap, validateMap } from '../src/world/city/MapAPI';
import { runCityMainSelfTest } from '../src/world/city/CityMain.selftest';
import { runCityMainV3SelfTest } from '../src/world/city/CityMainV3.selftest';
const outIndex = process.argv.indexOf('--out');
const destination = outIndex >= 0 ? process.argv[outIndex + 1] : 'src/world/city/maps/city-main.json';
if (!destination || destination.startsWith('--')) throw new Error('--out requires a JSON file path.');
if (resolve(destination).toLowerCase() === resolve('src/world/city/maps/city-main.json').toLowerCase() && !process.argv.includes('--revision-v3'))
  throw new Error('This is the historical V3 generator. Use --out <separate.json>, or --revision-v3 to explicitly replace the city-only source. It does not rebuild the regional menu map.');
const map = buildCityMainV3(JSON.parse(readFileSync('artifacts/city-main-v3/v2-base.json','utf8'))), report = validateMap(map);
if (!report.valid) throw new Error(JSON.stringify(report.errors));
runCityMainSelfTest(map,false);
runCityMainV3SelfTest(map);
const temporary = destination + '.tmp-' + process.pid;
try { writeFileSync(temporary, saveMap(map), 'utf8'); renameSync(temporary, destination); }
finally { if (existsSync(temporary)) unlinkSync(temporary); }
console.log(JSON.stringify({ saved: destination, roads: map.roads.length, intersections: map.intersections.length,
  objects: map.objects.length, metadata: map.environment.metadata, errors: report.errorCount, warnings: report.warnings }, null, 2));
