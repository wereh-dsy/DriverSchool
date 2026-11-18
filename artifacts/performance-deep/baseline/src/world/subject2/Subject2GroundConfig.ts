export interface Subject2Point2 {
  readonly x: number;
  readonly z: number;
}

export interface Subject2GroundConfig {
  readonly site: {
    /** East-west extent in metres. */
    readonly length: number;
    /** North-south extent in metres. */
    readonly width: number;
  };
  readonly layout: {
    readonly waitingCenter: Subject2Point2;
    readonly reverseCenter: Subject2Point2;
    readonly sideCenter: Subject2Point2;
    readonly rightAngleEntry: Subject2Point2;
    readonly curveStart: Subject2Point2;
    readonly hillEntry: Subject2Point2;
    readonly endCenter: Subject2Point2;
  };
  readonly waitingArea: {
    readonly length: number;
    readonly width: number;
    readonly parkingSpaceLength: number;
    readonly parkingSpaceWidth: number;
    readonly parkingSpaceCount: number;
  };
  readonly reverseParking: {
    readonly areaLength: number;
    readonly areaWidth: number;
    readonly bayLength: number;
    readonly bayWidth: number;
    readonly approachWidth: number;
  };
  readonly sideParking: {
    readonly areaLength: number;
    readonly areaWidth: number;
    readonly bayLength: number;
    readonly bayWidth: number;
    readonly approachWidth: number;
  };
  readonly rightAngleTurn: {
    readonly laneWidth: number;
    readonly entryLength: number;
    readonly exitLength: number;
    readonly cornerRadius: number;
  };
  readonly curveDriving: {
    readonly laneWidth: number;
    readonly firstCurveRadius: number;
    readonly secondCurveRadius: number;
    readonly totalLength: number;
  };
  readonly hillStart: {
    readonly laneWidth: number;
    readonly slope: number;
    readonly uphillLength: number;
    readonly stopZoneLength: number;
    readonly crestLength: number;
    readonly downhillLength: number;
    readonly transitionLength: number;
  };
  readonly connectionRoads: {
    readonly defaultWidth: number;
    readonly minimumLength: number;
    readonly maximumLength: number;
  };
  readonly endArea: {
    readonly length: number;
    readonly width: number;
    readonly parkingSpaceCount: number;
  };
  readonly markings: {
    readonly mainLineWidth: number;
    readonly referenceLineWidth: number;
    readonly surfaceClearance: number;
  };
  readonly surface: {
    readonly asphaltGrip: number;
    readonly asphaltRollingResistance: number;
    readonly shoulderGrip: number;
    readonly shoulderRollingResistance: number;
    readonly grassGrip: number;
    readonly grassRollingResistance: number;
    readonly shoulderBlendDepth: number;
  };
}

/**
 * A deliberately forgiving C1 practice layout. Dimensions are realistic
 * enough to train reference points, while bays and lanes retain a little more
 * margin than a strict examination site.
 */
export const DEFAULT_SUBJECT2_GROUND_CONFIG: Subject2GroundConfig = {
  site: {
    length: 176,
    width: 108,
  },
  layout: {
    waitingCenter: { x: -70, z: 41 },
    reverseCenter: { x: -24, z: 23 },
    sideCenter: { x: 31.5, z: 35 },
    rightAngleEntry: { x: 67, z: 16 },
    curveStart: { x: 18, z: -3 },
    hillEntry: { x: -43, z: -10 },
    endCenter: { x: -27, z: -46 },
  },
  waitingArea: {
    length: 30,
    width: 20,
    parkingSpaceLength: 5.8,
    parkingSpaceWidth: 2.7,
    parkingSpaceCount: 5,
  },
  reverseParking: {
    areaLength: 32,
    areaWidth: 16,
    bayLength: 5.8,
    bayWidth: 2.6,
    approachWidth: 6.8,
  },
  sideParking: {
    areaLength: 35,
    areaWidth: 14,
    bayLength: 6.4,
    bayWidth: 2.65,
    approachWidth: 4.2,
  },
  rightAngleTurn: {
    laneWidth: 4,
    entryLength: 19,
    exitLength: 19,
    cornerRadius: 6,
  },
  curveDriving: {
    laneWidth: 4,
    firstCurveRadius: 11.5,
    secondCurveRadius: 11,
    totalLength: 44,
  },
  hillStart: {
    laneWidth: 4.2,
    slope: 0.1,
    uphillLength: 13,
    stopZoneLength: 3,
    crestLength: 4,
    downhillLength: 13,
    transitionLength: 2,
  },
  connectionRoads: {
    defaultWidth: 4.2,
    minimumLength: 20,
    maximumLength: 40,
  },
  endArea: {
    length: 34,
    width: 16,
    parkingSpaceCount: 3,
  },
  markings: {
    mainLineWidth: 0.12,
    referenceLineWidth: 0.2,
    surfaceClearance: 0.008,
  },
  surface: {
    asphaltGrip: 1,
    asphaltRollingResistance: 1,
    shoulderGrip: 0.8,
    shoulderRollingResistance: 1.55,
    grassGrip: 0.56,
    grassRollingResistance: 2.8,
    shoulderBlendDepth: 1.2,
  },
};
