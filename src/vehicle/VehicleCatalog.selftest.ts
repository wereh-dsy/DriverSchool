import { Object3D, PerspectiveCamera, Vector3 } from 'three';

import { DEFAULT_DRIVER_FOV_DEGREES } from '../camera/DriverCamera';
import { createNeutralVehicleInputState } from '../input/VehicleInputState';
import type { ForwardGear, VehiclePhysicsConfig } from './config';
import { VehicleDynamics } from './physics';
import {
  formatInstrumentGear,
  INSTRUMENT_CLUSTER_LAYOUT,
  SPORT_INSTRUMENT_INDICATOR_IDS,
  SPORT_INSTRUMENT_CLUSTER_LAYOUT,
  type VehicleVisualConfig,
} from './visual';
import {
  createVehiclePhysicsConfig,
  getVehicleDescriptor,
  VEHICLE_CATALOG,
  VEHICLE_IDS,
  type VehicleId,
} from './VehicleCatalog';

export interface VehicleCatalogSelfTestResult {
  readonly descriptorCount: number;
  readonly sedanIdleRPM: number;
  readonly sportsPeakPowerKW: number;
  readonly sedanForwardGearCount: number;
  readonly sportsForwardGearCount: number;
  readonly sportsTopGearRatio: number;
  readonly sedanAccelerationSampleKmh: number;
  readonly sportsAccelerationSampleKmh: number;
  readonly sportsToSedanSpeedRatio: number;
  readonly sportsDigitalWheelClearanceNdc: number;
  readonly sportsIndicatorWheelClearanceNdc: number;
  readonly sportsAuxiliaryGaugeWheelClearanceNdc: number;
  readonly sportsNeedleWheelClearanceNdc: number;
}

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(`Vehicle catalog self-test failed: ${message}`);
};

