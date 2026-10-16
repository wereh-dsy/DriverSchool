import { LocalRoadMap } from '../ui/LocalRoadMap';
import { projectWorldToRoad, type RoadNetworkData, type RoadPoint, type RoadSegmentData, type RoadIntersectionData } from '../world/navigation/RoadNetwork';
import { LocalVehicleProximity } from './control/LocalVehicleProximity';
import { RearParkingProximity, type RearParkingPose } from './control/RearParkingProximity';
import type { StaticCollider } from './physics/CollisionSystem';
import { updateDrivingEnvironment, type DrivingEnvironmentData } from './visual/DrivingEnvironmentView';
import { LaneObservationTracker, type LanePose } from '../world/navigation/LaneObservation';
import type { LateralAssistDisplayState } from './control/LateralAssistController';
import { createTPMSState, type TPMSState } from './TPMSState';
import { WHEEL_IDS } from './physics/WheelContact';

export type { TyreStatus, TPMSState } from './TPMSState';
/** Adapter for pre-TPMS callers. New presentation consumes tpmsState. */
export interface LegacyTyreReading { pressure: number | null; warning: boolean; valid: boolean }
export interface LaneEnvironment extends DrivingEnvironmentData {
  currentLane: number | null; leftLane: number | null; rightLane: number | null;
  roadBoundaries: readonly [number, number] | null;
  curvature: number | null; lateralOffset: number | null; roadDirection: number | null;
}
export interface NavigationMapData {
  guidance?: import('../world/navigation/NavigationController').NavigationState;
  currentRoad: RoadSegmentData | null;
  /** Existing networks carry IDs, not road names. Unknown metadata stays absent. */
  roadName: string | null; speedLimit: number | null;
  intersections: readonly RoadIntersectionData[]; route: readonly RoadPoint[] | null;
  nearbyNetwork: RoadNetworkData | undefined; complexity: number;
  map: LocalRoadMap; pose: { x: number; z: number; yaw: number };
}
export interface SharedVehicleDataOptions {
  lanes: boolean; navigation: boolean; proximity: boolean; tpms: boolean;
  parkingMode?: 'selector' | 'low-speed';
}

/** Per-vehicle environment source, sampled outside the 120 Hz physics loop.
 * UI adapters borrow it; only this owner disposes its map tiles/index. */
