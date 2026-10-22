import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { relative } from 'node:path';

// Only the powertrain/control suites relevant to the six-car calibration.
// Baseline substitutes the originally clean calibration files in memory while
// retaining the working tree's vertical/contact changes; it never checks out files.
const baseline = process.argv.includes('--baseline');
const originals = new Set([
  ...['bmw530Li', 'executiveSedan', 'mercedesE300L', 'roadSUV', 'teslaModel3', 'taycan4S']
    .map(name => `src/vehicle/config/${name}PhysicsConfig.ts`),
  'src/vehicle/control/VehicleControlPresets.ts',
  'src/vehicle/powertrain/ElectricPowertrain.ts',
  'src/vehicle/powertrain/ElectricPowertrain.selftest.ts',
  'src/vehicle/powertrain/ElectrifiedPowertrain.selftest.ts',
]);
const suites = [
  ['evV2', 'powertrain/EVPlatformV2', 'runEVPlatformV2SelfTest'],
  ['model3', 'powertrain/ElectricPowertrain', 'runElectricPowertrainSelfTest'],
  ['electrified48V', 'powertrain/ElectrifiedPowertrain', 'runElectrifiedPowertrainSelfTest'],
  ['absEbdTcs', 'physics/DriverAssistSystem', 'runDriverAssistSelfTest'],
  ['escAwd', 'physics/ESCAWD', 'runESCAWDSelfTest'],
  ['executive', 'physics/ExecutiveSedan', 'runExecutiveSedanSelfTest'],
  ['executivePolish', 'physics/ExecutivePolish', 'runExecutivePolishSelfTest'],
];
const source = `${suites.map(([, path, fn]) => `import { ${fn} } from './src/vehicle/${path}.selftest';`).join('\n')}
import { writeFileSync } from 'node:fs';
const results = {}; let failed = false;
for (const [name, run] of [${suites.map(([name, , fn]) => `['${name}', ${fn}]`).join(',')}]) {
  try { results[name] = { passed: true, ...run() }; console.log('PASS ' + name); }
  catch (error) { results[name] = { passed: false, error: String(error) }; failed = true; console.error('FAIL ' + name + ': ' + error); }
}
writeFileSync('artifacts/fleet-calibration/${baseline ? 'baseline' : 'final'}-selftests.json', JSON.stringify(results, null, 2));
if (failed) process.exitCode = 1;`;
mkdirSync('artifacts/fleet-calibration', { recursive: true });
const outfile = `.tmp-fleet-${baseline ? 'baseline' : 'final'}-selftests.mjs`;
await build({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'ts' }, bundle: true,
  platform: 'node', format: 'esm', outfile, logLevel: 'silent', plugins: baseline ? [{ name: 'original-calibration', setup(builder) {
    builder.onLoad({ filter: /\.ts$/ }, args => {
      const path = relative(process.cwd(), args.path).replaceAll('\\', '/');
      if (originals.has(path)) return { contents: execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' }), loader: 'ts' };
    });
  } }] : [] });
await import(new URL(`../${outfile}`, import.meta.url).href);
