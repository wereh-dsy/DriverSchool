import fs from 'node:fs';
import { build } from 'esbuild';
const baseline = 'artifacts/highway-system/baseline.json';
fs.mkdirSync('artifacts/highway-system', { recursive: true });
const current = JSON.parse(fs.readFileSync('src/world/regional/regional-main.json', 'utf8'));
if (!current.regional.highways) fs.writeFileSync(baseline, JSON.stringify(current));
if (!fs.existsSync(baseline)) throw new Error('Retained regional baseline is required.');
const bundle = await build({ stdin: { contents: `export {expandHighways} from './src/world/regional/HighwayExpansionRecipe'; export {validateMap} from './src/world/city/CityMapValidation';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
try {
  const api = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  const map = api.expandHighways(JSON.parse(fs.readFileSync(baseline, 'utf8'))), report = api.validateMap(map);
  if (!report.valid) throw new Error(JSON.stringify(report.errors.slice(0, 15)) + ` (${report.errors.length} errors)`);
  fs.writeFileSync('src/world/regional/regional-main.json', JSON.stringify(map) + '\n');
  fs.writeFileSync('artifacts/highway-system/metadata.json', JSON.stringify({ routes: map.regional.highways.routes.map(r => ({ number: r.number, name: r.name, type: r.type })), roads: map.roads.length, signs: map.signs.length, exits: map.regional.highways.exits.length, services: map.regional.highways.services.length, validation: report }, null, 2));
  console.log(JSON.stringify({ roads: map.roads.length, signs: map.signs.length, exits: map.regional.highways.exits.length, services: map.regional.highways.services.length }));
} catch (error) { console.error(String(error.stack ?? error).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g, '<highway-recipe>')); process.exitCode = 1; }
