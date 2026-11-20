import type { SteeringConfig } from '../config';
import type { StaticCollider } from '../physics/CollisionSystem';
import type { NavigationState } from '../../world/navigation/NavigationController';
import type { RoadNetworkData } from '../../world/navigation/RoadNetwork';
import type { TrafficSignalProvider } from '../../world/navigation/TrafficSignalState';

/** Top-level ADAS V3 state machine states. */
export type ADASState =
  // Operational driving states (V3 persistent state machine)
  | 'CRUISE'
  | 'FOLLOW'
  | 'DECELERATING'
  | 'PREPARING_LANE_CHANGE'
  | 'LANE_CHANGING'
  | 'AVOIDANCE'
  | 'INTERSECTION'
  | 'RAMP_ENTRY'
  | 'RAMP_EXIT'
  | 'UNMARKED_ROAD'
  | 'ROAD_BLOCKED'
  | 'SAFE_STOP'
  // Exception handling & recovery states (V3.4)
  | 'COLLISION_STOPPING'
  | 'COLLISION_HOLD'
  | 'COLLISION_HANDOVER'
  | 'BLOCKED_RECOVERY_CHECK'
  | 'BLOCKED_REVERSE'
  | 'BLOCKED_REVERSE_STOP'
  | 'BLOCKED_FORWARD_AVOIDANCE'
  | 'BLOCKED_RECOVERY_FAILED'
  // System lifecycle & arbitration states
  | 'OFF'
  | 'INITIALIZING'
  | 'ACTIVE'
  | 'DRIVER_STEERING_OVERRIDE'
  | 'DRIVER_ACCELERATION_OVERRIDE'
  | 'LANE_CHANGE'
  | 'STOPPING_FOR_SIGNAL'
  | 'OBSTACLE_RESPONSE'
  | 'EMERGENCY_BRAKING'
  | 'DEGRADED'
  | 'UNAVAILABLE';

export type ADASManeuverType =
  | 'FOLLOW_LANE'
  | 'LANE_CHANGE_LEFT'
  | 'LANE_CHANGE_RIGHT'
  | 'TURN_LEFT'
  | 'TURN_RIGHT'
  | 'UTURN'
  | 'MERGE'
  | 'EXIT_RAMP'
  | 'APPROACH_STOP'
  | 'ARRIVING';

export type TurnSignalRequest = 'left' | 'right' | null;
export type LaneBoundaryKind = 'solid' | 'dashed' | 'median' | 'road-edge' | 'unavailable';
export type TurnDirection = 'straight' | 'left' | 'right' | 'uturn';
export type TrafficSignalDecisionKind = 'NONE' | 'PROCEED' | 'STOP_RED' | 'STOP_AMBER' | 'PROCEED_AMBER' | 'STOP_BLOCKED_JUNCTION';
export type OvertakingPhase = 'none' | 'preparing' | 'changing_out' | 'passing' | 'returning';
export type ADASDrivingMode = 'NAVIGATION' | 'FREE_DRIVING' | 'MAP_DEGRADED';
export type ADASControlAuthority = 'SYSTEM' | 'DRIVER_INTERVENING' | 'RECOVERING';
export type ADASDriverIntentKind =
  | 'NONE'
  | 'LANE_CHANGE_LEFT'
  | 'LANE_CHANGE_RIGHT'
  | 'TURN_LEFT'
  | 'TURN_RIGHT'
  | 'EXIT_RAMP'
  | 'RESUME_DRIVE';
export type ADASStopOrigin =
  | 'NONE'
  | 'TRAFFIC_SIGNAL'
  | 'OBSTACLE'
  | 'ROAD_BLOCKED'
  | 'ARRIVAL'
  | 'DEGRADED_SAFE_STOP'
  | 'DRIVER_STOP';

export type TrafficActorKind =
  | 'vehicle'
  | 'pedestrian'
  | 'cyclist'
  | 'static-obstacle'
  | 'road-block';

/**
 * Unified read-only traffic participant snapshot.
 * Designed so current static/dynamic obstacles and future AI traffic vehicles share one contract.
 */
export interface TrafficActorSnapshot {
  id: string;
  kind: TrafficActorKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Signed speed along actor heading (m/s). */
  speed: number;
  /** World-space velocity components (m/s). */
  vx: number;
  vz: number;
  length: number;
  width: number;
  height: number;
  minHeight?: number;
  maxHeight?: number;
  laneId?: string;
  roadId?: string;
  /** 0..1 confidence; values < 0.5 indicate occlusion/unreliable perception. */
  confidence: number;
  /** Simulation timestamp (s) when sampled, for staleness checks. */
  timestamp: number;
  isStatic?: boolean;
  isDynamic?: boolean;
  isInfrastructure?: boolean;
  corridorConflict?: boolean;
  accel?: number;
  motionDirection?: 'same' | 'oncoming' | 'crossing' | 'static';
  lateralVelocity?: number;
  predictedTrajectory?: Array<{ x: number; y: number; z: number; timestamp: number }>;
}

