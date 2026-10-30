import type { VehicleAudioProfile } from './VehicleAudioProfile';

/** Even flat-plane firing pulses, bright upper orders, audible turbo/overrun.
 * RPM/load/shift sound follow the actual ICE telemetry through EngineAudio. */
export const JESKO_ATTACK_AUDIO_PROFILE: VehicleAudioProfile = Object.freeze({
  flatPlaneV8: true, physicalTurbo: true,
  loadSource: 'combustion-and-transmission', pulseHarmonics: [0,1,.40,.27,.17,.11,.065],
  exhaustCutoff: 360, cabinIdle: .32, cabinLoad: 1.05, cabinRoad: .78, cabinWind: .70,
  sportPresence: 1.10, starterLevel: .028, chimeLevel: .012,
  idlePresence: .88, lowPresence: .90, midPresence: 1.15, highPresence: 1.40,
  loadDepth: 1.15, overrunPresence: .82, turboPresence: .65, exteriorPresence: 1.25,
  engineBusLevel: .90, gearPresence: .08, accelerationPresence: .10,
  rainCabinAttenuation: .45, windCabinAttenuation: .42, weatherIsolation: .40,
});
