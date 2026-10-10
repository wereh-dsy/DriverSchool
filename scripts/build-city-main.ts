/** Rebuild City Main through the existing checked City pipeline; invalid output is never saved. */
import { readFileSync,writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { buildCityMainV3 } from '../src/world/city/maps/CityMainV3Recipe';
import { saveMap, validateMap } from '../src/world/city/MapAPI';
import { runCityMainSelfTest } from '../src/world/city/CityMain.selftest';
import { runCityMainV3SelfTest } from '../src/world/city/CityMainV3.selftest';
const map = buildCityMainV3(JSON.parse(readFileSync('artifacts/city-main-v3/v2-base.json','utf8'))), report = validateMap(map);
if (!report.valid) throw new Error(JSON.stringify(report.errors));
runCityMainSelfTest(map,false);
runCityMainV3SelfTest(map);
const destination = 'src/world/city/maps/city-main.json', temporary = destination + '.tmp-' + process.pid;
try { writeFileSync(temporary, saveMap(map), 'utf8'); renameSync(temporary, destination); }
finally { if (existsSync(temporary)) unlinkSync(temporary); }
console.log(JSON.stringify({ saved: destination, roads: map.roads.length, intersections: map.intersections.length,
  objects: map.objects.length, metadata: map.environment.metadata, errors: report.errorCount, warnings: report.warnings }, null, 2));
