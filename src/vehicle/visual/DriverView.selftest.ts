import { Object3D, PerspectiveCamera, Vector3 } from 'three';

import {
  DEFAULT_DRIVER_FOV_DEGREES,
  DEFAULT_DRIVER_HEAD_LOOK,
  DriverCamera,
} from '../../camera/DriverCamera';
import {
  INSTRUMENT_CLUSTER_LAYOUT,
  SPORT_INSTRUMENT_CLUSTER_LAYOUT,
} from './InstrumentCluster';
import {
  DEFAULT_SEDAN_VISUAL_CONFIG,
  SPORTS_COUPE_VISUAL_CONFIG,
  type VehicleVisualConfig,
} from './VehicleVisualConfig';

export interface VehicleDriverViewMetrics {
  readonly vehicle: string;
  readonly windshieldLowerEdgeNdcY: number;
  readonly windshieldUpperEdgeNdcY: number;
  readonly windshieldOpeningNdc: number;
  readonly dashboardTopNdcY: number;
  readonly instrumentMinimumNdcY: number;
  readonly instrumentMaximumNdcY: number;
  readonly importantReadoutMinimumNdcY: number;
}

export interface DriverViewSelfTestResult {
  readonly fovDegrees: number;
  readonly yawLimitDegrees: number;
  readonly pitchUpLimitDegrees: number;
  readonly pitchDownLimitDegrees: number;
  readonly vehicles: readonly VehicleDriverViewMetrics[];
}

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`Driver-view self-test failed: ${message}`);
};

const radiansToDegrees = (radians: number): number => radians * 180 / Math.PI;

const sampleVehicleView = (config: VehicleVisualConfig): VehicleDriverViewMetrics => {
  const camera = new PerspectiveCamera(
    DEFAULT_DRIVER_FOV_DEGREES,
    16 / 9,
    0.025,
    2_500,
  );
  camera.position.set(...config.driverEyePosition);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const projectWorld = (x: number, y: number, z: number): Vector3 =>
    new Vector3(x, y, z).project(camera);
  const windshieldLowerEdgeNdcY = projectWorld(
    config.driverEyePosition[0],
    config.cabin.windshieldBottomY,
    config.cabin.windshieldBottomZ,
  ).y;
  const windshieldUpperEdgeNdcY = projectWorld(
    config.driverEyePosition[0],
    config.cabin.windshieldTopY,
    config.cabin.windshieldTopZ,
  ).y;
  const dashboardTopNdcY = projectWorld(
    config.driverEyePosition[0],
    config.cabin.dashboardTopY,
    config.cabin.windshieldBottomZ,
  ).y;

  const cluster = new Object3D();
  cluster.position.set(...config.instrumentClusterTransform.position);
  cluster.rotation.set(...config.instrumentClusterTransform.rotation);
  cluster.scale.setScalar(config.instrumentClusterTransform.scale ?? 1);
  cluster.updateMatrixWorld(true);
  const projectCluster = (x: number, y: number, z: number): Vector3 =>
    new Vector3(x, y, z).applyMatrix4(cluster.matrixWorld).project(camera);

  const facePoints: Vector3[] = [];
  const importantPoints: Vector3[] = [];
  if (config.instrumentCluster.displayStyle === 'sport-tft') {
    const layout = SPORT_INSTRUMENT_CLUSTER_LAYOUT;
    for (const x of [-layout.displayHalfWidth, layout.displayHalfWidth]) {
      for (const y of [-layout.displayHalfHeight, layout.displayHalfHeight]) {
        facePoints.push(projectCluster(x, y, layout.displayZ));
      }
    }
    for (const x of [-layout.primaryHalfWidth, layout.primaryHalfWidth]) {
      for (const y of [
        layout.primaryCenterY - layout.primaryHalfHeight,
        layout.primaryCenterY + layout.primaryHalfHeight,
      ]) {
        importantPoints.push(projectCluster(x, y, layout.displayZ));
      }
    }
    for (const centerX of [-layout.auxiliaryCenterX, layout.auxiliaryCenterX]) {
      for (const x of [
        centerX - layout.auxiliaryHalfWidth,
        centerX + layout.auxiliaryHalfWidth,
      ]) {
        for (const y of [
          layout.auxiliaryCenterY - layout.auxiliaryHalfHeight,
          layout.auxiliaryCenterY + layout.auxiliaryHalfHeight,
        ]) {
          importantPoints.push(projectCluster(x, y, layout.displayZ));
        }
      }
    }
  } else {
    const layout = INSTRUMENT_CLUSTER_LAYOUT;
    for (const x of [-layout.faceHalfWidth, layout.faceHalfWidth]) {
      for (const y of [-layout.faceHalfHeight, layout.faceHalfHeight]) {
        facePoints.push(projectCluster(x, y, layout.faceZ));
      }
    }
    for (const x of [-layout.digitalHalfWidth, layout.digitalHalfWidth]) {
      for (const y of [
        layout.digitalCenterY - layout.digitalHalfHeight,
        layout.digitalCenterY + layout.digitalHalfHeight,
      ]) {
        importantPoints.push(projectCluster(x, y, layout.digitalZ));
      }
    }
    for (const centerX of [-layout.smallGaugeCenterX, layout.smallGaugeCenterX]) {
      for (const x of [
        centerX - layout.smallGaugeHalfWidth,
        centerX + layout.smallGaugeHalfWidth,
      ]) {
        for (const y of [
          layout.smallGaugeCenterY - layout.smallGaugeHalfHeight,
          layout.smallGaugeCenterY + layout.smallGaugeHalfHeight,
        ]) {
          importantPoints.push(projectCluster(x, y, layout.smallGaugeZ));
        }
      }
    }
  }

  const instrumentMinimumNdcY = Math.min(...facePoints.map((point) => point.y));
  const instrumentMaximumNdcY = Math.max(...facePoints.map((point) => point.y));
  const importantReadoutMinimumNdcY = Math.min(
    ...importantPoints.map((point) => point.y),
  );
  const windshieldOpeningNdc = windshieldUpperEdgeNdcY - windshieldLowerEdgeNdcY;

  assert(
    windshieldLowerEdgeNdcY <= -0.58,
    `${config.name} cowl is too high (${windshieldLowerEdgeNdcY.toFixed(3)} NDC)`,
  );
  assert(
    windshieldUpperEdgeNdcY >= 0.25 && windshieldOpeningNdc >= 0.9,
    `${config.name} windscreen opening is too small (${windshieldOpeningNdc.toFixed(3)} NDC)`,
  );
  assert(
    dashboardTopNdcY < windshieldLowerEdgeNdcY,
    `${config.name} dashboard projects above the windscreen lower edge`,
  );
  assert(
    instrumentMinimumNdcY > -0.98 && instrumentMaximumNdcY < -0.25,
    `${config.name} binnacle must stay low without falling out of frame`,
  );
  assert(
    importantReadoutMinimumNdcY > -0.82,
    `${config.name} primary instruments must remain comfortably readable`,
  );
  assert(
    config.driverEyePosition[1] - config.cabin.dashboardTopY >= 0.36,
    `${config.name} eye point is too low behind the dashboard`,
  );

  return {
    vehicle: config.name,
    windshieldLowerEdgeNdcY,
    windshieldUpperEdgeNdcY,
    windshieldOpeningNdc,
    dashboardTopNdcY,
    instrumentMinimumNdcY,
    instrumentMaximumNdcY,
    importantReadoutMinimumNdcY,
  };
};

