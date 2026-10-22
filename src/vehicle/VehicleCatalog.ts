import { createTeslaModel3PhysicsConfig } from './config/teslaModel3PhysicsConfig';
import { createGolfGTIPhysicsConfig } from './config/golfGTIPhysicsConfig';
import { GOLF_GTI_VISUAL_CONFIG } from './visual/golfGTIVisualConfig';
import { createTaycan4SPhysicsConfig } from './config/taycan4SPhysicsConfig';
import { TAYCAN_4S_VISUAL_CONFIG } from './visual/taycan4SVisualConfig';
import { createBMW530LiPhysicsConfig } from './config/bmw530LiPhysicsConfig';
import { BMW_530LI_VISUAL_CONFIG } from './visual/BMW530LiVisualConfig';
import { createMercedesE300LPhysicsConfig } from './config/mercedesE300LPhysicsConfig';
import { MERCEDES_E300L_VISUAL_CONFIG } from './visual/MercedesE300LVisualConfig';
import { isElectricConfig, type ElectricVehiclePhysicsConfig } from './config/ElectricVehiclePhysicsConfig';
import { TESLA_MODEL_3_VISUAL_CONFIG } from './visual/teslaModel3VisualConfig';
import { validateVehiclePlatformConfig } from './config/validateVehiclePlatformConfig';
import { AUDI_A6L_AUDIO_PROFILE, BMW_530LI_AUDIO_PROFILE, MERCEDES_EXECUTIVE_AUDIO_PROFILE, type VehicleAudioProfile } from '../audio/VehicleAudioProfile';
import { resolveVehicleCapabilities, type VehicleCapabilities, type VehicleFeatureDeclarations } from './VehicleCapabilities';
import {
  cloneVehiclePhysicsConfig,
  DEFAULT_VEHICLE_PHYSICS_CONFIG,
  SPORTS_COUPE_PHYSICS_CONFIG,
  createTest6ATVehiclePhysicsConfig,
  createTest7DCTVehiclePhysicsConfig,
  createCVTSedanPhysicsConfig,
  createExecutiveSedanPhysicsConfig,
  createRoadSUVPhysicsConfig,
  createFerrari458PhysicsConfig,
  type VehiclePhysicsConfig,
} from './config';
import {
  DEFAULT_SEDAN_VISUAL_CONFIG,
  SPORTS_COUPE_VISUAL_CONFIG,
  TEST_6AT_VISUAL_CONFIG,
  TEST_7DCT_VISUAL_CONFIG,
  CVT_SEDAN_VISUAL_CONFIG,
  EXECUTIVE_SEDAN_VISUAL_CONFIG,
  ROAD_SUV_VISUAL_CONFIG,
  FERRARI_458_VISUAL_CONFIG,
  type VehicleVisualConfig,
} from './visual';
import { withSuspensionStance } from './visual/VehicleVisualConfig';

export const VEHICLE_IDS = ['family-sedan', 'sport-coupe', 'test-6at-sedan', 'test-7dct-sedan', 'cvt-family-sedan',
  'executive-lwb-2t', 'road-suv-v6-8at', 'ferrari-458-italia', 'tesla-model-3-rwd', 'bmw-530li-g38', 'porsche-taycan-4s', 'volkswagen-golf-gti',
  'mercedes-e300l-v214'] as const;
export type VehicleId = (typeof VEHICLE_IDS)[number];
export type ICEVehicleId = Exclude<VehicleId, 'tesla-model-3-rwd' | 'porsche-taycan-4s'>;
export type PlayerVehiclePhysicsConfig = VehiclePhysicsConfig | ElectricVehiclePhysicsConfig;

export type { VehicleCapabilities } from './VehicleCapabilities';

export interface VehicleDescriptor<C extends PlayerVehiclePhysicsConfig = PlayerVehiclePhysicsConfig> {
  /** Stable save/replay identifier. Never derive this from the display name. */
  readonly id: C extends VehiclePhysicsConfig ? ICEVehicleId : VehicleId;
  /** Schema/calibration revision for future replay compatibility checks. */
  readonly version: number;
  readonly displayName: string;
  readonly description: string;
  readonly capabilities: VehicleCapabilities;
  readonly physicsConfig: C;
  readonly visualConfig: VehicleVisualConfig;
  readonly audioProfile?: VehicleAudioProfile;
}

export type VehicleDefinition = VehicleDescriptor;
type AuthoredVehicleDescriptor = Omit<VehicleDescriptor, 'capabilities'> & { readonly capabilities: VehicleFeatureDeclarations };

