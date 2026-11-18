import type { CollisionPoint2, StaticCollider } from '../physics/CollisionSystem';

export const REAR_ZONES = ['LEFT_CORNER', 'LEFT', 'CENTER', 'RIGHT', 'RIGHT_CORNER'] as const;
export type RearZone = typeof REAR_ZONES[number];
export type ProximitySeverity = 'NONE' | 'FAR' | 'CAUTION' | 'NEAR' | 'CRITICAL';
export interface RearZoneState {
  zone: RearZone; detected: boolean; distanceM: number | null; severity: ProximitySeverity;
}
export interface RearParkingState {
  active: boolean; zones: RearZoneState[]; nearestZone: RearZone | null; nearestDistanceM: number | null;
}
export interface RearParkingPose { x: number; z: number; yaw: number; y: number; width: number; length: number }
export const REAR_ZONE_LABELS: Record<RearZone, string> = {
  LEFT_CORNER: 'Rear left corner', LEFT: 'Rear left', CENTER: 'Rear center', RIGHT: 'Rear right', RIGHT_CORNER: 'Rear right corner',
};
export const PROXIMITY_COLORS: Record<ProximitySeverity, string> = {
  NONE: '#53616c', FAR: '#71b899', CAUTION: '#e9cf73', NEAR: '#ee9747', CRITICAL: '#f45c57',
};
export const proximitySeverity = (distance: number): ProximitySeverity => distance > 2.5 ? 'NONE'
  : distance > 1.5 ? 'FAR' : distance > .8 ? 'CAUTION' : distance >= .4 ? 'NEAR' : 'CRITICAL';

/** Clip the existing world collider footprint to a convex sensor region. */
export function clipRegion(points: CollisionPoint2[], region: CollisionPoint2[]): CollisionPoint2[] {
  for (let i = 0; i < region.length && points.length; i++) {
    const a = region[i]!, b = region[(i + 1) % region.length]!;
    const side = (p: CollisionPoint2): number => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    const clipped: CollisionPoint2[] = [];
    let previous = points[points.length - 1]!, previousSide = side(previous);
    for (const p of points) {
      const currentSide = side(p);
      if ((currentSide >= 0) !== (previousSide >= 0)) {
        const t = previousSide / (previousSide - currentSide);
        clipped.push({ x: previous.x + t * (p.x - previous.x), z: previous.z + t * (p.z - previous.z) });
      }
      if (currentSide >= 0) clipped.push(p);
      previous = p; previousSide = currentSide;
    }
    points = clipped;
  }
  return points;
}

export function distanceToSurface(origin: CollisionPoint2, polygon: CollisionPoint2[]): number {
  let minimum = Infinity, inside = true;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((origin.x - a.x) * dx + (origin.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    minimum = Math.min(minimum, Math.hypot(origin.x - a.x - t * dx, origin.z - a.z - t * dz));
    if (dx * (origin.z - a.z) - dz * (origin.x - a.x) < -1e-8) inside = false;
  }
  return inside ? 0 : minimum;
}

/** Display-rate query over shared static colliders; never alters vehicle dynamics. */
export class RearParkingProximity {
  public readonly state: RearParkingState = { active: false, zones: REAR_ZONES.map(zone => ({
    zone, detected: false, distanceM: null, severity: 'NONE',
  })), nearestZone: null, nearestDistanceM: null };
  public update(pose: RearParkingPose, reverseSelected: boolean, colliders: readonly StaticCollider[]): RearParkingState {
    const state = this.state;
    state.active = reverseSelected; state.nearestZone = null; state.nearestDistanceM = null;
    for (const zone of state.zones) { zone.detected = false; zone.distanceM = null; zone.severity = 'NONE'; }
    if (!reverseSelected) return state;
    const half = pose.width / 2, rear = pose.length / 2;
    const regions: CollisionPoint2[][] = [];
    const origins: CollisionPoint2[] = [];
    // Three rear-facing trapezoids cover the bumper width and expand .45m on each side.
    for (let i = 0; i < 3; i++) {
      const left = -half + i * pose.width / 3, right = left + pose.width / 3;
      regions.push([{ x: left, z: rear }, { x: right, z: rear },
        { x: right + (i === 2 ? .45 : 0), z: rear + 3 }, { x: left - (i === 0 ? .45 : 0), z: rear + 3 }]);
      origins.push({ x: (left + right) / 2, z: rear });
    }
    // Short outward sectors start at the rear corners, never beside the doors.
    regions.unshift([{ x: -half, z: rear }, { x: -half, z: rear + 1.8 }, { x: -half - 1.8, z: rear + 1.8 }, { x: -half - 1.8, z: rear }]);
    origins.unshift({ x: -half, z: rear });
    regions.push([{ x: half, z: rear }, { x: half + 1.8, z: rear }, { x: half + 1.8, z: rear + 1.8 }, { x: half, z: rear + 1.8 }]);
    origins.push({ x: half, z: rear });
    const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
    const world = (p: CollisionPoint2): CollisionPoint2 => ({ x: pose.x + p.x * c + p.z * s,
      z: pose.z - p.x * s + p.z * c });
    const worldRegions = regions.map(region => region.map(world));
    const worldOrigins = origins.map(world);
    for (const collider of colliders) {
      if (collider.maxHeight < pose.y || collider.minHeight > pose.y + 1.5) continue;
      if (Math.hypot(collider.center.x - pose.x, collider.center.z - pose.z) > rear + 4 + Math.hypot(collider.halfWidth, collider.halfLength)) continue;
      for (let i = 0; i < state.zones.length; i++) {
        const intersection = clipRegion([...collider.corners], worldRegions[i]!);
        if (intersection.length < 3) continue;
        const distance = distanceToSurface(worldOrigins[i]!, intersection), range = i === 0 || i === 4 ? 1.8 : 3;
        const zone = state.zones[i]!;
        if (distance > range || (zone.distanceM !== null && distance >= zone.distanceM)) continue;
        zone.detected = true; zone.distanceM = distance; zone.severity = proximitySeverity(distance);
        if (state.nearestDistanceM === null || distance < state.nearestDistanceM) {
          state.nearestDistanceM = distance; state.nearestZone = zone.zone;
        }
      }
    }
    return state;
  }
}
