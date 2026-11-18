import { AdaptiveMapZoom, type LocalRoadMap } from '../../ui/LocalRoadMap';
import type { LocalProximityState } from '../control/LocalVehicleProximity';
import type { RearParkingPose } from '../control/RearParkingProximity';
import type { StaticCollider } from '../physics/CollisionSystem';
import type { RoadNetworkData } from '../../world/navigation/RoadNetwork';
import type { DrivingEnvironmentData } from './DrivingEnvironmentView';
import { SharedVehicleData } from '../SharedVehicleData';

export interface ElectricDisplayData extends DrivingEnvironmentData {
  version: number; parking: boolean; reverse: boolean; proximity: LocalProximityState;
  map: LocalRoadMap; viewMetres: number; x: number; z: number; yaw: number; localTime: string;
}
/** EV skin state only. Lane, map and parking observations come from the platform. */
export class ElectricDisplayContext {
  private readonly shared: SharedVehicleData;
  private readonly ownsData: boolean;
  private readonly zoom = new AdaptiveMapZoom();
  private clock = Infinity;
  public readonly data: ElectricDisplayData;
  public constructor(shared?: SharedVehicleData) {
    this.ownsData = !shared;
    this.shared = shared ?? new SharedVehicleData({ lanes: true, navigation: true, proximity: true, tpms: true, parkingMode: 'selector' });
    this.data = { version: 0, parking: true, reverse: false, lanes: [], obstacles: [], proximity: this.shared.parking,
      map: this.shared.navigation.map, viewMetres: 90, x: 0, z: 0, yaw: 0, localTime: '' };
  }
  public update(dt: number, pose: RearParkingPose, selector: string, speed: number,
    network: RoadNetworkData | undefined, query: (pose: RearParkingPose, radius: number) => readonly StaticCollider[]): void {
    if (this.ownsData) this.shared.update(dt, pose, selector, speed, true, network, query);
    const data = this.data;
    this.clock += dt;
    if (this.clock >= 1) { data.localTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); this.clock = 0; }
    data.version = this.shared.version; data.parking = selector === 'P' || selector === 'R'; data.reverse = selector === 'R';
    data.lateralAssist = this.shared.lateralAssist;
    data.lanes = this.shared.lane.lanes; data.laneMarkings = this.shared.lane.laneMarkings; data.obstacles = this.shared.lane.obstacles;
    data.x = pose.x; data.z = pose.z; data.yaw = pose.yaw;
    data.viewMetres = this.zoom.update(dt, speed, this.shared.navigation.complexity, selector);
  }
  public dispose(): void { if (this.ownsData) this.shared.dispose(); }
}
