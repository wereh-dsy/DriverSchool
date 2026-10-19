import type { VehicleAudioProfile } from './VehicleAudioProfile';

/** Reusable cockpit/exterior weather bus targets. */
export interface WeatherAudioMix {
  rainAmbient: number;
  rainBody: number;
  glassRain: number;
  wind: number;
  thunder: number;
  thunderBody: number;
  thunderLowpassHz: number;
  rainFilterHz: number;
  rainLowpassHz: number;
  rainQ: number;
  glassFilterHz: number;
  windFilterHz: number;
}

const clamp = (value: number, minimum = 0, maximum = 1): number =>
  Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));

export const createWeatherAudioMix = (): WeatherAudioMix => ({
  rainAmbient: 0, rainBody: 0, glassRain: 0, wind: 0, thunder: 0, thunderBody: 0,
  thunderLowpassHz: 420, rainFilterHz: 1_600, rainLowpassHz: 6_400, rainQ: .55,
  glassFilterHz: 3_600, windFilterHz: 520,
});

/**
 * Writes the weather bus mix into a caller-owned object.
 *
 * The exterior layers keep the original broad rain hiss. The cockpit path is a
 * different mix, not just a lower master gain: rain is curved down more steeply,
 * its band is moved lower and low-passed harder, the glass patter becomes the
 * main local source, and the profile supplies the final isolation multipliers.
 */
export function calculateWeatherAudioMix(
  target: WeatherAudioMix,
  rainIntensity: number,
  windIntensity: number,
  stormIntensity: number,
  inside: boolean,
  speedMetersPerSecond: number,
  profile?: VehicleAudioProfile,
): WeatherAudioMix {
  const rain = clamp(rainIntensity), wind = clamp(windIntensity), storm = clamp(stormIntensity);
  const speed = clamp(speedMetersPerSecond / 45, 0, 1.4);
  const isolation = inside ? clamp(profile?.weatherIsolation ?? 0) : 0;
  const rainAttenuation = profile?.rainCabinAttenuation ?? .5;
  const windAttenuation = profile?.windCabinAttenuation ?? .4;
  if (inside) {
    const rainCurve = Math.pow(rain, 1.35);
    target.rainAmbient = (.0002 + rainCurve * .075) * Math.max(0, rainAttenuation);
    target.rainBody = rain * rain * (.037 + storm * .045) * (.42 + Math.max(0, rainAttenuation) * .35);
    target.glassRain = rain * rain * .03 * (1 - isolation * .2);
    target.thunder = .16 * (.45 - isolation * .15);
    target.thunderBody = .055 * (.72 + (1 - isolation) * .1);
    target.thunderLowpassHz = 330 - isolation * 125;
    target.rainFilterHz = 820 + rain * 260 - isolation * 140;
    target.rainLowpassHz = 2_400 - isolation * 900;
    target.rainQ = .42;
    target.glassFilterHz = 2_600 + isolation * 500;
  } else {
    const rainCurve = Math.pow(rain, .95);
    target.rainAmbient = .0003 + rainCurve * .075;
    target.rainBody = rain * rain * (.045 + storm * .06);
    target.glassRain = rain * rain * .008;
    target.thunder = .16;
    target.thunderBody = .055;
    target.thunderLowpassHz = 420;
    target.rainFilterHz = 1_900 + rain * 900;
    target.rainLowpassHz = 6_400;
    target.rainQ = .58;
    target.glassFilterHz = 3_600;
  }
  target.wind = (.0003 + wind * .035) * (1 + speed * .7) * (inside ? Math.max(0, windAttenuation) : 1);
  target.windFilterHz = inside ? 420 + speed * 220 : 720 + speed * 260;
  return target;
}
