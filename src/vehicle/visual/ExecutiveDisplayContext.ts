import { projectWorldToRoad, type RoadNetworkData } from '../../world/navigation/RoadNetwork';
import type { StaticCollider } from '../physics/CollisionSystem';
import type { FuelSnapshot } from '../physics/FuelSystem';
import type { TripComputerSnapshot } from '../control/TripComputer';
import { RearParkingProximity, type RearParkingState } from '../control/RearParkingProximity';

export interface DisplayPoint { x: number; forward: number; distanceAlong?: number }
export interface DisplayObstacle extends DisplayPoint { distance: number; width: number; length: number }
export interface ExecutiveDisplayData {
  version: number;
  page: 'DRIVING' | 'MAP' | 'PARKING' | 'TRIP' | 'CRUISE';
  overlay: { title: string; value: string; alpha: number } | null;
  lanes: DisplayPoint[][];
  laneMarkings?: ('solid' | 'dashed')[];
  roads: DisplayPoint[][];
  obstacles: DisplayObstacle[];
  rearParking?: RearParkingState;
  localTime?: string;
  localDate?: string;
  trip: { seconds: number; averageSpeed: number | null; fuel: FuelSnapshot; distanceKm?: number;
    odometerKm?: number; averageConsumptionLPer100km?: number | null };
}

/** Display-only adapter over shared road/collider/fuel data; never controls driving. */
export class ExecutiveDisplayContext {
  private readonly rearDetector = new RearParkingProximity();
  private manualPage: 'DRIVING' | 'MAP' | 'CRUISE' = 'DRIVING';
  private overlayTime = 0;
  private overlay: { title: string; value: string } | null = null;
  private elapsed = Infinity;
  private previousMode = '';
  private previousCruise = '';
  private clockElapsed = Infinity;
  private cruiseWasActive = false;
  public readonly data: ExecutiveDisplayData;
  public constructor(fuel: FuelSnapshot) {
    this.data = { version: 0, page: 'TRIP', overlay: null, lanes: [], roads: [], obstacles: [],
      trip: { seconds: 0, averageSpeed: null, fuel } };
  }
  public cyclePage(): void {
    // One command walks every information page the face supports; the map page
    // remains part of the cycle for faces that draw roads.
    this.manualPage = this.manualPage === 'DRIVING' ? 'MAP'
      : this.manualPage === 'MAP' ? 'CRUISE' : 'DRIVING';
    this.elapsed = Infinity;
  }
  public update(dt: number, pose: { x: number; z: number; yaw: number; y: number; width: number; length: number }, gear: string,
    mode: string, cruise: boolean, target: number | null, fuel: FuelSnapshot,
    network: RoadNetworkData | undefined, colliders: readonly StaticCollider[], _active: boolean, trip?: TripComputerSnapshot,
    rearParking?: RearParkingState): void {
    this.data.rearParking = rearParking ?? this.rearDetector.update(pose, gear === 'R', colliders);
    this.clockElapsed += dt;
    if (this.clockElapsed >= 1) {
      this.clockElapsed = 0;
      const now = new Date(), pad = (n: number): string => String(n).padStart(2, '0');
      this.data.localTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
      this.data.localDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }
    const cruiseKey = cruise ? String(Math.round(target ?? 0)) : '';
    if (this.previousMode && mode !== this.previousMode) { this.overlay = { title: 'DRIVE SELECT', value: mode }; this.overlayTime = 1.65; }
    else if (cruiseKey && cruiseKey !== this.previousCruise) { this.overlay = { title: 'CRUISE CONTROL', value: `SET ${cruiseKey} km/h` }; this.overlayTime = 1.65; }
    this.previousMode = mode; this.previousCruise = cruiseKey;
    this.overlayTime = Math.max(0, this.overlayTime - dt);
    // Cruise information owns the centre column while cruise is engaged, but
    // never replaces the trip or parking pages a driver may have selected.
    if (cruise && !this.cruiseWasActive && this.manualPage === 'DRIVING') this.manualPage = 'CRUISE';
    else if (!cruise && this.cruiseWasActive && this.manualPage === 'CRUISE') this.manualPage = 'DRIVING';
    this.cruiseWasActive = cruise;
    this.elapsed += dt;
    const page = gear === 'R' ? 'PARKING' : gear === 'P' ? 'TRIP' : this.manualPage;
    if (this.elapsed < .1 && page === this.data.page) return;
    this.elapsed = 0;
    this.data.version++; this.data.page = page;
    this.data.overlay = this.overlayTime > 0 && this.overlay !== null
      ? { ...this.overlay, alpha: Math.min(1, this.overlayTime / .25) } : null;
    this.data.trip = { seconds: trip?.tripA.operatingTimeSeconds ?? 0, averageSpeed: trip?.tripA.averageSpeedKmh ?? null, fuel,
      distanceKm: trip?.tripA.distanceKm, odometerKm: trip?.totalDistanceKm,
      averageConsumptionLPer100km: trip?.tripA.averageFuelConsumptionLPer100km };
    const cos = Math.cos(pose.yaw), sin = Math.sin(pose.yaw);
    const local = (x: number, z: number): DisplayPoint => ({
      x: (x - pose.x) * cos - (z - pose.z) * sin,
      forward: -(x - pose.x) * sin - (z - pose.z) * cos });
    this.data.lanes = []; this.data.laneMarkings = []; this.data.roads = []; this.data.obstacles = [];
    if (network && page === 'MAP') {
      for (const road of network.segments) {
        const line = road.centerline.map(p => local(p.x, p.z));
        const nearby = line.some(p => Math.abs(p.x) < 110 && Math.abs(p.forward) < 110) || line.some((p, i) => {
          const a = line[i - 1]; if (!a) return false;
          const dx = p.x - a.x, dz = p.forward - a.forward, lengthSquared = dx * dx + dz * dz;
          const t = lengthSquared ? Math.max(0, Math.min(1, -(a.x * dx + a.forward * dz) / lengthSquared)) : 0;
          return Math.hypot(a.x + t * dx, a.forward + t * dz) < 110;
        });
        if (nearby) this.data.roads.push(line);
      }
    }
    if (network && (page === 'DRIVING' || page === 'CRUISE')) {
      const projected = projectWorldToRoad(network, pose.x, pose.z);
      const road = network.segments.find(r => r.id === projected?.segmentId);
      if (road && projected && projected.distanceFromCenterline <= road.width / 2 + 1) {
        const n = road.laneWidth;
        // Actual lane containing the projected vehicle, bounded by the authored road edge.
        const lane = Math.max(-road.width / 2, Math.min(road.width / 2 - n, Math.floor((projected.lateralOffset + road.width / 2) / n) * n - road.width / 2));
        const boundaries: DisplayPoint[][] = [[], []];
        // Same-direction dividers are dashed. Road edges and the opposing
        // carriageway separator are solid, matching the existing road builders.
        this.data.laneMarkings = [lane, lane + n].map(offset =>
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
        this.data.lanes = boundaries;
      }
    }
    if (page === 'DRIVING') {
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
        if (nearest.forward > 0 && nearest.forward < 32 && Math.abs(nearest.x) < 7) this.data.obstacles.push({
          ...nearest, distance, width: Math.min(3, collider.halfWidth * 2), length: Math.min(3, collider.halfLength * 2) });
      }
      this.data.obstacles.sort((a, b) => a.forward - b.forward); this.data.obstacles.length = Math.min(8, this.data.obstacles.length);
    }
  }
}