export class SharedVehicleData {
  public tpmsState: TPMSState;
  public readonly laneTracker = new LaneObservationTracker();
  public get laneObservation() { return this.laneTracker.observation; }
  private geometryElapsed = Infinity;
  private nearbyElapsed = Infinity;
  private lateralNetwork: RoadNetworkData | undefined;
  private lateralNearby: RoadNetworkData | undefined;
  /** Geometry at 30 Hz; local spatial query at 5 Hz; controller consumes this at 120 Hz. */
  public updateLaneObservation(dt: number, pose: LanePose, speed: number, network: RoadNetworkData | undefined, branchIntent: boolean): void {
    this.geometryElapsed += dt; this.nearbyElapsed += dt;
    if (network !== this.lateralNetwork) {
      this.lateralNetwork = network; this.laneTracker.configure(network);
      this.navigation.map.setNetwork(network); this.nearbyElapsed = this.geometryElapsed = Infinity;
    }
    if (this.geometryElapsed < 1 / 30) return;
    this.geometryElapsed = 0;
    if (this.nearbyElapsed >= .2) {
      this.lateralNearby = this.navigation.map.nearby(pose.x, pose.z).network; this.nearbyElapsed = 0;
    }
    this.laneTracker.update(pose, speed, this.lateralNearby, branchIntent);
  }
  public resetLanes(): void { this.laneTracker.reset(); this.geometryElapsed = this.nearbyElapsed = Infinity; }
  public lateralAssist?: LateralAssistDisplayState;
  public version = 0;
  public readonly lane: LaneEnvironment = { lanes: [], obstacles: [], currentLane: null, leftLane: null, rightLane: null,
    roadBoundaries: null, curvature: null, lateralOffset: null, roadDirection: null };
  private readonly detector = new LocalVehicleProximity();
  private readonly rearDetector = new RearParkingProximity();
  public readonly parking = this.detector.state;
  public readonly rearParking = this.rearDetector.state;
  public readonly tyres: [LegacyTyreReading, LegacyTyreReading, LegacyTyreReading, LegacyTyreReading] = Array.from({ length: 4 },
    () => ({ pressure: null, warning: false, valid: false })) as SharedVehicleData['tyres'];
  public readonly navigation: NavigationMapData = { currentRoad: null, roadName: null, speedLimit: null,
    intersections: [], route: null, nearbyNetwork: undefined, complexity: 0, map: new LocalRoadMap(), pose: { x: 0, z: 0, yaw: 0 } };
  private elapsed = Infinity;
  private previousState = '';
  private network: RoadNetworkData | undefined;
  public constructor(private readonly options: SharedVehicleDataOptions) { this.tpmsState = createTPMSState(options.tpms); }
  /** Borrow the shared sensor output. Legacy readings are compatibility adapters only. */
  public publishTPMS(state: TPMSState): void {
    this.tpmsState = state;
    for (let i = 0; i < 4; i++) {
      const status = state[WHEEL_IDS[i]!], legacy = this.tyres[i]!;
      legacy.valid = status.valid; legacy.pressure = status.pressureKPa;
      legacy.warning = status.valid && status.pressureState !== 'NORMAL';
    }
  }
  public update(dt: number, pose: RearParkingPose, selector: string, speed: number, operational: boolean,
    network: RoadNetworkData | undefined, query: (pose: RearParkingPose, radius: number) => readonly StaticCollider[]): void {
    this.elapsed += Math.max(0, dt);
    const driving = operational && this.options.lanes && selector !== 'P' && selector !== 'R';
    const parking = operational && this.options.proximity && (this.options.parkingMode === 'selector'
      ? selector === 'P' || selector === 'R' : selector === 'R' || Math.abs(speed) < 2);
    const state = `${selector}|${operational}|${parking}`;
    if (this.elapsed < .1 && state === this.previousState && network === this.network) return;
    this.elapsed = 0; this.previousState = state; this.network = network; this.version++;
    const nav = this.navigation;
    nav.pose.x = pose.x; nav.pose.z = pose.z; nav.pose.yaw = pose.yaw;
    nav.map.setNetwork(this.options.navigation || this.options.lanes || this.lateralNetwork ? network : undefined);
    const nearby = nav.map.nearby(pose.x, pose.z);
    nav.nearbyNetwork = nearby.network; nav.complexity = nearby.complexity;
    const colliders = driving || parking || selector === 'R' ? query(pose, driving ? 38 : 7) : [];
    this.detector.update(pose, parking, colliders);
    this.rearDetector.update(pose, selector === 'R', colliders);
    const projection = nearby.network ? projectWorldToRoad(nearby.network, pose.x, pose.z, pose.y) : null;
    if (driving) updateDrivingEnvironment(this.lane, pose, nearby.network, colliders, true, projection, this.laneTracker.trackedLane);
    else { this.lane.lanes = []; this.lane.laneMarkings = []; this.lane.obstacles = []; }
    const road = nearby.network?.segments.find(r => r.id === projection?.segmentId);
    const valid = road && projection && projection.distanceFromCenterline <= road.width / 2 + 1;
    nav.currentRoad = valid ? road : null; nav.roadName = valid ? road.name ?? null : null;
    nav.speedLimit = valid ? road.speedLimit ?? null : null; nav.intersections = nearby.network?.intersections ?? [];
    const lane = this.lane;
    lane.currentLane = lane.leftLane = lane.rightLane = null;
    lane.roadBoundaries = null; lane.curvature = lane.lateralOffset = lane.roadDirection = null;
    const tracked = this.laneTracker.trackedLane, observation = this.laneObservation;
    if (tracked && observation.valid) {
      const count = tracked.road.lanes!.length, index = tracked.lane.index;
      lane.currentLane = index;
      const along = tracked.lane.direction === 'forward';
      const left = index + (along ? -1 : 1), right = index + (along ? 1 : -1);
      lane.leftLane = left >= 0 && left < count ? left : null; lane.rightLane = right >= 0 && right < count ? right : null;
      lane.roadBoundaries = [-tracked.road.width / 2, tracked.road.width / 2];
      lane.lateralOffset = observation.lateralOffset; lane.roadDirection = observation.targetYaw;
      lane.curvature = observation.curvature;
    }
  }
  /** Compatibility input for older sensor/test callers; thresholds live in physics. */
  public setTyreStatus(index: 0 | 1 | 2 | 3, status: LegacyTyreReading): void {
    if (!this.options.tpms) return;
    const tyre = this.tyres[index];
    tyre.valid = status.valid && status.pressure !== null && Number.isFinite(status.pressure) && status.pressure > 0;
    tyre.pressure = tyre.valid ? status.pressure : null; tyre.warning = tyre.valid && status.warning;
    const sensor = this.tpmsState[WHEEL_IDS[index]];
    sensor.valid = tyre.valid; sensor.pressureKPa = tyre.pressure;
    sensor.pressureState = tyre.warning ? 'LOW' : 'NORMAL';
    this.tpmsState.warning = WHEEL_IDS.some(id => this.tpmsState[id].valid && this.tpmsState[id].pressureState !== 'NORMAL');
  }
  public dispose(): void { this.navigation.map.dispose(); }
}
