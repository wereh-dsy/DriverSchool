import { createHash } from 'node:crypto';
import type { CityMapData, CityRoad } from '../city/CityMapData';
import baseline from '../../../artifacts/regional-world/v494-regression-baseline.json';

/** Frozen v493 / city V9 release plus the explicitly recorded v494 repairs.
 * Every authored field is protected, including explicit XYZ links and signs.
 * Rebaselining requires a separately reviewed map change, never a test run. */
export function assertRegionalReleaseBaseline(map: CityMapData): void {
  const fields = map as unknown as Record<string, unknown>;
  if (JSON.stringify(Object.keys(fields).sort()) !== JSON.stringify(Object.keys(baseline.fields).sort()))
    throw new Error('Regional release field inventory changed');
  for (const [key, expected] of Object.entries(baseline.fields)) {
    const hash = createHash('sha256').update(JSON.stringify(fields[key])).digest('hex');
    if (hash !== expected) throw new Error(`Regional v${baseline.revision} release changed: ${key}`);
  }
}

/** Existing individually calibrated profiles remain frozen by the full snapshot.
 * No general increase of the ordinary 5% mainline / 6% ramp limit is accepted. */
export function assertRegionalRoadGrade(road: CityRoad, nominalLimit: number): void {
  const grade = road.centerline.slice(1).reduce((maximum, b, i) => {
    const a = road.centerline[i]!;
    return Math.max(maximum, Math.abs((b.y ?? 0) - (a.y ?? 0)) / Math.hypot(b.x - a.x, b.z - a.z));
  }, 0);
  const calibrated = (baseline.gradeExceptions as Record<string, number>)[road.id] ?? nominalLimit;
  if (grade > Math.max(nominalLimit, calibrated) + 1e-9 || grade > .12001)
    throw new Error(`${road.id} exceeds its frozen road grade ${(grade * 100).toFixed(2)}%`);
}

export function runRegionalReleaseBaselineSelfTest(map: CityMapData) {
  assertRegionalReleaseBaseline(map);
  const road = map.roads[0]!;
  const changedRoad = { ...road, centerline: road.centerline.map((p, i) => i ? p : { ...p, x: p.x + .001 }) };
  const candidates = [
    { ...map, roads: [changedRoad, ...map.roads.slice(1)] },
    { ...map, roadLinks: map.roadLinks!.slice(1) },
    { ...map, signs: map.signs!.slice(1) },
  ];
  for (const candidate of candidates) {
    let rejected = false;
    try { assertRegionalReleaseBaseline(candidate); } catch { rejected = true; }
    if (!rejected) throw new Error('Release baseline accepted a geometry, topology or sign regression');
  }
  return { assertions: 4, revision: baseline.revision };
}
