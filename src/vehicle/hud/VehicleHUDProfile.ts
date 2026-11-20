import { getVehicleDescriptor, isVehicleId, type VehicleId } from '../VehicleCatalog';
import { cockpitStructuralAnchors } from '../visual/CockpitLayout';
import type { VehicleVisualConfig } from '../visual/VehicleVisualConfig';
import type { VehicleHUDProfile } from './VehicleHUDTypes';

export const HUD_HEIGHT_MIN_LEVEL = -5;
export const HUD_HEIGHT_MAX_LEVEL = 5;

const DEFAULT_PROFILE_BASE = {
  vehicleId: 'default',
  bottomOffsetRatio: 0.145,
  centerXOffsetPx: 0,
  baseFovDeg: 62,
  scale: 1.0,
  maxPitchCompensationDeg: 3.5,
  maxRollCompensationDeg: 3.0,
  virtualDistanceM: 2.38,
  planeWidthM: 0.48,
  planeHeightM: 0.175,
  centerXM: -0.385,
  defaultCenterYM: 1.065,
  minCenterYM: 1.005,
  maxCenterYM: 1.125,
  centerZM: -2.08,
  heightStepM: 0.012,
} as const;

export function clampHUDHeightLevel(level: number | undefined): number {
  if (typeof level !== 'number' || !Number.isFinite(level)) return 0;
  return Math.max(HUD_HEIGHT_MIN_LEVEL, Math.min(HUD_HEIGHT_MAX_LEVEL, Math.round(level)));
}

export function computeHUDPlaneCenterY(profile: VehicleHUDProfile, level: number): number {
  const clamped = clampHUDHeightLevel(level);
  const targetY = profile.defaultCenterYM + clamped * profile.heightStepM;
  return Math.max(profile.minCenterYM, Math.min(profile.maxCenterYM, targetY));
}

function computeVirtualPlanePlacement(visualConfig: VehicleVisualConfig): {
  virtualDistanceM: number;
  planeWidthM: number;
  planeHeightM: number;
  centerXM: number;
  defaultCenterYM: number;
  minCenterYM: number;
  maxCenterYM: number;
  centerZM: number;
  heightStepM: number;
} {
  const anchors = cockpitStructuralAnchors(visualConfig);
  const [eyeX, eyeY, eyeZ] = visualConfig.driverEyePosition;
  const cowlY = anchors.windshieldLowerBoundary[1];
  const cowlZ = anchors.windshieldLowerBoundary[2];
  const hoodY = visualConfig.body.hoodTopY;
  const hoodTipZ = visualConfig.cabin.windshieldBottomZ - Math.min(1.45, Math.max(0.85, visualConfig.body.hoodLength * 0.92));
  const instrTopY = visualConfig.instrumentClusterTransform.position[1] + 0.115;
  const instrZ = visualConfig.instrumentClusterTransform.position[2];
  const winTopY = visualConfig.cabin.windshieldTopY;
  const winTopZ = visualConfig.cabin.windshieldTopZ;

  // Virtual image sits cleanly outside windshield cowl/A-pillars while staying before front bumper
  const rawDist = Math.abs(hoodTipZ - eyeZ) - 0.18;
  const virtualDistanceM = Math.max(2.05, Math.min(2.48, Number.isFinite(rawDist) ? rawDist : 2.35));
  const centerZM = eyeZ - virtualDistanceM;

  // Sightline rays from driver eye projected to Z = centerZM
  const rayAtHud = (targetY: number, targetZ: number): number => {
    const dz = Math.max(0.25, eyeZ - targetZ);
    return eyeY + ((targetY - eyeY) / dz) * virtualDistanceM;
  };

  const cowlRayY = rayAtHud(cowlY, cowlZ);
  const hoodRayY = rayAtHud(hoodY, hoodTipZ);
  const instrRayY = rayAtHud(instrTopY, instrZ);
  const winTopRayY = rayAtHud(winTopY, winTopZ);

  // Lower windshield edge must stay strictly above dashboard cowl, instrument visor, and front hood silhouette
  const safeLowerBoundY = Math.max(cowlRayY, hoodRayY, instrRayY) + 0.024;
  // Upper windshield edge must stay comfortably under roof header AND strictly below driver forward horizon
  const safeUpperBoundY = Math.min(winTopRayY - 0.055, eyeY - 0.032);

  // Width & height scaled smoothly with cabin/eye geometry; calibrated around Audi A6L (0.48m x 0.172m @ 2.38m)
  const maxCabinSpan = Math.max(0.36, Math.min(0.52, visualConfig.cabin.width * 0.30));
  const planeWidthM = Math.max(0.38, Math.min(maxCabinSpan, virtualDistanceM * 0.202));
  const rawPlaneHeightM = Math.max(0.135, Math.min(0.185, planeWidthM * 0.358));
  const availableVerticalSpan = Math.max(0.11, safeUpperBoundY - safeLowerBoundY);
  const planeHeightM = Math.min(rawPlaneHeightM, availableVerticalSpan * 0.82);

  const minCenterYM = safeLowerBoundY + planeHeightM * 0.5;
  const maxCenterYM = Math.max(minCenterYM + 0.01, safeUpperBoundY - planeHeightM * 0.5);
  const defaultCenterYM = Math.max(
    minCenterYM,
    Math.min(maxCenterYM, minCenterYM + (maxCenterYM - minCenterYM) * 0.48),
  );

  // 11 discrete levels (-5..+5) clamped inside usable windshield window
  const downStep = Math.max(0, (defaultCenterYM - minCenterYM) / 5);
  const upStep = Math.max(0, (maxCenterYM - defaultCenterYM) / 5);
  const heightStepM = Math.max(0.004, Math.min(0.013, Math.max(downStep, upStep)));

  // Keep slightly inboard from left A-pillar while aligned with driver forward sightline
  const leftPillarSafeX = -visualConfig.cabin.width * 0.5 + planeWidthM * 0.5 + 0.095;
  const centerXM = Math.max(eyeX + 0.012, leftPillarSafeX);

  return {
    virtualDistanceM,
    planeWidthM,
    planeHeightM,
    centerXM,
    defaultCenterYM,
    minCenterYM,
    maxCenterYM,
    centerZM,
    heightStepM,
  };
}