export const DEFAULT_VEHICLE_ID: ICEVehicleId = 'family-sedan';

const FAMILY_SEDAN_DESCRIPTOR: AuthoredVehicleDescriptor = Object.freeze({
  id: 'family-sedan',
  version: 2,
  displayName: 'Haiteng S1 Driving School',
  description: '1.6 NA INLINE4 / 5MT / FWD。海腾 S1 驾校版：虚构家用轿车，动力温和、离合接合宽容、转向可预期，适合基础驾驶与驾校训练。',
  capabilities: Object.freeze({ cruiseControl: false }),
  physicsConfig: DEFAULT_VEHICLE_PHYSICS_CONFIG,
  visualConfig: DEFAULT_SEDAN_VISUAL_CONFIG,
});

const SPORTS_COUPE_DESCRIPTOR: AuthoredVehicleDescriptor = Object.freeze({
  id: 'sport-coupe',
  version: 2,
  displayName: 'GT 3.0 Turbo',
  description: '3.0T INLINE6 / 7MT / RWD，约 269 kW。低矮宽体 GT，宽扭矩输出、后轴 LSD、performance 轮胎和更硬的运动底盘，油门仍易于控制；现实原型未唯一确认。',
  capabilities: Object.freeze({ cruiseControl: true }),
  physicsConfig: SPORTS_COUPE_PHYSICS_CONFIG,
  visualConfig: SPORTS_COUPE_VISUAL_CONFIG,
});

const TEST_6AT_DESCRIPTOR: AuthoredVehicleDescriptor = Object.freeze({
  id: 'test-6at-sedan', version: 2, displayName: 'Mazda CX-4 2.0L 6AT',
  description: '2.0 NA INLINE4 / 6AT / FWD。线性自然吸气响应、平顺液力自动变速、低车身姿态、灵活转向与适度运动悬挂。以 CX-4 仪表为原型，保留游戏当前简化轿车车身和标定。',
  capabilities: Object.freeze({ cruiseControl: true }),
  physicsConfig: createTest6ATVehiclePhysicsConfig(),
  // Central-tachometer face with information wings; see VehicleVisualConfig.
  visualConfig: TEST_6AT_VISUAL_CONFIG,
});

const TEST_7DCT_DESCRIPTOR: AuthoredVehicleDescriptor = Object.freeze({
  id: 'test-7dct-sedan', version: 2, displayName: 'Volkswagen Sagitar 280TSI DSG',
  description: '1.4T INLINE4 / 7DCT / FWD，250 Nm 游戏标定。紧凑三厢轿车，低中转速涡轮响应有力、双离合换挡快、阻尼较紧致、制动响应直接；车身与参数沿用当前游戏实现。',
  capabilities: Object.freeze({ cruiseControl: true }),
  physicsConfig: createTest7DCTVehiclePhysicsConfig(),
  // Traditional twin-dial face with a monochrome centre display.
  visualConfig: TEST_7DCT_VISUAL_CONFIG,
});

