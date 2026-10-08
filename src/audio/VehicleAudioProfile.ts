/** Opt-in timbre and cabin calibration; legacy cars keep their existing sound. */
export interface VehicleAudioProfile {
  readonly loadSource?: 'transmission' | 'combustion-and-transmission';
  readonly pulseHarmonics: readonly number[];
  readonly exhaustCutoff: number;
  readonly cabinIdle: number;
  readonly cabinLoad: number;
  readonly cabinRoad: number;
  readonly cabinWind: number;
  readonly sportPresence: number;
  readonly starterLevel: number;
  readonly chimeLevel: number;
}
export const EXECUTIVE_AUDIO_PROFILE: VehicleAudioProfile = Object.freeze({
  loadSource: 'combustion-and-transmission',
  pulseHarmonics: [0, 1, .10, .045, .018, .006], exhaustCutoff: 170,
  cabinIdle: .26, cabinLoad: .72, cabinRoad: .63, cabinWind: .52,
  sportPresence: 1.13, starterLevel: .021, chimeLevel: .013,
});
