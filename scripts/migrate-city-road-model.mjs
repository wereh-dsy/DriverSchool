import { readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

// One-time, explicit migration of the two current City Main sources. No layout,
// lane dimensions, structures, links or IDs change. Historical maps stay intact.
const bundle = await build({ stdin: { contents: "export {roadFunction} from './src/world/city/RoadClassification';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
const { roadFunction } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
for (const path of ['src/world/city/maps/city-main.json', 'src/world/regional/regional-main.json']) {
  const map = JSON.parse(readFileSync(path, 'utf8'));
  const connectors = new Set((map.regional?.highways?.routes ?? []).filter(r => r.type === 'connector').flatMap(r => r.roadIds));
  let changed = 0;
  for (const road of map.roads) {
    let kind = roadFunction(road);
    // These are existing recipe roles, not runtime ID-based behavior.
    if (road.id.startsWith('regional:') && road.id.includes(':local:')) kind = 'local';
    if (road.id === 'regional:airport-terminal-access') kind = 'collector';
    if (road.type === 'highway' && road.styleId === 'urban_local_2' && road.speedLimit <= 30) kind = 'collector';
    if (connectors.has(road.id) && kind === 'expressway') kind = 'connector';
    const section = road.shoulders || ['expressway','ramp','connector'].includes(kind) ? 'shouldered' : road.laneCount >= 6 ? 'boulevard' : 'street';
    if (road.roadClass !== kind || road.crossSection !== section) changed++;
    road.roadClass = kind; road.crossSection = section;
  }
  if (changed) map.version++;
  console.log(`${path}: ${changed} road classifications; version ${map.version}${process.argv.includes('--apply') ? ' (saved)' : ' (preview)'}`);
  if (process.argv.includes('--apply') && changed) writeFileSync(path, JSON.stringify(map) + '\n');
}
