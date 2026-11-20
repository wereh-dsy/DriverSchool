import { Group, Scene, Vector2, Vector3 } from 'three';
import { VehicleDynamics } from '../physics/VehicleDynamics';
import { VehicleContactSystem } from '../physics/VehicleContactSystem';
import type { Powertrain } from '../powertrain/Powertrain';
import { createVehiclePhysicsConfig, getVehicleDescriptor, type VehicleId } from '../VehicleCatalog';
import { createNeutralVehicleInputState, type VehicleInputState } from '../../input/VehicleInputState';
import { VehicleInputSystem } from '../../input/VehicleInputSystem';
import { VehicleLightingController } from '../control/VehicleLightingController';
import { SURFACE_MATERIALS } from '../../world/SurfaceMaterial';
import type { DrivingGround } from '../../world/DrivingGround';
import type {
  RoadIntersectionData,
  RoadNetworkData,
  RoadPoint,
  RoadRoutingConnection,
  RoadSegmentData,
} from '../../world/navigation/RoadNetwork';
import { NavigationController } from '../../world/navigation/NavigationController';
import type {
  TrafficSignalColor,
  TrafficSignalJunctionState,
  TrafficSignalLaneState,
  TrafficSignalMovement,
  TrafficSignalProvider,
} from '../../world/navigation/TrafficSignalState';
import { createStaticOBBCollider, type StaticCollider } from '../physics/CollisionSystem';
import { ADASController } from './ADASController';
import { syncADASLiveVehicleTelemetry } from './ADASVehicleDynamics';
import { ScenarioDebugger } from './debugger/ScenarioDebugger';
import type {
  ADASState,
  ADASVehicleState,
  ADASWorldContext,
  TrafficActorSnapshot,
} from './ADASTypes';

