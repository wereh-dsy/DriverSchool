import type { VehicleAudioProfile } from './VehicleAudioProfile';

/** Engineering acoustic targets, not measured OEM transfer functions.
 * Twelve cylinders supply the real firing density through EngineAudio;
 * gentle harmonics retain the V12 outside while the closed cabin filters it. */
export const MAYBACH_S680_AUDIO_PROFILE: VehicleAudioProfile = Object.freeze({
  loadSource: 'combustion-and-transmission', physicalTurbo: true,
  closedCabinCutoffHz: 1350,
  cabinEngineFilterScale: .62,
  pulseHarmonics: [0, 1, .48, .22, .105, .050, .023, .010], exhaustCutoff: 180,
  cabinIdle: .075, cabinLoad: .30, cabinRoad: .25, cabinWind: .22,
  sportPresence: 1.04, starterLevel: .012, chimeLevel: .010,
  idlePresence: .85, lowPresence: .96, midPresence: 1.02, highPresence: .68,
  loadDepth: 1.08, overrunPresence: .24, turboPresence: .085,
  exteriorPresence: 1.14, engineBusLevel: .96, turnSignalLevel: .015,
  gearPresence: .012, accelerationPresence: .025,
  combustionTimbre: { bodyOrder: .5, upperOrder: 2, roughnessCents: .16, catchLevel: .010, shutdownLevel: .0035,
    bodyGain: .58, upperGain: .48, mechanicalGain: .18, bodyHarmonics: [0, 1, .27, .085, .025],
    pulseNoiseGain: .025, exhaustRpmSlope: .105, exhaustLoadCutoff: 280 },
  turnSignalFrequencies: [1040, 760] as const,
  accessSounds: { windowLevel: .0045, latchLevel: .026, closeLevel: .065 },
  // Synthesized Z223-inspired sound family; these are not OEM recordings.
  chimes: {
    startup: { notes: [523.25, 659.25, 783.99], duration: .48, spacing: .12, gain: .62, partial: .12 },
    mode: { notes: [659.25], duration: .13, spacing: 0, gain: .34, partial: .08 },
    cruise: { notes: [783.99], duration: .20, spacing: 0, gain: .50, partial: .08 },
    fuel: { notes: [659.25, 523.25], duration: .38, spacing: .24, gain: 1, partial: .14 },
    parking: { notes: [880], duration: .12, spacing: 0, gain: .85 },
    door: { notes: [659.25, 523.25], duration: .30, spacing: .20, gain: 1.15, partial: .10 },
  },
  rainCabinAttenuation: .15, windCabinAttenuation: .14, weatherIsolation: .96,
  cabinAcoustics: Object.freeze({
    closedIsolation: .99, windowOpenLoss: .56, doorOpenLoss: .90,
    windowWindScale: 3.5, windowRoadScale: 3.2, windowEngineScale: 3.2, windowAmbienceScale: 4,
    openingMix: 'door-dominant',
    doorWindScale: 4.1, doorRoadScale: 3.8, doorEngineScale: 4.4, doorAmbienceScale: 4.8,
    closedLowpassHz: 1350, openLowpassHz: 15000, speedExposure: .28,
  }),
});
