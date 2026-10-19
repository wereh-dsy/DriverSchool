import type { SurfaceMaterial } from '../SurfaceMaterial';

/** V1 weather presets. They describe target atmosphere, never a physical model. */
export type Weather = 'CLEAR' | 'OVERCAST' | 'DRIZZLE' | 'RAIN' | 'HEAVY_RAIN' | 'FOG' | 'THUNDERSTORM';
export type EnvironmentTime = 'DAY' | 'DUSK' | 'NIGHT';

export interface WeatherPreset {
  readonly cloudiness: number;
  readonly rainIntensity: number;
  readonly fogIntensity: number;
  /** Equilibrium road wetness. Rain starts wetting later and dries for minutes. */
  readonly wetness: number;
  readonly windIntensity: number;
  readonly stormIntensity: number;
}

export const WEATHER_PRESETS: Readonly<Record<Weather, WeatherPreset>> = {
  CLEAR:         { cloudiness: 0,    rainIntensity: 0,    fogIntensity: 0,    wetness: 0,    windIntensity: .05, stormIntensity: 0 },
  OVERCAST:      { cloudiness: .85,  rainIntensity: 0,    fogIntensity: .06,  wetness: 0,    windIntensity: .16, stormIntensity: 0 },
  DRIZZLE:       { cloudiness: .9,   rainIntensity: .22,  fogIntensity: .08,  wetness: .28,  windIntensity: .18, stormIntensity: 0 },
  RAIN:          { cloudiness: .95,  rainIntensity: .5,   fogIntensity: .12,  wetness: .62,  windIntensity: .3,  stormIntensity: 0 },
  HEAVY_RAIN:    { cloudiness: 1,    rainIntensity: .82,  fogIntensity: .16,  wetness: .95,  windIntensity: .44, stormIntensity: .08 },
  FOG:           { cloudiness: .9,   rainIntensity: 0,    fogIntensity: .92,  wetness: .26,  windIntensity: .05, stormIntensity: 0 },
  THUNDERSTORM:  { cloudiness: 1,    rainIntensity: 1,    fogIntensity: .2,   wetness: 1,    windIntensity: .86, stormIntensity: 1 },
};

export const WEATHER_SEQUENCE: readonly Weather[] = [
  'CLEAR', 'OVERCAST', 'DRIZZLE', 'RAIN', 'HEAVY_RAIN', 'FOG', 'THUNDERSTORM',
];

export const WEATHER_LABELS: Readonly<Record<Weather, string>> = {
  CLEAR: '晴天', OVERCAST: '阴天', DRIZZLE: '毛毛雨', RAIN: '中雨',
  HEAVY_RAIN: '暴雨', FOG: '雾天', THUNDERSTORM: '雷雨',
};

/** Kept for map/debug oracles that need the preset equilibrium, not the live value. */
export const WEATHER_WETNESS: Readonly<Record<Weather, number>> = Object.freeze(
  Object.fromEntries(WEATHER_SEQUENCE.map(weather => [weather, WEATHER_PRESETS[weather].wetness])) as Record<Weather, number>,
);

const DEFAULT_TRANSITION_SECONDS = 8;
/** Cloud cover leads rain; wetness is deliberately much slower than either. */
const PARAMETER_TAU = {
  cloudiness: 3, rainIntensity: 4.5, fogIntensity: 9, windIntensity: 5, stormIntensity: 3,
  wetnessRise: 35, wetnessDry: 90,
} as const;

const clamp = (value: number): number => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/**
 * Shared continuous weather state. Presets only provide targets; every visual,
 * audio, grip and windshield consumer reads the smoothed values instead of the enum.
 * No allocation or renderer dependency lives in update().
 */
export class WeatherSystem {
  /** Selected preset. Continuous values lag this value during a transition. */
  public weather: Weather = 'CLEAR';
  public time: EnvironmentTime = 'DAY';

  public cloudiness = 0;
  public rainIntensity = 0;
  public fogIntensity = 0;
  public wetness = 0;
  public windIntensity = 0;
  public stormIntensity = 0;
  /** Short global flash 0..1 used by the environment lighting. Event driven. */
  public lightningFlash = 0;

  private target: WeatherPreset = WEATHER_PRESETS.CLEAR;
  private transitionScale = 1;
  private settled = false;
  private flashTime = Number.POSITIVE_INFINITY;
  private flashDuration = 0;
  private nextStrike = 0;
  private thunderDelay: number | null = null;

  public constructor(weather: Weather = 'CLEAR', time: EnvironmentTime = 'DAY') {
    this.time = time;
    this.setWeather(weather, 0);
  }

