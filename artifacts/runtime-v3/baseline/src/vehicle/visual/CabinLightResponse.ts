import type { InteriorAmbientLightingProfile } from './LuxuryVisualProfile';

/** Render-only response to available daylight and the driver's lamp command.
 * Darkness never turns decorative lighting on by itself. */
export function cabinAmbientTarget(profile: InteriorAmbientLightingProfile,
  operational: boolean, lampsOn: boolean, daylight = 1): number {
  if (!operational || !lampsOn) return 0;
  const darkness = 1 - Math.min(1, Math.max(0, daylight));
  return profile.dayIntensity + (profile.nightIntensity - profile.dayIntensity) * darkness * darkness;
}
