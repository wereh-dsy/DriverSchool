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
  /** Optional four-stage engine-layer calibration; omitted values stay neutral. */
  readonly idlePresence?: number;
  readonly lowPresence?: number;
  readonly midPresence?: number;
  readonly highPresence?: number;
  readonly loadDepth?: number;
  readonly overrunPresence?: number;
  readonly turboPresence?: number;
  readonly exteriorPresence?: number;
  readonly ecoPresence?: number;
  readonly engineBusLevel?: number;
  readonly turnSignalLevel?: number;
  /** Subtle transmission/acceleration colour; zero keeps the layer flat. */
  readonly gearPresence?: number;
  readonly accelerationPresence?: number;
  /**
   * In-cabin weather isolation. Values are direct multipliers for the same
   * layers used outside; legacy cars omit them and keep the old calibration.
   */
  readonly rainCabinAttenuation?: number;
  readonly windCabinAttenuation?: number;
  /** 0..1 isolation strength; lowers cockpit weather cutoffs and thunder level. */
  readonly weatherIsolation?: number;
}

/**
 * A6L 45 TFSI: quiet idle, a restrained low-rpm floor, a deep four-cylinder
 * mid-range and only a modest top-end. ECO/NORMAL stay hushed; SPORT opens the
 * exhaust body a little without turning the car into a sports sedan.
 */
export const AUDI_A6L_AUDIO_PROFILE: VehicleAudioProfile = Object.freeze({
  loadSource: 'combustion-and-transmission',
  pulseHarmonics: [0, 1, .085, .032, .013, .004], exhaustCutoff: 152,
  cabinIdle: .20, cabinLoad: .68, cabinRoad: .58, cabinWind: .46,
  sportPresence: 1.17, starterLevel: .018, chimeLevel: .012,
  idlePresence: .82, lowPresence: .90, midPresence: 1.02, highPresence: .80,
  loadDepth: 1.04, overrunPresence: .54, turboPresence: .18,
  exteriorPresence: 1.10, ecoPresence: .72, engineBusLevel: .95, turnSignalLevel: .020,
  gearPresence: .035, accelerationPresence: .07,
  rainCabinAttenuation: .30, windCabinAttenuation: .28, weatherIsolation: .78,
});

/** Backward-compatible name for the A6L executive calibration. */
export const EXECUTIVE_AUDIO_PROFILE = AUDI_A6L_AUDIO_PROFILE;

/**
 * E 300 L: the most heavily insulated cabin of the three. Idle and cruise are
 * distant, load builds progressively through a soft mid-range, and the top end
 * stays smooth rather than mechanical.
 */
export const MERCEDES_EXECUTIVE_AUDIO_PROFILE: VehicleAudioProfile = Object.freeze({
  loadSource: 'combustion-and-transmission',
  pulseHarmonics: [0, 1, .10, .038, .014, .005], exhaustCutoff: 124,
  cabinIdle: .14, cabinLoad: .52, cabinRoad: .43, cabinWind: .40,
  sportPresence: 1.03, starterLevel: .016, chimeLevel: .012,
  idlePresence: .86, lowPresence: .84, midPresence: .92, highPresence: .70,
  loadDepth: .90, overrunPresence: .44, turboPresence: .09,
  exteriorPresence: 1.06, ecoPresence: .76, engineBusLevel: .90, turnSignalLevel: .018,
  gearPresence: .025, accelerationPresence: .05,
  rainCabinAttenuation: .24, windCabinAttenuation: .22, weatherIsolation: .88,
});

/**
 * 530Li: the clearest four-cylinder of the three. Low and mid-range are more
 * present, throttle openings arrive sooner and the mechanical layer is a little
 * stronger, while the cabin still remains an executive saloon rather than an M car.
 */
export const BMW_530LI_AUDIO_PROFILE: VehicleAudioProfile = Object.freeze({
  loadSource: 'combustion-and-transmission',
  pulseHarmonics: [0, 1, .125, .05, .021, .008], exhaustCutoff: 188,
  cabinIdle: .23, cabinLoad: .78, cabinRoad: .66, cabinWind: .49,
  sportPresence: 1.10, starterLevel: .021, chimeLevel: .013,
  idlePresence: .95, lowPresence: .98, midPresence: 1.14, highPresence: 1.06,
  loadDepth: 1.18, overrunPresence: .66, turboPresence: .30,
  exteriorPresence: 1.22, ecoPresence: .82, engineBusLevel: 1, turnSignalLevel: .022,
  gearPresence: .05, accelerationPresence: .09,
  rainCabinAttenuation: .36, windCabinAttenuation: .34, weatherIsolation: .70,
});
