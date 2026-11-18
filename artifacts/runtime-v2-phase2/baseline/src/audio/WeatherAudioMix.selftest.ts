import {
  AUDI_A6L_AUDIO_PROFILE, BMW_530LI_AUDIO_PROFILE, MERCEDES_EXECUTIVE_AUDIO_PROFILE,
} from './VehicleAudioProfile';
import { calculateWeatherAudioMix, createWeatherAudioMix } from './WeatherAudioMix';

/** Pure mix regression: no AudioContext or DOM is required. */
export function runWeatherAudioMixSelfTest(): { assertions: number; profiles: number } {
  let assertions = 0;
  const assert = (ok: boolean, message: string): void => {
    assertions++;
    if (!ok) throw new Error(`Weather audio mix: ${message}`);
  };
  const mix = createWeatherAudioMix();
  const calculate = (rain: number, wind: number, storm: number, inside: boolean,
    profile?: typeof AUDI_A6L_AUDIO_PROFILE) =>
    calculateWeatherAudioMix(mix, rain, wind, storm, inside, 0, profile);
  const profiles = [AUDI_A6L_AUDIO_PROFILE, MERCEDES_EXECUTIVE_AUDIO_PROFILE, BMW_530LI_AUDIO_PROFILE];
  for (const profile of profiles) {
    const outside = { ...calculate(1, .86, 1, false) };
    const inside = { ...calculate(1, .86, 1, true, profile) };
    for (const key of ['rainAmbient', 'rainBody', 'wind', 'thunder', 'thunderBody'] as const) {
      assert(inside[key] >= 0 && inside[key] < outside[key], `${key}: cabin is quieter than exterior`);
    }
    assert(inside.rainAmbient < outside.rainAmbient * .5, 'cabin broadband rain is more than halved');
    assert(inside.glassRain > outside.glassRain, 'glass patter is the stronger local cabin rain source');
    assert(inside.rainFilterHz < outside.rainFilterHz && inside.rainLowpassHz < outside.rainLowpassHz,
      'cabin rain band is darker and more low-passed');
    assert(inside.thunderLowpassHz < outside.thunderLowpassHz, 'cabin thunder loses high frequency first');
  }
  const quiet = { ...calculate(1, .86, 1, true, MERCEDES_EXECUTIVE_AUDIO_PROFILE) };
  const a6l = { ...calculate(1, .86, 1, true, AUDI_A6L_AUDIO_PROFILE) };
  const bmw = { ...calculate(1, .86, 1, true, BMW_530LI_AUDIO_PROFILE) };
  const legacy = { ...calculate(1, .86, 1, true) };
  assert(quiet.rainAmbient < a6l.rainAmbient && a6l.rainAmbient < bmw.rainAmbient,
    'E300L < A6L < 530Li cabin rain ordering');
  assert(quiet.rainAmbient < .02 && bmw.rainAmbient < .03,
    'executive cabin broadband rain stays far below engine-bus level');
  assert(bmw.rainAmbient < legacy.rainAmbient, 'all three executive profiles isolate more than legacy');
  assert(quiet.wind < a6l.wind && a6l.wind < bmw.wind, 'executive wind isolation ordering');
  const exteriorA6L = { ...calculate(1, .86, 1, false, AUDI_A6L_AUDIO_PROFILE) };
  const exteriorBMW = { ...calculate(1, .86, 1, false, BMW_530LI_AUDIO_PROFILE) };
  assert(exteriorA6L.rainAmbient === exteriorBMW.rainAmbient && exteriorA6L.wind === exteriorBMW.wind,
    'exterior mix is not tinted by a cabin profile');
  let previousAmbient = -1;
  for (const rain of [.05, .22, .5, .82, 1]) {
    const current = calculate(rain, .3, rain > .8 ? .3 : 0, true, BMW_530LI_AUDIO_PROFILE);
    assert(current.rainAmbient >= previousAmbient, 'cabin rain grows monotonically');
    for (const value of Object.values(current)) assert(Number.isFinite(value), 'all mix values finite');
    previousAmbient = current.rainAmbient;
  }
  const drizzle = { ...calculate(.22, .18, 0, true, AUDI_A6L_AUDIO_PROFILE) };
  const rain = { ...calculate(.5, .3, 0, true, AUDI_A6L_AUDIO_PROFILE) };
  const heavy = { ...calculate(.82, .44, .08, true, AUDI_A6L_AUDIO_PROFILE) };
  assert(drizzle.rainAmbient < .006 && drizzle.glassRain < .004,
    'drizzle remains sparse and unobtrusive in the cabin');
  assert(drizzle.rainAmbient < rain.rainAmbient && rain.rainAmbient < heavy.rainAmbient,
    'drizzle/rain/heavy cabin gain remains ordered');
  assert(drizzle.glassRain < rain.glassRain && rain.glassRain < heavy.glassRain,
    'glass patter grows with rain without a step volume');
  return { assertions, profiles: profiles.length };
}
