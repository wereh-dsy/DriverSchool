import { validateVehiclePlatformConfig } from './config/validateVehiclePlatformConfig';
import { EXECUTIVE_AUDIO_PROFILE, type VehicleAudioProfile } from '../audio/VehicleAudioProfile';
import { resolveVehicleCapabilities, type VehicleCapabilities, type VehicleFeatureDeclarations } from './VehicleCapabilities';
import {
  cloneVehiclePhysicsConfig,
  DEFAULT_VEHICLE_PHYSICS_CONFIG,
  SPORTS_COUPE_PHYSICS_CONFIG,
  createTest6ATVehiclePhysicsConfig,
  createTest7DCTVehiclePhysicsConfig,
  createCVTSedanPhysicsConfig,
  createAWDTestVehiclePhysicsConfig,
  createExecutiveSedanPhysicsConfig,
  createRoadSUVPhysicsConfig,
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
  type VehicleVisualConfig,
} from './visual';
import { withSuspensionStance } from './visual/VehicleVisualConfig';

export const VEHICLE_IDS = ['family-sedan', 'sport-coupe', 'test-6at-sedan', 'test-7dct-sedan', 'cvt-family-sedan',
  'test-awd-full-time', 'test-awd-on-demand', 'executive-lwb-2t', 'road-suv-v6-8at'] as const;
export type VehicleId = (typeof VEHICLE_IDS)[number];

export type { VehicleCapabilities } from './VehicleCapabilities';

export interface VehicleDescriptor {
  /** Stable save/replay identifier. Never derive this from the display name. */
  readonly id: VehicleId;
  /** Schema/calibration revision for future replay compatibility checks. */
  readonly version: number;
  readonly name: string;
  readonly description: string;
  readonly capabilities: VehicleCapabilities;
  readonly physicsConfig: VehiclePhysicsConfig;
  readonly visualConfig: VehicleVisualConfig;
  readonly audioProfile?: VehicleAudioProfile;
}

export type VehicleDefinition = VehicleDescriptor;
type AuthoredVehicleDescriptor = Omit<VehicleDescriptor, 'capabilities'> & { readonly capabilities: VehicleFeatureDeclarations };

export const DEFAULT_VEHICLE_ID: VehicleId = 'family-sedan';

const FAMILY_SEDAN_DESCRIPTOR: AuthoredVehicleDescriptor = Object.freeze({
  id: 'family-sedan',
  version: 2,
  name: '家用轿车',
  description: '自然吸气前驱五挡轿车，动力温和，适合基础驾驶与科目二练习。',
  capabilities: Object.freeze({ cruiseControl: false }),
  physicsConfig: DEFAULT_VEHICLE_PHYSICS_CONFIG,
  visualConfig: DEFAULT_SEDAN_VISUAL_CONFIG,
});

const SPORTS_COUPE_DESCRIPTOR: AuthoredVehicleDescriptor = Object.freeze({
  id: 'sport-coupe',
  version: 2,
  name: 'GT 跑车',
  description: '3.0T L6 · 7MT · 约 269 kW 的后驱跑车，宽扭矩输出、运动底盘，但仍保留可控的油门响应。',
  capabilities: Object.freeze({ cruiseControl: true }),
  physicsConfig: SPORTS_COUPE_PHYSICS_CONFIG,
  visualConfig: SPORTS_COUPE_VISUAL_CONFIG,
});

const TEST_6AT_DESCRIPTOR: AuthoredVehicleDescriptor = Object.freeze({
  id: 'test-6at-sedan', version: 2, name: '6AT 测试轿车',
  description: '2.0 自然吸气前驱 · 流线低鼻车身、灵活转向、偏运动底盘与平顺六挡自动变速。',
  capabilities: Object.freeze({ cruiseControl: true }),
  physicsConfig: createTest6ATVehiclePhysicsConfig(),
  // Central-tachometer face with information wings; see VehicleVisualConfig.
  visualConfig: TEST_6AT_VISUAL_CONFIG,
});

const TEST_7DCT_DESCRIPTOR: AuthoredVehicleDescriptor = Object.freeze({
  id: 'test-7dct-sedan', version: 2, name: '7DCT 测试轿车',
  description: '1.4T 涡轮前驱 · 方正三厢、稳定底盘、低中转速扭矩与快速七挡双离合。',
  capabilities: Object.freeze({ cruiseControl: true }),
  physicsConfig: createTest7DCTVehiclePhysicsConfig(),
  // Traditional twin-dial face with a monochrome centre display.
  visualConfig: TEST_7DCT_VISUAL_CONFIG,
});

const AUTHORED_VEHICLE_BY_ID: Readonly<Record<VehicleId, AuthoredVehicleDescriptor>> = Object.freeze({
  'road-suv-v6-8at': Object.freeze({ id: 'road-suv-v6-8at', version: 1, name: 'Touareg-like V6 SUV',
    description: '3.0T V6 · 8AT · AWD · 中大型公路 SUV，450 Nm，稳重底盘与临时手动选挡。',
    capabilities: Object.freeze({ cruiseControl: true }),
    physicsConfig: createRoadSUVPhysicsConfig(), visualConfig: ROAD_SUV_VISUAL_CONFIG }),
  'executive-lwb-2t': Object.freeze({ id: 'executive-lwb-2t', version: 2, name: 'A6L-inspired 行政轿车',
    description: '2.0T · 7DCT · AWD · 长轴豪华行政轿车，Virtual Cockpit，ECO / NORMAL / SPORT（T / 手柄 B）。',
    capabilities: Object.freeze({ cruiseControl: true }),
    audioProfile: EXECUTIVE_AUDIO_PROFILE, physicsConfig: createExecutiveSedanPhysicsConfig(), visualConfig: EXECUTIVE_SEDAN_VISUAL_CONFIG }),
  'test-awd-full-time': Object.freeze({ id: 'test-awd-full-time', version: 1, name: '全时 AWD 测试轿车',
    description: '复用 6AT 轿车 · 前 40% / 后 60% 固定四驱，前后轴开放式差速器。',
    capabilities: Object.freeze({ cruiseControl: true }),
    physicsConfig: createAWDTestVehiclePhysicsConfig('full-time'), visualConfig: TEST_6AT_VISUAL_CONFIG }),
  'test-awd-on-demand': Object.freeze({ id: 'test-awd-on-demand', version: 1, name: '适时 AWD 测试轿车',
    description: '复用 6AT 轿车 · 巡航 90:10，加速 70:30，前轮滑转时逐渐接近 50:50。',
    capabilities: Object.freeze({ cruiseControl: true }),
    physicsConfig: createAWDTestVehiclePhysicsConfig('on-demand'), visualConfig: TEST_6AT_VISUAL_CONFIG }),
  'cvt-family-sedan': Object.freeze({ id: 'cvt-family-sedan', version: 2, name: '2.0 CVT 家用轿车',
    description: '2.0L 自然吸气前驱 · 圆润三厢、舒适悬挂、柔和踏板与钢带无级变速，无模拟挡位。',
    capabilities: Object.freeze({ cruiseControl: true }),
    physicsConfig: createCVTSedanPhysicsConfig(), visualConfig: CVT_SEDAN_VISUAL_CONFIG }),
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
export function createVehiclePhysicsConfig(id: VehicleId): VehiclePhysicsConfig {
  const descriptor = getVehicleDescriptor(id);
  return { ...cloneVehiclePhysicsConfig(descriptor.physicsConfig), capabilities: { ...descriptor.physicsConfig.capabilities } };
}
