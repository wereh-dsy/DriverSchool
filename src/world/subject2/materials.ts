import * as THREE from 'three';
import { wetRoadMaterial } from '../environment/WetRoadMaterial';

export interface Subject2Materials {
  readonly grass: THREE.MeshStandardMaterial;
  readonly asphalt: THREE.MeshStandardMaterial;
  readonly asphaltPractice: THREE.MeshStandardMaterial;
  readonly whiteMarking: THREE.MeshStandardMaterial;
  readonly yellowMarking: THREE.MeshStandardMaterial;
  readonly curb: THREE.MeshStandardMaterial;
  readonly metal: THREE.MeshStandardMaterial;
  readonly darkMetal: THREE.MeshStandardMaterial;
  readonly foliage: THREE.MeshStandardMaterial;
  readonly trunk: THREE.MeshStandardMaterial;
  readonly wall: THREE.MeshStandardMaterial;
  readonly roof: THREE.MeshStandardMaterial;
  readonly glass: THREE.MeshStandardMaterial;
  readonly shelterRoof: THREE.MeshStandardMaterial;
  readonly signBlue: THREE.MeshStandardMaterial;
  readonly signYellow: THREE.MeshStandardMaterial;
  readonly carWhite: THREE.MeshStandardMaterial;
  readonly carBlue: THREE.MeshStandardMaterial;
  readonly tyre: THREE.MeshStandardMaterial;
}

export const createSubject2Materials = (): Subject2Materials => {
  const markingOptions = {
    roughness: 0.8,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  } as const;
  return {
    grass: new THREE.MeshStandardMaterial({ color: 0x687d4d, roughness: 1 }),
    asphalt: wetRoadMaterial(new THREE.MeshStandardMaterial({ color: 0x303437, roughness: 0.96 })),
    asphaltPractice: wetRoadMaterial(new THREE.MeshStandardMaterial({ color: 0x35393b, roughness: 0.97 })),
    whiteMarking: new THREE.MeshStandardMaterial({ color: 0xf4f1df, ...markingOptions }),
    yellowMarking: new THREE.MeshStandardMaterial({ color: 0xe9c349, ...markingOptions }),
    curb: wetRoadMaterial(new THREE.MeshStandardMaterial({ color: 0xc7c5b9, roughness: 0.9 })),
    metal: new THREE.MeshStandardMaterial({ color: 0xa9afb0, roughness: 0.55, metalness: 0.52 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x353b3e, roughness: 0.62, metalness: 0.42 }),
    foliage: new THREE.MeshStandardMaterial({ color: 0x3e673f, roughness: 0.96 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x5c4732, roughness: 1 }),
    wall: new THREE.MeshStandardMaterial({ color: 0xb8ad94, roughness: 0.91 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x4b5356, roughness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x6e94a4, roughness: 0.25, metalness: 0.1 }),
    shelterRoof: new THREE.MeshStandardMaterial({ color: 0x3f7294, roughness: 0.75 }),
    signBlue: new THREE.MeshStandardMaterial({ color: 0x2360a8, roughness: 0.5 }),
    signYellow: new THREE.MeshStandardMaterial({ color: 0xe8b83a, roughness: 0.54 }),
    carWhite: new THREE.MeshStandardMaterial({ color: 0xe4e1d7, roughness: 0.58 }),
    carBlue: new THREE.MeshStandardMaterial({ color: 0x35698e, roughness: 0.54 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x191b1c, roughness: 0.93 }),
  };
};
