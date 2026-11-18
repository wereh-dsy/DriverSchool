import type { VehicleDimensions } from './VehicleDimensions';

/** 2026 Max envelope; selected 20-inch 245/40 + 265/40 road tyres.
 * Track widths and common rolling radius are engineering datums, not OEM claims. */
export const SU7_MAX_DIMENSIONS: VehicleDimensions = Object.freeze({
  length: 4.997, width: 1.963, height: 1.445, wheelBase: 3,
  frontTrackWidth: 1.693, rearTrackWidth: 1.695, wheelRadius: .354,
  wheelWidth: .245, frontWheelWidth: .245, rearWheelWidth: .265,
});
