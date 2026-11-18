import { Euler, Quaternion, Vector2, Vector3 } from 'three';

export interface XYZLike {
  x: number;
  y: number;
  z: number;
}

export interface XYLike {
  x: number;
  y: number;
}

export interface QuaternionComponents extends XYZLike {
  w: number;
}

export interface EulerComponents extends XYZLike {
  order?: Euler['order'];
}

export type Vector3Like = XYZLike | readonly [number, number, number];
export type Vector2Like =
  | XYLike
  | { width: number; height: number }
  | readonly [number, number];
export type QuaternionLike =
  | QuaternionComponents
  | readonly [number, number, number, number];
export type EulerLike = EulerComponents | readonly [number, number, number];

export function readVector3(target: Vector3, value: Vector3Like): Vector3 {
  if (Array.isArray(value)) {
    return target.set(value[0], value[1], value[2]);
  }

  const components = value as XYZLike;
  return target.set(components.x, components.y, components.z);
}

export function readVector2(target: Vector2, value: Vector2Like): Vector2 {
  if (Array.isArray(value)) {
    const tuple = value as readonly [number, number];
    return target.set(tuple[0], tuple[1]);
  }

  const components = value as XYLike | { width: number; height: number };
  if ('width' in components) {
    return target.set(components.width, components.height);
  }

  return target.set(components.x, components.y);
}

export function readQuaternion(
  target: Quaternion,
  value: QuaternionLike,
): Quaternion {
  if (Array.isArray(value)) {
    target.set(value[0], value[1], value[2], value[3]);
  } else {
    const components = value as QuaternionComponents;
    target.set(components.x, components.y, components.z, components.w);
  }

  if (target.lengthSq() < 1e-12) {
    return target.identity();
  }

  return target.normalize();
}

export function readEuler(target: Euler, value: EulerLike): Euler {
  if (Array.isArray(value)) {
    return target.set(value[0], value[1], value[2], 'XYZ');
  }

  const components = value as EulerComponents;
  return target.set(
    components.x,
    components.y,
    components.z,
    components.order ?? 'XYZ',
  );
}
