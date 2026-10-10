import { updateDrivingEnvironment } from './DrivingEnvironmentView';
import { type RoadNetworkData } from '../../world/navigation/RoadNetwork';
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
    if (page === 'DRIVING' || page === 'CRUISE') updateDrivingEnvironment(this.data, pose, network, colliders, page === 'DRIVING');
  }
}
