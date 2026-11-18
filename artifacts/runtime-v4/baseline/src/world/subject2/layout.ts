import * as THREE from 'three';
import type { Subject2GroundConfig, Subject2Point2 } from './Subject2GroundConfig';
import type {
  Subject2CheckpointMetadata,
  Subject2MapMetadata,
  Subject2ProjectId,
  Subject2ProjectZoneMetadata,
  Subject2RouteSegmentMetadata,
} from './types';

export interface Subject2Layout {
  readonly waitingRoute: readonly Subject2Point2[];
  readonly waitingToReverse: readonly Subject2Point2[];
  readonly reverseRoute: readonly Subject2Point2[];
  readonly reverseToSide: readonly Subject2Point2[];
  readonly sideRoute: readonly Subject2Point2[];
  readonly sideToRightAngle: readonly Subject2Point2[];
  readonly rightAngleRoute: readonly Subject2Point2[];
  readonly rightAngleToCurve: readonly Subject2Point2[];
  readonly curveRoute: readonly Subject2Point2[];
  readonly curveToHill: readonly Subject2Point2[];
  readonly hillRoute: readonly Subject2Point2[];
  readonly finishRoute: readonly Subject2Point2[];
}

export const polylineLength = (points: readonly Subject2Point2[]): number => {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (!previous || !point) continue;
    length += Math.hypot(point.x - previous.x, point.z - previous.z);
  }
  return length;
};

const yawFromPoints = (from: Subject2Point2, to: Subject2Point2): number =>
  Math.atan2(-(to.x - from.x), -(to.z - from.z));

const createRightAngleRoute = (config: Subject2GroundConfig): Subject2Point2[] => {
  const entry = config.layout.rightAngleEntry;
  const radius = config.rightAngleTurn.cornerRadius;
  const centreX = entry.x - radius;
  const centreZ = entry.z - config.rightAngleTurn.entryLength + radius;
  const arc: Subject2Point2[] = [];
  for (let index = 0; index <= 8; index += 1) {
    const angle = -index / 8 * Math.PI * 0.5;
    arc.push({
      x: centreX + Math.cos(angle) * radius,
      z: centreZ + Math.sin(angle) * radius,
    });
  }
  return [
    { ...entry },
    { x: entry.x, z: centreZ },
    ...arc.slice(1),
    { x: entry.x - config.rightAngleTurn.exitLength, z: centreZ - radius },
  ];
};

export const createSubject2Layout = (config: Subject2GroundConfig): Subject2Layout => {
  const waiting = config.layout.waitingCenter;
  const reverse = config.layout.reverseCenter;
  const side = config.layout.sideCenter;
  const curve = config.layout.curveStart;
  const hill = config.layout.hillEntry;
  const end = config.layout.endCenter;
  const reverseHalfLength = config.reverseParking.areaLength * 0.5;
  const sideHalfLength = config.sideParking.areaLength * 0.5;
  const hillTotalLength = config.hillStart.uphillLength
    + config.hillStart.crestLength
    + config.hillStart.downhillLength;
  // Two opposite circular arcs with a shared tangent form an S, rather than
  // an arbitrary slalom spline. Short straight approaches keep the gates level.
  const firstRadius = config.curveDriving.firstCurveRadius;
  const secondRadius = config.curveDriving.secondCurveRadius;
  const angle = Math.min(Math.PI / 3,
    config.curveDriving.totalLength * 0.8 / (firstRadius + secondRadius));
  const straight = (config.curveDriving.totalLength - angle * (firstRadius + secondRadius)) * 0.5;
  const curveRoute: Subject2Point2[] = [{ ...curve }, { x: curve.x - straight, z: curve.z }];
  const arcStart = curveRoute[1]!;
  const steps = Math.max(24, Math.ceil(angle * Math.max(firstRadius, secondRadius) / 0.3));
  for (let i = 1; i <= steps; i += 1) {
    const a = angle * i / steps;
    curveRoute.push({ x: arcStart.x - firstRadius * Math.sin(a),
      z: arcStart.z + firstRadius * (1 - Math.cos(a)) });
  }
  const transition = curveRoute[curveRoute.length - 1]!;
  for (let i = 1; i <= steps; i += 1) {
    const a = angle * (1 - i / steps);
    curveRoute.push({ x: transition.x - secondRadius * (Math.sin(angle) - Math.sin(a)),
      z: transition.z + secondRadius * (Math.cos(a) - Math.cos(angle)) });
  }
  const arcEnd = curveRoute[curveRoute.length - 1]!;
  curveRoute.push({ x: arcEnd.x - straight, z: arcEnd.z });
  const curveExit = curveRoute[curveRoute.length - 1] ?? curve;
  const rightAngleRoute = createRightAngleRoute(config);

  return {
    waitingRoute: [
      { x: waiting.x - 6, z: waiting.z },
      { x: waiting.x + config.waitingArea.length * 0.5, z: waiting.z },
    ],
    waitingToReverse: [
      { x: waiting.x + config.waitingArea.length * 0.5, z: waiting.z },
      { x: waiting.x + config.waitingArea.length * 0.5 + 4, z: waiting.z },
      { x: reverse.x - reverseHalfLength - 6, z: reverse.z },
      { x: reverse.x - reverseHalfLength, z: reverse.z },
    ],
    reverseRoute: [
      { x: reverse.x - reverseHalfLength, z: reverse.z },
      { x: reverse.x + reverseHalfLength, z: reverse.z },
    ],
    reverseToSide: [
      { x: reverse.x + reverseHalfLength, z: reverse.z },
      { x: reverse.x + reverseHalfLength + 6, z: reverse.z },
      { x: side.x - sideHalfLength - 7, z: side.z },
      { x: side.x - sideHalfLength, z: side.z },
    ],
    sideRoute: [
      { x: side.x - sideHalfLength, z: side.z },
      { x: side.x + sideHalfLength, z: side.z },
    ],
    sideToRightAngle: [
      { x: side.x + sideHalfLength, z: side.z },
      { x: side.x + sideHalfLength + 6, z: side.z },
      { x: config.layout.rightAngleEntry.x, z: config.layout.rightAngleEntry.z + 9 },
      { ...config.layout.rightAngleEntry },
    ],
    rightAngleRoute,
    rightAngleToCurve: [
      { ...rightAngleRoute[rightAngleRoute.length - 1]! },
      { ...curve },
    ],
    curveRoute,
    curveToHill: [
      { ...curveExit },
      { x: curveExit.x - 7, z: curveExit.z },
      { x: hill.x, z: hill.z + 12 },
      { ...hill },
    ],
    hillRoute: [
      { ...hill },
      { x: hill.x, z: hill.z - hillTotalLength },
    ],
    finishRoute: [
      { x: hill.x, z: hill.z - hillTotalLength },
      { x: -37, z: -47 },
      { x: end.x + 2, z: -47 },
    ],
  };
};

