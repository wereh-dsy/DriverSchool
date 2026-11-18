import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';

// Re-author signs only. Never rerun the historical road/network generators.
const apply = process.argv.includes('--apply'), fromBaseline = process.argv.includes('--from-baseline'), folder = 'artifacts/road-signs-2026-10-16';
const bundle = await build({ stdin: { contents: `export { optimizeFastRoadSigns } from './src/world/regional/FastRoadSignPlacement';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
try {
  const { optimizeFastRoadSigns } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  const summary = [];
  for (const [name, file] of [['regional', 'src/world/regional/regional-main.json'], ['city', 'src/world/city/maps/city-main.json']]) {
    const map = JSON.parse(fs.readFileSync(file, 'utf8'));
    const topology = () => createHash('sha256').update(JSON.stringify([map.roads, map.roadLinks, map.intersections, map.objects, map.regional])).digest('hex');
    const beforeTopology = topology(), previousSigns = structuredClone(map.signs);
    if (fromBaseline) {
      const previous = JSON.parse(fs.readFileSync(`${folder}/${name}-placement.json`, 'utf8'));
      if (previous.topologyHash !== beforeTopology) throw new Error('Map topology changed since sign baseline: ' + file);
      map.signs = JSON.parse(fs.readFileSync(`${folder}/${name}-before.json`, 'utf8'));
    }
    const report = optimizeFastRoadSigns(map);
    if (topology() !== beforeTopology) throw new Error('Sign authoring changed geometry/topology: ' + file);
    if (apply) {
      fs.mkdirSync(folder, { recursive: true });
      const baseline = `${folder}/${name}-before.json`;
      if (!fs.existsSync(baseline)) fs.writeFileSync(baseline, JSON.stringify(previousSigns));
      if (JSON.stringify(previousSigns) !== JSON.stringify(map.signs) && map.environment.metadata?.signPlacement !== 'spaced-fast-roads-v1') map.version++;
      map.environment.metadata = { ...map.environment.metadata, signPlacement: 'spaced-fast-roads-v1', navigationSignCount: String(map.signs.filter(s => !['SPEED_LIMIT', 'CHEVRON'].includes(s.type)).length) };
      fs.writeFileSync(file, JSON.stringify(map) + '\n');
      fs.writeFileSync(`${folder}/${name}-placement.json`, JSON.stringify({ file, version: map.version, topologyHash: beforeTopology, ...report }, null, 2));
    }
    summary.push({ name, version: map.version, before: report.before.navigation, after: report.after.navigation, speedLimits: report.after.speedLimits, chevrons: report.after.chevrons,
      conflictsBefore: report.before.conflicts.length, conflictsAfter: report.after.conflicts.length, removed: report.removed.length, moved: report.moved.length, unresolved: report.unresolved });
  }
  console.log(JSON.stringify({ apply, maps: summary }, null, 2));
} catch (error) {
  console.error(String(error.stack ?? error).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g, '<sign-authoring>')); process.exitCode = 1;
}
