import { createNeutralDriverProfile, DRIVER_PROFILE_METRICS, type DriverProfile } from './DriverProfile';
import { BaseControlCalibration } from '../BaseControlCalibration';

interface ProfileStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
const keyFor = (vehicleId: string): string => `drivergame.driver-profile.v2.${encodeURIComponent(vehicleId)}`;
/** Stable catalog ID per vehicle. The ambiguous v1 global profile is deliberately ignored. */
export class DriverProfileStore {
  public constructor(private readonly storage?: ProfileStorage) {}
  private getStorage(): ProfileStorage | undefined {
    try { return this.storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage); }
    catch { return undefined; }
  }
  public load(vehicleId = 'unregistered'): DriverProfile {
    const neutral = createNeutralDriverProfile();
    try {
      const saved = JSON.parse(this.getStorage()?.getItem(keyFor(vehicleId)) ?? 'null');
      if (saved?.version !== 2 || saved.vehicleId !== vehicleId || !saved.profile || typeof saved.profile !== 'object') return neutral;
      const p = saved.profile;
      if (!Number.isFinite(p.sampleDuration) || p.sampleDuration < 0 ||
        DRIVER_PROFILE_METRICS.some(key => !Number.isFinite(p[key]) || p[key] < 0 || p[key] > 1)) return neutral;
      for (const key of DRIVER_PROFILE_METRICS) neutral[key] = p[key];
      neutral.sampleDuration = Math.min(p.sampleDuration, 1e9);
      neutral.confidence = 1 - Math.exp(-neutral.sampleDuration / BaseControlCalibration.adaptive.confidenceSeconds);
    } catch { /* Corrupt/unavailable storage falls back to neutral. */ }
    return neutral;
  }
  public save(profile: DriverProfile, vehicleId = 'unregistered'): void {
    try { this.getStorage()?.setItem(keyFor(vehicleId), JSON.stringify({ version: 2, vehicleId, profile })); } catch { /* Session learning still works. */ }
  }
  public clear(vehicleId = 'unregistered'): void { try { this.getStorage()?.removeItem(keyFor(vehicleId)); } catch { /* Session reset still works. */ } }
}