const boundsAround = (
  center: Subject2Point2,
  length: number,
  width: number,
) => ({
  minimumX: center.x - length * 0.5,
  maximumX: center.x + length * 0.5,
  minimumZ: center.z - width * 0.5,
  maximumZ: center.z + width * 0.5,
});

const boundsAroundRoute = (
  points: readonly Subject2Point2[],
  padding: number,
) => {
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  return {
    minimumX: Math.min(...xs) - padding,
    maximumX: Math.max(...xs) + padding,
    minimumZ: Math.min(...zs) - padding,
    maximumZ: Math.max(...zs) + padding,
  };
};

const makeSegment = (
  id: string,
  kind: 'project' | 'connection',
  nominalWidth: number,
  centerline: readonly Subject2Point2[],
  project?: {
    readonly projectId?: Subject2ProjectId;
    readonly fromProjectId?: Subject2ProjectId;
    readonly toProjectId?: Subject2ProjectId;
  },
): Subject2RouteSegmentMetadata => ({
  id,
  kind,
  nominalWidth,
  centerline,
  length: polylineLength(centerline),
  ...project,
});

export const createSubject2MapMetadata = (
  config: Subject2GroundConfig,
  layout: Subject2Layout,
): Subject2MapMetadata => {
  const projectOrder: readonly Subject2ProjectId[] = [
    'waiting-area',
    'reverse-parking',
    'side-parking',
    'right-angle-turn',
    'curve-driving',
    'hill-start',
    'finish-area',
  ];
  const rightPoints = layout.rightAngleRoute;
  const hillPoints = layout.hillRoute;
  const rightExit = rightPoints[rightPoints.length - 1] ?? { x: 48, z: -3 };
  const hillExit = hillPoints[hillPoints.length - 1] ?? { x: -43, z: -43 };
  const curveExit = layout.curveRoute[layout.curveRoute.length - 1] ?? { x: -22, z: 2 };
  const curveTransition = layout.curveRoute[Math.floor(layout.curveRoute.length * 0.5)]
    ?? config.layout.curveStart;
  const reverseBayReference = {
    x: config.layout.reverseCenter.x + 2,
    z: config.layout.reverseCenter.z
      + config.reverseParking.approachWidth * 0.5
      + config.reverseParking.bayLength * 0.5,
  };
  const sideBayReference = {
    x: config.layout.sideCenter.x + 0.5,
    z: config.layout.sideCenter.z
      + config.sideParking.approachWidth * 0.5
      + config.sideParking.bayWidth * 0.5,
  };
  const checkpoints: Subject2CheckpointMetadata[] = [
    { id: 'waiting-entry', projectId: 'waiting-area', kind: 'entry', position: layout.waitingRoute[0] ?? { x: -76, z: 41 }, yawRadians: -Math.PI / 2 },
    { id: 'waiting-exit', projectId: 'waiting-area', kind: 'exit', position: layout.waitingRoute[1] ?? { x: -55, z: 41 }, yawRadians: -Math.PI / 2 },
    { id: 'reverse-entry', projectId: 'reverse-parking', kind: 'entry', position: layout.reverseRoute[0] ?? { x: -40, z: 23 }, yawRadians: -Math.PI / 2 },
    { id: 'reverse-bay-reference', projectId: 'reverse-parking', kind: 'reference', position: reverseBayReference, yawRadians: 0 },
    { id: 'reverse-exit', projectId: 'reverse-parking', kind: 'exit', position: layout.reverseRoute[1] ?? { x: -8, z: 23 }, yawRadians: -Math.PI / 2 },
    { id: 'side-entry', projectId: 'side-parking', kind: 'entry', position: layout.sideRoute[0] ?? { x: 14, z: 35 }, yawRadians: -Math.PI / 2 },
    { id: 'side-bay-reference', projectId: 'side-parking', kind: 'reference', position: sideBayReference, yawRadians: -Math.PI / 2 },
    { id: 'side-exit', projectId: 'side-parking', kind: 'exit', position: layout.sideRoute[1] ?? { x: 49, z: 35 }, yawRadians: -Math.PI / 2 },
    { id: 'right-angle-entry', projectId: 'right-angle-turn', kind: 'entry', position: rightPoints[0] ?? { x: 67, z: 16 }, yawRadians: 0 },
    { id: 'right-angle-apex', projectId: 'right-angle-turn', kind: 'reference', position: { x: config.layout.rightAngleEntry.x - config.rightAngleTurn.cornerRadius, z: config.layout.rightAngleEntry.z - config.rightAngleTurn.entryLength }, yawRadians: Math.PI / 2 },
    { id: 'right-angle-exit', projectId: 'right-angle-turn', kind: 'exit', position: rightExit, yawRadians: Math.PI / 2 },
    { id: 'curve-entry', projectId: 'curve-driving', kind: 'entry', position: layout.curveRoute[0] ?? { x: 18, z: -3 }, yawRadians: Math.PI / 2 },
    { id: 'curve-transition', projectId: 'curve-driving', kind: 'reference', position: curveTransition, yawRadians: Math.PI / 2 },
    { id: 'curve-exit', projectId: 'curve-driving', kind: 'exit', position: curveExit, yawRadians: Math.PI / 2 },
    { id: 'hill-entry', projectId: 'hill-start', kind: 'entry', position: hillPoints[0] ?? { x: -43, z: -10 }, yawRadians: 0 },
    { id: 'hill-stop-reference', projectId: 'hill-start', kind: 'reference', position: {
      x: config.layout.hillEntry.x,
      z: config.layout.hillEntry.z - Math.min(config.hillStart.uphillLength - config.hillStart.stopZoneLength * 0.55, config.hillStart.uphillLength * 0.72),
    }, yawRadians: 0 },
    { id: 'hill-exit', projectId: 'hill-start', kind: 'exit', position: hillExit, yawRadians: 0 },
    { id: 'finish-entry', projectId: 'finish-area', kind: 'entry', position: layout.finishRoute[0] ?? hillExit, yawRadians: 0 },
    { id: 'finish-exit', projectId: 'finish-area', kind: 'exit', position: layout.finishRoute[layout.finishRoute.length - 1] ?? { x: -25, z: -47 }, yawRadians: -Math.PI / 2 },
  ];
  const cpIds = (projectId: Subject2ProjectId): string[] => checkpoints
    .filter((checkpoint) => checkpoint.projectId === projectId)
    .map((checkpoint) => checkpoint.id);
  const zone = (
    id: Subject2ProjectId,
    order: number,
    label: string,
    bounds: ReturnType<typeof boundsAround>,
  ): Subject2ProjectZoneMetadata => {
    const ids = cpIds(id);
    return {
      id,
      order,
      label,
      bounds,
      entryCheckpointId: ids[0] ?? `${id}-entry`,
      exitCheckpointId: ids[ids.length - 1] ?? `${id}-exit`,
      checkpointIds: ids,
    };
  };
  const projectZones: Subject2ProjectZoneMetadata[] = [
    zone('waiting-area', 0, '候考区', boundsAround(config.layout.waitingCenter, config.waitingArea.length, config.waitingArea.width)),
    zone('reverse-parking', 1, '倒车入库', boundsAround(
      { x: config.layout.reverseCenter.x, z: config.layout.reverseCenter.z + config.reverseParking.bayLength * 0.5 },
      config.reverseParking.areaLength, config.reverseParking.approachWidth + config.reverseParking.bayLength)),
    zone('side-parking', 2, '侧方停车', boundsAround(
      { x: config.layout.sideCenter.x, z: config.layout.sideCenter.z + config.sideParking.bayWidth * 0.5 },
      config.sideParking.areaLength, config.sideParking.approachWidth + config.sideParking.bayWidth)),
    zone('right-angle-turn', 3, '直角转弯', boundsAroundRoute(
      layout.rightAngleRoute,
      config.rightAngleTurn.laneWidth * 0.5 + 1,
    )),
    zone('curve-driving', 4, '曲线行驶', boundsAroundRoute(
      layout.curveRoute,
      config.curveDriving.laneWidth * 0.5 + 1,
    )),
    zone('hill-start', 5, '坡道定点停车与起步', boundsAroundRoute(
      layout.hillRoute,
      config.hillStart.laneWidth * 0.5 + 2,
    )),
    zone('finish-area', 6, '训练结束区', boundsAround(config.layout.endCenter, config.endArea.length, config.endArea.width)),
  ];
  const routeSegments: Subject2RouteSegmentMetadata[] = [
    makeSegment('route-waiting', 'project', config.connectionRoads.defaultWidth, layout.waitingRoute, { projectId: 'waiting-area' }),
    makeSegment('connection-waiting-reverse', 'connection', config.connectionRoads.defaultWidth, layout.waitingToReverse, { fromProjectId: 'waiting-area', toProjectId: 'reverse-parking' }),
    makeSegment('route-reverse', 'project', config.reverseParking.approachWidth, layout.reverseRoute, { projectId: 'reverse-parking' }),
    makeSegment('connection-reverse-side', 'connection', config.connectionRoads.defaultWidth, layout.reverseToSide, { fromProjectId: 'reverse-parking', toProjectId: 'side-parking' }),
    makeSegment('route-side', 'project', config.sideParking.approachWidth, layout.sideRoute, { projectId: 'side-parking' }),
    makeSegment('connection-side-right-angle', 'connection', config.connectionRoads.defaultWidth, layout.sideToRightAngle, { fromProjectId: 'side-parking', toProjectId: 'right-angle-turn' }),
    makeSegment('route-right-angle', 'project', config.rightAngleTurn.laneWidth, layout.rightAngleRoute, { projectId: 'right-angle-turn' }),
    makeSegment('connection-right-angle-curve', 'connection', config.connectionRoads.defaultWidth, layout.rightAngleToCurve, { fromProjectId: 'right-angle-turn', toProjectId: 'curve-driving' }),
    makeSegment('route-curve', 'project', config.curveDriving.laneWidth, layout.curveRoute, { projectId: 'curve-driving' }),
    makeSegment('connection-curve-hill', 'connection', config.connectionRoads.defaultWidth, layout.curveToHill, { fromProjectId: 'curve-driving', toProjectId: 'hill-start' }),
    makeSegment('route-hill', 'project', config.hillStart.laneWidth, layout.hillRoute, { projectId: 'hill-start' }),
    makeSegment('route-finish', 'project', config.connectionRoads.defaultWidth, layout.finishRoute, { projectId: 'finish-area' }),
  ];
  const routeCenterline: Subject2Point2[] = [];
  for (const segment of routeSegments) {
    segment.centerline.forEach((point, index) => {
      if (index === 0 && routeCenterline.length > 0) return;
      routeCenterline.push({ ...point });
    });
  }
  // Derive checkpoint headings from the nearest authored route segment when a
  // placeholder above does not encode an obvious manoeuvre direction.
  for (let index = 0; index < routeCenterline.length - 1; index += 1) {
    const point = routeCenterline[index];
    const next = routeCenterline[index + 1];
    if (!point || !next) continue;
    const checkpoint = checkpoints.find((item) => item.position.x === point.x && item.position.z === point.z);
    if (checkpoint && checkpoint.kind !== 'reference') {
      const replacement = { ...checkpoint, yawRadians: yawFromPoints(point, next) };
      checkpoints[checkpoints.indexOf(checkpoint)] = replacement;
    }
  }
  return {
    id: 'subject-2-training-ground',
    version: 1,
    description: '候考、倒车入库、侧方停车、直角转弯、曲线行驶与坡道起步的连续训练场',
    mapId: 'cn-subject-2-training-ground',
    schemaVersion: '1.0.0',
    displayName: '科目二训练场',
    coordinateUnits: 'metres',
    bounds: {
      minimumX: -config.site.length * 0.5,
      maximumX: config.site.length * 0.5,
      minimumZ: -config.site.width * 0.5,
      maximumZ: config.site.width * 0.5,
    },
    projectOrder,
    projectZones,
    routeSegments,
    routeCenterline,
    checkpoints,
  };
};

export const toVector3 = (point: Subject2Point2, y = 0): THREE.Vector3 =>
  new THREE.Vector3(point.x, y, point.z);
