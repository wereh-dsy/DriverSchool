import { DrivingTestTrack } from './DrivingTestTrack';

export interface DrivingTestTrackSelfTestResult {
  readonly assertions: number;
  readonly asphaltGrip: number;
  readonly shoulderGrip: number;
  readonly grassGrip: number;
  readonly shoulderRollingResistance: number;
  readonly grassRollingResistance: number;
  readonly maximumGripStep: number;
  readonly maximumRollingResistanceStep: number;
  readonly markingVertices: number;
  readonly markingClearanceError: number;
  readonly markingJoinGap: number;
  readonly markingHeightRange: number;
}

const assertNear = (
  actual: number,
  expected: number,
  tolerance: number,
  label: string,
): void => {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected} ± ${tolerance}, received ${actual}`);
  }
};

/** Framework-free regression coverage for road materials and hill markings. */
export function runDrivingTestTrackSelfTest(): DrivingTestTrackSelfTestResult {
  const track = new DrivingTestTrack({ shadows: false, treeCount: 0 });
  let assertions = 0;
  const assert = (condition: boolean, message: string): void => {
    assertions += 1;
    if (!condition) throw new Error(`Driving-test-track self-test failed: ${message}`);
  };

  try {
    const coursePoint = track.mainCourseCurve.getPointAt(0.025);
    const courseTangent = track.mainCourseCurve.getTangentAt(0.025).normalize();
    const rightX = -courseTangent.z;
    const rightZ = courseTangent.x;
    const sampleAtOffset = (offset: number) => track.sampleRoadSurface(
      coursePoint.x + rightX * offset,
      coursePoint.z + rightZ * offset,
    );
    const asphalt = sampleAtOffset(0);
    const crossRoad = track.sampleRoadSurface(-100, 30);
    const parking = track.sampleRoadSurface(105, 66);
    assertNear(asphalt.gripMultiplier, 1, 1e-9, 'main-course asphalt grip');
    assertNear(asphalt.rollingResistanceMultiplier, 1, 1e-9, 'main-course asphalt rolling resistance');
    assertNear(crossRoad.gripMultiplier, 1, 1e-9, 'intersection asphalt grip');
    assertNear(parking.rollingResistanceMultiplier, 1, 1e-9, 'parking asphalt rolling resistance');
    assertions += 4;

    const shoulder = sampleAtOffset(track.roadWidth * 0.5 + 0.55);
    const grass = sampleAtOffset(track.roadWidth * 0.5 + 4);
    assertNear(shoulder.gripMultiplier, 0.78, 0.015, 'compacted-shoulder grip');
    assertNear(shoulder.rollingResistanceMultiplier, 1.7, 0.04, 'compacted-shoulder rolling resistance');
    assertNear(grass.gripMultiplier, 0.55, 0.01, 'grass grip');
    assertNear(grass.rollingResistanceMultiplier, 3, 0.02, 'grass rolling resistance');
    assertions += 4;

    let maximumGripStep = 0;
    let maximumRollingResistanceStep = 0;
    let previous = sampleAtOffset(track.roadWidth * 0.5 - 0.25);
    for (let offset = -0.2; offset <= 3; offset += 0.05) {
      const sample = sampleAtOffset(track.roadWidth * 0.5 + offset);
      maximumGripStep = Math.max(
        maximumGripStep,
        Math.abs(sample.gripMultiplier - previous.gripMultiplier),
      );
      maximumRollingResistanceStep = Math.max(
        maximumRollingResistanceStep,
        Math.abs(
          sample.rollingResistanceMultiplier - previous.rollingResistanceMultiplier,
        ),
      );
      previous = sample;
    }
    assert(maximumGripStep < 0.03, 'grip transition should not contain a sharp boundary step');
    assert(
      maximumRollingResistanceStep < 0.09,
      'rolling-resistance transition should not contain a sharp boundary step',
    );

    const markings = track.getRoadMarkingDiagnostics();
    assert(markings.vertexCount > 10_000, 'road-conforming markings should be densely sampled');
    assert(markings.maxClearanceError < 2e-5, 'markings must maintain authored asphalt clearance');
    assert(markings.maxJoinGap < 1e-7, 'adjacent marking subdivisions must be continuous');
    assert(
      markings.maximumWorldHeight - markings.minimumWorldHeight > 7.9,
      'markings must follow the full hill elevation range',
    );

    return {
      assertions,
      asphaltGrip: asphalt.gripMultiplier,
      shoulderGrip: shoulder.gripMultiplier,
      grassGrip: grass.gripMultiplier,
      shoulderRollingResistance: shoulder.rollingResistanceMultiplier,
      grassRollingResistance: grass.rollingResistanceMultiplier,
      maximumGripStep,
      maximumRollingResistanceStep,
      markingVertices: markings.vertexCount,
      markingClearanceError: markings.maxClearanceError,
      markingJoinGap: markings.maxJoinGap,
      markingHeightRange: markings.maximumWorldHeight - markings.minimumWorldHeight,
    };
  } finally {
    track.dispose();
  }
}
