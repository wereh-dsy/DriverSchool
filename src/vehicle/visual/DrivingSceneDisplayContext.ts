import type { LocalProximityState } from '../control/LocalVehicleProximity';
import type { RearParkingPose } from '../control/RearParkingProximity';
import type { StaticCollider } from '../physics/CollisionSystem';
import type { RoadNetworkData } from '../../world/navigation/RoadNetwork';
import type { DrivingEnvironmentData } from './DrivingEnvironmentView';
import type { LocalRoadMap } from '../../ui/LocalRoadMap';
import { SharedVehicleData } from '../SharedVehicleData';

export interface DrivingSceneDisplayFeatures { readonly lanes: boolean; readonly proximity: boolean }
export interface DrivingSceneDisplayData extends DrivingEnvironmentData {
  version: number; proximity: LocalProximityState;
  mapPose: { x: number; z: number; yaw: number }; map: LocalRoadMap;
  mapComplexity: number;
}

/** Presentation adapter. A supplied platform source is borrowed, never disposed here. */
export class DrivingSceneDisplayContext {
  private readonly shared: SharedVehicleData;
  private readonly ownsData: boolean;
  public readonly data: DrivingSceneDisplayData;
  public constructor(features: DrivingSceneDisplayFeatures, shared?: SharedVehicleData) {
    this.ownsData = !shared;
    this.shared = shared ?? new SharedVehicleData({ ...features, navigation: true, tpms: false });
    this.data = { version: 0, lanes: [], obstacles: [], proximity: this.shared.parking,
      map: this.shared.navigation.map, mapPose: this.shared.navigation.pose, mapComplexity: 0 };
  }
  public update(dt: number, pose: RearParkingPose, selector: string, speed: number, operational: boolean,
    network: RoadNetworkData | undefined, query: (pose: RearParkingPose, radius: number) => readonly StaticCollider[]): void {
    if (this.ownsData) this.shared.update(dt, pose, selector, speed, operational, network, query);
    this.data.version = this.shared.version;
    this.data.lateralAssist = this.shared.lateralAssist;
    this.data.lanes = this.shared.lane.lanes; this.data.laneMarkings = this.shared.lane.laneMarkings;
    this.data.obstacles = this.shared.lane.obstacles; this.data.mapComplexity = this.shared.navigation.complexity;
  }
  public dispose(): void { if (this.ownsData) this.shared.dispose(); }
}
