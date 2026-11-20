/**
 * Lane Graph System Types.
 * Represents high-definition lane-level topology and geometry for ADAS and AI navigation.
 */

export interface LanePoint {
  x: number;
  y: number;
  z: number;
  /** Station / arc-length along this lane in metres */
  s: number;
  /** Heading in radians (-PI to PI, standard SI: angle from +Z toward -X / Three.js convention) */
  heading: number;
  /** Road curvature in rad/m (positive = curving right, negative = curving left) */
  curvature: number;
  /** Vertical grade (dy/ds) */
  grade: number;
}

export type LaneBoundaryType =
  | 'solid-white'
  | 'broken-white'
  | 'solid-yellow'
  | 'double-yellow'
  | 'curb'
  | 'barrier'
  | 'virtual'
  | 'none';

export interface LaneBoundary {
  type: LaneBoundaryType;
  /** Metre points along the boundary line */
  points: LanePoint[];
}

export type LaneManeuver = 'straight' | 'left' | 'right' | 'u-turn';

export interface LaneConflictArea {
  intersectionId: string;
  conflictingLaneIds: string[];
  /** Approximate bounding box for conflict point */
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    minY: number;
    maxY: number;
  };
}

export interface LaneStopLine {
  intersectionId: string;
  signalId?: string;
  position: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  width: number;
}

export interface LaneEdge {
  /** Unique ID, e.g. "road_1:lane:0" or "virtual:int_1:lane_a->lane_b" */
  id: string;
  /** Parent road ID or intersection ID if virtual */
  roadId: string;
  /** Whether this is a virtual junction connector lane */
  isVirtual: boolean;
  /** Index across carriageway from left to right in travel direction */
  index: number;
  /** Direction of travel along centerline points */
  direction: 'forward' | 'reverse';
  /** Lane width in metres */
  width: number;
  /** Speed limit in m/s */
  speedLimitMps: number;
  /** Speed limit in km/h */
  speedLimitKmh: number;
  /** Centerline sample points from start to end */
  centerline: LanePoint[];
  /** Total length of lane in metres */
  length: number;
  /** Left boundary delimiter */
  leftBoundary: LaneBoundary;
  /** Right boundary delimiter */
  rightBoundary: LaneBoundary;
  /** Legal permission to change into adjacent left lane */
  laneChangeLeft: boolean;
  /** Legal permission to change into adjacent right lane */
  laneChangeRight: boolean;
  /** Adjacent left lane ID, if any */
  leftLaneId?: string;
  /** Adjacent right lane ID, if any */
  rightLaneId?: string;
  /** Predecessor lane IDs (upstream lanes feeding into this lane) */
  predecessors: string[];
  /** Successor lane IDs (downstream lanes this lane leads into) */
  successors: string[];
  /** Permitted maneuvers for this lane */
  allowedManeuvers: LaneManeuver[];
  /** Virtual lane turn direction, if applicable */
  turnDirection?: 'straight' | 'left' | 'right' | 'u-turn';
  /** Stop line before intersection, if applicable */
  stopLine?: LaneStopLine;
  /** Associated traffic signal ID */
  trafficSignalId?: string;
  /** Conflict zones with other lanes inside intersections */
  conflictAreas?: LaneConflictArea[];
  /** Elevation profile */
  elevationProfile: {
    minY: number;
    maxY: number;
    averageGrade: number;
  };
  /** Curvature profile */
  curvatureProfile: {
    maxCurvature: number;
    meanCurvature: number;
  };
  /** Vertical layer index (0: ground, 1: elevated, -1: tunnel, etc.) */
  layerIndex: number;
  /** Road classification kind */
  roadFunction?: string;
  /** Ramp transition kind, if applicable */
  rampKind?: 'entrance-taper' | 'exit-taper' | 'connecting-ramp';
}

export interface RoadMarkingConflict {
  roadId: string;
  kind:
    | 'yellow-between-same-direction'
    | 'missing-double-yellow'
    | 'missing-barrier-median'
    | 'broken-outer-edge'
    | 'boundary-disconnect'
    | 'overlapping-paint'
    | 'elevation-cliff';
  description: string;
  location: { x: number; y: number; z: number };
  severity: 'warning' | 'error';
}

export interface LaneGraphValidationReport {
  valid: boolean;
  totalLanes: number;
  physicalLanes: number;
  virtualLanes: number;
  isolatedLanes: string[];
  deadEnds: string[];
  markingConflicts: RoadMarkingConflict[];
  elevationCliffCount: number;
}