/** Decoupled high-level navigation intent consumed by ADAS V3. */
export interface HighLevelNavigationIntent {
  targetRoadId: string;
  nextRoadName: string;
  nextManeuver: ADASManeuverType;
  distanceToManeuverM: number;
  isHighwayExit: boolean;
  exitDirection: 'left' | 'right' | null;
  targetApproachLane: number;
  remainingRouteDistanceM: number;
  suppressReroute: boolean;
  valid: boolean;
}

/** Optional external provider interface for future AI traffic systems. */
export interface TrafficActorProvider {
  /**
   * Populate nearby actors into the caller-provided pre-allocated buffer.
   * Returns the number of populated entries (<= out.length).
   */
  queryNearbyActors(
    x: number,
    y: number,
    z: number,
    radiusM: number,
    out: TrafficActorSnapshot[],
  ): number;
}

export type ADASSteeringGeometry = Pick<
  SteeringConfig,
  'maxRoadWheelAngle' | 'steeringWheelLock' | 'steeringRatio' | 'highSpeedReferenceSpeed' | 'highSpeedMinimumAuthority'
>;

export interface ADASCollisionContactInfo {
  colliderId: string;
  colliderType?: 'guardrail' | 'wall' | 'building' | 'obstacle';
  maxHeight?: number;
  inwardSpeed: number;
  penetration: number;
}

export interface ADASCollisionSample {
  collided: boolean;
  deltaSpeedMps?: number;
  contacts: readonly ADASCollisionContactInfo[];
}

export type LocalTrajectoryMode =
  | 'center'
  | 'in_lane_offset'
  | 'partial_encroach'
  | 'lane_change'
  | 'driver_offset_hold';

export interface LocalTrajectoryState {
  active: boolean;
  mode: LocalTrajectoryMode;
  startOffsetM: number;
  targetOffsetM: number;
  currentOffsetM: number;
  currentHeadingShiftRad: number;
  currentCurvature: number;
  elapsedDistM: number;
  transitionLengthM: number;
  remainingTailClearM: number;
  corridorLeftHardM: number;
  corridorRightHardM: number;
  corridorLeftSoftM: number;
  corridorRightSoftM: number;
  boundaryEncroachment: 'none' | 'left_solid' | 'right_solid' | 'dashed_neighbor';
  speedCapMps: number;
  reason: string;
}

export type ADASPowertrainKind = 'ice' | 'ev' | 'hybrid' | 'ehs';
export type ADASSpeedProfile =
  | 'resume_after_avoidance'
  | 'start_from_stop'
  | 'normal_cruise'
  | 'overtaking'
  | 'highway_merge'
  | 'emergency_aeb';

export interface ADASVehicleDynamicsProfile {
  massKg: number;
  powertrainKind: ADASPowertrainKind;
  ratedPowerW: number;
  peakAccelMps2: number;
  throttleResponseRate: number;
  throttleExponent: number;
  hasSteppedGearbox: boolean;
  creepEnabled: boolean;
  maxRegenDecelMps2: number;
  understeerGradient: number;
  frontOverhangM: number;
  rearOverhangM: number;
  minTurningRadiusM: number;
}

export interface ADASVehicleState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  lateralVelocity: number;
  yawRate: number;
  acceleration: number;
  steeringAngle: number;
  steeringWheelAngle: number;
  throttle: number;
  brake: number;
  wheelBase: number;
  vehicleWidth: number;
  vehicleLength: number;
  steeringConfig: ADASSteeringGeometry;
  vehicleOperational: boolean;
  driveAvailable: boolean;
  forwardGear: boolean;
  parkingBrakeActive: boolean;
  autoHoldHolding: boolean;
  suspended: boolean;
  /** Optional physical transmission, powertrain & collision telemetry (populated in runtime orchestration). */
  transmissionType?: string;
  driveSelector?: 'P' | 'R' | 'N' | 'D' | null;
  reverseGear?: boolean;
  neutralGear?: boolean;
  supportsPark?: boolean;
  hasElectronicParkingBrake?: boolean;
  parkingBrakeEngaged?: boolean;
  collision?: ADASCollisionSample | null;
  dynamicsProfile?: ADASVehicleDynamicsProfile;
  currentGear?: number | string | null;
  currentGearRatio?: number;
  shiftInProgress?: boolean;
  kickdownActive?: boolean;
  hybridPath?: 'EV' | 'SERIES' | 'PARALLEL' | 'HEV' | null;
  hybridEngineRunning?: boolean;
  driveMode?: string;
  roadGripMultiplier?: number;
}

