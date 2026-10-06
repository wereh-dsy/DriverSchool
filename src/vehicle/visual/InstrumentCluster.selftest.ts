import { Object3D, PerspectiveCamera, Vector3 } from 'three';

import { DEFAULT_DRIVER_FOV_DEGREES } from '../../camera/DriverCamera';
import { INSTRUMENT_CLUSTER_LAYOUT } from './InstrumentCluster';
import { DEFAULT_SEDAN_VISUAL_CONFIG } from './VehicleVisualConfig';

export interface InstrumentClusterLayoutSelfTestResult {
  readonly minimumNdcX: number;
  readonly maximumNdcX: number;
  readonly minimumNdcY: number;
  readonly maximumNdcY: number;
  readonly digitalDisplayMinimumNdcY: number;
  readonly lampPanelMinimumNdcY: number;
  readonly fuelGaugeMinimumNdcY: number;
  readonly temperatureGaugeMinimumNdcY: number;
  readonly steeringWheelTopNdcY: number;
  readonly minimumDigitalWheelClearanceNdc: number;
  readonly minimumAuxiliaryGaugeWheelClearanceNdc: number;
  readonly minimumNeedlePivotWheelClearanceNdc: number;
}

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`Instrument cluster layout self-test failed: ${message}`);
};

/**
 * Numerical framing regression for the default 16:9 driver's view. It avoids
 * WebGL and the DOM so test runners can catch a cluster slipping below the
 * camera or outside the dashboard aperture.
 */
