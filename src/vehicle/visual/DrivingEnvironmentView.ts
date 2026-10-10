import { projectWorldToRoad, type RoadNetworkData } from '../../world/navigation/RoadNetwork';
import type { StaticCollider } from '../physics/CollisionSystem';
import type { RearParkingPose } from '../control/RearParkingProximity';
import type { DisplayPoint, DisplayObstacle } from './ExecutiveDisplayContext';
export interface DrivingEnvironmentData { lanes: DisplayPoint[][]; laneMarkings?: ('solid' | 'dashed')[]; obstacles: DisplayObstacle[] }
/** Shared A6L/EV display geometry only; no perception, lane control or traffic synthesis. */
export function updateDrivingEnvironment(data: DrivingEnvironmentData, pose: RearParkingPose, network: RoadNetworkData | undefined, colliders: readonly StaticCollider[], includeObstacles = true): void {
  data.lanes = []; data.laneMarkings = []; data.obstacles = [];
  const cos = Math.cos(pose.yaw), sin = Math.sin(pose.yaw);
  const local = (x: number, z: number): DisplayPoint => ({ x: (x-pose.x)*cos-(z-pose.z)*sin, forward: -(x-pose.x)*sin-(z-pose.z)*cos });
    if (network) {
      const projected = projectWorldToRoad(network, pose.x, pose.z);
      const road = network.segments.find(r => r.id === projected?.segmentId);
      if (road && projected && projected.distanceFromCenterline <= road.width / 2 + 1) {
        const n = road.laneWidth;
        // Actual lane containing the projected vehicle, bounded by the authored road edge.
        const lane = Math.max(-road.width / 2, Math.min(road.width / 2 - n, Math.floor((projected.lateralOffset + road.width / 2) / n) * n - road.width / 2));
        const boundaries: DisplayPoint[][] = [[], []];
        // Same-direction dividers are dashed. Road edges and the opposing
        // carriageway separator are solid, matching the existing road builders.
        data.laneMarkings = [lane, lane + n].map(offset =>
          Math.abs(Math.abs(offset) - road.width / 2) < .01 ||
          (road.travelDirection === 'two-way' && Math.abs(offset) < .01) ? 'solid' : 'dashed');
        const line = road.centerline;
        let distanceAlong = 0;
        for (let i = 1; i < line.length; i++) {
          const a = line[i - 1]!, b = line[i]!, dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
          if (!length) continue;
          const count = Math.ceil(length / 3);
          for (let j = 0; j <= count; j++) {
            const x = a.x + dx * j / count, z = a.z + dz * j / count;
            for (let k = 0; k < 2; k++) {
              const offset = lane + k * n, p = local(x - dz / length * offset, z + dx / length * offset);
              p.distanceAlong = distanceAlong + length * j / count;
              if (p.forward >= -2 && p.forward <= 42 && Math.abs(p.x) < 22) boundaries[k]!.push(p);
            }
          }
          distanceAlong += length;
        }
        // Reverse polyline order when travelling towards its start.
        boundaries.forEach(points => points.sort((a, b) => a.forward - b.forward));
        data.lanes = boundaries;
      }
    }
    if (includeObstacles) {
      for (const collider of colliders) {
        if (collider.maxHeight < pose.y || collider.minHeight > pose.y + 1.5) continue;
        const p = local(collider.center.x, collider.center.z), radius = Math.hypot(collider.halfWidth, collider.halfLength);
        if (Math.hypot(p.x, p.forward) - radius > 36) continue;
        // Closest point on the actual OBB, not its distant centre (important for walls).
        const c = Math.cos(collider.yaw), s = Math.sin(collider.yaw);
        const dx = pose.x - collider.center.x, dz = pose.z - collider.center.z;
        const bx = Math.max(-collider.halfWidth, Math.min(collider.halfWidth, dx * c - dz * s));
        const bz = Math.max(-collider.halfLength, Math.min(collider.halfLength, dx * s + dz * c));
        const nearest = local(collider.center.x + bx * c + bz * s, collider.center.z - bx * s + bz * c);
        const distance = Math.max(0, Math.hypot(Math.max(0, Math.abs(nearest.x) - pose.width / 2), Math.max(0, Math.abs(nearest.forward) - pose.length / 2)));
        if (nearest.forward > 0 && nearest.forward < 32 && Math.abs(nearest.x) < 7) data.obstacles.push({
          ...nearest, distance, width: Math.min(3, collider.halfWidth * 2), length: Math.min(3, collider.halfLength * 2) });
      }
      data.obstacles.sort((a, b) => a.forward - b.forward); data.obstacles.length = Math.min(8, data.obstacles.length);
    }
}