export interface ADASDriverInputSnapshot {
  steering: number;
  throttle: number;
  brake: number;
  handbrake: number;
  leftIndicatorEdge: boolean;
  rightIndicatorEdge: boolean;
  hazardEdge: boolean;
  leftSignalActive: boolean;
  rightSignalActive: boolean;
  hazardActive: boolean;
  adasToggleEdge: boolean;
}

export interface ADASWorldContext {
  navigationState: NavigationState | null;
  roadNetwork: RoadNetworkData | undefined;
  nearbyNetwork: RoadNetworkData | undefined;
  trafficSignals: TrafficSignalProvider | undefined;
  laneGraph?: import('../../world/navigation/lanegraph/LaneGraph').LaneGraph;
  /** Fallback signal snapshot getter for legacy grounds without TrafficSignalProvider. */
  getLegacyJunctionSignalColor?: (junctionId: string, controlKind: 'north-south' | 'east-west') => 'red' | 'amber' | 'green' | undefined;
  queryNearbyColliders?: (pose: { x: number; z: number }, radius: number) => readonly StaticCollider[];
  /** Optional direct actor list for tests or simple traffic injection (zero-copy read). */
  trafficActors?: readonly TrafficActorSnapshot[];
  /** Optional spatial provider for future AI traffic systems. */
  trafficActorProvider?: TrafficActorProvider;
  simulationTime: number;
  /** Timestamp of latest world/perception update; undefined means synchronized with simulationTime. */
  dataTimestamp?: number;
  /** Active intent requested by ADAS to prevent premature navigation reroute. */
  suppressNavigationReroute?: boolean;
  /** Surface friction/grip multiplier (1.0 = dry asphalt, < 0.9 = wet/slippery). */
  roadGripMultiplier?: number;
  /** Road surface wetness 0..1 (0 = dry, 1 = soaked). */
  wetness?: number;
  /** Visibility factor 0..1 (1 = clear, < 0.7 = fog/heavy rain). */
  visibilityFactor?: number;
}

/** Pre-allocated sample along the smoothed local planned trajectory. */
export interface ADASPathSample {
  s: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  curvature: number;
  speedLimitMps: number;
  speedLimitEstimated: boolean;
  roadId: string;
  laneId: string;
  laneIndex: number;
  approachLaneIndex: number;
  approachLaneCount: number;
  laneWidth: number;
  leftBoundary: LaneBoundaryKind;
  rightBoundary: LaneBoundaryKind;
  isJunction: boolean;
  junctionId: string;
  sectionIndex: number;
}

export interface UpcomingJunctionInfo {
  valid: boolean;
  junctionId: string;
  roadId: string;
  laneId: string;
  approachLaneIndex: number;
  approachLaneCount: number;
  turnDirection: TurnDirection;
  /** Distance from ego center along path to stop line (m). */
  distanceToStopLineM: number;
  /** Distance from ego center along path to junction entry (m). */
  distanceToJunctionEntryM: number;
  /** Distance from ego center along path to junction exit (m). */
  distanceToJunctionExitM: number;
  /** World coordinates of junction center for blockage checks. */
  centerX: number;
  centerY: number;
  centerZ: number;
  halfExtentX: number;
  halfExtentZ: number;
  /** Exit heading and start point for exit-lane blockage checks. */
  exitX: number;
  exitZ: number;
  exitYaw: number;
  controlKind?: 'north-south' | 'east-west';
  isRampTransition?: boolean;
  rampTransitionKind?: 'deceleration' | 'acceleration' | 'exit' | 'merge' | 'none';
}

export interface LaneChangePlanState {
  active: boolean;
  reason: 'none' | 'navigation' | 'obstacle' | 'lane-preference';
  direction: 'left' | 'right' | null;
  fromLaneIndex: number;
  toLaneIndex: number;
  phase: 'idle' | 'signaling' | 'executing' | 'settling';
  elapsedSeconds: number;
  durationSeconds: number;
  signalLeadSeconds: number;
  lateralDeltaM: number;
}

export interface OvertakingPlanState {
  active: boolean;
  phase: OvertakingPhase;
  targetActorId: string;
  originalLaneIndex: number;
  passingLaneIndex: number;
  elapsedSeconds: number;
  passedElapsedSeconds: number;
  leadSpeedSnapshotMps: number;
  overtakeTargetSpeedMps: number;
}

