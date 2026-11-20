import type { PerspectiveCamera } from 'three';
import type { StaticCollider } from '../physics/CollisionSystem';
import type { VehicleCapabilities } from '../VehicleCapabilities';
import type { VehicleRuntimeSnapshot } from '../physics';
import type { VehicleId } from '../VehicleCatalog';
import type { DrivingGround } from '../../world/DrivingGround';
import type { NavigationState } from '../../world/navigation/NavigationController';
import type {
  ADASObstacleAssessment,
  ADASPlanSnapshot,
  ADASStatusSnapshot,
  ADASTrafficRuleDecision,
  ADASVehicleState,
  TrafficActorSnapshot,
} from '../adas/ADASTypes';
import type {
  ADASEnvironmentTheme,
  ADASRibbonTone,
  ADASWorldVisualPacket,
} from '../adas/visualization/ADASVisualizationTypes';

export interface VehicleHUDProfile {
  readonly vehicleId: string;
  /** Fraction of viewport height from bottom (retained for V1.1 telemetry tests). */
  readonly bottomOffsetRatio: number;
  /** Horizontal pixel trim relative to viewport center (+ right). */
  readonly centerXOffsetPx: number;
  /** Reference driver eye-point FOV (deg) used to keep angular size consistent across FOV settings. */
  readonly baseFovDeg: number;
  /** Visual scale multiplier tuned per windshield/cockpit geometry. */
  readonly scale: number;
  /** Maximum UI pitch counter-compensation (deg) to keep HUD stable on road bumps/braking. */
  readonly maxPitchCompensationDeg: number;
  /** Maximum UI roll counter-compensation (deg). */
  readonly maxRollCompensationDeg: number;
  /** Physical 3D virtual imaging distance (m) ahead of driver eye in vehicle space. */
  readonly virtualDistanceM: number;
  /** Physical width (m) of transparent 3D HUD virtual image plane. */
  readonly planeWidthM: number;
  /** Physical height (m) of transparent 3D HUD virtual image plane. */
  readonly planeHeightM: number;
  /** Vehicle-local X coordinate of virtual image center (aligned to driver eye / windshield opening). */
  readonly centerXM: number;
  /** Default (level 0) vehicle-local Y coordinate of virtual image center. */
  readonly defaultCenterYM: number;
  /** Safe lower Y limit preventing virtual plane from entering dashboard/hood silhouette. */
  readonly minCenterYM: number;
  /** Safe upper Y limit keeping virtual plane below driver horizon and upper windshield frame. */
  readonly maxCenterYM: number;
  /** Vehicle-local Z coordinate of virtual image center (`eyeZ - virtualDistanceM`). */
  readonly centerZM: number;
  /** Vertical displacement per discrete height step (-5..+5) in meters. */
  readonly heightStepM: number;
}

export interface VehicleHUDThemePalette {
  readonly time: ADASEnvironmentTheme;
  readonly highContrastWeather: boolean;
  readonly primaryTextColor: string;
  readonly mutedTextColor: string;
  readonly accentCyanColor: string;
  readonly cautionColor: string;
  readonly hazardColor: string;
  readonly glassBgColor: string;
  readonly glassBorderColor: string;
  readonly textShadow: string;
  readonly opacityScale: number;
}

export interface VehicleHUDInfoSnapshot {
  readonly visible: boolean;
  readonly speedKmh: number;
  readonly speedLimitKmh: number | null;
  readonly overspeed: boolean;
  readonly overspeedSeverity: 'none' | 'mild' | 'severe';
  readonly gearLabel: string;
  readonly rangeKm: number | null;
  readonly rangeLabel: string;
  readonly rangeKind: 'fuel' | 'ev' | 'hybrid' | 'none';
}

export interface VehicleHUDLaneHint {
  readonly index: number;
  readonly active: boolean;
  readonly recommended: boolean;
  readonly direction: 'straight' | 'left' | 'right' | 'uturn';
}

export interface VehicleHUDNavSnapshot {
  readonly active: boolean;
  readonly symbol: string;
  readonly distanceText: string;
  readonly maneuverText: string;
  readonly roadName: string;
  readonly showLanes: boolean;
  readonly lanes: readonly VehicleHUDLaneHint[];
}

