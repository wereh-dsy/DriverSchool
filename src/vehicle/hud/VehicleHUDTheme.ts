import type { ADASEnvironmentTheme } from '../adas/visualization/ADASVisualizationTypes';
import type { VehicleHUDThemePalette } from './VehicleHUDTypes';

const BASE_PALETTES: Record<ADASEnvironmentTheme, VehicleHUDThemePalette> = {
  DAY: {
    time: 'DAY',
    highContrastWeather: false,
    primaryTextColor: 'rgba(246, 252, 255, 0.94)',
    mutedTextColor: 'rgba(202, 224, 236, 0.72)',
    accentCyanColor: 'rgba(116, 224, 250, 0.92)',
    cautionColor: 'rgba(246, 188, 76, 0.94)',
    hazardColor: 'rgba(255, 108, 108, 0.96)',
    glassBgColor: 'transparent',
    glassBorderColor: 'rgba(195, 228, 242, 0.22)',
    textShadow: '0 0 8px rgba(72, 188, 232, 0.28), 0 1px 4px rgba(0, 0, 0, 0.72)',
    opacityScale: 0.96,
  },
  DUSK: {
    time: 'DUSK',
    highContrastWeather: false,
    primaryTextColor: 'rgba(242, 249, 253, 0.92)',
    mutedTextColor: 'rgba(192, 214, 226, 0.68)',
    accentCyanColor: 'rgba(112, 212, 240, 0.88)',
    cautionColor: 'rgba(240, 178, 70, 0.92)',
    hazardColor: 'rgba(248, 102, 102, 0.94)',
    glassBgColor: 'transparent',
    glassBorderColor: 'rgba(182, 218, 234, 0.20)',
    textShadow: '0 0 8px rgba(68, 174, 214, 0.26), 0 1px 4px rgba(0, 0, 0, 0.78)',
    opacityScale: 0.92,
  },
  NIGHT: {
    time: 'NIGHT',
    highContrastWeather: false,
    primaryTextColor: 'rgba(222, 238, 244, 0.84)',
    mutedTextColor: 'rgba(156, 184, 196, 0.58)',
    accentCyanColor: 'rgba(98, 192, 214, 0.82)',
    cautionColor: 'rgba(224, 162, 66, 0.86)',
    hazardColor: 'rgba(236, 94, 94, 0.88)',
    glassBgColor: 'transparent',
    glassBorderColor: 'rgba(148, 190, 206, 0.16)',
    textShadow: '0 0 6px rgba(56, 152, 182, 0.22), 0 1px 3px rgba(0, 0, 0, 0.82)',
    opacityScale: 0.82,
  },
};

/** Resolve time-of-day and weather-adapted HUD optical theme preserving semantic colors. */
export function resolveVehicleHUDTheme(
  time: ADASEnvironmentTheme,
  rainIntensity: number,
  fogIntensity: number,
): VehicleHUDThemePalette {
  const base = BASE_PALETTES[time] ?? BASE_PALETTES.DAY;
  const severeWeather = rainIntensity >= 0.45 || fogIntensity >= 0.35;
  if (!severeWeather) return base;
  return {
    ...base,
    highContrastWeather: true,
    glassBgColor: 'transparent',
    glassBorderColor: 'rgba(210, 236, 248, 0.32)',
    textShadow: '0 0 10px rgba(96, 206, 242, 0.36), 0 1px 6px rgba(0, 0, 0, 0.92)',
    opacityScale: Math.min(1.0, base.opacityScale + 0.08),
  };
}