export interface ADASPlanSnapshot {
  valid: boolean;
  degraded: boolean;
  unavailableReason: string;
  derivedLaneGeometry: boolean;
  confidence: number;
  sampleCount: number;
  samples: ADASPathSample[];
  /** Index of sample closest to ego. */
  egoSampleIndex: number;
  egoS: number;
  lateralOffsetM: number;
  headingErrorRad: number;
  currentRoadId: string;
  currentRoadName: string;
  currentRoadType?: 'highway' | 'urban' | 'ramp' | 'circuit';
  currentRoadFunction?: string;
  currentIsHighwayTransition?: boolean;
  currentLaneId: string;
  currentLaneIndex: number;
  currentApproachLaneIndex: number;
  currentApproachLaneCount: number;
  currentLaneWidth: number;
  leftBoundary: LaneBoundaryKind;
  rightBoundary: LaneBoundaryKind;
  currentSpeedLimitMps: number;
  speedLimitEstimated: boolean;
  remainingRouteDistanceM: number;
  maneuver: ADASManeuverType;
  desiredTurnSignal: TurnSignalRequest;
  inJunction: boolean;
  nearJunctionSolidZone: boolean;
  upcomingJunction: UpcomingJunctionInfo;
  laneChange: LaneChangePlanState;
  overtaking: OvertakingPlanState;
  localTrajectory?: LocalTrajectoryState;
  routeVersion: number;
  /** V3.5 free-driving, map degradation & driver-intent navigation coordination fields */
  drivingMode?: ADASDrivingMode;
  degradationLevel?: number;
  awaitingJunctionIntent?: boolean;
  driverPreferredTurn?: TurnSignalRequest;
  activeIntent?: ADASDriverIntentKind;
  requestNavReroute?: boolean;
}

export interface AdjacentLaneClearance {
  exists: boolean;
  boundaryCrossable: boolean;
  safe: boolean;
  frontGapM: number;
  frontSpeedMps: number;
  rearGapM: number;
  minTTCSeconds: number;
  routeCompatible: boolean;
  blockReason: string;
}

export interface ADASObstacleAssessment {
  valid: boolean;
  dataReliable: boolean;
  actorCount: number;
  hasLeadActor: boolean;
  leadActorId: string;
  leadActorKind: TrafficActorSnapshot['kind'] | 'none';
  leadIsStatic: boolean;
  leadX: number;
  leadY: number;
  leadZ: number;
  leadYaw: number;
  leadWidth: number;
  leadLength: number;
  leadHeight: number;
  leadInCorridor: boolean;
  leadIsInfrastructure?: boolean;
  leadMotionDirection: 'same' | 'oncoming' | 'crossing' | 'static' | 'none';
  /** Net bumper-to-bumper longitudinal gap (m). */
  leadGapM: number;
  /** Lead longitudinal speed along path (m/s). */
  leadSpeedMps: number;
  /** Closing speed: egoSpeed - leadSpeed (m/s). Positive when closing. */
  closingSpeedMps: number;
  /** Time to collision (s); Infinity when not closing. */
  ttcSeconds: number;
  cutInDetected: boolean;
  junctionBlocked: boolean;
  roadBlocked: boolean;
  allowSolidBypass: boolean;
  /** Recommended safe speed due to lead/obstacle (m/s). */
  targetSpeedMps: number;
  /** Recommended speed while confirmed evasion/overtaking lane change is active (m/s). */
  avoidanceTargetSpeedMps: number;
  /** True when lateral lane change can safely clear obstacle without full stop braking. */
  canEvadeWithoutStopping: boolean;
  overtakeRecommended: boolean;
  overtakeDirection: 'left' | 'right' | null;
  overtakeActorId: string;
  overtakenActorFound: boolean;
  overtakenActorBehindGapM: number;
  overtakenActorX: number;
  overtakenActorY: number;
  overtakenActorZ: number;
  overtakenActorYaw: number;
  overtakenActorWidth: number;
  overtakenActorLength: number;
  overtakenActorHeight: number;
  overtakenActorKind: TrafficActorSnapshot['kind'] | 'none';
  /** If stopping behind static/stopped obstacle, distance to stop (m), else Infinity. */
  stopDistanceM: number;
  emergencyBraking: boolean;
  emergencyBrakeDemand: number;
  avoidanceRequest: 'none' | 'left' | 'right';
  leftLane: AdjacentLaneClearance;
  rightLane: AdjacentLaneClearance;
  reason: string;
}

