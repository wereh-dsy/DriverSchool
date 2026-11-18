import type { MeshStandardMaterial } from 'three';

/** Tag existing shared materials; the environment changes parameters in place. */
export function wetRoadMaterial<T extends MeshStandardMaterial>(material: T): T {
  material.userData.wetRoad = true;
  return material;
}
