import { LapRecordStore, LapTimer, formatLapTime } from './LapTimer';
import type { LapCourseDefinition, LapGate } from './LapCourseDefinition';

export function runLapTimerSelfTest(): { assertions: number } {
  let assertions = 0;
  const assert = (condition: boolean, message: string): void => {
    assertions += 1;
    if (!condition) throw new Error(`Lap-timer self-test failed: ${message}`);
  };
  const storageData = new Map<string, string>();
  const storage = { getItem: (key: string) => storageData.get(key) ?? null,
    setItem: (key: string, value: string) => { storageData.set(key, value); } };
  const records = new LapRecordStore(storage);
  const gate = (x: number, z: number, fx: number, fz: number): LapGate =>
    ({ center: { x, z }, forward: { x: fx, z: fz }, halfWidth: 3, heightTolerance: 2 });
  const course: LapCourseDefinition = { trackId: 'test-circuit', startFinish: gate(0, 0, 1, 0),
    checkpoints: [gate(20, 0, 1, 0), gate(30, 10, 0, 1), gate(10, 20, -1, 0), gate(-10, 10, 0, -1)] };
  const timer = new LapTimer(records);
  let x = -2;
  let z = 0;
  const configure = (vehicleId = 'gt'): void => {
    x = -2; z = 0;
    timer.configure(course, vehicleId, { x, z });
  };
  const move = (endX: number, endZ: number, dt = 0.05): void => {
    const fromX = x; const fromZ = z;
    const count = Math.max(1, Math.ceil(Math.hypot(endX - x, endZ - z)));
    for (let index = 1; index <= count; index += 1) {
      x = fromX + (endX - fromX) * index / count;
      z = fromZ + (endZ - fromZ) * index / count;
      timer.update(dt, { x, z });
    }
  };
  const complete = (dt = 0.05): void => {
    move(30, 0, dt); move(30, 20, dt); move(-10, 20, dt); move(-10, 0, dt); move(0, 0, dt);
  };
  configure();
  move(0, 0);
  assert(timer.state.phase === 'RUNNING' && timer.state.lap === 1 && timer.state.lastMs === null,
    'first forward crossing starts lap 1 without recording spawn-to-line time');
  assert(timer.state.currentMs === 0, 'clock starts at the crossing instant');
  complete();
  assert(timer.state.lap === 2 && timer.state.checkpointsPassed === 0, 'valid lap starts the next lap immediately');
  assert(timer.state.lastMs === 6_000 && timer.state.bestMs === 6_000, 'ordered gates record simulation milliseconds');
  assert(timer.state.feedback?.newBest === true && timer.state.feedback.deltaMs === null,
    'first valid lap becomes BEST with completion feedback');
  complete(0.06);
  assert(timer.state.bestMs === 6_000 && timer.state.lastMs === 7_200, 'slower lap preserves BEST');
  assert(timer.state.feedback?.newBest === false && timer.state.feedback.deltaMs === 1_200,
    'slower lap delta compares against this vehicle BEST');
  complete(0.04);
  assert(timer.state.bestMs === 4_800 && timer.state.feedback?.deltaMs === -1_200,
    'faster lap saves a new record with negative delta');
  const restarted = new LapTimer(new LapRecordStore(storage));
  restarted.configure(course, 'gt', { x: -2, z: 0 });
  assert(restarted.state.bestMs === 4_800, 'fresh timer restores persisted BEST');
  configure('sedan');
  assert(timer.state.bestMs === null && timer.state.lastMs === null, 'vehicle switch invalidates session and loads separate record');
  move(0, 0); complete(0.08);
  assert(timer.state.bestMs === 9_600, 'different vehicle owns a separate record');
  configure('gt');
  assert(timer.state.bestMs === 4_800, 'switching back restores the original vehicle BEST');
  timer.reset({ x: 0, z: 0 }); x = 0;
  timer.update(0.05, { x, z });
  move(2, 0);
  assert(timer.state.phase === 'WAITING_FOR_START', 'spawning directly on the line does not trigger timing');
  move(-2, 0);
  assert(timer.state.lastMs === null && timer.state.phase === 'WAITING_FOR_START', 'backward crossing never records a lap');
  move(2, 0); move(-2, 0); move(2, 0);
  assert(timer.state.lastMs === null && timer.state.bestMs === 4_800, 'repeated forward/backward crossing cannot farm records');
  configure(); move(2, 0); move(2, 8); move(30, 8); move(30, 12);
  assert(timer.state.phase === 'WAITING_FOR_START', 'out-of-order checkpoint invalidates lap');
  configure(); move(2, 0); move(2, 8); move(-2, 8); move(-2, 0); move(2, 0);
  assert(timer.state.lastMs === null, 'forward finish without checkpoints cannot record');
  const lapBefore = timer.state.lap;
  timer.update(0.05, { x, z }); timer.update(0.05, { x, z });
  assert(timer.state.lap === lapBefore, 'dwelling near the line does not repeat crossing events');
  timer.reset({ x, z });
  assert(timer.state.phase === 'WAITING_FOR_START' && timer.state.bestMs === 4_800, 'respawn discards current lap and preserves BEST');
  configure(); move(2, 0);
  timer.update(0.05, { x: -2, z: 0, y: 8 });
  timer.update(0.05, { x: 2, z: 0, y: 8 });
  assert(timer.state.lastMs === null && timer.state.lap === 1, 'gates reject crossings above road height');
  configure(); move(2, 0);
  const pausedMs = timer.state.currentMs;
  for (let index = 0; index < 10; index += 1) timer.update(1, { x, z }, false);
  assert(timer.state.currentMs === pausedMs && timer.state.phase === 'RUNNING', 'stationary pause freezes current time');
  timer.update(0.05, { x, z });
  assert(timer.state.currentMs === pausedMs + 50, 'resume adds only simulated time');
  timer.update(1, { x: x + 2, z }, false);
  assert(timer.state.phase === 'WAITING_FOR_START', 'coasting while timing is suspended cannot gain untimed distance');
  configure(); move(2, 0);
  timer.update(1 / 120, { x: 30, z: 0 });
  assert(timer.state.phase === 'WAITING_FOR_START' && timer.state.bestMs === 4_800, 'teleport cannot cross a gate or submit a record');
  timer.configure(undefined, 'gt', { x, z });
  timer.update(1, { x: 1, z: 0 });
  assert(timer.state.phase === 'WAITING_FOR_START' && timer.state.bestMs === null, 'leaving track clears timing context');
  restarted.configure({ ...course, trackId: 'other-track' }, 'gt', { x, z });
  assert(restarted.state.bestMs === null, 'track ID also isolates records');
  storage.setItem('drivergame.best-lap.v1:["bad","gt"]', '{broken');
  assert(records.load('bad', 'gt') === null, 'malformed persistence is ignored');
  const unavailable = new LapRecordStore({ getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); } });
  unavailable.save('track', 'car', 1_000);
  assert(unavailable.load('track', 'car') === null, 'storage access failure does not break driving');
  assert(formatLapTime(84_537) === '01:24.537' && formatLapTime(59_999.8) === '01:00.000' &&
    formatLapTime(null) === '--:--.---', 'display formats milliseconds with minute carry');
  // A crossing halfway through a fixed step must retain sub-step precision.
  timer.configure(course, 'gt', { x: -1, z: 0 });
  timer.update(0.1, { x: 1, z: 0 });
  assert(Math.abs(timer.state.currentMs - 50) < 1e-9, 'crossing time interpolates within the simulation step');
  return { assertions };
}
