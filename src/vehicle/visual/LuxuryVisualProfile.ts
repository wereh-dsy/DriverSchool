/** Optional visual calibration; no drivetrain, lighting-control or sensor logic. */
export interface InstrumentVisualProfile {
  readonly ringColor: string;
  readonly ringGlow: number;
  readonly needleWidth: number;
  readonly redlineWidth: number;
  readonly nightBrightness: number;
  readonly laneFadeResponse: number;
}
export interface ExteriorLightingVisualProfile {
  readonly signature: 'segmented-led' | 'double-l' | 'authored-led';
  readonly color: number;
  readonly low: { intensity: number; distance: number; angle: number; targetY: number; targetZ: number };
  readonly high: { intensity: number; distance: number; angle: number; targetY: number; targetZ: number };
  readonly penumbra: number;
  readonly decay: number;
  readonly retainLowBeamOnHigh?: boolean;
  readonly autoOffWithIgnition?: boolean;
  readonly welcomeSeconds?: number;
  readonly sequentialTurnSeconds?: number;
  readonly lowLensIntensity?: number;
  readonly positionLensIntensity?: number;
  readonly highLensIntensity?: number;
  readonly turnLensIntensity?: number;
  readonly turnLensHeight?: number;
  readonly turnColor?: number;
  readonly turnSpillIntensity?: number;
}
export interface InteriorAmbientLightingProfile {
  readonly color: number;
  readonly dayIntensity: number;
  readonly nightIntensity: number;
  readonly fadeResponse: number;
  readonly footwellIntensity: number;
  readonly dashboardFillIntensity?: number;
  readonly steeringBadge: 'four-rings' | 'roundel' | 'vw' | 'mercedes-star';
}
export const EXECUTIVE_INSTRUMENT_PROFILE: InstrumentVisualProfile = {
  ringColor: '#bdc9d5', ringGlow: .13, needleWidth: 3, redlineWidth: 5,
  nightBrightness: .86, laneFadeResponse: 5,
};
export const EXECUTIVE_LIGHTING_PROFILE: ExteriorLightingVisualProfile = {
  signature: 'segmented-led', color: 0xeaf4ff,
  low: { intensity: 640, distance: 90, angle: .66, targetY: -.28, targetZ: -42 },
  high: { intensity: 1350, distance: 180, angle: .28, targetY: .28, targetZ: -125 },
  penumbra: .62, decay: 1.15, retainLowBeamOnHigh: true,
  autoOffWithIgnition: true, welcomeSeconds: .85, sequentialTurnSeconds: .18,
  lowLensIntensity: 1.05, highLensIntensity: 1.5, positionLensIntensity: 1.35, turnLensIntensity: 4,
  turnLensHeight: .028, turnColor: 0xff5f06, turnSpillIntensity: 1.2,
};
export const EXECUTIVE_AMBIENT_PROFILE: InteriorAmbientLightingProfile = {
  color: 0x9ebcc7, dayIntensity: .010, nightIntensity: .245, fadeResponse: 4.6,
  footwellIntensity: .022, dashboardFillIntensity: .042, steeringBadge: 'four-rings',
};
