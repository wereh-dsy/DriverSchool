import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
const result = await build({ entryPoints: ['src/world/city/CityToolchain.selftest.ts'], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
const test = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
const api = test.validateAuthoringAPI();
const path = '.tmp-city-cli-' + process.pid + '.json', outputPath = path + '.out.json';
const assert = (condition, message) => { if (!condition) throw new Error('CLI test: ' + message); };
let cases = 0;
function cli(args, status = 0) {
  const result = spawnSync(process.execPath, ['scripts/map-cli.mjs', ...args], { encoding: 'utf8', windowsHide: true });
  assert(result.status === status, args[0] + ': ' + result.stdout + result.stderr);
  cases++; return JSON.parse(result.stdout);
}
function rejected(args, code) {
  const before = readFileSync(path, 'utf8'), result = cli(args, 1);
  assert(JSON.stringify(result).includes(code), 'actionable ' + code);
  assert(readFileSync(path, 'utf8') === before, 'rejection must not overwrite map');
}
try {
  writeFileSync(path, JSON.stringify({ schemaVersion: 2, id: 'cli-fixture', name: 'CLI fixture', version: 1, sectorSize: 500,
    bounds: { minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 }, roads: [], intersections: [], objects: [], roadLinks: [], connectionPorts: [],
    environment: { districts: [], spawnPoints: [{ id: 'start', position: { x: 0, y: 0, z: 0 }, rotation: 0 }] } }), 'utf8');
  assert(cli(['list-presets']).presets.length === 10, 'catalog');
  cli(['add-road', path, '--request', JSON.stringify({ baseName: 'cli-road', centerline: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }] })]);
  cli(['add-road', path, '--request', JSON.stringify({ baseName: 'cli-road', centerline: [{ x: 100, y: 0, z: 0 }, { x: 200, y: 0, z: 0 }] })]);
  cli(['connect-road', path, '--request', JSON.stringify({ from: { roadId: 'cli-road', end: 'end' }, target: { endpoint: { roadId: 'cli-road-2', end: 'start' } } })]);
  cli(['move-node', path, '--request', JSON.stringify({ roadId: 'cli-road', index: 0, point: { x: -20, y: 0, z: 0 } })]);
  cli(['place-prefab', path, '--request', JSON.stringify({ id: 'cli-tree', prefabId: 'tree', position: { x: 20, y: 0, z: 30 }, rotation: 0 })]);
  cli(['delete-object', path, '--id', 'cli-tree']);
  const stamp = cli(['place-preset', path, 'diamond_interchange', '--rotation', '90', '--group', 'cli-stamp', '--out', outputPath]);
  assert(stamp.validation.errorCount === 0, 'stamp validation');
  const summary = cli(['summary', outputPath]); assert(summary.counts.ports > 0, 'summary refs');
  const valid = cli(['validate', outputPath]); assert(valid.errorCount === 0 && valid.warningCount > 0, 'warnings exit zero');
  rejected(['add-road', path, '--request', JSON.stringify({ centerline: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }] })], 'road.degenerate');
  rejected(['place-preset', path, 'roundabout', '--y', '650'], 'preset.output');
  rejected(['connect-road', path, '--request', JSON.stringify({ from: { roadId: 'cli-road', end: 'bad' }, target: { endpoint: { roadId: 'cli-road-2', end: 'start' } } })], 'connection.shape');
  const invalid = JSON.parse(readFileSync(path, 'utf8')); invalid.roads.push(invalid.roads[0]); writeFileSync(outputPath, JSON.stringify(invalid), 'utf8');
  assert(cli(['validate', outputPath], 1).errors.some(e => e.code === 'id.duplicate'), 'validation errors exit nonzero');
  console.log(JSON.stringify({ api, cli: { valid: true, cases, errorCount: 0 } }, null, 2));
} finally {
  for (const file of [path, outputPath]) if (existsSync(file)) unlinkSync(file);
}