const assertFiniteTree = (value: unknown, path: string): void => {
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${path} must be finite`);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assertFiniteTree(child, `${path}.${key}`);
  }
};

const validatePhysics = (id: VehicleId, config: VehiclePhysicsConfig): void => {
  assertFiniteTree(config, id);
  assert(config.mass > 500 && config.mass < 4_000, `${id} mass is implausible`);
  assert(config.wheelBase > 1.8 && config.wheelBase < config.length, `${id} wheelbase is invalid`);
  assert(config.engine.idleRPM > config.engine.stallRPM, `${id} idle must exceed stall RPM`);
  assert(
    config.engine.redlineRPM > config.engine.idleRPM &&
      config.engine.maxRPM >= config.engine.redlineRPM,
    `${id} RPM limits are not ordered`,
  );
  assert(config.transmission.reverseRatio < 0, `${id} reverse ratio must be negative`);
  assert(
    Math.abs(config.transmission.finalDrive - config.transmission.finalDriveRatio) < 1e-9,
    `${id} final-drive aliases disagree`,
  );
  assert(
    Math.abs(config.transmission.efficiency - config.transmission.drivetrainEfficiency) < 1e-9,
    `${id} efficiency aliases disagree`,
  );
  const ratios = ([1, 2, 3, 4, 5, 6, 7] as const)
    .map((gear) => config.transmission.gearRatios[gear])
    .filter((ratio): ratio is number => ratio !== undefined);
  assert(ratios.length >= 5 && ratios.length <= 7, `${id} must have five to seven gears`);
  assert(
    ([1, 2, 3, 4, 5, 6, 7] as const).every((gear, index) =>
      index < ratios.length
        ? config.transmission.gearRatios[gear] !== undefined
        : config.transmission.gearRatios[gear] === undefined),
    `${id} forward gears must be contiguous from first`,
  );
  assert(ratios.every((ratio) => ratio > 0), `${id} forward ratios must be positive`);
  assert(
    ratios.every((ratio, index) => index === 0 || ratio < ratios[index - 1]!),
    `${id} forward ratios must descend`,
  );
  assert(
    Math.abs(config.frontTorqueSplit + config.rearTorqueSplit - 1) < 1e-6,
    `${id} torque split must add to one`,
  );
  assert(
    config.engine.torqueCurve.length >= 5 &&
      config.engine.torqueCurve.every((point, index, curve) =>
        point.torque > 0 && (index === 0 || point.rpm > curve[index - 1]!.rpm)),
    `${id} torque curve must be positive and RPM-sorted`,
  );
};

interface CockpitClearanceSample {
  readonly digital: number;
  readonly indicator: number;
  readonly auxiliary: number;
  readonly needlePivot: number;
}

/** Projection-only check: no WebGL or DOM is needed. */
const sampleCockpitClearance = (
  config: VehicleVisualConfig,
): CockpitClearanceSample => {
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
  cluster.scale.setScalar(config.instrumentClusterTransform.scale ?? 1);
  cluster.updateMatrixWorld(true);
  const projectCluster = (x: number, y: number, z: number): Vector3 =>
    new Vector3(x, y, z).applyMatrix4(cluster.matrixWorld).project(camera);

  const wheel = new Object3D();
  wheel.position.set(...config.steeringWheelPosition);
  wheel.rotation.set(...config.steeringWheelRotation);
  wheel.updateMatrixWorld(true);
  const wheelPoints: Vector3[] = [];
  for (let ringStep = 0; ringStep < 180; ringStep += 1) {
    const ringAngle = ringStep / 180 * Math.PI * 2;
    for (let tubeStep = 0; tubeStep < 12; tubeStep += 1) {
      const tubeAngle = tubeStep / 12 * Math.PI * 2;
      const radius = config.steeringWheelRadius +
        Math.cos(tubeAngle) * config.steeringWheelRimTubeRadius;
      wheelPoints.push(new Vector3(
        Math.cos(ringAngle) * radius,
        Math.sin(ringAngle) * radius,
        Math.sin(tubeAngle) * config.steeringWheelRimTubeRadius,
      ).applyMatrix4(wheel.matrixWorld).project(camera));
    }
  }

  const layout = INSTRUMENT_CLUSTER_LAYOUT;
  const rectangle = (
    centerX: number,
    centerY: number,
    halfWidth: number,
    halfHeight: number,
    z: number,
  ) => {
    const corners = [
      projectCluster(centerX - halfWidth, centerY - halfHeight, z),
      projectCluster(centerX + halfWidth, centerY + halfHeight, z),
    ];
    return {
      minimumX: Math.min(...corners.map((point) => point.x)),
      maximumX: Math.max(...corners.map((point) => point.x)),
      minimumY: Math.min(...corners.map((point) => point.y)),
      maximumY: Math.max(...corners.map((point) => point.y)),
    };
  };
  const distanceToRectangle = (
    point: Vector3,
    bounds: ReturnType<typeof rectangle>,
  ): number => Math.hypot(
    Math.max(bounds.minimumX - point.x, 0, point.x - bounds.maximumX),
    Math.max(bounds.minimumY - point.y, 0, point.y - bounds.maximumY),
  );
  const distanceTo = (bounds: ReturnType<typeof rectangle>): number =>
    Math.min(...wheelPoints.map((point) => distanceToRectangle(point, bounds)));

  if (config.instrumentCluster.displayStyle === 'sport-tft') {
    const sport = SPORT_INSTRUMENT_CLUSTER_LAYOUT;
    const primaryBounds = rectangle(
      0,
      sport.primaryCenterY,
      sport.primaryHalfWidth,
      sport.primaryHalfHeight,
      sport.displayZ,
    );
    const auxiliaryBounds = [-sport.auxiliaryCenterX, sport.auxiliaryCenterX]
      .map((centerX) => rectangle(
        centerX,
        sport.auxiliaryCenterY,
        sport.auxiliaryHalfWidth,
        sport.auxiliaryHalfHeight,
        sport.displayZ,
      ));
    const tachBounds = rectangle(
      0,
      sport.tachBandCenterY,
      sport.tachBandHalfWidth,
      sport.tachBandHalfHeight,
      sport.displayZ,
    );
    const indicatorBounds = rectangle(
      0,
      sport.indicatorBandCenterY,
      sport.indicatorBandHalfWidth,
      sport.indicatorBandHalfHeight,
      sport.displayZ,
    );
    return {
      digital: distanceTo(primaryBounds),
      indicator: distanceTo(indicatorBounds),
      auxiliary: Math.min(...auxiliaryBounds.map(distanceTo)),
      needlePivot: distanceTo(tachBounds),
    };
  }

  const digitalBounds = rectangle(
    0,
    layout.digitalCenterY,
    layout.digitalHalfWidth,
    layout.digitalHalfHeight,
    layout.digitalZ,
  );
  const auxiliaryBounds = [-layout.smallGaugeCenterX, layout.smallGaugeCenterX]
    .map((centerX) => rectangle(
      centerX,
      layout.smallGaugeCenterY,
      layout.smallGaugeHalfWidth,
      layout.smallGaugeHalfHeight,
      layout.smallGaugeZ,
    ));
  const needlePivots = [-layout.mainDialCenterX, layout.mainDialCenterX]
    .map((centerX) => projectCluster(centerX, 0, layout.mainDialNeedleZ));
  const needlePivot = Math.min(...needlePivots.flatMap((pivot) =>
    wheelPoints.map((point) => Math.hypot(pivot.x - point.x, pivot.y - point.y))));

  return {
    digital: distanceTo(digitalBounds),
    indicator: distanceTo(rectangle(
      0,
      layout.lampCenterY,
      layout.lampHalfWidth,
      layout.lampHalfHeight,
      layout.lampZ,
    )),
    auxiliary: Math.min(...auxiliaryBounds.map(distanceTo)),
    needlePivot,
  };
};

interface AccelerationSample {
  readonly speedKmh: number;
  readonly rpm: number;
  readonly gear: string | number;
  readonly engineRunning: boolean;
}

const accelerationSample = (id: VehicleId): AccelerationSample => {
  const vehicle = new VehicleDynamics(createVehiclePhysicsConfig(id));
  const input = createNeutralVehicleInputState('normal', 1);
  input.throttle = 0.85;
  assert(vehicle.requestGear(1), `${id} must accept first gear`);

  const maximumForwardGear = vehicle.gearbox.getMaximumForwardGear();
  let nextShiftRPM = vehicle.config.engine.redlineWarningRPM - 300;
  for (let step = 0; step < 8 * 120; step += 1) {
    const snapshot = vehicle.stepFixed(1 / 120, input);
    if (
      typeof snapshot.gear === 'number' &&
      snapshot.gear < maximumForwardGear &&
      snapshot.requestedGear === null &&
      snapshot.clutchEngagement > 0.95 &&
      snapshot.rpm >= nextShiftRPM
    ) {
      vehicle.requestGear((snapshot.gear + 1) as ForwardGear);
      nextShiftRPM = vehicle.config.engine.redlineWarningRPM - 300;
    }
  }

  const snapshot = vehicle.getSnapshot();
  assert(
    [snapshot.speedKmh, snapshot.rpm, snapshot.x, snapshot.z, snapshot.yaw].every(Number.isFinite),
    `${id} acceleration sample must remain finite`,
  );
  assert(Math.abs(snapshot.x) < 1e-6 && Math.abs(snapshot.yaw) < 1e-6, `${id} must track straight`);
  return {
    speedKmh: snapshot.speedKmh,
    rpm: snapshot.rpm,
    gear: snapshot.gear,
    engineRunning: snapshot.engineRunning,
  };
};

export function runVehicleCatalogSelfTest(): VehicleCatalogSelfTestResult {
  assert(VEHICLE_CATALOG.length === VEHICLE_IDS.length, 'catalog/order length mismatch');
  assert(new Set(VEHICLE_CATALOG.map((vehicle) => vehicle.id)).size === VEHICLE_CATALOG.length, 'vehicle IDs must be unique');
  assert(VEHICLE_CATALOG.every((vehicle) => vehicle.version >= 1), 'every vehicle needs a data version');

  for (const id of VEHICLE_IDS) {
    const descriptor = getVehicleDescriptor(id);
    validatePhysics(id, descriptor.physicsConfig);
    assertFiniteTree(descriptor.visualConfig, `${id}.visual`);
    assert(descriptor.visualConfig.vehicleWidth > 1, `${id} visual width is invalid`);
    assert(descriptor.visualConfig.steeringWheelRadius >= 0.175, `${id} wheel is unrealistically small`);
  }

  const sedanDescriptor = getVehicleDescriptor('family-sedan');
  const sedan = sedanDescriptor.physicsConfig;
  const sportsDescriptor = getVehicleDescriptor('sport-coupe');
  const sports = sportsDescriptor.physicsConfig;
  assert(!sedanDescriptor.capabilities.cruiseControl, 'sedan must not expose cruise control');
  assert(sportsDescriptor.capabilities.cruiseControl, 'sports coupe must expose cruise control');
  assert(sedan.engine.idleRPM >= 830 && sedan.engine.idleRPM <= 880, 'sedan idle increase must remain modest');
  const sportsPeakPowerKW = Math.max(
    ...sports.engine.torqueCurve.map((point) =>
      point.torque * point.rpm * (2 * Math.PI / 60) / 1_000),
  );
  assert(
    sportsPeakPowerKW >= 220 && sportsPeakPowerKW <= 280,
    `sports coupe output must stay in its 220–280 kW target (got ${sportsPeakPowerKW.toFixed(1)})`,
  );
  const sedanForwardGearCount = Object.keys(sedan.transmission.gearRatios).length;
  const sportsForwardGearCount = Object.keys(sports.transmission.gearRatios).length;
  const sportsTopGearRatio = sports.transmission.gearRatios[7] ?? 0;
  assert(sedanForwardGearCount === 5, 'family sedan must remain a five-speed');
  assert(sportsForwardGearCount === 7, 'sports coupe must use seven forward gears');
  assert(
    sportsTopGearRatio > 0 && sportsTopGearRatio < (sports.transmission.gearRatios[6] ?? 0),
    'sports coupe seventh gear must be a valid overdrive above sixth',
  );
  assert(
    sportsDescriptor.visualConfig.instrumentCluster.displayStyle === 'sport-tft' &&
      getVehicleDescriptor('family-sedan').visualConfig.instrumentCluster.displayStyle ===
        'dual-analog',
    'sports TFT must be visually distinct from the sedan analogue cluster',
  );
  assert(
    formatInstrumentGear(6) === '6' && formatInstrumentGear(7) === '7',
    'sports TFT must render sixth and seventh gear labels without substitution',
  );
  assert(
    SPORT_INSTRUMENT_INDICATOR_IDS.includes('cruise') &&
      SPORT_INSTRUMENT_INDICATOR_IDS.includes('parking-brake') &&
      SPORT_INSTRUMENT_INDICATOR_IDS.includes('engine-warning') &&
      SPORT_INSTRUMENT_INDICATOR_IDS.includes('battery-warning'),
    'sports TFT must keep cruise and essential warning states in its fixed lamp inventory',
  );
  assert(
    !SPORT_INSTRUMENT_INDICATOR_IDS.some((id) => id.includes('shift')),
    'sports TFT must not contain upshift or downshift suggestion lamps',
  );
  const sportsShiftProbe = new VehicleDynamics(createVehiclePhysicsConfig('sport-coupe'));
  assert(sportsShiftProbe.requestGear(7), 'sports coupe must accept direct seventh-gear selection');
  sportsShiftProbe.gearbox.setGear(5);
  assert(
    sportsShiftProbe.gearbox.getShiftUpGear() === 6,
    'sports sequential shift must advance from fifth to sixth',
  );
  sportsShiftProbe.gearbox.setGear(6);
  assert(
    sportsShiftProbe.gearbox.getShiftUpGear() === 7,
    'sports sequential shift must advance from sixth to seventh',
  );
  sportsShiftProbe.gearbox.setGear(7);
  assert(
    sportsShiftProbe.gearbox.getShiftUpGear() === 7,
    'sports sequential shift must stop at seventh',
  );
  assert(
    sportsShiftProbe.upshiftAdvisor.update({
      engineRPM: 4_000,
      throttle: 0.5,
      speedKmh: 120,
      gear: 6,
      shiftInProgress: false,
    }).available,
    'sports upshift telemetry must remain available in sixth gear',
  );
  assert(
    !sportsShiftProbe.upshiftAdvisor.update({
      engineRPM: 4_000,
      throttle: 0.5,
      speedKmh: 120,
      gear: 7,
      shiftInProgress: false,
    }).available,
    'sports upshift telemetry must stop at seventh gear',
  );
  const sedanShiftProbe = new VehicleDynamics(createVehiclePhysicsConfig('family-sedan'));
  assert(!sedanShiftProbe.requestGear(6), 'family sedan must reject unavailable sixth gear');
  assert(
    sedanShiftProbe.getSnapshot().shiftRejectionReason === 'gear-not-available',
    'unavailable direct gear must have an explicit rejection reason',
  );
  sedanShiftProbe.gearbox.setGear(5);
  assert(
    sedanShiftProbe.gearbox.getShiftUpGear() === 5,
    'family sedan sequential shift must remain capped at fifth',
  );
  const sportsCockpitClearance = sampleCockpitClearance(sportsDescriptor.visualConfig);
  assert(
    sportsCockpitClearance.digital > 0.04 &&
      sportsCockpitClearance.indicator > 0.04 &&
      sportsCockpitClearance.auxiliary > 0.06 &&
      sportsCockpitClearance.needlePivot > 0.025,
    `sports cockpit instruments must clear the wheel rim ` +
      `(digital ${sportsCockpitClearance.digital.toFixed(3)}, auxiliary ` +
      `${sportsCockpitClearance.auxiliary.toFixed(3)}, lamps ` +
      `${sportsCockpitClearance.indicator.toFixed(3)}, tach ` +
      `${sportsCockpitClearance.needlePivot.toFixed(3)})`,
  );

  const sedanSample = accelerationSample('family-sedan');
  const sportsSample = accelerationSample('sport-coupe');
  const sedanAccelerationSampleKmh = sedanSample.speedKmh;
  const sportsAccelerationSampleKmh = sportsSample.speedKmh;
  const sportsToSedanSpeedRatio = sportsAccelerationSampleKmh /
    Math.max(1, sedanAccelerationSampleKmh);
  assert(
    sportsAccelerationSampleKmh > sedanAccelerationSampleKmh + 18 &&
      sportsToSedanSpeedRatio > 1.2,
    `sports coupe must be clearly quicker without relying on corrupt state ` +
      `(sedan ${sedanAccelerationSampleKmh.toFixed(1)} km/h, sports ` +
      `${sportsAccelerationSampleKmh.toFixed(1)} km/h, ` +
      `${sportsSample.engineRunning ? 'running' : 'stalled'}, ` +
      `gear ${sportsSample.gear}, ${sportsSample.rpm.toFixed(0)} rpm)`,
  );

  return {
    descriptorCount: VEHICLE_CATALOG.length,
    sedanIdleRPM: sedan.engine.idleRPM,
    sportsPeakPowerKW,
    sedanForwardGearCount,
    sportsForwardGearCount,
    sportsTopGearRatio,
    sedanAccelerationSampleKmh,
    sportsAccelerationSampleKmh,
    sportsToSedanSpeedRatio,
    sportsDigitalWheelClearanceNdc: sportsCockpitClearance.digital,
    sportsIndicatorWheelClearanceNdc: sportsCockpitClearance.indicator,
    sportsAuxiliaryGaugeWheelClearanceNdc: sportsCockpitClearance.auxiliary,
    sportsNeedleWheelClearanceNdc: sportsCockpitClearance.needlePivot,
  };
}
