import { DEFAULT_SUBJECT3_GROUND_CONFIG } from './src/world/subject3/Subject3GroundConfig';
import { segmentCenterline } from './src/world/subject3/topology';
import { normalize2 } from './src/world/subject3/math';

const config = DEFAULT_SUBJECT3_GROUND_CONFIG;
const junction = { x: -378, z: -30 };
const road = config.roads.find((item) => item.id === 'main-west')!;
const centerline = segmentCenterline(road);
console.log('centerline', JSON.stringify(centerline));

// Contact.
let contact = { x: 0, z: 0 };
let bestDistance = 0.02;
for (let index = 1; index < centerline.length; index += 1) {
  const start = centerline[index - 1]!;
  const end = centerline[index]!;
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = Math.max(0, Math.min(1, ((junction.x - start.x) * dx + (junction.z - start.z) * dz) / lengthSquared));
  const x = start.x + dx * t;
  const z = start.z + dz * t;
  const distance = Math.hypot(junction.x - x, junction.z - z);
  console.log('segment', index, 't=', t, 'point=', x, z, 'distance=', distance);
  if (distance <= bestDistance) {
    bestDistance = distance;
    contact = { x, z };
  }
}
console.log('contact', JSON.stringify(contact));

let best = { x: 0, z: -1 };
let furthest = 0;
for (const point of centerline) {
  const distance = Math.hypot(point.x - contact.x, point.z - contact.z);
  console.log('  point', JSON.stringify(point), 'distance', distance);
  if (distance <= furthest) continue;
  furthest = distance;
  best = normalize2({ x: point.x - contact.x, z: point.z - contact.z });
}
console.log('outward', JSON.stringify(best));
let extent = 15 * 0.5;
for (const point of centerline) {
  const projection = (point.x - contact.x) * best.x + (point.z - contact.z) * best.z;
  console.log('  projection', JSON.stringify(point), projection);
  extent = Math.max(extent, projection);
}
console.log('extent', extent);
