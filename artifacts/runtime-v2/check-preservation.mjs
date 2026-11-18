import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const start = JSON.parse(readFileSync(new URL('./starting-worktree.json', import.meta.url)));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const changed = start.files.filter(file => !existsSync(file.path) || hash(file.path) !== file.sha256).map(file => file.path);
const own = new Set([
  'scripts/performance-preload.ts', 'src/game/StreamingShaderWarmup.ts', 'src/game/DrivingGame.ts',
  'src/world/DrivingGround.ts', 'src/world/city/CityGround.ts', 'src/world/city/SectorManager.ts',
  'src/world/city/VisualStreamingWorker.ts',
]);
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (head !== start.head) throw Error('HEAD changed');
const mapSHA256 = hash('src/world/regional/regional-main.json');
if (mapSHA256 !== start.files.find(file => file.path === 'src/world/regional/regional-main.json').sha256) throw Error('Official map changed');
const releases = start.releases.map(release => ({ ...release, actualSHA256: hash(release.path) }));
if (releases.some(release => release.actualSHA256 !== release.sha256)) throw Error('Existing release archive changed');
const concurrentChanges = changed.filter(path => !own.has(path));
const result = {
  passed: true, head, checkedExistingFiles: start.files.length, mapSHA256, releases,
  changedExisting: changed.filter(path => own.has(path)), concurrentChanges,
  newRuntime: ['FixedStepClock.ts','RuntimeCoordinator.ts','RuntimePerformance.ts','VehicleRenderPose.ts','RuntimeCoordinator.selftest.ts'].map(name => 'src/game/runtime/' + name),
  newValidation: ['scripts/run-runtime-selftests.mjs'],
  concurrency: 'Other ongoing vehicle work is recorded independently and never reverted by this task.',
};
writeFileSync(new URL('preservation.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log({ passed: true, existingFiles: start.files.length, ownChanges: result.changedExisting.length, concurrentChanges, protectedReleases: releases.length });
