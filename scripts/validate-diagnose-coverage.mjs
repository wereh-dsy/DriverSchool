import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';

// Isolated diagnostics only: no repair, runtime/vehicle tests or real-map scan.
const bundle = await build({ entryPoints: ['src/editor/RoadDiagnostics.ts'], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
const { diagnoseMap, pageDiagnosticReport } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const seed = JSON.parse(readFileSync('src/editor/maps/editor-test.json', 'utf8'));
const fixture = structuredClone(seed);
fixture.editing = { corridors: [], groups: [], attachments: [], ramps: [] };
fixture.roads = Array.from({ length: 2001 }, (_, i) => ({
  ...seed.roads[0], id: `road-${i}`, roadClass: 'local', curve: 'polyline',
  centerline: [{ x: i * 100, y: 0, z: 0 }, { x: i * 100 + 20, y: 0, z: 0 }],
}));
fixture.intersections = [
  { id: 'late-junction', type: 'irregular', position: { x: 200000, y: 0, z: 0 }, rotation: 0, signalized: true, connections: [{ roadId: 'road-2000', end: 'start', port: 'north' }], portAngles: { north: 0 }, markingFootprint: { kind: 'junction' } },
  { id: 'near-junction', type: 'irregular', position: { x: 200004, y: 0, z: 0 }, rotation: 0, signalized: false, connections: [], markingFootprint: { kind: 'junction' } },
];
// The broad local query sees every road; individual crossing queries see none.
// Full selection must bypass this index and the deliberately stale map bounds.
let scopeIndexCalls = 0;
const index = { query(area) {
  if (JSON.stringify(area) === JSON.stringify(fixture.bounds)) { scopeIndexCalls++; return fixture.roads.map(r => r.id); }
  return [];
} };
const complete = diagnoseMap(fixture, { full: true, limit: 1 }, { index, retainAllIssues: true });
assert.deepEqual(complete.coverage, { roadsChecked: 2001, roadsTotal: 2001, intersectionsChecked: 2, intersectionsTotal: 2 });
assert.equal(scopeIndexCalls, 0, 'full scope bypasses spatial selection');
assert.equal(complete.truncated, false);
assert.equal(complete.issues.length, complete.counts.total);
assert(complete.issues.length > 1000, 'complete receipt retains a large info population');
for (const code of ['intersection.noFootprint', 'intersection.duplicate', 'intersection.stalePortAngle', 'marking.genericFootprint'])
  assert(complete.issues.some(issue => issue.intersectionId === 'late-junction' && issue.code === code), `late intersection existing check: ${code}`);
// One of the 4002 endpoints is junction-owned; two generic-marking infos remain.
assert.equal(complete.counts.info, 4003);
assert.deepEqual(complete.counts.bySeverity, { error: complete.counts.error, warning: complete.counts.warning, info: complete.counts.info });
assert.equal(Object.values(complete.counts.byCode).reduce((sum, n) => sum + n, 0), complete.counts.total);
for (const [code, n] of Object.entries(complete.counts.byCode)) assert.equal(complete.issues.filter(issue => issue.code === code).length, n);
const local = diagnoseMap(fixture, { bbox: fixture.bounds }, { index });
assert.equal(local.coverage.roadsChecked, 600, 'local road cap stays bounded');
assert.equal(local.issues.length, 100, 'local default detail limit stays 100');
assert.equal(diagnoseMap(fixture, { roadId: 'road-0', limit: 1 }, { index }).issues.length, 1);
const pages = [];
let offset = 0;
do {
  const page = pageDiagnosticReport(complete, { offset, limit: 997 });
  assert.equal(page.pagination.offset, offset);
  assert(page.issues.length <= 997);
  pages.push(...page.issues);
  offset = page.pagination.nextOffset;
} while (offset !== null);
assert.deepEqual(pages, complete.issues, 'all details are reachable without omissions or duplicate pages');
const important = pageDiagnosticReport(complete, { minSeverity: 'warning', limit: 1000 });
assert.equal(important.issues.length, complete.counts.error + complete.counts.warning);
assert(important.issues.every(issue => issue.severity !== 'info'));
const infoPage = pageDiagnosticReport(complete, { codes: ['topology.deadEnd'], offset: 3000, limit: 1000 });
assert.equal(infoPage.pagination.total, 4001);
assert.equal(infoPage.issues.length, 1000);
assert.equal(infoPage.pagination.nextOffset, 4000);
assert.equal(pageDiagnosticReport(complete, { codes: ['topology.deadEnd'], offset: 4000 }).issues.length, 1);
assert.equal(pageDiagnosticReport(complete, { offset: complete.counts.total }).pagination.nextOffset, null);
assert.throws(() => pageDiagnosticReport(local), /incomplete/);
assert.throws(() => pageDiagnosticReport(complete, { offset: -1 }), /offset/);

const directory = mkdtempSync(join(tmpdir(), 'drivergame-diagnose-coverage-'));
const source = join(directory, 'fixture.json'), receipt = join(directory, 'diagnosis.json'), request = join(directory, 'request.json');
const small = structuredClone(seed);
small.roads[0].centerline = [-450, -150, 150, 450].map(x => ({ x, y: 0, z: 0 }));
const sourceText = JSON.stringify(small);
writeFileSync(source, sourceText);
function invoke(command, target, body, ...args) {
  writeFileSync(request, JSON.stringify(body));
  const result = spawnSync(process.execPath, [resolve('scripts/mapctl.mjs'), command, target, '--request', '@' + request, ...args], { encoding: 'utf8' });
  assert.ifError(result.error);
  return { status: result.status, body: JSON.parse(result.stdout.trim()) };
}
const cli = invoke('diagnose', source, { full: true, limit: 1 }, '--out', receipt);
assert.equal(cli.status, 0, JSON.stringify(cli.body));
const saved = JSON.parse(readFileSync(receipt, 'utf8'));
assert.equal(saved.issues.length, saved.counts.total);
assert.equal(saved.truncated, false);
assert.equal(cli.body.issues.length, 1);
assert.equal(cli.body.pagination.nextOffset, 1);
assert.equal(cli.body.detailsFile, receipt);
assert.deepEqual(cli.body.counts, saved.counts);
assert.equal(readFileSync(source, 'utf8'), sourceText, 'diagnose never writes the fixture map');
renameSync(source, join(directory, 'fixture.unavailable.json'));
const queried = invoke('query', receipt, { kind: 'diagnosis', offset: 1, limit: 1000 });
assert.equal(queried.status, 0, JSON.stringify(queried.body));
assert.deepEqual([...cli.body.issues, ...queried.body.issues], saved.issues, 'CLI pages saved issues without access to the source map');
const filtered = invoke('query', receipt, { kind: 'diagnosis', codes: ['geometry.'], limit: 1000 });
assert.equal(filtered.status, 0);
assert.deepEqual(filtered.body.issues, saved.issues.filter(issue => issue.code.startsWith('geometry.')));
const receiptText = readFileSync(receipt, 'utf8');
assert.equal(invoke('query', receipt, { kind: 'diagnosis', offset: -1 }).status, 1);
assert.equal(readFileSync(receipt, 'utf8'), receiptText, 'queries never rewrite the diagnosis');
const incomplete = join(directory, 'incomplete.json');
writeFileSync(incomplete, JSON.stringify(cli.body));
assert.equal(invoke('query', incomplete, { kind: 'diagnosis' }).status, 1, 'old/truncated receipts must not masquerade as complete snapshots');
console.log(JSON.stringify({ passed: true, checks: ['full >2000 roads without bounds/index clipping', 'all intersections including after local road cap', 'existing intersection and marking checks execute', 'local cap/default unchanged', 'complete severity/code counts', 'all info pages match computed details', 'all error/warning details obtainable', 'compact CLI vs complete saved receipt', 'query saved pages without loading map', 'reject incomplete receipts and invalid offsets', 'source and receipt unchanged by read-only commands'] }, null, 2));