export interface ADASTrafficRuleDecision {
  signalDecision: TrafficSignalDecisionKind;
  signalColor: 'red' | 'amber' | 'green' | 'none';
  mustStop: boolean;
  /** Distance from ego center to stop target (m); Infinity if no stop required. */
  stopDistanceM: number;
  /** Smoothed road speed limit (m/s). */
  speedLimitMps: number;
  speedLimitEstimated: boolean;
  /** Speed cap from upcoming lower ramp/zone speed limits (m/s). */
  rampSpeedCapMps?: number;
  /** Speed cap from upcoming curves and junction turns (m/s). */
  curveAndTurnSpeedCapMps: number;
  /** Speed cap from destination arrival (m/s). */
  arrivalSpeedCapMps: number;
  /** Combined legal & geometry target speed (m/s). */
  targetSpeedMps: number;
  reason: string;
}

export interface ADASDriverOverrideState {
  steeringOverride: boolean;
  accelerationOverride: boolean;
  brakeOverride: boolean;
  manualTurnSignalActive: boolean;
  /** Smooth 0..1 blend factor for ADAS lateral steering authority. */
  steeringBlend: number;
  /** Temporary elevated speed target during/after driver throttle override (m/s). */
  overrideTargetSpeedMps: number;
  /** True on the single step when driver steering override completes and ADAS should adopt current lane. */
  steeringJustReleased: boolean;
  /** V3.5 independent lateral/longitudinal collaboration & driver-stop hold */
  lateralAuthority?: ADASControlAuthority;
  longitudinalAuthority?: ADASControlAuthority;
  controlAuthority?: ADASControlAuthority;
  driverStandstillHold?: boolean;
  brakeReacquireRemainingS?: number;
  manualSignalIntent?: TurnSignalRequest;
  pendingTurnIntent?: ADASDriverIntentKind;
}

export interface ADASSteeringCommand {
  steering: number;
  lookAheadM: number;
  targetCurvature: number;
  active: boolean;
}

export interface ADASSpeedCommand {
  throttle: number;
  brake: number;
  targetSpeedMps: number;
  desiredAccelMps2: number;
  holdingStandstill: boolean;
}

export interface ADASPerformanceMetrics {
  lastStepMs: number;
  avgStepMs: number;
  lastPlannerMs: number;
  lastPerceptionMs: number;
  plannerUpdates: number;
  perceptionUpdates: number;
}

export type ADASBrakeSource =
  | 'NONE'
  | 'REAL_OBSTACLE'
  | 'INFRASTRUCTURE_COLLIDER'
  | 'TRAFFIC_SIGNAL'
  | 'JUNCTION_BLOCKED'
  | 'ROAD_SPEED_LIMIT'
  | 'CURVE_SPEED_CAP'
  | 'RAMP_DECELERATION'
  | 'ARRIVAL_STOP'
  | 'PLAN_INVALID'
  | 'UNATTRIBUTED_BRAKE';

export interface ADASBrakeAttribution {
  active: boolean;
  source: ADASBrakeSource;
  reason: string;
  targetId: string;
  targetKind: TrafficActorSnapshot['kind'] | 'none';
  targetX: number;
  targetY: number;
  targetZ: number;
  distanceM: number;
  ttcSeconds: number;
  corridorOverlap: boolean;
  targetSpeedMps: number;
  desiredAccelMps2: number;
  brakeCommand: number;
}

export interface ADASStatusSnapshot {
  enabled: boolean;
  state: ADASState;
  previousState: ADASState;
  maneuver: ADASManeuverType;
  targetSpeedKmh: number;
  speedLimitKmh: number;
  speedLimitEstimated: boolean;
  currentRoadName: string;
  currentLaneIndex: number;
  approachLaneIndex: number;
  approachLaneCount: number;
  desiredTurnSignal: TurnSignalRequest;
  signalDecision: TrafficSignalDecisionKind;
  signalColor: 'red' | 'amber' | 'green' | 'none';
  leadGapM: number | null;
  ttcSeconds: number | null;
  leadActorId?: string;
  leadActorKind?: TrafficActorSnapshot['kind'] | 'none';
  leadDistanceM?: number | null;
  leadClosingSpeedKmh?: number | null;
  leadInCorridor?: boolean;
  driverSteeringOverride: boolean;
  driverAccelerationOverride: boolean;
  driverBrakeOverride: boolean;
  degraded: boolean;
  overtakingPhase?: OvertakingPhase;
  brakeAttribution?: ADASBrakeAttribution;
  collisionLocked?: boolean;
  collisionTargetLabel?: string;
  hazardRequested?: boolean;
  blockedRecoveryPhase?: ADASState | 'NONE';
  reverseDistanceRemainingM?: number;
  drivingMode?: ADASDrivingMode;
  controlAuthority?: ADASControlAuthority;
  driverIntent?: ADASDriverIntentKind;
  stopOrigin?: ADASStopOrigin;
  requestNavReroute?: boolean;
  reason: string;
  performance: ADASPerformanceMetrics;
}

