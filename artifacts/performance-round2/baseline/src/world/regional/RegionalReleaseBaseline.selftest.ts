import type { CityMapData, CityRoad } from '../city/CityMapData';
import current from '../../../artifacts/regional-world/approved-baseline.json';
import approvals from '../../../artifacts/regional-world/baseline-approvals.json';
import historical494 from '../../../artifacts/regional-world/v494-regression-baseline.json';
import{assertRegionalBaselineData,baselineHash,regionalGrade,type RegionalBaseline}from'./RegionalBaselineData';
import{validateMap}from'../city/CityMapValidation';

/** Normal build/system/region entry points all use the explicit active approval.
 * Updating a source version alone never updates this record or its ledger. */
export function assertRegionalReleaseBaseline(map: CityMapData): void {
  const baseline=current as RegionalBaseline,ledger=approvals.approved as Record<string,string>;
  if(baseline.revision!==approvals.currentRevision||baselineHash(baseline)!==ledger[String(baseline.revision)])throw Error('Regional active baseline does not match the approval ledger');
  assertRegionalBaselineData(map,baseline);
}

/** Existing individually calibrated profiles remain frozen by the full snapshot.
 * No general increase of the ordinary 5% mainline / 6% ramp limit is accepted. */
export function assertRegionalRoadGrade(road: CityRoad, nominalLimit: number): void {
  const grade=regionalGrade(road);
  const calibrated = (current.gradeExceptions as Record<string, number>)[road.id] ?? nominalLimit;
  if (grade > Math.max(nominalLimit, calibrated) + 1e-9 || grade > .12001)
    throw new Error(`${road.id} exceeds its frozen road grade ${(grade * 100).toFixed(2)}%`);
}

export function runRegionalReleaseBaselineSelfTest(map: CityMapData) {
  if(!validateMap(map).valid)throw Error('Current regional map is not legal under the current schema');
  assertRegionalReleaseBaseline(map);
  const road = map.roads[0]!;
  const changedRoad = { ...road, centerline: road.centerline.map((p, i) => i ? p : { ...p, x: p.x + .001 }) };
  const junction=map.intersections[0]!,structured=map.roads.find(r=>r.structure)!;
  const candidates:CityMapData[] = [
    { ...map, roads: [changedRoad, ...map.roads.slice(1)] },
    { ...map, roadLinks: map.roadLinks!.slice(1) },
    { ...map, signs: map.signs!.slice(1) },
    {...map,intersections:[{...junction,position:{...junction.position,x:junction.position.x+.001}},...map.intersections.slice(1)]},
    {...map,roads:map.roads.map(r=>r===structured?{...r,structure:{...r.structure,barrierEnabled:!r.structure!.barrierEnabled}}:r)},
    {...map,connectionPorts:map.connectionPorts!.slice(1)},
    {...map,version:map.version+1},
    {...map,unapprovedField:1} as CityMapData,
  ];
  for (const candidate of candidates) {
    let rejected = false;
    try { assertRegionalReleaseBaseline(candidate); } catch { rejected = true; }
    if (!rejected) throw new Error('Release baseline accepted a geometry, topology or sign regression');
  }
  let navigationRejected=false;
  try{assertRegionalBaselineData(map,{...current,navigationSHA256:'0'.repeat(64)});}catch(error){navigationRejected=String(error).includes('derived navigation');}
  if(!navigationRejected)throw Error('Derived navigation changes must require approval');
  if(baselineHash(historical494)!==(approvals.approved as Record<string,string>)['494'])throw Error('Historical v494 snapshot changed');
  return { assertions: candidates.length+4, revision: current.revision,historicalRevision:historical494.revision };
}
