import type { SurfaceMaterial } from '../SurfaceMaterial';

export type Weather = 'CLEAR' | 'LIGHT_RAIN' | 'HEAVY_RAIN';
export type EnvironmentTime = 'DAY' | 'DUSK' | 'NIGHT';
export const WEATHER_WETNESS: Readonly<Record<Weather, number>> = {
  CLEAR: 0, LIGHT_RAIN: 0.45, HEAVY_RAIN: 1,
};

/** One global state, independent of the selected ground and vehicle. */
export class EnvironmentState {
  public weather: Weather = 'CLEAR';
  public time: EnvironmentTime = 'DAY';
  public get wetness(): number { return WEATHER_WETNESS[this.weather]; }
}

/** Continuous across blended road edges, preserving each map's dry calibration.
 * At full wetness asphalt retains 64%, grass 90% of its original capacity.
 * No velocity, drivetrain or driving-aid corrections are performed here.
 */
export function wetGripScale(surface: SurfaceMaterial, wetness: number): number {
  const grip = (surface.longitudinalGrip + surface.lateralGrip) * 0.5;
  const pavedResponse = Math.min(1, Math.max(0, (grip - 0.55) / 0.45));
  return 1 - Math.min(1, Math.max(0, wetness)) * (0.10 + 0.26 * pavedResponse);
}
