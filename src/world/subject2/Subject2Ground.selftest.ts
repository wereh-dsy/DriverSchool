import * as THREE from 'three';
import { Subject2Ground } from './Subject2Ground';
import { SUBJECT2_ROAD_SURFACE_OFFSET } from './geometry';

export interface Subject2GroundSelfTestResult {
  readonly assertions: number;
  readonly routeLength: number;
  readonly connectionLengths: readonly number[];
  readonly maximumRouteHeightStep: number;
  readonly maximumHillGrade: number;
  readonly hillHeight: number;
  readonly asphaltGrip: number;
  readonly openApronGrip: number;
  readonly maximumPavementHeightError: number;
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

    // Projects are now markings on one shared surface, including the open
    // spaces between lanes. Check the visible pavement and tyre contact agree.
    ground.root.updateWorldMatrix(true, true);
    const ray = new THREE.Raycaster();
    const hitsAt = (x: number, z: number) => {
      ray.set(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
      return ray.intersectObject(ground.root, true);
    };
    const asphaltAt = (x: number, z: number): boolean => hitsAt(x, z)
      .some((hit) => hit.object.name.toLowerCase().includes('asphalt'));
    const markingAt = (x: number, z: number): boolean => hitsAt(x, z)
      .some((hit) => hit.object.userData.subject2RoadMarking === true);
    const pavements: THREE.Mesh[] = [];
    ground.root.traverse((object) => {
      if (object instanceof THREE.Mesh && object.name.toLowerCase().includes('asphalt')) pavements.push(object);
    });
    assert(pavements.length === 1, 'one continuous pavement without overlapping project pads');
    const pavement = pavements[0]!;
    assert(pavement.material instanceof THREE.MeshStandardMaterial, 'pavement uses one shared material');
    assert(!ground.root.getObjectByName('Subject 2 grass base'), 'grass base is removed');
    assert(!ground.root.getObjectByName('Hill earth embankment'), 'hill has the shared paved surface');
    assert(!ground.root.getObjectByName('Side parking low kerb'), 'side parking is divided by markings only');
    const reverse = config.layout.reverseCenter;
    const reverseMouth = reverse.z + config.reverseParking.approachWidth * 0.5;
    assert(asphaltAt(reverse.x + 2, reverseMouth + 0.1), 'reverse bay joins the approach without a grass gap');
    assert(!hitsAt(reverse.x + 2, reverseMouth)
      .some((hit) => hit.object.userData.subject2RoadMarking === true), 'no solid line crosses reverse bay mouth');
    assert(markingAt(reverse.x + 2 - config.reverseParking.bayWidth * 0.5,
      reverseMouth + config.reverseParking.bayLength * 0.5), 'T-shaped bay side boundary remains visible');
    assert(asphaltAt(reverse.x - 10, reverseMouth + 3), 'reverse recess shares the continuous pavement');
    assertNear(ground.sampleRoadSurface(reverse.x - 10, reverseMouth + 3).gripMultiplier,
      config.surface.asphaltGrip, 1e-9, 'reverse recess has asphalt physics');
    const side = config.layout.sideCenter;
    const sideBayZ = side.z + config.sideParking.approachWidth * 0.5 + config.sideParking.bayWidth * 0.5;
    assert(asphaltAt(side.x + 0.5, sideBayZ), 'side bay has a paved surface');
    assert(asphaltAt(side.x - 10, sideBayZ), 'space beside the side bay is paved');
    assert(markingAt(side.x + 0.5, sideBayZ + config.sideParking.bayWidth * 0.5),
      'side bay back boundary remains visible');
    const turn = config.layout.rightAngleEntry;
    const cornerZ = turn.z - config.rightAngleTurn.entryLength;
    const halfLane = config.rightAngleTurn.laneWidth * 0.5;
    assert(asphaltAt(turn.x + halfLane - 0.2, cornerZ - halfLane + 0.2), 'L-shaped outer corner stays square');
    assert(asphaltAt(turn.x - halfLane - 0.2, cornerZ + halfLane + 0.2), 'space inside the L is paved');
    assert(markingAt(turn.x - halfLane, cornerZ + halfLane), 'L-shaped inner marking corner stays square');
    assertNear(ground.sampleRoadSurface(turn.x + halfLane - 0.2, cornerZ - halfLane + 0.2).gripMultiplier,
      config.surface.asphaltGrip, 1e-9, 'L-shaped corner physics matches paving');
    const curveSegment = metadata.routeSegments.find((segment) => segment.id === 'route-curve')!;
    assertNear(curveSegment.length, config.curveDriving.totalLength, 0.02, 'S-curve uses the configured arc length');
    let positiveBends = 0;
    let negativeBends = 0;
    let bendReversals = 0;
    let previousBend = 0;
    for (let i = 1; i < curveSegment.centerline.length - 1; i += 1) {
      const a = curveSegment.centerline[i - 1]!;
      const b = curveSegment.centerline[i]!;
      const c = curveSegment.centerline[i + 1]!;
      const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
      if (Math.abs(cross) > 1e-6) {
        const sign = Math.sign(cross);
        if (sign > 0) positiveBends += 1; else negativeBends += 1;
        if (previousBend !== 0 && previousBend !== sign) bendReversals += 1;
        previousBend = sign;
      }
      const length = distance(a, c);
      for (const offset of [-config.curveDriving.laneWidth * 0.4, 0, config.curveDriving.laneWidth * 0.4]) {
        const x = b.x - (c.z - a.z) / length * offset;
        const z = b.z + (c.x - a.x) / length * offset;
        assert(asphaltAt(x, z), 'S-curve paving remains continuous across its width');
        assertNear(ground.sampleRoadSurface(x, z).gripMultiplier,
          config.surface.asphaltGrip, 1e-9, 'S-curve tyre surface agrees with paving');
      }
    }
    assert(positiveBends > 10 && negativeBends > 10 && bendReversals === 1,
      'S-curve has two opposing bends and one steering transition');
    const gates: THREE.Object3D[] = [];
    ground.root.traverse((object) => { if (object.name.endsWith(' gate')) gates.push(object); });
    assert(gates.length === 10, 'all five projects have entry and exit bars');
    for (const checkpoint of metadata.checkpoints.filter((item) => item.kind === 'reference')) {
      assert(asphaltAt(checkpoint.position.x, checkpoint.position.z), `${checkpoint.id} lies on its project surface`);
    }
    ground.root.traverse((object) => {
      if (object.name === 'Training-ground lamp') {
        const position = object.getWorldPosition(new THREE.Vector3());
        assert(metadata.projectZones.every((zone) => position.x < zone.bounds.minimumX
          || position.x > zone.bounds.maximumX || position.z < zone.bounds.minimumZ
          || position.z > zone.bounds.maximumZ),
        `lamp at ${position.x},${position.z} stays outside marked project areas`);
      }
    });

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
    const openApron = ground.sampleRoadSurface(0, 16);
    assertNear(asphalt.gripMultiplier, config.surface.asphaltGrip, 1e-9, 'asphalt grip');
    assertNear(asphalt.rollingResistanceMultiplier, config.surface.asphaltRollingResistance, 1e-9, 'asphalt rolling resistance');
    assertNear(openApron.gripMultiplier, config.surface.asphaltGrip, 1e-9, 'open apron asphalt grip');
    assertNear(openApron.rollingResistanceMultiplier, config.surface.asphaltRollingResistance, 1e-9, 'open apron asphalt rolling resistance');
    // Sample the whole enclosure, not just project routes, so the former grass
    // gaps and corners cannot keep hidden low-grip patches.
    for (let x = metadata.bounds.minimumX + 1; x < metadata.bounds.maximumX; x += 8) {
      for (let z = metadata.bounds.minimumZ + 1; z < metadata.bounds.maximumZ; z += 8) {
        const sample = ground.sampleRoadSurface(x, z);
        assertNear(sample.gripMultiplier, config.surface.asphaltGrip, 1e-9, 'uniform site grip');
        assertNear(sample.rollingResistanceMultiplier, config.surface.asphaltRollingResistance, 1e-9, 'uniform site rolling resistance');
      }
    }
    let maximumPavementHeightError = 0;
    for (let d = 0; d <= hill.uphillLength + hill.crestLength + hill.downhillLength; d += 0.25) {
      const z = hillEntry.z - d;
      const hit = hitsAt(hillEntry.x, z).find((item) => item.object === pavement);
      assert(hit !== undefined, 'continuous pavement covers the entire hill');
      if (!hit) continue;
      maximumPavementHeightError = Math.max(maximumPavementHeightError,
        Math.abs(hit.point.y - ground.getRoadHeightAt(hillEntry.x, z) - SUBJECT2_ROAD_SURFACE_OFFSET));
      assert(hit.point.y < ground.getRoadHeightAt(hillEntry.x, z)
        + SUBJECT2_ROAD_SURFACE_OFFSET + config.markings.surfaceClearance,
      'hill markings stay above the rendered pavement');
    }
    assert(maximumPavementHeightError < 0.007, 'rendered hill agrees with physical height within 7 mm');

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
    assertNear(maximumGripStep, 0, 1e-9, 'crossing project markings does not change grip');
    assertNear(maximumRollingResistanceStep, 0, 1e-9, 'crossing project markings does not change rolling resistance');

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
      openApronGrip: openApron.gripMultiplier,
      maximumPavementHeightError,
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
