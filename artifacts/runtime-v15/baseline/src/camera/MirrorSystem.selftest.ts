import {
  Euler,
  MathUtils,
  Matrix3,
  Matrix4,
  Object3D,
  Quaternion,
  Vector2,
  Vector3,
} from 'three';
import { DriverCamera } from './DriverCamera';
import { MirrorAdjustmentController } from './MirrorAdjustmentController';
import { runMirrorReflectionSelfTest, type MirrorReflectionSelfTestResult } from './MirrorReflection.selftest';
import {
  DEFAULT_SEDAN_VISUAL_CONFIG,
  SPORTS_COUPE_VISUAL_CONFIG,
} from '../vehicle/visual/VehicleVisualConfig';
import {
  computePlanarMirrorView,
  createPlanarMirrorViewComputation,
  reflectDirectionAcrossPlane,
} from './MirrorMath';

export interface MirrorGeometrySelfTestResult {
  reflection: MirrorReflectionSelfTestResult;
  fixedEyeHeadYawCameraDelta: number;
  fixedEyeHeadYawProjectionDelta: number;
  fixedEyeHeadYawTextureDelta: number;
  movedEyeCameraDelta: number;
  movedEyeProjectionDelta: number;
  movedEyeTextureDelta: number;
  cameraBasisDeterminant: number;
  rawTargetIsHorizontallyMirrored: boolean;
  rawTargetIsVerticallyUpright: boolean;
  defaultRearwardPitchDegrees: number;
  defaultRearwardYawDegrees: number;
  defaultRearwardHorizonNdcY: number;
  rearRoadTwentyMetresNdcY: number;
  mirrorAspectRatio: number;
  actualMirrorHorizonNdcY: Readonly<Record<'sedan' | 'sport', number>>;
  actualRearRoadTwentyMetresNdcY: Readonly<Record<'sedan' | 'sport', number>>;
  actualRearRoadTwentyMetresNdcX: Readonly<Record<'sedan' | 'sport', number>>;
  actualRearRoadTwentyMetresNdcZ: Readonly<Record<'sedan' | 'sport', number>>;
  mirrorAdjustmentIsIndependent: boolean;
  mirrorAdjustmentClamped: boolean;
  legacyAdjustmentWasDiscarded: boolean;
}

interface MirrorMatrixSnapshot {
  readonly camera: Matrix4;
  readonly projection: Matrix4;
  readonly texture: Matrix4;
  readonly view: Matrix4;
  readonly mirrorRight: Vector3;
  readonly mirrorUp: Vector3;
}

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`Mirror geometry self-test failed: ${message}`);
};

/**
 * Framework-free numerical regression test. It does not create a renderer or
 * touch the DOM, so it can run from a browser console or any test runner.
 */
