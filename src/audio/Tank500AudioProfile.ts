import { AUDI_A6L_AUDIO_PROFILE, type VehicleAudioProfile } from './VehicleAudioProfile';
/** Synthetic Miller I4 calibration, not a recording. Uses the unchanged shared engine layers. */
export const TANK500_HI4T_AUDIO_PROFILE: VehicleAudioProfile = {
  ...AUDI_A6L_AUDIO_PROFILE, pulseHarmonics: [0, 1, .18, .065, .027, .009], exhaustCutoff: 145,
  cabinIdle: .25, cabinLoad: .82, cabinRoad: .65, cabinWind: .55,
  lowPresence: 1.18, midPresence: 1.10, highPresence: .84, loadDepth: 1.22, turboPresence: .2,
  starterLevel: .021, combustionTimbre: { bodyOrder: .5, upperOrder: 2.01, roughnessCents: 1.2, catchLevel: .8, shutdownLevel: .65 },
};
