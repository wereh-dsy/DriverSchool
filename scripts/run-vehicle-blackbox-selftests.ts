import { mkdirSync, writeFileSync } from 'node:fs';
import { createNeutralVehicleInputState } from '../src/input/VehicleInputState';
import { blackBoxFixture, runVehiclePhysicsBlackBoxSelfTest } from '../src/vehicle/diagnostics/VehiclePhysicsBlackBox.selftest';

const result = runVehiclePhysicsBlackBoxSelfTest();
const fixture = blackBoxFixture(); fixture.recorder.arm();
const recordStep = () => {
  fixture.recorder.beginStep(1 / 120);
  // Production adapter: current contacts + one microstep query + final capture.
  fixture.recorder.observeContacts(fixture.contacts.wheelContacts!, fixture.ground);
  fixture.recorder.observeContacts(fixture.contacts.wheelContacts!, fixture.ground);
  fixture.recorder.capture(fixture.snapshot, neutralInput, fixture.contacts.wheelContacts!,
    fixture.dynamics.suspension.getVerticalSnapshot(), fixture.dynamics.chassisMotion, fixture.ground);
};
const neutralInput = createNeutralVehicleInputState();
for (let i = 0; i < 10_000; i++) recordStep(); // JIT warmup; no events or JSON in measured loop
const batches = 100, stepsPerBatch = 1000;
const measure = (enabled: boolean) => {
  let total = 0, max = 0;
  const recorder = enabled ? fixture.recorder : undefined;
  let sentinel = 0;
  for (let batch = 0; batch < batches; batch++) {
    const start = performance.now();
    for (let i = 0; i < stepsPerBatch; i++) {
      if (recorder) recordStep();
      sentinel += i & 1;
    }
    const elapsed = performance.now() - start;
    total += elapsed; max = Math.max(max, elapsed / stepsPerBatch);
  }
  return { averageMicrosecondsPerStep: total * 1000 / (batches * stepsPerBatch),
    maxBatchAverageMicrosecondsPerStep: max * 1000, sentinel };
};
const off = measure(false), armed = measure(true);
const performanceResult = { runtime: process.version, platform: process.platform, arch: process.arch,
  measuredSteps: batches * stepsPerBatch, frameMemoryBytes: fixture.recorder.allocatedFrameBytes,
  eventCapacity: result.eventCapacity, off, armed,
  incrementalAverageMicroseconds: Math.max(0, armed.averageMicrosecondsPerStep - off.averageMicrosecondsPerStep),
  ordinaryArmedCandidateQueries: fixture.queries,
  notes: 'Recorder only; existing snapshots/contacts reused. OFF measures the production absent-recorder branch. Max is a batch mean, not a single-step peak. No whole-game performance or subjective tuning.' };
mkdirSync('artifacts/vehicle-physics-blackbox', { recursive: true });
writeFileSync('artifacts/vehicle-physics-blackbox/targeted-results.json', JSON.stringify({ assertions: result.assertions, performance: performanceResult }, null, 2));
writeFileSync('artifacts/vehicle-physics-blackbox/sample-incident.json', JSON.stringify(result.sampleIncident, null, 2));
console.log(JSON.stringify({ assertions: result.assertions, performance: performanceResult }, null, 2));
