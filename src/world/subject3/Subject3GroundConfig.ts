export interface Subject3Point2 {
  readonly x: number;
  readonly z: number;
}

export type Subject3RoadClass = 'arterial' | 'standard' | 'narrow';

export interface Subject3RoadSegmentConfig {
  readonly id: string;
  readonly name: string;
  readonly roadClass: Subject3RoadClass;
  readonly start: Subject3Point2;
  readonly end: Subject3Point2;
  /** Total asphalt width in metres. */
  readonly width: number;
  /** One or two bend points between start and end. */
  readonly via?: readonly Subject3Point2[];
  readonly speedLimitKmh?: number;
}

export type Subject3JunctionKind = 'signalised' | 'plain';

export interface Subject3JunctionConfig {
  readonly id: string;
  readonly center: Subject3Point2;
  readonly kind: Subject3JunctionKind;
  /**
   * Which approach pair the junction's main signals serve. The other pair is
   * always the conflicting direction. Only meaningful for signalised junctions.
   */
  readonly signalQuadrant?: 'north-south' | 'east-west';
  /** Signal cycle offset so neighbouring lights are not in phase. */
  readonly signalOffsetSeconds?: number;
}

export type Subject3ZoneKind =
  | 'school-zone'
  | 'bus-stop'
  | 'straight-driving'
  | 'gear-change'
  | 'lane-change'
  | 'overtaking'
  | 'u-turn'
  | 'pull-over-parking'
  | 'meeting'
  | 'start-area';

/**
 * Authored, permissive region metadata for the shared Subject 3 map. It is
 * exposed for later examination-route authoring; no rule or scoring logic reads
 * it yet.
 */
export interface Subject3ZoneConfig {
  readonly id: string;
  readonly kind: Subject3ZoneKind;
  readonly label: string;
  readonly bounds: {
    readonly minimumX: number;
    readonly maximumX: number;
    readonly minimumZ: number;
    readonly maximumZ: number;
  };
  /** Optional travel direction hint used by later route authoring. */
  readonly headingRadians?: number;
}

export interface Subject3GroundConfig {
  readonly site: {
    /** East-west extent in metres. */
    readonly length: number;
    /** North-south extent in metres. */
    readonly width: number;
  };
  readonly spawn: {
    readonly position: Subject3Point2;
    readonly yawRadians: number;
  };
  readonly roads: readonly Subject3RoadSegmentConfig[];
  readonly junctions: readonly Subject3JunctionConfig[];
  readonly zones: readonly Subject3ZoneConfig[];
  readonly lanes: {
    readonly arterialLaneWidth: number;
    readonly standardLaneWidth: number;
    readonly narrowLaneWidth: number;
  };
  readonly markings: {
    readonly lineWidth: number;
    readonly thinLineWidth: number;
    readonly surfaceClearance: number;
    readonly dashLength: number;
    readonly dashGap: number;
    readonly junctionMargin: number;
  };
  readonly junction: {
    readonly crosswalkWidth: number;
    readonly crosswalkStripeWidth: number;
    readonly crosswalkStripeGap: number;
    /** Distance from the crosswalk to the centre of the first guide arrow. */
    readonly arrowOffset: number;
    readonly secondArrowOffset: number;
    readonly arrowLength: number;
    readonly arrowWidth: number;
  };
  readonly trafficSignals: {
    readonly greenSeconds: number;
    readonly amberSeconds: number;
    readonly allRedSeconds: number;
    readonly headHeight: number;
  };
  readonly environment: {
    readonly sidewalkWidth: number;
    readonly sidewalkHeight: number;
    readonly lampSpacing: number;
    readonly treeSpacing: number;
  };
  readonly surface: {
    readonly asphaltGrip: number;
    readonly asphaltRollingResistance: number;
    readonly sidewalkGrip: number;
    readonly sidewalkRollingResistance: number;
    readonly grassGrip: number;
    readonly grassRollingResistance: number;
    readonly shoulderBlendDepth: number;
  };
}

