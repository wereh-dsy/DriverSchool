import { buildSubject3Topology, segmentCenterline } from './src/world/subject3/topology';
import { DEFAULT_SUBJECT3_GROUND_CONFIG } from './src/world/subject3/Subject3GroundConfig';
import { polylineLength } from './src/world/subject3/math';

const config = DEFAULT_SUBJECT3_GROUND_CONFIG;
for (const road of config.roads) {
  const centerline = segmentCenterline(road);
  console.log(
    road.id,
    'len=', polylineLength(centerline).toFixed(1),
    'start=', JSON.stringify(road.start),
    'via=', JSON.stringify(road.via ?? []),
    'end=', JSON.stringify(road.end),
  );
}
const topology = buildSubject3Topology(config);
console.log('--- junctions ---');
for (const junction of topology.junctions) {
  console.log(
    junction.id,
    JSON.stringify(junction.center),
    'box=', junction.halfExtentX.toFixed(1), junction.halfExtentZ.toFixed(1),
    'arms=', junction.arms.map((arm) => `${arm.segmentId}(${arm.outward.x.toFixed(2)},${arm.outward.z.toFixed(2)})@${arm.axialDistance.toFixed(1)}`).join(' '),
  );
}
console.log('--- gap ranges ---');
for (const [segmentId, ranges] of topology.gapRangesBySegment) {
  console.log(segmentId, ranges.map((range) => `[${range.startDistance.toFixed(1)},${range.endDistance.toFixed(1)}]`).join(' '));
}
