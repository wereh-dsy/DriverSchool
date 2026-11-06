import type { VehicleAudioProfile } from './VehicleAudioProfile';

/** Independent SU7 approximation: subdued PMSM whine, softer front induction
 * partial, low-speed exterior warning, quiet laminated-glass cabin and soft-close.
 * No licensed OEM samples available: these are original synthesized estimates.
 */
export const SU7_MAX_AUDIO_PROFILE:VehicleAudioProfile={
  pulseHarmonics:[0,1],exhaustCutoff:0,cabinIdle:0,cabinLoad:0,
  cabinRoad:.52,cabinWind:.38,sportPresence:1.12,starterLevel:0,chimeLevel:.009,
  closedCabinCutoffHz:2400,turnSignalLevel:.016,turnSignalFrequencies:[1060,790],
  rainCabinAttenuation:.26,windCabinAttenuation:.22,weatherIsolation:.84,
  electric:{rearBaseHz:112,rearSweepHz:1850,frontBaseHz:178,frontSweepHz:1140,
    motorLevel:.020,frontLevel:.24,regenPitchScale:.78,regenLevel:.58,
    pedestrianBaseHz:152,pedestrianSweepHz:64,pedestrianLevel:.010,
    cabinAttenuation:.39,roadLevel:.018,windLevel:.021,rearWave:'sine',frontWave:'triangle'},
  accessSounds:{windowLevel:.005,latchLevel:.010,closeLevel:.036,windowUpHz:238,windowDownHz:210,closeBodyHz:82,latchHz:530},
  cabinAcoustics:{closedIsolation:.93,windowOpenLoss:.57,doorOpenLoss:.91,
    windowWindScale:2.2,windowRoadScale:1.9,windowEngineScale:2.2,windowAmbienceScale:2.8,
    doorWindScale:2.7,doorRoadScale:2.5,doorEngineScale:2.6,doorAmbienceScale:3.4,
    closedLowpassHz:2400,openLowpassHz:14200,speedExposure:.25,openingMix:'door-dominant'},
  chimes:{
    startup:{notes:[523.25,783.99,1046.5],duration:.27,spacing:.12,gain:.72,partial:.07},
    mode:{notes:[698.46,880],duration:.16,spacing:.09,gain:.46,partial:.05},
    cruise:{notes:[659.25],duration:.15,spacing:.1,gain:.48},
    fuel:{notes:[587.33,440],duration:.22,spacing:.12,gain:.65},
    parking:{notes:[932.33],duration:.09,spacing:.1,gain:.62},
    door:{notes:[622.25,466.16],duration:.18,spacing:.15,gain:.58},
  },
};