const segment = (
  id: string, name: string, roadClass: Subject3RoadClass,
  start: Subject3Point2, end: Subject3Point2, width: number,
  via?: readonly Subject3Point2[], speedLimitKmh?: number,
): Subject3RoadSegmentConfig => ({ id, name, roadClass, start, end, width, via, speedLimitKmh });

/** Shared city, not an authored examination route. Two offset cross-streets
 * preserve long uninterrupted sections on opposite sides of the network. */
export const SUBJECT3_ROAD_SEGMENTS: readonly Subject3RoadSegmentConfig[] = Object.freeze([
  segment('main-west', '西侧主路', 'arterial', { x: -280, z: -340 }, { x: -280, z: 340 }, 14.4, undefined, 50),
  segment('main-east', '东侧主路', 'standard', { x: 280, z: -340 }, { x: 280, z: 340 }, 7.2, undefined, 50),
  segment('north-road', '展览馆路', 'standard', { x: -280, z: -280 }, { x: 280, z: -280 }, 7.2),
  segment('south-road', '商业街', 'standard', { x: -280, z: 280 }, { x: 280, z: 280 }, 7.2),
  segment('middle-west', '学校路', 'standard', { x: -340, z: 50 }, { x: 60, z: 50 }, 7.2, undefined, 30),
  segment('middle-east', '东部横向主路', 'arterial', { x: -60, z: -60 }, { x: 340, z: -60 }, 14.4, undefined, 50),
  segment('central-street', '中央内街', 'narrow', { x: 0, z: -280 }, { x: 18, z: 280 }, 6.8,
    [{ x: 0, z: 110 }, { x: 18, z: 150 }], 30),
  segment('south-east-street', '东南生活支路', 'narrow', { x: 165, z: 280 }, { x: 175, z: 160 }, 6.8,
    [{ x: 175, z: 205 }], 30),
]);

export const SUBJECT3_JUNCTIONS: readonly Subject3JunctionConfig[] = Object.freeze([
  { id: 'junction-west-middle', center: { x: -280, z: 50 }, kind: 'signalised', signalOffsetSeconds: 0 },
  { id: 'junction-east-middle', center: { x: 280, z: -60 }, kind: 'signalised', signalOffsetSeconds: 11 },
  { id: 'junction-central-east', center: { x: 0, z: -60 }, kind: 'plain' },
  { id: 'junction-central-west', center: { x: 0, z: 50 }, kind: 'plain' },
  { id: 'junction-west-north', center: { x: -280, z: -280 }, kind: 'plain' },
  { id: 'junction-east-north', center: { x: 280, z: -280 }, kind: 'plain' },
  { id: 'junction-central-north', center: { x: 0, z: -280 }, kind: 'plain' },
  { id: 'junction-west-south', center: { x: -280, z: 280 }, kind: 'plain' },
  { id: 'junction-east-south', center: { x: 280, z: 280 }, kind: 'plain' },
  { id: 'junction-central-south', center: { x: 18, z: 280 }, kind: 'plain' },
  { id: 'junction-south-east-tee', center: { x: 165, z: 280 }, kind: 'plain' },
]);

/** Landmark footprints, shared by builders and furniture-clearance checks.
 * They never straddle asphalt, and all lie inside the 800 m site. */
export const SUBJECT3_PLACES = Object.freeze({
  school: { minimumX: -230, maximumX: -110, minimumZ: -35, maximumZ: 40, gateX: -170 },
  bus: { x: -270.5, z: -130, width: 3, length: 26 },
  supermarket: { x: -190, z: 335, width: 42, depth: 22,
    forecourt: { minimumX: -242, maximumX: -138, minimumZ: 284, maximumZ: 354 },
    drivewayX: -225, drivewayWidth: 7 },
  northDome: { x: 155, z: -340 },
  park: { minimumX: 65, maximumX: 140, minimumZ: 110, maximumZ: 195 },
});

