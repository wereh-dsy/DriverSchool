import { mkdirSync, writeFileSync } from 'node:fs';
import { measureVehicleExteriors } from './vehicle-exterior-measurements';

// Scoped canvas fallback, only for geometry. Render checks use real Chromium.
const context = new Proxy({} as Record<string, unknown>, {
  get: (target, key) => key === 'measureText' ? () => ({ width: 0 })
    : key in target ? target[String(key)] : () => context,
  set: (target, key, value) => { target[String(key)] = value; return true; },
});
Object.defineProperty(globalThis, 'document', { configurable: true,
  value: { createElement: () => ({ width: 1, height: 1, getContext: () => context }) } });
const result = measureVehicleExteriors();
const phase = process.argv.includes('--before') ? 'before' : 'after';
const directory = 'artifacts/vehicle-exterior-refinement';
mkdirSync(directory, { recursive: true });
writeFileSync(`${directory}/dimensions-${phase}.json`, JSON.stringify(result, null, 2) + '\n');
let failures = 0;
for (const car of result) {
  console.log(`${car.id}: ` + Object.entries(car.target).map(([key, value]) =>
    `${key} ${car.actual[key as keyof typeof car.actual].toFixed(4)} → ${value.toFixed(4)} → ${car.errorPercent[key]!.toFixed(2)}%`).join(' | '));
  for (const wheel of car.wheels) {
    if (wheel.anchorError > 1e-6 || !wheel.hubVisible) { failures++; console.error(`${car.id} ${wheel.id}: ${JSON.stringify(wheel)}`); }
  }
  if(car.clearanceIssues.length) {failures++;console.error(`${car.id}: ${car.clearanceIssues.join('\n')}`);}
  if (car.invalidVertices || car.triangles > 180000 || Object.values(car.errorPercent).some(e => Math.abs(e) > 2)) failures++;
}
console.log(`${result.length} vehicles measured; ${failures} geometry warnings/failures (${phase})`);
if (phase === 'after' && failures) process.exitCode = 1;
