import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { build as bundle } from 'esbuild';

const dir = 'artifacts/system-central-ramp-repair/';
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => fs.writeFileSync(dir + file, JSON.stringify(value, null, 2) + '\n');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const source = read('src/world/regional/regional-main.json');
const build = read(dir + 'build-result.json');
assert.equal(build.exitCode, 0);
assert.equal(build.published, true);
assert.equal(build.launchCount, 2);
assert.equal(build.extraBuildExplicitlyAuthorized, true);
assert.equal(hash('src/world/regional/regional-main.json'), build.sourceHash);
assert.equal(hash(dir + 'candidate-map.json'), build.sourceHash);

const runtimeFile = 'dist/assets/city-main.runtime-74009a1f4c04.json';
const runtime = read(runtimeFile);
assert.equal(runtime.map.version, source.version);
const bundled = await bundle({ entryPoints: ['src/world/city/CityRuntimeData.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
// Runtime assets contain the normal compiler's validated/normalized map, not raw authoring JSON.
const compiler = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const expectedRuntime = JSON.stringify(compiler.compileCityRuntimeData(source));
assert.equal(createHash('sha256').update(expectedRuntime).digest('hex'), hash(runtimeFile), 'Published runtime does not match normal compiler output');
const manifest = read('dist/.vite/manifest.json');
const runtimeReferences = Object.values(manifest).filter(entry => entry.file.endsWith('.js') && fs.readFileSync('dist/' + entry.file, 'utf8').includes(path.basename(runtimeFile))).map(entry => entry.file);
assert(runtimeReferences.length > 0, 'Published application does not reference runtime asset');
write('dist-consistency.json', {
  passed: true, source: 'src/world/regional/regional-main.json', sourceHash: build.sourceHash,
  runtime: runtimeFile, runtimeHash: hash(runtimeFile), version: source.version,
  compared: ['roads', 'roadLinks', 'connectionPorts', 'intersections', 'signs', 'objects'],
  applicationReferencesRuntime: runtimeReferences, secondBuildExplicitlyAuthorized: true,
  method: 'Exact SHA-256 match against compileCityRuntimeData(source), including normal endpoint normalization',
});

const finishFile = dir + 'finish.mjs';
let finish = fs.readFileSync(finishFile, 'utf8');
finish = finish.replace('上游反向最多约 12m', '上游反向最多约 18m');
finish = finish.replace('typecheck:{command:', 'firstBuild,distConsistency:read(dir+\'dist-consistency.json\'),typecheck:{command:');
finish = finish.replace('One candidate file I/O attempt failed transiently and succeeded on retry.', 'One candidate file I/O attempt failed transiently and succeeded on retry. Post-build curvature review found a newly introduced 15.927m N-to-W-right S bend. A separately validated local refinement improved this to 37.847m; the user explicitly authorized one additional build, which succeeded and published the final candidate.');
finish = finish.replace('- 没有运行 full core、全车型', '- 构建次数共 2 次：首次成功；用户明确回复“允许额外构建一次，完成修正”后，追加构建成功。首次报告与构建记录保存在 first-publication/。最终 N-to-W-right 最小半径由首次修复版 15.927m 提升至 37.847m，重新通过全部定点验收。\\n- 源码与 dist 的道路、拓扑、路牌和物件逐项一致，见 dist-consistency.json。\\n- 没有运行 full core、全车型');
finish = finish.replace('- [acceptance-summary.json]', '- [dist-consistency.json](dist-consistency.json)、[second-build-result.json](second-build-result.json)、[second-build.log](second-build.log)：最终发布一致性与已获授权的追加构建。\\n- [acceptance-summary.json]');
fs.writeFileSync(finishFile, finish);
const result = spawnSync(process.execPath, [finishFile], { encoding: 'utf8' });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
assert.equal(result.status, 0);

const ready = read(dir + 'refinement/ready-for-publication.json');
ready.preparationSourceHash = ready.sourceHash;
ready.sourceHash = build.sourceHash;
ready.published = true;
ready.sourceUnchanged = false;
ready.secondBuildExplicitlyAuthorized = true;
ready.buildResult = '../second-build-result.json';
ready.requires = null;
write('refinement/ready-for-publication.json', ready);
let refinementReport = fs.readFileSync(dir + 'refinement/REPORT.md', 'utf8');
refinementReport = refinementReport.replace('**已验证，未发布。**', '**已验证并发布，源码与 dist 一致。**');
refinementReport = refinementReport.replace('当前源码与 dist 保持第一次成功构建的版本，未被此候选覆盖。', '用户明确回复“允许额外构建一次，完成修正”后，已将本修正同步至源码并成功追加构建。');
refinementReport = refinementReport.replace('原要求第十六节只允许一次 build，现已执行且成功；发布此修正需要获准额外执行一次 build，才能同步源码与 dist。', '两次 `pnpm run build -BasicValidation` 均成功；第二次已获用户明确授权。最终发布验证见 [主报告](../REPORT.md) 和 [dist 一致性](../dist-consistency.json)。');
fs.writeFileSync(dir + 'refinement/REPORT.md', refinementReport);

const report = fs.readFileSync(dir + 'REPORT.md', 'utf8');
for (const match of report.matchAll(/\]\(([^)]+)\)/g)) {
  if (!match[1].includes('://')) assert(fs.existsSync(path.resolve(dir, match[1])), 'Missing report link: ' + match[1]);
}
console.log(JSON.stringify({ finalChecksPassed: true, distRuntime: runtimeFile, sourceHash: build.sourceHash }));
