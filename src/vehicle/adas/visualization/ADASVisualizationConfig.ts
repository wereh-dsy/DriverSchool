import type { ADASRibbonTone } from './ADASVisualizationTypes';

export interface RibbonPaletteSpec {
  readonly fillHex: number;
  readonly edgeHex: number;
  readonly fillAlpha: number;
  readonly edgeAlpha: number;
  readonly bracketHex: number;
  readonly bracketAlpha: number;
}

export interface ADASThemePalette {
  readonly normal: RibbonPaletteSpec;
  readonly caution: RibbonPaletteSpec;
  readonly hazard: RibbonPaletteSpec;
}

export interface ADASVisualizationConfig {
  readonly ribbon: {
    readonly minWidthM: number;
    readonly maxWidthM: number;
    readonly widthVehicleScale: number;
    readonly edgeWidthRatio: number;
    readonly maxSamples: number;
    readonly maxLengthM: number;
    readonly minStepM: number;
    readonly surfaceLiftM: number;
    readonly nearStartOffsetFromBumperM: number;
    readonly nearFadeSpanM: number;
    readonly farFadeStartRatio: number;
    readonly fadeInSeconds: number;
    readonly fadeOutSeconds: number;
    readonly replanDisplaySeconds: number;
  };
  readonly targetMarker: {
    readonly maxRangeM: number;
    readonly minBoxPadM: number;
    readonly bracketArmM: number;
    readonly bracketThicknessM: number;
    readonly cornerTickHeightM: number;
    readonly fadeInSeconds: number;
    readonly fadeOutSeconds: number;
    readonly verticalLiftM: number;
  };
  readonly themes: {
    readonly DAY: ADASThemePalette;
    readonly DUSK: ADASThemePalette;
    readonly NIGHT: ADASThemePalette;
  };
}

/**
 * Centralized ADAS Visualization V1 visual & transition configuration.
 * All geometry, opacity, fade timing, and day/night color semantics live here.
 */
export const DEFAULT_ADAS_VISUALIZATION_CONFIG: ADASVisualizationConfig = {
  ribbon: {
    minWidthM: 0.94,
    maxWidthM: 1.22,
    widthVehicleScale: 0.58,
    edgeWidthRatio: 0.085,
    maxSamples: 64,
    maxLengthM: 88,
    minStepM: 0.45,
    surfaceLiftM: 0.044,
    nearStartOffsetFromBumperM: 0.35,
    nearFadeSpanM: 3.8,
    farFadeStartRatio: 0.40,
    fadeInSeconds: 0.30,
    fadeOutSeconds: 0.46,
    replanDisplaySeconds: 2.6,
  },
  targetMarker: {
    maxRangeM: 130,
    minBoxPadM: 0.16,
    bracketArmM: 0.44,
    bracketThicknessM: 0.036,
    cornerTickHeightM: 0.20,
    fadeInSeconds: 0.22,
    fadeOutSeconds: 0.32,
    verticalLiftM: 0.048,
  },
  themes: {
    DAY: {
      normal: {
        fillHex: 0x4599b5,
        edgeHex: 0x7bcde3,
        fillAlpha: 0.13,
        edgeAlpha: 0.34,
        bracketHex: 0x6ec3dc,
        bracketAlpha: 0.52,
      },
      caution: {
        fillHex: 0xc98c3a,
        edgeHex: 0xebae54,
        fillAlpha: 0.15,
        edgeAlpha: 0.40,
        bracketHex: 0xe6a84c,
        bracketAlpha: 0.64,
      },
      hazard: {
        fillHex: 0xc94f4f,
        edgeHex: 0xeb7878,
        fillAlpha: 0.18,
        edgeAlpha: 0.48,
        bracketHex: 0xe86b6b,
        bracketAlpha: 0.76,
      },
    },
    DUSK: {
      normal: {
        fillHex: 0x3b8ea6,
        edgeHex: 0x72bfd4,
        fillAlpha: 0.12,
        edgeAlpha: 0.30,
        bracketHex: 0x69b8cf,
        bracketAlpha: 0.46,
      },
      caution: {
        fillHex: 0xb87e34,
        edgeHex: 0xd99b4a,
        fillAlpha: 0.14,
        edgeAlpha: 0.36,
        bracketHex: 0xd49646,
        bracketAlpha: 0.56,
      },
      hazard: {
        fillHex: 0xb84949,
        edgeHex: 0xd96b6b,
        fillAlpha: 0.17,
        edgeAlpha: 0.44,
        bracketHex: 0xd96666,
        bracketAlpha: 0.68,
      },
    },
    NIGHT: {
      normal: {
        fillHex: 0x2c7877,
        edgeHex: 0x8cc2c4,
        fillAlpha: 0.10,
        edgeAlpha: 0.24,
        bracketHex: 0x7db3b5,
        bracketAlpha: 0.40,
      },
      caution: {
        fillHex: 0x996b30,
        edgeHex: 0xc29353,
        fillAlpha: 0.12,
        edgeAlpha: 0.30,
        bracketHex: 0xbf8d4b,
        bracketAlpha: 0.48,
      },
      hazard: {
        fillHex: 0x9e4040,
        edgeHex: 0xc76363,
        fillAlpha: 0.15,
        edgeAlpha: 0.38,
        bracketHex: 0xc75d5d,
        bracketAlpha: 0.58,
      },
    },
  },
};

export function resolvePaletteForTone(
  theme: 'DAY' | 'DUSK' | 'NIGHT',
  tone: ADASRibbonTone,
  config: Readonly<ADASVisualizationConfig> = DEFAULT_ADAS_VISUALIZATION_CONFIG,
): RibbonPaletteSpec {
  return config.themes[theme][tone];
}
