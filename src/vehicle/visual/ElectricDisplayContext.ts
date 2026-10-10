import { AdaptiveMapZoom, LocalRoadMap } from '../../ui/LocalRoadMap';
import { LocalVehicleProximity, type LocalProximityState } from '../control/LocalVehicleProximity';
import type { RearParkingPose } from '../control/RearParkingProximity';
import type { StaticCollider } from '../physics/CollisionSystem';
import type { RoadNetworkData } from '../../world/navigation/RoadNetwork';
import { updateDrivingEnvironment, type DrivingEnvironmentData } from './DrivingEnvironmentView';

export interface ElectricDisplayData extends DrivingEnvironmentData {
  version: number; parking: boolean; reverse: boolean;
  proximity: LocalProximityState;
  map: LocalRoadMap; viewMetres: number;
  x: number; z: number; yaw: number; localTime: string;
}
/** EV HMI adapter, using shared road/lane geometry and the existing collision index. */
export class ElectricDisplayContext {
  private readonly proximity = new LocalVehicleProximity();
  private readonly zoom = new AdaptiveMapZoom();
  private elapsed = Infinity;
  private clock = Infinity;
  private selector = '';
  private complexity = 0;
  public readonly data: ElectricDisplayData = { version: 0, parking: true, reverse: false,
    lanes: [], obstacles: [], proximity: this.proximity.state, map: new LocalRoadMap(),
    viewMetres: 90, x: 0, z: 0, yaw: 0, localTime: '' };
  public update(dt: number, pose: RearParkingPose, selector: string, speed: number,
    network: RoadNetworkData | undefined, query: (pose: RearParkingPose, radius: number) => readonly StaticCollider[]): void {
    const data = this.data;
    data.map.setNetwork(network);
    this.elapsed += dt; this.clock += dt;
    if (this.clock >= 1) { data.localTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); this.clock = 0; }
    if (this.elapsed >= .1 || selector !== this.selector) {
      this.elapsed = 0; this.selector = selector; data.version++;
      data.parking = selector === 'P' || selector === 'R'; data.reverse = selector === 'R';
      const nearby = data.map.nearby(pose.x, pose.z); this.complexity = nearby.complexity;
      const colliders = query(pose, data.parking ? 7 : 38);
      this.proximity.update(pose, data.parking, colliders);
      if (data.parking) { data.lanes = []; data.obstacles = []; }
      else updateDrivingEnvironment(data, pose, nearby.network, colliders);
    }
    data.x = pose.x; data.z = pose.z; data.yaw = pose.yaw;
    data.viewMetres = this.zoom.update(dt, speed, this.complexity, selector);
  }
  public dispose(): void { this.data.map.dispose(); }
}
