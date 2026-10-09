import type { DrivingGround, DrivingGroundDescriptor } from './DrivingGround';
import { DrivingTestTrack } from './DrivingTestTrack';
import { CircuitGround } from './circuit';
import { MountainProvingGround } from './mountain/MountainProvingGround';
import { Subject2Ground } from './subject2';
import { Subject3Ground } from './subject3';
import { CityGround } from './city/CityGround';
import { CITY_EDITOR_STORAGE_KEY } from './city/CityMapLoader';
import cityAlpha from './city/maps/city-alpha.json';
import presetShowcase from './city/maps/preset-showcase.json';

export const DRIVING_GROUND_IDS = [
  'road-course',
  'subject-2-training-ground',
  'subject-3-shared-city-map',
  'simple-circuit',
  'mountain-proving-ground',
  'city-alpha',
  'preset-showcase',
  'city-editor-map',
] as const;
export type DrivingGroundId = (typeof DRIVING_GROUND_IDS)[number];

export const DEFAULT_DRIVING_GROUND_ID: DrivingGroundId = 'road-course';

export interface RegisteredDrivingGroundDescriptor extends DrivingGroundDescriptor {
  readonly id: DrivingGroundId;
  readonly version: number;
}

const GROUND_BY_ID: Readonly<Record<DrivingGroundId, RegisteredDrivingGroundDescriptor>> =
  Object.freeze({
    'preset-showcase': Object.freeze({ id:'preset-showcase',version:presetShowcase.version,displayName:'道路设施体验场',
      description:'独立道路、匝道、路口和立交的道路设施体验场；高架端口配有地面接入坡道。',
      create:():DrivingGround=>new CityGround(presetShowcase,{spawnId:typeof location==='undefined'?undefined:new URLSearchParams(location.search).get('preset')??undefined}) }),
    'city-alpha': Object.freeze({ id: 'city-alpha', version: cityAlpha.version, displayName: '城市道路',
      description: '基于 City 城市道路系统的综合驾驶环境，包含主干道、住宅街区、老城弯路、商业区、高架与互通连接。', create: (): DrivingGround => new CityGround(cityAlpha) }),
    'city-editor-map': Object.freeze({ id: 'city-editor-map', version: 1, displayName: '自定义城市道路',
      description: '加载城市编辑器通过 Play 保存的地图；没有可用保存时使用城市道路。', create: (): DrivingGround => {
        try { const saved = typeof localStorage === 'undefined' ? null : localStorage.getItem(CITY_EDITOR_STORAGE_KEY); if (saved) return new CityGround(JSON.parse(saved)); }
        catch (error) { console.warn('Unable to load editor map; using City Alpha.', error); }
        return new CityGround(cityAlpha);
      } }),
    'mountain-proving-ground': Object.freeze({
      id: 'mountain-proving-ground', version: 1, displayName: '山地综合试验场',
      description: '山地连续环线，包含铺装、碎石、土路、渐进爬坡、山脊起伏、自然冲沟、长下坡与低附着湿土谷地。',
      create: (): DrivingGround => new MountainProvingGround({ shadows: true }),
    }),
    'road-course': Object.freeze({
      id: 'road-course',
      version: 2,
      displayName: '综合道路测试场',
      description: '长直道、连续弯道、坡道与停车区，适合综合驾驶和车辆测试。',
      create: (): DrivingGround => new DrivingTestTrack({ treeCount: 88, shadows: true }),
    }),
    'subject-2-training-ground': Object.freeze({
      id: 'subject-2-training-ground',
      version: 1,
      displayName: '科目二训练场',
      description: '候考、倒库、侧方、直角、S 弯、坡起与结束区的一条连续路线。',
      create: (): DrivingGround => new Subject2Ground({ shadows: true }),
    }),
    'subject-3-shared-city-map': Object.freeze({
      id: 'subject-3-shared-city-map',
      version: 1,
      displayName: '科目三道路训练',
      description: '面向道路驾驶流程的训练路网，包含两条长直主路、十字与丁字路口、信号灯、学校、公交站与商业区。',
      create: (): DrivingGround => new Subject3Ground({ shadows: true }),
    }),
    'simple-circuit': Object.freeze({
      id: 'simple-circuit',
      version: 2,
      displayName: '基础环形测试场',
      description: '宽阔主直道、少量流畅弯和一个明显制动弯，适合连续跑圈试车。',
      create: (): DrivingGround => new CircuitGround({ shadows: true }),
    }),
  });

export const DRIVING_GROUND_CATALOG: readonly RegisteredDrivingGroundDescriptor[] =
  Object.freeze(DRIVING_GROUND_IDS.map((id) => GROUND_BY_ID[id]));

export function isDrivingGroundId(value: string): value is DrivingGroundId {
  return Object.prototype.hasOwnProperty.call(GROUND_BY_ID, value);
}

export function getDrivingGroundDescriptor(
  id: DrivingGroundId,
): RegisteredDrivingGroundDescriptor {
  return GROUND_BY_ID[id];
}

export function createDrivingGround(id: DrivingGroundId): DrivingGround {
  const descriptor = getDrivingGroundDescriptor(id);
  const ground = descriptor.create();
  // Keep authored route metadata and concrete methods, while the loading entry
  // owns the stable player-facing identity (including editor-map fallback).
  Object.defineProperty(ground, 'metadata', {
    value: Object.freeze({ ...ground.metadata, id: descriptor.id,
      displayName: descriptor.displayName, description: descriptor.description }),
  });
  return ground;
}

/** Existing URL shortcuts and saved IDs share the same catalog resolution. */
export function getInitialDrivingGroundId(storedId: string | null, search: string): DrivingGroundId {
  const city = new URLSearchParams(search).get('city');
  if (city === 'editor') return 'city-editor-map';
  if (city === 'preset-showcase') return 'preset-showcase';
  return storedId !== null && isDrivingGroundId(storedId) ? storedId : DEFAULT_DRIVING_GROUND_ID;
}

export function getNextDrivingGroundId(currentId: DrivingGroundId): DrivingGroundId {
  const currentIndex = DRIVING_GROUND_IDS.indexOf(currentId);
  return DRIVING_GROUND_IDS[(currentIndex + 1) % DRIVING_GROUND_IDS.length]
    ?? DEFAULT_DRIVING_GROUND_ID;
}