const AUTHORED_VEHICLE_BY_ID: Readonly<Record<VehicleId, AuthoredVehicleDescriptor>> = Object.freeze({
  'volkswagen-golf-gti': Object.freeze({ id: 'volkswagen-golf-gti', version: 1, displayName: 'Volkswagen Golf GTI',
    description: 'Mk7.5-inspired · 2.0T INLINE4 (L4) / 7DCT / FWD，350 Nm、约 175 kW 游戏标定。紧凑型 hot hatch，运动化底盘与前轴制动式 eDiff，轻快紧致、出弯前轴负担鲜明；Eco / Normal / Sport，非 Golf R。',
    capabilities: Object.freeze({ cruiseControl: true, navigation: true, laneDisplay: true, parkingRadar: true, tpms: true }),
    physicsConfig: createGolfGTIPhysicsConfig(), visualConfig: GOLF_GTI_VISUAL_CONFIG }),
  'porsche-taycan-4s': Object.freeze({ id: 'porsche-taycan-4s', version: 2, displayName: 'Porsche Taycan 4S',
    description: '2024 facelift · Performance Battery Plus · 105/97 kWh · dual PSM AWD. 前单速/后两速，380 kW 常规峰值，Launch Control 440 kW，四驾驶模式、空气悬架与自适应阻尼。',
    capabilities: Object.freeze({ cruiseControl: true, advancedInstrument: true, navigation: true, laneDisplay: true, parkingRadar: true, parking360: true, tpms: true }),
    physicsConfig: createTaycan4SPhysicsConfig(), visualConfig: TAYCAN_4S_VISUAL_CONFIG }),
  'bmw-530li-g38': Object.freeze({ id: 'bmw-530li-g38', version: 2, displayName: 'BMW 530Li',
    description: 'G38 LCI 中国长轴版 · 2.0T INLINE4 / 8AT / RWD。3.105 m 轴距行政轿车，350 Nm 游戏标定、舒适且受控的独立悬架，支持手动选挡、EPB、Auto Hold 和定速巡航。',
    capabilities: Object.freeze({ cruiseControl: true, navigation: true, laneDisplay: true, parkingRadar: true, parking360: true, tpms: true }), audioProfile: BMW_530LI_AUDIO_PROFILE,
    physicsConfig: createBMW530LiPhysicsConfig(), visualConfig: BMW_530LI_VISUAL_CONFIG }),
  'mercedes-e300l-v214': Object.freeze({ id: 'mercedes-e300l-v214', version: 2, displayName: 'Mercedes-Benz E 300 L',
    description: '2026 V214 中国长轴版 尊贵型 · 2.0T INLINE4 / 9AT / RWD。3.094 m 轴距豪华行政轿车，190 kW / 400 Nm 游戏标定，标准立标前脸、星徽尾灯与独立 MBUX Superscreen 座舱；舒适取向自适应阻尼，支持手动选挡、EPB、Auto Hold、定速巡航与车道辅助。',
    capabilities: Object.freeze({ cruiseControl: true, navigation: true, laneDisplay: true, parkingRadar: true, parking360: true, tpms: true }),
    audioProfile: MERCEDES_EXECUTIVE_AUDIO_PROFILE,
    physicsConfig: createMercedesE300LPhysicsConfig(), visualConfig: MERCEDES_E300L_VISUAL_CONFIG }),
  'ferrari-458-italia': Object.freeze({ id: 'ferrari-458-italia', version: 1, displayName: 'Ferrari 458 Italia',
    description: '4.5 NA V8 · 7DCT · mid-engine RWD. High-revving road supercar with rear-biased weight distribution, rapid yaw response, strong rear traction and aggressive dual-clutch shifting.',
    capabilities: Object.freeze({ cruiseControl: true }),
    physicsConfig: createFerrari458PhysicsConfig(), visualConfig: FERRARI_458_VISUAL_CONFIG }),
  'road-suv-v6-8at': Object.freeze({ id: 'road-suv-v6-8at', version: 2, displayName: 'Volkswagen Touareg 3.0 TSI 4MOTION',
    description: '3.0T V6 / 8AT / AWD，450 Nm、2100 kg 游戏标定。厚重公路 SUV，低中转速扭矩强、液力变速平顺；较长悬架行程、自适应阻尼、空气悬架和适时四驱带来稳重车身控制与松散路面牵引力。',
    capabilities: Object.freeze({ cruiseControl: true, tpms: true }),
    physicsConfig: createRoadSUVPhysicsConfig(), visualConfig: ROAD_SUV_VISUAL_CONFIG }),
  'executive-lwb-2t': Object.freeze({ id: 'executive-lwb-2t', version: 3, displayName: 'Audi A6L 45 TFSI quattro',
    description: '2.0T INLINE4 / 7DCT / AWD，370 Nm、3.025 m 轴距游戏标定。长轴行政轿车，低中转速扭矩平顺、高速转向稳定、车身动作克制，自适应阻尼偏舒适；当前实现为适时四驱。',
    capabilities: Object.freeze({ cruiseControl: true, navigation: true, laneDisplay: true, parkingRadar: true, parking360: true, tpms: true }),
    audioProfile: AUDI_A6L_AUDIO_PROFILE, physicsConfig: createExecutiveSedanPhysicsConfig(), visualConfig: EXECUTIVE_SEDAN_VISUAL_CONFIG }),
  'cvt-family-sedan': Object.freeze({ id: 'cvt-family-sedan', version: 2, displayName: 'Nissan Sylphy 2.0L CVT',
    description: '2.0 NA INLINE4 / CVT / FWD。舒适家用轿车，钢带无级变速平顺且无模拟挡位，转向轻柔、悬挂偏软、制动渐进；车身与参数沿用当前游戏实现。',
    capabilities: Object.freeze({ cruiseControl: true }),
    physicsConfig: createCVTSedanPhysicsConfig(), visualConfig: CVT_SEDAN_VISUAL_CONFIG }),
  'tesla-model-3-rwd': Object.freeze({ id: 'tesla-model-3-rwd', version: 3, displayName: 'Tesla Model 3 RWD',
    description: '单后轴永磁电机 / 固定减速器 / 60 kWh 可用电池游戏标定。低重心电动轿车，松电门回收、制动融合、无怠速蠕行；电机功率与能耗为模拟参数。',
    capabilities: Object.freeze({ cruiseControl: true, advancedInstrument: true, navigation: true, laneDisplay: true, parkingRadar: true, parking360: true, tpms: true }),
    physicsConfig: createTeslaModel3PhysicsConfig(), visualConfig: TESLA_MODEL_3_VISUAL_CONFIG }),
  'family-sedan': FAMILY_SEDAN_DESCRIPTOR,
  'sport-coupe': SPORTS_COUPE_DESCRIPTOR,
  'test-6at-sedan': TEST_6AT_DESCRIPTOR,
  'test-7dct-sedan': TEST_7DCT_DESCRIPTOR,
});