export interface ADASConfig {
  /** Planner update cadence (Hz). Requirement: 5-10 Hz. */
  plannerHz: number;
  /** Perception & traffic rules cadence (Hz). Requirement: 10-20 Hz. */
  perceptionHz: number;
  /** Maximum data age before treating world/perception data as stale (s). */
  maxDataAgeSeconds: number;
  /** Maximum permitted overspeed above road limit during driver throttle override (m/s). */
  driverOverrideMaxOverspeedMps: number;
  /** Decay rate back to road limit after releasing driver throttle override (m/s^2). */
  driverOverrideDecayMps2: number;
  /** Conservative fallback speed limits (km/h) when road.speedLimit is absent. */
  defaultSpeedLimitKmh: {
    highway: number;
    urban: number;
    ramp: number;
    circuit: number;
    unknown: number;
  };
  /** Comfortable lateral acceleration cap for corners (m/s^2). */
  maxComfortLateralAccelMps2: number;
  /** Maximum speed inside tight urban junction turns (m/s). */
  junctionTurnSpeedMps: number;
  /** Maximum speed for U-turns (m/s). */
  uturnSpeedMps: number;
  /** Desired following time headway (s). */
  followTimeHeadwayS: number;
  /** Minimum standstill bumper-to-bumper gap behind lead vehicle/obstacle (m). */
  minStandstillGapM: number;
  /** Stop buffer behind traffic light stop line from front bumper (m). */
  stopLineBufferM: number;
  /** Comfortable braking deceleration (m/s^2). */
  comfortDecelMps2: number;
  /** Maximum normal service braking deceleration (m/s^2). */
  maxNormalDecelMps2: number;
  /** Comfortable acceleration (m/s^2). */
  comfortAccelMps2: number;
  /** TTC threshold triggering immediate emergency braking (s). */
  aebTtcThresholdS: number;
  /** Minimum net gap triggering immediate AEB when closing (m). */
  aebCriticalGapM: number;
  /** Perception spatial query radius (m). */
  perceptionRadiusM: number;
  /** Pre-junction solid zone where automated lane changes are forbidden (m). */
  preJunctionSolidZoneM: number;
  /** Distance ahead to begin strategic lane change for upcoming turns (m). */
  strategicLaneChangeLeadM: number;
  /** Distance ahead to turn on pre-junction turn signal (m). */
  turnSignalLeadM: number;
  /** Turn signal pre-blink time before initiating lane change lateral motion (s). */
  laneChangeSignalLeadS: number;
  /** Target lane-change lateral acceleration cap (m/s^2). */
  laneChangeMaxLatAccelMps2: number;
  /** Driver steering override entry threshold (normalized steering). */
  driverSteerOverrideThreshold: number;
  /** Driver steering release threshold (normalized steering). */
  driverSteerReleaseThreshold: number;
  /** Time below release threshold before re-acquiring lateral control (s). */
  driverSteerReacquireSeconds: number;
  /** Driver throttle override threshold. */
  driverThrottleOverrideThreshold: number;
  /** Driver brake override threshold. */
  driverBrakeOverrideThreshold: number;
  /** Lookahead distance for highway exit planning (m). */
  rampExitLookAheadDistanceM: number;
  /** Distance allocated per required lane change to exit (m). */
  perLaneChangeLeadDistanceM: number;
  /** Distance to maintain previous curvature/heading on unmarked road (m). */
  unmarkedRoadHoldDistanceM: number;
  /** Lateral clearance margin for obstacle bypass (m). */
  obstacleBypassLateralMarginM: number;
  /** Speed cap during obstacle bypass across dashed/solid lane boundary (m/s). */
  obstacleBypassSpeedCapMps: number;
  /** Comfort jerk limit (m/s^3). */
  jerkComfortLimitMps3: number;
  /** Normal maximum jerk limit (m/s^3). */
  jerkNormalLimitMps3: number;
  /** Dynamic observation lookahead for high-speed highway cruising (m). */
  highwayObservationLookaheadM: number;
  /** Gentle acceleration limit when resuming cruise right after clearing an obstacle (m/s^2). */
  resumeAccelAfterAvoidanceMps2: number;
  /** Progressive launch acceleration limit when starting from standstill (m/s^2). */
  startFromStopMaxAccelMps2: number;
  /** Enable active overtaking & passing lane return strategy. */
  overtakingEnabled: boolean;
  /** Maximum ratio above road speed limit permitted during active highway overtaking (e.g. 1.20 = 120%). */
  aggressiveOvertakeMaxLimitRatio: number;
  /** Minimum speed deficit vs desired cruise speed (m/s) before initiating active overtake. */
  overtakingMinSpeedDiffMps: number;
  /** Minimum road speed limit (m/s) required to allow above-limit aggressive overtaking boost (urban < 50 km/h stays within limit). */
  overtakingMinRoadLimitMps: number;
  /** Minimum bumper-to-bumper lead ahead of overtaken vehicle (m) before signaling return to original lane. */
  overtakingPassClearanceM: number;
  /** Minimum dwell time after passing clearance threshold before returning to original lane (s). */
  overtakingReturnDelayS: number;
  /** V3.5 driver collaboration & map-degradation hold tuning */
  driverBrakeReacquireSeconds?: number;
  driverStandstillBrakeHoldSpeedMps?: number;
  degradedHoldMaxDistanceM?: number;
  degradedMinSpeedMps?: number;
}