export function runInstrumentClusterLayoutSelfTest(): InstrumentClusterLayoutSelfTestResult {
  const config = DEFAULT_SEDAN_VISUAL_CONFIG;
  const camera = new PerspectiveCamera(
    DEFAULT_DRIVER_FOV_DEGREES,
    16 / 9,
    0.025,
    2_500,
  );
  camera.position.set(...config.driverEyePosition);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const cluster = new Object3D();
  cluster.position.set(...config.instrumentClusterTransform.position);
  cluster.rotation.set(...config.instrumentClusterTransform.rotation);
  cluster.updateMatrixWorld(true);

  const project = (x: number, y: number, z: number): Vector3 =>
    new Vector3(x, y, z).applyMatrix4(cluster.matrixWorld).project(camera);

  const layout = INSTRUMENT_CLUSTER_LAYOUT;

  const facePoints = [
    project(-layout.faceHalfWidth, -layout.faceHalfHeight, layout.faceZ),
    project(layout.faceHalfWidth, -layout.faceHalfHeight, layout.faceZ),
    project(-layout.faceHalfWidth, layout.faceHalfHeight, layout.faceZ),
    project(layout.faceHalfWidth, layout.faceHalfHeight, layout.faceZ),
  ];
  const digitalPoints = [
    project(
      -layout.digitalHalfWidth,
      layout.digitalCenterY - layout.digitalHalfHeight,
      layout.digitalZ,
    ),
    project(
      layout.digitalHalfWidth,
      layout.digitalCenterY + layout.digitalHalfHeight,
      layout.digitalZ,
    ),
  ];
  const lampPoints = [
    project(
      -layout.lampHalfWidth,
      layout.lampCenterY - layout.lampHalfHeight,
      layout.lampZ,
    ),
    project(
      layout.lampHalfWidth,
      layout.lampCenterY + layout.lampHalfHeight,
      layout.lampZ,
    ),
  ];
  const makeGaugePoints = (centreX: number): Vector3[] => [
    project(
      centreX - layout.smallGaugeHalfWidth,
      layout.smallGaugeCenterY - layout.smallGaugeHalfHeight,
      layout.smallGaugeZ,
    ),
    project(
      centreX + layout.smallGaugeHalfWidth,
      layout.smallGaugeCenterY + layout.smallGaugeHalfHeight,
      layout.smallGaugeZ,
    ),
  ];
  const fuelGaugePoints = makeGaugePoints(-layout.smallGaugeCenterX);
  const temperatureGaugePoints = makeGaugePoints(layout.smallGaugeCenterX);
  const allPoints = [
    ...facePoints,
    ...digitalPoints,
    ...lampPoints,
    ...fuelGaugePoints,
    ...temperatureGaugePoints,
  ];
  const minimumNdcX = Math.min(...allPoints.map((point) => point.x));
  const maximumNdcX = Math.max(...allPoints.map((point) => point.x));
  const minimumNdcY = Math.min(...allPoints.map((point) => point.y));
  const maximumNdcY = Math.max(...allPoints.map((point) => point.y));
  const digitalDisplayMinimumNdcY = Math.min(...digitalPoints.map((point) => point.y));
  const lampPanelMinimumNdcY = Math.min(...lampPoints.map((point) => point.y));
  const fuelGaugeMinimumNdcY = Math.min(...fuelGaugePoints.map((point) => point.y));
  const temperatureGaugeMinimumNdcY = Math.min(
    ...temperatureGaugePoints.map((point) => point.y),
  );

  const wheel = new Object3D();
  wheel.position.set(...config.steeringWheelPosition);
  wheel.rotation.set(...config.steeringWheelRotation);
  wheel.updateMatrixWorld(true);

  // Sample the actual torus envelope, including its 16 mm tube radius. This
  // catches both moving the wheel back over the dials and making its grip so
  // thick that the speed/gear display is obscured.
  const wheelSurfacePoints: Vector3[] = [];
  const rimTubeRadius = config.steeringWheelRimTubeRadius;
  for (let ringStep = 0; ringStep < 180; ringStep += 1) {
    const ringAngle = (ringStep / 180) * Math.PI * 2;
    for (let tubeStep = 0; tubeStep < 12; tubeStep += 1) {
      const tubeAngle = (tubeStep / 12) * Math.PI * 2;
      const radialDistance = config.steeringWheelRadius
        + Math.cos(tubeAngle) * rimTubeRadius;
      wheelSurfacePoints.push(
        new Vector3(
          Math.cos(ringAngle) * radialDistance,
          Math.sin(ringAngle) * radialDistance,
          Math.sin(tubeAngle) * rimTubeRadius,
        ).applyMatrix4(wheel.matrixWorld).project(camera),
      );
    }
  }

  const steeringWheelTopNdcY = Math.max(...wheelSurfacePoints.map((point) => point.y));
  const rectangleBounds = (points: readonly Vector3[]) => ({
    minimumX: Math.min(...points.map((point) => point.x)),
    maximumX: Math.max(...points.map((point) => point.x)),
    minimumY: Math.min(...points.map((point) => point.y)),
    maximumY: Math.max(...points.map((point) => point.y)),
  });
  const distanceToRectangle = (
    point: Vector3,
    bounds: ReturnType<typeof rectangleBounds>,
  ): number => {
    const dx = Math.max(
      bounds.minimumX - point.x,
      0,
      point.x - bounds.maximumX,
    );
    const dy = Math.max(
      bounds.minimumY - point.y,
      0,
      point.y - bounds.maximumY,
    );
    return Math.hypot(dx, dy);
  };
  const digitalBounds = rectangleBounds(digitalPoints);
  const minimumDigitalWheelClearanceNdc = Math.min(
    ...wheelSurfacePoints.map((point) => distanceToRectangle(point, digitalBounds)),
  );
  const auxiliaryGaugeBounds = [
    rectangleBounds(fuelGaugePoints),
    rectangleBounds(temperatureGaugePoints),
  ];
  const minimumAuxiliaryGaugeWheelClearanceNdc = Math.min(
    ...auxiliaryGaugeBounds.flatMap((bounds) =>
      wheelSurfacePoints.map((point) => distanceToRectangle(point, bounds)),
    ),
  );

  const needlePivots = [
    project(-layout.mainDialCenterX, 0, layout.mainDialNeedleZ),
    project(layout.mainDialCenterX, 0, layout.mainDialNeedleZ),
  ];
  const distanceBetween = (left: Vector3, right: Vector3): number =>
    Math.hypot(left.x - right.x, left.y - right.y);
  const minimumNeedlePivotWheelClearanceNdc = Math.min(
    ...needlePivots.map((pivot) =>
      Math.min(...wheelSurfacePoints.map((point) => distanceBetween(pivot, point))),
    ),
  );

  assert(minimumNdcX > -0.98 && maximumNdcX < 0.98, 'cluster must fit horizontally');
  assert(minimumNdcY > -0.98, 'complete main dials must stay above the lower frame edge');
  assert(maximumNdcY < 0.2, 'cluster must remain below the road horizon');
  assert(
    digitalDisplayMinimumNdcY > -0.65,
    `digital speed and gear must remain in the lower readable field ` +
      `(got ${digitalDisplayMinimumNdcY.toFixed(3)} NDC)`,
  );
  assert(lampPanelMinimumNdcY > -0.55, 'warning lamps must remain inside the readable LCD');
  assert(
    layout.lampCenterY - layout.lampHalfHeight >=
      layout.digitalCenterY - layout.digitalHalfHeight &&
      layout.lampCenterY + layout.lampHalfHeight <=
      layout.digitalCenterY + layout.digitalHalfHeight,
    'warning-lamp row must be contained by the centre LCD',
  );
  assert(
    layout.smallGaugeCenterX + layout.smallGaugeHalfWidth <= 0.25 &&
      layout.smallGaugeCenterY + layout.smallGaugeHalfHeight <= layout.faceHalfHeight,
    'fuel and coolant gauges must remain inside the instrument binnacle',
  );

  assert(
    config.steeringWheelRadius >= 0.175 && config.steeringWheelRadius <= 0.195,
    'visibility must use a realistic 350–390 mm road-car steering wheel',
  );
  assert(
    config.steeringWheelRimTubeRadius >= 0.014
      && config.steeringWheelRimTubeRadius <= 0.022,
    'steering-wheel grip diameter must remain plausible',
  );
  const wheelToEyeVerticalDistance =
    config.driverEyePosition[1] - config.steeringWheelPosition[1];
  const wheelToEyeLongitudinalDistance =
    config.driverEyePosition[2] - config.steeringWheelPosition[2];
  assert(
    wheelToEyeVerticalDistance >= 0.3 && wheelToEyeVerticalDistance <= 0.46,
    'steering wheel centre must remain in a plausible adjustable-column range',
  );
  assert(
    wheelToEyeLongitudinalDistance >= 0.45
      && wheelToEyeLongitudinalDistance <= 0.65,
    'steering-wheel reach must remain plausible for a family-car driving position',
  );
  assert(
    minimumDigitalWheelClearanceNdc > 0.045,
    `the complete digital speed/gear display needs a clear wheel-rim margin ` +
      `(got ${minimumDigitalWheelClearanceNdc.toFixed(4)} NDC)`,
  );
  assert(
    minimumAuxiliaryGaugeWheelClearanceNdc > 0.08,
    'fuel and coolant gauges need a clear wheel-rim margin',
  );
  assert(
    minimumNeedlePivotWheelClearanceNdc > 0.025,
    'both analogue needle pivots must stay clear of the wheel rim',
  );

  const apertureHalfWidth = 0.3;
  const clusterHalfWidth = 0.525 / 2;
  assert(
    clusterHalfWidth < apertureHalfWidth,
    'dashboard aperture must be wider than the instrument binnacle',
  );

  return {
    minimumNdcX,
    maximumNdcX,
    minimumNdcY,
    maximumNdcY,
    digitalDisplayMinimumNdcY,
    lampPanelMinimumNdcY,
    fuelGaugeMinimumNdcY,
    temperatureGaugeMinimumNdcY,
    steeringWheelTopNdcY,
    minimumDigitalWheelClearanceNdc,
    minimumAuxiliaryGaugeWheelClearanceNdc,
    minimumNeedlePivotWheelClearanceNdc,
  };
}
