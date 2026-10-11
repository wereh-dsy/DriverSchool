import { LocalRoadMap } from '../../ui/LocalRoadMap';
import { LocalVehicleProximity, type LocalProximityState } from '../control/LocalVehicleProximity';
import type { RearParkingPose } from '../control/RearParkingProximity';
import type { StaticCollider } from '../physics/CollisionSystem';
import type { RoadNetworkData } from '../../world/navigation/RoadNetwork';
import { updateDrivingEnvironment, type DrivingEnvironmentData } from './DrivingEnvironmentView';

export interface DrivingSceneDisplayFeatures { readonly lanes: boolean; readonly proximity: boolean }
export interface DrivingSceneDisplayData extends DrivingEnvironmentData {
  version: number;
  proximity: LocalProximityState;
  /** Render-facing pose sampled with the existing 10 Hz scene data. */
  mapPose: { x: number; z: number; yaw: number };
  /** Existing indexed map service, shared by cockpit presentations. */
  map: LocalRoadMap;
}

/** Small display-rate adapter over the existing lane, map and collision services.
 * These are presentation features, never assistance or vehicle physics capabilities. */
export class DrivingSceneDisplayContext {
  private readonly detector = new LocalVehicleProximity();
  private elapsed = Infinity;
  private selector = '';
  private operational = false;
  public readonly data: DrivingSceneDisplayData = {
    version: 0, lanes: [], obstacles: [], proximity: this.detector.state, map: new LocalRoadMap(), mapPose: { x: 0, z: 0, yaw: 0 },
  };
  public constructor(private readonly features: DrivingSceneDisplayFeatures) {}
  public update(dt: number, pose: RearParkingPose, selector: string, speed: number, operational: boolean,
    network: RoadNetworkData | undefined, query: (pose: RearParkingPose, radius: number) => readonly StaticCollider[]): void {
    this.data.map.setNetwork(network);
    this.elapsed += dt;
    if (this.elapsed < .1 && selector === this.selector && operational === this.operational) return;
    this.elapsed = 0; this.selector = selector; this.operational = operational; this.data.version++;
    this.data.mapPose.x = pose.x; this.data.mapPose.z = pose.z; this.data.mapPose.yaw = pose.yaw;
    const driving = operational && this.features.lanes && selector !== 'P' && selector !== 'R';
    const parking = operational && this.features.proximity && (selector === 'R' || Math.abs(speed) < 2);
    const colliders = driving || parking ? query(pose, driving ? 38 : 7) : [];
    this.detector.update(pose, parking, colliders);
    if (driving) updateDrivingEnvironment(this.data, pose, this.data.map.nearby(pose.x, pose.z).network, colliders);
    else { this.data.lanes = []; this.data.laneMarkings = []; this.data.obstacles = []; }
  }
  public dispose(): void { this.data.map.dispose(); }
}