/** Projection and head-movement regression for the neutral 16:9 cockpit view. */
export function runDriverViewSelfTest(): DriverViewSelfTestResult {
  const driver = new DriverCamera({ driverEyePosition: [0, 0, 0] });
  driver.setHeadLook(10, 10);
  const positiveLimit = driver.getHeadLook();
  driver.setHeadLook(-10, -10);
  const negativeLimit = driver.getHeadLook();

  assert(DEFAULT_DRIVER_FOV_DEGREES >= 60, 'vertical FOV must expose enough road and cabin');
  assert(
    positiveLimit.yaw >= Math.PI * 55 / 180 &&
      Math.abs(positiveLimit.yaw - DEFAULT_DRIVER_HEAD_LOOK.yawLimitRadians) < 1e-9,
    'left/right head-look range must reach at least 55 degrees',
  );
  assert(
    negativeLimit.yaw <= -Math.PI * 55 / 180 &&
      Math.abs(negativeLimit.yaw + DEFAULT_DRIVER_HEAD_LOOK.yawLimitRadians) < 1e-9,
    'left/right head-look range must be symmetric',
  );
  assert(
    positiveLimit.pitch >= Math.PI * 22 / 180 &&
      Math.abs(positiveLimit.pitch - DEFAULT_DRIVER_HEAD_LOOK.pitchUpLimitRadians) < 1e-9,
    'upward head-look range must reach at least 22 degrees',
  );
  assert(
    negativeLimit.pitch <= -Math.PI * 20 / 180 &&
      Math.abs(negativeLimit.pitch + DEFAULT_DRIVER_HEAD_LOOK.pitchDownLimitRadians) < 1e-9,
    'downward head-look range must reach at least 20 degrees',
  );

  return {
    fovDegrees: DEFAULT_DRIVER_FOV_DEGREES,
    yawLimitDegrees: radiansToDegrees(positiveLimit.yaw),
    pitchUpLimitDegrees: radiansToDegrees(positiveLimit.pitch),
    pitchDownLimitDegrees: Math.abs(radiansToDegrees(negativeLimit.pitch)),
    vehicles: [
      sampleVehicleView(DEFAULT_SEDAN_VISUAL_CONFIG),
      sampleVehicleView(SPORTS_COUPE_VISUAL_CONFIG),
    ],
  };
}
