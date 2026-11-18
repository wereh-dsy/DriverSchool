import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const start = JSON.parse(readFileSync(new URL('./starting-worktree.json', import.meta.url)));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const changes = start.files.filter(file => hash(file.path) !== file.sha256).map(file => file.path);
const expected = new Set([
  'scripts/check-preload.mjs',
  'scripts/performance-preload.ts',
  'src/game/DrivingGame.ts',
  'src/game/StreamingShaderWarmup.ts',
  'src/loading/Loading.ts',
  'src/world/DrivingGround.ts',
  'src/world/city/CityGround.ts',
  'src/world/city/CityTrafficSignals.ts',
  'src/world/city/FogVisibility.ts',
  'src/world/city/IntersectionBuilder.ts',
  'src/world/city/MidRoadVisual.ts',
  'src/world/city/PrefabRegistry.ts',
  'src/world/city/RoadClearance.ts',
  'src/world/city/RoadEdgeChain.ts',
  'src/world/city/RoadGeometry.ts',
  'src/world/city/RoadGeometryTrialCache.ts',
  'src/world/city/RoadVisualCompiler.ts',
  'src/world/city/SectorManager.ts',
  'src/world/city/VisualStreaming.selftest.ts',
  'src/world/city/VisualStreaming.worker.ts',
  'src/world/city/VisualStreamingData.ts',
  'src/world/city/VisualStreamingWorker.ts',
  'src/world/regional/RegionalBackgroundBatches.ts',
  'src/world/regional/RegionalStreaming.ts',
  'src/world/regional/RegionalTerrain.ts',
]);
for (const path of changes) if (!expected.delete(path)) throw Error('Change outside this task: ' + path);
if (expected.size) throw Error('Missing expected changes: ' + [...expected].join(', '));
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (head !== start.head) throw Error('HEAD changed during the task');
const releases = start.releases.map(entry => ({ ...entry, actualSHA256: hash(entry.path) }));
if (releases.some(entry => entry.sha256 !== entry.actualSHA256)) throw Error('Existing release archive changed');
const map = 'src/world/regional/regional-main.json';
const mapSHA256 = hash(map);
if (mapSHA256 !== start.files.find(file => file.path === map).sha256) throw Error('Official map changed');
const report = { passed: true, head, checkedExistingFiles: start.files.length, changedExisting: changes.sort(), mapSHA256, releases };
writeFileSync(new URL('./preservation.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log({ passed: true, checkedExistingFiles: report.checkedExistingFiles, changed: changes.length, releases: releases.length, mapSHA256 });
