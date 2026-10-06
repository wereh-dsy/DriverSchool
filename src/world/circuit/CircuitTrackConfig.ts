export interface CircuitPoint2 {
  readonly x: number;
  readonly z: number;
}

export type CircuitCornerKind = 'flowing' | 'gentle-left' | 'braking';

export interface CircuitCornerConfig {
  readonly id: string;
  readonly label: string;
  readonly vertex: CircuitPoint2;
  readonly radius: number;
  readonly kind: CircuitCornerKind;
}

export interface CircuitTrackConfig {
  readonly mapId: 'simple-closed-circuit';
  readonly schemaVersion: '1.0.0';
  readonly lapLengthTarget: number;
  readonly lapLengthRange: readonly [number, number];
  readonly trackWidth: number;
  /** Width of the compacted shoulder on each side of the asphalt. */
  readonly shoulderWidth: number;
  /** Clear grass runoff measured from the asphalt edge to the guardrail. */
  readonly barrierOffset: number;
  readonly mainStraightMinimumLength: number;
  readonly corners: readonly CircuitCornerConfig[];
  readonly markings: {
    readonly edgeLineWidth: number;
    readonly surfaceClearance: number;
    readonly maximumSegmentLength: number;
  };
  readonly surface: {
    readonly asphaltGrip: number;
    readonly asphaltRollingResistance: number;
    readonly shoulderGrip: number;
    readonly shoulderRollingResistance: number;
    readonly grassGrip: number;
    readonly grassRollingResistance: number;
    readonly transitionDepth: number;
  };
  readonly environmentDensity: number;
}

/**
 * A deliberately spacious six-corner proving circuit. The points are the
 * theoretical polygon vertices; TrackLayout replaces every vertex with a
 * tangent circular fillet, so straights and bends meet without a steering
 * discontinuity.
 */
export const DEFAULT_CIRCUIT_TRACK_CONFIG: CircuitTrackConfig = Object.freeze({
  mapId: 'simple-closed-circuit',
  schemaVersion: '1.0.0',
  lapLengthTarget: 1_560,
  lapLengthRange: [1_200, 1_800] as const,
  trackWidth: 9.5,
  shoulderWidth: 1.6,
  barrierOffset: 7.2,
  mainStraightMinimumLength: 340,
  corners: Object.freeze([
    Object.freeze({
      id: 'final-corner',
      label: '回主直道长弯',
      vertex: Object.freeze({ x: -172.5, z: 180 }),
      radius: 80,
      kind: 'flowing',
    }),
    Object.freeze({
      id: 'turn-one',
      label: '一号高速右弯',
      vertex: Object.freeze({ x: -172.5, z: -307.5 }),
      radius: 94,
      kind: 'flowing',
    }),
    Object.freeze({
      id: 'turn-two',
      label: '北侧缓右弯',
      vertex: Object.freeze({ x: -45, z: -397.5 }),
      radius: 109,
      kind: 'flowing',
    }),
    Object.freeze({
      id: 'braking-corner',
      label: '中速回头弯',
      vertex: Object.freeze({ x: 195, z: -330 }),
      radius: 45,
      kind: 'braking',
    }),
    Object.freeze({
      id: 'gentle-left',
      label: '缓和左弯',
      vertex: Object.freeze({ x: 60, z: -160 }),
      radius: 110,
      kind: 'gentle-left',
    }),
    Object.freeze({
      id: 'return-corner',
      label: '回程长右弯',
      vertex: Object.freeze({ x: 80, z: 180 }),
      radius: 75,
      kind: 'flowing',
    }),
  ]),
  markings: Object.freeze({
    edgeLineWidth: 0.14,
    surfaceClearance: 0.007,
    maximumSegmentLength: 0.65,
  }),
  surface: Object.freeze({
    asphaltGrip: 1,
    asphaltRollingResistance: 1,
    shoulderGrip: 0.82,
    shoulderRollingResistance: 1.55,
    grassGrip: 0.56,
    grassRollingResistance: 2.9,
    transitionDepth: 0.8,
  }),
  environmentDensity: 0.42,
});
