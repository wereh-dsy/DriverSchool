import type { Platform } from '../Platform';
/** Only this adapter knows the preload global. */
export function desktopPlatform(): Platform | undefined {
  return (window as Window & { driverSchoolPlatform?: Platform }).driverSchoolPlatform;
}
