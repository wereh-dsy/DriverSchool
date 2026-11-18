import { Group, Mesh, Scene } from 'three';
import { TrajectoryPrediction } from './TrajectoryPrediction';
import { TrajectoryPredictor, TRAJECTORY_MAX_POINTS, type TrajectoryState } from './TrajectoryPredictor';
import { VEHICLE_RENDER_LAYERS } from '../../vehicle/visual/VehicleRenderLayers';

export function runTrajectoryPredictionSelfTest(): Record<string, boolean> {
  const assert = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(`Trajectory prediction: ${message}`);
  };
  const predictor = new TrajectoryPredictor();
  const geometry = Object.freeze({ wheelBase: 2.7, frontWeightBias: 0.6, width: 1.8, length: 4.6 });
  const state: TrajectoryState = { x: 5, z: 10, yaw: 0, speed: 10, acceleration: 0, lateralVelocity: 0, yawRate: 0, steeringAngle: 0 };
  const straight = predictor.predict(Object.freeze({ ...state }), geometry);
  const buffer = straight.positions, last = (TRAJECTORY_MAX_POINTS - 1) * 2;
  assert(straight.pointCount === 41 && straight.horizonSeconds === 2, 'must cover two seconds');
  assert(Math.abs(buffer[last]! - 5) < 1e-9 && Math.abs(buffer[last + 1]! + 10) < 1e-9, 'straight path must follow speed * time');
  const east = predictor.predict({ ...state, yaw: -Math.PI / 2 }, geometry);
  assert(Math.abs(east.positions[last]! - 25) < 1e-9 && Math.abs(east.positions[last + 1]! - 10) < 1e-9, 'world heading convention');
  const left = predictor.predict({ ...state, speed: 2, steeringAngle: -0.2 }, geometry);
  const leftX = left.positions[last]!;
  const right = predictor.predict({ ...state, speed: 2, steeringAngle: 0.2 }, geometry);
  assert(leftX < state.x && right.positions[last]! > state.x, 'rack must bend forecast in the correct direction');
  assert(Math.abs(leftX + right.positions[last]! - 2 * state.x) < 1e-9, 'left/right symmetry');
  const reverse = predictor.predict({ ...state, speed: -2, steeringAngle: 0.2 }, geometry);
  assert(reverse.positions[last + 1]! > state.z && reverse.positions[last]! > state.x, 'reverse curves behind the car');
  const slide = predictor.predict({ ...state, lateralVelocity: 2 }, geometry);
  assert(Math.abs(slide.positions[last]! - 9) < 1e-9, 'must preserve measured sideslip');
  const sidewaysSpin = predictor.predict({ ...state, speed: 0, lateralVelocity: 2, yawRate: 0.2 }, geometry);
  assert(Math.abs(sidewaysSpin.headings[40]! - 0.4) < 1e-9, 'sideways motion must retain measured rotation even at zero forward speed');
  const turning = predictor.predict({ ...state, speed: 25, yawRate: 0.2 }, geometry);
  assert(turning.positions[last]! < state.x - 8, 'observed yaw dominates high-speed forecast with centred rack');
  const circle = predictor.predict({ ...state, yawRate: 0.2, steeringAngle: Math.atan(-0.2 * geometry.wheelBase / state.speed) }, geometry);
  const offset = geometry.wheelBase * (0.5 - geometry.frontWeightBias);
  const exactX = state.x + 50 * (Math.cos(0.4) - 1) - Math.sin(0.4) * offset;
  const exactZ = state.z + offset - 50 * Math.sin(0.4) - Math.cos(0.4) * offset;
  assert(Math.hypot(circle.positions[last]! - exactX, circle.positions[last + 1]! - exactZ) < 0.001, 'constant turn must agree with analytic circle including CG offset');
  const accelerate = predictor.predict({ ...state, acceleration: 2 }, geometry);
  assert(Math.abs(accelerate.positions[last + 1]! + 14) < 1e-9 && Math.abs(accelerate.speeds[40]! - 14) < 1e-9,
    'acceleration must change travel distance and endpoint speed');
  const brake = predictor.predict({ ...state, acceleration: -5 }, geometry);
  assert(brake.stopTimeSeconds === 2 && brake.pointCount === 41 && Math.abs(brake.positions[81]!) < 1e-9, 'braking must stop after v squared / 2a');
  assert(brake.speeds[40] === 0, 'braking must not forecast reverse motion');
  const fractionalStop = predictor.predict({ ...state, acceleration: -7 }, geometry);
  assert(Math.abs(fractionalStop.times[fractionalStop.pointCount - 1]! - 10 / 7) < 1e-9 &&
    Math.abs(fractionalStop.positions[(fractionalStop.pointCount - 1) * 2 + 1]! - (10 - 100 / 14)) < 1e-9,
    'stop between fixed samples must integrate the partial step');
  const reverseBrake = predictor.predict({ ...state, speed: -10, acceleration: 5 }, geometry);
  assert(reverseBrake.stopTimeSeconds === 2 && Math.abs(reverseBrake.positions[81]! - 20) < 1e-9, 'reverse braking signs');
  const invalid = predictor.predict({ ...state, speed: NaN }, geometry);
  assert(invalid.pointCount === 0, 'invalid telemetry must not enter renderer');
  assert(predictor.predict({ ...state, speed: 0 }, geometry).pointCount === 0, 'stationary vehicle has no path');
  assert(predictor.result.positions === buffer, 'prediction reuses storage');

  const scene = new Scene();
  let samples = 0;
  const ground = { getRoadHeightAt: (x: number, z: number): number => { samples++; return 3 + x * 0.01 + z * 0.02; } };
  const frozenState = Object.freeze({ ...state });
  const feature = new TrajectoryPrediction(scene);
  const root = scene.children[0] as Group, mesh = root.children[0] as Mesh;
  feature.update(1 / 60, frozenState, geometry, ground, false);
  assert(!root.visible && samples === 0, 'inactive skips prediction and surface queries');
  feature.update(1 / 60, frozenState, geometry, ground, true);
  const firstSamples = samples, fullDrawCount = mesh.geometry.drawRange.count;
  assert(root.visible && fullDrawCount === 240 && root.children.length === 1, 'enabled publishes only a single line without markers or footprint');
  assert(mesh.layers.mask === 1 << VEHICLE_RENDER_LAYERS.DEBUG, 'excluded from reflection/parking camera layers');
  assert(!Array.isArray(mesh.material) && mesh.material.depthTest && !mesh.material.depthWrite, 'cockpit occludes the overlay without overlay changing scene depth');
  const attribute = mesh.geometry.getAttribute('position');
  assert(Math.abs(attribute.getY(0) - 3.2634) < 1e-5, 'must project bumper-leading path onto existing ground');
  assert(Math.abs(attribute.getX(1) - attribute.getX(0) - 0.12) < 1e-5, 'single thick line must stay narrow');
  const colors = mesh.geometry.getAttribute('color');
  assert(colors.getX(0) < colors.getX(80) && colors.getY(0) > colors.getY(80) && colors.getZ(0) > colors.getZ(80),
    'future time must change the line from cyan towards orange');
  const gpuGeometry = mesh.geometry, material = mesh.material;
  feature.update(1 / 60, frozenState, geometry, ground, true);
  assert(samples === firstSamples, 'surface projection is throttled');
  feature.update(0.05, frozenState, geometry, ground, true);
  assert(mesh.geometry === gpuGeometry && mesh.material === material && mesh.geometry.getAttribute('position') === attribute, 'GPU resources reused');
  const cliff = { getRoadHeightAt: (_x: number, z: number): number => z < 0 ? 100 : 0 };
  feature.update(0.05, frozenState, geometry, cliff, true);
  assert(root.visible && mesh.geometry.drawRange.count < fullDrawCount, 'height discontinuity truncates projected line');
  feature.update(0.05, frozenState, geometry, { getRoadHeightAt: () => NaN }, true);
  assert(!root.visible, 'invalid projection hides stale geometry');
  feature.update(0.05, { ...state, speed: 0 }, geometry, ground, true);
  assert(!root.visible, 'stopping hides forecast');
  let disposedGeometry = false, disposedMaterial = false;
  gpuGeometry.addEventListener('dispose', () => { disposedGeometry = true; });
  if (!Array.isArray(material)) material.addEventListener('dispose', () => { disposedMaterial = true; });
  feature.dispose();
  assert(scene.children.length === 0 && disposedGeometry && disposedMaterial, 'disable detaches and releases GPU resources');
  const reenabled = new TrajectoryPrediction(scene);
  reenabled.update(0, frozenState, geometry, ground, true);
  assert(scene.children.length === 1 && scene.children[0]!.visible, 're-enable works immediately');
  reenabled.dispose();
  return { straight: true, heading: true, steering: true, reverse: true, lateralMotion: true, observedYaw: true,
    analyticTurn: true, acceleration: true, brakingAndPartialStop: true, reverseBraking: true,
    invalidAndStationary: true, bufferReuse: true, singleLineAndTimeColors: true, groundProjection: true, depthOcclusion: true,
    projectionDiscontinuity: true, lifecycle: true, readOnlyInput: true };
}