const FIXED_DT = 1 / 120;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ADAS V1 self-test failed: ${message}`);
}

export interface ADASScenarioSummary {
  id: string;
  name: string;
  passed: boolean;
  metrics: Record<string, number | string | boolean>;
}

/** Helper to construct a clean RoadSegmentData with authored or omitted logical lanes. */
function makeRoad(options: {
  id: string;
  name?: string;
  points: RoadPoint[];
  laneCountPerDirection?: number;
  laneWidth?: number;
  travelDirection?: 'two-way' | 'forward' | 'reverse';
  speedLimit?: number;
  roadType?: 'highway' | 'urban' | 'ramp' | 'circuit';
  roadFunction?: 'arterial' | 'collector' | 'local' | 'ramp';
  markingsAvailable?: boolean;
  omitLanes?: boolean;
}): RoadSegmentData {
  const laneCountPerDir = options.laneCountPerDirection ?? 2;
  const laneWidth = options.laneWidth ?? 3.5;
  const dir = options.travelDirection ?? 'two-way';
  const totalLanes = dir === 'two-way' ? laneCountPerDir * 2 : laneCountPerDir;
  let length = 0;
  for (let i = 1; i < options.points.length; i++) {
    const a = options.points[i - 1]!, b = options.points[i]!;
    length += Math.hypot(b.x - a.x, b.z - a.z);
  }
  const lanes = options.omitLanes
    ? undefined
    : Array.from({ length: totalLanes }, (_, index) => ({
        id: `${options.id}:lane:${index}`,
        roadId: options.id,
        index,
        direction:
          dir === 'two-way'
            ? (index < laneCountPerDir ? ('reverse' as const) : ('forward' as const))
            : dir,
        width: laneWidth,
      }));
  return {
    id: options.id,
    name: options.name ?? options.id,
    centerline: options.points,
    width: totalLanes * laneWidth,
    length,
    laneCountPerDirection: laneCountPerDir,
    laneWidth,
    travelDirection: dir,
    speedLimit: options.speedLimit,
    roadType: options.roadType ?? 'urban',
    roadFunction: options.roadFunction,
    lanes,
    markingsAvailable: options.markingsAvailable ?? true,
  };
}

function makeNetwork(
  segments: RoadSegmentData[],
  connections: RoadRoutingConnection[] = [],
  intersections: RoadIntersectionData[] = [],
): RoadNetworkData {
  return {
    mapId: 'adas-test-map',
    bounds: { minimumX: -2000, maximumX: 2000, minimumZ: -2000, maximumZ: 2000 },
    segments,
    intersections,
    routing: { connections, places: [] },
  };
}

function makeFlatGround(network: RoadNetworkData, colliders: StaticCollider[] = [], gripMultiplier = 1): DrivingGround {
  return {
    root: new Group(),
    spawnPose: { position: new Vector3(0, 0, 0), yawRadians: 0 },
    metadata: { id: 'adas-test-ground', version: 1, displayName: 'ADAS Test', description: 'Synthetic flat road test' },
    worldBounds: { minX: -2000, maxX: 2000, minZ: -2000, maxZ: 2000 },
    roadNetwork: network,
    colliders,
    sampleRoadSurface: () => ({
      ...SURFACE_MATERIALS.asphalt,
      height: 0,
      gradient: new Vector2(),
      normal: new Vector3(0, 1, 0),
      grade: 0,
      gripMultiplier,
      rollingResistanceMultiplier: 1,
    }),
    getRoadHeightAt: () => 0,
    getRoadPitchAt: () => 0,
    dispose: () => {},
  };
}

class MockTrafficSignalProvider implements TrafficSignalProvider {
  public color: TrafficSignalColor = 'red';
  public secondsToChange = 12;
  public secondsToGreen = 12;
  public readonly junctionId: string;
  public readonly roadId: string;
  public readonly laneIds: string[];
  public readonly movements: TrafficSignalMovement[];

  public constructor(
    junctionId: string,
    roadId: string,
    laneIds: string[],
    movements: TrafficSignalMovement[] = ['straight', 'left', 'right'],
  ) {
    this.junctionId = junctionId;
    this.roadId = roadId;
    this.laneIds = laneIds;
    this.movements = movements;
  }

  public getLaneSignal(laneId: string): TrafficSignalLaneState | undefined {
    const idx = this.laneIds.indexOf(laneId);
    if (idx < 0) return undefined;
    return {
      junctionId: this.junctionId,
      roadId: this.roadId,
      laneId,
      approachLaneIndex: idx,
      movements: this.movements.map(m => ({
        movement: m,
        signalControlled: m !== 'right',
        color: m === 'right' ? 'green' : this.color,
        permitted: m === 'right' || this.color === 'green',
        secondsToChange: this.secondsToChange,
        secondsToGreen: this.color === 'green' ? 0 : this.secondsToGreen,
      })),
    };
  }

  public getJunctionSignal(junctionId: string): TrafficSignalJunctionState | undefined {
    if (junctionId !== this.junctionId) return undefined;
    return {
      junctionId,
      profile: 'lane-countdown',
      phaseId: `${this.color}-phase`,
      secondsInPhase: 2,
      secondsRemaining: this.secondsToChange,
      cycleSeconds: 60,
      lanes: this.laneIds.map(id => this.getLaneSignal(id)!),
    };
  }
}

interface SimRig {
  dynamics: VehicleDynamics<Powertrain>;
  contacts: VehicleContactSystem;
  nav: NavigationController;
  adas: ADASController;
  lights: VehicleLightingController;
  scenarioDebugger?: ScenarioDebugger;
  dims: { width: number; length: number };
  step: (
    driverMutator?: (input: VehicleInputState, t: number, snap: ReturnType<VehicleDynamics<Powertrain>['getSnapshot']>) => void,
    worldMutator?: (world: ADASWorldContext, t: number) => void,
  ) => {
    out: VehicleInputState;
    snap: ReturnType<VehicleDynamics<Powertrain>['getSnapshot']>;
    state: ADASState;
  };
  simTime: number;
  conflictViolations: number;
}

function createSimRig(options: {
  vehicleId?: VehicleId;
  network: RoadNetworkData;
  colliders?: StaticCollider[];
  startX: number;
  startZ: number;
  startYaw?: number;
  startSpeed?: number;
  destination?: { roadId: string; along: number; x: number; z: number; direction?: 'forward' | 'reverse' };
  trafficSignals?: TrafficSignalProvider;
  actors?: TrafficActorSnapshot[];
  useScenarioDebugger?: boolean;
  roadGripMultiplier?: number;
  wetness?: number;
  visibilityFactor?: number;
  adasConfig?: Partial<import('./ADASTypes').ADASConfig>;
}): SimRig {
  const vehicleId = options.vehicleId ?? 'bmw-530li-g38';
  const config = createVehiclePhysicsConfig(vehicleId);
  const dims = getVehicleDescriptor(vehicleId).visualConfig.dimensions;
  const groundGrip = options.roadGripMultiplier ?? 1;
  const ground = makeFlatGround(options.network, options.colliders ?? [], groundGrip);
  const dynamics = new VehicleDynamics<Powertrain>(config, {
    x: options.startX,
    z: options.startZ,
    yaw: options.startYaw ?? 0,
    speed: options.startSpeed ?? 0,
    driveSelector: 'D',
    gear: options.startSpeed && options.startSpeed > 15 ? 5 : 2,
    engineRunning: true,
    engineRPM: 1500,
    clutchEngagement: 1,
    vehicleOperational: true,
  });
  const contacts = new VehicleContactSystem(ground, dims);
  if (options.wetness !== undefined) contacts.setWetness(options.wetness);
  if (options.roadGripMultiplier !== undefined) contacts.setRoadGripMultiplier(options.roadGripMultiplier);

  const nav = new NavigationController();
  nav.configure(options.network);
  nav.pose = { x: options.startX, y: 0, z: options.startZ, yaw: options.startYaw ?? 0 };
  if (options.destination) {
    const started = nav.start({
      roadId: options.destination.roadId,
      along: options.destination.along,
      point: { x: options.destination.x, y: 0, z: options.destination.z },
      label: options.destination.roadId,
      direction: options.destination.direction,
    });
    assert(started, `Route failed to plan to ${options.destination.roadId}`);
  }

  const adas = new ADASController(options.adasConfig);
  adas.setEnabled(true, 0.1);
  const lights = new VehicleLightingController();
  const baseInput = createNeutralVehicleInputState();
  baseInput.clutchPedal = 0;

  let simTime = 0;
  let conflictViolations = 0;

  const initSnap = dynamics.getSnapshot();
  const vehicleState: ADASVehicleState = {
    x: initSnap.x, y: 0, z: initSnap.z, yaw: initSnap.yaw, speed: initSnap.speed,
    lateralVelocity: initSnap.lateralVelocity, yawRate: initSnap.yawRate, acceleration: initSnap.acceleration,
    steeringAngle: initSnap.steeringAngle, steeringWheelAngle: initSnap.steeringWheelAngle,
    throttle: initSnap.throttle, brake: initSnap.brake,
    wheelBase: config.wheelBase, vehicleWidth: dims.width, vehicleLength: dims.length,
    steeringConfig: config.steering,
    vehicleOperational: true, driveAvailable: true, forwardGear: true,
    parkingBrakeActive: false, autoHoldHolding: false, suspended: false,
  };

  const scenarioDebugger = options.useScenarioDebugger
    ? new ScenarioDebugger(new Scene(), () => vehicleState, () => ground, undefined, () => simTime)
    : undefined;
  if (scenarioDebugger) {
    scenarioDebugger.autoCleanupDistanceM = 260;
  }

  const worldContext: ADASWorldContext = {
    navigationState: nav.state,
    roadNetwork: options.network,
    nearbyNetwork: options.network,
    trafficSignals: options.trafficSignals,
    queryNearbyColliders: (pose, radius) => contacts.collisionSystem.getNearbyColliders(pose, radius),
    trafficActors: options.actors,
    trafficActorProvider: scenarioDebugger,
    simulationTime: 0,
    roadGripMultiplier: options.roadGripMultiplier,
    wetness: options.wetness,
    visibilityFactor: options.visibilityFactor,
  };

  const rig: SimRig = {
    dynamics,
    contacts,
    nav,
    adas,
    lights,
    scenarioDebugger,
    dims,
    get simTime() { return simTime; },
    get conflictViolations() { return conflictViolations; },
    step(driverMutator, worldMutator) {
      simTime += FIXED_DT;
      const snap = dynamics.getSnapshot();
      nav.update(FIXED_DT, { x: snap.x, y: 0, z: snap.z, yaw: snap.yaw }, snap.speed);

      // Reset transient edges
      baseInput.throttle = 0;
      baseInput.brake = 0;
      baseInput.steering = 0;
      baseInput.handbrake = 0;
      baseInput.leftIndicator = false;
      baseInput.rightIndicator = false;
      baseInput.hazard = false;
      baseInput.adasToggle = false;
      baseInput.cruiseThrottle = 0;
      baseInput.cruiseBrake = 0;

      if (driverMutator) driverMutator(baseInput, simTime, snap);

      vehicleState.x = snap.x; vehicleState.y = 0; vehicleState.z = snap.z;
      vehicleState.yaw = snap.yaw; vehicleState.speed = snap.speed;
      vehicleState.lateralVelocity = snap.lateralVelocity; vehicleState.yawRate = snap.yawRate;
      vehicleState.acceleration = snap.acceleration;
      vehicleState.steeringAngle = snap.steeringAngle; vehicleState.steeringWheelAngle = snap.steeringWheelAngle;
      vehicleState.throttle = snap.throttle; vehicleState.brake = snap.brake;
      vehicleState.vehicleOperational = snap.vehicleOperational;
      vehicleState.driveAvailable = snap.driveAvailable;
      vehicleState.forwardGear = snap.transmission.selectedMode === 'D';
      vehicleState.driveSelector = snap.transmission.selectedMode;
      vehicleState.reverseGear = snap.gear === 'R' || snap.transmission.selectedMode === 'R';
      vehicleState.neutralGear = snap.gear === 'N' || snap.transmission.selectedMode === 'N';
      vehicleState.supportsPark = snap.transmission.type !== 'MANUAL' && snap.transmission.selectedMode !== null;
      vehicleState.hasElectronicParkingBrake = config.parkingBrake !== undefined;
      vehicleState.parkingBrakeEngaged = snap.parkingBrake.engaged;
      vehicleState.parkingBrakeActive = snap.parkingBrake.engaged || snap.parkingBrake.applying;
      vehicleState.autoHoldHolding = snap.autoHold.holding;
      syncADASLiveVehicleTelemetry(vehicleState, config, dims, snap, worldContext.roadGripMultiplier);
      vehicleState.collision = contacts.collision
        ? {
            collided: contacts.collision.collided,
            deltaSpeedMps: Math.max(0, Math.abs(vehicleState.speed - snap.speed)),
            contacts: contacts.collision.contacts.map((c) => {
              const colObj = ground.colliders.find((gc) => gc.id === c.colliderId);
              return {
                colliderId: c.colliderId,
                colliderType: colObj?.type,
                maxHeight: colObj?.maxHeight,
                inwardSpeed: c.inwardSpeed,
                penetration: c.penetration,
              };
            }),
          }
        : undefined;

      scenarioDebugger?.update(FIXED_DT);

      worldContext.navigationState = nav.state;
      worldContext.simulationTime = simTime;
      if (worldMutator) worldMutator(worldContext, simTime);

      const lamps = lights.state;
      const out = adas.step(FIXED_DT, baseInput, vehicleState, worldContext, {
        leftSignalActive: lamps.leftTurnSignal,
        rightSignalActive: lamps.rightTurnSignal,
        hazardActive: lamps.hazard,
      });

      if (adas.isEnabled && adas.status.requestNavReroute) {
        nav.triggerImmediateReroute();
      }
      nav.setRerouteSuppression(adas.isControlling && adas.isManeuvering);

      // Special verification: NEVER allow simultaneous conflicting throttle + brake commands!
      const effectiveThrottle = Math.max(out.throttle, out.cruiseThrottle ?? 0);
      const effectiveBrake = Math.max(out.brake, out.cruiseBrake ?? 0);
      if (effectiveThrottle > 0.015 && effectiveBrake > 0.015) {
        conflictViolations++;
      }

      const nextSnap = contacts.step(FIXED_DT, out, dynamics);
      lights.update(FIXED_DT, out, {
        ignitionOn: true,
        actualGear: nextSnap.gear ?? 'D',
        steeringWheelAngle: nextSnap.steeringWheelAngle,
        assistedBrakeActive: (out.cruiseBrake ?? 0) > 0.04,
      });

      return { out, snap: nextSnap, state: adas.currentState };
    },
  };

  return rig;
}

/** Build a 4-way urban intersection network centered at (0, -200). */
function makeCrossIntersectionNetwork(options: {
  speedLimit?: number;
  lanesPerDir?: number;
  markingsAvailable?: boolean;
  includeUturnLink?: boolean;
} = {}) {
  const lanes = options.lanesPerDir ?? 2;
  const limit = options.speedLimit ?? 50;
  const south = makeRoad({ id: 'south', points: [{ x: 0, z: 0 }, { x: 0, z: -186 }], laneCountPerDirection: lanes, speedLimit: limit, markingsAvailable: options.markingsAvailable });
  const north = makeRoad({ id: 'north', points: [{ x: 0, z: -214 }, { x: 0, z: -420 }], laneCountPerDirection: lanes, speedLimit: limit, markingsAvailable: options.markingsAvailable });
  const west = makeRoad({ id: 'west', points: [{ x: -14, z: -200 }, { x: -240, z: -200 }], laneCountPerDirection: lanes, speedLimit: limit, markingsAvailable: options.markingsAvailable });
  const east = makeRoad({ id: 'east', points: [{ x: 14, z: -200 }, { x: 240, z: -200 }], laneCountPerDirection: lanes, speedLimit: limit, markingsAvailable: options.markingsAvailable });

  const via = { x: 0, z: -200 };
  const connections: RoadRoutingConnection[] = [
    { fromRoadId: 'south', fromEnd: 'end', toRoadId: 'north', toEnd: 'start', via },
    { fromRoadId: 'south', fromEnd: 'end', toRoadId: 'west', toEnd: 'start', via },
    { fromRoadId: 'south', fromEnd: 'end', toRoadId: 'east', toEnd: 'start', via },
  ];
  if (options.includeUturnLink) {
    // Explicit southbound return lanes on the opposite side of the median (x = -1.75 & -5.25 -> center x = -3.5)
    const southReturn = makeRoad({ id: 'south-return', points: [{ x: -3.5, z: -186 }, { x: -3.5, z: 0 }], laneCountPerDirection: lanes, travelDirection: 'forward', speedLimit: limit });
    connections.push({ fromRoadId: 'south', fromEnd: 'end', toRoadId: 'south-return', toEnd: 'start', via });
    const j: RoadIntersectionData = {
      id: 'j-center',
      center: { x: 0, y: 0, z: -200 },
      halfExtentX: 14,
      halfExtentZ: 14,
      arms: [
        { segmentId: 'south', outward: { x: 0, z: 1 }, approachYawRadians: 0, approachLaneCount: lanes, trafficSignal: { junctionId: 'j-center', controlKind: 'north-south' } },
        { segmentId: 'north', outward: { x: 0, z: -1 }, approachYawRadians: Math.PI, approachLaneCount: lanes },
        { segmentId: 'west', outward: { x: -1, z: 0 }, approachYawRadians: -Math.PI / 2, approachLaneCount: lanes },
        { segmentId: 'east', outward: { x: 1, z: 0 }, approachYawRadians: Math.PI / 2, approachLaneCount: lanes },
      ],
    };
    return makeNetwork([south, north, west, east, southReturn], connections, [j]);
  }

  const j: RoadIntersectionData = {
    id: 'j-center',
    center: { x: 0, y: 0, z: -200 },
    halfExtentX: 14,
    halfExtentZ: 14,
    arms: [
      { segmentId: 'south', outward: { x: 0, z: 1 }, approachYawRadians: 0, approachLaneCount: lanes, trafficSignal: { junctionId: 'j-center', controlKind: 'north-south' } },
      { segmentId: 'north', outward: { x: 0, z: -1 }, approachYawRadians: Math.PI, approachLaneCount: lanes },
      { segmentId: 'west', outward: { x: -1, z: 0 }, approachYawRadians: -Math.PI / 2, approachLaneCount: lanes },
      { segmentId: 'east', outward: { x: 1, z: 0 }, approachYawRadians: Math.PI / 2, approachLaneCount: lanes },
    ],
  };
  return makeNetwork([south, north, west, east], connections, [j]);
}

function makeActor(partial: Partial<TrafficActorSnapshot> & { id: string; x: number; z: number }): TrafficActorSnapshot {
  const yaw = partial.yaw ?? 0;
  const speed = partial.speed ?? 0;
  return {
    id: partial.id,
    kind: partial.kind ?? 'vehicle',
    x: partial.x,
    y: partial.y ?? 0,
    z: partial.z,
    yaw,
    speed,
    vx: partial.vx ?? -Math.sin(yaw) * speed,
    vz: partial.vz ?? -Math.cos(yaw) * speed,
    length: partial.length ?? 4.6,
    width: partial.width ?? 1.9,
    height: partial.height ?? 1.5,
    accel: partial.accel,
    predictedTrajectory: partial.predictedTrajectory,
    confidence: partial.confidence ?? 1,
    timestamp: partial.timestamp ?? 0,
  };
}

function checkActorCollision(
  snap: { x: number; z: number },
  egoDims: { width: number; length: number },
  actor: TrafficActorSnapshot,
): boolean {
  const dx = Math.abs(snap.x - actor.x);
  const dz = Math.abs(snap.z - actor.z);
  return dx < (egoDims.width + actor.width) * 0.45 && dz < (egoDims.length + actor.length) * 0.45;
}

export function runADASV1SelfTests(): {
  passed: number;
  total: number;
  scenarios: ADASScenarioSummary[];
  performance: { avgStepUs: number; maxStepUs: number; avgPlannerUs: number; avgPerceptionUs: number };
} {
  const scenarios: ADASScenarioSummary[] = [];

  const run = (id: string, name: string, fn: () => Record<string, number | string | boolean>) => {
    const metrics = fn();
    scenarios.push({ id, name, passed: true, metrics });
  };

  // 1. Straight road navigation following (tested on EV Tesla Model 3 to confirm vehicle-agnostic control)
  run('01-straight', '直线道路导航跟随', () => {
    const road = makeRoad({ id: 'r1', points: [{ x: 0, z: 0 }, { x: 0, z: -600 }], laneCountPerDirection: 2, speedLimit: 60 });
    const net = makeNetwork([road]);
    // Start in forward lane 0 (x = +1.75) with initial 0.7m lateral offset
    const rig = createSimRig({
      vehicleId: 'tesla-model-3-rwd',
      network: net,
      startX: 2.45,
      startZ: -20,
      startSpeed: 10,
      destination: { roadId: 'r1', along: 580, x: 0, z: -580, direction: 'forward' },
    });
    let sumSq = 0, settledCount = 0, crossings = 0, lastSign = 0;
    for (let i = 0; i < 120 * 12; i++) {
      const { snap } = rig.step();
      const err = snap.x - 1.75;
      if (i > 120 * 5) {
        sumSq += err * err;
        settledCount++;
        if (Math.abs(err) > 0.25) {
          const sg = Math.sign(err);
          if (lastSign !== 0 && sg !== lastSign) crossings++;
          lastSign = sg;
        }
      }
      assert(snap.x > 0, `Must never cross center median into opposing lane (t=${(i/120).toFixed(2)}, x=${snap.x.toFixed(2)}, yaw=${snap.yaw.toFixed(3)}, latOff=${rig.adas.planner.snapshot.lateralOffsetM.toFixed(2)}, lane=${rig.adas.planner.snapshot.currentApproachLaneIndex}, p0x=${rig.adas.planner.snapshot.samples[0]?.x.toFixed(2)})`);
    }
    const rms = Math.sqrt(sumSq / settledCount);
    const finalSpeedKmh = rig.dynamics.speed * 3.6;
    assert(rms < 0.25, `Straight tracking RMS too high: ${rms.toFixed(3)}`);
    assert(crossings === 0, `Oscillation detected on straight: crossings=${crossings}`);
    assert(finalSpeedKmh >= 50 && finalSpeedKmh <= 63, `Speed should settle near 60 km/h limit, got ${finalSpeedKmh.toFixed(1)}`);
    assert(rig.conflictViolations === 0, 'Throttle/brake conflict occurred');
    return { rmsM: +rms.toFixed(3), finalSpeedKmh: +finalSpeedKmh.toFixed(1), crossings };
  });

  // 2. Multi-lane keeping (3 lanes per direction, middle lane x = +5.25)
  run('02-multilane', '多车道保持', () => {
    const road = makeRoad({ id: 'r-multi', points: [{ x: 0, z: 0 }, { x: 0, z: -700 }], laneCountPerDirection: 3, speedLimit: 80, roadType: 'highway' });
    const net = makeNetwork([road]);
    // Lanes forward: idx 3 (1.75), idx 4 (5.25), idx 5 (8.75)
    const rig = createSimRig({
      network: net,
      startX: 5.55,
      startZ: -20,
      startSpeed: 18,
      destination: { roadId: 'r-multi', along: 680, x: 0, z: -680, direction: 'forward' },
    });
    let maxErr = 0;
    for (let i = 0; i < 120 * 10; i++) {
      const { snap } = rig.step();
      maxErr = Math.max(maxErr, Math.abs(snap.x - 5.25));
      assert(rig.adas.planner.snapshot.currentApproachLaneIndex === 1, 'Should stay in middle lane (index 1)');
    }
    assert(maxErr < 0.65, `Multi-lane drift too large: ${maxErr.toFixed(3)}`);
    assert(rig.conflictViolations === 0, 'Throttle/brake conflict occurred');
    return { maxErrM: +maxErr.toFixed(3), speedKmh: +(rig.dynamics.speed * 3.6).toFixed(1) };
  });

  // 3. Continuous S-curves (smooth pre-corner decel, stay in lane, post-corner recovery)
  run('03-curves', '连续弯道', () => {
    const pts: RoadPoint[] = [];
    for (let s = 0; s <= 680; s += 10) {
      // Smooth S-curve from z=-80 to z=-360 followed by 320m exit straight
      const x = s < 80 ? 0 : s < 360 ? 38 * Math.sin(((s - 80) / 280) * Math.PI * 2) : 0;
      pts.push({ x, z: -s });
    }
    const road = makeRoad({ id: 'r-scurve', points: pts, laneCountPerDirection: 2, speedLimit: 70, roadType: 'urban' });
    const net = makeNetwork([road]);
    const rig = createSimRig({
      network: net,
      startX: 1.75,
      startZ: -10,
      startSpeed: 16,
      destination: { roadId: 'r-scurve', along: road.length - 20, x: 0, z: -660, direction: 'forward' },
    });
    let maxLatErr = 0;
    let minCornerSpeed = Infinity;
    let maxStraightSpeed = 0;
    for (let i = 0; i < 120 * 44; i++) {
      const { snap } = rig.step();
      const latErr = Math.abs(rig.adas.planner.snapshot.lateralOffsetM);
      if (i > 120) maxLatErr = Math.max(maxLatErr, latErr);
      if (snap.z < -100 && snap.z > -340) minCornerSpeed = Math.min(minCornerSpeed, snap.speed);
      if (snap.z <= -390) maxStraightSpeed = Math.max(maxStraightSpeed, snap.speed);
      if (rig.nav.state.status === 'arrived') break;
    }
    assert(maxLatErr < 1.25, `Curve lateral error exceeded lane margin: ${maxLatErr.toFixed(3)}`);
    assert(minCornerSpeed < 17.5, `Vehicle should slow for curves, minCornerSpeed=${(minCornerSpeed * 3.6).toFixed(1)} km/h`);
    assert(maxStraightSpeed > minCornerSpeed + 3.0, `Vehicle should recover speed after curve exit, exit=${(maxStraightSpeed * 3.6).toFixed(1)} km/h vs min=${(minCornerSpeed * 3.6).toFixed(1)} km/h`);
    assert(rig.conflictViolations === 0, 'Throttle/brake conflict occurred');
    return { maxLatErrM: +maxLatErr.toFixed(3), minCornerKmh: +(minCornerSpeed * 3.6).toFixed(1), exitRecoveryKmh: +(maxStraightSpeed * 3.6).toFixed(1) };
  });

  // 4. Left turn, Right turn, and U-turn through intersections with turn signals
  run('04-turns-uturn', '左转、右转与掉头场景', () => {
    // 4a. Left turn: south -> west
    const netLR = makeCrossIntersectionNetwork({ speedLimit: 50, lanesPerDir: 2 });
    const rigLeft = createSimRig({
      network: netLR,
      startX: 1.75, // leftmost forward lane
      startZ: -115,
      startSpeed: 11,
      destination: { roadId: 'west', along: 160, x: -174, z: -200, direction: 'forward' },
    });
    let leftBlinkSeen = false;
    let leftBlinkOffAfter = false;
    let enteredWest = false;
    for (let i = 0; i < 120 * 24; i++) {
      const { snap } = rigLeft.step();
      if (rigLeft.lights.state.leftTurnSignal) leftBlinkSeen = true;
      if (snap.x < -30) {
        enteredWest = true;
        if (!rigLeft.lights.state.leftTurnSignal) leftBlinkOffAfter = true;
        // Must stay in right-hand forward lane of west road (z < -200 when going -X! Wait: west goes -X, yaw=+PI/2, right=(0,-1) => z < -200!)
        assert(snap.z < -199.5, `Left turn encroached into opposing lane on west road: z=${snap.z.toFixed(2)}`);
      }
      if (snap.x < -90) break;
    }
    assert(enteredWest, 'Left turn failed to reach outgoing west road');
    assert(leftBlinkSeen && leftBlinkOffAfter, `Left turn signal lifecycle invalid: on=${leftBlinkSeen}, offAfter=${leftBlinkOffAfter}`);

    // 4b. Right turn: south -> east
    const rigRight = createSimRig({
      network: netLR,
      startX: 5.25, // rightmost forward lane
      startZ: -115,
      startSpeed: 11,
      destination: { roadId: 'east', along: 160, x: 174, z: -200, direction: 'forward' },
    });
    let rightBlinkSeen = false;
    let rightBlinkOffAfter = false;
    let enteredEast = false;
    for (let i = 0; i < 120 * 24; i++) {
      const { snap } = rigRight.step();
      if (rigRight.lights.state.rightTurnSignal) rightBlinkSeen = true;
      if (snap.x > 30) {
        enteredEast = true;
        if (!rigRight.lights.state.rightTurnSignal) rightBlinkOffAfter = true;
        // East road goes +X, yaw=-PI/2, right=(0,+1) => forward lanes have z > -200!
        assert(snap.z > -200.5, `Right turn encroached into opposing lane on east road: z=${snap.z.toFixed(2)}`);
      }
      if (snap.x > 90) break;
    }
    assert(enteredEast, 'Right turn failed to reach outgoing east road');
    assert(rightBlinkSeen && rightBlinkOffAfter, `Right turn signal lifecycle invalid: on=${rightBlinkSeen}, offAfter=${rightBlinkOffAfter}`);

    // 4c. U-turn applicability (south -> south-return via junction)
    const netU = makeCrossIntersectionNetwork({ speedLimit: 40, lanesPerDir: 2, includeUturnLink: true });
    const rigU = createSimRig({
      network: netU,
      startX: 1.75,
      startZ: -135,
      startSpeed: 8,
      destination: { roadId: 'south-return', along: 140, x: -3.5, z: -46, direction: 'forward' },
    });
    let uturnDetected = false;
    let uturnSignalOn = false;
    let completedUturnHeading = false;
    for (let i = 0; i < 120 * 36; i++) {
      const { snap } = rigU.step();
      if (rigU.adas.planner.snapshot.maneuver === 'UTURN') uturnDetected = true;
      if (rigU.lights.state.leftTurnSignal) uturnSignalOn = true;
      if (Math.abs(Math.abs(snap.yaw) - Math.PI) < 0.45 && snap.z > -185) {
        completedUturnHeading = true;
        break;
      }
    }
    assert(uturnDetected && uturnSignalOn, 'U-turn maneuver and left turn signal must activate');
    assert(completedUturnHeading, 'Vehicle did not complete U-turn heading reversal');
    return { leftTurnOk: true, rightTurnOk: true, uturnOk: true };
  });

  // 5. Strategic pre-junction lane change (start in right lane, upcoming left turn -> smoothly move left)
  run('05-strategic-lc', '导航提前变道', () => {
    const net = makeCrossIntersectionNetwork({ speedLimit: 50, lanesPerDir: 2 });
    const rig = createSimRig({
      network: net,
      startX: 5.25, // right lane (approach index 1)
      startZ: -45,  // 141m before junction
      startSpeed: 11,
      destination: { roadId: 'west', along: 150, x: -164, z: -200, direction: 'forward' },
    });
    let sawLaneChangeState = false;
    let blinkerBeforeMove = false;
    let maxLatAccel = 0;
    let reachedLeftLane = false;
    let midInfo = '';
    for (let i = 0; i < 120 * 14; i++) {
      const { snap, state } = rig.step();
      if (!midInfo && snap.z < -100) {
        const p = rig.adas.planner.snapshot;
        const o = rig.adas.obstacleAvoidance.assessment;
        midInfo = `mid@z=${snap.z.toFixed(1)},state=${state},lane=${p.currentApproachLaneIndex}/${p.currentApproachLaneCount},leftB=${p.leftBoundary},leftSafe=${o.leftLane.safe},leftCross=${o.leftLane.boundaryCrossable},turn=${p.upcomingJunction.turnDirection},jDist=${p.upcomingJunction.distanceToJunctionEntryM.toFixed(1)},lc=${p.laneChange.active}`;
      }
      if (state === 'LANE_CHANGE' || state === 'PREPARING_LANE_CHANGE' || state === 'LANE_CHANGING') sawLaneChangeState = true;
      if (rig.adas.planner.snapshot.laneChange.phase === 'signaling' && rig.lights.state.leftTurnSignal) {
        blinkerBeforeMove = true;
      }
      if (snap.z > -180) {
        maxLatAccel = Math.max(maxLatAccel, Math.abs(snap.lateralAcceleration));
        if (snap.x < 2.4 && rig.adas.planner.snapshot.currentApproachLaneIndex === 0) {
          reachedLeftLane = true;
          break;
        }
      }
    }
    assert(sawLaneChangeState, `Expected LANE_CHANGE / LANE_CHANGING state for strategic pre-positioning (${midInfo})`);
    assert(blinkerBeforeMove, 'Turn signal must activate before lateral movement');
    assert(reachedLeftLane, 'Failed to move to left turn lane before junction');
    assert(maxLatAccel < 3.5, `Lateral accel during lane change too high: ${maxLatAccel.toFixed(2)}`);
    return { sawLaneChangeState, blinkerBeforeMove, maxLatAccel: +maxLatAccel.toFixed(2) };
  });

  // 6. Solid line prohibition (obstacle ahead, markingsAvailable=false -> MUST NOT cross solid line, stops safely)
  run('06-solid-line', '禁止变道的实线场景', () => {
    const road = makeRoad({ id: 'r-solid', points: [{ x: 0, z: 0 }, { x: 0, z: -300 }], laneCountPerDirection: 2, speedLimit: 50, markingsAvailable: false });
    const net = makeNetwork([road]);
    const obs = makeActor({ id: 'solid-obs', kind: 'static-obstacle', x: 1.75, z: -95, length: 4.0, width: 1.9 });
    const rig = createSimRig({
      network: net,
      startX: 1.75,
      startZ: -20,
      startSpeed: 12,
      destination: { roadId: 'r-solid', along: 280, x: 0, z: -280, direction: 'forward' },
      actors: [obs],
    });
    let collided = false;
    for (let i = 0; i < 120 * 12; i++) {
      const { snap, state } = rig.step();
      assert(state !== 'LANE_CHANGE' && state !== 'PREPARING_LANE_CHANGE' && state !== 'LANE_CHANGING', 'Must NEVER initiate lane change across solid line');
      assert(snap.x > 0 && snap.x < 3.4, `Vehicle crossed solid boundary or median: x=${snap.x.toFixed(2)}`);
      if (checkActorCollision(snap, rig.dims, obs)) collided = true;
    }
    assert(!collided, 'Collided with obstacle in solid-line scenario');
    assert(rig.dynamics.speed < 0.3, `Expected vehicle to stop behind obstacle, speed=${rig.dynamics.speed.toFixed(2)}`);
    return { stoppedGapM: +(rig.dynamics.z - obs.z - (rig.dims.length + obs.length) * 0.5).toFixed(2), collided };
  });

  // 7. Red light stop (no creep!) & Green light launch
  run('07-red-green', '红灯停车与绿灯起步', () => {
    const net = makeCrossIntersectionNetwork({ speedLimit: 50, lanesPerDir: 2 });
    const signals = new MockTrafficSignalProvider('j-center', 'south', ['south:lane:2', 'south:lane:3']);
    signals.color = 'red';
    const rig = createSimRig({
      network: net,
      startX: 1.75,
      startZ: -95,
      startSpeed: 12,
      destination: { roadId: 'north', along: 160, x: 0, z: -374, direction: 'forward' },
      trafficSignals: signals,
    });
    // Stop line is ~5.2m before south end (-186) -> z ~= -180.8; front bumper at z - dims.length/2 must stay > -181.2!
    let sawStoppingState = false;
    let stoppedZ = 0;
    let creepDistance = 0;
    for (let i = 0; i < 120 * 14; i++) {
      const { snap, state } = rig.step();
      if (state === 'STOPPING_FOR_SIGNAL') sawStoppingState = true;
      const frontBumperZ = snap.z - rig.dims.length * 0.5;
      assert(frontBumperZ > -185.5, `Ran red light / crossed stop line! frontBumperZ=${frontBumperZ.toFixed(2)}`);
      if (i === 120 * 11) stoppedZ = snap.z;
      if (i > 120 * 11) creepDistance = Math.max(creepDistance, Math.abs(snap.z - stoppedZ));
    }
    assert(sawStoppingState, 'Expected STOPPING_FOR_SIGNAL state on red');
    assert(rig.dynamics.speed < 0.15, `Vehicle must come to complete stop on red, speed=${rig.dynamics.speed.toFixed(2)}, z=${rig.dynamics.z.toFixed(2)}, stopDist=${rig.adas.trafficRules.decision.stopDistanceM.toFixed(2)}, brake=${rig.adas.speedController.command.brake.toFixed(2)}, hold=${rig.adas.speedController.command.holdingStandstill}, targetV=${rig.adas.speedController.command.targetSpeedMps.toFixed(2)}, dec=${rig.adas.trafficRules.decision.signalDecision}`);
    assert(creepDistance < 0.08, `Vehicle crept forward while stopped at red light: creep=${creepDistance.toFixed(3)}m`);

    // Turn signal GREEN and verify smooth launch across junction!
    signals.color = 'green';
    for (let i = 0; i < 120 * 10; i++) {
      rig.step();
    }
    assert(rig.dynamics.z < -215 && rig.dynamics.speed > 6, `Vehicle failed to launch on green: z=${rig.dynamics.z.toFixed(1)}, v=${rig.dynamics.speed.toFixed(1)}`);
    return { stoppedFrontBumperZ: +(stoppedZ - rig.dims.length * 0.5).toFixed(2), creepM: +creepDistance.toFixed(4), postGreenSpeedKmh: +(rig.dynamics.speed * 3.6).toFixed(1) };
  });

  // 8. Amber light dilemma-zone decision (stop when far; proceed when too close & clearable)
  run('08-amber', '黄灯决策', () => {
    const net = makeCrossIntersectionNetwork({ speedLimit: 50, lanesPerDir: 2 });

    // 8a: Far from stop line (65m away at 12 m/s) -> must STOP safely before line
    const sigFar = new MockTrafficSignalProvider('j-center', 'south', ['south:lane:2', 'south:lane:3']);
    sigFar.color = 'amber';
    sigFar.secondsToChange = 2.8;
    const rigFar = createSimRig({
      network: net,
      startX: 1.75,
      startZ: -115,
      startSpeed: 12,
      destination: { roadId: 'north', along: 150, x: 0, z: -364, direction: 'forward' },
      trafficSignals: sigFar,
    });
    for (let i = 0; i < 120 * 8; i++) rigFar.step();
    assert(rigFar.adas.trafficRules.decision.signalDecision === 'STOP_AMBER', 'Far amber should choose STOP_AMBER');
    assert(rigFar.dynamics.speed < 0.3 && rigFar.dynamics.z - rigFar.dims.length * 0.5 > -185.5, 'Far amber must stop before stop line');

    // 8b: Very close to stop line (12m away at 13 m/s, 2.5s amber left) -> must PROCEED cleanly!
    const sigClose = new MockTrafficSignalProvider('j-center', 'south', ['south:lane:2', 'south:lane:3']);
    sigClose.color = 'amber';
    sigClose.secondsToChange = 2.5;
    const rigClose = createSimRig({
      network: net,
      startX: 1.75,
      startZ: -168,
      startSpeed: 13,
      destination: { roadId: 'north', along: 150, x: 0, z: -364, direction: 'forward' },
      trafficSignals: sigClose,
    });
    let sawProceedAmber = false;
    for (let i = 0; i < 120 * 4; i++) {
      rigClose.step();
      if (rigClose.adas.trafficRules.decision.signalDecision === 'PROCEED_AMBER') sawProceedAmber = true;
    }
    assert(sawProceedAmber, 'Close clearable amber should choose PROCEED_AMBER');
    assert(rigClose.dynamics.z < -210, `Close amber vehicle should clear junction, z=${rigClose.dynamics.z.toFixed(1)}`);
    return { farStopped: true, closeProceeded: true };
  });

  // 9. Blocked junction on GREEN light (must NOT enter and block intersection!)
  run('09-blocked-junction', '路口堵塞不进入', () => {
    const net = makeCrossIntersectionNetwork({ speedLimit: 50, lanesPerDir: 2 });
    const signals = new MockTrafficSignalProvider('j-center', 'south', ['south:lane:2', 'south:lane:3']);
    signals.color = 'green';
    const blocker = makeActor({ id: 'j-blocker', kind: 'vehicle', x: 1.75, z: -202, speed: 0 });
    const rig = createSimRig({
      network: net,
      startX: 1.75,
      startZ: -120,
      startSpeed: 11,
      destination: { roadId: 'north', along: 150, x: 0, z: -364, direction: 'forward' },
      trafficSignals: signals,
      actors: [blocker],
    });
    let sawBlockedStop = false;
    for (let i = 0; i < 120 * 10; i++) {
      const { snap } = rig.step();
      if (rig.adas.trafficRules.decision.signalDecision === 'STOP_BLOCKED_JUNCTION') sawBlockedStop = true;
      assert(snap.z - rig.dims.length * 0.5 > -186.5, `Entered blocked junction on green! frontZ=${(snap.z - rig.dims.length * 0.5).toFixed(1)}`);
    }
    assert(sawBlockedStop, 'Expected STOP_BLOCKED_JUNCTION decision');
    assert(rig.dynamics.speed < 0.3, `Expected vehicle to wait behind stop line, v=${rig.dynamics.speed.toFixed(2)}`);
    return { sawBlockedStop, stoppedZ: +rig.dynamics.z.toFixed(1) };
  });

  // 10. Speed limit change (80 -> 40 km/h smooth decel) & missing speed limit estimation
  run('10-speed-limits', '限速变化与缺省估值', () => {
    const segFast = makeRoad({ id: 'fast', points: [{ x: 0, z: 0 }, { x: 0, z: -200 }], laneCountPerDirection: 2, speedLimit: 80, roadType: 'highway' });
    const segSlow = makeRoad({ id: 'slow', points: [{ x: 0, z: -200 }, { x: 0, z: -450 }], laneCountPerDirection: 2, speedLimit: 40, roadType: 'urban' });
    const segUnknown = makeRoad({ id: 'unk', points: [{ x: 0, z: -450 }, { x: 0, z: -650 }], laneCountPerDirection: 2, speedLimit: undefined, roadType: 'ramp' });
    const net = makeNetwork([segFast, segSlow, segUnknown], [
      { fromRoadId: 'fast', fromEnd: 'end', toRoadId: 'slow', toEnd: 'start' },
      { fromRoadId: 'slow', fromEnd: 'end', toRoadId: 'unk', toEnd: 'start' },
    ]);
    const rig = createSimRig({
      network: net,
      startX: 1.75,
      startZ: -30,
      startSpeed: 21, // ~75 km/h
      destination: { roadId: 'unk', along: 180, x: 0, z: -630, direction: 'forward' },
    });
    let speedAfterDrop = Infinity;
    let sawEstimatedRamp = false;
    for (let i = 0; i < 120 * 35; i++) {
      const { snap } = rig.step();
      if (snap.z < -260 && snap.z > -400) speedAfterDrop = Math.min(speedAfterDrop, snap.speed * 3.6);
      if (snap.z < -470 && rig.adas.status.speedLimitEstimated) {
        sawEstimatedRamp = true;
        break;
      }
    }
    assert(speedAfterDrop <= 43, `Failed to slow down to 40 km/h zone: minSpeed=${speedAfterDrop.toFixed(1)}`);
    assert(sawEstimatedRamp, 'Missing speedLimit must be flagged as estimated (speedLimitEstimated=true)');
    assert(rig.adas.status.speedLimitKmh <= 37, `Ramp fallback speed should be conservative (~35 km/h), got ${rig.adas.status.speedLimitKmh.toFixed(1)}`);
    return { slowedToKmh: +speedAfterDrop.toFixed(1), rampEstimatedKmh: +rig.adas.status.speedLimitKmh.toFixed(1) };
  });

  // 11. Lead vehicle deceleration & car following
  run('11-car-following', '前车减速与跟车', () => {
    const road = makeRoad({ id: 'r-fol', points: [{ x: 0, z: 0 }, { x: 0, z: -600 }], laneCountPerDirection: 1, travelDirection: 'forward', speedLimit: 70 });
    const net = makeNetwork([road]);
    const lead = makeActor({ id: 'lead-1', x: 0, z: -65, speed: 15 });
    const rig = createSimRig({
      network: net,
      startX: 0,
      startZ: -20,
      startSpeed: 17,
      destination: { roadId: 'r-fol', along: 580, x: 0, z: -580, direction: 'forward' },
      actors: [lead],
    });
    let minGap = Infinity;
    let sawFollowResponse = false;
    for (let i = 0; i < 120 * 14; i++) {
      const t = i * FIXED_DT;
      // Lead brakes smoothly from 15 m/s down to 7 m/s between t=2s and t=6s
      lead.speed = t < 2 ? 15 : t < 6 ? 15 - (t - 2) * 2.0 : 7;
      lead.vz = -lead.speed;
      lead.z -= lead.speed * FIXED_DT;
      const { snap, state } = rig.step();
      const gap = (snap.z - lead.z) - (rig.dims.length + lead.length) * 0.5;
      minGap = Math.min(minGap, gap);
      if (state === 'OBSTACLE_RESPONSE' || state === 'FOLLOW' || state === 'DECELERATING') sawFollowResponse = true;
      assert(!checkActorCollision(snap, rig.dims, lead), 'Collided with decelerating lead vehicle');
    }
    assert(sawFollowResponse, 'Expected FOLLOW / OBSTACLE_RESPONSE state during following');
    assert(minGap > 3.5, `Following gap became too small: ${minGap.toFixed(2)}m`);
    assert(Math.abs(rig.dynamics.speed - 7) < 2.2, `Expected ego speed to match ~7 m/s lead, got ${rig.dynamics.speed.toFixed(2)}`);
    return { minGapM: +minGap.toFixed(2), finalSpeedMps: +rig.dynamics.speed.toFixed(2) };
  });

  // 12. Static obstacle avoidance via dashed adjacent lane change (using StaticCollider spatial query!)
  run('12-static-avoidance', '静态障碍物变道避让', () => {
    const road = makeRoad({ id: 'r-avoid', points: [{ x: 0, z: 0 }, { x: 0, z: -400 }], laneCountPerDirection: 2, speedLimit: 60 });
    const net = makeNetwork([road]);
    const staticBox = createStaticOBBCollider({
      id: 'road-cone-cluster',
      type: 'obstacle',
      x: 1.75,
      z: -105,
      width: 2.0,
      length: 3.5,
      minHeight: 0,
      maxHeight: 1.4,
    });
    const rig = createSimRig({
      network: net,
      colliders: [staticBox],
      startX: 1.75,
      startZ: -20,
      startSpeed: 12,
      destination: { roadId: 'r-avoid', along: 380, x: 0, z: -380, direction: 'forward' },
    });
    let changedLane = false;
    let passedObstacle = false;
    for (let i = 0; i < 120 * 16; i++) {
      const { snap, state } = rig.step();
      if (state === 'LANE_CHANGE' || state === 'PREPARING_LANE_CHANGE' || state === 'LANE_CHANGING' || state === 'AVOIDANCE') changedLane = true;
      assert(!(rig.contacts.collision?.collided), 'Collided with static obstacle!');
      if (snap.z < -118) {
        passedObstacle = true;
        break;
      }
    }
    assert(changedLane, 'Expected automatic avoidance lane change around static obstacle');
    assert(passedObstacle, 'Vehicle did not pass static obstacle');
    assert(rig.dynamics.x > 3.5, `Vehicle should have moved into right adjacent lane (x~5.25), got x=${rig.dynamics.x.toFixed(2)}`);
    return { changedLane, passedObstacle, finalX: +rig.dynamics.x.toFixed(2) };
  });

  // 13. Dynamic vehicle cut-in from adjacent lane
  run('13-dynamic-cutin', '动态车辆切入响应', () => {
    const road = makeRoad({ id: 'r-cutin', points: [{ x: 0, z: 0 }, { x: 0, z: -400 }], laneCountPerDirection: 2, speedLimit: 60 });
    const net = makeNetwork([road]);
    const cutter = makeActor({ id: 'cutter', x: 5.25, z: -56, speed: 8.5 });
    const rig = createSimRig({
      network: net,
      startX: 1.75,
      startZ: -20,
      startSpeed: 15,
      destination: { roadId: 'r-cutin', along: 380, x: 0, z: -380, direction: 'forward' },
      actors: [cutter],
    });
    let detectedCutIn = false;
    let minGap = Infinity;
    for (let i = 0; i < 120 * 7; i++) {
      const t = i * FIXED_DT;
      // Cutter cuts sharply into ego lane between t=0.5s and t=2.2s
      if (t >= 0.5 && t <= 2.2) {
        cutter.vx = -2.1;
        cutter.x += cutter.vx * FIXED_DT;
      } else {
        cutter.vx = 0;
      }
      cutter.z -= cutter.speed * FIXED_DT;
      cutter.vz = -cutter.speed;
      const { snap } = rig.step();
      if (rig.adas.obstacleAvoidance.assessment.cutInDetected || rig.adas.currentState === 'EMERGENCY_BRAKING' || rig.adas.currentState === 'OBSTACLE_RESPONSE' || rig.adas.currentState === 'FOLLOW' || rig.adas.currentState === 'DECELERATING') {
        detectedCutIn = true;
      }
      if (Math.abs(cutter.x - snap.x) < 2.1) {
        minGap = Math.min(minGap, (snap.z - cutter.z) - (rig.dims.length + cutter.length) * 0.5);
      }
      assert(!checkActorCollision(snap, rig.dims, cutter), 'Collided with cutting-in vehicle!');
    }
    assert(detectedCutIn, 'Failed to detect or respond to cut-in vehicle');
    assert(minGap > 1.0, `Cut-in gap unsafe: ${minGap.toFixed(2)}m`);
    return { detectedCutIn, minGapM: +minGap.toFixed(2) };
  });

  // 14. Adjacent lane occupied -> refuse lane change and stop safely behind obstacle
  run('14-adjacent-blocked-stop', '相邻车道无空间时停车', () => {
    const road = makeRoad({ id: 'r-blk', points: [{ x: 0, z: 0 }, { x: 0, z: -300 }], laneCountPerDirection: 2, speedLimit: 50 });
    const net = makeNetwork([road]);
    const obs = makeActor({ id: 'obs-front', kind: 'static-obstacle', x: 1.75, z: -90, length: 4, width: 1.9 });
    const blockerRight = makeActor({ id: 'right-traffic', kind: 'vehicle', x: 5.25, z: -35, speed: 12 });
    const rig = createSimRig({
      network: net,
      startX: 1.75,
      startZ: -20,
      startSpeed: 12,
      destination: { roadId: 'r-blk', along: 280, x: 0, z: -280, direction: 'forward' },
      actors: [obs, blockerRight],
    });
    for (let i = 0; i < 120 * 10; i++) {
      // Keep right-lane vehicle cruising right alongside ego so right lane stays continuously occupied
      blockerRight.z = rig.dynamics.z - 2.0;
      const { snap, state } = rig.step();
      assert(state !== 'LANE_CHANGE' && state !== 'PREPARING_LANE_CHANGE' && state !== 'LANE_CHANGING', 'Must NOT change lane when adjacent lane is occupied');
      assert(!checkActorCollision(snap, rig.dims, obs), 'Collided with front obstacle');
      assert(!checkActorCollision(snap, rig.dims, blockerRight), 'Collided with adjacent-lane vehicle');
    }
    assert(rig.dynamics.speed < 0.3, `Expected vehicle to stop behind obstacle, speed=${rig.dynamics.speed.toFixed(2)}`);
    return { stoppedSafely: true, finalGapM: +(rig.dynamics.z - obs.z - (rig.dims.length + obs.length) * 0.5).toFixed(2) };
  });

  // 15. Emergency braking (AEB) on sudden critical TTC obstacle
  run('15-aeb', '紧急制动 AEB', () => {
    const road = makeRoad({ id: 'r-aeb', points: [{ x: 0, z: 0 }, { x: 0, z: -300 }], laneCountPerDirection: 1, travelDirection: 'forward', speedLimit: 60 });
    const net = makeNetwork([road]);
    // Sudden stopped obstacle 20m ahead while moving at 16 m/s (TTC = 1.1s!)
    const suddenObs = makeActor({ id: 'sudden-obs', kind: 'static-obstacle', x: 0, z: -42, length: 4.0, width: 1.9 });
    const rig = createSimRig({
      network: net,
      startX: 0,
      startZ: -20,
      startSpeed: 16,
      destination: { roadId: 'r-aeb', along: 280, x: 0, z: -280, direction: 'forward' },
      actors: [suddenObs],
    });
    let triggeredAEB = false;
    let peakBrake = 0;
    for (let i = 0; i < 120 * 4; i++) {
      const { out, snap, state } = rig.step();
      if (state === 'EMERGENCY_BRAKING') {
        triggeredAEB = true;
        assert(out.throttle === 0 && (out.cruiseThrottle ?? 0) === 0, 'AEB must cut throttle to zero');
      }
      peakBrake = Math.max(peakBrake, out.cruiseBrake ?? 0);
      assert(!checkActorCollision(snap, rig.dims, suddenObs), 'AEB failed to prevent collision!');
    }
    assert(triggeredAEB, 'Expected EMERGENCY_BRAKING state');
    assert(peakBrake >= 0.78, `Expected strong AEB brake demand, got ${peakBrake.toFixed(2)}`);
    assert(rig.dynamics.speed < 0.3, `Vehicle failed to halt under AEB, speed=${rig.dynamics.speed.toFixed(2)}`);
    return { triggeredAEB, peakBrake: +peakBrake.toFixed(2), remainingGapM: +(rig.dynamics.z - suddenObs.z - (rig.dims.length + suddenObs.length) * 0.5).toFixed(2) };
  });

  // 16. Driver acceleration override (temporary overspeed allowed, decays back on release, never exits ADAS)
  run('16-driver-accel-override', '驾驶员加速接管', () => {
    const road = makeRoad({ id: 'r-acc', points: [{ x: 0, z: 0 }, { x: 0, z: -900 }], laneCountPerDirection: 2, speedLimit: 50 });
    const net = makeNetwork([road]);
    const rig = createSimRig({
      network: net,
      startX: 1.75,
      startZ: -20,
      startSpeed: 13.5,
      destination: { roadId: 'r-acc', along: 880, x: 0, z: -880, direction: 'forward' },
    });
    let sawOverride = false;
    let peakSpeedKmh = 0;
    for (let i = 0; i < 120 * 14; i++) {
      const t = i * FIXED_DT;
      const { out, snap, state } = rig.step((inp) => {
        if (t >= 1.5 && t <= 4.5) inp.throttle = 0.65;
      });
      if (t >= 1.6 && t <= 4.4) {
        if (state === 'DRIVER_ACCELERATION_OVERRIDE') sawOverride = true;
        assert((out.cruiseBrake ?? 0) === 0, 'ADAS must not brake against driver accel override');
      }
      peakSpeedKmh = Math.max(peakSpeedKmh, snap.speed * 3.6);
      assert(rig.adas.isEnabled, 'Acceleration override must NOT disable ADAS');
    }
    const finalSpeedKmh = rig.dynamics.speed * 3.6;
    assert(sawOverride, 'Expected DRIVER_ACCELERATION_OVERRIDE state');
    assert(peakSpeedKmh > 58, `Driver should be able to accelerate above 50 km/h limit, peak=${peakSpeedKmh.toFixed(1)}`);
    assert(finalSpeedKmh < peakSpeedKmh - 5 && finalSpeedKmh <= 55, `Speed should recover toward 50 km/h after release, final=${finalSpeedKmh.toFixed(1)}`);
    return { peakSpeedKmh: +peakSpeedKmh.toFixed(1), recoveredSpeedKmh: +finalSpeedKmh.toFixed(1) };
  });

  // 17. Driver manual steering lane change (yields steering, adopts new lane, never pulls back!)
  run('17-driver-steer-lc', '驾驶员手动变道接管', () => {
    const road = makeRoad({ id: 'r-mst', points: [{ x: 0, z: 0 }, { x: 0, z: -600 }], laneCountPerDirection: 2, speedLimit: 60 });
    const net = makeNetwork([road]);
    const rig = createSimRig({
      network: net,
      startX: 1.75, // left forward lane (approachIdx 0)
      startZ: -20,
      startSpeed: 15,
      destination: { roadId: 'r-mst', along: 580, x: 0, z: -580, direction: 'forward' },
    });
    let sawSteerOverride = false;
    for (let i = 0; i < 120 * 13; i++) {
      const t = i * FIXED_DT;
      let driverSteer = 0;
      const { out, snap, state } = rig.step((inp, _t, s) => {
        if (t >= 2.0 && t < 5.2) {
          // Scripted human steering smoothly changing to right lane (x = 5.25)
          const err = 5.25 - s.x;
          driverSteer = Math.max(-0.45, Math.min(0.45, err * 0.09 + s.yaw * 1.1 + s.yawRate * 0.4));
          if (t < 2.25) driverSteer = 0.25;
          inp.steering = driverSteer;
        }
      });
      if (Math.abs(driverSteer) >= 0.14) {
        if (state === 'DRIVER_STEERING_OVERRIDE') sawSteerOverride = true;
        assert(Math.abs(out.steering - driverSteer) < 1e-6, 'ADAS fought driver steering during override!');
      }
      assert(rig.adas.isEnabled, 'Manual steering must NOT disable ADAS');
      void snap;
    }
    assert(sawSteerOverride, 'Expected DRIVER_STEERING_OVERRIDE state');
    assert(rig.adas.currentState === 'ACTIVE' || rig.adas.currentState === 'CRUISE', `Expected ADAS to resume ACTIVE/CRUISE after release, got ${rig.adas.currentState}`);
    assert(Math.abs(rig.dynamics.x - 5.25) < 0.7, `ADAS should adopt new lane (x~5.25) instead of pulling back, got x=${rig.dynamics.x.toFixed(2)}`);
    assert(rig.adas.planner.snapshot.currentApproachLaneIndex === 1, 'Planner did not adopt new lane index 1');
    return { sawSteerOverride, adoptedLane: rig.adas.planner.snapshot.currentApproachLaneIndex, finalX: +rig.dynamics.x.toFixed(2) };
  });

  // 18. Manual brake priority vs ADAS control (zero opposing throttle, resumes smoothly on release)
  run('18-driver-brake-priority', '人工制动优先且无冲突', () => {
    const road = makeRoad({ id: 'r-brk', points: [{ x: 0, z: 0 }, { x: 0, z: -600 }], laneCountPerDirection: 2, speedLimit: 60 });
    const net = makeNetwork([road]);
    const rig = createSimRig({
      network: net,
      startX: 1.75,
      startZ: -20,
      startSpeed: 15,
      destination: { roadId: 'r-brk', along: 580, x: 0, z: -580, direction: 'forward' },
    });
    let speedAtBrakeEnd = 0;
    for (let i = 0; i < 120 * 10; i++) {
      const t = i * FIXED_DT;
      const { out, snap } = rig.step((inp) => {
        if (t >= 1.0 && t <= 3.0) inp.brake = 0.55;
      });
      if (t >= 1.0 && t <= 3.0) {
        assert(out.throttle === 0 && (out.cruiseThrottle ?? 0) === 0, 'ADAS applied throttle while driver braked!');
        assert(out.brake === 0.55, 'Manual brake input must pass through cleanly');
        speedAtBrakeEnd = snap.speed;
      }
      assert(rig.adas.isEnabled, 'Manual braking must NOT exit ADAS');
    }
    assert(speedAtBrakeEnd < 7.0, `Manual brake should decelerate car, v=${speedAtBrakeEnd.toFixed(2)}`);
    assert(rig.dynamics.speed > speedAtBrakeEnd + 4.0, `ADAS should smoothly re-accelerate after brake release, v=${rig.dynamics.speed.toFixed(2)}`);
    assert(rig.conflictViolations === 0, 'Throttle/brake conflict occurred');
    return { speedAtBrakeEndMps: +speedAtBrakeEnd.toFixed(2), resumedSpeedMps: +rig.dynamics.speed.toFixed(2) };
  });

  // 19. Gamepad Y 700ms long-press toggle & non-repeat (short press preserves cycleLaneAssist)
  run('19-gamepad-y-longpress', '手柄 Y 长按开关与防重触发', () => {
    const pad = {
      id: 'ADAS Test Pad',
      index: 0,
      connected: true,
      mapping: 'standard' as GamepadMappingType,
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })),
      hapticActuators: [],
    } as unknown as Gamepad;
    const setBtn = (idx: number, pressed: boolean) => {
      (pad.buttons[idx] as { pressed: boolean; value: number }).pressed = pressed;
      (pad.buttons[idx] as { pressed: boolean; value: number }).value = pressed ? 1 : 0;
      (pad as { timestamp: number }).timestamp += 16;
    };
    const input = new VehicleInputSystem({
      keyboard: false,
      gamepad: { target: null, navigator: { getGamepads: () => [pad] } },
    });
    // Connect baseline frame
    input.update(1 / 60, 1);
    input.consumeState();

    // Short tap Y (200ms) -> cycleLaneAssist on release, NO adasToggle
    setBtn(3, true);
    input.update(0.2, 1);
    let s = input.consumeState();
    assert(!s.adasToggle && !s.cycleLaneAssist, 'Short Y hold before release emits neither');
    setBtn(3, false);
    input.update(1 / 60, 1);
    s = input.consumeState();
    assert(s.cycleLaneAssist === true && !s.adasToggle, 'Short Y release triggers cycleLaneAssist only');

    // Long press Y (~700ms) -> adasToggle fires ONCE
    const adas = new ADASController();
    setBtn(3, true);
    let toggles = 0;
    for (let i = 0; i < 60; i++) {
      // 60 * 0.025s = 1.5s continuous hold
      input.update(0.025, 1);
      s = input.consumeState();
      if (s.adasToggle) {
        toggles++;
        adas.toggle();
      }
      assert(!s.cycleLaneAssist, 'Long hold Y must not emit cycleLaneAssist');
    }
    assert(toggles === 1 && adas.isEnabled, `Expected exactly 1 ADAS toggle on continuous hold, got ${toggles}`);

    // Release Y -> no extra toggle, no cycleLaneAssist
    setBtn(3, false);
    input.update(1 / 60, 1);
    s = input.consumeState();
    assert(!s.adasToggle && !s.cycleLaneAssist, 'Releasing after long press must not emit extra edge');

    // Second long press Y (~700ms) -> toggles ADAS OFF once
    setBtn(3, true);
    for (let i = 0; i < 40; i++) {
      input.update(0.025, 1);
      s = input.consumeState();
      if (s.adasToggle) {
        toggles++;
        adas.toggle();
      }
    }
    assert(toggles === 2 && !adas.isEnabled, `Second long press should turn ADAS OFF, toggles=${toggles}`);
    input.dispose();
    return { toggles, shortPressPreserved: true, noRepeatWhileHeld: true };
  });

  // 20. Route loss, stale data, NaN inputs, and road-level derived lane degradation
  run('20-fault-handling', '路线丢失、异常数据与降级模式', () => {
    // 20a. Derived road-level geometry (no authored lanes) -> DEGRADED mode with safe reduced speed
    const derivedRoad = makeRoad({ id: 'r-derived', points: [{ x: 0, z: 0 }, { x: 0, z: -300 }], laneCountPerDirection: 2, speedLimit: 80, omitLanes: true });
    const netDerived = makeNetwork([derivedRoad]);
    const rig = createSimRig({
      network: netDerived,
      startX: 1.75,
      startZ: -20,
      startSpeed: 10,
      destination: { roadId: 'r-derived', along: 280, x: 0, z: -280, direction: 'forward' },
    });
    for (let i = 0; i < 60; i++) rig.step();
    assert(rig.adas.currentState === 'DEGRADED' || rig.adas.currentState === 'UNMARKED_ROAD', `Expected DEGRADED/UNMARKED_ROAD for road without authored lanes, got ${rig.adas.currentState}`);
    assert(rig.adas.status.degraded === true, 'Status must flag degraded=true');

    // 20b. Stale perception/world timestamp -> UNAVAILABLE with zero blind steering
    let staleOut = rig.step(undefined, (w, t) => { w.dataTimestamp = t - 2.5; });
    assert(staleOut.state === 'UNAVAILABLE', `Stale data must trigger UNAVAILABLE, got ${staleOut.state}`);
    assert(staleOut.out.steering === 0 && (staleOut.out.cruiseThrottle ?? 0) === 0, 'UNAVAILABLE must output zero steering/throttle');

    // 20c. Route lost (navigation cleared) -> UNAVAILABLE with zero steering
    rig.nav.clear();
    const lostOut = rig.step();
    assert(lostOut.state === 'UNAVAILABLE', `Lost route must trigger UNAVAILABLE, got ${lostOut.state}`);
    assert(lostOut.out.steering === 0 && (lostOut.out.cruiseThrottle ?? 0) === 0, 'Route loss must not output blind steering');

    // 20d. Corrupt NaN control input -> UNAVAILABLE cleanly without throwing
    const nanOut = rig.step((inp) => { inp.steering = Number.NaN; });
    assert(nanOut.state === 'UNAVAILABLE', `NaN input must trigger UNAVAILABLE, got ${nanOut.state}`);
    assert(Number.isFinite(nanOut.out.steering), 'Output steering must remain finite on NaN input');
    return { degradedOk: true, staleUnavailableOk: true, routeLossOk: true, nanSafeOk: true };
  });

  // 21. 120km/h 高速前瞻观察与提前平稳变道
  run('21-highway-120kmh-early-avoidance', '120km/h 高速前瞻观察与提前平稳变道', () => {
    const road = makeRoad({
      id: 'r-hw-120',
      points: [{ x: 0, z: 0 }, { x: 0, z: -800 }],
      laneCountPerDirection: 3,
      laneWidth: 3.75,
      speedLimit: 120,
      roadType: 'highway',
    });
    const net = makeNetwork([road]);
    // Vehicle in middle lane (x = 5.625), obstacle at z = -140
    const obs = makeActor({ id: 'obs-hw', kind: 'static-obstacle', x: 5.625, z: -140 });
    const rig = createSimRig({
      network: net,
      startX: 5.625,
      startZ: -10,
      startSpeed: 33.3,
      destination: { roadId: 'r-hw-120', along: 750, x: 5.625, z: -750, direction: 'forward' },
      actors: [obs],
    });

    let detectedEarly = false;
    let avoidanceInitiatedEarly = false;
    let minSpeedMps = 33.3;

    for (let i = 0; i < 200; i++) {
      const res = rig.step();
      const status = rig.adas.status;
      const gap = Math.abs(res.snap.z - obs.z) - 5;
      if (status.leadActorId === 'obs-hw' && gap > 70) {
        detectedEarly = true;
      }
      if ((status.state === 'LANE_CHANGING' || status.state === 'PREPARING_LANE_CHANGE') && gap > 45) {
        avoidanceInitiatedEarly = true;
      }
      if (res.snap.speed < minSpeedMps) minSpeedMps = res.snap.speed;
    }

    assert(detectedEarly, 'Must detect obstacle at high speed beyond 70m with dynamic lookahead');
    assert(avoidanceInitiatedEarly, 'Must initiate avoidance lane change early (> 45m ahead) at 120km/h');
    assert(minSpeedMps >= 25, `High-speed early avoidance must retain speed (min speed ${minSpeedMps.toFixed(1)} >= 25 m/s)`);
    return { detectedEarly, avoidanceInitiatedEarly, minSpeedKmh: Math.round(minSpeedMps * 3.6) };
  });

  // 22. 动态前车向左移动时选择右侧变道避让
  run('22-dynamic-lead-moving-left', '动态前车向左移动时选择右侧变道避让', () => {
    const road = makeRoad({
      id: 'r-drift-left',
      points: [{ x: 0, z: 0 }, { x: 0, z: -400 }],
      laneCountPerDirection: 3,
      laneWidth: 3.75,
      speedLimit: 80,
    });
    const net = makeNetwork([road]);
    const lead = makeActor({
      id: 'lead-left',
      x: 5.625,
      z: -50,
      speed: 5,
      vx: -0.7,
      vz: -5,
    });
    const rig = createSimRig({
      network: net,
      startX: 5.625,
      startZ: -10,
      startSpeed: 18,
      destination: { roadId: 'r-drift-left', along: 380, x: 5.625, z: -380, direction: 'forward' },
      actors: [lead],
    });

    let requestedRightAvoidance = false;
    for (let i = 0; i < 90; i++) {
      lead.x += lead.vx * FIXED_DT;
      lead.z += lead.vz * FIXED_DT;
      rig.step();
      const obs = (rig.adas as any).obstacleAvoidance.assessment;
      if (obs.avoidanceRequest === 'right') {
        requestedRightAvoidance = true;
      }
    }
    assert(requestedRightAvoidance, 'When lead vehicle drifts left into left lane corridor, ego must avoid to the right');
    return { requestedRightAvoidance: true };
  });

  // 23. 动态前车向右移动时选择左侧变道避让
  run('23-dynamic-lead-moving-right', '动态前车向右移动时选择左侧变道避让', () => {
    const road = makeRoad({
      id: 'r-drift-right',
      points: [{ x: 0, z: 0 }, { x: 0, z: -400 }],
      laneCountPerDirection: 3,
      laneWidth: 3.75,
      speedLimit: 80,
    });
    const net = makeNetwork([road]);
    const lead = makeActor({
      id: 'lead-right',
      x: 5.625,
      z: -50,
      speed: 5,
      vx: 0.7,
      vz: -5,
    });
    const rig = createSimRig({
      network: net,
      startX: 5.625,
      startZ: -10,
      startSpeed: 18,
      destination: { roadId: 'r-drift-right', along: 380, x: 5.625, z: -380, direction: 'forward' },
      actors: [lead],
    });

    let requestedLeftAvoidance = false;
    for (let i = 0; i < 90; i++) {
      lead.x += lead.vx * FIXED_DT;
      lead.z += lead.vz * FIXED_DT;
      rig.step();
      const obs = (rig.adas as any).obstacleAvoidance.assessment;
      if (obs.avoidanceRequest === 'left') {
        requestedLeftAvoidance = true;
      }
    }
    assert(requestedLeftAvoidance, 'When lead vehicle drifts right into right lane corridor, ego must avoid to the left');
    return { requestedLeftAvoidance: true };
  });

  // 24. 动态目标进入候选变道走廊时拒绝变道
  run('24-spatiotemporal-candidate-conflict', '动态目标进入候选变道走廊时拒绝变道', () => {
    const road = makeRoad({
      id: 'r-st-conflict',
      points: [{ x: 0, z: 0 }, { x: 0, z: -400 }],
      laneCountPerDirection: 2,
      laneWidth: 3.5,
      speedLimit: 60,
    });
    const net = makeNetwork([road]);
    const obs = makeActor({ id: 'obs-current', kind: 'static-obstacle', x: 1.75, z: -55 });
    const adjVehicle = makeActor({ id: 'adj-car', x: 5.25, z: -15, speed: 14, vx: 0, vz: -14 });
    const rig = createSimRig({
      network: net,
      startX: 1.75,
      startZ: -10,
      startSpeed: 14,
      destination: { roadId: 'r-st-conflict', along: 380, x: 1.75, z: -380, direction: 'forward' },
      actors: [obs, adjVehicle],
    });

    for (let i = 0; i < 90; i++) {
      adjVehicle.z += adjVehicle.vz * FIXED_DT;
      rig.step();
    }
    const clearance = (rig.adas as any).obstacleAvoidance.assessment.rightLane;
    assert(!clearance.safe, 'Target lane occupied by adjacent vehicle must be flagged safe=false');
    assert(rig.adas.status.state !== 'LANE_CHANGING', 'Must not initiate lane change when candidate lane has trajectory conflict');
    return { candidateLaneProtected: true, blockReason: clearance.blockReason };
  });

  // 25. 高速出口连续两次变道
  run('25-sequential-multi-lane-change', '高速出口连续两次变道', () => {
    const hwRoad = makeRoad({
      id: 'r-hw-seq',
      points: [{ x: 0, z: 0 }, { x: 0, z: -600 }],
      laneCountPerDirection: 3,
      laneWidth: 3.75,
      speedLimit: 100,
      roadType: 'highway',
    });
    const rampRoad = makeRoad({
      id: 'r-ramp-seq',
      points: [{ x: 9.375, z: -600 }, { x: 25, z: -750 }],
      laneCountPerDirection: 1,
      laneWidth: 3.75,
      speedLimit: 40,
      roadType: 'ramp',
    });
    const conn: RoadRoutingConnection = {
      fromRoadId: 'r-hw-seq',
      toRoadId: 'r-ramp-seq',
      fromEnd: 'end',
      toEnd: 'start',
      via: { x: 12, y: 0, z: -615 },
    };
    const net = makeNetwork([hwRoad, rampRoad], [conn]);
    const rig = createSimRig({
      network: net,
      startX: 1.875,
      startZ: -250, // 350m to ramp junction at z = -600 (within required 320m multi-lane lead)
      startSpeed: 22.2,
      destination: { roadId: 'r-ramp-seq', along: 120, x: 20, z: -720, direction: 'forward' },
    });

    const completedLanes = new Set<number>();
    for (let i = 0; i < 2100; i++) {
      rig.step();
      completedLanes.add(rig.adas.status.approachLaneIndex);
    }
    assert(completedLanes.has(0) && completedLanes.has(1) && completedLanes.has(2),
      `Must sequentially transition across all 3 lanes, saw: ${Array.from(completedLanes).join(',')}`);
    return { completedLanes: Array.from(completedLanes).join(',') };
  });

  // 26. 普通十字路口左转、右转提前打灯且入弯前方向盘居中
  run('26-intersection-turn-signal-advance', '普通十字路口左转、右转提前打灯且入弯前方向盘居中', () => {
    const net = makeCrossIntersectionNetwork({ speedLimit: 40, lanesPerDir: 1 });
    const rig = createSimRig({
      network: net,
      startX: 1.75,
      startZ: -130, // 56m to entry at z = -186
      startSpeed: 10,
      destination: { roadId: 'west', along: 100, x: -100, z: -200, direction: 'forward' },
    });

    let signalTurnedOnEarly = false;
    let steeringRemainedCentered = false;

    for (let i = 0; i < 240; i++) {
      const res = rig.step();
      const distToEntry = Math.abs(res.snap.z - (-186));
      if (distToEntry > 20 && distToEntry < 45) {
        if (rig.adas.status.desiredTurnSignal === 'left') {
          signalTurnedOnEarly = true;
          if (Math.abs(res.out.steering) < 0.03) {
            steeringRemainedCentered = true;
          }
        }
      }
    }
    assert(signalTurnedOnEarly, 'Turn signal must activate in advance (20-45m before junction)');
    assert(steeringRemainedCentered, 'Steering must remain centered (|steering| < 0.03) when turn signal activates in advance');
    return { signalTurnedOnEarly: true, steeringRemainedCentered: true };
  });

  // 27. 导流线与反向道路吸附防范
  run('27-reject-opposite-road-snapping', '导流线与反向道路吸附防范', () => {
    const forwardRoad = makeRoad({
      id: 'r-fwd',
      points: [{ x: 2, z: 0 }, { x: 2, z: -300 }],
      laneCountPerDirection: 1,
      travelDirection: 'forward',
      speedLimit: 60,
    });
    const reverseRoad = makeRoad({
      id: 'r-rev',
      points: [{ x: -2, z: -300 }, { x: -2, z: 0 }],
      laneCountPerDirection: 1,
      travelDirection: 'forward',
      speedLimit: 60,
    });
    const net = makeNetwork([forwardRoad, reverseRoad]);
    const rig = createSimRig({
      network: net,
      startX: 0.8,
      startZ: -50,
      startYaw: 0,
      startSpeed: 15,
      destination: { roadId: 'r-fwd', along: 280, x: 2, z: -280, direction: 'forward' },
    });

    for (let i = 0; i < 30; i++) {
      rig.step();
      assert(rig.adas.status.currentRoadName === 'r-fwd',
        `Must remain snapped to forward road, erroneously snapped to: ${rig.adas.status.currentRoadName}`);
    }
    return { oppositeRoadRejected: true };
  });

  // 28. 侵入车道路障识别与路侧设施免误报
  run('28-roadside-infrastructure-vs-intruding-barrier', '侵入车道路障识别与路侧设施免误报', () => {
    const road = makeRoad({
      id: 'r-infra-test',
      points: [{ x: 0, z: 0 }, { x: 0, z: -300 }],
      laneCountPerDirection: 1,
      laneWidth: 3.5,
      speedLimit: 50,
    });
    const roadsidePost = createStaticOBBCollider({
      id: 'test-sign:post:0',
      x: 3.2,
      z: -60,
      width: 0.25,
      length: 0.25,
      minHeight: 0,
      maxHeight: 2.8,
      type: 'obstacle',
    });
    const intrudingBarrier = createStaticOBBCollider({
      id: 'construction-barrier:0',
      x: 1.75,
      z: -120,
      width: 1.4,
      length: 0.4,
      minHeight: 0,
      maxHeight: 1.1,
      type: 'obstacle',
    });
    const net = makeNetwork([road]);
    const rig = createSimRig({
      network: net,
      colliders: [roadsidePost, intrudingBarrier],
      startX: 1.75,
      startZ: -10,
      startSpeed: 12,
      destination: { roadId: 'r-infra-test', along: 280, x: 1.75, z: -280, direction: 'forward' },
    });

    let passedRoadsidePostCleanly = false;
    let stoppedForIntrudingBarrier = false;

    for (let i = 0; i < 1400; i++) {
      const res = rig.step();
      if (res.snap.z < -45 && res.snap.z > -75) {
        if (res.snap.speed > 8) {
          passedRoadsidePostCleanly = true;
        }
      }
      if (res.snap.z <= -105 && res.snap.speed < 0.5) {
        stoppedForIntrudingBarrier = true;
        break;
      }
    }
    assert(passedRoadsidePostCleanly, 'Must pass roadside post without false emergency braking');
    assert(stoppedForIntrudingBarrier, 'Must detect and stop for physical barrier intruding into drivable lane');
    return { passedRoadsidePostCleanly: true, stoppedForIntrudingBarrier: true };
  });

  // Helper to collect full overtaking & longitudinal comfort telemetry (Req 7 metrics)
  function createOvertakeTelemetry(rig: SimRig, roadLimitKmh: number) {
    let lcDecisionTimeS = -1;
    let turnSignalTimeS = -1;
    let overtakeStartTimeS = -1;
    let overtakeCompleteTimeS = -1;
    let returnCompleteTimeS = -1;
    let speedRecoveryTimeS = -1;
    let maxBrakeDecelMps2 = 0;
    let maxAccelMps2 = 0;
    let maxJerkMps3 = 0;
    let maxRecoveryJerkMps3 = 0;
    let maxOvertakeSpeedKmh = 0;
    let minSpeedKmh = Infinity;
    let maxSpeedKmh = 0;
    let maxTargetSpeedKmh = 0;
    let minLeadGapM = Infinity;
    let initialLeadGapM = -1;
    let leadSpeedKmh = -1;
    let prevDesiredAccel = 0;
    let hasPrevDesired = false;

    const sample = (t: number, snap: ReturnType<VehicleDynamics<Powertrain>['getSnapshot']>) => {
      const st = rig.adas.status;
      const spdKmh = snap.speed * 3.6;
      const tgtKmh = st.targetSpeedKmh;
      minSpeedKmh = Math.min(minSpeedKmh, spdKmh);
      maxSpeedKmh = Math.max(maxSpeedKmh, spdKmh);
      maxTargetSpeedKmh = Math.max(maxTargetSpeedKmh, tgtKmh);

      if (st.leadGapM !== null) {
        if (initialLeadGapM < 0) initialLeadGapM = st.leadGapM;
        minLeadGapM = Math.min(minLeadGapM, st.leadGapM);
        const obsSpeed = rig.adas.obstacleAvoidance.assessment.leadSpeedMps;
        if (leadSpeedKmh < 0 && Number.isFinite(obsSpeed)) leadSpeedKmh = obsSpeed * 3.6;
      }

      if (
        lcDecisionTimeS < 0 &&
        (st.state === 'PREPARING_LANE_CHANGE' ||
          st.state === 'LANE_CHANGING' ||
          rig.adas.planner.snapshot.laneChange.active)
      ) {
        lcDecisionTimeS = t;
      }
      if (turnSignalTimeS < 0 && (st.desiredTurnSignal !== null || rig.lights.state.leftTurnSignal || rig.lights.state.rightTurnSignal)) {
        turnSignalTimeS = t;
      }

      const otPhase = st.overtakingPhase ?? 'none';
      if (overtakeStartTimeS < 0 && otPhase !== 'none') overtakeStartTimeS = t;
      if (otPhase !== 'none' || st.state === 'LANE_CHANGING') {
        maxOvertakeSpeedKmh = Math.max(maxOvertakeSpeedKmh, spdKmh);
      }
      if (overtakeCompleteTimeS < 0 && otPhase === 'passing') {
        overtakeCompleteTimeS = t;
      }
      if (overtakeCompleteTimeS > 0 && returnCompleteTimeS < 0 && otPhase === 'none') {
        returnCompleteTimeS = t;
      }
      if (returnCompleteTimeS > 0 && speedRecoveryTimeS < 0 && Math.abs(spdKmh - roadLimitKmh) <= Math.max(4.0, roadLimitKmh * 0.05)) {
        speedRecoveryTimeS = t - returnCompleteTimeS;
      }

      if ((snap.brake > 0.02 || rig.adas.speedController.command.brake > 0.02) && snap.acceleration < -maxBrakeDecelMps2) {
        maxBrakeDecelMps2 = -snap.acceleration;
      }
      if (snap.acceleration > maxAccelMps2) maxAccelMps2 = snap.acceleration;

      const desiredAccel = rig.adas.speedController.command.desiredAccelMps2;
      if (hasPrevDesired) {
        const j = Math.abs(desiredAccel - prevDesiredAccel) / FIXED_DT;
        if (j > maxJerkMps3 && !rig.adas.obstacleAvoidance.assessment.emergencyBraking) {
          maxJerkMps3 = j;
        }
        if (overtakeCompleteTimeS > 0 && j > maxRecoveryJerkMps3) {
          maxRecoveryJerkMps3 = j;
        }
      }
      prevDesiredAccel = desiredAccel;
      hasPrevDesired = true;
    };

    const summary = (snap: ReturnType<VehicleDynamics<Powertrain>['getSnapshot']>): Record<string, number | string | boolean> => ({
      finalSpeedKmh: +(snap.speed * 3.6).toFixed(1),
      finalTargetSpeedKmh: +rig.adas.status.targetSpeedKmh.toFixed(1),
      minSpeedKmh: +minSpeedKmh.toFixed(1),
      maxOvertakeSpeedKmh: +(maxOvertakeSpeedKmh || maxSpeedKmh).toFixed(1),
      maxTargetSpeedKmh: +maxTargetSpeedKmh.toFixed(1),
      leadSpeedKmh: +(leadSpeedKmh >= 0 ? leadSpeedKmh : 0).toFixed(1),
      initialLeadGapM: +(initialLeadGapM >= 0 ? initialLeadGapM : 0).toFixed(1),
      minLeadGapM: +(Number.isFinite(minLeadGapM) ? minLeadGapM : 999).toFixed(1),
      lcDecisionTimeS: +(lcDecisionTimeS >= 0 ? lcDecisionTimeS : -1).toFixed(2),
      turnSignalTimeS: +(turnSignalTimeS >= 0 ? turnSignalTimeS : -1).toFixed(2),
      maxBrakeDecelMps2: +maxBrakeDecelMps2.toFixed(2),
      overtakeCompleteTimeS: +(overtakeCompleteTimeS >= 0 ? overtakeCompleteTimeS : -1).toFixed(2),
      speedRecoveryTimeS: +(speedRecoveryTimeS >= 0 ? speedRecoveryTimeS : -1).toFixed(2),
      maxAccelMps2: +maxAccelMps2.toFixed(2),
      maxJerkMps3: +maxJerkMps3.toFixed(2),
      maxRecoveryJerkMps3: +maxRecoveryJerkMps3.toFixed(2),
    });

    return { sample, summary };
  }

  // 29. 120km/h 高速，前方 60km/h 慢车，邻道完全空闲
  run('29-sdb-120kmh-slow60-clear-lane', '120km/h高速遇60km/h慢车邻道空闲主动超车', () => {
    const hw = makeRoad({
      id: 'r-v32-29',
      points: [{ x: 0, z: 0 }, { x: 0, z: -1200 }],
      laneCountPerDirection: 2,
      laneWidth: 3.75,
      speedLimit: 120,
      roadType: 'highway',
    });
    const rig = createSimRig({
      network: makeNetwork([hw]),
      startX: 5.625,
      startZ: -20,
      startSpeed: 120 / 3.6,
      destination: { roadId: 'r-v32-29', along: 1150, x: 5.625, z: -1150, direction: 'forward' },
      useScenarioDebugger: true,
    });
    const sdb = rig.scenarioDebugger!;
    const spawnRes = sdb.spawn({
      id: 'slow60',
      type: 'vehicle',
      motionMode: 'dynamic',
      positionMode: 'road-relative',
      forwardDistanceM: 115,
      laneOffset: 0,
      lateralOffsetM: 0,
      speedKmh: 60,
      targetSpeedKmh: 60,
      behavior: 'constant',
      behaviorDelayS: 0,
      targetLaneChange: 'none',
      randomSeed: 29,
    });
    assert(spawnRes.success && spawnRes.actor, 'Failed to spawn slow60');

    const tel = createOvertakeTelemetry(rig, 120);
    let passedSlowCar = false;
    for (let i = 0; i < 120 * 14; i++) {
      const { snap } = rig.step();
      tel.sample(rig.simTime, snap);
      assert(!(rig.contacts.collision?.collided), 'Collided in clear-lane overtake');
      if (snap.z < spawnRes.actor.z - 15) {
        passedSlowCar = true;
      }
    }
    const m = tel.summary(rig.dynamics.getSnapshot());
    assert(passedSlowCar, `Ego must overtake and pass 60km/h slow vehicle: egoZ=${rig.dynamics.z.toFixed(1)}, slowZ=${spawnRes.actor.z.toFixed(1)}, x=${rig.dynamics.x.toFixed(2)}`);
    assert((m.turnSignalTimeS as number) >= 0 && (m.lcDecisionTimeS as number) >= 0 && (m.lcDecisionTimeS as number) < 2.0,
      `Must decide overtake early (< 2.0s), got ${m.lcDecisionTimeS}s`);
    assert((m.minSpeedKmh as number) >= 105,
      `Must NOT unnecessarily slow down before empty-lane overtake: minSpeed=${m.minSpeedKmh} km/h`);
    assert((m.maxBrakeDecelMps2 as number) < 1.5,
      `Must NOT brake hard when passing lane is free: maxBrake=${m.maxBrakeDecelMps2} m/s^2`);
    assert((m.maxOvertakeSpeedKmh as number) > 120 && (m.maxOvertakeSpeedKmh as number) <= 145,
      `Overtaking speed boost must stay within 120% cap (max=${m.maxOvertakeSpeedKmh} km/h)`);
    sdb.dispose();
    return m;
  });

  // 30. 120km/h 高速，前方慢车，邻道后方车辆快速接近
  run('30-sdb-120kmh-fast-rear-approacher', '120km/h高速遇慢车邻道后车快速接近等待再超车', () => {
    const hw = makeRoad({
      id: 'r-v32-30',
      points: [{ x: 0, z: 0 }, { x: 0, z: -1500 }],
      laneCountPerDirection: 2,
      laneWidth: 3.75,
      speedLimit: 120,
      roadType: 'highway',
    });
    const rig = createSimRig({
      network: makeNetwork([hw]),
      startX: 5.625,
      startZ: -80,
      startSpeed: 112 / 3.6,
      destination: { roadId: 'r-v32-30', along: 1450, x: 5.625, z: -1450, direction: 'forward' },
      useScenarioDebugger: true,
    });
    const sdb = rig.scenarioDebugger!;
    const slowSpawn = sdb.spawn({
      id: 'slow-lead',
      type: 'vehicle',
      motionMode: 'dynamic',
      positionMode: 'road-relative',
      forwardDistanceM: 90,
      laneOffset: 0,
      lateralOffsetM: 0,
      speedKmh: 70,
      targetSpeedKmh: 70,
      behavior: 'constant',
      behaviorDelayS: 0,
      targetLaneChange: 'none',
      randomSeed: 30,
    });
    const fastRearSpawn = sdb.spawn({
      id: 'fast-rear',
      type: 'vehicle',
      motionMode: 'dynamic',
      positionMode: 'road-relative',
      forwardDistanceM: -32,
      laneOffset: -1,
      lateralOffsetM: 0,
      speedKmh: 162,
      targetSpeedKmh: 162,
      behavior: 'constant',
      behaviorDelayS: 0,
      targetLaneChange: 'none',
      randomSeed: 31,
    });
    assert(slowSpawn.success && slowSpawn.actor && fastRearSpawn.success && fastRearSpawn.actor, 'Spawn failed');

    const tel = createOvertakeTelemetry(rig, 120);
    let waitedWhileRearClosing = false;
    let changedAfterRearPassed = false;
    for (let i = 0; i < 120 * 16; i++) {
      const { snap } = rig.step();
      tel.sample(rig.simTime, snap);
      const rearDist = snap.z - fastRearSpawn.actor.z; // <0 when fastRear is still behind ego
      if (rearDist < 5 && !rig.adas.obstacleAvoidance.assessment.leftLane.safe) {
        waitedWhileRearClosing = true;
      }
      if (rearDist < 0) {
        assert(snap.x > 3.5, `Cut into left lane while fast rear car still approaching! rearDist=${rearDist.toFixed(1)}, x=${snap.x.toFixed(2)}`);
      }
      if (rearDist > 15 && snap.x < 3.5) {
        changedAfterRearPassed = true;
      }
      assert(!(rig.contacts.collision?.collided), 'Collision in fast-rear scenario');
    }
    const m = tel.summary(rig.dynamics.getSnapshot());
    assert(waitedWhileRearClosing, 'Must detect and wait for fast approaching rear vehicle');
    assert(changedAfterRearPassed, 'Must change left and overtake once fast rear vehicle safely passes');
    sdb.dispose();
    return { ...m, waitedWhileRearClosing, changedAfterRearPassed };
  });

  // 31. 前方慢车，邻道车流密集
  run('31-sdb-congested-adjacent-lane', '前方慢车邻道车流密集保持安全跟车等待', () => {
    const road = makeRoad({
      id: 'r-v32-31',
      points: [{ x: 0, z: 0 }, { x: 0, z: -800 }],
      laneCountPerDirection: 2,
      laneWidth: 3.5,
      speedLimit: 80,
      roadType: 'highway',
    });
    const rig = createSimRig({
      network: makeNetwork([road]),
      startX: 5.25,
      startZ: -60,
      startSpeed: 75 / 3.6,
      destination: { roadId: 'r-v32-31', along: 750, x: 5.25, z: -750, direction: 'forward' },
      useScenarioDebugger: true,
    });
    const sdb = rig.scenarioDebugger!;
    sdb.spawn({
      id: 'slow-lead', type: 'vehicle', motionMode: 'dynamic', positionMode: 'road-relative',
      forwardDistanceM: 55, laneOffset: 0, lateralOffsetM: 0, speedKmh: 45, targetSpeedKmh: 45,
      behavior: 'constant', behaviorDelayS: 0, targetLaneChange: 'none', randomSeed: 32,
    });
    // Dense stream in left adjacent lane
    for (const [idx, dist] of [[-12, 1], [16, 2], [44, 3]] as const) {
      sdb.spawn({
        id: `cong-${idx}`, type: 'vehicle', motionMode: 'dynamic', positionMode: 'road-relative',
        forwardDistanceM: dist === 1 ? -12 : dist === 2 ? 16 : 44,
        laneOffset: -1, lateralOffsetM: 0, speedKmh: 48, targetSpeedKmh: 48,
        behavior: 'constant', behaviorDelayS: 0, targetLaneChange: 'none', randomSeed: 40 + idx,
      });
    }

    const tel = createOvertakeTelemetry(rig, 80);
    let stayedInLane = true;
    for (let i = 0; i < 120 * 10; i++) {
      const { snap } = rig.step();
      tel.sample(rig.simTime, snap);
      if (snap.x < 3.6) stayedInLane = false;
      assert(!(rig.contacts.collision?.collided), 'Collided in congested scenario');
    }
    const m = tel.summary(rig.dynamics.getSnapshot());
    assert(stayedInLane, 'Must stay safely in own lane when adjacent traffic stream is congested');
    assert((m.minLeadGapM as number) > 4.0, `Must preserve safe car-following gap, minGap=${m.minLeadGapM}m`);
    assert(Math.abs((m.finalSpeedKmh as number) - 45) < 10, `Must settle near 45km/h flow, got ${m.finalSpeedKmh}`);
    sdb.dispose();
    return m;
  });

  // 32. 前方静止车辆，邻道安全
  run('32-sdb-static-vehicle-clear-lane', '前方静止车辆邻道安全直接提前绕行而不停车', () => {
    const road = makeRoad({
      id: 'r-v32-32',
      points: [{ x: 0, z: 0 }, { x: 0, z: -600 }],
      laneCountPerDirection: 2,
      laneWidth: 3.5,
      speedLimit: 70,
      roadType: 'highway',
    });
    const rig = createSimRig({
      network: makeNetwork([road]),
      startX: 5.25,
      startZ: -20,
      startSpeed: 65 / 3.6,
      destination: { roadId: 'r-v32-32', along: 550, x: 5.25, z: -550, direction: 'forward' },
      useScenarioDebugger: true,
    });
    const sdb = rig.scenarioDebugger!;
    const staticVeh = sdb.spawn({
      id: 'static-veh', type: 'vehicle', motionMode: 'static', positionMode: 'road-relative',
      forwardDistanceM: 88, laneOffset: 0, lateralOffsetM: 0, speedKmh: 0, targetSpeedKmh: 0,
      behavior: 'constant', behaviorDelayS: 0, targetLaneChange: 'none', randomSeed: 33,
    });
    assert(staticVeh.success && staticVeh.actor, 'Spawn failed');

    const tel = createOvertakeTelemetry(rig, 70);
    let passedCleanly = false;
    for (let i = 0; i < 120 * 10; i++) {
      const { snap } = rig.step();
      tel.sample(rig.simTime, snap);
      assert(!(rig.contacts.collision?.collided), 'Collided with static vehicle');
      if (snap.z < staticVeh.actor.z - 12 && snap.x < 3.5) passedCleanly = true;
    }
    const m = tel.summary(rig.dynamics.getSnapshot());
    assert(passedCleanly, 'Must steer around static vehicle into safe left lane');
    assert((m.minSpeedKmh as number) >= 48, `Must NOT decelerate to standstill before empty-lane bypass: minSpeed=${m.minSpeedKmh}`);
    sdb.dispose();
    return m;
  });

  // 33. 超车过程中邻道突然出现新车辆
  run('33-sdb-sudden-intruder-during-overtake', '超车过程中邻道突然出现新车辆安全应对', () => {
    const road = makeRoad({
      id: 'r-v32-33',
      points: [{ x: 0, z: 0 }, { x: 0, z: -900 }],
      laneCountPerDirection: 2,
      laneWidth: 3.75,
      speedLimit: 100,
      roadType: 'highway',
    });
    const rig = createSimRig({
      network: makeNetwork([road]),
      startX: 5.625,
      startZ: -20,
      startSpeed: 95 / 3.6,
      destination: { roadId: 'r-v32-33', along: 850, x: 5.625, z: -850, direction: 'forward' },
      useScenarioDebugger: true,
    });
    const sdb = rig.scenarioDebugger!;
    sdb.spawn({
      id: 'slow-front', type: 'vehicle', motionMode: 'dynamic', positionMode: 'road-relative',
      forwardDistanceM: 80, laneOffset: 0, lateralOffsetM: 0, speedKmh: 55, targetSpeedKmh: 55,
      behavior: 'constant', behaviorDelayS: 0, targetLaneChange: 'none', randomSeed: 34,
    });

    const tel = createOvertakeTelemetry(rig, 100);
    let intruderSpawned = false;
    let intruderRespObserved = false;
    for (let i = 0; i < 120 * 10; i++) {
      const { snap, state } = rig.step();
      tel.sample(rig.simTime, snap);
      if (!intruderSpawned && (state === 'LANE_CHANGING' || rig.simTime > 2.2)) {
        intruderSpawned = true;
        sdb.spawn({
          id: 'sudden-intruder', type: 'vehicle', motionMode: 'dynamic', positionMode: 'world',
          worldPosition: { x: 1.875, y: 0, z: snap.z - 22, yaw: snap.yaw },
          forwardDistanceM: 22, laneOffset: -1, lateralOffsetM: 0, speedKmh: 45, targetSpeedKmh: 45,
          behavior: 'constant', behaviorDelayS: 0, targetLaneChange: 'none', randomSeed: 35,
        });
      }
      if (intruderSpawned && (state === 'FOLLOW' || state === 'DECELERATING' || state === 'EMERGENCY_BRAKING' || !rig.adas.planner.snapshot.laneChange.active)) {
        intruderRespObserved = true;
      }
      assert(!(rig.contacts.collision?.collided), 'Collided with sudden intruder in passing lane');
    }
    const m = tel.summary(rig.dynamics.getSnapshot());
    assert(intruderSpawned && intruderRespObserved, 'Must respond safely when new vehicle appears in passing lane mid-overtake');
    sdb.dispose();
    return { ...m, intruderRespObserved };
  });

  // 34. 完成超车后安全返回原车道
  run('34-sdb-complete-overtake-return-lane', '完成超车后安全返回原车道完整闭环', () => {
    const road = makeRoad({
      id: 'r-v32-34',
      points: [{ x: 0, z: 0 }, { x: 0, z: -1200 }],
      laneCountPerDirection: 2,
      laneWidth: 3.5,
      speedLimit: 110,
      roadType: 'highway',
    });
    const rig = createSimRig({
      network: makeNetwork([road]),
      startX: 5.25,
      startZ: -20,
      startSpeed: 105 / 3.6,
      destination: { roadId: 'r-v32-34', along: 1150, x: 5.25, z: -1150, direction: 'forward' },
      useScenarioDebugger: true,
    });
    const sdb = rig.scenarioDebugger!;
    const slowSpawn = sdb.spawn({
      id: 'slow-car', type: 'vehicle', motionMode: 'dynamic', positionMode: 'road-relative',
      forwardDistanceM: 75, laneOffset: 0, lateralOffsetM: 0, speedKmh: 55, targetSpeedKmh: 55,
      behavior: 'constant', behaviorDelayS: 0, targetLaneChange: 'none', randomSeed: 36,
    });
    assert(slowSpawn.success && slowSpawn.actor, 'Spawn failed');

    const tel = createOvertakeTelemetry(rig, 110);
    let enteredPassingLane = false;
    let signaledReturnRight = false;
    let returnedToOriginalLane = false;
    for (let i = 0; i < 120 * 18; i++) {
      const { snap } = rig.step();
      tel.sample(rig.simTime, snap);
      if (snap.x < 3.0) enteredPassingLane = true;
      if (enteredPassingLane && rig.adas.planner.snapshot.overtaking.phase === 'returning' && rig.lights.state.rightTurnSignal) {
        signaledReturnRight = true;
      }
      if (enteredPassingLane && snap.z < slowSpawn.actor.z - 22 && snap.x > 4.2 && rig.adas.planner.snapshot.overtaking.phase === 'none') {
        returnedToOriginalLane = true;
      }
      assert(!(rig.contacts.collision?.collided), 'Collided during overtake/return');
    }
    const m = tel.summary(rig.dynamics.getSnapshot());
    assert(enteredPassingLane, 'Must enter left passing lane to overtake');
    assert(signaledReturnRight, 'Must turn on right turn signal before returning to original lane');
    assert(returnedToOriginalLane, `Must return cleanly to original right lane (x=${rig.dynamics.x.toFixed(2)})`);
    sdb.dispose();
    return { ...m, enteredPassingLane, signaledReturnRight, returnedToOriginalLane };
  });

  // 35. 连续遇到两辆慢车，验证不会频繁无意义地刹车
  run('35-sdb-consecutive-slow-vehicles', '连续两辆慢车不回插急刹一次顺畅超越', () => {
    const road = makeRoad({
      id: 'r-v32-35',
      points: [{ x: 0, z: 0 }, { x: 0, z: -1300 }],
      laneCountPerDirection: 2,
      laneWidth: 3.75,
      speedLimit: 110,
      roadType: 'highway',
    });
    const rig = createSimRig({
      network: makeNetwork([road]),
      startX: 5.625,
      startZ: -20,
      startSpeed: 105 / 3.6,
      destination: { roadId: 'r-v32-35', along: 1250, x: 5.625, z: -1250, direction: 'forward' },
      useScenarioDebugger: true,
    });
    const sdb = rig.scenarioDebugger!;
    const s1 = sdb.spawn({
      id: 'slow-1', type: 'vehicle', motionMode: 'dynamic', positionMode: 'road-relative',
      forwardDistanceM: 75, laneOffset: 0, lateralOffsetM: 0, speedKmh: 60, targetSpeedKmh: 60,
      behavior: 'constant', behaviorDelayS: 0, targetLaneChange: 'none', randomSeed: 37,
    });
    const s2 = sdb.spawn({
      id: 'slow-2', type: 'vehicle', motionMode: 'dynamic', positionMode: 'road-relative',
      forwardDistanceM: 125, laneOffset: 0, lateralOffsetM: 0, speedKmh: 60, targetSpeedKmh: 60,
      behavior: 'constant', behaviorDelayS: 0, targetLaneChange: 'none', randomSeed: 38,
    });
    assert(s1.success && s1.actor && s2.success && s2.actor, 'Spawn failed');

    const tel = createOvertakeTelemetry(rig, 110);
    let passedBoth = false;
    for (let i = 0; i < 120 * 18; i++) {
      const { snap } = rig.step();
      tel.sample(rig.simTime, snap);
      if (snap.z < s2.actor.z - 20) passedBoth = true;
      assert(!(rig.contacts.collision?.collided), 'Collided in consecutive slow cars');
    }
    const m = tel.summary(rig.dynamics.getSnapshot());
    assert(passedBoth, 'Must overtake both consecutive slow cars smoothly');
    assert((m.minSpeedKmh as number) >= 92, `Must maintain smooth highway flow across both passes, minSpeed=${m.minSpeedKmh}`);
    assert((m.maxBrakeDecelMps2 as number) < 1.2, `Must NOT make repeated pointless brakes: maxBrake=${m.maxBrakeDecelMps2}`);
    sdb.dispose();
    return m;
  });

  // 36. 城市道路低速避障，不应盲目使用高速超车策略
  run('36-sdb-urban-lowspeed-no-highway-overtake', '城市道路低速避障禁止高速超速超车策略', () => {
    const road = makeRoad({
      id: 'r-v32-36',
      points: [{ x: 0, z: 0 }, { x: 0, z: -400 }],
      laneCountPerDirection: 2,
      laneWidth: 3.5,
      speedLimit: 40,
      roadType: 'urban',
    });
    const rig = createSimRig({
      network: makeNetwork([road]),
      startX: 5.25,
      startZ: -20,
      startSpeed: 38 / 3.6,
      destination: { roadId: 'r-v32-36', along: 350, x: 5.25, z: -350, direction: 'forward' },
      useScenarioDebugger: true,
    });
    const sdb = rig.scenarioDebugger!;
    const slowUrban = sdb.spawn({
      id: 'urban-slow', type: 'vehicle', motionMode: 'dynamic', positionMode: 'road-relative',
      forwardDistanceM: 45, laneOffset: 0, lateralOffsetM: 0, speedKmh: 20, targetSpeedKmh: 20,
      behavior: 'constant', behaviorDelayS: 0, targetLaneChange: 'none', randomSeed: 39,
    });
    assert(slowUrban.success && slowUrban.actor, 'Spawn failed');

    const tel = createOvertakeTelemetry(rig, 40);
    let passedUrban = false;
    for (let i = 0; i < 120 * 16; i++) {
      const { snap } = rig.step();
      tel.sample(rig.simTime, snap);
      if (snap.z < slowUrban.actor.z - 8) passedUrban = true;
      assert(!(rig.contacts.collision?.collided), 'Collided in urban bypass');
    }
    const m = tel.summary(rig.dynamics.getSnapshot());
    assert(passedUrban, 'Must smoothly bypass slow vehicle in urban road');
    assert((m.maxTargetSpeedKmh as number) <= 41.0 && (m.maxOvertakeSpeedKmh as number) <= 43.0,
      `Urban road must NOT use 120% highway overspeed boost: maxTarget=${m.maxTargetSpeedKmh}, maxSpd=${m.maxOvertakeSpeedKmh}`);
    sdb.dispose();
    return m;
  });

  // 37. 湿路、弯道条件下超车，速度目标正确降级
  run('37-sdb-wet-curve-overtake-downgrade', '湿路弯道超车速度目标正确降级', () => {
    // 320m radius highway curve starting after 120m entry tangent so slow lead is overtaken cleanly into the curve
    const curvePts: RoadPoint[] = [{ x: 0, z: 0 }, { x: 0, z: -120 }];
    const R = 320;
    for (let s = 20; s <= 560; s += 20) {
      const theta = s / R;
      curvePts.push({ x: R * (1 - Math.cos(theta)), z: -120 - R * Math.sin(theta) });
    }
    const road = makeRoad({
      id: 'r-v32-37',
      points: curvePts,
      laneCountPerDirection: 2,
      laneWidth: 3.75,
      speedLimit: 100,
      roadType: 'highway',
    });
    const rig = createSimRig({
      network: makeNetwork([road]),
      startX: 5.625,
      startZ: -20,
      startSpeed: 76 / 3.6,
      destination: { roadId: 'r-v32-37', along: 600, x: curvePts[curvePts.length - 1]!.x, z: curvePts[curvePts.length - 1]!.z, direction: 'forward' },
      useScenarioDebugger: true,
      roadGripMultiplier: 0.72,
      wetness: 0.65,
      visibilityFactor: 0.65,
    });
    const sdb = rig.scenarioDebugger!;
    sdb.spawn({
      id: 'wet-slow', type: 'vehicle', motionMode: 'dynamic', positionMode: 'road-relative',
      forwardDistanceM: 48, laneOffset: 0, lateralOffsetM: 0, speedKmh: 45, targetSpeedKmh: 45,
      behavior: 'constant', behaviorDelayS: 0, targetLaneChange: 'none', randomSeed: 40,
    });

    const tel = createOvertakeTelemetry(rig, 100);
    for (let i = 0; i < 120 * 10; i++) {
      const { snap } = rig.step();
      tel.sample(rig.simTime, snap);
      assert(!(rig.contacts.collision?.collided), 'Collided on wet curve');
    }
    const m = tel.summary(rig.dynamics.getSnapshot());
    assert((m.lcDecisionTimeS as number) >= 0, 'Must detect slow lead and initiate overtake into wet curve');
    assert((m.maxTargetSpeedKmh as number) <= 86.0,
      `Wet & curved highway must downgrade target speed cleanly (expected <= 86 km/h, got ${m.maxTargetSpeedKmh} km/h)`);
    sdb.dispose();
    return m;
  });

  // 38. 超车完成后的加速恢复与正常巡航衔接
  run('38-sdb-post-overtake-smooth-recovery', '超车完成后平滑加速恢复正常巡航', () => {
    const road = makeRoad({
      id: 'r-v32-38',
      points: [{ x: 0, z: 0 }, { x: 0, z: -1300 }],
      laneCountPerDirection: 2,
      laneWidth: 3.75,
      speedLimit: 100,
      roadType: 'highway',
    });
    const rig = createSimRig({
      network: makeNetwork([road]),
      startX: 5.625,
      startZ: -80,
      startSpeed: 98 / 3.6,
      destination: { roadId: 'r-v32-38', along: 1250, x: 5.625, z: -1250, direction: 'forward' },
      useScenarioDebugger: true,
    });
    const sdb = rig.scenarioDebugger!;
    sdb.spawn({
      id: 'slow-lead', type: 'vehicle', motionMode: 'dynamic', positionMode: 'road-relative',
      forwardDistanceM: 60, laneOffset: 0, lateralOffsetM: 0, speedKmh: 55, targetSpeedKmh: 55,
      behavior: 'constant', behaviorDelayS: 0, targetLaneChange: 'none', randomSeed: 41,
    });
    // Temporarily occupy passing lane so ego decelerates briefly before overtaking, then opens up
    sdb.spawn({
      id: 'passing-clearer', type: 'vehicle', motionMode: 'dynamic', positionMode: 'road-relative',
      forwardDistanceM: -18, laneOffset: -1, lateralOffsetM: 0, speedKmh: 138, targetSpeedKmh: 138,
      behavior: 'constant', behaviorDelayS: 0, targetLaneChange: 'none', randomSeed: 42,
    });

    const tel = createOvertakeTelemetry(rig, 100);
    for (let i = 0; i < 120 * 22; i++) {
      const { snap } = rig.step();
      tel.sample(rig.simTime, snap);
      assert(!(rig.contacts.collision?.collided), 'Collided during overtake recovery');
    }
    const m = tel.summary(rig.dynamics.getSnapshot());
    assert(Math.abs((m.finalTargetSpeedKmh as number) - 100) <= 2.0,
      `After overtaking completes, target speed must recover to 100 km/h cruise limit, got ${m.finalTargetSpeedKmh}`);
    assert(Math.abs((m.finalSpeedKmh as number) - 100) <= 6.0,
      `After overtaking completes, ego speed must smoothly stabilize near 100 km/h, got ${m.finalSpeedKmh}`);
    assert((m.maxAccelMps2 as number) <= 2.8, `Recovery acceleration must be smooth (<= 2.8), got ${m.maxAccelMps2}`);
    assert((m.maxRecoveryJerkMps3 as number) <= 5.0, `Recovery jerk must be bounded (<= 5.0), got ${m.maxRecoveryJerkMps3}`);
    sdb.dispose();
    return m;
  });

  // Helper: V3.3 full steering / curvature / kinematics / brake-attribution / continuity telemetry
  function createV33Telemetry(rig: SimRig, actors: readonly TrafficActorSnapshot[] = []) {
    let maxSteerDeg = 0;
    let maxSteerRateDegPerS = 0;
    let prevSteerDeg = 0;
    let hasPrevSteer = false;
    let maxPlannedCurvature = 0;
    let maxCurvatureDelta = 0;
    let maxAccelMps2 = 0;
    let maxBrakeDecelMps2 = 0;
    let maxJerkMps3 = 0;
    let prevDesiredAccel = 0;
    let hasPrevAccel = false;
    let minSpeedKmh = Infinity;
    let maxSpeedKmh = 0;
    let minTargetEnvelopeGapM = Infinity;
    let lcStartTimeS = -1;
    let signalStartTimeS = -1;
    let unattributedBrakes = 0;
    let stopBlockedJunctionCount = 0;
    let sectionSnapReversions = 0;
    let highestSectionIdx = -1;
    const brakeSourceSet = new Set<string>();

    const sample = (t: number, snap: ReturnType<VehicleDynamics<Powertrain>['getSnapshot']>, dynamicActors: readonly TrafficActorSnapshot[] = actors) => {
      const st = rig.adas.status;
      const plan = rig.adas.planner.snapshot;
      const obs = rig.adas.obstacleAvoidance.assessment;
      const spdKmh = snap.speed * 3.6;
      minSpeedKmh = Math.min(minSpeedKmh, spdKmh);
      maxSpeedKmh = Math.max(maxSpeedKmh, spdKmh);

      const steerDeg = (snap.steeringAngle * 180) / Math.PI;
      maxSteerDeg = Math.max(maxSteerDeg, Math.abs(steerDeg));
      if (hasPrevSteer) {
        const rate = Math.abs(steerDeg - prevSteerDeg) / FIXED_DT;
        maxSteerRateDegPerS = Math.max(maxSteerRateDegPerS, rate);
      }
      prevSteerDeg = steerDeg;
      hasPrevSteer = true;

      if (plan.valid && plan.sampleCount >= 2) {
        const egoS = plan.egoS;
        let prevK = plan.samples[Math.max(0, plan.egoSampleIndex)]!.curvature;
        for (let i = Math.max(0, plan.egoSampleIndex); i < plan.sampleCount; i++) {
          const sp = plan.samples[i]!;
          if (sp.s - egoS > 90) break;
          maxPlannedCurvature = Math.max(maxPlannedCurvature, Math.abs(sp.curvature));
          maxCurvatureDelta = Math.max(maxCurvatureDelta, Math.abs(sp.curvature - prevK));
          prevK = sp.curvature;
        }
        const curSecIdx = plan.samples[Math.max(0, plan.egoSampleIndex)]!.sectionIndex;
        if (curSecIdx < highestSectionIdx) sectionSnapReversions++;
        if (curSecIdx > highestSectionIdx) highestSectionIdx = curSecIdx;
      }

      if (snap.acceleration > maxAccelMps2) maxAccelMps2 = snap.acceleration;
      if ((snap.brake > 0.02 || rig.adas.speedController.command.brake > 0.02) && snap.acceleration < -maxBrakeDecelMps2) {
        maxBrakeDecelMps2 = -snap.acceleration;
      }
      const desiredAccel = rig.adas.speedController.command.desiredAccelMps2;
      if (hasPrevAccel) {
        const j = Math.abs(desiredAccel - prevDesiredAccel) / FIXED_DT;
        if (j > maxJerkMps3 && !obs.emergencyBraking) maxJerkMps3 = j;
      }
      prevDesiredAccel = desiredAccel;
      hasPrevAccel = true;

      if (signalStartTimeS < 0 && (st.desiredTurnSignal !== null || rig.lights.state.leftTurnSignal || rig.lights.state.rightTurnSignal)) {
        signalStartTimeS = t;
      }
      if (lcStartTimeS < 0 && plan.laneChange.active && plan.laneChange.phase === 'executing') {
        lcStartTimeS = t;
      }

      const ba = st.brakeAttribution;
      if (ba?.active && ba.source !== 'NONE') {
        brakeSourceSet.add(ba.source);
        if (ba.source === 'UNATTRIBUTED_BRAKE') unattributedBrakes++;
      }
      if (rig.adas.trafficRules.decision.signalDecision === 'STOP_BLOCKED_JUNCTION') {
        stopBlockedJunctionCount++;
      }

      const egoHalfW = rig.dims.width * 0.5;
      const egoHalfL = rig.dims.length * 0.5;
      for (const a of dynamicActors) {
        const dx = Math.abs(snap.x - a.x) - egoHalfW - a.width * 0.5;
        const dz = Math.abs(snap.z - a.z) - egoHalfL - a.length * 0.5;
        const dist = Math.hypot(Math.max(0, dx), Math.max(0, dz));
        minTargetEnvelopeGapM = Math.min(minTargetEnvelopeGapM, dist);
      }
      if (obs.hasLeadActor && Number.isFinite(obs.leadGapM)) {
        minTargetEnvelopeGapM = Math.min(minTargetEnvelopeGapM, Math.max(0, obs.leadGapM));
      }
    };

    const summary = () => ({
      maxSteerDeg: +maxSteerDeg.toFixed(2),
      maxSteerRateDegPerS: +maxSteerRateDegPerS.toFixed(1),
      maxPlannedCurvature: +maxPlannedCurvature.toFixed(4),
      maxCurvatureDelta: +maxCurvatureDelta.toFixed(4),
      minSpeedKmh: +minSpeedKmh.toFixed(1),
      maxSpeedKmh: +maxSpeedKmh.toFixed(1),
      maxAccelMps2: +maxAccelMps2.toFixed(2),
      maxBrakeDecelMps2: +maxBrakeDecelMps2.toFixed(2),
      maxJerkMps3: +maxJerkMps3.toFixed(2),
      signalLeadS: signalStartTimeS >= 0 && lcStartTimeS >= 0 ? +(lcStartTimeS - signalStartTimeS).toFixed(2) : -1,
      brakeSources: brakeSourceSet.size > 0 ? Array.from(brakeSourceSet).join(',') : 'NONE',
      unattributedBrakes,
      stopBlockedJunctionCount,
      minTargetEnvelopeGapM: Number.isFinite(minTargetEnvelopeGapM) ? +minTargetEnvelopeGapM.toFixed(2) : -1,
      sectionSnapReversions,
    });

    return { sample, summary, getSignalStart: () => signalStartTimeS, getLcStart: () => lcStartTimeS };
  }

  // Helper: build a smooth curved exit ramp connected end-to-start to a 3-lane one-way highway
  function makeHighwayRampExitNetwork(options: { mainlineSpeedKmh?: number; rampSpeedKmh?: number } = {}) {
    const mainlineLimit = options.mainlineSpeedKmh ?? 120;
    const rampLimit = options.rampSpeedKmh ?? 40;
    const hwPts: RoadPoint[] = [
      { x: 0, z: 0 },
      { x: 0, z: -450 },
      { x: 0, z: -900 },
    ];
    const hw = makeRoad({
      id: 'hw-main-out',
      name: '沪杭高速主线',
      points: hwPts,
      laneCountPerDirection: 3,
      laneWidth: 3.75,
      travelDirection: 'forward',
      speedLimit: mainlineLimit,
      roadType: 'highway',
    });
    // Zero-gap tangential connection at (0, -900), smoothly curving right over 320m
    const rampPts: RoadPoint[] = [];
    const rampLen = 320;
    const rCurve = 240;
    for (let s = 0; s <= rampLen; s += 16) {
      const theta = s / rCurve;
      rampPts.push({
        x: rCurve * (1 - Math.cos(theta)),
        z: -900 - rCurve * Math.sin(theta),
      });
    }
    const ramp = makeRoad({
      id: 'hw-exit-ramp',
      name: '出口匝道',
      points: rampPts,
      laneCountPerDirection: 1,
      laneWidth: 3.75,
      travelDirection: 'forward',
      speedLimit: rampLimit,
      roadType: 'ramp',
    });
    const connections: RoadRoutingConnection[] = [
      { fromRoadId: hw.id, fromEnd: 'end', toRoadId: ramp.id, toEnd: 'start' },
    ];
    const endRamp = rampPts[rampPts.length - 1]!;
    return { network: makeNetwork([hw, ramp], connections), hw, ramp, endRamp };
  }

  // 39. 高速 120 km/h 接近出口匝道提前变至最右车道
  run('39-v33-highway-120kmh-exit-early-right-lc', '高速 120km/h 接近出口匝道提前变至最右车道', () => {
    const { network, ramp, endRamp } = makeHighwayRampExitNetwork({ mainlineSpeedKmh: 120, rampSpeedKmh: 40 });
    const rig = createSimRig({
      network,
      startX: -3.75, // lane 0 (leftmost overtaking lane) on 1-way 3-lane highway (-3.75, 0, +3.75)
      startZ: -80,
      startSpeed: 118 / 3.6,
      destination: { roadId: ramp.id, along: ramp.length - 25, x: endRamp.x, z: endRamp.z, direction: 'forward' },
    });
    const tel = createV33Telemetry(rig);
    let lcStartDistBeforeExit = -1;
    let firstRightSignalDistBeforeExit = -1;
    let reachedRightLaneBeforeExit = false;

    for (let i = 0; i < 120 * 36; i++) {
      const { snap, state } = rig.step();
      tel.sample(rig.simTime, snap);
      assert(!(rig.contacts.collision?.collided), 'Collided in 120km/h exit early LC');
      const p = rig.adas.planner.snapshot;
      const distToExit = 900 + snap.z;
      if (firstRightSignalDistBeforeExit < 0 && (p.desiredTurnSignal === 'right' || rig.lights.state.rightTurnSignal)) {
        firstRightSignalDistBeforeExit = distToExit;
      }
      if (lcStartDistBeforeExit < 0 && (state === 'LANE_CHANGING' || p.laneChange.phase === 'executing')) {
        lcStartDistBeforeExit = distToExit;
      }
      if (snap.z > -895 && p.currentApproachLaneIndex === 2 && snap.x > 3.1) {
        reachedRightLaneBeforeExit = true;
      }
      if (snap.z < -980) break;
    }
    const m = tel.summary();
    const fp = rig.adas.planner.snapshot;
    const fSnap = rig.dynamics.getSnapshot();
    assert(
      reachedRightLaneBeforeExit,
      `Vehicle must reach rightmost exit lane (lane 2) BEFORE ramp mouth at z=-900 (end x=${fSnap.x.toFixed(2)}, z=${fSnap.z.toFixed(1)}, lane=${fp.currentApproachLaneIndex}/${fp.currentApproachLaneCount}, lcDist=${lcStartDistBeforeExit.toFixed(1)}, sigDist=${firstRightSignalDistBeforeExit.toFixed(1)}, jValid=${fp.upcomingJunction.valid}, jDir=${fp.upcomingJunction.turnDirection})`,
    );
    assert(lcStartDistBeforeExit > 180, `Lane change toward exit started too late: dist=${lcStartDistBeforeExit.toFixed(1)}m`);
    assert(firstRightSignalDistBeforeExit >= lcStartDistBeforeExit, 'Right turn signal must lead lateral lane change');
    assert(m.unattributedBrakes === 0, `Unexpected UNATTRIBUTED_BRAKE on exit approach: ${m.unattributedBrakes}`);
    return {
      ...m,
      lcStartDistBeforeExitM: +lcStartDistBeforeExit.toFixed(1),
      firstSignalDistM: +firstRightSignalDistBeforeExit.toFixed(1),
    };
  });

  // 40. 高速主线保持巡航速度，进入减速区才平顺降至匝道限速（禁止提前降至 23.4 km/h）
  run('40-v33-mainline-hold-cruise-until-decel-zone', '高速主线保持巡航不提前误降速且入减速区平顺减速', () => {
    const { network, ramp, endRamp } = makeHighwayRampExitNetwork({ mainlineSpeedKmh: 120, rampSpeedKmh: 40 });
    const rig = createSimRig({
      network,
      startX: 3.75, // already in rightmost exit lane
      startZ: -120,
      startSpeed: 118 / 3.6,
      destination: { roadId: ramp.id, along: ramp.length - 25, x: endRamp.x, z: endRamp.z, direction: 'forward' },
    });
    const tel = createV33Telemetry(rig);
    let minMainlineTargetBefore240m = Infinity;
    let minMainlineSpeedBefore240m = Infinity;
    let enteredRampSpeedKmh = -1;
    let minOverallSpeedOnApproach = Infinity;

    for (let i = 0; i < 120 * 32; i++) {
      const { snap } = rig.step();
      tel.sample(rig.simTime, snap);
      const distToRamp = 900 + snap.z;
      if (distToRamp > 240 && snap.z < -150) {
        minMainlineTargetBefore240m = Math.min(minMainlineTargetBefore240m, rig.adas.status.targetSpeedKmh);
        minMainlineSpeedBefore240m = Math.min(minMainlineSpeedBefore240m, snap.speed * 3.6);
      }
      if (snap.z > -935) {
        minOverallSpeedOnApproach = Math.min(minOverallSpeedOnApproach, snap.speed * 3.6);
      }
      if (enteredRampSpeedKmh < 0 && snap.z <= -910) {
        enteredRampSpeedKmh = snap.speed * 3.6;
      }
    }
    const m = tel.summary();
    assert(
      minMainlineTargetBefore240m >= 114,
      `Mainline target speed must hold >=114 km/h at >240m before ramp (got ${minMainlineTargetBefore240m.toFixed(1)} km/h)`,
    );
    assert(
      minMainlineSpeedBefore240m >= 106,
      `Mainline actual speed dropped prematurely before decel zone: ${minMainlineSpeedBefore240m.toFixed(1)} km/h`,
    );
    assert(
      minOverallSpeedOnApproach >= 34,
      `Fake 23.4 km/h urban turn cap must NOT fire on ramp exit approach! min=${minOverallSpeedOnApproach.toFixed(1)} km/h`,
    );
    assert(m.maxBrakeDecelMps2 <= 4.0, `Ramp decel must remain comfortable <=4.0 m/s^2, got ${m.maxBrakeDecelMps2}`);
    assert(m.unattributedBrakes === 0, `Unexpected UNATTRIBUTED_BRAKE count: ${m.unattributedBrakes}`);
    return {
      ...m,
      minMainlineTargetBefore240mKmh: +minMainlineTargetBefore240m.toFixed(1),
      minMainlineSpeedBefore240mKmh: +minMainlineSpeedBefore240m.toFixed(1),
      enteredRampSpeedKmh: +enteredRampSpeedKmh.toFixed(1),
    };
  });

  // 41. 驶出高速匝道连续轨迹与转向平顺性（消除直角折线与反复反打方向）
  run('41-v33-ramp-exit-continuous-no-right-angle', '驶出高速匝道轨迹连续无直角折线或反复反打', () => {
    const { network, ramp, endRamp } = makeHighwayRampExitNetwork({ mainlineSpeedKmh: 100, rampSpeedKmh: 40 });
    const rig = createSimRig({
      network,
      startX: 3.75, // lane 2 exit lane at z=-680
      startZ: -680,
      startSpeed: 95 / 3.6,
      destination: { roadId: ramp.id, along: ramp.length - 30, x: endRamp.x, z: endRamp.z, direction: 'forward' },
    });
    const tel = createV33Telemetry(rig);
    let sawExitSignal = false;
    let maxSeamLatErr = 0;
    let steerSignReversalsNearSeam = 0;
    let prevSign = 0;

    for (let i = 0; i < 120 * 24; i++) {
      const { snap } = rig.step();
      tel.sample(rig.simTime, snap);
      const p = rig.adas.planner.snapshot;
      if (p.desiredTurnSignal === 'right' || rig.lights.state.rightTurnSignal) sawExitSignal = true;
      if (snap.z < -860 && snap.z > -980) {
        maxSeamLatErr = Math.max(maxSeamLatErr, Math.abs(p.lateralOffsetM));
        const deg = (snap.steeringAngle * 180) / Math.PI;
        if (Math.abs(deg) > 1.8) {
          const sgn = Math.sign(deg);
          if (prevSign !== 0 && sgn !== prevSign) steerSignReversalsNearSeam++;
          prevSign = sgn;
        }
      }
      if (snap.z < -1040 && snap.x > 60) break;
    }
    const m = tel.summary();
    assert(sawExitSignal, 'Right turn signal must activate cleanly for ramp exit');
    assert(m.maxPlannedCurvature < 0.08, `Seam curvature spike detected (no right-angle kink!): maxK=${m.maxPlannedCurvature}`);
    assert(steerSignReversalsNearSeam <= 1, `Steering oscillated left/right across ramp seam: reversals=${steerSignReversalsNearSeam}`);
    assert(maxSeamLatErr < 1.35, `Excessive lateral tracking error across exit seam: ${maxSeamLatErr.toFixed(2)}m`);
    assert(m.sectionSnapReversions === 0, `Section index snapped backward across seam: ${m.sectionSnapReversions}`);
    return { ...m, maxSeamLatErrM: +maxSeamLatErr.toFixed(3), steerSignReversalsNearSeam };
  });

  // 42. 从单车道匝道平滑合流至三车道高速主线最右侧车道（禁止跳变至最左侧车道）
  run('42-v33-ramp-merge-mainline-continuous', '匝道合流进入高速主线最右侧车道且连续转向平顺', () => {
    const mergeRamp = makeRoad({
      id: 'hw-entry-ramp',
      name: '入口匝道',
      points: [{ x: 0, z: 0 }, { x: 0, z: -220 }],
      laneCountPerDirection: 1,
      laneWidth: 3.75,
      travelDirection: 'forward',
      speedLimit: 40,
      roadType: 'ramp',
    });
    const hwDest = makeRoad({
      id: 'hw-main-merge',
      name: '高速合流主线',
      points: [{ x: 0, z: -220 }, { x: 0, z: -900 }],
      laneCountPerDirection: 3,
      laneWidth: 3.75,
      travelDirection: 'forward',
      speedLimit: 100,
      roadType: 'highway',
    });
    const network = makeNetwork([mergeRamp, hwDest], [
      { fromRoadId: mergeRamp.id, fromEnd: 'end', toRoadId: hwDest.id, toEnd: 'start' },
    ]);
    const rig = createSimRig({
      network,
      startX: 0,
      startZ: -30,
      startSpeed: 38 / 3.6,
      destination: { roadId: hwDest.id, along: 640, x: 3.75, z: -860, direction: 'forward' },
    });
    const tel = createV33Telemetry(rig);
    let sawMergeSignal = false;
    let mergedLaneIdx = -1;
    let postMergeSpeedKmh = 0;

    for (let i = 0; i < 120 * 36; i++) {
      const { snap } = rig.step();
      tel.sample(rig.simTime, snap);
      const p = rig.adas.planner.snapshot;
      if (p.desiredTurnSignal === 'left' || rig.lights.state.leftTurnSignal) sawMergeSignal = true;
      if (snap.z < -265 && mergedLaneIdx < 0 && p.currentRoadId === hwDest.id) {
        mergedLaneIdx = p.currentApproachLaneIndex;
      }
      if (snap.z < -550) {
        postMergeSpeedKmh = snap.speed * 3.6;
        break;
      }
    }
    const m = tel.summary();
    assert(sawMergeSignal, 'Left merge turn signal must activate before/during ramp-to-mainline merge');
    assert(mergedLaneIdx === 2, `Ramp merge must enter rightmost mainline lane (index 2), got lane ${mergedLaneIdx}`);
    assert(m.maxPlannedCurvature < 0.08, `Merge trajectory curvature kink detected: maxK=${m.maxPlannedCurvature}`);
    assert(postMergeSpeedKmh >= 78, `Vehicle failed to accelerate cleanly onto mainline cruise speed: ${postMergeSpeedKmh.toFixed(1)} km/h`);
    assert(m.sectionSnapReversions === 0, `Mainline<->ramp snapping occurred: ${m.sectionSnapReversions}`);
    return { ...m, mergedLaneIdx, postMergeSpeedKmh: +postMergeSpeedKmh.toFixed(1) };
  });

  // 43. 匝道旁路侧交通标志杆/导向板/桥墩不误触刹车 + 真侵入柱体准确识别
  run('43-v33-ramp-roadside-signs-poles-piers', '匝道路侧标牌立柱护墙不误触发幽灵制动且真侵入柱体可识别', () => {
    const ramp = makeRoad({
      id: 'ramp-signs',
      name: '弯道匝道',
      points: [
        { x: 0, z: 0 },
        { x: 0, z: -120 },
        { x: 18, z: -240 },
        { x: 54, z: -340 },
      ],
      laneCountPerDirection: 1,
      laneWidth: 3.75,
      travelDirection: 'forward',
      speedLimit: 40,
      roadType: 'ramp',
    });
    // Place rotated chevron guide boards, sign posts, piers and walls cleanly outside the 3.75m drivable lane
    const roadsideColliders: StaticCollider[] = [
      createStaticOBBCollider({ id: 'ramp-signs:post:1', x: 3.05, z: -70, width: 0.44, length: 0.44, minHeight: 0, maxHeight: 3.2, yaw: 0.25, type: 'obstacle' }),
      createStaticOBBCollider({ id: 'ramp-signs:board:1', x: 3.35, z: -125, width: 1.8, length: 0.36, minHeight: 1.35, maxHeight: 2.35, yaw: 0.35, type: 'obstacle' }),
      createStaticOBBCollider({ id: 'ramp-signs:pier:1', x: -3.25, z: -165, width: 1.1, length: 1.1, minHeight: 0, maxHeight: 5.0, yaw: 0.12, type: 'obstacle' }),
      createStaticOBBCollider({ id: 'ramp-signs:wall:1', x: 15.2, z: -220, width: 0.5, length: 9.0, minHeight: 0, maxHeight: 1.1, yaw: -0.22, type: 'obstacle' }),
    ];
    const rigClean = createSimRig({
      network: makeNetwork([ramp]),
      colliders: roadsideColliders,
      startX: 0,
      startZ: -15,
      startSpeed: 38 / 3.6,
      destination: { roadId: ramp.id, along: ramp.length - 20, x: 54, z: -325, direction: 'forward' },
    });
    const telClean = createV33Telemetry(rigClean);
    for (let i = 0; i < 120 * 18; i++) {
      const { snap } = rigClean.step();
      telClean.sample(rigClean.simTime, snap);
      if (snap.z < -265) break;
    }
    const mClean = telClean.summary();
    assert(mClean.minSpeedKmh >= 30, `Roadside sign/board/pier caused ghost decel on ramp: minSpeed=${mClean.minSpeedKmh} km/h`);
    assert(
      !String(mClean.brakeSources).includes('INFRASTRUCTURE_COLLIDER') && mClean.unattributedBrakes === 0,
      `Roadside fixtures falsely attributed as brake targets: ${mClean.brakeSources}`,
    );

    // Now test an actual intruding pier inside the drivable lane -> MUST detect INFRASTRUCTURE_COLLIDER and stop!
    const intrudingPier = createStaticOBBCollider({
      id: 'ramp-signs:pier:intruder',
      x: 0.65,
      z: -105,
      width: 1.0,
      length: 1.0,
      minHeight: 0,
      maxHeight: 4.0,
      yaw: 0.2,
      type: 'obstacle',
    });
    const rigBlocked = createSimRig({
      network: makeNetwork([ramp]),
      colliders: [...roadsideColliders, intrudingPier],
      startX: 0,
      startZ: -20,
      startSpeed: 38 / 3.6,
      destination: { roadId: ramp.id, along: ramp.length - 20, x: 54, z: -325, direction: 'forward' },
    });
    const telBlocked = createV33Telemetry(rigBlocked);
    let stoppedCleanly = false;
    for (let i = 0; i < 120 * 12; i++) {
      const { snap } = rigBlocked.step();
      telBlocked.sample(rigBlocked.simTime, snap);
      assert(snap.z > -102.5, `Collided into intruding pier! z=${snap.z.toFixed(2)}`);
      if (snap.speed < 0.35 && snap.z > -103) stoppedCleanly = true;
    }
    const mBlocked = telBlocked.summary();
    assert(stoppedCleanly, 'Must detect and stop before pier genuinely intruding into drivable lane');
    assert(
      String(mBlocked.brakeSources).includes('INFRASTRUCTURE_COLLIDER'),
      `Expected INFRASTRUCTURE_COLLIDER brake attribution, got ${mBlocked.brakeSources}`,
    );
    return {
      cleanMinSpeedKmh: mClean.minSpeedKmh,
      cleanBrakeSources: mClean.brakeSources,
      blockedSources: mBlocked.brakeSources,
    };
  });

  // 44. 空旷弯道匝道与合流连接无幽灵制动、无误报路口堵塞、无反复切换吸附
  run('44-v33-empty-ramp-no-ghost-stop', '空旷匝道全程零幽灵制动、零误报路口堵塞与零段跳吸附', () => {
    const hwIn = makeRoad({
      id: 'hw-e44-in', points: [{ x: 0, z: 0 }, { x: 0, z: -260 }], laneCountPerDirection: 3, laneWidth: 3.75, travelDirection: 'forward', speedLimit: 100, roadType: 'highway',
    });
    const rampMid = makeRoad({
      id: 'ramp-e44-mid', points: [{ x: 0, z: -260 }, { x: 0, z: -420 }, { x: 25, z: -560 }], laneCountPerDirection: 1, laneWidth: 3.75, travelDirection: 'forward', speedLimit: 40, roadType: 'ramp',
    });
    const hwOut = makeRoad({
      id: 'hw-e44-out', points: [{ x: 25, z: -560 }, { x: 60, z: -760 }], laneCountPerDirection: 3, laneWidth: 3.75, travelDirection: 'forward', speedLimit: 100, roadType: 'highway',
    });
    const net = makeNetwork([hwIn, rampMid, hwOut], [
      { fromRoadId: hwIn.id, fromEnd: 'end', toRoadId: rampMid.id, toEnd: 'start' },
      { fromRoadId: rampMid.id, fromEnd: 'end', toRoadId: hwOut.id, toEnd: 'start' },
    ]);
    const rig = createSimRig({
      network: net,
      startX: 3.75,
      startZ: -30,
      startSpeed: 95 / 3.6,
      destination: { roadId: hwOut.id, along: 190, x: 56, z: -740, direction: 'forward' },
    });
    const tel = createV33Telemetry(rig);
    let minRampSpeed = Infinity;
    for (let i = 0; i < 120 * 48; i++) {
      const { snap } = rig.step();
      tel.sample(rig.simTime, snap);
      if (snap.z < -265 && snap.z > -555) {
        minRampSpeed = Math.min(minRampSpeed, snap.speed * 3.6);
      }
      if (snap.z < -700) break;
    }
    const m = tel.summary();
    assert(m.stopBlockedJunctionCount === 0, `Empty ramp triggered ghost STOP_BLOCKED_JUNCTION (${m.stopBlockedJunctionCount}x)`);
    assert(m.unattributedBrakes === 0, `Empty ramp logged UNATTRIBUTED_BRAKE (${m.unattributedBrakes}x)`);
    assert(m.sectionSnapReversions === 0, `Empty ramp snapped backward between sections (${m.sectionSnapReversions}x)`);
    assert(minRampSpeed >= 30, `Empty ramp experienced ghost slow-down/stop: minRampSpeed=${minRampSpeed.toFixed(1)} km/h`);
    return { ...m, minRampSpeedKmh: +minRampSpeed.toFixed(1) };
  });

  // 45. 前方静态障碍物：提前打灯、平稳绕行不急刹停车
  run('45-v33-proactive-static-avoidance', '高速遇静态障碍物前瞻提前打灯平滑绕行且不触发急刹', () => {
    const road = makeRoad({
      id: 'r-v33-45', points: [{ x: 0, z: 0 }, { x: 0, z: -900 }], laneCountPerDirection: 2, laneWidth: 3.75, speedLimit: 110, roadType: 'highway',
    });
    const obs = makeActor({ id: 'stalled-car', kind: 'static-obstacle', x: 5.625, z: -210, speed: 0, length: 4.8, width: 2.0 });
    const rig = createSimRig({
      network: makeNetwork([road]),
      startX: 5.625,
      startZ: -30,
      startSpeed: 108 / 3.6,
      destination: { roadId: road.id, along: 850, x: 5.625, z: -850, direction: 'forward' },
      actors: [obs],
    });
    const tel = createV33Telemetry(rig, [obs]);
    let signalDist = -1;
    let sawAeb = false;
    let passed = false;

    for (let i = 0; i < 120 * 14; i++) {
      const { snap, state } = rig.step();
      tel.sample(rig.simTime, snap);
      assert(!checkActorCollision(snap, rig.dims, obs), 'Collided with stalled car');
      if (rig.adas.obstacleAvoidance.assessment.emergencyBraking || state === 'EMERGENCY_BRAKING') sawAeb = true;
      if (signalDist < 0 && (rig.adas.status.desiredTurnSignal === 'left' || rig.lights.state.leftTurnSignal)) {
        signalDist = snap.z - obs.z;
      }
      if (snap.z < obs.z - 25 && snap.x < 3.6) passed = true;
    }
    const m = tel.summary();
    assert(passed, 'Failed to bypass static car smoothly into left lane');
    assert(!sawAeb, 'Must NOT trigger AEB when adjacent lane is open ahead');
    assert(signalDist > 75, `Avoidance signal too late: dist=${signalDist.toFixed(1)}m`);
    assert(m.minSpeedKmh >= 85, `Avoidance braked unnecessarily before clear lane bypass: minSpeed=${m.minSpeedKmh} km/h`);
    return { ...m, signalDistM: +signalDist.toFixed(1), sawAeb };
  });

  // 46. 动态前车基于 predictedTrajectory 向左移动时阻塞左变道并安全择右或跟车
  run('46-v33-dynamic-lead-moving-left-predicted-traj', '基于predictedTrajectory预测左移前车未来占用走廊并阻塞左变道', () => {
    const road = makeRoad({
      id: 'r-v33-46', points: [{ x: 0, z: 0 }, { x: 0, z: -900 }], laneCountPerDirection: 3, laneWidth: 3.75, speedLimit: 100, roadType: 'highway',
    });
    // Middle lane forward = index 1 (center x = +5.625; lane0 = +1.875; lane2 = +9.375)
    const leadMovingLeft = makeActor({
      id: 'lead-traj-left',
      kind: 'vehicle',
      x: 5.5,
      z: -95,
      speed: 14,
      vx: -0.15, // Small instantaneous vx, BUT explicit predictedTrajectory curves firmly left into lane 0!
      vz: -14,
      predictedTrajectory: [
        { x: 5.1, y: 0, z: -102, timestamp: 0.5 },
        { x: 4.1, y: 0, z: -109, timestamp: 1.0 },
        { x: 2.5, y: 0, z: -123, timestamp: 2.0 },
        { x: 1.9, y: 0, z: -137, timestamp: 3.0 },
      ],
    });
    const rig = createSimRig({
      network: makeNetwork([road]),
      startX: 5.625,
      startZ: -25,
      startSpeed: 96 / 3.6,
      destination: { roadId: road.id, along: 850, x: 5.625, z: -850, direction: 'forward' },
      actors: [leadMovingLeft],
    });
    const tel = createV33Telemetry(rig, [leadMovingLeft]);
    let sawLeftBlockedByPred = false;
    let avoidedLeft = false;
    let passedRight = false;

    for (let i = 0; i < 120 * 10; i++) {
      leadMovingLeft.z += leadMovingLeft.vz * FIXED_DT;
      if (rig.simTime < 3.0) leadMovingLeft.x = Math.max(1.875, leadMovingLeft.x - 1.2 * FIXED_DT);
      const { snap } = rig.step();
      tel.sample(rig.simTime, snap, [leadMovingLeft]);
      const obs = rig.adas.obstacleAvoidance.assessment;
      if (rig.simTime < 1.2 && obs.leftLane.exists && !obs.leftLane.safe) sawLeftBlockedByPred = true;
      if (
        rig.adas.planner.snapshot.laneChange.active &&
        rig.adas.planner.snapshot.laneChange.direction === 'left' &&
        rig.adas.planner.snapshot.laneChange.fromLaneIndex <= 1 &&
        rig.adas.planner.snapshot.overtaking.phase !== 'returning'
      ) {
        avoidedLeft = true;
      }
      if (snap.x > 7.5 && snap.z < leadMovingLeft.z - 8) passedRight = true;
      assert(!checkActorCollision(snap, rig.dims, leadMovingLeft), 'Collided with left-moving lead vehicle');
    }
    const m = tel.summary();
    assert(sawLeftBlockedByPred, 'Explicit predictedTrajectory entering left corridor must block left lane change');
    assert(!avoidedLeft, 'Must NEVER initiate left lane change toward left-cutting lead trajectory');
    assert(passedRight, 'Should cleanly bypass via safe right lane');
    return { ...m, sawLeftBlockedByPred, passedRight };
  });

  // 47. 邻道后方高速车辆接近时拒绝危险变道、保持跟车后再安全变道
  run('47-v33-fast-rear-wait-then-bypass', '邻道后方高速接近时等待安全间隙通过后再完成变道超车', () => {
    const road = makeRoad({
      id: 'r-v33-47', points: [{ x: 0, z: 0 }, { x: 0, z: -1200 }], laneCountPerDirection: 2, laneWidth: 3.75, speedLimit: 110, roadType: 'highway',
    });
    const slowLead = makeActor({ id: 'slow-47', kind: 'vehicle', x: 5.625, z: -105, speed: 16 });
    const fastRear = makeActor({ id: 'fast-rear-47', kind: 'vehicle', x: 1.875, z: 0, speed: 40 });
    const rig = createSimRig({
      network: makeNetwork([road]),
      startX: 5.625,
      startZ: -35,
      startSpeed: 108 / 3.6,
      destination: { roadId: road.id, along: 1150, x: 5.625, z: -1150, direction: 'forward' },
      actors: [slowLead, fastRear],
    });
    const tel = createV33Telemetry(rig, [slowLead, fastRear]);
    let waitedWhileRearClosing = true;
    let passedSlowAfterClear = false;

    for (let i = 0; i < 120 * 16; i++) {
      slowLead.z -= slowLead.speed * FIXED_DT;
      fastRear.z -= fastRear.speed * FIXED_DT;
      const { snap } = rig.step();
      tel.sample(rig.simTime, snap, [slowLead, fastRear]);
      assert(!checkActorCollision(snap, rig.dims, fastRear), 'Collided with fast rear vehicle in left lane');
      assert(!checkActorCollision(snap, rig.dims, slowLead), 'Collided with slow lead vehicle');
      // While fastRear is still behind or abreast of ego, ego must not cut left in front of it
      if (fastRear.z > snap.z - 8 && snap.x < 3.7) {
        waitedWhileRearClosing = false;
      }
      if (snap.z < slowLead.z - 12) passedSlowAfterClear = true;
    }
    const m = tel.summary();
    assert(waitedWhileRearClosing, 'Must wait in origin lane while fast rear vehicle closes on left lane');
    assert(passedSlowAfterClear, 'Must overtake slow lead cleanly once fast rear vehicle clears ahead');
    assert((m.minTargetEnvelopeGapM as number) > 1.2, `Adjacent-lane passing envelope clearance too close: ${m.minTargetEnvelopeGapM}m`);
    return { ...m, waitedWhileRearClosing, passedSlowAfterClear };
  });

  // 48. 完全阻塞安全停车 + 安全验证实线应急绕行（绝不跨中央隔离带或路缘）
  run('48-v33-blocked-vs-solid-emergency-bypass', '完全阻塞安全停车且安全验证的实线应急绕行不跨隔离带', () => {
    // 48a: Fully blocked 2-lane two-way highway (obs in right lane, stalled blocker in left lane + median to left)
    const blockedRoad = makeRoad({
      id: 'r-v33-48a', points: [{ x: 0, z: 0 }, { x: 0, z: -300 }], laneCountPerDirection: 2, laneWidth: 3.5, speedLimit: 60, roadType: 'urban',
    });
    const blkA = makeActor({ id: 'blk-right', kind: 'static-obstacle', x: 5.25, z: -105, speed: 0, length: 4.5, width: 2.0 });
    const blkB = makeActor({ id: 'blk-left', kind: 'static-obstacle', x: 1.75, z: -105, speed: 0, length: 4.5, width: 2.0 });
    const rigFullBlocked = createSimRig({
      network: makeNetwork([blockedRoad]),
      startX: 5.25,
      startZ: -20,
      startSpeed: 55 / 3.6,
      destination: { roadId: blockedRoad.id, along: 280, x: 5.25, z: -280, direction: 'forward' },
      actors: [blkA, blkB],
    });
    let sawRoadBlocked = false;
    for (let i = 0; i < 120 * 10; i++) {
      const { snap, state } = rigFullBlocked.step();
      if (state === 'ROAD_BLOCKED' || rigFullBlocked.adas.obstacleAvoidance.assessment.roadBlocked) sawRoadBlocked = true;
      assert(snap.x > 0 && snap.x < 7.0, `Must never cross median/road-edge when blocked: x=${snap.x.toFixed(2)}`);
      assert(!checkActorCollision(snap, rigFullBlocked.dims, blkA) && !checkActorCollision(snap, rigFullBlocked.dims, blkB), 'Collided in blocked road');
    }
    assert(sawRoadBlocked && rigFullBlocked.dynamics.speed < 0.35, 'Must enter ROAD_BLOCKED and stop cleanly');

    // 48b: Pre-junction solid zone with static obstacle blocking lane 1 while lane 0 is verified clear & green
    const netSolid = makeCrossIntersectionNetwork({ speedLimit: 50, lanesPerDir: 2 });
    const sigGreen = new MockTrafficSignalProvider('j-center', 'south', ['south:lane:2', 'south:lane:3']);
    sigGreen.color = 'green';
    const stalledPreJ = makeActor({ id: 'stalled-solid-zone', kind: 'static-obstacle', x: 5.25, z: -178.0, speed: 0, length: 4.2, width: 1.9 });
    const rigBypass = createSimRig({
      network: netSolid,
      startX: 5.25,
      startZ: -154.0,
      startSpeed: 7.0,
      destination: { roadId: 'north', along: 150, x: 1.75, z: -364, direction: 'forward' },
      trafficSignals: sigGreen,
      actors: [stalledPreJ],
      adasConfig: { preJunctionSolidZoneM: 38 },
    });
    let sawAllowSolid = false;
    let bypassedPreJ = false;
    for (let i = 0; i < 120 * 16; i++) {
      const { snap } = rigBypass.step();
      if (rigBypass.adas.obstacleAvoidance.assessment.allowSolidBypass) sawAllowSolid = true;
      assert(snap.x > 0.1, `Solid bypass must NEVER cross center median: x=${snap.x.toFixed(2)}`);
      assert(!checkActorCollision(snap, rigBypass.dims, stalledPreJ), 'Collided during safety-verified solid bypass');
      if (snap.z < -210) {
        bypassedPreJ = true;
        break;
      }
    }
    const f48 = rigBypass.dynamics.getSnapshot();
    const p48 = rigBypass.adas.planner.snapshot;
    const o48 = rigBypass.adas.obstacleAvoidance.assessment;
    assert(
      sawAllowSolid && bypassedPreJ,
      `Safety-verified pre-junction solid bypass failed (sawAllowSolid=${sawAllowSolid}, bypassedPreJ=${bypassedPreJ}, x=${f48.x.toFixed(2)}, z=${f48.z.toFixed(1)}, v=${f48.speed.toFixed(2)}, gap=${o48.leadGapM.toFixed(2)}, lc=${p48.laneChange.active}:${p48.laneChange.phase}, aeb=${o48.emergencyBraking}, reason=${rigBypass.adas.status.reason})`,
    );
    return { fullBlockStopped: sawRoadBlocked, solidBypassVerified: bypassedPreJ };
  });

  // 49. 连续障碍物与多目标并发场景平滑通过
  run('49-v33-consecutive-obstacles-continuous', '连续多障碍物与多目标并发场景平滑连续通过', () => {
    const road = makeRoad({
      id: 'r-v33-49', points: [{ x: 0, z: 0 }, { x: 0, z: -1100 }], laneCountPerDirection: 2, laneWidth: 3.75, speedLimit: 100, roadType: 'highway',
    });
    const obsRight = makeActor({ id: 'obs-r-49', kind: 'static-obstacle', x: 5.625, z: -175, speed: 0, length: 4.6, width: 1.9 });
    const obsLeftFurther = makeActor({ id: 'obs-l-49', kind: 'vehicle', x: 1.875, z: -310, speed: 15, length: 4.6, width: 1.9 });
    const rig = createSimRig({
      network: makeNetwork([road]),
      startX: 5.625,
      startZ: -25,
      startSpeed: 96 / 3.6,
      destination: { roadId: road.id, along: 1050, x: 5.625, z: -1050, direction: 'forward' },
      actors: [obsRight, obsLeftFurther],
    });
    const tel = createV33Telemetry(rig, [obsRight, obsLeftFurther]);
    let passedObs1 = false;
    let passedObs2 = false;

    for (let i = 0; i < 120 * 32; i++) {
      obsLeftFurther.z -= obsLeftFurther.speed * FIXED_DT;
      const { snap } = rig.step();
      tel.sample(rig.simTime, snap, [obsRight, obsLeftFurther]);
      assert(!checkActorCollision(snap, rig.dims, obsRight), 'Collided with first obstacle');
      assert(!checkActorCollision(snap, rig.dims, obsLeftFurther), 'Collided with second obstacle');
      if (snap.z < obsRight.z - 15) passedObs1 = true;
      if (snap.z < obsLeftFurther.z - 15) {
        passedObs2 = true;
        break;
      }
    }
    const m = tel.summary();
    assert(passedObs1 && passedObs2, `Must clear both consecutive obstacles smoothly (p1=${passedObs1}, p2=${passedObs2})`);
    assert(m.unattributedBrakes === 0, `Unexpected UNATTRIBUTED_BRAKE in multi-obstacle run: ${m.unattributedBrakes}`);
    assert(m.maxJerkMps3 <= 12.0, `Longitudinal jerk spike in multi-obstacle run: ${m.maxJerkMps3}`);
    return { ...m, passedObs1, passedObs2 };
  });

  // 50. 雨天低附着弯道变道降级与安全速度保持
  run('50-v33-rain-curve-downgraded-lc-avoidance', '雨天湿滑弯道避让变道目标车速安全降级且不失控', () => {
    const pts: RoadPoint[] = [];
    const radius = 280;
    for (let s = 0; s <= 520; s += 14) {
      const th = s <= 120 ? 0 : (s - 120) / radius;
      pts.push({ x: s <= 120 ? 0 : radius * (1 - Math.cos(th)), z: s <= 120 ? -s : -120 - radius * Math.sin(th) });
    }
    const road = makeRoad({
      id: 'r-v33-50', points: pts, laneCountPerDirection: 2, laneWidth: 3.75, speedLimit: 100, roadType: 'highway',
    });
    const slowCur = makeActor({
      id: 'rain-slow-50',
      kind: 'vehicle',
      x: 5.625,
      z: -105,
      speed: 13,
      vx: 0,
      vz: -13,
    });
    const endP = pts[pts.length - 1]!;
    const rig = createSimRig({
      network: makeNetwork([road]),
      startX: 5.625,
      startZ: -20,
      startSpeed: 76 / 3.6,
      destination: { roadId: road.id, along: road.length - 20, x: endP.x, z: endP.z, direction: 'forward' },
      actors: [slowCur],
      roadGripMultiplier: 0.62,
      wetness: 0.85,
      visibilityFactor: 0.65,
    });
    const tel = createV33Telemetry(rig, [slowCur]);
    let maxTargetKmh = 0;

    for (let i = 0; i < 120 * 16; i++) {
      slowCur.z -= slowCur.speed * FIXED_DT;
      const { snap } = rig.step();
      tel.sample(rig.simTime, snap, [slowCur]);
      maxTargetKmh = Math.max(maxTargetKmh, rig.adas.status.targetSpeedKmh);
      assert(!(rig.contacts.collision?.collided), 'Collided in rain+curve scenario');
    }
    const m = tel.summary();
    assert(maxTargetKmh < 82, `Wet slippery curved highway must downgrade target speed below 82 km/h (got ${maxTargetKmh.toFixed(1)} km/h)`);
    assert(m.unattributedBrakes === 0, `Unexpected UNATTRIBUTED_BRAKE in rain+curve run: ${m.unattributedBrakes}`);
    return { ...m, maxTargetKmh: +maxTargetKmh.toFixed(1) };
  });

  // =========================================================================
  // ADAS V3.5: Driver Collaboration, Turn-Signal Intent, Free Driving & Degradation
  // =========================================================================

  // 51. Free driving (NO navigation destination): straight lane keeping, car-following, speed limit & avoidance
  run('51-v35-free-drive-straight', '无导航自由驾驶直行、跟车与避障', () => {
    const road = makeRoad({
      id: 'fd-straight',
      points: [{ x: 0, z: 0 }, { x: 0, z: -700 }],
      laneCountPerDirection: 2,
      laneWidth: 3.5,
      speedLimit: 60,
    });
    const blocker = makeActor({ id: 'fd-obs', kind: 'static-obstacle', x: 1.75, z: -155, length: 4.2, width: 1.9 });
    const rig = createSimRig({
      network: makeNetwork([road]),
      startX: 1.75,
      startZ: -20,
      startSpeed: 12,
      actors: [blocker],
    });
    let sawFreeMode = false;
    let bypassed = false;
    for (let i = 0; i < 120 * 16; i++) {
      const { snap } = rig.step();
      if (rig.adas.status.drivingMode === 'FREE_DRIVING') sawFreeMode = true;
      assert(rig.adas.isEnabled && rig.adas.currentState !== 'UNAVAILABLE', `Free drive dropped out: ${rig.adas.currentState}`);
      assert(!checkActorCollision(snap, rig.dims, blocker), 'Collided with obstacle in free drive');
      if (snap.z < -180 && snap.x > 3.5) bypassed = true;
    }
    assert(sawFreeMode, 'Expected FREE_DRIVING drivingMode without navigation');
    assert(bypassed, 'Expected autonomous lane-change avoidance around obstacle in free drive');
    return { sawFreeMode, bypassed, finalX: +rig.dynamics.x.toFixed(2), speedKmh: +(rig.dynamics.speed * 3.6).toFixed(1) };
  });

  // 52. Free driving (NO navigation): continuous S-curves curvature tracking & speed regulation
  run('52-v35-free-drive-curves', '无导航连续弯道曲率跟踪与降速', () => {
    const curvePts: RoadPoint[] = [];
    for (let k = 0; k <= 28; k++) {
      const z = -k * 22;
      const x = Math.sin(k * 0.35) * 42;
      curvePts.push({ x, z });
    }
    const road = makeRoad({
      id: 'fd-curvy',
      points: curvePts,
      laneCountPerDirection: 1,
      laneWidth: 3.75,
      travelDirection: 'forward',
      speedLimit: 80,
    });
    const rig = createSimRig({
      network: makeNetwork([road]),
      startX: 0,
      startZ: -15,
      startSpeed: 18,
    });
    let maxSteerDeg = 0;
    let minCurveSpeedKmh = Infinity;
    for (let i = 0; i < 120 * 18; i++) {
      const { snap } = rig.step();
      assert(rig.adas.status.drivingMode === 'FREE_DRIVING', 'Expected continuous FREE_DRIVING in curves');
      maxSteerDeg = Math.max(maxSteerDeg, Math.abs(snap.steeringAngle * 180 / Math.PI));
      minCurveSpeedKmh = Math.min(minCurveSpeedKmh, snap.speed * 3.6);
    }
    assert(maxSteerDeg > 4.0, 'Expected substantial steering tracking along free-drive curves');
    assert(minCurveSpeedKmh < 74, `Expected curvature speed reduction on sharp bends, got ${minCurveSpeedKmh.toFixed(1)}`);
    assert(rig.dynamics.z < -220, `Vehicle did not traverse free-drive curvy road, z=${rig.dynamics.z.toFixed(1)}`);
    return { maxSteerDeg: +maxSteerDeg.toFixed(1), minCurveSpeedKmh: +minCurveSpeedKmh.toFixed(1), finalZ: +rig.dynamics.z.toFixed(1) };
  });

  // 53. Free driving T-junction (ambiguous -> wait for blinker -> turn) & Y-fork (natural continuation)
  run('53-v35-free-drive-t-and-y-junctions', '无导航Y分叉自然延续与T字路口打灯选择', () => {
    // Part A: Y-fork -> chooses gentle natural branch (|angle| ~ 0.35) without blinker
    const stem = makeRoad({ id: 'y-stem', points: [{ x: 0, z: 0 }, { x: 0, z: -120 }], laneCountPerDirection: 1, travelDirection: 'forward', speedLimit: 50 });
    const branchNatural = makeRoad({ id: 'y-main', points: [{ x: 4, z: -138 }, { x: 42, z: -300 }], laneCountPerDirection: 1, travelDirection: 'forward', speedLimit: 50 });
    const branchWide = makeRoad({ id: 'y-side', points: [{ x: -12, z: -135 }, { x: -110, z: -200 }], laneCountPerDirection: 1, travelDirection: 'forward', speedLimit: 40 });
    const yNet = makeNetwork([stem, branchNatural, branchWide], [
      { fromRoadId: 'y-stem', fromEnd: 'end', toRoadId: 'y-main', toEnd: 'start' },
      { fromRoadId: 'y-stem', fromEnd: 'end', toRoadId: 'y-side', toEnd: 'start' },
    ]);
    const yRig = createSimRig({ network: yNet, startX: 0, startZ: -20, startSpeed: 12 });
    for (let i = 0; i < 120 * 14; i++) yRig.step();
    assert(yRig.adas.planner.snapshot.currentRoadId === 'y-main', `Expected Y-fork natural continuation onto y-main, got ${yRig.adas.planner.snapshot.currentRoadId}`);

    // Part B: T-junction -> NO straight exit, has both left & right -> waits without blinker, then turns right on rightIndicator
    const tStem = makeRoad({ id: 't-stem', points: [{ x: 0, z: 0 }, { x: 0, z: -150 }], laneCountPerDirection: 1, travelDirection: 'forward', speedLimit: 40 });
    const tLeft = makeRoad({ id: 't-left', points: [{ x: -14, z: -165 }, { x: -180, z: -165 }], laneCountPerDirection: 1, travelDirection: 'forward', speedLimit: 40 });
    const tRight = makeRoad({ id: 't-right', points: [{ x: 14, z: -165 }, { x: 180, z: -165 }], laneCountPerDirection: 1, travelDirection: 'forward', speedLimit: 40 });
    const tNet = makeNetwork(
      [tStem, tLeft, tRight],
      [
        { fromRoadId: 't-stem', fromEnd: 'end', toRoadId: 't-left', toEnd: 'start', via: { x: 0, z: -165 } },
        { fromRoadId: 't-stem', fromEnd: 'end', toRoadId: 't-right', toEnd: 'start', via: { x: 0, z: -165 } },
      ],
      [{
        id: 'j-t',
        center: { x: 0, z: -165 },
        halfExtentX: 12,
        halfExtentZ: 12,
        arms: [
          { segmentId: 't-stem', outward: { x: 0, z: 1 }, approachYawRadians: 0, approachLaneCount: 1 },
          { segmentId: 't-left', outward: { x: -1, z: 0 }, approachYawRadians: Math.PI * 0.5, approachLaneCount: 1 },
          { segmentId: 't-right', outward: { x: 1, z: 0 }, approachYawRadians: -Math.PI * 0.5, approachLaneCount: 1 },
        ],
      }],
    );
    const tRig = createSimRig({ network: tNet, startX: 0, startZ: -35, startSpeed: 10 });
    let sawWaitIntent = false;
    for (let i = 0; i < 120 * 14; i++) {
      tRig.step();
      if (tRig.adas.planner.snapshot.awaitingJunctionIntent) sawWaitIntent = true;
    }
    assert(sawWaitIntent, 'Expected awaitingJunctionIntent at ambiguous T-junction without blinker');
    assert(tRig.dynamics.speed < 0.8 && tRig.dynamics.z > -158, `Must wait before entering T-junction, speed=${tRig.dynamics.speed.toFixed(2)}, z=${tRig.dynamics.z.toFixed(1)}`);

    // Now driver flicks right blinker once -> should execute smooth right turn onto t-right!
    for (let i = 0; i < 120 * 14; i++) {
      tRig.step((inp) => {
        if (i === 1) inp.rightIndicator = true;
      });
    }
    assert(tRig.adas.planner.snapshot.currentRoadId === 't-right' && tRig.dynamics.x > 25, `Expected right turn into t-right after blinker, road=${tRig.adas.planner.snapshot.currentRoadId}, x=${tRig.dynamics.x.toFixed(1)}`);
    return { yRoad: yRig.adas.planner.snapshot.currentRoadId, tWaited: sawWaitIntent, tRightX: +tRig.dynamics.x.toFixed(1) };
  });

  // 54. Free driving highway exit: without signal keeps mainline; with right signal moves rightmost step-by-step and exits ramp
  run('54-v35-free-drive-highway-exit', '无导航高速出口：无信号保主线、打右灯逐道驶出匝道', () => {
    const hwA = makeRoad({ id: 'fd-hw-a', points: [{ x: 0, z: 0 }, { x: 0, z: -260 }], laneCountPerDirection: 2, laneWidth: 3.75, travelDirection: 'forward', speedLimit: 100, roadType: 'highway' });
    const hwB = makeRoad({ id: 'fd-hw-b', points: [{ x: 0, z: -260 }, { x: 0, z: -560 }], laneCountPerDirection: 2, laneWidth: 3.75, travelDirection: 'forward', speedLimit: 100, roadType: 'highway' });
    const ramp = makeRoad({ id: 'fd-ramp', points: [{ x: 3.75, z: -262 }, { x: 36, z: -360 }, { x: 110, z: -430 }], laneCountPerDirection: 1, laneWidth: 3.75, travelDirection: 'forward', speedLimit: 40, roadType: 'ramp' });
    const net = makeNetwork([hwA, hwB, ramp], [
      { fromRoadId: 'fd-hw-a', fromEnd: 'end', toRoadId: 'fd-hw-b', toEnd: 'start' },
      { fromRoadId: 'fd-hw-a', fromEnd: 'end', toRoadId: 'fd-ramp', toEnd: 'start' },
    ]);

    // 54a. No signal -> continues straight on mainline fd-hw-b
    const rigKeep = createSimRig({ network: net, startX: -1.875, startZ: -25, startSpeed: 24 });
    for (let i = 0; i < 120 * 14; i++) rigKeep.step();
    assert(rigKeep.adas.planner.snapshot.currentRoadId === 'fd-hw-b', `Without signal must stay on highway mainline, got ${rigKeep.adas.planner.snapshot.currentRoadId}`);

    // 54b. Driver toggles right indicator in left lane -> steps right into exit lane and exits onto fd-ramp
    const rigExit = createSimRig({ network: net, startX: -1.875, startZ: -25, startSpeed: 24 });
    let reachedRamp = false;
    for (let i = 0; i < 120 * 20; i++) {
      rigExit.step((inp) => {
        if (i === 5) inp.rightIndicator = true;
      });
      if (rigExit.adas.planner.snapshot.currentRoadId === 'fd-ramp') reachedRamp = true;
    }
    assert(reachedRamp && rigExit.dynamics.x > 18, `Right blinker on highway in free-driving must move right and exit onto fd-ramp, road=${rigExit.adas.planner.snapshot.currentRoadId}, x=${rigExit.dynamics.x.toFixed(1)}`);
    return { mainlineKept: true, rampExited: reachedRamp, exitX: +rigExit.dynamics.x.toFixed(1) };
  });

  // 55. Driver turn-signal lane change: safe dashed lane change vs refusing occupied/solid-line change
  run('55-v35-turn-signal-intent-and-safety', '转向灯意图合法安全变道与实线/占道拒绝', () => {
    const dashedRoad = makeRoad({ id: 'sig-dashed', points: [{ x: 0, z: 0 }, { x: 0, z: -600 }], laneCountPerDirection: 2, speedLimit: 60 });
    const blockerRight = makeActor({ id: 'blk-right', x: 5.25, z: -28, speed: 15 });
    const rigOccupied = createSimRig({
      network: makeNetwork([dashedRoad]),
      startX: 1.75,
      startZ: -20,
      startSpeed: 15,
      actors: [blockerRight],
    });
    for (let i = 0; i < 120 * 4; i++) {
      blockerRight.z = rigOccupied.dynamics.z - 1.5; // holds adjacent right lane blocked
      rigOccupied.step((inp) => {
        if (i === 5) inp.rightIndicator = true;
      });
    }
    assert(rigOccupied.dynamics.x < 2.6, `Must NOT force unsafe right lane change when occupied, x=${rigOccupied.dynamics.x.toFixed(2)}`);

    // Clear adjacent right lane -> single right indicator initiates clean right lane change and stays there!
    const rigClear = createSimRig({
      network: makeNetwork([dashedRoad]),
      startX: 1.75,
      startZ: -20,
      startSpeed: 15,
    });
    for (let i = 0; i < 120 * 8; i++) {
      rigClear.step((inp) => {
        if (i === 5) inp.rightIndicator = true;
      });
    }
    assert(rigClear.dynamics.x > 4.6, `Expected completed safe right lane change on right signal, x=${rigClear.dynamics.x.toFixed(2)}`);
    assert(rigClear.adas.planner.snapshot.currentApproachLaneIndex === 1, 'Expected approachLaneIndex === 1 after single manual signal');
    return { refusedWhenOccupied: true, completedSafeRightLc: true, finalX: +rigClear.dynamics.x.toFixed(2) };
  });

  // 56. Sudden map data loss: gradual slow-down, safe completion/abort mid-lane-change, and final SAFE_STOP
  run('56-v35-map-loss-degraded-and-safe-stop', '地图突然中断时平滑降级减速至安全停车接管', () => {
    const road = makeRoad({ id: 'deg-road', points: [{ x: 0, z: 0 }, { x: 0, z: -500 }], laneCountPerDirection: 2, speedLimit: 70 });
    const rig = createSimRig({
      network: makeNetwork([road]),
      startX: 1.75,
      startZ: -20,
      startSpeed: 18,
      adasConfig: { degradedHoldMaxDistanceM: 38, degradedMinSpeedMps: 5.5 },
    });
    for (let i = 0; i < 120 * 2; i++) rig.step();

    // Suddenly sever map roadNetwork cleanly
    let sawDegradedHold = false;
    let sawSafeStop = false;
    let speedDuringDegraded = Infinity;
    for (let i = 0; i < 120 * 10; i++) {
      const { snap, state } = rig.step(undefined, (w) => {
        w.roadNetwork = undefined;
        w.nearbyNetwork = undefined;
      });
      if (rig.adas.status.drivingMode === 'MAP_DEGRADED' && state !== 'SAFE_STOP') {
        sawDegradedHold = true;
        speedDuringDegraded = Math.min(speedDuringDegraded, snap.speed);
      }
      if (state === 'SAFE_STOP') {
        sawSafeStop = true;
      }
    }
    assert(sawDegradedHold, 'Expected MAP_DEGRADED hold period before abrupt failure');
    assert(speedDuringDegraded < 17.5, `Expected gradual speed reduction during degraded map hold, min=${speedDuringDegraded.toFixed(2)}`);
    assert(sawSafeStop && rig.dynamics.speed < 0.8, `Expected transition to SAFE_STOP standstill after exhausted fallback corridor, state=${rig.adas.currentState}, v=${rig.dynamics.speed.toFixed(2)}`);
    return { sawDegradedHold, sawSafeStop, finalSpeedMps: +rig.dynamics.speed.toFixed(2) };
  });

  // 57. Map loss during mid-lane-change / mid-turn + smooth map recovery without steering snap
  run('57-v35-map-recovery-smooth', '地图恢复平滑接续与变道中断处理', () => {
    const road = makeRoad({ id: 'rec-road', points: [{ x: 0, z: 0 }, { x: 0, z: -700 }], laneCountPerDirection: 2, speedLimit: 60 });
    const rig = createSimRig({
      network: makeNetwork([road]),
      startX: 1.75,
      startZ: -20,
      startSpeed: 15,
    });
    for (let i = 0; i < 120 * 2; i++) rig.step();

    // Trigger manual left-to-right lane change, drop map right at start (signaling -> should abort cleanly!)
    rig.step((inp) => { inp.rightIndicator = true; });
    let abortClean = false;
    let peakRecoverySteerRate = 0;
    let prevSteer = rig.dynamics.getSnapshot().steeringAngle;
    for (let i = 0; i < 120 * 5; i++) {
      const dropMap = i < 180; // lost for 1.5s then recovered for 3.5s
      const { snap } = rig.step(undefined, (w) => {
        if (dropMap) {
          w.roadNetwork = undefined;
          w.nearbyNetwork = undefined;
        } else {
          w.roadNetwork = makeNetwork([road]);
          w.nearbyNetwork = w.roadNetwork;
        }
      });
      if (dropMap && !rig.adas.planner.snapshot.laneChange.active) abortClean = true;
      const rate = Math.abs(snap.steeringAngle - prevSteer) / FIXED_DT;
      peakRecoverySteerRate = Math.max(peakRecoverySteerRate, rate);
      prevSteer = snap.steeringAngle;
    }
    assert(abortClean, 'Early lane-change during sudden map loss should safely abort');
    assert(peakRecoverySteerRate < 1.2, `Map recovery caused abrupt steering jump: ${peakRecoverySteerRate.toFixed(2)} rad/s`);
    assert(rig.adas.status.drivingMode === 'FREE_DRIVING' && rig.adas.isEnabled, 'Expected clean recovery back to FREE_DRIVING');
    return { abortClean, peakSteerRateRadS: +peakRecoverySteerRate.toFixed(2), mode: rig.adas.status.drivingMode };
  });

  // 58. Independent lateral/longitudinal collaboration & driver standstill hold
  run('58-v35-driver-collab-and-stop-hold', '纵横向独立协作与驾驶员主动停车保持', () => {
    const road = makeRoad({ id: 'col-road', points: [{ x: 0, z: 0 }, { x: 0, z: -700 }], laneCountPerDirection: 2, speedLimit: 50 });
    const rig = createSimRig({
      network: makeNetwork([road]),
      startX: 1.75,
      startZ: -20,
      startSpeed: 12,
    });

    // Phase A: Driver steers gently while ADAS continues longitudinal speed control
    let sawLatOnlyIntervene = false;
    for (let i = 0; i < 120 * 2.5; i++) {
      const { out } = rig.step((inp) => {
        if (i >= 60 && i < 150) inp.steering = 0.20;
      });
      if (i >= 65 && i < 145 && rig.adas.status.driverSteeringOverride) {
        if (!rig.adas.status.driverAccelerationOverride && !rig.adas.status.driverBrakeOverride) {
          sawLatOnlyIntervene = true;
        }
        assert(Math.abs(out.steering - 0.20) < 1e-6, 'Manual steering must pass through cleanly');
      }
    }
    assert(sawLatOnlyIntervene, 'Expected independent lateral intervention while longitudinal control stayed ADAS');

    // Phase B: Driver brakes completely down to standstill, then releases brake -> ADAS MUST HOLD STILL!
    for (let i = 0; i < 120 * 4; i++) {
      rig.step((inp) => { inp.brake = 0.85; });
    }
    assert(rig.dynamics.speed < 0.25, 'Vehicle should be stopped by driver brake');
    assert(rig.adas.driverOverride.state.driverStandstillHold === true, 'Expected driverStandstillHold latched after manual stop');

    // Release brake completely for 2.0 seconds -> vehicle must NOT creep forward automatically!
    for (let i = 0; i < 120 * 2; i++) {
      rig.step();
    }
    assert(rig.adas.status.stopOrigin === 'DRIVER_STOP', `Expected stopOrigin DRIVER_STOP, got ${rig.adas.status.stopOrigin}`);
    assert(rig.dynamics.speed < 0.15, `Vehicle crept forward after manual stop hold! v=${rig.dynamics.speed.toFixed(2)}`);

    // Now driver taps throttle for 0.4s -> hold releases cleanly & ADAS resumes cruise!
    for (let i = 0; i < 120 * 4; i++) {
      rig.step((inp) => { if (i < 48) inp.throttle = 0.35; });
    }
    assert(rig.dynamics.speed > 5.0, `Expected ADAS to resume smooth cruise after driver tap-to-go, v=${rig.dynamics.speed.toFixed(2)}`);
    return { sawLatOnlyIntervene, heldStandstill: true, resumedSpeedMps: +rig.dynamics.speed.toFixed(2) };
  });

  // 59. Driver turn intent overrides navigation straight instruction & cleanly replans after exit
  run('59-v35-driver-intent-vs-nav-reroute', '驾驶员意图优先于导航直行并在转向完成后触发重规划', () => {
    const baseNet = makeCrossIntersectionNetwork({ speedLimit: 50, lanesPerDir: 1 });
    const eastLoop = makeRoad({
      id: 'east-loop',
      points: [{ x: 240, z: -200 }, { x: 240, z: -320 }, { x: 0, z: -320 }],
      laneCountPerDirection: 1,
      travelDirection: 'forward',
      speedLimit: 50,
    });
    const northExt = makeRoad({
      id: 'north-ext',
      points: [{ x: 0, z: -320 }, { x: 0, z: -460 }],
      laneCountPerDirection: 1,
      travelDirection: 'forward',
      speedLimit: 50,
    });
    const net = makeNetwork(
      [...baseNet.segments, eastLoop, northExt],
      [
        ...baseNet.routing!.connections,
        { fromRoadId: 'north', fromEnd: 'end', toRoadId: 'north-ext', toEnd: 'start' },
        { fromRoadId: 'east', fromEnd: 'end', toRoadId: 'east-loop', toEnd: 'start' },
        { fromRoadId: 'east-loop', fromEnd: 'end', toRoadId: 'north-ext', toEnd: 'start' },
      ],
      [...baseNet.intersections],
    );
    const greenSig = new MockTrafficSignalProvider('j-center', 'south', ['south:lane:1']);
    greenSig.color = 'green';
    // Navigation asks straight south -> north -> north-ext
    const rig = createSimRig({
      network: net,
      startX: 1.75,
      startZ: -85,
      startSpeed: 10,
      destination: { roadId: 'north-ext', along: 100, x: 0, z: -420, direction: 'forward' },
      trafficSignals: greenSig,
    });

    let sawReroute = false;
    for (let i = 0; i < 120 * 16; i++) {
      rig.step((inp) => {
        if (i === 5) inp.rightIndicator = true;
      });
      if (rig.adas.status.requestNavReroute) sawReroute = true;
      if (rig.adas.planner.snapshot.currentRoadId === 'east' && rig.dynamics.x > 35 && rig.nav.state.route?.sections[0]?.road.id === 'east') {
        break;
      }
    }
    assert(rig.adas.planner.snapshot.currentRoadId === 'east' && rig.dynamics.x > 20, `Expected vehicle to honor driver right turn into east road despite nav straight, road=${rig.adas.planner.snapshot.currentRoadId}, x=${rig.dynamics.x.toFixed(1)}`);
    assert(sawReroute && rig.nav.state.route?.sections[0]?.road.id === 'east', `Expected clean navigation reroute onto east after completing driver branch (sawReroute=${sawReroute}, navRoad=${rig.nav.state.route?.sections[0]?.road.id})`);
    return { turnedEast: true, eastX: +rig.dynamics.x.toFixed(1), navRoad: rig.nav.state.route?.sections[0]?.road.id ?? 'none' };
  });

  // 60. Preservation check: V3.4 physical collision emergency stop + Park + EPB + Hazard + Handover lock under V3.5
  run('60-v35-collision-guard-preserved', '保留 V3.4 真实碰撞停车驻车、双闪与接管锁定', () => {
    const wallRoad = makeRoad({ id: 'v34-col', points: [{ x: 0, z: 0 }, { x: 0, z: -300 }], laneCountPerDirection: 1, travelDirection: 'forward', speedLimit: 50 });
    const concreteWall = createStaticOBBCollider({
      id: 'wall-crash-test',
      type: 'wall',
      x: 0,
      z: -62,
      width: 6.0,
      length: 1.5,
      minHeight: 0,
      maxHeight: 2.2,
    });
    const rig = createSimRig({
      network: makeNetwork([wallRoad]),
      colliders: [concreteWall],
      startX: 0,
      startZ: -48,
      startSpeed: 15,
    });

    let sawColStopping = false;
    let sawColHold = false;
    let sawColHandover = false;
    let collidedOnce = false;
    for (let i = 0; i < 120 * 7; i++) {
      if (rig.contacts.collision?.collided) collidedOnce = true;
      const { state } = rig.step((inp) => {
        if (!collidedOnce && !sawColStopping && i < 180) inp.throttle = 1.0;
      });
      if (state === 'COLLISION_STOPPING') sawColStopping = true;
      if (state === 'COLLISION_HOLD') sawColHold = true;
      if (state === 'COLLISION_HANDOVER') {
        sawColHandover = true;
        break;
      }
    }
    assert(sawColStopping, 'Expected V3.4 COLLISION_STOPPING under free drive');
    assert(sawColHold, 'Expected V3.4 COLLISION_HOLD parking confirmation');
    assert(sawColHandover && !rig.adas.isEnabled, 'Expected ADAS disarmed at COLLISION_HANDOVER');
    assert(rig.lights.state.hazard === true, 'Expected hazard lamps active on collision handover');
    assert(rig.dynamics.getSnapshot().transmission.selectedMode === 'P', 'Expected Park selector P locked');
    return {
      sawColStopping,
      sawColHold,
      sawColHandover,
      hazard: rig.lights.state.hazard,
      selector: rig.dynamics.getSnapshot().transmission.selectedMode ?? 'none',
    };
  });

  // 61. V3.5 Hardening: curved named mainline continuation vs straight minor side street + LaneGraph legality
  run('61-v35-curved-mainline-vs-side-street', '弯曲主干道延续优于直行小支路，尊重LaneGraph连接关系', () => {
    const mainA = makeRoad({
      id: 'main-a',
      name: 'Mainline Ave',
      roadFunction: 'arterial',
      points: [{ x: 0, z: 0 }, { x: 0, z: -150 }],
      laneCountPerDirection: 2,
      speedLimit: 60,
    });
    const sideCross = makeRoad({
      id: 'side-alley',
      name: 'Side Alley',
      roadFunction: 'local',
      points: [{ x: 0, z: -150 }, { x: 0, z: -320 }],
      laneCountPerDirection: 1,
      speedLimit: 30,
    });
    const mainB = makeRoad({
      id: 'main-b',
      name: 'Mainline Ave',
      roadFunction: 'arterial',
      points: [{ x: 0, z: -150 }, { x: -45, z: -230 }, { x: -120, z: -320 }],
      laneCountPerDirection: 2,
      speedLimit: 60,
    });
    const net = makeNetwork(
      [mainA, sideCross, mainB],
      [
        { fromRoadId: 'main-a', fromEnd: 'end', toRoadId: 'side-alley', toEnd: 'start' },
        { fromRoadId: 'main-a', fromEnd: 'end', toRoadId: 'main-b', toEnd: 'start' },
      ],
    );
    const rig = createSimRig({ network: net, startX: 1.75, startZ: -35, startSpeed: 12 });
    let pickedMainB = false;
    for (let i = 0; i < 120 * 14; i++) {
      rig.step();
      if (rig.adas.planner.snapshot.currentRoadId === 'main-b') pickedMainB = true;
    }
    assert(pickedMainB && rig.dynamics.x < -12, `Expected free driving to follow curved mainline main-b rather than straight side-alley, road=${rig.adas.planner.snapshot.currentRoadId}, x=${rig.dynamics.x.toFixed(1)}`);
    return { pickedMainB, finalX: +rig.dynamics.x.toFixed(1) };
  });

  // 62. V3.5 Hardening: highway upstream right lane-change vs exit-zone exit disambiguation
  run('62-v35-signal-disambiguation-highway-lc-vs-exit', '高速上游右变道与出口区间驶出匝道消歧义', () => {
    const hwA = makeRoad({
      id: 'disambig-hw-a',
      points: [{ x: 0, z: 0 }, { x: 0, z: -520 }],
      laneCountPerDirection: 3,
      laneWidth: 3.75,
      travelDirection: 'forward',
      speedLimit: 100,
      roadType: 'highway',
    });
    const hwB = makeRoad({
      id: 'disambig-hw-b',
      points: [{ x: 0, z: -520 }, { x: 0, z: -780 }],
      laneCountPerDirection: 3,
      laneWidth: 3.75,
      travelDirection: 'forward',
      speedLimit: 100,
      roadType: 'highway',
    });
    const ramp = makeRoad({
      id: 'disambig-ramp',
      points: [{ x: 7.5, z: -522 }, { x: 45, z: -615 }, { x: 110, z: -690 }],
      laneCountPerDirection: 1,
      laneWidth: 3.75,
      travelDirection: 'forward',
      speedLimit: 40,
      roadType: 'ramp',
    });
    const net = makeNetwork([hwA, hwB, ramp], [
      { fromRoadId: 'disambig-hw-a', fromEnd: 'end', toRoadId: 'disambig-hw-b', toEnd: 'start' },
      { fromRoadId: 'disambig-hw-a', fromEnd: 'end', toRoadId: 'disambig-ramp', toEnd: 'start' },
    ]);
    // Far upstream (> 450m from exit) in leftmost lane (lane 0: x = 0): right signal performs single lane change (lane 0 -> 1) and keeps mainline!
    const rig = createSimRig({ network: net, startX: 0, startZ: -35, startSpeed: 24 });
    let exitedRamp = false;
    for (let i = 0; i < 120 * 24; i++) {
      rig.step((inp) => {
        if (i === 10) inp.rightIndicator = true;
      });
      if (rig.adas.planner.snapshot.currentRoadId === 'disambig-ramp') exitedRamp = true;
    }
    assert(!exitedRamp && rig.adas.planner.snapshot.currentRoadId === 'disambig-hw-b', `Upstream single right lane-change must stay on highway mainline, got road=${rig.adas.planner.snapshot.currentRoadId}`);
    assert(rig.dynamics.x > 2.2 && rig.dynamics.x < 6.0, `Expected vehicle in middle lane after upstream single right lane-change, x=${rig.dynamics.x.toFixed(2)}`);
    return { keptMainline: !exitedRamp, finalX: +rig.dynamics.x.toFixed(2) };
  });

  // 63. V3.5 Hardening: MAP_DEGRADED bounded hold/abort + obstacle AEB still works without map
  run('63-v35-map-degraded-time-cap-and-aeb', '地图降级严格时间/几何边界及期间障碍物AEB生效', () => {
    const road = makeRoad({ id: 'deg-aeb', points: [{ x: 0, z: 0 }, { x: 0, z: -400 }], laneCountPerDirection: 1, travelDirection: 'forward', speedLimit: 60 });
    const blocker = makeActor({ id: 'deg-static-box', kind: 'static-obstacle', x: 0, z: -105, speed: 0, length: 2.0, width: 2.0 });
    const rig = createSimRig({
      network: makeNetwork([road]),
      startX: 0,
      startZ: -20,
      startSpeed: 14,
      actors: [blocker],
    });
    for (let i = 0; i < 120 * 2; i++) rig.step();
    let sawSafeStop = false;
    let collidedWithBox = false;
    for (let i = 0; i < 120 * 5; i++) {
      const { state } = rig.step(undefined, (w) => {
        w.roadNetwork = undefined;
        w.nearbyNetwork = undefined;
      });
      if (state === 'SAFE_STOP') sawSafeStop = true;
      if (Math.abs(rig.dynamics.z - blocker.z) < 2.2) collidedWithBox = true;
    }
    assert(sawSafeStop, 'Expected bounded MAP_DEGRADED fallback to reach SAFE_STOP within 5s');
    assert(!collidedWithBox && rig.dynamics.speed < 0.8, `Expected AEB/SAFE_STOP to stop before degraded-mode blocker, z=${rig.dynamics.z.toFixed(1)}, v=${rig.dynamics.speed.toFixed(2)}`);
    return { sawSafeStop, stoppedBeforeBox: !collidedWithBox, stopZ: +rig.dynamics.z.toFixed(1) };
  });

  // 64. V3.5 Hardening: mid-curve steering correction + release keeps wheel continuity without snapping back
  run('64-v35-curve-release-smooth-recovery', '弯道人工修正方向后松手不猛拉回原轨迹', () => {
    const curvePts: Array<{ x: number; z: number }> = [];
    const radius = 140;
    for (let a = 0; a <= Math.PI * 0.45; a += 0.04) {
      curvePts.push({ x: radius * (1 - Math.cos(a)), z: -radius * Math.sin(a) });
    }
    const curvedRoad = makeRoad({ id: 'curve-rec', points: curvePts, laneCountPerDirection: 2, speedLimit: 50 });
    const rig = createSimRig({ network: makeNetwork([curvedRoad]), startX: 1.75, startZ: -8, startSpeed: 12 });
    for (let i = 0; i < 120 * 2; i++) rig.step();

    // Driver applies counter-correction toward outside of curve briefly then releases mid-curve
    let peakReleaseRate = 0;
    let prevSteer = rig.dynamics.getSnapshot().steeringAngle;
    for (let i = 0; i < 120 * 4; i++) {
      const manualWindow = i < 45; // 0.375s steering input then sudden release
      const { snap } = rig.step((inp) => {
        if (manualWindow) inp.steering = -0.22;
      });
      if (i >= 45 && i < 165) {
        const rate = Math.abs(snap.steeringAngle - prevSteer) / FIXED_DT;
        peakReleaseRate = Math.max(peakReleaseRate, rate);
      }
      prevSteer = snap.steeringAngle;
    }
    assert(peakReleaseRate < 1.1, `Mid-curve release caused sudden steering jerk: ${peakReleaseRate.toFixed(2)} rad/s`);
    assert(rig.adas.isEnabled && Math.abs(rig.adas.planner.snapshot.lateralOffsetM) < 2.2, `Expected vehicle settled in lane after curve release, lat=${rig.adas.planner.snapshot.lateralOffsetM.toFixed(2)}`);
    return { peakReleaseRateRadS: +peakReleaseRate.toFixed(2), finalLatM: +rig.adas.planner.snapshot.lateralOffsetM.toFixed(2) };
  });

  // 65. Regression: elevated ramp underneath piers + overhead signs + diagonal roadside guardrail produce ZERO phantom AEB
  run('65-dongyuan-elevation-and-diagonal-guardrail', '高架匝道下桥墩/上方牌及斜向路侧护栏零误报急刹', () => {
    const rampRoad = makeRoad({
      id: 'ramp-elev',
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 6, z: -60 },
        { x: 0, y: 12, z: -120 },
        { x: 0, y: 12, z: -360 },
      ],
      laneCountPerDirection: 1,
      travelDirection: 'forward',
      roadType: 'ramp',
      speedLimit: 50,
    });
    const bridgePierUnderneath = createStaticOBBCollider({
      id: 'ramp-elev:pier:0',
      type: 'obstacle',
      x: 0,
      z: -120,
      yaw: 0,
      length: 1.2,
      width: 1.2,
      minHeight: -0.04,
      maxHeight: 11.2,
    });
    const overheadGantryBoard = createStaticOBBCollider({
      id: 'ramp-elev:guide:0:board:0',
      type: 'obstacle',
      x: 0,
      z: -140,
      yaw: 0,
      length: 0.5,
      width: 6.0,
      minHeight: 14.5,
      maxHeight: 17.5,
    });
    const diagonalBarrier = createStaticOBBCollider({
      id: 'G17:barrier:diag:0',
      type: 'guardrail',
      x: 34.0,
      z: -105,
      yaw: 0.65,
      length: 90,
      width: 0.4,
      minHeight: 11.5,
      maxHeight: 12.8,
    });
    const rig = createSimRig({
      network: makeNetwork([rampRoad]),
      colliders: [bridgePierUnderneath, overheadGantryBoard, diagonalBarrier],
      startX: 0,
      startZ: -10,
      startSpeed: 12,
      destination: { roadId: 'ramp-elev', along: 340, x: 0, z: -340, direction: 'forward' },
    });
    let phantomAebCount = 0;
    let minSpeedMps = Infinity;
    for (let i = 0; i < 120 * 5; i++) {
      rig.step();
      if (rig.adas.obstacleAvoidance.assessment.emergencyBraking) phantomAebCount++;
      minSpeedMps = Math.min(minSpeedMps, rig.dynamics.speed);
    }
    assert(phantomAebCount === 0, `Expected 0 phantom AEB triggers on elevated ramp colliders, got ${phantomAebCount}`);
    assert(minSpeedMps > 9.0, `Expected smooth ramp speed without phantom braking, minSpeed=${minSpeedMps.toFixed(2)}`);
    return { phantomAebCount, minSpeedMps: +minSpeedMps.toFixed(2), endZ: +rig.dynamics.z.toFixed(1) };
  });

  // 66. Regression: adjacent-lane static truck produces no false brake & overtaking waits for full tail clearance before returning
  run('66-full-envelope-adjacent-static-vs-overtake-tail-clearance', '邻道静态车无误刹与超车车尾完全越过后安全回归', () => {
    const road = makeRoad({
      id: 'ot-tail',
      points: [{ x: 0, z: 0 }, { x: 0, z: -480 }],
      laneCountPerDirection: 2,
      travelDirection: 'forward',
      speedLimit: 70,
    });
    // Adjacent static truck centered at x=+1.75 (right lane) while ego starts in left lane at x=-1.75, plus slow car ahead in ego lane
    // Actually ego starts in right lane (x=1.75) beside an unoccupied left lane (-1.75), passes a slow car (z=-55) AND passes static adjacent check
    const slowLead = makeActor({ id: 'slow-lead', x: 1.75, z: -55, speed: 7.5, length: 4.8, width: 1.9 });
    const adjStatic = makeActor({ id: 'adj-far-parked', x: 5.5, z: -180, speed: 0, kind: 'static-obstacle', length: 6.0, width: 2.3 });
    const rig = createSimRig({
      network: makeNetwork([road]),
      startX: 1.75,
      startZ: -10,
      startSpeed: 16,
      actors: [slowLead, adjStatic],
    });
    let maxLeftMoveX = 1.75;
    let returnedRightEarly = false;
    let completedOvertake = false;
    for (let i = 0; i < 120 * 16; i++) {
      slowLead.z -= slowLead.speed * FIXED_DT;
      const { snap } = rig.step();
      maxLeftMoveX = Math.min(maxLeftMoveX, snap.x);
      const behindGap = slowLead.z - (snap.z + 2.4) - 2.4;
      if (snap.x > 0.2 && behindGap > -4 && behindGap < 6.5 && rig.adas.planner.snapshot.overtaking.phase === 'returning') {
        returnedRightEarly = true;
      }
      if (maxLeftMoveX < -0.8 && snap.x > 0.8 && behindGap >= 7.0) {
        completedOvertake = true;
      }
      assert(!rig.adas.obstacleAvoidance.assessment.emergencyBraking, `Unexpected AEB during safe overtake at i=${i}`);
    }
    assert(maxLeftMoveX < -0.9, `Expected decisive left overtake around slow lead, minX=${maxLeftMoveX.toFixed(2)}`);
    assert(!returnedRightEarly, 'Overtaking cut back into origin lane before full rear tail clearance!');
    assert(completedOvertake, 'Expected full overtaking + safe tail-clear return to complete cleanly');
    return { maxLeftMoveX: +maxLeftMoveX.toFixed(2), completedOvertake };
  });

  // 67. Regression: executing lane-change stays locked across road-segment seam & launches early avoidance without braking to crawl
  run('67-active-passability-early-avoidance-and-seam-lock', '变道跨路段接缝锁定轨迹与前方静止障碍提前果断变道', () => {
    const segA = makeRoad({
      id: 'seam-a',
      points: [{ x: 0, z: 0 }, { x: 0, z: -80 }],
      laneCountPerDirection: 2,
      travelDirection: 'forward',
      speedLimit: 60,
    });
    const segB = makeRoad({
      id: 'seam-b',
      points: [{ x: 0, z: -80 }, { x: 0, z: -320 }],
      laneCountPerDirection: 2,
      travelDirection: 'forward',
      speedLimit: 60,
    });
    const net = makeNetwork([segA, segB], [{ fromRoadId: 'seam-a', fromEnd: 'end', toRoadId: 'seam-b', toEnd: 'start' }]);
    const blocker = makeActor({ id: 'blocker-box', x: 1.75, z: -72, speed: 0, kind: 'static-obstacle', length: 4.5, width: 2.0 });
    const rig = createSimRig({
      network: net,
      startX: 1.75,
      startZ: -12,
      startSpeed: 13.5,
      destination: { roadId: 'seam-b', along: 200, x: 1.75, z: -280, direction: 'forward' },
      actors: [blocker],
    });
    let minSpeedMps = Infinity;
    let passedCleanly = false;
    for (let i = 0; i < 120 * 10; i++) {
      const { snap } = rig.step();
      minSpeedMps = Math.min(minSpeedMps, snap.speed);
      if (snap.z < blocker.z - 8 && Math.abs(snap.x - -1.75) < 0.85) {
        passedCleanly = true;
      }
    }
    assert(passedCleanly, `Expected smooth early lane-change bypass past seam & blocker, end=(${rig.dynamics.x.toFixed(2)}, ${rig.dynamics.z.toFixed(1)})`);
    assert(minSpeedMps > 6.5, `Expected early decisive bypass without braking to crawl, minSpeed=${minSpeedMps.toFixed(2)}`);
    return { minSpeedMps: +minSpeedMps.toFixed(2), endX: +rig.dynamics.x.toFixed(2) };
  });

  // 68. Regression: manual steering bypass + release synchronously clears bypassed obstacle with zero repeat braking
  run('68-driver-bypass-closed-loop-no-repeat-braking', '人工绕行松手后同步接管新位置与障碍关系，无反复重刹回抢', () => {
    const road = makeRoad({
      id: 'bypass-loop',
      points: [{ x: 0, z: 0 }, { x: 0, z: -340 }],
      laneCountPerDirection: 2,
      travelDirection: 'forward',
      speedLimit: 60,
    });
    const stalled = makeActor({ id: 'stalled-lead', x: 1.75, z: -52, speed: 0, kind: 'static-obstacle', length: 4.6, width: 1.95 });
    const rig = createSimRig({
      network: makeNetwork([road]),
      startX: 1.75,
      startZ: -10,
      startSpeed: 12,
      destination: { roadId: 'bypass-loop', along: 320, x: 1.75, z: -320, direction: 'forward' },
      actors: [stalled],
    });
    // Driver manually steers into clear left lane (-1.75) and straightens along -1.75, then releases
    let postReleaseAebCount = 0;
    let minPostReleaseSpeed = Infinity;
    let releaseFrame = Infinity;
    let settledInLeftLane = false;
    for (let i = 0; i < 120 * 9; i++) {
      const curX = rig.dynamics.x;
      const inManualSwerve = i >= 12 && (i < 160 || (i < 360 && (curX > -1.4 || Math.abs(rig.dynamics.getSnapshot().yaw) > 0.06)));
      const { snap } = rig.step((inp, _t, curSnap) => {
        if (inManualSwerve) {
          // Proportional smooth swerve into left lane (-1.75) aligned straight (-Z)
          const targetLat = -1.75;
          const desiredYaw = Math.max(-0.35, Math.min(0.35, (curX - targetLat) * 0.18));
          const steerTarget = Math.max(-0.35, Math.min(0.35, -(desiredYaw - curSnap.yaw) * 1.8));
          inp.steering = steerTarget;
          inp.throttle = 0.25;
        } else if (!Number.isFinite(releaseFrame)) {
          releaseFrame = i;
        }
      });
      if (i >= releaseFrame + 25) {
        if (rig.adas.obstacleAvoidance.assessment.emergencyBraking) postReleaseAebCount++;
        minPostReleaseSpeed = Math.min(minPostReleaseSpeed, snap.speed);
        if (snap.z < stalled.z - 8 && Math.abs(snap.x - -1.75) < 0.85) settledInLeftLane = true;
      }
    }
    assert(settledInLeftLane, `Expected smooth pass in adopted left lane without yanking back, endX=${rig.dynamics.x.toFixed(2)}`);
    assert(postReleaseAebCount === 0, `Bypassed obstacle caused repeat post-release AEB frames: ${postReleaseAebCount}`);
    assert(minPostReleaseSpeed > 5.0, `Unexpected post-release slowdown: v=${minPostReleaseSpeed.toFixed(2)}`);
    return { postReleaseAebCount, minPostReleaseSpeed: +minPostReleaseSpeed.toFixed(2), endX: +rig.dynamics.x.toFixed(2) };
  });

  // 69. Regression: highway hard-prohibits blocked auto-reverse while urban single-lane/solid blockage safely evaluates fallback
  run('69-blocked-recovery-highway-ban-vs-urban-evaluation', '高速主线严禁自动倒车脱困与城市受阻保守脱困评估', () => {
    const hwRoad = makeRoad({
      id: 'hw-block',
      points: [{ x: 0, z: 0 }, { x: 0, z: -220 }],
      laneCountPerDirection: 1,
      travelDirection: 'forward',
      roadType: 'highway',
      speedLimit: 100,
    });
    const wall = createStaticOBBCollider({
      id: 'hw-wall',
      type: 'obstacle',
      x: 0,
      z: -24,
      yaw: 0,
      length: 1.2,
      width: 4.0,
      minHeight: 0,
      maxHeight: 2.0,
    });
    const hwRig = createSimRig({
      network: makeNetwork([hwRoad]),
      colliders: [wall],
      startX: 0,
      startZ: -12,
      startSpeed: 4,
    });
    let sawReverseOnHw = false;
    let sawFailedHandover = false;
    for (let i = 0; i < 120 * 6; i++) {
      const { state } = hwRig.step();
      if (state === 'BLOCKED_REVERSE') sawReverseOnHw = true;
      if (state === 'BLOCKED_RECOVERY_FAILED') sawFailedHandover = true;
    }
    assert(!sawReverseOnHw, 'Highway road must strictly prohibit auto-reverse blocked recovery!');
    assert(sawFailedHandover, 'Highway wedged blockage should transition to BLOCKED_RECOVERY_FAILED handover');
    return { sawReverseOnHw, sawFailedHandover };
  });

  // 70. Upgrade 1: Continuous in-lane lateral offset bypass on single-lane road where full lane change is impossible
  run('70-local-in-lane-offset-avoidance', '连续可行驶走廊车道内偏移避障', () => {
    const road = makeRoad({
      id: 'r-inlane-offset',
      points: [{ x: 0, z: 0 }, { x: 0, z: -280 }],
      laneCountPerDirection: 1,
      laneWidth: 3.7,
      travelDirection: 'forward',
      speedLimit: 45,
      roadType: 'urban',
    });
    // Edge-parked narrow hazard on right side of single lane (center x=+1.22, width=0.9m => [+0.77, +1.67], leaving [-1.85, +0.77] open)
    const edgeHazard = makeActor({ id: 'curb-cone', kind: 'static-obstacle', x: 1.22, z: -90, length: 2.2, width: 0.9 });
    const rig = createSimRig({
      network: makeNetwork([road]),
      startX: 0,
      startZ: -15,
      startSpeed: 10,
      destination: { roadId: 'r-inlane-offset', along: 260, x: 0, z: -260, direction: 'forward' },
      actors: [edgeHazard],
    });
    let sawLocalOffset = false;
    let minDodgeX = 0;
    let minSpeedMps = Infinity;
    let passedHazard = false;
    let settledCenterAfterPass = false;
    for (let i = 0; i < 120 * 14; i++) {
      const { snap } = rig.step();
      const lt = rig.adas.planner.snapshot.localTrajectory;
      if (lt && lt.active && lt.mode === 'in_lane_offset' && lt.targetOffsetM < -0.35) {
        sawLocalOffset = true;
      }
      if (snap.x < minDodgeX) minDodgeX = snap.x;
      if (snap.z < -40 && snap.z > -120) {
        minSpeedMps = Math.min(minSpeedMps, snap.speed);
      }
      assert(!checkActorCollision(snap, rig.dims, edgeHazard), 'Collided with edge obstacle during in-lane offset');
      assert(snap.x > -1.85 && snap.x < 1.85, `Exited single lane edge bounds: x=${snap.x.toFixed(2)}`);
      if (snap.z < -115) passedHazard = true;
      if (snap.z < -155 && Math.abs(snap.x) < 0.35) settledCenterAfterPass = true;
    }
    assert(sawLocalOffset && passedHazard, `Expected in-lane continuous offset bypass past obstacle (sawOffset=${sawLocalOffset}, passed=${passedHazard}, minX=${minDodgeX.toFixed(2)})`);
    assert(minSpeedMps > 6.0, `Expected smooth bypass without braking to crawl: minSpeed=${minSpeedMps.toFixed(2)}`);
    assert(settledCenterAfterPass, `Expected smooth return to center after clearing tail, endX=${rig.dynamics.x.toFixed(2)}`);
    return { minDodgeX: +minDodgeX.toFixed(2), minSpeedMps: +minSpeedMps.toFixed(2), settledCenterAfterPass };
  });

  // 71. Upgrade 1: Driver lateral adjustment persistence (initializes from actual pose without snapping back)
  run('71-driver-lateral-offset-persistence', '驾驶员横向偏移调整后平滑保持而不猛拉回中心', () => {
    const road = makeRoad({ id: 'r-hold', points: [{ x: 0, z: 0 }, { x: 0, z: -420 }], laneCountPerDirection: 2, speedLimit: 60 });
    const rig = createSimRig({
      network: makeNetwork([road]),
      startX: 1.75,
      startZ: -15,
      startSpeed: 13,
      destination: { roadId: 'r-hold', along: 400, x: 0, z: -400, direction: 'forward' },
    });
    for (let i = 0; i < 120 * 2; i++) rig.step();
    // Driver shifts slightly within/near lane edge (+0.50m right to x~2.25) then releases
    let peakPostReleaseRate = 0;
    let xAtRelease = 0;
    let xHalfSecAfter = 0;
    let prevSteer = 0;
    for (let i = 0; i < 120 * 4.5; i++) {
      const t = i * FIXED_DT;
      const { snap } = rig.step((inp, _t, s) => {
        if (t < 0.35) {
          inp.steering = 0.22;
        } else if (t < 1.2) {
          inp.steering = Math.max(-0.25, Math.min(0.25, (2.28 - s.x) * 0.25 + s.yaw * 1.1));
        } else if (t < 1.45) {
          const decay = 1 - (t - 1.2) / 0.25;
          inp.steering = Math.max(-0.25, Math.min(0.25, (2.28 - s.x) * 0.25 + s.yaw * 1.1)) * decay;
        }
      });
      if (Math.abs(t - 1.45) < 0.02) {
        xAtRelease = snap.x;
        prevSteer = snap.steeringAngle;
      }
      if (t > 1.45 && t <= 2.6) {
        const rate = Math.abs(snap.steeringAngle - prevSteer) / FIXED_DT;
        peakPostReleaseRate = Math.max(peakPostReleaseRate, rate);
        prevSteer = snap.steeringAngle;
      }
      if (Math.abs(t - 2.0) < 0.02) {
        xHalfSecAfter = snap.x;
      }
    }
    assert(peakPostReleaseRate < 0.55, `Sudden steering yank after driver lateral adjustment: ${peakPostReleaseRate.toFixed(2)} rad/s`);
    assert(xHalfSecAfter > 1.98, `Expected smooth persistence near adjusted pose without snapping back to 1.75: releaseX=${xAtRelease.toFixed(2)}, +0.55sX=${xHalfSecAfter.toFixed(2)}`);
    return { xAtRelease: +xAtRelease.toFixed(2), xHalfSecAfter: +xHalfSecAfter.toFixed(2), peakPostReleaseRate: +peakPostReleaseRate.toFixed(3) };
  });

  // 72. Upgrade 2: Cross-powertrain vehicle dynamics adaptation (ICE vs Dual-Motor EV vs EHS Hybrid)
  run('72-vehicle-dynamics-powertrain-adaptation', '跨动力总成(ICE/EV/Hybrid)动力学自适应平滑加减速', () => {
    const testVehicles: VehicleId[] = ['bmw-530li-g38', 'xiaomi-su7-max-2026', 'byd-qin-plus-dmi-210-2026'];
    const summary: Record<string, string | number | boolean> = {};
    for (const vid of testVehicles) {
      const road = makeRoad({ id: `r-dyn-${vid}`, points: [{ x: 0, z: 0 }, { x: 0, z: -550 }], laneCountPerDirection: 2, speedLimit: 60 });
      const rig = createSimRig({
        vehicleId: vid,
        network: makeNetwork([road]),
        startX: 1.75,
        startZ: -15,
        startSpeed: 0,
        destination: { roadId: road.id, along: 520, x: 0, z: -520, direction: 'forward' },
      });
      let maxThrottle = 0;
      let maxAccelSmooth = 0;
      let accelSmooth = 0;
      let maxSpeedKmh = 0;
      for (let i = 0; i < 120 * 11; i++) {
        const { out, snap } = rig.step();
        const cmdT = Math.max(out.throttle, out.cruiseThrottle ?? 0);
        if (cmdT > maxThrottle) maxThrottle = cmdT;
        accelSmooth += (snap.acceleration - accelSmooth) * (1 - Math.exp(-8 * FIXED_DT));
        if (i > 24 && accelSmooth > maxAccelSmooth) maxAccelSmooth = accelSmooth;
        const kmh = snap.speed * 3.6;
        if (kmh > maxSpeedKmh) maxSpeedKmh = kmh;
      }
      assert(rig.conflictViolations === 0, `${vid}: throttle/brake conflict occurred`);
      assert(maxThrottle <= 0.74, `${vid}: normal launch/cruise spiked throttle too high (${maxThrottle.toFixed(3)}), risking kickdown or surge`);
      assert(maxAccelSmooth <= 3.0, `${vid}: longitudinal acceleration exceeded comfort envelope (${maxAccelSmooth.toFixed(2)} m/s^2)`);
      assert(maxSpeedKmh >= 50 && maxSpeedKmh <= 63, `${vid}: failed to settle near 60 km/h cruise (${maxSpeedKmh.toFixed(1)} km/h)`);
      summary[vid] = `maxT=${maxThrottle.toFixed(2)},maxA=${maxAccelSmooth.toFixed(2)},v=${maxSpeedKmh.toFixed(1)}`;
    }
    return summary;
  });

  // Performance benchmark: 2000 fixed 120 Hz steps on realistic multi-actor intersection route
  const perfNet = makeCrossIntersectionNetwork({ speedLimit: 60, lanesPerDir: 2 });
  const perfSig = new MockTrafficSignalProvider('j-center', 'south', ['south:lane:2', 'south:lane:3']);
  perfSig.color = 'green';
  const perfActors: TrafficActorSnapshot[] = Array.from({ length: 12 }, (_, idx) =>
    makeActor({ id: `perf-${idx}`, x: idx % 2 === 0 ? 1.75 : 5.25, z: -40 - idx * 14, speed: 12 }),
  );
  const perfRig = createSimRig({
    network: perfNet,
    startX: 1.75,
    startZ: -15,
    startSpeed: 12,
    destination: { roadId: 'north', along: 180, x: 0, z: -394, direction: 'forward' },
    trafficSignals: perfSig,
    actors: perfActors,
  });
  let sumStepMs = 0, maxStepMs = 0, sumPlannerMs = 0, sumPercMs = 0;
  let lastPlanCount = 0, lastPercCount = 0;
  const totalSteps = 1200;
  for (let i = 0; i < totalSteps; i++) {
    for (const a of perfActors) a.z -= a.speed * FIXED_DT;
    perfRig.step();
    const p = perfRig.adas.status.performance;
    sumStepMs += p.lastStepMs;
    if (p.lastStepMs > maxStepMs) maxStepMs = p.lastStepMs;
    if (p.plannerUpdates > lastPlanCount) {
      sumPlannerMs += p.lastPlannerMs;
      lastPlanCount = p.plannerUpdates;
    }
    if (p.perceptionUpdates > lastPercCount) {
      sumPercMs += p.lastPerceptionMs;
      lastPercCount = p.perceptionUpdates;
    }
  }
  const avgStepUs = (sumStepMs / totalSteps) * 1000;
  const maxStepUs = maxStepMs * 1000;
  const avgPlannerUs = lastPlanCount > 0 ? (sumPlannerMs / lastPlanCount) * 1000 : 0;
  const avgPerceptionUs = lastPercCount > 0 ? (sumPercMs / lastPercCount) * 1000 : 0;

  assert(avgStepUs < 500, `ADAS average 120 Hz step time exceeded 0.5 ms budget: ${avgStepUs.toFixed(1)} us`);

  return {
    passed: scenarios.filter(s => s.passed).length,
    total: scenarios.length,
    scenarios,
    performance: {
      avgStepUs: +avgStepUs.toFixed(1),
      maxStepUs: +maxStepUs.toFixed(1),
      avgPlannerUs: +avgPlannerUs.toFixed(1),
      avgPerceptionUs: +avgPerceptionUs.toFixed(1),
    },
  };
}
