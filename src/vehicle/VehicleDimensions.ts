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
