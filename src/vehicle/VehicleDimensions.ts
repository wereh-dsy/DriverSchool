/** Shared metre-scale envelope. +X right, +Y up, -Z forward; origin midway between axles. */
export interface VehicleDimensions {
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly wheelBase: number;
  readonly frontTrackWidth: number;
  readonly rearTrackWidth: number;
  readonly wheelRadius: number;
  readonly wheelWidth: number;
}

export const VEHICLE_WHEEL_IDS = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'] as const;
export type VehicleWheelId = typeof VEHICLE_WHEEL_IDS[number];
export interface LocalWheelPosition { readonly x: number; readonly y: number; readonly z: number }

export const FAMILY_SEDAN_DIMENSIONS: VehicleDimensions = Object.freeze({
  length: 4.5026, width: 1.8, height: 1.645,
  wheelBase: 2.7, frontTrackWidth: 1.55, rearTrackWidth: 1.54,
  wheelRadius: 0.315, wheelWidth: 0.215,
});

export const SPORT_COUPE_DIMENSIONS: VehicleDimensions = Object.freeze({
  length: 4.55, width: 1.88, height: 1.508,
  wheelBase: 2.64, frontTrackWidth: 1.6, rearTrackWidth: 1.62,
  wheelRadius: 0.335, wheelWidth: 0.255,
});

/** Independent automatic saloon envelopes, shared by physics and all visuals. */
export const FLOW_6AT_DIMENSIONS: VehicleDimensions = Object.freeze({
  length: 4.58, width: 1.795, height: 1.49, wheelBase: 2.7,
  frontTrackWidth: 1.555, rearTrackWidth: 1.555, wheelRadius: .318, wheelWidth: .215,
});
export const FORMAL_DCT_DIMENSIONS: VehicleDimensions = Object.freeze({
  length: 4.67, width: 1.8, height: 1.50, wheelBase: 2.73,
  frontTrackWidth: 1.54, rearTrackWidth: 1.535, wheelRadius: .316, wheelWidth: .205,
});
export const COMFORT_CVT_DIMENSIONS: VehicleDimensions = Object.freeze({
  length: 4.65, width: 1.82, height: 1.515, wheelBase: 2.71,
  frontTrackWidth: 1.585, rearTrackWidth: 1.585, wheelRadius: .316, wheelWidth: .215,
});

/** A wheel centre, not its ground sample. The latter shares x/z and supplies ground height. */
export function wheelLocalPosition(
  dimensions: Pick<VehicleDimensions, 'wheelBase' | 'frontTrackWidth' | 'rearTrackWidth'>
    & Partial<Pick<VehicleDimensions, 'wheelRadius'>>,
  id: VehicleWheelId,
): LocalWheelPosition {
  const front = id === 'frontLeft' || id === 'frontRight';
  const left = id === 'frontLeft' || id === 'rearLeft';
  return {
    x: (left ? -0.5 : 0.5) * (front ? dimensions.frontTrackWidth : dimensions.rearTrackWidth),
    y: dimensions.wheelRadius ?? 0,
    z: (front ? -0.5 : 0.5) * dimensions.wheelBase,
  };
}

export function localWheelPositions(
  dimensions: Parameters<typeof wheelLocalPosition>[0],
): Readonly<Record<VehicleWheelId, LocalWheelPosition>> {
  return {
    frontLeft: wheelLocalPosition(dimensions, 'frontLeft'),
    frontRight: wheelLocalPosition(dimensions, 'frontRight'),
    rearLeft: wheelLocalPosition(dimensions, 'rearLeft'),
    rearRight: wheelLocalPosition(dimensions, 'rearRight'),
  };
}

/** Long-wheelbase executive three-box saloon; all render/contact anchors share this. */
export const EXECUTIVE_LWB_DIMENSIONS: VehicleDimensions = Object.freeze({
  length: 5.05, width: 1.89, height: 1.50, wheelBase: 3.025,
  frontTrackWidth: 1.63, rearTrackWidth: 1.62, wheelRadius: .345, wheelWidth: .245,
});