export type VehicleHUDTargetCategory =
  | 'lead'
  | 'adjacent'
  | 'static-obstacle'
  | 'pedestrian'
  | 'cyclist';

export type VehicleHUDTargetSlot = 'front' | 'LF' | 'LR' | 'RF' | 'RR' | 'static' | 'vru';

export interface VehicleHUDTargetAnnotation {
  readonly id: string;
  readonly category: VehicleHUDTargetCategory;
  readonly slot: VehicleHUDTargetSlot;
  readonly visible: boolean;
  readonly screenX: number;
  readonly screenY: number;
  readonly distanceM: number;
  readonly speedKmh: number | null;
  readonly relSpeedKmh: number | null;
  readonly ttcS: number;
  readonly shortTag: string;
  readonly subTag: string;
  readonly tone: ADASRibbonTone;
  readonly isMoving: boolean;
  readonly worldX: number;
  readonly worldY: number;
  readonly worldZ: number;
  readonly yaw: number;
  readonly width: number;
  readonly length: number;
  readonly height: number;
}

export interface VehicleHUDPedestrianTrajectory {
  readonly actorId: string;
  readonly moving: boolean;
  readonly hasConflict: boolean;
  readonly tone: 'caution' | 'hazard';
  readonly pointCount: number;
  /** Flat world XYZ points along ground-projected short prediction corridor. */
  readonly points: readonly number[];
  readonly conflictPoint: { readonly x: number; readonly y: number; readonly z: number } | null;
  readonly distanceM: number;
}

export interface VehicleHUDWarning {
  readonly id: string;
  readonly severity: 'caution' | 'hazard';
  readonly title: string;
  readonly detail: string;
}

export interface VehicleHUDManeuverBanner {
  readonly visible: boolean;
  readonly phrase: string;
  readonly direction: 'left' | 'right' | 'uturn' | null;
  readonly tone: ADASRibbonTone;
}

export interface VehicleHUDState {
  readonly visible: boolean;
  readonly profile: VehicleHUDProfile;
  readonly palette: VehicleHUDThemePalette;
  readonly opticalScale: number;
  readonly pitchShiftPx: number;
  readonly rollDeg: number;
  readonly info: VehicleHUDInfoSnapshot;
  readonly navigation: VehicleHUDNavSnapshot;
  readonly annotations: readonly VehicleHUDTargetAnnotation[];
  readonly pedestrianTrajectories: readonly VehicleHUDPedestrianTrajectory[];
  readonly maneuver: VehicleHUDManeuverBanner;
  readonly warning: VehicleHUDWarning | null;
}

export interface VehicleHUDFrameInput {
  dt: number;
  visible: boolean;
  /** Optional override controlling only the 3D virtual windshield HUD plane (separate from world AR markers). */
  windshieldVisible?: boolean;
  /** User-configured discrete HUD height level (-5..+5, 0 = vehicle default). */
  hudHeightLevel?: number;
  vehicleId: VehicleId | string;
  ignitionOn: boolean;
  snapshot: VehicleRuntimeSnapshot | null;
  sharedSpeedLimitKmh: number | null;
  navigationState: NavigationState | null;
  headLookYawRad: number;
  headLookPitchRad: number;
  bodyPitchRad: number;
  bodyRollRad: number;
  adasEnabled: boolean;
  adasStatus: Readonly<ADASStatusSnapshot>;
  adasPlan: Readonly<ADASPlanSnapshot>;
  adasObstacle: Readonly<ADASObstacleAssessment>;
  adasRules: Readonly<ADASTrafficRuleDecision>;
  adasVehicle: Readonly<ADASVehicleState>;
  samplesApproachLane: number;
  theme: ADASEnvironmentTheme;
  rainIntensity: number;
  fogIntensity: number;
  wetness: number;
  ground: DrivingGround | null;
  camera: PerspectiveCamera | null;
  viewportWidth: number;
  viewportHeight: number;
  colliders?: readonly StaticCollider[];
  actors: readonly TrafficActorSnapshot[];
  actorCount: number;
  capabilities?: Readonly<VehicleCapabilities>;
}

export type VehicleHUDWorldPacket = ADASWorldVisualPacket;
