import * as THREE from 'three';
import { wetRoadMaterial } from '../environment/WetRoadMaterial';

export interface Subject3Materials {
  readonly grass: THREE.MeshStandardMaterial;
  readonly asphalt: THREE.MeshStandardMaterial;
  readonly sidewalk: THREE.MeshStandardMaterial;
  readonly curb: THREE.MeshStandardMaterial;
  readonly whitePaint: THREE.MeshStandardMaterial;
  readonly yellowPaint: THREE.MeshStandardMaterial;
  readonly metal: THREE.MeshStandardMaterial;
  readonly darkMetal: THREE.MeshStandardMaterial;
  readonly lampHead: THREE.MeshStandardMaterial;
  readonly foliage: THREE.MeshStandardMaterial;
  readonly trunk: THREE.MeshStandardMaterial;
  readonly wall: THREE.MeshStandardMaterial;
  readonly buildingLight: THREE.MeshStandardMaterial;
  readonly buildingWarm: THREE.MeshStandardMaterial;
  readonly buildingCool: THREE.MeshStandardMaterial;
  readonly roof: THREE.MeshStandardMaterial;
  readonly glass: THREE.MeshStandardMaterial;
  readonly glassDark: THREE.MeshStandardMaterial;
  readonly domeShell: THREE.MeshStandardMaterial;
  readonly shelterRoof: THREE.MeshStandardMaterial;
  readonly signBlue: THREE.MeshStandardMaterial;
  readonly signYellow: THREE.MeshStandardMaterial;
  readonly signWhite: THREE.MeshStandardMaterial;
  readonly signRed: THREE.MeshStandardMaterial;
  readonly domeAccent: THREE.MeshStandardMaterial;
  readonly signalRed: THREE.MeshBasicMaterial;
  readonly signalAmber: THREE.MeshBasicMaterial;
  readonly signalGreen: THREE.MeshBasicMaterial;
  readonly signalRedOff: THREE.MeshStandardMaterial;
  readonly signalAmberOff: THREE.MeshStandardMaterial;
  readonly signalGreenOff: THREE.MeshStandardMaterial;
}

const markingOptions = {
  roughness: 0.8,
  polygonOffset: true,
  polygonOffsetFactor: -3,
  polygonOffsetUnits: -3,
} as const;

export const createSubject3Materials = (): Subject3Materials => ({
  grass: new THREE.MeshStandardMaterial({ color: 0x6b7f52, roughness: 1 }),
  asphalt: wetRoadMaterial(new THREE.MeshStandardMaterial({ color: 0x33383b, roughness: 0.96 })),
  sidewalk: wetRoadMaterial(new THREE.MeshStandardMaterial({ color: 0x9d9b93, roughness: 0.94 })),
  curb: wetRoadMaterial(new THREE.MeshStandardMaterial({ color: 0xc6c4b8, roughness: 0.9 })),
  whitePaint: new THREE.MeshStandardMaterial({ color: 0xf2efe0, ...markingOptions }),
  yellowPaint: new THREE.MeshStandardMaterial({ color: 0xe8c247, ...markingOptions }),
  metal: new THREE.MeshStandardMaterial({ color: 0xa9afb0, roughness: 0.55, metalness: 0.5 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: 0x353b3e, roughness: 0.62, metalness: 0.4 }),
  lampHead: new THREE.MeshStandardMaterial({ color: 0xd8d5c8, roughness: 0.7 }),
  foliage: new THREE.MeshStandardMaterial({ color: 0x3f6a41, roughness: 0.96 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x5b4631, roughness: 1 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xbcb29a, roughness: 0.92 }),
  buildingLight: new THREE.MeshStandardMaterial({ color: 0xc9c2b4, roughness: 0.88 }),
  buildingWarm: new THREE.MeshStandardMaterial({ color: 0xd8c1a4, roughness: 0.9 }),
  buildingCool: new THREE.MeshStandardMaterial({ color: 0xa9b3b8, roughness: 0.86 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x4c5457, roughness: 0.82 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x6f95a5, roughness: 0.26, metalness: 0.12 }),
  glassDark: new THREE.MeshStandardMaterial({ color: 0x3f5661, roughness: 0.3, metalness: 0.2 }),
  domeShell: new THREE.MeshStandardMaterial({ color: 0xd7dbe0, roughness: 0.42, metalness: 0.16 }),
  shelterRoof: new THREE.MeshStandardMaterial({ color: 0x3f7294, roughness: 0.75 }),
  signBlue: new THREE.MeshStandardMaterial({ color: 0x1f5ba6, roughness: 0.5 }),
  signYellow: new THREE.MeshStandardMaterial({ color: 0xe6b439, roughness: 0.54 }),
  signWhite: new THREE.MeshStandardMaterial({ color: 0xe9e6da, roughness: 0.6 }),
  signRed: new THREE.MeshStandardMaterial({ color: 0xb8342c, roughness: 0.58 }),
  domeAccent: new THREE.MeshStandardMaterial({ color: 0x7f97ad, roughness: 0.4, metalness: 0.35 }),
  signalRed: new THREE.MeshBasicMaterial({ color: 0xff3b30, toneMapped: false }),
  signalAmber: new THREE.MeshBasicMaterial({ color: 0xffb020, toneMapped: false }),
  signalGreen: new THREE.MeshBasicMaterial({ color: 0x2fd269, toneMapped: false }),
  signalRedOff: new THREE.MeshStandardMaterial({ color: 0x3a1717, roughness: 0.8 }),
  signalAmberOff: new THREE.MeshStandardMaterial({ color: 0x3d2f12, roughness: 0.8 }),
  signalGreenOff: new THREE.MeshStandardMaterial({ color: 0x123322, roughness: 0.8 }),
});
