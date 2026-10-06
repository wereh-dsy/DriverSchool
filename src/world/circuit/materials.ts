import * as THREE from 'three';

export interface CircuitMaterials {
  readonly grass: THREE.MeshStandardMaterial;
  readonly shoulder: THREE.MeshStandardMaterial;
  readonly asphalt: THREE.MeshStandardMaterial;
  readonly marking: THREE.MeshBasicMaterial;
  readonly guardrail: THREE.MeshStandardMaterial;
  readonly guardrailPost: THREE.MeshStandardMaterial;
  readonly structure: THREE.MeshStandardMaterial;
  readonly roof: THREE.MeshStandardMaterial;
  readonly billboard: THREE.MeshStandardMaterial;
  readonly foliage: THREE.MeshStandardMaterial;
  readonly trunk: THREE.MeshStandardMaterial;
}

export const createCircuitMaterials = (): CircuitMaterials => ({
  grass: new THREE.MeshStandardMaterial({ color: 0x68804d, roughness: 1 }),
  shoulder: new THREE.MeshStandardMaterial({ color: 0x777467, roughness: 0.98 }),
  asphalt: new THREE.MeshStandardMaterial({ color: 0x292d30, roughness: 0.93 }),
  marking: new THREE.MeshBasicMaterial({
    color: 0xf4f3e9,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }),
  guardrail: new THREE.MeshStandardMaterial({ color: 0xbcc1c2, roughness: 0.42, metalness: 0.68 }),
  guardrailPost: new THREE.MeshStandardMaterial({ color: 0x656b6d, roughness: 0.62, metalness: 0.45 }),
  structure: new THREE.MeshStandardMaterial({ color: 0xd8d4c7, roughness: 0.82 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x34434a, roughness: 0.62, metalness: 0.25 }),
  billboard: new THREE.MeshStandardMaterial({ color: 0x245b91, roughness: 0.54 }),
  foliage: new THREE.MeshStandardMaterial({ color: 0x345f39, roughness: 0.96 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x59442e, roughness: 1 }),
});