/** Reserved regions only: no routes, scoring, triggers or examination logic. */
export const SUBJECT3_ZONES: readonly Subject3ZoneConfig[] = Object.freeze([
  { id: 'start-area', kind: 'start-area', label: '西侧起步区',
    bounds: { minimumX: -287.2, maximumX: -272.8, minimumZ: 180, maximumZ: 250 }, headingRadians: 0 },
  { id: 'west-main-straight', kind: 'straight-driving', label: '西侧长直路',
    bounds: { minimumX: -287.2, maximumX: -272.8, minimumZ: -260, maximumZ: 30 }, headingRadians: 0 },
  { id: 'west-gear-change', kind: 'gear-change', label: '西侧加减挡预留',
    bounds: { minimumX: -287.2, maximumX: -272.8, minimumZ: -220, maximumZ: -30 }, headingRadians: 0 },
  { id: 'west-lane-change', kind: 'lane-change', label: '西侧变道预留',
    bounds: { minimumX: -287.2, maximumX: -272.8, minimumZ: -210, maximumZ: -60 }, headingRadians: 0 },
  { id: 'east-main-straight', kind: 'straight-driving', label: '东侧长直路',
    bounds: { minimumX: 276.4, maximumX: 283.6, minimumZ: -40, maximumZ: 260 }, headingRadians: Math.PI },
  { id: 'school-zone', kind: 'school-zone', label: '校门前区域',
    bounds: { minimumX: -210, maximumX: -130, minimumZ: 44, maximumZ: 56 }, headingRadians: -Math.PI / 2 },
  { id: 'bus-stop-zone', kind: 'bus-stop', label: '公交站前区域',
    bounds: { minimumX: -280, maximumX: -268, minimumZ: -148, maximumZ: -112 }, headingRadians: 0 },
  { id: 'meeting-zone', kind: 'meeting', label: '中央窄路会车预留',
    bounds: { minimumX: -3.4, maximumX: 3.4, minimumZ: -220, maximumZ: -130 }, headingRadians: 0 },
  { id: 'u-turn-zone', kind: 'u-turn', label: '西侧宽路掉头预留',
    bounds: { minimumX: -287.2, maximumX: -272.8, minimumZ: 120, maximumZ: 170 }, headingRadians: 0 },
  { id: 'pull-over-west', kind: 'pull-over-parking', label: '西侧平直靠边预留',
    bounds: { minimumX: -280, maximumX: -272.8, minimumZ: 80, maximumZ: 220 }, headingRadians: 0 },
  { id: 'pull-over-east', kind: 'pull-over-parking', label: '东侧平直靠边预留',
    bounds: { minimumX: 276.4, maximumX: 280, minimumZ: 40, maximumZ: 210 }, headingRadians: Math.PI },
]);

export const DEFAULT_SUBJECT3_GROUND_CONFIG: Subject3GroundConfig = {
  site: { length: 800, width: 800 },
  spawn: { position: { x: -274.6, z: 220 }, yawRadians: 0 },
  roads: SUBJECT3_ROAD_SEGMENTS,
  junctions: SUBJECT3_JUNCTIONS,
  zones: SUBJECT3_ZONES,
  lanes: { arterialLaneWidth: 3.6, standardLaneWidth: 3.6, narrowLaneWidth: 3.4 },
  markings: {
    lineWidth: 0.15, thinLineWidth: 0.1, surfaceClearance: 0.012,
    dashLength: 4, dashGap: 6, junctionMargin: 2.5,
  },
  junction: {
    crosswalkWidth: 3.2, crosswalkStripeWidth: 0.45, crosswalkStripeGap: 0.6,
    arrowOffset: 9.5, secondArrowOffset: 20, arrowLength: 4.2, arrowWidth: 1.6,
  },
  trafficSignals: { greenSeconds: 20, amberSeconds: 3, allRedSeconds: 1.5, headHeight: 5.1 },
  environment: { sidewalkWidth: 3.2, sidewalkHeight: 0.14, lampSpacing: 48, treeSpacing: 35 },
  surface: {
    asphaltGrip: 1, asphaltRollingResistance: 1,
    sidewalkGrip: 0.9, sidewalkRollingResistance: 1.35,
    grassGrip: 0.55, grassRollingResistance: 3, shoulderBlendDepth: 1.1,
  },
};
