import { AUDI_A6L_AUDIO_PROFILE, type VehicleAudioProfile } from './VehicleAudioProfile';

/** Original synthesized NA I4 + PMSM calibration. Engine RPM comes from EHS crank,
 * including stationary/series generation; road speed never substitutes for RPM. */
export const QIN_PLUS_DMI_AUDIO_PROFILE: VehicleAudioProfile = {
  ...AUDI_A6L_AUDIO_PROFILE, loadSource: 'combustion-and-transmission',
  pulseHarmonics: [0, 1, .12, .035, .015, .005], exhaustCutoff: 125,
  cabinIdle: .13, cabinLoad: .48, cabinRoad: .60, cabinWind: .50,
  starterLevel: .008, lowPresence: .7, midPresence: .85, highPresence: .72,
  loadDepth: .8, turboPresence: 0, gearPresence: 0,
  combustionTimbre: { bodyOrder: .5, upperOrder: 2, roughnessCents: .6, catchLevel: .45, shutdownLevel: .4 },
  electric: { rearBaseHz: 105, rearSweepHz: 1700, frontBaseHz: 150, frontSweepHz: 1200,
    motorLevel: .015, frontLevel: .15, regenPitchScale: .8, regenLevel: .5,
    pedestrianBaseHz: 145, pedestrianSweepHz: 60, pedestrianLevel: .007,
    cabinAttenuation: .38, roadLevel: .018, windLevel: .02, rearWave: 'sine', frontWave: 'sine' },
};
