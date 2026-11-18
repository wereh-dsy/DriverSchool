import { DrivingTestTrack } from '../../world/DrivingTestTrack';
import { CircuitGround } from '../../world/circuit/CircuitGround';
import { Subject2Ground } from '../../world/subject2/Subject2Ground';
import {
  blendSurfaceMaterials,
  sampleGroundGeometry,
  surfaceResponseAliases,
  SURFACE_MATERIALS,
  type RoadSurfaceSample,
} from '../../world/SurfaceMaterial';
import {
  averageWheelGroundGeometry,
  sampleWheelContacts,
  wheelContactsAsArray,
  type WheelSurfaceQuery,
} from './WheelContact';

export interface WheelContactSelfTestResult {
  readonly assertions: number;
  readonly roadSplitGripDifference: number;
  readonly splitRollingResistanceDifference: number;
  readonly maximumBoundaryGripStep: number;
  readonly maximumBoundaryRollingResistanceStep: number;
  readonly maximumNormalLengthError: number;
}

/** Exercise wheel placement and world-query continuity independently of the force model. */
export function runWheelContactSelfTest(): WheelContactSelfTestResult {
  let assertions = 0;
  const assert = (condition: boolean, message: string): void => {
    assertions += 1;
    if (!condition) throw new Error(`Wheel-contact self-test failed: ${message}`);
  };
  const near = (actual: number, expected: number, message: string): void => {
    assert(Math.abs(actual - expected) < 1e-9, `${message}: got ${actual}, expected ${expected}`);
  };
  const dimensions = { wheelBase: 2.7, frontTrackWidth: 1.55, rearTrackWidth: 1.54 };
  let queries = 0;
  const heightAt = (x: number, z: number): number => 0.08 * x - 0.12 * z;
  const plane: WheelSurfaceQuery = {
    sampleRoadSurface(x, z): RoadSurfaceSample {
      queries += 1;
      // Full asphalt on the left, full grass on the right, with an 0.8 m blend.
      const t = Math.max(0, Math.min(1, (x + 0.4) / 0.8));
      const blend = t * t * (3 - 2 * t);
      return {
        ...sampleGroundGeometry(heightAt, x, z),
        ...surfaceResponseAliases(blendSurfaceMaterials(SURFACE_MATERIALS.asphalt, SURFACE_MATERIALS.grass, blend)),
      };
    },
  };
  const split = sampleWheelContacts(plane, { x: 0, z: 0, yaw: 0 }, dimensions);
  assert(queries === 4, 'each wheel must issue its own world query');
  near(split.frontLeft.x, -0.775, 'front left track coordinate');
  near(split.frontRight.x, 0.775, 'front right track coordinate');
  near(split.rearLeft.x, -0.77, 'rear left track coordinate');
  near(split.rearRight.x, 0.77, 'rear right track coordinate');
  near(split.frontLeft.z, -1.35, 'front axle forward coordinate');
  near(split.rearLeft.z, 1.35, 'rear axle rearward coordinate');
  assert(split.frontLeft.surfaceType === 'asphalt' && split.frontRight.surfaceType === 'grass', 'split surface labels must remain independent');
  near(split.frontLeft.longitudinalGrip, 1, 'left asphalt longitudinal grip');
  near(split.frontRight.longitudinalGrip, 0.55, 'right grass longitudinal grip');
  near(split.frontLeft.lateralGrip, 1, 'left asphalt lateral grip');
  near(split.frontRight.lateralGrip, 0.55, 'right grass lateral grip');
  const splitRollingResistanceDifference = split.frontRight.rollingResistance - split.frontLeft.rollingResistance;
  near(splitRollingResistanceDifference, 2, 'split grass rolling resistance');

  const quarterTurn = sampleWheelContacts(plane, { x: 10, z: 20, yaw: Math.PI * 0.5 }, dimensions);
  near(quarterTurn.frontLeft.x, 8.65, 'rotated front wheel world X');
  near(quarterTurn.frontLeft.z, 20.775, 'rotated left wheel world Z');
  near(quarterTurn.rearRight.x, 11.35, 'rotated rear wheel world X');
  near(quarterTurn.rearRight.z, 19.23, 'rotated right wheel world Z');
  const average = averageWheelGroundGeometry(quarterTurn);
  near(average.height, heightAt(10, 20), 'averaged planar ground height');
  near(Math.hypot(average.normal.x, average.normal.y, average.normal.z), 1, 'averaged normal length');

  const forward = sampleGroundGeometry(heightAt, 4, 8, { x: 0, y: -1 });
  const reverse = sampleGroundGeometry(heightAt, 4, 8, { x: 0, y: 1 });
  const lateral = sampleGroundGeometry(heightAt, 4, 8, { x: 1, y: 0 });
  near(forward.grade, 0.12, 'forward slope');
  near(reverse.grade, -0.12, 'reverse slope');
  near(lateral.grade, 0.08, 'lateral slope');
  near(forward.normal.distanceTo(reverse.normal), 0, 'surface normal must not depend on travel direction');
  near(forward.normal.distanceTo(lateral.normal), 0, 'surface normal must retain both crossfall and hill slope');
  near(forward.normal.x / forward.normal.y, -0.08, 'crossfall normal');
  near(forward.normal.z / forward.normal.y, 0.12, 'hill normal');

  const road = new DrivingTestTrack({ shadows: false, treeCount: 0 });
  const circuit = new CircuitGround({ shadows: false });
  const subject2 = new Subject2Ground({ shadows: false });
  let maximumBoundaryGripStep = 0;
  let maximumBoundaryRollingResistanceStep = 0;
  let maximumNormalLengthError = 0;
  let roadSplitGripDifference = 0;
  try {
    const roadSplit = sampleWheelContacts(road, { x: road.roadWidth * 0.5, z: 80, yaw: 0 }, dimensions);
    roadSplitGripDifference = roadSplit.frontLeft.lateralGrip - roadSplit.frontRight.lateralGrip;
    assert(roadSplitGripDifference > 0.15, 'actual road edge must affect the right wheels before the left');
    assert(roadSplit.frontRight.rollingResistance > roadSplit.frontLeft.rollingResistance + 0.45, 'actual road-edge drag must remain per-wheel');
    const boundaries = [
      { ground: road, x: road.roadWidth * 0.5, z: 80, dx: 1, dz: 0, extent: 4 },
      { ground: circuit, x: -172.5 - circuit.config.trackWidth * 0.5, z: -150, dx: -1, dz: 0, extent: 4 },
      {
        ground: subject2,
        x: subject2.config.layout.waitingCenter.x,
        z: subject2.config.layout.waitingCenter.z - subject2.config.waitingArea.width * 0.5,
        dx: 0, dz: -1, extent: 3,
      },
    ];
    for (const boundary of boundaries) {
      let previous = boundary.ground.sampleRoadSurface(boundary.x - boundary.dx * 0.1, boundary.z - boundary.dz * 0.1);
      for (let offset = -0.09; offset <= boundary.extent; offset += 0.01) {
        const sample = boundary.ground.sampleRoadSurface(boundary.x + boundary.dx * offset, boundary.z + boundary.dz * offset);
        maximumBoundaryGripStep = Math.max(maximumBoundaryGripStep, Math.abs(sample.longitudinalGrip - previous.longitudinalGrip), Math.abs(sample.lateralGrip - previous.lateralGrip));
        maximumBoundaryRollingResistanceStep = Math.max(maximumBoundaryRollingResistanceStep, Math.abs(sample.rollingResistance - previous.rollingResistance));
        maximumNormalLengthError = Math.max(maximumNormalLengthError, Math.abs(sample.normal.length() - 1));
        assert(sample.roughness >= 0 && Number.isFinite(sample.height), 'world surface data must be finite and roughness nonnegative');
        near(sample.gripMultiplier, sample.lateralGrip, 'legacy grip alias');
        near(sample.rollingResistanceMultiplier, sample.rollingResistance, 'legacy rolling-resistance alias');
        previous = sample;
      }
    }
    assert(maximumBoundaryGripStep < 0.007, 'all maps must blend grip without wheel-sized hard boundaries');
    assert(maximumBoundaryRollingResistanceStep < 0.028, `all maps must blend rolling drag continuously (maximum 1 cm step ${maximumBoundaryRollingResistanceStep})`);
    assert(maximumNormalLengthError < 1e-12, 'every queried world normal must be normalized');
    for (const [ground, x, z] of [
      [road, 25, -220],
      [subject2, subject2.config.layout.hillEntry.x + 3.6, subject2.config.layout.hillEntry.z - 7],
    ] as const) {
      const first = ground.sampleRoadSurface(x, z, { x: 0, y: -1 });
      const second = ground.sampleRoadSurface(x, z, { x: 1, y: 0 });
      assert(first.normal.y > 0.85 && Math.abs(first.normal.x) > 0.01 && Math.abs(first.normal.z) > 0.01, 'authored hill normal must include lateral embankment and longitudinal slope');
      near(first.normal.distanceTo(second.normal), 0, 'authored hill normal direction independence');
    }
    assert(wheelContactsAsArray(split).length === 4, 'debug and force consumers must receive all four contacts');
    return {
      assertions, roadSplitGripDifference, splitRollingResistanceDifference,
      maximumBoundaryGripStep, maximumBoundaryRollingResistanceStep, maximumNormalLengthError,
    };
  } finally {
    road.dispose();
    circuit.dispose();
    subject2.dispose();
  }
}