export function runMirrorGeometrySelfTest(): MirrorGeometrySelfTestResult {
  const vehicle = new Object3D();
  const sedanConfig = DEFAULT_SEDAN_VISUAL_CONFIG;
  const driver = new DriverCamera({
    driverEyePosition: sedanConfig.driverEyePosition,
    near: 0.025,
    far: 2_500,
  });
  const mirrorCenter = new Vector3(...sedanConfig.rightMirrorTransform.position);
  const mirrorRotation = new Quaternion().setFromEuler(
    new Euler(...sedanConfig.rightMirrorTransform.rotation),
  );
  const authoredRight = new Vector3(1, 0, 0).applyQuaternion(mirrorRotation);
  const authoredUp = new Vector3(0, 1, 0).applyQuaternion(mirrorRotation);
  const authoredNormal = new Vector3(0, 0, 1).applyQuaternion(mirrorRotation);
  const mirrorSize = new Vector2(...sedanConfig.rightMirrorTransform.size);

  const capture = (headYaw: number): MirrorMatrixSnapshot => {
    driver.setHeadLook(headYaw, MathUtils.degToRad(3));
    driver.update(vehicle, 0);
    const eye = driver.getWorldEyePosition();
    const result = computePlanarMirrorView(
      {
        eye,
        center: mirrorCenter,
        right: authoredRight,
        up: authoredUp,
        normal: authoredNormal,
        size: mirrorSize,
        near: driver.camera.near,
        far: driver.camera.far,
        padding: 0,
        clipBias: 0.003,
      },
      createPlanarMirrorViewComputation(),
    );
    assert(result.valid, 'representative right-mirror geometry must be valid');
    return {
      camera: result.cameraMatrixWorld.clone(),
      projection: result.projectionMatrix.clone(),
      texture: result.textureMatrix.clone(),
      view: result.cameraMatrixWorldInverse.clone(),
      mirrorRight: result.mirrorRight.clone(),
      mirrorUp: result.mirrorUp.clone(),
    };
  };

  const headLeft = capture(MathUtils.degToRad(-20));
  const headRight = capture(MathUtils.degToRad(20));
  const fixedEyeHeadYawCameraDelta = matrixMaxDelta(
    headLeft.camera,
    headRight.camera,
  );
  const fixedEyeHeadYawProjectionDelta = matrixMaxDelta(
    headLeft.projection,
    headRight.projection,
  );
  const fixedEyeHeadYawTextureDelta = matrixMaxDelta(
    headLeft.texture,
    headRight.texture,
  );

  assert(
    fixedEyeHeadYawCameraDelta <= 1e-12,
    'fixed eye with different head yaw changed the mirror camera matrix',
  );
  assert(
    fixedEyeHeadYawProjectionDelta <= 1e-12,
    'fixed eye with different head yaw changed the mirror projection',
  );
  assert(
    fixedEyeHeadYawTextureDelta <= 1e-12,
    'fixed eye with different head yaw changed the mirror texture matrix',
  );

  driver.setDriverEyePosition([-0.25, 1.22, 0.27]);
  const movedEye = capture(MathUtils.degToRad(20));
  const movedEyeCameraDelta = matrixMaxDelta(headRight.camera, movedEye.camera);
  const movedEyeProjectionDelta = matrixMaxDelta(
    headRight.projection,
    movedEye.projection,
  );
  const movedEyeTextureDelta = matrixMaxDelta(headRight.texture, movedEye.texture);
  assert(movedEyeCameraDelta > 1e-6, 'moving the eye did not move the virtual camera');
  assert(movedEyeProjectionDelta > 1e-6, 'moving the eye did not update the off-axis projection');
  assert(movedEyeTextureDelta > 1e-6, 'moving the eye did not update the texture matrix');

  const cameraBasisDeterminant = new Matrix3()
    .setFromMatrix4(headRight.camera)
    .determinant();
  assert(
    Math.abs(cameraBasisDeterminant - 1) <= 1e-10,
    'mirror camera basis must remain right-handed for Three.js culling',
  );

  const viewProjection = new Matrix4()
    .copy(headRight.projection)
    .multiply(headRight.view);
  const physicalRight = mirrorCenter.clone()
    .addScaledVector(headRight.mirrorRight, mirrorSize.x * 0.5)
    .applyMatrix4(viewProjection);
  const physicalLeft = mirrorCenter.clone()
    .addScaledVector(headRight.mirrorRight, -mirrorSize.x * 0.5)
    .applyMatrix4(viewProjection);
  const physicalTop = mirrorCenter.clone()
    .addScaledVector(headRight.mirrorUp, mirrorSize.y * 0.5)
    .applyMatrix4(viewProjection);
  const physicalBottom = mirrorCenter.clone()
    .addScaledVector(headRight.mirrorUp, -mirrorSize.y * 0.5)
    .applyMatrix4(viewProjection);
  const rawTargetIsHorizontallyMirrored = physicalRight.x < physicalLeft.x;
  const rawTargetIsVerticallyUpright = physicalTop.y > physicalBottom.y;
  assert(
    rawTargetIsHorizontallyMirrored,
    'raw render target lost the real mirror horizontal parity',
  );
  assert(
    rawTargetIsVerticallyUpright,
    'raw render target is vertically inverted',
  );

  // The default glass should look rearward and a little downward. A level
  // centre ray makes the HUD preview mostly sky; an excessive downward angle
  // behaves like a reversing camera rather than a side mirror.
  const defaultSightRay = mirrorCenter.clone()
    .sub(new Vector3(...sedanConfig.driverEyePosition))
    .normalize();
  const defaultRearwardRay = reflectDirectionAcrossPlane(
    defaultSightRay,
    authoredNormal,
  ).normalize();
  const defaultRearwardPitchDegrees = MathUtils.radToDeg(
    Math.asin(defaultRearwardRay.y),
  );
  const defaultRearwardYawDegrees = MathUtils.radToDeg(
    Math.atan2(defaultRearwardRay.x, defaultRearwardRay.z),
  );
  const mirrorAspectRatio = mirrorSize.x / mirrorSize.y;
  const defaultRearwardHorizonNdcY = new Vector3(0, sedanConfig.driverEyePosition[1], 1_000)
    .applyMatrix4(viewProjection)
    .y;
  const rearRoadTwentyMetresNdcY = new Vector3(0, 0, 20)
    .applyMatrix4(viewProjection)
    .y;
  const actualMirrorSamples = Object.entries({
    sedan: DEFAULT_SEDAN_VISUAL_CONFIG,
    sport: SPORTS_COUPE_VISUAL_CONFIG,
  }).map(([name, config]) => {
    const center = new Vector3(...config.rightMirrorTransform.position);
    const rotation = new Quaternion().setFromEuler(
      new Euler(...config.rightMirrorTransform.rotation),
    );
    const result = computePlanarMirrorView({
      eye: new Vector3(...config.driverEyePosition),
      center,
      right: new Vector3(1, 0, 0).applyQuaternion(rotation),
      up: new Vector3(0, 1, 0).applyQuaternion(rotation),
      normal: new Vector3(0, 0, 1).applyQuaternion(rotation),
      size: new Vector2(...config.rightMirrorTransform.size),
      near: driver.camera.near,
      far: driver.camera.far,
      padding: 0.025,
      clipBias: 0.003,
    });
    assert(result.valid, `${name} mirror optics are invalid`);
    const matrix = new Matrix4().multiplyMatrices(
      result.projectionMatrix, result.cameraMatrixWorldInverse,
    );
    const rearRoad = new Vector3(0, 0, 20).applyMatrix4(matrix);
    return {
      name,
      horizon: new Vector3(0, config.driverEyePosition[1], 1_000).applyMatrix4(matrix).y,
      road: rearRoad.y,
      roadX: rearRoad.x,
      roadZ: rearRoad.z,
    };
  });
  const actualMirrorHorizonNdcY = Object.fromEntries(
    actualMirrorSamples.map(({ name, horizon }) => [name, horizon]),
  ) as Record<'sedan' | 'sport', number>;
  const actualRearRoadTwentyMetresNdcY = Object.fromEntries(
    actualMirrorSamples.map(({ name, road }) => [name, road]),
  ) as Record<'sedan' | 'sport', number>;
  const actualRearRoadTwentyMetresNdcX = Object.fromEntries(
    actualMirrorSamples.map(({ name, roadX }) => [name, roadX]),
  ) as Record<'sedan' | 'sport', number>;
  const actualRearRoadTwentyMetresNdcZ = Object.fromEntries(
    actualMirrorSamples.map(({ name, roadZ }) => [name, roadZ]),
  ) as Record<'sedan' | 'sport', number>;
  assert(defaultRearwardRay.z > 0.96, 'default mirror no longer looks rearward');
  assert(
    defaultRearwardPitchDegrees >= -15 && defaultRearwardPitchDegrees <= -3,
    'default parking mirror centre ray must show nearby road, not mostly sky',
  );
  assert(
    Math.abs(defaultRearwardYawDegrees) <= 5,
    'default mirror centre ray is aimed too far across the car or roadside',
  );
  assert(
    Number.isFinite(defaultRearwardHorizonNdcY) && defaultRearwardHorizonNdcY > 0,
    'default mirror horizon must remain above the parking-ground view',
  );
  assert(
    Number.isFinite(rearRoadTwentyMetresNdcY),
    'distant road projection must remain finite',
  );
  assert(
    mirrorAspectRatio >= 1.8 && mirrorAspectRatio <= 2.05,
    'mirror aperture is not a plausible rectangular side-mirror proportion',
  );
  for (const { name, horizon, road, roadX, roadZ } of actualMirrorSamples) {
    assert(horizon > 0 && Number.isFinite(horizon) && Number.isFinite(road),
      `${name} parking mirror distant projection is invalid`);
    assert(Number.isFinite(roadX) && Number.isFinite(roadZ),
      `${name} mirror distant road coordinates are not finite`);
  }

  const leftGlass = new Object3D();
  const rightGlass = new Object3D();
  const adjustment = new MirrorAdjustmentController(
    { left: leftGlass, right: rightGlass },
    { storage: null },
  );
  adjustment.nudge('left', MathUtils.degToRad(30), MathUtils.degToRad(20));
  const leftAdjustment = adjustment.get('left');
  const rightAdjustment = adjustment.get('right');
  const mirrorAdjustmentIsIndependent =
    Math.abs(leftAdjustment.yaw) > 0 &&
    rightAdjustment.yaw === 0 &&
    rightAdjustment.pitch === 0;
  const mirrorAdjustmentClamped =
    Math.abs(leftAdjustment.yaw - MathUtils.degToRad(10)) <= 1e-12 &&
    Math.abs(leftAdjustment.pitch - MathUtils.degToRad(7)) <= 1e-12;
  assert(mirrorAdjustmentIsIndependent, 'left adjustment changed the right mirror');
  assert(mirrorAdjustmentClamped, 'mirror adjustment exceeded its safe travel');

  const storedValues = new Map<string, string>([
    ['drivergame.mirror-adjustments.v1', JSON.stringify({
      left: { yaw: 0.15, pitch: 0.1 },
      right: { yaw: -0.15, pitch: -0.1 },
    })],
    ['drivergame.mirror-adjustments.v2', JSON.stringify({
      left: { yaw: -0.02, pitch: 0.07 },
      right: { yaw: -0.07, pitch: 0.09 },
    })],
    ['drivergame.mirror-adjustments.v3', JSON.stringify({
      left: { yaw: 0.03, pitch: -0.04 },
      right: { yaw: -0.04, pitch: 0.05 },
    })],
  ]);
  const legacyStorage = {
    getItem: (key: string): string | null => storedValues.get(key) ?? null,
    setItem: (key: string, value: string): void => { storedValues.set(key, value); },
    removeItem: (key: string): void => { storedValues.delete(key); },
  };
  const freshAdjustment = new MirrorAdjustmentController(
    { left: new Object3D(), right: new Object3D() },
    { storage: legacyStorage },
  );
  const legacyAdjustmentWasDiscarded =
    freshAdjustment.get('left').yaw === 0 &&
    freshAdjustment.get('left').pitch === 0 &&
    freshAdjustment.get('right').yaw === 0 &&
    freshAdjustment.get('right').pitch === 0 &&
    !storedValues.has('drivergame.mirror-adjustments.v1') &&
    !storedValues.has('drivergame.mirror-adjustments.v2') &&
    !storedValues.has('drivergame.mirror-adjustments.v3');
  assert(
    legacyAdjustmentWasDiscarded,
    'legacy mirror calibration was replayed onto the corrected geometry',
  );

  return {
    reflection: runMirrorReflectionSelfTest(),
    fixedEyeHeadYawCameraDelta,
    fixedEyeHeadYawProjectionDelta,
    fixedEyeHeadYawTextureDelta,
    movedEyeCameraDelta,
    movedEyeProjectionDelta,
    movedEyeTextureDelta,
    cameraBasisDeterminant,
    rawTargetIsHorizontallyMirrored,
    rawTargetIsVerticallyUpright,
    defaultRearwardPitchDegrees,
    defaultRearwardYawDegrees,
    defaultRearwardHorizonNdcY,
    rearRoadTwentyMetresNdcY,
    mirrorAspectRatio,
    actualMirrorHorizonNdcY,
    actualRearRoadTwentyMetresNdcY,
    actualRearRoadTwentyMetresNdcX,
    actualRearRoadTwentyMetresNdcZ,
    mirrorAdjustmentIsIndependent,
    mirrorAdjustmentClamped,
    legacyAdjustmentWasDiscarded,
  };
}

function matrixMaxDelta(a: Matrix4, b: Matrix4): number {
  let maximum = 0;
  for (let index = 0; index < 16; index += 1) {
    maximum = Math.max(
      maximum,
      Math.abs((a.elements[index] ?? 0) - (b.elements[index] ?? 0)),
    );
  }
  return maximum;
}
