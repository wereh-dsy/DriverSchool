import type { DrivingGround, DrivingGroundDescriptor } from './DrivingGround';
import { DrivingTestTrack } from './DrivingTestTrack';
import { CircuitGround } from './circuit';
import { Subject2Ground } from './subject2';
import { Subject3Ground } from './subject3';

export const DRIVING_GROUND_IDS = [
  'road-course',
  'subject-2-training-ground',
  'subject-3-shared-city-map',
  'simple-circuit',
] as const;
export type DrivingGroundId = (typeof DRIVING_GROUND_IDS)[number];

export const DEFAULT_DRIVING_GROUND_ID: DrivingGroundId = 'road-course';

export interface RegisteredDrivingGroundDescriptor extends DrivingGroundDescriptor {
  readonly id: DrivingGroundId;
  readonly version: number;
}

const GROUND_BY_ID: Readonly<Record<DrivingGroundId, RegisteredDrivingGroundDescriptor>> =
  Object.freeze({
    'road-course': Object.freeze({
      id: 'road-course',
      version: 2,
      label: '综合公路练习场',
      description: '长直道、连续弯道、坡道与停车区，适合综合驾驶和车辆测试。',
      create: (): DrivingGround => new DrivingTestTrack({ treeCount: 88, shadows: true }),
    }),
    'subject-2-training-ground': Object.freeze({
      id: 'subject-2-training-ground',
      version: 1,
      label: '科目二训练场',
      description: '候考、倒库、侧方、直角、S 弯、坡起与结束区的一条连续路线。',
      create: (): DrivingGround => new Subject2Ground({ shadows: true }),
    }),
    'subject-3-shared-city-map': Object.freeze({
      id: 'subject-3-shared-city-map',
      version: 1,
      label: '科目三共享城市地图',
      description: '共享城市街区路网：两条长直主路、多个十字与丁字路口、信号灯路口、学校、公交站、商业区和北侧地标。',
      create: (): DrivingGround => new Subject3Ground({ shadows: true }),
    }),
    'simple-circuit': Object.freeze({
      id: 'simple-circuit',
      version: 1,
      label: '基础闭环试车赛道',
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
  return getDrivingGroundDescriptor(id).create();
}

export function getNextDrivingGroundId(currentId: DrivingGroundId): DrivingGroundId {
  const currentIndex = DRIVING_GROUND_IDS.indexOf(currentId);
  return DRIVING_GROUND_IDS[(currentIndex + 1) % DRIVING_GROUND_IDS.length]
    ?? DEFAULT_DRIVING_GROUND_ID;
}
