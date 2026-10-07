import { buildSubject3Topology } from './src/world/subject3/topology';
import { DEFAULT_SUBJECT3_GROUND_CONFIG } from './src/world/subject3/Subject3GroundConfig';

const topology = buildSubject3Topology(DEFAULT_SUBJECT3_GROUND_CONFIG);
for (const id of ['junction-east-north', 'junction-east-middle', 'junction-east-south', 'junction-block-street-west', 'junction-east-tee']) {
  const junction = topology.junctions.find((item) => item.id === id)!;
  console.log(id, 'box', junction.halfExtentX, junction.halfExtentZ);
  for (const arm of junction.arms) {
    console.log('   ', arm.segmentId, 'outward', arm.outward.x, arm.outward.z, 'axial', arm.axialDistance, 'width', arm.roadWidth);
  }
}
console.log('--- segment endpoints ---');
for (const segment of topology.segments) {
  console.log(segment.id, 'first', JSON.stringify(segment.centerline[0]), 'last', JSON.stringify(segment.centerline[segment.centerline.length - 1]));
}
