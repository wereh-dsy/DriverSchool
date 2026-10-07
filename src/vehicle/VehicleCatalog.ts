import {
  cloneVehiclePhysicsConfig,
  DEFAULT_VEHICLE_PHYSICS_CONFIG,
  SPORTS_COUPE_PHYSICS_CONFIG,
  createTest6ATVehiclePhysicsConfig,
  createTest7DCTVehiclePhysicsConfig,
  createCVTSedanPhysicsConfig,
  type VehiclePhysicsConfig,
} from './config';
import {
  DEFAULT_SEDAN_VISUAL_CONFIG,
  SPORTS_COUPE_VISUAL_CONFIG,
  TEST_6AT_VISUAL_CONFIG,
  TEST_7DCT_VISUAL_CONFIG,
  CVT_SEDAN_VISUAL_CONFIG,
  type VehicleVisualConfig,
} from './visual';

export const VEHICLE_IDS = ['family-sedan', 'sport-coupe', 'test-6at-sedan', 'test-7dct-sedan', 'cvt-family-sedan'] as const;
export type VehicleId = (typeof VEHICLE_IDS)[number];

export interface VehicleCapabilities {
  readonly cruiseControl: boolean;
}

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
}

export const DEFAULT_VEHICLE_ID: VehicleId = 'family-sedan';

const FAMILY_SEDAN_DESCRIPTOR: VehicleDescriptor = Object.freeze({
  id: 'family-sedan',
  version: 2,
  name: '家用轿车',
  description: '自然吸气前驱五挡轿车，动力温和，适合基础驾驶与科目二练习。',
  capabilities: Object.freeze({ cruiseControl: false }),
  physicsConfig: DEFAULT_VEHICLE_PHYSICS_CONFIG,
  visualConfig: DEFAULT_SEDAN_VISUAL_CONFIG,
});

const SPORTS_COUPE_DESCRIPTOR: VehicleDescriptor = Object.freeze({
  id: 'sport-coupe',
  version: 2,
  name: 'GT 跑车',
  description: '约 270 kW 的后驱跑车，宽扭矩输出、运动底盘，但仍保留可控的油门响应。',
  capabilities: Object.freeze({ cruiseControl: true }),
  physicsConfig: SPORTS_COUPE_PHYSICS_CONFIG,
  visualConfig: SPORTS_COUPE_VISUAL_CONFIG,
});

const TEST_6AT_DESCRIPTOR: VehicleDescriptor = Object.freeze({
  id: 'test-6at-sedan', version: 1, name: '6AT 测试轿车',
  description: '2.0 自然吸气前驱 · 液力蠕行、渐进锁止、六挡自动换挡与 kickdown；复用轿车外观。',
  capabilities: Object.freeze({ cruiseControl: false }),
  physicsConfig: createTest6ATVehiclePhysicsConfig(),
  // Central-tachometer face with information wings; see VehicleVisualConfig.
  visualConfig: TEST_6AT_VISUAL_CONFIG,
});

const TEST_7DCT_DESCRIPTOR: VehicleDescriptor = Object.freeze({
  id: 'test-7dct-sedan', version: 1, name: '7DCT 测试轿车',
  description: '涡轮前驱 · 双离合蠕行、奇偶轴预选与快速扭矩交接；齿比为测试标定。',
  capabilities: Object.freeze({ cruiseControl: false }),
  physicsConfig: createTest7DCTVehiclePhysicsConfig(),
  // Traditional twin-dial face with a monochrome centre display.
  visualConfig: TEST_7DCT_VISUAL_CONFIG,
});

const VEHICLE_BY_ID: Readonly<Record<VehicleId, VehicleDescriptor>> = Object.freeze({
  'cvt-family-sedan': Object.freeze({ id: 'cvt-family-sedan', version: 1, name: '2.0 CVT 家用轿车',
    description: '2.0L 自然吸气前驱 · 传统钢带 CVT，连续变速与液力起步，无模拟挡位。',
    capabilities: Object.freeze({ cruiseControl: false }),
    physicsConfig: createCVTSedanPhysicsConfig(), visualConfig: CVT_SEDAN_VISUAL_CONFIG }),
  'family-sedan': FAMILY_SEDAN_DESCRIPTOR,
  'sport-coupe': SPORTS_COUPE_DESCRIPTOR,
  'test-6at-sedan': TEST_6AT_DESCRIPTOR,
  'test-7dct-sedan': TEST_7DCT_DESCRIPTOR,
});

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
  return cloneVehiclePhysicsConfig(getVehicleDescriptor(id).physicsConfig);
}