const VEHICLE_BY_ID = Object.freeze(Object.fromEntries(VEHICLE_IDS.map(id => {
  const descriptor = AUTHORED_VEHICLE_BY_ID[id];
  const physicsConfig = { ...descriptor.physicsConfig,
    capabilities: { ...descriptor.physicsConfig.capabilities, ...descriptor.capabilities } };
  validateVehiclePlatformConfig(physicsConfig, descriptor.visualConfig);
  const capabilities = resolveVehicleCapabilities(physicsConfig, descriptor.visualConfig);
  const visualConfig = { ...descriptor.visualConfig,
    assetCache: capabilities.navigation && capabilities.laneDisplay,
    navigationDisplay: capabilities.navigation,
    automaticMirrorFold: capabilities.foldingMirrors ? descriptor.visualConfig.automaticMirrorFold : undefined,
    interiorAmbientLighting: capabilities.ambientLighting ? descriptor.visualConfig.interiorAmbientLighting : undefined,
    parkingCamera: capabilities.parkingCamera ? descriptor.visualConfig.parkingCamera : undefined };
  return [id, Object.freeze({ ...descriptor, physicsConfig, capabilities,
    visualConfig: withSuspensionStance(visualConfig, descriptor.physicsConfig.suspension) })];
}))) as Readonly<Record<VehicleId, VehicleDescriptor>>;

/** Ordered list used by a keyboard cycle command or a future garage UI. */
export const VEHICLE_CATALOG: readonly VehicleDescriptor[] = Object.freeze(
  VEHICLE_IDS.map((id) => VEHICLE_BY_ID[id]),
);

export function isVehicleId(value: string): value is VehicleId {
  return Object.prototype.hasOwnProperty.call(VEHICLE_BY_ID, value);
}

export function getVehicleDescriptor(id: ICEVehicleId): VehicleDescriptor<VehiclePhysicsConfig>;
export function getVehicleDescriptor(id: VehicleId): VehicleDescriptor;
export function getVehicleDescriptor(id: VehicleId): VehicleDescriptor {
  return VEHICLE_BY_ID[id];
}

export function getNextVehicleId(currentId: VehicleId): VehicleId {
  const currentIndex = VEHICLE_IDS.indexOf(currentId);
  return VEHICLE_IDS[(currentIndex + 1) % VEHICLE_IDS.length] ?? DEFAULT_VEHICLE_ID;
}

/**
 * Physics gets a detached copy for each spawned car.  Visual configs are
 * declarative and readonly, so renderers can safely share their descriptor.
 */
export function createVehiclePhysicsConfig(id: ICEVehicleId): VehiclePhysicsConfig;
export function createVehiclePhysicsConfig(id: 'tesla-model-3-rwd'): ElectricVehiclePhysicsConfig;
export function createVehiclePhysicsConfig(id: 'porsche-taycan-4s'): ElectricVehiclePhysicsConfig;
export function createVehiclePhysicsConfig(id: VehicleId): PlayerVehiclePhysicsConfig;
export function createVehiclePhysicsConfig(id: VehicleId): PlayerVehiclePhysicsConfig {
  const descriptor = getVehicleDescriptor(id);
  if (isElectricConfig(descriptor.physicsConfig)) return structuredClone(descriptor.physicsConfig);
  return { ...cloneVehiclePhysicsConfig(descriptor.physicsConfig), capabilities: { ...descriptor.physicsConfig.capabilities } };
}

/** ICE regression fixtures retain their combustion-specific type. */
export const ICE_VEHICLE_CATALOG = VEHICLE_CATALOG.filter((v): v is VehicleDescriptor<VehiclePhysicsConfig> => !isElectricConfig(v.physicsConfig));