export const DEFAULT_ADAS_CONFIG: Readonly<ADASConfig> = Object.freeze({
  plannerHz: 10,
  perceptionHz: 20,
  maxDataAgeSeconds: 1.0,
  driverOverrideMaxOverspeedMps: 25 / 3.6,
  driverOverrideDecayMps2: 1.4,
  defaultSpeedLimitKmh: {
    highway: 80,
    urban: 40,
    ramp: 35,
    circuit: 60,
    unknown: 35,
  },
  maxComfortLateralAccelMps2: 2.5,
  junctionTurnSpeedMps: 6.5,
  uturnSpeedMps: 4.5,
  followTimeHeadwayS: 1.6,
  minStandstillGapM: 4.5,
  stopLineBufferM: 1.0,
  comfortDecelMps2: 2.4,
  maxNormalDecelMps2: 4.2,
  comfortAccelMps2: 1.8,
  aebTtcThresholdS: 1.35,
  aebCriticalGapM: 2.8,
  perceptionRadiusM: 70,
  preJunctionSolidZoneM: 18,
  strategicLaneChangeLeadM: 110,
  turnSignalLeadM: 45,
  laneChangeSignalLeadS: 1.8,
  laneChangeMaxLatAccelMps2: 1.25,
  driverSteerOverrideThreshold: 0.14,
  driverSteerReleaseThreshold: 0.055,
  driverSteerReacquireSeconds: 0.45,
  driverThrottleOverrideThreshold: 0.05,
  driverBrakeOverrideThreshold: 0.04,
  rampExitLookAheadDistanceM: 600,
  perLaneChangeLeadDistanceM: 160,
  unmarkedRoadHoldDistanceM: 100,
  obstacleBypassLateralMarginM: 0.65,
  obstacleBypassSpeedCapMps: 30 / 3.6,
  jerkComfortLimitMps3: 2.5,
  jerkNormalLimitMps3: 5.0,
  highwayObservationLookaheadM: 185,
  resumeAccelAfterAvoidanceMps2: 1.0,
  startFromStopMaxAccelMps2: 1.2,
  overtakingEnabled: true,
  aggressiveOvertakeMaxLimitRatio: 1.20,
  overtakingMinSpeedDiffMps: 2.5,
  overtakingMinRoadLimitMps: 50 / 3.6,
  overtakingPassClearanceM: 18.0,
  overtakingReturnDelayS: 0.8,
  driverBrakeReacquireSeconds: 0.35,
  driverStandstillBrakeHoldSpeedMps: 0.28,
  degradedHoldMaxDistanceM: 55,
  degradedMinSpeedMps: 5.0,
});

export function createEmptyPathSample(): ADASPathSample {
  return {
    s: 0,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    curvature: 0,
    speedLimitMps: 40 / 3.6,
    speedLimitEstimated: true,
    roadId: '',
    laneId: '',
    laneIndex: 0,
    approachLaneIndex: 0,
    approachLaneCount: 1,
    laneWidth: 3.5,
    leftBoundary: 'unavailable',
    rightBoundary: 'unavailable',
    isJunction: false,
    junctionId: '',
    sectionIndex: 0,
  };
}

