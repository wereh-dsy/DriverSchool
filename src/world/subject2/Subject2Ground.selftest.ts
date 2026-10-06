import { Subject2Ground } from './Subject2Ground';

export interface Subject2GroundSelfTestResult {
  readonly assertions: number;
  readonly routeLength: number;
  readonly connectionLengths: readonly number[];
  readonly maximumRouteHeightStep: number;
  readonly maximumHillGrade: number;
  readonly hillHeight: number;
  readonly asphaltGrip: number;
  readonly shoulderGrip: number;
  readonly grassGrip: number;
  readonly maximumGripStep: number;
  readonly maximumRollingResistanceStep: number;
  readonly markingVertices: number;
  readonly markingClearanceError: number;
  readonly markingHeightRange: number;
}

const distance = (
  left: { readonly x: number; readonly z: number },
  right: { readonly x: number; readonly z: number },
): number => Math.hypot(right.x - left.x, right.z - left.z);

/** Framework-free structural and surface regression coverage for the map. */
export function runSubject2GroundSelfTest(): Subject2GroundSelfTestResult {
  const ground = new Subject2Ground({ shadows: false });
  let assertions = 0;
  const assert = (condition: boolean, message: string): void => {
    assertions += 1;
    if (!condition) throw new Error(`Subject-2-ground self-test failed: ${message}`);
  };
  const assertNear = (
    actual: number,
    expected: number,
    tolerance: number,
    label: string,
  ): void => assert(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} ± ${tolerance}, received ${actual}`,
  );

  try {
    const { config, metadata } = ground;
    assert(config.site.length >= 150 && config.site.length <= 180, 'site length must remain realistic');
    assert(config.site.width >= 90 && config.site.width <= 120, 'site width must remain realistic');
    assert(config.waitingArea.length === 30 && config.waitingArea.width === 20, 'waiting apron dimensions');
    assert(config.reverseParking.bayLength >= 5.5 && config.reverseParking.bayLength <= 6, 'reverse bay length');
    assert(config.reverseParking.bayWidth >= 2.4 && config.reverseParking.bayWidth <= 2.6, 'reverse bay width');
    assert(config.sideParking.bayLength >= 6.2 && config.sideParking.bayLength <= 6.5, 'side bay length');
    assert(config.sideParking.bayWidth >= 2.5 && config.sideParking.bayWidth <= 2.7, 'side bay width');
    assert(config.rightAngleTurn.laneWidth >= 3.5 && config.rightAngleTurn.laneWidth <= 4, 'right-angle lane width');
    assert(config.curveDriving.laneWidth >= 3.5 && config.curveDriving.laneWidth <= 4, 'S-curve lane width');
    assert(config.hillStart.slope >= 0.08 && config.hillStart.slope <= 0.12, 'hill grade configuration');

    const expectedOrder = [
      'waiting-area',
      'reverse-parking',
      'side-parking',
      'right-angle-turn',
      'curve-driving',
      'hill-start',
      'finish-area',
    ];
    assert(metadata.projectOrder.join('|') === expectedOrder.join('|'), 'fixed project order');
    assert(metadata.projectZones.length === expectedOrder.length, 'one metadata zone per project');
    assert(metadata.checkpoints.length >= 19, 'stable entry/reference/exit checkpoints');
    assert(metadata.routeSegments.length === 12, 'complete route and connection metadata');
    metadata.projectZones.forEach((zone, index) => {
      assert(zone.order === index, `project zone ${zone.id} should have stable order`);
      assert(zone.bounds.maximumX > zone.bounds.minimumX, `${zone.id} has positive X extent`);
      assert(zone.bounds.maximumZ > zone.bounds.minimumZ, `${zone.id} has positive Z extent`);
    });

    const connectionLengths = metadata.routeSegments
      .filter((segment) => segment.kind === 'connection')
      .map((segment) => segment.length);
    assert(connectionLengths.length === 5, 'five buffered inter-project connections');
    for (const connectionLength of connectionLengths) {
      assert(
        connectionLength >= config.connectionRoads.minimumLength
          && connectionLength <= config.connectionRoads.maximumLength,
        `connection length ${connectionLength.toFixed(2)} m stays within configured range`,
      );
    }

    for (let index = 1; index < metadata.routeSegments.length; index += 1) {
      const previous = metadata.routeSegments[index - 1];
      const current = metadata.routeSegments[index];
      const previousEnd = previous?.centerline[previous.centerline.length - 1];
      const currentStart = current?.centerline[0];
      assert(
        previousEnd !== undefined && currentStart !== undefined
          && distance(previousEnd, currentStart) < 1e-9,
        `route seam ${previous?.id ?? '?'} -> ${current?.id ?? '?'} is continuous`,
      );
    }

    let maximumRouteHeightStep = 0;
    let routeLength = 0;
    let previousHeight: number | undefined;
    for (const segment of metadata.routeSegments) {
      for (let pointIndex = 1; pointIndex < segment.centerline.length; pointIndex += 1) {
        const start = segment.centerline[pointIndex - 1];
        const end = segment.centerline[pointIndex];
        if (!start || !end) continue;
        const sectionLength = distance(start, end);
        routeLength += sectionLength;
        const steps = Math.max(1, Math.ceil(sectionLength / 0.25));
        for (let step = 0; step <= steps; step += 1) {
          const t = step / steps;
          const x = start.x + (end.x - start.x) * t;
          const z = start.z + (end.z - start.z) * t;
          const height = ground.getRoadHeightAt(x, z);
          if (previousHeight !== undefined) {
            maximumRouteHeightStep = Math.max(maximumRouteHeightStep, Math.abs(height - previousHeight));
          }
          previousHeight = height;
        }
      }
    }
    assert(maximumRouteHeightStep < 0.03, 'dense route samples contain no road-height step');

    const hill = config.hillStart;
    const hillEntry = config.layout.hillEntry;
    const hillHeight = ground.getRoadHeightAt(
      hillEntry.x,
      hillEntry.z - hill.uphillLength - hill.crestLength * 0.5,
    );
    assert(hillHeight > 1 && hillHeight < 1.5, 'hill has a visible but realistic crest height');
    const maximumHillGrade = ground.sampleRoadSurface(
      hillEntry.x,
      hillEntry.z - hill.uphillLength * 0.5,
      { x: 0, y: -1 },
    ).grade;
    assertNear(maximumHillGrade, hill.slope, 0.005, 'steady hill grade');
    assertNear(ground.getRoadHeightAt(hillEntry.x, hillEntry.z + 0.01), 0, 1e-9, 'flat hill entry');
    const hillEndZ = hillEntry.z - hill.uphillLength - hill.crestLength - hill.downhillLength;
    assertNear(ground.getRoadHeightAt(hillEntry.x, hillEndZ - 0.01), 0, 1e-9, 'flat hill exit');

    const waiting = config.layout.waitingCenter;
    const asphalt = ground.sampleRoadSurface(waiting.x, waiting.z);
    const shoulder = ground.sampleRoadSurface(
      waiting.x,
      waiting.z - config.waitingArea.width * 0.5 - config.surface.shoulderBlendDepth,
    );
    const grass = ground.sampleRoadSurface(0, 16);
    assertNear(asphalt.gripMultiplier, config.surface.asphaltGrip, 1e-9, 'asphalt grip');
    assertNear(asphalt.rollingResistanceMultiplier, config.surface.asphaltRollingResistance, 1e-9, 'asphalt rolling resistance');
    assertNear(shoulder.gripMultiplier, config.surface.shoulderGrip, 0.015, 'shoulder grip');
    assertNear(shoulder.rollingResistanceMultiplier, config.surface.shoulderRollingResistance, 0.04, 'shoulder rolling resistance');
    assertNear(grass.gripMultiplier, config.surface.grassGrip, 0.01, 'grass grip');
    assertNear(grass.rollingResistanceMultiplier, config.surface.grassRollingResistance, 0.02, 'grass rolling resistance');

    let maximumGripStep = 0;
    let maximumRollingResistanceStep = 0;
    let previousSample = ground.sampleRoadSurface(
      waiting.x,
      waiting.z - config.waitingArea.width * 0.5 + 0.1,
    );
    for (let offset = 0; offset <= config.surface.shoulderBlendDepth * 2.2; offset += 0.04) {
      const sample = ground.sampleRoadSurface(
        waiting.x,
        waiting.z - config.waitingArea.width * 0.5 - offset,
      );
      maximumGripStep = Math.max(maximumGripStep, Math.abs(sample.gripMultiplier - previousSample.gripMultiplier));
      maximumRollingResistanceStep = Math.max(
        maximumRollingResistanceStep,
        Math.abs(sample.rollingResistanceMultiplier - previousSample.rollingResistanceMultiplier),
      );
      previousSample = sample;
    }
    assert(maximumGripStep < 0.025, 'asphalt-to-grass grip transition is smooth');
    assert(maximumRollingResistanceStep < 0.08, 'rolling-resistance transition is smooth');

    const markings = ground.getRoadMarkingDiagnostics();
    assert(markings.vertexCount > 2_000, 'road markings are densely road-conforming');
    assert(markings.maximumClearanceError < 2e-5, 'markings maintain authored surface clearance');
    assert(markings.maximumJoinGap < 1e-7, 'marking subdivisions have no gaps');
    assert(
      markings.maximumWorldHeight - markings.minimumWorldHeight > 1,
      'hill markings follow the vertical range instead of floating horizontally',
    );

    const requiredRoots = [
      'Subject 2 waiting area',
      'Subject 2 reverse parking area',
      'Subject 2 side parking area',
      'Subject 2 right-angle turn area',
      'Subject 2 curve driving area',
      'Subject 2 hill-start area',
      'Subject 2 connection roads',
      'Subject 2 environment',
    ];
    const childNames = new Set(ground.root.children.map((child) => child.name));
    for (const name of requiredRoots) assert(childNames.has(name), `module ${name} exists`);

    return {
      assertions,
      routeLength,
      connectionLengths,
      maximumRouteHeightStep,
      maximumHillGrade,
      hillHeight,
      asphaltGrip: asphalt.gripMultiplier,
      shoulderGrip: shoulder.gripMultiplier,
      grassGrip: grass.gripMultiplier,
      maximumGripStep,
      maximumRollingResistanceStep,
      markingVertices: markings.vertexCount,
      markingClearanceError: markings.maximumClearanceError,
      markingHeightRange: markings.maximumWorldHeight - markings.minimumWorldHeight,
    };
  } finally {
    ground.dispose();
  }
}