/**
 * Per-vehicle windshield HUD optical & placement profiles tuned to keep
 * lower windshield info legible above dash/instrument binnacles without
 * covering road center or side mirrors.
 */
const VEHICLE_HUD_PROFILES: Readonly<Partial<Record<VehicleId, Partial<VehicleHUDProfile>>>> = {
  'mercedes-maybach-s680-z223': {
    bottomOffsetRatio: 0.152,
    centerXOffsetPx: 0,
    scale: 1.02,
    maxPitchCompensationDeg: 2.8,
  },
  'mercedes-e300l-v214': {
    bottomOffsetRatio: 0.148,
    scale: 1.0,
  },
  'bmw-530li-g38': {
    bottomOffsetRatio: 0.146,
    scale: 1.0,
  },
  'executive-lwb-2t': {
    bottomOffsetRatio: 0.148,
    scale: 1.0,
  },
  'xiaomi-su7-max-2026': {
    bottomOffsetRatio: 0.142,
    scale: 1.04,
  },
  'tesla-model-3-rwd': {
    bottomOffsetRatio: 0.144,
    scale: 1.03,
  },
  'porsche-taycan-4s': {
    bottomOffsetRatio: 0.156,
    scale: 0.98,
  },
  'byd-qin-plus-dmi-210-2026': {
    bottomOffsetRatio: 0.145,
    scale: 1.0,
  },
  'tank-500-hi4-t': {
    bottomOffsetRatio: 0.162,
    scale: 1.02,
    maxPitchCompensationDeg: 4.2,
  },
  'road-suv-v6-8at': {
    bottomOffsetRatio: 0.158,
    scale: 1.01,
    maxPitchCompensationDeg: 4.0,
  },
  'koenigsegg-jesko-attack': {
    bottomOffsetRatio: 0.168,
    scale: 0.94,
    maxPitchCompensationDeg: 2.5,
  },
  'ferrari-458-italia': {
    bottomOffsetRatio: 0.164,
    scale: 0.96,
    maxPitchCompensationDeg: 2.5,
  },
  'volkswagen-golf-gti': {
    bottomOffsetRatio: 0.144,
    scale: 0.98,
  },
  'cvt-family-sedan': {
    bottomOffsetRatio: 0.142,
    scale: 1.0,
  },
  'family-sedan': {
    bottomOffsetRatio: 0.142,
    scale: 1.0,
  },
  'sport-coupe': {
    bottomOffsetRatio: 0.155,
    scale: 0.97,
  },
  'test-6at-sedan': {
    bottomOffsetRatio: 0.142,
    scale: 1.0,
  },
  'test-7dct-sedan': {
    bottomOffsetRatio: 0.142,
    scale: 1.0,
  },
};

const PROFILE_CACHE = new Map<string, VehicleHUDProfile>();

export function resolveVehicleHUDProfile(vehicleId: string): VehicleHUDProfile {
  const cached = PROFILE_CACHE.get(vehicleId);
  if (cached) return cached;
  const override = VEHICLE_HUD_PROFILES[vehicleId as VehicleId];
  const virtualPlane = isVehicleId(vehicleId)
    ? computeVirtualPlanePlacement(getVehicleDescriptor(vehicleId).visualConfig)
    : undefined;
  const resolved: VehicleHUDProfile = Object.freeze({
    ...DEFAULT_PROFILE_BASE,
    ...virtualPlane,
    ...override,
    vehicleId,
  });
  PROFILE_CACHE.set(vehicleId, resolved);
  return resolved;
}

/**
 * Compute gentle angular FOV compensation & smoothed chassis pitch/roll
 * offset so forward HUD stays visually calm against windshield horizon.
 */
export function computeHUDOpticalStabilization(
  profile: VehicleHUDProfile,
  cameraFovDeg: number,
  bodyPitchRad: number,
  bodyRollRad: number,
  headLookPitchRad: number,
): { opticalScale: number; pitchShiftPx: number; rollDeg: number } {
  const safeFov = Number.isFinite(cameraFovDeg) && cameraFovDeg > 20 ? cameraFovDeg : profile.baseFovDeg;
  const fovRatio = profile.baseFovDeg / safeFov;
  const opticalScale = Math.max(0.84, Math.min(1.18, profile.scale * (0.7 + 0.3 * fovRatio)));

  const pitchDeg = Math.max(
    -profile.maxPitchCompensationDeg,
    Math.min(profile.maxPitchCompensationDeg, ((bodyPitchRad * 180) / Math.PI) * 0.55 + ((headLookPitchRad * 180) / Math.PI) * 0.25),
  );
  const rollDeg = Math.max(
    -profile.maxRollCompensationDeg,
    Math.min(profile.maxRollCompensationDeg, (-(bodyRollRad * 180) / Math.PI) * 0.45),
  );
  // Subtle counter-shift (~2.4 px per degree) prevents bumpy jitter on suspension travel
  const pitchShiftPx = Math.max(-10, Math.min(10, pitchDeg * 2.4));
  return { opticalScale, pitchShiftPx, rollDeg };
}