export function createEmptyTrafficActor(): TrafficActorSnapshot {
  return {
    id: '',
    kind: 'static-obstacle',
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    speed: 0,
    vx: 0,
    vz: 0,
    length: 0,
    width: 0,
    height: 0,
    confidence: 1,
    timestamp: 0,
  };
}

export function createEmptyUpcomingJunction(): UpcomingJunctionInfo {
  return {
    valid: false,
    junctionId: '',
    roadId: '',
    laneId: '',
    approachLaneIndex: 0,
    approachLaneCount: 1,
    turnDirection: 'straight',
    distanceToStopLineM: Infinity,
    distanceToJunctionEntryM: Infinity,
    distanceToJunctionExitM: Infinity,
    centerX: 0,
    centerY: 0,
    centerZ: 0,
    halfExtentX: 0,
    halfExtentZ: 0,
    exitX: 0,
    exitZ: 0,
    exitYaw: 0,
    isRampTransition: false,
    rampTransitionKind: 'none',
  };
}

export function createEmptyBrakeAttribution(): ADASBrakeAttribution {
  return {
    active: false,
    source: 'NONE',
    reason: '',
    targetId: '',
    targetKind: 'none',
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    distanceM: Infinity,
    ttcSeconds: Infinity,
    corridorOverlap: false,
    targetSpeedMps: 0,
    desiredAccelMps2: 0,
    brakeCommand: 0,
  };
}

export function createEmptyLocalTrajectoryState(): LocalTrajectoryState {
  return {
    active: false,
    mode: 'center',
    startOffsetM: 0,
    targetOffsetM: 0,
    currentOffsetM: 0,
    currentHeadingShiftRad: 0,
    currentCurvature: 0,
    elapsedDistM: 0,
    transitionLengthM: 18,
    remainingTailClearM: 0,
    corridorLeftHardM: -1.75,
    corridorRightHardM: 1.75,
    corridorLeftSoftM: -1.65,
    corridorRightSoftM: 1.65,
    boundaryEncroachment: 'none',
    speedCapMps: Infinity,
    reason: '',
  };
}

/**
 * Evaluate the continuous C2 quintic local lateral offset (m, positive = right of lane centerline)
 * at longitudinal lookahead `ds` (m ahead of ego; ds=0 is ego's current progress). Zero allocations.
 */
export function evaluateLocalTrajectoryOffsetAtDs(
  lt: Readonly<LocalTrajectoryState> | undefined,
  ds: number,
): number {
  if (!lt || !lt.active) return 0;
  const span = Math.max(2.0, lt.transitionLengthM);
  const tau = clampADAS((lt.elapsedDistM + ds) / span, 0, 1);
  const sCurve = tau * tau * tau * (10 + tau * (-15 + 6 * tau));
  return lt.startOffsetM + (lt.targetOffsetM - lt.startOffsetM) * sCurve;
}

export function evaluateLocalTrajectorySlopeAtDs(
  lt: Readonly<LocalTrajectoryState> | undefined,
  ds: number,
): number {
  if (!lt || !lt.active) return 0;
  const delta = lt.targetOffsetM - lt.startOffsetM;
  if (Math.abs(delta) < 1e-4) return 0;
  const span = Math.max(2.0, lt.transitionLengthM);
  const tau = clampADAS((lt.elapsedDistM + ds) / span, 0, 1);
  if (tau <= 0 || tau >= 1) return 0;
  const dsDtau = 30 * tau * tau * (1 - tau) * (1 - tau);
  return (dsDtau * delta) / span;
}

export function evaluateLocalTrajectoryCurvatureAtDs(
  lt: Readonly<LocalTrajectoryState> | undefined,
  ds: number,
): number {
  if (!lt || !lt.active) return 0;
  const delta = lt.targetOffsetM - lt.startOffsetM;
  if (Math.abs(delta) < 1e-4) return 0;
  const span = Math.max(2.0, lt.transitionLengthM);
  const tau = clampADAS((lt.elapsedDistM + ds) / span, 0, 1);
  if (tau <= 0 || tau >= 1) return 0;
  const d2sDtau2 = 60 * tau - 180 * tau * tau + 120 * tau * tau * tau;
  return clampADAS((d2sDtau2 * delta) / (span * span), -0.08, 0.08);
}

export function createEmptyAdjacentClearance(): AdjacentLaneClearance {
  return {
    exists: false,
    boundaryCrossable: false,
    safe: false,
    frontGapM: Infinity,
    frontSpeedMps: Infinity,
    rearGapM: Infinity,
    minTTCSeconds: Infinity,
    routeCompatible: false,
    blockReason: '',
  };
}

export function wrapADASAngle(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function clampADAS(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}
