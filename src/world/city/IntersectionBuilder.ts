import { Group, Mesh, PlaneGeometry } from 'three';
import { makeBox, makeDirectionArrow, makeMarkingRectangle } from '../subject3/geometry';
import type { Subject3Materials } from '../subject3/materials';
import { armControlKind, Subject3TrafficSignals } from '../subject3/trafficSignals';
import { INTERSECTION_LANES, type CityIntersection, type CityMapData } from './CityMapData';
import { junctionExtent, portsFor, portDirections, rotatePoint } from './geometry';

export class IntersectionBuilder {
  constructor(private readonly map: CityMapData, private readonly materials: Subject3Materials) {}
  build(j: CityIntersection, signals?: Subject3TrafficSignals, index = 0): Group {
    const root = new Group(), h = junctionExtent(j, this.map);
    root.name = j.id; root.position.set(j.position.x, j.position.y ?? 0, j.position.z); root.rotation.y = j.rotation;
    const asphalt = new Mesh(new PlaneGeometry(h * 2, h * 2), this.materials.asphalt);
    asphalt.rotation.x = -Math.PI / 2; asphalt.position.y = 0.024; asphalt.receiveShadow = true; root.add(asphalt);
    const paint = (x: number, z: number, yaw: number, width: number, depth: number) => {
      const mesh = makeMarkingRectangle('junction paint', { x, z }, yaw, width, depth, this.materials.whitePaint, () => 0, 0.008);
      if (mesh) root.add(mesh);
    };
    for (const port of portsFor(j)) {
      // `d` points outwards along the arm; the served approach travels along -d.
      // `right` is the approach's right-hand normal so approach lanes stay on one side.
      const d = portDirections[port], right = { x: d.z, z: -d.x }, yaw = Math.atan2(d.x, d.z);
      const c = j.connections.find(c => c.port === port), r = this.map.roads.find(r => r.id === c?.roadId);
      const width = r ? r.laneCount * r.laneWidth : INTERSECTION_LANES[j.type] * 3.5;
      const laneWidth = r?.laneWidth ?? 3.5;
      const laneCount = r?.laneCount ?? INTERSECTION_LANES[j.type];
      const incoming = !r || r.travelDirection === 'two-way' || (r.travelDirection === 'forward') === (c?.end === 'end');
      // Junction paint runs outside-in along the arm: approach arrows, then the
      // stop line, then the pedestrian crossing, then the conflict box.
      for (let offset = -width / 2 + 0.6; offset < width / 2; offset += 1.15) paint(d.x * (h - 4.6) + right.x * offset, d.z * (h - 4.6) + right.z * offset, yaw, 0.55, 3);
      if (incoming) {
        const twoWay = !r || r.travelDirection === 'two-way', approachWidth = twoWay ? width / 2 : width;
        const lateral = twoWay ? width / 4 : 0;
        paint(d.x * (h - 1) + right.x * lateral, d.z * (h - 1) + right.z * lateral, yaw, approachWidth - 0.25, 0.35);
        const count = twoWay ? laneCount / 2 : laneCount;
        for (let lane = 0; lane < count; lane++) {
          const offset = twoWay ? (lane + 0.5) * laneWidth : -width / 2 + (lane + 0.5) * laneWidth;
          const arrow = makeDirectionArrow('approach arrow', { x: d.x * (h + width / 2 + 4) + right.x * offset, z: d.z * (h + width / 2 + 4) + right.z * offset }, yaw,
            j.type.startsWith('t_') && port === 'north' ? 'left-right' : lane === 0 ? 'straight-left' : lane === count - 1 ? 'straight-right' : 'straight', 4, 1.5, this.materials.whitePaint, () => 0, 0.008);
          if (arrow) root.add(arrow);
        }
      }
      // Short corner curb returns connect to the road's sidewalk edge.
      for (const side of [-1, 1]) {
        const curb = makeBox('curb transition', [0.22, 0.17, 3.4], [d.x * (h - 2.4) + right.x * side * (width / 2 + 0.11), 0.085, d.z * (h - 2.4) + right.z * side * (width / 2 + 0.11)], this.materials.curb, true);
        curb.rotation.y = yaw; root.add(curb);
      }
      if (j.signalized && signals && incoming) {
        const outward = rotatePoint(d, j.rotation), worldRight = rotatePoint(right, j.rotation);
        const lateral = width / 2 + 1;
        // Far-side pole: beyond the conflict box and the opposite crossing, on the
        // served approach's right, with its arm reaching back over the approach lanes.
        const center = { x: j.position.x - outward.x * (h + 1) + worldRight.x * lateral, z: j.position.z - outward.z * (h + 1) + worldRight.z * lateral };
        signals.addHead(index, { segmentId: r?.id ?? `${j.id}:${port}`, outward, right: worldRight,
          approachYawRadians: yaw + j.rotation, approachLaneCount: r?.travelDirection === 'two-way' ? laneCount / 2 : laneCount, approachLaneWidth: laneWidth, roadWidth: width, controlKind: armControlKind(d) },
          center, Math.atan2(-outward.x, -outward.z), this.materials, true, j.signals?.headHeight ?? 5.8);
        signals.root.children.at(-1)!.position.y = j.position.y ?? 0;
      }
    }
    // The closed side of a T gets an uninterrupted sidewalk and curb.
    if (j.type.startsWith('t_')) root.add(makeBox('T closed curb', [h * 2, 0.17, 0.22], [0, 0.085, h], this.materials.curb, true),
      makeBox('T closed sidewalk', [h * 2, 0.14, 2], [0, 0.07, h + 1], this.materials.sidewalk, true));
    return root;
  }
}
