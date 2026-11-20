import type { ADASState } from '../ADASTypes';

export type ADASRibbonTrigger =
  | 'none'
  | 'lane-change'
  | 'overtaking'
  | 'turn'
  | 'ramp'
  | 'avoidance'
  | 'replan'
  | 'hazard';

export type ADASRibbonTone = 'normal' | 'caution' | 'hazard';

export type ADASEnvironmentTheme = 'DAY' | 'DUSK' | 'NIGHT';

export interface ADASTargetMarkerState {
  active: boolean;
  kind: 'follow' | 'overtake' | 'obstacle' | 'hazard';
  category?: 'lead' | 'adjacent' | 'static-obstacle' | 'pedestrian' | 'cyclist';
  x: number;
  y: number;
  z: number;
  yaw: number;
  width: number;
  length: number;
  height: number;
  distanceM: number;
  speedKmh?: number | null;
  closingKmh?: number | null;
  tone: ADASRibbonTone;
}

export interface WindshieldHUDLaneItem {
  index: number;
  active: boolean;
  recommended: boolean;
  direction: 'straight' | 'left' | 'right' | 'uturn';
}

export interface WindshieldHUDRenderData {
  visible: boolean;
  heightLevel: number;
  theme: ADASEnvironmentTheme;
  rainIntensity: number;
  fogIntensity: number;
  speedKmh: number;
  speedLimitKmh: number | null;
  overspeedSeverity: 'none' | 'mild' | 'severe';
  gearLabel: string;
  rangeLabel: string;
  rangeKind: 'fuel' | 'ev' | 'hybrid' | 'none';
  navActive: boolean;
  navDirection: 'straight' | 'left' | 'right' | 'uturn';
  navDistanceText: string;
  navRoadName: string;
  navShowLanes: boolean;
  navLanes: WindshieldHUDLaneItem[];
  warningSeverity: 'caution' | 'hazard' | null;
  warningTitle: string;
  warningDetail: string;
  maneuverVisible: boolean;
  maneuverPhrase: string;
  maneuverDirection: 'left' | 'right' | 'uturn' | null;
  maneuverTone: ADASRibbonTone;
}

/**
 * Compact plain-data snapshot serialized across the Renderer Worker boundary.
 */
export interface ADASWorldVisualPacket {
  visible: boolean;
  ribbonActive: boolean;
  urgent: boolean;
  trigger: ADASRibbonTrigger;
  tone: ADASRibbonTone;
  theme: ADASEnvironmentTheme;
  sampleCount: number;
  points: Float32Array;
  normals: Float32Array;
  distances: Float32Array;
  widthM: number;
  nearFadeStartM: number;
  nearFadeEndM: number;
  egoX: number;
  egoZ: number;
  egoYaw: number;
  target: ADASTargetMarkerState;
  extraTargets?: Array<{
    category?: 'lead' | 'adjacent' | 'static-obstacle' | 'pedestrian' | 'cyclist';
    x: number;
    y: number;
    z: number;
    yaw: number;
    width: number;
    length: number;
    height: number;
    distanceM?: number;
    speedKmh?: number | null;
    closingKmh?: number | null;
    tone: ADASRibbonTone;
  }>;
  pedestrianPaths?: Array<{
    tone: 'caution' | 'hazard';
    hasConflict: boolean;
    points: readonly number[];
    conflictPoint: { x: number; y: number; z: number } | null;
  }>;
  windshieldHud?: WindshieldHUDRenderData;
}

export interface ADASTargetScreenState {
  visible: boolean;
  x: number;
  y: number;
  label: string;
  tone: ADASRibbonTone;
}

/**
 * Screen-space HUD presentation state consumed by ADASHudOverlay.
 */
export interface ADASHudVisualState {
  visible: boolean;
  enabled: boolean;
  state: ADASState;
  theme: ADASEnvironmentTheme;
  /** Brief enabled-assist list (e.g. "ACC · LKA") shown beside ADAS ON/OFF. */
  subFeatures: string;
  /** V3.5 driving mode badge label */
  modeLabel?: '导航驾驶' | '自由驾驶' | '降级驾驶';
  /** V3.5 control authority badge label */
  authorityLabel?: '系统控制' | '驾驶员介入' | '等待恢复';
  /** V3.5 concise current driving intent label */
  intentLabel?: string;
  /** Short maneuver phrase shown only during significant ADAS actions. */
  maneuverPhrase: string;
  maneuverDirection: 'left' | 'right' | 'uturn' | null;
  maneuverTone: ADASRibbonTone;
  /** Restrained warning text shown only when driver attention is needed. */
  hazardText: string;
  hazardTone: 'caution' | 'hazard';
  /** Screen-projected distance tag anchored near active follow/overtake/obstacle target. */
  targetTag: ADASTargetScreenState;
}