  /** Transition duration is approximate; each parameter keeps its own time constant. */
  public setWeather(weather: Weather, transitionSeconds = DEFAULT_TRANSITION_SECONDS): void {
    const preset = WEATHER_PRESETS[weather] as WeatherPreset | undefined;
    if (!preset) return;
    this.weather = weather;
    this.target = preset;
    this.transitionScale = transitionSeconds <= 0 ? 0 : Math.max(.05, transitionSeconds / DEFAULT_TRANSITION_SECONDS);
    if (this.transitionScale === 0) { this.snapToTarget(); this.settled = true; }
    else this.settled = false;
    if (weather === 'THUNDERSTORM') {
      if (this.nextStrike <= 0) this.nextStrike = 3 + Math.random() * 5;
    } else {
      this.flashTime = Number.POSITIVE_INFINITY;
      this.flashDuration = 0;
      this.lightningFlash = 0;
      this.nextStrike = 0;
      this.thunderDelay = null;
    }
  }

  public setTime(time: EnvironmentTime): void {
    this.time = time;
  }

  public update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    // Steady state costs one branch; lightning is the only continuous event.
    if (this.settled) { this.updateLightning(dt); return; }
    const target = this.target;
    const scale = this.transitionScale;
    // Inlined first-order blends: update() must not allocate a closure per frame.
    const cloudBlend = scale <= 0 ? 1 : 1 - Math.exp(-dt / (PARAMETER_TAU.cloudiness * scale));
    const rainBlend = scale <= 0 ? 1 : 1 - Math.exp(-dt / (PARAMETER_TAU.rainIntensity * scale));
    const fogBlend = scale <= 0 ? 1 : 1 - Math.exp(-dt / (PARAMETER_TAU.fogIntensity * scale));
    const windBlend = scale <= 0 ? 1 : 1 - Math.exp(-dt / (PARAMETER_TAU.windIntensity * scale));
    const stormBlend = scale <= 0 ? 1 : 1 - Math.exp(-dt / (PARAMETER_TAU.stormIntensity * scale));
    this.cloudiness += (target.cloudiness - this.cloudiness) * cloudBlend;
    this.rainIntensity += (target.rainIntensity - this.rainIntensity) * rainBlend;
    this.fogIntensity += (target.fogIntensity - this.fogIntensity) * fogBlend;
    this.windIntensity += (target.windIntensity - this.windIntensity) * windBlend;
    this.stormIntensity += (target.stormIntensity - this.stormIntensity) * stormBlend;
    // First-order wetness: rain accumulates slowly, a wet road dries even slower.
    const wetnessTau = target.wetness > this.wetness ? PARAMETER_TAU.wetnessRise : PARAMETER_TAU.wetnessDry;
    this.wetness += (target.wetness - this.wetness) * (scale <= 0 ? 1 : 1 - Math.exp(-dt / (wetnessTau * scale)));
    if (Math.abs(target.cloudiness - this.cloudiness) < 1e-4 &&
      Math.abs(target.rainIntensity - this.rainIntensity) < 1e-4 &&
      Math.abs(target.fogIntensity - this.fogIntensity) < 1e-4 &&
      Math.abs(target.windIntensity - this.windIntensity) < 1e-4 &&
      Math.abs(target.stormIntensity - this.stormIntensity) < 1e-4 &&
      Math.abs(target.wetness - this.wetness) < 1e-4) {
      this.snapToTarget();
      this.settled = true;
    }
    this.updateLightning(dt);
  }

  /** Layers with surface wetness and per-tyre retention; never writes vehicle state. */
  public get roadGripMultiplier(): number {
    return 1 - .10 * clamp(this.wetness) - .03 * clamp(this.rainIntensity);
  }

  /** day/night remains the owner of daylight; weather only attenuates it. */
  public get lightAttenuation(): number {
    return Math.min(1, Math.max(.18, 1 - .22 * clamp(this.cloudiness) - .20 * clamp(this.rainIntensity)
      - .24 * clamp(this.fogIntensity) - .12 * clamp(this.stormIntensity)));
  }

  /** Thunder delay in seconds, or null when no strike occurred since the last call. */
  public consumeThunderDelay(): number | null {
    const delay = this.thunderDelay;
    this.thunderDelay = null;
    return delay;
  }

  private updateLightning(dt: number): void {
    if (this.weather !== 'THUNDERSTORM' || this.stormIntensity < .45) {
      this.lightningFlash = 0;
      return;
    }
    this.nextStrike -= dt;
    if (this.nextStrike <= 0) {
      this.flashTime = 0;
      this.flashDuration = .07 + Math.random() * .1;
      this.thunderDelay = .55 + Math.random() * 2.4;
      this.nextStrike = 7 + Math.random() * 9;
    }
    if (this.flashTime >= this.flashDuration) { this.lightningFlash = 0; return; }
    const phase = this.flashTime / this.flashDuration;
    // One cheap triangular envelope: no extra light, geometry or shadow pass.
    this.lightningFlash = Math.sin(Math.PI * phase) * (.65 + .35 * clamp(this.stormIntensity));
    this.flashTime += dt;
  }

  private snapToTarget(): void {
    this.cloudiness = this.target.cloudiness;
    this.rainIntensity = this.target.rainIntensity;
    this.fogIntensity = this.target.fogIntensity;
    this.wetness = this.target.wetness;
    this.windIntensity = this.target.windIntensity;
    this.stormIntensity = this.target.stormIntensity;
  }
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
