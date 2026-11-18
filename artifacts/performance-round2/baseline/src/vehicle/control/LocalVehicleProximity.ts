import type { StaticCollider, CollisionPoint2 } from '../physics/CollisionSystem';
import { clipRegion, distanceToSurface, proximitySeverity, type ProximitySeverity, type RearParkingPose } from './RearParkingProximity';

export const LOCAL_PROXIMITY_ZONES = ['FRONT_LEFT', 'FRONT', 'FRONT_RIGHT', 'RIGHT', 'REAR_RIGHT', 'REAR', 'REAR_LEFT', 'LEFT'] as const;
export type LocalProximityZone = typeof LOCAL_PROXIMITY_ZONES[number];
export interface LocalProximityState {
  active: boolean;
  zones: { zone: LocalProximityZone; distanceM: number | null; severity: ProximitySeverity }[];
  nearestZone: LocalProximityZone | null; nearestDistanceM: number | null;
}
/** Display-rate 360 query over the existing collision spatial index candidates. */
export class LocalVehicleProximity {
  public readonly state: LocalProximityState = { active: false, nearestZone: null, nearestDistanceM: null,
    zones: LOCAL_PROXIMITY_ZONES.map(zone => ({ zone, distanceM: null, severity: 'NONE' })) };
  public update(pose: RearParkingPose, active: boolean, colliders: readonly StaticCollider[]): LocalProximityState {
    const state = this.state; state.active = active; state.nearestZone = null; state.nearestDistanceM = null;
    for (const zone of state.zones) { zone.distanceM = null; zone.severity = 'NONE'; }
    if (!active) return state;
    const w = pose.width / 2, l = pose.length / 2, r = 2.5, c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
    const regions = [
      [-w-r,-l-r,-w/3,-l], [-w/3,-l-r,w/3,-l], [w/3,-l-r,w+r,-l],
      [w,-l,w+r,l], [w/3,l,w+r,l+r], [-w/3,l,w/3,l+r], [-w-r,l,-w/3,l+r], [-w-r,-l,-w,l],
    ];
    const origins = [[-w,-l],[0,-l],[w,-l],[w,0],[w,l],[0,l],[-w,l],[-w,0]];
    const world = (x: number, z: number): CollisionPoint2 => ({ x: pose.x + x*c + z*s, z: pose.z - x*s + z*c });
    const polygons = regions.map(([x1,z1,x2,z2]) => [world(x1!,z1!),world(x2!,z1!),world(x2!,z2!),world(x1!,z2!)]);
    const sensors = origins.map(([x,z]) => world(x!,z!));
    for (const collider of colliders) {
      if (collider.maxHeight < pose.y || collider.minHeight > pose.y + 1.5) continue;
      for (let i=0;i<state.zones.length;i++) {
        const clipped = clipRegion([...collider.corners], polygons[i]!); if (clipped.length < 3) continue;
        const distance = distanceToSurface(sensors[i]!, clipped), zone = state.zones[i]!;
        if (distance > r || zone.distanceM !== null && distance >= zone.distanceM) continue;
        zone.distanceM = distance; zone.severity = proximitySeverity(distance);
        if (state.nearestDistanceM === null || distance < state.nearestDistanceM) { state.nearestDistanceM = distance; state.nearestZone = zone.zone; }
      }
    }
    return state;
  }
}
